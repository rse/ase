/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import type { IncomingMessage } from "node:http"
import type { Duplex }          from "node:stream"

import type Hapi                from "@hapi/hapi"

import type Log                 from "./ase-lib-log.js"
import { PtyHost, ptyDimension, SIZE_MAX } from "./ase-lib-pty.js"
import { parseTool }            from "./ase-setup-common.js"
import type { Tool }            from "./ase-setup-common.js"
import * as TaskFormat          from "./ase-task-format.js"
import { chatSpec, chatSupported } from "./ase-task-chat-core.js"

/*  the task chats of the ASE service: whether any of them is in use, their end, and the
    hand-over of a (by the service already authenticated) WebSocket handshake to the chat
    of its path, answering whether the path is the one of a chat at all  */
export type ChatBinding = {
    active:  () => boolean
    stop:    () => void
    upgrade: (req: IncomingMessage, socket: Duplex, head: Buffer, path: string,
        reject: (status: number, message: string) => void) => boolean
}

/*  register the route of the task chats, starting the chat of a task with the agent tool and
    at the terminal size of the requesting client, while its WebSocket is handed over by the
    service, which authenticates all handshakes  */
export const registerChatRoutes = (server: Hapi.Server, log: Log): ChatBinding => {
    const host = new PtyHost(log, "chat")

    /*  start the chat of a task (unless it runs already)  */
    server.route({
        method:  "POST",
        path:    "/task-chat/{id}",
        options: { payload: { parse: true, allow: "application/json" } },
        handler: async (request, h) => {
            const id   = String(request.params.id)
            const p    = request.payload as { tool?: unknown, cols?: unknown, rows?: unknown } | null
            const cols = ptyDimension(p?.cols)
            const rows = ptyDimension(p?.rows)
            if (!TaskFormat.TASK_ID_RE.test(id))
                return h.response({ error: `chat: invalid task id "${id}"` }).code(400)
            if (cols === null || rows === null)
                return h.response({ error: `chat: invalid terminal size (expected 1 to ${SIZE_MAX})` }).code(400)
            let tool: Tool
            try {
                tool = parseTool(typeof p?.tool === "string" ? p.tool : "")
            }
            catch (err: unknown) {
                return h.response({ error: `chat: ${err instanceof Error ? err.message : String(err)}` }).code(400)
            }
            if (!chatSupported(tool))
                return h.response({ error: `chat: agent tool "${tool}" is unsupported` }).code(400)
            if (host.running(id))
                return h.response({ running: true })
            if (host.full())
                return h.response({ error: "chat: too many running chats" }).code(429)
            try {
                await host.start(id, await chatSpec(log, id, tool, cols, rows))
            }
            catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err)
                log.write("warning", message)
                return h.response({ error: message }).code(500)
            }
            return h.response({ running: true })
        }
    })
    return {
        active:  () => host.active(),
        stop:    () => { host.stop() },
        upgrade: (req, socket, head, path, reject) => {
            const m = /^\/task-chat\/([^/]+)\/pty$/.exec(path)
            if (m === null)
                return false
            const id = decodeURIComponent(m[1])
            if (!TaskFormat.TASK_ID_RE.test(id))
                reject(400, `chat: invalid task id "${id}"`)
            else
                host.upgrade(req, socket, head, id, reject)
            return true
        }
    }
}

