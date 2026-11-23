/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import type { AgentKind } from "../ase-agent-definition-loader.js"

/*  agent "ase agent researcher"  */
export default {
    kind: "researcher",
    description:
        "Research for the plans of tasks: claim every \"DRAFTED\" task of the \"enterprise\" task " +
        "lifecycle model explicitly assigned to the researcher (by its name) into \"PLANNING\", " +
        "research the plan itself on the Web and in the source artifacts via the headless agent " +
        "tool and the \"ase-task-research\" " +
        "skill (grounded in its \"Source:\", a \"branch:\" one checked out in a temporary Git " +
        "worktree), append the research report to the \"research\" attachment of the task and " +
        "refine its plan by the recommendations, and put it back into \"DRAFTED\" and " +
        "unassign it (\"--mode phase\", intended for researching and grounding the plan content), " +
        "or process the \"research\" requests of tasks in any task lifecycle model, as requested " +
        "with key \"R\" on the task board, by claiming the task like the editor agent and " +
        "researching the topic of the prompt of the request (or, for an empty prompt, the plan " +
        "itself) (\"--mode request\", intended for topic-driven research), logging to stdout and " +
        "to the \"agent\" attachment of the task",
    modeDesc:
        "\"phase\" to research and ground the plan content of the tasks explicitly assigned to the " +
        "researcher, or \"request\" to research the topics of the research requests of the tasks",
    mode: "phase",
    modes: {
        /*  research the plan of the task in the working copy, grounded in the "Source:" of the
            task (see mode "request"), and refine the plan by the recommendations, where the
            task is untagged and unassigned afterwards, so it is guarded by its assignment only
            and hence researched again once a human assigns it to the researcher again, and
            where the processing succeeded only if the research attachment was created or
            changed and the skill reported the attached research, and where the task waits for
            no predecessors (see the rebooter)  */
        phase: {
            title:     "Research and ground the plans of assigned tasks",
            description:
                "Claims every DRAFTED task explicitly assigned to the researcher into PLANNING. " +
                "Researches the plan itself on the Web and in the source " +
                "artifacts via the ase-task-research skill, appends the report to its research attachment, " +
                "refines its plan by the recommendations, puts it back into DRAFTED, and unassigns it. " +
                "Intended for researching and grounding the plan content.",
            type:      "phase",
            lifecycle: "enterprise",
            workdir:   "source",
            state:     { incoming: "DRAFTED", activity: "PLANNING", success: "DRAFTED", failure: "DRAFTED" },
            tag:       { success: "none", failure: "none" },
            assign:    { required: true },
            prompt:    {
                skill: "ase-task-research",
                args:  "--refine{?source-dir: --int-source-dir \"{source-dir}\"} {id}"
            },
            attach:    { expect: "text/markdown;research" },
            success:   { criterion: [ "exit", "clean", "attachment" ], match: [ "status:\\W*research attached\\b" ] }
        },

        /*  research the topic of the prompt of the request in the working copy, grounded in the
            "Source:" of the task: a "worktree" one in the working copy itself, and a "branch:"
            one in a temporary, detached Git worktree of the branch (passed to the skill and the
            agent tool), which is removed afterwards, where the prompt is optional (as an empty
            one researches the task plan itself), and where the processing succeeded only if the
            research attachment was created or changed and the skill reported the attached research  */
        request: {
            title:     "Research topics for tasks on request",
            description:
                "Claims every task with a pending research request (requested with key R on the task " +
                "boards) in any status except an activity one. Researches the topic of the prompt (or, " +
                "without a prompt, the task plan itself) on the Web and in the source artifacts via the " +
                "ase-task-research skill, appends the report to its research attachment, refines its plan " +
                "by the recommendations, and restores its previous assignee. Intended for topic-driven research.",
            type:      "request",
            workdir:   "source",
            request:   { name: "research", done: "researched" },
            prompt:    {
                skill: "ase-task-research",
                args:  "--refine{?source-dir: --int-source-dir \"{source-dir}\"} {id}:{?prompt: {prompt}}"
            },
            attach:    { expect: "text/markdown;research" },
            success:   { criterion: [ "exit", "clean", "attachment" ], match: [ "status:\\W*research attached\\b" ] }
        }
    }
} satisfies AgentKind

