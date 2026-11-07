
##  NAME

`ase-meta-alias` - Skill Command Alias Management

##  SYNOPSIS

`ase-meta-alias`
    [`--help`|`-h`]
    [`--scope`|`-s` `auto`|`user`|`project`]
    *operation*
    [*args*]

##  DESCRIPTION

The `ase-meta-alias` skill lists, sets, deletes, and expands the *skill
command aliases* of ASE from inside the assistant session. It mirrors the
non-interactive subcommands of the `ase alias` CLI.

There are three kinds of aliases, all expanded deterministically by ASE
itself, and never by the AI:

-   A *full alias* is a new command like `/foo-bar`, which stands for an
    arbitrary ASE skill command line, like `/ase-code-lint -S HIGH src/`,
    or for another full alias. On invocation, the options and arguments of
    the alias precede the arguments given to the alias. A full alias is
    provided as a small generated skill, which just forwards to its target,
    and which is invoked as `/foo-bar` in *Anthropic Claude Code CLI* and
    *GitHub Copilot CLI*, and as `$foo-bar` in *OpenAI Codex CLI*.

-   An *option alias* is a new option like `--custom` of a particular
    skill, which is expanded in place into a sequence of real options of
    the skill, like `-x -y -z`, or of other option aliases of the skill.

-   The *option defaults* of a particular skill are options which are
    implicitly applied on every invocation of the skill. An option given
    explicitly on invocation always wins over its default, and every option
    `--x` can be dropped again by its negation `--no-x`, which resets the
    option to its built-in default.

The aliases are defined *per user* and *per project*, where an entry of
the project overrides the same entry of the user. The project aliases
(and their generated skills) are intended to be committed to the
repository, so the entire team shares them.

The following *operations* exist:

-   `list` [`--skill` *skill*] [`--tuned`]: List the effective aliases
    as a table of kind, name, option, value, and supplying scope,
    optionally of a single *skill* only, or list just the skills with
    option aliases or option defaults.

-   `set` *name* *command-line*: Set the full alias *name*.

-   `set` `--option` *skill* *option* *expansion*: Set the option alias
    *option* of *skill*.

-   `set` `--default` *skill* *options*: Set the option defaults of
    *skill*.

-   `delete` *name*, `delete` `--option` *skill* *option*, resp. `delete`
    `--default` *skill*: Delete a full alias, an option alias, resp. the
    option defaults of a skill.

-   `expand` *command-line*: Show how a skill command line is expanded
    through the full aliases, option aliases, and option defaults, and
    which options and arguments the skill finally receives.

The `edit` and `sync` subcommands of the `ase alias` CLI are deliberately
*not* mirrored, as `edit` is bound to the interactive `$EDITOR`, and
`sync` happens automatically. Both remain available on the command line.

##  OPTIONS

-   `--scope`|`-s` `auto`|`user`|`project`:
    The scope of the aliases to operate on. With `auto` (the default),
    `set` and `delete` operate on the aliases of the *project* inside a
    project (else of the *user*), and `list` shows the aliases of both
    scopes.

##  ARGUMENTS

-   *operation*:
    The operation to perform; one of `list`, `set`, `delete`, or
    `expand`.

-   *args*:
    The operands of the operation, as described above.

##  SCENARIOS

-   You want a short command for a skill command line you use often
-   You want a short option for a combination of options of a skill
-   You want a skill to always run with certain options
-   You want to see or test how a command line expands through the aliases

##  EXAMPLES

List all effective aliases:

```text
❯ /ase-meta-alias list
```

Define a full alias for a security-focused linting:

```text
❯ /ase-meta-alias set lint-sec /ase-code-lint --include=A05,A06 -S HIGH
```

Define an option alias of the linting skill:

```text
❯ /ase-meta-alias set --option ase-code-lint --sec --include=A05,A06 -S HIGH
```

Always grill a task plan after editing it, for yourself only:

```text
❯ /ase-meta-alias --scope user set --default ase-task-edit --next GRILL
```

Check how a command line expands:

```text
❯ /ase-meta-alias expand /lint-sec src/
```

Remove the option defaults again:

```text
❯ /ase-meta-alias --scope user delete --default ase-task-edit
```

##  SEE ALSO

[`ase-meta-config`](../ase-meta-config/help.md).
