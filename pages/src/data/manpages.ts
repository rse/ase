/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

/*  shared CLI manual page catalog: all `tool/man/<name>.md` pages of the
    `ase` command, read at build time and arranged into the command tree
    (`ase` > `ase task` > `ase task list`). Both the CLI command columns in
    `Section-Usage.astro` and the sidebar and pane of `Modal-Help.astro`
    are driven by this list, so the two stay in sync (DRY).  */

import fs   from "node:fs"
import path from "node:path"

export interface ManPage {
    name:  string   /*  page name, e.g. "ase-task-list"                    */
    id:    string   /*  help-modal id, e.g. "ase-task-list.1"              */
    label: string   /*  command form, e.g. "ase task list"                 */
    depth: number   /*  nesting depth in the command tree ("ase" is 0)     */
    title: string   /*  one-line title of the page                         */
    md:    string   /*  Markdown source of the page                        */
}

/*  locate the in-repo manual page directory relative to the `pages/` project
    root (`pages/etc/astro.config.mjs` runs from there).  */
const manDir = path.resolve(process.cwd(), "..", "tool", "man")

/*  read all manual pages and derive their titles from the leading
    "# <name>(1) -- <Title>" line of the remark-man format.  */
const sources: Record<string, string> = {}
for (const file of fs.readdirSync(manDir)) {
    if (!file.endsWith(".md")) continue
    sources[file.slice(0, -3)] = fs.readFileSync(path.join(manDir, file), "utf8")
}
const names = Object.keys(sources).sort()

/*  the parent of a page is the longest other page name it extends by a
    "-<suffix>", so "ase-hook-session-start" belongs to "ase-hook" (and not
    to a non-existing "ase-hook-session").  */
const parentOf = (name: string): string =>
    names.filter((other) => name.startsWith(other + "-"))
        .sort((a, b) => b.length - a.length)[0] ?? ""

/*  order the children of a page by their first "`<name>`(1)" reference
    within the COMMANDS section of the page (or the entire page, if it has
    no such section), so the tree follows the order chosen by the
    documentation, and fall back to alphabetical order for unreferenced
    children.  */
const childrenOf = (parent: string): string[] => {
    const md      = sources[parent]
    const m       = md.match(/^## COMMANDS\s*$([\s\S]*?)(?=^## |(?![\s\S]))/m)
    const section = m ? m[1] : md
    const pos = (name: string) => {
        const idx = section.indexOf("`" + name + "`(1)")
        return idx >= 0 ? idx : Infinity
    }
    return names.filter((name) => parentOf(name) === parent)
        .sort((a, b) => (pos(a) - pos(b)) || a.localeCompare(b))
}

/*  flatten the command tree depth-first into the catalog order  */
export const manPages: ManPage[] = []
const walk = (name: string, label: string, depth: number) => {
    const md = sources[name]
    const m  = md.match(/^#\s+\S+\(1\)\s+--\s+(.+)$/m)
    manPages.push({ name, id: name + ".1", label, depth, title: m ? m[1].trim() : name, md })
    for (const child of childrenOf(name))
        walk(child, label + " " + child.slice(name.length + 1), depth + 1)
}
for (const root of names.filter((name) => parentOf(name) === ""))
    walk(root, root.replace(/-/g, " "), 0)

/*  group the command tree for the catalogs: "ase" itself and the top-level
    commands without sub-commands form the "Top-Level" group, and every
    other top-level command forms an own group with all of its deeper
    commands, both in the depth-first order of the command tree.  */
export interface ManGroup {
    label: string       /*  group label, e.g. "setup"                      */
    pages: ManPage[]    /*  pages of the group, in command tree order      */
}
const treeGroups: ManGroup[] = [ { label: "Top-Level", pages: [] } ]
for (const page of manPages) {
    if (page.depth === 0)
        treeGroups[0].pages.push(page)
    else if (page.depth === 1) {
        if (manPages.some((other) => other.depth > 1 && other.label.startsWith(page.label + " ")))
            treeGroups.push({ label: page.label.slice(page.label.lastIndexOf(" ") + 1), pages: [ page ] })
        else
            treeGroups[0].pages.push(page)
    }
    else
        treeGroups[treeGroups.length - 1].pages.push(page)
}

/*  the arrangement of the groups into the five catalog columns of
    `Section-Usage.astro`, which, read top to bottom and left to right,
    also defines the order of the groups in the sidebar of
    `Modal-Help.astro`, where any group not explicitly placed here (like
    the one of a newly added top-level command) is appended to the last
    column, so it never silently drops out of the catalogs. The resulting
    group order is copied into "commandGroups" of "tool/src/ase-man-catalog.ts"
    (the manual page browser of "ase man"), so keep both in sync.  */
export const manColumns: ManGroup[][] = [
    [ "Top-Level", "setup" ],
    [ "config", "alias", "service" ],
    [ "task" ],
    [ "spec", "util", "artifact" ],
    [ "agent", "hook" ]
].map((labels) => labels.map((label) => treeGroups.find((group) => group.label === label)!))
const placed = new Set(manColumns.flat())
manColumns[manColumns.length - 1].push(...treeGroups.filter((group) => !placed.has(group)))
export const manGroups: ManGroup[] = manColumns.flat()

