/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import path           from "node:path"
import os             from "node:os"
import fs             from "node:fs"

import { execaSync }  from "execa"
import { LRUCache }   from "lru-cache"

/*  single scope term  */
export type ScopeTerm =
    | { kind: "default"             }
    | { kind: "user"                }
    | { kind: "project"             }
    | { kind: "task",    id: string }
    | { kind: "session", id: string }

/*  a scope chain (one or more terms, canonical order default<user<project<task<session)  */
export type Scope = ScopeTerm[]

/*  canonical ordering rank of a scope kind  */
const scopeRank = (kind: ScopeTerm["kind"]): number =>
    ({ default: -1, user: 0, project: 1, task: 2, session: 3 })[kind]

/*  parse a single scope term  */
const parseScopeTerm = (value: string): ScopeTerm => {
    if (value === "user")
        return { kind: "user" }
    else if (value === "project")
        return { kind: "project" }
    const m = /^(session|task):([A-Za-z0-9._-]+)$/.exec(value)
    if (m !== null) {
        if (m[2] === "." || m[2] === "..")
            throw new Error(`invalid --scope term "${value}": id must not be "." or ".."`)
        return { kind: m[1] as "session" | "task", id: m[2] }
    }
    throw new Error(`invalid --scope term "${value}" ` +
        "(expected: \"user\", \"project\", \"task:<id>\", or \"session:<id>\")")
}

/*  determine the Git top-level directory, if inside a Git repository;
    cached per working directory ("" ≡ not inside a Git working tree), as
    each determination spawns a Git subprocess and the Git context can
    change over the lifetime of the long-running ASE service  */
const gitToplevelCache = new LRUCache<string, string>({ max: 4, ttl: 2 * 1000 })
const gitToplevel = (): string | null => {
    const cwd    = process.cwd()
    const cached = gitToplevelCache.get(cwd)
    if (cached !== undefined)
        return cached === "" ? null : cached
    let top = ""
    try {
        top = execaSync("git", [ "rev-parse", "--show-toplevel" ], { stderr: "ignore" }).stdout.trim()
    }
    catch {
        /*  not inside a Git working tree  */
    }
    gitToplevelCache.set(cwd, top)
    return top === "" ? null : top
}

/*  resolve the per-OS user-scope configuration directory  */
export const userConfigDir = (): string => {
    if (process.platform === "darwin")
        /*  macOS  */
        return path.join(os.homedir(), "Library", "Application Support", "ase")
    else if (process.platform === "win32")
        /*  Windows (roaming)  */
        return path.join(process.env.APPDATA ?? os.homedir(), "ase")
    else {
        /*  Linux  */
        const xdg  = process.env.XDG_CONFIG_HOME
        const base = xdg !== undefined && xdg !== "" ? xdg : path.join(os.homedir(), ".config")
        return path.join(base, "ase")
    }
}

/*  resolve the per-OS user-scope state directory (per-session state and
    other machine-local runtime information, never roamed or versioned)  */
export const userStateDir = (): string => {
    if (process.platform === "darwin")
        /*  macOS  */
        return path.join(os.homedir(), "Library", "Application Support", "ase")
    else if (process.platform === "win32")
        /*  Windows (local)  */
        return path.join(process.env.LOCALAPPDATA ?? process.env.APPDATA ?? os.homedir(), "ase")
    else {
        /*  Linux  */
        const xdg  = process.env.XDG_STATE_HOME
        const base = xdg !== undefined && xdg !== "" ? xdg : path.join(os.homedir(), ".local", "state")
        return path.join(base, "ase")
    }
}

/*  ensure a self-ignoring ".ase/.gitignore" covering the machine-local runtime
    files, so they never show up as untracked files in any project; an existing
    file is left untouched, as the project may maintain its own rules  */
export const ensureAseGitignore = (aseDir: string): void => {
    const file = path.join(aseDir, ".gitignore")
    if (fs.existsSync(file))
        return
    const rules = [ ".gitignore", "*.lock", "board.yaml", "service.log", "service.yaml", "worktree/" ]
    try {
        fs.mkdirSync(aseDir, { recursive: true })
        fs.writeFileSync(file, `#   ASE machine-local runtime files (generated)\n${rules.join("\n")}\n`,
            { encoding: "utf8", flag: "wx" })
    }
    catch {
        /*  intentionally ignore errors (e.g. concurrent creation or read-only
            project), as a missing ignore file must never block the operation  */
    }
}

/*  determine the project root directory, i.e. either the top-level
    directory of the Git working tree or the nearest directory at or
    above cwd which carries a ".ase" directory (excluding the home
    directory, where a stale "~/.ase" of older ASE versions may exist)  */
export const projectRoot = (): string | null => {
    const top = gitToplevel()
    if (top !== null)
        return top
    let dir = fs.realpathSync(process.cwd())
    const home = fs.realpathSync(os.homedir())
    for (;;) {
        if (dir !== home && fs.existsSync(path.join(dir, ".ase")))
            return dir
        const parent = path.dirname(dir)
        if (parent === dir)
            return null
        dir = parent
    }
}

/*  derive the fallback project id from the sanitized basename of a
    project root (shared by task store, hook, service, and statusline);
    for a multi-worktree setup "<basedir>/<branch>/" with an "active" symlink
    in "<basedir>/" (pointing to one of the worktrees) the id is
    "<basedir>-<branch>", as the bare branch name (e.g. "master") is not unique  */
export const projectIdOf = (root: string): string => {
    let name = path.basename(root)
    const parent = path.dirname(root)
    if (name !== "" && parent !== root) {
        try {
            if (fs.lstatSync(path.join(parent, "active")).isSymbolicLink())
                name = `${path.basename(parent)}-${name}`
        }
        catch {
            /*  no "active" symlink, so no multi-worktree setup  */
        }
    }
    return name.replace(/[^A-Za-z0-9_-]/g, "_") || "project"
}

/*  detect whether a project context exists, i.e. either we are inside
    a Git working tree or a ".ase" directory is present at or above cwd  */
const hasProjectContext = (): boolean =>
    projectRoot() !== null

/*  parse a raw "--scope" option value into a canonical Scope chain;
    accepts a comma-separated list of terms in any order. The "user"
    term is always implicitly added at the bottom of the chain; the
    "project" term is implicitly added only when a project context
    exists (Git repository or ".ase" directory at or above cwd) and it
    stays weaker than the strongest explicitly requested term, and an
    explicit "project" term requires that same context  */
export const parseScope = (value: string | undefined): Scope => {
    const projectActive = hasProjectContext()
    const input         = (value === undefined || value === "") ?
        (projectActive ? "project" : "user") :
        value.trim()
    if (input === "")
        throw new Error("invalid --scope: value must not be empty")
    const terms: ScopeTerm[] = input.split(",").map((s) => parseScopeTerm(s.trim()))
    const seen = new Set<string>()
    for (const t of terms) {
        if (seen.has(t.kind))
            throw new Error(`invalid --scope: duplicate term of kind "${t.kind}"`)
        seen.add(t.kind)
    }
    if (seen.has("project") && !projectActive)
        throw new Error("invalid --scope: \"project\" requires a project context " +
            "(a Git repository or a \".ase\" directory at or above the current directory)")
    /*  the strongest term of the chain is the write target, so an implicitly
        added "project" term must never outrank the strongest explicitly
        requested term, as this would silently retarget the caller's request  */
    const rankMax = Math.max(...terms.map((t) => scopeRank(t.kind)))
    if (!seen.has("project") && projectActive && rankMax > scopeRank("project"))
        terms.unshift({ kind: "project" })
    if (!seen.has("user"))
        terms.unshift({ kind: "user" })
    terms.sort((a, b) => scopeRank(a.kind) - scopeRank(b.kind))
    terms.unshift({ kind: "default" })
    return terms
}
