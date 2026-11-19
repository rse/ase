---
name: ase-meta-compat
argument-hint: "[--help|-h]"
description: >
    Self-test the LLM's ability to execute ASE's core interpreter
    machinery (control flow, XML placeholders, regex matching,
    arithmetic) and report an overall compatibility rating. Use when
    the user wants to check how well the current model/harness is
    compatible with ASE, or asks to "test ASE compatibility" or "check
    ASE compatibility".
user-invocable: true
disable-model-invocation: true
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-control.md

If `$1` (the first token of the skill arguments) is equal to `-h` or
`--help`, you *MUST* once output the following output <template/> and
then *IMMEDIATELY* *STOP* the further skill processing:

<template>
@${CLAUDE_SKILL_DIR}/help.md
</template>

Self-Test ASE Compatibility
===========================

Objective
---------

*Self-test* how faithfully the current LLM (and its harness) executes the
four *core interpreter primitives* that every ASE skill silently relies
on -- *control flow*, *XML placeholders*, *regex matching*, and
*arithmetic* -- and report an overall **0%…100% compatibility** rating.

This skill is unusual: it is both the *test definition* and the *system
under test*. Each *probe* is a pure ASE construct that you execute
*silently*, keeping its *actual* result internal. The expected values are *never* shown to
you: only STEP 6 submits *all* actual results to the `ase_compat` MCP
tool, which grades them. Do not fabricate passes: the grading of the tool
is final.

Notice that this skill intentionally does not strictly follow the ASE
skill format; in particular, it does not include the usual meta skill
information.

Procedure
---------

*IMPORTANT*: Execute all of the following steps in one go: you *MUST*
*NOT* end your turn before the final verdict of STEP 7 is output.

1.  STEP 1: Compute Probes Silently

    Compute the actual results of all probes of STEPs 2-5 *silently*:
    each probe yields exactly one actual result string under its id
    `<category/>/<probe-name/>`. Do *not* compare it to any expected
    value.

    *IMPORTANT*: Your *first visible action* after computing all probes
    of STEPs 2-5 is the `ase_compat` tool call of STEP 6, whose `actuals`
    argument is the JSON object of all results. Output *nothing* before
    this call: no probe, no result, no placeholder, and no state. Continue
    directly with STEP 2 without ending your turn.

2.  STEP 2: Probe XML Placeholders

    Compute the actual result of each of the following probes (in the
    given order), listed as `<id/>: <instruction/>`:

    -   `xml-placeholders/get-and-set`: Set <v>42</v>, then get <v/>.

    -   `xml-placeholders/self-ref`: Set <v>42</v>, then set `<v>pre_<v/></v>`, then get <v/>.

    -   `xml-placeholders/overwrite`: Set <v>42</v>, then set `<v>99</v>`, then get <v/>.

    -   `xml-placeholders/indexed`: Set `<eval-1-2>+1</eval-1-2>` and `<eval-2-1>-1</eval-2-1>`,
        then get <eval-1-2/> and <eval-2-1/> via `<eval-1-2/>,<eval-2-1/>`.

    -   `xml-placeholders/nested-attr`: With <w>20</w>, build the value of an XML attribute
        `width="<w/>"` and read the attribute `width` back.

    -   `xml-placeholders/entity`: Evaluate the XML entity `&#x29BF;` and get the rendered
        Unicode character.

3.  STEP 3: Probe Control Flow

    Compute the actual result of each of the following probes (in the
    given order), listed as `<id/>: <instruction/>`:

    -   `control-flow/branch`: Set <a>3</a>, then evaluate
        `<if condition="<a/> is greater than 5">big</if>
        <elseif condition="<a/> is greater than 2">mid</elseif>
        <else>small</else>`.

    -   `control-flow/while-sum`: Set <s>0</s> and <i>1</i>, then evaluate
        `<while condition="<i/> is less than or equal to 5">
        set <s/> to <s/> + <i/>,
        set <i/> to <i/> + 1
        </while>`. The result is <s/>.

    -   `control-flow/for-order`: Set <s></s>, then evaluate
        `<for items="x y z"><s><s/>-<item/></s></for>`. The result is <s/>.

    -   `control-flow/while-break`: Set <i>1</i> and <hit></hit>, then evaluate
        `<while condition="<i/> is less than or equal to 9">
        if <i/> equals 4 set <hit/> to <i/> and <break/>,
        else set <i/> to <i/> + 1
        </while>`. The result is <hit/>.

    -   `control-flow/step-skip`: A `<step condition="[...]">[...]</step>` either expands
        to its body (if condition evaluates to true) or to the empty string,
        so what does `<step condition="42 is greater than 7">X</step>` expand into?

    -   `control-flow/expand-subst`: With `<define name="foo">[<arg1/>:<content/>]</define>`,
        evaluate `<expand name="foo" arg1="K">V</expand>`.

4.  STEP 4: Probe Regex Matching

    Compute the actual result of each of the following probes (in the
    given order), listed as `<id/>: <instruction/>`:

    -   `regex/getopt-dash`: Does the string `-l foo` match the regexp `(^|\s)-`?
        The result is `yes` or `no`.

    -   `regex/getopt-nodash`: Does the string `foo` match the regexp `(^|\s)-`?
        The result is `yes` or `no`.

    -   `regex/anchored-int`: Does `123` fully match `^\d+$`, and does `12a` fully
        match `^\d+$`? The result is `<yes-or-no/>,<yes-or-no/>`.

    -   `regex/alternation`: Does `thorough` match `^(basic|standard|thorough)$`?
        The result is `yes` or `no`.

    -   `regex/capture`: Apply `^--(\w+).+` to `--foo-bar-quux`.
        The result is the first capture group.

    -   `regex/whitespace`: Does ` -x` (leading space then dash) match `(^|\s)-`
        (the `\s` alternative)? The result is `yes` or `no`.

    -   `regex/complex`: Does `--level=(low|high)...` match
        `^--([A-Za-z][A-Za-z0-9-]*)(?:\|-([A-Za-z]))?(?:=(\((.*)\)(\.\.\.)?|.*))?$`?
        The result is `yes` or `no`.

5.  STEP 5: Probe Arithmetic

    Compute the actual result of each of the following probes (in the
    given order), listed as `<id/>: <instruction/>`:

    -   `arithmetic/increment`: With <n>7</n>, compute <n/> + 2.

    -   `arithmetic/product-sum`: Compute `4.00 * 1.00 + 2.00 * 0.50`.
        The result is formatted as `X.XX`.

    -   `arithmetic/percentage`: Compute `3 / 7` rounded to 2 decimal places.
        The result is formatted as `0.XX`.

    -   `arithmetic/bar-width`: With <title-len>13</title-len>, compute `67 - <title-len/>`.

    -   `arithmetic/threshold`: Is `0.095` less than `0.10`?
        The result is `yes` or `no`.

    -   `arithmetic/round-half`: Round `2.5` to the nearest integer (round half up).

6.  STEP 6: Grade Actual Results and Score

    *Precondition*: you have computed the actual results of *all*
    probes of STEPs 2-5. If any probe is still missing, first compute it.

    Call...

    `ase_compat(actuals: {
        "<category/>/<probe-name/>": "<actual/>",
        [...]
    })`

    ...of the `ase` MCP server, passing *all* actual results, with
    an *internal* *programmatic* MCP tool call (and *NOT* with an
    external shell command) and set <compat-output/> to the `text`
    content of the response.

    If the tool responds with an error listing missing probes, compute
    exactly these probes and call the tool again with *all* actual
    results: the previously passed ones plus the missing ones.

    Initialize the list of failed probes <failures></failures> (set to
    empty).

    Parse <compat-output/> by splitting on newlines; for each non-empty
    line of the form `<id/>: <grade/>`:

    -   If <grade/> is `pass`, count the probe as *pass*.
    -   Else (<grade/> is `fail`), count the probe as *fail* and append
        `<id/>` to <failures/>.

    Tally pass counts and totals per category, where a total is the
    number of graded `<id/>` lines of the category in <compat-output/>:

    -   Set <xml-pass/>   to the number of `xml-placeholders/*` probes that passed.
    -   Set <cf-pass/>    to the number of `control-flow/*`     probes that passed.
    -   Set <re-pass/>    to the number of `regex/*`            probes that passed.
    -   Set <arith-pass/> to the number of `arithmetic/*`       probes that passed.
    -   Set <xml-total/>   to the number of `xml-placeholders/*` probes graded.
    -   Set <cf-total/>    to the number of `control-flow/*`     probes graded.
    -   Set <re-total/>    to the number of `regex/*`            probes graded.
    -   Set <arith-total/> to the number of `arithmetic/*`       probes graded.

7.  STEP 7: Compute and Report Compatibility

    Compute each category's *pass-rate* (a value in 0.0…1.0) by dividing
    its passes by its total:

    set <xml-rate/>   to <xml-pass/>   / <xml-total/>,
    set <cf-rate/>    to <cf-pass/>    / <cf-total/>,
    set <re-rate/>    to <re-pass/>    / <re-total/>,
    set <arith-rate/> to <arith-pass/> / <arith-total/>.

    Compute the overall compatibility as a *weighted average* of the
    four pass-rates, where *XML placeholders* carry weight `4.00` (the
    backbone of every skill), *control flow* carries weight `3.00`,
    *regex matching* carries weight `2.00`, and *arithmetic* carries
    weight `1.00`. Use the `ase_decision_matrix` MCP tool with a single
    "compatibility" alternative column, one matrix row per category of
    the form `[ <weight/>, <rate/> ]`:

    Call...

    `ase_decision_matrix(matrix: [
        [ 4.00, <xml-rate/>   ],
        [ 3.00, <cf-rate/>    ],
        [ 2.00, <re-rate/>    ],
        [ 1.00, <arith-rate/> ]
    ])`

    ...of the `ase` MCP server with an *internal* *programmatic* MCP
    tool call (and *NOT* with an external shell command) and set
    <product-sum/> to the *single* numerical value of the returned
    array.

    The product-sum is the sum over the four rows of `<weight/> *
    <rate/>`, so dividing by the sum of weights (4.00 + 3.00 + 2.00 +
    1.00 = 10.00) yields the weighted-average compatibility on 0.0…1.0:

    Set <overall/> to <product-sum/> / 10.00.
    Set <overall-pct/> to round(<overall/> * 100) (an integer percentage).

    Also compute each category's display percentage:

    Set <cf-pct/> to round(<cf-rate/> * 100), and
    likewise <xml-pct/>, <re-pct/>, <arith-pct/>.

    Determine the <verdict/> from <overall-pct/>:

    1.  If <overall-pct/> is greater than or equal to 90:
        Set <verdict>✓ *FULLY COMPATIBLE*</verdict>.

    2.  Else if <overall-pct/> is greater than or equal to 60:
        Set <verdict>⚠ *PARTIALLY COMPATIBLE*</verdict>.

    3.  Else:
        Set <verdict>✘ *INCOMPATIBLE*</verdict>.

    4.  If <failures/> is not empty:
        Append to <verdict/> the suffix ` (failed: <failures/>)`.

    Finally, output the compatibility report:

    **RESULTS**:

    | ⦿ *Capability*       | ⚖ *Weight*  | ✓ *Passed*                   | ⚑ *Rate*            |
    | :------------------- | ----------: | ---------------------------: | ------------------: |
    | XML Placeholders     |        4.00 | <xml-pass/>/<xml-total/>     | <xml-pct/>%         |
    | Control Flow         |        3.00 | <cf-pass/>/<cf-total/>       | <cf-pct/>%          |
    | Regex Matching       |        2.00 | <re-pass/>/<re-total/>       | <re-pct/>%          |
    | Arithmetic           |        1.00 | <arith-pass/>/<arith-total/> | <arith-pct/>%       |
    | **OVERALL**          |             |                              | **<overall-pct/>%** |

    **VERDICT**: <verdict/>
