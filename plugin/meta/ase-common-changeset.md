
Change Set Common Steps
=======================

<define name="changeset-context">

Prepare the *origin working copy* -- the Git working copy the skill
was started in, which the `worktree` values of the `Source` and
`Target` concepts refer to -- and the *context worktree* -- the Git
working copy which the `worktree` value of the `Changeset` concept
refers to and in which the skill operates -- from the value <arg1/> of
the `--worktree <name/>[:<branch/>]` option, where <arg2/> is the skill
chrome of the status lines, <arg3/> is `true` if the `:<branch/>` part
is permitted (or `false` otherwise), <arg4/> is `true` if a missing
context worktree may be created (or `false` otherwise), and <arg5/> is
the *start point* (a commit or branch) of a branch created together
with the context worktree (or empty for `HEAD`). It sets
<origin-dir/> to the absolute directory of the origin working copy,
<context-dir/> to the absolute directory of the context worktree, and
<context-label/> to its display label. Do not output anything, except
for the templates below.

1.  Set <origin-dir/> to the output of the command
    `git rev-parse --show-toplevel` (taken exactly as given). If this
    command fails, only output the following <template/> and then
    immediately *STOP* processing the entire current skill:

    <template>
    ⧉ **ASE**: <arg2/>, ▶ ERROR: no Git repository
    </template>

    <if condition="<arg1/> is empty">
    The context worktree is the origin working copy itself: set
    <context-dir><origin-dir/></context-dir> and
    <context-label>.</context-label>, and *skip* all remaining
    sub-steps of this definition.
    </if>

2.  Split <arg1/> at its *first* `:` character into <context-name/>
    (the part before) and <context-branch/> (the part after, or empty
    if there is no `:`). The <context-name/> is *valid* only if it is
    non-empty and consists of the characters `A-Z`, `a-z`, `0-9`, `_`,
    and `-` only. A non-empty <context-branch/> is *valid* only if it
    is a valid branch name according to the `changeset-value`
    definition below and <arg3/> is `true`. If one of them is not
    valid, only output the following <template/> and then immediately
    *STOP* processing the entire current skill:

    <template>
    ⧉ **ASE**: <arg2/>, ▶ ERROR: invalid `--worktree` value: **<arg1/>**
    </template>

3.  Determine <context-dir/> by calling the `ase_worktree_path(id:
    "<context-name/>", create: true)` tool of the `ase` MCP server and
    set <context-label>.ase/worktree/<context-name/></context-label>.
    You *MUST* *NEVER* assemble this path yourself, as only this tool
    rejects a path leading through a symbolic link, through a
    non-directory, or out of the repository. If this tool call fails,
    only output the following <template/> and then immediately *STOP*
    processing the entire current skill, leaving the working copy
    *untouched*:

    <template>
    ⧉ **ASE**: <arg2/>, ▶ ERROR: no Git repository or unsafe worktree directory -- cannot create worktree
    </template>

4.  Determine the *existing worktrees* and *existing branches* by
    running the commands `git worktree list --porcelain` and
    `git branch --list` (taken exactly as given).

    -   <if condition="<context-dir/> is a *registered* worktree">
        The context worktree is *reused*, whatever is checked out in it.
        If <context-branch/> is not empty and differs from the branch
        checked out in <context-dir/>, switch it: if the command
        `git -C "<context-dir/>" status --porcelain` reports any output,
        or the command `git -C "<context-dir/>" switch "<context-branch/>"`
        (for an existing branch) resp.
        `git -C "<context-dir/>" switch -c "<context-branch/>"` (for a
        missing branch, created from `HEAD`) fails, only output the
        following <template/> and then immediately *STOP* processing the
        entire current skill:

        <template>
        ⧉ **ASE**: <arg2/>, ◉ worktree: **<context-label/>**, ▶ ERROR: worktree has uncommitted changes or failed to switch to branch **<context-branch/>**
        </template>

        Otherwise, only output the following <template/> and *skip* all
        remaining sub-steps of this definition:

        <template>
        ⧉ **ASE**: <arg2/>, ◉ worktree: **<context-label/>**, ▶ status: **worktree reused**
        </template>
        </if>

    -   <elseif condition="the directory <context-dir/> exists">
        Only output the following <template/> and then immediately *STOP*
        processing the entire current skill, leaving the directory
        *untouched*:

        <template>
        ⧉ **ASE**: <arg2/>, ▶ ERROR: directory **<context-label/>** exists, but is no Git worktree
        </template>
        </elseif>

    -   <elseif condition="<arg4/> is not `true`">
        A missing context worktree is *not* created here, as it would
        start out empty (e.g. on a mistyped name). Only output the
        following <template/> and then immediately *STOP* processing the
        entire current skill:

        <template>
        ⧉ **ASE**: <arg2/>, ▶ ERROR: worktree **<context-label/>** does not exist
        </template>
        </elseif>

    -   <else>
        The context worktree is *created*: if <context-branch/> is empty,
        set <context-branch><context-name/></context-branch>. If the branch
        <context-branch/> already exists, it is *checked out* into the
        worktree, so set
        <worktree-add-args>"<context-dir/>" "<context-branch/>"</worktree-add-args>,
        otherwise it is *created* from the start point <arg5/> (or from
        `HEAD` if <arg5/> is empty) together with the worktree, so set
        <worktree-add-args>-b "<context-branch/>" "<context-dir/>"</worktree-add-args>,
        followed by `"<arg5/>"` if <arg5/> is not empty. Create the
        worktree by running the command
        `git worktree add <worktree-add-args/>` (taken exactly as given).
        As a fresh worktree starts at the start point (or the existing
        branch), *uncommitted* changes of the current working copy are
        *not* carried over. If this command fails, only output the following
        <template/> and then immediately *STOP* processing the entire
        current skill:

        <template>
        ⧉ **ASE**: <arg2/>, ▶ ERROR: worktree **<context-label/>** failed to create
        </template>

        Otherwise, only output the following <template/>:

        <template>
        ⧉ **ASE**: <arg2/>, ◉ worktree: **<context-label/>**, ⎇ branch: **<context-branch/>**, ▶ status: **worktree created**
        </template>
        </else>

</define>

<define name="changeset-ambiguity">

Guard against the *misparse* of the former *boolean* `--worktree`
option: since `--worktree` takes a value, a former call like
`-w fix the crash` silently takes the first query word `fix` as the
worktree name. This reads and possibly updates <getopt-option-worktree/>
and <query/>, where <arg1/> is the skill chrome of the status lines.
Do not output anything, except for the dialog and template below.

1.  If <getopt-option-worktree/> does *not* match the regexp `^[a-z]+$`
    (a bare lower-case word, without any `:<branch/>` part) or <query/>
    is empty, the value is *unambiguous*: *skip* all remaining
    sub-steps of this definition.

2.  Determine the *worktree directory* by calling the
    `ase_worktree_path(id: "<getopt-option-worktree/>", create: false)`
    tool of the `ase` MCP server and the *existing worktrees* by running
    the command `git worktree list --porcelain` (taken exactly as
    given). If the tool call fails, or the worktree directory is a
    *registered* worktree, the value is *unambiguous* (an error is
    reported resp. the worktree is reused later): *skip* all remaining
    sub-steps of this definition.

3.  In the following, you *MUST* *NOT* use your built-in
    <user-dialog-tool/> tool! Instead, you *MUST* just show a custom
    dialog according to the expanded `custom-dialog` definition. You
    *MUST* closely follow this definition:

    <expand name="custom-dialog" arg1="--no-other">
        Worktree Ambiguity: Is `<getopt-option-worktree/>` the name of a *new* worktree or the first word of the query?
        USE WORKTREE: create worktree `.ase/worktree/<getopt-option-worktree/>` for query "<query/>"
        USE QUERY: use query "<getopt-option-worktree/> <query/>" without any worktree
        STOP SKILL: stop the entire skill immediately
    </expand>

4.  If <result/> is `USE QUERY`, set
    <query><getopt-option-worktree/> <query/></query> and
    <getopt-option-worktree></getopt-option-worktree> (empty). If
    <result/> is `STOP SKILL` or `CANCEL`, only output the following
    <template/> and then immediately *STOP* processing the entire
    current skill:

    <template>
    ⧉ **ASE**: <arg1/>, ▶ status: **editing finished**
    </template>

</define>

<define name="changeset-value">

Parse the value <arg2/> of the change set concept <arg1/> (`Source`,
`Changeset`, or `Target`), where <arg3/> is the comma-separated list of
its *permitted* forms and <arg4/> is the skill chrome of the status
line. It sets <value-type/> to the form (`worktree`, `branch`,
`attachment`, or `source`) and <value-name/> to the name of the
`branch:<name/>` and `attachment:<name/>` forms (or to empty otherwise).
Do not output anything, except for the error below.

1.  Split <arg2/> at its *first* `:` character into <value-type/> (the
    part before) and <value-name/> (the part after, or empty if there
    is no `:`).

2.  The value is *valid* only if <value-type/> is one of <arg3/> and
    one of the following holds:

    -   <value-type/> is `worktree` or `source` and <value-name/> is
        empty.

    -   <value-type/> is `branch` and <value-name/> is a *valid branch
        name*: it is non-empty, consists of the characters `A-Z`, `a-z`,
        `0-9`, `_`, `-`, `.`, and `/` only, does *not* start with `-`,
        `.`, or `/`, does *not* end with `/`, `.`, or `.lock`, and does
        *not* contain `..` or `//`. This keeps it safe for being passed
        quoted to the `git` commands.

    -   <value-type/> is `attachment` and <value-name/> is non-empty and
        consists of the characters `A-Z`, `a-z`, `0-9`, `_`, and `-`
        only, as it becomes part of a `Type` line and a worktree name.

    If the value is *not* valid, only output the following <template/>
    and then immediately *STOP* processing the entire current skill,
    leaving everything *untouched*:

    <template>
    ⧉ **ASE**: <arg4/>, ▶ ERROR: invalid <arg1/> value: **<arg2/>**
    </template>

</define>

<define name="changeset-land">

The change set *MUST* land *exclusively inside* the worktree <arg1/>:
read *every* artifact (also for discovering and grilling) and resolve
*every* file path relative to <arg1/> instead of the working copy the
agent tool was started in, and run *every* verification
command (build, tests, linter, type-checker, program execution) with
<arg1/> as its working directory. You *MUST* *NEVER* modify, stage,
stash, revert, or commit anything *outside* of this worktree. Do *not*
run `git add` or `git commit` inside it either, unless the skill
*explicitly* requires it, so the user keeps full control over the
final commit.

</define>

