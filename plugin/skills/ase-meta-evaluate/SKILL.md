---
name: ase-meta-evaluate
argument-hint: "[--help|-h] [--ground|-G] <request>"
description: >
    Evaluate alternatives through a weighted multi-criteria decision
    matrix. Use when the user calls for the *evaluation* of
    *alternatives*, wants to *compare* things, or asks what the best is
    from a list of choices.
user-invocable: true
disable-model-invocation: false
effort: high
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-control.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-getopt.md

<purpose name="ase-meta-evaluate">
Evaluate Alternatives
</purpose>

<expand name="getopt"
    arg1="ase-meta-evaluate"
    arg2="--ground|-G">
    $ARGUMENTS
</expand>

@${CLAUDE_SKILL_DIR}/../../meta/ase-common-ground.md

<objective>
*Evaluate* *alternatives* through a weighted
multi-*criteria* decision matrix.
</objective>

<flow>
1.  <step id="STEP 1: Determine Reason">
    -   From the <request><getopt-arguments/></request>, try to derive the overall
        reason <reason/> for the evaluation. If no such reason can be
        derived, assume <reason>generic comparison</reason>.

    -   Output the determined reason with just the following <template/>
        and do not output anything else:

        <template>
        ⧉ **ASE**: **REASON**: *<reason/>*
        </template>
    </step>

2.  <step id="STEP 2: Determine Alternatives">
    -   From the <request><getopt-arguments/></request> derive the two or more
        alternatives <alternative-K/> (K=1-N) the user wants to be
        evaluated. Do not output anything.

    -   If fewer than two alternatives could be derived (N<2), output the
        following <template/> and *stop the entire flow* immediately without
        executing any further steps:

        <template>
        ⧉ **ASE**: **ERROR: INSUFFICIENT ALTERNATIVES**: at least two are required for a comparison!
        </template>

    -   For each alternative <alternative-K/> (K=1-N), decide whether
        you have all necessary information at hand to give it the proper,
        unique, short, and *concise name* <alternative-K/>. If you are
        unsure, use the `ase-meta-search` skill in a sub-agent (`Agent`
        tool with `subagent_type: "ase:ase-meta-search"`, at most one invocation per
        alternative, drawing from the *skill-wide shared budget* of at
        most 8 `ase-meta-search` invocations in total across STEP 2 and STEP 3
        combined) to find out more and adjust the name <alternative-K/>.

        If still unsure after the shared budget is exhausted, pick the
        best-guess concise name and proceed. Invoke `ase-meta-search`
        *never* via the `Skill` tool, and if a sub-agent gives back
        `ERROR: ...`, treat the shared budget as exhausted and proceed
        from your own knowledge. Do not output anything.

    -   For each alternative <alternative-K/> (K=1-N), decide which *one*
        of *USP* (Unique Selling Point -- what makes it unique), *Crux*
        (what you should notice), or *Gotcha* (what you should not stumble
        over) is its single most distinguishing perspective, and remember
        this as an <info-K/> (K=1-N) formatted like `<type/>: <hint/>` where
        <type/> is one of `USP`, `Crux`, or `Gotcha` and <hint/> is a 1-6
        word hint. Do not output anything.

    -   For the set of alternatives, decide what the 1-6 word long
        name of the *class of alternatives* <class-of-alternatives/> is.
        Do not output anything.

    -   For each alternative <alternative-K/> (K=1-N), decide whether
        it is a genuine member of <class-of-alternatives/>. If any
        <alternative-K/> is *not* a member (i.e. the alternatives are not
        mutually comparable within a single class), output the following
        <template/> (repeating the `⚑` line once per non-member
        alternative, i.e. once for each <alternative-K/> for which the
        membership decision was negative) and *stop the entire flow*
        immediately without executing any further steps:

        <template>
        ⧉ **ASE**: **ERROR: INCOMPARABLE ALTERNATIVES**: *<class-of-alternatives/>*

        ⚑ **<alternative-K/>** (*member of a different class*)
        </template>

    -   Output the determined, individual alternatives as a Markdown
        *table* with just the following <template/> and do not output
        anything else:

        <template>
        ⧉ **ASE**: **ALTERNATIVES**: *<class-of-alternatives/>*

        | ⚑ *Alternative*        | ⚖ *Hint*  |
        | :--------------------- | :-------- |
        | ⚑ **<alternative-1/>** | <info-1/> |
        [...alternatives K=2-(N-1) for N>2...]
        | ⚑ **<alternative-N/>** | <info-N/> |
        </template>
    </step>

3.  <step id="STEP 3: Derive Criteria">
    -   From the <request><getopt-arguments/></request>, try to derive the criteria
        <criteria-L/> (L=1-M) for the evaluation. Do not output anything.

    -   For each criterion <criteria-L/> (L=1-M), decide on its <weight-L/>
        from the value set { 4.00, 2.00, 1.00, 0.50, 0.25 } (from most
        important, via normal, to less important). Do not output anything.

    -   Ensure the final number of criteria is always within the range of
        minimum 8 and maximum 12: if fewer than 8 criteria were requested,
        use the set of alternatives to decide on additional criteria
        which potentially best allow triaging the alternatives, take the
        <reason/> into account, and use the `ase-meta-search` skill in a
        sub-agent (`Agent` tool with `subagent_type: "ase:ase-meta-search"`, drawing from
        the *skill-wide shared budget* of at most 8 `ase-meta-search` invocations
        in total across STEP 2 and STEP 3 combined) to find out about the
        potentially still missing criteria and assign their <weight-L/>.

        If still under 8 criteria after the shared budget is exhausted,
        fill the remaining slots from existing knowledge without further
        searches; if more than 12 criteria were requested, drop the criteria
        with the smallest <weight-L/> until 12 remain. Do not output
        anything.

    -   To prevent a single high-weight criterion from dominating the
        weighted sum (the weight set is geometric ×2 while the evaluation
        Likert scale is linear), assign weight 4.00 to *at least one* and
        *at most two* criteria, and weight 2.00 to *at least two* and *at
        most three* criteria. Symmetrically, to prevent a long tail of
        negligible-weight criteria, assign weight 0.50 to *at most two*
        criteria, and weight 0.25 to *at most one* criterion. Do not output
        anything.
    </step>

4.  <step id="STEP 4: Ground Evaluation" condition="<getopt-option-ground/> is equal `true`">
    -   Ground the evaluation of STEP 5 in the requirements and the
        realization, as the alternatives and criteria may relate to the
        project, too (the `ase-meta-search` budget of STEP 2 and STEP 3
        stays untouched by this grounding):

        <expand name="ground"
            arg1="the evaluation of the alternatives <alternative-1/> to <alternative-N/> against the criteria <criteria-1/> to <criteria-M/> for the reason <reason/>"
            arg2=""
            arg3="WHAT HOW"></expand>
    </step>

5.  <step id="STEP 5: Evaluate Alternatives against Criteria">
    -   For each alternative <alternative-K/> (K=1-N) and each criterion
        <criteria-L/> (L=1-M), decide on the evaluation <eval-K-L/>, which
        means how well the alternative meets the criterion on a Likert-scale
        from { -2, -1, 0, +1, +2 } (from worst, via neutral, to best).
        <if condition="<getopt-option-ground/> is equal `true` and <ground-facts/> is not empty">
        Decide each <eval-K-L/> primarily from the facts of
        <ground-facts/>, using your world knowledge only to fill their gaps.
        </if>
        Do not output anything.

    -   Then, calculate the ratings <rating-K/> (K=1-N) for all
        alternatives in a single call by invoking the `ase_decision_matrix(matrix:
        [ [ <weight-1/>, <eval-1-1/>, ..., <eval-N-1/> ], ..., [ <weight-M/>,
        <eval-1-M/>, ..., <eval-N-M/> ] ])` tool of the `ase` MCP server.
        The tool returns an array of N numerical values, where the K-th
        entry is the product-sum of all weights <weight-L/> (L=1-M) and
        the evaluation <eval-K-L/> (L=1-M) for alternative <alternative-K/>.
        Retain the *raw, unrounded* <rating-K/> for use in STEP 6, but
        round <rating-K/> to 2 decimal places *for display only* when
        emitting it in the table below. Do not output anything.

    -   Output the resulting *Weighted Decision Matrix* as a Markdown
        *table* with just the following <template/> and do not output
        anything else. When emitting the table, render *one column per
        alternative* <alternative-K/> (K=1-N).

        <template>
        ⧉ **ASE**: **EVALUATION**: *Weighted Multi-Criteria Decision Matrix*

        | ⦿ *Criteria*  | ⚖ *Weight*  | ⚑ **<alternative-1/>** | [...alternatives 2-(N-1)...] | ⚑ **<alternative-N/>** |
        | :------------ | ----------: | ---------------------: | ---------------------------: | ---------------------: |
        | <criteria-1/> | <weight-1/> | <eval-1-1/>            | [...evals 2-1..(N-1)-1...]   | <eval-N-1/>            |
        [...criteria L=2-(M-1) for M>2...]
        | <criteria-M/> | <weight-M/> | <eval-1-M/>            | [...evals 2-M..(N-1)-M...]   | <eval-N-M/>            |
        | **RATING**    |             | **<rating-1/>**        | [...ratings 2-(N-1)...]      | **<rating-N/>**        |
        </template>
    </step>

6.  <step id="STEP 6: Report Best Alternative">
    -   The best alternative <alternative-K/> (K=1-N) is the alternative
        whose *raw, unrounded* <rating-K/> (i.e. the product-sum from STEP
        5, *before* the display-only rounding) is the maximum rating value
        across all alternatives. Do not output anything.

    -   The second best alternative <alternative-X/> (X=1-N, X != K) is
        the alternative whose *raw, unrounded* <rating-X/> is the largest
        rating value among all *other* alternatives (on a tie for the
        maximum, it equals <rating-K/>; on a tie for the second largest,
        pick any one of them). Do not output anything.

    -   Determine rating distance <distance/> between <alternative-K/> and
        <alternative-X/> from their *raw, unrounded* ratings by calculating:
        <distance/> = <rating-K/> - <rating-X/>. Do not output anything.

    -   Determine rating distance percentage <percentage/> between
        <alternative-K/> and <alternative-X/> from their *raw,
        unrounded* ratings: if <rating-K/> is non-zero, calculate
        <percentage/> = <distance/> / abs(<rating-K/>); else, set
        <percentage/> = 0 if <distance/> is also zero (a genuine tie), or
        <percentage/> = 1 otherwise (a clear winner over a negative
        runner-up, exceeding all small-distance thresholds). Do not
        output anything.

    -   If <rating-K/> is less than zero and <percentage/> is greater than
        or equal to 0.01 (i.e. all alternatives rate negatively and the
        "best" is merely the unique least-bad), stop the flow after you
        output just the following <template/> and do not output anything
        else:

        <template>
        ⧉ **ASE**: **BEST ALTERNATIVE**: ⚑ **<alternative-K/>**
        ⚠ *ATTENTION: all alternatives rate negatively; this is the least-bad choice, not a strong winner!*
        </template>

    -   Otherwise, if <percentage/> is less than 0.01 (i.e. <distance/> is
        effectively zero relative to abs(<rating-K/>)), stop the flow after
        you output just the following <template/> and do not output anything
        else:

        <template>
        ⧉ **ASE**: **ERROR**: ✘ *MULTIPLE BEST ALTERNATIVES FOUND*,
        ⚠ *Please give some hints on the criteria to ensure a single best alternative!*
        </template>

    -   Otherwise, if <percentage/> is less than 0.10, stop the flow after
        you output just the following <template/> and do not output anything
        else:

        <template>
        ⧉ **ASE**: **BEST ALTERNATIVE**: ⚑ **<alternative-K/>**
        ⚠ *ATTENTION: small distance to second best alternative!*
        </template>

    -   Otherwise (<percentage/> is greater than or equal to 0.10), output
        just the following <template/> and do not output anything else:

        <template>
        ⧉ **ASE**: **BEST ALTERNATIVE**: ⚑ **<alternative-K/>**
        </template>
    </step>
</flow>

