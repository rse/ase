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
import { ErrorCode, isJSONRPCRequest }   from "@modelcontextprotocol/sdk/types.js"
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

        /*  the service is started in the background (or, if deferred, later),
            so the MCP handshake is never blocked by a slow service start  */
        let projectId = ""
        let port: number | null = null

        /*  create MCP STDIO server (lives for the entire bridge lifetime)  */
        const server = new StdioServerTransport()

        /*  track active client and bridge-level closed state  */
        let client:       StreamableHTTPClientTransport | null = null
        let bridgeDone   = false                /*  set when stdio side closes               */
        let reconnecting = false                /*  set while a reconnect chain is active    */
        let serviceDown:  string | null = null  /*  set while the service cannot be started  */

        /*  mark the individual transports we intentionally closed, so their
            onclose is not mistaken for an unexpected connection loss; using
            a per-transport set (instead of a single bridge-wide flag) avoids
            suppressing a legitimate retry when a freshly-created connection
            fails during the brief window right after we initiated a close  */
        const closedByUs = new WeakSet<StreamableHTTPClientTransport>()

        /*  fetch watching the response stream of a request, and answering the request with
            an error if the stream ends without its response, as the HTTP client just drops
            such a request (the grace period lets the HTTP client finish the stream first)  */
        const STREAM_GRACE_MS = 1000
        const open = new Set<string | number>()
        const fetchWatched = async (url: string | URL, init?: RequestInit): Promise<Response> => {
            const response = await fetch(url, init)
            const msg = init?.method === "POST" && typeof init.body === "string" ?
                JSON.parse(init.body) as JSONRPCMessage : null
            if (msg === null || !isJSONRPCRequest(msg) || !response.ok || response.body === null)
                return response
            const { id } = msg
            const ended = (reason: string) => {
                setTimeout(() => {
                    if (!open.delete(id))
                        return
                    this.log.write("error", `mcp: http response: ${reason}`)
                    const error = { code: ErrorCode.InternalError, message: `ase service connection lost, outcome of request unknown: ${reason}` }
                    server.send({ jsonrpc: "2.0", id, error }).catch(() => {})
                }, STREAM_GRACE_MS)
            }
            open.add(id)
            const [ body, watched ] = response.body.tee()
            watched.pipeTo(new WritableStream()).then(
                ()               => { ended("stream ended without a response") },
                (err: unknown)   => { ended(sendFailure(err).reason) }
            )
            return new Response(body, response)
        }

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
            const next   = new StreamableHTTPClientTransport(url, { fetch: fetchWatched })

            next.onmessage = (msg: JSONRPCMessage) => {
                if ("id" in msg && !("method" in msg) && msg.id !== undefined)
                    open.delete(msg.id)
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
            for (const msg of pending.splice(0, pending.length)) {
                clearTimeout(deadlines.get(msg))
                deadlines.delete(msg)
                sendToClient(msg)
            }

            /*  stop answering in-process, as the service is connected now, and let the
                agent tool re-list a tool list answered in-process, as a still running
                service of another ASE version can provide different tools  */
            if (local !== null) {
                local.close().catch(() => {})
                local = null
                if (listedLocally)
                    server.send({ jsonrpc: "2.0", method: "notifications/tools/list_changed" }).catch(() => {})
            }
        }

        /*  start (or probe) the service, and while it cannot be started, fail the
            buffered and all further requests at once instead of after the deadline  */
        const startService = async () => {
            try {
                const ctx = await this.ensureService()
                port        = ctx.port
                projectId   = ctx.projectId
                serviceDown = null
            }
            catch (err: unknown) {
                const reason = `ase service unavailable: ${this.asError(err).message}`
                serviceDown = reason
                for (const msg of pending.filter((msg) => isJSONRPCRequest(msg))) {
                    clearTimeout(deadlines.get(msg))
                    deadlines.delete(msg)
                    failRequest(msg, reason)
                }
                pending.splice(0, pending.length, ...pending.filter((msg) => !isJSONRPCRequest(msg)))
                throw err
            }
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
                await startService()
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
        const PENDING_MS  = 120_000
        const pending: JSONRPCMessage[] = []

        /*  deadline timers of the buffered requests, cleared on flush, so a re-buffered request gets a fresh deadline  */
        const deadlines = new Map<JSONRPCMessage, ReturnType<typeof setTimeout>>()

        /*  answer a request (but not a notification) with an error, as an unanswered request lets the client hang  */
        const failRequest = (msg: JSONRPCMessage, message: string) => {
            if (!isJSONRPCRequest(msg))
                return
            const error = { code: ErrorCode.InternalError, message }
            server.send({ jsonrpc: "2.0", id: msg.id, error }).catch(() => {})
        }

        /*  forward a message to the HTTP client, buffering it while the client
            is disconnected so requests survive a reconnect window, but answering
            a request still buffered after a deadline (or dropped on overflow) with
            an error, as a service which never comes up would let the client hang  */
        const sendToClient = (msg: JSONRPCMessage, resent = false) => {
            if (client === null) {
                if (serviceDown !== null) {
                    failRequest(msg, serviceDown)
                    if (isJSONRPCRequest(msg))
                        return
                }
                if (pending.length >= MAX_PENDING) {
                    this.log.write("warning", "mcp: pending queue overflow, dropping oldest message")
                    const dropped = pending.shift()
                    if (dropped !== undefined) {
                        clearTimeout(deadlines.get(dropped))
                        deadlines.delete(dropped)
                        failRequest(dropped, "ase service unavailable: pending queue overflow")
                    }
                }
                pending.push(msg)
                if (isJSONRPCRequest(msg))
                    deadlines.set(msg, setTimeout(() => {
                        deadlines.delete(msg)
                        const i = pending.indexOf(msg)
                        if (i < 0)
                            return
                        pending.splice(i, 1)
                        this.log.write("error", `mcp: no service connection within ${PENDING_MS / 1000}s -- failing request`)
                        failRequest(msg, `ase service unavailable: no connection within ${PENDING_MS / 1000} seconds`)
                    }, PENDING_MS).unref())
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
                    else
                        failRequest(msg, `ase service unreachable: ${reason}`)
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

        /*  until the service is connected, answer all messages in-process through
            the same MCP server the service would use -- this covers the MCP
            handshake and the tool listing, which the agent tools time out on resp.
            GitHub Copilot CLI insists on before it even runs the session-start
            hook -- except the tool calls, which are held back in the pending
            buffer until the service is connected  */
        const [ localClient, localServer ] = InMemoryTransport.createLinkedPair()
        await ServiceCommand.buildMcpServer(this.log, { projectId: "", port: 0 }, Date.now()).connect(localServer)
        localClient.onmessage = (msg: JSONRPCMessage) => {
            server.send(msg).catch((err: unknown) => {
                this.log.write("error", `mcp: stdout send: ${this.asError(err).message}`)
            })
        }
        await localClient.start()
        let local: InMemoryTransport | null = localClient
        let listedLocally = false
        let deferring     = deferred

        /*  stop deferring: switch into the recorded project directory (if any),
            so the service is looked up -- and if needed started -- inside the
            project, then connect to it and flush the held tool calls  */
        const POLL_INTERVAL_MS = 250
        const FALLBACK_MS      = 30_000
        let pollTimer:     ReturnType<typeof setInterval> | null = null
        let fallbackTimer: ReturnType<typeof setTimeout>  | null = null
        const undefer = (dir: string | null) => {
            if (!deferring)
                return
            deferring = false
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
            const run = async () => {
                await startService()
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
        server.onmessage = (msg: JSONRPCMessage) => {
            /*  drop a held request on its cancellation, as it otherwise
                still runs once the service is connected  */
            if ("method" in msg && msg.method === "notifications/cancelled") {
                const requestId = (msg.params as { requestId?: unknown } | undefined)?.requestId
                const held      = pending.find((p) => isJSONRPCRequest(p) && p.id === requestId)
                if (held !== undefined) {
                    pending.splice(pending.indexOf(held), 1)
                    clearTimeout(deadlines.get(held))
                    deadlines.delete(held)
                    return
                }
            }
            if (local === null)
                sendToClient(msg)
            else if ("method" in msg && msg.method === "tools/call") {
                /*  hold back tool calls, and in case the session-start hook
                    never records a project directory, do not hold them back
                    forever (measured from the first held call and not from
                    the start, as an interactive session can idle arbitrarily
                    long before the hook runs with its first prompt)  */
                sendToClient(msg)
                if (deferring) {
                    if (fallbackTimer === null)
                        fallbackTimer = setTimeout(() => { undefer(null) }, FALLBACK_MS)
                    checkProjectDir()
                }
            }
            else {
                if ("method" in msg && msg.method === "tools/list")
                    listedLocally = true
                local.send(msg).catch((err: unknown) => {
                    this.log.write("error", `mcp: local send: ${this.asError(err).message}`)
                })
            }
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
            const run = async () => {
                await startService()
                await connectClient()
            }
            run().catch((err: unknown) => {
                /*  service failed to start or vanished between probe and connect -- recover instead of crashing  */
                triggerReconnect(`initial connect failed: ${this.asError(err).message}`)
            })
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
