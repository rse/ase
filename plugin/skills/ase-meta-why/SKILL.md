---
name: ase-meta-why
argument-hint: "[--help|-h] [--depth|-d <N>] [--width|-w <M>] [--ground|-G] <fact>"
description: >
    Five-Whys Root-Cause Analysis.
user-invocable: true
disable-model-invocation: false
effort: high
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-control.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-getopt.md

<purpose name="ase-meta-why">
Five-Whys Root-Cause Analysis
</purpose>

<expand name="getopt"
    arg1="ase-meta-why"
    arg2="--depth|-d=5 --width|-w=1 --ground|-G">
    $ARGUMENTS
</expand>

@${CLAUDE_SKILL_DIR}/../../meta/ase-common-ground.md

<objective>
Apply the *Five-Whys* *root-cause analysis* technique to investigate
the following problem:

<problem>Why <getopt-arguments/>?</problem>

For this, iteratively ask "why" to drill down from symptoms to the root-cause.
This helps to identify the fundamental reason behind a problem rather than just
addressing surface-level symptoms.
</objective>

<flow>

1.  <step id="STEP 1: Restate Problem">

    <if condition="<getopt-arguments/> is empty">
    Only output the following <template/> and then immediately *STOP*
    processing the entire current skill:

    <template>
    ⧉ **ASE**: ✪ skill: **ase-meta-why**, ▶ ERROR: expected a `<fact>` argument
    </template>
    </if>

    State the problem statement.

    <template>
    <ase-tpl-bullet-signal/> **PROBLEM**: <problem/>
    </template>

    </step>

2.  <step id="STEP 2: Ground Problem" condition="<getopt-option-ground/> is equal `true`">

    Ground the root-cause analysis in all dimensions, as a root-cause can
    lie in the requirements, the realization, and the verification alike:

    <expand name="ground"
        arg1="the problem in <problem/>"
        arg2=""
        arg3="WHAT HOW WHEN"></expand>

    </step>

3.  <step id="STEP 3: Root-Cause Analysis">

    Find the root-cause of <problem/> by following this iteration cycle.
    Start with a <question/> set equal to the <problem/>.

    <if condition="<getopt-option-ground/> is equal `true` and <ground-facts/> is not empty">
    For *every* answer <answer/> resp. candidate <answer-k/> below,
    *prefer* causes backed by <ground-facts/> over merely plausible ones,
    and append its evidence: ` [evidence: <refs/>]`, where <refs/> lists
    the project-relative file paths resp. source URLs of the backing
    facts, or ` [unverified]` if no fact backs it.
    </if>

    Determine the *maximum chain length* from <getopt-option-depth/>:
    set <depth/> to <getopt-option-depth/>; if <getopt-option-depth/>
    is *non-numeric* or *less than or equal to 0*, use the default *5* instead.

    Determine the *maximum chain width* from <getopt-option-width/>:
    set <width/> to <getopt-option-width/>; if <getopt-option-width/>
    is *non-numeric* or *less than or equal to 0*, use the default *1* instead.

    -   <if condition="<width/> is less than or equal to 1">

        Walk a *single* causality chain (the classic Five-Whys):

        Start with <n>1</n> (set iteration counter to one).

        <while condition="<n/> is less than or equal to <depth/>">

            Ask <question/> and document the answer in <answer/> with the following template.
            Don't stop at symptoms; keep digging for systemic issues.
            Consider technical, domain-specific, process-related, or organizational causes.

            <template>
            <ase-tpl-bullet-secondary/> **WHY <n/>**: <answer/>
            </template>

            Then, for the next iteration, set <question/> now to be the last <answer/>.
            The magic is NOT in exactly <depth/> "Whys" -- you can <break/>
            the iteration when you have already reached the root-cause.
            Finally, set <n/> to <n/> + 1 (increment iteration counter).

        </while>

        </if>

    -   <if condition="<width/> is greater than 1">

        Walk a *widened* causality chain: at each "why" level, surface up to
        <width/> *candidate* sub-causes, then commit to the single most
        significant one and descend into it (the chain stays single-rooted --
        the extra candidates are *not* each drilled to their own root-cause).
        Their purpose is to guard against *premature commitment* to the wrong
        sub-cause: by enumerating the plausible alternatives at each level, the
        chosen descent is a *justified* selection rather than the first
        plausible answer, and the unchosen candidates remain on record as
        *fallbacks* to backtrack into (see STEP 4) should the chosen path fail
        validation.

        Remember the *unchosen* candidates of every level (keep them in
        <fallbacks/>, tagged by their level <n/>), so STEP 4 can backtrack
        into them.

        Start with <n>1</n> (set iteration counter to one).

        <while condition="<n/> is less than or equal to <depth/>">

            Ask <question/> and surface up to <width/> *distinct*,
            *non-overlapping* candidate sub-causes, each documented in <answer-k/>.
            Let <count/> be the number of candidates you actually surfaced
            (at least one, at most <width/>).
            Don't stop at symptoms; keep digging for systemic issues.
            Explore *different* candidates -- technical, domain-specific,
            process-related, or organizational causes -- and avoid restating
            the same cause in different words.

            Start with <k>1</k> (set candidate counter to one).
            <while condition="<k/> is less than or equal to <count/>">
                <template>
                <ase-tpl-bullet-secondary/> **WHY <n/>.<k/>**: <answer-k/>
                </template>
                Set <k/> to <k/> + 1 (increment candidate counter).
            </while>

            Then choose, among the <answer-k/>, the *most causally-significant*
            candidate -- the one most likely to lead to the true root-cause --
            set <chosen-k/> to its candidate index (the <k/> of the chosen
            <answer-k/>), and *justify* the choice in one line (state explicitly
            *why* it beats the other candidates, e.g. it alone also explains the
            timing, scope, or magnitude of the level's fact, or it alone is
            backed by evidence). A bare "most significant" is *not* sufficient;
            if no candidate clearly dominates, say so.

            <template>
            <ase-tpl-bullet-secondary/> **WHY <n/> → chosen <n/>.<chosen-k/>**: <justification/>
            </template>

            Record the remaining candidates as <fallbacks/> for level <n/>.
            Then, for the next iteration, set <question/> to the chosen candidate.
            You can <break/> the iteration when the chosen candidate has already
            reached its root-cause.
            Finally, set <n/> to <n/> + 1 (increment iteration counter).

        </while>

        </if>

    </step>

4.  <step id="STEP 4: Report Solution">

    Validate the root-cause by working backwards along the chosen causality
    chain: check, level by level, that each chosen sub-cause genuinely *causes*
    the fact above it (and that fixing the final root-cause would dissolve the
    whole chain up to the original <problem/>). When <ground-facts/> is
    not empty, check each link against them, too: a link contradicted by
    <ground-facts/>, or tagged `[unverified]` while a fallback of its level
    is backed by evidence, *fails* the validation.

    When <width/> is *greater than 1* and this backward validation *fails* at
    some level <m/> -- i.e. the chosen sub-cause does *not* adequately explain
    the fact above it -- *backtrack*: discard the chosen sub-cause (and every
    chosen sub-cause below it) from level <m/> downward, pick the next-best
    candidate from level <m/>'s <fallbacks/>, and resume the STEP 3 widened
    descent: set <n/> to <m/> (reset the iteration counter to the failed level),
    set <question/> to the picked candidate, and re-enter STEP 3's
    <while condition="<n/> is less than or equal to <depth/>"/> loop at that
    level -- so the original <depth/> budget is honored from <m/> downward.
    Repeat until a chain survives backward validation or level <m/>'s
    <fallbacks/> are exhausted (then report the strongest chain found and note
    that no candidate fully validated). This is the payoff of <width/> *greater
    than 1*: the enumerated alternatives let the analysis *recover* from a wrong
    turn instead of committing to a mis-rooted chain.

    Propose a solution that addresses and solves the validated root-cause.
    For the proposed solution, optionally directly propose corresponding source code changes,
    based on the files referenced by <ground-facts/>, if any.

    <template>
    <ase-tpl-bullet-signal/> **SOLUTION**: <solution/>
    </template>

    </step>

</flow>

