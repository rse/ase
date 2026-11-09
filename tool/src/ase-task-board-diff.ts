/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import { diffArrays } from "diff"

/*  a part of a diff: a run of kept items, or the removed and added items of a change  */
export type DiffHunk<T> = { kept: T[], removed: T[], added: T[] }

/*  a range of changed characters of a line  */
export type DiffSpan = { from: number, to: number }

/*  the changed share of the words up to which they are emphasized, the Markdown
    syntax characters never being emphasized (as this would break their constructs),
    the closing placeholder of a change mark, and the leading syntax of a Markdown
    line (block quote, heading, or list marker) and its checkbox, staying outside of
    its mark resp. of its emphasized words  */
const ALIKE  = 0.4
const SYNTAX = /^[*`~|\\[\]()<>#!]$/
const CLOSE  = "⟦/chg⟧"
const HEAD   = /^\s*(?:>\s*)*(?:#{1,6}[ \t]+|(?:[-*+]|\d+[.)])[ \t]+)?/
const BOX    = /^\[.\][ \t]+/

/*  split two lists of items, compared by their keys, into the parts of their diff  */
export const diffHunks = <T>(before: T[], after: T[], key: (item: T) => string): DiffHunk<T>[] => {
    const hunks = [] as DiffHunk<T>[]
    let i = 0
    let j = 0
    for (const { added, removed, count } of diffArrays(before.map(key), after.map(key))) {
        if (!added && !removed) {
            hunks.push({ kept: after.slice(j, j + count), removed: [], added: [] })
            i += count
            j += count
            continue
        }
        let hunk = hunks.at(-1)
        if (hunk === undefined || hunk.kept.length > 0) {
            hunk = { kept: [], removed: [], added: [] }
            hunks.push(hunk)
        }
        if (removed) {
            hunk.removed.push(...before.slice(i, i + count))
            i += count
        }
        else {
            hunk.added.push(...after.slice(j, j + count))
            j += count
        }
    }
    return hunks
}

/*  split lines into their words and other non-blank characters, each with its position  */
type Token = { text: string, row: number, from: number, to: number }
const tokens = (lines: string[]): Token[] => lines.flatMap((line, row) =>
    [ ...line.matchAll(/[\p{L}\p{N}_]+|\S/gu) ].map((m) =>
        ({ text: m[0], row, from: m.index, to: m.index + m[0].length })))

/*  determine the changed words of the removed and added lines of a change (joined with
    the blanks between adjacent ones), unless too many of the words changed, where the
    words alone decide, so a change of the wrapping only emphasizes nothing  */
export const changedWords = (removed: string[], added: string[]): [ DiffSpan[][], DiffSpan[][] ] => {
    const a       = tokens(removed)
    const b       = tokens(added)
    const del     = removed.map(() => [] as DiffSpan[])
    const add     = added.map(() => [] as DiffSpan[])
    const changes = diffArrays(a.map((token) => token.text), b.map((token) => token.text))
    const changed = changes.reduce((n, change) => n + (change.added || change.removed ? change.count : 0), 0)
    if (changed > (a.length + b.length) * ALIKE)
        return [ del, add ]
    const mark = (list: Token[], spans: DiffSpan[][]) => {
        let last: Token | undefined
        for (const token of list) {
            const row = spans[token.row]
            if (SYNTAX.test(token.text))
                last = undefined
            else {
                if (last?.row === token.row)
                    row[row.length - 1].to = token.to
                else
                    row.push({ from: token.from, to: token.to })
                last = token
            }
        }
    }
    let i = 0
    let j = 0
    for (const { added: plus, removed: minus, count } of changes) {
        if (minus)
            mark(a.slice(i, i + count), del)
        else if (plus)
            mark(b.slice(j, j + count), add)
        i += plus  ? 0 : count
        j += minus ? 0 : count
    }
    return [ del, add ]
}

/*  mark a changed Markdown line and its changed words through placeholders surviving
    the Markdown rendering: fences and lines of pure syntax stay unmarked (as a
    mark would break them), and the cells of a table row are marked individually  */
const markLine = (line: string, kind: "add" | "del", spans: DiffSpan[]): string => {
    if (!/[\p{L}\p{N}]/u.test(line) || /^\s*(?:```|~~~)/.test(line))
        return line
    if (/^\s*\|/.test(line))
        return line.split(/(?<!\\)\|/).map((cell) =>
            cell.replace(/\S(?:.*\S)?/, (text) => `⟦chg:${kind}⟧${text}${CLOSE}`)).join("|")
    const head = HEAD.exec(line)![0]
    const rest = line.slice(head.length)
    const box  = BOX.exec(rest)?.[0] ?? ""
    let   text = rest.slice(box.length)
    for (const { from, to } of [ ...spans ].reverse())
        text = `${text.slice(0, from)}⟦chg:${kind}-word⟧${text.slice(from, to)}${CLOSE}${text.slice(to)}`
    return `${head}⟦chg:${kind}⟧${box}${text}${CLOSE}`
}

/*  the text of a Markdown line, without its leading syntax and its checkbox  */
const lineText = (line: string): string => {
    const rest = line.slice(HEAD.exec(line)![0].length)
    return rest.slice(BOX.exec(rest)?.[0].length ?? 0)
}

/*  merge two Markdown texts into one, with the removed before the added lines of a
    change and with both marked through placeholders (resolved by "diffMarksToHTML")  */
export const diffMarkdown = (before: string, after: string): string =>
    diffHunks(before.split(/\r?\n/), after.split(/\r?\n/), (line) => line).flatMap(({ kept, removed, added }) => {
        const [ del, add ] = changedWords(removed.map(lineText), added.map(lineText))
        return [
            ...kept,
            ...removed.map((line, k) => markLine(line, "del", del[k])),
            ...added.map((line, k) => markLine(line, "add", add[k]))
        ]
    }).join("\n")

/*  resolve the placeholders of the change marks in rendered HTML, where
    the ones which ended up inside a tag (like in a link target) are dropped  */
export const diffMarksToHTML = (html: string): string =>
    html.replace(/<[^>]*⟦[^>]*>/g, (tag) => tag.replace(/⟦\/?chg[^⟧]*⟧/g, ""))
        .replace(/⟦chg:([a-z-]+)⟧/g, (_m, kinds: string) => `<span class="chg ${kinds.replace(/-/g, " ")}">`)
        .replace(/⟦\/chg⟧/g, "</span>")

