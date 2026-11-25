/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import { isScalar }                                       from "yaml"
import { DateTime }                                       from "luxon"

import type Log                                           from "./ase-lib-log.js"
import { Config, sessionState }                           from "./ase-config-core.js"
import { configSchema }                                   from "./ase-config-schema.js"
import { projectIdOf }                                    from "./ase-config-scope.js"
import * as API                                           from "./ase-task-store-plugin-api.js"
import * as Core                                          from "./ase-task-store-core.js"
import * as TaskFormat                                    from "./ase-task-format.js"
import { TaskStoreConnect }                               from "./ase-task-store-connect.js"

/*  an amount of AI usage, to be added to the usage attachment of a task (see "TaskFormat.usageKeys")  */
export type TaskUsage = TaskFormat.TaskUsage

/*  the failure of a booking whose save might have been done nevertheless (e.g. on a lost
    response, a timeout, or a partially done save of an issue tracker), so the booking must
    not be retried, as it would then be booked twice  */
export class UsageUncertain extends Error {}

/*  the result of a task plan save (see Task.save)  */
export type TaskSaved = { warning: string, tag: string, text: string, merged: boolean }

/*  render the positive amounts of a booked AI usage, e.g. "time.ai +12, cost.ai +0.4213"  */
export const usageText = (usage: TaskUsage | null): string =>
    Object.entries(usage ?? {}).filter(([ , amount ]) => amount > 0)
        .map(([ key, amount ]) => `${key} +${amount}`).join(", ") || "nothing"

/*  reusable functionality: the task plans of the current project,
    forwarded to the task store selected by the "project.task.store.url"
    configuration URL (see "TaskStoreConnect")  */
export class Task {
    /*  validate the task id to keep it safe as a filename component  */
    static validateId (id: string): void {
        if (typeof id !== "string" || id.length === 0)
            throw new Error("task: id must be a non-empty string")
        if (!TaskFormat.TASK_ID_RE.test(id))
            throw new Error("task: id must match [A-Za-z0-9#][A-Za-z0-9#_-]*")
    }

    /*  validate the session id to keep it safe as a config scope term  */
    static validateSession (session: string): void {
        if (typeof session !== "string" || session.length === 0)
            throw new Error("task: session must be a non-empty string")
        if (!TaskFormat.ID_RE.test(session))
            throw new Error("task: session must match [A-Za-z0-9_-]+")
    }

    /*  determine the project root (see "TaskStoreConnect.projectRoot")  */
    static projectRoot (): string {
        return TaskStoreConnect.projectRoot()
    }

    /*  derive the fallback project id from a project root
        (shared by task store, hook, and service)  */
    static projectIdOf (root: string): string {
        return projectIdOf(root)
    }

    /*  the configuration files of the task store specification, and the invalidation
        of the cached specification (see "TaskStoreConnect.{configFiles,invalidate}")  */
    static configFiles (log: Log): string[] {
        return TaskStoreConnect.configFiles(log)
    }
    static invalidate (): void {
        TaskStoreConnect.invalidate()
    }

    /*  resolve the effective task lifecycle model: the configured one for a
        local task store, the one of the registered project for a remote one  */
    static lifecycle (log: Log): Promise<TaskFormat.TaskLifecycle> {
        return TaskStoreConnect.with(log, (client) => Promise.resolve(client.lifecycle))
    }

    /*  set the lifecycle model of the project in the task store (for a local
        task store via "project.task.lifecycle" on scope "project"); returns
        the name of the previous lifecycle model  */
    static async setLifecycle (log: Log, name: string): Promise<string> {
        if (!Object.hasOwn(TaskFormat.taskLifecycles, name))
            throw new Error(`task: invalid lifecycle model "${name}" ` +
                `(expected one of: ${Object.keys(TaskFormat.taskLifecycles).join(", ")})`)
        return TaskStoreConnect.with(log, async (client) => {
            const from = client.lifecycle.name

            /*  invalidate the cached specification, as a local
                task store changed its configuration in any case  */
            try {
                await client.setLifecycle(name)
            }
            finally {
                Task.invalidate()
            }
            return from
        })
    }

    /*  resolve the effective task id scheme: the configured one for a
        local task store, the one of the registered project for a remote one  */
    static idScheme (log: Log): Promise<string> {
        return TaskStoreConnect.with(log, (client) => Promise.resolve(client.idscheme))
    }

    /*  set the task id scheme of the project in the task store (for a local
        task store via "project.task.idscheme" on scope "project"); returns the
        previous task id scheme  */
    static async setIdScheme (log: Log, spec: string): Promise<string> {
        const error = TaskFormat.checkIdScheme(spec)
        if (error !== "")
            throw new Error(`task: ${error}`)
        return TaskStoreConnect.with(log, async (client) => {
            const from = client.idscheme
            try {
                await client.setIdScheme(spec)
            }
            finally {
                Task.invalidate()
            }
            return from
        })
    }

    /*  allocate the next free task id according to the effective task id scheme,
        derived from a title (scheme "slug") or a proposed id (scheme "any"),
        by searching all existing task ids plus the additionally taken ones and,
        for schemes "seq" and "flex", the high-water mark of the removed and allocated ids
        (reserving the allocated one); returns the scheme, the id, and the
        regular expression matching the ids conforming to the scheme  */
    static async newId (log: Log, title = "", proposal = "", taken: string[] = []): Promise<{ scheme: string, id: string, match: string }> {
        return TaskStoreConnect.with(log, async (client) => {
            try {
                const { scheme, id } = await client.newId(title, proposal, taken)
                return { scheme, id, match: TaskFormat.parseIdScheme(scheme).match }
            }
            catch (err) {
                if (err instanceof Core.Problem && err.status === 422)
                    throw new Error(`task: ${err.message}`, { cause: err })
                throw err
            }
        })
    }

    /*  determine whether the task store is a remote one resp. a local directory,
        and the identity of the task store (see "TaskStoreConnect.{isRemote,isLocal,storeKey}")  */
    static isRemote (log: Log): boolean {
        return TaskStoreConnect.isRemote(log)
    }
    static isLocal (log: Log): boolean {
        return TaskStoreConnect.isLocal(log)
    }
    static storeKey (log: Log): string {
        return TaskStoreConnect.storeKey(log)
    }

    /*  the textual form of a plan, or the minimal plan of a task id  */
    static format (plan: API.TaskPlan): string {
        return TaskFormat.formatTaskText(plan)
    }
    static minimal (id: string): API.TaskPlan {
        return { header: { Type: TaskFormat.TASK_TYPE, Id: id }, body: "", attachment: [] }
    }

    /*  load a task as text, normalized into the current Markdown
        frontmatter shape; returns empty string if no task exists  */
    static async load (log: Log, id: string): Promise<string> {
        Task.validateId(id)
        const plan = await TaskStoreConnect.with(log, (client) => client.load(id))
        return plan === null ? "" : TaskFormat.formatTaskText(plan)
    }

    /*  load a task as text, optionally with its attachment payloads elided (see
        TaskFormat.elideAttachments), together with its entity tag (for a conditional
        save, always of the complete plan); returns null if no task exists  */
    static async source (log: Log, id: string, elided = false): Promise<{ text: string, tag: string } | null> {
        Task.validateId(id)
        const plan = await TaskStoreConnect.with(log, (client) => client.load(id))
        return plan === null ? null : {
            text: TaskFormat.formatTaskText(elided ? TaskFormat.elideAttachments(plan) : plan),
            tag:  Task.remember(plan)
        }
    }

    /*  the recently loaded or saved plans by their entity tags (of a bounded number),
        as the bases of the merges of conditional saves refused on a concurrent change  */
    private static bases = new Map<string, API.TaskPlan>()
    private static remember (plan: API.TaskPlan): string {
        const tag = Core.taskTag(plan)
        Task.bases.delete(tag)
        Task.bases.set(tag, TaskFormat.withoutUsage(plan))
        if (Task.bases.size > 64)
            Task.bases.delete(Task.bases.keys().next().value!)
        return tag
    }

    /*  save a task as text under the given id, throwing on a "Status:" unknown to or not
        reachable in the task lifecycle model, on a conditional save (with an entity tag) a
        problem 412 on a concurrent change which cannot be merged (see below), and on a
        create-only save an error if the task exists; elided attachment payloads are restored
        from the stored plan; returns the id scheme warning (else empty), the entity tag of
        the saved plan (as reported by the task store, else of the plan as sent), the text of
        the plan as sent, and whether the plan was merged with a concurrent change  */
    static async save (log: Log, id: string, text: string, tag?: string, create = false): Promise<TaskSaved> {
        if (typeof text !== "string")
            throw new Error("task: text must be a string")
        Task.validateId(id)
        try {
            return await TaskStoreConnect.with(log, async (client) => {
                const sent  = TaskFormat.parseTaskText(id, text, client.lifecycle)
                const ours  = sent.attachment.some((att) => TaskFormat.isElided(att.Data)) ?
                    TaskFormat.restoreAttachments(sent, await client.load(id)) : sent
                const base  = tag !== undefined ? Task.bases.get(tag) : undefined
                let plan    = ours
                let current = tag
                for (let attempt = 1; ; attempt++) {
                    let saved: string | undefined
                    try {
                        saved = await client.save(id, plan, current, create)
                    }
                    catch (err: unknown) {
                        /*  on a concurrent change, merge the change of the plan as sent (against its
                            base) into the changed plan and retry, conditionally on the changed plan  */
                        if (!(err instanceof Core.Problem && err.status === 412) || create || base === undefined || attempt >= 3)
                            throw err
                        const theirs = await client.load(id)
                        if (theirs === null)
                            throw err
                        const result = TaskFormat.mergeTaskPlans(base, ours, theirs)
                        if (result.plan === null)
                            throw new Core.Problem(412, `${err.message} (and both changed: ${result.conflicts.join(", ")})`)
                        plan    = result.plan
                        current = Core.taskTag(theirs)
                        continue
                    }

                    /*  remember the saved plan as the base of a next merge, but after a merge
                        report the entity tag of the plan as sent, so a next save based on it
                        is merged again, instead of reverting the merged concurrent change  */
                    const merged = plan !== ours
                    if (saved === undefined || saved === Core.taskTag(plan))
                        Task.remember(plan)
                    return {
                        warning: TaskFormat.idWarning(client.idscheme, id),
                        tag:     merged ? Task.remember(ours) : saved ?? Core.taskTag(plan),
                        text:    TaskFormat.formatTaskText(sent),
                        merged
                    }
                }
            })
        }
        catch (err: unknown) {
            if (create && tag === undefined && err instanceof Core.Problem && err.status === 412)
                throw new Error(`task: task "${id}" already exists`, { cause: err })
            throw err
        }
    }

    /*  delete a task by id; returns true if a task existed  */
    static async delete (log: Log, id: string): Promise<boolean> {
        Task.validateId(id)
        return TaskStoreConnect.with(log, (client) => client.delete(id))
    }

    /*  rename a task, rewriting its "Id:" frontmatter key, the "After" references
        of all other tasks, and, for an explicit epic, the "Group" references of
        itself and its members; returns null if the source task
        does not exist, else the number of updated referring tasks plus a
        warning (else empty) if the new id does not conform to the task id
        scheme; throws if the target id already exists; the rename is reported
        to the service of the project, so its usage windows follow it  */
    static async rename (log: Log, oldId: string, newId: string): Promise<{ warning: string, references: number } | null> {
        Task.validateId(oldId)
        Task.validateId(newId)
        let renamed: { warning: string, references: number } | null
        try {
            renamed = await TaskStoreConnect.with(log, async (client) => {
                const result = await client.patch(oldId, { id: newId })
                return result === null ? null :
                    { warning: TaskFormat.idWarning(client.idscheme, newId), references: result.references ?? 0 }
            })
        }
        catch (err: unknown) {
            if (err instanceof Core.Problem && err.status === 409)
                throw new Error(`task: target id "${newId}" already exists`, { cause: err })
            throw err
        }
        if (renamed !== null) {
            const Usage = await import("./ase-service-otel-common.js")
            await Usage.renameRemote(Task.projectRoot(), oldId, newId).catch((err: unknown) => {
                log.write("warning", `task: failed to report rename of "${oldId}" to "${newId}" to the ASE service: ` +
                    `${err instanceof Error ? err.message : String(err)}`)
            })
        }
        return renamed
    }

    /*  flatten a task plan header into string values (joining the
        array-typed keys "After" and "Tags" with commas)  */
    private static flatHeader (header: API.TaskHeader): Map<string, string> {
        return new Map(Object.entries(header).map(([ key, val ]) =>
            [ key, Array.isArray(val) ? val.join(", ") : val ] as [ string, string ]))
    }

    /*  split a task plan into its flattened header keys and its Markdown
        body (without the attachments), for read-only consumers which must
        not parse plans themselves; returns null if no task exists  */
    static async parts (log: Log, id: string): Promise<{ keys: Map<string, string>, body: string } | null> {
        Task.validateId(id)
        const plan = await TaskStoreConnect.with(log, (client) => client.load(id))
        return plan === null ? null : { keys: Task.flatHeader(plan.header), body: plan.body }
    }

    /*  list the attachments of a task plan, each with its type, description,
        creation and modification timestamps (if any), and either the referenced
        file (relative to a local task store) or the embedded data; returns an
        empty list if no task exists  */
    static async attachments (log: Log, id: string): Promise<{ type: string, desc: string, created?: string, modified?: string, file?: string, data?: string }[]> {
        Task.validateId(id)
        const plan = await TaskStoreConnect.with(log, (client) => client.load(id))
        return (plan?.attachment ?? []).filter((a) => a.Type !== undefined).map((a) => ({
            type: a.Type,
            desc: a.Desc ?? "",
            ...(a.Created  !== undefined ? { created:  a.Created  } : {}),
            ...(a.Modified !== undefined ? { modified: a.Modified } : {}),
            ...(a.File !== undefined ? { file: a.File } : {}),
            ...(a.Data !== undefined ? { data: a.Data } : {})
        }))
    }

    /*  get the raw content of an attachment of a task plan (its embedded data or
        its referenced file), through the task store; returns null if missing  */
    static async attachmentContent (log: Log, id: string, index: number): Promise<{ type: string, content: Buffer } | null> {
        Task.validateId(id)
        return TaskStoreConnect.with(log, (client) => client.content(id, index))
    }

    /*  add an attachment to a task plan, or on "append" extend the "Data" of its
        last attachment with the same "Type" (see "POST {task}/attachment");
        returns false if no task exists  */
    static async attach (log: Log, id: string, attachment: API.TaskAttachment, append = false): Promise<boolean> {
        Task.validateId(id)
        return TaskStoreConnect.with(log, (client) => client.attach(id, attachment, append))
    }

    /*  subscribe to the change events of the task store: a remote one
        (reconnecting automatically) or an in-process one (whose storage plugin
        detects the external changes, e.g. by watching its directory or by polling),
        reporting each change of the connection state; returns a function to unsubscribe  */
    static subscribe (log: Log, onChange: () => void, onState?: (connected: boolean) => void): () => void {
        return TaskStoreConnect.client(log).subscribe(onChange, onState)
    }

    /*  list all persisted tasks (see list) with their flattened header keys,
        plus the effective task lifecycle model, within a single task store access  */
    static async listHeaders (log: Log): Promise<{
        lifecycle: TaskFormat.TaskLifecycle,
        items:     { id: string, status: string, title: string, mtime: string, keys: Map<string, string> }[]
    }> {
        return TaskStoreConnect.with(log, async (client) => {
            const items = (await client.list("header")).map((item) =>
                ({ ...item, keys: Task.flatHeader(item.header ?? {}) }))
            return { lifecycle: client.lifecycle, items }
        })
    }

    /*  list the AI usage accounting (the amounts of the usage attachment and its period)
        of all persisted tasks having one, keyed by task id  */
    static async listUsage (log: Log): Promise<Map<string, { usage: TaskUsage, period: TaskFormat.TaskUsagePeriod }>> {
        return TaskStoreConnect.with(log, async (client) =>
            new Map((await client.list("usage")).flatMap((item) => item.usage !== undefined ?
                [ [ item.id, { usage: item.usage, period: item.usagePeriod ?? { created: "", modified: "" } } ] ] : [])))
    }

    /*  get the lifecycle status of a task plan: the "Status:" frontmatter
        key of the plan, falling back to the initial state of the task
        lifecycle model; throws if no task exists  */
    static async getStatus (log: Log, id: string): Promise<string> {
        Task.validateId(id)
        return TaskStoreConnect.with(log, async (client) => {
            const plan = await client.load(id)
            if (plan === null)
                throw new Error(`task: no task "${id}"`)
            return TaskFormat.taskStatus(plan.header, client.lifecycle)
        })
    }

    /*  set the lifecycle status of a task plan: the (case-insensitively
        given) status has to be a state of the task lifecycle model, while
        the "Modified:" frontmatter key is left alone, as it tracks body
        changes only; returns the previous and the new status; throws if no
        task exists, the status is unknown, or it is not reachable from the
        previous one in the state machine of the model  */
    static async setStatus (log: Log, id: string, status: string): Promise<{ from: string, to: string }> {
        Task.validateId(id)
        const to = status.trim().toUpperCase()
        return TaskStoreConnect.with(log, async (client) => {
            const lifecycle = client.lifecycle
            if (!lifecycle.states.includes(to))
                throw new Error(`task: invalid state "${status}" ` +
                    `(expected one of: ${lifecycle.states.join(", ")})`)
            const result = await client.patch(id, { status: to })
            if (result === null)
                throw new Error(`task: no task "${id}"`)
            return { from: result.from ?? lifecycle.initial, to: result.status }
        })
    }

    /*  inspect a task plan by the operation <op>, which derives a result from the
        loaded plan (and the lifecycle model); returns null if no task exists  */
    static async inspect<T> (log: Log, id: string, op: (plan: API.TaskPlan, lifecycle: TaskFormat.TaskLifecycle) => T): Promise<T | null> {
        Task.validateId(id)
        return TaskStoreConnect.with(log, async (client) => {
            const plan = await client.load(id)
            return plan === null ? null : op(plan, client.lifecycle)
        })
    }

    /*  update a task plan by the operation <op>, which modifies the loaded plan in
        place and returns whether it changed it, where the plan is saved conditionally
        (throwing if it was changed meanwhile), and only if changed, where with <usage>
        (i.e., for a booking) the plan is saved conditionally on the complete plan
        (throwing on a concurrent booking, too), as only then the usage attachment of
        the plan is saved and not kept by the task store, and where a booking failing
        once its save was started throws a "UsageUncertain" error, unless the task store
        surely rejected the save (by a client error, like HTTP 412), as it might have
        been done nevertheless; returns false if no task exists  */
    static async update (log: Log, id: string, op: (plan: API.TaskPlan, lifecycle: TaskFormat.TaskLifecycle) => boolean,
        usage = false): Promise<boolean> {
        Task.validateId(id)
        let saving = false
        try {
            return await TaskStoreConnect.with(log, async (client) => {
                const plan = await client.load(id)
                if (plan === null)
                    return false
                const etag = usage ? Core.taskTagFull(plan) : Core.taskTag(plan)
                if (op(plan, client.lifecycle)) {
                    saving = true
                    await client.save(id, plan, etag)
                }
                return true
            })
        }
        catch (err: unknown) {
            if (usage && saving && !(err instanceof Core.Problem && err.status >= 400 && err.status < 500))
                throw new UsageUncertain(err instanceof Error ? err.message : String(err), { cause: err })
            throw err
        }
    }

    /*  update a task plan by the operation <op> in a single conditional save (see "update"),
        retrying (with a growing delay, on a freshly loaded plan) on a failure, especially on a
        concurrent change of the task (HTTP 412), so <op> has to (re)compute all its results,
        where <rejected> is called whenever a save was surely not done (on HTTP 412), unlike
        on other failures (e.g. a lost response), where the save might have been done,
        and <usage> is passed through (retrying a booking on HTTP 412 only, as a retried
        booking whose save might have been done would be booked twice)  */
    static async updateRetry (log: Log, id: string,
        op: (plan: API.TaskPlan, lifecycle: TaskFormat.TaskLifecycle) => boolean,
        rejected?: () => void, usage = false): Promise<boolean> {
        for (let attempt = 1; ; attempt++) {
            try {
                return await Task.update(log, id, op, usage)
            }
            catch (err: unknown) {
                if (err instanceof Core.Problem && err.status === 412)
                    rejected?.()
                else if (usage)
                    throw err
                if (attempt >= 5)
                    throw err
                await new Promise((resolve) => setTimeout(resolve, 100 * attempt))
            }
        }
    }

    /*  assign a task plan by setting its "Assignee:" frontmatter key (or deleting it for a
        null assignee) in a conditional save, leaving the "Modified:" key alone, as it tracks
        body changes only; returns the previous assignee (or empty); throws if no task exists  */
    static async assign (log: Log, id: string, assignee: string | null): Promise<string> {
        if (assignee !== null && (assignee.trim() === "" || /[\r\n,]/.test(assignee)))
            throw new Error("task: assignee must be a non-empty single-line name without commas")
        let prev = ""
        const exists = await Task.updateRetry(log, id, (plan) => {
            prev = String(plan.header.Assignee ?? "").trim()
            if (assignee === null) {
                if (plan.header.Assignee === undefined)
                    return false
                delete plan.header.Assignee
            }
            else if (prev === assignee.trim())
                return false
            else
                plan.header.Assignee = assignee.trim()
            return true
        })
        if (!exists)
            throw new Error(`task: no task "${id}"`)
        return prev
    }

    /*  the known human assignees of the project ("project.users", comma-separated)  */
    static users (log: Log): string[] {
        const cfg = new Config("config", configSchema, log)
        cfg.read()
        const val = cfg.get("project.users")
        if (val === undefined)
            return []
        return String(isScalar(val) ? val.value : val).split(",").map((u) => u.trim()).filter((u) => u !== "")
    }

    /*  the names of the agents currently present at the agent relay
        (none if no agent relay is configured or reachable)  */
    static async agentNames (log: Log): Promise<string[]> {
        try {
            const { relaySpec, AgentRelayClient } = await import("./ase-agent-relay-client.js")
            const spec = relaySpec(log)
            if (spec === null)
                return []
            const agents = await new AgentRelayClient(log, spec).list()
            return [ ...new Set(agents.map((a) => a.name)) ]
        }
        catch {
            return []
        }
    }

    /*  check an assignee against the known ones (the current user, the users of
        "project.users", and the agents present at the agent relay), answering a
        warning for an unknown one (or empty), where an empty "project.users" knows all  */
    static async checkAssignee (log: Log, assignee: string): Promise<string> {
        const { userId } = await import("./ase-service-otel-common.js")
        const name   = assignee === "me" ? userId() : assignee.trim()
        const users  = Task.users(log)
        const agents = await Task.agentNames(log)
        if (name === "" || name === "none" || users.length === 0 || name === userId()
            || users.includes(name) || agents.includes(name))
            return ""
        return `unknown assignee "${name}" (neither one of the users of "project.users" nor a known agent)`
    }

    /*  accumulate the AI usage of a task plan: add each positive amount of the delta to its
        amount in the YAML data of the usage attachment (created on the first booking, and
        rounded to the precision of the amount) in a conditional save on the complete plan
        (retried on a concurrent change, so no concurrent change and no booking gets lost),
        refreshing the "Modified:" key of the attachment, but leaving the one of the frontmatter
        alone; returns false if no task exists; throws a "UsageUncertain" error if it failed,
        but might have been done nevertheless, so it must not be retried  */
    static async addUsage (log: Log, id: string, delta: TaskUsage): Promise<boolean> {
        return Task.updateRetry(log, id, (plan) => {
            if (!TaskFormat.usageKeys.some((key) => (delta[key] ?? 0) > 0))
                return false
            const at    = plan.attachment.findIndex((att) => TaskFormat.isUsage(att) && att.Data !== undefined)
            const usage = at >= 0 ? TaskFormat.usageOf(plan.attachment[at].Data) : {}
            for (const key of TaskFormat.usageKeys) {
                const sum = (usage[key] ?? 0) + Math.max(0, delta[key] ?? 0)
                usage[key] = Number(sum.toFixed(key.startsWith("cost.") ? 4 : 0))
            }
            const now  = DateTime.now().toFormat("yyyy-LL-dd HH:mm")
            const data = TaskFormat.usageData(usage)
            if (at >= 0)
                plan.attachment[at] = { ...plan.attachment[at], Modified: now, Data: data }
            else
                plan.attachment.push({ Type: TaskFormat.USAGE_TYPE, Created: now, Modified: now, Data: data })
            return true
        }, undefined, true)
    }

    /*  list all persisted tasks in natural id order (numbers by their value), each with the
        `status`, `title`, and `effort` size (empty if not estimated) of its
        plan and the `mtime` of its last modification formatted as "YYYY-MM-DD HH:MM"  */
    static async list (log: Log): Promise<{ id: string, status: string, title: string, mtime: string, effort: string }[]> {
        return TaskStoreConnect.with(log, async (client) => Task.withEffort(await client.list("header")))
    }

    /*  reduce the entries of a header listing onto the plain entries, each with
        the size of its "Effort:" frontmatter key (empty if not estimated)  */
    private static withEffort (entries: { id: string, status: string, title: string, mtime: string, header?: API.TaskHeader }[]) {
        return entries.map((entry) => ({
            id:     entry.id,
            status: entry.status,
            title:  entry.title,
            mtime:  entry.mtime,
            effort: TaskFormat.parseEffort(String(entry.header?.Effort ?? ""))?.size ?? ""
        }))
    }

    /*  list all persisted tasks (see list), plus the known states of the task lifecycle
        model and the effective state set of the "--include" and "--exclude" lifecycle
        state lists, all resolved within a single task store access  */
    static async listStates (log: Log, include: string, exclude: string): Promise<{
        items:  { id: string, status: string, title: string, mtime: string, effort: string }[],
        known:  string[],
        states: string[]
    }> {
        return TaskStoreConnect.with(log, async (client) => {
            let states: string[]
            try {
                states = TaskFormat.resolveStates(client.lifecycle, include, exclude)
            }
            catch (err) {
                throw new Error(`task: ${err instanceof Error ? err.message : String(err)}`, { cause: err })
            }
            return { items: Task.withEffort(await client.list("header")), known: client.lifecycle.states, states }
        })
    }

    /*  purge tasks whose modification time is older than the given age
        ("<number><unit>" with unit h, d, m, or y); returns the removed task ids  */
    static async purge (log: Log, age: string): Promise<string[]> {
        if (!/^\d+[hdmy]$/.test(age))
            throw new Error("task: <age> must match <number><unit> with unit h, d, m, or y")
        return TaskStoreConnect.with(log, (client) => client.purge(age))
    }

    /*  get the active task id for a given session, or "default" if none  */
    static getId (log: Log, session: string): string {
        Task.validateSession(session)
        const state = sessionState(log, session)
        state.read()
        const val = state.get("task")
        if (val === undefined)
            return "default"
        return String(isScalar(val) ? val.value : val)
    }

    /*  set the active task id for a given session; returns a warning (else empty)
        if the id does not conform to the effective task id scheme of the task store
        (an unreachable task store skips the check, as switching does not require it)  */
    static async setId (log: Log, session: string, id: string): Promise<string> {
        Task.validateSession(session)
        Task.validateId(id)
        const state = sessionState(log, session)
        state.lock(() => {
            state.read()
            state.set("task", id)
            state.write()
        })
        let idscheme: string
        try {
            idscheme = await Task.idScheme(log)
        }
        catch (err) {
            log.write("warning", `task: cannot check task id "${id}" against the task id scheme: ` +
                `${err instanceof Error ? err.message : String(err)}`)
            return ""
        }
        return TaskFormat.idWarning(idscheme, id)
    }
}

