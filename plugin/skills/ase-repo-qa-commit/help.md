
##  NAME

`ase-repo-qa-commit` - Git Commit with Comprehension Quiz

##  SYNOPSIS

`ase-repo-qa-commit`
    [`--help`|`-h`]
    [`--max`|`-n` *N*]

##  DESCRIPTION

The `ase-repo-qa-commit` skill *quizzes* the user on the staged Git
changes before *committing* them. It first *stages* all files changed
by the agent in the current session, in addition to the already staged
changes, and lists them. It then asks up to *N*
multiple-choice questions (see `--max`, default five), each with four
answers of which exactly one is correct. The questions focus on the
crucial elements of the change and its *architecture*, and at least
one question asks about a *deeply technical* detail. Smaller changes
yield fewer questions.

After the last question, the skill shows the *score*, the correct
answers, and a rationale for each wrong answer. It then commits the
staged changes, prefixing the commit message with a traffic light and
the score, as in `🟢 [5/5] FEATURE: <summary>`. The light is green for
a score of at least 80%, yellow for at least 40%, and red below. A red
commit message additionally ends with `-- NEEDS REVIEW`, signaling that
the change needs a review. Cancelling the quiz commits nothing, and the
changes, including the staged session files, remain staged.

##  OPTIONS

-   `--max`|`-n` *N*:
    The *maximum* number of questions, between *1* and *5*. Defaults
    to *5*.

##  SCENARIOS

-   You want to prove that you understand a change before committing it
-   You want an agent-written change checked against your understanding
-   You want commits of poorly understood changes flagged for review

##  EXAMPLES

Commit the currently staged changes after a quiz of up to five questions:

```text
❯ /ase-repo-qa-commit
```

Commit the currently staged changes after a short quiz of up to two questions:

```text
❯ /ase-repo-qa-commit -n 2
```

##  SEE ALSO

[`ase-repo-commit`](../ase-repo-commit/help.md), [`ase-repo-diff`](../ase-repo-diff/help.md), [`ase-repo-review`](../ase-repo-review/help.md),
[`ase-repo-stage`](../ase-repo-stage/help.md), [`ase-repo-changelog`](../ase-repo-changelog/help.md), [`ase-code-explain`](../ase-code-explain/help.md).
