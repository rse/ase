
##  NAME

`ase-code-review` - Review and Curate Uncommitted Changes

##  SYNOPSIS

`ase-code-review`
    [`--help`|`-h`]

##  DESCRIPTION

The `ase-code-review` skill *reviews* an accumulated pile of
*uncommitted* source code changes and *curates* them into clean,
thematically-coherent Git commits on the *current* branch. It works
*top-down*: it enumerates every change internally, groups all hunks
into 3-5 *themes*, and presents the grouping as *one compact table*
(theme, file count, added/removed lines) so the user can accept the cut
or ask for a regroup. That table is the *only* dialog before the
per-group walk -- no mode questions are asked up front.

The curation modes are therefore *defaulted silently* and switched from
that one dialog whenever the presented cut calls for it:

-   *HORIZONTAL* (default) -- *theme-near groups*: hunks are grouped by
    topical and architectural proximity for the most coherent review,
    and *no* build is run at all during the review.
-   *VERTICAL* -- *build-verified slices*: each group is cut as a
    build-safe vertical slice, and the project build runs before each
    accept and *gates* it. The build runs on the full working tree,
    as nothing is stashed away.
-   *TESTS-LAST* (default) -- *test* changes are kept out of the code
    groups and staged at the end as one dedicated block, so the code
    groups stay free of test noise; *REVIEW-TESTS* instead lets them
    join the groups of the code they cover.

Each group is then processed one at a time, ordered so that every
group builds only on already-accepted concepts (foundations first, no
forward references): exactly the group's hunks are *staged* into the
plain Git index -- no work branch, no `git stash`, no working-tree
mutation -- so the user's editor (e.g. VSCode Source Control) always
shows the staged group and the remaining unstaged changes side by
side. The skill emits the *group card* as a *boxed* card, so each group
reads as one visually self-contained unit: a short rationale, then a
block per staged file, fenced off by separator lines -- its bare name
with layer and line counts, its full repo-relative directory, a compact
explanation in simple words of *what* the file now does differently and
*why* (one to two sentences for a colleague who did not write the code
-- never an enumeration of methods), a
*Touched* line naming the changed symbols as the index into the editor,
ordered foundations-first -- and per file five *evidence* lines, one
each for `DOMAIN` (including whether the change can actually reach the
promised outcome, edge cases included), `ARCH` (including whether added
signatures are uniform with their siblings in naming, parameter order,
return type, and handling of absence), `CLEAN` (including robustness on
the failure paths, the documented project conventions, and whether every
added method carries a brief, meaningful comment), `PERF`, and `TESTS`,
each worded so that a beginner understands what was checked, what was
found, and what it means. Two further dimensions, `SEC` (what the change
exposes) and `DOC` (which document it leaves stale, judged against what
this project expects a change to carry along), are gathered for every
file as well but reach the card *only*
when they carry a finding, so their mere presence already says that
something has to be acted on. Every evidence line carries one of four honest
statuses: `✓` *shown* (a source line the reviewer read carries the
claim verbatim, cited as `file:line` -- no citation, no `✓`), `✗` *gap*
(the concrete spot, the exposing input, and the cheapest repair), `?`
*unverified* (needs execution the current mode does not perform, or a
source not found), or `–` *n/a*. The evidence is gathered *against* the
change before it is written down -- the strongest reason it could be
wrong is hunted first -- and never against the changed code itself: a
`TESTS` `✓` names `test-file::case` and states why that case would turn
red if the change were reverted, and every boundary partition the
change touches without a covering test is a `✗`. A *Verdict* line sums
the statuses honestly; a single `✗` flips the recommended answer of the
group dialog from *accept* to *change*. Before a group is shown at all,
its `✗` findings are corrected automatically in *one* pass via
`ase-code-edit`, the group is re-staged and its evidence re-gathered, and
the card lists the addressed findings in an *Auto-corrected* line; the
user thus always decides the *second* round, where *change* without a
further wish corrects the `✗` findings that remain. The card closes
with a *Staged*
line reporting the verified file count in the Git index and pointing at
the editor. Every line is pre-wrapped at 96 columns, the box width, so
no line overflows and loses its box prefix. Raw diff text is *not*
dumped, as the staged lines are reviewed in the editor. A single
*accept* then covers the whole group. On accept, the commit message is
crafted via `ase-meta-commit` and the group is committed; *change*
demands a correction and is a regular review outcome -- the correction
wish is implemented right away by delegating to `ase-code-edit` in the
current working copy, with its `--mode` derived from the wish
(`resolve` for a defect, `refactor` for structure at unchanged
behavior, `craft` for something missing), after which the group is
re-staged, re-verified, and presented again for a fresh decision --
after every change the *complete* card is re-emitted, never a delta, so
the current state never has to be scrolled for in the chat;
*skip* unstages the group and defers it; *regroup* recuts the
remaining groups. Nothing here ever discards working-tree content, and
no correction ever commits by itself.

Gathering that evidence is the expensive part of a review -- it reads
whole files, callers, implementers, and tests behind a card of a few
lines -- so it is fanned out, one sub-agent per staged file, and each
dispatch carries an explicit *capability tier* chosen from the judgment
that file actually needs: `standard` for a file-local judgement, `deep`
once it has to leave the file (a signature with callers, a
security-relevant path, a contract checked against the specification),
and `max` only for a core contract the whole group builds on. Without an
explicit tier a sub-agent would inherit the model of the review itself
and judge a renamed constant as expensively as a changed interface. The
tiers are named by capability, never by a vendor model name, so the
skill stays valid under every agent tool; under *Anthropic Claude Code*
the tier becomes the documented identifier of the `model` attribute,
while under *GitHub Copilot* and *OpenAI Codex* -- neither of which
documents valid identifiers for its sub-agent configuration -- the tier
is stated in the prompt instead. Every sub-agent returns exactly its
evidence records and nothing else; the reviewing skill translates them
into the user's language when it writes the card.

The skill *complements* its neighbours rather than duplicating them:
`ase-meta-diff` narrates *what changed*, `ase-meta-review` renders a
reviewer's *judgement*, `ase-code-lint` and `ase-code-analyze` flag
*quality* and *logic/semantics* problems, and `ase-meta-commit` crafts
the *commit message* -- whereas `ase-code-review` *curates and
commits*. Its evidence lines judge the *change in front of it*, never
the code base at large: a general quality audit stays with the
analyzers. It writes no file of its own -- it stages and commits what
the user accepted, and nothing beyond it.

##  ARGUMENTS

The `ase-code-review` skill takes no arguments: its scope is always
the full set of uncommitted changes -- working tree, index, and
untracked files -- as only those can be staged and committed group by
group on the current branch.

##  EXAMPLES

Review and curate all current uncommitted changes:

```text
❯ /ase-code-review
```

##  SEE ALSO

`ase-meta-commit`, `ase-meta-diff`, `ase-meta-review`, `ase-code-lint`,
`ase-code-analyze`, `ase-code-edit`, `ase-code-refactor`,
`ase-code-resolve`, `ase-meta-changelog`.
