
##  NAME

`ase-meta-workflow` - Generate a Workflow Skill

##  SYNOPSIS

`ase-meta-workflow`
    [`--help`|`-h`]
    [`--scope`|`-s` `local`|`user`]
    [`--force`|`-f`]
    *skill-name*
    *workflow-description*

##  DESCRIPTION

The `ase-meta-workflow` skill *generates* a new, regular skill of the
currently used *agent tool* -- written in the style of *ASE* skills --
which orchestrates the workflow given as *workflow-description*.

The *workflow-description* is treated as a combination of *sequential*
actions, *concurrent* actions, *sub-agent* invocations, *skill*
invocations, and arbitrary other action statements. The skill maps them
onto the ASE control constructs: top-level sequential actions become
numbered `<step>` items inside a single `<flow>`, concurrent actions
become a `<parallel>` block, sub-agent invocations become `<agent>`
elements, and skill invocations become `<skill>` elements. Whenever a
`<parallel>` block contains at least one `<agent isolation="worktree">`,
a dedicated consolidation step holding `<agent-consolidation/>` is
appended right after it, so the Git WorkTrees of the concurrent
sub-agents are merged and removed again. Every top-level `<skill>`
invocation is additionally enclosed in its own `<agent>` element --
without `isolation` and with `run_in_background=false` -- so the
`TaskCreate` and `TaskUpdate` tool calls of the called skill cannot
interfere with the task tracking of the generated workflow skill itself.

To keep the emitted `<skill>` invocations correct, the skill consults the
accumulated manual pages of all ASE skills and takes every option and
argument verbatim from them. To keep the emitted flow meaningful, it
consults the *ASE workflow graph* -- a list of `<from> -> <to>`
transitions between ASE skills and logical states such as `START`,
`SKETCH`, `TASK`, `ARTIFACT`, and `END`. That graph *guides* the
derivation but never restricts it: arbitrary non-ASE actions and
unlisted transitions stay allowed.

The generated skill is *independent* of the ASE plugin installation path:
it loads the ASE meta definitions through the `ase util meta` command
instead of plugin-relative includes.

The skill is *portable* across the supported agent tools, because
*Anthropic Claude Code*, *GitHub Copilot*, and *OpenAI Codex* differ in
three relevant ways, each of which is dispatched on the currently used
agent tool:

-   the *target directory*, because every agent tool discovers its skills
    in its own locations,

-   the *frontmatter fields*, because every agent tool accepts its own
    field set and its own `allowed-tools` permission grammar, and

-   the *preamble*, because only *Anthropic Claude Code* expands the
    ``!`...`` construct before the skill content reaches the model. The
    other agent tools receive it verbatim and would silently leave it
    unexpanded, so they instead get an explicit instruction to run
    `ase util meta ...` themselves before anything else.

##  OPTIONS

-   `--scope`|`-s` `local`|`user`:
    Where the generated skill is stored. With `local` (the default),
    it is written into the current project, where it can be committed
    and reviewed alongside the code. With `user`, it is written into the
    personal skill directory, where it is available across all projects.
    The concrete directory depends on the currently used agent tool:
    `.claude/skills/` and `~/.claude/skills/` under *Anthropic Claude
    Code*, `.github/skills/` and `~/.copilot/skills/` under *GitHub
    Copilot*, and `.agents/skills/` and `~/.codex/skills/` under *OpenAI
    Codex*.

-   `--force`|`-f`:
    Overwrite an already existing skill. Without this option, the skill
    refuses with an error as soon as the target `SKILL.md` exists, so
    hand-edited skills are never lost silently.

##  ARGUMENTS

-   *skill-name*:
    Name of the skill to generate, matching `^[a-zA-Z][a-zA-Z0-9_-]*$`.
    It is used as the directory name, as the frontmatter `name`, and as
    the resulting `/`*skill-name* command (respectively the
    `$`*skill-name* mention under *OpenAI Codex*).

-   *workflow-description*:
    Free-text description of the workflow the generated skill should
    perform. Mentioning that actions run "in parallel", that they are
    dispatched "in a sub-agent", or naming concrete `ase-xxx-xxx` skills
    steers the derived structure accordingly.

##  SCENARIOS

-   You want a recurring multi-step procedure automated as its own skill
-   You want several ASE skills orchestrated or chained into one command
-   You want sequential and parallel actions woven into a generated skill
-   You want a new agent tool skill generated in the style of ASE skills

##  EXAMPLES

Generate a project-local skill which analyzes the code and then resolves
every finding concurrently in isolated worktrees:

```text
❯ /ase-meta-workflow optimizer run ase-code-analyze, then for each finding P<n> resolve, implement and delete it in a parallel isolated sub-agent
```

Generate a user-wide skill and overwrite a previous generation:

```text
❯ /ase-meta-workflow --scope user --force release lint the code, update the changelog, then propose a commit message
```

##  SEE ALSO

[`ase-help-intent`](../ase-help-intent/help.md), [`ase-help-skill`](../ase-help-skill/help.md),
[`ase-code-analyze`](../ase-code-analyze/help.md), [`ase-code-resolve`](../ase-code-resolve/help.md), [`ase-task-implement`](../ase-task-implement/help.md).
