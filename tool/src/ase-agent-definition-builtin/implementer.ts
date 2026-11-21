/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import type { AgentHooks } from "../ase-agent-definition-api.js"
import type { AgentKind }  from "../ase-agent-definition-core.js"
import { estimable }       from "./estimator.js"

/*  the parameters of the implementer: whether a task is claimed only once the estimator
    is done with it (default), to be disabled when no estimator agent is used  */
const params = {
    "effort-wait": {
        desc:    "whether to wait for the effort estimation of a task by the agent \"estimator\"",
        default: "true",
        allow:   [ "true", "false" ]
    }
}

/*  the additional parameters of the implementing: whether the change set is reviewed resp.
    linted (each with its findings fixed) after a successful implementing, before it is
    committed (both disabled by default)  */
const paramsImplement = {
    ...params,
    "review": {
        desc:    "whether to review and auto-fix the change set via the \"ase-repo-review\" skill after the implementing",
        default: "false",
        allow:   [ "true", "false" ]
    },
    "lint": {
        desc:    "whether to lint and auto-correct the change set via the \"ase-code-lint\" skill after the implementing",
        default: "false",
        allow:   [ "true", "false" ]
    }
}

/*  with the parameter "effort-wait", a task is claimed only once the estimator is done
    with it, i.e., once it no longer awaits its effort estimation, or once the estimator
    failed on it (and hence tagged it, so it is not estimated again), as the estimator
    processes the "PLANNED" tasks unclaimed and would else race against the implementer,
    which, if claiming a task first, would keep it from being estimated at all  */
const ready: AgentHooks["ready"] = async (task, ctx) =>
    ctx.params["effort-wait"] !== "true"
    || task.tags.some((tag) => tag === "ase-agent-estimator" || tag.startsWith("ase-agent-estimator:"))
    || !(await estimable(task, ctx))
    || "its effort estimation by the agent \"estimator\""

/*  a predecessor passed the implementation phase for its successor only once its change
    set is contained in the "Source:" of the successor, from which the successor is
    implemented resp. drafted, i.e., once integrated (and its integrated target branch
    published, i.e., not still held by the integrator or failed there), or, for a
    successor stacked onto it (with the "branch:" changeset of the predecessor as its
    "Source:"), already once implemented (and its changeset branch committed and
    published, i.e., not still held by the implementer or failed there), where an
    invalid "Source:" or "Changeset:" value never stacks, and where the implementer is
    recognized by the tag <implementer> (default: the tag of the agent itself, so the
    definition reused under another tag recognizes its own implementing), while the
    integrator is recognized by the tag of the built-in integrator by convention  */
const passes = (implementer?: string): AgentHooks["passes"] => (pred, succ, ctx) => {
    const held      = (tag: string) => pred.tags.includes(`${tag}:active`) || pred.tags.includes(`${tag}:failed`)
    const changeset = ctx.flow(pred, "Changeset")
    const source    = ctx.flow(succ, "Source")
    const stacked   = changeset?.type === "branch" && source?.type === "branch" && changeset.name === source.name
    const states    = ctx.lifecycle.states
    if (stacked)
        return states.indexOf(pred.status) >= states.indexOf("IMPLEMENTED")
            && !(pred.status === "IMPLEMENTED" && held(implementer ?? ctx.agent.tag))
    else
        return pred.status === "INTEGRATED" && !held("ase-agent-integrator")
}

/*  agent "ase agent implementer"  */
export default {
    kind: "implementer",
    description:
        "Drive the \"Implementation\" phase of the \"enterprise\" task lifecycle model: claim " +
        "every \"PLANNED\" task unassigned or assigned to the implementer, not yet tagged " +
        "\"ase-agent-implementer\", and with integrated \"After:\" predecessors (or implemented ones, " +
        "if stacked onto their \"branch:\" changeset by its \"Source:\") into " +
        "\"IMPLEMENTING\", implement it from its \"Source:\" into its \"Changeset:\" via the " +
        "\"ase-task-implement\" skill (in a Git worktree where needed), tag it, and put it into " +
        "\"STALLED\" unless it became \"IMPLEMENTED\" (tagged \"ase-agent-implementer:failed\" " +
        "if its branch could not be published), or, with \"--mode draft\", only draft the " +
        "implementation of tasks without a draft yet into their \"draft\" attachment and put " +
        "them back into \"PLANNED\", logging to stdout and to the \"agent\" " +
        "attachment of the task",
    modeDesc:
        "\"implement\" to implement the task into its changeset, or \"draft\" " +
        "to just draft its implementation into its \"draft\" attachment",
    mode: "implement",
    modes: {
        /*  implement the task from its source into its changeset, which the skill itself puts
            into "IMPLEMENTED" on success (else it is stalled), where a "branch:" changeset is
            implemented in place in the worktree carrying its branch, while the "Source:" of the
            plan stays in effect, the change set snapshot is attached by the agent itself, based
            on the fork point of the branch from its source (and hence shows the entire branch,
            also on a re-run of a declined task), and the work on it is afterwards committed onto
            it and published  */
        implement: {
            title:     "Implement planned tasks into their changesets",
            description:
                "Claims every PLANNED task unassigned or assigned to the implementer, not yet implemented, " +
                "and with integrated After: predecessors into IMPLEMENTING. Implements its plan from its " +
                "Source: into its Changeset: via the ase-task-implement skill (in a Git worktree where " +
                "needed), commits and publishes a branch: changeset, attaches a snapshot of the change " +
                "set, and puts it into IMPLEMENTED on success, else into STALLED.",
            params:    paramsImplement,
            type:      "phase",
            lifecycle: "enterprise",
            workdir:   "changeset",
            state:     { incoming: "PLANNED", activity: "IMPLEMENTING", success: "IMPLEMENTED", failure: "STALLED", passed: "IMPLEMENTED" },
            tag:       { name: "ase-agent-implementer" },
            prompt:    {
                skill: "ase-task-implement",
                args:  "--next DONE{?changeset-type=branch: --changeset worktree}" +
                    "{?changeset-worktree: --worktree {changeset-worktree}} {id}"
            },

            /*  with the parameters "review" and "lint", review (a "branch:" changeset including its
                earlier commits) and lint the uncommitted change set, each fixing its findings, before
                its commit (except an "attachment:" changeset, as it is implemented outside of the
                working copy), where the linting comes last, to also cover the fixes of the review  */
            followup:  [ {
                skill: "ase-repo-review",
                args:  "--auto --branch {changeset-name} --staged --unstaged",
                when:  [ "{param:review}", "{?changeset-type=branch:true}" ]
            }, {
                skill: "ase-repo-review",
                args:  "--auto --staged --unstaged{?changeset-worktree: --worktree {changeset-worktree}}",
                when:  [ "{param:review}", "{?changeset-type=worktree:true}" ]
            }, {
                skill: "ase-code-lint",
                args:  "--auto --unstaged{?changeset-worktree: --worktree {changeset-worktree}}",
                when:  [ "{param:lint}", "{?changeset-type=worktree:true}{?changeset-type=branch:true}" ]
            } ],
            success:   { criterion: [ "status" ] },
            attach:    { changeset: "changeset" },
            finish:    { commit: true },
            hooks:     { passes: passes(), ready }
        },

        /*  draft the implementation of the task into its "draft" attachment only (in a temporary
            worktree of the skill, from the source commit, without uncommitted changes, so the
            working copy is used as-is and the drafts are parallel-safe), where the skill leaves
            the task status untouched, so it is put back into "PLANNED" in any case, untagged
            if drafted (as its draft attachment itself keeps it from being drafted again), and
            else tagged with a tag separate from the one of the implementing, so a drafted task
            is still implemented later  */
        draft: {
            title:     "Draft the implementation of planned tasks",
            description:
                "Claims every PLANNED task without an implementation draft yet into IMPLEMENTING. Drafts " +
                "its implementation via the ase-task-implement skill into its draft attachment only (in a " +
                "temporary worktree, leaving the working copy untouched), and puts it back into PLANNED in " +
                "any case, so it can still be implemented later.",
            params,
            type:      "phase",
            lifecycle: "enterprise",
            workdir:   "source",
            state:     { incoming: "PLANNED", activity: "IMPLEMENTING", success: "PLANNED", failure: "PLANNED", phase: "IMPLEMENTED", passed: "IMPLEMENTED" },
            tag:       { name: "ase-agent-implementer-draft", success: "none" },
            attach:    { skip: "text/x-diff;draft", expect: "text/x-diff;draft" },
            prompt:    { skill: "ase-task-implement", args: "--next DONE --draft --stateless {id}" },
            success:   { criterion: [ "exit", "attachment" ] },
            hooks:     { passes: passes("ase-agent-implementer"), ready }
        }
    }
} satisfies AgentKind

