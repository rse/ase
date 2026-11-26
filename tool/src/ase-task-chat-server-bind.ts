/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import fs                       from "node:fs"
import path                     from "node:path"
import crypto                   from "node:crypto"
import { fileURLToPath }        from "node:url"
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

/*  the fonts of the chat in the web board, as its terminal emulator takes TrueType fonts only:
    the code font of the board (as TrueType), with the fallbacks for the symbols,
    mathematical symbols, arrows, and emojis the agent tool draws (shipped by "build-font"),
    each loaded once on first use with its hash  */
const fonts = new Map<string, { data: Buffer, hash: string } | null>([
    [ "DejaVuSansMono.ttf",               null ],
    [ "DejaVuSansMono-Bold.ttf",          null ],
    [ "NotoSansSymbols_400Regular.ttf",   null ],
    [ "NotoSansSymbols2_400Regular.ttf",  null ],
    [ "NotoSansMath_400Regular.ttf",      null ],
    [ "NotoSansMono_400Regular.ttf",      null ],
    [ "NotoEmoji_400Regular.ttf",         null ]
])

/*  register the routes of the task chats: the start of the chat of a task with the agent tool
    and at the terminal size of the requesting client (answering the path of its WebSocket with
    the capability <capability> of the service for the browsers), and the fonts of the chat in
    the web board, while its WebSocket is handed over by the service, which authenticates all
    handshakes  */
export const registerChatRoutes = (server: Hapi.Server, log: Log, capability: (path: string) => string): ChatBinding => {
    const host = new PtyHost(log, "chat")

    /*  the fonts of the chat in the web board (public like all page assets, as they carry
        no task data)  */
    server.route({
        method:  "GET",
        path:    "/task-chat/font/{file}",
        options: { app: { public: true } },
        handler: (request, h) => {
            const name = String(request.params.file)
            if (!fonts.has(name))
                return h.response({ error: `chat: no font "${name}"` }).code(404)
            let font = fonts.get(name) ?? null
            if (font === null) {
                const data = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "font-chat", name))
                font = { data, hash: crypto.createHash("sha1").update(data).digest("hex") }
                fonts.set(name, font)
            }
            return h.response(font.data).type("font/ttf").etag(font.hash).header("Cache-Control", "no-cache")
        }
    })

    /*  start the chat of a task (unless it runs already), with the agent tool of "$ASE_TOOL" of the
        service (else "claude") for a client which knows no agent tool of the user (the web board),
        drawing with the 256-color palette only for a client mapping it onto its own colors (the web
        board, see "chatSpec"), answering the path of its WebSocket  */
    const envTool  = process.env.ASE_TOOL ?? ""
    const toolDflt = envTool !== "" ? envTool : "claude"
    server.route({
        method:  "POST",
        path:    "/task-chat/{id}",
        options: { payload: { parse: true, allow: "application/json" } },
        handler: async (request, h) => {
            const id   = String(request.params.id)
            const p    = request.payload as { tool?: unknown, cols?: unknown, rows?: unknown, palette?: unknown } | null
            const cols = ptyDimension(p?.cols)
            const rows = ptyDimension(p?.rows)
            if (!TaskFormat.TASK_ID_RE.test(id))
                return h.response({ error: `chat: invalid task id "${id}"` }).code(400)
            if (cols === null || rows === null)
                return h.response({ error: `chat: invalid terminal size (expected 1 to ${SIZE_MAX})` }).code(400)
            let tool: Tool
            try {
                tool = parseTool(typeof p?.tool === "string" ? p.tool : toolDflt)
            }
            catch (err: unknown) {
                return h.response({ error: `chat: ${err instanceof Error ? err.message : String(err)}` }).code(400)
            }
            if (!chatSupported(tool))
                return h.response({ error: `chat: agent tool "${tool}" is unsupported` }).code(400)
            const route = `/task-chat/${encodeURIComponent(id)}/pty`
            const state = { running: true, url: `${route}?cap=${capability(route)}` }
            if (host.running(id))
                return h.response(state)
            if (host.full())
                return h.response({ error: "chat: too many running chats" }).code(429)
            try {
                await host.start(id, await chatSpec(log, id, tool, cols, rows, p?.palette === true))
            }
            catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err)
                log.write("warning", message)
                return h.response({ error: message }).code(500)
            }
            return h.response(state)
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

