/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import Table       from "cli-table3"

import { Diagram } from "./ase-diagram.js"

/*  assumed terminal width in case the output is not a terminal at all  */
const termWidthFallback = 80

/*  content width a column is at most shrunk down to, unless its own
    content or its column head already is narrower anyway  */
const colWidthMinimum = 8

/*  measure the visible width of a cell content, ignoring ANSI escape
    sequences and honoring the longest line of a multi-line content  */
const cellWidth = (text: string): number =>
    text.split("\n").reduce((width, line) =>
        /*  eslint-disable-next-line no-control-regex  */
        Math.max(width, line.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "").length), 0)

/*  check whether a cell content carries a single token which does not
    fit the column and hence can be wrapped on character boundaries only  */
const hasOverlongToken = (text: string, width: number): boolean =>
    text.split(/\s+/).some((token) => cellWidth(token) > width)

/*  hard-break all over-long tokens of a cell content, so the content as
    a whole can still be wrapped on its regular word boundaries; tokens
    carrying ANSI escape sequences are left alone, as breaking them
    would tear apart their escape sequences  */
const breakOverlongTokens = (text: string, width: number): string =>
    text.split(/(\s+)/).map((token) => {
        if (cellWidth(token) <= width || /\s/.test(token) || token.includes("\x1b"))
            return token
        const chunks: string[] = []
        for (let i = 0; i < token.length; i += width)
            chunks.push(token.slice(i, i + width))
        return chunks.join("\n")
    }).join("")

/*  reduce the column content widths until their sum fits the available
    budget, by binary-searching the largest common upper cap which still
    fits and which never cuts a column below its individual minimum  */
const capWidths = (natural: number[], minimum: number[], budget: number): number[] => {
    const capped = (cap: number) => natural.map((width, i) =>
        Math.max(Math.min(width, cap), Math.min(width, minimum[i])))
    const total  = (widths: number[]) => widths.reduce((sum, width) => sum + width, 0)
    let lo = 1
    let hi = Math.max(...natural, 1)
    while (lo < hi) {
        const mid = Math.floor((lo + hi + 1) / 2)
        if (total(capped(mid)) <= budget)
            lo = mid
        else
            hi = mid - 1
    }
    return capped(lo)
}

/*  render a table which never exceeds the terminal width, by wrapping
    over-wide cell contents over multiple lines instead  */
export const renderTable = (head: string[], rows: string[][]): string => {
    const cols = head.length

    /*  determine the natural, still unwrapped content width per column  */
    const natural = head.map((text, i) => rows.reduce((width, row) =>
        Math.max(width, cellWidth(row[i] ?? "")), cellWidth(text)))

    /*  shrink the columns down to the width still remaining after the
        border characters and the padding spaces of all columns  */
    const term    = Diagram.detectTermWidth() || termWidthFallback
    const budget  = Math.max(term - (3 * cols + 1), cols)
    const minimum = head.map((text) => Math.max(cellWidth(text), colWidthMinimum))
    const widths  = capWidths(natural, minimum, budget)

    /*  render the table, falling back to wrapping on character
        boundaries in just those cells where a token still overflows  */
    const table = new Table({
        head,
        colWidths: widths.map((width) => width + 2),
        wordWrap:  true,
        chars:     { "mid": "", "left-mid": "", "mid-mid": "", "right-mid": "" },
        style:     { head: [ "blue" ] }
    })
    for (const row of rows)
        table.push(row.map((text, i) => {
            const content = breakOverlongTokens(text, widths[i])
            return {
                content,
                wrapOnWordBoundary: !hasOverlongToken(content, widths[i])
            }
        }))
    return `${table.toString()}\n`
}
