Diff Skill Common Steps
=======================

<define name="diff-hunk">

Render the proposed change as a *unified diff*, where <arg1/> labels
the changed side (like `corrected`) and <arg2/> is the change heading.

Determine the hunk *body* as an ordered list of lines, each
carrying a one-character prefix (` ` for context, `-` for
old-side, `+` for new-side). Build it by concatenating, in
order and *skipping any part that is empty*:

- one ` `-prefixed line for *each* line of <context-before/>
  (if non-empty),
- one `-`-prefixed line for *each* line of <old-text/>
  (if non-empty; split <old-text/> on newlines),
- one `+`-prefixed line for *each* line of <new-text/>
  (if non-empty; split <new-text/> on newlines),
- one ` `-prefixed line for *each* line of <context-after/>
  (if non-empty).

Set <hunk-body/> to those prefixed lines joined by newlines.

Set <old-count/> to the number of old-side hunk lines, i.e.,
the combined line count of <context-before/>, <old-text/>, and
<context-after/> (each empty part counts as `0`).
Set <new-count/> to the number of new-side hunk lines, i.e.,
the combined line count of <context-before/>, <new-text/>, and
<context-after/> (each empty part counts as `0`).

Set <old-start/> to the 1-based line number of the *first*
old-side hunk line: if <context-before/> is non-empty, that is
the line of its *first* context line, i.e., <line/> minus the
number of lines in <context-before/>; otherwise it is <line/> itself
(the first line of <old-text/>). For a hunk that *only inserts*
new lines (empty <old-text/> *and* empty context), set it to the
line *before* which the insertion happens, clamped to a minimum
of `0`, so a top-of-file insertion yields `@@ -0,0 ... @@`.
Set <new-start/> to the same value as <old-start/>, but clamped
to a minimum of `1` whenever <new-count/> is greater than `0`
(the <arg1/> side then has a real first line).

Render the hunk in a fenced block with *up to two* lines of
context based on the following <template/>, emitting
<hunk-body/> verbatim (one already-prefixed line per line,
with no extra blank or space-only lines):

<template>

⧉ **ASE**: <arg2/>:

```diff
--- <file/> (original)
+++ <file/> (<arg1/>)
@@ -<old-start/>,<old-count/> +<new-start/>,<new-count/> @@
<hunk-body/>
```

</template>

</define>

<define name="diff-normalize">

Normalize the change of <old-text/> and <new-text/> and derive its context.

*Normalize* it to its *minimal* form, so that the proposed diff shows
exactly the lines the later `Edit` will actually change: while the
*first* line of <old-text/> is identical to the *first* line of
<new-text/>, *move* that line from both to the end of
<context-before/> and increment <line/> by one; likewise, while the
*last* line of <old-text/> is identical to the *last* line of
<new-text/>, *move* that line from both to the front of
<context-after/>. Finally, *trim* <context-before/> to its *last*
two lines and <context-after/> to its *first* two lines.

Then, unless <ase-project-boxing/> is equal `grey` (where the full
unified diff is suppressed and no context lines are rendered at all),
*silently* read the current content of <file/> with the `Read` tool -
reusing the content read for the same <file/> earlier, unless an
`Edit` was applied to it in between - and set <file-lines/> to its
lines, *stripped* of the line-number prefixes the tool adds. Set
<file-lines/> to empty if the file cannot be read.

Whenever <file-lines/> is non-empty, *re-derive* both context parts
from it, *overriding* any previously supplied values, so the rendered
diff shows real context even when none was supplied: set
<context-before/> to the *up to two* lines of <file-lines/> directly
*before* line <line/> (empty if <line/> is `1`) and <context-after/>
to the *up to two* lines of <file-lines/> starting at line (<line/> +
<n/>), where <n/> is the number of lines in <old-text/> (empty if that
line is beyond the end of the document). Keep the previously supplied
values only when <file-lines/> is empty.

</define>

