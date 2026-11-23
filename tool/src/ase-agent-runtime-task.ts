/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import type Log                     from "./ase-lib-log.js"
import { Task }                     from "./ase-task.js"
import type * as TaskFormat         from "./ase-task-format.js"
import type * as API                from "./ase-task-store-plugin-api.js"
import { Config }                   from "./ase-config-core.js"
import { configSchema }             from "./ase-config-schema.js"
import { safeName }                 from "./ase-agent-runtime-exec.js"

/*  command options type of all agents  */
export interface AgentOpts {
    tool:        string
    parallel:    string
    timeout:     string
    budget:      string
    oneShot:     boolean
    cwd?:        string
    repo?:       string
    tempdir?:    string
    name?:       string
    agentRelay?: string
}

/*  a claimed task: its id, its title, and its flattened header keys  */
export type AgentTask = { id: string, title: string, keys: Map<string, string> }

/*  a listed task: its id, its status, its title, and its flattened header keys  */
export type AgentItem = { id: string, status: string, title: string, keys: Map<string, string> }

/*  the selection of the listed tasks by an agent: the dispatchable tasks, the waiting
    tasks (with the reason), and optionally the tasks with a notice (e.g. on a problem
    of their dependencies), where the waiting and noticed tasks are reported once per
    change of their reason resp. notice  */
export type AgentSelection = { tasks: AgentTask[], waiting: Map<string, string>, notices?: Map<string, string> }

/*  the level of a processing log line  */
export type LineLevel = "error" | "warning" | "info"

/*  the processing log of a claimed task  */
export type AgentLog = (level: LineLevel, msg: string) => Promise<void>

/*  the result of the invocation of the headless agent tool: whether it succeeded
    (exit code 0 without timeout and interrupt), and its agent message text lines  */
export type AgentResult = { ok: boolean, output: string[] }

/*  a follow-up invocation of a job (see "AgentJob"): a skill command or a raw prompt,
    in a fresh session of the agent tool or resuming the session of the preceding invocation  */
export type AgentFollowupJob = { cmd?: string, prompt?: string, resume: boolean }

/*  the invocation of a skill command "<skill> <args>" (rendered per agent tool, see
    "skillPrompt"), or alternatively of an already rendered raw prompt, in a working
    directory, optionally with a model of the agent tool (else its default model),
    optionally granting access to additional directories, optionally followed by
    further invocations (each only after the success of its predecessor), optionally
    finished after the invocation (e.g. by committing its result), and
    optionally cleaned up afterwards in any case, even after a failed
    finishing or a timed out preparing (e.g. by removing its temporary worktree)  */
export type AgentJob = {
    cmd?:     string
    prompt?:  string
    followup?: AgentFollowupJob[]
    model?:   string
    cwd:      string
    dirs?:    string[]
    finish?:  (log: AgentLog, result: AgentResult) => Promise<void>
    cleanup?: (log: AgentLog) => Promise<void>
}

/*  the change set snapshot of a job (see "AgentWork"): the "Desc" key and the unified diff of
    the attachment block to attach, "obsolete" to remove an existing one (as the change set
    is an attachment itself), or null to leave the task untouched (e.g. without a change set)  */
export type AgentSnapshot = { desc: string, diff: string } | "obsolete" | null

/*  the work of a job in its working directory (see "AgentWorkspace.sourceJob",
    "AgentWorkspace.changesetJob", "AgentWorkspace.changesetReadJob", and
    "AgentWorkspace.targetJob"): the job without its prompt, plus the
    temporary worktree of a "branch:" source (else empty), the ASE worktree id under
    which the skill finds the changeset (else empty), and optionally the capturing of the
    change set snapshot after the invocation, before its finishing (where <partial> tells
    whether the skill did not reach its phase success state)  */
export type AgentWork = Omit<AgentJob, "cmd" | "prompt" | "followup"> & {
    dirs: string[], sourceDir: string, changesetWorktree: string,
    snapshot?: (partial: boolean) => Promise<AgentSnapshot>
}

/*  the type ("worktree", "branch", "attachment", or "source") and the name
    (of "branch:<name>" and "attachment:<name>") of a change set flow value  */
export type FlowValue = { type: string, name: string }

/*  the plain tags of the "Tags:" frontmatter key of a task  */
export const tagsOf = (keys: Map<string, string>): string[] =>
    (keys.get("Tags") ?? "").split(",").map((tag) => tag.trim()).filter((tag) => tag !== "")

/*  whether a task carries the tag <key>, plain or with any value  */
export const taggedWith = (keys: Map<string, string>, key: string): boolean =>
    tagsOf(keys).some((tag) => tag === key || tag.startsWith(`${key}:`))

/*  the flattened header keys of a task plan (like those of the listed tasks)  */
export const flatKeys = (header: API.TaskHeader): Map<string, string> =>
    new Map(Object.entries(header).map(([ key, val ]) =>
        [ key, Array.isArray(val) ? val.join(", ") : String(val) ] as [ string, string ]))

/*  set the tag <key> in the "Tags:" frontmatter key of a task plan,
    replacing all its existing occurrences: as a plain tag "<key>" without <value>,
    as a "<key>:<value>" tag with <value>, or not at all (removing it) with a null <value>  */
export const setPlanTag = (plan: API.TaskPlan, key: string, value?: string | null): void => {
    const field = plan.header.Tags ?? []
    const tags  = (Array.isArray(field) ? field : field.split(","))
        .map((t) => t.trim()).filter((t) => t !== "")
    const tag   = value === undefined ? key : `${key}:${value}`
    const match = (t: string) => t === key || t.startsWith(`${key}:`)
    const at    = tags.findIndex(match)
    const next  = tags.flatMap((t, i) => !match(t) ? [ t ] : i === at && value !== null ? [ tag ] : [])
    if (at < 0 && value !== null)
        next.push(tag)
    if (next.length > 0)
        plan.header.Tags = next
    else
        delete plan.header.Tags
}

/*  update a task plan by the operation <op> in a single conditional save (see "Task.update"),
    retrying (with a growing delay, on a freshly loaded plan) on a failure, especially on a
    concurrent change of the task (HTTP 412), so <op> has to (re)compute all its results,
    where <rejected> is called whenever a save was surely not done (on HTTP 412), unlike
    on other failures (e.g. a lost response), where the save might have been done  */
export const updateTask = (log: Log, id: string,
    op: (plan: API.TaskPlan, lifecycle: TaskFormat.TaskLifecycle) => boolean,
    rejected?: () => void): Promise<boolean> =>
    Task.updateRetry(log, id, op, rejected)

/*  the permitted types and the built-in defaults of the change set flow keys  */
const flowTypes: Record<string, string[]> = {
    Source:    [ "worktree", "branch" ],
    Changeset: [ "worktree", "branch", "attachment" ],
    Target:    [ "worktree", "branch", "source" ]
}
const flowDefaults: Record<string, string> = {
    Source:    "worktree",
    Changeset: "worktree",
    Target:    "source"
}

/*  the raw value of the change set flow key "Source:", "Changeset:", or "Target:"
    of a task (or else its configured default), with every placeholder "{id}" replaced
    by the safe name of the task id (see "safeName"), like by the skills  */
export const taskFlowRaw = (log: Log, task: AgentTask, key: "Source" | "Changeset" | "Target"): string => {
    let value = task.keys.get(key) ?? ""
    if (value === "") {
        const cfg = new Config("config", configSchema, log)
        cfg.read()
        const val = cfg.getExplicit(`project.task.default.${key.toLowerCase()}`)
        value = typeof val === "string" ? val : (process.env[`ASE_PROJECT_TASK_DEFAULT_${key.toUpperCase()}`] ?? flowDefaults[key])
    }
    return value.replaceAll("{id}", safeName(task.id))
}

/*  the value of the change set flow key "Source:", "Changeset:", or "Target:" of a
    task (or else its configured default), parsed and validated like by the skills,
    as the names are passed to Git, and a "Target:" of "source" resolved to "Source:"  */
export const taskFlow = (log: Log, task: AgentTask, key: "Source" | "Changeset" | "Target"): FlowValue => {
    const value = taskFlowRaw(log, task, key)
    const i     = value.indexOf(":")
    const type  = i < 0 ? value : value.slice(0, i)
    const name  = i < 0 ? "" : value.slice(i + 1)
    const named: Record<string, boolean> = {
        branch:     /^(?![-./])[A-Za-z0-9_./-]+(?<![/.])$/.test(name) && !/\.\.|\/\/|\.lock$/.test(name),
        attachment: /^[A-Za-z0-9_-]+$/.test(name)
    }
    if (!flowTypes[key].includes(type) || !(named[type] ?? name === ""))
        throw new Error(`agent: invalid ${key} value "${value}" of task "${task.id}"`)
    return type === "source" ? taskFlow(log, task, "Source") : { type, name }
}

