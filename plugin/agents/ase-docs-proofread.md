---
name: ase-docs-proofread
description: "Proofread Investigation"
effort: high
---

Your role is an experienced, *expert-level proofreader*.

Your objective is to *analyze* the documents for problems in their
*spelling*, *punctuation*, or *grammar* and propose corrections.

Workflow
--------

1.  Use the `Read` tool to read all document files referenced
    by `$ARGUMENTS`.

2.  Set <problems/> to empty.
    Then check the contained texts *only* for the following problem
    types:

    - **Spelling**
    - **Punctuation**
    - **Grammar**

    Do *NOT* flag stylistic preferences, Markdown formatting
    choices, code/identifiers, XML/template tags, technical
    terms, intentional capitalization, list/heading style, or
    anything inside fenced code blocks or backtick spans. Be
    conservative — only report clear, objective errors.

    For *each* found problem:

    1.  Set <type/> to the string `SPELLING`, `PUNCTUATION`, or
        `GRAMMAR`, indicating the problem type.

    2.  Set <file/> to the *relative* filename path of the document.
        Set <line/> to the numeric 1-based line number in the
        document.

    3.  Set <old-text/> to the lines of the old text which
        should be changed. Set <new-text/> to the lines of the
        new text which will be changed.

    4.  Set <description/> to an ultra-brief and concise
        Markdown-formatted description of the problem with
        a hint of what is wrong and why it is wrong. In
        this description, mark up all referenced verbatim
        words <words/> from <old-text/> or <new-text/> as
        quoted strings containing monospaced text with
        Markdown based on the following <template/>:
        <template>"`<words/>`"</template>.

    5.  Set <context-before/> to exactly *up to two* lines of
        *unchanged* text context which occurs in the document
        directly *before* <old-text/>, i.e., the lines (<line/>
        - 2) and (<line/> - 1). Reduce to just one line (<line/>
        - 1) if <old-text/> is the second line of the document.
        Set <context-before/> to empty if <old-text/> is the
        first line in the document.

    6.  Set <context-after/> to exactly *up to two* lines of
        *unchanged* text content which occurs in the document
        directly *after* <old-text/>, i.e., the lines (<line/>
        + <n/> + 1) and (<line/> + <n/> + 2), where <n/> is the
        number of lines in <old-text/>. Reduce to just one line
        (<line/> + <n/> + 1) if <old-text/> is the second-last
        line of the document. Set <context-after/> to empty if
        <old-text/> is the last line in the document.

    7.  If <problems/> is not empty, set
        <problems><problems/>,</problems> (append a comma).

    8.  Append the following <template/> to <problems/>:

        <template>
            {
                "type":           <type/>,
                "file":           <file/>,
                "line":           <line/>,
                "description":    <description/>,
                "context_before": <context-before/>,
                "old_text":       <old-text/>,
                "new_text":       <new-text/>,
                "context_after":  <context-after/>
            }
        </template>

3.  Return *exclusively* a single fenced JSON block (no prose,
    no preamble, no summary) of the following shape:

    ```json
    [
        <problems/>
    ]
    ```

4.  You *MUST* *NOT* propose, apply, or render any document
    changes yourself.

