/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import type { AgentKind } from "../ase-agent-definition-loader.js"

/*  agent "ase agent condenser", processing a plan only on explicit request,
    i.e., once a human assigned the task to the condenser (by its name)  */
export default {
    kind: "condenser",
    description:
        "Condense the plans of tasks in the \"Planning\" phase of the \"enterprise\" task lifecycle " +
        "model on explicit request: claim every \"DRAFTED\" task explicitly assigned to the " +
        "condenser (by its name) into \"PLANNING\", " +
        "compress the wording of its plan via the headless agent tool and the \"ase-task-condense\" " +
        "skill, and put it back into \"DRAFTED\" and unassign it (or put it back into \"DRAFTED\" " +
        "with its previous assignee on interrupt), logging to stdout and to the \"agent\" " +
        "attachment of the task",
    modeDesc: "",
    mode: "condense",
    modes: {
        /*  compress the wording of the plan of a task, where the skill leaves the task in
            "PLANNING", so the agent puts it back into "DRAFTED", and where the task is untagged
            and unassigned afterwards, so it is guarded by its assignment only and hence condensed
            again once a human assigns it to the condenser again, and where the processing
            succeeded only if the agent tool succeeded and the skill reported no error (as the
            agent tool still exits successfully then), including on an already condensed plan, and
            where the task waits for no predecessors (see the rebooter)  */
        condense: {
            title:     "Condense the plans of assigned tasks",
            description:
                "Claims every DRAFTED task explicitly assigned to the condenser into PLANNING. Compresses " +
                "the wording of its plan via the ase-task-condense skill, puts it back into DRAFTED, and " +
                "unassigns it, so assigning it to the condenser again requests another condensing.",
            type:      "phase",
            lifecycle: "enterprise",
            workdir:   "project",
            state:     { incoming: "DRAFTED", activity: "PLANNING", success: "DRAFTED", failure: "DRAFTED" },
            tag:       { success: "none", failure: "none" },
            assign:    { required: true },
            prompt:    { skill: "ase-task-condense", args: "--next DONE {id}" },
            success:   { criterion: [ "exit", "clean" ] }
        }
    }
} satisfies AgentKind

