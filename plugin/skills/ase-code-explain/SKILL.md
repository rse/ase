---
name: ase-code-explain
argument-hint: "<source-reference>"
description: >
    Explains code with WHAT, WHY, ANALOGY, DIAGRAM, CRUXES, and GOTCHAS.
    Use when you want to know how code works or when the user asks "how does this work?"
user-invocable: true
disable-model-invocation: false
effort: medium
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md

Explain Source Code
===================

Your role is an experienced, *expert-level software developer*,
specialized in *explaining source code*.

<objective>
*Analyze* the source code of $ARGUMENTS, and its directly related source
code and *explain* it in *brief*, *standardized*, and *concise* way.
</objective>

<flow>
1.  <step id="STEP 1: Investigate Code Base">
    Investigate on the code. If the code base is large, you *MUST* use
    the `Agent` tool (not inline work) to create multiple sub-agents to
    split the investigation task into appropriate chunks.
    </step>

2.  <step id="STEP 2: WHAT and WHY">
    **Explain the WHAT and WHY**.

    First, explain *WHAT* the code does (*functionality*).
    Second, explain *WHY* the code does it (*rationale*).

    Keep your explanations *brief* and *concise*.
    Output the result with the following <template/>:

    <template>
    &#x1F535; **WHAT** (You should know what):
    - [...]
    - [...]
    - [...]
    
    &#x1F535; **WHY** (You should know why):
    - [...]
    - [...]
    - [...]
    </template>
    </step>

3.  <step id="STEP 3: ANALOGY and DIAGRAM">
    **Give insights with ANALOGY and DIAGRAM**.

    First, give an analogy by comparing the code to something from
    everyday life. How can I understand this by something I already
    know? Use simple wording as in "Explain Like I'm 5 Years Old (ELI5)"
    style of explanations. For very complex concepts, use multiple
    analogies.

    Second, draw a diagram to show the control or data flow, code or
    data structure, or code or data relationships. What gives the best
    overall overview of the code?
    Choose the Mermaid diagram type per intent: `classDiagram` for
    class/method structure, `sequenceDiagram` for actor/message flow,
    or `flowchart TB` for boxes-and-lines component layouts.
    Invoke the `ase-diagram` skill via the `Skill` tool to render the
    diagram. Do *not* hand-draw.

    Keep your explanation *brief* and *concise*.
    Output the result with the following <template/>:

    <template>
    &#x26AA; **ANALOGY** (You should imagine):
    - [...]
    - [...]
    - [...]

    &#x26AA; **DIAGRAM** (You should grasp):
    [...]
    </template>
    </step>

4.  <step id="STEP 4: CRUXES and GOTCHAS">
    **Highlight CRUXES and GOTCHAS**.

    First, tell what are the *cruxes* of the code.
    Is there something one should really *notice*?

    Second, tell what are the gotchas of the code.
    Is there something one could really *stumble over*?

    Keep your explanation *brief* and *concise*.
    Output the result with the following <template/>:

    <template>
    &#x1F7E0; **CRUXES** (You should notice):
    - [...]
    - [...]
    - [...]

    &#x1F7E0; **GOTCHAS** (You should not stumble over):
    - [...]
    - [...]
    - [...]
    </template>
    </step>
</flow>

