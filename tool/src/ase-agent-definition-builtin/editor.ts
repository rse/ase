/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import type { AgentKind } from "../ase-agent-definition-loader.js"

/*  agent "ase agent editor"  */
export default {
    kind: "editor",
    description:
        "Process the edit requests of tasks in any task lifecycle model, as requested with key " +
        "\"E\" on the task board: claim every task tagged with \"ase-agent-editor:pending\" " +
        "(except in an activity status, until it changes) by turning its oldest \"edit\" " +
        "attachment into \"edit-running\" and assigning the task to the agent (keeping all " +
        "other agents off it), edit its plan by the prompt of the request via the headless " +
        "agent tool and the \"ase-task-edit\" skill (grounded in its \"Source:\", a " +
        "\"branch:\" one checked out in a temporary Git worktree, and saved only if not " +
        "changed meanwhile), restore its previous assignee, and remove the request if the plan " +
        "was changed (else turn it into \"edit-failed\", or back into \"edit\" on interrupt), " +
        "logging to stdout and to the \"agent\" attachment of the task",
    modeDesc: "",
    mode: "edit",
    modes: {
        /*  edit the plan of the task by the prompt of the request in the working copy,
            grounded in the "Source:" of the task: a "worktree" one in the working copy
            itself, and a "branch:" one in a temporary, detached Git worktree of the
            branch (passed to the skill and the agent tool), which is removed afterwards,
            where the processing succeeded only if the plan content changed since the
            claim and the skill reported no error  */
        edit: {
            title:     "Edit task plans by the prompts of edit requests",
            description:
                "Claims every task with a pending edit request (requested with key E on the task boards) " +
                "in any task lifecycle model and in any status except an activity one. Edits its plan by " +
                "the prompt of the request via the ase-task-edit skill (grounded in the Source: of the " +
                "task), restores its previous assignee, and removes the request if the plan was changed, " +
                "else marks the request as failed.",
            type:      "request",
            workdir:   "source",
            request:   { name: "edit", done: "edited" },
            prompt:    {
                skill: "ase-task-edit",
                args:  "--plan REFINE --next DONE{?source-dir: --int-source-dir \"{source-dir}\"} {id}: {prompt}"
            },
            success:   { criterion: [ "clean", "changed" ] }
        }
    }
} satisfies AgentKind

