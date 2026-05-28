---
name: ase-meta-why
argument-hint: "[--help|-h] <fact>"
description: >
    Five-Whys Root-Cause Analysis.
user-invocable: true
disable-model-invocation: false
effort: medium
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-control.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md

<skill name="ase-meta-why">
Five-Whys Root-Cause Analysis
</skill>

<objective>
Apply the *Five-Whys* *root-cause analysis* technique to investigate
the following problem:

<problem>Why $ARGUMENTS?</problem>

For this, iteratively ask "why" to drill down from symptoms to the root-cause.
This helps to identify the fundamental reason behind a problem rather than just
addressing surface-level symptoms.
</objective>

<flow>
1.  <step id="STEP 1: PROBLEM">
    State the problem statement.

    <template>
    &#x1F7E0; **PROBLEM**: <problem/>
    </template>
    </step>

2.  <step id="STEP 2: ROOT-CAUSE ANALYSIS">
    Find the root-cause of <problem/> by following the following iteration cycle.
    Start with a <question/> set equal to the <problem/>.

    <for items="1 2 3 4 5">
        Ask <question/> and document the answer in <answer/> with the following template:
        Don't stop at symptoms, keep digging for systemic issues.
        Multiple root-causes may exist -- explore different branches.
        Consider technical, domain-specific, process-related, or organizational causes.

        <template>
        &#x26AA; **WHY <item/>**: <answer/>
        </template>

        Then, for the next iteration set <question/> now to be the last <answer/>.
        The magic is NOT in exactly 5 "Why" -- you can <break/> the iteration
        when you already reached the root-cause.
    </for>
    </step>

3.  <step id="STEP 3: SOLUTION">
    Validate the root-cause by working backwards the causality chain.
    Propose a solution that addresses and solves the root-cause.
    For the proposed solution, optionally directly propose corresponding source code changes.

    <template>
    &#x1F7E0; **SOLUTION**: <solution/>
    </template>
    </step>
</flow>

