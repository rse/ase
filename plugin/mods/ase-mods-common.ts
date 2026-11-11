/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

/*  Claude Code function hooks module ("mod", EARLY ACCESS):
    Common parts, shared by the grill table, the decision matrix, the intent
    help, the synopsis form, the manual band, the manpage browser, the hint band,
    the task band, and the image rendering: the rows of the Markdown tables, the styled characters of the terminal
    drawing, their Markdown conversion, wrapping, and framing, and the contract,
    keys, geometry, and drawing of the master/detail view in the band above the
    prompt.  */

import type { Elements, Frozen, MatchedEvent, McpToolResult, ModelCompleteRequest, ModelForkResult,
    PromptBox, PromptEditInput, PromptFilled, RenderElement, Timer, UiBlitArgs, UiBlitResult } from "claude-code"

/*  the services of the engine, bound by the hooking infrastructure for the
    modules (as the engine refuses to load a module passing "$" itself): the
    redrawing, the reading of a plugin file and of the names of the directories
    in a plugin directory, the forked and the plain model completion, the
    waiting, the reading and filling of the prompt, the loading of a task
    (with its entity tag), the running of a repeating timer, the rasterizing
    of an image (by the MCP tool "ase_rasterize"), the reading of a file
    as bytes (base64), the swapping of the source of a drawn keyed image,
    and the probe whether the terminal can show inline images  */
export type Engine = {
    invalidate: () => void,
    read:       (file: string) => Promise<string>,
    dirs:       (dir: string) => Promise<string[]>,
    fork:       (prompt: string) => Promise<ModelForkResult | null>,
    complete:   (request: ModelCompleteRequest) => Promise<string>,
    sleep:      (ms: number) => Promise<void>,
    prompt:     () => Promise<PromptBox>,
    fill:       (text: string) => Promise<PromptFilled>,
    load:       (id: string) => Promise<string>,
    every:      (ms: number, fn: () => void) => Timer,
    rasterize:  (args: Record<string, unknown>) => Promise<McpToolResult>,
    diagram:    (args: Record<string, unknown>) => Promise<McpToolResult>,
    bytes:      (file: string) => Promise<string>,
    blit:       (args: UiBlitArgs) => Promise<UiBlitResult>,
    graphics:   () => Promise<boolean>
}

/*  the colors of a picked (resp. selected or focused) item, of a code span,
    and of a skill command (the theme color of a command inside the prompt)  */
export const PICKED  = "red"
export const CODE    = "blue"
export const COMMAND = "suggestion"

/*  the trigger suffix of a synopsis form or an intent ("!!"), resp. of a manual band
    or a manpage browser ("//") inside the prompt (each further constrained by the
    pattern of the synopsis form, the intent, the manual band, resp. the browser)  */
export const TRIGGER = /(?:!!|\/\/)$/

/*  the share of the terminal height taken by the band above the prompt  */
const BAND = 0.25

/*  the self-drawn rounded frame around the content of the band above the
    prompt: the columns taken by its borders and its left padding, the
    columns before its content, and the rows taken by its edges, and the
    style of its lines (the dimmed default color, which renders as a darker
    grey than the "gray" color)  */
const FRAME  = { cols: 3, lead: 2, rows: 2 } as const
const BORDER = { dimColor: true } as const

/*  the events of drawing resp. scrolling the band above the prompt  */
export type BandRender = Frozen<MatchedEvent<"ui.render", { component: "AbovePrompt", surface: "terminal" }>>
export type BandScroll = Frozen<MatchedEvent<"ui.scroll", { component: "AbovePrompt" }>>

/*  a band above the prompt (the synopsis form, the intent band, or the manpage
    browser, of which at most one is shown at a time), as dispatched by the
    hooking infrastructure: whether it is shown, closing it, closing it on a
    failure (determining the prompt to restore), operating it by a key
    (determining the prompt to hold, resp. the text onto whose end the edit is
    still to be applied), by the wheel, and by RETURN at the prompt
    (determining the prompt to refill), and drawing it  */
export type Band = {
    active: () => boolean,
    reset:  () => void,
    cancel: () => string | undefined,
    edit:   (e: Frozen<PromptEditInput>) => PromptBox | string,
    scroll: (e: BandScroll) => boolean,
    submit: () => string,
    render: (e: BandRender, ui: Elements["terminal"]) => RenderElement | undefined
}

/*  hold the prompt while the band above the prompt is shown: the text with a
    trailing space and backslash before the cursor and another space after it
    (so, as a move or deletion at either end of the prompt raises no edit, moves
    and deletions in both directions stay possible, and, as RETURN after a
    backslash inserts a newline instead of submitting the prompt, RETURN
    arrives as an edit, too, which keeps the cursor inside the prompt)  */
export const held = (text: string): PromptBox =>
    ({ text: `${text} \\ `, cursor: text.length + 2 })

/*  a key pressed in the band above the prompt: its name, its typed text, its
    cursor step (-1 left, +1 right), and its deletion (-1 backward, +1 forward)  */
export type Key = { name: string, text: string, step: number, erase: number }

/*  decode an edit of the held prompt into a key, where RETURN arrives as a
    typed newline, and cursor moves and deletions are told by their splice  */
export const decode = (e: Frozen<PromptEditInput>): Key => {
    const name   = e.inputText === "\n" ? "return" : e.key?.key ?? ""
    const erased = e.inputText === "" && e.end > e.start
    return {
        name,
        text:  e.inputText === "\n" ? "" : e.inputText,
        step:  name === "left" ? -1 : name === "right" ? 1 :
            e.inputText === "" && !erased ? Math.sign(e.start - e.cursor) : 0,
        erase: erased ? (e.start < e.cursor ? -1 : 1) : 0
    }
}

/*  a row and the delimiter row of a Markdown table  */
export const ROW  = /^ *\|.*\| *$/
export const RULE = /^ *\|(?: *:?-+:? *\|)+ *$/

/*  split a Markdown table row into its cells  */
export const cells = (line: string): string[] => {
    const result: string[] = []
    const body = line.trim().replace(/^\|/, "").replace(/\|$/, "")
    let cell = ""
    let code = false
    for (let i = 0; i < body.length; i++) {
        const ch = body[i]!
        if (ch === "`")
            code = !code
        if (!code && ch === "\\" && body[i + 1] === "|") {
            cell += "|"
            i++
        }
        else if (!code && ch === "|") {
            result.push(cell.trim())
            cell = ""
        }
        else
            cell += ch
    }
    result.push(cell.trim())
    return result
}

/*  a single styled character of the terminal drawing  */
export type Char = { ch: string, bold: boolean, color: string | undefined, italic?: boolean, inverse?: boolean, background?: string }

/*  extract a section of a manual page (without its heading)  */
export const section = (manual: string, name: string): string =>
    manual.split(/^(?=## {2})/m).find((text) => text.startsWith(`##  ${name}`))?.replace(/^.*\n/, "") ?? ""

/*  convert inline Markdown (bold and code spans) into styled characters  */
export const style = (text: string, color: string | undefined): Char[] => {
    const chars: Char[] = []
    let bold = false
    let code = false
    for (let i = 0; i < text.length; i++) {
        if (!code && text.startsWith("**", i)) {
            bold = !bold
            i++
        }
        else if (text[i] === "`")
            code = !code
        else {
            const ch = String.fromCodePoint(text.codePointAt(i)!)
            chars.push({ ch, bold, color: color ?? (code ? CODE : undefined) })
            i += ch.length - 1
        }
    }
    return chars
}

/*  the width of styled characters in terminal cells  */
export const width = (chars: Char[]): number => {
    let n = 0
    for (const { ch } of chars) {
        const c = ch.codePointAt(0)!
        if ((c >= 0x200B && c <= 0x200D) || c === 0x2060 || c === 0xFEFF ||
            (c >= 0x0300 && c <= 0x036F) || (c >= 0xFE00 && c <= 0xFE0F))
            continue
        const wide =
            (c >= 0x1100  && c <= 0x115F) || (c >= 0x2E80  && c <= 0xA4CF) ||
            (c >= 0xAC00  && c <= 0xD7A3) || (c >= 0xF900  && c <= 0xFAFF) ||
            (c >= 0xFF00  && c <= 0xFF60) || (c >= 0x1F300 && c <= 0x1FAFF) ||
            (c >= 0x20000 && c <= 0x3FFFD)
        n += wide ? 2 : 1
    }
    return n
}

/*  hard-wrap styled characters at word boundaries to the given columns,
    indenting the first line by "lead" and all further lines by "indent"
    (and chopping overlong words)  */
export const wrap = (chars: Char[], columns: number, indent: number, lead = 0): Char[][] => {
    const space: Char = { ch: " ", bold: false, color: undefined }
    const words: Char[][] = [ [] ]
    for (const char of chars) {
        if (char.ch === " ")
            words.push([])
        else
            words.at(-1)!.push(char)
    }
    const lines: Char[][] = []
    let line: Char[] = Array.from({ length: lead }, () => space)
    let start = lead
    let size  = lead
    const flush = () => {
        lines.push(line)
        line  = Array.from({ length: indent }, () => space)
        start = indent
        size  = indent
    }
    for (let word of words.filter((word) => word.length > 0)) {
        while (word.length > 0) {
            const w = width(word)
            if (size > start && size + 1 + w <= columns) {
                line.push(space, ...word)
                size += 1 + w
                word = []
            }
            else if (size > start)
                flush()
            else {
                let n = 1
                while (n < word.length && width(word.slice(0, n + 1)) <= columns - start)
                    n++
                line.push(...word.slice(0, n))
                size += width(word.slice(0, n))
                word = word.slice(n)
                if (word.length > 0)
                    flush()
            }
        }
    }
    lines.push(line)
    return lines
}

/*  a run of equally styled characters  */
type Run = { text: string, bold: boolean, color: string | undefined, italic: boolean, inverse: boolean, background: string | undefined }

/*  split a line of styled characters into runs of equally styled characters  */
export const split = (chars: Char[]): Run[] => {
    const runs: Run[] = []
    for (let i = 0, j = 0; i < chars.length; i = j) {
        const { bold, color } = chars[i]!
        const italic  = chars[i]!.italic  ?? false
        const inverse = chars[i]!.inverse ?? false
        const { background } = chars[i]!
        while (j < chars.length && chars[j]!.bold === bold && chars[j]!.color === color &&
            (chars[j]!.italic ?? false) === italic && (chars[j]!.inverse ?? false) === inverse &&
            chars[j]!.background === background)
            j++
        runs.push({ text: chars.slice(i, j).map((char) => char.ch).join(""), bold, color, italic, inverse, background })
    }
    return runs
}

/*  convert plain text (without any Markdown) into equally styled characters  */
export const uniform = (text: string, bold: boolean, color: string | undefined): Char[] =>
    Array.from(text, (ch) => ({ ch, bold, color }))

/*  strip the single-asterisk emphasis outside the code spans of inline Markdown  */
export const strip = (text: string): string =>
    text.split("`").map((part, i) => i % 2 === 0 ? part.replace(/(?<!\*)\*(?!\*)/g, "") : part).join("`")

/*  convert the Markdown blocks of a manual page section (paragraphs, list items,
    and code fences) into lines of styled characters, hard-wrapped to the given
    columns (except for the code lines), with a blank line between the blocks,
    where "nested" keeps the indentation of the blocks and of the list item texts  */
export const flow = (text: string, columns: number, nested = false): Char[][] => {
    const result: Char[][] = []
    let block: string[] = []
    let fence = false
    const flush = () => {
        if (block.length === 0)
            return
        if (result.length > 0)
            result.push([])
        const pad  = nested ? /^ */.exec(block[0]!)![0].length : 0
        const body = strip(block.map((line) => line.trim()).join(" "))
        const item = /^(-|\d+\.)\s+/.exec(body)
        if (item !== null) {
            const mark  = (item[1] === "-" ? "•" : item[1]!).padEnd(nested ? item[0].length : item[1]!.length + 1)
            const lines = wrap(style(body.slice(item[0].length), undefined), columns, pad + mark.length, pad + mark.length)
            lines[0]!.splice(pad, mark.length, ...uniform(mark, false, undefined))
            result.push(...lines)
        }
        else
            result.push(...wrap(style(body, undefined), columns, pad, pad))
        block = []
    }
    for (const line of text.replace(/^\s*\n|\s+$/g, "").split("\n")) {
        if (line.startsWith("```")) {
            flush()
            if (!fence && result.length > 0)
                result.push([])
            fence = !fence
        }
        else if (fence)
            result.push(uniform(line, false, CODE))
        else if (line.trim() === "")
            flush()
        else {
            if (/^(?:-|\d+\.)\s/.test(line))
                flush()
            block.push(line)
        }
    }
    flush()
    return result
}

/*  surround lines of styled characters with a rounded box of the given total
    columns and border color (padding the lines to the inner columns)  */
export const frame = (lines: Char[][], columns: number, color: string | undefined): Char[][] => {
    const rim = (text: string) => uniform(text, false, color)
    return [
        rim(`╭${"─".repeat(columns - 2)}╮`),
        ...lines.map((line) => [ ...rim("│ "), ...line,
            ...uniform(" ".repeat(Math.max(0, columns - 4 - width(line))), false, undefined), ...rim(" │") ]),
        rim(`╰${"─".repeat(columns - 2)}╯`)
    ]
}

/*  split a horizontal edge of a frame into runs with a title placed after its
    first "lead" and another one before its last "trail" characters (each if it
    fits, the one at the end with precedence), flagged whether they are a title  */
const titled = (line: string, head: string, tail: string, lead: number, trail: number): [ string, boolean ][] => {
    const end   = tail !== "" && line.length >= tail.length + trail + 2 ? tail : ""
    const start = head !== "" && line.length >= head.length + lead + trail + (end !== "" ? end.length + 2 : 0) ? head : ""
    const k     = end !== "" ? line.length - trail - end.length : line.length
    return [
        ...(start !== "" ? [ [ line.slice(0, lead), false ], [ start, true ] ] as [ string, boolean ][] : []),
        [ line.slice(start !== "" ? lead + start.length : 0, k), false ],
        ...(end !== "" ? [ [ end, true ], [ line.slice(k + end.length), false ] ] as [ string, boolean ][] : [])
    ]
}

/*  the scroll position of a view with the given rows over the given lines
    at the given scroll position, as placed into the bottom edge of a frame  */
const position = (rows: number, lines: number, scroll: number): string =>
    lines === 0 ? "" : `[ lines ${scroll + 1}-${Math.min(scroll + rows, lines)}/${lines} ]`

/*  the mark of a scrollbar row: the thumb, the track, or nothing  */
type Mark = "thumb" | "track" | "none"

/*  determine the scrollbar of a view with the given rows over the given lines at
    the given scroll position: for each row the thumb, the track, or nothing  */
const scrollbar = (rows: number, lines: number, scroll: number): Mark[] => {
    if (lines <= rows)
        return Array.from({ length: rows }, () => "none")
    const thumb  = Math.max(1, Math.round(rows * rows / lines))
    const offset = Math.round(scroll / (lines - rows) * (rows - thumb))
    return Array.from({ length: rows }, (_, i) => i >= offset && i < offset + thumb ? "thumb" : "track")
}

/*  determine the rows a scroll event moves a view by: a page of the given size
    for the scroll keys (PAGEUP/PAGEDOWN), resp. its rows for the wheel  */
const paging = (e: { pointer?: unknown, by: number }, size: number): number =>
    e.pointer === undefined && Math.abs(e.by) > 1 ? Math.sign(e.by) * size : e.by

/*  the text element of the terminal surface  */
export type Text = Elements["terminal"]["Text"]

/*  draw a line of styled characters: its styled runs  */
export const paint = (Text: Text, chars: Char[]): (string | RenderElement)[] =>
    split(chars).map(({ text, bold, color, italic, inverse, background }) =>
        bold || italic || inverse || color !== undefined || background !== undefined ?
            Text({ bold, italic, inverse, color, backgroundColor: background, children: text }) : text)

/*  draw a horizontal edge of the self-drawn frame (dimmed), with titles at its
    start and its end (with their brackets dimmed, an "ASE" prefix before a colon
    in bold, and the rest dimmed)  */
export const edge = (Text: Text, line: string, head = "", tail = "", lead = 2, trail = 2): RenderElement =>
    Text({ children: titled(line, head, tail, lead, trail).flatMap(([ text, label ]) => {
        const m = /^(\[ )?([^:]*)(:.*?)( \])?$/.exec(text)
        if (!label || m === null)
            return [ Text({ ...BORDER, children: text }) ]
        return [
            ...(m[1] !== undefined ? [ Text({ ...BORDER, children: m[1] }) ] : []),
            Text({ bold: true, children: m[2]! }),
            Text({ dimColor: true, children: m[3]! }),
            ...(m[4] !== undefined ? [ Text({ ...BORDER, children: m[4] }) ] : [])
        ]
    }) })

/*  draw a row of a scrollbar: the dark grey thumb (an inverse space, as it fills
    the entire cell, unlike a block glyph), the (dimmed) track, or nothing  */
const bar = (Text: Text, mark: Mark | undefined): RenderElement =>
    mark === "thumb" ? Text({ inverse: true, color: "ansi256(242)", children: " " }) :
        mark === "track" ? Text({ dimColor: true, children: "░" }) : Text({ children: " " })

/*  the geometry of the band above the prompt: the inner columns of the self-drawn
    frame, the rows of its views, the columns of its master and detail view, and
    whether the band overflows (to receive the scrolling)  */
export type Layout = { span: number, body: number, master: number, detail: number, overflow: boolean }

/*  determine the geometry of the band above the prompt: the inner columns (both
    borders and the left padding subtracted), the rows (with the frame and the footer
    subtracted) out of a share of the terminal height (but never more than the rows of
    the band), resp., in fullscreen (where the engine raises the scrolling by the wheel
    and, once focused, by the keys only for a tree taller than the band), all rows of
    the band but the one of the engine's "n more" row (as the band then takes them
    anyway), and the columns of the master view (by the given share) and of the
    detail view (with a separator column between them, and a gap, a separator, and
    a scrollbar column right of the detail view)  */
export const layout = (e: BandRender, share: number, band = BAND): Layout => {
    const span     = Math.max(20, e.props.bodyColumns - FRAME.cols)
    const overflow = e.viewport?.isFullscreen === true
    const height   = overflow ? Math.max(FRAME.rows + 2, e.props.maxRows - 1) : Math.min(e.props.maxRows,
        Math.max(FRAME.rows + 2, Math.floor((e.viewport?.rows ?? e.props.maxRows) * band)))
    const master   = Math.floor((span - 3 - 3) * share)
    return { span, body: Math.max(1, height - FRAME.rows - 1), master, detail: span - master - 3 - 3, overflow }
}

/*  the scroll state of the band above the prompt: the first shown row of the
    master view, the first shown line and the lines of a page of the detail
    view, and the first band column right of the master view  */
export type View = { top: number, scroll: number, page: number, split: number }

/*  operate a view by the wheel: over the master view step it (if steppable),
    else scroll the detail view, resp. scroll it by a page with the scroll keys
    (PAGEUP/PAGEDOWN) while the band is focused  */
export const wheel = (e: BandScroll, view: View, step?: (by: number) => void): void => {
    if (step !== undefined && e.pointer !== undefined && e.pointer.column < view.split)
        step(Math.sign(e.by))
    else
        view.scroll = Math.max(0, view.scroll + paging(e, view.page))
}

/*  draw the band above the prompt: inside the self-drawn frame (with the title
    in its top edge) either a single view of the given rows, a single view of the
    given lines with its scrollbar (optionally with the first given characters of
    each line in a gutter at the left border, separated by a vertical line joining
    the edges, with the background of a line filling the columns up to its scrollbar),
    or a master view of the given rows (where the given rule rows are horizontal lines
    joining the borders) and, joined by a separator, a detail view of the given lines
    (optionally dimmed) with its scrollbar, every scrollbar (of lines not always
    fitting) separated by a vertical line joining the edges,
    into the bottom edge the given status (if any) at its start and
    the scroll position of the lines (unless they always fit) at its end, and below
    the frame the key hints (followed by blank rows for an overflowing band),
    where the scroll position is clamped, and the page size (for the scroll keys)
    and the end of the master view (for the wheel) are remembered in the view  */
export const panel = (ui: Elements["terminal"], { span, body, master, detail, overflow }: Layout, view: View, spec: {
    title:   string,
    status?: string,
    hints:   string,
    rows?:   (i: number) => RenderElement | undefined,
    rule?:   (i: number) => boolean,
    lines?:  Char[][],
    dim?:    boolean,
    fit?:    boolean,
    gutter?: number
}): RenderElement => {
    const { Box, Text } = ui
    const lines = spec.lines ?? []
    const solo  = spec.rows === undefined
    view.page   = Math.max(1, body - 1)
    view.split  = solo ? 0 : FRAME.lead + master
    view.scroll = Math.max(0, Math.min(view.scroll, lines.length - body))
    const marks  = scrollbar(body, lines.length, view.scroll)
    const blank  = Text({ children: " " })
    const gutter = solo ? spec.gutter ?? 0 : 0
    const rail   = spec.lines !== undefined && spec.fit !== true
    const lead   = gutter > 0 ? gutter + 2 : 2
    const trail  = rail ? 3 : 2
    const border = (left: string, joint: string, right: string) =>
        left + (!rail ? "─".repeat(span + 1) :
            (gutter > 0 ? `${"─".repeat(gutter)}${joint}${"─".repeat(span - 2 - gutter)}` :
                solo ? "─".repeat(span - 1) :
                    `${"─".repeat(master + 2)}${joint}${"─".repeat(detail + 2)}`) + `${joint}─`) + right
    const scrolled = (i: number, width: number) => {
        const line = lines[view.scroll + i] ?? []
        const fill = line[0]?.background
        return [
            ...(gutter > 0 ? [
                Box({ width: gutter, flexShrink: 0, children: Text({ children: paint(Text, line.slice(0, gutter)) }) }),
                Text({ ...BORDER, children: "│" }),
                Text({ backgroundColor: fill, children: " " })
            ] : []),
            Box({ width, flexShrink: 0, children:
                Text({ wrap: "truncate-end", dimColor: spec.dim ?? false,
                    children: paint(Text, line.slice(gutter)) }) }),
            ...(rail ? [ Text({ backgroundColor: fill, children: " " }), Text({ ...BORDER, children: "│" }) ] :
                [ Text({ children: "  " }) ]),
            bar(Text, marks[i])
        ]
    }
    const rows: RenderElement[] = [ edge(Text, border("╭", "┬", "╮"), spec.title, "", lead, trail) ]
    for (let i = 0; i < body; i++) {
        const rule = !solo && spec.lines !== undefined && spec.rule?.(i) === true
        rows.push(Box({ flexDirection: "row", children: [
            Text({ ...BORDER, children: rule ? "├─" : gutter > 0 ? "│" : "│ " }),
            ...(solo ? scrolled(i, gutter > 0 ? span - 4 - gutter : span - 3) : spec.lines === undefined ? [
                Box({ width: span, flexShrink: 0, children: spec.rows!(i) ?? blank })
            ] : [
                rule ? Text({ ...BORDER, children: `${"─".repeat(master + 1)}┤ ` }) :
                    Box({ width: master, flexShrink: 0, children: spec.rows!(i) ?? blank }),
                ...(rule ? [] : [ Text({ ...BORDER, children: " │ " }) ]),
                ...scrolled(i, detail)
            ]),
            Text({ ...BORDER, children: "│" })
        ] }))
    }
    rows.push(edge(Text, border("╰", "┴", "╯"), spec.status,
        spec.fit === true ? "" : position(body, lines.length, view.scroll), lead, trail))
    rows.push(Box({ paddingLeft: 1, children: Text({ dimColor: true, wrap: "truncate-end", children: spec.hints }) }))
    if (overflow)
        rows.push(blank, blank)
    return Box({ flexDirection: "column", width: "100%", children: rows })
}

