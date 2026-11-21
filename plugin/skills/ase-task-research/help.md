
##  NAME

`ase-task-research` - Research a Topic for a Task Plan

##  SYNOPSIS

`ase-task-research`
    [`--help`|`-h`]
    [`--services`|`-s` `all`|`perplexity`|`brave`|`exa`|`websearch`|`other`[,...]]
    [`--refine`|`-r`]
    [`--dry-run`|`-d`]
    [*id* | *id*`:` [*topic*] | *topic*]

##  DESCRIPTION

The `ase-task-research` skill *researches* a topic in depth for a task
plan. It combines a *Web research* -- several focused queries, sent in
parallel to the Internet/Web search services of `ase-meta-search` --
with a *grounding* in the *source artifacts* of the project (its
specification, source code, documentation, and infrastructure).

The result is a *research report* with the parts *Findings* (the Web
facts, each with its source URL), *Project Grounding* (the relevant
project facts, each with its project file), *Assessment* (how the
findings apply to the project, including its gaps and conflicts), and
*Recommendations* (the concrete consequences for the plan), bounded to
about 300 lines and at most 10 findings.

The report is *appended* to the single `research` attachment of the
task (of type `text/markdown; charset=utf-8; kind="research"`), so the
reports of earlier researches are kept. With `--refine`, the
recommendations are additionally applied to the plan itself, preserving
its structure. Without a *topic*, the task plan itself (its title and
domain items) is researched.

The search queries carry only a self-contained summary of the topic and
never any project internals like file paths or identifiers, as they are
sent to foreign search services. The shown report follows the
configured `project.boxing`, while the attachment always carries the
full report.

The `ase agent researcher` command researches the tasks automatically
and always refines the plan by the recommendations: in its mode
`phase`, it researches and grounds the plans of the `DRAFTED` tasks
explicitly assigned to it, while in its mode `request`, it researches
the topics of the requests in any unfinished status, via `ase task
request <id> research [<topic>]` or key `R` of the task boards.

##  OPTIONS

-   `--services`|`-s` `all`|`perplexity`|`brave`|`exa`|`websearch`|`other`[,...]:
    The comma-separated search services to query (default: `all`),
    where `other` is any Web search tool of another MCP server, as
    described for `ase-meta-search`.

-   `--refine`|`-r`:
    Additionally refine the task plan by the recommendations of the
    research report.

-   `--dry-run`|`-d`:
    Research and show the report only, but do not change the task.

##  ARGUMENTS

-   *id*:
    The unique identifier of the task to research for. If omitted, the
    *current* task is used. A single word without a trailing `:` is
    always taken as a task identifier.

-   *topic*:
    The topic to research. If omitted, the task plan itself is
    researched.

##  SCENARIOS

-   You want to know the established practices and pitfalls of a topic before planning a task
-   You want to check a task plan against the state of the art
-   You want to keep the research findings of a task together with its plan

##  EXAMPLES

Research the current task plan itself:

```text
❯ /ase-task-research
```

Research a topic for a specific task and refine its plan:

```text
❯ /ase-task-research --refine export-json: streaming JSON serialization of large data sets
```

Research a topic with Perplexity only, without changing the task:

```text
❯ /ase-task-research --services perplexity --dry-run rate limiting of REST APIs
```

##  SEE ALSO

[`ase-meta-search`](../ase-meta-search/help.md), [`ase-task-edit`](../ase-task-edit/help.md), [`ase-task-grill`](../ase-task-grill/help.md),
[`ase-task-view`](../ase-task-view/help.md).
