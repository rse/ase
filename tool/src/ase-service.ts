/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under GPL 3.0 <https://spdx.org/licenses/GPL-3.0-only>
*/

import path                   from "node:path"
import fs                     from "node:fs"
import net                    from "node:net"
import { fileURLToPath }      from "node:url"
import { spawn }              from "node:child_process"
import type { ChildProcess }  from "node:child_process"

import { Command }            from "commander"
import Hapi                   from "@hapi/hapi"
import axios                  from "axios"
import type { AxiosError }    from "axios"
import { isMap }              from "yaml"
import prettyMs               from "pretty-ms"
import * as v                 from "valibot"

import { McpServer }                     from "@modelcontextprotocol/sdk/server/mcp.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"

import { Config, configSchema }          from "./ase-config.js"
import type Log                          from "./ase-log.js"
import { DiagramMCP }                    from "./ase-diagram.js"
import { TaskMCP }                       from "./ase-task.js"
import { KVMCP }                         from "./ase-kv.js"
import PersonaMCP                        from "./ase-persona.js"
import { TimestampMCP }                  from "./ase-timestamp.js"
import pkg                               from "../package.json" with { type: "json" }

/*  shared service host  */
export const SERVICE_HOST = "127.0.0.1"
const HOST = SERVICE_HOST

/*  schema for ".ase/service.yaml"  */
export const serviceSchema = v.nullish(v.strictObject({
    port: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1024), v.maxValue(65535)))
}))

/*  distinguish ECONNREFUSED from other Axios transport errors  */
export const isConnRefused = (err: unknown): boolean => {
    const e = err as AxiosError & { code?: string, cause?: { code?: string } }
    return e?.code === "ECONNREFUSED" || e?.cause?.code === "ECONNREFUSED"
}

/*  probe the service and verify ASE identity banner  */
export const probe = async (port: number, projectId: string): Promise<boolean | null> => {
    try {
        const r = await axios.request({
            method:         "OPTIONS",
            url:            `http://${SERVICE_HOST}:${port}/`,
            timeout:        2000,
            validateStatus: () => true
        })
        if (r.status < 200 || r.status >= 300)
            return false
        const d = r.data as { ase?: boolean, projectId?: string } | null
        return d?.ase === true && d?.projectId === projectId
    }
    catch (err: unknown) {
        if (isConnRefused(err))
            return null
        throw err
    }
}

interface Context {
    projectId: string
    port:      number | null
    svc:       Config
    aseDir:    string
}

const SERVE_ENV  = "ASE_SERVICE_SERVE"
const PORT_ENV   = "ASE_SERVICE_PORT"
const IDLE_MS    = 30 * 60 * 1000
const TICK_MS    = 60 * 1000
const PORT_MIN   = 42000
const PORT_MAX   = 44000
const PORT_TRIES = 20

/*  reusable functionality: port allocation, persistence, and process spawning  */
export class Service {
    /*  try binding a single candidate port to verify availability  */
    static tryBind (port: number): Promise<boolean> {
        return new Promise((resolve) => {
            const s = net.createServer()
            s.once("error", () => {
                resolve(false)
            })
            s.once("listening", () => {
                s.close(() => resolve(true))
            })
            s.listen(port, HOST)
        })
    }

    /*  allocate a fresh random port in PORT_MIN..PORT_MAX  */
    static async allocatePort (): Promise<number> {
        for (let i = 0; i < PORT_TRIES; i++) {
            const p = PORT_MIN + Math.floor(Math.random() * (PORT_MAX - PORT_MIN + 1))
            if (await Service.tryBind(p))
                return p
        }
        throw new Error(`failed to allocate a port in ${PORT_MIN}..${PORT_MAX} after ${PORT_TRIES} attempts`)
    }

    /*  persist an allocated port into ".ase/service.yaml"  */
    static persistPort (svc: Config, port: number): void {
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
    static spawnDetached (aseDir: string, port: number): { child: ChildProcess, logFile: string } {
        fs.mkdirSync(aseDir, { recursive: true })
        const logFile = path.join(aseDir, "service.log")
        const fd      = fs.openSync(logFile, "a")
        const entry   = fileURLToPath(new URL("./ase.js", import.meta.url))
        const child   = spawn(process.execPath, [ entry, "service", "start" ], {
            detached: true,
            env:      { ...process.env, [SERVE_ENV]: "1", [PORT_ENV]: String(port) },
            stdio:    [ "ignore", fd, fd ]
        })
        fs.closeSync(fd)
        return { child, logFile }
    }

    /*  read the last N non-empty lines of a log file for diagnostics  */
    static readLogTail (logFile: string, lines: number): string {
        let fd: number | null = null
        try {
            fd = fs.openSync(logFile, "r")
            const size  = fs.fstatSync(fd).size
            const CHUNK = 8192
            const buf   = Buffer.alloc(CHUNK)
            let pos     = size
            let tail    = ""
            let count   = 0
            while (pos > 0 && count <= lines) {
                const n = Math.min(CHUNK, pos)
                pos -= n
                fs.readSync(fd, buf, 0, n, pos)
                tail  = buf.toString("utf8", 0, n) + tail
                count = 0
                for (let i = 0; i < tail.length; i++)
                    if (tail.charCodeAt(i) === 10) count++
            }
            const all = tail.split("\n").filter((l) => l.length > 0)
            return all.slice(-lines).join("\n")
        }
        catch {
            return ""
        }
        finally {
            if (fd !== null)
                fs.closeSync(fd)
        }
    }
}

/*  MCP registration entry point for service-identity tools  */
export class ServiceMCP {
    constructor (private ctx: { projectId: string, port: number, startTime: number }) {}

    register (mcp: McpServer): void {
        mcp.registerTool("ping", {
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
        /*  load files  */
        const cfg = new Config("config", configSchema, this.log)
        cfg.read()
        const svc = new Config("service", serviceSchema, this.log)
        svc.read()

        /*  determine project id  */
        const rawId     = cfg.get("project.id") as string | null | undefined
        const projectId = rawId ?? path.basename(process.cwd())

        /*  determine service port  */
        const rawPort = svc.get("port") as number | null | undefined
        const port: number | null = rawPort ?? null

        /*  determine path to ".ase" directory  */
        const aseDir = path.dirname(svc.filename)

        /*  return context information  */
        return {
            projectId,
            port,
            svc,
            aseDir
        }
    }

    /*  service-side: bind HAPI server until "/stop" command is received or idle timeout happens  */
    private async runService (ctx: Context & { port: number }): Promise<void> {
        /*  establish HAPI HTTP/REST service  */
        const server = Hapi.server({ host: HOST, port: ctx.port })

        /*  track start time and last activity  */
        const startTime  = Date.now()
        let lastActivity = Date.now()
        let inFlight     = 0
        let stopping     = false
        server.ext("onRequest", (_request, h) => {
            inFlight++
            lastActivity = Date.now()
            return h.continue
        })
        server.ext("onPreResponse", (_request, h) => {
            inFlight     = Math.max(0, inFlight - 1)
            lastActivity = Date.now()
            return h.continue
        })

        /*  build a fresh MCP server instance with all registered tools  */
        const buildMcpServer = (): McpServer => {
            const mcp = new McpServer({ name: "ase", version: pkg.version })
            new ServiceMCP({ projectId: ctx.projectId, port: ctx.port, startTime }).register(mcp)
            new DiagramMCP().register(mcp)
            new TaskMCP(this.log).register(mcp)
            new KVMCP().register(mcp)
            new PersonaMCP(this.log).register(mcp)
            new TimestampMCP().register(mcp)
            return mcp
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
            method:  "GET",
            path:    "/stop",
            handler: (_request, h) => {
                this.log.write("info", "service: stop requested")
                setImmediate(async () => {
                    await server.stop({ timeout: 1000 })
                    process.exit(0)
                })
                return h.response({ ok: true }).code(200)
            }
        })
        const mcpHandler = async (request: Hapi.Request, h: Hapi.ResponseToolkit, body?: unknown) => {
            const b       = body as Record<string, unknown> | null | undefined
            const bParams = b?.params as Record<string, unknown> | null | undefined
            const bMethod = typeof b?.method    === "string" ? b.method         : null
            const bName   = typeof bParams?.name === "string" ? bParams.name    : null
            const bArgs   = bParams?.arguments  !== undefined ? bParams.arguments : null
            let bodyInfo  = ""
            if (bMethod !== null) {
                bodyInfo = ` [${bMethod}]`
                if (bName !== null) {
                    bodyInfo += ` ${bName}`
                    if (bArgs !== null)
                        bodyInfo += ` ${JSON.stringify(bArgs)}`
                }
            }
            this.log.write("info", `mcp: ${request.method.toUpperCase()} ${request.path}${bodyInfo}`)
            const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
            const mcp       = buildMcpServer()
            request.raw.res.on("close", () => {
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

        /*  start service  */
        try {
            await server.start()
            Service.persistPort(ctx.svc, ctx.port)
            this.log.write("info", `service: listening on port ${ctx.port}`)
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

        /*  stop service after idle timeout  */
        setInterval(async () => {
            if (stopping)
                return
            if (inFlight > 0)
                return
            if (Date.now() - lastActivity > IDLE_MS) {
                stopping = true
                this.log.write("info", "service: idle timeout reached, stopping")
                try {
                    await server.stop({ timeout: 1000 })
                    Service.clearPort(ctx.svc)
                    process.exit(0)
                }
                catch (err: unknown) {
                    const e = err as Error
                    this.log.write("error", `service: stop failed: ${e.message}`)
                    Service.clearPort(ctx.svc)
                    process.exit(1)
                }
            }
        }, TICK_MS).unref()
    }

    /*  start flow: ensure port, probe, optionally detach  */
    private async doStart (): Promise<number> {
        const ctx = this.loadContext()
        let port = ctx.port
        if (process.env[SERVE_ENV] === "1") {
            const raw = process.env[PORT_ENV]
            port = raw !== undefined ? Number(raw) : await Service.allocatePort()
            await this.runService({ ...ctx, port })
            return await new Promise<number>(() => { /*  never resolves  */ })
        }
        if (port !== null) {
            const match = await probe(port, ctx.projectId)
            if (match === true) {
                this.log.write("info", `service: already running on port ${port}`)
                return 0
            }
        }
        /*  bounded retry across the bind/start TOCTOU window: on each attempt
            re-allocate, re-persist, re-spawn; early-break on foreign listener  */
        let lastErr: Error = new Error("service failed to start within timeout")
        for (let attempt = 0; attempt < 3; attempt++) {
            port = await Service.allocatePort()
            const { child, logFile } = Service.spawnDetached(ctx.aseDir, port)
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
                    const s = await probe(port, ctx.projectId)
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
                const tail   = Service.readLogTail(logFile, 20)
                const reason = exited ?
                    `service exited during startup (code ${exitCode})` :
                    foreign ?
                        `service lost port ${port} race to a foreign listener` :
                        "service failed to start within timeout"
                const detail = tail.length > 0 ? `\n---- ${logFile} (tail) ----\n${tail}` : ""
                lastErr = new Error(`${reason}${detail}`)
            }
            finally {
                child.removeListener("exit", onExit)
                if (!success && !exited) {
                    child.kill("SIGTERM")
                    await Promise.race([
                        exitPromise,
                        new Promise<void>((resolve) => setTimeout(resolve, 1000))
                    ])
                    if (!exited) {
                        child.kill("SIGKILL")
                        await exitPromise
                    }
                }
            }
        }
        Service.clearPort(ctx.svc)
        throw lastErr
    }

    /*  status flow: report whether the service is running  */
    private async doStatus (): Promise<number> {
        const ctx = this.loadContext()
        if (ctx.port === null) {
            process.stdout.write("service: not running (no port configured)\n")
            return 1
        }
        const match = await probe(ctx.port, ctx.projectId)
        if (match === true) {
            const r = await axios.request({
                method:         "POST",
                url:            `http://${HOST}:${ctx.port}/command`,
                headers:        { "Content-Type": "application/json" },
                data:           { command: "status" },
                timeout:        2000,
                validateStatus: () => true
            })
            const d        = r.data as { uptimeMs?: number } | null
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
        if (ctx.port === null) {
            await this.doStart()
            ctx = this.loadContext()
            if (ctx.port === null)
                throw new Error("service not running (no port configured after auto-start)")
        }
        const match = await probe(ctx.port, ctx.projectId)
        if (match !== true) {
            await this.doStart()
            ctx = this.loadContext()
            if (ctx.port === null)
                throw new Error("service not running (no port configured after auto-start)")
        }
        const r = await axios.request({
            method:            "POST",
            url:               `http://${HOST}:${ctx.port}/command`,
            headers:           { "Content-Type": "application/json" },
            data:              { command: cmd },
            timeout:           5000,
            validateStatus:    () => true,
            responseType:      "text",
            transformResponse: [ (x) => x ]
        })
        const body = typeof r.data === "string" ? r.data : JSON.stringify(r.data)
        process.stdout.write(body)
        if (!body.endsWith("\n"))
            process.stdout.write("\n")
        return r.status >= 200 && r.status < 300 ? 0 : 1
    }

    /*  stop flow: no-op if no port configured or connection refused  */
    private async doStop (): Promise<number> {
        const ctx = this.loadContext()
        if (ctx.port === null) {
            this.log.write("info", "service: not running (no port configured)")
            return 0
        }
        const match = await probe(ctx.port, ctx.projectId)
        if (match === false) {
            this.log.write("info", `service: not running (port ${ctx.port} in use by foreign service)`)
            return 1
        }
        if (match === null) {
            this.log.write("info", `service: not running (port ${ctx.port} not responding)`)
            Service.clearPort(ctx.svc)
            return 0
        }
        const r  = await axios.request({
            method:         "GET",
            url:            `http://${HOST}:${ctx.port}/stop`,
            timeout:        5000,
            validateStatus: () => true
        })
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
            .description("Start the background service")
            .action(async () => {
                process.exit(await this.doStart())
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

        /*  register CLI sub-command "ase service stop"  */
        service
            .command("stop")
            .description("Stop the background service")
            .action(async () => {
                process.exit(await this.doStop())
            })
    }
}
