/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import os                       from "node:os"

import type { Agent }           from "undici"
import * as v                   from "valibot"
import { WebSocket }            from "ws"
import { isScalar }             from "yaml"

import type Log                 from "./ase-lib-log.js"
import { Config }               from "./ase-config-core.js"
import { configSchema }         from "./ase-config-schema.js"
import { parseScope }           from "./ase-config-scope.js"
import * as TaskFormat          from "./ase-task-format.js"
import { urlHost, isLoopback }  from "./ase-lib-server-bind.js"
import { dispatchFetch, insecureAgent } from "./ase-lib-fetch.js"
import { storeSchema }          from "./ase-task-store-server-cli.js"
import { relaySchema }          from "./ase-agent-relay-server-cli.js"
import * as Relay               from "./ase-agent-relay-core.js"

/*  a configuration value with its supplying scope  */
type ScopedValue = { value: string, scope: string }

/*  the resolved agent relay of the project: the project id, the base URL, the
    bearer token, and whether the certificate verification is skipped  */
export type RelaySpec = { prjId: string, base: string, token: string, insecure: boolean }

/*  redact an agent relay URL for its use in messages: its user information, its
    path (as it potentially embeds the token), and its query (unless it is the
    well-known "?insecure"), so that no token ever lands in the logs  */
export const redactURL = (url: string): string => {
    const m = /^([^:/?#]+:\/\/)?([^/?#]*)([^?#]*)(.*)$/s.exec(url)
    if (m === null)
        return "***"
    const [ , scheme = "", authority, path, rest ] = m
    return scheme +
        authority.replace(/^[^@]*@/, "***@") +
        (path === "" || path === "/" ? path : "/***") +
        (rest === "" || rest === "?insecure" ? rest : `${rest[0]}***`)
}

/*  resolve the bearer token of the agent relay: the token embedded in the URL,
    else $ASE_AGENT_RELAY_TOKEN, else "project.relay.token", else the token of the
    locally started agent relay server (or of the locally started task store server
    co-hosting the agent relay), but only if the URL addresses exactly this server;
    a token potentially committed or redirected is warned about  */
const relayToken = (log: Log, relay: ScopedValue, token: ScopedValue, embedded: string | undefined, url: URL): string => {
    const repoScoped = relay.scope === "project" || relay.scope.startsWith("task:")
    if (embedded !== undefined) {
        if (repoScoped)
            log.write("warning", `agent: token embedded in "project.relay.url" on scope "${relay.scope}" ` +
                "might be committed -- use $ASE_AGENT_RELAY_TOKEN or \"project.relay.token\" on scope \"user\" instead")
        return embedded
    }

    /*  warn about a user token being sent to a non-loopback host selected on
        a repository-supplied scope, as a cloned repository could redirect it this way  */
    const redirected = () => {
        if (repoScoped && !isLoopback(url.hostname))
            log.write("warning", `agent: sending token to non-loopback host "${url.host}" selected by ` +
                `"project.relay.url" on scope "${relay.scope}" -- verify you trust this host` +
                (url.protocol === "ase:" ? " (token is transmitted in plaintext)" : ""))
    }
    const env = process.env.ASE_AGENT_RELAY_TOKEN
    if (env !== undefined && env !== "") {
        redirected()
        return env
    }
    if (token.value !== "") {
        if (token.scope !== "user")
            log.write("warning", `agent: "project.relay.token" found on scope "${token.scope}" ` +
                "-- configure it on scope \"user\" only")
        redirected()
        return token.value
    }

    /*  fall back to the token of the locally started agent relay server, or of the
        locally started task store server co-hosting it, but only if the URL addresses exactly this server  */
    const servers = [
        { name: "relay", cfg: new Config("relay", relaySchema, log, parseScope("user")) },
        { name: "store", cfg: new Config("store", storeSchema, log, parseScope("user")) }
    ]
    for (const { name, cfg } of servers) {
        cfg.read()
        const scalar = (key: string): string => {
            const val = cfg.get(key)
            return val === undefined ? "" : String(isScalar(val) ? val.value : val)
        }
        if (name === "store" && scalar("relay") !== "true")
            continue
        const tok      = scalar("token")
        const address  = scalar("address") || "127.0.0.1"
        const wildcard = address === "0.0.0.0" || address === "::"
        const host     = urlHost(address).toLowerCase()
        const loopback = isLoopback(url.hostname)
        if (tok !== "" && scalar("port") === url.port
            && (url.hostname.toLowerCase() === host || (loopback && (wildcard || isLoopback(host)))))
            return tok
    }
    throw new Error(`agent: no token for agent relay "${redactURL(relay.value)}" ` +
        "(set $ASE_AGENT_RELAY_TOKEN, \"project.relay.token\" on scope \"user\", or \"/<token>\" in the URL)")
}

/*  a parsed agent relay URL: the parsed URL itself, whether it selects HTTPS,
    its embedded token (if any), and whether the certificate verification is skipped  */
export type RelayURL = { url: URL, secure: boolean, embedded: string | undefined, insecure: boolean }

/*  parse an agent relay URL "ase://<addr>:<port>[/<token>]" (selecting an agent relay
    server via HTTP) or "ases://<addr>:<port>[/<token>][?insecure]" (selecting it via
    HTTPS, optionally without certificate verification)  */
export const parseRelayURL = (value: string): RelayURL => {
    /*  parse via WHATWG URL, as it supports bracketed IPv6 addresses (e.g. "[::1]")
        and retains the brackets in "hostname" for direct reuse in the HTTP URL  */
    const unsupported = () => new Error(`agent: unsupported agent relay URL "${redactURL(value)}" ` +
        "(expected: \"ase://<addr>:<port>[/<token>]\" or \"ases://<addr>:<port>[/<token>][?insecure]\")")
    const m = /^(ases?):\/\//.exec(value)
    if (m === null)
        throw unsupported()
    const secure = m[1] === "ases"
    let url: URL
    try {
        url = new URL(value)
    }
    catch (_err: unknown) {
        throw unsupported()
    }
    let p: RegExpExecArray | null
    if (url.hostname === "" || url.port === "" || url.username !== "" || url.password !== ""
        || url.hash !== "" || (url.search !== "" && !(secure && url.search === "?insecure"))
        || (p = /^(?:\/([^/]+))?$/.exec(url.pathname)) === null)
        throw unsupported()
    let embedded: string | undefined
    try {
        embedded = p[1] !== undefined ? decodeURIComponent(p[1]) : undefined
    }
    catch (_err: unknown) {
        throw unsupported()
    }
    return { url, secure, embedded, insecure: url.search === "?insecure" }
}

/*  resolve the agent relay of the project: the URL (see "parseRelayURL") is taken from
    the given override (the "--agent-relay" option), else from "project.relay.url",
    where no URL at all (null) disables the passing of the presence of the agents  */
export const relaySpec = (log: Log, override?: string): RelaySpec | null => {
    const cfg = new Config("config", configSchema, log)
    cfg.read()
    const scoped = (key: string): ScopedValue => {
        const entry = cfg.getScoped(key)
        if (entry === undefined)
            return { value: "", scope: "" }
        return {
            value: String(isScalar(entry.value) ? entry.value.value : entry.value),
            scope: Config.scopeLabel(entry.scope)
        }
    }
    const relay = override !== undefined && override !== "" ? { value: override, scope: "option" } : scoped("project.relay.url")
    if (relay.value === "")
        return null
    const { url, secure, embedded, insecure } = parseRelayURL(relay.value)

    /*  require an explicit project id, as a basename-derived one
        likely collides with unrelated projects on a shared server  */
    const prjId = scoped("project.id").value
    if (prjId === "")
        throw new Error("agent: agent relay requires an explicit \"project.id\" " +
            "(set it via \"ase config --scope project set project.id <id>\")")
    if (!TaskFormat.ID_RE.test(prjId))
        throw new Error(`agent: configured "project.id" "${prjId}" must match [A-Za-z0-9_-]+`)
    return {
        prjId,
        base:     `${secure ? "https" : "http"}://${url.hostname}:${url.port}`,
        token:    relayToken(log, relay, scoped("project.relay.token"), embedded, url),
        insecure
    }
}

/*  an error of the agent relay: its HTTP status (or zero for an unreachable agent relay)  */
export class AgentRelayError extends Error {
    constructor (message: string, public status = 0, options?: ErrorOptions) {
        super(message, options)
    }
}

/*  the interval of the keepalive pings of the subscription (where a connection without
    any traffic for this interval is pinged and without any traffic for twice this interval
    is terminated), the timeout of its WebSocket handshake, and the minimum and maximum
    delay of its reconnection (doubled on each failed connection attempt in a row)  */
const KEEPALIVE_MS     = 15 * 1000
const HANDSHAKE_MS     = 10 * 1000
const RECONNECT_MIN_MS = 2 * 1000
const RECONNECT_MAX_MS = 60 * 1000

/*  the client of the agent relay: the announcing and removal of an agent,
    the listing of the agents, and the subscription to their changes  */
export class AgentRelayClient {
    private dispatcher: Agent | undefined
    constructor (private log: Log, private spec: RelaySpec) {
        this.dispatcher = spec.insecure ? insecureAgent() : undefined
    }

    /*  the base URL of the agent relay  */
    get base (): string {
        return this.spec.base
    }

    /*  perform a request, raising an error response or a failed connection  */
    private async request<T> (method: string, url: string, body?: unknown): Promise<T> {
        const r = await dispatchFetch.raw(`${this.spec.base}/projects/${this.spec.prjId}/agents${url}`, {
            method,
            headers: {
                Authorization: `Bearer ${this.spec.token}`,
                ...(body !== undefined ? { "Content-Type": "application/json" } : {})
            },
            body:                body !== undefined ? JSON.stringify(body) : undefined,
            dispatcher:          this.dispatcher,
            signal:              AbortSignal.timeout(5000),
            ignoreResponseError: true
        }).catch((err: unknown) => {
            let cause = err
            while (cause instanceof Error && cause.cause instanceof Error)
                cause = cause.cause
            throw new AgentRelayError(`agent relay "${this.spec.base}" unreachable: ${cause instanceof Error ? cause.message : String(cause)}`,
                0, { cause: err })
        })
        if (r.status < 200 || r.status >= 300) {
            const d = r._data as { detail?: string, title?: string } | null
            throw new AgentRelayError(`agent relay "${this.spec.base}": ` +
                `${d?.detail ?? d?.title ?? "request failed"} (HTTP ${r.status})`, r.status)
        }
        return (r._data ?? {}) as T
    }

    /*  announce the presence of an agent, remove it, and list all agents  */
    async announce (id: string, presence: Relay.AgentAnnounce): Promise<void> {
        await this.request("PUT", `/${id}`, presence)
    }
    async remove (id: string): Promise<void> {
        await this.request("DELETE", `/${id}`)
    }
    async list (): Promise<Relay.AgentPresence[]> {
        return (await this.request<{ agents: Relay.AgentPresence[] }>("GET", "")).agents
    }

    /*  subscribe to the agents of the project via the WebSocket event endpoint,
        reconnecting after a connection loss, a failed or timed out handshake, or
        a connection without any traffic despite keepalive pings (e.g. a half-open one
        after a network partition), with a growing delay while the connection attempts
        keep failing, where a handshake rejected by the agent relay (e.g. for an invalid
        token) is warned about once per reason, where the agents are unknown while disconnected,
        reporting the agents on every change and each change of the connection state
        (initially disconnected); returns a function to unsubscribe  */
    subscribe (onAgents: (agents: Relay.AgentPresence[]) => void, onState?: (connected: boolean) => void): () => void {
        const url    = `${this.spec.base.replace(/^http/, "ws")}/projects/${this.spec.prjId}/agents/events`
        const agents = new Map<string, Relay.AgentPresence>()
        let ws:      WebSocket | null = null
        let timer:   ReturnType<typeof setTimeout> | null = null
        let stopped  = false
        let delay    = RECONNECT_MIN_MS
        let rejected = ""
        const connect = (): void => {
            const sock = new WebSocket(url, {
                headers:            { Authorization: `Bearer ${this.spec.token}` },
                rejectUnauthorized: !this.spec.insecure,
                handshakeTimeout:   HANDSHAKE_MS
            })
            ws = sock

            /*  keep the connection alive: record any traffic (the frames, and the pings
                of the agent relay and the pongs of our own pings), and terminate the
                connection if there was none since the previous (then unanswered) ping  */
            let traffic  = true
            let watchdog: ReturnType<typeof setInterval> | null = null
            const alive  = () => { traffic = true }
            sock.on("ping", alive)
            sock.on("pong", alive)
            sock.on("open", () => {
                watchdog = setInterval(() => {
                    if (!traffic) {
                        this.log.write("debug", `agent relay "${this.spec.base}": events: connection unresponsive -- reconnecting`)
                        sock.terminate()
                        return
                    }
                    traffic = false
                    sock.ping()
                }, KEEPALIVE_MS)
                delay    = RECONNECT_MIN_MS
                rejected = ""
                onState?.(true)
            })

            /*  apply the validated event frames to the agents, where an invalid
                frame is warned about (once per connection) and ignored  */
            let warned = false
            sock.on("message", (data) => {
                traffic = true
                try {
                    let frame: Relay.RelayFrame
                    try {
                        const result = v.safeParse(Relay.frameSchema, JSON.parse(String(data)))
                        if (!result.success)
                            throw new Error(`${result.issues[0].message}` +
                                (result.issues[0].path !== undefined ? ` (at "${v.getDotPath(result.issues[0]) ?? ""}")` : ""))
                        frame = result.output
                    }
                    catch (err: unknown) {
                        this.log.write(warned ? "debug" : "warning", `agent relay "${this.spec.base}": events: ` +
                            `invalid event frame ignored: ${err instanceof Error ? err.message : String(err)}`)
                        warned = true
                        return
                    }
                    if (frame.reset === true)
                        agents.clear()
                    for (const [ id, agent ] of Object.entries(frame.agents ?? {}))
                        agents.set(id, { ...agent, recent: Relay.appendLines(agents.get(id)?.recent ?? [], agent.recent) })
                    for (const id of frame.removed ?? [])
                        agents.delete(id)
                    onAgents([ ...agents.values() ])
                }
                catch (err: unknown) {
                    /*  never let a failure escape the listener (and crash the process)  */
                    this.log.write("warning", `agent relay "${this.spec.base}": events: ` +
                        `failed to process event frame: ${err instanceof Error ? err.message : String(err)}`)
                }
            })
            sock.on("error", (err) => {
                const rejection = /^Unexpected server response: 4\d\d$/.test(err.message)
                this.log.write(rejection && err.message !== rejected ? "warning" : "debug",
                    `agent relay "${this.spec.base}": events: ${err.message}`)
                if (rejection)
                    rejected = err.message
            })
            sock.on("close", () => {
                if (watchdog !== null)
                    clearInterval(watchdog)
                ws = null
                if (!stopped) {
                    if (agents.size > 0) {
                        agents.clear()
                        onAgents([])
                    }
                    onState?.(false)
                    timer = setTimeout(connect, delay)
                    delay = Math.min(delay * 2, RECONNECT_MAX_MS)
                }
            })
        }
        connect()
        return () => {
            stopped = true
            if (timer !== null)
                clearTimeout(timer)
            ws?.close()
        }
    }
}

/*  the interval of the heartbeat, the coalescing delay of the processing log lines,
    the minimum and maximum back-off delay after a rejection, and the
    maximum duration of the removal of the presence on stop  */
const HEARTBEAT_MS   = 10 * 1000
const COALESCE_MS    = 250
const BACKOFF_MIN_MS = 60 * 1000
const BACKOFF_MAX_MS = 15 * 60 * 1000
const STOP_MS        = 2 * 1000

/*  the user name and id of the agent process (with an unknown user id, e.g. on Windows, as -1)  */
const processUser = (): { name: string, uid: number } => {
    try {
        const info = os.userInfo()
        return { name: info.username, uid: info.uid }
    }
    catch (_err: unknown) {
        return { name: process.env.USER ?? process.env.USERNAME ?? "", uid: process.getuid?.() ?? -1 }
    }
}

/*  the presence of a running agent, announced to the agent relay: immediately
    on every change of its state, tasks, and usage, coalesced on new processing log lines,
    and periodically as its heartbeat, each time with only the processing log lines
    added since the previous successful announcement (kept until announced, bounded
    while the agent relay is unreachable), where an unreachable agent relay is
    warned about once per outage only and never disturbs the agent itself, and where
    a rejected announcement (a client error other than a timeout) backs off exponentially,
    and a permanently rejected one (also other than an authentication failure or a
    rate limit) additionally drops its lines  */
export class AgentPresenceReporter {
    readonly id:    string
    private started = Date.now()
    private cwd     = process.cwd()
    private user    = processUser()
    private state:  Relay.AgentState = "waiting"
    private tasks:  string[] = []
    private usage:  Relay.AgentUsages = null
    private lines:  Relay.AgentLine[] = []
    private beat:   ReturnType<typeof setInterval> | null = null
    private delay:  ReturnType<typeof setTimeout> | null = null
    private flight: Promise<void> | null = null
    private again   = false
    private failing = false
    private reason  = ""
    private backoff = 0
    private resume  = 0
    private stopped = false

    constructor (private log: Log, private client: AgentRelayClient, private kind: string, private name: string, private mode = "",
        private request = "", private prompt: Relay.AgentPrompt = "required", private states?: Relay.AgentFlow,
        private title = "", private description = "") {
        this.id = `${os.hostname()}-${process.pid}-${name}`
            .replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^[^A-Za-z0-9]+/, "").slice(0, 128)
    }

    /*  start announcing the agent (initially waiting)  */
    start (): void {
        this.beat = setInterval(() => { this.send() }, HEARTBEAT_MS)
        this.beat.unref()
        this.send()
    }

    /*  update the tasks the agent is busy with (and hence its state)  */
    busy (tasks: string[]): void {
        this.tasks = [ ...tasks ].sort(TaskFormat.compareIds)
        this.state = this.tasks.length > 0 ? "busy" : "waiting"
        this.send()
    }

    /*  record the usage of the agent tool by a finished job (as the last one, and into the total)  */
    used (usage: Relay.AgentUsage): void {
        this.usage = { total: this.usage !== null ? Relay.addUsage(this.usage.total, usage) : usage, last: usage }
        this.send()
    }

    /*  record a processing log line (of a task, or of the agent itself)  */
    line (level: Relay.AgentLine["level"], task: string, msg: string): void {
        this.lines.push({ time: Date.now(), level, task, msg: msg.length > Relay.MSG_MAX ? `${msg.slice(0, Relay.MSG_MAX - 1)}…` : msg })
        if (this.lines.length > Relay.LINES_MAX)
            this.lines.splice(0, this.lines.length - Relay.LINES_MAX)
        if (this.delay === null && !this.stopped)
            this.delay = setTimeout(() => {
                this.delay = null
                this.send()
            }, COALESCE_MS)
    }

    /*  announce the current presence, serialized with an ongoing announcement,
        but not while backing off after a rejection  */
    private send (): void {
        if (this.stopped || Date.now() < this.resume)
            return
        if (this.flight !== null) {
            this.again = true
            return
        }
        const lines = this.lines
        this.lines  = []
        const presence: Relay.AgentAnnounce = {
            kind: this.kind, name: this.name, mode: this.mode, host: os.hostname(), pid: process.pid,
            cwd: this.cwd, user: this.user.name, uid: this.user.uid, started: this.started,
            state: this.state, tasks: this.tasks, usage: this.usage, lines
        }
        if (this.title !== "")
            presence.title = this.title
        if (this.description !== "")
            presence.description = this.description
        if (this.request !== "")
            presence.request = this.request
        if (this.request !== "" && this.prompt !== "required")
            presence.prompt = this.prompt
        if (this.states !== undefined)
            presence.states = this.states
        this.flight = this.client.announce(this.id, presence).then(() => {
            if (this.failing)
                this.log.write("info", `agent: agent relay "${this.client.base}" accepting presence of agent again`)
            this.failing = false
            this.reason  = ""
            this.backoff = 0
            this.resume  = 0
        }).catch((err: unknown) => {
            const status    = err instanceof AgentRelayError ? err.status : 0
            const rejected  = status >= 400 && status < 500 && status !== 408
            const permanent = rejected && status !== 401 && status !== 429
            const message   = err instanceof Error ? err.message : String(err)

            /*  on a rejection (a client error other than a timeout), back off exponentially
                (as a repetition is likely rejected again, e.g. by the limits of the agent relay
                or for an invalid token), and on a permanent rejection (also other than an
                authentication failure or a rate limit) drop the rejected lines (as they
                potentially caused it), else keep the not announced lines (in front of the
                meanwhile added ones) for the next announcement  */
            if (rejected) {
                this.backoff = Math.min(Math.max(this.backoff * 2, BACKOFF_MIN_MS), BACKOFF_MAX_MS)
                this.resume  = Date.now() + this.backoff
            }
            if (!permanent)
                this.lines = [ ...lines, ...this.lines ].slice(-Relay.LINES_MAX)
            if (!this.failing || (rejected && message !== this.reason))
                this.log.write("warning", `agent: ${message} ` + (rejected ?
                    `(presence of agent rejected -- retrying in ${Math.round(this.backoff / 1000)}s at the earliest)` :
                    "(presence of agent not passed until reachable again)"))
            this.failing = true
            this.reason  = message
        }).finally(() => {
            this.flight = null
            if (this.again) {
                this.again = false
                this.send()
            }
        })
    }

    /*  stop announcing the agent and remove its presence, bounded in time, so an
        unresponsive agent relay never delays the shutdown of the agent (a presence
        not removed in time is swept by the agent relay as stale anyway)  */
    async stop (): Promise<void> {
        this.stopped = true
        if (this.beat !== null)
            clearInterval(this.beat)
        if (this.delay !== null)
            clearTimeout(this.delay)
        const remove = Promise.resolve(this.flight)
            .then(() => this.client.remove(this.id))
            .catch(() => {})
        await Promise.race([ remove, new Promise<void>((resolve) => { setTimeout(resolve, STOP_MS).unref() }) ])
    }
}

