/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import path            from "node:path"
import os              from "node:os"
import fs              from "node:fs"

import { execaSync }   from "execa"
import picomatch       from "picomatch"
import { LRUCache }    from "lru-cache"

/*  a single Git exclude rule, pre-compiled into a picomatch matcher  */
export type IgnoreRule = { matcher: (p: string) => boolean, negated: boolean, dirOnly: boolean }

/*  reusable functionality: decide which project-relative paths Git
    excludes from the project, honoring the same three rule sources and
    the same precedence order as Git itself -- the global excludes file,
    the repository-local "info/exclude", and the per-directory
    ".gitignore" files from the project root down to the path  */
export class Ignore {
    /*  translate a single Git exclude line into a picomatch-backed rule,
        honoring the anchored-vs-floating, directory-only, and negation
        semantics of the pattern; an anchored pattern resolves relative
        to the "base" directory its rule file governs  */
    private static compile (line: string, base: string): IgnoreRule | null {
        let pattern = line.trim()
        if (pattern === "" || pattern.startsWith("#"))
            return null
        let negated = false
        if (pattern.startsWith("!")) {
            negated = true
            pattern = pattern.slice(1)
        }
        let dirOnly = false
        if (pattern.endsWith("/")) {
            dirOnly = true
            pattern = pattern.slice(0, -1)
        }
        const anchored = pattern.includes("/")
        if (pattern.startsWith("/"))
            pattern = pattern.slice(1)
        const glob    = anchored ? (base === "" ? pattern : `${base}/${pattern}`) : `**/${pattern}`
        const isMatch = picomatch(glob, { dot: true })
        return { matcher: (p: string) => isMatch(p), negated, dirOnly }
    }

    /*  load the rules of a single exclude file, given as absolute "file"
        and the project-relative "base" its anchored patterns resolve
        against; a missing file simply contributes no rules  */
    private static load (file: string, base: string): IgnoreRule[] {
        if (file === "" || !fs.existsSync(file))
            return []
        const rules: IgnoreRule[] = []
        for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
            const rule = Ignore.compile(line, base)
            if (rule !== null)
                rules.push(rule)
        }
        return rules
    }

    /*  load the ".gitignore" rules located directly in a directory,
        given as absolute "dir" and project-relative "relDir"  */
    static rules (dir: string, relDir: string): IgnoreRule[] {
        return Ignore.load(path.join(dir, ".gitignore"), relDir)
    }

    /*  resolve the global Git excludes file: the configured
        "core.excludesFile", or else the XDG location Git falls back
        onto when that configuration value is unset  */
    private static globalFile (): string {
        let file = ""
        try {
            file = execaSync("git", [ "config", "--get", "core.excludesFile" ],
                { stderr: "ignore" }).stdout.trim()
        }
        catch {
            /*  no such configuration value  */
        }
        if (file === "") {
            const xdg = process.env.XDG_CONFIG_HOME
            return xdg !== undefined && xdg !== "" ?
                path.join(xdg, "git", "ignore") :
                path.join(os.homedir(), ".config", "git", "ignore")
        }
        if (file.startsWith("~/"))
            file = path.join(os.homedir(), file.slice(2))
        return file
    }

    /*  resolve the repository-local exclude file, held by the Git
        *common* directory, so that a Git worktree shares the exclude
        file of the main working tree it was created from  */
    private static infoFile (root: string): string {
        try {
            const dir = execaSync("git", [ "rev-parse", "--git-common-dir" ],
                { cwd: root, stderr: "ignore" }).stdout.trim()
            if (dir !== "")
                return path.join(path.resolve(root, dir), "info", "exclude")
        }
        catch {
            /*  not inside a Git working tree  */
        }
        return ""
    }

    /*  cached repository-wide rules (TTL-bounded, as the ASE service is
        long-running and both the Git configuration and the exclude files
        can change underneath it; each determination spawns Git, too)  */
    private static baseCache = new LRUCache<string, IgnoreRule[]>({ max: 4, ttl: 10 * 1000 })

    /*  the rules which no directory of the project owns and which hence
        govern the project as a whole, in ascending Git precedence: the
        global excludes file first, the repository-local "info/exclude"
        second, so a later rule overrides an earlier one as it does in
        Git; both anchor their patterns at the project root  */
    static base (root: string): IgnoreRule[] {
        const cached = Ignore.baseCache.get(root)
        if (cached !== undefined)
            return cached
        const rules = [
            ...Ignore.load(Ignore.globalFile(), ""),
            ...Ignore.load(Ignore.infoFile(root), "")
        ]
        Ignore.baseCache.set(root, rules)
        return rules
    }

    /*  decide whether a project-relative path is excluded by the given
        ordered rule set, where the last matching rule wins  */
    static matches (rel: string, isDir: boolean, rules: IgnoreRule[]): boolean {
        let ignored = false
        for (const rule of rules) {
            if (rule.dirOnly && !isDir)
                continue
            if (rule.matcher(rel))
                ignored = !rule.negated
        }
        return ignored
    }
}
