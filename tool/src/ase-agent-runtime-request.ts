/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import crypto                       from "node:crypto"
import os                           from "node:os"

import { Task }                     from "./ase-task.js"
import * as TaskFormat              from "./ase-task-format.js"
import type * as API                from "./ase-task-store-plugin-api.js"
import type { AgentTask, AgentItem, AgentSelection, AgentLog } from "./ase-agent-runtime-task.js"
import { updateTask, tagsOf, flatKeys } from "./ase-agent-runtime-task.js"
import { Agent }                    from "./ase-agent-runtime.js"
import { skillErrored }             from "./ase-agent-runtime-tool.js"
import { runOwner }                 from "./ase-agent-runtime-claim.js"
import type { TaskRequests }        from "./ase-task-request.js"
import {
    typeParam, attachmentTime,
    requestRefused, requestDeferred
}                                   from "./ase-task-request.js"

/*  the frontmatter keys of a task plan which are no plan content, as they are
    changed by the agents and the task boards (and not by the editing of the plan),
    or maintained by the task stores on every save (like the modification time,
    which the issue tracker stores even derive from the last update of the issue)  */
const nonContentKeys = [ "Status", "Tags", "Assignee", "Modified" ]

/*  the outcome of the processing of a request, for deciding on its success: the id of the
    task, its current plan, whether its content changed since the claim, whether the skill
    reported an error, whether the agent tool succeeded, whether the processing was
    interrupted, and the output lines  */
export type RequestOutcome = {
    id:      string
    plan:    API.TaskPlan
    changed: boolean
    errored: boolean
    ok:      boolean
    aborted: boolean
    output:  string[]
}

/*  the agent processing the requests attached to tasks (see "TaskRequests") in any task
    lifecycle model, independent of the status of the tasks (except for refusing the requests
    of finished tasks and deferring those of tasks in an activity status): it claims the oldest
    request of a task by turning it into a processed one and assigning the task to the agent
    (keeping all other agents off it), lets the concrete agent process the prompt of the request
    via an ASE skill of the headless agent tool, restores the previous assignee, and removes the
    request if the task plan was changed (else turns it into a failed one, or back into a
    requested one on interrupt), where a per-process run lock (in the per-user state directory,
    hence per host and user, see "AgentRun") lets it recover the requests left behind by
    terminated agents of its kind  */
export abstract class RequestAgent extends Agent {
    /*  the requests processed by the agent  */
    protected abstract readonly requests: TaskRequests

    protected readonly lifecycles = [ "solo", "team", "enterprise" ]

    /*  the claimed requests per task id: their prompt, the previous assignee
        of the task, and the digest of the plan content right after the claim  */
    protected claims = new Map<string, { prompt: string, assignee: string, digest: string }>()

    /*  the assignee under which the agent claims, holds, recognizes, and releases
        the tasks (default: its name)  */
    protected get assignee (): string {
        return this.name
    }

    /*  decide on the assignee to hand a processed task <task> over to, by its success
        and its previous assignee <previous> before the claim (or empty to unassign it):
        by default, the previous assignee is restored  */
    protected handover (_success: boolean, previous: string, _task: AgentTask): string {
        return previous
    }

    /*  whether an attachment type is the one of a request processed by this agent process  */
    private own (type: string): boolean {
        return this.requests.state(type) === "active" && typeParam(type, "run") === this.runLock.id
    }

    /*  whether an attachment type is the one of a request processed by an agent process
        whose run lock is in the same per-user state directory on this host (by its host and
        owner), i.e., whose termination can be determined (by its run lock and its process id)  */
    private local (type: string): boolean {
        return this.requests.state(type) === "active"
            && typeParam(type, "host") === os.hostname() && typeParam(type, "owner") === runOwner
    }

    /*  the digest of the content of a task plan, as the processing can change it: its
        frontmatter (except the keys changed by the agents and the task boards, like its
        status, tags, and assignee) and its body, but none of its attachments (like the
        requests and the agent processing logs), for detecting whether it was edited  */
    protected digest (plan: API.TaskPlan): string {
        const header = Object.fromEntries(Object.entries(plan.header)
            .filter(([ key ]) => !nonContentKeys.includes(key)))
        return crypto.createHash("sha1").update(JSON.stringify({ header, body: plan.body })).digest("hex")
    }

    /*  the tag "ase-agent-<kind>:active" of a phase agent holding a task (else empty), which
        it carries from the claim until the settling by the phase agent, i.e., also while the
        phase agent still finishes a task already moved into its "success" state by the skill
        (e.g. commits and publishes its change set), so the task is still neither to be
        assigned to this agent nor to be edited meanwhile  */
    private held (keys: Map<string, string>): string {
        return tagsOf(keys).find((tag) => /^ase-agent-[^:]+:active$/.test(tag)
            && !tag.startsWith(`${this.requests.tag}:`)) ?? ""
    }

    /*  recover the requests of terminated agent processes of its kind of the same user
        on this host (whose process is gone, see "AgentRun.alive") by marking
        them as failed and restoring the previous assignee of their tasks, and remove the
        run locks left behind by terminated runs, except those still recording claims, as
        these are left to the recovery of the phase agents sharing the run namespace (like
        the phase mode of a built-in agent)  */
    protected async recover (): Promise<void> {
        const runs = await this.runLock.dead()
        const { items } = await Task.listHeaders(this.log)
        for (const item of items.filter((item) => this.requests.of(item.keys) === "active")) {
            const dead = new Set<string>()
            for (const att of await Task.attachments(this.log, item.id)) {
                const run = typeParam(att.type, "run")
                if (this.local(att.type) && !(await this.runLock.alive(run, Number.parseInt(typeParam(att.type, "pid"), 10) || 0)))
                    dead.add(run)
            }
            if (dead.size === 0)
                continue
            await updateTask(this.log, item.id, (plan) => {
                let changed = false
                for (let i = 0; i < plan.attachment.length; i++) {
                    const type = plan.attachment[i].Type ?? ""
                    if (this.local(type) && dead.has(typeParam(type, "run"))) {
                        this.requests.finalize(plan, i, "failed", `failed (${this.role} terminated during processing)`)
                        changed = true
                    }
                }
                return changed
            })
            await this.write("warning", this.name, `task "${item.id}": ${this.requests.name} request of terminated ${this.role} marked as failed`)
        }
        for (const run of runs)
            if (!this.runLock.recoverable(run))
                await this.runLock.purge(run)
    }

    /*  select every task with a request (except one whose finalization is still retried),
        deferring those in an activity status or still held by a phase agent  */
    protected select (items: AgentItem[], busy: Set<string>): AgentSelection {
        const lifecycle = this.lifecycle!
        const tasks: AgentTask[] = []
        const waiting = new Map<string, string>()
        for (const item of items.filter((item) => this.requests.of(item.keys) === "pending" && !busy.has(item.id) && !this.unsettled.has(item.id))) {
            const held = this.held(item.keys)
            if (requestDeferred(lifecycle, item.status))
                waiting.set(item.id, `its status "${item.status}" to change`)
            else if (held !== "")
                waiting.set(item.id, `its tag "${held}" to be released`)
            else
                tasks.push({ id: item.id, title: item.title, keys: item.keys })
        }
        return { tasks, waiting }
    }

    /*  claim the oldest request of a task, in a single conditional update of the
        task (so a concurrent claim, e.g. by a phase agent, makes it fail): turn the request
        into a processed one and assign the task to the agent (remembering its previous
        assignee), which keeps all other agents off the task during its processing, where the
        request of a finished task is marked as failed instead, and a task meanwhile in an
        activity status or meanwhile held by a phase agent is skipped, and a request without
        a prompt is marked as failed (unless the agent ignores the prompts of its requests)  */
    protected async claim (task: AgentTask): Promise<string | null> {
        const lifecycle = this.lifecycle!
        let status   = ""
        let prompt   = ""
        let assignee = ""
        let sum      = ""
        let refused  = ""
        let claimed  = false
        await updateTask(this.log, task.id, (plan) => {
            status  = TaskFormat.taskStatus(plan.header, lifecycle)
            prompt  = ""
            refused = ""
            claimed = false

            /*  adopt a request already claimed by this run, as found by an update
                retried after a saved claim whose response was lost  */
            const own = plan.attachment.find((att) => this.own(att.Type ?? ""))
            if (own !== undefined) {
                prompt   = (own.Data ?? "").trim()
                assignee = typeParam(own.Type ?? "", "assignee")
                sum      = this.digest(plan)
                claimed  = true
                return false
            }
            const i = plan.attachment.findIndex((att) => this.requests.state(att.Type ?? "") === "pending")
            if (i < 0 || requestDeferred(lifecycle, status) || this.requests.running(plan)
                || this.held(flatKeys(plan.header)) !== "")
                return false
            const att = plan.attachment[i]
            if (requestRefused(lifecycle, status))
                refused = `task is finished, status "${status}"`
            else if ((att.Data ?? "").trim() === "" && this.presencePrompt === "required")
                refused = "empty prompt"
            if (refused !== "")
                plan.attachment[i] = { ...att, Type: this.requests.type("failed"), Desc: `failed (${refused})`, Modified: attachmentTime() }
            else {
                prompt   = (att.Data ?? "").trim()
                assignee = String(plan.header.Assignee ?? "")
                claimed  = true
                const params = {
                    agent: this.assignee, assignee, host: os.hostname(), owner: runOwner,
                    pid: String(process.pid), run: this.runLock.id
                }
                plan.attachment[i] = { ...att, Type: this.requests.type("active", params), Modified: attachmentTime() }
                plan.header.Assignee = this.assignee
            }
            this.requests.retag(plan)
            sum = this.digest(plan)
            return true
        })
        if (refused !== "") {
            await this.write("warning", this.name, `task "${task.id}": ${this.requests.name} request refused (${refused})`)
            return null
        }
        else if (!claimed)
            return null
        this.claims.set(task.id, { prompt, assignee, digest: sum })
        return `claimed ${this.requests.name} request (status "${status}", assigned to "${this.assignee}"` +
            (assignee !== "" ? ` instead of "${assignee}")` : ")")
    }

    /*  decide whether the processing of a request failed, returning the reason of the failure,
        or null on success (called within the settling update of the task, with its current plan,
        so it must neither change the plan nor block): by default, the processing succeeded only if
        the plan content changed since the claim and the skill reported no error (independent of the
        exit code of the agent tool and an interrupt, as the plan is saved at once), where a concrete
        agent whose processing succeeds without changing the plan (e.g. one producing an attachment
        or an external result only) overrides this with its own success criterion  */
    protected failure (outcome: RequestOutcome): string | null {
        const { changed, errored, ok } = outcome
        return changed && !errored ? null : errored ? "skill reported an error" : !ok ? "agent tool failed" : "plan not changed"
    }

    /*  settle the processed request in a single update of the task: if the processing succeeded
        (see "failure"), the request is removed, else it is turned back into a requested one on
        interrupt, or into a failed one otherwise, and in all cases the previous assignee of the task
        is restored (or the task is handed over, see "handover"); a finalization failing even after
        its retries is retried in the background
        (see "unsettle"), so the request never stays processed  */
    protected async settle (task: AgentTask, ok: boolean, _finished: boolean, aborted: boolean,
        output: string[], log: AgentLog): Promise<void> {
        const claim = this.claims.get(task.id)
        this.claims.delete(task.id)
        if (claim === undefined)
            return
        const errored = skillErrored(output)
        let result  = ""
        let success = false
        const finish = (): Promise<boolean> => updateTask(this.log, task.id, (plan) => {
            success = false
            const i = plan.attachment.findIndex((att) => this.own(att.Type ?? ""))
            if (i < 0) {
                /*  the request vanished meanwhile: just restore the assignee and the tag  */
                const before = JSON.stringify([ plan.header.Assignee, plan.header.Tags ])
                if (String(plan.header.Assignee ?? "") === this.assignee) {
                    if (claim.assignee !== "")
                        plan.header.Assignee = claim.assignee
                    else
                        delete plan.header.Assignee
                }
                this.requests.retag(plan)
                result = `${this.requests.name} request vanished meanwhile`
                return JSON.stringify([ plan.header.Assignee, plan.header.Tags ]) !== before
            }
            const changed = this.digest(plan) !== claim.digest
            const reason  = this.failure({ id: task.id, plan, changed, errored, ok, aborted, output })
            if (reason === null) {
                this.requests.finalize(plan, i, null, undefined, this.handover(true, claim.assignee, task))
                result  = `task ${this.requests.done} successfully (request removed)`
                success = true
            }
            else if (aborted) {
                this.requests.finalize(plan, i, "pending")
                result = `${this.requests.name} request released (requested again)`
            }
            else {
                this.requests.finalize(plan, i, "failed", `failed (${reason}, see attachment "agent")`,
                    this.handover(false, claim.assignee, task))
                result = `task not ${this.requests.done} (${reason}, request marked as failed)`
            }
            return true
        })
        let exists: boolean
        try {
            exists = await finish()
        }
        catch (err: unknown) {
            /*  the retried finalization reports its result itself (as the processing log of
                the task is already closed), or the vanishing of the task, which ends the retries  */
            this.unsettle(task.id, async () => {
                const exists = await finish()
                await this.write(exists ? (success ? "info" : "warning") : "warning", `${this.name}: ${task.id}`,
                    exists ? `${result} (finalization retried)` : "task vanished -- finalization of the request dropped",
                    undefined, task.id)
                return true
            })
            await log("error", `finalizing the ${this.requests.name} request failed (retried later): ` +
                `${err instanceof Error ? err.message : String(err)}`)
            return
        }
        if (exists)
            await log(success ? "info" : "warning", result)
        else
            await log("warning", "task vanished meanwhile")
    }

    /*  the description of the observed tasks (for the start log line)  */
    protected observing (): string {
        return `tasks tagged with "${this.requests.tag}:pending"`
    }
}

