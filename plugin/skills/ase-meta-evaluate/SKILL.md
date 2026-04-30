---
name: ase-meta-evaluate
argument-hint: "<request>"
description: >
    Evaluate alternatives through a weighted multi-criteria decision matrix.
    Use when the user calls for the *evaluation of alteratives*.
user-invocable: true
disable-model-invocation: false
effort: high
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md

Evaluate Alternatives
=====================

Your role is an experienced, *expert-level assistant*,
specialized in *evaluating alternatives*.

<objective>
*Evaluate* *alternatives* through a weighted
multi-*criteria* decision matrix.
</objective>

<flow>
1.  <step id="STEP 1: Decide Alternatives">
    -   From the <request>$ARGUMENTS</request> decide what are the two
        or more alternatives <alternative-K/> (K=1-N) the user requested
        to be evaluated. Do not output anything.

    -   For each alternative <alternative-K/> (K=1-N), decide whether you have
        all necessary information at hand to give it the proper, unique,
        short, and *concise name* <alternative-K/>. If you are unsure,
        use the `WebSearch` tool to find out more and adjust the name
        <alternative-K/>. Do not output anything.

    -   For each alternative <alternative-K/> (K=1-N), decide which
        *one* of *USP* (Unique Selling Point -- what makes it unique),
        *Crux* (what you should notice), or *Gotcha* (what you should
        not stumble over) is its single most distinguishing
        perspective, and remember this as an <info-K/> (K=1-N)
        formatted like `<type/>: <hint/>` where <type/> is one of
        `USP`, `Crux`, or `Gotcha` and <hint/> is a 1-4 word hint.

    -   For the set of alternatives, decide what the 1-4 word long
        name of the *class of alternatives* <class-of-alternatives/> is.

    -   Output the detetermined, individual alternatives with just
        the following <template/> and do not output anything else:

        <template>
        &#x26AA; **ALTERNATIVES**: *<class-of-alternatives/>*

        ⚑ **<alternative-1/>** (*<info-1/>*)
        [...alternatives 2-(N-1)...]
        ⚑ **<alternative-N/>** (*<info-N/>*)
        </template>
    </step>

2.  <step id="STEP 2: Decide Criterias">
    -   From the <request>$ARGUMENTS</request> decide whether and what
        criterias <criteria-L/> (L=1-M) the user requested. Do not output
        anything.

    -   Ensure the final number of criterias is always within the range
        of minimum 8 and maximum 12: if less than 8 criterias were
        requested, use the set of alternatives to decide on additional
        criterias which potentially allow best to triage the
        alternatives, and use the `WebSearch` tool to find out about the
        potentially still missing criterias; if more than 12 criterias
        were requested, drop the least-discriminating ones until 12
        remain. Do not output anything.

    -   For each criteria <criteria-L/> (L=1-M), decide on its <weight-L/>
        from the value set { 4.00, 2.00, 1.00, 0.50, 0.25 } (from most important,
        over normal, to less important). Do not output anything.
    </step>

3.  <step id="STEP 3: Evaluate Alternatives against Criterias">
    -   For each alternative <alternative-K/> (K=1-N) and each criteria
        <criteria-L/> (L=1-M), decide on the evaluation <eval-K-L/>,
        which means how good the alternative meets the criteria on
        a Likert-scale from { -2, -1, 0, +1, +2 } (from worst, over
        unsure, to best). Do not output anything.

    -   Then, for each alternative <alternative-K/> (K=1-N), calculate a
        rating <rating-K/> (K=1-N) which is the product-sum of all
        weights <weight-L/> (L=1-M) and the evaluation <eval-K-L/>
        (K=1-N, L=1-M). The result is always a numerical value. Round
        <rating-K/> to 2 decimal places before emitting it. Do not
        output anything.

    -   When emitting the table below, render *one column per alternative*
        <alternative-K/> (K=1-N). The middle range marker `[...alternatives
        2-(N-1)...]` (and its row counterparts, including the alignment
        row) expands to *zero columns when N=2*, *one column when N=3*,
        and *N-2 columns when N>=4*.

    -   Output the resulting *Weighted Decision Matrix* as a Markdown *table*
        (first column left-aligned, all other columns right-aligned)
        with just the following <template/> and do no output anything else:

        <template>
        &#x1F7E0; **EVALUATION**: *Weighted Multi-Criteria Decision Matrix*

        ⦿ *Criteria*  | ⚖ *Weight*  | ⚑ **<alternative-1/>** | [...alternatives 2-(N-1)...] | ⚑ **<alternative-N/>**
        :------------ | ----------: | ---------------------: | ---------------------------: | ---------------------:
        <criteria-1/> | <weight-1/> | <eval-1-1/>            | [...evals 1-2..1-(N-1)...]   | <eval-1-N/>
        [...criterias 2-(M-1)...]
        <criteria-M/> | <weight-M/> | <eval-M-1/>            | [...evals M-2..M-(N-1)...]   | <eval-M-N/>
        **RATING**    |             | **<rating-1/>**        | [...ratings 2-(N-1)...]      | **<rating-N/>**
        </template>
    </step>

4.  <step id="STEP 4: Report Best Alternative">
    -   The best alternative(s) <alternative-K/> (K=1-N) are *all* those
        alternatives whose <rating-K/> (rounded to 2 decimal places per
        STEP 3) equals the maximum rounded rating value across all
        alternatives. In the typical case, this is exactly one
        alternative. In case of a tie, it is two or more alternatives.

    -   Report each best alternative <alternative-K/> with the following
        <template/> and do not output anything else:

        <template>
        &#x1F535; **BEST ALTERNATIVE(S)**:

        ⚑ **<alternative-K/>**
        [...]
        </template>
    </step>
</flow>

