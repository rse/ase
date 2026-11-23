/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import type Log                     from "./ase-lib-log.js"
import { Task }                     from "./ase-task.js"
import * as TaskFormat              from "./ase-task-format.js"
import { TaskRequests }             from "./ase-task-request.js"
import type {
    AgentTask, AgentItem, AgentJob, AgentLog, AgentSelection
}                                   from "./ase-agent-runtime-task.js"
import { PhaseAgent, statePrevious } from "./ase-agent-runtime-phase.js"
import type { AgentStates }         from "./ase-agent-runtime-phase.js"
import { RequestAgent }             from "./ase-agent-runtime-request.js"
import type { RequestOutcome }      from "./ase-agent-runtime-request.js"
import { DefinedCore, reason, hookTask, recordSuccess, handoverTo } from "./ase-agent-runtime-defined.js"
import type { Identity }            from "./ase-agent-runtime-defined.js"
import type { ResolvedDefinition }  from "./ase-agent-definition-core.js"

/*  the phase agent of a definition (see "--type phase")  */
export class DefinedPhaseAgent extends PhaseAgent {
    readonly kind: string
    protected readonly description = ""
    protected readonly states:     AgentStates
    protected readonly unclaimed:  string[] = []
    protected readonly assigned:   boolean  = false
    protected readonly restoring:  boolean  = false
    protected readonly finishing:  boolean  = false
    protected readonly serial:     boolean  = false
    protected readonly worktree:   boolean  = false
    protected readonly lifecycles: string[] = []
    private core: DefinedCore

    /*  the failures of the hook "passes" per successor task id, reported as notices  */
    private passFailures = new Map<string, string>()

    constructor (log: Log, private def: ResolvedDefinition, private identity: Identity) {
        super(log)
        this.kind       = identity.kind
        this.core       = new DefinedCore(log, def, () => ({
            name: this.name, kind: this.kind, mode: this.mode, lifecycle: this.lifecycle!, interruption: this.interruption
        }))
        this.states     = { incoming: def.state.incoming, activity: def.state.activity, success: def.state.phase, passed: def.state.passed }
        this.unclaimed  = def.unclaimed ? def.state.incoming : []
        this.restoring  = [ def.state.success, def.state.failure ].includes(statePrevious)

        /*  announce the observed, activity, written, and gate states (for the agent graph of the
            task boards), where a restored previous state is one of the incoming states  */
        const output    = [ def.state.success, def.state.failure, ...Object.values(def.state.verdict) ]
            .flatMap((s) => s === statePrevious ? def.state.incoming : [ s ]).filter((s) => s !== "")
        this.presenceStates = {
            input:  def.state.incoming,
            output: output.filter((s, i) => output.indexOf(s) === i),
            ...(def.state.activity !== "" ? { activity: def.state.activity } : {}),
            ...(def.state.passed   !== "" ? { gate:     def.state.passed   } : {})
        }
        this.presenceTitle = def.title
        this.presenceDesc  = def.description
        this.modelSpec     = def.model.spec
        this.assigned      = def.assign.required
        this.finishing     = def.finish.commit || def.finish.success !== "" || def.workdir === "target"
            || def.hooks.finish !== undefined
        this.serial        = def.serial
        this.worktree      = def.workdir !== "project"
        this.lifecycles    = def.lifecycles
        this.mode          = identity.mode
    }

    /*  the identity of the agent  */
    protected get tag (): string {
        return this.def.tag.name
    }
    protected get assignee (): string {
        return this.def.assign.name
    }
    protected get role (): string {
        return this.identity.role
    }
    protected get runKind (): string {
        return this.identity.runKind
    }

    /*  start and stop the agent by the hooks "start" and "stop"  */
    protected async init (): Promise<void> {
        await this.core.start((level, msg) => this.write(level, this.name, msg))
    }
    protected async teardown (): Promise<void> {
        await this.core.stop((level, msg) => this.write(level, this.name, msg))
    }

    /*  select the tasks by the phase semantics and by their tags,
        noticing the tasks whose predecessors failed the hook "passes"  */
    protected select (items: AgentItem[], busy: Set<string>): AgentSelection {
        this.passFailures.clear()
        const selected = this.core.filter(items, super.select(items, busy))
        if (this.passFailures.size === 0)
            return selected
        const notices = new Map(selected.notices ?? [])
        for (const [ id, failure ] of this.passFailures)
            notices.set(id, [ notices.get(id), failure ].filter((note) => note !== undefined).join(", and "))
        return { ...selected, notices }
    }

    /*  prioritize the dispatchable tasks by the hook "order"  */
    protected async order (tasks: AgentTask[]): Promise<AgentTask[]> {
        return this.core.order(tasks, (level, msg) => this.write(level, this.name, msg))
    }

    /*  whether a predecessor passed the phase for its successor: by the hook "passes"
        (if any, and if it decides), else by the phase states, where a failed hook
        lets the successor wait (and notices it)  */
    protected passes (pred: AgentItem, status: string, item: AgentItem): boolean {
        const hook = this.def.hooks.passes
        if (hook === undefined)
            return super.passes(pred, status, item)
        try {
            const passed = hook(hookTask(pred, status), hookTask(item, TaskFormat.adaptStatus(this.lifecycle!, item.status)),
                this.core.context((level, msg) => this.write(level, this.name, msg)))
            return typeof passed === "boolean" ? passed : super.passes(pred, status, item)
        }
        catch (err: unknown) {
            this.passFailures.set(item.id, `failed the hook "passes" for its predecessor "${pred.id}" ` +
                `(treated as not passed): ${reason(err)}`)
            return false
        }
    }

    /*  a task is claimed only without a skipping attachment, if ready by the
        hook "ready" (if any), and while its working directory is free  */
    protected async ready (task: AgentTask): Promise<boolean> {
        if (await this.core.skipped(task))
            return false
        const wait = await this.core.ready(task, (level, msg) => this.write(level, this.name, msg))
        if (wait !== null)
            return wait !== "" ? this.defer(task, wait) : false
        return this.workdirReady(task, this.def.workdir)
    }

    /*  prepare the job of a task in its working directory  */
    protected async prepare (task: AgentTask, parallel: boolean, log: AgentLog): Promise<AgentJob> {
        this.core.records.delete(task.id)
        const work = await this.workdirJob(task, this.def.workdir, this.identity.suffix, parallel, {
            checkout: this.def.prompt.template.names.has("source-dir"),
            commit:   this.def.finish.commit,
            snapshot: this.def.attach.changeset
        })
        return this.core.prepare(task, log, work, "")
    }

    /*  the tag value of a processed task: the one decided by the hook "settle", else on
        success its verdict, else the one of "--tag-success", and on failure the one of
        "--tag-failure" (ignoring any verdict)  */
    protected label (_ok: boolean, _output: string[], task: AgentTask): string | null | undefined {
        const settlement = this.core.settled(task.id)
        if (settlement?.tagged)
            return settlement.tag
        const record  = this.core.records.get(task.id)
        const success = recordSuccess(record)
        if (success && record!.verdict !== "")
            return record!.verdict.toLowerCase()
        return success ? this.def.tag.success : this.def.tag.failure
    }

    /*  the target state of a processed task: the one decided by the hook "settle",
        else the configured one (see "DefinedCore.target")  */
    protected outcome (_ok: boolean, _output: string[], task: AgentTask): string {
        return this.core.settled(task.id)?.state ?? this.core.target(this.core.records.get(task.id))
    }

    /*  whether a task was processed successfully  */
    protected succeeded (_to: string, _value: string | null | undefined, task: AgentTask): boolean {
        return recordSuccess(this.core.records.get(task.id))
    }

    /*  the assignee to hand a processed task over to: the one decided by
        the hook "settle", else the one of "--assign-success" resp. "--assign-failure"  */
    protected handover (success: boolean, previous: string, task: AgentTask): string {
        return handoverTo(this.core.settled(task.id)?.assignee ??
            (success ? this.def.assign.success : this.def.assign.failure), previous)
    }

    /*  settle a processed task, holding off a failed and untagged one for its retry  */
    protected async settle (task: AgentTask, ok: boolean, finished: boolean, aborted: boolean,
        output: string[], log: AgentLog): Promise<void> {
        await super.settle(task, ok, finished, aborted, output, log)
        const failed = !aborted && !recordSuccess(this.core.records.get(task.id)) && this.label(ok, output, task) === null
        const delay  = this.core.retry(task.id, failed)
        if (delay > 0) {
            await log("info", `task held off from its retry for ${delay / 1000}s`)
            this.redispatch(delay)
        }
    }
}

/*  the request agent of a definition (see "--type request")  */
export class DefinedRequestAgent extends RequestAgent {
    readonly kind: string
    protected readonly description = ""
    protected readonly requests:   TaskRequests
    protected readonly serial:     boolean  = false
    protected readonly worktree:   boolean  = false
    protected readonly lifecycles: string[] = []
    private core: DefinedCore

    constructor (log: Log, private def: ResolvedDefinition, private identity: Identity) {
        super(log)
        this.kind            = identity.kind
        this.core            = new DefinedCore(log, def, () => ({
            name: this.name, kind: this.kind, mode: this.mode, lifecycle: this.lifecycle!, interruption: this.interruption
        }))
        this.requests        = new TaskRequests(def.request.name, def.tag.name, def.request.done)
        this.presenceRequest = def.request.name
        this.presencePrompt  = def.request.prompt
        this.presenceTitle   = def.title
        this.presenceDesc    = def.description
        this.modelSpec       = def.model.spec
        this.serial          = def.serial
        this.worktree        = def.workdir !== "project"
        this.lifecycles      = def.lifecycles
        this.mode            = identity.mode
    }

    /*  the identity of the agent  */
    protected get assignee (): string {
        return this.def.assign.name
    }
    protected get role (): string {
        return this.identity.role
    }
    protected get runKind (): string {
        return this.identity.runKind
    }

    /*  start and stop the agent by the hooks "start" and "stop"  */
    protected async init (): Promise<void> {
        await this.core.start((level, msg) => this.write(level, this.name, msg))
    }
    protected async teardown (): Promise<void> {
        await this.core.stop((level, msg) => this.write(level, this.name, msg))
    }

    /*  select the tasks by the request semantics and by their tags  */
    protected select (items: AgentItem[], busy: Set<string>): AgentSelection {
        return this.core.filter(items, super.select(items, busy))
    }

    /*  prioritize the dispatchable tasks by the hook "order"  */
    protected async order (tasks: AgentTask[]): Promise<AgentTask[]> {
        return this.core.order(tasks, (level, msg) => this.write(level, this.name, msg))
    }

    /*  a task is claimed only without a skipping attachment, if ready by the
        hook "ready" (if any), and while its working directory is free  */
    protected async ready (task: AgentTask): Promise<boolean> {
        if (await this.core.skipped(task))
            return false
        const wait = await this.core.ready(task, (level, msg) => this.write(level, this.name, msg))
        if (wait !== null)
            return wait !== "" ? this.defer(task, wait) : false
        return this.workdirReady(task, this.def.workdir)
    }

    /*  prepare the job of a task in its working directory  */
    protected async prepare (task: AgentTask, parallel: boolean, log: AgentLog): Promise<AgentJob> {
        this.core.records.delete(task.id)
        const claim = this.claims.get(task.id)!
        const work  = await this.workdirJob(task, this.def.workdir, this.identity.suffix, parallel, {
            checkout: this.def.prompt.template.names.has("source-dir"),
            commit:   this.def.finish.commit,
            snapshot: this.def.attach.changeset
        })
        return this.core.prepare(task, log, work, claim.prompt, async () =>
            (await Task.inspect(this.log, task.id, (plan) => this.digest(plan) !== claim.digest)) ?? false)
    }

    /*  the reason of a failed processing of a request (or null on success): the reason
        of a failed preparing or finishing command, else of a reported error of the skill,
        else of a failed agent tool, else of the first unmet success criterion, where the
        plan change is finally decided from the settling plan, and where an interrupted
        processing succeeds only once it changed the plan (as its criteria cannot tell)  */
    protected failure (outcome: RequestOutcome): string | null {
        const record = this.core.records.get(outcome.id)
        const checks = (record?.checks ?? []).map((check) => check.criterion === "changed" ? { ...check, ok: outcome.changed } : check)
        if (record !== undefined && record.fixed === "" && checks.every((check) => check.ok)
            && (!outcome.aborted || outcome.changed))
            return null
        else if (record !== undefined && record.fixed !== "")
            return record.fixed
        return outcome.errored ? "skill reported an error" : !outcome.ok ? "agent tool failed" :
            checks.find((check) => !check.ok)?.reason ?? "agent tool failed"
    }

    /*  the assignee to hand a processed task over to: the one decided by
        the hook "settle", else the one of "--assign-success" resp. "--assign-failure"  */
    protected handover (success: boolean, previous: string, task: AgentTask): string {
        return handoverTo(this.core.settled(task.id)?.assignee ??
            (success ? this.def.assign.success : this.def.assign.failure), previous)
    }
}

