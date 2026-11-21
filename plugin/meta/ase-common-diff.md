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
line *after* which the insertion happens, i.e., <line/> minus `1`,
clamped to a minimum of `0`, so a top-of-file insertion yields
`@@ -0,0 +1,... @@`.
Set <new-start/> to the same value as <old-start/>, but clamped
to a minimum of `1` whenever <new-count/> is greater than `0`
(the <arg1/> side then has a real first line), and for such an
insertion-only hunk to <old-start/> plus `1` (the <arg1/> side
then starts with the first inserted line).

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

<define name="diff-apply">

Let the user decide on the proposed change and apply it, where <arg1/>
names the change (like `correction`), <arg2/> is the dialog header
(like `CORRECTION`), and <arg3/> lists the placeholders a refinement
reassigns (like `<description/>, <old-text/>, and <new-text/>`).

<if condition="<getopt-option-auto/> is not equal `true`">

In the following, you *MUST* *NOT* use your built-in
<user-dialog-tool/> tool! Instead, you *MUST* just show a
custom dialog according to the expanded `custom-dialog`
definition. You *MUST* closely follow this definition:

<expand name="custom-dialog" arg1="--other">
    <arg2/>: How would you like to proceed with this proposed <arg1/>?
    ACCEPT: Apply this proposed <arg1/>.
    REJECT: Skip this proposed <arg1/>.
</expand>

</if>
<else>

Set <result>ACCEPT</result>.

</else>

Check <result/> and dispatch accordingly:

-   <if condition="<result/> is 'ACCEPT'">

    Invoke the `Edit` tool to apply the change by replacing
    <old-text/> with <new-text/> at <file/>:<line/>, where both are
    extended by the adjacent lines of <context-before/> resp.
    <context-after/> whenever <old-text/> is empty or not unique in
    <file/>, as `Edit` requires a non-empty and unique match. The operation
    will be auto-approved by the ASE `pre-tool-use` hook (which
    tracks the active skill), so *no* interactive permission
    prompt will appear. Then record `APPLIED` (or `FAILED`,
    if the `Edit` reported an error) as the outcome of
    <index/> in <outcomes/> and continue with the next <item/>.

    </if>

-   <if condition="<result/> starts with 'OTHER'">

    Generate a *new* proposal for the *same* <item/>,
    incorporating the user's free-text hint from <result/>
    after the "OTHER:" prefix. *Reassign* <arg3/> to reflect
    this refined proposal (<old-text/> stays anchored to the
    existing text at <file/>:<line/>) so the subsequent rendering
    and any `Edit` use the new proposal rather than the original.
    Then *re-apply* all derivations of the first substep of this
    `for`-iteration which follow its field assignments (including
    the `diff-normalize` expansion) to the refined values and *go
    back* to its second substep. There is *no* cap on refinement
    rounds - keep refining until the user picks `ACCEPT` or `REJECT`.

    </if>

-   <if condition="
        <result/> is 'REJECT' or
        <result/> is 'CANCEL' or
        <result/> starts with 'ERROR'
    ">

    Skip this <item/> without any `Edit` call, record
    `SKIPPED` as the outcome of <index/> in <outcomes/>, and
    continue with the next <item/>.

    </if>

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

Then *silently* read the current content of <file/> with the `Read`
tool (also the precondition of a later `Edit` of <file/>, hence even
where <ase-project-boxing/> is equal `grey` and no diff is rendered) -
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

