/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import crypto                       from "node:crypto"
import fs                           from "node:fs"
import os                           from "node:os"
import path                         from "node:path"
import { stripVTControlCharacters } from "node:util"
import { AsyncLocalStorage }        from "node:async_hooks"

import { execa }                    from "execa"

import { Worktree }                 from "./ase-util-worktree.js"
import type { AgentTask, AgentLog } from "./ase-agent-runtime.js"

/*  the temporary directory of an agent, and the base directory of "--tempdir"
    if created by the agent (else empty)  */
export type TempDir = { dir: string, base: string }

/*  the hash value of "%h" in "--tempdir", unique to the agent process  */
const tempHash = crypto.randomBytes(4).toString("hex")

/*  the files in a temporary directory of an agent recording the process id of the
    owning agent process, and marking work preserved for a manual recovery  */
const tempOwner     = ".owner"
export const tempPreserved = ".preserved"

/*  whether a process of this host is alive (where one of another user counts as alive)  */
export const pidAlive = (pid: number): boolean => {
    if (!Number.isInteger(pid) || pid <= 0)
        return false
    try {
        process.kill(pid, 0)
        return true
    }
    catch (err: unknown) {
        return (err as NodeJS.ErrnoException).code === "EPERM"
    }
}

/*  the start time of a process (as rendered by "ps", else empty if unavailable, e.g. on
    Windows), which identifies the process beyond its process id (as the latter is reused)  */
export const pidStart = async (pid: number): Promise<string> => {
    if (!Number.isInteger(pid) || pid <= 0)
        return ""
    const result = await execa("ps", [ "-o", "lstart=", "-p", String(pid) ],
        { reject: false, stdin: "ignore", timeout: 10 * 1000 })
    return result.exitCode === 0 ? result.stdout.trim() : ""
}

/*  create the private temporary directory of an agent: without a "--tempdir" specification
    <spec> securely as a fresh, unique directory below the system temporary directory, else as
    the sub-directory <name> of the "--tempdir" directory, whose "%p" is expanded to the process
    id, "%h" to the hash value, and "%%" to "%", which is created privately if missing, and else
    has to be a non-aliased directory owned by the current user (a leftover sub-directory of an
    earlier run which stopped before its cleanup is replaced, but neither one of a still running
    agent process, e.g. of another "ase agent" with the same agent name and the same fixed
    "--tempdir", nor one holding work preserved for a manual recovery)  */
export const tempDir = async (name: string, spec: string): Promise<TempDir> => {
    if (spec === "")
        return { dir: await fs.promises.realpath(await fs.promises.mkdtemp(path.join(os.tmpdir(), `ase-agent-${name}-`))), base: "" }
    const base = path.resolve(spec.replace(/%([ph%])/g, (_m, c: string) =>
        c === "p" ? String(process.pid) : c === "h" ? tempHash : "%"))
    const created = await fs.promises.mkdir(base, { recursive: true, mode: 0o700 }) !== undefined
    const st = await fs.promises.lstat(base)
    if (st.isSymbolicLink() || !st.isDirectory() || (process.getuid !== undefined && st.uid !== process.getuid()))
        throw new Error(`agent: temporary directory "${base}" is no directory owned by the current user`)
    const dir   = path.join(await fs.promises.realpath(base), name)
    const inUse = () => new Error(`agent: temporary directory "${dir}" is in use by another running agent process ` +
        "(use a \"--tempdir\" with \"%p\" or \"%h\", or another \"--name\")")
    if (fs.existsSync(dir)) {
        const pid = Number.parseInt(await fs.promises.readFile(path.join(dir, tempOwner), "utf8").catch(() => ""), 10)
        if (pid !== process.pid && pidAlive(pid))
            throw inUse()
        if (fs.existsSync(path.join(dir, tempPreserved)))
            throw new Error(`agent: temporary directory "${dir}" holds work preserved by an earlier run ` +
                `(see "${path.join(dir, tempPreserved)}") -- recover and remove it manually`)
        await fs.promises.rm(dir, { recursive: true, force: true })
    }
    await fs.promises.mkdir(dir, { mode: 0o700 }).catch((err: unknown) => {
        throw (err as NodeJS.ErrnoException).code === "EEXIST" ? inUse() : err
    })
    await fs.promises.writeFile(path.join(dir, tempOwner), `${process.pid}\n`)
    return { dir, base: created ? base : "" }
}

/*  the tails of the in-process mutual exclusions per key  */
const exclusions = new Map<string, Promise<void>>()

/*  run an operation in mutual exclusion to all other operations of the same key in this process  */
export const exclusive = async <T> (key: string, op: () => Promise<T>): Promise<T> => {
    const prev = exclusions.get(key) ?? Promise.resolve()
    let done = () => {}
    const gate = new Promise<void>((resolve) => { done = resolve })
    const tail = prev.then(() => gate)
    exclusions.set(key, tail)
    try {
        await prev
        return await op()
    }
    finally {
        done()
        if (exclusions.get(key) === tail)
            exclusions.delete(key)
    }
}

/*  the fixed maximum duration of the preparing and the finishing of a job,
    and of each Git command run by them, so a hanging one (e.g. a "git push"
    waiting for credentials) is killed instead of left behind  */
const jobTimeout = 240 * 1000

/*  the cancellation of the operation of a job currently run (see "withinJobTimeout"),
    implicitly passed to every command run within it, so a timed out operation
    does not leave its commands running (e.g. into the cleaning up of the job)  */
export const jobScope = new AsyncLocalStorage<AbortSignal>()

/*  run a command of the preparing or the finishing of a job (or of the setup of the agent),
    where Git never prompts for credentials (as nobody could answer them anyway), as its
    standard input is ignored (unless fed with <input>), and where the command is killed
    once the operation of the job it runs within timed out  */
type JobOptions = { cwd?: string, reject?: boolean, input?: string, env?: Record<string, string> }
const execaJobBase = execa({ timeout: jobTimeout, env: { GIT_TERMINAL_PROMPT: "0" } })
export const execaJob = (file: string, args: readonly string[], options: JobOptions = {}) => {
    const { input, ...rest } = options
    return execaJobBase(file, args, {
        cancelSignal: jobScope.getStore(),
        ...(input !== undefined ? { input } : { stdin: "ignore" as const }),
        ...rest
    })
}

/*  the cancellation of the operation of a job currently run (if any, see "withinJobTimeout")  */
export const jobSignal = (): AbortSignal | undefined =>
    jobScope.getStore()

/*  run a command <file> with its arguments <args> without a shell for a hook of a definition
    (like "execaJob", but cancelled by <signal>), resolving to its exit code (or -1 if it did
    not exit regularly, e.g. if not found, killed on its timeout, or cancelled) and its outputs  */
type HookExecOptions = { cwd: string, env?: Readonly<Record<string, string>>, input?: string, signal: AbortSignal }
type HookExecResult  = { code: number, stdout: string, stderr: string }
export const execHook = async (file: string, args: readonly string[], options: HookExecOptions): Promise<HookExecResult> => {
    const result = await execaJobBase(file, args, {
        cwd:          options.cwd,
        env:          { GIT_TERMINAL_PROMPT: "0", ...options.env },
        reject:       false,
        cancelSignal: options.signal,
        ...(options.input !== undefined ? { input: options.input } : { stdin: "ignore" as const })
    })
    const code = typeof result.exitCode === "number" && !result.isTerminated && !result.isCanceled ? result.exitCode : -1
    return {
        code,
        stdout: String(result.stdout ?? ""),
        stderr: String(result.stderr ?? "") || (code < 0 ? result.shortMessage ?? "" : "")
    }
}

/*  run a shell command of the preparing or the finishing of a job in the working directory
    <cwd> with the additional environment variables <env> (like "execaJob"), logging its
    output lines, and throwing on its failure  */
export const shellJob = async (cmd: string, cwd: string, env: Record<string, string>, log: AgentLog): Promise<void> => {
    await log("info", `running: ${cmd}`)
    const result = await execaJobBase(cmd, {
        shell: true, cwd, env, all: true, reject: false, stdin: "ignore", cancelSignal: jobScope.getStore()
    })
    for (const line of stripVTControlCharacters(result.all ?? "").split("\n"))
        if (line.trim() !== "")
            await log("info", line)
    if (result.failed)
        throw new Error(`agent: command "${cmd}" failed: ${result.exitCode !== undefined ?
            `exit code ${result.exitCode}` : result.shortMessage}`)
}

/*  run an operation (e.g. the preparing) of a job within its fixed maximum duration,
    where the commands of the operation are killed on timeout (see "jobScope") and the
    operation itself (which still has to end) is passed on timeout to <late> (if given),
    so the resources it still creates afterwards can be released  */
export const withinJobTimeout = async <T> (what: string, op: () => Promise<T>, late?: (pending: Promise<T>) => void): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const controller = new AbortController()
    const pending    = jobScope.run(controller.signal, op)
    try {
        return await Promise.race([
            pending,
            new Promise<never>((_resolve, reject) => {
                timer = setTimeout(() => {
                    controller.abort()
                    late?.(pending)
                    reject(new Error(`agent: ${what} timed out after ${jobTimeout / 1000}s`))
                }, jobTimeout)
            })
        ])
    }
    finally {
        clearTimeout(timer)
    }
}

/*  whether the directory <cwd> (default: the current working directory) is inside a Git working copy  */
export const gitInside = async (cwd?: string): Promise<boolean> =>
    (await execaJob("git", [ "rev-parse", "--show-toplevel" ], { cwd, reject: false })).exitCode === 0

/*  run Git operations changing the shared state of a Git repository (its references and its
    worktrees) in mutual exclusion per repository in this process, identified by the common Git
    directory of its working copy <root>, so tasks processed concurrently never collide on the
    locks of Git (e.g. "index.lock" or a reference lock), where the operations must not nest  */
export const gitLocked = async <T> (root: string, op: () => Promise<T>): Promise<T> => {
    const { stdout } = await execaJob("git", [ "rev-parse", "--git-common-dir" ], { cwd: root })
    return exclusive(`git:${await fs.promises.realpath(path.resolve(root, stdout.trim()))}`, op)
}

/*  the Git worktree directory of the repository of the working copy <root>
    in which a branch is checked out, or empty if none  */
export const gitWorktree = async (root: string, branch: string): Promise<string> => {
    const { stdout } = await execaJob("git", [ "worktree", "list", "--porcelain" ], { cwd: root })
    let dir = ""
    for (const line of stdout.split("\n")) {
        if (line.startsWith("worktree "))
            dir = line.slice("worktree ".length)
        else if (line === `branch refs/heads/${branch}`)
            return dir
    }
    return ""
}

/*  forcibly remove a Git worktree (if any) of the repository of the working copy <root>
    (without the mutual exclusion of the repository, so it can be used within one)  */
export const worktreeRemove = async (root: string, dir: string): Promise<void> => {
    await execaJob("git", [ "worktree", "remove", "--force", dir ], { cwd: root, reject: false })
    await execaJob("git", [ "worktree", "prune" ], { cwd: root, reject: false })
}

/*  forcibly remove a Git worktree (if any) of the repository of the working copy <root>, e.g. a
    temporary one or the leftover of an earlier processing which stopped before its cleanup  */
export const gitWorktreeRemove = async (root: string, dir: string): Promise<void> =>
    gitLocked(root, () => worktreeRemove(root, dir))

/*  create a Git worktree of the repository of the working copy <root> with a branch
    checked out, where a still missing branch is created from the start point <start> (if given)  */
export const gitWorktreeAdd = async (root: string, dir: string, branch: string, start?: string): Promise<void> =>
    gitLocked(root, async () => {
        const exists = (await execaJob("git", [ "rev-parse", "--verify", "--quiet", `refs/heads/${branch}` ],
            { cwd: root, reject: false })).exitCode === 0
        const args   = exists || start === undefined ? [ dir, branch ] : [ "-b", branch, dir, start ]
        await worktreeRemove(root, dir)
        await execaJob("git", [ "worktree", "add", ...args ], { cwd: root })
    })

/*  create a temporary Git worktree of the repository of the working copy <root>,
    detached at the commit <commit> (replacing a leftover one)  */
export const gitWorktreeDetached = async (root: string, dir: string, commit: string): Promise<void> =>
    gitLocked(root, async () => {
        await worktreeRemove(root, dir)
        await execaJob("git", [ "worktree", "add", "--quiet", "--detach", dir, commit ], { cwd: root })
    })

/*  the id of the ASE worktree of a task (also used by the skills via "--worktree"),
    as a task id can carry "#" (e.g. "#12" of the "seq:#%d" id scheme of the issue
    tracker task stores), which an ASE worktree id (and a branch name derived from
    it) cannot, so it is replaced by "_" (e.g. "_12")  */
export const worktreeId = (id: string): string =>
    id.replace(/#/g, "_")

/*  the safe name of a task id (for the placeholder "{id}" of the change set flow values) or
    of a branch (for the ASE worktree of a "branch:" changeset), like by the skills: every
    character other than "A-Za-z0-9_-" replaced by "-", runs of "-" reduced to one, and
    leading and trailing "-" and "_" removed (e.g. "12" for "#12", "a-b" for "a/b")  */
export const safeName = (name: string): string =>
    name.replace(/[^A-Za-z0-9_-]/g, "-").replace(/-{2,}/g, "-").replace(/^[-_]+|[-_]+$/g, "")

/*  the context worktree holding the uncommitted change set of a "worktree"
    changeset: the ASE worktree named after the task if registered (as created
    by the parallel implementer), else the working copy <root>  */
export const contextDir = async (root: string, task: AgentTask): Promise<string> => {
    const dir = Worktree.dir(worktreeId(task.id), false, false, root)
    const { stdout } = await execaJob("git", [ "worktree", "list", "--porcelain" ], { cwd: root })
    return stdout.split("\n").includes(`worktree ${dir}`) ? dir : root
}

/*  the ASE worktree id of a working copy, as selected by the "--worktree" option of the
    skills as their context worktree: empty for the working copy <root>, else the id of
    its ASE worktree  */
export const worktreeName = (root: string, dir: string): string => {
    if (dir === root)
        return ""
    else if (path.dirname(dir) === Worktree.baseDir(false, false, root))
        return path.basename(dir)
    throw new Error(`agent: working copy "${dir}" is neither "${root}" nor an ASE worktree of it`)
}

/*  whether the Git working copy <dir> carries no uncommitted changes (except the ASE state)  */
export const gitClean = async (dir: string): Promise<boolean> => {
    const { stdout } = await execaJob("git", [ "status", "--porcelain", "--", ".", ":(exclude).ase" ], { cwd: dir })
    return stdout.trim() === ""
}

/*  the text-only unified diff of a change set in the Git working copy <dir> (always without
    the ASE state), from the fork point of its head from the commit <base> on, where the head
    is the commit <head>, or, if empty, the working tree of <dir>, including its untracked
    files, which are captured through a temporary index, so the index of <dir> stays untouched,
    resolving to the fork point and the diff (empty if there is no change set)  */
export const gitChangesetDiff = async (dir: string, base: string, head = ""): Promise<{ base: string, diff: string }> => {
    const { stdout: fork } = await execaJob("git", [ "merge-base", base, head !== "" ? head : "HEAD" ], { cwd: dir })
    const from  = fork.trim()
    const args  = [ "--no-color", "--no-ext-diff" ]
    const paths = [ "--", ".", ":(exclude).ase" ]
    let diff: string
    if (head !== "")
        diff = (await execaJob("git", [ "diff", ...args, from, head, ...paths ], { cwd: dir })).stdout
    else {
        const { stdout: index } = await execaJob("git", [ "rev-parse", "--path-format=absolute", "--git-path", "index" ], { cwd: dir })
        const temp = await fs.promises.mkdtemp(path.join(os.tmpdir(), "ase-agent-index-"))
        try {
            const env = { GIT_INDEX_FILE: path.join(temp, "index") }
            await fs.promises.copyFile(index.trim(), env.GIT_INDEX_FILE).catch((err: unknown) => {
                if ((err as NodeJS.ErrnoException).code !== "ENOENT")
                    throw err
            })
            await execaJob("git", [ "add", "--all", ...paths ], { cwd: dir, env })
            diff = (await execaJob("git", [ "diff", "--cached", ...args, from, ...paths ], { cwd: dir, env })).stdout
        }
        finally {
            await fs.promises.rm(temp, { recursive: true, force: true })
        }
    }
    return { base: from, diff: diff !== "" && !diff.endsWith("\n") ? `${diff}\n` : diff }
}

