/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import path                                               from "node:path"
import fs                                                 from "node:fs"

import type { Agent }                                     from "undici"
import { WebSocket }                                      from "ws"
import { LRUCache }                                       from "lru-cache"

import type Log                                           from "./ase-lib-log.js"
import { dispatchFetch, insecureAgent }                   from "./ase-lib-fetch.js"
import { Config }                                         from "./ase-config-core.js"
import { configSchema }                                   from "./ase-config-schema.js"
import { parseScope, userStateDir }                       from "./ase-config-scope.js"
import type * as API                                      from "./ase-task-store-plugin-api.js"
import * as Delegate                                      from "./ase-task-store-plugin-delegate.js"
import * as Core                                          from "./ase-task-store-core.js"
import * as TaskFormat                                    from "./ase-task-format.js"

/*  the client-side view onto a task store, either the in-process
    REST API functionality on a built-in storage plugin (a local
    "ase:<path>", "github:<owner>/<repo>", "github+http[s]://<host>/<owner>/<repo>", "gitlab:[//<host>/]<namespace>/<project>",
    "gitlab+http[s]://<host>/<namespace>/<project>", or "gitea+http[s]://<host>/<owner>/<repo>" store) or the remote REST API (an
    "ase[s]://<addr>:<port>[/<token>]" store); a missing task plan is reported as null resp. false; the
    effective lifecycle model and task id scheme are known after the opening only  */
export interface TaskStoreClient {
    lifecycle: TaskFormat.TaskLifecycle
    idscheme:  string
    setLifecycle (name: string): Promise<void>
    setIdScheme  (spec: string): Promise<void>
    open   (): Promise<void>
    close  (): Promise<void>
    newId  (title: string, proposal: string, taken: string[]): Promise<{ scheme: string, id: string }>
    list   (fields?: "header" | "usage"): Promise<Core.TaskListEntry[]>
    load   (id: string): Promise<API.TaskPlan | null>
    save   (id: string, plan: API.TaskPlan, tag?: string, create?: boolean): Promise<string | undefined>
    patch  (id: string, change: { status?: string, id?: string }): Promise<Core.TaskPatchResult | null>
    delete (id: string): Promise<boolean>
    purge  (age: string): Promise<string[]>
    content (id: string, index: number): Promise<{ type: string, content: Buffer } | null>
    attach (id: string, attachment: API.TaskAttachment, append?: boolean): Promise<boolean>
    subscribe (onChange: () => void, onState?: (connected: boolean) => void): () => void
}

/*  the built-in storage plugin of a local store: its name, its options,
    and the key identifying the store (e.g. its base directory)  */
export type LocalTaskStorage = { plugin: string, options: Record<string, unknown>, key: string }

/*  the opened storage delegate of a local store, shared by reference count,
    together with the listeners of its change events  */
interface LocalTaskStoreShared {
    refs:      number
    listeners: Set<Core.EventListener>
    opened:    Promise<{ store: Delegate.TaskStore, core: Core.TaskStoreCore }>
}

/*  the local client: the REST API functionality operating in-process
    on a built-in storage plugin (the "ase" one in "solo" mode), with the project
    registered under its configured lifecycle model and task id scheme on every open  */
export class LocalTaskStoreClient implements TaskStoreClient {
    /*  the storage delegates, shared by all concurrently open clients of the
        same store (keyed by the store only, as the lifecycle model and task
        id scheme are re-registered on every open and hence survive a switch without a
        second delegate), so its per-project queue serializes in-process, too  */
    private static shared = new Map<string, LocalTaskStoreShared>()
    private entry: LocalTaskStoreShared | undefined
    private core!: Core.TaskStoreCore
    constructor (private prjId: string, public lifecycle: TaskFormat.TaskLifecycle, public idscheme: string,
        private storage: LocalTaskStorage, private log: Log) {}
    /*  persist a configuration key on scope "project" (which the local store always follows)  */
    private configure (key: string, value: string): void {
        const cfg = new Config("config", configSchema, this.log, parseScope("project"))
        cfg.lock(() => {
            cfg.read()
            cfg.set(key, value)
            cfg.write()
        })
    }
    /*  switch the lifecycle model by persisting "project.task.lifecycle"
        and re-registering the project (mapping the plan states)  */
    async setLifecycle (name: string): Promise<void> {
        this.configure("project.task.lifecycle", name)
        this.lifecycle = (await this.core.projectSet(this.prjId, { lifecycle: name })).project.lifecycle
    }
    /*  switch the task id scheme by persisting "project.task.idscheme" and re-registering the project  */
    async setIdScheme (spec: string): Promise<void> {
        this.configure("project.task.idscheme", spec)
        this.idscheme = (await this.core.projectSet(this.prjId, { idscheme: spec })).project.idscheme
    }
    /*  run an operation, yielding a fallback for a missing (404) task plan  */
    private async missing<T> (op: () => Promise<T>, fallback: T): Promise<T> {
        try {
            return await op()
        }
        catch (err: unknown) {
            if (err instanceof Core.Problem && err.status === 404)
                return fallback
            throw err
        }
    }
    /*  open the storage delegate shared by all clients of the store and register the project  */
    async open (): Promise<void> {
        let entry = LocalTaskStoreClient.shared.get(this.storage.key)
        if (entry === undefined) {
            const listeners = new Set<Core.EventListener>()
            const opened = (async () => {
                const plugin = await Delegate.loadTaskStoragePlugin(this.storage.plugin, {
                    options: this.storage.options,
                    log:     (level, message) => this.log.write(level, `task: store: ${message}`)
                })
                const store = new Delegate.TaskStore(plugin)
                const core  = new Core.TaskStoreCore(store, (prjId, frame) => {
                    for (const listener of listeners)
                        listener(prjId, frame)
                })
                await store.open()
                return { store, core }
            })()
            entry = { refs: 0, listeners, opened }
            LocalTaskStoreClient.shared.set(this.storage.key, entry)
        }
        entry.refs++
        this.entry = entry
        try {
            this.core = (await entry.opened).core
            await this.core.projectSet(this.prjId, { lifecycle: this.lifecycle.name, idscheme: this.idscheme })
        }
        catch (err: unknown) {
            await this.close()
            throw err
        }
    }
    /*  release the shared storage delegate, closing it with its last client  */
    async close (): Promise<void> {
        const entry = this.entry
        if (entry === undefined)
            return
        this.entry = undefined
        if (--entry.refs === 0) {
            if (LocalTaskStoreClient.shared.get(this.storage.key) === entry)
                LocalTaskStoreClient.shared.delete(this.storage.key)
            await entry.opened.then((opened) => opened.store.close(), () => {
                /*  a failed opening was already raised to its opener  */
            })
        }
    }
    list (fields?: "header" | "usage"): Promise<Core.TaskListEntry[]> {
        return this.core.taskList(this.prjId, "none", "none", fields ?? "none")
    }
    load (id: string): Promise<API.TaskPlan | null> {
        return this.missing(() => this.core.taskLoad(this.prjId, id), null)
    }
    async save (id: string, plan: API.TaskPlan, tag?: string, create = false): Promise<string | undefined> {
        return (await this.core.taskSave(this.prjId, id, plan, tag, create)).tag
    }
    newId (title: string, proposal: string, taken: string[]): Promise<{ scheme: string, id: string }> {
        return this.core.taskNewId(this.prjId, { title, proposal, taken })
    }
    patch (id: string, change: { status?: string, id?: string }): Promise<Core.TaskPatchResult | null> {
        return this.missing(() => this.core.taskPatch(this.prjId, id, change), null)
    }
    delete (id: string): Promise<boolean> {
        return this.missing(async () => {
            await this.core.taskDelete(this.prjId, id)
            return true
        }, false)
    }
    purge (age: string): Promise<string[]> {
        return this.core.taskPurge(this.prjId, age)
    }
    content (id: string, index: number): Promise<{ type: string, content: Buffer } | null> {
        return this.missing(() => this.core.attachmentContent(this.prjId, id, String(index)), null)
    }
    attach (id: string, attachment: API.TaskAttachment, append = false): Promise<boolean> {
        return this.missing(async () => {
            await this.core.attachmentAdd(this.prjId, id, attachment, append)
            return true
        }, false)
    }

    /*  subscribe to the change events of the project, i.e. the changes made
        in-process plus the ones detected by the storage plugin itself (e.g.
        by polling a remote storage), keeping the store opened meanwhile and
        reporting it as connected once opened; returns a function to unsubscribe  */
    subscribe (onChange: () => void, onState?: (connected: boolean) => void): () => void {
        const listener: Core.EventListener = (prjId) => {
            if (prjId === this.prjId)
                onChange()
        }
        let stopped = false
        let started = false
        const start = async (): Promise<void> => {
            await this.open()
            if (stopped)
                await this.close()
            else {
                started = true
                this.entry?.listeners.add(listener)
                onState?.(true)
            }
        }
        start().catch((err: unknown) => {
            this.log.write("warning", `task: store: subscription failed: ${err instanceof Error ? err.message : String(err)}`)
        })
        return () => {
            stopped = true
            if (!started)
                return
            this.entry?.listeners.delete(listener)
            this.close().catch(() => {})
        }
    }
}

/*  the project as exposed by the project endpoints of a task store server
    (with the task id scheme and sequence number high-water mark absent on servers predating them)  */
type RemoteProject = { id: string, lifecycle: { name: string }, idscheme?: string, seqmark?: number }

/*  the interval of the keepalive pings of the event subscription (where a connection without
    any traffic for this interval is pinged and without any traffic for twice this interval
    is terminated), the timeout of its WebSocket handshake, and the timeout of the REST API requests  */
const KEEPALIVE_MS = 15 * 1000
const HANDSHAKE_MS = 10 * 1000
const REQUEST_MS   = 10 * 1000

/*  the remote client: the REST API of a task store server, with the
    project registered under its configured lifecycle model and task id
    scheme on first use only (afterwards adopting the lifecycle model and
    task id scheme of the registered project) and every problem details
    response raised as an error; an "insecure" client skips the TLS
    certificate verification  */
export class RemoteTaskStoreClient implements TaskStoreClient {
    /*  the effective lifecycle models and task id schemes of the registered projects
        (TTL-bounded, to spare consecutive operations the registration round-trips)  */
    private static registered = new LRUCache<string, { lifecycle: TaskFormat.TaskLifecycle, idscheme: string }>({ max: 16, ttl: 10 * 1000 })
    private dispatcher: Agent | undefined
    public  lifecycle:  TaskFormat.TaskLifecycle
    public  idscheme:   string
    constructor (private prjId: string, private configured: TaskFormat.TaskLifecycle, private configuredIdScheme: string,
        private log: Log, private base: string, private token: string, private insecure: boolean) {
        this.lifecycle  = configured
        this.idscheme   = configuredIdScheme
        this.dispatcher = insecure ? insecureAgent() : undefined
    }
    /*  raise a failed connection as an unreachable store error,
        reporting the innermost cause (like "connect ECONNREFUSED")  */
    private unreachable (err: unknown): never {
        let cause = err
        while (cause instanceof Error && cause.cause instanceof Error)
            cause = cause.cause
        const reason = cause instanceof Error ? cause.message : String(cause)
        throw new Error(`task: store "${this.base}" unreachable: ${reason}`, { cause: err })
    }
    /*  perform a request: a 404 response or a tolerated error response yields
        a null result, any other error response is raised as a problem carrying
        its status, and a failed connection is raised as an unreachable store error  */
    private async request<T> (method: string, url: string, body?: unknown,
        headers: Record<string, string> = {}, tolerated: number[] = []): Promise<T | null> {
        const r = await dispatchFetch.raw(`${this.base}${url}`, {
            method,
            headers: {
                Authorization: `Bearer ${this.token}`,
                ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
                ...headers
            },
            body:                body !== undefined ? JSON.stringify(body) : undefined,
            dispatcher:          this.dispatcher,
            signal:              AbortSignal.timeout(REQUEST_MS),
            ignoreResponseError: true
        }).catch((err: unknown) => this.unreachable(err))
        if (r.status === 404 || tolerated.includes(r.status))
            return null
        if (r.status < 200 || r.status >= 300) {
            const d = r._data as { detail?: string, title?: string } | null
            throw new Core.Problem(r.status, `store "${this.base}": ${d?.detail ?? d?.title ?? `HTTP ${r.status}`}`)
        }
        return (r._data ?? {}) as T
    }
    private get tasks (): string {
        return `/projects/${this.prjId}/tasks`
    }
    private get key (): string {
        return `${this.base}/${this.prjId}`
    }
    /*  adopt the lifecycle model and task id scheme of the registered project
        (the configured task id scheme for a server predating task id schemes)  */
    private adopt (project: RemoteProject | null): void {
        if (project === null)
            throw new Core.Problem(404, `store "${this.base}": project "${this.prjId}" not registered`)
        const lifecycle = TaskFormat.taskLifecycles[project.lifecycle.name]
        if (lifecycle === undefined)
            throw new Error(`task: store "${this.base}" uses unknown lifecycle model "${project.lifecycle.name}"`)
        const idscheme = project.idscheme ?? this.configuredIdScheme
        if (TaskFormat.checkIdScheme(idscheme) !== "")
            throw new Error(`task: store "${this.base}" uses invalid task id scheme "${idscheme}"`)
        this.lifecycle = lifecycle
        this.idscheme  = idscheme
        RemoteTaskStoreClient.registered.set(this.key, { lifecycle, idscheme })
    }
    /*  raise a not registered project (dropping its cached registration)  */
    private unregistered (): never {
        RemoteTaskStoreClient.registered.delete(this.key)
        throw new Core.Problem(404, `store "${this.base}": project "${this.prjId}" not registered`)
    }
    /*  pass through a task endpoint result, disambiguating a 404 response
        (null) into a missing task or a not registered project  */
    private async task<T> (result: T | null): Promise<T | null> {
        if (result === null && await this.request<RemoteProject>("GET", `/projects/${this.prjId}`) === null)
            this.unregistered()
        return result
    }
    async open (): Promise<void> {
        const cached = RemoteTaskStoreClient.registered.get(this.key)
        if (cached !== undefined) {
            this.lifecycle = cached.lifecycle
            this.idscheme  = cached.idscheme
            return
        }

        /*  register the project only if not yet registered (via "If-None-Match: *"), as the
            lifecycle model and task id scheme of a registered project are shared by all its clients  */
        const created = await this.request<RemoteProject>("PUT", `/projects/${this.prjId}`,
            { lifecycle: this.configured.name, idscheme: this.configuredIdScheme }, { "If-None-Match": "*" }, [ 412 ])
        this.adopt(created ?? await this.request<RemoteProject>("GET", `/projects/${this.prjId}`))
        this.mismatch()
    }
    async setLifecycle (name: string): Promise<void> {
        this.adopt(await this.request<RemoteProject>("PUT", `/projects/${this.prjId}`, { lifecycle: name }))
        this.mismatch()
    }
    async setIdScheme (spec: string): Promise<void> {
        this.adopt(await this.request<RemoteProject>("PUT", `/projects/${this.prjId}`, { idscheme: spec }))
        this.mismatch()
    }

    /*  warn about a configured lifecycle model or task id scheme deviating from the
        one of the registered project, once per deviation only (persisted across processes)  */
    private mismatch (): void {
        const file = path.join(userStateDir(), "task-lifecycle.json")
        let seen: Record<string, string> = {}
        try {
            const data: unknown = JSON.parse(fs.readFileSync(file, "utf8"))
            if (typeof data === "object" && data !== null && !Array.isArray(data))
                seen = data as Record<string, string>
        }
        catch {
            /*  no (valid) state yet  */
        }
        const checks = [ {
            key:        this.key,
            config:     "project.task.lifecycle",
            cmd:        "lifecycle",
            configured: this.configured.name,
            effective:  this.lifecycle.name
        }, {
            key:        `${this.key}#idscheme`,
            config:     "project.task.idscheme",
            cmd:        "idscheme",
            configured: this.configuredIdScheme,
            effective:  this.idscheme
        } ]
        let changed = false
        for (const check of checks) {
            const pair = check.effective !== check.configured ?
                `${check.configured}:${check.effective}` : undefined
            if (seen[check.key] === pair)
                continue
            changed = true
            if (pair === undefined)
                seen = Object.fromEntries(Object.entries(seen).filter(([ key ]) => key !== check.key))
            else {
                seen[check.key] = pair
                this.log.write("warning", `task: configured "${check.config}" "${check.configured}" ignored, ` +
                    `as store "${this.base}" uses "${check.effective}" for project "${this.prjId}" ` +
                    `(align the configuration via "ase config --scope project set ${check.config} ${check.effective}", ` +
                    `or switch the store via "ase task ${check.cmd} ${check.configured}"; reported once only)`)
            }
        }
        if (!changed)
            return
        try {
            fs.mkdirSync(path.dirname(file), { recursive: true })
            fs.writeFileSync(file, JSON.stringify(seen, null, 4) + "\n", "utf8")
        }
        catch {
            /*  best-effort only (the warning then repeats)  */
        }
    }
    async close (): Promise<void> {
        await this.dispatcher?.close()
    }
    async list (fields?: "header" | "usage"): Promise<Core.TaskListEntry[]> {
        const url = this.tasks + (fields !== undefined ? `?fields=${fields}` : "")
        return (await this.request<{ tasks: Core.TaskListEntry[] }>("GET", url) ?? this.unregistered()).tasks
    }
    async load (id: string): Promise<API.TaskPlan | null> {
        return this.task(await this.request<API.TaskPlan>("GET", `${this.tasks}/${encodeURIComponent(id)}`))
    }
    async save (id: string, plan: API.TaskPlan, tag?: string, create = false): Promise<string | undefined> {
        const result = await this.request<{ status: string, tag?: string }>("PUT", `${this.tasks}/${encodeURIComponent(id)}`, plan, {
            ...(tag !== undefined ? { "If-Match": `"${tag}"` } : {}),
            ...(create ? { "If-None-Match": "*" } : {})
        })
        if (result === null)
            this.unregistered()
        return result.tag
    }

    /*  allocate the next free task id on the server, falling back to determining
        it locally (without any reservation) on a server predating the allocation  */
    async newId (title: string, proposal: string, taken: string[]): Promise<{ scheme: string, id: string }> {
        const result = await this.request<{ scheme: string, id: string }>("POST", `/projects/${this.prjId}/newid`,
            { title, proposal, taken })
        if (result !== null)
            return result
        const project = await this.request<RemoteProject>("GET", `/projects/${this.prjId}`) ?? this.unregistered()
        const spec    = project.idscheme ?? this.idscheme
        const ids     = [ ...(await this.list()).map((item) => item.id), ...taken ]
        try {
            return { scheme: spec, id: TaskFormat.nextTaskId(TaskFormat.parseIdScheme(spec), ids, title, proposal, project.seqmark ?? 0) }
        }
        catch (err: unknown) {
            throw new Core.Problem(422, err instanceof Error ? err.message : String(err))
        }
    }
    async patch (id: string, change: { status?: string, id?: string }): Promise<Core.TaskPatchResult | null> {
        return this.task(await this.request<Core.TaskPatchResult>("PATCH", `${this.tasks}/${encodeURIComponent(id)}`, change))
    }
    async delete (id: string): Promise<boolean> {
        return await this.task(await this.request<object>("DELETE", `${this.tasks}/${encodeURIComponent(id)}`)) !== null
    }
    async purge (age: string): Promise<string[]> {
        const result = await this.request<{ purged: string[] }>("DELETE", `${this.tasks}?age=${encodeURIComponent(age)}`)
        return (result ?? this.unregistered()).purged
    }
    async attach (id: string, attachment: API.TaskAttachment, append = false): Promise<boolean> {
        return await this.task(await this.request<object>("POST",
            `${this.tasks}/${encodeURIComponent(id)}/attachment${append ? "?append=true" : ""}`, attachment)) !== null
    }
    async content (id: string, index: number): Promise<{ type: string, content: Buffer } | null> {
        const r = await dispatchFetch.raw<ArrayBuffer, "arrayBuffer">(`${this.base}${this.tasks}/${encodeURIComponent(id)}/attachment/${index}/content`, {
            headers:             { Authorization: `Bearer ${this.token}` },
            responseType:        "arrayBuffer",
            dispatcher:          this.dispatcher,
            signal:              AbortSignal.timeout(REQUEST_MS),
            ignoreResponseError: true
        }).catch((err: unknown) => this.unreachable(err))
        if (r.status === 404)
            return this.task<{ type: string, content: Buffer }>(null)
        if (r.status < 200 || r.status >= 300)
            throw new Core.Problem(r.status, `store "${this.base}": HTTP ${r.status}`)
        return { type: r.headers.get("content-type") ?? "application/octet-stream", content: Buffer.from(r._data ?? new ArrayBuffer(0)) }
    }

    /*  subscribe to the change events of the project via the WebSocket event
        endpoint, reconnecting after a connection loss, a failed or timed out
        handshake, or a connection without any traffic despite keepalive pings
        (e.g. a half-open one after a network partition), with a change notification
        on reconnect (as events may have been missed, incl. lifecycle model changes),
        reporting each change of the connection state (initially disconnected);
        returns a function to unsubscribe  */
    subscribe (onChange: () => void, onState?: (connected: boolean) => void): () => void {
        const url = `${this.base.replace(/^http/, "ws")}/projects/${this.prjId}/events`
        let ws:      WebSocket | null = null
        let timer:   ReturnType<typeof setTimeout> | null = null
        let stopped  = false
        let failed   = false
        const connect = (): void => {
            const sock = new WebSocket(url, {
                headers:            { Authorization: `Bearer ${this.token}` },
                rejectUnauthorized: !this.insecure,
                handshakeTimeout:   HANDSHAKE_MS
            })
            ws = sock

            /*  keep the connection alive: record any traffic (the frames, and the pings
                of the task store and the pongs of our own pings), and terminate the
                connection if there was none since the previous (then unanswered) ping  */
            let traffic  = true
            let watchdog: ReturnType<typeof setInterval> | null = null
            const alive  = () => { traffic = true }
            sock.on("ping", alive)
            sock.on("pong", alive)
            sock.on("open", () => {
                watchdog = setInterval(() => {
                    if (!traffic) {
                        this.log.write("debug", `task: store "${this.base}": events: connection unresponsive -- reconnecting`)
                        sock.terminate()
                        return
                    }
                    traffic = false
                    sock.ping()
                }, KEEPALIVE_MS)
                if (failed) {
                    RemoteTaskStoreClient.registered.delete(this.key)
                    onChange()
                }
                failed = false
                onState?.(true)
            })
            sock.on("message", (data) => {
                traffic = true

                /*  drop the cached registration on a lifecycle model or task id scheme change  */
                try {
                    const frame = JSON.parse(String(data)) as Core.EventFrame
                    if (frame.lifecycle !== undefined || frame.idscheme !== undefined)
                        RemoteTaskStoreClient.registered.delete(this.key)
                }
                catch {
                    /*  ignore malformed frames (the change is notified anyway)  */
                }
                onChange()
            })
            sock.on("error", (err) => {
                this.log.write("debug", `task: store "${this.base}": events: ${err.message}`)
            })
            sock.on("close", () => {
                if (watchdog !== null)
                    clearInterval(watchdog)
                ws     = null
                failed = true
                if (!stopped) {
                    onState?.(false)
                    timer = setTimeout(connect, 2000)
                }
            })
        }
        connect()
        return () => {
            stopped = true
            if (timer !== null)
                clearTimeout(timer)
            ws?.close()
            this.close().catch(() => {
                /*  best-effort release of the dispatcher on unsubscribe  */
            })
        }
    }
}

