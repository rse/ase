# Walkthrough: From an Empty Directory to Integrated Code with `ase agent` and `ase agent fleet`

This walkthrough builds a tiny example project, `wordcount` (a Node.js
CLI counting the lines and words of files), entirely through the
autonomous agents of *ASE*. You write the task plans, and the agents
estimate, implement, review, and merge them headless.

All commands and options are taken from the manual pages
(`ase man ase-agent`, `ase man ase-agent-fleet`, `ase man ase-task`).

## 1. Prerequisites

-   *ASE* tool and plugin installed:

    ```sh
    ase setup install
    ase setup status
    ```

-   The agent tool (`claude`, or `copilot` resp. `codex`) and `git` in
    `$PATH`. The agents run it headless (`claude -p ...`), so it must be
    logged in already.

-   A Node.js toolchain, as the example project is a Node.js CLI.

> **Notice:** Every processed task spends real AI tokens. Keep the
> example tasks small.

## 2. Bootstrap the Empty Project

```sh
mkdir wordcount && cd wordcount

# the agents need a Git working copy with a commit on the target branch
git init -b master
git commit --allow-empty -m "initial commit"

# an explicit project id (required by the agent relay of the fleet)
ase config set project.id wordcount

# the built-in phase agents support the "enterprise" lifecycle only
ase task lifecycle enterprise

# implement every task on its own branch (built-in default: "worktree",
# i.e., uncommitted changes directly in the working copy)
ase config set project.task.default.source    "branch:master"
ase config set project.task.default.changeset "branch:cs-{id}"
ase config set project.task.default.target    "branch:master"

# keep the task store out of Git, as the agents update it constantly
# (do not ignore all of ".ase/": the agents' Git commands then fail)
echo ".ase/task/" > .gitignore
```

What this gives you:

-   **Task store**: the default local store `ase:./.ase/task`, i.e., one
    file `.ase/task/TASK-<id>.md` per task, kept out of Git.

-   **Configuration**: `.ase/config.yaml` (`project` scope).

-   **Branch configuration**: `Source: branch:master`,
    `Changeset: branch:cs-{id}`, `Target: branch:master`. Every task is
    implemented on its own branch `cs-<id>` (checked out as a worktree
    below `.ase/worktree/`), and merged back into `master`.

-   **Runtime files**: `.ase/agent/`, `.ase/worktree/`, etc. are covered by
    the self-ignoring `.ase/.gitignore`.

Commit the *ASE* project files once, so the agents start from a clean
`master` (any untracked file there, e.g., `.ase/config.yaml`, lets the
integrator's merge fail):

```sh
git add .gitignore .ase && git commit -m "ASE project setup"
```

## 3. The `enterprise` Lifecycle in a Nutshell

| Phase          | Incoming      | Activity       | Outcome                   | Driven by                                  |
|----------------|---------------|----------------|---------------------------|--------------------------------------------|
| Planning       | `DRAFTED`     | `PLANNING`     | `DRAFTED`                 | you, `rebooter`, `condenser`, `researcher` |
| Release        | `DRAFTED`     | --             | `PLANNED`                 | **you** (the human gate)                   |
| Estimation     | `PLANNED`     | --             | `Effort:` key set         | `estimator` (unclaimed)                    |
| Implementation | `PLANNED`     | `IMPLEMENTING` | `IMPLEMENTED` / `STALLED` | `implementer`                              |
| Qualification  | `IMPLEMENTED` | `QUALIFYING`   | see below                 | `qualifier`                                |
| Integration    | `QUALIFIED`   | `INTEGRATING`  | `INTEGRATED` / `DEFERRED` | `integrator`                               |

Planning agents act only on tasks explicitly assigned to them. The
qualifier tags its verdict (`ase-agent-qualifier:approve|reject`): in
mode `judge` (default) the task goes back to `IMPLEMENTED` for your
decision, in mode `qualify` it moves to `QUALIFIED` resp. `DECLINED`.

Key rules:

-   An agent claims a task only if it is unassigned (or assigned to the
    agent) and not yet tagged `ase-agent-<kind>`. Assign a task to
    yourself to keep the agents off it.

-   The `implementer` starts a task only once all its `After:`
    predecessors are `INTEGRATED`, so a chain of tasks is built strictly
    one after the other, each on top of the merged result of the
    previous one.

-   The `implementer` waits until the `estimator` has set `Effort:`.
    Without an `estimator`, pass `--params effort-wait=false`.

## 4. Write the Task Plans

### Interactive

Inside Claude Code in the project directory, plan a task through
conversation:

```text
/ase:ase-task-edit Scaffold a Node.js TypeScript CLI project "wordcount"
```

### Scripted

Or write the plan files yourself and save them into the task store.
Three tasks, chained via `After:`:

```sh
cat >plan1.md <<'EOF'
---
Type:      text/vnd.ase.task
Id:        project-scaffold
Kind:      CRAFTING
---

#   TASK: Project scaffold

##  SPECIFICATION (WHAT)

-   [ ] IFC: **Package**: `package.json` for a Node.js CLI `wordcount`,
    TypeScript sources in `src/`, compiled into `dst/`.

##  DESIGN (HOW)

-   [ ] IMP: **Build**: `npm run build` runs `tsc`; `npm test` runs `node --test`.

##  VERIFICATION (WHEN)

-   [ ] CON: **Builds**: `npm install && npm run build` succeeds.
EOF

cat >plan2.md <<'EOF'
---
Type:      text/vnd.ase.task
Id:        word-counting
After:     project-scaffold
Kind:      CRAFTING
---

#   TASK: Word counting

##  SPECIFICATION (WHAT)

-   [ ] DOM: **Count**: function `count(text)` returning `{ lines, words, chars }`.

##  DESIGN (HOW)

-   [ ] IMP: **Module**: `src/count.ts`, words split on whitespace.

##  VERIFICATION (WHEN)

-   [ ] REG: **Tests**: unit tests for empty, single-line, and multi-line text.
EOF

cat >plan3.md <<'EOF'
---
Type:      text/vnd.ase.task
Id:        cli-entrypoint
After:     word-counting
Kind:      CRAFTING
---

#   TASK: CLI entrypoint

##  SPECIFICATION (WHAT)

-   [ ] IFC: **CLI**: `wordcount <file>...` prints `lines words chars file`
    per file, plus a `total` line for multiple files.

##  DESIGN (HOW)

-   [ ] IMP: **Entry**: `src/cli.ts` with a `bin` entry in `package.json`.

##  VERIFICATION (WHEN)

-   [ ] CON: **Smoke**: `node dst/cli.js package.json` prints one line.
EOF

ase task save --create project-scaffold <plan1.md
ase task save --create word-counting    <plan2.md
ase task save --create cli-entrypoint   <plan3.md
rm plan1.md plan2.md plan3.md
```

To let *ASE* propose an id conforming to the id scheme of the project,
use `id=$(ase task newid "Project scaffold")`.

### Review

```sh
ase task list                     # all tasks with their status
ase task view word-counting       # one plan
ase task edit word-counting       # change a plan in $EDITOR
ase task board                    # interactive board (or: --web)
```

### Release to the Agents

New tasks start as `DRAFTED`. Moving them into `PLANNED` is the gate
that hands them to the agents:

```sh
ase task status project-scaffold PLANNED
ase task status word-counting    PLANNED
ase task status cli-entrypoint   PLANNED
```

## 5. Option A: Individual Agents

Run each agent as its own background process. Good for learning the
mechanics or debugging one phase.

```sh
ase agent estimator   start
ase agent implementer start
ase agent qualifier   start -m qualify     # auto-decide on the review verdict
ase agent integrator  start -m squash      # squash-merge cs-<id> into master
```

Observe and control them:

```sh
ase agent implementer status
ase agent implementer log -f               # follows .ase/agent/implementer.log
ase task list                              # watch the tasks move along
ase agent implementer stop                 # puts running tasks back into PLANNED
```

Notes:

-   `--foreground` (`-f` on `start`) runs an agent in the terminal
    instead, handy for a first try.

-   `-n <name>` starts several agents of one kind as a pool, e.g.,
    `ase agent implementer start -n impl-claude -t claude` and
    `ase agent implementer start -n impl-codex -t codex`.

-   `-p 2` lets one implementer process two tasks in parallel (useful
    only for tasks without `After:` chain).

-   The default qualifier mode `judge` only tags the verdict
    (`ase-agent-qualifier:approve|reject`) and leaves the decision to you
    (see section 7).

Stop all of them when done:

```sh
for a in estimator implementer qualifier integrator; do ase agent $a stop; done
```

## 6. Option B: A Fleet of Agents

A fleet runs all agents (plus the agent relay feeding the task board)
under one supervising process, which restarts every member that exits
(backoff from 1 second up to 5 minutes).

### Create the Configuration

```sh
ase agent fleet init -t claude --lifecycle enterprise
```

This writes `.ase/fleet.yaml` with the `relay`, a `default` section,
and the agents `editor`, `estimator`, `rebooter`, `condenser`,
`researcher`, `implementer`, `qualifier` (mode `judge`), and
`integrator` (mode `squash`). Adjust it; for the hands-off example a
trimmed version looks like:

```yaml
relay:
default:
    tool:        claude
    parallel:    1
    timeout:     60m
editor:
estimator:
implementer:
    mode:        implement
qualifier:
    mode:        qualify
integrator:
    mode:        squash
```

Version it with the project (`git add .ase/fleet.yaml`).

### Run the Fleet

```sh
ase agent fleet start              # background, returns once all members run
ase agent fleet status             # fleet + each member, restarts count
ase agent fleet log -f             # shared log, each line prefixed by member name
ase task board                     # board incl. live agent presence via the relay
```

`ase agent fleet start -f` runs it in the foreground instead (stop
with `CTRL+C`).

Stop everything (agents first, then the relay):

```sh
ase agent fleet stop
```

## 7. Your Touchpoints While the Agents Run

-   **Approve reviews** (qualifier mode `judge` only): check the tag
    `ase-agent-qualifier:approve|reject`, then decide:

    ```sh
    ase task status word-counting QUALIFIED   # or DECLINED
    ```

-   **Refine a plan** through the `editor` agent:

    ```sh
    ase task request cli-entrypoint edit "also support reading from stdin"
    ```

    (or key `E` on the task board).

-   **Let agents plan for you**: create a task in `DRAFTED` and assign it
    to a planning agent, e.g., `ase task assign <id> researcher` (or
    `rebooter`, `condenser`); it comes back `DRAFTED` and unassigned.

-   **Handle parked tasks**:
    -   `STALLED`: implementation did not finish; fix the plan, then
        `ase task status <id> PLANNED`, and remove the tag
        `ase-agent-implementer` (via `ase task edit <id>`), so it is
        claimed again.
    -   `DECLINED`: review rejected; fix the change set, move back to
        `IMPLEMENTED`, and remove the verdict tag `ase-agent-qualifier:reject`,
        so the qualifier reviews it again.
    -   `DEFERRED`: merge conflict; resolve it, move back to `QUALIFIED`,
        and remove the tag `ase-agent-integrator`.
    -   a tag with the value `:failed`: manual intervention needed (see
        the agent log, resp. the `agent` attachment of the task);
        removing the tag releases the task again.

## 8. Check the Result

```sh
ase task list                       # all tasks INTEGRATED
git log --oneline master            # one squash commit per task
npm install && npm run build
node dst/cli.js package.json
```

The full processing log of each task is appended to its `agent`
attachment (`ase task view <id>`).

## 9. Caveats

-   With the `branch:` changesets configured above, every task gets its
    own worktree, so agents do not collide. The built-in default
    `worktree` changeset (uncommitted in the working copy itself) should
    be used by a single agent only, and a dirty working copy blocks it.

-   `--repo <url>` (agents working in their own clone) requires a task
    store outside the working copy, i.e., not the default
    `ase:./.ase/task` (see `ase man ase-task-store`).

-   Keep the `master` worktree clean while the `integrator` runs, as
    uncommitted changes there let its merges fail.

## See Also

`ase man ase-agent`, `ase man ase-agent-fleet`, `ase man ase-agent-implementer`,
`ase man ase-agent-qualifier`, `ase man ase-agent-integrator`,
`ase man ase-agent-estimator`, `ase man ase-agent-editor`,
`ase man ase-task`, `ase man ase-task-board`.
