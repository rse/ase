/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import fs                           from "node:fs"
import path                         from "node:path"

import type Log                     from "./ase-lib-log.js"
import { Task }                     from "./ase-task.js"
import { Worktree }                 from "./ase-util-worktree.js"
import { taskFlow }                 from "./ase-agent-runtime-task.js"
import type {
    AgentTask, AgentLog, AgentWork, AgentSnapshot, FlowValue, LineLevel
}                                   from "./ase-agent-runtime-task.js"
import {
    tempPreserved, tempDir, execaJob, jobScope,
    gitInside, gitLocked, gitWorktree, worktreeRemove, gitWorktreeRemove, gitWorktreeAdd,
    gitWorktreeDetached, worktreeId, safeName, contextDir, worktreeName, gitClean, gitChangesetDiff
}                                   from "./ase-agent-runtime-exec.js"
import type { TempDir }             from "./ase-agent-runtime-exec.js"

/*  the holders ("<agent>:<task>") of the Git working copies and branches used exclusively during
    the processing of a task by any agent of this process (see "AgentWorkspace.holdRoot" and
    "AgentWorkspace.holdBranch")  */
const rootHolders = new Map<string, string>()

/*  the services of an agent required by its workspace: its name, whether it processes
    tasks in parallel, the deferring of a task (see "Agent.defer"), and the writing
    of a log line of the agent itself (see "Agent.write")  */
export interface AgentWorkspaceHost {
    name:         string
    parallelized: boolean
    defer:        (task: AgentTask, reason: string) => Promise<boolean>
    write:        (level: LineLevel, msg: string) => Promise<void>
}

/*  the Git workspace of an agent: its working copy, the temporary clone of "--repo",
    and the working directories and exclusively held Git resources of the processed tasks  */
export class AgentWorkspace {
    /*  the temporary directory of the agent, the directory of the temporary
        clone of "--repo", the default branch of this clone, and whether the
        temporary directory holds work preserved for a manual recovery  */
    private temp:      TempDir | null = null
    private clone                     = ""
    private head                      = ""
    private preserved                 = false

    /*  the working directories in the temporary clone of "--repo" kept
        for a manual recovery of the work preserved in them (see "preserve")  */
    private keptdirs                  = new Set<string>()

    /*  per processed task id: its working directory in the temporary clone
        of "--repo" (see "workdir"), and the Git working copy and branches held
        exclusively for it (see "holdRoot" and "holdBranch")  */
    private workdirs                  = new Map<string, string>()
    private holds                     = new Map<string, Set<string>>()

    /*  the workspace of the agent <host> with the Git working copy <root> (the directory of
        "--cwd" resp. its Git top-level, else the project root the agent is started in, where
        the agent tool runs), the URL <repo> of the Git repository of "--repo" (else empty),
        and the "--tempdir" specification <tempdir> (else empty)  */
    constructor (
        private log:     Log,
        private host:    AgentWorkspaceHost,
        private root:    string,
        private repo:    string,
        private tempdir: string
    ) {}

    /*  open the workspace: clone the repository of "--repo" (if any) temporarily,
        with its default branch detached, so all branches can be refreshed from its origin  */
    async open (): Promise<void> {
        if (this.repo === "")
            return
        this.temp  = await tempDir(this.host.name, this.tempdir)
        this.clone = path.join(this.temp.dir, "clone")
        await execaJob("git", [ "clone", "--quiet", this.repo, this.clone ])
        this.head = (await execaJob("git", [ "branch", "--show-current" ], { cwd: this.clone })).stdout.trim()
        await execaJob("git", [ "checkout", "--quiet", "--detach" ], { cwd: this.clone })
        await this.host.write("info", `cloned "${this.repo}" temporarily (default branch "${this.head}")`)
    }

    /*  close the workspace: remove the temporary directory (if any),
        unless it holds work preserved for a manual recovery  */
    async close (): Promise<void> {
        if (this.temp === null)
            return
        if (this.preserved)
            await this.host.write("error", `temporary directory "${this.temp.dir}" preserved ` +
                `for a manual recovery (see "${path.join(this.temp.dir, tempPreserved)}")`)
        else {
            await fs.promises.rm(this.temp.dir, { recursive: true, force: true })
            if (this.temp.base !== "")
                await fs.promises.rmdir(this.temp.base).catch(() => {})
        }
        this.temp  = null
        this.clone = ""
    }

    /*  hold the Git working copy <root> of the agent (see "root") exclusively for the processing
        of a task (from right before its claim, see "Agent.ready", until it is settled), if it is used
        directly (instead of an ASE worktree of it), i.e., if a skill changes it (e.g. implements
        into it, stages in it, or integrates from or into it), so no agent of this process using
        it directly processes another task meanwhile, which would mix up the uncommitted change
        sets of the tasks (the agents of other processes, and humans, are not coordinated, so
        a working copy should be used directly by a single agent process only);
        returns false if it is already held for another task  */
    private holdRoot (task: AgentTask, root: string): boolean {
        return this.hold(task, root)
    }

    /*  hold the Git branch <branch> of the Git working copy <root> of the agent (see "root")
        (or, if empty, of the temporary clone of "--repo") exclusively for the processing of a
        task (like "holdRoot"), if the task is processed in the worktree the branch is checked
        out in (e.g. into a "branch:" changeset), so no agent of this process processes another
        task in the same worktree meanwhile, which would mix up the change sets of the tasks
        (e.g. into the commit onto the branch) and remove the worktree under the other task;
        returns false if it is already held for another task  */
    private holdBranch (task: AgentTask, root: string, branch: string): boolean {
        return this.hold(task, `${root !== "" ? root : this.repo}#${branch}`)
    }

    /*  hold a resource (by its key) exclusively for the processing of a task  */
    private hold (task: AgentTask, key: string): boolean {
        const holder = `${this.host.name}:${task.id}`
        const held   = rootHolders.get(key)
        if (held !== undefined && held !== holder)
            return false
        rootHolders.set(key, holder)
        const keys = this.holds.get(task.id) ?? new Set<string>()
        keys.add(key)
        this.holds.set(task.id, keys)
        return true
    }

    /*  release the Git working copy and branches held for a task (if any)  */
    unhold (id: string): void {
        const keys = this.holds.get(id)
        if (keys === undefined)
            return
        this.holds.delete(id)
        for (const key of keys)
            if (rootHolders.get(key) === `${this.host.name}:${id}`)
                rootHolders.delete(key)
    }

    /*  release all resources of the processing of a task: its held Git working
        copy and branches and its working directory in the temporary clone  */
    async unbind (id: string): Promise<void> {
        this.unhold(id)
        const dir = this.workdirs.get(id)
        if (dir !== undefined) {
            this.workdirs.delete(id)
            await gitWorktreeRemove(this.clone, dir).catch(() => {})
        }
    }

    /*  the Git working copy of the agent (see "root"), if a task with the change set
        flow values <values> is processed in it (see "workdir"), else empty  */
    private localRoot (values: FlowValue[]): string {
        return this.clone === "" || values.some((value) => value.type === "worktree") ? this.root : ""
    }

    /*  whether the working copy <root> belongs to the temporary clone of "--repo"  */
    private cloned (root: string): boolean {
        return this.clone !== "" && (root === this.clone || [ ...this.workdirs.values() ].includes(root))
    }

    /*  the Git working copy in which a task with the change set flow values <values>
        is processed: for any "worktree" value (or without "--repo") the one of the agent
        (see "root"), else a temporary worktree of the clone of "--repo" of its own,
        detached at the default branch, after refreshing the default branch and the
        branches of the values from the origin, where the Git operations on the clone
        are mutually exclusive and its own working directory is never changed or used
        by a skill (so concurrently processed tasks do not interfere)  */
    private async workdir (task: AgentTask, values: FlowValue[]): Promise<string> {
        if (this.localRoot(values) !== "") {
            if (!(await gitInside(this.root)))
                throw new Error("agent: task requires the Git working copy of the agent, but there is none")
            return this.root
        }
        const cwd = this.clone
        const dir = path.join(this.temp!.dir, "work", task.id)
        if (this.keptdirs.has(dir))
            throw new Error(`agent: working directory "${dir}" holds work of an earlier processing of the task, ` +
                "preserved for a manual recovery")
        this.workdirs.set(task.id, dir)
        await gitLocked(cwd, async () => {
            await execaJob("git", [ "fetch", "--quiet", "--prune", "origin" ], { cwd })
            for (const branch of [ this.head, ...values.filter((value) => value.type === "branch").map((value) => value.name) ]) {
                /*  a branch checked out in a worktree (e.g. by the processing of another
                    task) cannot be moved by Git and is hence left as it is  */
                if ((await execaJob("git", [ "rev-parse", "--verify", "--quiet", `refs/remotes/origin/${branch}` ],
                    { cwd, reject: false })).exitCode === 0 && (await gitWorktree(cwd, branch)) === "")
                    await execaJob("git", [ "branch", "--quiet", "--force", branch, `origin/${branch}` ], { cwd })
            }
            await worktreeRemove(cwd, dir)
            await execaJob("git", [ "worktree", "add", "--quiet", "--detach", dir, this.head ], { cwd })
        })
        return dir
    }

    /*  publish a branch of the working copy <root> to the origin of "--repo",
        if <root> belongs to its temporary clone (a rejected push fails the task)  */
    private async publish (root: string, branch: string, log: AgentLog): Promise<void> {
        if (!this.cloned(root))
            return
        await gitLocked(root, () =>
            execaJob("git", [ "push", "--quiet", "origin", `refs/heads/${branch}:refs/heads/${branch}` ], { cwd: root }))
        await log("info", `branch "${branch}" pushed to "${this.repo}"`)
    }

    /*  delete a branch from the origin of "--repo", if <root> belongs to its temporary
        clone and the branch was already deleted in it (e.g. after a merge)  */
    private async unpublish (root: string, branch: string, log: AgentLog): Promise<void> {
        if (!this.cloned(root) || (await execaJob("git", [ "rev-parse", "--verify", "--quiet", `refs/heads/${branch}` ],
            { cwd: root, reject: false })).exitCode === 0)
            return
        await gitLocked(root, () =>
            execaJob("git", [ "push", "--quiet", "origin", "--delete", branch ], { cwd: root }))
        await log("info", `branch "${branch}" deleted from "${this.repo}"`)
    }

    /*  rescue a branch of the working copy <root> which could not be published to the origin
        of "--repo" (e.g. carrying a merge already recorded as integrated): keep its state as
        the branch "ase-agent-rescue/<task-id>" in the temporary clone and preserve the clone
        (instead of removing it after the run) for a manual recovery, where the rescuing runs
        outside of the operation of the job (see "jobScope"), as the operation (e.g. a hanging
        "git push" of the finishing) might have timed out, which cancels all its commands  */
    private async rescue (root: string, branch: string, task: AgentTask, log: AgentLog): Promise<void> {
        if (!this.cloned(root))
            return
        await jobScope.exit(async () => {
            const rescue = `ase-agent-rescue/${task.id}`
            await gitLocked(root, () =>
                execaJob("git", [ "branch", "--force", rescue, `refs/heads/${branch}` ], { cwd: root }))
            await this.markPreserved(`task "${task.id}": branch "${branch}" not published to "${this.repo}" -- kept as branch "${rescue}"`)
            await log("error", `branch "${branch}" NOT published to "${this.repo}" -- kept as branch "${rescue}" ` +
                `in the temporary clone "${this.clone}", which is preserved for a manual recovery`)
        })
    }

    /*  preserve the uncommitted work <what> of a task, left in its working directory <root>
        (e.g. in a worktree nested inside it), if <root> belongs to the temporary clone of
        "--repo": keep its working directory (instead of removing it after the processing,
        and refuse its reuse by a later processing of the task in this run) and preserve the
        clone for a manual recovery; returns false if <root> does not belong to the clone  */
    private async preserve (root: string, task: AgentTask, what: string, log: AgentLog): Promise<boolean> {
        if (!this.cloned(root))
            return false
        if (this.workdirs.get(task.id) === root) {
            this.workdirs.delete(task.id)
            this.keptdirs.add(root)
        }
        await this.markPreserved(`task "${task.id}": ${what} kept in "${root}"`)
        await log("error", `${what} kept in "${root}" of the temporary clone "${this.clone}", ` +
            "which is preserved for a manual recovery")
        return true
    }

    /*  mark the temporary directory as holding work preserved for a manual recovery  */
    private async markPreserved (note: string): Promise<void> {
        this.preserved = true
        await fs.promises.writeFile(path.join(this.temp!.dir, tempPreserved), `${note}\n`, { flag: "a" })
    }

    /*  whether a task is ready for the access of the working directory kind <workdir>
        ("project", "source", "changeset", "changeset-read", or "target"), see "job"  */
    async ready (task: AgentTask, workdir: string): Promise<boolean> {
        if (workdir === "changeset")
            return this.changesetReady(task)
        else if (workdir === "changeset-read")
            return this.changesetReadReady(task)
        else if (workdir === "target")
            return this.targetReady(task)
        return true
    }

    /*  the work of a job in the working directory kind <workdir>: the project root
        ("project"), or the working copy of "sourceJob" (with the "branch:" source checked out
        on request), "changesetJob" (with the work committed on request), "changesetReadJob",
        or "targetJob" (the latter two with the change set snapshot captured on request, for
        its attachment of the kind <snapshot>, else empty), where the agent-owned worktrees
        are named with the suffix <suffix>  */
    async job (task: AgentTask, workdir: string, suffix: string, parallel: boolean,
        options: { checkout: boolean, commit: boolean, snapshot: string }): Promise<AgentWork> {
        if (workdir === "source")
            return this.sourceJob(task, suffix, options.checkout)
        else if (workdir === "changeset")
            return this.changesetJob(task, parallel, options.commit, options.snapshot)
        else if (workdir === "changeset-read")
            return this.changesetReadJob(task, suffix)
        else if (workdir === "target")
            return this.targetJob(task, suffix, options.snapshot)
        return { cwd: this.root, dirs: [], sourceDir: "", changesetWorktree: "" }
    }

    /*  the change set snapshot of the working tree of the Git working copy <dir>, from the
        fork point of its "HEAD" from the source commit <base> on, marked as partial on request  */
    private async worktreeSnapshot (dir: string, base: string, partial: boolean): Promise<AgentSnapshot> {
        const { base: fork, diff } = await gitChangesetDiff(dir, base)
        return diff !== "" ? { desc: `base ${fork}${partial ? ", partial" : ""}`, diff } : null
    }

    /*  the work of a job in the working copy holding the "Source:" of a task (see "workdir"),
        where a "branch:" source is additionally checked out on request (<checkout>) in a
        temporary, detached Git worktree "<id>-<suffix>" (granted to the agent tool), which is
        removed afterwards  */
    private async sourceJob (task: AgentTask, suffix: string, checkout: boolean): Promise<AgentWork> {
        const source = taskFlow(this.log, task, "Source")
        const root   = await this.workdir(task, [ source ])
        if (source.type !== "branch" || !checkout)
            return { cwd: root, dirs: [], sourceDir: "", changesetWorktree: "" }
        const dir = Worktree.dir(`${worktreeId(task.id)}-${suffix}`, true, true, root)
        await gitWorktreeDetached(root, dir, source.name)
        return {
            cwd:  root,
            dirs: [ dir ],
            sourceDir: dir,
            changesetWorktree: "",
            cleanup: async (log: AgentLog) => {
                await gitWorktreeRemove(root, dir)
                await log("info", `temporary worktree of source branch "${source.name}" removed`)
            }
        }
    }

    /*  whether a task is ready for the write access to its "Changeset:" (see "changesetJob"):
        a task with a "branch:" changeset is processed only while its changeset branch is held for
        it alone (see "holdBranch"), as two tasks with the same changeset branch would otherwise
        be processed in the same worktree at once (mixing their change sets into the commit,
        and removing the worktree under each other), and a task is processed directly in the
        working copy the agent is started in (a serially processed "worktree" changeset, or a
        "branch:" changeset checked out in it) only while the working copy is held for it alone
        (see "holdRoot") and while it carries no uncommitted changes (except the ASE state), as
        otherwise the uncommitted change set of an earlier task (e.g. one still to be reviewed and
        integrated) or the uncommitted work of a human would mix into the one of this task (and,
        for a "branch:" changeset, even be committed onto its branch), so the task is deferred
        (and not claimed) until then (re-checked on the next change of the tasks, e.g. once the
        earlier task was integrated)  */
    private async changesetReady (task: AgentTask): Promise<boolean> {
        let source:    FlowValue
        let changeset: FlowValue
        try {
            source    = taskFlow(this.log, task, "Source")
            changeset = taskFlow(this.log, task, "Changeset")
        }
        catch (_err) {
            /*  an invalid value fails the processing of the task  */
            return true
        }
        const root = this.localRoot([ source, changeset ])
        if (changeset.type === "branch" && !this.holdBranch(task, root, changeset.name))
            return this.host.defer(task, `the changeset branch "${changeset.name}" used by another task`)
        else if (root === "")
            return true
        else if ((changeset.type === "worktree" && !this.host.parallelized)
            || (changeset.type === "branch" && (await gitWorktree(root, changeset.name).catch(() => "")) === root)) {
            if (!this.holdRoot(task, root))
                return this.host.defer(task, "the working copy used by another task")
            else if (!(await gitClean(root).catch(() => true))) {
                this.unhold(task.id)
                return this.host.defer(task, "the working copy without uncommitted changes (e.g. of an earlier task)")
            }
        }
        return true
    }

    /*  the work of a job with write access to the "Changeset:" of a task, processed from its
        "Source:" (see "changesetReady"): a "worktree" changeset in the working copy itself
        (switched to a "branch:" source, if processed serially, else in the ASE worktree of the
        task, created by the skill itself), a "branch:" changeset in the worktree in which it is
        checked out, else in an agent worktree named after the branch, like by the skill (with
        the branch created from the source if missing), and an "attachment:" changeset left to
        the skill, where the work on a "branch:" changeset is committed onto it on request
        (<commit>) and published, and where
        the change set snapshot is captured on request (for its attachment of the kind
        <snapshot>, else empty) from the working tree carrying the change set (also for a
        "branch:" changeset, before its commit), based on the source commit (so it shows the
        entire change set, also of an earlier processing), while a snapshot is obsolete for an
        "attachment:" changeset (except for the attachment of its own kind, which is the
        change set itself)  */
    private async changesetJob (task: AgentTask, parallel: boolean, commit: boolean,
        snapshot: string): Promise<AgentWork> {
        const source    = taskFlow(this.log, task, "Source")
        const changeset = taskFlow(this.log, task, "Changeset")
        const cwd       = await this.workdir(task, [ source, changeset ])
        const base      = snapshot !== "" && changeset.type !== "attachment" ? (await execaJob("git",
            [ "rev-parse", "--verify", `${source.type === "branch" ? source.name : "HEAD"}^{commit}` ], { cwd })).stdout.trim() : ""
        if (changeset.type === "branch") {
            /*  check out the changeset branch (created from the source if missing) in a
                worktree of the agent, unless it is already checked out in the working copy
                or an ASE worktree (which then has to be without uncommitted changes, as
                they would be committed onto the branch, too), process the task inside it
                in place, and afterwards commit the result onto the branch (also a partial
                one, as the plan tracks it) and publish it to the origin of a temporarily
                cloned repository, where the worktree of the agent is removed only if clean
                and a branch which could not be published is rescued (as the commit would
                otherwise be lost with the clone, see "Agent.settle"), so the change set is not lost  */
            let dir   = await gitWorktree(cwd, changeset.name)
            const own = dir === ""
            if (own) {
                /*  an existing directory (e.g. the worktree of another branch of the same
                    name, like "a-b" for "a/b") is never replaced, as it is not the agent's own  */
                dir = Worktree.dir(safeName(changeset.name), true, false, cwd)
                if (fs.existsSync(dir))
                    throw new Error(`agent: directory "${dir}" for branch "${changeset.name}" already exists ` +
                        "-- cannot implement task into it")
                await gitWorktreeAdd(cwd, dir, changeset.name, source.type === "branch" ? source.name : "HEAD")
            }
            else if (!(await gitClean(dir)))
                throw new Error(`agent: working copy "${dir}" with branch "${changeset.name}" checked out has ` +
                    "uncommitted changes (e.g. the change set of an earlier task) -- cannot implement task into it")
            return {
                cwd,
                dirs: [],
                sourceDir: "",
                changesetWorktree: worktreeName(cwd, dir),
                ...(snapshot !== "" ? {
                    snapshot: async (partial: boolean) => this.worktreeSnapshot(dir, base, partial)
                } : {}),
                ...(commit ? {
                    finish: async (log: AgentLog) => {
                        /*  the ASE state (e.g. the local task store) is never committed  */
                        await execaJob("git", [ "add", "--all", "--", ".", ":(exclude).ase" ], { cwd: dir })
                        if ((await execaJob("git", [ "diff", "--cached", "--quiet" ], { cwd: dir, reject: false })).exitCode !== 0) {
                            const message = `${task.keys.get("Kind") || "CRAFTING"}: ${task.title} (${task.id})`
                            await execaJob("git", [ "commit", "--quiet", "-m", message ], { cwd: dir })
                            await log("info", `change set committed onto branch "${changeset.name}"`)
                        }
                        else
                            await log("warning", `no change set to commit onto branch "${changeset.name}"`)
                        await this.publish(cwd, changeset.name, log).catch(async (err: unknown) => {
                            await this.rescue(cwd, changeset.name, task, log).catch((err2: unknown) =>
                                log("error", `rescuing branch "${changeset.name}" failed: ` +
                                    (err2 instanceof Error ? err2.message : String(err2))))
                            throw err
                        })
                    }
                } : {}),
                cleanup: async (log: AgentLog) => {
                    /*  a worktree nested inside the working directory of the task in the
                        temporary clone of "--repo" is kept only by preserving the clone  */
                    if (own && await gitClean(dir).catch(() => false))
                        await gitWorktreeRemove(cwd, dir)
                    else if (own && !(await this.preserve(cwd, task, `worktree "${dir}" with uncommitted change set`, log)))
                        await log("warning", `worktree "${dir}" with uncommitted change set kept for a manual recovery`)
                }
            }
        }
        else if (changeset.type === "worktree" && !parallel) {
            /*  process into the working copy (held for this task, see "changesetReady") only
                if it still carries no uncommitted changes (except the ASE state), and switch
                the working copy to the source branch  */
            if (!(await gitClean(cwd)))
                throw new Error("agent: working copy has uncommitted changes (e.g. the change set of an earlier task) " +
                    "-- cannot implement task into it")
            if (source.type === "branch") {
                const { stdout: branch } = await execaJob("git", [ "branch", "--show-current" ], { cwd })
                if (branch.trim() !== source.name)
                    await execaJob("git", [ "switch", "--quiet", source.name ], { cwd })
            }
        }

        /*  the snapshot of a "worktree" changeset is captured from the working copy itself (as
            it was clean before, it carries the change set only), resp. from the ASE worktree of
            the task (created by the skill, so there is no change set if it is missing)  */
        const capture = async (partial: boolean): Promise<AgentSnapshot> => {
            if (changeset.type === "attachment")
                return changeset.name !== snapshot ? "obsolete" : null
            const dir = parallel ? await contextDir(cwd, task) : cwd
            return parallel && dir === cwd ? null : this.worktreeSnapshot(dir, base, partial)
        }
        return {
            cwd, dirs: [], sourceDir: "",
            changesetWorktree: changeset.type === "worktree" && parallel ? worktreeId(task.id) : "",
            ...(snapshot !== "" ? { snapshot: capture } : {})
        }
    }

    /*  whether a task is ready for the review access to its "Changeset:" (see
        "changesetReadJob"): a task whose uncommitted "worktree" change set is located
        directly in the working copy the agent is started in (and not in an ASE worktree
        of it) is processed (and hence staged) only while the working copy is held for it
        alone (see "holdRoot"), else it is deferred  */
    private async changesetReadReady (task: AgentTask): Promise<boolean> {
        let changeset: FlowValue
        try {
            changeset = taskFlow(this.log, task, "Changeset")
        }
        catch (_err) {
            /*  an invalid value fails the processing of the task  */
            return true
        }
        const root = this.localRoot([ changeset ])
        if (changeset.type === "worktree" && root !== ""
            && (await contextDir(root, task).catch(() => "")) === root && !this.holdRoot(task, root))
            return this.host.defer(task, "the working copy used by another task")
        return true
    }

    /*  the work of a job with review access to the "Changeset:" of a task (see
        "changesetReadReady"): a "worktree" changeset staged in its context worktree, a
        "branch:" changeset left in place (to be addressed by its name), and an "attachment:"
        changeset applied staged in a temporary worktree "<id>-<name>-<suffix>", detached at
        the commit it is based on, which is removed afterwards  */
    private async changesetReadJob (task: AgentTask, suffix: string): Promise<AgentWork> {
        const changeset = taskFlow(this.log, task, "Changeset")
        const root      = await this.workdir(task, [ changeset ])
        if (changeset.type === "branch")
            return { cwd: root, dirs: [], sourceDir: "", changesetWorktree: "" }
        else if (changeset.type === "attachment") {
            /*  materialize the change set attachment in a temporary worktree,
                detached at the commit it is based on, staged for the review  */
            const kind = new RegExp(`^text/x-diff\\s*;.*\\bkind\\s*=\\s*"?${changeset.name}"?\\s*(?:;|$)`, "i")
            const attachment = (await Task.attachments(this.log, task.id)).filter((att) => kind.test(att.type)).pop()
            if (attachment?.data === undefined)
                throw new Error(`agent: no change set attachment "${changeset.name}" exists`)
            const base = /\bbase\s+([0-9a-f]+)\b/.exec(attachment.desc)?.[1] ?? "HEAD"
            const dir  = Worktree.dir(`${worktreeId(task.id)}-${changeset.name}-${suffix}`, true, true, root)
            await gitWorktreeDetached(root, dir, base)
            try {
                await execaJob("git", [ "apply", "--index" ], { cwd: dir, input: attachment.data })
            }
            catch (err: unknown) {
                await gitWorktreeRemove(root, dir)
                throw err
            }
            return { cwd: dir, dirs: [], sourceDir: "", changesetWorktree: "", cleanup: () => gitWorktreeRemove(root, dir) }
        }
        else {
            /*  stage the uncommitted change set in its context worktree  */
            const cwd = await contextDir(root, task)
            await execaJob("git", [ "add", "--all", "--", ".", ":(exclude).ase" ], { cwd })
            return { cwd, dirs: [], sourceDir: "", changesetWorktree: "" }
        }
    }

    /*  whether a task is ready for the integration access to its "Changeset:" and
        "Target:" (see "targetJob"): a task integrated from or into the working copy the
        agent is started in directly (an uncommitted "worktree" change set located in it, a
        "branch:" changeset checked out in it, whose uncommitted changes the skill commits and
        which it rebases in place, a "worktree" target, or a "branch:" target checked out in
        it) is processed only while the working copy is held for it alone (see "holdRoot"),
        and a task with a "branch:" changeset or target is processed only while these branches
        are held for it alone (see "holdBranch"), as another task (e.g. one implemented into
        the same changeset branch, or into this target branch) would otherwise be processed in
        the same worktree at once (mixing their change sets, and merging, rebasing, or removing
        the worktree under each other), else it is deferred  */
    private async targetReady (task: AgentTask): Promise<boolean> {
        let changeset: FlowValue
        let target:    FlowValue
        try {
            changeset = taskFlow(this.log, task, "Changeset")
            target    = taskFlow(this.log, task, "Target")
        }
        catch (_err) {
            /*  an invalid value fails the processing of the task  */
            return true
        }
        const root = this.localRoot([ changeset, target ])
        if (changeset.type === "branch" && !this.holdBranch(task, root, changeset.name))
            return this.host.defer(task, `the changeset branch "${changeset.name}" used by another task`)
        else if (target.type === "branch" && !this.holdBranch(task, root, target.name))
            return this.host.defer(task, `the target branch "${target.name}" used by another task`)
        else if (root === "")
            return true
        const direct = target.type === "worktree"
            || (changeset.type === "worktree" && (await contextDir(root, task).catch(() => "")) === root)
            || (changeset.type === "branch" && (await gitWorktree(root, changeset.name).catch(() => "")) === root)
            || (target.type === "branch" && (await gitWorktree(root, target.name).catch(() => "")) === root)
        if (direct && !this.holdRoot(task, root))
            return this.host.defer(task, "the working copy used by another task")
        return true
    }

    /*  the work of a job with integration access to the "Changeset:" and "Target:" of a task
        (see "targetReady"), in the working copy itself, granting access to the context worktree
        of a "worktree" changeset (whose ASE worktree id the skill selects) and to the worktrees in
        which the changeset and target branches are checked out, where a target branch not checked
        out anywhere yet is checked out in a temporary worktree "<id>-<suffix>", and where the
        change set snapshot of the change set which finally landed on the target branch is
        captured on request (for its attachment of the kind <snapshot>, else empty)  */
    private async targetJob (task: AgentTask, suffix: string, snapshot: string): Promise<AgentWork> {
        const changeset = taskFlow(this.log, task, "Changeset")
        const target    = taskFlow(this.log, task, "Target")
        const root      = await this.workdir(task, [ changeset, target ])
        const dirs: string[] = []
        let context = ""
        if (changeset.type === "worktree") {
            const dir = await contextDir(root, task)
            context = worktreeName(root, dir)
            dirs.push(dir)
        }
        else if (changeset.type === "branch")
            dirs.push(await gitWorktree(root, changeset.name))

        /*  check out a target branch not checked out anywhere yet in a temporary
            worktree, into which the merge commits, and afterwards publish the
            target branch to the origin of a temporarily cloned repository (deleting
            there a changeset branch which the merge deleted) and remove the
            temporary worktree again in any case, where a target branch not moved by
            the skill is not published (as it carries nothing to publish, but might be
            outdated by the origin meanwhile, whose rejected push would then needlessly
            fail the task and preserve the clone), a target branch which could
            not be published is rescued (as the skill already recorded the task as
            integrated, see "Agent.settle"), so its merge is not lost, while a changeset
            branch which could not be deleted is only reported (as the merge itself
            was already published)  */
        const tip = async (branch: string): Promise<string> =>
            (await execaJob("git", [ "rev-parse", "--verify", "--quiet", `refs/heads/${branch}` ],
                { cwd: root, reject: false })).stdout.trim()
        let temp = ""
        let base = ""
        if (target.type === "branch") {
            let dir = await gitWorktree(root, target.name)
            if (dir === "") {
                temp = Worktree.dir(`${worktreeId(task.id)}-${suffix}`, true, true, root)
                await gitWorktreeAdd(root, temp, target.name)
                dir = temp
            }
            dirs.push(dir)
            base = await tip(target.name)
        }

        /*  the snapshot of a "worktree" or "branch:" changeset is the change of the target
            branch (a "worktree" target being the branch checked out in the working copy) by
            its integration, unless the task was not integrated or its content did not change
            (as the change set already landed earlier)  */
        const branch = snapshot === "" || changeset.type === "attachment" ? "" : target.type === "branch" ? target.name :
            (await execaJob("git", [ "branch", "--show-current" ], { cwd: root })).stdout.trim()
        const before = branch !== "" ? await tip(branch) : ""
        const capture = async (partial: boolean): Promise<AgentSnapshot> => {
            const after = await tip(branch)
            if (partial || after === "" || after === before)
                return null
            const tree = async (commit: string) =>
                (await execaJob("git", [ "rev-parse", `${commit}^{tree}` ], { cwd: root })).stdout.trim()
            if (await tree(after) === await tree(before))
                return null
            const { base: fork, diff } = await gitChangesetDiff(root, before, after)
            return diff !== "" ? { desc: `base ${fork}, merged ${after}`, diff } : null
        }
        return {
            cwd:  root,
            dirs: dirs.filter((dir) => dir !== ""),
            sourceDir: "",
            changesetWorktree: context,
            ...(before !== "" ? { snapshot: capture } : {}),
            finish: async (log: AgentLog) => {
                const reason = (err: unknown) => err instanceof Error ? err.message : String(err)
                if (target.type === "branch" && await tip(target.name) === base)
                    await log("info", `target branch "${target.name}" unchanged -- nothing to publish`)
                else if (target.type === "branch")
                    await this.publish(root, target.name, log).catch(async (err: unknown) => {
                        await this.rescue(root, target.name, task, log).catch((err2: unknown) =>
                            log("error", `rescuing branch "${target.name}" failed: ${reason(err2)}`))
                        throw err
                    })
                if (changeset.type === "branch")
                    await this.unpublish(root, changeset.name, log).catch((err: unknown) =>
                        log("warning", `changeset branch "${changeset.name}" not deleted from origin: ${reason(err)}`))
            },
            cleanup: async () => {
                if (temp !== "")
                    await gitWorktreeRemove(root, temp)
            }
        }
    }
}

