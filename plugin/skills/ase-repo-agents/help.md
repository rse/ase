
##  NAME

`ase-repo-agents` - Update Agent Guidance

##  SYNOPSIS

`ase-repo-agents`
    [`--help`|`-h`]
    [`--file`|`-f` *path*]
    [`--section`|`-s` (`all`|`ABOUT`|`LAYOUT`|`BUILD`|`STYLE`)...]

##  DESCRIPTION

The `ase-repo-agents` skill helps to *generate* a missing or *update*
an existing `AGENTS.md` file, the agent guidance file of a repository,
which is read by *OpenAI Codex CLI* and *GitHub Copilot CLI*, and by
*Anthropic Claude Code CLI* through a `CLAUDE.md` importing it with a
line `@AGENTS.md`. The skill itself never creates or edits this
`CLAUDE.md`, but for a newly created file without such an import, it
gives a hint for adding the import line.

The skill manages the following sections of the file, while all other
sections (like `Setup` or `CLI Commands`) are hand-written and kept
verbatim:

-   `ABOUT`: the section `About`: what the project is, its deliverables,
    and its languages, runtimes, and frameworks.

-   `LAYOUT`: the section `Repository Layout`: the roles of the notable
    directories, modules, and files.

-   `BUILD`: the section `Build System`: the exact commands for installing,
    building, linting, type-checking, and testing, plus an explicit
    statement if no test target exists.

-   `STYLE`: the section `Code Style`: the coding conventions which no
    linter or formatter enforces, plus the enforcing configurations.

An existing section is also recognized under a usual alternative
heading, like `About Project`, `Project Structure`, `Commands`, or
`Conventions`.

By default, the skill operates on the nearest `AGENTS.md` file in the
current directory or one of its parent directories, resp. creates a new
one in the root of the repository. With `--file`, it operates on an
explicitly given file instead, e.g. on the nested `AGENTS.md` of a
sub-package in a monorepo, which then covers just this sub-package.

Every stated command, build target, and path is verified against the
repository (its manifests, build configurations, and its tracked resp.
untracked, but not ignored files), and none is invented. This
verification is read-only: the commands of the repository are never
executed, and nothing is installed, built, or written into the working
tree.

An existing file is updated *surgically*: only drifted facts, like a
renamed build target, a removed path, or a new module, are corrected
resp. added, while the structure, the level of detail, and the layout
style of the file stay unchanged. Hence, a re-run without any repository
change leaves the file untouched. New facts stem only from the files
changed since the last commit of the file, including the uncommitted
and untracked ones, as long-standing omissions count as a deliberate
level of detail, so a not yet committed file gets no new facts at all.
Only a missing managed section is composed in full.
A new file gets the managed sections in a concise form of about 150
lines at most.

The updated or created `AGENTS.md` is left *unstaged*, as it may carry
further unrelated changes.

##  OPTIONS

-   `--file`|`-f` *path*:
    Operate on the given agent guidance file *path* (relative to the
    current directory), instead of the nearest `AGENTS.md` in the
    current directory or one of its parent directories, e.g. on the
    nested `AGENTS.md` of a sub-package like `tool/` in a monorepo. The
    file is created if it does not exist yet, but its directory has to
    exist, and the file has to lie inside the repository.

-   `--section`|`-s` (`all`|`ABOUT`|`LAYOUT`|`BUILD`|`STYLE`)...:
    Restrict the generation resp. update to the given comma-separated
    managed sections, instead of all of them (`all`, the default), e.g.
    to just bring the `Build System` section up to date with `BUILD`.
    The tokens are matched case-sensitively, and an unknown, empty, or
    duplicate token, or `all` combined with another token, aborts the
    skill. All other sections stay untouched.

##  SCENARIOS

-   You want an `AGENTS.md` for your repository generated from scratch
-   You want your `AGENTS.md` brought up to date after a feature change
-   You want the documented build commands checked against the build configuration
-   You want the repository layout of your `AGENTS.md` aligned with renamed or new modules
-   You want the nested `AGENTS.md` of a particular sub-package of a monorepo updated

##  EXAMPLES

Update the nearest `AGENTS.md` (or create it in the repository root):

```text
❯ /ase-repo-agents
```

Update just the build commands and the code style:

```text
❯ /ase-repo-agents --section BUILD,STYLE
```

Create or update the nested `AGENTS.md` of a sub-package:

```text
❯ /ase-repo-agents --file tool/AGENTS.md
```

##  SEE ALSO

[`ase-repo-changelog`](../ase-repo-changelog/help.md),
[`ase-repo-stage`](../ase-repo-stage/help.md),
[`ase-sync-reconcile`](../ase-sync-reconcile/help.md).
