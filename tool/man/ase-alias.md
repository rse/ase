# ase-alias(1) -- Manage the Skill Command Aliases

## SYNOPSIS

`ase alias`
\[`-h`|`--help`\]
*command*
\[*options* \[...\]\]
\[*args* \[...\]\]

`ase alias list`
\[`-s`|`--scope` `user`|`project`\]
\[`-k`|`--skill` *skill*\]
\[`-T`|`--tuned`\]

`ase alias set`
\[`-s`|`--scope` `user`|`project`\]
\[`-t`|`--tool` `claude`|`copilot`|`codex`\]
\[`-o`|`--option`|`-d`|`--default`\]
*name*
*value* \[...\]

`ase alias delete`
\[`-s`|`--scope` `user`|`project`\]
\[`-t`|`--tool` `claude`|`copilot`|`codex`\]
\[`-o`|`--option`|`-d`|`--default`\]
*name*
\[*option*\]

`ase alias edit`
\[`-s`|`--scope` `user`|`project`\]
\[`-t`|`--tool` `claude`|`copilot`|`codex`\]

`ase alias sync`
\[`-s`|`--scope` `user`|`project`\]
\[`-t`|`--tool` `claude`|`copilot`|`codex`\]

`ase alias expand`
*command-line* \[...\]

## DESCRIPTION

**ase alias** manages the *skill command aliases* of the *ASE* skills.
All aliases are expanded *deterministically* by *ASE* itself, and never
by the AI. Three kinds of aliases exist:

- A *full alias* is a new command like `/foo-bar`, which stands for an
  arbitrary *ASE* skill command line, like `/ase-code-lint -S HIGH
  src/`. Its target can be another full alias, too, where the chain of
  aliases is resolved (cycle-checked) down to the final *ASE* skill, and
  every alias of the chain appends its options and fixed arguments to
  those of its target. On invocation, the options and fixed arguments of
  the alias precede the arguments given to the alias, i.e., `/foo-bar
  lib/` invokes `/ase-code-lint -S HIGH src/ lib/`. As options are
  recognized only before the first argument, an alias targeting an alias
  with fixed arguments should not add options of its own.

  A full alias is provided as a generated *shim skill* (see **SHIM
  SKILLS**), which just forwards to its target, and which is invoked as
  `/foo-bar` in *Anthropic Claude Code CLI* and *GitHub Copilot CLI*,
  and as `$foo-bar` in *OpenAI Codex CLI*. Its name consists of up to 64
  lower-case letters, digits, and dashes, and must not start with
  `ase-`.

- An *option alias* is a new option like `--custom` of a particular
  skill, which is expanded *in place* into a sequence of real options of
  the skill, like `-x -y -z`, or of further option aliases of the same
  skill (recursively, but cycle-checked). It must not shadow a real
  option of the skill.

- The *option defaults* of a particular skill are options (including
  option aliases) which are applied on *every* invocation of the skill.
  They are merged on the level of the parsed options, i.e., an option
  explicitly given on invocation always wins over its default. A default
  of a value-taking option is always a single value.

Additionally, every option `--`*x* of every *ASE* skill can be negated
by `--no-`*x*, which drops an `--`*x* injected by an option default or
an alias, i.e., resets the option to its built-in default (for a
value-less option: off). Of `--`*x* and `--no-`*x* given together, the
last one wins. An option `--no-`*x* declared explicitly by a skill
(like `--no-cleanup`) keeps its own meaning.

The expansion order is: the full alias (chain) first, then the option
aliases (in the given options and in the option defaults), then the
merge of the option defaults, and finally the negations.

The aliases are defined in the alias files of the *user* and of the
*project* (see **FILES**), where an entry of the project (a full alias,
an option alias of a skill, resp. the option defaults of a skill)
overrides the same entry of the user. The project alias file is intended
to be committed to the repository, so the entire team shares it, while
every team member gets the shim skills for the used agent tool at the
start of the agent tool session.

Without a *command*, the usage information is shown and the command
exits with status `1`.

## OPTIONS

- \[`-h`|`--help`\]:
  Show usage information of `ase alias` resp. of the given *command* and
  exit.

## COMMANDS

- `list` \[*options*\]:
  List the effective full aliases, option aliases, and option defaults.
  See `ase-alias-list`(1).

- `set` \[*options*\] *name* *value* \[...\]:
  Set a full alias, an option alias, or the option defaults of a skill.
  See `ase-alias-set`(1).

- `delete` \[*options*\] *name* \[*option*\]:
  Delete a full alias, an option alias, or the option defaults of a
  skill. See `ase-alias-delete`(1).

- `edit` \[*options*\]:
  Edit the alias file with the text editor. See `ase-alias-edit`(1).

- `sync` \[*options*\]:
  Synchronize the shim skills of the full aliases. See
  `ase-alias-sync`(1).

- `expand` *command-line* \[...\]:
  Expand a skill command line for testing the aliases. See
  `ase-alias-expand`(1).

## SHIM SKILLS

Every full alias *name* is provided as a generated *shim skill*, which
just forwards to the target skill with the options and fixed arguments
of the alias, followed by the arguments given to the shim skill. The
shim skill is written only for the active agent tool, which is the
agent tool of the session, resp. the one given with `--tool` (default:
`$ASE_TOOL`, else `claude`):

- *Anthropic Claude Code CLI*:
  `.claude/skills/`*name*`/SKILL.md`

- *GitHub Copilot CLI* and *OpenAI Codex CLI*:
  `.agents/skills/`*name*`/SKILL.md` and
  `.agents/skills/`*name*`/agents/openai.yaml`

These paths are relative to the project for the full aliases of the
project, resp. to the home directory for the full aliases of the user.

The shim skills of a scope resolve their alias chains within the full
aliases of their scope only. They are marked as `generated by ase alias
sync` and can be invoked explicitly only. A synchronization only writes
and removes (when orphaned) marked shim skills of its scope and its
agent tool, and fails on an unmarked skill of the same name. The shim
skills of the other agent tools stay untouched.

## FILES

- *per-user configuration directory*`/aliases.yaml`:
  The alias file of the user (see `ase`(1) for the location of the
  per-user configuration directory).

- `.ase/aliases.yaml`:
  The alias file of the project.

An alias file carries the sections `alias` (alias names to command
lines), `option` (skill names to option aliases to expansions), and
`default` (skill names to option defaults), as in the example below:

```yaml
alias:
    lint-sec:     /ase-code-lint --include=A05,A06 -S HIGH
    lint-sec-src: /lint-sec src/
option:
    ase-code-lint:
        --sec:    --include=A05,A06 -S HIGH
default:
    ase-task-edit: --approach
```

An invalid alias file is ignored by the option parser of the skills,
with a warning in the log of the service, so the skills keep working
without the aliases until the file is fixed.

## EXIT STATUS

`0` on success, `1` on any error (including a missing *command*).

## EXAMPLES

```sh
# define a full alias, invoked as "/lint-sec"
$ ase alias set lint-sec /ase-code-lint --include=A05,A06 -S HIGH

# check its expansion
$ ase alias expand /lint-sec src/

# list the effective aliases
$ ase alias list
```

## SEE ALSO

`ase`(1), `ase-alias-list`(1), `ase-alias-set`(1), `ase-alias-delete`(1),
`ase-alias-edit`(1), `ase-alias-sync`(1), `ase-alias-expand`(1),
`ase-config`(1), `ase-hook-session-start`(1).

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>
