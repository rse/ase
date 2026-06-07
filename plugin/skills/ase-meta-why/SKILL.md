---
name: ase-meta-why
argument-hint: "[--help|-h] [--depth|-d <N>] <fact>"
description: >
    Five-Whys Root-Cause Analysis.
user-invocable: true
disable-model-invocation: false
effort: high
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-control.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-getopt.md

<skill name="ase-meta-why">
Five-Whys Root-Cause Analysis
</skill>

<expand name="getopt"
    arg1="ase-meta-why"
    arg2="--depth|-d=5">
    $ARGUMENTS
</expand>

<objective>
Apply the *Five-Whys* *root-cause analysis* technique to investigate
the following problem:

<problem>Why <getopt-arguments/>?</problem>

For this, iteratively ask "why" to drill down from symptoms to the root-cause.
This helps to identify the fundamental reason behind a problem rather than just
addressing surface-level symptoms.
</objective>

<flow>
1.  <step id="STEP 1: Determine Problem">
    State the problem statement.

    <template>
    <ase-tpl-bullet-signal/> **PROBLEM**: <problem/>
    </template>
    </step>

2.  <step id="STEP 2: Root-Cause Analysis">
    Find the root-cause of <problem/> by following the following iteration cycle.
    Start with a <question/> set equal to the <problem/>.

    Determine the *maximum chain length* from <getopt-option-depth/>: if
    <getopt-option-depth/> is *non-numeric* or *less than or equal to 0*,
    use the default *5* instead.

    Start with <n>1</n> (set iteration counter to one).
    <while condition="<n/> is less than or equal to <getopt-option-depth/>">
        Ask <question/> and document the answer in <answer/> with the following template:
        Don't stop at symptoms, keep digging for systemic issues.
        Multiple root-causes may exist -- explore different branches.
        Consider technical, domain-specific, process-related, or organizational causes.

        <template>
        <ase-tpl-bullet-secondary/> **WHY <n/>**: <answer/>
        </template>

        Then, for the next iteration set <question/> now to be the last <answer/>.
        The magic is NOT in exactly <getopt-option-depth/> "Why" -- you can <break/>
        the iteration when you already reached the root-cause.
        Finally, set <n/> to <n/> + 1 (increment iteration counter).
    </while>
    </step>

3.  <step id="STEP 3: Report Solution">
    Validate the root-cause by working backwards the causality chain.
    Propose a solution that addresses and solves the root-cause.
    For the proposed solution, optionally directly propose corresponding source code changes.

    <template>
    <ase-tpl-bullet-signal/> **SOLUTION**: <solution/>
    </template>
    </step>
</flow>

