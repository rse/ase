---
name: ase-help-intent
argument-hint: "[--help|-h] <intent>"
description: >
    Match a free-text intent against the accumulated help of all ASE
    skills, generate all adequately fitting `/ase:ase-xxx-xxx` commands
    -- ranked best-fitting first, each with concrete options and
    arguments -- and let the user execute one of them, refine the
    intent, or cancel. Use when the user knows what they want but not
    which skill or flags realize it, or mentions "intent" or requests
    "help".
user-invocable: true
disable-model-invocation: false
effort: high
allowed-tools:
    - "Skill"
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-control.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-dialog.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-getopt.md

<purpose name="ase-help-intent">
Match an Intent to ASE Commands
</purpose>

<expand name="getopt"
    arg1="ase-help-intent"
    arg2="">
    $ARGUMENTS
</expand>

<objective>
*Match* the following free-text intent against the accumulated help of
all ASE skills and *generate* every adequately fitting `/ase:ase-xxx-xxx`
command that realizes it, ranked best-fitting first:
<intent><getopt-arguments/></intent>
</objective>

The following <corpus/> is the *accumulated help* of all ASE skills --
the concatenation of every skill's `help.md` file -- and is the *sole*
catalog you match <intent/> against:

<corpus>
@${CLAUDE_SKILL_DIR}/data.md
</corpus>

<flow>

1.  <step id="STEP 1: Check Intent">

    <if condition="<intent/> is empty">
    Only output the following <template/> and then immediately *STOP*
    processing the entire current skill:

    <template>
    ⧉ **ASE**: ✪ skill: **ase-help-intent**, ▶ ERROR: expected a `<intent>` argument
    </template>
    </if>

    </step>

2.  <step id="STEP 2: Match Intent and Dialog">

    *REPEAT* the following sub-steps in a *LOOP* until the user either
    *executes* one of the generated commands or *cancels* the dialog in
    sub-step 4:

    1.  *Match Intent*:

        Match the current <intent/> against the <corpus/> and select
        *every* skill that adequately fits it -- judging the fit
        primarily by each skill's `##  SCENARIOS` ("You want ...") and
        `##  DESCRIPTION` sections, and secondarily by its `##  NAME`
        and `##  SYNOPSIS` sections. Order the selected skills from
        best-fitting to worst-fitting and keep at most the *8* best
        ones, so the dispatch dialog of sub-step 4 stays addressable.
        Set <count/> to the number of kept skills. Then, for each kept
        skill <n/> (numbered `1` to <count/> in rank order), from that
        skill's `##  SYNOPSIS`, `##  OPTIONS`, and `##  ARGUMENTS`
        sections in <corpus/>, *generate* a concrete command that
        realizes <intent/>:

        -   Set <name<n/>/> to the skill's name (e.g. `ase-code-lint`).
        -   Set <arguments<n/>/> to the concrete option flags and
            positional arguments -- derived from the skill's
            `##  OPTIONS` and `##  ARGUMENTS` -- that best realize
            <intent/> (may be empty).
        -   Set <command<n/>>/ase:<name<n/>/> <arguments<n/>/></command<n/>>
            (the full command line, with surplus inner spaces collapsed).
        -   Set <rationale<n/>/> to a *very brief*, single-sentence
            justification of why this skill and its options match
            <intent/>.

        Finally set <matched>yes</matched>.

    2.  *Guard No Match*:

        <if condition="no skill in <corpus/> adequately matches <intent/>">
        Set <matched>no</matched> and discard the inadequate selection of
        sub-step 1 by setting <count>0</count> and clearing all
        <name<n/>/>, <arguments<n/>/>, and <command<n/>/> placeholders
        (all set to empty), so that no stale command
        can survive into the dialog of sub-step 4. Then output the
        following <template/> and *continue* the *loop* at sub-step 4 to
        prompt the user for a refined or clearer intent via the dialog's
        free-text channel (do *not* stop and do *not* render a command):

        <template>
        ⧉ **ASE**: **WARNING**: no confident match for the intent -- please refine or clarify it.
        </template>
        </if>

    3.  *Render Commands*:

        Output the generated commands, in rank order, with the following
        <template/>, where the `[...]` marks the repetition of the
        command/rationale line pair for each kept skill <n/> from `1`
        to <count/>:

        <template>
        <ase-tpl-head title="SKILL COMMAND PROPOSALS"/>

        **C<n/>** ❯ `<command<n/>/>`
           ▷ *<rationale<n/>/>*

        [...]

        <ase-tpl-foot title="SKILL COMMAND PROPOSALS"/>
        </template>

    4.  *Dispatch Command*:

        In the following, you *MUST* *NOT* use your built-in
        <user-dialog-tool/> tool! Instead, you *MUST* just show a custom
        dialog according to the expanded `custom-dialog` definition. You
        *MUST* closely follow this definition.

        Let the user decide how to proceed by raising a question with the
        following custom dialog (invoked with `--other`, so that any
        free-text instruction is accepted as an intent refinement). Which
        dialog is raised depends on <matched/>, so that the `C<n/>`
        command options are offered *only* when commands were actually
        generated in sub-step 1 *and* rendered in sub-step 3:

        <if condition="<matched/> is `no`">
        <expand name="custom-dialog" arg1="--other">
            Dispatch: What would you like to do with the unmatched intent?
            REFINE: Refine or clarify the intent.
            CANCEL: Cancel this dialog.
        </expand>
        </if>
        <else>
        <expand name="custom-dialog" arg1="--other">
            Dispatch: Which of the proposed commands would you like to execute?
            C1: Execute: `<command1/>`
            [...]
            CANCEL: Cancel this dialog.
        </expand>

        The `[...]` line stands for one further answer line
        `C<n/>: Execute `<command<n/>/>` now.` per additionally kept
        skill <n/> from `2` to <count/>, in rank order, so the dialog
        offers exactly <count/> command options plus `CANCEL`.
        </else>

        Check the tool <result/> and dispatch accordingly:

        -   If <result/> is `CANCEL`:
            *Break* out of the *loop* and stop processing without any
            further output.

        -   If <result/> is `REFINE`, or <result/> matches `C<n/>` while
            <matched/> is `no`: do *not* execute anything -- output the
            following <template/> and *continue* the *loop* at sub-step 4
            to obtain a refined intent via the dialog's free-text channel:

            <template>
            ⧉ **ASE**: **HINT**: please enter a refined or clearer intent as free text.
            </template>

        -   If <result/> matches `C<n/>` (which implies <matched/> is
            `yes`): *Break* out of the *loop*, output the following
            <template/>, and then call the tool `Skill(skill:
            "ase:<name<n/>/>", args: "<arguments<n/>/>")` to *execute*
            the selected command:

            <template>
            ⧉ **ASE**: ◉ intent: **<intent/>**, ⌘ command: **<command<n/>/>**, ▶ status: **command executing**
            </template>

        -   If <result/> matches `OTHER: <text/>`:
            Set <intent><intent/> <text/></intent> (fold the free-text
            instruction into the intent). Then you *MUST* *continue* the
            *loop* at sub-step **2.1** to re-match the refined intent.

    </step>

</flow>
