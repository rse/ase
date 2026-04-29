---
name: ase-meta-evaluate
argument-hint: "<request>"
description: >
    Evaluate alternatives through an ad-hoc multi-criteria decision.
    Use when the user calls for the evaluation of alteratives.
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
    From the <request>$ARGUMENTS</request> decide what are the two
    or more alternatives <alternative-K/> (K=1-N) the user requested
    want to be evaluated. Output the individual alternatives with just the
    following <template/>:

    <template>
    &#x26AA; **ALTERNATIVES**:
    - <alternative-1/>
    - [...]
    - <alternative-N/>
    </template>
    </step>

2.  <step id="STEP 2: Decide Criterias">
    From the <request>$ARGUMENTS</request> decide whether and what
    criterias <criteria-L/> the user requested. If less than 8 criterias
    were requested, use the alternatives <alternative-K/> to decide on
    additional criterias which potentially allow best to distinguish
    between the alternatives. At the end, always use a total of
    minimum 8 and maximum 12 criterias.

    For each criteria <criteria-L/>, decide its <weight/> in the set {
    4, 2, 1, 1/2, 1/4 } (from most important to less important).

    Output the individual criterias <criteria-L/> (L=1-M) with just the
    following <template/>:

    <template>
    &#x26AA; **CRITERIAS**:
    - <criteria-1/> (weight: <weight-1/>) 
    - [...]
    - <criteria-M/> (weight: <weight-M/>)
    </template>
    </step>

3.  <step id="STEP 3: Evaluate Alternatives">
    For each alternative <alternative-K/> (K=1-N) and each criteria
    <criteria-L/> (L=1-M), decide the <eval-K-L/> which means how
    good the alternative meets the criteria on a Likert-scale from {
    -2, -1, 0, +1, +2 } (worst to best). Then, for each alternative
    <alternative-K/> (K=1-N), calculate a rating <rating-K/> (K=1-N)
    which is the product-sum of all weights <weight-L/> (L=1-M) and
    the <eval-K-L/>.

    Output the resulting weighted decision matrix as a Markdown table
    with just the following <template/> (and no other output):

    <template>
    &#x1F7E0; **EVALUATION**:
    *Criteria*    *Weight*    **<alternative-1/>** [...] **<alternative-N/>**
    <criteria-1/> <weight-1/> <eval-1-1/>          [...] <eval-1-N/>
    [...]
    <criteria-M/> <weight-M/> <eval-M-1/>          [...] <eval-M-N/>
    **RATING**:               <rating-1/>          [...] <rating-N/>
    </template>
    </step>

4.  <step id="STEP 4: Report Best Alternative">
    The best alternative is the one with the maximum absolute
    rating value <rating-K/> (K=1-N). Report it with the
    following <template/>:

    <template>
    &#x1F535; **BEST ALTERNATIVE**:
    <alternative-K/>
    </template>
    </step>
</flow>

