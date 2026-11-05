/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import path                       from "node:path"
import fs                         from "node:fs"
import crypto                     from "node:crypto"
import os                         from "node:os"
import type { ChildProcess }      from "node:child_process"

import type { Command }           from "commander"
import { isSeq, isScalar }        from "yaml"
import type * as v                from "valibot"

import { Config }                 from "./ase-config-core.js"
import { parseScope }             from "./ase-config-scope.js"
import { isLogLevel }             from "./ase-lib-log.js"
import { writeStdout }            from "./ase-lib-stdio.js"
import { dispatchFetch, insecureAgent } from "./ase-lib-fetch.js"
import { Daemon, DaemonCommand }  from "./ase-lib-daemon-cli.js"
import { urlHost, isLoopback, serverHeader } from "./ase-lib-server-bind.js"
import type { ServerConfig }      from "./ase-lib-server-bind.js"

/*  the defaults  */
export const DEFAULT_ADDRESS = "127.0.0.1"

/*  the dispatcher of the host-local probe, skipping the certificate verification,
    as a certificate rarely covers a loopback or local interface address  */
const probeAgent = insecureAgent()

/*  whether an address belongs to this host (loopback or a local network interface)  */
export const isLocal = (address: string): boolean =>
    isLoopback(address) || Object.values(os.networkInterfaces())
        .some((ifaces) => (ifaces ?? []).some((iface) => iface.address === address))

/*  the URL host to connect to for a bound address  */
export const connectHost = (address: string): string =>
    (address === "0.0.0.0" || address === "") ? DEFAULT_ADDRESS :
        address === "::" ? "[::1]" : urlHost(address)

/*  the TLS certificate and key of a server configured in the configuration <cfg>:
    "<prefix>.crt" and "<prefix>.key" (each resolved against the directory of the
    configuration file defining it), unless "<prefix>.url" selects HTTP via "ase://"
    on this host (as the clients following it would then fail)  */
export const configuredTls = (cfg: Config, prefix: string): { cert: string | null, key: string | null } => {
    const scoped = (key: string): { value: string, filename: string } | null => {
        const entry = cfg.getScoped(key)
        if (entry === undefined)
            return null
        return { value: String(isScalar(entry.value) ? entry.value.value : entry.value), filename: entry.filename }
    }
    const url = scoped(`${prefix}.url`)
    if (url !== null && url.value.startsWith("ase://")) {
        try {
            if (isLocal(new URL(url.value).hostname.replace(/^\[|\]$/g, "")))
                return { cert: null, key: null }
        }
        catch {
            /*  an invalid URL is reported by its users  */
        }
    }
    const file = (key: string): string | null => {
        const entry = scoped(key)
        return entry !== null ? path.resolve(path.dirname(entry.filename), entry.value) : null
    }
    return { cert: file(`${prefix}.crt`), key: file(`${prefix}.key`) }
}

/*  the resolved common part of the per-user configuration context of a server  */
export type ServerContext = {
    cfg:     Config
    dir:     string
    address: string | null
    port:    number | null
    token:   string | null
    pid:     number | null
    tlsCert: string | null
    tlsKey:  string | null
}

/*  the common options of the "start" command of a server  */
export type ServerStartOptions = {
    address?:    string
    port?:       string
    token?:      string
    cors:        string[]
    tlsCert?:    string
    tlsKey?:     string
    foreground?: boolean
}

/*  the resolved common configuration of a server to run (see the binding)  */
export type { ServerConfig }

/*  a server to run  */
export type ServerInstance = {
    start (): Promise<void>
    stop  (): Promise<void>
}

/*  the runtime facts of a server to persist  */
export type ServerFacts = Record<string, string | number | boolean | string[] | null>

/*  the outcome of probing the server  */
type ProbeResult = "running" | "unauthorized" | "foreign" | null

/*  the CLI command group managing a per-user, bearer token authenticated REST API server
    (the task store and the agent relay server) in the background or in the foreground:
    it resolves the configuration of the server from its per-user configuration file,
    the command line, and the environment, probes, spawns, and stops the server, and persists
    its runtime facts, where the concrete server command decides on its specific parts  */
export abstract class ServerCommand<C extends ServerContext, O extends ServerStartOptions> extends DaemonCommand {
    /*  the name of its per-user configuration and log file (e.g. "store"), the schema of its
        configuration file, the prefix of its environment variables (e.g. "ASE_TASK_STORE"),
        and its endpoint listing the projects to probe it with (e.g. "/projects")  */
    protected abstract readonly name:        string
    protected abstract readonly schema:      v.GenericSchema
    protected abstract readonly prefix:      string
    protected abstract readonly probePath:   string

    /*  extend the common context by the specific configuration of the server, read via <scalar>  */
    protected abstract context (ctx: ServerContext, scalar: (key: string) => string | number | null): C

    /*  create the server from its common configuration and its specific configuration (from
        the context <ctx>, overridden by the environment <env>), returning it with its specific
        runtime facts to persist  */
    protected abstract create (ctx: C, config: ServerConfig, env: NodeJS.ProcessEnv): Promise<{ server: ServerInstance, facts: ServerFacts }>

    /*  the specific options of the "start" command, the explicitly given ones of them deviating
        from the configuration of the running server, the environment variables handing them to
        the server process, and the description of the started server (e.g. its storage plugin)  */
    protected options (_cmd: Command): void {}
    protected deviating (_ctx: C, _opts: O): string[] {
        return []
    }
    protected environment (_ctx: C, _opts: O): NodeJS.ProcessEnv {
        return {}
    }
    protected started (_env: NodeJS.ProcessEnv): string {
        return ""
    }

    /*  the TLS certificate and key of the server configured outside its per-user configuration
        file (e.g. in the project configuration), applied like the options "--tls-cert" and
        "--tls-key" if these are not given  */
    protected tlsDefaults (): { cert: string | null, key: string | null } {
        return { cert: null, key: null }
    }

    /*  the description of the running server in the status (e.g. a co-hosted agent relay)  */
    protected running (_ctx: C): string {
        return ""
    }

    /*  the name of an environment variable handing the configuration to the
        server process (where the token one also serves as the user-facing token override)  */
    protected env (name: string): string {
        return `${this.prefix}_${name}`
    }

    /*  load the per-user configuration file into the context  */
    private loadContext (): C {
        const cfg = new Config(this.name, this.schema, this.log, parseScope("user"))
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
        const dir     = path.dirname(cfg.filename)
        return this.context({
            cfg,
            dir,
            address: address !== null ? String(address) : null,
            port:    typeof port === "number" ? port : null,
            token:   token !== null ? String(token) : null,
            pid:     typeof pid === "number" ? pid : null,
            tlsCert: tlsCert !== null ? path.resolve(dir, String(tlsCert)) : null,
            tlsKey:  tlsKey  !== null ? path.resolve(dir, String(tlsKey))  : null
        }, scalar)
    }

    /*  read the configured CORS origins  */
    private configuredCors (cfg: Config): string[] {
        const val = cfg.get("cors")
        return isSeq(val) ? (val.toJSON() as unknown[]).map((item) => String(item)) : []
    }

    /*  persist the runtime facts of the running server  */
    private persist (cfg: Config, values: ServerFacts): void {
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
        to identify it by its problem details response (and by its server
        header, if any, telling the other servers sharing the same range of
        ports apart) before handing the token to a possibly foreign service
        holding the port, and then with the token to verify the token is accepted  */
    private async probe (address: string, port: number, token: string | null, tls: boolean): Promise<ProbeResult> {
        const host    = connectHost(address)
        const url     = `${tls ? "https" : "http"}://${host}:${port}${this.probePath}`

        /*  skip the certificate verification for host-local addresses only,
            as elsewhere a man-in-the-middle could capture the token  */
        const lax     = isLocal(host.replace(/^\[|\]$/g, ""))
        const request = (auth: string | null) => dispatchFetch.raw(url, {
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
            const server = r0.headers.get(serverHeader)
            if (server !== null && server !== this.label)
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
        catch (err: unknown) {
            /*  treat an unreachable or unresponsive server as not running  */
            let cause = err
            while (cause instanceof Error && cause.cause instanceof Error)
                cause = cause.cause
            this.log.write("debug", `${this.label}: probe of ${url} failed: ${cause instanceof Error ? cause.message : String(cause)}`)
            return null
        }
    }

    /*  server-side: run the server and persist its runtime facts until a termination signal arrives
        (configured through the environment of either the detached or the foreground process)  */
    private async runServer (ctx: C, env: NodeJS.ProcessEnv = process.env): Promise<never> {
        const level = env[this.env("LOG_LEVEL")]
        if (level !== undefined && isLogLevel(level))
            this.log.logLevel(level)
        const address = env[this.env("ADDRESS")] ?? ctx.address ?? DEFAULT_ADDRESS
        const port    = Number(env[this.env("PORT")] ?? ctx.port ?? 0)
        const token   = env[this.env("TOKEN")] ?? ctx.token
        const corsEnv = env[this.env("CORS")]
        const cors    = corsEnv !== undefined ?
            corsEnv.split(",").map((s) => s.trim()).filter((s) => s !== "") :
            this.configuredCors(ctx.cfg)
        const tlsCert = (env[this.env("TLS_CERT")] ?? ctx.tlsCert) || null
        const tlsKey  = (env[this.env("TLS_KEY")] ?? ctx.tlsKey) || null
        if (!Number.isInteger(port) || port < 1)
            throw new Error(`${this.label}: no valid port configured`)
        if (token === null || token === "")
            throw new Error(`${this.label}: no token configured`)
        const tls = tlsCert !== null && tlsKey !== null ?
            { cert: fs.readFileSync(tlsCert), key: fs.readFileSync(tlsKey) } : null
        const { server, facts } = await this.create(ctx, { address, port, token, cors, tls }, env)
        await server.start()
        this.persist(ctx.cfg, {
            address, port, token, pid: process.pid, "tls.cert": tlsCert, "tls.key": tlsKey,
            cors: cors.length > 0 ? cors : null,
            ...facts
        })
        let stopping = false
        const shutdown = (signal: string) => {
            if (stopping)
                return
            stopping = true
            this.log.write("info", `${this.label}: interrupted (received ${signal})`)
            server.stop()
                .catch((err: unknown) => {
                    const message = err instanceof Error ? err.message : String(err)
                    this.log.write("error", `${this.label}: stop failed: ${message}`)
                })
                .finally(() => {
                    try {
                        this.persist(ctx.cfg, { pid: null })
                    }
                    finally {
                        process.exit(0)
                    }
                })
        }
        process.on("SIGTERM", () => shutdown("SIGTERM"))
        process.on("SIGINT",  () => shutdown("SIGINT"))
        process.on("SIGHUP",  () => shutdown("SIGHUP"))
        process.on("SIGQUIT", () => shutdown("SIGQUIT"))
        return new Promise<never>(() => { /*  never resolves  */ })
    }

    /*  determine the explicitly given options deviating from the configuration of the running server  */
    private deviatingOptions (ctx: C, opts: O, current: string): string[] {
        const cors = this.configuredCors(ctx.cfg)
        return [
            opts.address !== undefined && opts.address !== current                   ? "--address"  : "",
            opts.port    !== undefined && Number(opts.port) !== ctx.port             ? "--port"     : "",
            opts.token   !== undefined && opts.token !== ctx.token                   ? "--token"    : "",
            opts.cors.length > 0       && opts.cors.join(",") !== cors.join(",")     ? "--cors"     : "",
            opts.tlsCert !== undefined && path.resolve(opts.tlsCert) !== ctx.tlsCert ? "--tls-cert" : "",
            opts.tlsKey  !== undefined && path.resolve(opts.tlsKey)  !== ctx.tlsKey  ? "--tls-key"  : "",
            ...this.deviating(ctx, opts)
        ].filter((option) => option !== "")
    }

    /*  wait for the detached server to respond, else terminate it and fail with the tail of its log  */
    private async awaitStartup (child: ChildProcess, logFile: string, address: string, port: number, token: string,
        tls: boolean, env: NodeJS.ProcessEnv): Promise<number> {
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
                this.log.write("info", `${this.label}: started on ${tls ? "https" : "http"}://${urlHost(address)}:${port}${this.started(env)}`)
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
        const tail   = Daemon.readLogTail(logFile, 20)
        const reason = exited ?
            `${this.label}: server exited during startup (code ${exitCode})` :
            probed === "foreign" ?
                `${this.label}: port ${port} taken by a foreign service during startup` :
                probed === "unauthorized" ?
                    `${this.label}: server on port ${port} rejects the token` :
                    `${this.label}: server failed to respond within timeout`
        throw new Error(tail.length > 0 ? `${reason}\n---- ${logFile} (tail) ----\n${tail}` : reason)
    }

    /*  start flow: resolve the configuration, probe, and detach (or run in the foreground)  */
    private async doStart (opts: O): Promise<number> {
        const ctx = this.loadContext()
        if (process.env[this.env("SERVE")] === "1")
            return this.runServer(ctx)

        /*  let the TLS certificate and key not given fall back to the otherwise configured ones  */
        const tlsDefaults = this.tlsDefaults()
        if (opts.tlsCert === undefined && tlsDefaults.cert !== null)
            opts.tlsCert = tlsDefaults.cert
        if (opts.tlsKey === undefined && tlsDefaults.key !== null)
            opts.tlsKey = tlsDefaults.key

        /*  validate the explicitly given port and resolve the TLS certificate and key (both or
            none), the given ones checked for readability, before a running server is stopped
            to apply deviating options, so invalid options never leave no server running  */
        if (opts.port !== undefined) {
            const port = Number(opts.port)
            if (!Number.isInteger(port) || port < 1 || port > 65535)
                throw new Error(`${this.label}: invalid port "${opts.port}"`)
        }
        const tlsCert = opts.tlsCert !== undefined ? path.resolve(opts.tlsCert) : ctx.tlsCert
        const tlsKey  = opts.tlsKey  !== undefined ? path.resolve(opts.tlsKey)  : ctx.tlsKey
        if ((tlsCert === null) !== (tlsKey === null))
            throw new Error(`${this.label}: TLS requires both a certificate ("--tls-cert") and a key ("--tls-key")`)
        for (const file of [ opts.tlsCert, opts.tlsKey ])
            if (file !== undefined)
                fs.accessSync(path.resolve(file), fs.constants.R_OK)

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
                const url     = `${tls ? "https" : "http"}://${urlHost(current)}:${ctx.port}`
                if (changed.length === 0) {
                    if (state === "unauthorized")
                        throw new Error(`${this.label}: already running on ${url}, but the configured token is rejected`)
                    if (opts.foreground)
                        throw new Error(`${this.label}: already running on ${url} (stop it first with "ase ${this.words} stop")`)
                    this.log.write("info", `${this.label}: already running on ${url}`)
                    return 0
                }

                /*  restart the server to apply the deviating options  */
                this.log.write("info", `${this.label}: already running on ${url}, ` +
                    `restarting to apply deviating ${changed.join(", ")}`)
                await this.doStop()
            }
            else
                foreign = state === "foreign"
        }

        /*  check the TLS certificate and key (also the configured ones)
            for readability to fail before detaching the server  */
        for (const file of [ tlsCert, tlsKey ])
            if (file !== null)
                fs.accessSync(file, fs.constants.R_OK)

        /*  warn about plain HTTP on a non-loopback address, as the
            bearer token then travels unencrypted over the network  */
        if (tlsCert === null && !isLoopback(address))
            this.log.write("warning", `${this.label}: binding to non-loopback address "${address}" without TLS ` +
                "(consider \"--tls-cert\" and \"--tls-key\", or a TLS reverse proxy)")

        /*  resolve port, token, and CORS origins  */
        let port = ctx.port
        if (opts.port !== undefined)
            port = Number(opts.port)
        else if (port === null || foreign) {
            /*  re-allocate a configured port held by a foreign service  */
            if (foreign)
                this.log.write("warning", `${this.label}: configured port ${port} in use by foreign service, re-allocating`)
            port = await Daemon.allocatePort()
        }
        let token = opts.token ?? process.env[this.env("TOKEN")] ?? ctx.token
        if (token === undefined || token === null || token === "")
            token = crypto.randomBytes(24).toString("hex")
        const cors = opts.cors.length > 0 ? opts.cors : this.configuredCors(ctx.cfg)

        /*  the resolved configuration of the server  */
        const env: NodeJS.ProcessEnv = {
            [this.env("ADDRESS")]:   address,
            [this.env("PORT")]:      String(port),
            [this.env("TOKEN")]:     token,
            [this.env("CORS")]:      cors.join(","),
            [this.env("TLS_CERT")]:  tlsCert ?? "",
            [this.env("TLS_KEY")]:   tlsKey ?? "",
            [this.env("LOG_LEVEL")]: this.log.logLevel(),
            ...this.environment(ctx, opts)
        }

        /*  run the server in the foreground, logging to the terminal  */
        if (opts.foreground)
            return this.runServer(ctx, env)

        /*  spawn the server detached, logging into its log file  */
        const logFile = path.join(ctx.dir, `${this.name}.log`)
        const child   = this.spawnDetached([ ...this.words.split(" "), "start" ],
            { ...env, [this.env("SERVE")]: "1" }, logFile)

        /*  wait for the server to respond  */
        return this.awaitStartup(child, logFile, address, port, token, tlsCert !== null, env)
    }

    /*  status flow: report whether the server is running  */
    private async doStatus (): Promise<number> {
        const ctx = this.loadContext()
        if (ctx.port === null) {
            await writeStdout(`${this.label}: not running (no port configured)\n`)
            return 1
        }
        const address = ctx.address ?? DEFAULT_ADDRESS
        const scheme  = ctx.tlsCert !== null ? "https" : "http"
        const state   = await this.probe(address, ctx.port, ctx.token, ctx.tlsCert !== null)
        if (state === "running") {
            await writeStdout(`${this.label}: running on ${scheme}://${urlHost(address)}:${ctx.port}` +
                (ctx.pid !== null ? ` (pid ${ctx.pid})` : "") + this.running(ctx) + "\n")
            return 0
        }
        if (state === "unauthorized") {
            await writeStdout(`${this.label}: running on ${scheme}://${urlHost(address)}:${ctx.port}, but the configured token is rejected\n`)
            return 1
        }
        if (state === "foreign") {
            await writeStdout(`${this.label}: not running (port ${ctx.port} in use by foreign service)\n`)
            return 1
        }
        await writeStdout(`${this.label}: not running (port ${ctx.port} not responding)\n`)
        return 1
    }

    /*  stop flow: terminate the server process and wait until it is gone  */
    private async doStop (): Promise<number> {
        const ctx = this.loadContext()
        if (ctx.pid === null && ctx.port === null) {
            this.log.write("info", `${this.label}: not running (no server configured)`)
            return 0
        }
        const address = ctx.address ?? DEFAULT_ADDRESS

        /*  probe first, as a stale process id might meanwhile belong to a foreign process  */
        const state   = ctx.port !== null ? await this.probe(address, ctx.port, ctx.token, ctx.tlsCert !== null) : null
        const running = state === "running" || state === "unauthorized"
        if (ctx.pid === null || !running) {
            if (running)
                throw new Error(`${this.label}: running on port ${ctx.port}, but its process id is unknown`)
            this.log.write("info", `${this.label}: not running`)
            this.persist(ctx.cfg, { pid: null })
            return 0
        }
        if (await this.terminate(ctx.pid, 5000))
            this.log.write("info", `${this.label}: stopped (process ${ctx.pid})`)
        else
            this.log.write("info", `${this.label}: not running (process ${ctx.pid} already gone)`)
        this.persist(ctx.cfg, { pid: null })
        return 0
    }

    /*  register the CLI sub-command group and its commands
        "start", "status", "log", and "stop" below the CLI command <parent>  */
    register (parent: Command): void {
        /*  register CLI sub-command group  */
        const group = this.group(parent)

        /*  register CLI sub-command "start"  */
        const start = group
            .command("start")
            .description(`Start the ${this.label} server in the background (idempotent if already running) or in the foreground`)
            .option("-a, --address <host>", `address to bind to (default: ${DEFAULT_ADDRESS}, or the configured one)`)
            .option("-p, --port <port>", "port to bind to (default: the configured one, else allocated randomly)")
            .option("-t, --token <token>", `bearer token to expect (default: $${this.env("TOKEN")}, the configured one, ` +
                "else generated)")
            .option("-c, --cors <origin>", "allow cross-origin browser requests from <origin> " +
                "(repeatable, \"*\" for any origin; default: the configured ones)",
            (value: string, previous: string[]) => [ ...previous, value ], [] as string[])
        this.options(start)
        start
            .option("--tls-cert <file>", "serve HTTPS with the PEM certificate (chain) in <file>, requires \"--tls-key\" " +
                "(default: the configured \"tls.cert\", else plain HTTP)")
            .option("--tls-key <file>", "serve HTTPS with the PEM private key in <file>, requires \"--tls-cert\" " +
                "(default: the configured \"tls.key\")")
            .option("-f, --foreground", "run the server in the foreground, logging to the terminal, " +
                "until it is interrupted or stopped")
            .action(async (opts: O) => {
                process.exit(await this.doStart(opts))
            })

        /*  register CLI sub-command "status"  */
        group
            .command("status")
            .description(`Report whether the ${this.label} server is running`)
            .action(async () => {
                process.exit(await this.doStatus())
            })

        /*  register CLI sub-command "log"  */
        this.registerLog(group, () => path.join(this.loadContext().dir, `${this.name}.log`))

        /*  register CLI sub-command "stop"  */
        group
            .command("stop")
            .description(`Stop the ${this.label} server`)
            .action(async () => {
                process.exit(await this.doStop())
            })
    }
}

