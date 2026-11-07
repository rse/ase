# ase-statusline(1) -- Render the Statusline of the Agent Tool

## SYNOPSIS

`ase statusline`
\[`-h`|`--help`\]
\[`-t`|`--tool` *tool*\]
\[`-w`|`--width` *n*\]
\[`-m`|`--margin` *n*\]
\[`-p`|`--padding` *n*\]
\[`--no-icons`\]
\[`--no-labels`\]
\[`--month-cost-ttl` *n*\]
\[*line* \[...\]\]

## DESCRIPTION

**ase statusline** renders the statusline of *Anthropic Claude Code
CLI* or *GitHub Copilot CLI* from the JSON payload the agent tool
passes on standard input, and writes the ANSI-colored result on
standard output. It is intended to be configured as the `statusLine`
command in the `settings.json` of *Anthropic Claude Code CLI* resp. as
the `statusLine.command` entry of `~/.copilot/settings.json` of
*GitHub Copilot CLI* (usually via `ase setup statusline activate`, see
`ase-setup-statusline`(1)), and not to be invoked directly by end users.

The output is composed from one or more template *line* arguments,
each rendered as one output line (or more, see **WRAPPING**). A *line*
may contain literal characters, `%`-prefixed placeholders (see
**PLACEHOLDERS**), and color markup (see **COLORS**). Without any
*line*, the single default line `%m %e %t` is rendered.

Each placeholder is rendered as an optional icon glyph, an optional
label followed by `: `, and the value in bold, e.g., `⚙ model:
`**Opus**. A `%` followed by any other character is emitted literally.

Under `--tool copilot`, the top-level `cwd` field of the payload is
mapped onto `workspace.current_dir`, and, as *GitHub Copilot CLI*
passes no `effort` field but embeds the reasoning effort as a ` · `
separated segment of `model.display_name` (e.g., `gpt-5.4 (2x) · high ·
1M context`), the segment matching a known effort level (`low`,
`medium`, `high`, `xhigh`, or `max`) is split off again, so `%m`
renders the plain model and `%e` the effort.

When run inside a *tmux*(1) pane (i.e., with `TMUX` and `TMUX_PANE`
set), the resolved task id is additionally published as the per-pane
user option `@ase_task_id` of the pane, so external tools can pick it
up via `#{@ase_task_id}`.

## OPTIONS

- \[`-h`|`--help`\]:
  Show usage information and exit.

- \[`-t`|`--tool` *tool*\]:
  Select the agent tool producing the payload: `claude` (*Anthropic
  Claude Code CLI*) or `copilot` (*GitHub Copilot CLI*) (default:
  the value of `ASE_TOOL`, else `claude`). The value `codex` is
  rejected with an error, as *OpenAI Codex CLI* has no scriptable
  custom statusline mechanism, and any other value is invalid.

- \[`-w`|`--width` *n*\]:
  Force the terminal width to *n* characters, a non-negative integer
  (default: `0`, i.e., auto-detect the width of the controlling
  terminal via `tput cols` on `/dev/tty`, as standard output is a pipe
  under the agent tool).

- \[`-m`|`--margin` *n*\]:
  Reduce the maximum used terminal width by *n* characters on each
  side, a non-negative integer (default: `2`). The margin only shrinks
  the width budget and emits no characters.

- \[`-p`|`--padding` *n*\]:
  Pad each non-empty rendered line with *n* spaces on the left and
  right side, a non-negative integer (default: `0`). In contrast to the
  margin, the padding spaces are actually emitted (and hence also
  shrink the width budget). Empty lines stay unpadded. Under `--tool
  copilot`, a padded output is prefixed with a zero-width space, so the
  first line keeps its indentation.

- \[`--no-icons`\]:
  Disable the leading icon glyph (e.g., `※`, `⚑`, or `⚙`) of each
  placeholder rendering.

- \[`--no-labels`\]:
  Disable the textual label (e.g., `user:`, `project:`, or `model:`)
  in front of the bold value of each placeholder rendering.

- \[`--month-cost-ttl` *n*\]:
  Cache the `%Y` current-month total cost for *n* seconds, a
  non-negative integer, before a non-blocking background refresh is
  triggered (default: `300`).

## ARGUMENTS

- \[*line* \[...\]\]:
  The template lines (default: `%m %e %t`). Each argument yields its
  own output line. Quote each line for the shell.

## PLACEHOLDERS

The following placeholders are recognized. Unless stated otherwise, a
placeholder is always rendered. A placeholder marked as *suppressed* is
silently omitted (including its icon and label) if its source is
missing, e.g., in older agent tool versions or in synthetic payloads.

Scope:

- `%u`:
  The user (`USER`, else `LOGNAME`, else `unknown`), with icon `※`.

- `%p`:
  The project id, derived from the basename of the current directory
  of the workspace (`workspace.current_dir`), with icon `⚑`.

- `%T`:
  The active task id of the session (from its internal session state),
  else `ASE_TASK_ID`, else `default`, with icon `◉`.

- `%s`:
  The session id (`session_id`, else `unknown`), with icon `⏻`.

Model:

- `%m`:
  The model (`model.display_name`), with icon `⚙`.

- `%e`:
  The reasoning effort (`effort.level`, else the effort segment of the
  *GitHub Copilot CLI* model, else `unknown`), with icon `⚒`.

- `%t`:
  Whether extended thinking is enabled (`thinking.enabled`), as `yes`
  or `no`, with icon `⚛`.

Output:

- `%O`:
  The output style (`output_style.name`), with icon `≡`, *suppressed*.

- `%P`:
  The persona style (`agent.persona`), with icon `☯`, *suppressed* if
  empty.

- `%h`:
  The guidance level (`agent.guidance`), with icon `▶`, *suppressed* if
  empty.

- `%B`:
  The project boxing transparency (`project.boxing`), with icon `▢`,
  *suppressed* if empty.

- `%L`:
  The project task lifecycle model (`project.task.lifecycle`), with
  icon `⟳`, *suppressed* if empty.

  The values of `%P`, `%h`, `%B`, and `%L` are resolved from the *ASE*
  configuration cascade of the session (`session:`*id*), falling back
  to the environment variables `ASE_PERSONA_STYLE`,
  `ASE_GUIDANCE_LEVEL`, `ASE_PROJECT_BOXING`, and
  `ASE_PROJECT_TASK_LIFECYCLE`.

Context:

- `%c`:
  The context usage (`context_window.used_percentage`) as a progress
  bar of 20 cells (`█` filled, `░` empty) plus the percentage, with
  icon `◔`.

- `%C`:
  The current and the maximum context tokens, e.g., `334.0k/1.0M`, with
  icon `◆`. The current tokens are taken from
  `context_window.current_context_tokens`, else
  `last_call_input_tokens`, else `total_input_tokens`; the maximum from
  `context_window.displayed_context_limit`, else
  `context_window_size`, else derived from the current tokens and the
  used percentage. *Suppressed* without a maximum.

Rate limits:

- `%S`:
  The used percentage of the 5-hour rate-limit window, with icon `⏲`,
  or `-` if unknown.

- `%D`:
  The time until the reset of the 5-hour window, e.g., `4hr 27m`, with
  icon `⏱`, or `-` if unknown.

- `%W`:
  The used percentage of the 7-day rate-limit window, with icon `⏲`,
  or `-` if unknown.

- `%Q`:
  The time until the reset of the 7-day window, e.g., `6d 12hr 7m`,
  with icon `⏱`, or `-` if unknown.

  The windows are taken from `rate_limits.five_hour` and
  `rate_limits.seven_day` of the payload. If the payload carries none,
  the model matches `gpt-*`, and a template references one of these
  placeholders, the windows are instead fetched from the *ChatGPT*
  backend with the credential stored by *OpenAI Codex CLI*
  (`$CODEX_HOME/auth.json`, default `~/.codex/auth.json`), with a
  timeout of 3 seconds, and cached (also on failure) for 60 seconds.

Costs:

- `%H`:
  The wall-clock duration of the session (`cost.total_duration_ms`) as
  hours and minutes, e.g., `92hr 40m`, with icon `⏱`, *suppressed* if
  zero or missing.

- `%X`:
  The session costs in USD (`cost.total_cost_usd`), e.g., `$54.44`,
  with icon `$`, *suppressed*.

- `%Y`:
  The cumulative costs in USD of *all* sessions of *all* supported
  agent tools within the current calendar month, e.g., `$1102.11`,
  *suppressed* if no session logs exist (unlike `%X`, which only
  reflects the current session). The month boundary is a *UTC* one,
  matching the day on which the model vendors bill and reset their
  usage windows. The figure is computed locally from the session logs
  of *Anthropic Claude Code CLI*
  (`~/.claude/projects/**/*.jsonl`, honoring `CLAUDE_CONFIG_DIR`),
  *OpenAI Codex CLI*
  (`~/.codex/{sessions,archived_sessions}/**/rollout-*.jsonl`, honoring
  `CODEX_HOME`), and *GitHub Copilot CLI*
  (`~/.copilot/session-state/**/*.jsonl`, honoring
  `COPILOT_CONFIG_DIR`). Per logged model call, the token counts
  (uncached input, output including reasoning, cache-read, and
  5-minute / 1-hour cache-write) are multiplied by the per-model prices
  of the *LiteLLM* price database. The background recomputation
  downloads these prices whenever the cached ones are absent or older
  than a day, and keeps using the cached ones while offline; until a
  first download succeeds, `%Y` stays hidden, and changed prices
  discard the cached figure. A call logged more than once is billed
  only once, and a model absent from the prices contributes nothing. To keep rendering fast, the result is cached and
  recomputed at most once per `--month-cost-ttl` window by a detached
  background process, so a rendering never blocks on the log scan.

Version control:

- `%a`:
  The lines added in this session (`cost.total_lines_added`, else
  `0`), with icon `⊕`.

- `%r`:
  The lines removed in this session (`cost.total_lines_removed`, else
  `0`), with icon `⊖`.

- `%b`:
  The Git branch of the workspace directory, or `no git` outside of a
  Git working tree, with icon `⎇`.

- `%g`:
  The changed lines of the Git working tree against `HEAD`, e.g.,
  `+42/-7`, with icon `±`, *suppressed* outside of a Git working tree.

- `%G`:
  The number of untracked files of the Git working tree, with icon
  `⁈`, *suppressed* outside of a Git working tree.

- `%d`:
  The full path of the workspace directory, with icon `▶`,
  *suppressed*.

Resources and versions:

- `%M`:
  The used and total memory of the host, e.g., `33.2G/64.0G`, with icon
  `⛁`.

- `%V`:
  The agent tool and *ASE* versions (`version` of the payload), e.g.,
  `claude/2.1.90 ase/1.0.7`, with icon `⎈`.

## COLORS

A *line* may contain the markup `<`*color*`>`...`</`*color*`>` to
colorize its text (including rendered placeholders), where *color* is
one of `black`, `red`, `green`, `yellow`, `blue`, `magenta`, `cyan`,
`white`, or `default`. A closing tag (of any recognized color name)
ends the colored span, returning to the default foreground color.
Spans do not nest: an opening tag inside a span is removed, but
ignored. A span still open at the end of a line ends there. A tag with
an unrecognized color name is kept literally in the output.

## WRAPPING

Each rendered line is automatically wrapped before the next chunk (a
literal character or a whole placeholder rendering) which would exceed
the width budget, where the budget is the terminal width (see
`--width`) reduced by `2 *` (*margin* `+` *padding*) characters. Without
a known terminal width, no wrapping happens.

## INPUT

The input is the standard statusline JSON payload of the agent tool,
of which the fields `workspace.current_dir` (resp. `cwd` for *GitHub
Copilot CLI*), `session_id`, `version`, `model.display_name`,
`effort.level`, `thinking.enabled`, `output_style.name`,
`context_window.*`, `rate_limits.five_hour` and
`rate_limits.seven_day` (each with `used_percentage` and `resets_at`),
and `cost.total_cost_usd`, `cost.total_duration_ms`,
`cost.total_lines_added`, and `cost.total_lines_removed` are used.

Invalid JSON is an error.

## ENVIRONMENT

- `ASE_TOOL`:
  The default of `--tool`.

- `ASE_TASK_ID`, `ASE_PERSONA_STYLE`, `ASE_GUIDANCE_LEVEL`,
  `ASE_PROJECT_BOXING`, `ASE_PROJECT_TASK_LIFECYCLE`:
  The fallbacks of `%T`, `%P`, `%h`, `%B`, and `%L`.

- `USER`, `LOGNAME`:
  The user of `%u`.

- `CODEX_HOME`:
  The configuration directory of *OpenAI Codex CLI* (default:
  `~/.codex`), holding the credential `auth.json` for the rate limits
  of the `gpt-*` models.

- `TMUX`, `TMUX_PANE`:
  The *tmux* pane to publish the task id `@ase_task_id` to.

## FILES

- *temporary directory*`/ase-statusline-month-cost-`*user*`.json`:
  The cache of the `%Y` current-month total cost.

- *temporary directory*`/ase-statusline-prices-`*user*`.json`:
  The cache of the *LiteLLM* token prices of `%Y`.

- *per-user state directory*`/statusline-codex-usage.json`:
  The cache of the rate-limit windows fetched for the `gpt-*` models.

- *per-user state directory*`/session/`*id*`/config.yaml` and
  `state.yaml`:
  The configuration and the internal state (active task) of the
  session.

## EXIT STATUS

`0` on success, `1` on invalid JSON, an invalid option value, or
`--tool codex`.

## EXAMPLES

```sh
# render two lines from a sample payload
$ echo '{"model":{"display_name":"Opus"},"context_window":{"used_percentage":42}}' | \
  ase statusline "%m %e %t" "<blue>%c</blue>"

# a compact statusline without icons and labels, padded by one space
$ ase statusline --no-icons --no-labels -p 1 "%p %T %b %g" "%m %c %X"
```

## SEE ALSO

`ase`(1), `ase-setup-statusline`(1), `ase-config`(1), `tmux`(1).

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>
