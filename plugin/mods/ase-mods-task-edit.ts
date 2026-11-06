/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

/*  Claude Code function hooks module ("mod", EARLY ACCESS):
    Task band, showing for "ase-task-edit --interactive" (signaled through a tool
    registered by this mod, whose absence tells the skill that no band exists) the
    task in the band above the prompt, rendered like the read dialog of the task
    board TUI, following all changes of the task (keeping the scroll position and
    showing the last change as a unified diff with line numbers) and scrolled by the
    wheel, while the prompt stays free for typing. A "##" typed at the end of the
    prompt drops the diff, showing just the latest state of the task. The band closes
    once a next step of the skill (like "DONE") is submitted at the prompt.  */

import type { Elements, PromptBox, RenderElement, Timer } from "claude-code"
import { type Engine, type Char, type BandRender, type BandScroll, type View, PICKED,
    uniform, width, wrap, layout, wheel, panel } from "./ase-mods-common.ts"

/*  the tool signaling the band, as listed for the model  */
export const TOOL = {
    name:        "ase_task_band",
    description: "Open the band above the prompt, which shows the task `id` and follows its changes, " +
        "for \"ase-task-edit --interactive\". Returns `OK: ...` or `ERROR: ...` as text.",
    inputSchema: {
        type: "object",
        properties: {
            id:       { type: "string", description: "task identifier" },
            sections: { type: "string", description: "comma-separated names of the plan sections under focus, " +
                "or empty to show the entire task" }
        },
        required: [ "id" ]
    }
}

/*  the next steps of the skill closing the band once submitted, the entity tag
    at the end of a loaded task (present for an existing task only), the share of
    the terminal height taken by the band outside fullscreen, the interval of
    following the task changes, the least digits of the line numbers, the columns of
    comparing the shown task, and the colors of the rendering (the "dim", "accent", and
    "signal" roles of the task board TUI, the first also for the line numbers, and the
    lines and words of the diff, with the codes the diffs of the session end up with, so
    they look alike under any recoloring, where the accent and the removed lines use
    the terminal palette, as the engine maps a color name to a fixed color and
    refuses "ansi:*"), and the changed share of the words up to which they are shown  */
const CLOSE  = /^(?:DONE|GRILL|DRAFT|IMPLEMENT|CANCEL)$/i
const TAG    = /\n<task-plan-tag>[^<]*<\/task-plan-tag>\s*$/
const HEIGHT = 0.75
const POLL   = 2000
const DIGITS = 2
const WIDE   = 1000
const DIM    = "ansi256(244)"
const ACCENT = "ansi256(4)"
const SIGNAL = PICKED
const REMOVE = "ansi256(1)"
const ADDBG  = "ansi256(194)"
const DELBG  = "ansi256(224)"
const ADDWD  = "ansi256(157)"
const DELWD  = "ansi256(217)"
const DELFG  = "ansi256(16)"
const ALIKE  = 0.4

/*  a task band: the scroll state of its frame, the task, the plan sections under
    focus (empty for the entire task), the loaded task and its predecessor (if it
    already changed), and the lines of the task with the digits of their line
    numbers and the band columns they were wrapped for  */
type Band = View & {
    id:       string,
    sections: string[],
    loaded:   string,
    before:   string | undefined,
    lines:    Char[][],
    digits:   number,
    columns:  number
}

/*  make a text safe for the terminal: expand tabs and strip control characters
    (a copy of "sanitize" of "tool/src/ase-task-board-tui-popup.ts", so keep it in sync)  */
const sanitize = (text: string): string =>
    text.replace(/\t/g, "    ").replace(/[\p{Cc}\u{061C}\u{200E}\u{200F}\u{202A}-\u{202E}\u{2066}-\u{2069}]/gu, "")

/*  a shown row of a task: its styled characters and the line of the task text it
    shows, as seen in the editor (absent for the continuation of a wrapped line)  */
type Row = { chars: Char[], number: number | undefined }

/*  split a task into the keys of its frontmatter (without "Type"), each with its
    line, and its body with its first line (without the backmatter, which starts
    at the first "---" line outside a fenced code block)  */
const parts = (source: string): { keys: [ string, string, number ][], body: string, first: number } => {
    const head  = /^---\n([^]*?)\n---\n/.exec(source)
    const lines = source.slice(head?.[0].length ?? 0).split("\n")
    let fence   = false
    const end   = lines.findIndex((line) => {
        if (line.startsWith("```"))
            fence = !fence
        return !fence && line === "---"
    })
    return {
        keys: (head?.[1] ?? "").split("\n").flatMap((line, k): [ string, string, number ][] => {
            const m = /^([^:\s]+):\s*(.*)$/.exec(line)
            return m !== null && m[1] !== "Type" ? [ [ m[1]!, m[2]!, k + 2 ] ] : []
        }),
        body:  (end === -1 ? lines : lines.slice(0, end)).join("\n"),
        first: head?.[0].split("\n").length ?? 1
    }
}

/*  convert inline Markdown (code spans, bold, and italic) into styled characters  */
const inline = (text: string, bold: boolean, color: string | undefined): Char[] => {
    const chars: Char[] = []
    let last = 0
    for (const m of text.matchAll(/`([^`]+)`|\*\*(.+?)\*\*|__(.+?)__|\*([^*\s](?:[^*]*?[^*\s])?)\*/g)) {
        chars.push(...uniform(text.slice(last, m.index), bold, color))
        const body = uniform(m[1] ?? m[2] ?? m[3] ?? m[4]!, bold || m[2] !== undefined || m[3] !== undefined,
            m[1] !== undefined ? ACCENT : color)
        chars.push(...(m[4] !== undefined ? body.map((char) => ({ ...char, italic: true })) : body))
        last = m.index + m[0].length
    }
    chars.push(...uniform(text.slice(last), bold, color))
    return chars
}

/*  convert a list marker into styled characters, where a checkbox of an item which
    is done, in progress, or open is accented, and any other checkbox is signaled  */
const marker = (prefix: string): Char[] => {
    const chars = uniform(prefix, false, undefined)
    const m     = /^(\s*(?:[-*]|\d+[.)])\s+)\[(.)\]/.exec(prefix)
    if (m !== null)
        for (let k = m[1]!.length; k < m[1]!.length + 3; k++)
            chars[k] = { ...chars[k]!, color: /[x/ ]/.test(m[2]!) ? ACCENT : SIGNAL }
    return chars
}

/*  convert a Markdown body, starting at the given line of the task text, into rows,
    hard-wrapped to the given columns (except for the lines of fenced code blocks)  */
const markdown = (body: string, columns: number, first: number): Row[] => {
    const rows: Row[]  = []
    const lines        = body.split("\n")
    const wrapped      = (chars: Char[][], number: number): Row[] =>
        chars.map((chars, k) => ({ chars, number: k === 0 ? number : undefined }))
    let fence = false
    if (lines.at(-1) === "")
        lines.pop()
    for (const [ k, line ] of lines.entries()) {
        const number  = first + k
        const heading = /^(#{1,6})[ \t]+/.exec(line)
        const prefix  = /^\s*(?:(?:[-*]|\d+[.)])\s+(?:\[.\]\s+)?)?/.exec(line)![0]
        if (line.trimStart().startsWith("```"))
            fence = !fence
        else if (fence)
            rows.push({ chars: uniform(line, false, ACCENT), number })
        else if (line.trim() === "")
            rows.push({ chars: [], number })
        else if (heading !== null)
            rows.push(...wrapped(wrap(inline(line.slice(heading[0].length), true,
                heading[1]!.length <= 4 ? ACCENT : undefined), columns, 0), number))
        else {
            const text = wrap(inline(line.slice(prefix.length), false, undefined), columns, prefix.length, prefix.length)
            text[0]!.splice(0, prefix.length, ...marker(prefix))
            rows.push(...wrapped(text, number))
        }
    }
    return rows
}

/*  convert a task into rows, hard-wrapped to the given columns: under a focus only
    the focused sections (in plan order), else the keys of the frontmatter (each cut
    to the columns), a rule for its end, and the body, all without trailing blank rows  */
const page = (task: string, sections: string[], columns: number): Row[] => {
    const { keys, body, first } = parts(task.replace(TAG, "").split("\n").map(sanitize).join("\n"))
    const rows: Row[] = []
    if (sections.length > 0) {
        let line = first
        for (const part of body.split(/^(?=##\s)/m)) {
            if (sections.includes(/^##\s+(\S+)/.exec(part)?.[1] ?? ""))
                rows.push(...markdown(part, columns, line))
            line += part.split("\n").length - 1
        }
    }
    else {
        for (const [ key, val, number ] of keys) {
            const text = `${`${key}:`.padEnd(11)}${val}`
            rows.push({ chars: uniform(text.length > columns ? `${text.slice(0, Math.max(0, columns - 1))}…` : text, false, DIM), number })
        }
        if (keys.length > 0)
            rows.push({ chars: uniform("─".repeat(columns), false, DIM), number: first - 1 })
        rows.push(...markdown(body, columns, first))
    }
    while (rows.at(-1)?.chars.length === 0)
        rows.pop()
    return rows
}

/*  prefix a line with its line number (if any): grey for an unchanged line, resp.
    colored for a changed line, whose number and text get a background over all
    columns (except for its already emphasized words)  */
const numbered = (line: Char[], number: number | undefined, digits: number, columns: number, sign?: "-" | "+"): Char[] => {
    const cell = (number !== undefined ? String(number) : "").padStart(digits)
    if (sign === undefined)
        return [ ...uniform(cell, false, DIM), ...line ]
    const background = sign === "-" ? DELBG : ADDBG
    return [
        ...uniform(cell, false, sign === "-" ? REMOVE : ACCENT),
        ...line,
        ...uniform(" ".repeat(Math.max(0, columns - width(line))), false, undefined)
    ].map((char) => ({ ...char, background: char.background ?? background }))
}

/*  align two lists of strings along the longest common subsequence between their
    common ends, into steps of a kept, removed, or added string (with the removed
    before the added strings of a change)  */
type Step = { sign: " " | "-" | "+", i: number, j: number }
const align = (a: string[], b: string[]): Step[] => {
    let head = 0
    while (head < a.length && head < b.length && a[head] === b[head])
        head++
    let tail = 0
    while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail])
        tail++
    const n    = a.length - head - tail
    const m    = b.length - head - tail
    const span = m + 1
    const lcs  = new Uint32Array((n + 1) * span)
    for (let i = n - 1; i >= 0; i--)
        for (let j = m - 1; j >= 0; j--)
            lcs[i * span + j] = a[head + i] === b[head + j] ? lcs[(i + 1) * span + j + 1]! + 1 :
                Math.max(lcs[(i + 1) * span + j]!, lcs[i * span + j + 1]!)
    const steps: Step[] = Array.from({ length: head }, (_, k) => ({ sign: " ", i: k, j: k }))
    let i = 0
    let j = 0
    while (i < n || j < m) {
        if (i < n && j < m && a[head + i] === b[head + j])
            steps.push({ sign: " ", i: head + i++, j: head + j++ })
        else if (i < n && (j === m || lcs[(i + 1) * span + j]! >= lcs[i * span + j + 1]!))
            steps.push({ sign: "-", i: head + i++, j: head + j })
        else
            steps.push({ sign: "+", i: head + i, j: head + j++ })
    }
    for (let k = tail; k > 0; k--)
        steps.push({ sign: " ", i: a.length - k, j: b.length - k })
    return steps
}

/*  split lines into their words and other non-blank characters, each with its position  */
type Token = { text: string, row: number, from: number, to: number }
const tokens = (lines: Char[][]): Token[] => lines.flatMap((line, row) => {
    const list: Token[] = []
    for (let from = 0, to = 0; from < line.length; from = to) {
        to = from + 1
        if (/[\p{L}\p{N}_]/u.test(line[from]!.ch))
            while (to < line.length && /[\p{L}\p{N}_]/u.test(line[to]!.ch))
                to++
        if (line[from]!.ch !== " ")
            list.push({ text: line.slice(from, to).map((char) => char.ch).join(""), row, from, to })
    }
    return list
})

/*  emphasize the changed words of the removed and added lines of a change (and the
    blanks between adjacent ones), unless too many of the words changed, where the
    words alone decide, so a change of the wrapping only emphasizes nothing  */
const emphasize = (removed: Char[][], added: Char[][]): [ Char[][], Char[][] ] => {
    const a     = tokens(removed)
    const b     = tokens(added)
    const steps = align(a.map((token) => token.text), b.map((token) => token.text))
    if (steps.filter(({ sign }) => sign !== " ").length > (a.length + b.length) * ALIKE)
        return [ removed, added ]
    const del = removed.map((line) => [ ...line ])
    const add = added.map((line) => [ ...line ])
    let last: Token | undefined
    let kind = " "
    for (const { sign, i, j } of steps) {
        const token = sign === "-" ? a[i]! : sign === "+" ? b[j]! : undefined
        if (token !== undefined) {
            const line = (sign === "-" ? del : add)[token.row]!
            for (let k = kind === sign && last?.row === token.row ? last.to : token.from; k < token.to; k++)
                line[k] = sign === "-" ? { ...line[k]!, color: DELFG, background: DELWD } : { ...line[k]!, background: ADDWD }
        }
        last = token
        kind = sign
    }
    return [ del, add ]
}

/*  merge the old and the new rows of a task into the lines of their unified diff,
    each with its line number (the old one for a removed row, else the new one),
    where only the shown characters of the rows decide about a change  */
const diff = (before: Row[], after: Row[], digits: number, columns: number): Char[][] => {
    const lines: Char[][] = []
    let removed: Row[]    = []
    let added: Row[]      = []
    const flush = () => {
        const [ del, add ] = emphasize(removed.map((row) => row.chars), added.map((row) => row.chars))
        lines.push(
            ...del.map((line, k) => numbered(line, removed[k]!.number, digits, columns, "-")),
            ...add.map((line, k) => numbered(line, added[k]!.number, digits, columns, "+")))
        removed = []
        added   = []
    }
    for (const { sign, i, j } of align(before.map((row) => JSON.stringify(row.chars)), after.map((row) => JSON.stringify(row.chars)))) {
        if (sign === "-")
            removed.push(before[i]!)
        else if (sign === "+")
            added.push(after[j]!)
        else {
            flush()
            lines.push(numbered(after[j]!.chars, after[j]!.number, digits, columns))
        }
    }
    flush()
    return lines
}

/*  the task band: its state and its operations  */
export const modTaskEdit = () => {
    /*  the currently shown band and the timer following the changes of its task  */
    let shown: Band | undefined
    let timer: Timer | undefined

    /*  determine whether the task band is shown  */
    const active = () => shown !== undefined

    /*  close the task band  */
    const reset = () => {
        timer?.cancel()
        timer = undefined
        shown = undefined
    }

    /*  show the task band of a task and follow the changes of the task, where an
        update keeps the scroll position, and determine the answer of the tool  */
    const open = async (id: string, sections: string,
        engine: Pick<Engine, "load" | "every" | "invalidate">): Promise<string> => {
        const loaded = await engine.load(id)
        if (!TAG.test(loaded))
            return `ERROR: task "${id}" cannot be loaded`
        reset()
        const band: Band = { id, sections: sections.split(",").map((name) => name.trim()).filter((name) => name !== ""),
            loaded, before: undefined, lines: [], digits: DIGITS, columns: 0, top: 0, scroll: 0, page: 1, split: 0 }
        shown = band
        let busy = false
        timer = engine.every(POLL, () => {
            if (busy)
                return
            busy = true
            engine.load(id).then((text) => {
                if (shown === band && text !== band.loaded && TAG.test(text)) {
                    /*  a change without any shown effect (like a usage booking in
                        an attachment) keeps the last change and its diff  */
                    if (JSON.stringify(page(text, band.sections, WIDE)) !==
                        JSON.stringify(page(band.loaded, band.sections, WIDE))) {
                        band.before  = band.loaded
                        band.columns = 0
                        engine.invalidate()
                    }
                    band.loaded = text
                }
            }).catch(() => {
                /*  ignore a task store which is temporarily not accessible  */
            }).finally(() => {
                busy = false
            })
        })
        engine.invalidate()
        return `OK: showing task "${id}" in the band above the prompt`
    }

    /*  close the task band once a next step of the skill is submitted at the prompt  */
    const submit = (text: string): void => {
        if (CLOSE.test(text.trim()))
            reset()
    }

    /*  drop the diff of the last change from the task band, so just the latest state
        remains, once "##" is typed (not pasted with other text) at the end of the
        prompt, and remove it from there again  */
    const edit = (box: PromptBox, input: string): PromptBox => {
        if (shown === undefined || !/^#{1,2}$/.test(input) || box.cursor !== box.text.length || !box.text.endsWith("##"))
            return box
        shown.before  = undefined
        shown.columns = 0
        const text = box.text.slice(0, -2)
        return { ...box, text, cursor: text.length }
    }

    /*  scroll the task in the band by the wheel
        (and tell whether the band took the scrolling)  */
    const scroll = (e: BandScroll): boolean => {
        if (shown === undefined)
            return false
        wheel(e, shown)
        return true
    }

    /*  draw the task into the band above the prompt (terminal only), yielding to a survey,
        with a blank row (taken from the rows of the view) separating it from the transcript  */
    const render = (e: BandRender, ui: Elements["terminal"]): RenderElement | undefined => {
        if (shown === undefined || e.props.hasSurvey)
            return undefined
        const geometry = layout(e, 0, HEIGHT)
        geometry.body  = Math.max(1, geometry.body - 1)
        if (shown.columns !== geometry.span) {
            const { before, loaded, sections } = shown
            const largest = (task: string) => Math.max(0, ...page(task, sections, WIDE).map((row) => row.number ?? 0))
            const digits  = Math.max(DIGITS, String(Math.max(largest(loaded), largest(before ?? loaded))).length)
            const columns = geometry.span - 4 - digits
            const rows    = page(loaded, sections, columns)
            shown.lines   = diff(before !== undefined ? page(before, sections, columns) : rows, rows, digits, columns)
            shown.digits  = digits
            shown.columns = geometry.span
        }
        return ui.Box({ flexDirection: "column", width: "100%", children: [
            ui.Text({ children: " " }),
            panel(ui, geometry, shown, {
                title: `[ ⧉ ASE: Edit Task: ${shown.id}${shown.sections.length > 0 ? ` (${shown.sections.join(", ")})` : ""} ]`,
                hints: (geometry.overflow ? "wheel or CTRL+x + TAB + ↑/↓/PgUp/PgDn: scroll · " : "") +
                    "##: clear diff · DONE · GRILL · DRAFT · IMPLEMENT · CANCEL · (type for refining)",
                lines: shown.lines,
                gutter: shown.digits
            })
        ] })
    }

    return { active, reset, open, submit, edit, scroll, render }
}
