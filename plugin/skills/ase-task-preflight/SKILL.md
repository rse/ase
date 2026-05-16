---
name: ase-task-preflight
description: >
    Preflight the implementation of the current task plan.
user-invocable: true
disable-model-invocation: false
effort: xhigh
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-persona.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md

Preflight Implementation of Task
================================

Your role is an experienced, *expert-level software developer*,
specialized in the *implementation* of software.

<objective>
*Preflight* the *implementation* of the current task plan by creating a
draft for a corresponding, *complete source code change set*.
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

2.  <step id="STEP 2: Create Implementation Draft">
    -   Perform a *preflight* of the *implementation* of <content/> by creating a
        draft for a corresponding, *complete source code change set*
        which would fully implement the task plan <content/>. Append this source
        code change set as a complete <unified-diff/> to the end
        of the <content/> with the following <template/>:

        <template>

        ## IMPLEMENTATION DRAFT

        ```
        <unified-diff/>
        ```

        </template>

        Hints:

        -   If a section named `## IMPLEMENTATION DRAFT` already exists from
            a previous run of this skill, replace this existing section.

        -   On modifying <content/>, set the "modified" timestamp to
            the current timestamp in the ISO-style format `YYYY-mm-dd
            HH:MM` which has to be determined by calling the
            `timestamp(format: "yyyy-LL-dd HH:mm")` tool of the `ase`
            MCP service and use the `text` field of its response.

    -   Finally, call the `task_save` tool (`id` set to <ase-task-id/>,
        text: <content/>) of the `ase` MCP service to save the updated task
        plan content. Calculate the number of words <words/> of <content/>.
        Do not output anything related to this MCP tool call except the
        following <template/>:

        <template>
        &#x1F7E0; Task: **<ase-task-id/>**, Plan: **<words/>** words, Status: plan **saved**
        </template>
    </step>
</flow>

