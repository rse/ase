/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

/*  the public API of the agent definitions: the contract of the definition files of the
    definition kinds (".ase/agents/<kind>.<ext>"), of "ase agent adhoc --definition <file>",
    and of the definitions of the built-in agents,
    exported as the types of the "@rse/ase" package (for a TypeScript definition file via
    "import type { AgentDefinition } from "@rse/ase"" and "export default { ... } satisfies
    AgentDefinition"), so this module has to stay self-contained (without any import) and
    stable, as every incompatible change of it is a breaking change of the package  */

/*  a single value or a list of values (of a repeatable option)  */
type Many<T> = T | T[]

/*  the processing types, the working directory kinds, and the success criteria of an agent  */
export type AgentType      = "phase" | "request"
export type AgentWorkdir   = "project" | "source" | "changeset" | "changeset-read" | "target"
export type AgentCriterion = "exit" | "clean" | "changed" | "verdict" | "attachment" | "status"

/*  the declaration of a parameter of an agent, whose value is given by the repeatable option
    "--params <name>=<value>" of "ase agent <kind> start" (resp. by the map "params" of the
    section of the agent in a fleet configuration): its description, its default value, whether
    a non-empty value is required, and the allowed values (else any), where a plain scalar
    declares just the default value  */
export interface AgentParam {
    desc?:     string
    default?:  string | number | boolean
    required?: boolean
    allow?:    Many<string>
}

/*  the definition of an agent, with the same option groups and options as the options
    "--<group>-<item>" of "ase agent <kind> start" (see its manual page for their semantics),
    including the one-line title and the brief description of its operation (as shown on the
    task boards), plus the declarations of its parameters (by their names), the hooks, the
    code-based escape hatches beyond the declarative options, and the base definition it extends (a definition
    file, relative to this one, or the definition "builtin:<kind>[-<mode>]" of a built-in agent),
    whose options it overrides (where a false flag unsets the flag of the base definition), whose
    parameter declarations it extends field-wise, and whose hooks of the same name it replaces,
    where a phase agent can have multiple incoming states only if "unclaimed" or with an explicit
    activity state, and where a "previous" success or failure state restores the incoming state
    of the claim  */
export interface AgentDefinition {
    definition?:  string
    title?:       string
    description?: string
    params?:      Record<string, AgentParam | string | number | boolean>
    type?:        AgentType
    workdir?:     AgentWorkdir
    lifecycle?:   Many<string>
    serial?:      boolean
    unclaimed?:   boolean
    model?:       string
    state?: {
        incoming?: Many<string>
        activity?: string
        success?:  string
        failure?:  string
        phase?:    string
        passed?:   string
        verdict?:  Many<string>
    }
    tag?: {
        name?:     string
        success?:  string
        failure?:  string
        require?:  Many<string>
        exclude?:  Many<string>
        retry?:    boolean
    }
    assign?: {
        name?:     string
        required?: boolean
        success?:  string
        failure?:  string
    }
    request?: {
        name?:     string
        done?:     string
    }
    prompt?: {
        skill?:    string
        args?:     string
        text?:     string
        file?:     string
    }
    prepare?: {
        run?:      Many<string>
    }
    success?: {
        criterion?: Many<AgentCriterion>
        match?:     Many<string>
    }
    verdict?: {
        label?:    string
        allow?:    Many<string>
    }
    attach?: {
        output?:   string
        expect?:   string
        skip?:     string
        changeset?: string
    }
    finish?: {
        commit?:   boolean
        success?:  string
        failure?:  string
    }
    hooks?: AgentHooks
}

/*  the default export of a TypeScript or JavaScript definition file:
    the definition itself, or a (possibly asynchronous) function returning it  */
export type AgentDefinitionExport = AgentDefinition | (() => AgentDefinition | Promise<AgentDefinition>)

/*  a task as passed to a hook: its id, its title, its status (adapted to the task
    lifecycle model of the project), its flattened frontmatter keys, and its tags  */
export interface AgentHookTask {
    readonly id:     string
    readonly title:  string
    readonly status: string
    readonly keys:   Readonly<Record<string, string>>
    readonly tags:   readonly string[]
}

/*  a parsed change set flow value of a task: its type ("worktree", "branch", or
    "attachment") and its name (of "branch:<name>" and "attachment:<name>", else empty)  */
export interface AgentHookFlow {
    readonly type: string
    readonly name: string
}

/*  an attachment of a task: its type (e.g. "text/x-diff; charset=utf-8; kind="draft""),
    its description, and its inline data (if any)  */
export interface AgentHookAttachment {
    readonly type:  string
    readonly desc:  string
    readonly data?: string
}

/*  the level of a log line written by a hook  */
export type AgentHookLevel = "error" | "warning" | "info"

/*  the result of a command run by "exec" of the context: its exit code (or -1 if it did not
    exit regularly, e.g. if not found, killed on its timeout, or cancelled), and its outputs  */
export interface AgentHookExec {
    readonly code:   number
    readonly stdout: string
    readonly stderr: string
}

/*  an attachment to add to a task by "update" of the context (see "AgentHookUpdate")  */
export interface AgentHookAttach {
    readonly kind:     string
    readonly mime?:    string
    readonly desc?:    string
    readonly data:     string
    readonly replace?: boolean
}

/*  a change of a task by "update" of the context, applied in a single conditional update
    of the task (retried on a concurrent change of it): frontmatter keys to set (or to remove
    with null), except "Status", "Assignee", "Tags", and "Modified" (which the agents decide),
    tags to add ("<tag>" or "<tag>:<value>", replacing all other occurrences of "<tag>") and
    to remove ("<tag>" with any value, or exactly "<tag>:<value>"), except the tag of the agent
    itself, and attachments to add (of the kind <kind>, with the MIME type <mime> (default:
    "text/plain"), the description <desc>, and the data <data>, replacing all attachments of
    the same kind, unless <replace> is false), except the processing log ("agent")  */
export interface AgentHookUpdate {
    keys?:   Readonly<Record<string, string | null>>
    tags?:   { readonly add?: readonly string[], readonly remove?: readonly string[] }
    attach?: readonly AgentHookAttach[]
}

/*  the context passed to a hook:
    - the identity of the agent (its name, kind, mode, and the tag of its processed tasks)
    - the values of all declared parameters of the agent (empty if neither given nor defaulted)
    - the task lifecycle model of the project
    - the cancellation signal, aborted on the interrupt of the agent (and, within the hooks
      "prepare", "prompt", "verdict", "success", "settle", and "finish", on the timeout of
      the preparing resp. finishing of the job), which a long-running hook should honor
    - the parsed change set flow value "Source:", "Changeset:", or "Target:" of a task (or its
      configured default, where a "Target:" of "source" reads as the "Source:", or null if invalid)
    - the attachments of a task, the plan body of a task (or null if it vanished), a task by its
      id (or null if unknown), and all tasks (for their dependencies or their prioritization)
    - the change of a task (resolving to false if it vanished, see "AgentHookUpdate")
    - the run of a command (without a shell, in the working directory of the job within the
      hooks of a job, else in the current directory, limited to 240s and cancelled by "signal",
      with the additional environment variables <env> and the standard input <input>)
    - the writing of a log line (into the processing log of the task within the hooks of a
      job, else into the log of the agent)  */
export interface AgentHookContext {
    readonly agent:     { readonly name: string, readonly kind: string, readonly mode: string, readonly tag: string }
    readonly params:    Readonly<Record<string, string>>
    readonly lifecycle: { readonly name: string, readonly states: readonly string[] }
    readonly signal:    AbortSignal
    flow (task: AgentHookTask, key: "Source" | "Changeset" | "Target"): AgentHookFlow | null
    attachments (task: AgentHookTask | string): Promise<readonly AgentHookAttachment[]>
    plan (task: AgentHookTask | string): Promise<string | null>
    task (id: string): Promise<AgentHookTask | null>
    tasks (): Promise<readonly AgentHookTask[]>
    update (task: AgentHookTask | string, change: AgentHookUpdate): Promise<boolean>
    exec (cmd: string, args?: readonly string[],
        options?: { readonly cwd?: string, readonly env?: Readonly<Record<string, string>>, readonly input?: string }): Promise<AgentHookExec>
    log (level: AgentHookLevel, message: string): void
}

/*  the job of a processed task as passed to the hooks of a job: its working directory, the
    additional directories granted to the agent tool, the temporary worktree of a "branch:"
    source (else empty), the ASE worktree id under which the skill finds the changeset (else
    empty), and the prompt of the processed request (for "type: request" only, else empty)  */
export interface AgentHookJob {
    readonly dir:               string
    readonly dirs:              readonly string[]
    readonly sourceDir:         string
    readonly changesetWorktree: string
    readonly request:           string
}

/*  the prompt of a job as passed to and returned by the hook "prompt":
    a skill with its (rendered) arguments, or a (rendered) prompt text  */
export type AgentHookPrompt = { readonly skill: string, readonly args: string } | { readonly text: string }

/*  the result of the processing of a task as passed to the hooks "verdict" and "success":
    whether the agent tool succeeded, the output lines of the prompt, and the found verdict
    (else empty)  */
export interface AgentHookResult {
    readonly ok:      boolean
    readonly output:  readonly string[]
    readonly verdict: string
}

/*  the outcome of the processing of a task as passed to the hooks "settle" and "finish":
    whether it succeeded (for "type: request" preliminarily, as the change of the plan is
    finally decided on the settling), the reasons of the unmet success criteria, and the
    result of the processing  */
export interface AgentHookOutcome {
    readonly success: boolean
    readonly reasons: readonly string[]
    readonly result:  AgentHookResult
}

/*  the settling of a processed task as returned by the hook "settle", overriding the
    configured one: its target state ("type: phase" without "unclaimed" only, still required
    to be reachable from the activity state), the value of its tag ("type: phase" only: a
    lower-case value, or null to untag it, which is refused if the task would return into
    an incoming state unguarded by "attach.skip", the hook "ready", or its handover by a
    required assignment), and the assignee to hand it over to (a name, "none", or
    "previous", but not with "unclaimed"), where an omitted field keeps the configured
    settling  */
export interface AgentHookSettlement {
    readonly state?:    string
    readonly tag?:      string | null
    readonly assignee?: string
}

/*  a value or the promise of it  */
type Async<T> = T | Promise<T>

/*  the hooks of an agent, where a thrown error never terminates a running agent, but counts
    like a negative result (with the error as the reason), in the order of their invocation:
    - "start": the initialization of the agent (e.g. opening a connection), on its start,
      where a thrown error refuses the start of the agent
    - "order": the prioritization of the dispatchable tasks <tasks> (in natural id order) on
      each dispatching: the tasks (or their ids) in the order to claim them, where an omitted
      task is not claimed this time (and a failed hook keeps the natural id order)
    - "passes" (for "phase" without "unclaimed" only, synchronous): whether the predecessor
      <pred> of the "After:" key (or of the explicit epic) of the task <succ> passed the phase
      of the agent, or undefined for the default decision by the states "phase" and "passed"
    - "ready": whether a dispatchable task is claimed now, checked right before its claim
      (after "attach.skip"): true to claim it, false to silently skip it (e.g. as the result
      of its processing already guards it), or the reason to wait for (reported once per
      change of it)
    - "prepare": the preparing of the job of a claimed task in its working directory, after
      the commands of "prepare.run", where a thrown error fails the processing
    - "prompt": the prompt of the job, given the configured one <prompt> (rendered from its
      template): a skill with its arguments, a prompt text (also as a plain string), or
      undefined to keep the configured one, where a thrown error fails the processing
    - "model": the model of the agent tool for the job, given the configured one <model> (of
      "model", by the "Effort:" size of the task, where empty means the default of the agent
      tool): a model, or undefined to keep the configured one, where a thrown error fails the processing
    - "verdict" (after a successful agent tool only): the verdict of the result (an upper-case
      word, accepted only if listed by "verdict.allow", if given), an empty string for none,
      or undefined to keep the one found after "verdict.label" (if any)
    - "success": an additional success criterion, checked after all others: true if met,
      else false or the reason why it is not met
    - "settle": the settling of the processed task (see "AgentHookSettlement"), or undefined
      to keep the configured one, where a failed hook keeps the configured one
    - "finish": the finishing of the job of the processed task in its working directory,
      before the command of "finish.success" resp. "finish.failure", where a thrown error
      fails the finishing of a successful processing (like a failed "finish.success")
    - "stop": the teardown of the agent (e.g. closing a connection), on its termination  */
export interface AgentHooks {
    start?:   (ctx: AgentHookContext) => Async<void>
    order?:   (tasks: readonly AgentHookTask[], ctx: AgentHookContext) => Async<readonly (AgentHookTask | string)[]>
    passes?:  (pred: AgentHookTask, succ: AgentHookTask, ctx: AgentHookContext) => boolean | undefined
    ready?:   (task: AgentHookTask, ctx: AgentHookContext) => Async<boolean | string>
    prepare?: (task: AgentHookTask, job: AgentHookJob, ctx: AgentHookContext) => Async<void>
    prompt?:  (task: AgentHookTask, prompt: AgentHookPrompt, job: AgentHookJob, ctx: AgentHookContext) => Async<AgentHookPrompt | string | undefined>
    model?:   (task: AgentHookTask, model: string, job: AgentHookJob, ctx: AgentHookContext) => Async<string | undefined>
    verdict?: (task: AgentHookTask, result: AgentHookResult, ctx: AgentHookContext) => Async<string | undefined>
    success?: (task: AgentHookTask, result: AgentHookResult, ctx: AgentHookContext) => Async<boolean | string>
    settle?:  (task: AgentHookTask, outcome: AgentHookOutcome, ctx: AgentHookContext) => Async<AgentHookSettlement | undefined>
    finish?:  (task: AgentHookTask, outcome: AgentHookOutcome, job: AgentHookJob, ctx: AgentHookContext) => Async<void>
    stop?:    (ctx: AgentHookContext) => Async<void>
}

