
Resolve Skill Common Steps
==========================

<define name="resolve-conflicts">

*Resolve* the conflicts inside the Git working directory <arg2/> on
behalf of the skill <arg1/>, where <arg3/> (`true` or `false`) enables
the *interactive* resolution of otherwise unresolvable hunks, <arg4/>
(`true` or `false`) enables the *safe* mode which never touches
non-content conflicts, and <arg5/> is an optional whitespace-separated
list of paths restricting the files to resolve. This sets
<resolve-verdict/> to `NONE`, `RESOLVED`, `PARTIAL`, or `FAILED`,
<resolve-operation/> to the in-progress Git operation,
<resolve-escalations/> to the list of escalated conflicts, and
<resolve-backup-dir/> to the backup directory.

The overarching rule is: you *MUST* *NEVER* lose any change of any
side. When in doubt, a conflict stays *exactly as it is* and is
escalated -- an unresolved conflict is always acceptable, a silently
dropped change *never* is.

1.  DETERMINE STATE:

    1.  Set <resolve-verdict>FAILED</resolve-verdict>,
        <resolve-escalations></resolve-escalations> (empty), and
        <resolve-backup-dir></resolve-backup-dir> (empty).

    2.  Determine the *repository root* and the *Git directory* by
        running the commands `git -C "<arg2/>" rev-parse --show-toplevel`
        and `git -C "<arg2/>" rev-parse --absolute-git-dir` and capturing
        their outputs into <repo-root/> and <git-dir/>. If a command
        fails, skip all remaining items of this expansion, as
        <arg2/> is no Git working directory.

    3.  Determine the *in-progress operation* by running the command
        `git -C "<repo-root/>" rev-parse --verify --quiet "<ref/>"` for
        <ref/> being `MERGE_HEAD`, `REBASE_HEAD`, `CHERRY_PICK_HEAD`,
        and `REVERT_HEAD` (in this order) and set
        <resolve-operation/> to `merge`, `rebase`, `cherry-pick`, or
        `revert` for the *first* existing one, and to `none` (e.g.,
        after `git stash apply`, `git apply --3way`, or `patch --merge`)
        if none exists. Set <theirs-ref/> to that existing ref (or to
        empty for `none`).

    4.  Determine the *intents* of both sides: *ours* is `HEAD` and
        *theirs* is <theirs-ref/>. Inspect them by running the commands
        `git -C "<repo-root/>" log --oneline -n 10 HEAD` and, if
        <theirs-ref/> is not empty,
        `git -C "<repo-root/>" log --oneline -n 10 "<theirs-ref/>"` and
        `git -C "<repo-root/>" show --stat "<theirs-ref/>"`. Keep in
        mind that under `rebase` *ours* is the upstream the commits are
        replayed onto and *theirs* is the replayed commit of the user's
        branch, and that under `revert` *theirs* is the *inverse* of
        the reverted commit. Without <theirs-ref/>, derive the sides
        from the labels of the conflict markers only.

2.  DETERMINE CONFLICTS:

    1.  Determine the *unmerged files* by running the command
        `git -C "<repo-root/>" -c core.quotepath=off status --porcelain=v1`
        and taking all entries with the status codes `UU` (both
        modified), `AA` (both added), `UD`/`DU` (modified/deleted),
        `AU`/`UA` (added by one side, usually a rename), and `DD` (both
        deleted). For each of them, additionally capture the output of
        `git -C "<repo-root/>" ls-files -u -- "<file/>"`, which lists
        the object ids of the stages `1` (base), `2` (ours), and `3`
        (theirs) -- these stay retrievable via
        `git -C "<repo-root/>" cat-file -p <object-id/>` even after the
        index entry got resolved.

    2.  Determine the *marker files* -- files carrying conflict markers
        *without* an unmerged index entry (e.g., after `patch --merge`)
        -- by running the command
        `git -C "<repo-root/>" -c core.quotepath=off grep -l -I --untracked -E "^<{7}( |$)"`
        and keeping every listed file which is *not* an unmerged file,
        *not* below the `.ase/` directory, and additionally contains a
        matching `^={7}$` and `^>{7}( |$)` line (so that, e.g., a
        Markdown heading underline alone never qualifies). Additionally
        determine the *reject files* of `patch` by running the command
        `git -C "<repo-root/>" -c core.quotepath=off ls-files --others --exclude-standard -- "*.rej"`:
        they carry hunks which were *not* applied at all, so every one
        of them is escalated as a whole and *never* touched or removed.

    3.  If <arg5/> is not empty, keep only those unmerged, marker, and
        reject files which equal or are located below one of the paths
        in <arg5/> (resolved relative to <arg2/>).

    4.  If no unmerged, marker, or reject files remain, set
        <resolve-verdict>NONE</resolve-verdict> and skip all remaining
        items of this expansion.

    5.  Classify every unmerged and marker file into its *conflict
        kind*: `content` for a text file with conflict markers (`UU`,
        `AA`, or a marker file), `binary` for a `UU` or `AA` file Git
        treats as binary (no conflict markers written), `submodule` for
        a gitlink entry (mode `160000`), `modify/delete` for `UD` and
        `DU`, `rename` for `AU` and `UA`, and `delete/delete` for `DD`.

3.  BACK UP FILES:

    Set <resolve-backup-dir><git-dir/>/ase-resolve</resolve-backup-dir>.
    For every unmerged and marker file which exists in the working
    directory, back it up *before* touching it by running the commands
    `mkdir -p "<resolve-backup-dir/>/<file-dir/>"` and
    `cp -p "<repo-root/>/<file/>" "<resolve-backup-dir/>/<file/>"`,
    where <file-dir/> is the directory part of <file/>. If a backup of
    this file *already exists* (from an earlier, partial run), you
    *MUST* *NOT* overwrite it, as it holds the *more original* state.
    Instead, additionally back up its current state into
    `<resolve-backup-dir/>/<file/>.current` (overwriting an earlier one).
    Set <file-backup/> to the backup of the *current* state of the file:
    the `.current` one if just written, else the regular one.
    If a backup fails, you *MUST* *NOT* touch this file at all and
    escalate it with the reason `backup failed`. The backups are
    especially essential for marker files, whose sides exist *nowhere*
    else than inside the file itself.

4.  RESOLVE CONFLICTS:

    Resolve every file which is *not* a reject file, one after another,
    according to its conflict kind:

    1.  `content`:

        1.  Read the file and split it into its *conflict hunks*, each
            consisting of the *ours* section (after `<<<<<<<`), the
            optional *base* section (after `|||||||`, written under the
            `diff3` or `zdiff3` conflict style), and the *theirs*
            section (after `=======`, up to `>>>>>>>`). If no base
            section exists and the file is unmerged with a stage `1`,
            read the *base* version *read-only* by running the command
            `git -C "<repo-root/>" show ":1:<file/>"`. You *MUST* *NEVER*
            regenerate the markers via `git checkout --conflict=...` or
            `git checkout -m`, as this would destroy all manual edits
            already present in the file.

        2.  For every hunk, understand *what* each side changed relative
            to the base and *why* (with the help of the intents of
            item 1.4, the surrounding code, and -- if necessary -- the
            other places of the code base the hunk depends on), and
            classify it:

            -   *trivial*: both sides are identical, differ in
                whitespace only, or one side equals the base -- take
                the side carrying the change.
            -   *independent*: both sides changed *different* aspects
                (e.g., adjacent additions, unrelated edits of the same
                region) -- combine *both* changes, ordering additions
                in a sensible way.
            -   *compatible*: both sides changed the *same* aspect, but
                in a way that can be *combined* (e.g., one side renamed
                an identifier, the other side added a use of it) -- merge
                both, so *both* intents are honored.
            -   *unresolvable*: both intents *contradict* each other
                (e.g., the same value changed to two different values),
                or you are *not confident* about a resolution.

            Replace every *trivial*, *independent*, and *compatible*
            hunk by its resolution, including the removal of its
            conflict markers, while keeping every *unresolvable* hunk
            *verbatim* including its conflict markers. Change *nothing*
            outside of the conflict hunks, except for a consequence of
            a *compatible* resolution which is *strictly* needed inside
            the *same* file (e.g., the renamed identifier in code one
            side added outside of the hunks).

    2.  `binary` and `submodule`:

        If <arg4/> is `true`, escalate the file untouched. Otherwise
        compare the object ids of the stages: if the stage `2` or `3`
        equals the stage `1` (one side left it unchanged), take the
        other, changed side by running the command
        `git -C "<repo-root/>" checkout --ours -- "<file/>"` (stage `2`)
        or `git -C "<repo-root/>" checkout --theirs -- "<file/>"`
        (stage `3`), which is independent of the swapped side
        semantics under `rebase`. Otherwise, escalate the file, as two
        different binary contents or submodule commits cannot be
        combined.

    3.  `modify/delete`, `rename`, and `delete/delete`:

        If <arg4/> is `true`, escalate the file untouched. Otherwise
        resolve it only if the intent is *unambiguous* and *no* change
        gets lost:

        -   `delete/delete`: both sides agree, so remove the file from
            the index by running the command
            `git -C "<repo-root/>" rm --quiet -- "<file/>"`.
        -   `modify/delete` and `rename`: if the deleting side *moved*
            the content (e.g., renamed or split the file), *port* the
            modification of the other side *completely* into the new
            location (then treated like a *compatible* content
            resolution, including the change preservation check) and
            remove the old file via `git -C "<repo-root/>" rm --quiet -- "<file/>"`.
            If the deletion *intentionally* removed a feature, but the
            other side modified it, the intents contradict each other,
            so escalate the file. When uncertain, escalate, as keeping
            the conflict is always safe.

    4.  <if condition="<arg3/> is `true` and <ase-headless/> is not `true`">

        Before a hunk or file is finally escalated, let the user decide
        on it interactively. For this, first show the hunk (its *ours*,
        *base*, and *theirs* sections, or the stage summary for a
        non-content conflict), the determined intents of both sides,
        and the reason why it is unresolvable. Then, in the following,
        you *MUST* *NOT* use your built-in <user-dialog-tool/> tool!
        Instead, you *MUST* just show a custom dialog according to the
        expanded `custom-dialog` definition. You *MUST* closely follow
        this definition:

        <expand name="custom-dialog" arg1="--other">
            Conflict: How shall the conflict be resolved? (free-text: describe the manual resolution)
            OURS: take the ours side only
            THEIRS: take the theirs side only
            BOTH: take both sides, ours first, then theirs
            KEEP: keep the conflict as it is and escalate it
        </expand>

        Apply `OURS`, `THEIRS`, or `BOTH` literally, which is an
        *explicit* user decision and hence exempt from the change
        preservation check below. For an `OTHER: ` result, strip this
        prefix and apply the described manual resolution. For `KEEP` or
        `CANCEL`, escalate the hunk or file as usual.

        </if>

    Record every escalated hunk or file in <resolve-escalations/> with
    its file, its line range (or the whole file), its conflict kind, a
    one-line intent of each side, and a one-line reason.

5.  CHECK CHANGE PRESERVATION:

    For every *resolved* hunk (except explicit user decisions), verify
    that *no* change got lost: every line which *ours* added, removed,
    or modified relative to the *base*, and every line which *theirs*
    added, removed, or modified relative to the *base*, *MUST* be
    reflected in the resolution, unless the deviation is *justified* by
    the intent of the other side (e.g., a combined line which carries
    both modifications). Without a base, every line of both sides
    *MUST* be reflected. Additionally, compare the resolved file against
    its backup <file-backup/> by running the command
    `git -C "<repo-root/>" diff --no-index -- "<file-backup/>" "<repo-root/>/<file/>"`
    (which intentionally exits non-zero when the files differ) and
    verify that it changed *nothing* outside of the conflict hunks
    except for the strictly needed consequences of item 4.1.2.

    If any check fails for a hunk, restore this hunk *verbatim* from
    <file-backup/>, including its conflict markers, and escalate it with
    the reason `change preservation check failed`. If the check cannot be
    decided at all for a file, restore the entire file from <file-backup/>
    by running the command
    `cp -p "<file-backup/>" "<repo-root/>/<file/>"`
    and escalate all its hunks.

6.  STAGE RESOLVED FILES:

    1.  Determine the *fully resolved* files: all unmerged and marker
        files without any escalated hunk. Check them for leftover
        conflict markers by running the command
        `git -C "<repo-root/>" grep -n -I --untracked -E "^(<{7}|\|{7}|>{7})( |$)" -- <files/>`
        (with <files/> being the quoted fully resolved files). If it
        reports lines of a file, treat the reported hunks as escalated
        with the reason `leftover conflict markers`.

    2.  Stage every fully resolved *unmerged* file and every new
        location a modification was ported into (item 4.3) by running the
        command `git -C "<repo-root/>" add -- "<file/>"` (except for
        files already removed from the index via `git rm`, while files
        taken via `git checkout --ours`/`--theirs` do need this
        `git add`). You *MUST* *NOT* stage *marker* files, as they were
        not staged before either, and you *MUST* *NOT* stage *partially*
        resolved files, which hence stay *unmerged* (resp. carry their
        remaining conflict markers).

7.  DETERMINE VERDICT:

    If <resolve-escalations/> is empty, set
    <resolve-verdict>RESOLVED</resolve-verdict> and remove the backups:
    if <arg5/> is empty, by running the command
    `rm -rf "<resolve-backup-dir/>"`, else only those of the files
    resolved by this run, by running the command
    `rm -f "<resolve-backup-dir/>/<file/>" "<resolve-backup-dir/>/<file/>.current"`
    for each of them, as the backups of files outside of <arg5/> may
    still hold the original conflict state of earlier escalations. Otherwise,
    set <resolve-verdict>PARTIAL</resolve-verdict> and *keep* the
    backups, as they hold the original conflict state of the escalated
    files.

</define>

<define name="resolve-report">

<if condition="<resolve-escalations/> is not empty">
Set <backups/> to the text `⊚ backups:`, followed by a blank and
<resolve-backup-dir/> rendered as a code span, if <resolve-backup-dir/>
is not empty, or to empty otherwise. Then only output the following <template/>, with one entry
per escalation in <resolve-escalations/>:

<template>
<ase-tpl-head title="ESCALATIONS" subtitle="<arg1/>"/>

⧉ **ASE**: `<file/>:<lines/>` (<kind/>): <reason/>
    ◦ ours:   <ours-intent/>
    ◦ theirs: <theirs-intent/>
[...]

<backups/>

<ase-tpl-foot title="ESCALATIONS" subtitle="<arg1/>"/>
</template>
</if>

</define>
