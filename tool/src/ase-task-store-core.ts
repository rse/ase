/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import { DateTime }    from "luxon"

import * as API        from "./ase-task-store-plugin-api.js"
import * as Delegate   from "./ase-task-store-plugin-delegate.js"
import * as TaskFormat from "./ase-task-format.js"

/*  the RFC 9457 problem titles per status code  */
export const problemTitles: Record<number, string> = {
    400: "Bad Request",
    401: "Unauthorized",
    404: "Not Found",
    409: "Conflict",
    412: "Precondition Failed",
    413: "Content Too Large",
    415: "Unsupported Media Type",
    422: "Unprocessable Content",
    426: "Upgrade Required",
    500: "Internal Server Error"
}

/*  an error carrying its HTTP status, rendered as RFC 9457 problem details  */
export class Problem extends Error {
    constructor (public status: number, detail: string) {
        super(detail)
    }
}

/*  create a problem and render its RFC 9457 problem details body  */
export const problem = (status: number, detail: string): Problem =>
    new Problem(status, detail)
export const problemBody = (status: number, detail: string, instance: string) => ({
    type:     "about:blank",
    title:    problemTitles[status] ?? "Error",
    status,
    detail,
    instance
})

/*  the change events of a single modifying request  */
export type EventEntry = { status: string, title: string }
export type EventFrame = {
    added?:     Record<string, EventEntry>
    updated?:   Record<string, EventEntry & { parts: string[] }>
    deleted?:   string[]
    lifecycle?: string
}
export type EventListener = (prjId: string, frame: EventFrame) => void

/*  the results of the core operations  */
export type ProjectView     = { id: string, lifecycle: TaskFormat.TaskLifecycle }
export type TaskListEntry   = { id: string, status: string, title: string, mtime: string, header?: API.TaskHeader }
export type TaskSaveResult  = { created: boolean, id: string, status: string }
export type TaskPatchResult = { id: string, status: string, from?: string }
export type KeySetResult    = { created: boolean, key: string, value: API.TaskHeaderValue }

/*  the plain-object check  */
export const isObject = (x: unknown): x is Record<string, unknown> =>
    typeof x === "object" && x !== null && !Array.isArray(x)

/*  the key pattern of header and attachment keys, as required by the task plan text format  */
const KEY_RE = /^[A-Za-z]+$/

/*  the transport-agnostic REST API functionality: validation, lifecycle
    model checks, the part operations (as read-modify-write cycles on
    entire plans), purge, and event notification, with all operations
    of a project strictly serialized (hence not nestable),
    delegating the persistence into the storage plugin behind the
    "TaskStore"; every failure is a "Problem" carrying its HTTP status  */
export class TaskStoreCore {
    constructor (private store: Delegate.TaskStore, private listener: EventListener = () => {}) {}

    /*  ==== validation helpers ====  */

    /*  validate a project or task id  */
    private validateId (kind: "project" | "task", id: string): string {
        if (!TaskFormat.ID_RE.test(id))
            throw problem(422, `invalid ${kind} id "${id}" (expected: [A-Za-z0-9_-]+)`)
        return id
    }

    /*  resolve a registered project and its lifecycle model  */
    private async project (prjId: string): Promise<ProjectView> {
        this.validateId("project", prjId)
        const entry = await this.store.projectGet(prjId)
        if (entry === null)
            throw problem(404, `no project "${prjId}" registered`)
        const lifecycle = Object.hasOwn(TaskFormat.taskLifecycles, entry.lifecycle) ? TaskFormat.taskLifecycles[entry.lifecycle] : undefined
        if (lifecycle === undefined)
            throw problem(500, `project "${prjId}" carries unknown lifecycle model "${entry.lifecycle}"`)
        return { id: entry.id, lifecycle }
    }

    /*  load an existing task plan of a registered project  */
    private async plan (prjId: string, taskId: string): Promise<{ lifecycle: TaskFormat.TaskLifecycle, plan: API.TaskPlan }> {
        const { lifecycle } = await this.project(prjId)
        this.validateId("task", taskId)
        const plan = await this.store.taskLoad(prjId, taskId)
        if (plan === null)
            throw problem(404, `no task "${taskId}" in project "${prjId}"`)
        return { lifecycle, plan }
    }

    /*  run an operation of a project strictly serialized, and load
        an existing task plan as such an operation of its own  */
    private serialize<T> (prjId: string, op: () => Promise<T>): Promise<T> {
        this.validateId("project", prjId)
        return this.store.serialize(prjId, op)
    }
    private read (prjId: string, taskId: string): Promise<{ lifecycle: TaskFormat.TaskLifecycle, plan: API.TaskPlan }> {
        return this.serialize(prjId, () => this.plan(prjId, taskId))
    }

    /*  validate a header value against the type defined for its key, normalized
        like the task plan text does (values trimmed, empty array items dropped)  */
    private validateHeaderValue (key: string, value: unknown): API.TaskHeaderValue {
        if (!KEY_RE.test(key))
            throw problem(422, `invalid header key "${key}" (expected: [A-Za-z]+)`)
        if (TaskFormat.arrayKeys.includes(key)) {
            if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && !/[\r\n,]/.test(item)))
                throw problem(422, `header key "${key}" requires an array of single-line strings without commas`)
            return (value as string[]).map((item) => item.trim()).filter((item) => item !== "")
        }
        if (typeof value !== "string" || /[\r\n]/.test(value))
            throw problem(422, `header key "${key}" requires a single-line string value`)
        return value.trim()
    }

    /*  validate an entire header: the fixed "Type" and "Id" keys are
        filled in if absent and rejected if mismatching, every other key
        is checked against its type, and "Status" is upper-cased  */
    private validateHeader (taskId: string, raw: unknown): API.TaskHeader {
        if (!isObject(raw))
            throw problem(400, "\"header\" has to be a key/value object")
        const header: API.TaskHeader = {}
        for (const [ key, value ] of Object.entries(raw))
            header[key] = this.validateHeaderValue(key, value)
        if (header.Type === undefined)
            header.Type = TaskFormat.TASK_TYPE
        else if (header.Type !== TaskFormat.TASK_TYPE)
            throw problem(422, `header key "Type" has to be "${TaskFormat.TASK_TYPE}"`)
        if (header.Id === undefined)
            header.Id = taskId
        else if (header.Id !== taskId)
            throw problem(422, `header key "Id" has to be "${taskId}"`)
        if (typeof header.Status === "string")
            header.Status = header.Status.trim().toUpperCase()
        return header
    }

    /*  validate a body: a string surviving a round-trip through the task plan text,
        normalized like the task plan text does (LF line endings, exactly one trailing newline)  */
    private validateBody (raw: unknown): string {
        if (typeof raw !== "string")
            throw problem(400, "\"body\" has to be a string")
        const conflict = TaskFormat.bodyConflict(raw)
        if (conflict !== null)
            throw problem(422, `invalid "body": ${conflict}`)
        const body = raw.replace(/\r\n/g, "\n").replace(/\n+$/, "")
        return body !== "" ? `${body}\n` : ""
    }

    /*  validate an attachment: a flat string-valued object with a "Type"
        other than the task type and exactly one of "Data" or "File",
        normalized like the task plan text does ("Data" with LF line endings,
        all other values trimmed)  */
    private validateAttachment (raw: unknown): API.TaskAttachment {
        if (!isObject(raw))
            throw problem(422, "attachment has to be a key/value object")
        const attachment: API.TaskAttachment = {}
        for (const [ key, value ] of Object.entries(raw)) {
            if (!KEY_RE.test(key))
                throw problem(422, `invalid attachment key "${key}" (expected: [A-Za-z]+)`)
            if (typeof value !== "string" || (key !== "Data" && /[\r\n]/.test(value)))
                throw problem(422, `attachment key "${key}" requires a${key !== "Data" ? " single-line" : ""} string value`)
            attachment[key] = key === "Data" ? value.replace(/\r\n/g, "\n") : value.trim()
        }
        if (attachment.Type === undefined || attachment.Type.trim() === "")
            throw problem(422, "attachment requires a \"Type\" key")
        if (attachment.Type.trim().toLowerCase() === TaskFormat.TASK_TYPE)
            throw problem(422, `attachment key "Type" must not be "${TaskFormat.TASK_TYPE}"`)
        if ((attachment.Data === undefined) === (attachment.File === undefined))
            throw problem(422, "attachment requires exactly one of the keys \"Data\" or \"File\"")
        return attachment
    }

    /*  validate an entire task plan structure  */
    private validatePlan (taskId: string, raw: unknown): API.TaskPlan {
        if (!isObject(raw))
            throw problem(400, "request body has to be a task plan object")
        if (raw.header === undefined)
            throw problem(400, "task plan lacks the \"header\" field")
        if (raw.body === undefined)
            throw problem(400, "task plan lacks the \"body\" field")
        let attachment: API.TaskAttachment[] = []
        if (raw.attachment !== undefined) {
            if (!Array.isArray(raw.attachment))
                throw problem(422, "\"attachment\" has to be an array")
            attachment = raw.attachment.map((item) => this.validateAttachment(item))
        }
        return {
            header: this.validateHeader(taskId, raw.header),
            body:   this.validateBody(raw.body),
            attachment
        }
    }

    /*  validate an attachment index  */
    private validateIndex (plan: API.TaskPlan, raw: string): number {
        if (!/^\d+$/.test(raw))
            throw problem(422, `invalid attachment index "${raw}" (expected: a non-negative integer)`)
        const index = Number.parseInt(raw, 10)
        if (index >= plan.attachment.length)
            throw problem(404, `no attachment at index ${index}`)
        return index
    }

    /*  resolve a "status" input against the lifecycle model: a state
        of the model (case-insensitively), else a 422 problem  */
    private validateState (lifecycle: TaskFormat.TaskLifecycle, raw: unknown): string {
        if (typeof raw !== "string")
            throw problem(400, "\"status\" has to be a string")
        const state = raw.trim().toUpperCase()
        if (!lifecycle.states.includes(state))
            throw problem(422, `invalid status "${raw}" ` +
                `(expected one of: ${lifecycle.states.join(", ")})`)
        return state
    }

    /*  check a status change against the lifecycle model, else a 422 problem  */
    private checkStatus (lifecycle: TaskFormat.TaskLifecycle, from: string, to: string): void {
        const error = TaskFormat.checkStatus(lifecycle, from, to)
        if (error !== "")
            throw problem(422, error)
    }

    /*  parse the "include"/"exclude" lists into the effective state set
        a task plan has to be in to be listed  */
    private states (lifecycle: TaskFormat.TaskLifecycle, include: string, exclude: string): string[] {
        try {
            return TaskFormat.resolveStates(lifecycle, include, exclude)
        }
        catch (err) {
            throw problem(422, err instanceof Error ? err.message : String(err))
        }
    }

    /*  the event entry of a plan and the "updated" event emission  */
    private entry (plan: API.TaskPlan, lifecycle: TaskFormat.TaskLifecycle): EventEntry {
        return { status: TaskFormat.taskStatus(plan.header, lifecycle), title: TaskFormat.taskTitle(plan.body) }
    }
    private emitUpdated (prjId: string, taskId: string, plan: API.TaskPlan, lifecycle: TaskFormat.TaskLifecycle, parts: string[]): void {
        this.listener(prjId, { updated: { [taskId]: { ...this.entry(plan, lifecycle), parts } } })
    }

    /*  run a read-modify-write cycle on an existing plan as a serialized operation  */
    private async modify<T> (prjId: string, taskId: string, part: string,
        op: (plan: API.TaskPlan, lifecycle: TaskFormat.TaskLifecycle) => T): Promise<T> {
        return this.serialize(prjId, async () => {
            const { lifecycle, plan } = await this.plan(prjId, taskId)
            const result = op(plan, lifecycle)
            await this.store.taskSave(prjId, taskId, plan)
            this.emitUpdated(prjId, taskId, plan, lifecycle, [ part ])
            return result
        })
    }

    /*  ==== project operations ====  */

    async projectList (): Promise<API.ProjectEntry[]> {
        const projects = await this.store.projectList()
        projects.sort((a, b) => a.id.localeCompare(b.id))
        return projects
    }
    async projectGet (prjId: string): Promise<ProjectView> {
        return this.serialize(prjId, () => this.project(prjId))
    }
    async projectExists (prjId: string): Promise<boolean> {
        return TaskFormat.ID_RE.test(prjId) && await this.serialize(prjId, () => this.store.projectGet(prjId)) !== null
    }
    /*  register a project or change its lifecycle model (without one, a registered
        project keeps its model and a new one gets "solo"), mapping the status of
        its plans onto a changed model; in "createOnly" mode an already
        registered project is left alone and reported as 412  */
    async projectSet (prjId: string, raw: unknown, createOnly = false): Promise<{ created: boolean, project: ProjectView }> {
        this.validateId("project", prjId)
        if (raw !== undefined && typeof raw !== "string")
            throw problem(400, "\"lifecycle\" has to be a string")
        return this.serialize(prjId, async () => {
            const entry = await this.store.projectGet(prjId)
            if (createOnly && entry !== null)
                throw problem(412, `project "${prjId}" already registered`)
            const name = raw ?? entry?.lifecycle ?? "solo"
            const lifecycle = Object.hasOwn(TaskFormat.taskLifecycles, name) ? TaskFormat.taskLifecycles[name] : undefined
            if (lifecycle === undefined)
                throw problem(422, `unknown lifecycle model "${name}" ` +
                    `(expected one of: ${Object.keys(TaskFormat.taskLifecycles).join(", ")})`)

            /*  map the status of the plans before switching the model, so an
                interrupted switch can be repeated (mapped states being foreign
                to the old model are kept)  */
            const prev = entry !== null && entry.lifecycle !== name && Object.hasOwn(TaskFormat.taskLifecycles, entry.lifecycle) ?
                TaskFormat.taskLifecycles[entry.lifecycle] : undefined
            if (prev !== undefined) {
                for (const { id, header } of await this.store.taskList(prjId)) {
                    if (typeof header.Status !== "string" || header.Status.trim() === "")
                        continue
                    const from = TaskFormat.taskStatus(header, prev)
                    const to   = TaskFormat.mapStatus(prev, lifecycle, from)
                    if (to === from)
                        continue
                    const plan = await this.store.taskLoad(prjId, id)
                    if (plan === null)
                        continue
                    plan.header.Status = to
                    await this.store.taskSave(prjId, id, plan)
                    this.emitUpdated(prjId, id, plan, lifecycle, [ "header" ])
                }
            }
            const result = await this.store.projectSet(prjId, name)
            if (entry !== null && entry.lifecycle !== name)
                this.listener(prjId, { lifecycle: name })
            return { created: result === "created", project: { id: prjId, lifecycle } }
        })
    }
    async projectDelete (prjId: string): Promise<void> {
        if (!await this.serialize(prjId, () => this.store.projectDelete(prjId)))
            throw problem(404, `no project "${prjId}" registered`)
    }

    /*  ==== task plan operations ====  */

    /*  list the task plans passing the "include"/"exclude" state filter,
        optionally with their entire header  */
    async taskList (prjId: string, include = "none", exclude = "none", fields = "none"): Promise<TaskListEntry[]> {
        return this.serialize(prjId, async () => {
            const { lifecycle } = await this.project(prjId)
            const states = this.states(lifecycle, include, exclude)
            if (fields !== "none" && fields !== "header")
                throw problem(422, `invalid "fields" value "${fields}" (expected: "header" or "none")`)
            const entries = await this.store.taskList(prjId)
            entries.sort((a, b) => a.id.localeCompare(b.id))
            return entries
                .map((entry) => ({ entry, status: TaskFormat.taskStatus(entry.header, lifecycle) }))
                .filter(({ status }) => !lifecycle.states.includes(status) || states.includes(status))
                .map(({ entry, status }) => ({
                    id:     entry.id,
                    status,
                    title:  entry.title,
                    mtime:  DateTime.fromJSDate(entry.mtime).toFormat("yyyy-LL-dd HH:mm"),
                    ...(fields === "header" ? { header: entry.header } : {})
                }))
        })
    }

    /*  delete all task plans last modified longer ago than "age" (e.g. "31d")  */
    async taskPurge (prjId: string, age: string | undefined): Promise<string[]> {
        return this.serialize(prjId, async () => {
            await this.project(prjId)
            const m = age !== undefined ? /^(\d+)([hdmy])$/.exec(age) : null
            if (m === null)
                throw problem(400, "missing or malformed \"age\" (expected: <number><unit> with unit h, d, m, or y)")
            const hour    = 60 * 60 * 1000
            const factors: Record<string, number> = { h: hour, d: 24 * hour, m: 30 * 24 * hour, y: 365 * 24 * hour }
            const cutoff  = Date.now() - Number.parseInt(m[1], 10) * factors[m[2]]
            const purged: string[] = []
            for (const entry of await this.store.taskList(prjId))
                if (entry.mtime.getTime() < cutoff)
                    if (await this.store.taskDelete(prjId, entry.id))
                        purged.push(entry.id)
            if (purged.length > 0)
                this.listener(prjId, { deleted: purged })
            return purged
        })
    }
    async taskLoad (prjId: string, taskId: string): Promise<API.TaskPlan> {
        return (await this.read(prjId, taskId)).plan
    }

    /*  create or overwrite an entire task plan, rejecting an unreachable status  */
    async taskSave (prjId: string, taskId: string, raw: unknown): Promise<TaskSaveResult> {
        return this.serialize(prjId, async () => {
            const { lifecycle } = await this.project(prjId)
            this.validateId("task", taskId)
            const plan   = this.validatePlan(taskId, raw)
            const prev   = await this.store.taskLoad(prjId, taskId)
            const from   = prev !== null ? TaskFormat.taskStatus(prev.header, lifecycle) : lifecycle.initial
            const status = TaskFormat.taskStatus(plan.header, lifecycle)
            this.checkStatus(lifecycle, from, status)
            const result = await this.store.taskSave(prjId, taskId, plan)
            if (result === "created")
                this.listener(prjId, { added: { [taskId]: this.entry(plan, lifecycle) } })
            else
                this.emitUpdated(prjId, taskId, plan, lifecycle, [ "header", "body", "attachment" ])
            return { created: result === "created", id: taskId, status }
        })
    }

    /*  change the status of a task plan and/or rename it to a new id  */
    async taskPatch (prjId: string, taskId: string, raw: unknown): Promise<TaskPatchResult> {
        return this.serialize(prjId, async () => {
            const { lifecycle } = await this.project(prjId)
            this.validateId("task", taskId)
            if (!isObject(raw))
                throw problem(400, "request body has to be an object")
            if (raw.status === undefined && raw.id === undefined)
                throw problem(400, "request body requires at least one of the fields \"status\" or \"id\"")
            const status = raw.status !== undefined ? this.validateState(lifecycle, raw.status) : null
            let newId: string | null = null
            if (raw.id !== undefined) {
                if (typeof raw.id !== "string")
                    throw problem(400, "\"id\" has to be a string")
                this.validateId("task", raw.id)
                if (raw.id !== taskId)
                    newId = raw.id
            }
            const plan = await this.store.taskLoad(prjId, taskId)
            if (plan === null)
                throw problem(404, `no task "${taskId}" in project "${prjId}"`)
            const from = TaskFormat.taskStatus(plan.header, lifecycle)
            if (status !== null) {
                this.checkStatus(lifecycle, from, status)
                plan.header.Status = status
            }
            if (newId !== null) {
                if (await this.store.taskLoad(prjId, newId) !== null)
                    throw problem(409, `task "${newId}" already exists in project "${prjId}"`)

                /*  always rename (atomically) first and only then persist a status
                    change under the new id, so a crash never leaves both ids behind  */
                plan.header.Id = newId
                if (!await this.store.taskRename(prjId, taskId, newId))
                    throw problem(404, `no task "${taskId}" in project "${prjId}"`)
                if (status !== null)
                    await this.store.taskSave(prjId, newId, plan)
                this.listener(prjId, { deleted: [ taskId ], added: { [newId]: this.entry(plan, lifecycle) } })
            }
            else {
                await this.store.taskSave(prjId, taskId, plan)
                this.emitUpdated(prjId, taskId, plan, lifecycle, [ "header" ])
            }
            return {
                id:     newId ?? taskId,
                status: TaskFormat.taskStatus(plan.header, lifecycle),
                ...(status !== null ? { from } : {})
            }
        })
    }
    async taskDelete (prjId: string, taskId: string): Promise<void> {
        await this.serialize(prjId, async () => {
            await this.project(prjId)
            this.validateId("task", taskId)
            if (!await this.store.taskDelete(prjId, taskId))
                throw problem(404, `no task "${taskId}" in project "${prjId}"`)
            this.listener(prjId, { deleted: [ taskId ] })
        })
    }

    /*  ==== header part operations ====  */

    async headerGet (prjId: string, taskId: string): Promise<API.TaskHeader> {
        return (await this.read(prjId, taskId)).plan.header
    }

    /*  get the entire header in its textual form of the task plan text  */
    async headerContent (prjId: string, taskId: string): Promise<string> {
        return TaskFormat.formatTaskHeader((await this.read(prjId, taskId)).plan.header)
    }
    async headerSet (prjId: string, taskId: string, raw: unknown): Promise<TaskSaveResult> {
        return this.modify(prjId, taskId, "header", (plan, lifecycle) => {
            const header = this.validateHeader(taskId, raw)
            const from   = TaskFormat.taskStatus(plan.header, lifecycle)
            const status = TaskFormat.taskStatus(header, lifecycle)
            this.checkStatus(lifecycle, from, status)
            plan.header = header
            return { created: false, id: taskId, status }
        })
    }
    async headerKeyGet (prjId: string, taskId: string, key: string): Promise<API.TaskHeaderValue> {
        const { plan } = await this.read(prjId, taskId)
        if (!Object.hasOwn(plan.header, key))
            throw problem(404, `no header key "${key}"`)
        return plan.header[key]
    }
    async headerKeySet (prjId: string, taskId: string, key: string, raw: unknown): Promise<KeySetResult> {
        if (!isObject(raw) || raw.value === undefined)
            throw problem(400, "request body requires the field \"value\"")
        return this.modify(prjId, taskId, "header", (plan, lifecycle) => {
            let value = this.validateHeaderValue(key, raw.value)
            if (key === "Type" && value !== TaskFormat.TASK_TYPE)
                throw problem(422, `header key "Type" has to be "${TaskFormat.TASK_TYPE}"`)
            else if (key === "Id" && value !== taskId)
                throw problem(422, `header key "Id" has to be "${taskId}"`)
            else if (key === "Status") {
                value = this.validateState(lifecycle, value)
                this.checkStatus(lifecycle, TaskFormat.taskStatus(plan.header, lifecycle), value)
            }
            const created = !Object.hasOwn(plan.header, key)
            plan.header[key] = value
            return { created, key, value }
        })
    }
    async headerKeyDelete (prjId: string, taskId: string, key: string): Promise<void> {
        if (key === "Type" || key === "Id")
            throw problem(422, `header key "${key}" cannot be deleted`)
        await this.modify(prjId, taskId, "header", (plan, lifecycle) => {
            if (!Object.hasOwn(plan.header, key))
                throw problem(404, `no header key "${key}"`)

            /*  deleting "Status" implicitly changes the status to the initial state  */
            if (key === "Status")
                this.checkStatus(lifecycle, TaskFormat.taskStatus(plan.header, lifecycle), lifecycle.initial)
            Reflect.deleteProperty(plan.header, key)
        })
    }

    /*  ==== body part operations ====  */

    async bodyGet (prjId: string, taskId: string): Promise<string> {
        return (await this.read(prjId, taskId)).plan.body
    }
    async bodySet (prjId: string, taskId: string, raw: unknown): Promise<void> {
        if (!isObject(raw) || typeof raw.body !== "string")
            throw problem(400, "request body requires the string field \"body\"")
        const body = this.validateBody(raw.body)
        await this.modify(prjId, taskId, "body", (plan) => {
            plan.body = body
        })
    }

    /*  ==== attachment part operations ====  */

    async attachmentList (prjId: string, taskId: string): Promise<API.TaskAttachment[]> {
        return (await this.read(prjId, taskId)).plan.attachment
    }

    /*  find the attachments of a MIME type, matching its parameters only if "type" carries any  */
    async attachmentFind (prjId: string, taskId: string, type: string): Promise<{ index: number, attachment: API.TaskAttachment }[]> {
        const { plan } = await this.read(prjId, taskId)
        const wanted = type.trim().toLowerCase()
        const exact  = wanted.includes(";")
        return plan.attachment
            .map((attachment, index) => ({ index, attachment }))
            .filter(({ attachment }) => {
                const actual = (attachment.Type ?? "").trim().toLowerCase()
                return exact ? actual === wanted : actual.split(";")[0].trim() === wanted
            })
    }
    async attachmentAdd (prjId: string, taskId: string, raw: unknown): Promise<number> {
        const attachment = this.validateAttachment(raw)
        return this.modify(prjId, taskId, "attachment", (plan) =>
            plan.attachment.push(attachment) - 1)
    }
    async attachmentGet (prjId: string, taskId: string, index: string): Promise<API.TaskAttachment> {
        const { plan } = await this.read(prjId, taskId)
        return plan.attachment[this.validateIndex(plan, index)]
    }

    /*  get the raw content of an attachment: its embedded "Data", or the
        content of its "File" as read through the storage plugin  */
    async attachmentContent (prjId: string, taskId: string, index: string): Promise<{ type: string, content: Buffer }> {
        return this.serialize(prjId, async () => {
            const { plan }   = await this.plan(prjId, taskId)
            const attachment = plan.attachment[this.validateIndex(plan, index)]
            if (attachment.Data !== undefined)
                return { type: attachment.Type, content: Buffer.from(attachment.Data, "utf8") }
            if (!this.store.canReadFiles)
                throw problem(404, `storage plugin "${this.store.name}" provides no referenced file content`)
            const content = await this.store.fileRead(prjId, attachment.File)
            if (content === null)
                throw problem(404, `no referenced file "${attachment.File}"`)
            return { type: attachment.Type, content }
        })
    }
    async attachmentSet (prjId: string, taskId: string, index: string, raw: unknown): Promise<void> {
        const attachment = this.validateAttachment(raw)
        await this.modify(prjId, taskId, "attachment", (plan) => {
            plan.attachment[this.validateIndex(plan, index)] = attachment
        })
    }
    async attachmentDelete (prjId: string, taskId: string, index: string): Promise<void> {
        await this.modify(prjId, taskId, "attachment", (plan) => {
            plan.attachment.splice(this.validateIndex(plan, index), 1)
        })
    }
    async attachmentKeyGet (prjId: string, taskId: string, index: string, key: string): Promise<string> {
        const { plan } = await this.read(prjId, taskId)
        const attachment = plan.attachment[this.validateIndex(plan, index)]
        if (!Object.hasOwn(attachment, key))
            throw problem(404, `no attachment key "${key}"`)
        return attachment[key]
    }

    /*  set an attachment key, where setting "Data" or "File" drops the other one  */
    async attachmentKeySet (prjId: string, taskId: string, index: string, key: string, raw: unknown): Promise<KeySetResult> {
        if (!isObject(raw) || typeof raw.value !== "string")
            throw problem(400, "request body requires the string field \"value\"")
        const value = raw.value
        return this.modify(prjId, taskId, "attachment", (plan) => {
            const i          = this.validateIndex(plan, index)
            const created    = !Object.hasOwn(plan.attachment[i], key)
            const attachment = { ...plan.attachment[i], [key]: value }
            if (key === "Data")
                delete attachment.File
            else if (key === "File")
                delete attachment.Data
            plan.attachment[i] = this.validateAttachment(attachment)
            return { created, key, value: plan.attachment[i][key] }
        })
    }
    async attachmentKeyDelete (prjId: string, taskId: string, index: string, key: string): Promise<void> {
        if (key === "Type" || key === "Data" || key === "File")
            throw problem(422, `attachment key "${key}" cannot be deleted (delete the entire attachment instead)`)
        await this.modify(prjId, taskId, "attachment", (plan) => {
            const attachment = plan.attachment[this.validateIndex(plan, index)]
            if (!Object.hasOwn(attachment, key))
                throw problem(404, `no attachment key "${key}"`)
            Reflect.deleteProperty(attachment, key)
        })
    }
}

