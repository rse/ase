---
name: ase-repo-qa-commit
argument-hint: "[--help|-h] [--max|-n <num>]"
description: >
    Stage the files changed in the current session, quiz the user with
    up to five multiple-choice questions on the architecture and the
    technical details of the staged Git changes, and then commit them with the comprehension score prefixed to the
    commit message. Use when the user wants to "commit with a quiz",
    be "quizzed on the change", or "prove the understanding" of the
    staged changes before committing them.
user-invocable: true
disable-model-invocation: true
effort: high
allowed-tools:
    - "Bash(git diff *)"
    - "Bash(git ls-files *)"
    - "Bash(git status *)"
    - "Bash(git add *)"
    - "Bash(git commit *)"
    - "Read"
    - "Grep"
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-control.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-getopt.md

<purpose name="ase-repo-qa-commit">
Git Commit with Comprehension Quiz
</purpose>

<expand name="getopt" arg1="ase-repo-qa-commit" arg2="--max|-n=5">
    $ARGUMENTS
</expand>

<objective>
*Stage* the files changed in the current session, *quiz* the user
with up to <getopt-option-max/> multiple-choice questions on the
*architecture* and the *technical details* of the staged Git
changes, and then *commit* them with the
resulting *comprehension score* prefixed to the commit message.
</objective>

Guiding Tenets
--------------

Honor the following tenets throughout the quiz:

-   **Crucial Elements First**:
    Ask about the elements of the change which matter most for its
    correctness and its fit into the code base, because a quiz about
    peripheral details proves nothing about the understanding.

-   **Architecture over Trivia**:
    Ask primarily about the *architecture* of the change -- its
    structure, responsibilities, data and control flow, coupling, and
    trade-offs -- and *never* about file names, identifiers, or other
    trivia answerable without understanding.

-   **At Least One Deep Detail**:
    Ask at least one *deeply technical* question about the exact
    behavior of the code, because an architectural understanding
    without the decisive detail is still superficial.

-   **Exactly One Correct Answer**:
    Every question has exactly four answers, of which exactly one is
    correct and three are *verifiably* wrong, because an ambiguous
    question makes the score meaningless.

-   **Plausible Distractors**:
    Derive every wrong answer from the code base (a real alternative
    design, an inverted condition, a near-miss mechanism), because an
    obviously wrong answer gives the correct one away.

-   **No Leakage**:
    Never reveal or hint at a correct answer before all questions are
    answered, because every leaked answer inflates the score.

-   **Honest Scoring**:
    Grade strictly by the selected answers and never round a score in
    favor of the user, because the score is recorded in the commit.

-   **Fast Turns**:
    Once the quiz started, every turn only records the answer and
    outputs the next pre-rendered dialog -- without re-reading the
    code, re-checking the questions, or re-rendering anything --,
    because the user is waiting for the next question.

<flow>

1.  <step id="STEP 1: Capture Staged Changes">

    <if condition="<getopt-option-max/> is not an integer between 1 and 5">
    Only output the following <template/> and then immediately *STOP*
    processing the entire current skill:

    <template>
    ⧉ **ASE**: ✪ skill: **ase-repo-qa-commit**, ▶ ERROR: invalid `--max` value: **<getopt-option-max/>** (expected 1-5)
    </template>
    </if>

    <if condition="<ase-headless/> is `true`">
    Only output the following <template/> and then immediately *STOP*
    processing the entire current skill:

    <template>
    ⧉ **ASE**: ✪ skill: **ase-repo-qa-commit**, ▶ ERROR: the quiz requires an interactive user
    </template>
    </if>

    Stage the files changed in the current session:

    1.  Determine the <session-files/> as the files modified, created,
        or deleted by your *own* file-modifying tool calls (like `Edit`
        and `Write`) of the *entire* current session, as carried by the
        conversation context. Skip every file below the `.ase/`
        directory, as it carries *ASE*'s own state.

    2.  Run the command `git status --porcelain` and keep in
        <session-files/> only the files which this command still lists
        as changed or untracked, i.e., which are not yet entirely
        staged or committed.

    3.  If <session-files/> is not empty, stage them entirely by running
        the command `git add -- <session-files/>` (with every path
        quoted), and output the following <template/>, with one line
        per staged file <file/>:

        <template>
        <ase-tpl-bullet-secondary/> STAGED SESSION FILE: `<file/>`
        </template>

    Run the following command to find out what changes are currently
    staged in the Git *index* for commit, capturing its output into
    <diff/>:

    `git diff --cached`

    <if condition="<diff/> is empty">
    Only output the following <template/> and then immediately *STOP*
    processing the entire current skill:

    <template>
    ⧉ **ASE**: ✪ skill: **ase-repo-qa-commit**, ▶ status: **no changes to commit**
    </template>
    </if>

    </step>

2.  <step id="STEP 2: Comprehend Staged Changes">

    Comprehend the staged changes in <diff/> in depth. Do not output
    anything in this step.

    1.  For every file touched by <diff/>, *read* the file around its
        changed hunks (the entire file if it is small), and *grep* for
        the callers and users of every changed function, class, type,
        or configuration key. Take deleted files from <diff/> only. For
        a very large <diff/>, focus on the files carrying the crucial
        elements of the change.

    2.  Reconstruct the *intent* of the change: what problem it solves
        and how it solves it.

    3.  Determine the *crucial elements* of the change and rank them by
        their importance: changed interfaces and contracts, shifted
        responsibilities, data and control flow, coupling and
        dependencies, invariants, error handling, concurrency, and
        compatibility.

    </step>

3.  <step id="STEP 3: Craft Questions">

    Craft the quiz questions. Do not output anything in this step.

    1.  Determine the number of questions <q/> as the minimum of
        <getopt-option-max/> and the size-based count: 1 or 2 for a
        *trivial* change (a single small hunk), 3 for a *small* change,
        4 for a *medium* change, and 5 for a *large* change.

    2.  For each question <K/> (<K/>=1...<q/>), following the
        ranking of the crucial elements, craft:

        -   <kind-K/>: `Technical` for a deeply technical question
            about the exact behavior of the code (the exact semantics of
            a condition, the order of operations, an edge case, or the
            type or error behavior), else `Architecture` for a question
            about the architecture of the change (why it is structured
            this way, what a part is responsible for, what breaks if
            something changes, or which trade-off it makes). At least
            one question *MUST* be of kind `Technical`, and the majority
            of the questions *SHOULD* be of kind `Architecture`.

        -   <question-K/>: the question text, as a single line. It
            *MUST* *NOT* be answerable from file names, identifiers, or
            the mere summary of the change alone, and it *MUST* *NOT*
            cover the same element as any other question.

        -   <answer-K-1/> to <answer-K-4/>: the four answers, each as a
            single line, of which exactly one is correct and the other
            three are *verifiably* wrong. Derive the wrong answers from
            the code base (a real alternative design, an inverted
            condition, a near-miss mechanism). All four answers *MUST*
            have a similar length and specificity, and *MUST* *NOT* be
            of the kind "all of the above" or "none of the above", nor
            give the correct answer away by absolute wording.

        -   <correct-K/>: the position (1-4) of the correct answer,
            chosen *uniformly at random* and *independently* for every
            question, so the positions show no pattern.

        -   <rationale-K/>: a one-sentence rationale of the correct
            answer, citing the evidence as `file:line`.

    3.  Re-check every question against the code: ensure the answer
        at position <correct-K/> is correct and the three others are
        wrong. Fix or replace every question failing this check.

    4.  Keep <correct-K/> and <rationale-K/> *private*: they *MUST*
        *NOT* appear in any output before STEP 5.

    5.  Pre-render all dialogs in this single pass: for each question
        <K/> (<K/>=1...<q/>), set <width/> to the maximum length plus
        3 of the labels `A` to `D`, and set:

        <dialog-K>
        <ase-tpl-boxed title="DIALOG" subtitle="Question <K/>/<q/> (<kind-K/>)">

        **<question-K/>**

        <ase-tpl-key digit="1"/>  ▶  **A:**<ase-tpl-pad width="<width/>" text="A:"/> <answer-K-1/>
        <ase-tpl-key digit="2"/>  ▶  **B:**<ase-tpl-pad width="<width/>" text="B:"/> <answer-K-2/>
        <ase-tpl-key digit="3"/>  ▶  **C:**<ase-tpl-pad width="<width/>" text="C:"/> <answer-K-3/>
        <ase-tpl-key digit="4"/>  ▶  **D:**<ase-tpl-pad width="<width/>" text="D:"/> <answer-K-4/>

        Please choose *one* option by typing <ase-tpl-key digit="1"/>/<ase-tpl-key digit="2"/>/<ase-tpl-key digit="3"/>/<ase-tpl-key digit="4"/>/**CANCEL**.

        </ase-tpl-boxed>
        </dialog-K>

        where each `<ase-tpl-pad .../>` expands to only its trailing
        padding spaces, with the leading label text removed. The
        <dialog-K/> *MUST* *NOT* reveal <correct-K/> in any way.

    </step>

4.  <step id="STEP 4: Quiz User">

    You *MUST* *NOT* use your built-in user dialog tool (like
    `AskUserQuestion` or `ask_user`) in this step. Instead, just output
    the pre-rendered dialogs and let the user answer in the prompt.

    Start with <score>0</score>.

    1.  For each question <K/> (<K/>=1...<q/>), honor the *Fast Turns*
        tenet:

        1.  Output the following <template/>, end the current turn, wait
            for the user input, and store it in <reply/>:

            <template>
            <dialog-K/>
            </template>

        2.  Map <reply/> to a position <choice-K/> (1-4), accepting the
            digits `1` to `4`, the keys `➊` to `➍`, and the labels `A`
            to `D` (case-insensitive). Do not output anything in this
            sub-step, especially *not* whether the answer was correct.

            -   If <reply/> is `cancel`, `CANCEL`, `reject`, `REJECT`,
                or otherwise declines to answer: skip the remaining
                questions and continue directly with the outer item `2.`
                (cancellation handling) that immediately follows this
                iteration cycle `1.` within this STEP 4.

            -   If <reply/> maps to no position: output the following
                <template/> and then *START OVER* with sub-step 1 for the
                same question <K/>, reusing <dialog-K/> unchanged:

                <template>
                ⧉ **ASE**: ERROR: **Invalid option selected!**
                </template>

            -   Otherwise, if <choice-K/> equals <correct-K/>, set
                <score/> to <score/> + 1.

    2.  If at any point the quiz was cancelled:
        Only output the following <template/> and then immediately *STOP*
        processing the entire current skill:

        <template>
        ⧉ **ASE**: ✪ skill: **ase-repo-qa-commit**, ▶ status: **quiz cancelled, nothing committed**
        </template>

    </step>

5.  <step id="STEP 5: Grade Answers">

    Determine the <light/> from the ratio <score/> / <q/>:

    -   below 0.4: set <light>🔴</light>
    -   from 0.4 to below 0.8: set <light>🟡</light>
    -   from 0.8 on: set <light>🟢</light>

    Output the following <template/>, with one table row per question
    <K/>, where <mark-K/> is `✔` if <choice-K/> equals <correct-K/>,
    else `✘`, and where <choice-label-K/> and <correct-label-K/> are
    the labels (`A` to `D`) of the positions <choice-K/> and
    <correct-K/>:

    <template>
    <ase-tpl-bullet-signal/> QUIZ RESULT: <light/> **<score/>/<q/>**

    | #    | QUESTION      | YOUR ANSWER       | CORRECT            |           |
    | ---- | ------------- | ----------------- | ------------------ | --------- |
    | <K/> | <question-K/> | <choice-label-K/> | <correct-label-K/> | <mark-K/> |
    </template>

    Then, for each question <K/> where <choice-K/> does not equal
    <correct-K/>, output the following <template/>:

    <template>
    <ase-tpl-bullet-secondary/> **<K/>**: <rationale-K/>
    </template>

    </step>

6.  <step id="STEP 6: Commit Staged Changes">

    1.  Run the command `git diff --cached` again. If its output
        differs from <diff/>, only output the following <template/> and
        then immediately *STOP* processing the entire current skill:

        <template>
        ⧉ **ASE**: ✪ skill: **ase-repo-qa-commit**, ▶ ERROR: the staged changes changed during the quiz, nothing committed
        </template>

    2.  Craft a commit <summary-line/> in the format `<type/>: <summary/>`.

        The known <type/>s (kept deliberately in sync with the
        `ase-repo-commit` skill) and their usual corresponding kind of
        change are:

        -   `FEATURE`:     new        functionality or configuration
        -   `IMPROVEMENT`: improved   functionality or configuration
        -   `BUGFIX`:      corrected  functionality or configuration
        -   `UPDATE`:      updated    functionality or configuration
        -   `CLEANUP`:     cleaned up functionality or configuration
        -   `REFACTOR`:    refactored functionality or configuration

        The rules for generating <summary/> are:

        -   Use a maximum of 60-80 characters
        -   Use imperative mood ("add" not "added")
        -   Use *no* period at the end
        -   Use *no* Markdown formatting
        -   Use *no* double-quote (`"`), backtick (`` ` ``), dollar
            (`$`), or backslash (`\`) characters
        -   Never add `Co-Authored-By` trailers to commit messages

    3.  Set <message/> to `<light/> [<score/>/<q/>] <summary-line/>`.
        If <light/> is `🔴`, append ` -- NEEDS REVIEW` to <message/>.

    4.  Commit the staged changes by running the command
        `git commit -m "<message/>"`. If it fails, only output the
        following <template/>, with <error/> being the error output of
        the command, and then immediately *STOP* processing the entire
        current skill:

        <template>
        ⧉ **ASE**: ✪ skill: **ase-repo-qa-commit**, ▶ ERROR: commit failed, changes remain staged: <error/>
        </template>

    5.  Output the following <template/>:

        <template>
        ⧉ **ASE**: ✪ skill: **ase-repo-qa-commit**, ▶ status: **committed**

        Commit Message:
        **<message/>**
        </template>

        Do *not* output any further explanation.

    </step>

</flow>

</output>
