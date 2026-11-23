/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import { parseEffort }              from "../ase-task-format.js"
import type { AgentHookTask, AgentHookContext } from "../ase-agent-definition-api.js"
import type { AgentKind }           from "../ase-agent-definition-loader.js"

/*  whether a task carries a valid effort estimation (its "Effort" key), as the task store
    drops a stale one (whose content hash no longer matches the plan body) on loading
    and listing, so a loaded task carries a well-formed one only if it is valid  */
const estimated = (task: AgentHookTask): boolean =>
    parseEffort(task.keys.Effort ?? "") !== null

/*  whether a task awaits its effort estimation: it carries no valid effort estimation yet,
    it is no explicit epic (a task being its own group, whose effort is the sum of its
    members), and its plan is not empty (as both are skipped by the skill), where this is
    also the condition the implementer waits on (see its parameter "effort-wait")  */
export const estimable = async (task: AgentHookTask, ctx: AgentHookContext): Promise<boolean> =>
    !estimated(task) && (task.keys.Group ?? "").trim() !== task.id
    && ((await ctx.plan(task)) ?? "").trim() !== ""

/*  the estimation succeeded only once the task carries a valid effort
    estimation, as the skill reports a failed estimation without an error  */
const succeeded = async (task: AgentHookTask, ctx: AgentHookContext): Promise<true | string> => {
    const current = await ctx.task(task.id)
    return current !== null && estimated(current) ? true : "task carries no valid \"Effort\" key"
}

/*  agent "ase agent estimator"  */
export default {
    kind: "estimator",
    description:
        "Estimate the effort of tasks in any task lifecycle model: pick every task in \"PLANNED\" " +
        "(adapted onto the task lifecycle model, i.e., \"PLANNING\" for \"team\" and \"OPEN\" for " +
        "\"solo\"), without tag \"ase-agent-estimator\", without a valid \"Effort\" key, with a " +
        "non-empty plan, and which is no explicit epic, without claiming it (so its status and its " +
        "assignee are never changed and no other agent is kept off it), estimate its effort via the " +
        "headless agent tool and the \"ase-task-estimate\" skill (which writes just its \"Effort\" key " +
        "in a conditional save), and tag it with \"ase-agent-estimator\" only if it carries no valid " +
        "\"Effort\" key afterwards (so it is not picked again) (\"--mode phase\", intended for the " +
        "final estimation of the planned tasks), or process the \"estimate\" requests of tasks in any " +
        "unfinished status (e.g. \"DRAFTED\"), as requested with key \"R\" on the task board, by " +
        "claiming the task like the editor agent and re-estimating its effort even if it carries a " +
        "valid one (\"--mode request\", intended for dry-runs, i.e., provisional estimations of plans " +
        "still in progress), logging to stdout and to the \"agent\" attachment of the task",
    modeDesc:
        "\"phase\" for the final estimation of the unestimated tasks in \"PLANNED\" automatically, or " +
        "\"request\" for dry-runs, (re-)estimating the tasks in any unfinished status on request",
    mode: "phase",
    modes: {
        /*  estimate the effort of the task in the project root, where the task is processed
            unclaimed, as the skill saves just the "Effort" key conditionally (retried on a
            concurrent change, e.g. by a claim of another agent), and where an estimated task
            is left untagged, as its valid "Effort" key itself guards it (see the hook "ready"),
            so it is estimated again once its plan content changed (as the task store drops its
            then stale "Effort" key), while a task not estimated is tagged, so it is not picked
            again and again  */
        phase: {
            title:     "Estimate the effort of unestimated planned tasks",
            description:
                "Picks every PLANNED task without a valid Effort: key, with a non-empty plan, and which is " +
                "no explicit epic, without claiming it (so its status and its assignee stay untouched). " +
                "Estimates its effort as a T-shirt size via the ase-task-estimate skill, which stores just " +
                "its Effort: key, and tags it only if it is still unestimated afterwards, so it is not " +
                "picked again. Intended for the final estimation of the planned tasks.",
            type:      "phase",
            unclaimed: true,
            workdir:   "project",
            state:     { incoming: "PLANNED" },
            tag:       { name: "ase-agent-estimator", success: "none" },
            prompt:    { skill: "ase-task-estimate", args: "{id}" },
            success:   { criterion: [ "exit", "clean" ] },
            hooks:     {
                /*  estimate only a task awaiting its effort estimation  */
                ready: (task, ctx) =>
                    estimable(task, ctx),

                /*  the estimation succeeded only with a valid effort estimation  */
                success: (task, _result, ctx) =>
                    succeeded(task, ctx)
            }
        },

        /*  estimate the effort of the task of an "estimate" request in the project root, in
            any unfinished status (e.g. "DRAFTED", where the phase mode never picks it), where
            the task is claimed like by the editor agent, and where the estimation is forced,
            as the request explicitly asks for it even if the task carries a valid one, and
            where the prompt of the request is ignored (and the criterion "changed" is not
            used, as a re-estimation of the same size leaves the plan content unchanged),
            and where the success additionally requires the reported status of a stored
            estimation, as the hook "success" alone also passes on the old, still valid
            effort estimation left untouched by a failed re-estimation  */
        request: {
            title:     "Re-estimate the effort of tasks on request",
            description:
                "Claims every task with a pending estimate request (requested with key R on the task " +
                "boards) in any unfinished status. Re-estimates its effort as a T-shirt size via the " +
                "ase-task-estimate skill, even if it already carries a valid Effort: key (ignoring the " +
                "prompt of the request), restores its previous assignee, and removes the request on success. " +
                "Intended for dry-runs, i.e., provisional estimations of plans still in progress.",
            type:      "request",
            workdir:   "project",
            request:   { name: "estimate", done: "estimated" },
            prompt:    { skill: "ase-task-estimate", args: "--force {id}" },
            success:   { criterion: [ "exit", "clean" ], match: [ "status:\\W*effort estimated\\b" ] },
            hooks:     {
                /*  the estimation succeeded only with a valid effort estimation  */
                success: (task, _result, ctx) =>
                    succeeded(task, ctx)
            }
        }
    }
} satisfies AgentKind

