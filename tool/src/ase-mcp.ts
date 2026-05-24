/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under GPL 3.0 <https://spdx.org/licenses/GPL-3.0-only>
*/

import path                   from "node:path"
import { fileURLToPath }      from "node:url"

import { Command }            from "commander"
import { execa }              from "execa"

import { StdioServerTransport }          from "@modelcontextprotocol/sdk/server/stdio.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import type { JSONRPCMessage }           from "@modelcontextprotocol/sdk/types.js"

import { Config, configSchema } from "./ase-config.js"
import type Log                 from "./ase-log.js"
import { SERVICE_HOST as HOST, serviceSchema, probe } from "./ase-service.js"

/*  CLI command "ase mcp"  */
export default class MCPCommand {
    constructor (private log: Log) {}

    /*  load service identity context  */
    private loadContext (): { projectId: string, port: number | null } {
        const cfg = new Config("config", configSchema, this.log)
        cfg.read()
        const svc = new Config("service", serviceSchema, this.log)
        svc.read()
        const rawId     = cfg.get("project.id") as string | null | undefined
        const projectId = rawId ?? path.basename(process.cwd())
        const rawPort   = svc.get("port") as number | null | undefined
        const port: number | null = rawPort ?? null
        return { projectId, port }
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

    /*  bridge stdio to a Streamable HTTP MCP endpoint on the local service  */
    private async runBridge (): Promise<number> {
        /*  ensure the service is running  */
        let { port } = await this.ensureService()

        /*  create MCP STDIO server (lives for the entire bridge lifetime)  */
        const server = new StdioServerTransport()

        /*  track active client and bridge-level closed state  */
        let client:       StreamableHTTPClientTransport | null = null
        let closedByUs   = false  /* set when we initiated the client close */
        let bridgeDone   = false  /* set when stdio side closes             */
        let reconnecting = false  /* set while a reconnect chain is active  */

        /*  cleanly shut down the whole bridge  */
        const shutdown = async () => {
            if (bridgeDone)
                return
            bridgeDone = true
            closedByUs = true
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
            client = next

            next.onmessage = (msg: JSONRPCMessage) => {
                server.send(msg).catch((_err: unknown) => {
                    const err = _err instanceof Error ? _err : new Error(String(_err))
                    this.log.write("error", `mcp: stdout send: ${err.message}`)
                })
            }
            next.onerror = (err: Error) => {
                this.log.write("error", `mcp: http: ${err.message}`)
            }

            /*  service closed the connection — try to recover  */
            next.onclose = () => {
                if (closedByUs || bridgeDone || reconnecting)
                    return
                reconnecting = true
                this.log.write("warning", "mcp: http connection lost — reconnecting")
                reconnect(0, () => { reconnecting = false }).catch(() => {})
            }

            await next.start()
        }

        /*  reconnect loop: restart service if needed, then reconnect client  */
        const reconnect = async (attempt = 0, done?: () => void) => {
            const delay = Math.min(500 * 2 ** attempt, 10000)
            await new Promise<void>((resolve) => setTimeout(resolve, delay))
            if (bridgeDone) {
                done?.()
                return
            }
            try {
                const ctx = await this.ensureService()
                port = ctx.port
                closedByUs = true
                await client?.close()
                closedByUs = false
                await connectClient()
                this.log.write("info", "mcp: reconnected to service")
                done?.()
            }
            catch (_err: unknown) {
                const err = _err instanceof Error ? _err : new Error(String(_err))
                this.log.write("error", `mcp: reconnect failed: ${err.message}`)
                reconnect(attempt + 1, done).catch(() => {})
            }
        }

        /*  wire stdio server  */
        server.onmessage = (msg: JSONRPCMessage) => {
            client?.send(msg).catch((_err: unknown) => {
                const err = _err instanceof Error ? _err : new Error(String(_err))
                this.log.write("error", `mcp: http send: ${err.message}`)
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
        await connectClient()

        /*  periodically probe the service; trigger reconnect if it is gone  */
        const HEALTH_INTERVAL_MS = 30_000
        const healthTimer = setInterval(async () => {
            if (bridgeDone || reconnecting)
                return
            try {
                const { projectId } = this.loadContext()
                const match = await probe(port, projectId)
                if (match !== true) {
                    reconnecting = true
                    this.log.write("warning", "mcp: health check failed — reconnecting")
                    reconnect(0, () => { reconnecting = false }).catch(() => {})
                }
            }
            catch { /* ignore probe errors */ }
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
        return 0
    }

    /*  register commands  */
    register (program: Command): void {
        program
            .command("mcp")
            .description("Bridge stdio MCP to the per-project background service over Streamable HTTP")
            .action(async () => {
                process.exit(await this.runBridge())
            })
    }
}
