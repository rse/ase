/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import fs                     from "node:fs"
import path                   from "node:path"
import http                   from "node:http"
import zlib                   from "node:zlib"
import crypto                 from "node:crypto"
import { spawn }              from "node:child_process"
import { fileURLToPath }      from "node:url"

import { ofetch }             from "ofetch"
import PQueue                 from "p-queue"
import YAML                   from "yaml"
import writeFileAtomic        from "write-file-atomic"
import lockfile               from "proper-lockfile"

import type Log                         from "./ase-lib-log.js"
import { Config, sessionState }         from "./ase-config-core.js"
import {
    configSchema, parsePrices, modelPrice, tokenCost, parseRates, userRate
}                                       from "./ase-config-schema.js"
import type { TokenCounts, TokenPrice } from "./ase-config-schema.js"
import { parseScope, userStateDir }     from "./ase-config-scope.js"
import { Task, UsageUncertain }         from "./ase-task.js"
import type { TaskUsage }               from "./ase-task.js"

/*  the loopback host of the OTLP ingress and of the project services  */
const HOST = "127.0.0.1"

/*  the default port of the OTLP ingress, the default interval (in minutes) of the interim
    bookings of the open usage windows, the default idle time (in minutes) after which a
    usage window pauses, the length of a minute (in ms), the inactivity (in ms) after which
    an open usage window is closed, the grace period (in ms) for late batches before
    the final booking of a closed usage window, the period (in ms) a closed usage window
    whose task vanished is kept for its task being reported as just renamed, the interval
    (in ms) of the attempts to take over the OTLP ingress and of the booking checks, the
    delay (in ms) of the coalesced persisting of the journal after ingested usage records,
    the maximum number of remembered record keys (for de-duplicating re-sent batches),
    the maximum OTLP request size, and the timeout (in ms) of the detaching of a session by
    the session end hook (as Claude Code kills this hook after 1.5 seconds already)  */
const PORT_DFLT     = 44318
const INTERVAL_DFLT = 10
const IDLE_DFLT     = 30
const MINUTE_MS     = 60 * 1000
const PURGE_MS      = 7 * 24 * 60 * MINUTE_MS
const GRACE_MS      = 10 * 1000
const RENAME_MS     = 5 * MINUTE_MS
const BIND_MS       = 5 * 1000
const TICK_MS       = 30 * 1000
const PERSIST_MS    = 5 * 1000
const SEEN_MAX      = 10000
const BODY_MAX      = 32 * 1024 * 1024
const DETACH_MS     = 500

/*  the id of the current user, the "oneself" of the task assignments  */
export const userId = (): string =>
    process.env.USER ?? process.env.LOGNAME ?? "unknown"

/*  whether the AI usage accounting is enabled as a whole ("telemetry.enabled", opt-in), i.e., the
    OTLP ingress, the usage windows of the task assignments, and the bookings of the
    "ase agent" jobs  */
export const telemetryEnabled = (log: Log): boolean => {
    const cfg = new Config("config", configSchema, log)
    cfg.read()
    return String(cfg.get("telemetry.enabled") ?? "false") === "true"
}

/*  whether the AI usage accounting implicitly accounts the active task of a session while
    the task is unassigned ("telemetry.implicit", opt-out), i.e., without the session
    explicitly assigning it to oneself  */
export const telemetryImplicit = (log: Log): boolean => {
    const cfg = new Config("config", configSchema, log)
    cfg.read()
    return String(cfg.get("telemetry.implicit") ?? "true") === "true"
}

/*  the OTLP ingress of the user: its base URL and its bearer token, where with <create>
    a missing token is generated and persisted on the user configuration scope
    (and without <create> a missing token is reported as empty)  */
export const telemetryEndpoint = (log: Log, create: boolean): { url: string, token: string } => {
    const cfg = new Config("config", configSchema, log)
    cfg.read()
    const port = Number(cfg.get("telemetry.service.port") ?? PORT_DFLT)
    let token  = String(cfg.get("telemetry.service.token") ?? "")
    if (token === "" && create) {
        token = crypto.randomBytes(24).toString("hex")
        const user = new Config("config", configSchema, log, parseScope("user"))
        user.lock(() => {
            user.read()
            user.set("telemetry.service.token", token)
            user.write()
        })
    }
    return { url: `http://${HOST}:${port}`, token }
}

/*  ==== OTLP decoding ====  */

/*  the subset of the OTLP protobuf messages needed for the usage records (field number to
    JSON field name, wire value kind, repetition, and sub-message), decoded into the very
    shape of the OTLP/JSON encoding (with 64-bit integers as decimal strings and bytes as hex)  */
type ProtoField = [ name: string, kind: "msg" | "string" | "bytes" | "fixed64" | "double" | "int" | "bool", repeated?: boolean, sub?: string ]
const protoSchemas: Record<string, Record<number, ProtoField>> = {
    LogsRequest:   { 1: [ "resourceLogs", "msg", true, "ResourceLogs" ] },
    ResourceLogs:  { 1: [ "resource", "msg", false, "Resource" ], 2: [ "scopeLogs", "msg", true, "ScopeLogs" ] },
    ScopeLogs:     { 2: [ "logRecords", "msg", true, "LogRecord" ] },
    LogRecord:     {
        1:  [ "timeUnixNano", "fixed64" ], 11: [ "observedTimeUnixNano", "fixed64" ],
        5:  [ "body", "msg", false, "AnyValue" ], 6: [ "attributes", "msg", true, "KeyValue" ]
    },
    TracesRequest: { 1: [ "resourceSpans", "msg", true, "ResourceSpans" ] },
    ResourceSpans: { 1: [ "resource", "msg", false, "Resource" ], 2: [ "scopeSpans", "msg", true, "ScopeSpans" ] },
    ScopeSpans:    { 2: [ "spans", "msg", true, "Span" ] },
    Span:          {
        2:  [ "spanId", "bytes" ], 5: [ "name", "string" ],
        7:  [ "startTimeUnixNano", "fixed64" ], 8: [ "endTimeUnixNano", "fixed64" ],
        9:  [ "attributes", "msg", true, "KeyValue" ]
    },
    Resource:      { 1: [ "attributes", "msg", true, "KeyValue" ] },
    KeyValue:      { 1: [ "key", "string" ], 2: [ "value", "msg", false, "AnyValue" ] },
    AnyValue:      {
        1:  [ "stringValue", "string" ], 2: [ "boolValue", "bool" ], 3: [ "intValue", "int" ],
        4:  [ "doubleValue", "double" ], 5: [ "arrayValue", "msg", false, "ArrayValue" ],
        6:  [ "kvlistValue", "msg", false, "KeyValueList" ]
    },
    ArrayValue:    { 1: [ "values", "msg", true, "AnyValue" ] },
    KeyValueList:  { 1: [ "values", "msg", true, "KeyValue" ] }
}

/*  decode a protobuf message of a type of the OTLP subset above, skipping all unknown fields  */
const decodeProto = (buf: Buffer, type: string): Record<string, any> => {
    const schema = protoSchemas[type]
    const obj: Record<string, any> = {}
    let pos = 0
    const truncated = () => new Error(`truncated protobuf message "${type}"`)
    const varint = (): bigint => {
        let result = 0n
        for (let shift = 0n; ; shift += 7n) {
            if (pos >= buf.length)
                throw truncated()
            const b = buf[pos++]
            result |= BigInt(b & 0x7f) << shift
            if ((b & 0x80) === 0)
                return result
        }
    }
    while (pos < buf.length) {
        const tag  = Number(varint())
        const wire = tag & 0x07
        let raw: bigint | Buffer
        if (wire === 0)
            raw = varint()
        else if (wire === 1 || wire === 5) {
            const len = wire === 1 ? 8 : 4
            raw = buf.subarray(pos, pos + len)
            pos += len
        }
        else if (wire === 2) {
            const len = Number(varint())
            raw = buf.subarray(pos, pos + len)
            pos += len
        }
        else
            throw new Error(`unsupported protobuf wire type ${wire} in message "${type}"`)
        if (pos > buf.length)
            throw truncated()
        const field = schema[tag >>> 3]
        if (field === undefined)
            continue
        const [ name, kind, repeated, sub ] = field
        let value: unknown
        if (kind === "msg" && Buffer.isBuffer(raw))
            value = decodeProto(raw, sub!)
        else if (kind === "string" && Buffer.isBuffer(raw))
            value = raw.toString("utf8")
        else if (kind === "bytes" && Buffer.isBuffer(raw))
            value = raw.toString("hex")
        else if (kind === "fixed64" && Buffer.isBuffer(raw) && raw.length === 8)
            value = raw.readBigUInt64LE().toString()
        else if (kind === "double" && Buffer.isBuffer(raw) && raw.length === 8)
            value = raw.readDoubleLE()
        else if (kind === "int" && typeof raw === "bigint")
            value = BigInt.asIntN(64, raw).toString()
        else if (kind === "bool" && typeof raw === "bigint")
            value = raw !== 0n
        else
            continue
        if (repeated)
            (obj[name] ??= []).push(value)
        else
            obj[name] = value
    }
    return obj
}

/*  flatten the OTLP key/value attributes into a map of scalar values  */
const attributes = (list: unknown): Map<string, string | number | boolean> => {
    const map = new Map<string, string | number | boolean>()
    for (const kv of Array.isArray(list) ? list : []) {
        const val = kv?.value ?? {}
        if (typeof kv?.key !== "string")
            continue
        if (typeof val.stringValue === "string")
            map.set(kv.key, val.stringValue)
        else if (val.intValue !== undefined)
            map.set(kv.key, Number(val.intValue))
        else if (typeof val.doubleValue === "number")
            map.set(kv.key, val.doubleValue)
        else if (typeof val.boolValue === "boolean")
            map.set(kv.key, val.boolValue)
    }
    return map
}

/*  a usage record, normalized from the OTLP records of all agent tools: the session it
    belongs to, the time of the event (in ms since the epoch, for an AI request its
    completion), its key (unique within the
    session, for de-duplicating re-sent batches), the duration of the AI request (in ms),
    the token counts (with the input tokens being the uncached ones only, so the cache read,
    cache write, input, and output tokens are disjoint), the cost (in USD, or null if the
    tool reports none), and the model; a tool reporting no request durations at all
    instead marks the sending of a request ("start") and its completion ("end"), whose
    distance the tracker accounts as the duration  */
export type UsageRecord = {
    session: string, time: number, key: string, durationMs: number,
    tokens: TokenCounts, costUSD: number | null, model: string,
    mark?: "start" | "end"
}

/*  extract the usage records of an OTLP/JSON(-shaped) logs or traces request: the
    "claude_code.api_request" events of Claude Code, the "codex.sse_event" (of kind
    "response.completed") events of OpenAI Codex CLI (with the duration from the preceding
    "codex.websocket_request" or "codex.api_request" event of the conversation, as it reports
    none itself), and the GenAI inference ("chat") spans of GitHub Copilot CLI (and any other
    tool following the GenAI semantic conventions); records without a session are dropped;
    the input tokens of Claude Code exclude the cache tokens, while those of Codex (OpenAI
    style) and of the GenAI semantic conventions include them, so for the latter the cache
    tokens are subtracted  */
export const usageRecords = (signal: "logs" | "traces", req: Record<string, any>): UsageRecord[] => {
    const records: UsageRecord[] = []
    const num  = (v: unknown) => {
        const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v
        return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : 0
    }
    const inclusive = (input: number, cread: number, cwrite: number, output: number): TokenCounts =>
        ({ cread, cwrite, input: Math.max(0, input - cread - cwrite), output })
    const nano = (v: unknown) => v !== undefined && /^\d+$/.test(String(v)) ? Number(BigInt(String(v)) / 1000000n) : 0
    const resources = signal === "logs" ? req.resourceLogs : req.resourceSpans
    for (const rs of Array.isArray(resources) ? resources : []) {
        const res    = attributes(rs?.resource?.attributes)
        const scopes = signal === "logs" ? rs?.scopeLogs : rs?.scopeSpans
        for (const sc of Array.isArray(scopes) ? scopes : []) {
            const items = signal === "logs" ? sc?.logRecords : sc?.spans
            for (const item of Array.isArray(items) ? items : []) {
                const attrs = attributes(item?.attributes)
                const attr  = (...keys: string[]) => {
                    for (const key of keys) {
                        const val = attrs.get(key) ?? res.get(key)
                        if (val !== undefined)
                            return val
                    }
                    return undefined
                }
                const session = String(attr("session.id", "conversation.id", "gen_ai.conversation.id") ?? "")
                if (session === "")
                    continue
                const model = String(attr("model", "gen_ai.response.model", "gen_ai.request.model") ?? "")
                if (signal === "logs") {
                    const name  = String(attr("event.name") ?? item?.body?.stringValue ?? "")
                    const stamp = Date.parse(String(attr("event.timestamp") ?? ""))
                    const time  = Number.isFinite(stamp) ? stamp : nano(item?.timeUnixNano) || nano(item?.observedTimeUnixNano)
                    if (name === "api_request" || name === "claude_code.api_request") {
                        const cost = attr("cost_usd") ?? (attr("cost_usd_micros") !== undefined ? num(attr("cost_usd_micros")) / 1e6 : undefined)
                        records.push({
                            session, time, model,
                            key:          `claude:${attr("request_id") ?? attr("event.sequence") ?? time}`,
                            durationMs:   num(attr("duration_ms")),
                            tokens:       {
                                cread:  num(attr("cache_read_tokens")),
                                cwrite: num(attr("cache_creation_tokens")),
                                input:  num(attr("input_tokens")),
                                output: num(attr("output_tokens"))
                            },
                            costUSD:      cost !== undefined ? num(cost) : null
                        })
                    }
                    else if (name === "codex.sse_event" && attr("event.kind") === "response.completed") {
                        const duration = num(attr("duration_ms"))
                        records.push({
                            session, time, model,
                            key:          `codex-sse:${time}`,
                            durationMs:   duration,
                            tokens:       inclusive(num(attr("input_token_count")), num(attr("cached_token_count")),
                                num(attr("cache_write_token_count")), num(attr("output_token_count"))),
                            costUSD:      null,
                            ...(duration === 0 ? { mark: "end" as const } : {})
                        })
                    }
                    else if (name === "codex.websocket_request" || name === "codex.api_request")
                        records.push({
                            session, time, model,
                            key:          `codex-req:${time}:${attr("attempt") ?? 0}`,
                            durationMs:   0,
                            tokens:       { cread: 0, cwrite: 0, input: 0, output: 0 },
                            costUSD:      null,
                            mark:         "start"
                        })
                }
                else {
                    const op = String(attr("gen_ai.operation.name") ?? "")
                    if (!(op === "chat" || op === "text_completion" || op === "generate_content"
                        || (op === "" && String(item?.name ?? "").startsWith("chat"))))
                        continue
                    if (attr("gen_ai.usage.input_tokens") === undefined && attr("gen_ai.usage.output_tokens") === undefined)
                        continue
                    /*  (the "github.copilot.cost" of Copilot is its premium request multiplier
                        and its "github.copilot.nano_aiu" its AI credits, so neither is a cost in USD;
                        the cache attributes are taken in their current dotted, their older underscored
                        (of earlier Copilot CLI versions), and their Codex "cache_write" form)  */
                    const start = nano(item?.startTimeUnixNano)
                    const end   = Math.max(start, nano(item?.endTimeUnixNano))
                    records.push({
                        session, time: end, model,
                        key:          `span:${item?.spanId ?? start}`,
                        durationMs:   end - start,
                        tokens:       inclusive(
                            num(attr("gen_ai.usage.input_tokens")),
                            num(attr("gen_ai.usage.cache_read.input_tokens", "gen_ai.usage.cache_read_input_tokens")),
                            num(attr("gen_ai.usage.cache_creation.input_tokens", "gen_ai.usage.cache_creation_input_tokens",
                                "gen_ai.usage.cache_write.input_tokens")),
                            num(attr("gen_ai.usage.output_tokens"))),
                        costUSD:      null
                    })
                }
            }
        }
    }
    return records
}

/*  ==== usage windows ====  */

/*  the accumulated, not yet booked usage of a window: AI request time, human time (the
    whole real time of the window, as the engineer costs money even while waiting for the
    AI), and real (wall-clock) time (in ms), the token counts, and the AI and human costs
    (in USD, the human costs being in addition to the AI costs)  */
type Usage = TokenCounts & { aiMs: number, hrMs: number, realMs: number, costAI: number, costHR: number }

/*  an empty usage  */
const usageZero = (): Usage =>
    ({ aiMs: 0, hrMs: 0, realMs: 0, cread: 0, cwrite: 0, input: 0, output: 0, costAI: 0, costHR: 0 })

/*  a usage window of a task: the task id, the assignee being "oneself", its opening and
    closing time (null while open), the time up to which its real time is accounted, the
    time of its last activity (its opening, a session attaching, or a usage record), its
    attached sessions (each with its attachment interval, "until" being null while
    attached, and whether it is attached only implicitly, i.e., just as long as the
    unassigned task stays the active task of the session), its not yet booked usage, its
    time of the last booking, the number of records it received, and the time its task
    was first found vanished on a booking (if not found since then)  */
type UsageWindow = {
    task: string, self: string, opened: number, closed: number | null, realFrom: number, active: number,
    attach: { session: string, from: number, until: number | null, implicit?: boolean }[],
    unbooked: Usage, booked: number, records: number, missing?: number
}

/*  the persistent journal of the usage windows of a project, plus the recently counted
    record keys (de-duplicating re-sent batches)  */
type UsageJournal = { windows: UsageWindow[], seen: string[] }

/*  the outcome of an assignment: the previous and new assignee, the window action, the
    booked usage (if closed), and an optional notice  */
export type AssignResult = {
    from: string, to: string, action: "opened" | "attached" | "closed" | "none",
    booked: TaskUsage | null, notice: string
}

/*  the per-user session registry entry: the root directory and id of the project
    whose service owns the usage window the session is attached to, and the time
    the session ended (if its end could not be reported to this service)  */
type SessionEntry = { root: string, project: string, ended?: number }

/*  the per-user telemetry state, shared by the services of all projects: the session
    registry, keyed by session, and the journals of the projects, keyed by project  */
type TelemetryState = { session?: Record<string, SessionEntry>, booked?: Record<string, UsageJournal> }

/*  the usage tracker of the project service: it owns the usage windows of the tasks of
    the project, accounts the usage records of their attached sessions, books them onto
    the tasks, and acts as the OTLP ingress of the user (routing the usage records to the
    owning project services) whenever no other project service does  */
export class UsageTracker {
    private journal: UsageJournal = { windows: [], seen: [] }
    private seen     = new Set<string>()
    private queue    = new PQueue({ concurrency: 1 })
    private ingress: http.Server | null = null
    private timers: ReturnType<typeof setInterval>[] = []
    private watched  = new Set<string>()
    private unwatch: (() => void) | null = null
    private started  = new Map<string, number>()
    private saving   = Promise.resolve()
    private deferred: ReturnType<typeof setTimeout> | null = null
    private sessions = new Map<string, SessionEntry | null>()
    private registry: { mark: string, session: Record<string, SessionEntry> } | null = null
    private adopting = new PQueue({ concurrency: 1 })
    private adopted  = new Map<string, string>()
    private owners   = new Map<string, string>()
    private explicit = new Set<string>()
    private primed   = false

    constructor (
        private log:      Log,
        private root:     string,
        private project:  string,
        private aseDir:   string,
        private activity: () => void
    ) {}

    /*  ---- telemetry state ----  */

    /*  the per-user telemetry state file, shared by the services of all projects, holding
        the session registry under its "session" field and the journals of the usage windows
        under its "booked" field  */
    static stateFile (): string {
        return path.join(userStateDir(), "telemetry.json")
    }

    /*  read the telemetry state file (an empty or missing file being an empty state)  */
    private static readState (file = UsageTracker.stateFile()): TelemetryState {
        const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : ""
        return text.trim() !== "" ? JSON.parse(text) as TelemetryState : {}
    }

    /*  the session registry entry of a session (or undefined if not registered)  */
    static sessionEntry (session: string): SessionEntry | undefined {
        return UsageTracker.readState().session?.[session]
    }

    /*  register resp. unregister a session as attached to a window of this project
        (applied to the telemetry state file by the next persisting of the journal,
        where an unregistration leaves the registration of another project alone)  */
    private register (session: string): void {
        Task.validateSession(session)
        this.sessions.set(session, { root: this.root, project: this.project })
    }
    private unregister (session: string): void {
        this.sessions.set(session, null)
    }

    /*  send a request to the service of the project of a root directory
        (whose port and bearer token are persisted in its ".ase/service.yaml")  */
    static async request (root: string, endpoint: string, body: Record<string, unknown>, timeout = 30 * 1000): Promise<unknown> {
        const file  = path.join(root, ".ase", "service.yaml")
        const info  = YAML.parse(fs.readFileSync(file, "utf8")) as { port?: unknown, token?: unknown } | null
        const port  = Number(info?.port)
        const token = typeof info?.token === "string" ? info.token : null
        if (!Number.isInteger(port))
            throw new Error(`no service port in "${file}"`)
        return ofetch(`http://${HOST}:${port}${endpoint}`, {
            method:  "POST",
            headers: token !== null ? { Authorization: `Bearer ${token}` } : {},
            body,
            timeout
        })
    }

    /*  detach a session from its usage window through the owning project service (used by the
        session end hook, within its tight time limit), if the session is registered at all: for
        a service which is not reachable in time (e.g. as it crashed or got stopped), the session
        end is noted in the session registry instead, and the service is started in the
        background (without awaiting it), which then detaches the session as of its noted end,
        as otherwise the window stays open until it is closed for inactivity  */
    static async detachRemote (session: string): Promise<void> {
        const entry = UsageTracker.sessionEntry(session)
        if (entry === undefined)
            return
        await UsageTracker.request(entry.root, "/usage/detach", { session }, DETACH_MS).catch(async () => {
            const file    = UsageTracker.stateFile()
            const release = await lockfile.lock(file, {
                retries: { retries: 5, minTimeout: 20, maxTimeout: 100 }
            })
            let root: string
            try {
                const state = UsageTracker.readState(file)
                const noted = state.session?.[session]
                if (noted === undefined)
                    return
                noted.ended = Date.now()
                root = noted.root
                writeFileAtomic.sync(file, JSON.stringify(state, null, 4) + "\n")
            }
            finally {
                await release()
            }
            const cli = fileURLToPath(new URL("./ase.js", import.meta.url))
            spawn(process.execPath, [ cli, "service", "start" ], { cwd: root, detached: true, stdio: "ignore" }).unref()
        })
    }

    /*  report the rename of a task to the service of the project of a root directory (used
        by every rename through "Task.rename"), if a service of the project runs at all  */
    static async renameRemote (root: string, oldId: string, newId: string): Promise<void> {
        if (!fs.existsSync(path.join(root, ".ase", "service.yaml")))
            return
        await UsageTracker.request(root, "/usage/rename", { old: oldId, new: newId })
    }

    /*  ---- journal ----  */

    /*  the key of the journal of this project in the telemetry state file: the project id
        plus the first 12 hex digits of the SHA-1 digest of the project root directory
        (as the project id alone may collide between several checkouts of a project)  */
    private get journalKey (): string {
        return `${this.project}-${crypto.createHash("sha1").update(this.root).digest("hex").slice(0, 12)}`
    }

    /*  load the journal of this project  */
    private load (): void {
        try {
            const journal = UsageTracker.readState(UsageTracker.stateFile()).booked?.[this.journalKey]
            if (journal === undefined)
                return
            this.journal = journal
            this.seen    = new Set(this.journal.seen)
        }
        catch (err: unknown) {
            this.log.write("error", `usage: failed to load journal from "${UsageTracker.stateFile()}": ` +
                `${err instanceof Error ? err.message : String(err)}`)
        }
    }

    /*  persist the journal of this project (serialized, as each save writes the then current
        journal): under the lock of the telemetry state file, re-read it, apply the pending
        session (un)registrations, replace (or, without any windows, remove) the journal of
        this project only, and write it atomically, so the concurrent saves of the services
        of other projects are never lost  */
    private persist (): Promise<void> {
        if (this.deferred !== null) {
            clearTimeout(this.deferred)
            this.deferred = null
        }
        this.journal.seen = Array.from(this.seen).slice(-SEEN_MAX)
        this.seen         = new Set(this.journal.seen)
        const sessions    = new Map(this.sessions)
        this.saving = this.saving.then(async () => {
            const file = UsageTracker.stateFile()
            fs.mkdirSync(path.dirname(file), { recursive: true })
            fs.appendFileSync(file, "", "utf8")
            const release = await lockfile.lock(file, {
                retries: { retries: 50, minTimeout: 20, maxTimeout: 200 }
            })
            try {
                let state: TelemetryState
                try {
                    state = UsageTracker.readState(file)
                }
                catch (err: unknown) {
                    this.log.write("warning", `usage: discarding unreadable telemetry state "${file}": ` +
                        `${err instanceof Error ? err.message : String(err)}`)
                    state = {}
                }
                /*  (an unregistration removes only an entry of this project, as the session
                    may have moved over to a usage window of another project in the meantime)  */
                const registry = Object.fromEntries(Object.entries(state.session ?? {})
                    .filter(([ session, entry ]) => !sessions.has(session) || (sessions.get(session) === null && entry.root !== this.root)))
                for (const [ session, entry ] of sessions)
                    if (entry !== null)
                        registry[session] = entry
                const booked = Object.fromEntries(Object.entries(state.booked ?? {})
                    .filter(([ key ]) => key !== this.journalKey))
                if (this.journal.windows.length > 0)
                    booked[this.journalKey] = this.journal
                const next: TelemetryState = {
                    ...(Object.keys(registry).length > 0 ? { session: registry } : {}),
                    ...(Object.keys(booked).length > 0   ? { booked }            : {})
                }
                writeFileAtomic.sync(file, JSON.stringify(next, null, 4) + "\n")

                /*  drop the applied session (un)registrations (unless superseded in the meantime)  */
                for (const [ session, entry ] of sessions)
                    if (this.sessions.get(session) === entry)
                        this.sessions.delete(session)
            }
            finally {
                await release()
            }
        }).catch((err: unknown) => {
            this.log.write("error", `usage: failed to save journal into "${UsageTracker.stateFile()}": ` +
                `${err instanceof Error ? err.message : String(err)}`)
        })
        return this.saving
    }

    /*  persist the journal of this project deferred, coalescing the frequent persistings
        after the ingested usage records of all sessions (exported every few seconds each)
        into one per delay, at the price of losing the usage of at most this delay on a
        crash of the service (as any immediate persisting takes the deferred one along)  */
    private persistDeferred (): void {
        if (this.deferred !== null)
            return
        this.deferred = setTimeout(() => {
            this.deferred = null
            this.persist()
        }, PERSIST_MS)
    }

    /*  ---- lifecycle ----  */

    /*  start the tracker: load the journal, take part in the OTLP ingress election,
        and check the bookings and the foreign assignee changes periodically  */
    start (): void {
        this.load()
        this.bind()
        this.timers.push(setInterval(() => { this.bind() }, BIND_MS))
        this.timers.push(setInterval(() => { this.tick() }, TICK_MS))
        for (const timer of this.timers)
            timer.unref()
        this.tick()
    }

    /*  stop the tracker (on the stopping of the service): stop its periodic activities,
        release the OTLP ingress, and complete the persisting of the journal (including
        any still deferred one)  */
    async stop (): Promise<void> {
        for (const timer of this.timers)
            clearInterval(timer)
        this.timers = []
        if (this.ingress !== null) {
            this.ingress.close()
            this.ingress = null
        }
        if (this.deferred !== null)
            await this.persist()
        else
            await this.saving
    }

    /*  whether the tracker holds any usage window (keeping the service alive)  */
    active (): boolean {
        return this.journal.windows.length > 0
    }

    /*  ---- windows ----  */

    /*  the open window of a task  */
    private openWindow (task: string): UsageWindow | undefined {
        return this.journal.windows.find((w) => w.task === task && w.closed === null)
    }

    /*  detach a session from its open window at a time, closing the window
        (and scheduling its final booking) once no session remains attached  */
    private detachAt (session: string, now: number): void {
        for (const w of this.journal.windows) {
            const a = w.attach.find((a) => a.session === session && a.until === null)
            if (a === undefined)
                continue
            a.until = now
            if (w.closed === null && w.attach.every((a) => a.until !== null))
                this.close(w, now)
        }
        this.release(session)
    }

    /*  unregister a session once it is attached to no window any longer, as until the final
        booking of a closed window the late batches of the records of its sessions still
        have to be routed to it (during the grace period)  */
    private release (session: string): void {
        if (!this.journal.windows.some((w) => w.attach.some((a) => a.session === session)))
            this.unregister(session)
    }

    /*  book a window in the background, logging any failure  */
    private bookAsync (w: UsageWindow, final: boolean): void {
        this.book(w, final).catch((err: unknown) => {
            this.log.write("error", `usage: booking onto task "${w.task}" failed: ` +
                `${err instanceof Error ? err.message : String(err)}`)
        })
    }

    /*  close a window at a time and (unless booked by the caller itself)
        schedule its final booking after the grace period  */
    private close (w: UsageWindow, now: number, schedule = true): void {
        w.closed = now
        for (const a of w.attach)
            if (a.until === null)
                a.until = now
        if (schedule)
            setTimeout(() => { this.bookAsync(w, true) }, GRACE_MS).unref()
    }

    /*  assign a task (on behalf of a session): to oneself ("me" or the user id) opens or
        attaches to its usage window, to anybody else (or nobody with "none") closes it and
        books its usage after the grace period (with the AI usage accounting disabled, only
        the task is assigned, as its open windows are closed by the periodic check anyway)  */
    async assign (id: string, assignee: string, session: string): Promise<AssignResult> {
        Task.validateSession(session)
        const self = userId()
        if (assignee.trim() === "")
            throw new Error("usage: empty assignee (use \"none\" to unassign)")
        const to   = assignee.trim() === "me" ? self : assignee.trim()

        /*  (keep the session out of the adoptions meanwhile, and let an assignment to oneself
            settle the adoption of its active task, as the explicit assignment takes precedence)  */
        this.explicit.add(session)
        try {
            return await this.assignSession(id, to, self, session)
        }
        finally {
            this.explicit.delete(session)
        }
    }

    /*  perform the assignment of "assign" (with the session kept out of the adoptions)  */
    private async assignSession (id: string, to: string, self: string, session: string): Promise<AssignResult> {
        const warning = await Task.checkAssignee(this.log, to)
        const from    = await Task.assign(this.log, id, to === "none" ? null : to)
        const now     = Date.now()
        if (to === self) {
            try {
                this.adopted.set(session, Task.getId(this.log, session))
            }
            catch {
                /*  best-effort: an unreadable session state just leaves the adoption alone  */
            }
        }
        let action: AssignResult["action"] = "none"
        let booked: TaskUsage | null = null
        let notice = ""
        if (!telemetryEnabled(this.log))
            notice = "AI usage accounting is disabled (\"telemetry.enabled\" is \"false\"), so no usage is accounted"
        else if (to === self) {
            let w = this.openWindow(id)
            if (w === undefined || !w.attach.some((a) => a.session === session && a.until === null)) {
                this.detachAt(session, now)
                action = w === undefined ? "opened" : "attached"
                if (w === undefined) {
                    w = {
                        task: id, self, opened: now, closed: null, realFrom: now, active: now, attach: [],
                        unbooked: usageZero(), booked: now, records: 0
                    }
                    this.journal.windows.push(w)
                }
                w.attach.push({ session, from: now, until: null })
                this.register(session)
            }
            else {
                /*  (an implicit attachment becomes an explicit one)  */
                for (const a of w.attach)
                    if (a.session === session && a.until === null)
                        delete a.implicit
            }
            if (w !== undefined)
                this.touch(w, now, now, this.idleMs())
            if (telemetryEndpoint(this.log, false).token === "")
                notice = "telemetry is not activated (run \"ase setup telemetry activate\"), so no usage is accounted"
        }
        else {
            const w = this.openWindow(id)
            if (w !== undefined) {
                this.close(w, now, false)
                await this.persist()
                await new Promise((resolve) => setTimeout(resolve, GRACE_MS))
                booked = await this.book(w, true)
                action = "closed"
                if (w.records === 0)
                    notice = "the usage window received no telemetry records (is telemetry activated for the agent tool?)"
            }
        }
        await this.persist()
        this.watch()
        notice = [ warning, notice ].filter((n) => n !== "").join("; ")
        return { from, to: to === "none" ? "" : to, action, booked, notice }
    }

    /*  detach a session (on its end)  */
    detach (session: string): void {
        this.detachAt(session, Date.now())
        this.persist()
        this.watch()
    }

    /*  note the switch of a session to another active task, so its adoption
        happens right away instead of on the next periodic check only, as
        otherwise the usage records of its very first AI requests on this task
        would be dropped  */
    activate (session: string): void {
        Task.validateSession(session)
        this.adoptSoon()
    }

    /*  follow the rename of a task with its usage windows, so their usage is
        booked onto the task under its new id  */
    rename (oldId: string, newId: string): void {
        Task.validateId(oldId)
        Task.validateId(newId)
        let changed = false
        for (const w of this.journal.windows) {
            if (w.task !== oldId)
                continue
            w.task = newId
            delete w.missing
            changed = true
        }
        if (!changed)
            return
        this.log.write("info", `usage: task "${oldId}" renamed to "${newId}" -- following with its usage windows`)
        this.persist()
        this.watch()
    }

    /*  account usage records into the windows their sessions were attached to at their time
        (in time order, so a request completion follows the marked sending of its request)  */
    ingest (records: UsageRecord[]): void {
        let prices: Map<string, TokenPrice> | null = null
        let idle: number | null = null
        let changed = false
        const valid = records.filter((r) =>
            typeof r?.session === "string" && Number.isFinite(r.time) && typeof r.key === "string"
            && Number.isFinite(r.durationMs) && (r.costUSD === null || Number.isFinite(r.costUSD))
            && typeof r.tokens === "object" && r.tokens !== null
            && Number.isFinite(r.tokens.cread + r.tokens.cwrite + r.tokens.input + r.tokens.output))
        for (const r of valid.sort((a, b) => a.time - b.time)) {
            if (r.mark === "start") {
                this.started.set(r.session, Math.max(this.started.get(r.session) ?? 0, r.time))
                continue
            }
            let duration = r.durationMs
            if (r.mark === "end") {
                const start = this.started.get(r.session)
                duration = start !== undefined && start <= r.time ? r.time - start : 0
                this.started.delete(r.session)
            }
            const key = `${r.session}:${r.key}`
            if (this.seen.has(key))
                continue
            const w = this.journal.windows.find((w) => w.attach.some((a) =>
                a.session === r.session && r.time >= a.from && (a.until === null || r.time <= a.until)))
            if (w === undefined)
                continue
            let cost = r.costUSD
            if (cost === null) {
                if (prices === null) {
                    const cfg = new Config("config", configSchema, this.log)
                    cfg.read()
                    prices = parsePrices(String(cfg.get("telemetry.prices.ai") ?? ""))
                }
                cost = tokenCost(modelPrice(prices, r.model), r.tokens)
            }
            this.seen.add(key)
            idle ??= this.idleMs()
            this.touch(w, r.time - duration, r.time, idle)
            w.records++
            w.unbooked.aiMs   += duration
            w.unbooked.cread  += r.tokens.cread
            w.unbooked.cwrite += r.tokens.cwrite
            w.unbooked.input  += r.tokens.input
            w.unbooked.output += r.tokens.output
            w.unbooked.costAI += cost
            changed = true
        }
        if (changed)
            this.persistDeferred()
    }

    /*  the idle time (in ms) after the last activity of a usage window, after which the
        window pauses accounting its real time (zero disabling the pausing)  */
    private idleMs (): number {
        const cfg = new Config("config", configSchema, this.log)
        cfg.read()
        return Number(cfg.get("telemetry.service.idle") ?? IDLE_DFLT) * MINUTE_MS
    }

    /*  account the real time of a window from where it is accounted up to a time, in full
        also as the human time (costed at the hourly rate of the assignee in
        "telemetry.prices.hr"), independent of the AI request time, which can even
        exceed it with parallel sessions  */
    private accrue (w: UsageWindow, until: number): void {
        if (until <= w.realFrom)
            return
        const cfg = new Config("config", configSchema, this.log)
        cfg.read()
        const rate = userRate(parseRates(String(cfg.get("telemetry.prices.hr") ?? "")), w.self)
        const real = until - w.realFrom
        w.unbooked.realMs += real
        w.unbooked.hrMs   += real
        w.unbooked.costHR += real / (60 * MINUTE_MS) * rate
        w.realFrom = until
    }

    /*  note an activity of a window from a time to a time: an activity beyond the idle time
        after the last one resumes the paused window, i.e., first its real time is accounted up
        to its pause, and then it is accounted again from the activity on only (skipping the
        paused gap), while an activity within the idle time just keeps the window running  */
    private touch (w: UsageWindow, from: number, to: number, idle: number): void {
        if (idle > 0 && from > w.active + idle) {
            this.accrue(w, w.active + idle)
            w.realFrom = Math.max(w.realFrom, from)
        }
        w.active = Math.max(w.active, to)
    }

    /*  book the unbooked usage of a window onto its task (serialized): its real time is
        accounted up to its closing (or the current) time, but at most up to the idle time
        after its last activity (as it is paused afterwards); an interim booking books the
        whole units only (carrying the remainder over), the final one books the rounded units
        and drops the window; a failed booking is retried on the next tick, unless it might
        have been done nevertheless (then it is taken as done, so it is never booked twice)  */
    private book (w: UsageWindow, final: boolean): Promise<TaskUsage | null> {
        return this.queue.add(async () => {
            if (!this.journal.windows.includes(w))
                return null
            const idle = this.idleMs()
            const end  = w.closed ?? Date.now()
            this.accrue(w, idle > 0 ? Math.min(end, w.active + idle) : end)
            const u     = w.unbooked
            const units = (value: number) => (final ? Math.round(value) : Math.floor(value + 1e-9))
            const delta = {
                "time.ai":      units(u.aiMs   / MINUTE_MS),
                "time.hr":      units(u.hrMs   / MINUTE_MS),
                "time.real":    units(u.realMs / MINUTE_MS),
                "token.cread":  u.cread,
                "token.cwrite": u.cwrite,
                "token.input":  u.input,
                "token.output": u.output,
                "cost.ai":      units(u.costAI * 1e4) / 1e4,
                "cost.hr":      units(u.costHR * 1e4) / 1e4
            } satisfies TaskUsage
            if (Object.values(delta).some((amount) => amount > 0)) {
                try {
                    if (!await Task.addUsage(this.log, w.task, delta)) {
                        /*  the task of an open window may still be created (as a session can
                            switch to a new task before its first save), so an interim booking
                            just keeps its usage until the next interval  */
                        const now = Date.now()
                        if (!final) {
                            w.booked = now
                            await this.persist()
                            return null
                        }

                        /*  a vanished task may just have been renamed, with the rename being
                            reported a moment later (see "rename"), so the window keeps its
                            usage and is retried for a while, before it is dropped  */
                        if (w.missing === undefined || now - w.missing < RENAME_MS) {
                            if (w.missing === undefined)
                                this.log.write("warning", `usage: task "${w.task}" not found -- keeping its usage window (retrying later)`)
                            w.missing ??= now
                            await this.persist()
                            return null
                        }
                        this.log.write("warning", `usage: task "${w.task}" vanished -- dropping its usage window ` +
                            `with its unbooked usage: ${JSON.stringify(delta)}`)
                        if (w.closed === null)
                            this.close(w, now, false)
                        this.journal.windows = this.journal.windows.filter((x) => x !== w)
                        for (const a of w.attach)
                            this.release(a.session)
                        await this.persist()
                        return null
                    }
                    this.log.write("info", `usage: booked onto task "${w.task}": ${JSON.stringify(delta)}`)
                }
                catch (err: unknown) {
                    const reason = err instanceof Error ? err.message : String(err)
                    if (!(err instanceof UsageUncertain)) {
                        this.log.write("warning", `usage: booking onto task "${w.task}" failed (retrying later): ${reason}`)
                        await this.persist()
                        return null
                    }

                    /*  a booking which might have been done nevertheless is taken as done, as
                        a retried one would then be booked twice (reporting its usage instead,
                        as it might be lost)  */
                    this.log.write("warning", `usage: booking onto task "${w.task}" failed, but might have been done ` +
                        `(not retrying, so it is never booked twice): ${reason} -- possibly unbooked usage: ${JSON.stringify(delta)}`)
                }
                delete w.missing
            }
            u.aiMs   -= delta["time.ai"]   * MINUTE_MS
            u.hrMs   -= delta["time.hr"]   * MINUTE_MS
            u.realMs -= delta["time.real"] * MINUTE_MS
            u.cread  -= delta["token.cread"]
            u.cwrite -= delta["token.cwrite"]
            u.input  -= delta["token.input"]
            u.output -= delta["token.output"]
            u.costAI -= delta["cost.ai"]
            u.costHR -= delta["cost.hr"]
            w.booked  = Date.now()
            if (final) {
                this.journal.windows = this.journal.windows.filter((x) => x !== w)
                for (const a of w.attach)
                    this.release(a.session)
            }
            await this.persist()
            return delta
        })
    }

    /*  periodically detach the sessions whose end got noted in the session registry (as it
        could not be reported to this service), and book: the closed windows (whose final
        booking failed or was interrupted) after the grace period, the open windows every
        interim booking interval, and close the open windows without any activity for a long
        time (e.g. of crashed agent tools, whose session end never got reported) or all open
        windows once the AI usage accounting got disabled, so their final booking happens and
        they vanish, and adopt the sessions which switched to (or started with) an active task
        assigned to oneself  */
    private tick (): void {
        let registry: Record<string, SessionEntry> = {}
        try {
            registry = UsageTracker.readState().session ?? {}
        }
        catch (err: unknown) {
            this.log.write("warning", `usage: failed to read session registry: ${err instanceof Error ? err.message : String(err)}`)
        }
        for (const [ session, entry ] of Object.entries(registry)) {
            /*  (the not yet persisted (un)registrations of this project take precedence)  */
            if (entry.root !== this.root || entry.ended === undefined || this.sessions.has(session)
                || !this.journal.windows.some((w) => w.attach.some((a) => a.session === session && a.until === null)))
                continue
            this.log.write("info", `usage: session "${session}" ended at ` +
                `${new Date(entry.ended).toISOString()} -- detaching it from its usage window`)
            this.detachAt(session, entry.ended)
            this.persist()
        }
        const cfg = new Config("config", configSchema, this.log)
        cfg.read()
        const interval = Number(cfg.get("telemetry.service.interval") ?? INTERVAL_DFLT) * MINUTE_MS
        const enabled  = telemetryEnabled(this.log)
        const now      = Date.now()
        for (const w of this.journal.windows) {
            if (w.closed !== null && now - w.closed >= GRACE_MS * 2)
                this.bookAsync(w, true)
            else if (w.closed === null && !enabled) {
                this.log.write("info", `usage: telemetry disabled -- closing the usage window of task "${w.task}"`)
                this.close(w, now)
                this.persist()
            }
            else if (w.closed === null && now - w.active >= PURGE_MS) {
                this.log.write("info", `usage: task "${w.task}" without any activity since ` +
                    `${new Date(w.active).toISOString()} -- closing its usage window`)
                this.close(w, now)
                this.persist()
            }
            else if (w.closed === null && interval > 0 && now - w.booked >= interval)
                this.bookAsync(w, false)
        }
        this.watch()
        this.adoptSoon()
    }

    /*  ---- foreign assignee changes ----  */

    /*  observe the task store while any open window has its task active in one of its attached
        sessions, closing the window once the assignee of its task changes to anybody else, and
        while the AI usage accounting is enabled, adopting the sessions of the tasks whose
        assignee changes to oneself  */
    private watch (): void {
        this.watched.clear()
        for (const w of this.journal.windows) {
            if (w.closed !== null)
                continue
            const active = w.attach.some((a) => {
                if (a.until !== null)
                    return false
                try {
                    return Task.getId(this.log, a.session) === w.task
                }
                catch {
                    return false
                }
            })
            if (active)
                this.watched.add(w.task)
        }
        const needed = this.watched.size > 0 || telemetryEnabled(this.log)
        if (needed && this.unwatch === null)
            this.unwatch = Task.subscribe(this.log, () => {
                this.check().catch((err: unknown) => {
                    this.log.write("warning", "usage: failed to check the assignees of the watched tasks: " +
                        `${err instanceof Error ? err.message : String(err)}`)
                })
                this.owners.clear()
                this.adoptSoon()
            })
        else if (!needed && this.unwatch !== null) {
            this.unwatch()
            this.unwatch = null
        }
    }

    /*  close resp. implicitly account the open windows of the watched tasks whose assignee changed elsewhere  */
    private async check (): Promise<void> {
        for (const task of Array.from(this.watched)) {
            const w = this.openWindow(task)
            if (w === undefined)
                continue
            /*  (a vanished task may just have been renamed, so it is left to the bookings)  */
            const parts = await Task.parts(this.log, task)
            if (parts === null)
                continue
            const assignee = (parts.keys.get("Assignee") ?? "").trim()
            if (assignee === w.self || w.closed !== null)
                continue
            if (assignee === "" && this.implicit(task)) {
                /*  an unassigned task stays accounted implicitly, i.e., its attached sessions
                    stay attached only as long as it remains their active task (see "adopt")  */
                const explicit = w.attach.filter((a) => a.until === null && a.implicit !== true)
                if (explicit.length === 0)
                    continue
                this.log.write("info", `usage: task "${task}" unassigned elsewhere -- ` +
                    "accounting its usage window implicitly from now on")
                for (const a of explicit)
                    a.implicit = true
                await this.persist()
                this.adoptSoon()
            }
            else {
                this.log.write("info", `usage: task "${task}" re-assigned to "${assignee}" elsewhere -- closing its usage window`)
                this.close(w, Date.now())
                await this.persist()
            }
        }
        this.watch()
    }

    /*  ---- self-assignments elsewhere and unassigned active tasks ----  */

    /*  whether a task is accounted implicitly while it is unassigned, i.e., unless disabled
        ("telemetry.implicit") or the task is the "default" one (the placeholder task of
        every session without an explicitly chosen task)  */
    private implicit (task: string): boolean {
        return task !== "default" && telemetryImplicit(this.log)
    }

    /*  adopt the sessions of the self-assigned or unassigned active tasks in the background
        (coalescing the bursts of task store changes and task switches into at most one
        pending adoption), logging any failure  */
    private adoptSoon (): void {
        if (this.adopting.size > 0)
            return
        this.adopting.add(() => this.adopt()).catch((err: unknown) => {
            this.log.write("warning", "usage: failed to adopt the sessions of the active tasks: " +
                `${err instanceof Error ? err.message : String(err)}`)
        })
    }

    /*  attach every interactive session of this project whose active task is either assigned
        to oneself elsewhere (e.g. through a task board, an editor, or Git, i.e., outside of any
        session) or unassigned (implicitly, see "implicit") to the usage window of that task,
        opening it if necessary: a session is adopted only once per self-assignment resp.
        activation of its active task (so it is not taken away again from a window it got
        explicitly assigned to afterwards, and a window closed for inactivity is not re-opened),
        a window opened this way starts paused, i.e., accounts its real time only from the
        first AI request of its sessions on (as a session directory might just be left behind
        by a crashed agent tool), and an implicit attachment ends as soon as its task is no
        longer the active task of its session or no longer accounted implicitly; the headless
        sessions of the agents are never adopted, as the agents book their usage themselves  */
    private async adopt (): Promise<void> {
        if (!telemetryEnabled(this.log))
            return

        /*  determine the interactive sessions of this project (as recorded by the session start
            hook) and their active tasks, reading their state without locking (see "ase mcp")  */
        let names: string[] = []
        try {
            names = fs.readdirSync(path.join(userStateDir(), "session"))
        }
        catch {
            /*  no session directory at all  */
        }
        const active = new Map<string, string>()
        for (const session of names) {
            try {
                Task.validateSession(session)
                const state = sessionState(this.log, session)
                state.read()
                const basedir  = state.getExplicit("basedir")
                const task     = state.getExplicit("task")
                const headless = state.getExplicit("headless")
                if (typeof basedir === "string" && typeof task === "string" && headless !== "true"
                    && path.resolve(basedir) === path.resolve(this.root))
                    active.set(session, task)
            }
            catch {
                /*  best-effort: skip foreign or unreadable session directories  */
            }
        }
        for (const session of Array.from(this.adopted.keys()))
            if (!active.has(session))
                this.adopted.delete(session)

        /*  determine the assignees of their active tasks (cached until the next task store
            change), where a not (yet) existing task is taken as unassigned, as a session
            usually switches to a new task before its first save  */
        for (const task of new Set(active.values())) {
            if (this.owners.has(task))
                continue
            const parts = await Task.parts(this.log, task)
            this.owners.set(task, (parts?.keys.get("Assignee") ?? "").trim())
        }

        /*  determine how the active task of a session is accounted: explicitly as
            assigned to oneself, implicitly as unassigned, or not at all  */
        const self = userId()
        const mode = (task: string): "explicit" | "implicit" | "none" => {
            const owner = this.owners.get(task) ?? ""
            return owner === self ? "explicit" : owner === "" && this.implicit(task) ? "implicit" : "none"
        }

        /*  end the implicit attachments whose task is no longer the active task of their
            session or no longer accounted implicitly, resp. turn them into explicit ones once
            their task got assigned to oneself elsewhere  */
        const now = Date.now()
        let changed = false
        for (const w of this.journal.windows) {
            if (w.closed !== null)
                continue
            for (const a of w.attach) {
                if (a.until !== null || a.implicit !== true || this.explicit.has(a.session))
                    continue
                const task = active.get(a.session)
                if (task === undefined)
                    continue
                if (task === w.task && mode(task) === "explicit")
                    delete a.implicit
                else if (task !== w.task || mode(task) !== "implicit") {
                    this.log.write("info", `usage: task "${w.task}" no longer implicitly accounted for its session ` +
                        `"${a.session}" -- detaching the session from its usage window`)
                    this.detachAt(a.session, now)
                }
                else
                    continue
                changed = true
            }
        }

        /*  attach the sessions of the self-assigned or unassigned active tasks, where on the
            first adoption (after the start of the service) the sessions already attached to any
            window are taken as adopted, as their adoption state did not survive the restart  */
        for (const [ session, task ] of active) {
            const how = mode(task)
            if (how === "none") {
                this.adopted.delete(session)
                continue
            }
            if (this.explicit.has(session) || this.adopted.get(session) === task)
                continue
            this.adopted.set(session, task)
            const attached = (w: UsageWindow) => w.closed === null && w.attach.some((a) => a.session === session && a.until === null)
            let w = this.openWindow(task)
            if ((w !== undefined && attached(w)) || (!this.primed && this.journal.windows.some(attached)))
                continue
            this.detachAt(session, now)
            if (w === undefined) {
                const idle = this.idleMs()
                w = {
                    task, self, opened: now, closed: null, realFrom: now, active: idle > 0 ? now - idle : now, attach: [],
                    unbooked: usageZero(), booked: now, records: 0
                }
                this.journal.windows.push(w)
            }
            w.attach.push({ session, from: now, until: null, ...(how === "implicit" ? { implicit: true } : {}) })
            this.register(session)
            if (how === "implicit")
                this.log.write("info", `usage: task "${task}" unassigned -- implicitly ` +
                    `attaching its active session "${session}" to its usage window`)
            else
                this.log.write("info", `usage: task "${task}" assigned to "${self}" elsewhere -- ` +
                    `attaching its active session "${session}" to its usage window`)
            changed = true
        }
        this.primed = true
        if (changed) {
            await this.persist()
            this.watch()
        }
    }

    /*  ---- OTLP ingress ----  */

    /*  take part in the election of the OTLP ingress of the user: unless already holding it,
        try to bind its port (only if telemetry is activated, i.e., a token exists)  */
    private bind (): void {
        if (!telemetryEnabled(this.log)) {
            if (this.ingress !== null) {
                this.log.write("info", "usage: telemetry disabled -- releasing the OTLP ingress")
                this.ingress.close()
                this.ingress = null
            }
            return
        }
        if (this.ingress !== null)
            return
        const { url, token } = telemetryEndpoint(this.log, false)
        if (token === "")
            return
        const port   = Number(new URL(url).port)
        const server = http.createServer((req, res) => { this.receive(req, res, port, token) })
        this.ingress = server
        server.once("error", () => {
            /*  port held by another project service (or foreign process): retry later  */
            this.ingress = null
            server.close()
        })
        server.listen(port, HOST, () => {
            this.log.write("info", `usage: acting as OTLP ingress on ${url}`)
        })
    }

    /*  receive an OTLP/HTTP export request on the ingress  */
    private receive (req: http.IncomingMessage, res: http.ServerResponse, port: number, token: string): void {
        const reply = (code: number, json = true) => {
            res.writeHead(code, { "Content-Type": json ? "application/json" : "application/x-protobuf" })
            res.end(json ? "{}" : undefined)
        }
        const signal = req.url === "/v1/logs" ? "logs" : req.url === "/v1/traces" ? "traces" : req.url === "/v1/metrics" ? "metrics" : ""
        const host   = (req.headers.host ?? "").toLowerCase()
        const auth   = Buffer.from(req.headers.authorization ?? "")
        const wanted = Buffer.from(`Bearer ${token}`)
        if (req.method !== "POST" || signal === "")
            return reply(404)
        if (host !== `${HOST}:${port}` && host !== `localhost:${port}`)
            return reply(421)
        if (auth.length !== wanted.length || !crypto.timingSafeEqual(auth, wanted))
            return reply(401)
        this.activity()
        const chunks: Buffer[] = []
        let size = 0
        req.on("data", (chunk: Buffer) => {
            size += chunk.length
            if (size > BODY_MAX)
                req.destroy()
            else
                chunks.push(chunk)
        })
        req.on("end", () => {
            const json = (req.headers["content-type"] ?? "").includes("json")
            try {
                let body = Buffer.concat(chunks)
                if (req.headers["content-encoding"] === "gzip")
                    body = zlib.gunzipSync(body, { maxOutputLength: BODY_MAX })
                if (process.env.ASE_OTEL_CAPTURE === "1") {
                    const dir = path.join(this.aseDir, "otel-capture")
                    fs.mkdirSync(dir, { recursive: true })
                    fs.writeFileSync(path.join(dir, `${Date.now()}-${signal}.${json ? "json" : "pb"}`), body)
                }
                if (signal !== "metrics") {
                    const request = json ? JSON.parse(body.toString("utf8")) :
                        decodeProto(body, signal === "logs" ? "LogsRequest" : "TracesRequest")
                    this.route(usageRecords(signal, request))
                }
                reply(200, json)
            }
            catch (err: unknown) {
                this.log.write("warning", `usage: invalid OTLP ${signal} request: ${err instanceof Error ? err.message : String(err)}`)
                reply(400, json)
            }
        })
    }

    /*  route usage records by their session to the owning project service
        (dropping the records of unregistered sessions), with the session registry
        re-read from the telemetry state file only once the file changed  */
    private route (records: UsageRecord[]): void {
        const bySession = Map.groupBy(records, (r) => r.session)
        let registry: Record<string, SessionEntry>
        try {
            const file = UsageTracker.stateFile()
            const stat = fs.statSync(file, { throwIfNoEntry: false })
            const mark = stat !== undefined ? `${stat.ino}:${stat.mtimeMs}:${stat.size}` : ""
            if (this.registry?.mark !== mark)
                this.registry = { mark, session: stat !== undefined ? (UsageTracker.readState(file).session ?? {}) : {} }
            registry = this.registry.session
        }
        catch (err: unknown) {
            this.log.write("warning", `usage: failed to read session registry: ${err instanceof Error ? err.message : String(err)}`)
            return
        }
        for (const [ session, list ] of bySession) {
            /*  (the not yet persisted (un)registrations of this project take precedence)  */
            const entry = this.sessions.has(session) ? this.sessions.get(session) : registry[session]
            if (entry === undefined || entry === null)
                continue
            if (entry.root === this.root)
                this.ingest(list)
            else {
                UsageTracker.request(entry.root, "/usage/records", { records: list }).catch((err: unknown) => {
                    this.log.write("warning", `usage: forwarding records to project "${entry.project}" failed: ` +
                        `${err instanceof Error ? err.message : String(err)}`)
                })
            }
        }
    }
}
