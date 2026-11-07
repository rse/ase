/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

/*  Claude Code function hooks module ("mod", EARLY ACCESS):
    Grill table, redrawing the grilling tables of ASE with one answer
    alternative per line (wrapped lines indented) and rendering in red
    the answers picked in the prompt via "nX" short responses and the
    question selected in the prompt via the last standalone "n". An
    optional third column carries the recommended answer per question.
    In the latest table, questions, answers, and recommendations are
    clickable and insert their "n" or "nX" into the prompt.  */

import type { Elements, Frozen, MatchedEvent, RenderElement } from "claude-code"
import { type Engine, type Char, PICKED, ROW, RULE, cells, style, width, wrap, split, paint } from "./ase-mods-common.ts"

/*  the marker line above a grilling table (single-round and multi-round,
    optionally labeled with the perspective and/or grounding)  */
const MARKER = /⧉ \*{0,2}ASE\*{0,2}: GRILLING(?: ROUND \d+\/\d+)?(?: \([^)]*\))?:/

/*  the separator between two answers, the letter of an answer,
    the number of a question, and the letter of a recommendation  */
const ANSWER    = /,\s+(?=\*{0,2}[A-Z]\*{0,2}\s+▶)/
const LETTER    = /^\*{0,2}([A-Z])\*{0,2}\s+▶/
const NUMBER    = /^\*{0,2}(\d+)\*{0,2}\s+▶/
const RECOMMEND = /^★\s*\*{0,2}([A-Z])\*{0,2}/

/*  the label of an answer up to (and the end of its bold markup and) its colon  */
const LABEL = /^(\*{0,2}[A-Z]\*{0,2}\s+▶\s+\*{0,2}[^:*]*?)(\*{0,2}:)/

/*  a short response "nX" inside the prompt  */
const PICK = /(?<![^\s,])(\d+)([a-zA-Z])(?![^\s,])/g

/*  a standalone question number "n" inside the prompt  */
const SELECT = /(?<![^\s,])(\d+)(?![^\s,])/g

/*  the indent of the wrapped lines of an answer
    and the size limit of a single "Markdown" element  */
const INDENT = 4
const LIMIT  = 10000

/*  a grilling table with the Markdown text before and after it  */
type Table = {
    before: string,
    after:  string,
    header: string[],
    rows:   {
        number:    number,
        question:  string,
        answers:   { letter: string, text: string }[],
        recommend: { letter: string, text: string } | undefined
    }[]
}

/*  parse the grilling table out of the text of a reply  */
const parse = (text: string): Table | undefined => {
    const lines = text.split("\n")
    const m = lines.findIndex((line) => MARKER.test(line))
    const h = lines.findIndex((line, i) => m !== -1 && i > m && ROW.test(line))
    if (h === -1 || !RULE.test(lines[h + 1] ?? ""))
        return undefined
    const header = cells(lines[h]!).map((cell) => cell.replace(/\*/g, ""))
    if (header.length < 2 || header.length > 3 || header[0] !== "QUESTION" || !/^ANSWERS?$/.test(header[1]!)
        || (header.length === 3 && header[2] !== "RECOMMENDATION"))
        return undefined
    let end = h + 2
    while (end < lines.length && ROW.test(lines[end]!))
        end++
    const rows = lines.slice(h + 2, end).map((line) => cells(line))
    if (rows.length === 0 || rows.some((row) => row.length !== header.length))
        return undefined
    return {
        before: lines.slice(0, h).join("\n").trim(),
        after:  lines.slice(end).join("\n").replace(/^\n+/, "").trimEnd(),
        header,
        rows:   rows.map((row, i) => {
            const recommend = row[2] !== undefined ?
                { letter: RECOMMEND.exec(row[2])?.[1] ?? "", text: row[2] } : undefined
            return {
                number:   Number(NUMBER.exec(row[0]!)?.[1] ?? i + 1),
                question: row[0]!,
                answers:  row[1]!.split(ANSWER).map((answer) => {
                    /*  ensure the recommended answer carries its star in its label  */
                    const letter = LETTER.exec(answer)?.[1] ?? ""
                    const text = recommend !== undefined && letter !== "" && letter === recommend.letter
                        && !answer.includes("★") ? answer.replace(LABEL, "$1 ★$2") : answer
                    return { letter, text }
                }),
                recommend
            }
        })
    }
}

/*  determine the picked answer letter of each question out of a prompt (last pick wins)  */
const pick = (text: string): Map<number, string> =>
    new Map([ ...text.matchAll(PICK) ].map((m) => [ Number(m[1]!), m[2]!.toUpperCase() ]))

/*  determine the selected question number out of a prompt (last standalone number wins)  */
const select = (text: string): number | undefined => {
    const m = [ ...text.matchAll(SELECT) ].at(-1)
    return m !== undefined ? Number(m[1]!) : undefined
}

/*  the standalone tokens of question "n" inside the prompt: its bare
    number "n" (letter "") or its short responses "nX" (letter "[a-zA-Z]")  */
const token = (number: number, letter: string): RegExp =>
    new RegExp(`(?<![^\\s,])${number}${letter}(?![^\\s,])`, "g")

/*  insert the number "n" of a clicked question or the short response "nX" of a
    clicked answer into a prompt. Answer: an existing "nY" is replaced in place
    (and a bare "n" removed), else a bare "n" is replaced in place, else "nX" is
    appended. Question: an existing bare "n" is kept, else the last bare number
    of another question (the selected one) is replaced in place, else "n" is
    appended.  */
const insert = (text: string, number: number, letter?: string): string => {
    const bare  = token(number, "")
    const picks = token(number, "[a-zA-Z]")
    if (letter !== undefined && text.search(picks) !== -1)
        return text.replace(picks, `${number}${letter}`)
            .replace(new RegExp(`\\s*${bare.source}`, "g"), "").trimStart()
    if (text.search(bare) !== -1)
        return letter !== undefined ? text.replace(bare, `${number}${letter}`) : text
    const last = letter === undefined ? [ ...text.matchAll(SELECT) ].at(-1) : undefined
    if (last !== undefined)
        return text.slice(0, last.index) + String(number) + text.slice(last.index + last[0].length)
    const head = text.trimEnd()
    return `${head}${head !== "" ? " " : ""}${number}${letter ?? ""}`
}

/*  style the cells of a table and determine its column widths within the available
    columns, right-aligning the question numbers to the widest one (so the wrapped
    lines of all questions share the same indent)  */
const layout = (table: Table, avail: number,
    chosen: Map<number, string> | undefined, marked: number | undefined) => {
    const head   = table.header.map((cell) => style(`**${cell}**`, undefined))
    const digits = Math.max(...table.rows.map((row) => String(row.number).length))
    const rows   = table.rows.map((row) => {
        const numbered = NUMBER.test(row.question)
        return {
            lead:     numbered ? digits - String(row.number).length : 0,
            indent:   numbered ? digits + 3 : 0,
            question: style(row.question, marked === row.number ? PICKED : undefined),
            answers:  row.answers.map((answer) =>
                style(answer.text, chosen?.get(row.number) === answer.letter ? PICKED : undefined)),
            recommend: row.recommend !== undefined ?
                style(row.recommend.text, chosen?.get(row.number) === row.recommend.letter ? PICKED : undefined) : []
        }
    })
    const three = head.length === 3
    const w1nat = Math.max(width(head[0]!), ...rows.map((row) => row.lead + width(row.question)))
    const w2nat = Math.max(width(head[1]!), ...rows.flatMap((row) => row.answers.map((answer) => width(answer))))
    const w3nat = three ? Math.max(width(head[2]!), ...rows.map((row) => width(row.recommend))) : 0
    let   w1    = Math.min(w1nat, Math.floor(avail * (three ? 0.35 : 0.4)))
    let   w3    = Math.min(w3nat, Math.floor(avail * 0.25))
    const w2    = Math.min(w2nat, avail - w1 - w3)
    w1          = Math.min(w1nat, avail - w2 - w3)
    w3          = Math.min(w3nat, avail - w1 - w2)
    return { head, rows, three, w1, w2, w3 }
}

/*  the grill table: its state and its operations  */
export const modGrill = () => {
    /*  the last known width of the terminal, the already seen tables, the
        latest (still unanswered) table, the picks and the selected question of the
        still unsubmitted prompt, and the frozen picks of the already answered tables  */
    let columns  = 80
    const seen   = new Set<string>()
    let latest: string | undefined
    let picks    = new Map<number, string>()
    let selected: number | undefined
    const frozen = new Map<string, Map<number, string>>()

    /*  refresh the picks and the selection from the prompt  */
    const refresh = (text: string) => {
        picks    = pick(text)
        selected = select(text)
    }

    /*  track the picks inside the edited prompt (and tell whether they changed)  */
    const track = (text: string): boolean => {
        const before = JSON.stringify([ [ ...picks ], selected ])
        refresh(text)
        return JSON.stringify([ [ ...picks ], selected ]) !== before
    }

    /*  freeze the picks in the latest table once the prompt is submitted  */
    const submit = (text: string) => {
        if (latest !== undefined)
            frozen.set(latest, pick(text))
        latest   = undefined
        picks    = new Map()
        selected = undefined
    }

    /*  insert the number of a clicked question or the short response of a clicked
        answer into the prompt and refresh the picks and the selection from it  */
    const press = (engine: Pick<Engine, "invalidate" | "prompt" | "fill">,
        number: number, letter?: string) => () => {
        engine.prompt()
            .then(({ text }) => engine.fill(insert(text, number, letter)))
            .then((box) => {
                refresh(box.text)
                engine.invalidate()
            })
            .catch(() => {
                /*  ignore a prompt which is no longer accessible  */
            })
    }

    /*  redraw a reply which contains a grilling table (terminal only),
        resp. draw nothing for any other reply  */
    const render = (e: Frozen<MatchedEvent<"ui.render", { component: "AssistantMessage", surface: "terminal" }>>,
        ui: Elements["terminal"], engine: Pick<Engine, "invalidate" | "prompt" | "fill">): RenderElement | undefined => {
        /*  act on grilling tables only, which fit into the terminal
            (gutter, grid lines, cell paddings, and a spare column subtracted)  */
        columns = e.viewport?.columns ?? columns
        const table = parse(e.props.text)
        const avail = columns - 2 - (table?.header.length === 3 ? 10 : 7) - 1
        if (table === undefined || avail < 40 || table.before.length > LIMIT || table.after.length > LIMIT)
            return undefined

        /*  determine the picks: frozen ones or, for the latest table, the live ones  */
        if (!seen.has(e.requestId)) {
            seen.add(e.requestId)
            latest = e.requestId
        }
        const chosen = frozen.get(e.requestId) ?? (e.requestId === latest ? picks : undefined)
        const marked = e.requestId === latest ? selected : undefined

        /*  style the cells and determine the column widths  */
        const { head, rows, three, w1, w2, w3 } = layout(table, avail, chosen, marked)

        /*  resolve the UI elements  */
        const { Box, Text, Button, Markdown } = ui

        /*  draw a line of a cell: its styled runs, padded to the column width  */
        const padded = (chars: Char[], span: number): (string | RenderElement)[] =>
            [ ...paint(Text, chars), " ".repeat(Math.max(0, span - width(chars))) ]

        /*  draw a line of a cell: in the latest table as the styled text inside a
            hover-scoping box, which while any line of its group (all lines of the
            same question or answer) is hovered reveals a row of clickable plain
            buttons (one per styled run, inverted in the default colors and carrying
            the run's bold style, but not its color, as its hover style, because the
            engine leaves the space cells uncolored) on top of it; otherwise as
            styled text only  */
        const draw = (chars: Char[], span: number, group: string, line: number,
            onPress: (() => void) | undefined): RenderElement[] => {
            const w = width(chars)
            if (e.requestId !== latest || w === 0 || onPress === undefined)
                return [ Text({ children: padded(chars, span) }) ]
            const buttons = split(chars).map(({ text, bold }, r) =>
                Button({ key: `${group}/${line}/${r}`, label: text, plain: true, onPress,
                    hover: { scope: group, inverse: true, bold } }))
            return [
                Box({ key: `${group}/${line}`, hover: { scope: group }, children: [
                    Text({ children: padded(chars, w) }),
                    Box({ position: "absolute", top: 0, left: 0, display: "none",
                        hover: { scope: group, display: "flex" }, flexDirection: "row", children: buttons })
                ] }),
                Text({ children: " ".repeat(Math.max(0, span - w)) })
            ]
        }

        /*  draw the table as a grid: a rule between all rows and one answer per line  */
        const rule = (l: string, m: string, r: string) =>
            Text({ wrap: "truncate-end", children: l + "─".repeat(w1 + 2) + m + "─".repeat(w2 + 2)
                + (three ? m + "─".repeat(w3 + 2) : "") + r })
        const grid: RenderElement[] = [
            rule("┌", "┬", "┐"),
            Text({ wrap: "truncate-end", children:
                [ "│ ", ...padded(head[0]!, w1), " │ ", ...padded(head[1]!, w2),
                    ...(three ? [ " │ ", ...padded(head[2]!, w3) ] : []), " │" ] }),
            rule("├", "┼", "┤")
        ]
        rows.forEach((row, k) => {
            const number = table.rows[k]!.number
            const q = wrap(row.question, w1, row.indent, row.lead).map((line, i) =>
                draw(line, w1, `q${number}`, i, press(engine, number)))
            const a = row.answers.flatMap((answer, j) => {
                const letter = table.rows[k]!.answers[j]!.letter
                return wrap(answer, w2, INDENT).map((line, i) =>
                    draw(line, w2, `a${number}${letter}`, i, letter !== "" ? press(engine, number, letter) : undefined))
            })
            const recommend = table.rows[k]!.recommend
            const r = three && recommend !== undefined ?
                wrap(row.recommend, w3, INDENT).map((line, i) =>
                    draw(line, w3, `r${number}`, i, recommend.letter !== "" ? press(engine, number, recommend.letter) : undefined)) : []
            for (let i = 0; i < Math.max(q.length, a.length, r.length); i++)
                grid.push(Box({ flexDirection: "row", children: [
                    Text({ children: "│ " }),
                    ...(q[i] ?? [ Text({ children: " ".repeat(w1) }) ]),
                    Text({ children: " │ " }),
                    ...(a[i] ?? [ Text({ children: " ".repeat(w2) }) ]),
                    ...(three ? [
                        Text({ children: " │ " }),
                        ...(r[i] ?? [ Text({ children: " ".repeat(w3) }) ])
                    ] : []),
                    Text({ children: " │" })
                ] }))
            grid.push(k < rows.length - 1 ? rule("├", "┼", "┤") : rule("└", "┴", "┘"))
        })

        /*  hint below the latest table that the terminal reports presses in
            the fullscreen layout only, so the cells cannot be clicked here  */
        if (e.requestId === latest && e.viewport?.isFullscreen === false)
            grid.push(Text({ dimColor: true, children:
                "Clicking needs the fullscreen layout (/config → fullscreen); typing \"nX\" works anyway." }))

        /*  mimic the reply row of the engine: blank row above and bullet gutter  */
        return Box({ flexDirection: "row", marginTop: 1, width: "100%", children: [
            Box({ flexShrink: 0, minWidth: 2, children: Text({ children: e.props.isFirstOfReply ? "⏺" : " " }) }),
            Box({ flexDirection: "column", flexGrow: 1, flexShrink: 1, children: [
                ...(table.before !== "" ? [ Markdown({ text: table.before }) ] : []),
                Box({ flexDirection: "column", marginTop: table.before !== "" ? 1 : 0, children: grid }),
                ...(table.after !== "" ? [ Box({ marginTop: 1, children: Markdown({ text: table.after }) }) ] : [])
            ] })
        ] })
    }

    return { refresh, track, submit, render }
}

