/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import type Log                     from "./ase-lib-log.js"
import { Task }                     from "./ase-task.js"
import * as TaskFormat              from "./ase-task-format.js"
import { attachmentTime }           from "./ase-task-request.js"
import type {
    AgentTask, AgentItem, AgentJob, AgentFollowupJob,
    AgentLog, AgentResult, AgentWork, AgentSelection, AgentSnapshot, LineLevel
}                                   from "./ase-agent-runtime-task.js"
import { taskFlow, taskFlowRaw, tagsOf, setPlanTag, updateTask } from "./ase-agent-runtime-task.js"
import { skillErrored, verdictOf }  from "./ase-agent-runtime-tool.js"
import { shellJob, jobSignal, execHook } from "./ase-agent-runtime-exec.js"
import { statePrevious }            from "./ase-agent-runtime-phase.js"
import type {
    AgentHookTask, AgentHookContext, AgentHookUpdate,
    AgentHookJob, AgentHookPrompt, AgentHookOutcome
}                                   from "./ase-agent-definition-api.js"
import { attachMatches, paramEnv }  from "./ase-agent-definition-schema.js"
import { renderTemplate }           from "./ase-agent-definition-template.js"
import { unassignedFrom }           from "./ase-agent-definition-core.js"
import type { ResolvedDefinition }  from "./ase-agent-definition-core.js"

/*  the identity of an agent of a definition: its kind ("ase agent <kind>"), its mode (as
    announced in its presence), the namespace of its runs (see "AgentRun"), its role in
    the recovery descriptions, and the suffix of its agent-owned worktrees  */
export type Identity = { kind: string, mode: string, runKind: string, role: string, suffix: string }

/*  the agent facts passed to the hooks of a definition: its name, its identity,
    the task lifecycle model of the project, and the interruption of its run  */
type HookFacts = {
    name:         string
    kind:         string
    mode:         string
    lifecycle:    TaskFormat.TaskLifecycle
    interruption: AbortSignal
}

/*  the message of an error (e.g. of a hook)  */
export const reason = (err: unknown): string =>
    err instanceof Error ? err.message : String(err)

/*  a task as passed to a hook, with its status adapted to the task lifecycle model  */
export const hookTask = (task: AgentTask, status: string): AgentHookTask => Object.freeze({
    id:     task.id,
    title:  task.title,
    status,
    keys:   Object.freeze(Object.fromEntries(task.keys)),
    tags:   Object.freeze(tagsOf(task.keys))
})

/*  the frontmatter keys decided by the agents, which a hook cannot change  */
const reservedKeys = [ "Status", "Assignee", "Tags", "Modified" ]

/*  the prompt returned by the hook "prompt", validated, where undefined
    keeps the configured prompt <configured>  */
const promptOf = (value: unknown, configured: AgentHookPrompt): AgentHookPrompt => {
    if (value === undefined)
        return configured
    const spec = typeof value === "string" ? { text: value } : value
    if (spec !== null && typeof spec === "object" && !Array.isArray(spec)) {
        const { skill, args, text } = spec as { skill?: unknown, args?: unknown, text?: unknown }
        if (typeof text === "string" && skill === undefined && args === undefined) {
            if (text.trim() === "")
                throw new Error("empty prompt text")
            return { text }
        }
        else if (typeof skill === "string" && text === undefined && (args === undefined || typeof args === "string")) {
            if (!/^(?:[A-Za-z0-9_.-]+:)?[A-Za-z0-9_.-]+$/.test(skill))
                throw new Error(`invalid skill name "${skill}"`)
            return { skill, args: args ?? "" }
        }
    }
    throw new Error("invalid prompt (expected a string, \"{ text }\", or \"{ skill, args }\")")
}

/*  the model returned by the hook "model", validated, where undefined
    keeps the configured model <configured>  */
const modelOf = (value: unknown, configured: string): string => {
    if (value === undefined)
        return configured
    else if (typeof value !== "string")
        throw new Error("invalid model (expected a string)")
    return value.trim()
}

/*  the settling of a processed task decided by the hook "settle" (see "AgentHookSettlement"),
    where an undefined field keeps the configured settling, and where <tagged> tells whether
    the value of the tag is decided (as null untags the task)  */
type Settlement = { state?: string, tag?: string | null, tagged: boolean, assignee?: string }

/*  the result of the processing of a task by an agent of a definition, as evaluated in the
    finishing of its job: the found verdict (else empty), the checks of the success
    criteria and output line matches (with the reasons of the unmet ones), the
    reason of a failed preparing or finishing (else empty), and the settling
    decided by the hook "settle" (if any)  */
type DefinedRecord = {
    verdict:     string
    checks:      { criterion: string, ok: boolean, reason: string }[]
    fixed:       string
    settlement?: Settlement
}

/*  whether a record of an agent of a definition succeeded (where a missing one counts as failure)  */
export const recordSuccess = (record: DefinedRecord | undefined): boolean =>
    record !== undefined && record.fixed === "" && record.checks.every((check) => check.ok)

/*  escape a text for its literal use in a regular expression  */
const escapeRe = (text: string): string =>
    text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/*  the assignee to hand a processed task over to by an assignee specification
    of "--assign-success" or "--assign-failure" (empty to unassign it)  */
export const handoverTo = (spec: string, previous: string): string =>
    spec === "none" ? "" : spec === "previous" ? previous : spec

/*  the functionality shared by the phase and the request agents of a definition:
    the hook context, the starting and stopping, the prioritization, the tag filtering,
    the attachment skipping, the preparing of the job (rendering the prompt, running the
    preparing commands and hooks), and the finishing of the job (storing the output,
    evaluating the success criteria, deciding the settling, and running the finishing
    hook and commands)  */
export class DefinedCore {
    /*  the records of the processed tasks per task id (see "DefinedRecord")  */
    readonly records = new Map<string, DefinedRecord>()

    /*  the last failure of the hook "order" (reported once per change of it)  */
    private orderFailure = ""

    constructor (private log: Log, readonly def: ResolvedDefinition, private facts: () => HookFacts) {}

    /*  the context of a hook, writing its log lines by <log> (where a failed writing is
        ignored), within the work <work> of a job (if any), and cancelled by <signal>
        (default: the interruption of the agent, plus within the preparing resp. finishing
        of a job its timeout)  */
    context (log: (level: LineLevel, msg: string) => Promise<void>, work?: AgentWork, signal?: AbortSignal): AgentHookContext {
        const { name, kind, mode, lifecycle, interruption } = this.facts()
        const timeout = jobSignal()
        const cancel  = signal ?? (timeout !== undefined ? AbortSignal.any([ interruption, timeout ]) : interruption)
        const idOf    = (task: AgentHookTask | string) => typeof task === "string" ? task : task.id
        const listed  = async () => (await Task.listHeaders(this.log)).items
            .map((item) => hookTask(item, TaskFormat.adaptStatus(lifecycle, item.status)))
        return Object.freeze({
            agent:     Object.freeze({ name, kind, mode, tag: this.def.tag.name }),
            params:    Object.freeze({ ...this.def.params }),
            lifecycle: Object.freeze({ name: lifecycle.name, states: Object.freeze([ ...lifecycle.states ]) }),
            signal:    cancel,
            flow:      (task: AgentHookTask, key: "Source" | "Changeset" | "Target") => {
                try {
                    return Object.freeze(taskFlow(this.log, { id: task.id, title: task.title, keys: new Map(Object.entries(task.keys)) }, key))
                }
                catch (_err) {
                    return null
                }
            },
            attachments: async (task: AgentHookTask | string) =>
                Object.freeze((await Task.attachments(this.log, idOf(task))).map((att) =>
                    Object.freeze({ type: att.type, desc: att.desc, ...(att.data !== undefined ? { data: att.data } : {}) }))),
            plan: async (task: AgentHookTask | string) =>
                Task.inspect(this.log, idOf(task), (plan) => plan.body),
            task: async (id: string) =>
                (await listed()).find((task) => task.id === id) ?? null,
            tasks: async () =>
                Object.freeze(await listed()),
            update: async (task: AgentHookTask | string, change: AgentHookUpdate) =>
                this.update(idOf(task), change),
            exec: async (cmd: string, args: readonly string[] = [],
                options: { cwd?: string, env?: Readonly<Record<string, string>>, input?: string } = {}) =>
                Object.freeze(await execHook(cmd, args, {
                    cwd: options.cwd ?? work?.cwd ?? process.cwd(), env: options.env, input: options.input, signal: cancel
                })),
            log: (level: LineLevel, message: string) => {
                log(level, `hook: ${message}`).catch(() => {})
            }
        })
    }

    /*  change a task by the context of a hook (see "AgentHookUpdate"), validated
        completely before its single conditional update (resolving to false if it vanished)  */
    private async update (id: string, change: AgentHookUpdate): Promise<boolean> {
        const keys = Object.entries(change.keys ?? {})
        for (const [ key, value ] of keys) {
            if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(key))
                throw new Error(`update: invalid frontmatter key "${key}"`)
            else if (reservedKeys.includes(key))
                throw new Error(`update: frontmatter key "${key}" is decided by the agents`)
            else if (value !== null && typeof value !== "string")
                throw new Error(`update: invalid value of frontmatter key "${key}" (expected a string or null)`)
        }
        const tag = (spec: string) => {
            const m = /^([^\s,:]+)(?::([^\s,:]+))?$/.exec(spec)
            if (m === null)
                throw new Error(`update: invalid tag "${spec}"`)
            else if (m[1] === this.def.tag.name)
                throw new Error(`update: tag "${m[1]}" is decided by the agent itself`)
            return { key: m[1], value: m[2] as string | undefined }
        }
        const add      = (change.tags?.add ?? []).map(tag)
        const remove   = (change.tags?.remove ?? []).map(tag)
        const requests = this.def.type === "request" ?
            [ this.def.request.name, `${this.def.request.name}-running`, `${this.def.request.name}-failed` ] : []
        const time     = attachmentTime()
        const attach   = (change.attach ?? []).map((att) => {
            if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(att.kind) || att.kind === "agent" || requests.includes(att.kind))
                throw new Error(`update: invalid attachment kind "${att.kind}" ` +
                    "(processing logs and the processed requests are kept by the agent itself)")
            const mime = (att.mime ?? "text/plain").trim().toLowerCase()
            if (!/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(mime))
                throw new Error(`update: invalid MIME type "${mime}" of attachment "${att.kind}"`)
            else if (typeof att.data !== "string")
                throw new Error(`update: invalid data of attachment "${att.kind}" (expected a string)`)
            return {
                spec:    { mime, kind: att.kind },
                replace: att.replace !== false,
                entry:   {
                    Type:    `${mime}${mime.startsWith("text/") ? "; charset=utf-8" : ""}; kind="${att.kind}"`,
                    Desc:    att.desc ?? `attached by agent "${this.def.name}"`,
                    Created: time, Modified: time, Data: att.data
                }
            }
        })
        return updateTask(this.log, id, (plan) => {
            for (const [ key, value ] of keys) {
                if (value === null)
                    Reflect.deleteProperty(plan.header, key)
                else
                    plan.header[key] = value
            }
            for (const { key, value } of remove) {
                if (value === undefined)
                    setPlanTag(plan, key, null)
                else {
                    const field = plan.header.Tags ?? []
                    const tags  = (Array.isArray(field) ? field : field.split(","))
                        .map((t) => t.trim()).filter((t) => t !== "" && t !== `${key}:${value}`)
                    if (tags.length > 0)
                        plan.header.Tags = tags
                    else
                        delete plan.header.Tags
                }
            }
            for (const { key, value } of add)
                setPlanTag(plan, key, value)
            for (const { spec, replace, entry } of attach) {
                if (replace)
                    plan.attachment = plan.attachment.filter((att) => !attachMatches(spec, att.Type ?? ""))
                plan.attachment.push(entry)
            }
            return true
        })
    }

    /*  a task as passed to a hook, with its current status as known by its header keys  */
    task (task: AgentTask): AgentHookTask {
        return hookTask(task, TaskFormat.adaptStatus(this.facts().lifecycle, (task.keys.get("Status") ?? "").trim()))
    }

    /*  start the agent by the hook "start" (if any), where a failed hook refuses the start  */
    async start (log: (level: LineLevel, msg: string) => Promise<void>): Promise<void> {
        const hook = this.def.hooks.start
        if (hook === undefined)
            return
        try {
            await hook(this.context(log))
        }
        catch (err: unknown) {
            throw new Error(`agent: hook "start" failed: ${reason(err)}`, { cause: err })
        }
    }

    /*  stop the agent by the hook "stop" (if any, with a fresh cancellation, as the agent
        is usually stopped by its interruption), where a failed hook is only reported  */
    async stop (log: (level: LineLevel, msg: string) => Promise<void>): Promise<void> {
        const hook = this.def.hooks.stop
        if (hook === undefined)
            return
        try {
            await hook(this.context(log, undefined, new AbortController().signal))
        }
        catch (err: unknown) {
            await log("warning", `hook "stop" failed: ${reason(err)}`)
        }
    }

    /*  prioritize the dispatchable tasks by the hook "order" (if any): the returned tasks (or
        task ids) in their order, where an omitted, an unknown, or a repeated one is dropped,
        and where a failed hook keeps the natural id order (and is reported once per change)  */
    async order (tasks: AgentTask[], log: (level: LineLevel, msg: string) => Promise<void>): Promise<AgentTask[]> {
        const hook = this.def.hooks.order
        if (hook === undefined || tasks.length === 0)
            return tasks
        try {
            const result = await hook(Object.freeze(tasks.map((task) => this.task(task))), this.context(log))
            if (!Array.isArray(result))
                throw new Error("no list of tasks returned")
            const known   = new Map(tasks.map((task) => [ task.id, task ]))
            const ordered = new Map<string, AgentTask>()
            for (const entry of result as unknown[]) {
                const id   = typeof entry === "string" ? entry : (entry as { id?: unknown } | null)?.id
                const task = typeof id === "string" ? known.get(id) : undefined
                if (task !== undefined && !ordered.has(task.id))
                    ordered.set(task.id, task)
            }
            this.orderFailure = ""
            return [ ...ordered.values() ]
        }
        catch (err: unknown) {
            const failure = reason(err)
            if (failure !== this.orderFailure)
                await log("warning", `hook "order" failed (natural id order kept): ${failure}`)
            this.orderFailure = failure
            return tasks
        }
    }

    /*  decide by the hook "ready" whether a dispatchable task is claimed now: null if so,
        an empty reason to silently skip it, or else the reason to wait for, where a failed
        hook lets the task wait for its fixing  */
    async ready (task: AgentTask, log: (level: LineLevel, msg: string) => Promise<void>): Promise<string | null> {
        const hook = this.def.hooks.ready
        if (hook === undefined)
            return null
        try {
            const result = await hook(this.task(task), this.context(log))
            return result === true ? null : typeof result === "string" && result !== "" ? result : ""
        }
        catch (err: unknown) {
            return `the fixing of its failed hook "ready" (${reason(err)})`
        }
    }

    /*  whether a task is claimable by its tags (see "--tag-require" and "--tag-exclude"),
        where a plain tag is carried plain or with any value  */
    selectable (keys: Map<string, string>): boolean {
        const tags    = tagsOf(keys)
        const carries = (tag: string) => tags.includes(tag) || (!tag.includes(":") && tags.some((t) => t.startsWith(`${tag}:`)))
        return this.def.tag.require.every(carries) && !this.def.tag.exclude.some(carries)
    }

    /*  the tasks held off from their retry after a failed processing (see "--tag-retry"),
        per task id: the number of failed processings in a row and the end of the hold-off  */
    private retries = new Map<string, { count: number, until: number }>()

    /*  record the result of a processed task for its retry, returning the duration it
        is held off from its retry (or zero if not retried): an exponentially growing
        delay (from one minute up to one hour), so a failing task is not processed again
        and again at once (which, in one-shot mode, even keeps the agent from terminating)  */
    retry (id: string, failed: boolean): number {
        if (!failed) {
            this.retries.delete(id)
            return 0
        }
        const count = (this.retries.get(id)?.count ?? 0) + 1
        const delay = Math.min(60 * 1000 * 2 ** (count - 1), 60 * 60 * 1000)
        this.retries.set(id, { count, until: Date.now() + delay })
        return delay
    }

    /*  filter the selected tasks (and the waiting ones) by their tags and their retry hold-off  */
    filter (items: AgentItem[], selected: AgentSelection): AgentSelection {
        const known   = new Map(items.map((item) => [ item.id, item.keys ]))
        const now     = Date.now()
        const waiting = new Map([ ...selected.waiting ].filter(([ id ]) => this.selectable(known.get(id) ?? new Map())))
        const notices = new Map([ ...(selected.notices ?? []) ].filter(([ id ]) => this.selectable(known.get(id) ?? new Map())))
        const tasks   = selected.tasks.filter((task) => {
            if (!this.selectable(task.keys))
                return false
            const until = this.retries.get(task.id)?.until ?? 0
            if (until <= now)
                return true
            waiting.set(task.id, `its retry after a failed processing (in ${Math.ceil((until - now) / 1000)}s)`)
            return false
        })
        return { tasks, waiting, notices }
    }

    /*  whether a task is left unclaimed by an attachment (see "--attach-skip")  */
    async skipped (task: AgentTask): Promise<boolean> {
        const skip = this.def.attach.skip
        return skip !== null && (await Task.attachments(this.log, task.id)).some((att) => attachMatches(skip, att.type))
    }

    /*  the attachments of a task expected by the "attachment" success criterion (see
        "--attach-expect", else none), each as a fingerprint of its type, timestamps, and content  */
    private async expected (task: AgentTask): Promise<string[]> {
        const expect = this.def.attach.expect
        if (expect === null || !this.def.success.criteria.includes("attachment"))
            return []
        return (await Task.attachments(this.log, task.id))
            .filter((att) => attachMatches(expect, att.type))
            .map((att) => JSON.stringify(att))
    }

    /*  the current status of a task (else empty if it vanished)  */
    private async status (task: AgentTask): Promise<string> {
        return (await Task.inspect(this.log, task.id, (plan, lifecycle) => TaskFormat.taskStatus(plan.header, lifecycle))) ?? ""
    }

    /*  the environment variables of the shell commands (including those of the parameters)  */
    private env (task: AgentTask, cwd: string): Record<string, string> {
        return {
            ...Object.fromEntries(Object.entries(this.def.params).map(([ name, value ]) => [ paramEnv(name), value ])),
            ASE_TASK_ID:        task.id,
            ASE_TASK_TITLE:     task.title,
            ASE_TASK_SOURCE:    taskFlowRaw(this.log, task, "Source"),
            ASE_TASK_CHANGESET: taskFlowRaw(this.log, task, "Changeset"),
            ASE_TASK_TARGET:    taskFlowRaw(this.log, task, "Target"),
            ASE_AGENT_NAME:     this.def.name,
            ASE_AGENT_WORKDIR:  cwd
        }
    }

    /*  prepare the job of a task in its work <work>: render the prompt (with the request
        prompt <prompt> of a request agent), run the preparing commands, and run the hooks
        "prepare", "prompt", and "model", where the work is cleaned up again on a failure, and where
        <changed> decides preliminarily whether the plan content of a request agent changed  */
    async prepare (task: AgentTask, log: AgentLog, work: AgentWork, prompt: string,
        changed?: () => Promise<boolean>): Promise<AgentJob> {
        try {
            /*  the expected attachments before the processing, so a leftover of an
                earlier processing does not meet the "attachment" success criterion  */
            const before = await this.expected(task)

            const flow  = (key: "Source" | "Changeset" | "Target") => taskFlow(this.log, task, key)
            const value = (name: string): string => {
                if (name.startsWith("key:"))
                    return task.keys.get(name.slice(4)) ?? ""
                else if (name.startsWith("param:"))
                    return this.def.params[name.slice(6)] ?? ""
                switch (name) {
                    case "id":                 return task.id
                    case "title":              return task.title
                    case "prompt":             return prompt.replace(/\s+/g, " ")
                    case "source":             return taskFlowRaw(this.log, task, "Source")
                    case "changeset":          return taskFlowRaw(this.log, task, "Changeset")
                    case "target":             return taskFlowRaw(this.log, task, "Target")
                    case "source-type":        return flow("Source").type
                    case "source-name":        return flow("Source").name
                    case "changeset-type":     return flow("Changeset").type
                    case "changeset-name":     return flow("Changeset").name
                    case "target-type":        return flow("Target").type
                    case "target-name":        return flow("Target").name
                    case "workdir":            return work.cwd
                    case "source-dir":         return work.sourceDir
                    case "changeset-worktree": return work.changesetWorktree
                }
                return ""
            }
            const rendered = renderTemplate(this.def.prompt.template, value)

            /*  render the follow-up prompts, skipping those with a condition rendering to an
                empty string or "false", and those whose prompt text renders to an empty string  */
            const followup: AgentFollowupJob[] = []
            for (const [ n, entry ] of this.def.followup.entries()) {
                const unmet = entry.when.some((cond) => [ "", "false" ].includes(renderTemplate(cond, value).trim()))
                const text  = renderTemplate(entry.template, value)
                if (unmet || (entry.skill === "" && text.trim() === "")) {
                    await log("info", `follow-up #${n + 1}: skipped (${unmet ? "condition not met" : "empty prompt"})`)
                    continue
                }
                const resume = entry.session === "resume"
                followup.push(entry.skill !== "" ?
                    { cmd: `${entry.skill}${text !== "" ? ` ${text}` : ""}`, resume } :
                    { prompt: text, resume })
            }
            const env      = this.env(task, work.cwd)
            for (const cmd of this.def.prepare) {
                try {
                    await shellJob(cmd, work.cwd, env, log)
                }
                catch (err: unknown) {
                    this.records.set(task.id, { verdict: "", checks: [], fixed: `preparing command "${cmd}" failed` })
                    throw err
                }
            }

            /*  run the hooks "prepare", "prompt", and "model", where a failed hook fails the processing  */
            const job: AgentHookJob = Object.freeze({
                dir:               work.cwd,
                dirs:              Object.freeze([ ...work.dirs ]),
                sourceDir:         work.sourceDir,
                changesetWorktree: work.changesetWorktree,
                request:           prompt
            })
            const ctx    = this.context(log, work)
            const hooked = async <T> (name: string, op: () => Promise<T>): Promise<T> => {
                try {
                    return await op()
                }
                catch (err: unknown) {
                    this.records.set(task.id, { verdict: "", checks: [], fixed: `hook "${name}" failed: ${reason(err)}` })
                    throw new Error(`agent: hook "${name}" failed: ${reason(err)}`, { cause: err })
                }
            }
            const { prepare: prepareHook, prompt: promptHook, model: modelHook } = this.def.hooks
            if (prepareHook !== undefined)
                await hooked("prepare", async () => prepareHook(this.task(task), job, ctx))
            let spec: AgentHookPrompt = this.def.prompt.skill !== "" ?
                { skill: this.def.prompt.skill, args: rendered } : { text: rendered }
            if (promptHook !== undefined) {
                const configured = Object.freeze(spec)
                spec = await hooked("prompt", async () => promptOf(await promptHook(this.task(task), configured, job, ctx), configured))
            }
            const { sizes } = this.def.model
            let model = sizes[TaskFormat.parseEffort(task.keys.get("Effort") ?? "")?.size ?? "*"] ?? sizes["*"] ?? ""
            if (modelHook !== undefined) {
                const configured = model
                model = await hooked("model", async () => modelOf(await modelHook(this.task(task), configured, job, ctx), configured))
            }
            return {
                ...("skill" in spec ?
                    { cmd: `${spec.skill}${spec.args !== "" ? ` ${spec.args}` : ""}` } :
                    { prompt: spec.text }),
                followup,
                model,
                cwd:     work.cwd,
                dirs:    work.dirs,
                finish:  (log: AgentLog, result: AgentResult) => this.finish(task, log, result, work, job, env, before, changed),
                cleanup: work.cleanup
            }
        }
        catch (err: unknown) {
            await work.cleanup?.(log).catch((err2: unknown) =>
                log("warning", reason(err2)))
            throw err
        }
    }

    /*  finish the job of a task: store its output lines (see "--attach-output") and its
        change set snapshot (see "--attach-changeset"), finish its
        work (e.g. commit and publish it), evaluate its success criteria (recorded for the
        settling, but never thrown), decide its settling by the hook "settle", and run the
        hook "finish" and the finishing command of its success (whose failures fail the
        finishing) or of its failure (whose failures are only reported)  */
    private async finish (task: AgentTask, log: AgentLog, result: AgentResult, work: AgentWork, job: AgentHookJob,
        env: Record<string, string>, before: string[], changed?: () => Promise<boolean>): Promise<void> {
        const { def } = this
        const failed  = async () => {
            if (def.finish.failure !== "")
                await shellJob(def.finish.failure, work.cwd, { ...env, ASE_TASK_STATUS: await this.status(task) }, log)
                    .catch((err: unknown) => log("warning", reason(err)))
        }
        if (def.attach.output !== "")
            await this.attachOutput(task, result.output).catch((err: unknown) =>
                log("warning", `output not attached to task: ${reason(err)}`))

        /*  the snapshot is partial on a failed processing or a missed phase state (request agents have none)  */
        if (work.snapshot !== undefined)
            await this.attachSnapshot(task, work.snapshot,
                !result.ok || (def.type === "phase" && await this.status(task) !== def.state.phase), log)
                .catch((err: unknown) => log("warning", `change set snapshot not attached to task: ${reason(err)}`))
        try {
            await work.finish?.(log, result)
        }
        catch (err: unknown) {
            this.records.set(task.id, { verdict: "", checks: [], fixed: "finishing failed" })
            await failed()
            throw err
        }

        /*  the task as passed to the hooks of the finishing, with its current status  */
        let current: AgentHookTask | null = null
        const hookCurrent = async (): Promise<AgentHookTask> => {
            current ??= hookTask(task, TaskFormat.adaptStatus(this.facts().lifecycle, await this.status(task)))
            return current
        }
        const ctx = this.context(log, work)

        /*  evaluate the success criteria  */
        const record = await this.evaluate(task, result, log, before, ctx, hookCurrent, changed)
        this.records.set(task.id, record)
        for (const check of record.checks.filter((check) => !check.ok && check.criterion !== "changed"))
            await log("warning", `success criterion "${check.criterion}" not met: ${check.reason}`)

        /*  decide the settling by the hook "settle", where a failed hook keeps the configured one  */
        const outcome: AgentHookOutcome = Object.freeze({
            success: recordSuccess(record),
            reasons: Object.freeze(record.checks.filter((check) => !check.ok).map((check) => check.reason)),
            result:  Object.freeze({ ok: result.ok, output: Object.freeze([ ...result.output ]), verdict: record.verdict })
        })
        const { settle: settleHook, finish: finishHook } = def.hooks
        if (settleHook !== undefined) {
            try {
                record.settlement = this.settlement(await settleHook(await hookCurrent(), outcome, ctx), record)
            }
            catch (err: unknown) {
                await log("warning", `hook "settle" failed (configured settling kept): ${reason(err)}`)
            }
        }

        /*  run the hook "finish" and the finishing command  */
        if (!recordSuccess(record)) {
            if (finishHook !== undefined) {
                try {
                    await finishHook(await hookCurrent(), outcome, job, ctx)
                }
                catch (err: unknown) {
                    await log("warning", `hook "finish" failed: ${reason(err)}`)
                }
            }
            await failed()
            return
        }
        if (finishHook !== undefined) {
            try {
                await finishHook(await hookCurrent(), outcome, job, ctx)
            }
            catch (err: unknown) {
                record.fixed = `hook "finish" failed: ${reason(err)}`
                await failed()
                throw new Error(`agent: ${record.fixed}`, { cause: err })
            }
        }
        if (def.finish.success !== "") {
            try {
                await shellJob(def.finish.success, work.cwd, { ...env, ASE_TASK_STATUS: await this.status(task) }, log)
            }
            catch (err: unknown) {
                record.fixed = `finishing command "${def.finish.success}" failed`
                await failed()
                throw err
            }
        }
    }

    /*  evaluate the success criteria of a processed task (see "--success-criterion",
        "--success-match", and the hook "success"), and determine its verdict (see
        "--verdict-label" and the hook "verdict"), where <before> are the expected
        attachments before the processing  */
    private async evaluate (task: AgentTask, result: AgentResult, log: AgentLog, before: string[],
        ctx: AgentHookContext, current: () => Promise<AgentHookTask>, changed?: () => Promise<boolean>): Promise<DefinedRecord> {
        const { def } = this
        const output  = result.output
        let verdict   = ""
        if (def.verdict.label !== "" && result.ok) {
            const found = verdictOf(output, escapeRe(def.verdict.label))
            if (found !== "" && (def.verdict.allow.length === 0 || def.verdict.allow.includes(found)))
                verdict = found
        }
        if (def.hooks.verdict !== undefined && result.ok) {
            try {
                const value = await def.hooks.verdict(await current(),
                    Object.freeze({ ok: result.ok, output: Object.freeze([ ...output ]), verdict }), ctx)
                if (value !== undefined) {
                    if (typeof value !== "string" || !/^[A-Za-z]*$/.test(value.trim()))
                        throw new Error(`invalid verdict "${String(value)}" (expected an upper-case word or an empty string)`)
                    const word = value.trim().toUpperCase()
                    verdict = word !== "" && (def.verdict.allow.length === 0 || def.verdict.allow.includes(word)) ? word : ""
                    if (word !== "" && verdict === "")
                        await log("warning", `hook "verdict": verdict "${word}" not accepted`)
                }
            }
            catch (err: unknown) {
                verdict = ""
                await log("warning", `hook "verdict" failed: ${reason(err)}`)
            }
        }
        const checks: DefinedRecord["checks"] = []
        for (const criterion of def.success.criteria) {
            if (criterion === "exit")
                checks.push({ criterion, ok: result.ok, reason: "agent tool failed" })
            else if (criterion === "clean")
                checks.push({ criterion, ok: !skillErrored(output), reason: "skill reported an error" })
            else if (criterion === "changed")
                checks.push({ criterion, ok: changed !== undefined && await changed(), reason: "plan not changed" })
            else if (criterion === "verdict")
                checks.push({ criterion, ok: verdict !== "", reason: "no verdict" })
            else if (criterion === "attachment") {
                const expect = def.attach.expect!
                const ok     = (await this.expected(task)).some((att) => !before.includes(att))
                checks.push({ criterion, ok, reason: `no new or changed attachment "${expect.mime !== "" ? `${expect.mime};` : ""}${expect.kind}"` })
            }
            else if (criterion === "status")
                checks.push({ criterion, ok: await this.status(task) === def.state.phase, reason: `status not "${def.state.phase}"` })
        }
        for (const re of def.success.match)
            checks.push({ criterion: "match", ok: output.some((line) => re.test(line)), reason: `no output line matching "${re.source}"` })
        if (def.hooks.success !== undefined) {
            let ok   = false
            let why  = "hook \"success\" not met"
            try {
                const met = await def.hooks.success(await current(),
                    Object.freeze({ ok: result.ok, output: Object.freeze([ ...output ]), verdict }), ctx)
                ok = met === true
                if (typeof met === "string" && met !== "")
                    why = met
            }
            catch (err: unknown) {
                why = `hook "success" failed: ${reason(err)}`
            }
            checks.push({ criterion: "hook", ok, reason: why })
        }
        return { verdict, checks, fixed: "" }
    }

    /*  the configured target state of a processed task by its record <record>: on success the
        one of its verdict, else the one of "--state-success", and on failure the one of
        "--state-failure" (ignoring any verdict)  */
    target (record: DefinedRecord | undefined): string {
        const success = recordSuccess(record)
        const state   = success && record!.verdict !== "" ? this.def.state.verdict[record!.verdict] : undefined
        return state ?? (success ? this.def.state.success : this.def.state.failure)
    }

    /*  validate the settling <value> returned by the hook "settle" for the record <record>  */
    private settlement (value: unknown, record: DefinedRecord): Settlement | undefined {
        if (value === undefined)
            return undefined
        if (value === null || typeof value !== "object" || Array.isArray(value))
            throw new Error("invalid settling (expected an object)")
        const { state, tag, assignee, ...rest } = value as Record<string, unknown>
        const unknown = Object.keys(rest)
        if (unknown.length > 0)
            throw new Error(`unknown field "${unknown[0]}" (expected "state", "tag", or "assignee")`)
        if (this.def.type !== "phase" && (state !== undefined || tag !== undefined))
            throw new Error("the fields \"state\" and \"tag\" are for \"type: phase\" only")
        if (this.def.unclaimed && (state !== undefined || assignee !== undefined))
            throw new Error("the fields \"state\" and \"assignee\" are not for \"unclaimed: true\" " +
                "(as the status and the assignee of an unclaimed task are never changed)")
        const settlement: Settlement = { tagged: tag !== undefined }
        if (state !== undefined) {
            const states = this.facts().lifecycle.states
            if (typeof state !== "string" || !states.includes(state.toUpperCase()))
                throw new Error(`invalid state "${String(state)}" (expected one of ${states.map((s) => `"${s}"`).join(", ")})`)
            settlement.state = state.toUpperCase()
        }
        if (tag !== undefined) {
            if (tag !== null && (typeof tag !== "string" || !/^[a-z0-9][a-z0-9_.-]*$/.test(tag) || tag === "active"))
                throw new Error(`invalid tag value "${String(tag)}" (expected a lower-case value other than "active", or null)`)
            settlement.tag = tag
        }
        if (assignee !== undefined) {
            if (typeof assignee !== "string"
                || (assignee !== "none" && assignee !== "previous" && !/^[A-Za-z0-9][A-Za-z0-9_.@-]*$/.test(assignee)))
                throw new Error(`invalid assignee "${String(assignee)}" (expected a name, "none", or "previous")`)
            settlement.assignee = assignee
        }
        const to  = settlement.state ?? this.target(record)
        const who = settlement.assignee ?? (recordSuccess(record) ? this.def.assign.success : this.def.assign.failure)
        if (settlement.tagged && settlement.tag === null && this.def.attach.skip === null
            && !this.def.tag.guarded && !unassignedFrom(this.def.assign.required, this.def.assign.name, who)
            && (to === statePrevious || this.def.state.incoming.includes(to)))
            throw new Error("untagging would let the agent claim the task again, " +
                `which returns into its incoming state "${to === statePrevious ? this.def.state.incoming.join("\", \"") : to}"`)
        return settlement
    }

    /*  the settling of a processed task decided by the hook "settle" (if any),
        unless its finishing failed afterwards  */
    settled (id: string): Settlement | undefined {
        const record = this.records.get(id)
        return record !== undefined && record.fixed === "" ? record.settlement : undefined
    }

    /*  store the output lines of the prompt as a task attachment of the kind of
        "--attach-output" (replacing the one of an earlier processing)  */
    private async attachOutput (task: AgentTask, output: string[]): Promise<void> {
        const kind = this.def.attach.output
        const time = attachmentTime()
        await updateTask(this.log, task.id, (plan) => {
            plan.attachment = plan.attachment.filter((att) => !(/^text\/plain\s*(?:;|$)/i.test(att.Type ?? "")
                && attachMatches({ mime: "", kind }, att.Type ?? "")))
            plan.attachment.push({
                Type: `text/plain; charset=utf-8; kind="${kind}"`, Desc: `output of agent "${this.def.name}"`,
                Created: time, Modified: time, Data: output.length > 0 ? `${output.join("\n")}\n` : ""
            })
            return true
        })
    }

    /*  store the change set snapshot captured by <capture> (see "--attach-changeset", and
        marked as partial by <partial>) as the task attachment of type "text/x-diff;
        kind="<kind>"" (of "--attach-changeset"), replacing the one of an earlier processing in
        place (keeping its creation time), or remove an obsolete one, where the task stays
        untouched without a change set, so the unified diff is passed verbatim, instead of
        through the agent tool  */
    private async attachSnapshot (task: AgentTask, capture: (partial: boolean) => Promise<AgentSnapshot>,
        partial: boolean, log: AgentLog): Promise<void> {
        const snapshot = await capture(partial)
        if (snapshot === null)
            return
        const kind = this.def.attach.changeset
        const spec = { mime: "text/x-diff", kind }
        const time = attachmentTime()
        await updateTask(this.log, task.id, (plan) => {
            const at = plan.attachment.findIndex((att) => attachMatches(spec, att.Type ?? ""))
            if (snapshot === "obsolete") {
                if (at < 0)
                    return false
                plan.attachment = plan.attachment.filter((att) => !attachMatches(spec, att.Type ?? ""))
                return true
            }
            const entry = {
                Type: `text/x-diff; charset=utf-8; kind="${kind}"`, Desc: snapshot.desc,
                Created: at >= 0 ? plan.attachment[at].Created ?? time : time, Modified: time, Data: snapshot.diff
            }
            plan.attachment = plan.attachment.flatMap((att, i) =>
                i === at ? [ entry ] : attachMatches(spec, att.Type ?? "") ? [] : [ att ])
            if (at < 0)
                plan.attachment.push(entry)
            return true
        })
        await log("info", snapshot === "obsolete" ? `obsolete change set snapshot "${kind}" removed from task` :
            `change set snapshot "${kind}" attached to task (${snapshot.desc})`)
    }
}

