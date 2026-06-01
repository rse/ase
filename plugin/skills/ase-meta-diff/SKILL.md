---
name: ase-meta-diff
argument-hint: "[--help|-h] [--risk|-r] [--blast|-b]"
description: >
    Summarize the currently staged Git changes as a human-readable,
    intent-grouped narrative. Use when the user wants a concise and
    brief report of what changed and why. Optionally can show a risk and
    blast radius report.
user-invocable: true
disable-model-invocation: false
effort: high
allowed-tools:
    - "Bash(git diff *)"
    - "Bash(git grep:*)"
    - "Bash(git ls-files:*)"
    - "Bash(grep:*)"
    - "Agent"
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-control.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-getopt.md

<skill name="ase-meta-diff">
Summarize Diff
</skill>

<expand name="getopt"
    arg1="ase-meta-diff"
    arg2="--risk|-r --blast|-b">
    $ARGUMENTS
</expand>

<objective>
Summarize the currently staged Git changes into a *concise*,
*human-readable* narrative of what changed and why, *grouped by
intent* rather than by file. Optionally *score* the diff against a
*coupling-criticality-coverage- reversibility* rubric and emit a *graded
risk report* with *mitigations*. Optionally render a *blast-radius map*.
</objective>

Procedure
---------

You *MUST* follow the following numbered items *strictly* *sequentially*!
You *MUST* not skip any numbered item during processing!

You *MUST* *NOT* output anything in this entire procedure, *except* when
explicitly requested by this procedure via outputs based on a <template/>!

<flow>

1.  <step id="STEP 1: Determine Change Set">

    1.  Determine the *diff details* by running the corresponding command
        (taken exactly as given) and capturing the full diff output into
        <diff/> for the subsequent analysis:

        `git diff --cached HEAD`

    2.  Determine the *diff statistics* by running the corresponding command
        (taken exactly as given) and capturing the full stat output into
        <stat/> for the subsequent analysis:

        `git diff --cached --numstat HEAD`

    </step>

2.  <step id="STEP 2: Summarize By Intent">

    1.  <if condition="<diff/> is empty">
        Only output the following <template/> and then *STOP* immediately:

        <template>
        ⧉ **ASE**: ✪ skill: **ase-meta-diff**, ▶ status: **no changes to summarize**
        </template>
        </if>

    2.   Analyze the <diff/> and <stat/> and synthesize a *concise* narrative of
         WHAT changed and WHY, *grouped by intent* rather than by file.
         Honor the following intents:

         -   `FEATURE`:     new        functionality or configuration
         -   `IMPROVEMENT`: improved   functionality or configuration
         -   `BUGFIX`:      corrected  functionality or configuration
         -   `UPDATE`:      updated    functionality or configuration
         -   `CLEANUP`:     cleaned up functionality or configuration
         -   `REFACTOR`:    refactored functionality or configuration

    3.  <if condition="<diff/> is NOT empty">
        First, output the following header <template/>:

        <template>
        ╭──────────────────────────────────────────────────────────────────────┈┈┈┈┈┈┈┈┈┈

        &#x1F535; **CHANGE INTENT REPORT**:

        </template>

        For each discovered *intent group* present in the <diff/>, emit
        the following <template/>, where <intent/> is the intent label
        and <narrative/> is a *brief* one-to-two-sentence narrative of
        what changed and why, naming the affected files in backticks:

        <template>
        ● **<intent/>**: <narrative/>
        </template>

        Markup all file references as code (with backticks), prepend
        them with `▢ ` and append ` [+N/-M]` (based on the information
        in <stat/>) to them.

        Keep the overall report *concise* and *brief*. Try to keep the
        number of intent groups in the range of 1-10. Do *not* output
        any further explanation.

        Finally, output the following footer <template/>:

        <template>

        ╰──────────────────────────────────────────────────────────────────────┈┈┈┈┈┈┈┈┈┈
        </template>
        </if>

    </step>

3.  <step id="STEP 3: Score Against Risk Rubric">

    1.  <if condition="<getopt-option-risk/> is NOT equal `true`">
        Silently *SKIP* this entire step.
        </if>

    2.  <if condition="<diff/> is empty">
        Silently *SKIP* this entire step (STEP 2 already reported it).
        </if>

    3.  <if condition="<getopt-option-risk/> is equal `true` and <diff/> is NOT empty">

        Score the *same* captured <diff/> and <stat/> information
        against the four-axis rubric below. Each axis is scored on an
        integer scale of *1* (lowest risk) to *5* (highest risk) against
        the *fixed anchors* given, and *every* score *MUST* be backed
        by a one-line <evidence/> grounded in the *actual* hunks or the
        read-only repository probe.

        Probe the repository *read-only* and *heuristically* (via `git
        grep` / `grep` / `git ls-files`, restricted to first-party code)
        only as needed to substantiate the *Coupling* and *Coverage*
        axes (e.g. who imports a touched module, whether touched code has
        adjacent tests). Do not output anything during the probe.

        Score each axis against these anchors:

        1.  **COUPLING** — how widely the touched code is depended upon.
            *1*: self-contained, no first-party importers.
            *3*: a handful of dependent modules.
            *5*: a hub touched by many modules or a public interface.

        2.  **CRITICALITY** — how essential the touched path is.
            *1*: docs, comments, dead/peripheral code.
            *3*: ordinary feature logic.
            *5*: core/security/auth/data-integrity/money path.

        3.  **COVERAGE** — how well the change is exercised by tests.
            *1*: tests touched in this diff or directly covering the
            changed hunks.
            *3*: adjacent tests exist but are not clearly exercising the
            changed hunks.
            *5*: no tests anywhere near the touched code.

        4.  **REVERSIBILITY** — how easily the change can be undone.
            *1*: pure code change, revert restores prior state.
            *3*: needs coordinated revert or a config rollback.
            *5*: irreversible-by-revert (schema/data migration, released
            artifact, external side effect).

        Compute the *aggregate risk* as the *equal-weighted* mean of
        the four risk contributions (Coupling, Criticality, Coverage,
        Reversibility), rounded to one decimal, and map it to a *graded
        band*: *1.0-1.9* → **LOW**, *2.0-2.9* → **MODERATE**, *3.0-3.9*
        → **HIGH**, *4.0-5.0* → **CRITICAL**.

        Then emit the following <template/>, with the overall band and
        aggregate score and with one rubric block per axis (showing
        the score, evidence and mitigation). If an axis did not
        reach the mitigation threshold of '>= 4', just omit the
        `○ **Mitigation**: <mitigation/>` part. Keep the overall
        <evidence/> and <mitigation/> texts *concise* and *ultra brief*.
        Do *not* output any further explanation.

        In <evidence/> markup all file references as code (with
        backticks), prepend them with `▢ ` and append ` [+N/-M]` (based
        on the information in <stat/>) to them.

        <template>
        ╭──────────────────────────────────────────────────────────────────────┈┈┈┈┈┈┈┈┈┈

        &#x1F7E0; **CHANGE RISK REPORT**: Overall: **<band/>** (<aggregate/>/5)

        ● **<axis/>** (<score/>/5):
        ○ **Evidence**: <evidence/>
        ○ **Mitigation**: <mitigation/>

        ● **<axis/>** (<score/>/5):
        ○ **Evidence**: <evidence/>
        ○ **Mitigation**: <mitigation/>

        [...]

        ╰──────────────────────────────────────────────────────────────────────┈┈┈┈┈┈┈┈┈┈
        </template>

        </if>

    </step>

4.  <step id="STEP 4: Render Blast-Radius Map">

    1.  <if condition="<getopt-option-blast/> is NOT equal `true`">
        Silently *SKIP* this entire step.
        </if>

    2.  <if condition="<diff/> is empty">
        Silently *SKIP* this entire step (STEP 2 already reported it).
        </if>

    3.  <if condition="<getopt-option-blast/> is equal `true` and <diff/> is NOT empty">
        From the *same* captured <diff/> and <stat/>, *extract the
        touched modules* — the distinct changed source files (or their
        enclosing modules/ packages, according to the language idiom).

        Then, for each touched module, *scan its reverse dependencies*
        — the other first-party files that *import* or *reference* it
        — using `git grep` / `grep` across the repository (e.g. by the
        module's basename, exported symbol, or import path). Keep the
        scan *read-only* and *heuristic*; restrict it to first-party
        code within the repository. Do not output anything during the
        scan.

        Then build a *blast-radius graph* and render it as a diagram:

        1.  Build a Mermaid specification <mermaid-spec/> for a `flowchart
            TB` whose *touched* modules are the origin nodes and whose
            *reverse-dependency* edges fan out to the dependent modules
            (origin → dependent).

            Flag each *touched* node as a problem node per the
            `ase-meta-diagram` anomaly convention — prefix its label
            with `!` inside quotes, e.g. `T1["!src/core.ts"]`. Keep
            labels short (basenames or module names).

        2.  Dispatch the rendering to the `ase-meta-diagram` sub-agent by
            calling the tool `Agent(name: "ase:ase-meta-diagram",
            description: "Diagram Rendering", subagent_type:
            "ase:ase-meta-diagram", prompt: <mermaid-spec/>)` and capture
            its returned fenced code block as <diagram/>.

        Then emit the following <template/>, showing <diagram/> and
        appending a *brief impact summary* of 1-5 bullets, where each
        <module/> is a touched module and <impact/> is a one-sentence
        note on *what depends on it* and *how far the blast reaches*.

        In <module/> and <impact/>, markup all file references as code
        (with backticks), prepend them with `▢ ` and append ` [+N/-M]`
        (based on the information in <stat/>) to them.

        <template>
        ╭──────────────────────────────────────────────────────────────────────┈┈┈┈┈┈┈┈┈┈

        &#x1F7E0; **CHANGE BLAST RADIUS MAP**:

        ```
        <diagram/>
        ```

        **<module/>**: <impact/>

        **<module/>**: <impact/>

        [...]

        ╰──────────────────────────────────────────────────────────────────────┈┈┈┈┈┈┈┈┈┈
        </template>

        Keep the overall report *concise* and *brief*. Do *not* output
        any further explanation.
        </if>

    </step>

</flow>

