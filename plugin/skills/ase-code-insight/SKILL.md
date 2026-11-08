---
name: ase-code-insight
argument-hint: "[--help|-h] <code-references>"
description: >
    Give insights into the source code.
user-invocable: true
disable-model-invocation: false
effort: high
allowed-tools:
    - "Bash(git *)"
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
1.  <step id="STEP 1: PROJECT ABSTRACT">

    <if condition="<ase-project-boxing/> is equal `black`">

    The project source artifacts are classified as a *black box*, so the
    user does *not* want them inspected or their internals surfaced.
    *Skip* the entire insight gathering: do *not* read any source, only
    output the following <template/> and then *SKIP* the remaining steps
    STEP 2 through STEP 4:

    <template>
    <ase-tpl-bullet-normal/> **PROJECT INSIGHT**: *suppressed* (`project.boxing` is `black`)
    </template>

    </if>

    Determine an <abstract/> summary of this project.
    For this, check a potentially existing `README.*` file
    or scan the source files of <getopt-arguments/> and figure it out
    indirectly.

    Display the results with the following <template/>:

    <template>
    <ase-tpl-bullet-normal/> **PROJECT ABSTRACT**:

    <abstract/>
    </template>
    </step>

2.  <step id="STEP 2: PROJECT AUTHOR">
    Determine the <author/> of this project.
    For this, run the following command...

    ```
    git shortlog -sn --no-merges HEAD
    ```

    ...and then display the results with the following <template/>:

    <template>
    <ase-tpl-bullet-normal/> **PROJECT AUTHOR**:

    <author/>
    </template>
    </step>

3.  <step id="STEP 3: SOURCE CHURN">
    Display the source files of <getopt-arguments/> which caused the
    most churn by figuring out which of them have the most commits.
    Display the following <template/>:

    <template>
    <ase-tpl-bullet-normal/> **SOURCE CHURN**:
    </template>

    Then run the following command...

    ```
    git log --format=format: --name-only --since="1 year ago" -- <getopt-arguments/> | grep -v '^$' | sort | uniq -c | sort -nr | head -10
    ```

    ...and then display its result as a table with a table head and
    columns named "Commits" and "Source File". Do not display any
    further explanation of this result.
    </step>

4.  <step id="STEP 4: MODULE STRUCTURE">
    Display the following <template/>:

    <template>
    <ase-tpl-bullet-normal/> **MODULE STRUCTURE**:
    </template>

    Find all modules (or OOP classes) of <getopt-arguments/> and build a
    Mermaid specification <mermaid-spec/> for a `flowchart TB` diagram
    with all modules as boxes and the imports between modules as the
    directed edges. Then render <mermaid-spec/> according to the
    *Diagrams* rule of the skill conventions. Do not display any
    further explanation except for this diagram.
    </step>
</flow>

