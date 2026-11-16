/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import crypto              from "node:crypto"

import { DateTime }        from "luxon"

import type * as API       from "./ase-task-store-plugin-api.js"
import type * as Delegate  from "./ase-task-store-plugin-delegate.js"
import * as TaskFormat     from "./ase-task-format.js"

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
    429: "Too Many Requests",
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

/*  the entity tag of a task plan (the SHA-1 of its text format, without its usage
    attachments, so a booking does not count as a change), for detecting a change in the
    meantime on a conditional save (which keeps the stored usage attachments), and the
    entity tag of the complete task plan, for a conditional save of its usage attachments
    by a booking (which therefore also detects a concurrent booking), where the latter
    is the SHA-1 of a prefixed text format, so both never coincide (not even for a plan
    without usage attachments), and only a booking can save usage attachments  */
export const taskTag = (plan: API.TaskPlan): string =>
    crypto.createHash("sha1").update(TaskFormat.formatTaskText(TaskFormat.withoutUsage(plan))).digest("hex")
export const taskTagFull = (plan: API.TaskPlan): string =>
    crypto.createHash("sha1").update("usage\n" + TaskFormat.formatTaskText(plan)).digest("hex")

/*  the change events of a single modifying request  */
export type EventEntry = { status: string, title: string }
export type EventFrame = {
    added?:     Record<string, EventEntry>
    updated?:   Record<string, EventEntry & { parts: string[] }>
    deleted?:   string[]
    lifecycle?: string
    idscheme?:  string
}
export type EventListener = (prjId: string, frame: EventFrame) => void

/*  the results of the core operations  */
export type ProjectView     = { id: string, lifecycle: TaskFormat.TaskLifecycle, idscheme: string, seqmark: number }
export type TaskListEntry   = { id: string, status: string, title: string, mtime: string, header?: API.TaskHeader, usage?: TaskFormat.TaskUsage, usagePeriod?: TaskFormat.TaskUsagePeriod }
export type TaskSaveResult  = { created: boolean, id: string, status: string, tag?: string }
export type TaskPatchResult = { id: string, status: string, from?: string, references?: number }
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
    /*  the "Effort" keys bound by the header listings (see taskList), per task
        plan, valid as long as the plan keeps its modification time and raw key  */
    private efforts = new Map<string, { mtime: number, raw: string, effort: API.TaskHeaderValue | undefined }>()

    constructor (private store: Delegate.TaskStore, private listener: EventListener = () => {}) {
        store.watch((prjId, change) => this.external(prjId, change))
    }

    /*  emit the changes of task plans detected by the storage plugin itself (made
        outside of this core), serialized with the operations of the project  */
    private external (prjId: string, change: API.TaskChange): void {
        this.serialize(prjId, async () => {
            const { lifecycle } = await this.project(prjId)
            const entry = (e: API.TaskEntry): EventEntry =>
                ({ status: TaskFormat.taskStatus(e.header, lifecycle), title: e.title })
            const added   = change.added   ?? []
            const updated = change.updated ?? []
            const deleted = change.deleted ?? []
            this.listener(prjId, {
                ...(added.length   > 0 ? { added:   Object.fromEntries(added.map((e) => [ e.id, entry(e) ])) } : {}),
                ...(updated.length > 0 ? { updated: Object.fromEntries(updated.map((e) => [ e.id, { ...entry(e), parts: [ "header", "body", "attachment" ] } ])) } : {}),
                ...(deleted.length > 0 ? { deleted } : {})
            })
        }).catch(() => {
            /*  a project unregistered meanwhile has nothing to notify  */
        })
    }

    /*  ==== validation helpers ====  */

    /*  validate a project or task id  */
    private validateId (kind: "project" | "task", id: string): string {
        if (!(kind === "task" ? TaskFormat.TASK_ID_RE : TaskFormat.ID_RE).test(id))
            throw problem(422, `invalid ${kind} id "${id}" (expected: [A-Za-z0-9${kind === "task" ? "#" : ""}_-]+)`)
        return id
    }

    /*  resolve a registered project, its lifecycle model, its task id scheme,
        and the high-water mark of its sequence numbers  */
    private async project (prjId: string): Promise<ProjectView> {
        this.validateId("project", prjId)
        const entry = await this.store.projectGet(prjId)
        if (entry === null)
            throw problem(404, `no project "${prjId}" registered`)
        const lifecycle = Object.hasOwn(TaskFormat.taskLifecycles, entry.lifecycle) ? TaskFormat.taskLifecycles[entry.lifecycle] : undefined
        if (lifecycle === undefined)
            throw problem(500, `project "${prjId}" carries unknown lifecycle model "${entry.lifecycle}"`)
        const idscheme = entry.idscheme ?? "slug"
        if (TaskFormat.checkIdScheme(idscheme) !== "")
            throw problem(500, `project "${prjId}" carries invalid task id scheme "${idscheme}"`)
        return { id: entry.id, lifecycle, idscheme, seqmark: entry.seqmark ?? 0 }
    }

    /*  raise the high-water mark of the sequence numbers to the highest one of removed
        or allocated task ids, so scheme "seq" never hands out their numbers again  */
    private async retire (prjId: string, project: ProjectView, ids: string[]): Promise<void> {
        const scheme  = TaskFormat.parseIdScheme(project.idscheme)
        const seqmark = ids.reduce((max, id) => Math.max(max, TaskFormat.seqNumber(scheme, id)), project.seqmark)
        if (seqmark > project.seqmark)
            await this.store.projectMark(prjId, seqmark)
    }

    /*  load a task plan through the storage plugin, with its "Effort" key bound to its
        body (see bindEffort), so a plan changed outside of this core (like an issue edited
        in the issue tracker) never carries a stale effort estimation  */
    private async load (prjId: string, taskId: string): Promise<API.TaskPlan | null> {
        const plan = await this.store.taskLoad(prjId, taskId)
        return plan !== null ? TaskFormat.bindEffort(plan) : null
    }

    /*  the header of a listed task plan with its "Effort" key bound to its body,
        loading the plan only if its modification time or its raw key changed
        since the last listing, so repeated listings stay cheap for issue trackers  */
    private async boundHeader (prjId: string, entry: API.TaskEntry): Promise<API.TaskHeader> {
        if (entry.header.Effort === undefined)
            return entry.header
        const key   = `${prjId}/${entry.id}`
        const mtime = entry.mtime.getTime()
        const raw   = String(entry.header.Effort)
        const memo  = this.efforts.get(key)
        let effort: API.TaskHeaderValue | undefined
        if (memo !== undefined && memo.mtime === mtime && memo.raw === raw)
            effort = memo.effort
        else {
            effort = (await this.load(prjId, entry.id))?.header.Effort
            this.efforts.set(key, { mtime, raw, effort })
        }
        const header = { ...entry.header }
        if (effort !== undefined)
            header.Effort = effort
        else
            delete header.Effort
        return header
    }

    /*  load an existing task plan of a registered project  */
    private async plan (prjId: string, taskId: string): Promise<{ lifecycle: TaskFormat.TaskLifecycle, plan: API.TaskPlan }> {
        const { lifecycle } = await this.project(prjId)
        this.validateId("task", taskId)
        const plan = await this.load(prjId, taskId)
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
        if (key === "Effort" && value.trim() !== "" && TaskFormat.parseEffort(value) === null)
            throw problem(422, "header key \"Effort\" requires a value \"<size> [<hash>]\" " +
                `(with size one of: ${TaskFormat.effortSizes.join(", ")})`)
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

    /*  reject a change of the usage attachment, which only a booking may change  */
    private guardUsage (attachment: API.TaskAttachment): void {
        if (TaskFormat.isUsage(attachment))
            throw problem(422, "the usage attachment of a task plan can be changed by a booking only")
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

    /*  run a read-modify-write cycle on an existing plan as a serialized operation,
        re-binding its "Effort" key to its possibly changed body before saving, and
        repeating the cycle on a plan changed meanwhile outside of this core (as
        detected through the revisions of a storage without locks, like an issue tracker)  */
    private async modify<T> (prjId: string, taskId: string, part: string,
        op: (plan: API.TaskPlan, lifecycle: TaskFormat.TaskLifecycle) => T): Promise<T> {
        return this.serialize(prjId, async () => {
            for (let attempt = 1; ; attempt++) {
                const revision = await this.store.taskRevision(prjId, taskId)
                const { lifecycle, plan } = await this.plan(prjId, taskId)
                const result = op(plan, lifecycle)
                TaskFormat.bindEffort(plan)
                if (await this.store.taskSave(prjId, taskId, plan, revision) === "changed") {
                    if (attempt >= 3)
                        throw problem(412, `task "${taskId}" was changed meanwhile in project "${prjId}"`)
                    continue
                }
                this.emitUpdated(prjId, taskId, plan, lifecycle, [ part ])
                return result
            }
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
    /*  register a project or change its lifecycle model and/or task id scheme
        (without one, a registered project keeps its model resp. scheme and a new
        one gets "solo" resp. "slug"), mapping the status of its plans onto a
        changed model; in "createOnly" mode an already registered project is
        left alone and reported as 412  */
    async projectSet (prjId: string, raw: { lifecycle?: unknown, idscheme?: unknown },
        createOnly = false): Promise<{ created: boolean, project: ProjectView }> {
        this.validateId("project", prjId)
        if (raw.lifecycle !== undefined && typeof raw.lifecycle !== "string")
            throw problem(400, "\"lifecycle\" has to be a string")
        if (raw.idscheme !== undefined && typeof raw.idscheme !== "string")
            throw problem(400, "\"idscheme\" has to be a string")
        const rawLifecycle = raw.lifecycle as string | undefined
        const rawIdscheme  = raw.idscheme  as string | undefined
        return this.serialize(prjId, async () => {
            const entry = await this.store.projectGet(prjId)
            if (createOnly && entry !== null)
                throw problem(412, `project "${prjId}" already registered`)
            const name      = rawLifecycle ?? entry?.lifecycle ?? "solo"
            const lifecycle = Object.hasOwn(TaskFormat.taskLifecycles, name) ? TaskFormat.taskLifecycles[name] : undefined
            if (lifecycle === undefined)
                throw problem(422, `unknown lifecycle model "${name}" ` +
                    `(expected one of: ${Object.keys(TaskFormat.taskLifecycles).join(", ")})`)
            const idscheme = rawIdscheme ?? entry?.idscheme ?? "slug"
            const error    = TaskFormat.checkIdScheme(idscheme)
            if (error !== "")
                throw problem(422, error)

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
                    const plan = await this.load(prjId, id)
                    if (plan === null)
                        continue
                    plan.header.Status = to
                    await this.store.taskSave(prjId, id, plan)
                    this.emitUpdated(prjId, id, plan, lifecycle, [ "header" ])
                }
            }
            const result = await this.store.projectSet(prjId, name, idscheme)
            if (entry !== null && (entry.lifecycle !== name || (entry.idscheme ?? "slug") !== idscheme))
                this.listener(prjId, {
                    ...(entry.lifecycle !== name ? { lifecycle: name } : {}),
                    ...((entry.idscheme ?? "slug") !== idscheme ? { idscheme } : {})
                })
            return { created: result === "created", project: { id: prjId, lifecycle, idscheme, seqmark: entry?.seqmark ?? 0 } }
        })
    }
    async projectDelete (prjId: string): Promise<void> {
        if (!await this.serialize(prjId, () => this.store.projectDelete(prjId)))
            throw problem(404, `no project "${prjId}" registered`)
    }

    /*  ==== task plan operations ====  */

    /*  list the task plans passing the "include"/"exclude" state filter,
        optionally with their entire header (loading each plan carrying an
        "Effort" key changed since the last listing, to bind it to its body
        (see boundHeader)), resp. with the AI usage accounting
        of their usage attachment and its period (loading each plan)  */
    async taskList (prjId: string, include = "none", exclude = "none", fields = "none"): Promise<TaskListEntry[]> {
        return this.serialize(prjId, async () => {
            const { lifecycle } = await this.project(prjId)
            const states = this.states(lifecycle, include, exclude)
            if (fields !== "none" && fields !== "header" && fields !== "usage")
                throw problem(422, `invalid "fields" value "${fields}" (expected: "header", "usage", or "none")`)
            const entries = await this.store.taskList(prjId)
            entries.sort((a, b) => TaskFormat.compareIds(a.id, b.id))
            const result = [] as TaskListEntry[]
            for (const entry of entries) {
                const status = TaskFormat.taskStatus(entry.header, lifecycle)
                if (lifecycle.states.includes(status) && !states.includes(status))
                    continue
                const att = fields === "usage" ? (await this.store.taskLoad(prjId, entry.id))?.attachment
                    .find((a) => TaskFormat.isUsage(a) && a.Data !== undefined) : undefined
                const header = fields === "header" ? await this.boundHeader(prjId, entry) : entry.header
                result.push({
                    id:     entry.id,
                    status,
                    title:  entry.title,
                    mtime:  DateTime.fromJSDate(entry.mtime).toFormat("yyyy-LL-dd HH:mm"),
                    ...(fields === "header" ? { header } : {}),
                    ...(att?.Data !== undefined ? {
                        usage:       TaskFormat.usageOf(att.Data),
                        usagePeriod: { created: att.Created ?? "", modified: att.Modified ?? "" }
                    } : {})
                })
            }
            return result
        })
    }

    /*  delete all task plans last modified longer ago than "age" (e.g. "31d")  */
    async taskPurge (prjId: string, age: string | undefined): Promise<string[]> {
        return this.serialize(prjId, async () => {
            const project = await this.project(prjId)
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
            await this.retire(prjId, project, purged)
            if (purged.length > 0)
                this.listener(prjId, { deleted: purged })
            return purged
        })
    }
    async taskLoad (prjId: string, taskId: string): Promise<API.TaskPlan> {
        return (await this.read(prjId, taskId)).plan
    }

    /*  allocate the next free task id according to the task id scheme, derived
        from a title (scheme "slug") or a proposed id (scheme "any"), considering
        all existing ids plus the additionally taken ones; for scheme "seq" the
        allocated number is reserved by raising the high-water mark, so a
        concurrent allocation never yields the same id  */
    async taskNewId (prjId: string, raw: { title?: unknown, proposal?: unknown, taken?: unknown }): Promise<{ scheme: string, id: string }> {
        if (raw.title !== undefined && typeof raw.title !== "string")
            throw problem(400, "\"title\" has to be a string")
        if (raw.proposal !== undefined && typeof raw.proposal !== "string")
            throw problem(400, "\"proposal\" has to be a string")
        if (raw.taken !== undefined && !(Array.isArray(raw.taken) && raw.taken.every((id) => typeof id === "string")))
            throw problem(400, "\"taken\" has to be an array of strings")
        const title    = (raw.title    ?? "") as string
        const proposal = (raw.proposal ?? "") as string
        const taken    = (raw.taken    ?? []) as string[]
        return this.serialize(prjId, async () => {
            const project = await this.project(prjId)
            const ids     = [ ...(await this.store.taskList(prjId)).map((entry) => entry.id), ...taken ]
            let id: string
            try {
                id = TaskFormat.nextTaskId(TaskFormat.parseIdScheme(project.idscheme), ids, title, proposal, project.seqmark)
            }
            catch (err) {
                throw problem(422, err instanceof Error ? err.message : String(err))
            }
            await this.retire(prjId, project, [ id ])
            return { scheme: project.idscheme, id }
        })
    }

    /*  create or overwrite an entire task plan, rejecting an unreachable status,
        on a conditional save (with the entity tag of the plan it is based
        on) also rejecting a plan which was changed or deleted in the meantime,
        and on a create-only save also rejecting an already existing plan,
        where an overwrite keeps the stored usage attachments, unless it is
        conditional on the entity tag of the complete plan (i.e., a booking),
        and a create drops any usage attachments, and where the "Effort" key is
        bound to the body (see bindEffort) before determining any entity tag,
        and a conditional save also detects a change made after the entity tag
        check through the revisions of a storage without locks (see modify)  */
    async taskSave (prjId: string, taskId: string, raw: unknown, ifMatch?: string, createOnly = false): Promise<TaskSaveResult> {
        return this.serialize(prjId, async () => {
            const { lifecycle } = await this.project(prjId)
            this.validateId("task", taskId)
            const revision = ifMatch !== undefined ? await this.store.taskRevision(prjId, taskId) : undefined
            const prev   = await this.load(prjId, taskId)
            const full   = ifMatch !== undefined && prev !== null && taskTagFull(prev) === ifMatch
            if (ifMatch !== undefined && !full && (prev === null || taskTag(prev) !== ifMatch))
                throw problem(412, `task "${taskId}" was ${prev === null ? "deleted" : "changed"} meanwhile in project "${prjId}"`)
            if (createOnly && prev !== null)
                throw problem(412, `task "${taskId}" already exists in project "${prjId}"`)
            let plan     = TaskFormat.bindEffort(this.validatePlan(taskId, raw))
            if (!full)
                plan = prev !== null ? TaskFormat.keepUsage(plan, prev) : TaskFormat.withoutUsage(plan)
            const from   = prev !== null ? TaskFormat.taskStatus(prev.header, lifecycle) : lifecycle.initial
            const status = TaskFormat.taskStatus(plan.header, lifecycle)
            this.checkStatus(lifecycle, from, status)
            const result = await this.store.taskSave(prjId, taskId, plan, revision)
            if (result === "changed")
                throw problem(412, `task "${taskId}" was changed meanwhile in project "${prjId}"`)
            if (result === "created")
                this.listener(prjId, { added: { [taskId]: this.entry(plan, lifecycle) } })
            else
                this.emitUpdated(prjId, taskId, plan, lifecycle, [ "header", "body", "attachment" ])

            /*  determine the entity tag of the just-saved plan (as stored, since a store
                not storing it verbatim may normalize it, e.g. an issue tracker) still
                within the serialized operation, so it can never be the one of a subsequent
                save of somebody else, and so any save (conditional or not) can be the
                base of a next conditional save  */
            const saved = this.store.verbatim ? plan : await this.load(prjId, taskId)
            return { created: result === "created", id: taskId, status, ...(saved !== null ? { tag: taskTag(saved) } : {}) }
        })
    }

    /*  change the status of a task plan and/or rename it to a new id  */
    async taskPatch (prjId: string, taskId: string, raw: unknown): Promise<TaskPatchResult> {
        return this.serialize(prjId, async () => {
            const project   = await this.project(prjId)
            const lifecycle = project.lifecycle
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
            const revision = await this.store.taskRevision(prjId, taskId)
            const plan = await this.load(prjId, taskId)
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

                /*  determine whether the plan is an explicit epic (its "Group" equals
                    its old "Id", or already its new one, as an edit of the task text
                    changes both and saves the text before renaming), as only then the
                    group name follows the rename, too, while otherwise the group names
                    are a namespace of their own  */
                const epic = plan.header.Group === taskId || plan.header.Group === newId

                /*  determine all other plans referencing the old id in their "After"
                    keys or, for an explicit epic, its members referencing the old id
                    in their "Group" keys, rewritten to the new id (header only, so
                    their "Modified" key stays untouched)  */
                const referrers: { id: string, plan: API.TaskPlan }[] = []
                for (const { id } of await this.store.taskList(prjId)) {
                    if (id === taskId)
                        continue
                    const other = await this.load(prjId, id)
                    if (other === null)
                        continue
                    const { Group: group, After: after } = other.header
                    const inGroup = epic && group === taskId
                    const inAfter = Array.isArray(after) && after.includes(taskId)
                    if (!inGroup && !inAfter)
                        continue
                    if (inGroup)
                        other.header.Group = newId
                    if (inAfter)
                        other.header.After = (after as string[]).map((ref) => ref === taskId ? newId : ref)
                    referrers.push({ id, plan: other })
                }

                /*  always rename (atomically) first and only then persist a status
                    change or the group of an explicit epic under the new id, so a
                    crash never leaves both ids behind  */
                plan.header.Id = newId
                if (epic)
                    plan.header.Group = newId
                if (!await this.store.taskRename(prjId, taskId, newId))
                    throw problem(404, `no task "${taskId}" in project "${prjId}"`)
                if (status !== null || epic)
                    await this.store.taskSave(prjId, newId, plan)
                await this.retire(prjId, project, [ taskId ])
                this.listener(prjId, { deleted: [ taskId ], added: { [newId]: this.entry(plan, lifecycle) } })

                /*  rewrite the references, failing clearly with the plans left behind  */
                for (let i = 0; i < referrers.length; i++) {
                    try {
                        await this.store.taskSave(prjId, referrers[i].id, referrers[i].plan)
                    }
                    catch (err) {
                        const pending = referrers.slice(i).map((referrer) => `"${referrer.id}"`).join(", ")
                        throw problem(500, `task "${taskId}" renamed to "${newId}", but failed to update ` +
                            `the references of ${pending}: ${err instanceof Error ? err.message : String(err)}`)
                    }
                    this.emitUpdated(prjId, referrers[i].id, referrers[i].plan, lifecycle, [ "header" ])
                }
                return {
                    id:         newId,
                    status:     TaskFormat.taskStatus(plan.header, lifecycle),
                    ...(status !== null ? { from } : {}),
                    references: referrers.length
                }
            }
            if (await this.store.taskSave(prjId, taskId, plan, revision) === "changed")
                throw problem(412, `task "${taskId}" was changed meanwhile in project "${prjId}"`)
            this.emitUpdated(prjId, taskId, plan, lifecycle, [ "header" ])
            return {
                id:     taskId,
                status: TaskFormat.taskStatus(plan.header, lifecycle),
                ...(status !== null ? { from } : {})
            }
        })
    }
    async taskDelete (prjId: string, taskId: string): Promise<void> {
        await this.serialize(prjId, async () => {
            const project = await this.project(prjId)
            this.validateId("task", taskId)
            if (!await this.store.taskDelete(prjId, taskId))
                throw problem(404, `no task "${taskId}" in project "${prjId}"`)
            await this.retire(prjId, project, [ taskId ])
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
    /*  add an attachment, or on "append" extend the "Data" of the last attachment
        with the same "Type" by its "Data" (taking over all its other keys except
        "Created"); returns the index and whether the attachment was newly created  */
    async attachmentAdd (prjId: string, taskId: string, raw: unknown, append = false): Promise<{ index: number, created: boolean }> {
        const attachment = this.validateAttachment(raw)
        this.guardUsage(attachment)
        return this.modify(prjId, taskId, "attachment", (plan) => {
            const index = append && attachment.Data !== undefined ?
                plan.attachment.findLastIndex((a) => a.Type === attachment.Type && a.Data !== undefined) : -1
            if (index < 0)
                return { index: plan.attachment.push(attachment) - 1, created: true }
            const existing = plan.attachment[index]
            plan.attachment[index] = {
                ...existing, ...attachment,
                ...(existing.Created !== undefined ? { Created: existing.Created } : {}),
                Data: existing.Data + attachment.Data
            }
            return { index, created: false }
        })
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
        this.guardUsage(attachment)
        await this.modify(prjId, taskId, "attachment", (plan) => {
            const i = this.validateIndex(plan, index)
            this.guardUsage(plan.attachment[i])
            plan.attachment[i] = attachment
        })
    }
    async attachmentDelete (prjId: string, taskId: string, index: string): Promise<void> {
        await this.modify(prjId, taskId, "attachment", (plan) => {
            const i = this.validateIndex(plan, index)
            this.guardUsage(plan.attachment[i])
            plan.attachment.splice(i, 1)
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
            this.guardUsage(plan.attachment[i])
            this.guardUsage(attachment)
            plan.attachment[i] = this.validateAttachment(attachment)
            return { created, key, value: plan.attachment[i][key] }
        })
    }
    async attachmentKeyDelete (prjId: string, taskId: string, index: string, key: string): Promise<void> {
        if (key === "Type" || key === "Data" || key === "File")
            throw problem(422, `attachment key "${key}" cannot be deleted (delete the entire attachment instead)`)
        await this.modify(prjId, taskId, "attachment", (plan) => {
            const attachment = plan.attachment[this.validateIndex(plan, index)]
            this.guardUsage(attachment)
            if (!Object.hasOwn(attachment, key))
                throw problem(404, `no attachment key "${key}"`)
            Reflect.deleteProperty(attachment, key)
        })
    }
}

