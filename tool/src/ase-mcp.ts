/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import { fileURLToPath }      from "node:url"

import { Command }            from "commander"
import { execa }              from "execa"

import { StdioServerTransport }          from "@modelcontextprotocol/sdk/server/stdio.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { InMemoryTransport }             from "@modelcontextprotocol/sdk/inMemory.js"
import { ErrorCode }                     from "@modelcontextprotocol/sdk/types.js"
import type { JSONRPCMessage }           from "@modelcontextprotocol/sdk/types.js"

import type Log                 from "./ase-lib-log.js"
import { sessionState }         from "./ase-config-core.js"
import ServiceCommand           from "./ase-service.js"
import { SERVICE_HOST as HOST, probe, isConnRefused, loadServiceContext } from "./ase-service.js"

/*  the innermost reason of a failed HTTP send, and whether it failed on the socket level  */
const sendFailure = (err: unknown): { reason: string, socket: boolean } => {
    let cause = err
    while (cause instanceof Error && cause.cause instanceof Error)
        cause = cause.cause
    const reason = cause instanceof Error ? cause.message : String(cause)
    const code   = String((cause as { code?: unknown } | null)?.code)
    return { reason, socket: [ "ECONNRESET", "EPIPE", "UND_ERR_SOCKET" ].includes(code) || /other side closed/i.test(reason) }
}

/*  CLI command "ase mcp"  */
export default class MCPCommand {
    constructor (private log: Log) {}

    /*  load service identity context  */
    private loadContext (): { projectId: string, port: number | null } {
        return loadServiceContext(this.log)
    }

    /*  run "ase service start" and wait for the service to come up  */
    private async ensureService (): Promise<{ projectId: string, port: number }> {
        let ctx = this.loadContext()

        /*  fast path: already running  */
        if (ctx.port !== null) {
            const match = await probe(ctx.port, ctx.projectId).catch(() => null)
            if (match === true)
                return { projectId: ctx.projectId, port: ctx.port }
        }

        /*  spawn "ase service start" using the same node entry point  */
        const entry = fileURLToPath(new URL("./ase.js", import.meta.url))
        await execa(process.execPath, [ entry, "service", "start" ], {
            stdio:    "ignore",
            detached: false
        })

        /*  re-load context to pick up the freshly persisted port  */
        ctx = this.loadContext()
        if (ctx.port === null)
            throw new Error("mcp: service did not register a port after start")
        const match = await probe(ctx.port, ctx.projectId)
        if (match !== true)
            throw new Error(`mcp: service not responding on port ${ctx.port} after start`)
        return { projectId: ctx.projectId, port: ctx.port }
    }

    /*  determine the GitHub Copilot CLI session id from the environment: unlike
        the hook handlers, which receive it in their event payload, the bridge can
        only learn it from the environment of its MCP server process, where GitHub
        Copilot CLI (and only it) exports both COPILOT_PLUGIN_ROOT and the session id
        in COPILOT_AGENT_SESSION_ID; an empty result (always the case under the
        other tools) disables the project directory lookup  */
    private sessionIdFromEnv (): string {
        if ((process.env.COPILOT_PLUGIN_ROOT ?? "") === "")
            return ""
        const value = process.env.COPILOT_AGENT_SESSION_ID ?? ""
        return /^[A-Za-z0-9._-]+$/.test(value) ? value : ""
    }

    /*  read the project directory which the session-start hook recorded for a
        session; the session scope resolves below the home directory and hence
        does not itself depend on the working directory to be correct already  */
    private readSessionProjectDir (sessionId: string): string | null {
        try {
            /*  read without locking: this is polled until the session-start
                hook has recorded the directory, and locking would both create
                the session files prematurely and contend with that very hook --
                writers use atomic replacement, so a plain read can never
                observe a partial file  */
            const state = sessionState(this.log, sessionId)
            state.read()
            const value = state.getExplicit("basedir")
            return typeof value === "string" && value !== "" ? value : null
        }
        catch {
            /*  best-effort: an unreadable session config just defers the lookup  */
            return null
        }
    }

    /*  coerce an unknown thrown value into an Error  */
    private asError (e: unknown): Error {
        return e instanceof Error ? e : new Error(String(e))
    }

    /*  bridge stdio to a Streamable HTTP MCP endpoint on the local service  */
    private async runBridge (): Promise<void> {
        /*  determine whether the service has to be deferred: GitHub Copilot CLI
            starts the MCP server in the plugin installation directory and reveals
            the project only to its hooks, so the service of the project can be
            started only once the session-start hook recorded the project directory
            (GitHub Copilot CLI only -- the other tools already start the bridge
            inside the project, so their service is started right away)  */
        const sessionId = this.sessionIdFromEnv()
        const deferred  = sessionId !== ""

        /*  ensure the service is running (unless deferred)  */
        let projectId = ""
        let port: number | null = null
        if (!deferred) {
            const ctx = await this.ensureService()
            projectId = ctx.projectId
            port      = ctx.port
        }

        /*  create MCP STDIO server (lives for the entire bridge lifetime)  */
        const server = new StdioServerTransport()

        /*  track active client and bridge-level closed state  */
        let client:       StreamableHTTPClientTransport | null = null
        let bridgeDone   = false  /*  set when stdio side closes              */
        let reconnecting = false  /*  set while a reconnect chain is active   */

        /*  mark the individual transports we intentionally closed, so their
            onclose is not mistaken for an unexpected connection loss; using
            a per-transport set (instead of a single bridge-wide flag) avoids
            suppressing a legitimate retry when a freshly-created connection
            fails during the brief window right after we initiated a close  */
        const closedByUs = new WeakSet<StreamableHTTPClientTransport>()

        /*  cleanly shut down the whole bridge  */
        const shutdown = async () => {
            if (bridgeDone)
                return
            bridgeDone = true
            if (client !== null)
                closedByUs.add(client)
            const timeout = new Promise<void>((resolve) => setTimeout(resolve, 3000))
            await Promise.race([
                Promise.allSettled([ server.close(), client?.close() ]),
                timeout
            ])
            process.exit(0)
        }

        /*  (re-)connect the HTTP client to the service  */
        const connectClient = async () => {
            if (port === null)
                throw new Error("mcp: no service port known")
            const url    = new URL(`http://${HOST}:${port}/mcp`)
            const next   = new StreamableHTTPClientTransport(url)

            next.onmessage = (msg: JSONRPCMessage) => {
                server.send(msg).catch((err: unknown) => {
                    this.log.write("error", `mcp: stdout send: ${this.asError(err).message}`)
                })
            }
            next.onerror = (err: Error) => {
                this.log.write("error", `mcp: http: ${err.message}`)
            }

            /*  service closed the connection -- try to recover  */
            next.onclose = () => {
                if (client !== next || closedByUs.has(next) || bridgeDone || reconnecting)
                    return
                triggerReconnect("http connection lost")
            }

            /*  activate the connection and flush buffered messages  */
            await next.start()
            client = next
            for (const msg of pending.splice(0, pending.length))
                sendToClient(msg)
        }

        /*  reconnect loop: restart service if needed, then reconnect client  */
        const reconnect = async (attempt = 0) => {
            const delay = Math.min(500 * 2 ** attempt, 10000)
            await new Promise<void>((resolve) => setTimeout(resolve, delay))
            if (bridgeDone) {
                reconnecting = false
                return
            }
            try {
                const ctx = await this.ensureService()
                port      = ctx.port
                projectId = ctx.projectId
                const stale = client
                client = null
                if (stale !== null) {
                    closedByUs.add(stale)
                    await stale.close()
                }
                await connectClient()
                reconnecting = false
                this.log.write("info", "mcp: reconnected to service")
            }
            catch (err: unknown) {
                this.log.write("error", `mcp: reconnect failed: ${this.asError(err).message}`)
                reconnect(attempt + 1).catch(() => {})
            }
        }

        /*  trigger a reconnect chain (idempotent while one is active)  */
        const triggerReconnect = (reason: string) => {
            if (reconnecting)
                return
            reconnecting = true
            this.log.write("warning", `mcp: ${reason} -- reconnecting`)
            reconnect(0).catch(() => {})
        }

        /*  bounded buffer for messages arriving while no HTTP client is connected  */
        const MAX_PENDING = 100
        const pending: JSONRPCMessage[] = []

        /*  forward a message to the HTTP client, buffering it while the client
            is disconnected so requests survive a reconnect window  */
        const sendToClient = (msg: JSONRPCMessage, resent = false) => {
            if (client === null) {
                if (pending.length >= MAX_PENDING) {
                    this.log.write("warning", "mcp: pending queue overflow, dropping oldest message")
                    pending.shift()
                }
                pending.push(msg)
                return
            }
            const target = client
            target.send(msg).catch((err: unknown) => {
                if (!isConnRefused(err)) {
                    /*  re-send once over a broken connection, else answer a request
                        with an error, as an unanswered request lets the client hang  */
                    const { reason, socket } = sendFailure(err)
                    this.log.write("error", `mcp: http send: ${reason}`)
                    if (socket && !resent)
                        sendToClient(msg, true)
                    else if ("method" in msg && "id" in msg) {
                        const error = { code: ErrorCode.InternalError, message: `ase service unreachable: ${reason}` }
                        server.send({ jsonrpc: "2.0", id: msg.id, error }).catch(() => {})
                    }
                    return
                }

                /*  service is gone: detach the dead client, recover, and re-send  */
                if (client === target) {
                    closedByUs.add(target)
                    client = null
                    target.close().catch(() => {})
                    triggerReconnect("http connection refused")
                }
                sendToClient(msg)
            })
        }

        /*  while deferred, answer all messages in-process through the same MCP
            server the service would use -- this covers the MCP handshake and
            the tool listing, which GitHub Copilot CLI insists on before it even
            runs the session-start hook -- except the tool calls, which are held
            back in the pending buffer until the service is connected  */
        let local: InMemoryTransport | null = null
        if (deferred) {
            const [ localClient, localServer ] = InMemoryTransport.createLinkedPair()
            await ServiceCommand.buildMcpServer(this.log, { projectId: "", port: 0 }, Date.now()).connect(localServer)
            localClient.onmessage = (msg: JSONRPCMessage) => {
                server.send(msg).catch((err: unknown) => {
                    this.log.write("error", `mcp: stdout send: ${this.asError(err).message}`)
                })
            }
            await localClient.start()
            local = localClient
        }

        /*  stop deferring: switch into the recorded project directory (if any),
            so the service is looked up -- and if needed started -- inside the
            project, then connect to it and flush the held tool calls  */
        const POLL_INTERVAL_MS = 250
        const FALLBACK_MS      = 30_000
        let pollTimer:     ReturnType<typeof setInterval> | null = null
        let fallbackTimer: ReturnType<typeof setTimeout>  | null = null
        const undefer = (dir: string | null) => {
            if (local === null)
                return
            local.close().catch(() => {})
            local = null
            if (pollTimer !== null)
                clearInterval(pollTimer)
            if (fallbackTimer !== null)
                clearTimeout(fallbackTimer)
            if (dir === null)
                this.log.write("warning", "mcp: no project directory recorded by session-start hook " +
                    `-- falling back to the current directory "${process.cwd()}"`)
            else {
                try {
                    process.chdir(dir)
                }
                catch (err: unknown) {
                    this.log.write("warning", `mcp: cannot switch to recorded project directory "${dir}": ` +
                        `${this.asError(err).message} -- falling back to the current directory`)
                }
            }
            server.onmessage = sendToClient
            const run = async () => {
                const ctx = await this.ensureService()
                port      = ctx.port
                projectId = ctx.projectId
                await connectClient()
                this.log.write("info", `mcp: connected to service of project "${projectId}" on port ${port}`)
            }
            run().catch((err: unknown) => {
                triggerReconnect(`deferred connect failed: ${this.asError(err).message}`)
            })
        }

        /*  look for the recorded project directory  */
        const checkProjectDir = () => {
            const dir = this.readSessionProjectDir(sessionId)
            if (dir !== null)
                undefer(dir)
        }

        /*  wire stdio server  */
        if (!deferred)
            server.onmessage = sendToClient
        else
            server.onmessage = (msg: JSONRPCMessage) => {
                if (local === null)
                    sendToClient(msg)
                else if ("method" in msg && msg.method === "tools/call") {
                    /*  hold back tool calls, and in case the session-start hook
                        never records a project directory, do not hold them back
                        forever (measured from the first held call and not from
                        the start, as an interactive session can idle arbitrarily
                        long before the hook runs with its first prompt)  */
                    sendToClient(msg)
                    if (fallbackTimer === null)
                        fallbackTimer = setTimeout(() => { undefer(null) }, FALLBACK_MS)
                    checkProjectDir()
                }
                else
                    local.send(msg).catch((err: unknown) => {
                        this.log.write("error", `mcp: local send: ${this.asError(err).message}`)
                    })
            }
        server.onerror = (err: Error) => {
            this.log.write("error", `mcp: stdio: ${err.message}`)
        }
        server.onclose = () => {
            shutdown().catch(() => {})
        }

        /*  start server and initial client (or the polling for the recorded project directory)  */
        await server.start()
        if (!deferred) {
            try {
                await connectClient()
            }
            catch (err: unknown) {
                /*  service vanished between probe and connect -- recover instead of crashing  */
                triggerReconnect(`initial connect failed: ${this.asError(err).message}`)
            }
        }
        else {
            pollTimer = setInterval(checkProjectDir, POLL_INTERVAL_MS)
            pollTimer.unref()
        }

        /*  periodically probe the service; trigger reconnect if it is gone  */
        const HEALTH_INTERVAL_MS = 30_000
        const healthTimer = setInterval(async () => {
            if (bridgeDone || reconnecting || port === null)
                return
            try {
                const match = await probe(port, projectId)
                if (match !== true)
                    triggerReconnect("health check failed")
            }
            catch (err: unknown) {
                /*  ignore transient probe errors but record them  */
                this.log.write("debug", `mcp: health check error: ${this.asError(err).message}`)
            }
        }, HEALTH_INTERVAL_MS)
        healthTimer.unref()

        /*  await stdio to be closed  */
        await new Promise<void>((resolve) => {
            const done = () => resolve()
            process.stdin.once("end",   done)
            process.stdin.once("close", done)
        })

        /*  shutdown services  */
        clearInterval(healthTimer)
        await shutdown()
    }

    /*  register commands  */
    register (program: Command): void {
        program
            .command("mcp")
            .description("Bridge stdio MCP to the per-project background service over Streamable HTTP")
            .action(async () => {
                await this.runBridge()
                process.exit(0)
            })
    }
}
