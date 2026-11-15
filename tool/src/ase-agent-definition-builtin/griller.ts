/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import type { AgentKind } from "../ase-agent-definition-core.js"

/*  agent "ase agent griller", processing a plan only on explicit request,
    i.e., once a human assigned the task to the griller (by its name)  */
export default {
    kind: "griller",
    description:
        "Grill the plans of tasks in the \"Planning\" phase of the \"enterprise\" task lifecycle " +
        "model on explicit request: claim every \"DRAFTED\" task explicitly assigned to the " +
        "griller (by its name) into \"PLANNING\", " +
        "grill its plan with grounded and automatically chosen answers via the headless agent tool " +
        "and the \"ase-task-grill\" skill, and put it back into \"DRAFTED\" and unassign it (or put " +
        "it back into \"DRAFTED\" with its previous assignee on interrupt), logging to stdout and " +
        "to the \"agent\" attachment of the task",
    modeDesc: "",
    mode: "grill",
    modes: {
        /*  grill the plan of a task in up to three rounds (stopping early once all MUST points
            are clear), where the skill leaves the task in "PLANNING", so the agent puts it back
            into "DRAFTED", and where the task is untagged and unassigned afterwards, so it is
            guarded by its assignment only and hence grilled again (on its open points only) once
            a human assigns it to the griller again, and where the processing succeeds as for the
            condenser, and where the task waits for no predecessors (see the rebooter)  */
        grill: {
            title:     "Grill the plans of assigned tasks",
            description:
                "Claims every DRAFTED task explicitly assigned to the griller into PLANNING. Grills its plan " +
                "with grounded and automatically chosen answers via the ase-task-grill skill, puts it back " +
                "into DRAFTED, and unassigns it, so assigning it to the griller again requests another grilling.",
            type:      "phase",
            lifecycle: "enterprise",
            workdir:   "project",
            state:     { incoming: "DRAFTED", activity: "PLANNING", success: "DRAFTED", failure: "DRAFTED" },
            tag:       { success: "none", failure: "none" },
            assign:    { required: true },
            prompt:    { skill: "ase-task-grill", args: "--ground --auto --rounds 3 --until MUST --diff --next DONE {id}" },
            success:   { criterion: [ "exit", "clean" ] }
        }
    }
} satisfies AgentKind

