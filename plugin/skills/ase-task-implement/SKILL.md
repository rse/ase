---
name: ase-task-implement
description: >
    Implement current task plan. Use when the user calls to "implement",
    "realize" or "apply" the "task", "plan", "spec", or "specification".
user-invocable: true
disable-model-invocation: false
effort: xhigh
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-persona.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md

Implement a Task
================

Your role is an experienced, *expert-level software developer*,
specialized in the *implementation* of software.

<objective>
*Implement* a task by modifying the *source code*
with a corresponding, complete *change set*.
</objective>

<flow>
1.  <step id="STEP 1: Determine Operation">
    -   Call the `task_load` tool (`id` set to <ase-task-id/>) of the `ase`
        MCP service to load the current task plan content and set <content/> to the
        `text` output field of the `task_load` tool call. Calculate the
        number of words <words/> of <content/>. Do not output anything
        related to this MCP tool call except the following <template/>:

        <template>
        &#x1F535; Task: **<ase-task-id/>**, Plan: **<words/>** words, Status: plan **loaded**
        </template>

    -   If the <content/> is still empty, complain and tell the user to use the
        `ase-code-resolve`, `ase-code-refactor`, `ase-code-craft`, or `ase-task-edit`
        skills first to create a task plan.
    </step>

2.  <step id="STEP 2: Create Implementation">
    -   Perform a *final implementation* of the *specification*
        by modifying the *source code* with a corresponding, complete
        *change set*.

    -   For this, primarily follow and honor the specification in <content/>.

    -   Secondarily, derive hints from the optionally existing
        `IMPLEMENTATION DRAFT` section in <content/>. But the specification
        text in <content/> always overrules the implementation draft in the
        `IMPLEMENTATION DRAFT` section of <content/>.

    -   Finally, cleanup and call the `task_delete` tool (`id` set to
        <ase-task-id/>) of the `ase` MCP service to delete the current task
        plan content persistance and then clear the plan content of the
        *Plan Mode*.
    </step>
</flow>

