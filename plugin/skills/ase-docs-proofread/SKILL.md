---
name: ase-docs-proofread
argument-hint: "<docs-reference>"
description: >
    Analyze the documents for spelling, punctuation, or grammar errors.
    Use when the user wants to "spellcheck", "proofread", or "lint" a text or document.
user-invocable: true
disable-model-invocation: false
effort: high
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-control.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md

Proofread Documentation
=======================

<skill name="ase-docs-proofread">
Analyze the documents for spelling, punctuation, or grammar errors.
</skill>

<role>
Your role is an experienced, *expert-level proofreader*, specialized in
checking and correcting the *spelling*, *punctuation* and *grammar* of
documents.
</role>

<objective>
*Analyze* the documents of $ARGUMENTS for problems in its *spelling*,
*punctuation* or *grammar* and immediately correct all found problems.
</objective>

<flow>

1.  <step id="STEP 1: Investigation & Checking">
    Investigate on the document base by using the `Read` tool to read all
    references document files. For all contained texts in those files,
    check the following problem types *ONLY*:

    - **Spelling**
    - **Punctuation**
    - **Grammar**

    You *MUST* collect *all* found problems into an internal list only,
    and then set <problems/> to the value of this list.

    You *MUST* *NOT* propose document changes in this step 1.
    You *MUST* *NOT* output anything in this step 1.
    </step>

2.  <step id="STEP 2: Summary">
    Use the following <template/> to give a summary of the detected
    problems in <problems/>:

    <template>
    | *Proofread Type* | *Proofread Result*      |
    | ---------------- | ----------------------- |
    | **SPELLING**:    | **<n/>** problems found |
    | **PUNCTUATION**: | **<m/>** problems found |
    | **GRAMMAR**:     | **<k/>** problems found |
    </template>

    Hints:

    -   <n/> is the number of spelling problems in <problems/>
    -   <m/> is the number of punctuation problems in <problems/>
    -   <k/> is the number of grammar problems in <problems/>
    </step>

3.  <step id="STEP 3: Details & Correction">

    <for items="<problems/>">

    For the current <item/> from the collected list <problems/>, do the
    following:

    1.  Report the problem with the following <template/>:

        <template>
        &#x1F7E0; **<type/>**: [`<file/>`:<line/>]: <description/>
        </template>

        Hints:

        -   The <type/> is `SPELLING`, `PUNCTUATION` or `GRAMMAR`
            of <item/>.

        -   The <file/> is the name of the document artifact of <item/>.
            The <line/> is the line number of the document artifact of <item/>.

        -   The <description/> is an ultra brief and concise description
            of the problem <item/> with a hint what is wrong and why
            it is wrong. In <description/>, markup all verbatim words
            <words/> related to the checked text (or the proposed
            corrected text) as quoted strings containing monospaced text
            with the Markdown <template>"`<words/>`"</template>.

    2.  Propose a direct change to the corresponding document via the
        interactive `Edit` tool.

        **IMPORTANT**: Regardless of whether the change was *accepted*
        or *rejected* by the user (i.e., even if the `Edit` tool returns
        an error like "The user doesn't want to proceed with this tool
        use" or "User rejected"), you *MUST* immediately *CONTINUE* with
        the *next* <item/> in the iteration.

        Do *NOT* stop. Do *NOT* ask the user for confirmation. Do *NOT*
        summarize. A rejection is *NOT* a signal to abort; it is only
        a signal that *this one* change is skipped. Only after *all*
        problems have been processed may you stop.

    </for>

    You *MUST* *NOT* output any further additional explanations or
    summaries at the end of this skill processing.
    </step>

</flow>


