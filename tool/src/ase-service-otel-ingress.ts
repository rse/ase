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

import type Log                         from "./ase-lib-log.js"
import type { TokenCounts }             from "./ase-config-schema.js"
import { HOST, telemetryEnabled, telemetryEndpoint } from "./ase-service-otel-common.js"

/*  the maximum OTLP request size  */
const BODY_MAX = 32 * 1024 * 1024

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

/*  ==== OTLP ingress ====  */

/*  the OTLP ingress of the user, held by at most one project service at a time: it
    receives the OTLP/HTTP export requests, notes them as an activity of the service,
    and passes their usage records on for routing them to the owning project services  */
export class OtlpIngress {
    private server: http.Server | null = null

    constructor (
        private log:      Log,
        private aseDir:   string,
        private activity: () => void,
        private route:    (records: UsageRecord[]) => void
    ) {}

    /*  take part in the election of the OTLP ingress of the user: unless already holding it,
        try to bind its port (only if telemetry is activated, i.e., a token exists)  */
    bind (): void {
        if (!telemetryEnabled(this.log)) {
            if (this.server !== null) {
                this.log.write("info", "usage: telemetry disabled -- releasing the OTLP ingress")
                this.close()
            }
            return
        }
        if (this.server !== null)
            return
        const { url, token } = telemetryEndpoint(this.log, false)
        if (token === "")
            return
        const port   = Number(new URL(url).port)
        const server = http.createServer((req, res) => { this.receive(req, res, port, token) })
        this.server = server
        server.once("error", () => {
            /*  port held by another project service (or foreign process): retry later  */
            this.server = null
            server.close()
        })
        server.listen(port, HOST, () => {
            this.log.write("info", `usage: acting as OTLP ingress on ${url}`)
        })
    }

    /*  release the OTLP ingress (if held)  */
    close (): void {
        if (this.server !== null) {
            this.server.close()
            this.server = null
        }
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
}

