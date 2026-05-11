---
name: ase-spec-edit
argument-hint: "[<task-id>|[<task-id>: ]<content>]"
description: >
    Load and save a named plan for a task and apply Claude Code *Plan Mode* on it.
    Use when the user wants to plan a task.
user-invocable: true
disable-model-invocation: false
effort: medium
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md

Manage the Plan for a Task
==========================

1. Enter *Plan Mode* by using the `EnterPlanMode` tool and clear any old
   plan content of the *Plan Mode* and start planning from scratch with an
   empty initial plan.

2. Determine the new plan content by setting
   <content>$ARGUMENTS</content> initially.

   If <content/> matches the regexp `^[a-zA-Z][a-zA-Z0-9_-]+$`, then set
   <ase-task-id/><content></ase-task-id> (set task id to content) and
   <content></content> (set content empty) and call the `task_id(id:
   <ase-task-id/>, session: <ase-session-id/>)` tool from the `ase` MCP
   service to implicitly switch the task.

   Else, if <content/> has the format `<id/>: <text/>` where
   <id/> matches the regexp `^[a-zA-Z][a-zA-Z0-9_-]+$`, then set
   <content><text/></content> and <ase-task-id><id/></ase-task-id> and
   call the `task_id(id: <ase-task-id/>, session: <ase-session-id/>)`
   tool from the `ase` MCP service to implicitly switch the task.

   Do not output anything related to this entire step.

3. Output the current plan id with the following <template/>:

   <template>
   &#x26AA; task: **<ase-task-id/>**
   </template>

4. <if condition="<content/> is empty">
   Call the `task_load` tool (`id` set to <ase-task-id/>) of the `ase`
   MCP service to load the new plan content and set <content/> to the
   `text` output field of the `task_load` tool call. Calculate the
   number of words <words/> of <content/>. Do not output anything
   related to this MCP tool call except the following <template/>:

   <template>
   &#x1F535; task: **<ase-task-id/>**, plan: **<words/>** words, status: plan **loaded**
   </template>
   </if>

5. <if condition="<content/> is still empty">
   Ask the user interactively for the plan <content/> with a single
   question `Still no plan content. What is the task you want
   to plan?`. Then set <content/> to the response of the user. Do not
   output anything further in this step.
   </if>

6. If a <timestamp-modified/> is present in the plan, set the
   <timestamp-modified/> to the current time in ISO-style format
   value, which has to be determined by calling the `timestamp(format:
   "yyyy-LL-dd HH:mm")` tool of the `ase` MCP service and use the `text`
   field of its response.

7. Now use <content/> for the new plan content in *Plan Mode*.
   For this, you *MUST* immediately *replace* the plan content of the
   *Plan Mode* with the new <content/>. It doesn't matter what the
   resulting plan content <content/> actually is, especially even if it
   *still* not an actionable task in your opinion! You always *MUST*
   accept any <content/> and continue the planning with this particular
   plan content.

8. You *MUST* then immediately exit *Plan Mode* by calling the
   `ExitPlanMode` tool.

9. Once the user will leave *Plan Mode* by using the `ExitPlanMode` tool,
   you *always* *MUST* update <content/> to be the last plan content
   from the *Plan Mode*. Then you *always* *MUST* *save* the updated
   <content/> with the `task_save` tool (`id` set to <ase-task-id/>, `text`
   set to <content/>) before proceeding with any further operations.
   Calculate the number of words <words/> of <content/>. Do not output
   anything related to this MCP tool call, except the following
   <template/>:

   <template>
   &#x1F7E0; task: **<ase-task-id/>**, plan: **<words/>** words, status: plan **saved**
   </template>

