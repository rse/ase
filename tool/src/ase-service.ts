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
import { isMap, isScalar }    from "yaml"
import * as v                 from "valibot"
import prettyMs               from "pretty-ms"

import { McpServer }                     from "@modelcontextprotocol/sdk/server/mcp.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { z }                             from "zod"

import { Config, configSchema, parseScope } from "./ase-config.js"
import type Log                 from "./ase-log.js"
import {
    renderDiagram,
    detectTermWidth,
    detectTermHeight
}                               from "./ase-diagram.js"
import { taskLoad, taskSave, taskDelete, taskList } from "./ase-task.js"
import pkg                      from "../package.json" with { type: "json" }

interface Context {
    projectId: string
    port:      number | null
    svc:       Config
    aseDir:    string
}

const SERVE_ENV  = "ASE_SERVICE_SERVE"
const PORT_ENV   = "ASE_SERVICE_PORT"
const HOST       = "127.0.0.1"
const IDLE_MS    = 30 * 60 * 1000
const TICK_MS    = 60 * 1000
const PORT_MIN   = 42000
const PORT_MAX   = 44000
const PORT_TRIES = 20

/*  schema for ".ase/service.yaml"  */
const serviceSchema = v.nullish(v.strictObject({
    port: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1024), v.maxValue(65535)))
}))

/*  try binding a single candidate port to verify availability  */
const tryBind = (port: number): Promise<boolean> => {
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
const allocatePort = async (): Promise<number> => {
    for (let i = 0; i < PORT_TRIES; i++) {
        const p = PORT_MIN + Math.floor(Math.random() * (PORT_MAX - PORT_MIN + 1))
        if (await tryBind(p))
            return p
    }
    throw new Error(`failed to allocate a port in ${PORT_MIN}..${PORT_MAX} after ${PORT_TRIES} attempts`)
}

/*  persist an allocated port into ".ase/service.yaml"  */
const persistPort = (svc: Config, port: number): void => {
    svc.set("port", port)
    svc.write()
}

/*  clear the persisted port and remove ".ase/service.yaml" if it is empty  */
const clearPort = (svc: Config): void => {
    svc.delete("port")
    const root  = svc.get()
    const empty = root === undefined || root === null || (isMap(root) && root.items.length === 0)
    if (empty) {
        if (fs.existsSync(svc.filename))
            fs.rmSync(svc.filename)
    }
    else
        svc.write()
}

/*  distinguish ECONNREFUSED from other Axios transport errors  */
const isConnRefused = (err: unknown): boolean => {
    const e = err as AxiosError & { code?: string, cause?: { code?: string } }
    return e?.code === "ECONNREFUSED" || e?.cause?.code === "ECONNREFUSED"
}

/*  probe the service and verify ASE identity banner  */
const probe = async (port: number, projectId: string): Promise<boolean | null> => {
    try {
        const r = await axios.request({
            method:         "OPTIONS",
            url:            `http://${HOST}:${port}/`,
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

/*  spawn the current executable detached as a background service  */
const spawnDetached = (aseDir: string, port: number): { child: ChildProcess, logFile: string } => {
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
const readLogTail = (logFile: string, lines: number): string => {
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
        let stopping     = false
        server.ext("onRequest", (_request, h) => {
            lastActivity = Date.now()
            return h.continue
        })

        /*  build a fresh MCP server instance with the demo "ping" tool  */
        const buildMcpServer = (): McpServer => {
            const mcp = new McpServer({ name: "ase", version: pkg.version })
            mcp.registerTool("ping", {
                title:       "ASE service ping",
                description: "Return ASE service identity, port, and uptime.",
                inputSchema: {}
            }, async () => {
                const status = {
                    ok:        true,
                    projectId: ctx.projectId,
                    port:      ctx.port,
                    uptimeMs:  Date.now() - startTime
                }
                return {
                    content: [ { type: "text", text: JSON.stringify(status) } ]
                }
            })
            mcp.registerTool("diagram", {
                title:       "ASE diagram render",
                description:
                    "Render a Mermaid diagram as Unicode/ASCII art. " +
                    "Use for visualizing " +
                    "structure/layout/components/dependencies as a Flowchart, " +
                    "control-flow/branching/concurrency as a Flowchart, " +
                    "state-machine/states/transitions as an UML State Diagram, " +
                    "data-flow/actors/messages/protocols as an UML Sequence Diagram, " +
                    "data-structure/classes/methods as an UML Class Diagram " +
                    "data-model/entities/relationships as an ER Diagram, or " +
                    "metrics/distributions/time-series as a XY-Charts. " +
                    "Pass the Mermaid diagram specification as `diagram`. " +
                    "Returns the rendered art as `text`.",
                inputSchema: {
                    diagram: z.string()
                        .describe("Mermaid diagram specification"),
                    ascii: z.boolean().default(false)
                        .describe("emit plain ASCII (+-|) instead of Unicode box-drawing characters"),
                    colorMode: z.enum([ "none", "ansi16", "ansi256" ]).default("none")
                        .describe("color mode for ANSI escape sequences in the rendered output"),
                    nodeMarginX: z.number().int().min(0).default(3)
                        .describe("horizontal margin between nodes, in characters"),
                    nodeMarginY: z.number().int().min(0).default(3)
                        .describe("vertical margin between nodes, in lines"),
                    nodePadding: z.number().int().min(0).default(1)
                        .describe("inner horizontal and vertical padding within each node, in characters"),
                    diagramClipX: z.number().int().min(0).default(0)
                        .describe("extra horizontal clipping: subtract this many characters from `terminalWidth`"),
                    diagramClipY: z.number().int().min(0).default(0)
                        .describe("extra vertical clipping: subtract this many lines from `terminalHeight`"),
                    terminalWidth: z.number().int().min(0).default(detectTermWidth())
                        .describe("terminal width in characters; 0 disables horizontal clipping; defaults to ASE_TERM_WIDTH env var if set"),
                    terminalHeight: z.number().int().min(0).default(detectTermHeight())
                        .describe("terminal height in lines; 0 disables vertical clipping; defaults to ASE_TERM_HEIGHT env var if set")
                }
            }, async (args) => {
                try {
                    const out = renderDiagram(args.diagram, {
                        ascii:          args.ascii,
                        colorMode:      args.colorMode,
                        nodeMarginX:    args.nodeMarginX,
                        nodeMarginY:    args.nodeMarginY,
                        nodePadding:    args.nodePadding,
                        diagramClipX:   args.diagramClipX,
                        diagramClipY:   args.diagramClipY,
                        terminalWidth:  args.terminalWidth,
                        terminalHeight: args.terminalHeight
                    })
                    return {
                        content: [ { type: "text", text: out } ]
                    }
                }
                catch (err: unknown) {
                    const message = err instanceof Error ? err.message : String(err)
                    return {
                        isError: true,
                        content: [ { type: "text", text: `diagram: render failed: ${message}` } ]
                    }
                }
            })
            mcp.registerTool("task_list", {
                title:       "ASE task list",
                description:
                    "List all persisted task `id`s. " +
                    "Returns the ids as `text`, one per line, in lexicographic order; " +
                    "returns an empty string if no tasks exist.",
                inputSchema: {}
            }, async () => {
                try {
                    const ids = taskList()
                    return {
                        content: [ { type: "text", text: ids.join("\n") } ]
                    }
                }
                catch (err: unknown) {
                    const message = err instanceof Error ? err.message : String(err)
                    return {
                        isError: true,
                        content: [ { type: "text", text: `task_list: ERROR: ${message}` } ]
                    }
                }
            })
            mcp.registerTool("task_load", {
                title:       "ASE task load",
                description:
                    "Load a previously persisted task by `id`. " +
                    "Returns the task as `text`; returns an empty string if no task exists for the `id`.",
                inputSchema: {
                    id: z.string()
                        .describe("task identifier (allowed characters: A-Z, a-z, 0-9, '-')")
                }
            }, async (args) => {
                try {
                    const text = taskLoad(args.id)
                    return {
                        content: [ { type: "text", text } ]
                    }
                }
                catch (err: unknown) {
                    const message = err instanceof Error ? err.message : String(err)
                    return {
                        isError: true,
                        content: [ { type: "text", text: `task_load: ERROR: ${message}` } ]
                    }
                }
            })
            mcp.registerTool("task_save", {
                title:       "ASE task save",
                description:
                    "Persist a task as `text` under `id`. " +
                    "Overwrites any existing task for the same `id`.",
                inputSchema: {
                    id: z.string()
                        .describe("task identifier (allowed characters: A-Z, a-z, 0-9, '-')"),
                    text: z.string()
                        .describe("text content of the task")
                }
            }, async (args) => {
                try {
                    taskSave(args.id, args.text)
                    return {
                        content: [ { type: "text", text: `task_save: OK: saved task "${args.id}"` } ]
                    }
                }
                catch (err: unknown) {
                    const message = err instanceof Error ? err.message : String(err)
                    return {
                        isError: true,
                        content: [ { type: "text", text: `task_save: FAILED: ${message}` } ]
                    }
                }
            })
            mcp.registerTool("task_delete", {
                title:       "ASE task delete",
                description:
                    "Delete a previously persisted task by `id`. " +
                    "Returns a status `text` indicating whether a task existed and was removed.",
                inputSchema: {
                    id: z.string()
                        .describe("task identifier (allowed characters: A-Z, a-z, 0-9, '-')")
                }
            }, async (args) => {
                try {
                    const removed = taskDelete(args.id)
                    const msg     = removed ?
                        `task_delete: OK: removed task "${args.id}"` :
                        `task_delete: WARNING: no task "${args.id}" to remove`
                    return {
                        content: [ { type: "text", text: msg } ]
                    }
                }
                catch (err: unknown) {
                    const message = err instanceof Error ? err.message : String(err)
                    return {
                        isError: true,
                        content: [ { type: "text", text: `task_delete: ERROR: ${message}` } ]
                    }
                }
            })
            mcp.registerTool("persona", {
                title:       "ASE persona style get/set",
                description:
                    "Get or set the active ASE agent persona `style`. " +
                    "If `style` is provided, it sets the persona style, " +
                    "otherwise it returns the current persona `style`. " +
                    "If `session` is provided, the operation is scoped to that session, " +
                    "otherwise it operates on the broadest scope (user/project cascade). " +
                    "Allowed styles: \"writer\" (decorative, eloquent, explaining), " +
                    "\"engineer\" (brief, factual, accurate), " +
                    "\"telegrapher\" (very brief, factual, abbreviating), " +
                    "\"caveman\" (ultra brief, rough, stuttering).",
                inputSchema: {
                    style: z.enum([ "writer", "engineer", "telegrapher", "caveman" ]).optional()
                        .describe("persona style to set; if omitted, the current persona style is returned"),
                    session: z.string().optional()
                        .describe("session identifier (allowed characters: A-Z, a-z, 0-9, '-'); " +
                            "if omitted, the operation is not scoped to a specific session")
                }
            }, async (args) => {
                try {
                    const scope = args.session !== undefined ?
                        parseScope(`session:${args.session}`) :
                        parseScope(undefined)
                    const cfg = new Config("config", configSchema, this.log, scope)
                    cfg.read()
                    if (args.style !== undefined) {
                        cfg.set("agent.persona", args.style)
                        cfg.write()
                        const where = args.session !== undefined ?
                            ` for session "${args.session}"` : ""
                        const msg = `persona: OK: set agent.persona to "${args.style}"${where}`
                        return {
                            content: [ { type: "text", text: msg } ]
                        }
                    }
                    const val = cfg.get("agent.persona")
                    if (val === undefined)
                        return {
                            content: [ { type: "text", text: "" } ]
                        }
                    const text = String(isScalar(val) ? val.value : val)
                    return {
                        content: [ { type: "text", text } ]
                    }
                }
                catch (err: unknown) {
                    const message = err instanceof Error ? err.message : String(err)
                    return {
                        isError: true,
                        content: [ { type: "text", text: `persona: ERROR: ${message}` } ]
                    }
                }
            })
            mcp.registerTool("task_id", {
                title:       "ASE task id get/set",
                description:
                    "Get or set the active ASE task `id` for a given `session`. " +
                    "If `id` is provided, it set the task id in the given `session`, " +
                    "otherwise it returns the current task `id` of the `session`.",
                inputSchema: {
                    id: z.string().optional()
                        .describe("task identifier to set (allowed characters: A-Z, a-z, 0-9, '-'); " +
                            "if omitted, the current task id is returned"),
                    session: z.string()
                        .describe("session identifier (allowed characters: A-Z, a-z, 0-9, '-')")
                }
            }, async (args) => {
                try {
                    const scope = parseScope(`session:${args.session}`)
                    const cfg = new Config("config", configSchema, this.log, scope)
                    cfg.read()
                    if (args.id !== undefined) {
                        cfg.set("agent.task", args.id)
                        cfg.write()
                        const msg = `task_id: OK: set agent.task to "${args.id}" ` +
                            `for session "${args.session}"`
                        return {
                            content: [ { type: "text", text: msg } ]
                        }
                    }
                    const val = cfg.get("agent.task")
                    if (val === undefined)
                        return {
                            content: [ { type: "text", text: "" } ]
                        }
                    const text = String(isScalar(val) ? val.value : val)
                    return {
                        content: [ { type: "text", text } ]
                    }
                }
                catch (err: unknown) {
                    const message = err instanceof Error ? err.message : String(err)
                    return {
                        isError: true,
                        content: [ { type: "text", text: `task_id: ERROR: ${message}` } ]
                    }
                }
            })
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
                setImmediate(async () => {
                    await server.stop({ timeout: 1000 })
                    process.exit(0)
                })
                return h.response({ ok: true }).code(200)
            }
        })
        const mcpHandler = async (request: Hapi.Request, h: Hapi.ResponseToolkit, body?: unknown) => {
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
            catch (_err: unknown) {
                const err = _err instanceof Error ? _err : new Error(String(_err))
                this.log.write("error", `mcp: ${err.message}`)
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
            persistPort(ctx.svc, ctx.port)
        }
        catch (err: unknown) {
            const e = err as Error & { code?: string }
            if (e.code === "EADDRINUSE") {
                /*  race-loser re-probe: another "ase service start" won the race  */
                const match = await probe(ctx.port, ctx.projectId).catch(() => null)
                if (match === true)
                    process.exit(0)
                this.log.write("error", `service: port ${ctx.port} in use, but not responding!`)
                clearPort(ctx.svc)
                process.exit(1)
            }
            this.log.write("error", `service: ${e.message}`)
            process.exit(1)
        }

        /*  stop service after idle timeout  */
        setInterval(async () => {
            if (stopping)
                return
            if (Date.now() - lastActivity > IDLE_MS) {
                stopping = true
                try {
                    await server.stop({ timeout: 1000 })
                    clearPort(ctx.svc)
                    process.exit(0)
                }
                catch (err: unknown) {
                    const e = err as Error
                    this.log.write("error", `service: stop failed: ${e.message}`)
                    clearPort(ctx.svc)
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
            port = raw !== undefined ? Number(raw) : await allocatePort()
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
            port = await allocatePort()
            const { child, logFile } = spawnDetached(ctx.aseDir, port)
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
                const tail   = readLogTail(logFile, 20)
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
        clearPort(ctx.svc)
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
            clearPort(ctx.svc)
            return 0
        }
        const r  = await axios.request({
            method:         "GET",
            url:            `http://${HOST}:${ctx.port}/stop`,
            timeout:        5000,
            validateStatus: () => true
        })
        const ok = r.status >= 200 && r.status < 300
        clearPort(ctx.svc)
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
