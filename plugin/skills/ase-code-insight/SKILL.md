---
name: ase-code-insight
argument-hint: "[--help|-h] <code-references>"
description: >
    Give insights into the source code.
user-invocable: true
disable-model-invocation: false
effort: high
allowed-tools:
    - "Bash(git shortlog *)"
    - "Bash(git log *)"
    - "Bash(grep *)"
    - "Bash(sort *)"
    - "Bash(uniq *)"
    - "Bash(head *)"
    - "Bash(git log * | grep * | sort * | uniq * | sort * | head *)"
    - "Agent"
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-control.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-getopt.md

<purpose name="ase-code-insight">
Project Insight
</purpose>

<expand name="getopt" arg1="ase-code-insight">
    $ARGUMENTS
</expand>

<objective>
Give *insights* into the project through the source code of <getopt-arguments/>.
</objective>

<flow>
1.  <step id="STEP 1: GATHER FACTS">

    <if condition="<ase-project-boxing/> is equal `black`">

    The project source artifacts are classified as a *black box*, so the
    user does *not* want them inspected or their internals surfaced.
    *Skip* the entire insight gathering: do *not* read any source, only
    output the following <template/> and then *SKIP* the remaining steps
    STEP 2 through STEP 3:

    <template>
    ⧉ **ASE**: **PROJECT INSIGHT**: *suppressed* (`project.boxing` is `black`)
    </template>

    </if>

    Gather the following facts, where the tool calls *MAY* be combined
    or batched, for their joint output in STEP 2:

    -   *Abstract*: Determine an <abstract/> summary of this project.
        For this, check a potentially existing `README.*` file
        or scan the source files of <getopt-arguments/> and figure it out
        indirectly.

    -   *Author*: Determine the <author/> of this project.
        For this, run the following command:

        ```
        git shortlog -sn --no-merges HEAD
        ```

    -   *Churn*: Determine the source files of <getopt-arguments/> which
        caused the most churn by figuring out which of them have the most
        commits. For this, run the following command and format its
        result as a Markdown table <churn/> with a table head and columns
        named "Commits" and "Source File":

        ```
        git log --format=format: --name-only --since="1 year ago" -- <getopt-arguments/> | grep -v '^$' | sort | uniq -c | sort -nr | head -10
        ```
    </step>

2.  <step id="STEP 2: DISPLAY FACTS">
    After gathering, you *MUST* output *all* of the three sections of
    the following <template/> *now*, completely, in this order, and as
    plain reply text (not only in a thinking block), even if their
    commands were combined or batched, and *before* any tool call of
    STEP 3 (like a `Read`, `Grep`, or `Agent` call). Do not display any
    further explanation of these results.

    <template>
    ⧉ **ASE**: **PROJECT ABSTRACT**:

    <abstract/>

    ⧉ **ASE**: **PROJECT AUTHOR**:

    <author/>

    ⧉ **ASE**: **SOURCE CHURN**:

    <churn/>
    </template>
    </step>

3.  <step id="STEP 3: MODULE STRUCTURE">
    Output the following <template/> as reply text, *before* any tool
    call of this step:

    <template>
    ⧉ **ASE**: **MODULE STRUCTURE**:
    </template>

    Find all modules (or OOP classes) of <getopt-arguments/> and build a
    Mermaid specification <mermaid-spec/> for a `flowchart TB` diagram
    with all modules as boxes and the imports between modules as the
    directed edges. Then render <mermaid-spec/> according to the
    *Diagrams* rule of the skill conventions. Do not display any
    further explanation except for this diagram.
    </step>
</flow>

