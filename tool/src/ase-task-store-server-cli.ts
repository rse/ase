/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import path                       from "node:path"
import fs                         from "node:fs"
import crypto                     from "node:crypto"
import os                         from "node:os"
import { fileURLToPath }          from "node:url"
import { spawn }                  from "node:child_process"
import type { ChildProcess }      from "node:child_process"

import { Command }                from "commander"
import { ofetch }                 from "ofetch"
import { Agent }                  from "undici"
import { isMap, isSeq, isScalar } from "yaml"
import * as v                     from "valibot"

import { Config, parseScope }     from "./ase-config.js"
import type Log                   from "./ase-util-log.js"
import { isLogLevel }             from "./ase-util-log.js"
import { Service }                from "./ase-service.js"
import * as Delegate              from "./ase-task-store-plugin-delegate.js"
import * as Server                from "./ase-task-store-server-bind.js"

/*  schema for the per-user "store.yaml"  */
export const storeSchema = v.nullish(v.strictObject({
    address: v.optional(v.string()),
    port:    v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(65535))),
    token:   v.optional(v.string()),
    pid:     v.optional(v.pipe(v.number(), v.integer())),
    cors:    v.optional(v.array(v.string())),
    tls:     v.optional(v.strictObject({
        cert:    v.optional(v.string()),
        key:     v.optional(v.string())
    })),
    storage: v.optional(v.strictObject({
        plugin:  v.optional(v.string()),
        options: v.optional(v.record(v.string(), v.unknown()))
    }))
}))

/*  the environment variables handing the configuration to the
    detached server process (and "ASE_TASK_STORE_TOKEN" also serving as
    the user-facing token override)  */
const SERVE_ENV   = "ASE_TASK_STORE_SERVE"
const ADDRESS_ENV = "ASE_TASK_STORE_ADDRESS"
const PORT_ENV    = "ASE_TASK_STORE_PORT"
const CORS_ENV    = "ASE_TASK_STORE_CORS"
const MODULE_ENV  = "ASE_TASK_STORE_MODULE"
const BASEDIR_ENV = "ASE_TASK_STORE_BASEDIR"
const SOLO_ENV    = "ASE_TASK_STORE_SOLO"
const LEVEL_ENV   = "ASE_TASK_STORE_LOG_LEVEL"
const TOKEN_ENV   = "ASE_TASK_STORE_TOKEN"
const CERT_ENV    = "ASE_TASK_STORE_TLS_CERT"
const KEY_ENV     = "ASE_TASK_STORE_TLS_KEY"

/*  the defaults  */
const DEFAULT_ADDRESS = "127.0.0.1"

/*  the dispatcher of the host-local probe, skipping the certificate verification,
    as a certificate rarely covers a loopback or local interface address  */
const probeAgent = new Agent({ connect: { rejectUnauthorized: false } })

/*  whether an address is a loopback one  */
const isLoopback = (address: string): boolean =>
    /^(?:127(?:\.\d{1,3}){3}|::1|localhost)$/i.test(address)

/*  whether an address belongs to this host (loopback or a local network interface)  */
const isLocal = (address: string): boolean =>
    isLoopback(address) || Object.values(os.networkInterfaces())
        .some((ifaces) => (ifaces ?? []).some((iface) => iface.address === address))

/*  the resolved "store.yaml" context  */
type StoreContext = {
    cfg:     Config
    dir:     string
    address: string | null
    port:    number | null
    token:   string | null
    pid:     number | null
    tlsCert: string | null
    tlsKey:  string | null
    plugin:  string | null
    options: Record<string, unknown>
}

/*  the outcome of probing the server  */
type ProbeResult = "running" | "unauthorized" | "foreign" | null

/*  the URL host to connect to for a bound address  */
const connectHost = (address: string): string =>
    (address === "0.0.0.0" || address === "") ? DEFAULT_ADDRESS :
        address === "::" ? "[::1]" : Server.urlHost(address)

/*  the options of "ase task store start"  */
type StartOptions = {
    address?: string
    port?:    string
    token?:   string
    cors:     string[]
    module?:  string
    basedir?: string
    solo?:    boolean
    tlsCert?: string
    tlsKey?:  string
}

/*  CLI command group "ase task store"  */
export default class TaskStoreCommand {
    constructor (private log: Log) {}

    /*  load the per-user "store.yaml" into the context  */
    private loadContext (): StoreContext {
        const cfg = new Config("store", storeSchema, this.log, parseScope("user"))
        cfg.read()
        const scalar = (key: string): string | number | null => {
            const val = cfg.get(key)
            if (val === undefined || val === null)
                return null
            const raw = isScalar(val) ? val.value : val
            return typeof raw === "number" ? raw : String(raw)
        }
        const address = scalar("address")
        const port    = scalar("port")
        const token   = scalar("token")
        const pid     = scalar("pid")
        const tlsCert = scalar("tls.cert")
        const tlsKey  = scalar("tls.key")
        const plugin  = scalar("storage.plugin")
        const opts    = cfg.get("storage.options")
        const dir     = path.dirname(cfg.filename)
        return {
            cfg,
            dir,
            address: address !== null ? String(address) : null,
            port:    typeof port === "number" ? port : null,
            token:   token !== null ? String(token) : null,
            pid:     typeof pid === "number" ? pid : null,
            tlsCert: tlsCert !== null ? path.resolve(dir, String(tlsCert)) : null,
            tlsKey:  tlsKey  !== null ? path.resolve(dir, String(tlsKey))  : null,
            plugin:  plugin !== null ? String(plugin) : null,
            options: isMap(opts) ? (opts.toJSON() as Record<string, unknown>) : {}
        }
    }

    /*  read the configured CORS origins  */
    private configuredCors (cfg: Config): string[] {
        const val = cfg.get("cors")
        return isSeq(val) ? (val.toJSON() as unknown[]).map((item) => String(item)) : []
    }

    /*  persist the runtime facts of the running server  */
    private persist (cfg: Config, values: Record<string, string | number | boolean | string[] | null>): void {
        cfg.lock(() => {
            cfg.read()
            for (const [ key, value ] of Object.entries(values))
                if (value !== null)
                    cfg.set(key, value)
                else if (cfg.get(key) !== undefined)
                    cfg.delete(key)
            cfg.write()
            fs.chmodSync(cfg.filename, 0o600)
        })
    }

    /*  probe the server by listing its projects: first unauthenticated,
        to identify it by its problem details response before handing the
        token to a possibly foreign service holding the port, and then
        with the token to verify the token is accepted  */
    private async probe (address: string, port: number, token: string | null, tls: boolean): Promise<ProbeResult> {
        const host    = connectHost(address)
        const url     = `${tls ? "https" : "http"}://${host}:${port}/projects`

        /*  skip the certificate verification for host-local addresses only,
            as elsewhere a man-in-the-middle could capture the token  */
        const lax     = isLocal(host.replace(/^\[|\]$/g, ""))
        const request = (auth: string | null) => ofetch.raw(url, {
            method:              "GET",
            headers:             auth !== null ? { Authorization: `Bearer ${auth}` } : {},
            dispatcher:          lax ? probeAgent : undefined,
            signal:              AbortSignal.timeout(2000),
            ignoreResponseError: true
        })
        try {
            const r0 = await request(null)
            if (r0.status !== 401 || !(r0.headers.get("content-type") ?? "").startsWith("application/problem+json"))
                return "foreign"
            if (token === null)
                return "unauthorized"
            const r = await request(token)
            if (r.status === 401)
                return "unauthorized"
            const d = r._data as { projects?: unknown } | null
            if (r.status === 200 && Array.isArray(d?.projects))
                return "running"
            return "foreign"
        }
        catch {
            /*  treat an unreachable or unresponsive server as not running  */
            return null
        }
    }

    /*  server-side: load the storage plugin, run the server, and
        persist its runtime facts until a termination signal arrives  */
    private async runServer (ctx: StoreContext): Promise<never> {
        const level = process.env[LEVEL_ENV]
        if (level !== undefined && isLogLevel(level))
            this.log.logLevel(level)
        const address = process.env[ADDRESS_ENV] ?? ctx.address ?? DEFAULT_ADDRESS
        const port    = Number(process.env[PORT_ENV] ?? ctx.port ?? 0)
        const token   = process.env[TOKEN_ENV] ?? ctx.token
        const cors    = process.env[CORS_ENV] !== undefined ?
            process.env[CORS_ENV].split(",").map((s) => s.trim()).filter((s) => s !== "") :
            this.configuredCors(ctx.cfg)
        const module  = (process.env[MODULE_ENV] ?? ctx.plugin) || null
        const tlsCert = (process.env[CERT_ENV] ?? ctx.tlsCert) || null
        const tlsKey  = (process.env[KEY_ENV] ?? ctx.tlsKey) || null
        if (!Number.isInteger(port) || port < 1)
            throw new Error("task store: no valid port configured")
        if (token === null || token === "")
            throw new Error("task store: no token configured")

        /*  the built-in plugin additionally takes its base directory
            (default: "tasks" below the per-user config dir) and "solo"
            mode ("--solo" or "--no-solo") from the command line,
            persisted for subsequent starts  */
        const options = { ...ctx.options }
        const storage: Record<string, string | boolean | null> = {}
        if (module === null || module === Delegate.BUILTIN_PLUGIN) {
            options.basedir = typeof options.basedir === "string" && options.basedir !== "" ?
                path.resolve(ctx.dir, options.basedir) : path.join(ctx.dir, "tasks")
            if (process.env[BASEDIR_ENV] !== undefined && process.env[BASEDIR_ENV] !== "")
                options.basedir = storage["storage.options.basedir"] = process.env[BASEDIR_ENV]
            if (process.env[SOLO_ENV] === "1")
                options.solo = storage["storage.options.solo"] = true
            else if (process.env[SOLO_ENV] === "0") {
                options.solo = false
                storage["storage.options.solo"] = null
            }
        }
        const plugin = await Delegate.loadTaskStoragePlugin(module, {
            options,
            log:     (level, message) => this.log.write(level, `task store: plugin "${module ?? Delegate.BUILTIN_PLUGIN}": ${message}`)
        })
        const tls = tlsCert !== null && tlsKey !== null ?
            { cert: fs.readFileSync(tlsCert), key: fs.readFileSync(tlsKey) } : null
        const server = new Server.TaskStoreServer(this.log, {
            address, port, token, cors, tls,
            store: new Delegate.TaskStore(plugin)
        })
        await server.start()
        this.persist(ctx.cfg, {
            address, port, token, pid: process.pid, "tls.cert": tlsCert, "tls.key": tlsKey,
            cors: cors.length > 0 ? cors : null,
            "storage.plugin": module,
            ...storage
        })
        let stopping = false
        const shutdown = (signal: string) => {
            if (stopping)
                return
            stopping = true
            this.log.write("info", `task store: received ${signal}, stopping`)
            server.stop()
                .catch((err: unknown) => {
                    const message = err instanceof Error ? err.message : String(err)
                    this.log.write("error", `task store: stop failed: ${message}`)
                })
                .finally(() => {
                    this.persist(ctx.cfg, { pid: null })
                    process.exit(0)
                })
        }
        process.on("SIGTERM", () => shutdown("SIGTERM"))
        process.on("SIGINT",  () => shutdown("SIGINT"))
        return new Promise<never>(() => { /*  never resolves  */ })
    }

    /*  determine the explicitly given options deviating from the configuration of the running server  */
    private deviatingOptions (ctx: StoreContext, opts: StartOptions, current: string): string[] {
        const module  = ctx.plugin || Delegate.BUILTIN_PLUGIN
        const basedir = typeof ctx.options.basedir === "string" && ctx.options.basedir !== "" ?
            path.resolve(ctx.dir, ctx.options.basedir) : path.join(ctx.dir, "tasks")
        const cors    = this.configuredCors(ctx.cfg)
        const solo    = ctx.options.solo === true
        return [
            opts.address !== undefined && opts.address !== current                            ? "--address"   : "",
            opts.port    !== undefined && Number(opts.port) !== ctx.port                      ? "--port"      : "",
            opts.token   !== undefined && opts.token !== ctx.token                            ? "--token"     : "",
            opts.cors.length > 0       && opts.cors.join(",") !== cors.join(",")              ? "--cors"      : "",
            opts.module  !== undefined && (opts.module || Delegate.BUILTIN_PLUGIN) !== module ? "--module"    : "",
            opts.basedir !== undefined && path.resolve(opts.basedir) !== basedir              ? "--basedir"   : "",
            opts.solo    !== undefined && opts.solo !== solo                                  ? "--[no-]solo" : "",
            opts.tlsCert !== undefined && path.resolve(opts.tlsCert) !== ctx.tlsCert          ? "--tls-cert"  : "",
            opts.tlsKey  !== undefined && path.resolve(opts.tlsKey)  !== ctx.tlsKey           ? "--tls-key"   : ""
        ].filter((option) => option !== "")
    }

    /*  wait for the detached server to respond, else terminate it and fail with the tail of its log  */
    private async awaitStartup (child: ChildProcess, logFile: string, address: string, port: number, token: string, tls: boolean, module: string): Promise<number> {
        let exited = false
        let exitCode: number | null = null
        let probed: ProbeResult = null
        child.once("exit", (code) => {
            exited   = true
            exitCode = code
        })
        for (let i = 0; i < 100; i++) {
            await new Promise((resolve) => setTimeout(resolve, 100))
            if (exited)
                break
            const state = await this.probe(address, port, token, tls)
            if (state === "running") {
                this.log.write("info", `task store: started on ${tls ? "https" : "http"}://${Server.urlHost(address)}:${port} (storage plugin "${module}")`)
                child.unref()
                return 0
            }
            if (state === "foreign" || state === "unauthorized") {
                probed = state
                break
            }
        }
        if (!exited) {
            child.kill("SIGTERM")
            child.unref()
        }
        const tail   = Service.readLogTail(logFile, 20)
        const reason = exited ?
            `task store: server exited during startup (code ${exitCode})` :
            probed === "foreign" ?
                `task store: port ${port} taken by a foreign service during startup` :
                probed === "unauthorized" ?
                    `task store: server on port ${port} rejects the token` :
                    "task store: server failed to respond within timeout"
        throw new Error(tail.length > 0 ? `${reason}\n---- ${logFile} (tail) ----\n${tail}` : reason)
    }

    /*  start flow: resolve the configuration, probe, and detach  */
    private async doStart (opts: StartOptions): Promise<number> {
        const ctx = this.loadContext()
        if (process.env[SERVE_ENV] === "1")
            return this.runServer(ctx)

        /*  idempotent start: an already running server is left alone,
            or restarted if explicitly given options deviate from its configuration  */
        const address = opts.address ?? ctx.address ?? DEFAULT_ADDRESS
        let foreign = false
        if (ctx.port !== null) {
            const current = ctx.address ?? DEFAULT_ADDRESS
            const tls     = ctx.tlsCert !== null
            const state   = await this.probe(current, ctx.port, ctx.token, tls)
            if (state === "running" || state === "unauthorized") {
                const changed = this.deviatingOptions(ctx, opts, current)
                const url     = `${tls ? "https" : "http"}://${Server.urlHost(current)}:${ctx.port}`
                if (changed.length === 0) {
                    if (state === "unauthorized")
                        throw new Error(`task store: already running on ${url}, but the configured token is rejected`)
                    this.log.write("info", `task store: already running on ${url}`)
                    return 0
                }

                /*  restart the server to apply the deviating options  */
                this.log.write("info", `task store: already running on ${url}, ` +
                    `restarting to apply deviating ${changed.join(", ")}`)
                await this.doStop()
            }
            else
                foreign = state === "foreign"
        }

        /*  resolve the TLS certificate and key (both or none), checked
            for readability to fail before detaching the server  */
        const tlsCert = opts.tlsCert !== undefined ? path.resolve(opts.tlsCert) : ctx.tlsCert
        const tlsKey  = opts.tlsKey  !== undefined ? path.resolve(opts.tlsKey)  : ctx.tlsKey
        if ((tlsCert === null) !== (tlsKey === null))
            throw new Error("task store: TLS requires both a certificate (\"--tls-cert\") and a key (\"--tls-key\")")
        for (const file of [ tlsCert, tlsKey ])
            if (file !== null)
                fs.accessSync(file, fs.constants.R_OK)

        /*  warn about plain HTTP on a non-loopback address, as the
            bearer token then travels unencrypted over the network  */
        if (tlsCert === null && !isLoopback(address))
            this.log.write("warning", `task store: binding to non-loopback address "${address}" without TLS ` +
                "(consider \"--tls-cert\" and \"--tls-key\", or a TLS reverse proxy)")

        /*  resolve port, token, CORS origins, and storage plugin  */
        let port = ctx.port
        if (opts.port !== undefined) {
            port = Number(opts.port)
            if (!Number.isInteger(port) || port < 1 || port > 65535)
                throw new Error(`task store: invalid port "${opts.port}"`)
        }
        else if (port === null || foreign) {
            /*  re-allocate a configured port held by a foreign service  */
            if (foreign)
                this.log.write("warning", `task store: configured port ${port} in use by foreign service, re-allocating`)
            port = await Service.allocatePort()
        }
        let token = opts.token ?? process.env[TOKEN_ENV] ?? ctx.token
        if (token === undefined || token === null || token === "")
            token = crypto.randomBytes(24).toString("hex")
        const cors   = opts.cors.length > 0 ? opts.cors : this.configuredCors(ctx.cfg)
        const module = (opts.module ?? ctx.plugin) || Delegate.BUILTIN_PLUGIN

        /*  spawn the server detached, logging into "store.log"  */
        fs.mkdirSync(ctx.dir, { recursive: true })
        const logFile = path.join(ctx.dir, "store.log")
        Service.trimLog(logFile)
        const fd    = fs.openSync(logFile, "a")
        const entry = fileURLToPath(new URL("./ase.js", import.meta.url))
        const child = spawn(process.execPath, [ entry, "task", "store", "start" ], {
            detached: true,
            env: {
                ...process.env,
                [SERVE_ENV]:   "1",
                [ADDRESS_ENV]: address,
                [PORT_ENV]:    String(port),
                [TOKEN_ENV]:   token,
                [CORS_ENV]:    cors.join(","),
                [MODULE_ENV]:  module,
                [BASEDIR_ENV]: opts.basedir !== undefined ? path.resolve(opts.basedir) : "",
                [SOLO_ENV]:    opts.solo === true ? "1" : opts.solo === false ? "0" : "",
                [CERT_ENV]:    tlsCert ?? "",
                [KEY_ENV]:     tlsKey ?? "",
                [LEVEL_ENV]:   this.log.logLevel()
            },
            stdio: [ "ignore", fd, fd ]
        })
        fs.closeSync(fd)

        /*  wait for the server to respond  */
        return this.awaitStartup(child, logFile, address, port, token, tlsCert !== null, module)
    }

    /*  status flow: report whether the server is running  */
    private async doStatus (): Promise<number> {
        const ctx = this.loadContext()
        if (ctx.port === null) {
            process.stdout.write("task store: not running (no port configured)\n")
            return 1
        }
        const address = ctx.address ?? DEFAULT_ADDRESS
        const scheme  = ctx.tlsCert !== null ? "https" : "http"
        const state   = await this.probe(address, ctx.port, ctx.token, ctx.tlsCert !== null)
        if (state === "running") {
            process.stdout.write(`task store: running on ${scheme}://${Server.urlHost(address)}:${ctx.port}` +
                (ctx.pid !== null ? ` (pid ${ctx.pid})` : "") + "\n")
            return 0
        }
        if (state === "unauthorized") {
            process.stdout.write(`task store: running on ${scheme}://${Server.urlHost(address)}:${ctx.port}, but the configured token is rejected\n`)
            return 1
        }
        if (state === "foreign") {
            process.stdout.write(`task store: not running (port ${ctx.port} in use by foreign service)\n`)
            return 1
        }
        process.stdout.write(`task store: not running (port ${ctx.port} not responding)\n`)
        return 1
    }

    /*  check whether a process is still alive  */
    private isAlive (pid: number): boolean {
        try {
            process.kill(pid, 0)
            return true
        }
        catch (err: unknown) {
            return (err as Error & { code?: string }).code === "EPERM"
        }
    }

    /*  stop flow: terminate the server process and wait until it is gone  */
    private async doStop (): Promise<number> {
        const ctx = this.loadContext()
        if (ctx.pid === null && ctx.port === null) {
            this.log.write("info", "task store: not running (no server configured)")
            return 0
        }
        const address = ctx.address ?? DEFAULT_ADDRESS

        /*  probe first, as a stale process id might meanwhile belong to a foreign process  */
        const state   = ctx.port !== null ? await this.probe(address, ctx.port, ctx.token, ctx.tlsCert !== null) : null
        const running = state === "running" || state === "unauthorized"
        if (ctx.pid === null || !running) {
            if (running)
                throw new Error(`task store: running on port ${ctx.port}, but its process id is unknown`)
            this.log.write("info", "task store: not running")
            this.persist(ctx.cfg, { pid: null })
            return 0
        }
        try {
            process.kill(ctx.pid, "SIGTERM")
        }
        catch (err: unknown) {
            const e = err as Error & { code?: string }
            if (e.code !== "ESRCH")
                throw err
            this.log.write("info", `task store: not running (process ${ctx.pid} already gone)`)
            this.persist(ctx.cfg, { pid: null })
            return 0
        }
        for (let i = 0; i < 50; i++) {
            await new Promise((resolve) => setTimeout(resolve, 100))
            if (!this.isAlive(ctx.pid)) {
                this.log.write("info", `task store: stopped (process ${ctx.pid})`)
                this.persist(ctx.cfg, { pid: null })
                return 0
            }
        }
        throw new Error(`task store: process ${ctx.pid} did not stop within timeout`)
    }

    /*  register commands  */
    register (task: Command): void {
        /*  register CLI sub-command group "ase task store"  */
        const store = task
            .command("store")
            .description("Manage the per-user task store REST API server")
            .action(() => {
                store.outputHelp()
                process.exit(1)
            })

        /*  register CLI sub-command "ase task store start"  */
        store
            .command("start")
            .description("Start the task store server in the background (idempotent if already running)")
            .option("-a, --address <host>", `address to bind to (default: ${DEFAULT_ADDRESS}, or the configured one)`)
            .option("-p, --port <port>", "port to bind to (default: the configured one, else allocated randomly)")
            .option("-t, --token <token>", "bearer token to expect (default: $ASE_TASK_STORE_TOKEN, the configured one, " +
                "else generated)")
            .option("-c, --cors <origin>", "allow cross-origin browser requests from <origin> " +
                "(repeatable, \"*\" for any origin; default: the configured ones)",
            (value: string, previous: string[]) => [ ...previous, value ], [] as string[])
            .option("-m, --module <name>", "storage plugin to load: \"ase\" for the built-in one, else the NPM " +
                "package \"ase-task-store-<name>\" (default: the configured \"storage.plugin\", else \"ase\")")
            .option("-d, --basedir <dir>", "base directory of the built-in storage plugin " +
                "(default: the configured \"storage.options.basedir\", else \"tasks\" below the per-user config dir)")
            .option("-s, --solo", "let the built-in storage plugin store a single project flat in the base " +
                "directory, accepting any project id (default: the configured \"storage.options.solo\", " +
                "else one sub-directory per project)")
            .option("--no-solo", "let the built-in storage plugin store one sub-directory per project, " +
                "resetting a configured \"storage.options.solo\"")
            .option("--tls-cert <file>", "serve HTTPS with the PEM certificate (chain) in <file>, requires \"--tls-key\" " +
                "(default: the configured \"tls.cert\", else plain HTTP)")
            .option("--tls-key <file>", "serve HTTPS with the PEM private key in <file>, requires \"--tls-cert\" " +
                "(default: the configured \"tls.key\")")
            .action(async (opts: StartOptions) => {
                process.exit(await this.doStart(opts))
            })

        /*  register CLI sub-command "ase task store status"  */
        store
            .command("status")
            .description("Report whether the task store server is running")
            .action(async () => {
                process.exit(await this.doStatus())
            })

        /*  register CLI sub-command "ase task store stop"  */
        store
            .command("stop")
            .description("Stop the task store server")
            .action(async () => {
                process.exit(await this.doStop())
            })
    }
}

