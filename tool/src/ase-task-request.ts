/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import { DateTime }                 from "luxon"

import type Log                     from "./ase-lib-log.js"
import { Task }                     from "./ase-task.js"
import * as TaskFormat              from "./ase-task-format.js"
import type * as API                from "./ase-task-store-plugin-api.js"

/*  the states of a request to a request agent: requested, being
    processed by a request agent, and failed (to be re-requested)  */
export type RequestState = "pending" | "active" | "failed"

/*  a parameter of an attachment type (else empty), where a quoted value
    is unescaped (a backslash escapes the following character), and where the
    parameters are scanned in sequence (so no quoted value is mistaken for one)  */
export const typeParam = (type: string, name: string): string => {
    const key = name.toLowerCase()
    for (const m of type.matchAll(/;\s*([^=;\s]+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^;\s]+))/g))
        if (m[1].toLowerCase() === key)
            return m[2] !== undefined ? m[2].replace(/\\(.)/g, "$1") : m[3]
    return ""
}

/*  the quoted value of a parameter of an attachment type (a backslash escapes
    a backslash and a double quote, and control characters become spaces)  */
const typeQuote = (value: string): string =>
    `"${value.replace(/[\\"]/g, "\\$&").replace(/\p{Cc}/gu, " ")}"`

/*  the current timestamp of the attachments  */
export const attachmentTime = (): string =>
    DateTime.now().toFormat("yyyy-LL-dd HH:mm")

/*  whether a request to a task in a status is refused (a finished status)
    resp. deferred (an activity status, where the task is actively worked on)  */
export const requestRefused  = (lifecycle: TaskFormat.TaskLifecycle, status: string): boolean =>
    lifecycle.finished.includes(status)
export const requestDeferred = (lifecycle: TaskFormat.TaskLifecycle, status: string): boolean =>
    lifecycle.activity.includes(status)

/*  the reasons a request is refused: an empty prompt, a missing task,
    a finished task, or a request in progress  */
export type RequestReason = "empty" | "missing" | "finished" | "running"

/*  the error of a refused request, carrying its reason  */
export class RequestError extends Error {
    constructor (readonly reason: RequestReason, message: string) {
        super(message)
    }
}

/*  the requests to a request agent, attached to tasks as plain-text attachments (with the
    prompt as their content), whose type carries their state as its "kind" parameter (e.g.
    "edit" when requested, "edit-running" while being processed, and "edit-failed" when failed),
    and whose aggregated state is mirrored as a tag in the task header (e.g.
    "ase-agent-editor:pending"), as the dispatching of the agent and the task boards both see
    the task headers only, where <name> names the requests (e.g. "edit"), <tag> is the
    tag (e.g. "ase-agent-editor"), <done> describes a processed task (e.g. "edited"), and
    <prompted> tells whether a request requires a prompt (else it may have an empty one,
    as some request agents ignore the prompts, and the request agents consuming them refuse
    an empty one themselves on processing the request)  */
export class TaskRequests {
    private readonly kinds: Record<RequestState, string>

    constructor (readonly name: string, readonly tag: string, readonly done: string, readonly prompted = false) {
        this.kinds = { pending: name, active: `${name}-running`, failed: `${name}-failed` }
    }

    /*  the state of an attachment type of a request (else undefined)  */
    state (type: string): RequestState | undefined {
        if (!/^text\/plain\s*(?:;|$)/i.test(type.trim()))
            return undefined
        const kind = typeParam(type, "kind")
        return (Object.keys(this.kinds) as RequestState[]).find((state) => this.kinds[state] === kind)
    }

    /*  the attachment type of a request in a state, with additional parameters  */
    type (state: RequestState, params: Record<string, string> = {}): string {
        return `text/plain; charset=utf-8; kind="${this.kinds[state]}"` +
            Object.entries(params).map(([ key, value ]) => `; ${key}=${typeQuote(value)}`).join("")
    }

    /*  the aggregated state of the requests of a task by its header tag (else empty)  */
    of (keys: Map<string, string>): RequestState | "" {
        const state = (keys.get("Tags") ?? "").split(",").map((tag) => tag.trim())
            .find((tag) => tag.startsWith(`${this.tag}:`))?.slice(this.tag.length + 1) ?? ""
        return state === "pending" || state === "active" || state === "failed" ? state : ""
    }

    /*  the tags of a task plan without the request tag  */
    private foreignTags (plan: API.TaskPlan): string[] {
        const field = plan.header.Tags ?? []
        return (Array.isArray(field) ? field : field.split(","))
            .map((tag) => tag.trim())
            .filter((tag) => tag !== "" && tag !== this.tag && !tag.startsWith(`${this.tag}:`))
    }

    /*  re-derive the tag of a task plan from its request attachments,
        where a processed request dominates a requested one, which dominates a failed one  */
    retag (plan: API.TaskPlan): void {
        const states = plan.attachment.map((att) => this.state(att.Type ?? ""))
        const state  = ([ "active", "pending", "failed" ] as RequestState[]).find((s) => states.includes(s))
        const tags   = this.foreignTags(plan)
        if (state !== undefined)
            tags.push(`${this.tag}:${state}`)
        if (tags.length > 0)
            plan.header.Tags = tags
        else
            delete plan.header.Tags
    }

    /*  finalize a processed request (at index <i>) of a task plan: remove it (state null), or turn
        it back into a requested or into a failed one (with a description), restore the previous
        assignee of the task (or hand it over to the given <assignee> instead, where an empty one
        unassigns it), unless it was reassigned meanwhile, and re-derive the request tag  */
    finalize (plan: API.TaskPlan, i: number, state: RequestState | null, desc?: string, assignee?: string): void {
        const att  = plan.attachment[i]
        const type = att.Type ?? ""
        if (String(plan.header.Assignee ?? "") === typeParam(type, "agent")) {
            const previous = assignee ?? typeParam(type, "assignee")
            if (previous !== "")
                plan.header.Assignee = previous
            else
                delete plan.header.Assignee
        }
        if (state === null)
            plan.attachment.splice(i, 1)
        else
            plan.attachment[i] = { ...att, Type: this.type(state), ...(desc !== undefined ? { Desc: desc } : {}), Modified: attachmentTime() }
        this.retag(plan)
    }

    /*  the prompt of the most recent failed request of a task plan (for its re-request), else empty  */
    private failedPrompt (plan: API.TaskPlan): string {
        const failed = plan.attachment.filter((att) => this.state(att.Type ?? "") === "failed")
        return (failed.at(-1)?.Data ?? "").trim()
    }

    /*  the prompt of the most recent failed request of a task (for its re-request), else empty  */
    async prompt (log: Log, id: string): Promise<string> {
        return (await Task.inspect(log, id, (plan) => this.failedPrompt(plan))) ?? ""
    }

    /*  probe a task for a new request (loading it only once): the reason a request is
        refused (a missing or finished task, or a request in progress), else the prompt
        of its most recent failed request (for its re-request), else empty  */
    async probe (log: Log, id: string): Promise<{ refused: RequestReason } | { prompt: string }> {
        const result = await Task.inspect(log, id, (plan, lifecycle): { refused: RequestReason } | { prompt: string } => {
            if (requestRefused(lifecycle, TaskFormat.taskStatus(plan.header, lifecycle)))
                return { refused: "finished" }
            if (this.running(plan))
                return { refused: "running" }
            return { prompt: this.failedPrompt(plan) }
        })
        return result ?? { refused: "missing" }
    }

    /*  whether a task plan has a request being processed  */
    running (plan: API.TaskPlan): boolean {
        return plan.attachment.some((att) => this.state(att.Type ?? "") === "active")
    }

    /*  request the processing of a task by a prompt (which may be empty, unless the requests
        require a prompt), replacing all its failed requests (refused for a finished task, and
        while a request is being processed, as adding a request changes the task plan under the
        agent processing the running one, whose conditional save of the task plan would then fail)  */
    async request (log: Log, id: string, prompt: string): Promise<void> {
        const text = prompt.trim()
        if (text === "" && this.prompted)
            throw new RequestError("empty", `empty ${this.name} prompt`)
        let refused = ""
        let running = false
        const exists = await Task.update(log, id, (plan, lifecycle) => {
            const status = TaskFormat.taskStatus(plan.header, lifecycle)
            if (requestRefused(lifecycle, status)) {
                refused = status
                return false
            }
            if (this.running(plan)) {
                running = true
                return false
            }
            const line = text !== "" ? text.replace(/\s+/g, " ") : `${this.name} request without prompt`
            const time = attachmentTime()
            plan.attachment = plan.attachment.filter((att) => this.state(att.Type ?? "") !== "failed")
            plan.attachment.push({
                Type: this.type("pending"), Desc: line.length > 60 ? `${line.slice(0, 59)}…` : line,
                Created: time, Modified: time, Data: text !== "" ? `${text}\n` : ""
            })
            this.retag(plan)
            return true
        })
        if (!exists)
            throw new RequestError("missing", `no task "${id}"`)
        if (refused !== "")
            throw new RequestError("finished", `task "${id}" is finished (status "${refused}") -- ${this.name} refused`)
        if (running)
            throw new RequestError("running", `${this.name} of task "${id}" in progress -- new ${this.name} refused`)
    }
}

/*  the edit requests: requested ("edit"), being processed by an editor agent
    ("edit-running"), and failed ("edit-failed", to be re-requested), mirrored
    in the task header as tag "ase-agent-editor:<state>", always requiring a prompt  */
export const edits = new TaskRequests("edit", "ase-agent-editor", "edited", true)

/*  the valid names of requests: lower-case words, not ending in a state suffix of a request kind  */
export const REQUEST_NAME_RE = /^(?!.*-(?:running|failed)$)[a-z][a-z0-9-]*$/

/*  the requests of a name (e.g. "lint", processed by a request agent of a definition),
    mirrored in the task header as tag "ase-agent-<name>:<state>", where the edit requests
    ("edit") are the ones of the editor agent  */
export const requestsOf = (name: string): TaskRequests => {
    if (!REQUEST_NAME_RE.test(name))
        throw new Error(`invalid request name "${name}" ` +
            "(expected a lower-case word of letters, digits, and dashes, not ending in \"-running\" or \"-failed\")")
    if ([ "rebooter", "condenser", "griller", "implementer", "qualifier", "integrator", "editor", "estimator", "researcher" ].includes(name))
        throw new Error(`invalid request name "${name}" (its tag "ase-agent-${name}" is the one of a built-in agent)`)
    return name === edits.name ? edits : new TaskRequests(name, `ase-agent-${name}`, "processed")
}

/*  the state of an edit request, and the aggregated state of the edit requests of a task by its header tag (else empty)  */
export type EditState = RequestState
export const editOf = (keys: Map<string, string>): EditState | "" =>
    edits.of(keys)

/*  whether an edit request of a task in a status is refused (a finished status)  */
export const editRefused = requestRefused

/*  the prompt of the most recent failed edit request of a task (for its re-request), else empty  */
export const editPrompt = (log: Log, id: string): Promise<string> =>
    edits.prompt(log, id)

/*  probe a task for a new edit request: the reason it is refused, else the prompt
    of its most recent failed edit request (for its re-request), else empty  */
export const editProbe = (log: Log, id: string): Promise<{ refused: RequestReason } | { prompt: string }> =>
    edits.probe(log, id)

/*  request the edit of a task by a prompt, replacing all its failed edit requests
    (refused for an empty prompt, a missing or finished task, or an edit in progress)  */
export const requestEdit = (log: Log, id: string, prompt: string): Promise<void> =>
    edits.request(log, id, prompt)

