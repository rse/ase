/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

/*  Claude Code function hooks module ("mod", EARLY ACCESS):
    Table rendering, redrawing the Markdown tables of a reply, which the engine
    (for a too narrow terminal) would draw in its vertical layout, as records
    with their keys aligned in a column and their values wrapped beside it with
    a hanging indent, separated by dimmed rules, while all other tables (resp. all
    tables, once the terminal is wide enough again) stay the grids of the engine.  */

import type { Elements, Frozen, MatchedEvent, RenderElement } from "claude-code"
import { ROW, RULE, cells, uniform, width } from "./ase-mods-common"

/*  the layout constants of the engine: its safety margin, the narrowest column,
    the most lines of a cell in a grid, and the most rows drawn of a table  */
const SAFETY = 4
const MIN    = 3
const LINES  = 4
const ROWS   = 200

/*  the bullet gutter of a reply, the narrowest key column, the share of the
    columns taken at most by the key column, the narrowest value column (below
    which a value is stacked below its key), and the size limit of the drawing  */
const GUTTER = 2
const KEY    = 8
const SHARE  = 1 / 3
const VALUE  = 20
const LIMIT  = 90000

/*  a Markdown table: its original lines, its header cells, and its body rows  */
type Table = { raw: string, header: string[], rows: string[][] }

/*  the width of plain text in terminal cells  */
const measure = (text: string): number =>
    width(uniform(text, false, undefined))

/*  approximate the plain text of a cell, as the engine draws its inline Markdown:
    code spans without their backticks, links by their text, and no emphasis  */
const plain = (cell: string): string =>
    cell.split("`").map((part, i) => i % 2 === 1 ? part : part
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/\*+|~~/g, "")).join("").trim()

/*  count the lines of plain text wrapped at word boundaries to the given columns
    (with overlong words chopped resp., as the engine does without hard wrapping,
    kept on lines of their own)  */
const count = (text: string, columns: number, hard: boolean): number => {
    let lines = 1
    let size  = 0
    for (const word of text.split(/\s+/).filter((word) => word !== "")) {
        const w = measure(word)
        if (size > 0 && size + 1 + w <= columns) {
            size += 1 + w
            continue
        }
        if (size > 0)
            lines++
        if (hard && w > columns) {
            lines += Math.ceil(w / columns) - 1
            size   = w - (Math.ceil(w / columns) - 1) * columns
        }
        else
            size = w
    }
    return lines
}

/*  determine whether the engine draws a table in its vertical layout instead
    of a grid within the given terminal columns: its column widths are the
    natural ones if they fit, else the widest words plus a proportional share
    of the remaining columns, else the widest words scaled down (with hard
    wrapping), where a cell wrapped to too many lines, resp. a too wide grid,
    makes the table vertical  */
const vertical = (table: Table, columns: number): boolean => {
    const rows   = [ table.header, ...table.rows.slice(0, ROWS) ].map((row) =>
        table.header.map((_, c) => plain(row[c] ?? "")))
    const narrow = table.header.map((_, c) => Math.max(...rows.map((row) =>
        Math.max(MIN, ...row[c]!.split(/\s+/).map(measure)))))
    const ideal  = table.header.map((_, c) => Math.max(...rows.map((row) => Math.max(MIN, measure(row[c]!)))))
    const n      = table.header.length
    const avail  = Math.max(columns - (1 + 3 * n) - SAFETY, n * MIN)
    const sum    = (widths: number[]) => widths.reduce((total, w) => total + w, 0)
    let hard     = false
    let widths: number[]
    if (sum(ideal) <= avail)
        widths = ideal
    else if (sum(narrow) <= avail) {
        const spare = avail - sum(narrow)
        const slack = ideal.map((w, c) => w - narrow[c]!)
        const total = sum(slack)
        widths = narrow.map((w, c) => total === 0 ? w : w + Math.floor(slack[c]! / total * spare))
    }
    else {
        hard   = true
        widths = narrow.map((w) => Math.max(Math.floor(w * avail / sum(narrow)), MIN))
    }
    if (rows.some((row) => row.some((cell, c) => count(cell, widths[c]!, hard) > LINES)))
        return true
    return 1 + sum(widths) + 3 * n > columns - SAFETY
}

/*  split the text of a reply into its Markdown text and its top-level tables
    (outside of code fences), where a table is a header row, a delimiter row of
    the same number of cells, and the following rows  */
const parse = (text: string): (string | Table)[] => {
    const lines = text.split("\n")
    const parts: (string | Table)[] = []
    let block: string[] = []
    let fence: string | undefined
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!
        const mark = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1]
        if (fence !== undefined) {
            if (mark !== undefined && mark.startsWith(fence))
                fence = undefined
            block.push(line)
        }
        else if (mark !== undefined) {
            fence = mark
            block.push(line)
        }
        else if (/^\|/.test(line) && ROW.test(line) && RULE.test(lines[i + 1] ?? "")
            && cells(lines[i + 1]!).length === cells(line).length) {
            let end = i + 2
            while (end < lines.length && ROW.test(lines[end]!))
                end++
            if (block.length > 0)
                parts.push(block.join("\n"))
            block = []
            parts.push({ raw: lines.slice(i, end).join("\n"), header: cells(line),
                rows: lines.slice(i + 2, end).map((row) => cells(row)) })
            i = end - 1
        }
        else
            block.push(line)
    }
    if (block.length > 0)
        parts.push(block.join("\n"))
    return parts
}

/*  turn a cell into a paragraph of Markdown: its line breaks as hard breaks,
    and a leading list, heading, or quote marker escaped  */
const paragraph = (cell: string): string =>
    cell.replace(/<br\s*\/?>\s*/gi, "  \n")
        .replace(/^([-+*>]|#{1,6})(?=\s)/gm, "\\$1")
        .replace(/^(\d+)([.)])(?=\s)/gm, "$1\\$2")

/*  the table rendering: its state and its operations  */
export const modRenderTable = () => {
    /*  the last known width of the terminal  */
    let columns = 80

    /*  draw a table as records: per body row its cells (except the empty ones), each
        with the header cell as its key in bold and the cell as its value beside it,
        resp. below it (for too narrow values), and the records separated by rules  */
    const records = (ui: Elements["terminal"], table: Table): RenderElement => {
        const { Box, Text, Markdown } = ui
        const room    = Math.max(1, columns - GUTTER - 1)
        const keys    = table.header.map((cell) => plain(cell))
        const key     = Math.min(Math.max(...keys.map((text) => measure(text) + 1)), Math.max(KEY, Math.floor(room * SHARE)))
        const stacked = room - key - 1 < VALUE
        const rule    = Text({ dimColor: true, wrap: "truncate-end", children: "─".repeat(room) })
        const field   = (name: string, cell: string): RenderElement => {
            const label = Text({ bold: true, children: name !== "" ? `${name}:` : "" })
            const value = Markdown({ text: paragraph(cell) })
            return stacked ?
                Box({ flexDirection: "column", children: [
                    ...(name !== "" ? [ label ] : []),
                    Box({ paddingLeft: name !== "" ? 2 : 0, children: value })
                ] }) :
                Box({ flexDirection: "row", children: [
                    Box({ width: key, flexShrink: 0, children: label }),
                    Box({ flexGrow: 1, flexShrink: 1, marginLeft: 1, children: value })
                ] })
        }
        const shown = table.rows.slice(0, ROWS).map((row) =>
            keys.flatMap((name, c) => (row[c] ?? "") !== "" ? [ field(name, row[c]!) ] : []))
            .filter((fields) => fields.length > 0)
        const more  = table.rows.length - Math.min(table.rows.length, ROWS)
        return Box({ flexDirection: "column", children: [
            ...shown.flatMap((fields, k) => k > 0 ? [ rule, ...fields ] : fields),
            ...(more > 0 ? [ rule, Text({ dimColor: true, children: `… ${more} more rows not shown` }) ] : [])
        ] })
    }

    /*  redraw a reply which contains a table drawn in the vertical layout by the
        engine (terminal only), resp. draw nothing for any other reply  */
    const render = (e: Frozen<MatchedEvent<"ui.render", { component: "AssistantMessage", surface: "terminal" }>>,
        ui: Elements["terminal"]): RenderElement | undefined => {
        /*  act on replies with tables only, where at least one of them is vertical  */
        columns = e.viewport?.columns ?? columns
        if (e.props.isSummary === true || e.props.text.length > LIMIT || !e.props.text.includes("|"))
            return undefined
        const parts = parse(e.props.text)
        const tall  = parts.map((part) => typeof part !== "string" && part.rows.length > 0 && vertical(part, columns))
        if (!tall.some((flag) => flag))
            return undefined

        /*  merge the text and the grid tables into Markdown blocks between the vertical tables  */
        const blocks: (string | Table)[] = []
        parts.forEach((part, k) => {
            const text = typeof part === "string" ? part : !tall[k] ? part.raw : undefined
            if (text === undefined)
                blocks.push(part)
            else if (typeof blocks.at(-1) === "string")
                blocks[blocks.length - 1] += `\n${text}`
            else
                blocks.push(text)
        })

        /*  draw the blocks with a blank row between them  */
        const { Box, Text, Markdown } = ui
        const drawn = blocks.flatMap((block) => typeof block !== "string" ? [ records(ui, block) ] :
            block.trim() !== "" ? [ Markdown({ text: block.replace(/^\s*\n|\s+$/g, "") }) ] : [])
            .map((element, k) => Box({ marginTop: k > 0 ? 1 : 0, children: element }))

        /*  mimic the reply row of the engine: blank row above and bullet gutter  */
        return Box({ flexDirection: "row", marginTop: 1, width: "100%", children: [
            Box({ flexShrink: 0, minWidth: GUTTER, children: Text({ children: e.props.isFirstOfReply ? "⏺" : " " }) }),
            Box({ flexDirection: "column", flexGrow: 1, flexShrink: 1, children: drawn })
        ] })
    }

    return { render }
}

