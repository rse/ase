/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import { Task }                     from "./ase-task.js"
import * as TaskFormat              from "./ase-task-format.js"
import type * as API                from "./ase-task-store-plugin-api.js"
import type { AgentTask, AgentItem, AgentSelection, AgentLog, LineLevel } from "./ase-agent-runtime-task.js"
import {
    tagsOf, taggedWith,
    flatKeys, setPlanTag, updateTask
}                                   from "./ase-agent-runtime-task.js"
import { Agent }                    from "./ase-agent-runtime.js"

/*  the lifecycle states of the phase of an agent: the "incoming" states of the tasks
    to claim, the "activity" state during processing, the "success" state (set by the
    skill itself or by the agent), and the first state in the order of the lifecycle
    model from which on a predecessor task has "passed" the phase  */
export type AgentStates = { incoming: string[], activity: string, success: string, passed: string }

/*  the pseudo state of an outcome restoring the status of a task before its claim
    (i.e., the incoming state it was claimed from)  */
export const statePrevious = "PREVIOUS"

/*  restore the previous assignee of a task plan (or clear it with an empty <assignee>),
    but only if it is still assigned to the agent <name> (and not meanwhile to somebody
    else, e.g. a human or the editor agent)  */
const reassign = (plan: API.TaskPlan, name: string, assignee: string): void => {
    if (String(plan.header.Assignee ?? "").trim() !== name)
        return
    if (assignee !== "")
        plan.header.Assignee = assignee
    else
        delete plan.header.Assignee
}

/*  the agent driving one phase of a task lifecycle model (by default "enterprise", see
    "lifecycles"): it claims every task in one of the "incoming" states, which does not
    carry the tag "ase-agent-<kind>" yet, whose "After:" predecessors all passed the phase,
    and which is either still unassigned (unless the agent requires the assignment) or
    already assigned to the agent, into the "activity" state, processes it via an ASE skill
    of the headless agent tool, tags it, and moves it into the state decided by the concrete
    agent, or, processing the tasks unclaimed (see "unclaimed"), it processes every task in
    its states, which does not carry the tag yet, without claiming it, and just tags it  */
export abstract class PhaseAgent extends Agent {
    /*  the phase states of the agent  */
    protected abstract readonly states: AgentStates

    /*  the states of the tasks processed *unclaimed* (each adapted onto the task lifecycle
        model of the project), or none to claim the tasks of the "incoming" state (by default):
        an unclaimed task is selected independent of its assignee and its predecessors (see
        "observe"), picked without any change of it (see "pick"), and settled by its tag only
        (see "annotate"), so its status and its assignee are never changed and no other agent
        is kept off it, where hence the skill itself has to save its result conditionally, as
        another agent can claim and change the task meanwhile  */
    protected readonly unclaimed: string[] = []

    /*  whether only tasks already assigned to the agent (with its name as their
        "Assignee:", e.g. explicitly by a human) are claimed, instead of also
        the still unassigned tasks  */
    protected readonly assigned: boolean = false

    /*  whether an outcome of the agent can restore the status of a task before its claim
        (see "statePrevious"), so a task which the skill itself moved back into one of the
        "incoming" states (e.g. "ase-task-reboot", which resets it into the default state)
        is still held by the agent  */
    protected readonly restoring: boolean = false

    /*  the status of each claimed task before its claim (one of the "incoming" states)  */
    private origins = new Map<string, string>()

    /*  whether the job of the agent finishes the result of the skill afterwards (e.g. by
        committing and publishing it), so a task already in the "success" state does not
        prove the finishing (see "recover"), where a concrete agent can decide on it
        on its initialization (e.g. by its mode)  */
    protected finishing = false

    /*  the assignee under which the agent claims, holds, recognizes, and releases
        the tasks (default: its name)  */
    protected get assignee (): string {
        return this.name
    }

    /*  whether a task is dispatchable to the agent by its assignee: a task
        pre-assigned to the agent always is, an unassigned task only if the
        agent does not require the assignment, and a task assigned to anybody
        else (a human or another agent) never is  */
    private assignedTo (keys: Map<string, string>): boolean {
        const assignee = (keys.get("Assignee") ?? "").trim()
        return assignee === this.assignee || (assignee === "" && !this.assigned)
    }

    /*  decide on the resulting state of a task, still in the "activity" state after
        the skill invocation, by its success and its output lines  */
    protected abstract outcome (ok: boolean, output: string[], task: AgentTask): string

    /*  decide whether a processed task, moved into the state <to> and tagged with the value
        <value> of its label, was processed successfully (for the level and the wording of
        the result log line): by default, if moved into the "success" state, labeled, or untagged  */
    protected succeeded (to: string, value: string | null | undefined, _task: AgentTask): boolean {
        return to === this.states.success || value !== undefined
    }

    /*  decide on the assignee to hand a processed task <task> over to, by its success
        and its previous assignee <previous> before the claim (or empty to unassign it):
        by default, a processed task is unassigned  */
    protected handover (_success: boolean, _previous: string, _task: AgentTask): string {
        return ""
    }

    /*  decide on the value of the tag of a processed task (e.g. a verdict of the
        skill) by its success and its output lines, or none (undefined) for a plain
        tag, or no tag at all (null), if the result of the processing itself (e.g. an
        attachment) keeps the agent from claiming the task again (see "ready")  */
    protected label (_ok: boolean, _output: string[], _task: AgentTask): string | null | undefined {
        return undefined
    }

    /*  the tag marking the tasks picked up by any agent of its kind: with the
        value "active" ("ase-agent-<kind>:active") from the claim on, and plain
        ("ase-agent-<kind>") or with the value of its label (e.g. a verdict, like
        "ase-agent-qualifier:approve") once processed, so a task which the skill itself
        puts back into the "incoming" state during its processing (e.g.
        "ase-task-reboot", which takes over the tags) is never picked up again
        by a peer agent and does not count as passed for its successors yet,
        where an agent can use a tag of its own per mode (e.g. "ase-agent-implementer-draft")  */
    protected get tag (): string {
        return `ase-agent-${this.kind}`
    }

    /*  the description of the tag value <value> of a processed task (see "label")  */
    private tagged (value: string | null | undefined): string {
        return value === null ? "untagged" : `tag "${value !== undefined ? `${this.tag}:${value}` : this.tag}"`
    }

    /*  the states of the tasks processed unclaimed, adapted onto the task lifecycle model  */
    private observed (): Set<string> {
        const lifecycle = this.lifecycle!
        return new Set(this.unclaimed.map((state) => TaskFormat.adaptStatus(lifecycle, state)))
    }

    /*  whether a predecessor <pred> (known and not cancelled) with its <status> (adapted
        to the lifecycle model) passed the phase for its successor <item>: by default once
        in or beyond the "passed" state, or in the "success" state and tagged as processed,
        where a predecessor still held by an agent of its kind (tagged as "active") has not
        passed the phase yet while in the "success" state or not finished, even if the skill
        already moved it into or beyond the "passed" state, as the agent still finishes it
        (e.g. commits and publishes its change set) and might still fail it, and where a
        predecessor whose finishing failed (tagged as "failed") has not passed the phase
        yet while still in the "success" state, but has once moved on beyond it (e.g. after
        a manual intervention)  */
    protected passes (pred: AgentItem, status: string, _item: AgentItem): boolean {
        const lifecycle = this.lifecycle!
        const { success, passed } = this.states
        const index = (status: string) => lifecycle.states.indexOf(status)
        const tags  = tagsOf(pred.keys)
        if (status === success)
            return !tags.includes(`${this.tag}:active`) && !tags.includes(`${this.tag}:failed`)
                && (index(status) >= index(passed) || taggedWith(pred.keys, this.tag))
        else
            return index(status) >= index(passed)
                && (!tags.includes(`${this.tag}:active`) || lifecycle.finished.includes(status))
    }

    /*  whether a task has predecessors: those of its "After:" key, or, as an
        explicit epic (a task being its own group), the members of its group  */
    private dependent (task: AgentTask): boolean {
        return (task.keys.get("After") ?? "").trim() !== "" || (task.keys.get("Group") ?? "").trim() === task.id
    }

    /*  whether a task in the status <status> is still held in the phase by the agent: in
        the "activity" state, or, for a restoring agent, back in one of the "incoming" states  */
    private held (status: string): boolean {
        return status === this.states.activity || (this.restoring && this.states.incoming.includes(status))
    }

    /*  select the dispatchable tasks among all listed tasks <items> (except the
        <busy> ones already processed in a worker slot), the tasks waiting (with the
        reason), and the tasks with a notice: by default every task in one of the "incoming"
        states, which is not tagged yet, is dispatchable to the agent by its assignee,
        and whose predecessors all passed the phase (see "passes") or no longer exist,
        else waiting, where the predecessors of a task are those of its "After:" key and,
        for an explicit epic (a task being its own group), implicitly all other tasks of
        its group, where a predecessor with a status foreign to the lifecycle model is
        judged by the status it maps onto, where a cancelled predecessor of the "After:"
        key never passes (as the successor might depend on its never delivered result,
        so the successor waits until a human resolves the dependency), while a cancelled
        member of an epic counts as dropped from the epic (and hence as passed), and
        where a task with unknown or cancelled predecessors, or waiting in a dependency
        cycle (both of which never resolve by themselves), is noticed, while the tasks
        processed unclaimed are selected otherwise (see "observe")  */
    protected select (items: AgentItem[], busy: Set<string>): AgentSelection {
        if (this.unclaimed.length > 0)
            return this.observe(items, busy)
        const lifecycle = this.lifecycle!
        const { incoming } = this.states
        const known   = new Map(items.map((item) => [ item.id, item ]))
        const waiting = new Map<string, string>()
        const notices = new Map<string, string>()
        const tasks: AgentTask[] = []

        /*  determine the explicit predecessors of all tasks, and the
            implicit ones of the explicit epics (their group members)  */
        const members = new Map<string, string[]>()
        for (const item of items) {
            const group = (item.keys.get("Group") ?? "").trim()
            if (group !== "" && group !== item.id)
                members.set(group, [ ...(members.get(group) ?? []), item.id ])
        }
        const explicit = new Map(items.map((item) => [ item.id, [ ...new Set((item.keys.get("After") ?? "").split(",")
            .map((after) => after.trim())
            .filter((after) => after !== "")) ] ]))
        const implicit = new Map(items.map((item) => [ item.id, (item.keys.get("Group") ?? "").trim() === item.id ?
            (members.get(item.id) ?? []).filter((member) => !explicit.get(item.id)!.includes(member)) : [] ]))
        const preds = (id: string) => [ ...(explicit.get(id) ?? []), ...(implicit.get(id) ?? []) ]

        /*  determine whether a (known) predecessor passed the phase for its successor  */
        const cancelled = (id: string) => TaskFormat.adaptStatus(lifecycle, known.get(id)!.status) === "CANCELLED"
        const done = (id: string, succ: string): boolean => {
            const pred   = known.get(id)!
            const status = TaskFormat.adaptStatus(lifecycle, pred.status)
            if (status === "CANCELLED")
                return !explicit.get(succ)!.includes(id)
            return this.passes(pred, status, known.get(succ)!)
        }

        /*  determine the dependency cycle through a task along the predecessors
            not passed yet (as a path from the task back to itself, else empty)  */
        const cycle = (id: string): string[] => {
            const seen = new Set<string>()
            const walk = (path: string[]): string[] => {
                const last = path[path.length - 1]
                for (const pred of preds(last)) {
                    if (pred === id)
                        return [ ...path, id ]
                    if (!known.has(pred) || seen.has(pred) || done(pred, last))
                        continue
                    seen.add(pred)
                    const found = walk([ ...path, pred ])
                    if (found.length > 0)
                        return found
                }
                return []
            }
            return walk([ id ])
        }

        /*  select the tasks  */
        const quoted = (ids: string[]) => ids.map((id) => `"${id}"`)
        for (const item of items.filter((item) => incoming.includes(item.status)
            && !taggedWith(item.keys, this.tag) && this.assignedTo(item.keys) && !busy.has(item.id))) {
            const after   = preds(item.id)
            const unknown = after.filter((pred) => !known.has(pred))
            const pending = after.filter((pred) => known.has(pred) && !done(pred, item.id))
            const dropped = pending.filter((pred) => cancelled(pred))
            const cyclic  = pending.length > 0 ? cycle(item.id) : []
            const notes: string[] = []
            if (unknown.length > 0)
                notes.push(`references the unknown predecessors ${quoted(unknown).join(", ")} (treated as passed)`)
            if (dropped.length > 0)
                notes.push(`waits for the cancelled predecessors ${quoted(dropped).join(", ")}, ` +
                    "which never pass (remove them from its \"After:\" key, or cancel the task, too)")
            if (cyclic.length > 0)
                notes.push(`waits in the dependency cycle ${quoted(cyclic).join(" → ")} (each after the next), ` +
                    "which never resolves by itself")
            if (notes.length > 0)
                notices.set(item.id, notes.join(", and "))
            if (pending.length === 0)
                tasks.push({ id: item.id, title: item.title, keys: item.keys })
            else
                waiting.set(item.id, "its predecessors " +
                    pending.map((pred) => `"${pred}" (${known.get(pred)!.status})`).join(", "))
        }
        return { tasks, waiting, notices }
    }

    /*  select the tasks processed unclaimed: every task in one of the unclaimed states (by
        its status adapted onto the lifecycle model), which is not tagged yet, independent of
        its assignee and its predecessors (as its processing never progresses its lifecycle),
        except one whose finalization is still retried (as it is not tagged yet)  */
    private observe (items: AgentItem[], busy: Set<string>): AgentSelection {
        const lifecycle = this.lifecycle!
        const states    = this.observed()
        const tasks     = items
            .filter((item) => states.has(TaskFormat.adaptStatus(lifecycle, item.status))
                && !taggedWith(item.keys, this.tag) && !busy.has(item.id) && !this.unsettled.has(item.id))
            .map((item) => ({ id: item.id, title: item.title, keys: item.keys }))
        return { tasks, waiting: new Map<string, string>() }
    }

    /*  claim a selected task, returning the description of the claim (for the processing
        log), or null if the task was skipped (throws if the claim failed):
        by default the claim is won only if the task is still in one of the "incoming" states,
        and the task is then moved into the "activity" state, tagged as "active", and assigned
        to the agent, all in a single conditional update of the task (retried on a concurrent
        change of it), so a failed claim never leaves the task half-claimed, and the claim
        is recorded for the run of the agent, so it is recovered after a termination,
        while a task processed unclaimed is just picked (see "pick")  */
    protected async claim (task: AgentTask): Promise<string | null> {
        if (this.unclaimed.length > 0)
            return this.pick(task)
        const { incoming, activity } = this.states

        /*  a task with predecessors is re-checked against a fresh listing right before
            its claim, as its predecessors might have changed since the listing of the
            dispatching (e.g. while the task was prepared, see "ready"), so a task no
            longer dispatchable is silently skipped (and reported as waiting by the next
            dispatching, triggered by the change of its predecessors)  */
        if (this.dependent(task)) {
            const { items } = await Task.listHeaders(this.log)
            if (!this.select(items, new Set()).tasks.some((selected) => selected.id === task.id))
                return null
        }

        /*  a task whose status changed meanwhile is skipped, while a task tagged
            meanwhile was already picked up by an agent of this kind (e.g. a peer agent,
            after the listing) and a task (re)assigned meanwhile is no longer for the
            agent, so both are silently skipped, and any other task is claimed (with its
            current header keys, including the previous assignee to restore on interrupt)  */
        let from    = ""
        let origin  = ""
        let skipped = ""
        let keys    = task.keys

        /*  the header keys of the task of the last attempted claim which might have been saved,
            as a retried update after a claim saved, but whose response was lost, finds the
            task already claimed by itself (and not by another agent of the same name, as
            the attempt is reset whenever its save was surely rejected)  */
        let attempted: Map<string, string> | null = null
        try {
            const exists = await updateTask(this.log, task.id, (plan, lifecycle) => {
                from = TaskFormat.taskStatus(plan.header, lifecycle)
                const current = flatKeys(plan.header)
                if (attempted !== null && from === activity && tagsOf(current).includes(`${this.tag}:active`)
                    && (current.get("Assignee") ?? "").trim() === this.assignee) {
                    keys    = attempted
                    skipped = ""
                    return false
                }
                keys    = current
                skipped = !incoming.includes(from) ? "status" :
                    taggedWith(keys, this.tag) || !this.assignedTo(keys) ? "silently" : ""
                if (skipped !== "")
                    return false
                origin = from
                this.runLock.claim(task.id, {
                    name: this.assignee, tag: this.tag, assignee: (keys.get("Assignee") ?? "").trim(), status: origin
                })
                plan.header.Status = activity
                setPlanTag(plan, this.tag, "active")
                plan.header.Assignee = this.assignee
                attempted = keys
                return true
            }, () => {
                attempted = null
            })
            if (!exists)
                skipped = "silently"
        }
        catch (err: unknown) {
            /*  the claim is still recorded if it might have been saved (as its
                response was lost), so the task is recovered after the run  */
            if (attempted === null)
                this.runLock.unclaim(task.id)
            throw err
        }
        if (skipped !== "") {
            this.runLock.unclaim(task.id)
            if (skipped === "status")
                await this.write("warning", this.name, `task "${task.id}" skipped, as its status changed meanwhile to "${from}"`)
            return null
        }
        task.keys = keys
        this.origins.set(task.id, origin)
        return `claimed task (status "${origin}" → "${activity}")`
    }

    /*  pick a selected task for its unclaimed processing, returning the description of the
        pick (for the processing log), or null if the task was skipped: the task is re-checked
        against its current plan (as it might have changed since the listing of the
        dispatching, e.g. by its claim through another agent), but never changed, and the pick
        is only recorded for the run of the agent, so no peer agent of its kind on this host
        picks it up meanwhile (while peer agents on other hosts are not coordinated, as the
        conditional save of the result by the skill keeps their processings apart)  */
    private async pick (task: AgentTask): Promise<string | null> {
        const current = await Task.inspect(this.log, task.id, (plan, lifecycle) => ({
            status: TaskFormat.adaptStatus(lifecycle, TaskFormat.taskStatus(plan.header, lifecycle)),
            keys:   flatKeys(plan.header)
        }))
        if (current === null || taggedWith(current.keys, this.tag))
            return null
        else if (!this.observed().has(current.status)) {
            await this.write("info", this.name, `task "${task.id}" skipped, as its status changed meanwhile to "${current.status}"`)
            return null
        }
        else if (await this.runLock.claimed(task.id))
            return null
        this.runLock.claim(task.id, { name: this.assignee, tag: this.tag, assignee: (current.keys.get("Assignee") ?? "").trim() })
        task.keys = current.keys
        return `picked task unclaimed (status "${current.status}")`
    }

    /*  settle a processed task after the skill invocation (successful by <ok>,
        with the job finished by <finished>, or interrupted by <aborted>), by
        default deciding on its status: a task already in the "success" state is
        tagged plain or labeled, unassigned, and kept, a task still held in the phase (see "held")
        returns untagged (and with its previous assignee) into its "incoming" state of the claim
        on interrupt and is otherwise tagged plain or labeled, unassigned, and moved into the
        state of the outcome (where "statePrevious" restores its "incoming" state of the claim), where a task already in the "success" state, but whose
        finishing failed (e.g. one already "INTEGRATED" resp. "IMPLEMENTED" by the
        skill, but whose publishing of the merge resp. of the changeset branch was
        rejected), and a task whose outcome is not reachable from its state, is
        tagged as "failed", unassigned, and left in its state for a manual intervention
        (instead of being parked, e.g. "STALLED", which is reachable from "IMPLEMENTED"
        via "QUALIFYING" and "PLANNED" and would hide the failure), while a task processed
        unclaimed is just tagged (see "annotate")  */
    protected async settle (task: AgentTask, ok: boolean, finished: boolean, aborted: boolean,
        output: string[], log: AgentLog): Promise<void> {
        if (this.unclaimed.length > 0)
            return this.annotate(task, ok, aborted, output, log)
        const { incoming, activity, success } = this.states

        /*  the tag is made plain or labeled (and the assignee cleared, or handed over) together
            with the status change, in a single conditional update of the task (retried on a
            concurrent change of it), so no agent of its kind claims a processed task again, and a
            processing with a label (e.g. a verdict) or without a tag (as its result itself
            guards it) succeeded, even if not moved into the "success" state, where the
            assignee is only cleared (resp. restored, or handed over) if the task is still
            assigned to the agent (and not meanwhile, e.g., to the editor agent), and where a
            task already in the "success" state counts as processed by the skill only if the
            "success" state differs from the "activity" state (else it is decided by the outcome)  */
        const value    = aborted ? undefined : this.label(ok, output, task)
        const assignee = (task.keys.get("Assignee") ?? "").trim()
        const origin   = this.origins.get(task.id) ?? incoming[0]
        let level: LineLevel = "info"
        let result = ""
        const finish = () => updateTask(this.log, task.id, (plan, lifecycle) => {
            const status = TaskFormat.taskStatus(plan.header, lifecycle)
            const held   = this.held(status)
            if (held && aborted) {
                setPlanTag(plan, this.tag, null)
                reassign(plan, this.assignee, assignee)
                plan.header.Status = origin
                level  = "warning"
                result = `task released (status "${status}" → "${origin}", untagged)`
            }
            else if (status === success && status !== activity && finished && !held) {
                const good = this.succeeded(success, value, task)
                setPlanTag(plan, this.tag, value)
                reassign(plan, this.assignee, this.handover(good, assignee, task))
                level  = good ? "info" : "warning"
                result = `task processed ${good ? "successfully" : "unsuccessfully"} (status "${success}", ${this.tagged(value)})`
            }
            else if (held || status === success) {
                const outcome = this.outcome(ok, output, task)
                const to      = outcome === statePrevious ? origin : outcome
                if (status === success && !held) {
                    /*  the skill succeeded, but the finishing failed (as "finished" is
                        false here), so the result of the skill (e.g. a merge or a commit
                        not published) must not be hidden by parking the task  */
                    setPlanTag(plan, this.tag, "failed")
                    reassign(plan, this.assignee, "")
                    level  = "error"
                    result = `task processed, but its finishing failed -- left in "${status}" ` +
                        `for a manual intervention (${this.tagged("failed")})`
                }
                else if (TaskFormat.checkStatus(lifecycle, status, to) !== "") {
                    setPlanTag(plan, this.tag, "failed")
                    reassign(plan, this.assignee, "")
                    level  = "error"
                    result = `task processed, but its status "${status}" cannot change into "${to}" ` +
                        `-- left in "${status}" for a manual intervention (${this.tagged("failed")})`
                }
                else {
                    const good = this.succeeded(to, value, task)
                    setPlanTag(plan, this.tag, value)
                    reassign(plan, this.assignee, this.handover(good, assignee, task))
                    plan.header.Status = to
                    level  = good ? "info" : "warning"
                    result = `task processed ${good ? "successfully" : "unsuccessfully"} ` +
                        `(status "${status}" → "${to}", ${this.tagged(value)})`
                }
            }
            else {
                /*  tagged, too, as a skill can itself move the task back into the
                    "incoming" state (e.g. "ase-task-integrate" on nothing to integrate)  */
                setPlanTag(plan, this.tag, value)
                reassign(plan, this.assignee, this.handover(this.succeeded(status, value, task), assignee, task))
                level  = "warning"
                result = `task status changed meanwhile to "${status}" -- left untouched (${this.tagged(value)})`
            }
            return true
        })
        await this.finalize(task, finish, () => ({ level, result }), log)
    }

    /*  settle a task processed unclaimed by its tag only (see "label"), in a single
        conditional update of the task (retried on a concurrent change of it), which is
        saved only if its tag changes, so neither its status nor its assignee is ever
        changed (also if the skill itself moved it elsewhere meanwhile), where a task whose
        processing was interrupted is left untouched  */
    private async annotate (task: AgentTask, ok: boolean, aborted: boolean,
        output: string[], log: AgentLog): Promise<void> {
        if (aborted) {
            this.runLock.unclaim(task.id)
            await log("warning", "task released (processing interrupted, task left untouched)")
            return
        }
        const value = this.label(ok, output, task)
        let level: LineLevel = "info"
        let result = ""
        const finish = () => updateTask(this.log, task.id, (plan, lifecycle) => {
            const status = TaskFormat.taskStatus(plan.header, lifecycle)
            const tags   = () => tagsOf(flatKeys(plan.header)).join(",")
            const before = tags()
            const good   = this.succeeded(status, value, task)
            setPlanTag(plan, this.tag, value)
            level  = good ? "info" : "warning"
            result = `task processed ${good ? "successfully" : "unsuccessfully"} ` +
                `(status "${status}" kept, ${this.tagged(value)})`
            return tags() !== before
        })
        await this.finalize(task, finish, () => ({ level, result }), log)
    }

    /*  finalize a processed task by the settling update <finish> (resolving to whether the
        task still exists) and log its result of <report>, where a finalization failing even
        after its retries is retried in the background (see "unsettle"), while the claim stays
        recorded for the run, so the task never stays in the "activity" state (and is
        recovered after a termination meanwhile)  */
    private async finalize (task: AgentTask, finish: () => Promise<boolean>,
        report: () => { level: LineLevel, result: string }, log: AgentLog): Promise<void> {
        let exists: boolean
        try {
            exists = await finish()
        }
        catch (err: unknown) {
            this.unsettle(task.id, async () => {
                const exists = await finish()
                const { level, result } = report()
                this.runLock.unclaim(task.id)
                this.origins.delete(task.id)
                await this.write(exists ? level : "warning", `${this.name}: ${task.id}`,
                    exists ? `${result} (finalization retried)` : "task vanished -- finalization dropped",
                    undefined, task.id)
                return true
            })
            await log("error", "finalizing the task failed (retried later): " +
                `${err instanceof Error ? err.message : String(err)}`)
            return
        }
        this.runLock.unclaim(task.id)
        this.origins.delete(task.id)
        const { level, result } = report()
        if (exists)
            await log(level, result)
        else
            await log("warning", "task vanished meanwhile")
    }

    /*  recover the tasks left behind by terminated runs of agents of its kind (e.g. killed
        ones), as recorded for their runs, where each terminated run is seized exclusively
        (so concurrently started agents never recover the same run), and a task is recovered
        only if still owned by the terminated agent, i.e., still tagged as "active" and assigned
        to it, and not claimed meanwhile by a live agent of this host (e.g. after its release
        by an earlier recovery, or after its settling right before the termination): such a
        task is released (like on an interrupt) if still held in the phase (see "held"), tagged as
        "failed" (like on a failed finishing, see "settle") if in the "success" state of an
        agent whose job finishes the result of the skill, as the finishing (e.g. the publishing
        of the change set) might never have run, and else tagged plain (as processed), where
        each recovered claim is removed from the record of the run, and the record of a run
        is removed once all its tasks are recovered  */
    protected async recover (): Promise<void> {
        const { incoming, success } = this.states
        for (const run of await this.runLock.dead()) {
            const claims = await this.runLock.seize(run)
            if (claims === null)
                continue
            let recovered = true
            for (const [ id, claim ] of Object.entries(claims)) {
                let result = ""
                try {
                    if (await this.runLock.claimed(id)) {
                        this.runLock.forget(run, id)
                        continue
                    }
                    await updateTask(this.log, id, (plan, lifecycle) => {
                        const status = TaskFormat.taskStatus(plan.header, lifecycle)
                        result = ""
                        if (!tagsOf(flatKeys(plan.header)).includes(`${claim.tag}:active`)
                            || String(plan.header.Assignee ?? "").trim() !== claim.name)
                            return false
                        else if (this.held(status)) {
                            const origin = claim.status !== undefined && incoming.includes(claim.status) ? claim.status : incoming[0]
                            setPlanTag(plan, claim.tag, null)
                            reassign(plan, claim.name, claim.assignee)
                            plan.header.Status = origin
                            result = `released (status "${status}" → "${origin}", untagged)`
                        }
                        else if (status === success && this.finishing) {
                            setPlanTag(plan, claim.tag, "failed")
                            reassign(plan, claim.name, "")
                            result = `processed, but its finishing might not have run -- left in "${status}" ` +
                                `for a manual intervention (tag "${claim.tag}:failed")`
                        }
                        else {
                            setPlanTag(plan, claim.tag)
                            reassign(plan, claim.name, "")
                            result = `marked as processed (status "${status}", tag "${claim.tag}")`
                        }
                        return true
                    })
                }
                catch (err: unknown) {
                    recovered = false
                    await this.write("warning", this.name, `task "${id}" of terminated ${this.role} "${claim.name}" ` +
                        `not recovered: ${err instanceof Error ? err.message : String(err)}`)
                    continue
                }
                this.runLock.forget(run, id)
                if (result !== "")
                    await this.write("warning", this.name, `task "${id}" of terminated ${this.role} "${claim.name}" ${result}`)
            }
            if (recovered)
                await this.runLock.purge(run)
            else
                await this.runLock.free(run)
        }
    }

    /*  the description of the observed tasks (for the start log line)  */
    protected observing (): string {
        if (this.unclaimed.length > 0)
            return `${[ ...this.observed() ].map((state) => `"${state}"`).join(", ")} tasks without tag "${this.tag}" ` +
                "(unclaimed, independent of their assignee and predecessors)"
        return `${this.states.incoming.map((state) => `"${state}"`).join(", ")} tasks without tag "${this.tag}" ` +
            (this.assigned ? `and assigned to "${this.assignee}"` : `and unassigned or assigned to "${this.assignee}"`)
    }
}

