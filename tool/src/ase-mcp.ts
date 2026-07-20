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
import type { JSONRPCMessage }           from "@modelcontextprotocol/sdk/types.js"

import type Log                 from "./ase-log.js"
import { SERVICE_HOST as HOST, probe, loadServiceContext } from "./ase-service.js"

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
            const match = await probe(ctx.port, ctx.projectId)
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

    /*  coerce an unknown thrown value into an Error  */
    private asError (e: unknown): Error {
        return e instanceof Error ? e : new Error(String(e))
    }

    /*  bridge stdio to a Streamable HTTP MCP endpoint on the local service  */
    private async runBridge (): Promise<void> {
        /*  ensure the service is running  */
        let { projectId, port } = await this.ensureService()

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

            /*  service closed the connection — try to recover  */
            next.onclose = () => {
                if (client !== next || closedByUs.has(next) || bridgeDone || reconnecting)
                    return
                triggerReconnect("http connection lost")
            }

            await next.start()
            client = next
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
            this.log.write("warning", `mcp: ${reason} — reconnecting`)
            reconnect(0).catch(() => {})
        }

        /*  wire stdio server  */
        server.onmessage = (msg: JSONRPCMessage) => {
            client?.send(msg).catch((err: unknown) => {
                this.log.write("error", `mcp: http send: ${this.asError(err).message}`)
            })
        }
        server.onerror = (err: Error) => {
            this.log.write("error", `mcp: stdio: ${err.message}`)
        }
        server.onclose = () => {
            shutdown().catch(() => {})
        }

        /*  start server and initial client  */
        await server.start()
        try {
            await connectClient()
        }
        catch (err: unknown) {
            /*  service vanished between probe and connect — recover instead of crashing  */
            triggerReconnect(`initial connect failed: ${this.asError(err).message}`)
        }

        /*  periodically probe the service; trigger reconnect if it is gone  */
        const HEALTH_INTERVAL_MS = 30_000
        const healthTimer = setInterval(async () => {
            if (bridgeDone || reconnecting)
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
