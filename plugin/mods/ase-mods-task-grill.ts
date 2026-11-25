/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

/*  Claude Code function hooks module ("mod", EARLY ACCESS):
    Grill table, redrawing the grilling tables of ASE with one answer
    alternative per line (wrapped lines indented) and rendering in red
    the answers picked in the prompt via "nX" short responses and the
    question selected in the prompt via the last standalone "n", and
    rendering the "★" marker in red and the "⚑" marker in blue, resp. in red
    on a picked or selected line (in the table and in the texts, but not
    the titles, of the cards). In the
    latest table, questions and answers are clickable and insert their
    "n" or "nX" into the prompt, and a question with a detail resp. an answer
    with a detail and optional rationale (provided through the tool
    "ase_mods_grill_details", registered by this mod) reveals them in a card
    while hovered.  */

import type { Elements, Frozen, MatchedEvent, RenderElement } from "claude-code"
import { type Engine, type Char, PICKED, ROW, RULE, cells, style, width, wrap, split, paint,
    uniform } from "./ase-mods-common"

/*  the tool providing the details of the questions and answers of the latest grilling table, as listed for the model  */
export const TOOL = {
    name:        "ase_mods_grill_details",
    description: "Provide the details of the questions and answers of the grilling table of ASE, which is output right " +
        "after this call, shown to the user in a card while hovering over a question resp. an answer. Pass `details` as an object mapping the short response " +
        "`nX` of each answer (question number and answer letter, like \"1A\") to the longer form of the " +
        "answer (at most 3-4 sentences), optionally `rationales` as an object mapping the short response " +
        "of each answer of a question with a recommended (`★`) answer to the reason (1-2 sentences) why it " +
        "is the best answer resp. why not, compared to the recommended one (shown prefixed with " +
        "\"WHY ★:\" resp. \"WHY NOT ★:\"), and optionally `questions` as an object " +
        "mapping the number `n` of each question (like \"1\") to the longer description (at most 3-4 sentences) of " +
        "what the question is about (shown prefixed with \"WHAT:\"). Returns `OK: ...` or `ERROR: ...` as text. On `OK: ...`, do NOT " +
        "mention, describe, or confirm this call in the response.",
    inputSchema: {
        type: "object",
        properties: {
            details:    { type: "object", additionalProperties: { type: "string" },
                description: "longer form (at most 3-4 sentences) of each answer, keyed by its short response \"nX\"" },
            rationales: { type: "object", additionalProperties: { type: "string" },
                description: "reason (1-2 sentences) why (not) of each answer of a question with a " +
                    "recommended answer, keyed by its short response \"nX\"" },
            questions:  { type: "object", additionalProperties: { type: "string" },
                description: "longer description (at most 3-4 sentences) of what each question is about, " +
                    "keyed by its number \"n\"" }
        },
        required: [ "details" ]
    }
}

/*  the full name of the tool, and the color of the frame of a detail card  */
const NAME = "mcp__ase__ase_mods_grill_details"
const RIM  = "ansi256(4)"

/*  the marker line above a grilling table (single-round and multi-round,
    optionally labeled with the perspective and/or grounding)  */
const MARKER = /⧉ \*{0,2}ASE\*{0,2}: GRILLING(?: ROUND \d+\/\d+)?(?: \([^)]*\))?:/

/*  the separator between two answers, the letter of
    an answer, and the number of a question  */
const ANSWER = /,\s+(?=\*{0,2}[A-Z]\*{0,2}\s+▶)/
const LETTER = /^\*{0,2}([A-Z])\*{0,2}\s+▶/
const NUMBER = /^\*{0,2}(\d+)\*{0,2}\s+▶/

/*  the label of an answer, the recommendation marker inside it,
    and the focus and topic of a question  */
const LABEL = /^\*{0,2}[A-Z]\*{0,2}\s+▶\s+(.*?):(?:\s|$)/
const STAR  = "★"
const TOPIC = /^\*{0,2}\d+\*{0,2}\s+▶\s+(.*?):(?:\s|$)/

/*  the colors of the recommendation and current decision markers  */
const MARKS = new Map([ [ "★", "ansi256(1)" ], [ "⚑", "ansi256(4)" ] ])

/*  color the recommendation and current decision markers of styled characters
    (in the color of a picked resp. selected line, if given)  */
const glyphs = (chars: Char[], picked?: string): Char[] =>
    chars.map((char) => MARKS.has(char.ch) ? { ...char, color: picked ?? MARKS.get(char.ch) } : char)

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
    rows:   { number: number, question: string, answers: { letter: string, text: string }[] }[]
}

/*  parse the grilling table out of the text of a reply  */
const parse = (text: string): Table | undefined => {
    const lines = text.split("\n")
    const m = lines.findIndex((line) => MARKER.test(line))
    const h = lines.findIndex((line, i) => m !== -1 && i > m && ROW.test(line))
    if (h === -1 || !RULE.test(lines[h + 1] ?? ""))
        return undefined
    const header = cells(lines[h]!).map((cell) => cell.replace(/\*/g, ""))
    if (header.length !== 2 || header[0] !== "QUESTION" || !/^ANSWERS?$/.test(header[1]!))
        return undefined
    let end = h + 2
    while (end < lines.length && ROW.test(lines[end]!))
        end++
    const rows = lines.slice(h + 2, end).map((line) => cells(line))
    if (rows.length === 0 || rows.some((row) => row.length !== 2))
        return undefined
    return {
        before: lines.slice(0, h).join("\n").trim(),
        after:  lines.slice(end).join("\n").replace(/^\n+/, "").trimEnd(),
        header,
        rows:   rows.map((row, i) => ({
            number:   Number(NUMBER.exec(row[0]!)?.[1] ?? i + 1),
            question: row[0]!,
            answers:  row[1]!.split(ANSWER).map((answer) =>
                ({ letter: LETTER.exec(answer)?.[1] ?? "", text: answer }))
        }))
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
        const color    = marked === row.number ? PICKED : undefined
        return {
            lead:     numbered ? digits - String(row.number).length : 0,
            indent:   numbered ? digits + 3 : 0,
            question: glyphs(style(row.question, color), color),
            answers:  row.answers.map((answer) => {
                const color = chosen?.get(row.number) === answer.letter ? PICKED : undefined
                return glyphs(style(answer.text, color), color)
            })
        }
    })
    const w1nat = Math.max(width(head[0]!), ...rows.map((row) => row.lead + width(row.question)))
    const w2nat = Math.max(width(head[1]!), ...rows.flatMap((row) => row.answers.map((answer) => width(answer))))
    let   w1    = Math.min(w1nat, Math.floor(avail * 0.4))
    const w2    = Math.min(w2nat, avail - w1)
    w1          = Math.min(w1nat, avail - w2)
    return { head, rows, w1, w2 }
}

/*  a detail card of a question or answer: its group, title, detail, optional
    rationale, and the grid rows "first" to "last" of its entire table row  */
type Spot = { group: string, title: Char[], detail: string, reason: Char[] | undefined,
    first: number, last: number, question: boolean }

/*  draw the detail card of a question or answer in the latest table: its detail
    (plus its optional rationale, below a blank line) inside a
    heavy frame of the width of its column, with the number, focus, and topic
    of the question resp. the short response and the
    label of the answer as its title in the top edge (inverse, in the frame
    color, with a blank on both sides), placed absolutely in the question resp.
    answer column (with the grid rows "first" to "last" of the entire table row)
    starting at the first grid row of the following table row if it fits into
    the grid (or no previous table row exists), else ending at the last grid row
    of the previous table row (so the hovered table row stays visible and
    reachable), and revealed while any line of the question
    resp. answer is hovered (appended after all grid rows and the text after the
    table, as an absolute box paints over the boxes before it only)  */
const card = (ui: Elements["terminal"], w1: number, w2: number,
    { group, title, detail, reason, first, last, question }: Spot, rowsTotal: number): RenderElement => {
    const { Box, Text } = ui
    const span  = question ? w1 : w2
    const rim   = (text: string) => uniform(text, false, RIM)
    const label = [ ...title ]
    while (width(label) > span - 6)
        label.pop()
    const body  = [ ...wrap([ ...uniform("WHAT: ", true, undefined), ...style(detail, undefined) ], span - 4, 0),
        ...(reason !== undefined ? [ [], ...wrap(reason, span - 4, 0) ] : []) ]
    const lines = [
        [ ...rim("┏━"), ...[ ...uniform(" ", true, RIM), ...label, ...uniform(" ", true, RIM) ]
            .map((char) => ({ ...char, color: RIM, inverse: true })),
        ...rim(`${"━".repeat(Math.max(0, span - 5 - width(label)))}┓`) ],
        ...body.map((line) => [ ...rim("┃ "), ...glyphs(line),
            ...uniform(" ".repeat(Math.max(0, span - 4 - width(line))), false, undefined), ...rim(" ┃") ]),
        rim(`┗${"━".repeat(span - 2)}┛`)
    ]
    const below = last + 2
    const above = first - 1 - lines.length
    const top   = below + lines.length <= rowsTotal || above < 0 ? below : above
    return Box({ position: "absolute", top, left: question ? 2 : w1 + 5, width: span, flexDirection: "column",
        display: "none", hover: { scope: group, display: "flex" },
        children: lines.map((line) => Text({ wrap: "truncate-end", children: paint(Text, line) })) })
}

/*  the grill table: its state and its operations  */
export const modGrill = () => {
    /*  the last known width of the terminal, the already seen tables, the
        latest (still unanswered) table, the picks and the selected question of the
        still unsubmitted prompt, the frozen picks of the already answered tables,
        the details and rationales of the answers of the latest table (keyed by "nX"),
        and the details of its questions (keyed by "n")  */
    let columns   = 80
    const seen    = new Set<string>()
    let latest: string | undefined
    let picks     = new Map<number, string>()
    let selected: number | undefined
    const frozen  = new Map<string, Map<number, string>>()
    let details   = new Map<string, string>()
    let reasons   = new Map<string, string>()
    let questions = new Map<string, string>()

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
        latest    = undefined
        picks     = new Map()
        selected  = undefined
        details   = new Map()
        reasons   = new Map()
        questions = new Map()
    }

    /*  take the details and the optional rationales of the answers and the
        optional details of the questions of the latest table from the tool  */
    const provide = (input: unknown, extra?: unknown, query?: unknown): string => {
        const object = (value: unknown): value is object =>
            typeof value === "object" && value !== null && !Array.isArray(value)
        const keyed = (value: object, letter: boolean) =>
            new Map(Object.entries(value).flatMap(([ key, text ]): [ string, string ][] => {
                const m = (letter ? /^\s*(\d+)\s*([a-zA-Z])\s*$/ : /^\s*(\d+)\s*()$/).exec(key)
                return m !== null && typeof text === "string" && text.trim() !== "" ?
                    [ [ `${Number(m[1]!)}${m[2]!.toUpperCase()}`, text.trim() ] ] : []
            }))
        if (!object(input))
            return "ERROR: invalid \"details\" argument: object expected"
        if (extra !== undefined && !object(extra))
            return "ERROR: invalid \"rationales\" argument: object expected"
        if (query !== undefined && !object(query))
            return "ERROR: invalid \"questions\" argument: object expected"
        details   = keyed(input, true)
        reasons   = extra !== undefined ? keyed(extra, true) : new Map()
        questions = query !== undefined ? keyed(query, false) : new Map()
        return `OK: details of ${questions.size} questions and ${details.size} answers ` +
            `(${reasons.size} with rationale) revealed to the user on hovering`
    }

    /*  draw the rows of a successful call of the tool as nothing,
        as the call is mere plumbing for the user (terminal only)  */
    const hide = (tool: string, errored: boolean | undefined, ui: Elements["terminal"]): RenderElement | undefined =>
        tool === NAME && errored !== true ? ui.Box({ children: [] }) : undefined

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
        const avail = columns - 2 - 7 - 1
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
        const { head, rows, w1, w2 } = layout(table, avail, chosen, marked)

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

        /*  draw the table as a grid: a rule between all rows and one answer per line
            (remembering the grid rows of the table rows of the questions and answers with
            a detail for their cards, and prefixing a detail by "WHAT", and a rationale by
            "WHY ★" for the recommended answer, else "WHY NOT ★")  */
        const rule = (l: string, m: string, r: string) =>
            Text({ wrap: "truncate-end", children: l + "─".repeat(w1 + 2) + m + "─".repeat(w2 + 2) + r })
        const grid: RenderElement[] = [
            rule("┌", "┬", "┐"),
            Text({ wrap: "truncate-end", children:
                [ "│ ", ...padded(head[0]!, w1), " │ ", ...padded(head[1]!, w2), " │" ] }),
            rule("├", "┼", "┤")
        ]
        const spots: Spot[] = []
        rows.forEach((row, k) => {
            const number = table.rows[k]!.number
            const mark   = spots.length
            const q = wrap(row.question, w1, row.indent, row.lead).map((line, i) =>
                draw(line, w1, `q${number}`, i, press(engine, number)))
            const detail = questions.get(String(number))
            const topic  = TOPIC.exec(table.rows[k]!.question)?.[1] ?? ""
            if (e.requestId === latest && detail !== undefined && w1 >= 20)
                spots.push({ group: `q${number}`, detail, reason: undefined,
                    first: grid.length, last: grid.length, question: true,
                    title: [ ...uniform(`${number}${topic !== "" ? " ▶ " : ""}`, true, undefined),
                        ...style(topic, undefined).map((char) => ({ ...char, bold: true })) ] })
            const a = row.answers.flatMap((answer, j) => {
                const { letter, text } = table.rows[k]!.answers[j]!
                const lines  = wrap(answer, w2, INDENT).map((line, i) =>
                    draw(line, w2, `a${number}${letter}`, i, letter !== "" ? press(engine, number, letter) : undefined))
                const detail = details.get(`${number}${letter}`)
                const reason = reasons.get(`${number}${letter}`)
                const label  = LABEL.exec(text)?.[1] ?? ""
                if (e.requestId === latest && letter !== "" && detail !== undefined && w2 >= 20)
                    spots.push({ group: `a${number}${letter}`, detail,
                        reason: reason !== undefined ? [ ...uniform(
                            (label.includes(STAR) ? "WHY" : "WHY NOT") + ` ${STAR}: `, true, undefined),
                            ...style(reason, undefined) ] : undefined,
                        first: grid.length, last: grid.length, question: false,
                        title: [ ...uniform(`${number}${letter} ▶ `, true, undefined),
                            ...style(label, undefined).map((char) => ({ ...char, bold: true })) ] })
                return lines
            })
            for (let i = 0; i < Math.max(q.length, a.length); i++)
                grid.push(Box({ flexDirection: "row", children: [
                    Text({ children: "│ " }),
                    ...(q[i] ?? [ Text({ children: " ".repeat(w1) }) ]),
                    Text({ children: " │ " }),
                    ...(a[i] ?? [ Text({ children: " ".repeat(w2) }) ]),
                    Text({ children: " │" })
                ] }))
            for (const spot of spots.slice(mark))
                spot.last = grid.length - 1
            grid.push(k < rows.length - 1 ? rule("├", "┼", "┤") : rule("└", "┴", "┘"))
        })
        const cards = spots.map((spot) => card(ui, w1, w2, spot, grid.length))

        /*  mimic the reply row of the engine: blank row above and bullet gutter  */
        return Box({ flexDirection: "row", marginTop: 1, width: "100%", children: [
            Box({ flexShrink: 0, minWidth: 2, children: Text({ children: e.props.isFirstOfReply ? "⏺" : " " }) }),
            Box({ flexDirection: "column", flexGrow: 1, flexShrink: 1, children: [
                ...(table.before !== "" ? [ Markdown({ text: table.before }) ] : []),
                Box({ flexDirection: "column", marginTop: table.before !== "" ? 1 : 0, children: [ ...grid,
                    ...(table.after !== "" ? [ Box({ marginTop: 1, children: Markdown({ text: table.after }) }) ] : []),
                    ...cards ] })
            ] })
        ] })
    }

    return { refresh, track, submit, provide, hide, render }
}

