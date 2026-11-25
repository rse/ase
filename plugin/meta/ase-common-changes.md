
Change Selection Common Steps
=============================

<define name="changes-select">

Select the Git *change set* to inspect from the change selection
options, where <arg1/> is the skill chrome of the status lines,
<arg2/> resp. <arg3/> are the values of the `--staged` resp.
`--unstaged` options (`true` or `false`), and <arg4/>, <arg5/>, and
<arg6/> are the values of the `--worktree`, `--branch`, and `--commit`
options (each empty if not given). It sets <changes/> to the selected
*uncommitted* changes (`staged`, `unstaged`, `staged and unstaged`, or
empty), <worktree-dir/> to the directory of the worktree carrying the
uncommitted changes (or empty for the current working copy),
<changes-branch/> to the branch, <base/> and <base-commit/> to its base
branch and base commit, <commit-id/> to the id of a commit (all empty
if not selected), <changes-scope/> to the
textual *scope* of the change set, and <changes-revision/> to the
revision the change set *results* in (or empty for the files on disk).
Do not output anything, except for the templates below.

1.  <if condition="<arg6/> is not empty and (<arg5/> is not empty or <arg2/> is equal `true` or <arg3/> is equal `true`)">
    Only output the following <template/> and then immediately *STOP*
    processing the entire current skill:

    <template>
    ⧉ **ASE**: <arg1/>, ▶ ERROR: option `--commit` cannot be combined with `--branch`, `--staged`, or `--unstaged`
    </template>
    </if>

    <if condition="<arg4/> is not empty and (<arg5/> is not empty or <arg6/> is not empty)">
    Only output the following <template/> and then immediately *STOP*
    processing the entire current skill:

    <template>
    ⧉ **ASE**: <arg1/>, ▶ ERROR: option `--worktree` cannot be combined with `--branch` or `--commit`
    </template>
    </if>

    Set <changes/> to `staged and unstaged` if both <arg2/> and <arg3/>
    are equal `true`, to `staged` if only <arg2/> is equal `true`, to
    `unstaged` if only <arg3/> is equal `true`, and to empty otherwise.
    Here, the `unstaged` changes always include the *untracked* files.
    Set <changes-branch><arg5/></changes-branch>, and set
    <worktree-dir></worktree-dir>, <base></base>,
    <base-commit></base-commit>, <commit-id></commit-id>, and
    <changes-revision></changes-revision> (all empty).

2.  <if condition="<arg4/> is not empty">
    Determine the directory of this existing ASE worktree: if <arg4/>
    consists of other characters than `A-Z`, `a-z`, `0-9`, `_`, and `-`,
    keep <worktree-dir/> empty, else call the
    `ase_worktree_path(id: "<arg4/>", create: false)` tool of the `ase`
    MCP server (you *MUST* *NEVER* assemble this path yourself), capture
    its result into <worktree-dir/>, and run the command
    `git -C "<worktree-dir/>" rev-parse --show-toplevel` (taken exactly
    as given). If <worktree-dir/> is empty, the tool call failed, or the
    command failed (i.e., the worktree does not exist), only output the
    following <template/> and then immediately *STOP* processing the
    entire current skill:

    <template>
    ⧉ **ASE**: <arg1/>, ▶ ERROR: no worktree **<arg4/>**
    </template>
    </if>

3.  <if condition="<arg5/> is not empty">
    Determine the *base* of the branch:

    1.  Check that <arg5/> matches the regexp
        `^[A-Za-z0-9_@][A-Za-z0-9._/+@-]*$`, which keeps it safe for
        being passed quoted to the `git` commands, and only then run the
        command `git rev-parse --verify --quiet "<arg5/>^{commit}"`. If
        the check or the command fails, only output the following
        <template/> and then immediately *STOP* processing the entire
        current skill:

        <template>
        ⧉ **ASE**: <arg1/>, ▶ ERROR: branch **<arg5/>** does not exist
        </template>

    2.  Determine the *candidate base branches* by running the command
        `git for-each-ref --format="%(refname:short)" refs/heads/` (taken
        exactly as given), excluding <arg5/> itself. For each
        <candidate/>, run the command
        `git rev-list --count "<candidate/>..<arg5/>"` to count the
        commits of the branch since its fork point from <candidate/>, and
        *drop* every candidate with a count of `0`, as it already contains
        the branch. Set <base/> to the remaining candidate with the
        *smallest* count (the *nearest* fork point); on a tie, prefer the
        checked-out branch (the output of `git branch --show-current`),
        and then the first candidate. If no candidate remains, only output
        the following <template/> and then immediately *STOP* processing
        the entire current skill:

        <template>
        ⧉ **ASE**: <arg1/>, ▶ ERROR: no base branch determinable for branch **<arg5/>**
        </template>

    3.  Run the command `git merge-base "<base/>" "<arg5/>"` and capture
        its output into <base-commit/>.

    4.  <if condition="<changes/> is not empty">
        Determine the *worktree* of the branch by running the command
        `git worktree list --porcelain` and setting <worktree-dir/> to the
        `worktree` path of the entry whose `branch` line is
        `refs/heads/<arg5/>` (or to empty if there is none, as a branch
        not checked out anywhere carries no uncommitted changes).
        </if>

    5.  Only output the following <template/>:

        <template>
        ⧉ **ASE**: <arg1/>, ⎇ branch: **<arg5/>**, ⎇ base: **<base/>**
        </template>

    </if>
    <elseif condition="<arg6/> is not empty">
    Check that <arg6/> matches the regexp
    `^[A-Za-z0-9_@][A-Za-z0-9._/+@~^-]*$`, which keeps it safe for being
    passed quoted to the `git` commands, and only then run the command
    `git rev-parse --verify --quiet "<arg6/>^{commit}"` and capture its
    output into <commit-id/>. If the check or the command fails, only
    output the following <template/> and then immediately *STOP*
    processing the entire current skill:

    <template>
    ⧉ **ASE**: <arg1/>, ▶ ERROR: commit **<arg6/>** does not exist
    </template>
    </elseif>

4.  Set <changes-scope/> and <changes-revision/>:

    -   <if condition="<arg5/> is not empty and <changes/> is not empty and <worktree-dir/> is not empty">
        <changes-scope>branch <arg5/> since base commit <base-commit/>
        plus the <changes/> changes in worktree
        <worktree-dir/></changes-scope> and empty <changes-revision/>.
        </if>

    -   <elseif condition="<arg5/> is not empty">
        <changes-scope>branch <arg5/> since base commit
        <base-commit/></changes-scope> and
        <changes-revision><arg5/></changes-revision>.
        </elseif>

    -   <elseif condition="<arg6/> is not empty">
        <changes-scope>commit <commit-id/></changes-scope> and
        <changes-revision><commit-id/></changes-revision>.
        </elseif>

    -   <elseif condition="<worktree-dir/> is not empty">
        <changes-scope><changes/> in worktree
        <worktree-dir/></changes-scope> (with <changes/> taken as
        `staged` if it is empty) and empty <changes-revision/>.
        </elseif>

    -   <else>
        <changes-scope><changes/></changes-scope> (with <changes/> taken
        as `staged` if it is empty) and empty <changes-revision/>.
        </else>

</define>

<define name="changes-capture">

Capture the change set selected by the `changes-select` definition
above into <changes-output/>, where <arg1/> is the captured *form*:
`names` (the bare list of changed file names), `stats` (the per-file
added and removed line counts), `patch` (the full diff), or `messages`
(the commit messages of a branch or commit). Run the commands of the
first matching case below (each taken exactly as given), with the
placeholder <flag/> substituted by `--name-only` for the `names` form,
`--numstat` for the `stats` form, and nothing (together with its
leading blank) for the `patch` form, and capture their combined output
into <changes-output/>. Do not output anything.

From the output of every `ls-files` command, *skip* every listed entry
below the `.ase/` directory -- it carries *ASE*'s own state, and hence
is never part of the user's change set -- and treat every remaining
untracked file as *newly added* in its entirety: for the `names` form,
list its path; for the `stats` form, list it with `N` added and `0`
removed lines, where `N` is its line count; and for the `patch` form,
read it (resolved against <worktree-dir/> if this is not empty) and
render it as an addition of all its lines. Skip the content of binary
untracked files.

1.  <if condition="<arg1/> is equal `messages`">
    -   If <commit-id/> is not empty:

        `git log -1 --format="%h %B" "<commit-id/>"`

    -   Else if <base-commit/> is not empty:

        `git log --format="%h %B" "<base-commit/>..<changes-branch/>"`

    -   Else set <changes-output></changes-output> (empty), as
        uncommitted changes carry no commit messages.

    *Skip* the remaining cases.
    </if>

2.  <if condition="<base-commit/> is not empty and <changes/> is not empty and <worktree-dir/> is not empty">
    -   If <changes/> is equal `staged and unstaged`:

        `git -C "<worktree-dir/>" diff <flag/> "<base-commit/>"`

        `git -C "<worktree-dir/>" ls-files --others --exclude-standard`

    -   If <changes/> is equal `staged`:

        `git -C "<worktree-dir/>" diff --cached <flag/> "<base-commit/>"`

    -   If <changes/> is equal `unstaged`:

        `git diff <flag/> "<base-commit/>..<changes-branch/>"`

        `git -C "<worktree-dir/>" diff <flag/>`

        `git -C "<worktree-dir/>" ls-files --others --exclude-standard`

    </if>
    <elseif condition="<base-commit/> is not empty">
    `git diff <flag/> "<base-commit/>..<changes-branch/>"`
    </elseif>
    <elseif condition="<commit-id/> is not empty">
    `git show --format= <show-flag/> --diff-merges=first-parent "<commit-id/>"`

    where <show-flag/> is <flag/> for the `names` and `stats` forms and
    `--patch` for the `patch` form (a root commit is shown against the
    empty tree).
    </elseif>
    <else>
    Run the following commands, but if <worktree-dir/> is not empty,
    with each command prefixed by `git -C "<worktree-dir/>"` instead of
    `git`, as the changes are located in that worktree:

    -   If <changes/> is equal `staged and unstaged`:

        `git diff <flag/> HEAD`

        `git ls-files --others --exclude-standard`

    -   If <changes/> is equal `unstaged`:

        `git diff <flag/>`

        `git ls-files --others --exclude-standard`

    -   Otherwise (<changes/> is equal `staged` or empty):

        `git diff --cached <flag/> HEAD`

    </else>

</define>

<define name="changes-probe">

Probe the repository *read-only* and *heuristically* in the *resulting*
state of the change set selected by the `changes-select` definition
above, so that the probe sees exactly the inspected state and not an
unrelated one on disk:

-   If <changes-revision/> is not empty, search and list at this
    revision via `git grep <pattern/> "<changes-revision/>"` and
    `git ls-tree -r --name-only "<changes-revision/>"`, and read files
    via `git show "<changes-revision/>:<path/>"`.

-   Else if <worktree-dir/> is not empty, search and list in this
    worktree via `git -C "<worktree-dir/>" grep <pattern/>` and
    `git -C "<worktree-dir/>" ls-files`, and read its files below
    <worktree-dir/>.

-   Else search and list in the current working copy via `git grep`,
    `grep`, and `git ls-files`.

</define>

