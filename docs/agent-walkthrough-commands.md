# Walkthrough Commands: Shell Steps Only

The shell steps of [agent-walkthrough.md](agent-walkthrough.md), in order.
See that file for the explanations and for the contents of the plan files.

## 1. Prerequisites

```sh
ase setup install
ase setup status
```

## 2. Bootstrap the Empty Project

```sh
mkdir wordcount && cd wordcount
git init -b master
git commit --allow-empty -m "initial commit"
ase config set project.id wordcount
ase task lifecycle enterprise
ase config set project.task.default.source    "branch:master"
ase config set project.task.default.changeset "branch:cs-{id}"
ase config set project.task.default.target    "branch:master"
echo ".ase/task/" > .gitignore
git add .gitignore .ase && git commit -m "ASE project setup"
```

## 3. Create, Review, and Release the Tasks

```sh
# plan1.md .. plan3.md: see section 4 of agent-walkthrough.md
ase task save --create project-scaffold <plan1.md
ase task save --create word-counting    <plan2.md
ase task save --create cli-entrypoint   <plan3.md
rm plan1.md plan2.md plan3.md

ase task list
ase task view word-counting
ase task board

ase task status project-scaffold PLANNED
ase task status word-counting    PLANNED
ase task status cli-entrypoint   PLANNED
```

## 4a. Run Individual Agents

```sh
ase agent estimator   start
ase agent implementer start
ase agent qualifier   start -m qualify
ase agent integrator  start -m squash

ase agent implementer status
ase agent implementer log -f

for a in estimator implementer qualifier integrator; do ase agent $a stop; done
```

## 4b. Or Run a Fleet

```sh
ase agent fleet init -t claude --lifecycle enterprise
# optionally edit .ase/fleet.yaml (e.g., qualifier mode: qualify)
git add .ase/fleet.yaml && git commit -m "ASE agent fleet"

ase agent fleet start
ase agent fleet status
ase agent fleet log -f
ase task board

ase agent fleet stop
```

## 5. Human Touchpoints (as Needed)

```sh
ase task status word-counting QUALIFIED          # approve a "judge" verdict (or DECLINED)
ase task request cli-entrypoint edit "also support reading from stdin"
ase task assign <id> researcher                  # let a planning agent work on a DRAFTED task
ase task status <id> PLANNED                     # re-release a STALLED task ...
ase task edit <id>                               # ... and remove its ase-agent-* tag
```

## 6. Check the Result

```sh
ase task list
git log --oneline master
npm install && npm run build
node dst/cli.js package.json
```
