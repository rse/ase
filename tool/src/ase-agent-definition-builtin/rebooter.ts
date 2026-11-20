/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import type { AgentKind } from "../ase-agent-definition-core.js"

/*  agent "ase agent rebooter", processing a plan only on explicit request,
    i.e., once a human assigned the task to the rebooter (by its name)  */
export default {
    kind: "rebooter",
    description:
        "Reboot the plans of tasks in the \"Planning\" phase of the \"enterprise\" task lifecycle " +
        "model on explicit request: claim every \"DRAFTED\" task explicitly assigned to the " +
        "rebooter (by its name) into \"PLANNING\", " +
        "re-create its plan from scratch, grounded in the project artifacts and the Internet/Web, " +
        "via the headless agent tool and the \"ase-task-reboot\" skill, and put it back into \"DRAFTED\" and unassign it (or put it back into \"DRAFTED\" " +
        "with its previous assignee on interrupt), logging to stdout and to the \"agent\" " +
        "attachment of the task",
    modeDesc: "",
    mode: "reboot",
    modes: {
        /*  re-create the plan of a task from scratch, where the skill itself resets the task
            into "DRAFTED" on success, while a task left in "PLANNING" is put back into "DRAFTED",
            too, and where the task is untagged and unassigned afterwards, so it is guarded by its
            assignment only and hence rebooted again once a human assigns it to the rebooter again,
            and where the task waits for no predecessors, as the passed state defaults to the phase
            state "DRAFTED", which every predecessor reached already  */
        reboot: {
            title:     "Reboot the plans of assigned tasks",
            description:
                "Claims every DRAFTED task explicitly assigned to the rebooter into PLANNING. Re-creates its " +
                "plan from scratch via the ase-task-reboot skill, puts it back into DRAFTED, and unassigns " +
                "it, so assigning it to the rebooter again requests another reboot.",
            type:      "phase",
            lifecycle: "enterprise",
            workdir:   "project",
            state:     { incoming: "DRAFTED", activity: "PLANNING", success: "DRAFTED", failure: "DRAFTED" },
            tag:       { success: "none", failure: "none" },
            assign:    { required: true },
            prompt:    { skill: "ase-task-reboot", args: "--ground --next DONE {id}" },
            success:   { criterion: [ "status" ] }
        }
    }
} satisfies AgentKind

