/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import path                   from "node:path"
import fs                     from "node:fs"
import { fileURLToPath }      from "node:url"
import { spawn }              from "node:child_process"
import type { ChildProcess }  from "node:child_process"

import { Command }            from "commander"
import Hapi                   from "@hapi/hapi"
import { ofetch, FetchError } from "ofetch"
import { isMap }              from "yaml"
import prettyMs               from "pretty-ms"
import * as v                 from "valibot"

import { McpServer }                     from "@modelcontextprotocol/sdk/server/mcp.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"

import { ConfigMCP }                     from "./ase-config.js"
import { Config }                        from "./ase-config-core.js"
import { configSchema }                  from "./ase-config-schema.js"
import { ensureAseGitignore }            from "./ase-config-scope.js"
import type Log                          from "./ase-lib-log.js"
import { isLogLevel }                    from "./ase-lib-log.js"
import type { LogLevel }                 from "./ase-lib-log.js"
import { Daemon }                        from "./ase-lib-daemon-cli.js"
import { CompatMCP }                     from "./ase-util-compat.js"
import { DiagramMCP }                    from "./ase-util-diagram.js"
import { Task, TaskMCP }                 from "./ase-task.js"
import { MarkdownMCP }                   from "./ase-service-markdown.js"
import { ArtifactMCP }                   from "./ase-artifact.js"
import { SpecMCP }                       from "./ase-spec.js"
import { KVMCP }                         from "./ase-service-kv.js"
import { StateMCP }                      from "./ase-service-state.js"
import { TimestampMCP }                  from "./ase-service-timestamp.js"
import { SleepMCP }                      from "./ase-service-sleep.js"
import { GetoptMCP }                     from "./ase-service-getopt.js"
import { SkillsMCP }                     from "./ase-service-skills.js"
import { WorktreeMCP }                   from "./ase-util-worktree.js"
import { MintMCP }                       from "./ase-util-mint.js"
import { MetricMCP }                     from "./ase-util-metric.js"
import { UsageTracker }                  from "./ase-service-otel.js"
import type { UsageRecord }              from "./ase-service-otel.js"
import pkg                               from "../package.json" with { type: "json" }

/*  shared service host  */
export const SERVICE_HOST = "127.0.0.1"
const HOST = SERVICE_HOST

/*  schema for ".ase/service.yaml"  */
export const serviceSchema = v.nullish(v.strictObject({
    port: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1024), v.maxValue(65535)))
}))

/*  distinguish ECONNREFUSED from other ofetch transport errors  */
export const isConnRefused = (err: unknown): boolean => {
    const e = err as FetchError & { code?: string, cause?: { code?: string, cause?: { code?: string } } }
    return e?.code === "ECONNREFUSED"
        || e?.cause?.code === "ECONNREFUSED"
        || e?.cause?.cause?.code === "ECONNREFUSED"
}

/*  probe the service and verify ASE identity banner  */
export const probe = async (port: number, projectId: string): Promise<boolean | null> => {
    try {
        const r = await ofetch.raw(`http://${HOST}:${port}/`, {
            method:              "OPTIONS",
            signal:              AbortSignal.timeout(2000),
            ignoreResponseError: true
        })
        if (r.status < 200 || r.status >= 300)
            return false
        const d = r._data as { ase?: boolean, projectId?: string } | null
        return d?.ase === true && d?.projectId === projectId
    }
    catch (err: unknown) {
        if (isConnRefused(err))
            return null
        throw err
    }
}

/*  the service identity context: project id, persisted and preferred port, service configuration, and ".ase" directory  */
export interface Context {
    projectId: string
    port:      number | null
    portPref:  number | null
    svc:       Config
    aseDir:    string
}

const SERVE_ENV  = "ASE_SERVICE_SERVE"
const PORT_ENV   = "ASE_SERVICE_PORT"
const LEVEL_ENV  = "ASE_SERVICE_LOG_LEVEL"
const IDLE_MS    = 30 * 60 * 1000
const TICK_MS    = 60 * 1000

/*  maximum length of the MCP tool call arguments logged per request  */
const LOG_ARGS_MAX = 200

/*  load the optional "config.yaml" and "service.yaml" files and derive
    the service identity context (project id, port, preferred port, service config)  */
export const loadServiceContext = (log: Log): Context => {
    /*  load files  */
    const cfg = new Config("config", configSchema, log)
    cfg.read()
    const svc = new Config("service", serviceSchema, log)
    svc.read()

    /*  determine project id  */
    const projectId = (cfg.get("project.id") as string | null | undefined) || Task.projectIdOf(Task.projectRoot())

    /*  determine service port  */
    const port      = (svc.get("port")       as number | null | undefined) ?? null

    /*  determine preferred service port  */
    const pref      = cfg.get("project.service.port") as number | string | null | undefined
    const portPref  = pref !== null && pref !== undefined ? Number(pref) : null

    /*  determine path to ".ase" directory  */
    const aseDir    = path.dirname(svc.filename)

    /*  return context information  */
    return { projectId, port, portPref, svc, aseDir }
}

/*  reusable functionality: port persistence and process spawning  */
export class Service {
    /*  persist an allocated port into ".ase/service.yaml"  */
    static persistPort (svc: Config, port: number): void {
        ensureAseGitignore(path.dirname(svc.filename))
        svc.lock(() => {
            svc.read()
            svc.set("port", port)
            svc.write()
        })
    }

    /*  clear the persisted port and remove ".ase/service.yaml" if it is empty  */
    static clearPort (svc: Config): void {
        svc.lock(() => {
            svc.read()
            svc.delete("port")
            const root  = svc.get()
            const empty = root === undefined || root === null || (isMap(root) && root.items.length === 0)
            if (empty) {
                if (fs.existsSync(svc.filename))
                    fs.rmSync(svc.filename)
            }
            else
                svc.write()
        })
    }

    /*  spawn the current executable detached as a background service  */
    static spawnDetached (aseDir: string, port: number, logLevel: LogLevel): { child: ChildProcess, logFile: string } {
        fs.mkdirSync(aseDir, { recursive: true })
        ensureAseGitignore(aseDir)
        const logFile = path.join(aseDir, "service.log")

        /*  trim the log before handing it to the service, as the detached
            service inherits the file descriptor for its entire lifetime and
            hence cannot rotate the file itself while it is running  */
        Daemon.trimLog(logFile)

        const fd      = fs.openSync(logFile, "a")
        const entry   = fileURLToPath(new URL("./ase.js", import.meta.url))
        const child   = spawn(process.execPath, [ entry, "service", "start" ], {
            detached: true,
            env:      { ...process.env, [SERVE_ENV]: "1", [PORT_ENV]: String(port), [LEVEL_ENV]: logLevel },
            stdio:    [ "ignore", fd, fd ]
        })
        fs.closeSync(fd)
        return { child, logFile }
    }
}

/*  MCP registration entry point for service-identity tools  */
export class ServiceMCP {
    constructor (private ctx: { projectId: string, port: number, startTime: number }) {}

    register (mcp: McpServer): void {
        mcp.registerTool("ase_ping", {
            title:       "ASE service ping",
            description: "Return ASE service identity, port, and uptime.",
            inputSchema: {}
        }, async () => {
            const status = {
                ok:        true,
                projectId: this.ctx.projectId,
                port:      this.ctx.port,
                uptimeMs:  Date.now() - this.ctx.startTime
            }
            return {
                content: [ { type: "text", text: JSON.stringify(status) } ]
            }
        })
    }
}

/*  CLI command "ase service"  */
export default class ServiceCommand {
    constructor (private log: Log) {}

    /*  load optional ".ase/config.yaml" and ".ase/service.yaml" files  */
    private loadContext (): Context {
        return loadServiceContext(this.log)
    }

    /*  build a fresh MCP server instance with all registered tools
        (also used by the "ase mcp" bridge for answering the MCP handshake
        and tool listing in-process before the service is started)  */
    static buildMcpServer (log: Log, ctx: { projectId: string, port: number }, startTime: number, usage?: UsageTracker): McpServer {
        const mcp = new McpServer({ name: "ase", version: pkg.version })
        new ServiceMCP({ projectId: ctx.projectId, port: ctx.port, startTime }).register(mcp)
        new CompatMCP().register(mcp)
        new DiagramMCP().register(mcp)
        new TaskMCP(log, usage).register(mcp)
        new MarkdownMCP().register(mcp)
        new ArtifactMCP(log).register(mcp)
        new SpecMCP(log).register(mcp)
        new KVMCP().register(mcp)
        new TimestampMCP().register(mcp)
        new SleepMCP().register(mcp)
        new GetoptMCP().register(mcp)
        new SkillsMCP().register(mcp)
        new WorktreeMCP().register(mcp)
        new MintMCP().register(mcp)
        new MetricMCP().register(mcp)
        new ConfigMCP(log).register(mcp)
        new StateMCP(log).register(mcp)
        return mcp
    }

    /*  summarize the method, tool name, and capped tool arguments of an MCP request body  */
    private static mcpBodyInfo (body: unknown): { method: string | null, info: string } {
        const b       = body as Record<string, unknown> | null | undefined
        const bParams = b?.params as Record<string, unknown> | null | undefined
        const bMethod = typeof b?.method     === "string"  ? b.method          : null
        const bName   = typeof bParams?.name === "string"  ? bParams.name      : null
        const bArgs   = bParams?.arguments   !== undefined ? bParams.arguments : null
        let info      = ""
        if (bMethod !== null) {
            info = ` [${bMethod}]`
            if (bName !== null) {
                info += ` ${bName}`
                if (bArgs !== null) {
                    /*  cap the arguments, as payload-carrying tool calls
                        (task plans, key/value batches, etc) would
                        otherwise dominate the entire log file  */
                    const args = JSON.stringify(bArgs)
                    info += ` ${args.length > LOG_ARGS_MAX ? `${args.slice(0, LOG_ARGS_MAX)}…` : args}`
                }
            }
        }
        return { method: bMethod, info }
    }

    /*  register the endpoints of the AI usage accounting: the usage records forwarded
        by the OTLP ingress, the session end, the task assignment on behalf of a session,
        and the task rename  */
    private static registerUsageRoutes (server: Hapi.Server, usage: UsageTracker): void {
        server.route({
            method:  "POST",
            path:    "/usage/records",
            options: { payload: { parse: true, allow: "application/json", maxBytes: 32 * 1024 * 1024 } },
            handler: (request, h) => {
                const payload = request.payload as { records?: unknown } | null
                if (!Array.isArray(payload?.records))
                    return h.response({ error: "missing or invalid 'records' field" }).code(400)
                usage.ingest(payload.records as UsageRecord[])
                return h.response({ ok: true }).code(200)
            }
        })
        server.route({
            method:  "POST",
            path:    "/usage/detach",
            options: { payload: { parse: true, allow: "application/json" } },
            handler: (request, h) => {
                const payload = request.payload as { session?: unknown } | null
                if (typeof payload?.session !== "string")
                    return h.response({ error: "missing or invalid 'session' field" }).code(400)
                usage.detach(payload.session)
                return h.response({ ok: true }).code(200)
            }
        })
        server.route({
            method:  "POST",
            path:    "/usage/rename",
            options: { payload: { parse: true, allow: "application/json" } },
            handler: (request, h) => {
                const payload = request.payload as { old?: unknown, new?: unknown } | null
                if (typeof payload?.old !== "string" || typeof payload.new !== "string")
                    return h.response({ error: "missing or invalid 'old' or 'new' field" }).code(400)
                try {
                    usage.rename(payload.old, payload.new)
                }
                catch (err: unknown) {
                    return h.response({ error: err instanceof Error ? err.message : String(err) }).code(422)
                }
                return h.response({ ok: true }).code(200)
            }
        })
        server.route({
            method:  "POST",
            path:    "/usage/assign",
            options: { payload: { parse: true, allow: "application/json" } },
            handler: async (request, h) => {
                const payload = request.payload as { id?: unknown, assignee?: unknown, session?: unknown } | null
                if (typeof payload?.id !== "string" || typeof payload.assignee !== "string" || typeof payload.session !== "string")
                    return h.response({ error: "missing or invalid 'id', 'assignee', or 'session' field" }).code(400)
                try {
                    return h.response(await usage.assign(payload.id, payload.assignee, payload.session)).code(200)
                }
                catch (err: unknown) {
                    return h.response({ error: err instanceof Error ? err.message : String(err) }).code(422)
                }
            }
        })
    }

    /*  service-side: bind HAPI server until "/stop" command is received or idle timeout happens
        (or, in the foreground, until "/stop" command is received or a termination signal arrives)  */
    private async runService (ctx: Context & { port: number }, foreground = false): Promise<void> {
        /*  establish HAPI HTTP/REST service  */
        const server = Hapi.server({ host: HOST, port: ctx.port })

        /*  keep idle connections long (default: 5s), as a request on an idle connection,
            not yet read during a busy event loop, races the service closing that connection
            (the clients adopt the advertised timeout minus a safety margin)  */
        server.listener.keepAliveTimeout = 65 * 1000
        server.listener.headersTimeout   = 66 * 1000

        /*  track start time and last activity  */
        const startTime  = Date.now()
        let lastActivity = Date.now()
        let inFlight     = 0
        let stopping     = false

        /*  accept only loopback "Host" headers, to defeat DNS rebinding attacks from browser pages  */
        const allowedHosts = new Set([ `${HOST}:${ctx.port}`, `localhost:${ctx.port}` ])
        server.ext("onRequest", (request, h) => {
            inFlight++
            lastActivity = Date.now()
            const host = ((request.headers.host as string | undefined) ?? "").toLowerCase()
            if (!allowedHosts.has(host))
                return h.response({ error: "invalid Host header" }).code(421).takeover()
            return h.continue
        })
        server.ext("onPreResponse", (_request, h) => {
            inFlight     = Math.max(0, inFlight - 1)
            lastActivity = Date.now()
            return h.continue
        })

        /*  establish the usage tracker of the AI usage accounting (and the OTLP ingress)  */
        const usage = new UsageTracker(this.log, Task.projectRoot(), ctx.projectId, ctx.aseDir, () => {
            lastActivity = Date.now()
        })

        /*  stop the HTTP server and the usage tracker, clear the persisted port, and exit  */
        const stopService = async (): Promise<void> => {
            try {
                await server.stop({ timeout: 1000 })
            }
            catch (err: unknown) {
                this.log.write("error", `service: stop failed: ${err instanceof Error ? err.message : String(err)}`)
            }
            await usage.stop()
            Service.clearPort(ctx.svc)
            process.exit(0)
        }

        /*  listen to HTTP/REST endpoints  */
        server.route({
            method:  "OPTIONS",
            path:    "/",
            handler: (_request, h) => {
                return h.response({ ase: true, projectId: ctx.projectId }).code(200)
            }
        })
        server.route({
            method:  "POST",
            path:    "/stop",
            handler: (request, h) => {
                /*  require a JSON content type, as browsers cannot send it cross-origin
                    without a CORS preflight (which this service never grants)  */
                const ct = ((request.headers["content-type"] as string | undefined) ?? "").toLowerCase()
                if (!ct.startsWith("application/json"))
                    return h.response({ error: "unsupported media type" }).code(415)
                this.log.write("info", "service: stop requested")
                setImmediate(stopService)
                return h.response({ ok: true }).code(200)
            }
        })
        const mcpHandler = async (request: Hapi.Request, h: Hapi.ResponseToolkit, body?: unknown) => {
            const { method: bMethod, info: bodyInfo } = ServiceCommand.mcpBodyInfo(body)

            /*  log tool calls regularly, but all remaining MCP traffic
                (session handshakes, notifications, SSE stream opens) at
                debug level only, as it carries no diagnostic value  */
            const level = bMethod === "tools/call" ? "info" : "debug"
            this.log.write(level, `mcp: ${request.method.toUpperCase()} ${request.path}${bodyInfo}`)
            const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
            const mcp       = ServiceCommand.buildMcpServer(this.log, ctx, startTime, usage)
            request.raw.res.on("close", () => {
                /*  "h.abandon" (see below) bypasses "onPreResponse",
                    so undo the "onRequest" accounting here instead  */
                inFlight     = Math.max(0, inFlight - 1)
                lastActivity = Date.now()
                transport.close().catch(() => {})
                mcp.close().catch(() => {})
            })
            try {
                await mcp.connect(transport)
                await transport.handleRequest(request.raw.req, request.raw.res, body)
            }
            catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err)
                this.log.write("error", `mcp: ${message}`)
                if (!request.raw.res.headersSent) {
                    request.raw.res.statusCode = 500
                    request.raw.res.end()
                }
            }
            return h.abandon
        }
        server.route({
            method:  "POST",
            path:    "/mcp",
            options: { payload: { parse: true, allow: "application/json" } },
            handler: (request, h) => mcpHandler(request, h, request.payload)
        })
        server.route({
            method:  [ "GET", "DELETE" ],
            path:    "/mcp",
            handler: (request, h) => mcpHandler(request, h)
        })
        server.route({
            method:  "POST",
            path:    "/command",
            options: { payload: { parse: true, allow: "application/json" } },
            handler: (request, h) => {
                const payload = request.payload as { command?: unknown } | null
                if (!payload || typeof payload.command !== "string")
                    return h.response({ error: "missing or invalid 'command' field" }).code(400)
                const cmd = payload.command
                if (cmd === "ping")
                    return h.response({ ok: true, pong: true }).code(200)
                if (cmd === "status")
                    return h.response({
                        ok:        true,
                        projectId: ctx.projectId,
                        port:      ctx.port,
                        uptimeMs:  Date.now() - startTime
                    }).code(200)
                return h.response({ error: "unknown command", command: cmd }).code(400)
            }
        })

        /*  listen to the endpoints of the AI usage accounting  */
        ServiceCommand.registerUsageRoutes(server, usage)

        /*  serve the web board of the project (imported dynamically to keep it out of all
            other CLI commands; its rendering dependencies marked, MRCS, and ELK load on
            first request only, its board core dependencies at service startup)  */
        const { registerBoardRoutes } = await import("./ase-task-board-web-server.js")
        registerBoardRoutes(server, this.log)

        /*  start service  */
        try {
            await server.start()
            Service.persistPort(ctx.svc, ctx.port)
            this.log.write("info", `service: listening on port ${ctx.port}`)
            usage.start()
        }
        catch (err: unknown) {
            const e = err as Error & { code?: string }
            if (e.code === "EADDRINUSE") {
                /*  race-loser re-probe: another "ase service start" won the race  */
                const match = await probe(ctx.port, ctx.projectId).catch(() => null)
                if (match === true)
                    process.exit(0)
                this.log.write("error", `service: port ${ctx.port} in use, but not responding!`)
                Service.clearPort(ctx.svc)
                process.exit(1)
            }
            this.log.write("error", `service: ${e.message}`)
            process.exit(1)
        }

        /*  stop service in the foreground on termination signal  */
        if (foreground) {
            const shutdown = async (signal: string) => {
                if (stopping)
                    return
                stopping = true
                this.log.write("info", `service: received ${signal}, stopping`)
                await stopService()
            }
            process.on("SIGTERM", () => shutdown("SIGTERM"))
            process.on("SIGINT",  () => shutdown("SIGINT"))
            process.on("SIGHUP",  () => shutdown("SIGHUP"))
            process.on("SIGQUIT", () => shutdown("SIGQUIT"))
            return
        }

        /*  stop service after idle timeout  */
        setInterval(async () => {
            if (stopping)
                return
            if (inFlight > 0)
                return

            /*  never idle out while holding usage windows, as their sessions keep on reporting  */
            if (usage.active())
                return
            if (Date.now() - lastActivity > IDLE_MS) {
                stopping = true
                this.log.write("info", "service: idle timeout reached, stopping")
                await stopService()
            }
        }, TICK_MS).unref()
    }

    /*  allocate the service port, preferring the configured one, else falling back to a random one  */
    private async allocatePort (ctx: Context): Promise<number> {
        const port = await Daemon.allocatePort(ctx.portPref)
        if (ctx.portPref !== null && port !== ctx.portPref)
            this.log.write("warning", `service: preferred port ${ctx.portPref} unavailable, falling back to port ${port}`)
        return port
    }

    /*  start flow: ensure port, probe, optionally detach (or run in the foreground)  */
    private async doStart (opts: { foreground?: boolean } = {}): Promise<number> {
        const ctx = this.loadContext()
        let port = ctx.port
        if (process.env[SERVE_ENV] === "1") {
            /*  adopt the log level of the spawning process, as the
                detached service is started without any CLI options  */
            const level = process.env[LEVEL_ENV]
            if (level !== undefined && isLogLevel(level))
                this.log.logLevel(level)
            const raw = process.env[PORT_ENV]
            port = raw !== undefined ? Number(raw) : await Daemon.allocatePort()
            await this.runService({ ...ctx, port })
            return await new Promise<number>(() => { /*  never resolves  */ })
        }
        if (port !== null) {
            const match = await probe(port, ctx.projectId).catch(() => null)
            if (match === true) {
                if (opts.foreground)
                    throw new Error(`service: already running on port ${port} (stop it first with "ase service stop")`)
                this.log.write("info", `service: already running on port ${port}`)
                return 0
            }
        }

        /*  run the service in the foreground, logging to the terminal and without idle timeout  */
        if (opts.foreground) {
            port = await this.allocatePort(ctx)
            await this.runService({ ...ctx, port }, true)
            return await new Promise<number>(() => { /*  never resolves  */ })
        }

        /*  bounded retry across the bind/start TOCTOU window: on each attempt
            re-allocate, re-spawn; early-break on foreign listener  */
        let lastErr: Error = new Error("service failed to start within timeout")
        for (let attempt = 0; attempt < 3; attempt++) {
            port = await this.allocatePort(ctx)
            const { child, logFile } = Service.spawnDetached(ctx.aseDir, port, this.log.logLevel())
            let exited   = false
            let exitCode: number | null = null
            let resolveExit: () => void = () => {}
            const exitPromise = new Promise<void>((resolve) => {
                resolveExit = resolve
            })
            const onExit = (code: number | null) => {
                exited   = true
                exitCode = code
                resolveExit()
            }
            child.once("exit", onExit)
            let foreign = false
            let success = false
            try {
                for (let i = 0; i < 50; i++) {
                    await new Promise((resolve) => setTimeout(resolve, 100))
                    if (exited)
                        break
                    const s = await probe(port, ctx.projectId).catch(() => null)
                    if (s === true) {
                        this.log.write("info", `service: started on port ${port}`)
                        child.unref()
                        success = true
                        return 0
                    }
                    if (s === false) {
                        foreign = true
                        break
                    }
                }
                const tail   = Daemon.readLogTail(logFile, 20)
                const reason = exited ?
                    `service exited during startup (code ${exitCode})` :
                    foreign ?
                        `service lost port ${port} race to a foreign listener` :
                        "service failed to start within timeout"
                const detail = tail.length > 0 ? `\n---- ${logFile} (tail) ----\n${tail}` : ""
                lastErr = new Error(`${reason}${detail}`)
            }
            finally {
                if (!success && !exited) {
                    child.kill("SIGTERM")
                    await Promise.race([
                        exitPromise,
                        new Promise<void>((resolve) => setTimeout(resolve, 1000))
                    ])
                    if (!exited) {
                        child.kill("SIGKILL")
                        await Promise.race([
                            exitPromise,
                            new Promise<void>((resolve) => setTimeout(resolve, 2000))
                        ])
                        child.unref()
                    }
                }
                child.removeListener("exit", onExit)
                if (!success)
                    Service.clearPort(ctx.svc)
            }
        }
        throw lastErr
    }

    /*  build the JSON "POST" request options for a service endpoint  */
    private postRequest (body: Record<string, unknown>, timeoutMs: number) {
        return {
            method:              "POST" as const,
            headers:             { "Content-Type": "application/json" },
            body,
            signal:              AbortSignal.timeout(timeoutMs),
            ignoreResponseError: true
        }
    }

    /*  status flow: report whether the service is running  */
    private async doStatus (): Promise<number> {
        const ctx = this.loadContext()
        if (ctx.port === null) {
            process.stdout.write("service: not running (no port configured)\n")
            return 1
        }
        const match = await probe(ctx.port, ctx.projectId).catch(() => null)
        if (match === true) {
            const r = await ofetch.raw(`http://${HOST}:${ctx.port}/command`,
                this.postRequest({ command: "status" }, 2000))
            const d        = r._data as { uptimeMs?: number } | null
            const uptimeMs = typeof d?.uptimeMs === "number" ? d.uptimeMs : 0
            const uptime   = prettyMs(uptimeMs, { verbose: true })
            process.stdout.write(`service: running on port ${ctx.port} (uptime: ${uptime})\n`)
            return 0
        }
        if (match === false) {
            process.stdout.write(`service: not running (port ${ctx.port} in use by foreign service)\n`)
            return 1
        }
        process.stdout.write(`service: not running (port ${ctx.port} not responding)\n`)
        return 1
    }

    /*  send command: POST /command with the arbitrary cmd token  */
    private async doSend (cmd: string): Promise<number> {
        let ctx = this.loadContext()
        if (ctx.port === null || await probe(ctx.port, ctx.projectId).catch(() => null) !== true) {
            /*  auto-start the service once, then re-check  */
            await this.doStart()
            ctx = this.loadContext()
            if (ctx.port === null)
                throw new Error("service not running (no port configured after auto-start)")
            if (await probe(ctx.port, ctx.projectId).catch(() => null) !== true)
                throw new Error(`service not responding on port ${ctx.port} after auto-start`)
        }
        const r = await ofetch.raw(`http://${HOST}:${ctx.port}/command`,
            { ...this.postRequest({ command: cmd }, 5000), responseType: "text" })
        const body = typeof r._data === "string" ? r._data : JSON.stringify(r._data)
        process.stdout.write(body)
        if (!body.endsWith("\n"))
            process.stdout.write("\n")
        return r.status >= 200 && r.status < 300 ? 0 : 1
    }

    /*  log flow: show the (tail of the) log file and optionally follow it  */
    private async doLog (opts: { follow?: boolean, lines?: string }): Promise<number> {
        const ctx = this.loadContext()
        return Daemon.showLog(path.join(ctx.aseDir, "service.log"), opts)
    }

    /*  stop flow: no-op if no port configured or connection refused  */
    private async doStop (): Promise<number> {
        const ctx = this.loadContext()
        if (ctx.port === null) {
            this.log.write("info", "service: not running (no port configured)")
            return 0
        }
        const match = await probe(ctx.port, ctx.projectId).catch(() => null)
        if (match === false) {
            this.log.write("info", `service: not running (port ${ctx.port} in use by foreign service)`)
            return 1
        }
        if (match === null) {
            this.log.write("info", `service: not running (port ${ctx.port} not responding)`)
            Service.clearPort(ctx.svc)
            return 0
        }
        const r = await ofetch.raw(`http://${HOST}:${ctx.port}/stop`, this.postRequest({}, 5000))
        const ok = r.status >= 200 && r.status < 300
        Service.clearPort(ctx.svc)
        return ok ? 0 : 1
    }

    /*  register commands  */
    register (program: Command): void {
        /*  register CLI top-level command "ase service"  */
        const service = program
            .command("service")
            .description("Manage per-project background HTTP service")
            .action(() => {
                service.outputHelp()
                process.exit(1)
            })

        /*  register CLI sub-command "ase service start"  */
        service
            .command("start")
            .description("Start the background service (or run it in the foreground)")
            .option("-f, --foreground", "run the service in the foreground, logging to the terminal, " +
                "until it is interrupted or stopped (without idle timeout)")
            .action(async (opts: { foreground?: boolean }) => {
                process.exit(await this.doStart(opts))
            })

        /*  register CLI sub-command "ase service status"  */
        service
            .command("status")
            .description("Report whether the background service is running")
            .action(async () => {
                process.exit(await this.doStatus())
            })

        /*  register CLI sub-command "ase service send"  */
        service
            .command("send")
            .description("Send a command to the background service")
            .argument("<cmd>", "Command token to dispatch to the service")
            .action(async (cmd: string) => {
                process.exit(await this.doSend(cmd))
            })

        /*  register CLI sub-command "ase service log"  */
        service
            .command("log")
            .description("Show the log of the background service")
            .option("-f, --follow", "keep following the log for newly appended lines")
            .option("-n, --lines <n>", "show the last <n> lines only (default: all, or 10 with --follow)")
            .action(async (opts: { follow?: boolean, lines?: string }) => {
                process.exit(await this.doLog(opts))
            })

        /*  register CLI sub-command "ase service stop"  */
        service
            .command("stop")
            .description("Stop the background service")
            .action(async () => {
                process.exit(await this.doStop())
            })
    }
}
