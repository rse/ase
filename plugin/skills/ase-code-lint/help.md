
##  NAME

`ase-code-lint` - Lint Source Code

##  SYNOPSIS

`ase-code-lint`
    [`--help`|`-h`]
    [`--auto`|`-a`]
    [`--severity`|`-S`=(`LOW`|`MEDIUM`|`HIGH`)]
    *source-reference*

##  DESCRIPTION

The `ase-code-lint` skill lints the source code of the referenced
location for *potential code quality problems* related to a fixed set
of code quality aspects. The investigation is dispatched to a
sub-agent (`ase:ase-code-lint`) so that scanning details do not leak
into the user-visible transcript.

For each detected problem, the skill renders a unified-diff *SOLUTION*
preview and either asks the user to `ACCEPT` or `REJECT` the proposed
correction interactively (or refine it via a free-text hint, which
re-proposes the correction without limit) or - with `--auto` - applies
all corrections automatically.

##  OPTIONS

`--auto`|`-a`:
    Automatically apply every proposed correction without asking the
    user via the interactive dialog.

`--severity`|`-S`=(`LOW`|`MEDIUM`|`HIGH`):
    Set the *severity floor* (default `LOW`): findings below the chosen
    threshold are silently suppressed, ordered `LOW` < `MEDIUM` <
    `HIGH`. The default `LOW` keeps all findings; `ACCEPTED` findings are
    never suppressed.

##  ARGUMENTS

*source-reference*:
    A file, directory, or other reference to the source code to lint.

##  EXAMPLES

Lint a source file interactively:

```text
❯ /ase-code-lint src/server.ts
```

Lint a directory and automatically apply all corrections:

```text
❯ /ase-code-lint --auto src/handlers/
```

Lint a directory, reporting only `MEDIUM` and `HIGH` findings:

```text
❯ /ase-code-lint -S MEDIUM src/handlers/
```

##  SEE ALSO

[`ase-code-analyze`](../ase-code-analyze/help.md), [`ase-code-resolve`](../ase-code-resolve/help.md), [`ase-code-refactor`](../ase-code-refactor/help.md),
[`ase-docs-proofread`](../ase-docs-proofread/help.md).
