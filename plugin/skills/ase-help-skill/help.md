
##  NAME

`ase-help-skill` - Show the Manual Page of an ASE Skill

##  SYNOPSIS

`ase-help-skill`
    [`--help`|`-h`]
    [*skill-name*]

##  DESCRIPTION

The `ase-help-skill` skill renders the *manual page* (`help.md`) of the
ASE skill addressed by *skill-name*. The page is emitted verbatim,
framed between a `MANUAL PAGE` header and footer rule.

The *skill-name* is resolved against a *catalog* of all ASE skills --
one `name: purpose` entry per skill, grouped by skill category.
Before resolving, any leading `/` and `ase:` prefix is stripped, so
`ase-code-lint`, `/ase-code-lint`, and `ase:ase-code-lint` are
equivalent. Resolution then proceeds in three tiers, each tried only if
all preceding ones found nothing: an *exact* match on the full skill
name wins outright, otherwise *every* skill name containing
*skill-name* as a substring becomes a candidate, and otherwise
*skill-name* is *fuzzily* matched against the skill *purposes* -- so
a topical phrase such as `root cause` still finds `ase-meta-why` --
with the candidates ordered by descending match quality.

A *skill-name* matching no skill in any tier is reported as an error. A
*skill-name* matching more than one skill opens an interactive dialog
listing the candidates with their purposes; as the dialog renders at
most nine answer lines, a broader abbreviation such as `task` shows the
first nine candidates and states how many exist in total.

If *skill-name* is omitted, the whole catalog is rendered as a
browsable list, grouped by skill category, instead.

The skill exposes *no* option flags beyond `--help`/`-h`.

##  ARGUMENTS

-   *skill-name*:
    The full name of the ASE skill, any abbreviation of it, or a
    description of its purpose. If omitted, the entire skill catalog is
    listed.

##  SCENARIOS

-   You want the manual page of an ASE skill
-   You want to know what a certain `ase-xxx-xxx` skill does
-   You want a skill found by an abbreviation or a purpose description
-   You want to browse the whole catalog of ASE skills

##  EXAMPLES

Show the manual page of `ase-code-lint` via an unambiguous abbreviation:

```text
❯ /ase-help-skill code-lint
```

Show the same manual page via its full, plugin-qualified name:

```text
❯ /ase-help-skill ase:ase-code-lint
```

Pick a manual page from the candidates of an ambiguous abbreviation:

```text
❯ /ase-help-skill analyze
```

Find a manual page by the purpose of the skill instead of its name:

```text
❯ /ase-help-skill root cause
```

List the entire skill catalog:

```text
❯ /ase-help-skill
```

##  SEE ALSO

[`ase-help-intent`](../ase-help-intent/help.md), [`ase-meta-proximity`](../ase-meta-proximity/help.md).
