/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import path                                   from "node:path"
import fs                                     from "node:fs"
import { fileURLToPath }                      from "node:url"

import { fuzzyMin, levenshtein, diceCoefficient } from "./ase-task-board-filter.js"

/*  a manual page of the browser: the "help.md" of a skill (with the id
    "<name>") or the Markdown source of the manual page of a CLI command
    (with the id "<name>.1", as skills and commands can share a name)  */
export type ManPage = {
    id:    string                   /*  unique id, e.g. "ase-task-edit" or "ase-task-edit.1"  */
    kind:  "skill" | "command"      /*  kind of the page                                      */
    label: string                   /*  display label, e.g. "ase-task-edit" or "ase task edit" */
    title: string                   /*  one-line title of the page                            */
    md:    string                   /*  Markdown source of the page                           */
    text:  string                   /*  lower-cased Markdown source, for searching            */
    words: Set<string>              /*  words of the lower-cased Markdown source              */
}

/*  a group of manual pages, as in the catalog of the website  */
export type ManGroup = { label: string, pages: ManPage[] }

/*  the catalog of all manual pages: the skill and command groups (in
    catalog order), all pages by id, and the vocabulary of all pages  */
export type Catalog = {
    skills:   ManGroup[]
    commands: ManGroup[]
    pages:    Map<string, ManPage>
    vocab:    Set<string>
}

/*  the grouping and ordering of the skills: a copy of the groups shown by the
    catalog of the website ("skillPrefixGroups" of "pages/src/data/skills.ts",
    in the column order of "Section-Usage.astro"), so keep both in sync, where
    any skill not listed here is caught by a trailing "OTHER" group  */
const skillGroups: [ string, string[] ][] = [
    [ "HELP",           [ "ase-help-skill", "ase-help-intent" ] ],
    [ "META: CONFIG",   [ "ase-meta-config", "ase-meta-compat" ] ],
    [ "META: EXPLAIN",  [ "ase-meta-why", "ase-meta-eli5" ] ],
    [ "META: JUDGE",    [ "ase-meta-evaluate", "ase-meta-diaboli", "ase-meta-steelman" ] ],
    [ "META: RESEARCH", [ "ase-meta-brainstorm", "ase-meta-search", "ase-meta-quorum",
        "ase-meta-proximity", "ase-meta-chat", "ase-meta-quotes" ] ],
    [ "META: GENERATE", [ "ase-meta-mint", "ase-meta-workflow" ] ],
    [ "ARCH",           [ "ase-arch-analyze", "ase-arch-discover" ] ],
    [ "DOCS",           [ "ase-docs-shorten", "ase-docs-refine", "ase-docs-proofread", "ase-docs-distill" ] ],
    [ "SPEC",           [ "ase-spec-lint", "ase-spec-edit", "ase-spec-activate" ] ],
    [ "CODE",           [ "ase-code-edit", "ase-code-analyze", "ase-code-insight", "ase-code-explain", "ase-code-lint" ] ],
    [ "REPO",           [ "ase-repo-review", "ase-repo-diff", "ase-repo-changelog", "ase-repo-commit",
        "ase-repo-dissect", "ase-repo-stage", "ase-repo-merge", "ase-repo-resolve" ] ],
    [ "SYNC",           [ "ase-sync-reconcile", "ase-sync-import", "ase-sync-export" ] ],
    [ "TASK: MANAGE",   [ "ase-task-list", "ase-task-rename", "ase-task-delete" ] ],
    [ "TASK: HANDLE",   [ "ase-task-id", "ase-task-status", "ase-task-assign" ] ],
    [ "TASK: EDIT",     [ "ase-task-edit", "ase-task-view", "ase-task-grill", "ase-task-research",
        "ase-task-estimate", "ase-task-reboot", "ase-task-condense", "ase-task-dissect" ] ],
    [ "TASK: EXECUTE",  [ "ase-task-implement", "ase-task-integrate" ] ]
]

/*  the order of the command groups: a copy of the column order of "manColumns"
    of "pages/src/data/manpages.ts", so keep both in sync, where any group not
    listed here (like the one of a newly added top-level command) is appended  */
const commandGroups = [ "Top-Level", "setup", "config", "service", "task", "spec", "util", "artifact", "agent", "hook" ]

/*  read the Markdown sources of the entries of a directory, by the page
    names and the relative source paths derived from the entry names  */
const readSources = (dir: string, pick: (entry: string) => [ string, string ] | null): Map<string, string> => {
    let entries: string[]
    try {
        entries = fs.readdirSync(dir)
    }
    catch (err) {
        throw new Error(`man: no manual pages found in "${dir}" (tool not completely built?)`, { cause: err })
    }
    const sources = new Map<string, string>()
    for (const entry of entries) {
        const picked = pick(entry)
        if (picked !== null && fs.existsSync(path.join(dir, picked[1])))
            sources.set(picked[0], fs.readFileSync(path.join(dir, picked[1]), "utf8"))
    }
    return sources
}

/*  create a manual page  */
const makePage = (id: string, kind: ManPage["kind"], label: string, title: string, md: string): ManPage => {
    const text = md.toLowerCase()
    return { id, kind, label, title, md, text, words: new Set(text.split(/[^a-z0-9]+/).filter((w) => w !== "")) }
}

/*  load the skill pages from the "help.md" files of the bundled plugin (see
    the "build-plugin" build step), grouped like the catalog of the website  */
const loadSkills = (): ManGroup[] => {
    const pkgdir  = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
    const dir     = path.join(pkgdir, "plugin", "skills")
    const sources = readSources(dir, (entry) => /^ase-[a-z0-9-]+$/.test(entry) ? [ entry, path.join(entry, "help.md") ] : null)
    const page = (name: string): ManPage => {
        const md = sources.get(name)!
        const m  = /^#+\s+NAME\s*\n+\s*`?[\w-]+`?\s+-+\s+(.+)$/m.exec(md)
        return makePage(name, "skill", name, m !== null ? m[1].trim() : name, md)
    }
    const listed = new Set(skillGroups.flatMap(([ , names ]) => names))
    const other  = [ ...sources.keys() ].filter((name) => !listed.has(name)).sort()
    return [ ...skillGroups, [ "OTHER", other ] as [ string, string[] ] ]
        .map(([ label, names ]) => ({ label, pages: names.filter((name) => sources.has(name)).map(page) }))
        .filter((group) => group.pages.length > 0)
}

/*  load the command pages from the Markdown sources of the manual pages
    (see the "build-man" build step), arranged into the command tree and
    grouped like the catalog of the website ("pages/src/data/manpages.ts")  */
const loadCommands = (): ManGroup[] => {
    const dir     = path.join(path.dirname(fileURLToPath(import.meta.url)), "man")
    const sources = readSources(dir, (entry) => /^ase(?:-[a-z0-9-]+)?\.md$/.test(entry) ? [ entry.slice(0, -3), entry ] : null)
    const names   = [ ...sources.keys() ].sort()

    /*  the parent of a page is the longest other page name it extends by a "-<suffix>"  */
    const parentOf = (name: string): string =>
        names.filter((other) => name.startsWith(other + "-"))
            .sort((a, b) => b.length - a.length)[0] ?? ""

    /*  the children of a page, ordered by their first "`<name>`(1)" reference
        within the COMMANDS section of the page (or the entire page), else alphabetically  */
    const childrenOf = (parent: string): string[] => {
        const md      = sources.get(parent)!
        const m       = /^## COMMANDS\s*$([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(md)
        const section = m !== null ? m[1] : md
        const pos = (name: string) => {
            const idx = section.indexOf("`" + name + "`(1)")
            return idx >= 0 ? idx : Infinity
        }
        return names.filter((name) => parentOf(name) === parent)
            .sort((a, b) => (pos(a) - pos(b)) || a.localeCompare(b))
    }

    /*  flatten the command tree depth-first  */
    const tree = [] as { page: ManPage, depth: number }[]
    const walk = (name: string, label: string, depth: number) => {
        const md = sources.get(name)!
        const m  = /^#\s+\S+\(1\)\s+--\s+(.+)$/m.exec(md)
        tree.push({ page: makePage(`${name}.1`, "command", label, m !== null ? m[1].trim() : name, md), depth })
        for (const child of childrenOf(name))
            walk(child, label + " " + child.slice(name.length + 1), depth + 1)
    }
    for (const root of names.filter((name) => parentOf(name) === ""))
        walk(root, root.replace(/-/g, " "), 0)

    /*  group the command tree: "ase" itself and the top-level commands without
        sub-commands form the "Top-Level" group, and every other top-level
        command forms an own group with all of its deeper commands  */
    const groups: ManGroup[] = [ { label: "Top-Level", pages: [] } ]
    for (const { page, depth } of tree) {
        if (depth === 0)
            groups[0].pages.push(page)
        else if (depth === 1) {
            if (tree.some((other) => other.depth > 1 && other.page.label.startsWith(page.label + " ")))
                groups.push({ label: page.label.slice(page.label.lastIndexOf(" ") + 1), pages: [ page ] })
            else
                groups[0].pages.push(page)
        }
        else
            groups[groups.length - 1].pages.push(page)
    }
    const rank = (group: ManGroup) => {
        const idx = commandGroups.indexOf(group.label)
        return idx >= 0 ? idx : commandGroups.length
    }
    return groups
        .filter((group) => group.pages.length > 0)
        .sort((a, b) => rank(a) - rank(b))
        .map((group) => ({ ...group, label: group.label.toUpperCase() }))
}

/*  load the catalog of all manual pages  */
export const loadCatalog = (): Catalog => {
    const skills   = loadSkills()
    const commands = loadCommands()
    const pages    = new Map([ ...skills, ...commands ].flatMap((group) => group.pages).map((page) => [ page.id, page ]))
    const vocab    = new Set([ ...pages.values() ].flatMap((page) => [ ...page.words ]))
    return { skills, commands, pages, vocab }
}

/*  find the page fitting exactly onto the words of a page name or command path,
    which are joined with dashes, where the "ase" prefix is optional, the name is
    case-insensitive, and of a skill and a command of the same name, a page name
    (e.g. "task-edit") prefers the skill, while a command path (e.g. "task edit")
    prefers the command  */
export const findPage = (catalog: Catalog, words: string[]): ManPage | undefined => {
    const parts   = words.join(" ").trim().toLowerCase().split(/\s+/)
    const name    = parts.join("-")
    const full    = name === "ase" || name.startsWith("ase-") ? name : `ase-${name}`
    const skill   = catalog.pages.get(full)
    const command = catalog.pages.get(`${full}.1`)
    return parts.length === 1 && name.includes("-") ? skill ?? command : command ?? skill
}

/*  escape a string for its literal use within a regular expression  */
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/*  the regular expression of the matches of a search in a page: the
    keywords as plain substrings, plus the fuzzy variants of the page as
    whole words, with the longest alternative first, so a variant is never
    cut short by a keyword nested inside it  */
const matchRE = (keywords: string[], variants: string[]): RegExp => {
    const alts = keywords.map((k) => ({ len: k.length, src: escape(k) }))
        .concat(variants.map((w) => ({ len: w.length, src: "(?<![a-z0-9])" + escape(w) + "(?![a-z0-9])" })))
    alts.sort((a, b) => b.len - a.len)
    return new RegExp(alts.map((a) => a.src).join("|"), "gi")
}

/*  search all pages for a query (as the website does): all whitespace-separated
    keywords have to occur in a page (AND logic), in up to two passes, the
    keywords as literal substrings first and, only if this matches no page at
    all, as fuzzy variants of their words, as the edit-distance neighborhood of
    a keyword would otherwise dilute a correctly spelled query; the result
    maps the ids of the matching pages onto the regular expressions of their
    matches, or is null for a query without any keywords  */
export const searchPages = (catalog: Catalog, query: string): Map<string, RegExp> | null => {
    const keywords = query.toLowerCase().split(/\s+/).filter((word) => word !== "")
    if (keywords.length === 0)
        return null
    const pages = [ ...catalog.pages.values() ]
    const hits  = new Map<string, RegExp>()
    for (const page of pages)
        if (keywords.every((k) => page.text.includes(k)))
            hits.set(page.id, matchRE(keywords, []))
    if (hits.size > 0)
        return hits

    /*  the fuzzy-equivalent vocabulary words of a keyword, cached per keyword  */
    const fuzzy = new Map<string, string[]>()
    const fuzzyWords = (word: string): string[] => {
        let result = fuzzy.get(word)
        if (result === undefined) {
            result = word.length < fuzzyMin ? [] : [ ...catalog.vocab ].filter((given) =>
                Math.abs(word.length - given.length) <= 1
                && (diceCoefficient(word, given) >= 0.50 || levenshtein(word, given) <= 2))
            fuzzy.set(word, result)
        }
        return result
    }

    /*  the regular expression of the fuzzy variants of a compound keyword (like
        "ase-task-edit"), with each of its words literally or fuzzily replaced
        and its separators kept, cached per keyword (null for a single word)  */
    const compound = new Map<string, RegExp | null>()
    const compoundRE = (keyword: string): RegExp | null => {
        let result = compound.get(keyword)
        if (result === undefined) {
            const parts = keyword.split(/([^a-z0-9]+)/)
            result = parts.length < 2 ? null : new RegExp("(?<![a-z0-9])" + parts.map((part, i) =>
                i % 2 === 1 ? escape(part) : part === "" ? "" :
                    "(?:" + [ part, ...fuzzyWords(part) ].map(escape).join("|") + ")").join("") + "(?![a-z0-9])", "g")
            compound.set(keyword, result)
        }
        return result
    }
    for (const page of pages) {
        const variants = [] as string[]
        const hit = keywords.every((k) => {
            if (page.text.includes(k))
                return true
            const re   = compoundRE(k)
            const near = re !== null ? [ ...new Set([ ...page.text.matchAll(re) ].map((m) => m[0])) ] :
                fuzzyWords(k).filter((w) => page.words.has(w))
            variants.push(...near)
            return near.length > 0
        })
        if (hit)
            hits.set(page.id, matchRE(keywords, variants))
    }
    return hits
}

