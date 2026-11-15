# ase-task-request(1) -- Request the Processing of a Task by a Prompt

## SYNOPSIS

`ase task request`
\[`-h`|`--help`\]
*id*
*name*
\[*prompt* ...\]

## DESCRIPTION

**ase task request** requests the processing of the task *id* by the
*prompt* under the request name *name*, for an agent processing the
requests of this name (see `ase-agent`(1)): `edit` for the edit
requests of `ase agent editor` (the same as key `E` of the task board,
see `ase-task-board`(1)), `estimate` for the (re-)estimation requests
of `ase agent estimator --mode request` (see `ase-agent-estimator`(1)),
`research` for the research requests of `ase agent researcher` (see
`ase-agent-researcher`(1)), and any other name for the requests of a
request agent of a definition kind or of `ase agent adhoc` (with
`--type request` and `--request-name` *name*).

The request is attached to the task plan as an attachment of the type
`text/plain; charset=utf-8; kind="`*name*`"`, with the prompt as its
data, its whitespace-collapsed first 60 characters as its description
(resp. *name*` request without prompt` for an empty prompt), and its
creation and modification timestamps. The aggregated state of
the requests of the name is mirrored in the `Tags` frontmatter key of
the task as the tag `ase-agent-`*name*`:pending` (resp.
`ase-agent-editor:pending` for `edit`), as the agents and the task
boards see the task headers only.

While being processed, the request turns into `kind="`*name*`-running"`
(tag value `active`), and on a failure into `kind="`*name*`-failed"` (tag
value `failed`). A new request replaces all failed requests of the name.

The request is refused for a missing task, for a task in a finished
state of the task lifecycle model, for an empty prompt of an `edit`
request, and while a request of the name is being processed, as adding
a request would change the task plan under the agent processing the
running one. The prompt of any other request may be empty, for the
request agents ignoring the prompts of their requests (like `ase agent
estimator --mode request`) or taking them as optional (like `ase agent
researcher`, which then researches the task plan itself), while a
request agent consuming the prompts (by the placeholder `{prompt}` of
its prompt template, or by its hooks `prepare`, `prompt`, or `finish`,
see `ase-agent-adhoc`(1)) turns a request with an empty prompt into a
failed one.

The MCP tool `ase_task_request` provides the same functionality.

## OPTIONS

- \[`-h`|`--help`\]:
  Show usage information and exit.

## ARGUMENTS

- *id*:
  The id of the task.

- *name*:
  The request name: a lower-case word of letters, digits, and dashes,
  starting with a letter, not ending in `-running` or `-failed`, and
  none of the built-in agent kinds `rebooter`, `condenser`, `griller`,
  `implementer`, `qualifier`, `integrator`, `editor`, `estimator`, and
  `researcher` (as
  its tag `ase-agent-`*name* is the one of a built-in agent). The name
  `edit` selects the edit requests of `ase agent editor`, the name
  `estimate` the estimation requests of `ase agent estimator --mode
  request`, and the name `research` the research requests of `ase agent
  researcher --mode request`.

- \[*prompt* ...\]:
  The prompt of the request, with all its words joined by single
  spaces (and leading and trailing whitespace removed), where an
  omitted prompt is an empty one (refused for `edit`).

## EXIT STATUS

`0` on success, `1` if the request name is invalid or the request is
refused.

## EXAMPLES

```sh
# request an edit of the plan of task "json-export"
$ ase task request json-export edit "Also support JSON5 output"

# request a lint report from a request agent of name "lint"
$ ase task request json-export lint focus on error handling

# request a re-estimation of the effort (without a prompt)
$ ase task request json-export estimate

# request a research of a topic for the task
$ ase task request json-export research streaming JSON serialization
```

## SEE ALSO

`ase`(1), `ase-task`(1), `ase-task-board`(1), `ase-agent`(1),
`ase-agent-editor`(1), `ase-agent-researcher`(1), `ase-agent-adhoc`(1).

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>
