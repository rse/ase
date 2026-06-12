
##  NAME

`ase-meta-review` - Review Staged Changes

##  SYNOPSIS

`ase-meta-review`
    [`--help`|`-h`]
    [`--severity`|`-S`=(`LOW`|`MEDIUM`|`HIGH`)]

##  DESCRIPTION

The `ase-meta-review` skill performs a *holistic*,
*human-reviewer-style* critique of the *staged* Git changes and emits a
single *approve* / *reject* **verdict** backed by *prioritized*,
*severity-tagged*, *line-cited* **findings**. Rather than scanning the
code mechanically, it first *reconstructs the change's own intent* and
then judges the diff *as a whole* against that intent - the way an
experienced reviewer would on a pull request.

The critique spans a fixed set of reviewer *dimensions*: **intent**
(does the diff do what it set out to, without scope creep or stray
residue), **correctness** (latent bugs, edge cases, broken
control/data flow), **design** (fit with the surrounding architecture,
naming, abstraction level), **clarity** (readability and
self-documentation for a future reader), **robustness** (error handling,
resource and concurrency safety), **security** and **performance** (risks
introduced by the change), **convention** (conformance to the
project's documented conventions - code style and the plan/spec/arch
formats described in `AGENTS.md` and the `ase-format-*` meta documents),
**testing** (inadequate coverage for the change - new or fixed behavior
left untested, adjacent tests not updated, or existing tests silently
broken, disabled, or weakened), and **documentation** (user- or
developer-facing docs - `README`, `CHANGELOG`, help text, or AI
guidance/meta documents - left stale by the change).

Each finding carries a *severity* - **HIGH**, **MEDIUM**, **LOW**, or
**ACCEPTED** (a concern that is contractually addressed or accepted as a
documented priority conflict) - and is *evidence-grounded*: it cites the
exact `file:line` location it stems from. The overall verdict is
**REJECT - DEMANDS CHANGES** when any *HIGH* finding remains, and
**APPROVE** otherwise. The work is performed by a dedicated `ase-meta-review`
sub-agent so that the silent reading and read-only repository probing
never leak into the transcript; only the structured verdict and findings
are rendered.

The skill *complements* rather than duplicates its neighbours:
`ase-code-lint` flags *mechanical* code-quality issues, `ase-code-analyze`
inspects *logic and semantics*, `ase-meta-diff` narrates *what changed*
(with optional coherence, risk, and blast-radius reports), and
`ase-meta-diaboli` *adversarially challenges a thesis* - whereas
`ase-meta-review` renders a *reviewer's judgement* on a concrete diff
before it is committed.

##  OPTIONS

`--severity`|`-S`=(`LOW`|`MEDIUM`|`HIGH`):
    Set the *severity floor* (default `LOW`): findings below the chosen
    threshold are silently suppressed, ordered `LOW` < `MEDIUM` <
    `HIGH`. The default `LOW` keeps all findings; `ACCEPTED` findings are
    never suppressed. The floor only affects the rendered findings table,
    not the overall *verdict*, which is always derived from all findings
    before the floor is applied.

##  ARGUMENTS

The `ase-meta-review` skill takes no positional arguments; it always
reviews the currently *staged* Git changes.

##  EXAMPLES

Review the currently staged changes before committing:

```text
❯ /ase-meta-review
```

Review the staged changes, reporting only `MEDIUM` and `HIGH` findings:

```text
❯ /ase-meta-review -S MEDIUM
```

##  SEE ALSO

[`ase-meta-diff`](../ase-meta-diff/help.md), [`ase-meta-commit`](../ase-meta-commit/help.md), [`ase-code-lint`](../ase-code-lint/help.md), [`ase-code-analyze`](../ase-code-analyze/help.md),
[`ase-meta-diaboli`](../ase-meta-diaboli/help.md).
