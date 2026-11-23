/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import type { AgentDefinition } from "../ase-agent-definition-api.js"
import type { AgentKind }       from "../ase-agent-definition-loader.js"

/*  review the changeset of the task (a "worktree" one staged, a "branch:" one against its
    base, an "attachment:" one staged in a temporary Git worktree) and tag the task with the
    verdict "APPROVE" resp. "REJECT" of the review (or plain without a verdict, e.g. on a
    failed or skipped review), where the task is put back into "IMPLEMENTED" for a human
    decision, except where the verdict decides on its resulting status  */
const review = (verdicts: string[]): AgentDefinition => ({
    type:      "phase",
    lifecycle: "enterprise",
    workdir:   "changeset-read",
    state:     {
        incoming: "IMPLEMENTED", activity: "QUALIFYING", success: "IMPLEMENTED", failure: "IMPLEMENTED",
        phase: "QUALIFIED", passed: "QUALIFIED", verdict: verdicts
    },
    tag:       { name: "ase-agent-qualifier" },
    prompt:    { skill: "ase-repo-review", args: "{?changeset-type=branch:--branch {changeset-name}}" },
    verdict:   { label: "REVIEW VERDICT", allow: [ "APPROVE", "REJECT" ] },
    success:   { criterion: [ "exit", "verdict" ] }
})

/*  agent "ase agent qualifier"  */
export default {
    kind: "qualifier",
    description:
        "Drive the \"Qualification\" phase of the \"enterprise\" task lifecycle model: " +
        "claim every \"IMPLEMENTED\" task unassigned or assigned to the qualifier (by its name), without tag " +
        "\"ase-agent-qualifier\" (i.e., without its verdict yet), and with qualified \"After:\" predecessors into " +
        "\"QUALIFYING\", review its \"Changeset:\" (a \"worktree\" one staged, a \"branch:\" one " +
        "against its base, an \"attachment:\" one staged in a temporary Git worktree) via the headless " +
        "agent tool and the \"ase-repo-review\" skill, tag it with its verdict \"ase-agent-qualifier:approve\" " +
        "or \"ase-agent-qualifier:reject\" (or plain \"ase-agent-qualifier\" without a verdict), and put it back " +
        "into \"IMPLEMENTED\" for a human decision (\"--mode judge\"), or into \"QUALIFIED\" resp. \"DECLINED\" by " +
        "its verdict (\"--mode qualify\", and back into \"IMPLEMENTED\" without a verdict), " +
        "untagged into \"IMPLEMENTED\" on interrupt, " +
        "logging to stdout and to the \"agent\" attachment of the task",
    modeDesc:
        "\"judge\" to just add the verdict tag, or \"qualify\" to additionally " +
        "qualify resp. decline the task by its verdict",
    mode: "judge",
    modes: {
        /*  just add the verdict  */
        judge: {
            ...review([]),
            title:     "Review implemented tasks and tag their verdict",
            description:
                "Claims every IMPLEMENTED task unassigned or assigned to the qualifier, without a verdict " +
                "yet, and with qualified After: predecessors into QUALIFYING. Reviews its Changeset: via the " +
                "ase-repo-review skill, tags it with its verdict (approve or reject), and puts it back into " +
                "IMPLEMENTED for the final decision by a human."
        },

        /*  additionally decide on the resulting task status by the verdict  */
        qualify: {
            ...review([ "APPROVE=QUALIFIED", "REJECT=DECLINED" ]),
            title:     "Review implemented tasks and decide by verdict",
            description:
                "Claims every IMPLEMENTED task unassigned or assigned to the qualifier, without a verdict " +
                "yet, and with qualified After: predecessors into QUALIFYING. Reviews its Changeset: via the " +
                "ase-repo-review skill, tags it with its verdict (approve or reject), and puts it into " +
                "QUALIFIED resp. DECLINED by its verdict, or back into IMPLEMENTED without any verdict."
        }
    }
} satisfies AgentKind

