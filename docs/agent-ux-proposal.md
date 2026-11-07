# Proposal: A Simpler UI Flow for ASE Agents

> **Notice:** This is a design proposal and none of it is implemented.
> It deliberately breaks some ASE conventions (top-level verbs, hidden
> lifecycle states, implicit fleet) where they make the first run harder.

## 1. Problem

Writing `docs/agent-walkthrough.md` showed that getting from an empty
directory to integrated code takes about 25 commands across five command
groups (`git`, `ase config`, `ase task`, `ase agent <kind>`,
`ase agent fleet`). Before getting anything done, a user has to learn
14 lifecycle states, 8 agent kinds with their modes, and how the
claim tags work.

| Friction                    | Today                                                                                | Effect                                            |
|-----------------------------|--------------------------------------------------------------------------------------|---------------------------------------------------|
| Setup                       | `git init` + empty commit, `config set project.id`, `task lifecycle`, commit `.ase/` | 4 manual steps before the first task              |
| Two ways to run agents      | `ase agent <kind> start` vs. `ase agent fleet start`                                 | user has to choose an architecture first          |
| Kinds and modes             | 8 built-in kinds, `judge`/`qualify`, `implement`/`draft`, `squash`/...               | decisions nobody wants to make on day 1           |
| Release gate                | `ase task status <id> PLANNED`                                                       | user must know the state names                    |
| Retry                       | reset status + delete the `ase-agent-<kind>` tag via `ase task edit`                 | a hidden state machine leaks into the UI          |
| Human actions are scattered | `task status`, `task request`, `task assign`, `task edit`, board keys                | no obvious "what do I do now"                     |
| No inbox                    | waiting verdicts, `STALLED`, `DECLINED`, `DEFERRED`, `:failed` tags                  | the user has to hunt for the work that needs them |

## 2. What Is Essential

A user really only needs to do five things:

1. **Describe** the work (one or more tasks, optionally ordered).
2. **Release** it ("this is ready, go").
3. **Let it run** (start and stop the agents).
4. **Answer** when the agents need a human (approve, reject, retry, refine).
5. **See** the progress and the result.

Everything else should be a default the user can override later: the
estimator, relay, tags, worktrees, branch names, agent kinds, modes,
and lifecycle model.

## 3. Proposed Command Surface

The commands are verb-first, top-level, and task-centric. Each verb
corresponds to one of the essentials.

| Command                                              | Essential | Replaces today                                                                             |
|------------------------------------------------------|-----------|--------------------------------------------------------------------------------------------|
| `ase init [--autonomy manual\|review\|auto]`         | setup     | `git init` + commit, `config set project.id`, `task lifecycle`, `agent fleet init`, commit |
| `ase plan "<title>" [--after <id>] [--edit\|--chat]` | describe  | `task newid` + `task save --create`, resp. `/ase:ase-task-edit`                            |
| `ase go [<id>...\|--all]`                            | release   | `task status <id> PLANNED`                                                                 |
| `ase run [--watch] [--only <kind>]`                  | run       | `agent fleet start`, resp. `agent <kind> start`                                            |
| `ase stop`                                           | run       | `agent fleet stop`                                                                         |
| `ase status [<id>]`                                  | see       | `task list` + `agent fleet status` + `task board --text`                                   |
| `ase inbox`                                          | answer    | hunting verdict tags and parked states                                                     |
| `ase accept <id>`                                    | answer    | `task status <id> QUALIFIED`                                                               |
| `ase reject <id> "<why>"`                            | answer    | `task status <id> DECLINED` + manual fix + tag removal                                     |
| `ase retry <id> ["<hint>"]`                          | answer    | status reset + tag removal (+ `task request <id> edit "<hint>"`)                           |
| `ase log [<id>] [-f]`                                | see       | `agent` attachment, resp. `agent fleet log -f`                                             |

The existing `ase task ...` and `ase agent ...` commands stay as the
power-user layer. The new verbs are thin wrappers over them.

### Design Rules

-   **One implicit fleet per project.** `ase run` always means "the
    fleet of this project". `.ase/fleet.yaml` is still generated and
    versioned, but only power users ever open it. `--only <kind>`
    replaces individual agents for debugging.

-   **Autonomy presets instead of modes.** `ase init --autonomy` picks
    one preset, and `ase init --autonomy <level>` can switch it later:

    | Preset   | Planning | Qualifier | Integrator             | Human does                  |
    |----------|----------|-----------|------------------------|-----------------------------|
    | `manual` | human    | `judge`   | waits for `ase accept` | accept every review + merge |
    | `review` | human    | `judge`   | `squash`               | accept every review         |
    | `auto`   | human    | `qualify` | `squash`               | only handle failures        |

    (`manual` needs a new "hold before integration" gate, which can be
    done by having `accept` move the task to `QUALIFIED` only on a second
    confirmation, or by having the integrator require an assignee.)

-   **Human status vocabulary.** The UI shows six words and the
    lifecycle states stay underneath:

    | Shown       | Lifecycle states (`enterprise`)                                                          |
    |-------------|------------------------------------------------------------------------------------------|
    | `draft`     | `DRAFTED`, `PLANNING`                                                                    |
    | `ready`     | `PLANNED` (waiting for agents or `After:` predecessors)                                  |
    | `working`   | `IMPLEMENTING`, `QUALIFYING`, `INTEGRATING`, and in-between states an agent will pick up |
    | `needs you` | `IMPLEMENTED` + verdict tag (mode `judge`), `STALLED`, `DECLINED`, `DEFERRED`, `:failed` |
    | `done`      | `INTEGRATED`                                                                             |
    | `dropped`   | `CANCELLED`, `SHELVED`                                                                   |

-   **Tags are invisible.** No command output asks the user to add or
    remove an `ase-agent-*` tag. `retry`, `accept`, and `reject` handle
    them.

-   **Every line suggests the next command.** `ase status` and
    `ase inbox` end each actionable row with the exact command to run.

-   **Ids are short and optional.** `ase plan` prints the minted id and
    the commands also take a unique prefix (`ase accept scaff`). The
    last-touched task is the default where there's no ambiguity.

## 4. Example Session

From an empty directory to a merged `master`:

```text
$ mkdir wordcount && cd wordcount

$ ase init --autonomy review
✓ git repository created (branch master, initial commit)
✓ project "wordcount" (lifecycle enterprise, tasks in .ase/task/)
✓ agents: estimator, implementer, qualifier (judge), integrator (squash), editor
✓ committed .ase/
next: ase plan "<title>"

$ ase plan "Project scaffold" --edit
✎ opened $EDITOR on a plan template ...
✓ project-scaffold (draft)

$ ase plan "Word counting" --after project-scaffold --chat
💬 refining the plan with Claude ... (Ctrl+D when done)
✓ word-counting (draft, after project-scaffold)

$ ase plan "CLI entrypoint" --after word-counting <<'EOF'
`wordcount <file>...` prints lines, words, chars per file plus a total.
EOF
✓ cli-entrypoint (draft, after word-counting)

$ ase go --all
✓ 3 tasks ready

$ ase run --watch
┌ wordcount ─── 3 tasks ─── 5 agents ───────────────────────────┐
│ project-scaffold  working    implementer   02:13   $0.41     │
│ word-counting     ready      after project-scaffold          │
│ cli-entrypoint    ready      after word-counting             │
├───────────────────────────────────────────────────────────────┤
│ 14:02:11 implementer  project-scaffold: npm run build ok      │
│ 14:02:40 implementer  project-scaffold: IMPLEMENTED           │
│ 14:02:41 qualifier    project-scaffold: reviewing cs-proj...  │
└ needs you: 1 ─────────────── i inbox · l log · d detach · q stop ┘
```

Pressing `d` detaches. The fleet keeps running in the background, and
`ase run --watch` re-attaches.

```text
$ ase inbox
  task              why                         next
1 project-scaffold  review: APPROVE (2 notes)   ase accept project-scaffold
                                                ase reject project-scaffold "<why>"

$ ase accept project-scaffold
✓ project-scaffold accepted → integrating

$ ase status
wordcount  · 5 agents running · needs you: 1
  project-scaffold  done        squash 3f2a1c on master
  word-counting     done        squash 9b04e7 on master
  cli-entrypoint    needs you   stalled: "tests fail: no such file"
                                → ase retry cli-entrypoint "<hint>"

$ ase retry cli-entrypoint "read files with fs.readFileSync, no deps"
✓ plan refined, cli-entrypoint ready again

$ ase log cli-entrypoint -f
... (live agent output for this task only)

$ ase status
wordcount  · all 3 tasks done · needs you: 0

$ ase stop
✓ agents stopped
```

### Before and After

| Measure                               | Today (`agent-walkthrough.md`)           | Proposed             |
|---------------------------------------|------------------------------------------|----------------------|
| Commands until agents run             | ~13                                      | 6                    |
| Command groups to know                | 5                                        | 1                    |
| Concepts before the first run         | states, kinds, modes, tags, relay, fleet | task, autonomy level |
| Steps to retry a stalled task         | 3 (`status`, `edit` tags, `request`)     | 1 (`retry`)          |
| Places to look for pending human work | board + task list + tags                 | `inbox`              |

## 5. Mapping to the Existing Implementation

Most of the new verbs only orchestrate commands that already exist:

| New verb     | Built from                                                                                | New logic                                    |
|--------------|-------------------------------------------------------------------------------------------|----------------------------------------------|
| `init`       | `git`, `ase config set project.id`, `ase task lifecycle`, `ase agent fleet init` (preset) | preset templates for `.ase/fleet.yaml`       |
| `plan`       | `ase task newid`, `ase task save --create`, `ase task edit`, skill `ase-task-edit`        | stdin/template handling, `--after`           |
| `go`         | `ase task status <id> PLANNED`                                                            | `--all` selection                            |
| `run`/`stop` | `ase agent fleet start\|stop`, `ase agent <kind> start -f`                                | `--watch` TUI (reuse `ase-task-board-tui-*`) |
| `status`     | `ase task list`, `ase agent fleet status`, `ase task board --text`                        | human status vocabulary                      |
| `inbox`      | task list + tags (`ase-agent-qualifier:*`, `:failed`) + parked states                     | aggregation + next-command hints             |
| `accept`     | `ase task status <id> QUALIFIED`                                                          | -                                            |
| `reject`     | `ase task status <id> DECLINED`, `ase task request <id> edit`                             | optional auto-retry with the reason          |
| `retry`      | `ase task status`, tag removal via `ase task save`, `ase task request <id> edit`          | per-state reset rules + tag removal          |
| `log`        | `agent` attachment, `.ase/agent/fleet.log`                                                | per-task filter of the live log              |

The only genuinely new parts are the `inbox` aggregation, the `retry`
reset rules, the status vocabulary, and the `--watch` view.

## 6. Open Questions and Trade-Offs

-   **Namespace:** Top-level verbs (`ase plan`) are the easiest to type
    but crowd `ase`. The alternative is a single group, `ase flow plan`,
    `ase flow run`, and so on (or a separate binary `asf`).

-   **Hiding states vs. auditability:** Enterprise users need the exact
    states, so `ase status -v` shows them and the existing commands
    remain unchanged.

-   **Implicit fleet:** Should `ase go` auto-start the fleet ("release
    means run")? This is convenient, but it spends tokens without an
    explicit `run`.

-   **Lifecycle choice:** `init` always picks `enterprise` because only
    it has agent phases. `solo`/`team` users would get no agents, so
    either the presets should cover those models too (ad-hoc
    `developer` agent for `team`) or they should be left out of the
    simple flow.

-   **`manual` preset:** It needs a new hold gate before integration,
    which no built-in agent provides today.
