/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

/*  Claude Code function hooks module ("mod", EARLY ACCESS):
    Decision matrix, redrawing the weighted decision matrices of the
    "ase-meta-evaluate" skill as a grid and rendering in blue and bold the
    column of the best alternative (resp. of all tied best ones). Its
    header cells are clickable and sort the criteria rows by their column
    (cycling the primary, the reverse, and the original order), while the
    rating row stays the last one.  */

import type { Elements, Frozen, MatchedEvent, RenderElement } from "claude-code"
import { type Engine, type Char, ROW, RULE, cells, strip, style, width, wrap, split, paint } from "./ase-mods-common.ts"

/*  the marker line above a decision matrix  */
const MARKER = /\*{0,2}EVALUATION\*{0,2}:\s+\*{0,2}Weighted Multi-Criteria Decision Matrix/

/*  the color of the best alternatives, and the rating distance (relative to
    the best rating) below which alternatives tie (as in "ase-meta-evaluate")  */
const WINNER = "blue"
const TIE    = 0.01

/*  the sort marks of the orders (each taking the same columns)  */
const MARK = { desc: " ▼", asc: " ▲", none: "  " } as const

/*  the indent of the wrapped lines of a criterion, the narrowest criteria
    column, and the size limit of a single "Markdown" element  */
const INDENT = 2
const NARROW = 12
const LIMIT  = 10000

/*  a decision matrix with the Markdown text before and after it: its header
    cells, its criteria rows (with the values of their weight and evaluations),
    its rating row, and the columns of the best alternatives  */
type Matrix = {
    before:  string,
    after:   string,
    header:  string[],
    rows:    { cells: string[], values: number[] }[],
    rating:  string[],
    winners: Set<number>
}

/*  the sort of a matrix: the sorted column and its order  */
type Order = "desc" | "asc"
type Sort  = { column: number, order: Order }

/*  read the number of a cell (without bold markup and a leading plus sign)  */
const number = (cell: string): number => {
    const text = cell.replace(/\*/g, "").trim().replace(/^\+/, "")
    return text !== "" ? Number(text) : NaN
}

/*  parse the decision matrix out of the text of a reply  */
const parse = (text: string): Matrix | undefined => {
    const lines = text.split("\n")
    const m = lines.findIndex((line) => MARKER.test(line))
    const h = lines.findIndex((line, i) => m !== -1 && i > m && ROW.test(line))
    if (h === -1 || !RULE.test(lines[h + 1] ?? ""))
        return undefined
    const header = cells(lines[h]!).map((cell) => cell.replace(/\*/g, ""))
    if (header.length < 3 || !/Criteria/.test(header[0]!) || !/Weight/.test(header[1]!))
        return undefined
    let end = h + 2
    while (end < lines.length && ROW.test(lines[end]!))
        end++
    const rows   = lines.slice(h + 2, end).map((line) => cells(line))
    const rating = rows.pop() ?? []
    if (rows.length === 0 || rows.some((row) => row.length !== header.length)
        || rating.length !== header.length || rating[0]!.replace(/\*/g, "") !== "RATING")
        return undefined
    const values  = rows.map((row) => row.slice(1).map(number))
    const ratings = rating.slice(2).map(number)
    if ([ ...values.flat(), ...ratings ].some((value) => !Number.isFinite(value)))
        return undefined
    const best = Math.max(...ratings)
    return {
        before:  lines.slice(0, h).join("\n").trim(),
        after:   lines.slice(end).join("\n").replace(/^\n+/, "").trimEnd(),
        header,
        rows:    rows.map((row, k) => ({ cells: row, values: values[k]! })),
        rating,
        winners: new Set(ratings.flatMap((value, j) =>
            value === best || best - value < TIE * Math.abs(best) ? [ j + 2 ] : []))
    }
}

/*  advance the sort by a clicked column: its primary order (ascending for
    the criteria names, descending for the values), then its reverse order,
    and then the original order again  */
const advance = (sort: Sort | undefined, column: number): Sort | undefined => {
    const primary: Order = column === 0 ? "asc"  : "desc"
    const reverse: Order = column === 0 ? "desc" : "asc"
    if (sort?.column !== column)
        return { column, order: primary }
    return sort.order === primary ? { column, order: reverse } : undefined
}

/*  order the criteria rows by the sort (stable, so equal rows keep their original order)  */
const order = (rows: Matrix["rows"], sort: Sort | undefined): Matrix["rows"] => {
    if (sort === undefined)
        return rows
    const sign = sort.order === "asc" ? 1 : -1
    return [ ...rows ].sort((a, b) => sign * (sort.column === 0 ?
        strip(a.cells[0]!).localeCompare(strip(b.cells[0]!)) :
        a.values[sort.column - 1]! - b.values[sort.column - 1]!))
}

/*  the decision matrix: its state and its operations  */
export const modEvaluate = () => {
    /*  the last known width of the terminal and the sorts of the matrices  */
    let columns = 80
    const sorts = new Map<string, Sort>()

    /*  sort the criteria rows of a matrix by a clicked header cell and redraw it  */
    const press = (engine: Pick<Engine, "invalidate">, request: string, column: number) => () => {
        const sort = advance(sorts.get(request), column)
        if (sort !== undefined)
            sorts.set(request, sort)
        else
            sorts.delete(request)
        engine.invalidate()
    }

    /*  redraw a reply which contains a decision matrix (terminal only),
        resp. draw nothing for any other reply  */
    const render = (e: Frozen<MatchedEvent<"ui.render", { component: "AssistantMessage", surface: "terminal" }>>,
        ui: Elements["terminal"], engine: Pick<Engine, "invalidate">): RenderElement | undefined => {
        /*  act on decision matrices only  */
        columns = e.viewport?.columns ?? columns
        const matrix = parse(e.props.text)
        if (matrix === undefined || matrix.before.length > LIMIT || matrix.after.length > LIMIT)
            return undefined

        /*  style the cells: the header ones in bold, the criteria rows in their sort
            order, and the columns of the best alternatives in blue and bold  */
        const sort = sorts.get(e.requestId)
        const tint = (chars: Char[], column: number): Char[] =>
            matrix.winners.has(column) ? chars.map((char) => ({ ...char, bold: true, color: WINNER })) : chars
        const head = matrix.header.map((cell, c) => tint(style(`**${cell}**`, undefined), c))
        const body = [ ...order(matrix.rows, sort).map((row) => row.cells), matrix.rating ]
            .map((row) => row.map((cell, c) => tint(style(c === 0 ? strip(cell) : cell, undefined), c)))

        /*  determine the column widths: the value columns at their natural width
            (the header cells with room for the sort mark), the criteria column
            within the remaining columns (gutter, grid lines, cell paddings, and a
            spare column subtracted), else leave the matrix to the engine  */
        const widths = head.map((cell, c) =>
            Math.max(width(cell) + MARK.none.length, ...body.map((row) => width(row[c]!))))
        const avail  = columns - 2 - (3 * head.length + 1) - 1 - widths.slice(1).reduce((sum, w) => sum + w, 0)
        if (avail < Math.max(NARROW, width(head[0]!) + MARK.none.length))
            return undefined
        widths[0] = Math.min(widths[0]!, avail)

        /*  resolve the UI elements  */
        const { Box, Text, Button, Markdown } = ui

        /*  pad the parts of a cell line of the given width to its column width:
            left-aligned for the criteria, right-aligned for the values  */
        const align = <T>(c: number, used: number, parts: T[]): (T | string)[] => {
            const pad = " ".repeat(Math.max(0, widths[c]! - used))
            return c === 0 ? [ ...parts, pad ] : [ pad, ...parts ]
        }

        /*  draw a header cell: its styled text inside a hover-scoping box, which while
            hovered reveals a row of clickable plain buttons (one per styled run, as in
            the grill table) on top of it, followed by its sort mark  */
        const heading = (c: number): RenderElement[] => {
            const group   = `h${c}`
            const onPress = press(engine, e.requestId, c)
            const buttons = split(head[c]!).map(({ text, bold }, r) =>
                Button({ key: `${group}/${r}`, label: text, plain: true, onPress,
                    hover: { scope: group, inverse: true, bold } }))
            return align(c, width(head[c]!) + MARK.none.length, [
                Box({ key: group, hover: { scope: group }, children: [
                    Text({ children: paint(Text, head[c]!) }),
                    Box({ position: "absolute", top: 0, left: 0, display: "none",
                        hover: { scope: group, display: "flex" }, flexDirection: "row", children: buttons })
                ] }),
                Text({ children: sort?.column === c ? MARK[sort.order] : MARK.none })
            ]).map((part) => typeof part === "string" ? Text({ children: part }) : part)
        }

        /*  draw a line of the grid out of the parts of its cells, resp. a rule  */
        const draw = (parts: RenderElement[][]) => Box({ flexDirection: "row", children: [
            Text({ children: "│ " }),
            ...parts.flatMap((part, c) => c > 0 ? [ Text({ children: " │ " }), ...part ] : part),
            Text({ children: " │" })
        ] })
        const rule = (l: string, m: string, r: string) =>
            Text({ wrap: "truncate-end", children: l + widths.map((w) => "─".repeat(w + 2)).join(m) + r })

        /*  draw the matrix as a grid: a rule below the header and above the rating
            row, and the criteria wrapped within their column  */
        const grid: RenderElement[] = [
            rule("┌", "┬", "┐"),
            draw(head.map((_, c) => heading(c))),
            rule("├", "┼", "┤")
        ]
        body.forEach((row, k) => {
            if (k === body.length - 1)
                grid.push(rule("├", "┼", "┤"))
            wrap(row[0]!, widths[0]!, INDENT).forEach((line, i) =>
                grid.push(draw(row.map((cell, c) => {
                    const chars = c === 0 ? line : i === 0 ? cell : []
                    return [ Text({ children: align(c, width(chars), paint(Text, chars)) }) ]
                }))))
        })
        grid.push(rule("└", "┴", "┘"))

        /*  mimic the reply row of the engine: blank row above and bullet gutter  */
        return Box({ flexDirection: "row", marginTop: 1, width: "100%", children: [
            Box({ flexShrink: 0, minWidth: 2, children: Text({ children: e.props.isFirstOfReply ? "⏺" : " " }) }),
            Box({ flexDirection: "column", flexGrow: 1, flexShrink: 1, children: [
                ...(matrix.before !== "" ? [ Markdown({ text: matrix.before }) ] : []),
                Box({ flexDirection: "column", marginTop: matrix.before !== "" ? 1 : 0, children: grid }),
                ...(matrix.after !== "" ? [ Box({ marginTop: 1, children: Markdown({ text: matrix.after }) }) ] : [])
            ] })
        ] })
    }

    return { render }
}

