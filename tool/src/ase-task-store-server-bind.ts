/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import crypto                   from "node:crypto"
import net                      from "node:net"
import type { IncomingMessage } from "node:http"
import type { Duplex }          from "node:stream"

import Hapi                     from "@hapi/hapi"
import { WebSocketServer }      from "ws"
import type { WebSocket }       from "ws"

import type Log                 from "./ase-log.js"
import type * as Delegate       from "./ase-task-store-plugin-delegate.js"
import * as Core                from "./ase-task-store-core.js"
import * as TaskFormat          from "./ase-task-format.js"

/*  the options of the REST API server  */
export type TaskStoreServerOptions = {
    address: string
    port:    number
    token:   string
    cors:    string[]
    tls:     { cert: Buffer, key: Buffer } | null
    store:   Delegate.TaskStore
}

/*  the host part of an address for use in a URL (brackets for IPv6)  */
export const urlHost = (address: string): string =>
    net.isIPv6(address) ? `[${address}]` : address

/*  a WebSocket subscription of a project's events, optionally
    restricted to a set of task ids  */
type Subscription = { ws: WebSocket, tasks: Set<string> | null }

/*  the route path templates and the JSON payload route options  */
const P    = "/projects/{prjId}"
const T    = `${P}/tasks/{taskId}`
const json = { payload: { parse: true, allow: "application/json" } }

/*  the HTTP binding of the REST API: bearer token authentication, CORS,
    the routes onto the core operations, problem details rendering, and
    the WebSocket event endpoint  */
export class TaskStoreServer {
    private server: Hapi.Server
    private wss:    WebSocketServer
    private core:   Core.TaskStoreCore
    private subs    = new Map<string, Set<Subscription>>()
    private token:  Buffer

    constructor (private log: Log, private options: TaskStoreServerOptions) {
        this.token  = Buffer.from(options.token, "utf8")
        this.core   = new Core.TaskStoreCore(options.store, (prjId, frame) => this.emit(prjId, frame))
        this.server = Hapi.server({
            host:   options.address,
            port:   options.port,
            tls:    options.tls ?? undefined,
            routes: {
                cors: options.cors.length === 0 ? false : {
                    origin:         options.cors,
                    headers:        [ "Authorization", "Content-Type", "If-None-Match" ],
                    exposedHeaders: [ "Location" ],
                    maxAge:         86400
                }
            }
        })
        this.wss = new WebSocketServer({ noServer: true })
        this.installExtensions()
        this.installRoutes()
    }

    /*  start the server: open the storage and bind the listener  */
    async start (): Promise<void> {
        await this.options.store.open()
        try {
            await this.server.start()
        }
        catch (err: unknown) {
            /*  ignore a close failure to not mask the original start failure  */
            await this.options.store.close().catch(() => {})
            throw err
        }
        const scheme = this.options.tls !== null ? "https" : "http"
        this.log.write("info", `task store: listening on ${scheme}://${urlHost(this.options.address)}:${this.options.port} ` +
            `(storage plugin "${this.options.store.name}")`)
    }

    /*  stop the server: close all subscriptions with close code 1001,
        unbind the listener, and close the storage  */
    async stop (): Promise<void> {
        for (const subs of this.subs.values())
            for (const sub of subs)
                sub.ws.close(1001, "server shutting down")
        this.subs.clear()
        this.wss.close()
        await this.server.stop({ timeout: 1000 })
        await this.options.store.close()
        this.log.write("info", "task store: stopped")
    }

    /*  check a bearer token against the configured one in constant time  */
    private authorized (header: string | undefined, query: string | undefined): boolean {
        let token: string | undefined
        if (typeof header === "string") {
            const m = /^Bearer[ \t]+(\S+)[ \t]*$/i.exec(header)
            if (m === null)
                return false
            token = m[1]
        }
        else if (typeof query === "string")
            token = query
        if (token === undefined)
            return false
        const buf = Buffer.from(token, "utf8")
        return buf.length === this.token.length && crypto.timingSafeEqual(buf, this.token)
    }

    /*  read the path parameters and a single-valued query parameter  */
    private params (request: Hapi.Request): Record<string, string> {
        return request.params as Record<string, string>
    }
    private query (request: Hapi.Request, name: string): string | undefined {
        const value = request.query[name] as string | string[] | undefined
        if (Array.isArray(value))
            return value[value.length - 1]
        return value
    }

    /*  the lifecycle model as exposed by the project endpoints  */
    private projectView (project: Core.ProjectView) {
        return {
            id: project.id,
            lifecycle: {
                name:        project.lifecycle.name,
                states:      project.lifecycle.states,
                initial:     project.lifecycle.initial,
                finished:    project.lifecycle.finished,
                transitions: project.lifecycle.transitions
            }
        }
    }

    /*  strip the "created" flag of a core result and map it onto the status code  */
    private created (h: Hapi.ResponseToolkit, result: { created: boolean }) {
        const { created, ...body } = result
        return h.response(body).code(created ? 201 : 200)
    }

    /*  ==== events ====  */

    /*  deliver an event frame to the subscribers of a project, each
        restricted to the task ids it subscribed to  */
    private emit (prjId: string, frame: Core.EventFrame): void {
        const subs = this.subs.get(prjId)
        if (subs === undefined)
            return
        for (const sub of subs) {
            const out: Core.EventFrame = {}
            const keep = (id: string) => sub.tasks === null || sub.tasks.has(id)
            if (frame.added !== undefined) {
                const added = Object.fromEntries(Object.entries(frame.added).filter(([ id ]) => keep(id)))
                if (Object.keys(added).length > 0)
                    out.added = added
            }
            if (frame.updated !== undefined) {
                const updated = Object.fromEntries(Object.entries(frame.updated).filter(([ id ]) => keep(id)))
                if (Object.keys(updated).length > 0)
                    out.updated = updated
            }
            if (frame.deleted !== undefined) {
                const deleted = frame.deleted.filter((id) => keep(id))
                if (deleted.length > 0)
                    out.deleted = deleted
            }
            if (Object.keys(out).length > 0 && sub.ws.readyState === sub.ws.OPEN)
                sub.ws.send(JSON.stringify(out))
        }
    }

    /*  reject a WebSocket handshake with a plain HTTP problem response  */
    private rejectUpgrade (socket: Duplex, status: number, detail: string, instance: string): void {
        const body = JSON.stringify(Core.problemBody(status, detail, instance))
        socket.write(`HTTP/1.1 ${status} ${Core.problemTitles[status] ?? "Error"}\r\n` +
            "Content-Type: application/problem+json\r\n" +
            `Content-Length: ${Buffer.byteLength(body)}\r\n` +
            "Connection: close\r\n\r\n" + body)
        socket.end(() => { socket.destroy() })
    }

    /*  handle a WebSocket handshake on the event endpoint  */
    private async upgrade (req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
        const url  = new URL(req.url ?? "/", "http://localhost")
        const path = url.pathname
        const m    = /^\/projects\/([^/]+)\/events$/.exec(path)
        if (m === null) {
            this.rejectUpgrade(socket, 404, `no WebSocket endpoint "${path}"`, path)
            return
        }
        if (!this.authorized(req.headers.authorization, url.searchParams.get("token") ?? undefined)) {
            this.rejectUpgrade(socket, 401, "missing or invalid bearer token", path)
            return
        }
        const prjId = m[1]
        if (!TaskFormat.ID_RE.test(prjId)) {
            this.rejectUpgrade(socket, 422, `invalid project id "${prjId}" (expected: [A-Za-z0-9_-]+)`, path)
            return
        }
        if (!await this.core.projectExists(prjId)) {
            this.rejectUpgrade(socket, 404, `no project "${prjId}" registered`, path)
            return
        }
        let tasks: Set<string> | null = null
        const list = url.searchParams.get("tasks")
        if (list !== null) {
            tasks = new Set<string>()
            for (const id of list.split(",").map((token) => token.trim()).filter((token) => token !== "")) {
                if (!TaskFormat.ID_RE.test(id)) {
                    this.rejectUpgrade(socket, 422, `invalid task id "${id}" (expected: [A-Za-z0-9_-]+)`, path)
                    return
                }
                tasks.add(id)
            }
        }
        this.wss.handleUpgrade(req, socket, head, (ws) => {
            const sub: Subscription = { ws, tasks }
            let subs = this.subs.get(prjId)
            if (subs === undefined) {
                subs = new Set<Subscription>()
                this.subs.set(prjId, subs)
            }
            subs.add(sub)
            this.log.write("debug", `task store: subscribed to events of project "${prjId}"` +
                (tasks !== null ? ` (tasks: ${[ ...tasks ].join(", ")})` : ""))
            ws.on("close", () => {
                const subs = this.subs.get(prjId)
                if (subs !== undefined) {
                    subs.delete(sub)
                    if (subs.size === 0)
                        this.subs.delete(prjId)
                }
            })
            ws.on("error", (err) => {
                this.log.write("debug", `task store: WebSocket error on events of project "${prjId}": ${err.message}`)
            })
        })
    }

    /*  ==== server extensions ====  */

    /*  install the bearer token authentication, the request logging,
        the problem details rendering, and the WebSocket upgrade hook  */
    private installExtensions (): void {
        /*  authenticate every request except a CORS preflight, which
            carries no credentials by definition  */
        this.server.ext("onRequest", (request, h) => {
            if (request.method === "options")
                return h.continue
            if (!this.authorized(request.headers.authorization as string | undefined, undefined))
                return h.response(Core.problemBody(401, "missing or invalid bearer token", request.path))
                    .code(401).type("application/problem+json").takeover()
            return h.continue
        })

        /*  render thrown problems and framework errors as problem details  */
        this.server.ext("onPreResponse", (request, h) => {
            const response = request.response
            let status: number | null = null
            let detail  = ""
            if (response instanceof Core.Problem) {
                status = response.status
                detail = response.message
            }
            else if ("isBoom" in response && response.isBoom) {
                status = response.output.statusCode
                detail = response.message
            }
            if (status === null)
                return h.continue

            /*  log server-side failures in full, but expose no internals to the client  */
            if (status >= 500) {
                this.log.write("error", `task store: ${request.method.toUpperCase()} ${request.path}: ${detail}`)
                detail = "internal task store failure (see service log for details)"
            }
            else
                this.log.write("debug", `task store: ${request.method.toUpperCase()} ${request.path}: ${status}: ${detail}`)
            return h.response(Core.problemBody(status, detail, request.path))
                .code(status).type("application/problem+json")
        })

        /*  log every regular request  */
        this.server.events.on("response", (request) => {
            const response = request.response as unknown
            let code = 0
            if (typeof response === "object" && response !== null) {
                if ("isBoom" in response && response.isBoom && "output" in response)
                    code = (response as { output: { statusCode: number } }).output.statusCode
                else if ("statusCode" in response && typeof response.statusCode === "number")
                    code = response.statusCode
            }
            this.log.write("info", `task store: ${request.method.toUpperCase()} ${request.path} ${code}`)
        })

        /*  hook the WebSocket handshakes  */
        this.server.listener.on("upgrade", (req, socket, head) => {
            socket.on("error", () => { socket.destroy() })
            this.upgrade(req, socket, head).catch((err: unknown) => {
                const message = err instanceof Error ? err.message : String(err)
                this.log.write("error", `task store: WebSocket upgrade failed: ${message}`)
                socket.destroy()
            })
        })
    }

    /*  ==== routes ====  */

    /*  install the routes onto the core operations  */
    private installRoutes (): void {
        this.installProjectRoutes()
        this.installTaskRoutes()
        this.installPartRoutes()
        this.installAttachmentRoutes()
    }

    /*  install the project endpoints (and the plain HTTP fallback of the event endpoint)  */
    private installProjectRoutes (): void {
        const core = this.core
        const p    = (request: Hapi.Request) => this.params(request)

        /*  the project endpoints  */
        this.server.route({
            method:  "GET",
            path:    "/projects",
            handler: async () =>
                ({ projects: await core.projectList() })
        })
        this.server.route({
            method:  "GET",
            path:    P,
            handler: async (request) =>
                this.projectView(await core.projectGet(p(request).prjId))
        })
        this.server.route({
            method:  "PUT",
            path:    P,
            options: json,
            handler: async (request, h) => {
                const payload = request.payload as unknown
                if (payload !== null && payload !== undefined && !Core.isObject(payload))
                    throw Core.problem(400, "request body has to be an object")

                /*  "If-None-Match: *" registers the project only if not yet registered  */
                const createOnly = request.headers["if-none-match"] === "*"
                const result = await core.projectSet(p(request).prjId,
                    Core.isObject(payload) ? payload.lifecycle : undefined, createOnly)
                return h.response(this.projectView(result.project)).code(result.created ? 201 : 200)
            }
        })
        this.server.route({
            method:  "DELETE",
            path:    P,
            handler: async (request, h) => {
                const prjId = p(request).prjId
                await core.projectDelete(prjId)
                const subs = this.subs.get(prjId)
                if (subs !== undefined) {
                    for (const sub of subs)
                        sub.ws.close(1001, "project unregistered")
                    this.subs.delete(prjId)
                }
                return h.response().code(204)
            }
        })

        /*  a plain HTTP request on the event endpoint (the WebSocket
            handshakes are intercepted on the listener's "upgrade" event)  */
        this.server.route({
            method:  "GET",
            path:    `${P}/events`,
            handler: async (request) => {
                await core.projectGet(p(request).prjId)
                throw Core.problem(426, "the event endpoint requires a WebSocket handshake")
            }
        })
    }

    /*  install the task plan endpoints  */
    private installTaskRoutes (): void {
        const core = this.core
        const p    = (request: Hapi.Request) => this.params(request)

        /*  the task plan endpoints  */
        this.server.route({
            method:  "GET",
            path:    `${P}/tasks`,
            handler: async (request) => ({
                tasks: await core.taskList(p(request).prjId, this.query(request, "include"),
                    this.query(request, "exclude"), this.query(request, "fields"))
            })
        })
        this.server.route({
            method:  "DELETE",
            path:    `${P}/tasks`,
            handler: async (request) =>
                ({ purged: await core.taskPurge(p(request).prjId, this.query(request, "age")) })
        })
        this.server.route({
            method:  "GET",
            path:    T,
            handler: async (request) =>
                core.taskLoad(p(request).prjId, p(request).taskId)
        })
        this.server.route({
            method:  "PUT",
            path:    T,
            options: json,
            handler: async (request, h) =>
                this.created(h, await core.taskSave(p(request).prjId, p(request).taskId, request.payload))
        })
        this.server.route({
            method:  "PATCH",
            path:    T,
            options: json,
            handler: async (request) =>
                core.taskPatch(p(request).prjId, p(request).taskId, request.payload)
        })
        this.server.route({
            method:  "DELETE",
            path:    T,
            handler: async (request, h) => {
                await core.taskDelete(p(request).prjId, p(request).taskId)
                return h.response().code(204)
            }
        })
    }

    /*  install the header and body part endpoints  */
    private installPartRoutes (): void {
        const core = this.core
        const p    = (request: Hapi.Request) => this.params(request)

        /*  the header part endpoints  */
        this.server.route({
            method:  "GET",
            path:    `${T}/header`,
            handler: async (request) =>
                core.headerGet(p(request).prjId, p(request).taskId)
        })
        this.server.route({
            method:  "PUT",
            path:    `${T}/header`,
            options: json,
            handler: async (request) => {
                const { created, ...body } = await core.headerSet(p(request).prjId, p(request).taskId, request.payload)
                return body
            }
        })
        this.server.route({
            method:  "GET",
            path:    `${T}/header/{key}`,
            handler: async (request) =>
                ({ value: await core.headerKeyGet(p(request).prjId, p(request).taskId, p(request).key) })
        })
        this.server.route({
            method:  "PUT",
            path:    `${T}/header/{key}`,
            options: json,
            handler: async (request, h) =>
                this.created(h, await core.headerKeySet(p(request).prjId, p(request).taskId, p(request).key, request.payload))
        })
        this.server.route({
            method:  "DELETE",
            path:    `${T}/header/{key}`,
            handler: async (request, h) => {
                await core.headerKeyDelete(p(request).prjId, p(request).taskId, p(request).key)
                return h.response().code(204)
            }
        })

        /*  the body part endpoints  */
        this.server.route({
            method:  "GET",
            path:    `${T}/body`,
            handler: async (request) =>
                ({ body: await core.bodyGet(p(request).prjId, p(request).taskId) })
        })
        this.server.route({
            method:  "PUT",
            path:    `${T}/body`,
            options: json,
            handler: async (request, h) => {
                await core.bodySet(p(request).prjId, p(request).taskId, request.payload)
                return h.response().code(204)
            }
        })
    }

    /*  install the attachment part endpoints  */
    private installAttachmentRoutes (): void {
        const core = this.core
        const p    = (request: Hapi.Request) => this.params(request)

        /*  the attachment part endpoints  */
        this.server.route({
            method:  "GET",
            path:    `${T}/attachment`,
            handler: async (request) => {
                const type = this.query(request, "type")
                if (type === undefined)
                    return core.attachmentList(p(request).prjId, p(request).taskId)
                return { found: await core.attachmentFind(p(request).prjId, p(request).taskId, type) }
            }
        })
        this.server.route({
            method:  "POST",
            path:    `${T}/attachment`,
            options: json,
            handler: async (request, h) => {
                const index = await core.attachmentAdd(p(request).prjId, p(request).taskId, request.payload)
                return h.response({ index }).code(201).header("Location", `${request.path}/${index}`)
            }
        })
        this.server.route({
            method:  "GET",
            path:    `${T}/attachment/{index}`,
            handler: async (request) =>
                core.attachmentGet(p(request).prjId, p(request).taskId, p(request).index)
        })
        this.server.route({
            method:  "PUT",
            path:    `${T}/attachment/{index}`,
            options: json,
            handler: async (request, h) => {
                await core.attachmentSet(p(request).prjId, p(request).taskId, p(request).index, request.payload)
                return h.response().code(204)
            }
        })
        this.server.route({
            method:  "DELETE",
            path:    `${T}/attachment/{index}`,
            handler: async (request, h) => {
                await core.attachmentDelete(p(request).prjId, p(request).taskId, p(request).index)
                return h.response().code(204)
            }
        })
        this.server.route({
            method:  "GET",
            path:    `${T}/attachment/{index}/{key}`,
            handler: async (request) =>
                ({ value: await core.attachmentKeyGet(p(request).prjId, p(request).taskId, p(request).index, p(request).key) })
        })
        this.server.route({
            method:  "PUT",
            path:    `${T}/attachment/{index}/{key}`,
            options: json,
            handler: async (request, h) =>
                this.created(h, await core.attachmentKeySet(p(request).prjId, p(request).taskId,
                    p(request).index, p(request).key, request.payload))
        })
        this.server.route({
            method:  "DELETE",
            path:    `${T}/attachment/{index}/{key}`,
            handler: async (request, h) => {
                await core.attachmentKeyDelete(p(request).prjId, p(request).taskId, p(request).index, p(request).key)
                return h.response().code(204)
            }
        })
    }
}

