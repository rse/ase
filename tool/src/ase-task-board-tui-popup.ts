/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import { Box, Text }                          from "ink"

import type { Task }                          from "./ase-task.js"
import { cardLabel, groupLabel, attachmentTabs, isDiff, diffTones, dataLang, dataSpans, clampLines } from "./ase-task-board-core.js"
import type { Card }                          from "./ase-task-board-core.js"
import { diffHunks, changedWords }            from "./ase-task-board-diff.js"
import type { DiffSpan }                      from "./ase-task-board-diff.js"
import type { AgentPresence, AgentLine }      from "./ase-agent-relay-core.js"
import { h }                                  from "./ase-task-board-tui-view.js"
import { palette, cx, spinnerFrames, eighths } from "./ase-task-board-tui-style.js"
import type { TransferEntry, BusyLabel, PromptState, PromptFocus, AssignState, AssignChoice } from "./ase-task-board-tui-model.js"

/*  a text line with a per-character mask of its inline style
    (bit 0: bold, bit 1: italic, bit 2: code, bit 3: accent, bit 4: signal, bit 5: dim, bit 6: changed)  */
type Line = { text: string, mask: number[] }
const BOLD    = 1
const ITALIC  = 2
const CODE    = 4
const ACCENT  = 8
const SIGNAL  = 16
const DIM     = 32
const CHANGED = 64

/*  strip the Markdown inline markers of a line ("`" for code, "**" and
    "__" for bold, "*" for italic), recording the style of the marked text  */
const emphasis = (line: string): Line => {
    const out  = { text: "", mask: [] as number[] }
    const add  = (text: string, style: number) => {
        const n = out.mask.length
        out.text += text
        out.mask.length = n + text.length
        out.mask.fill(style, n)
    }
    let last = 0
    for (const m of line.matchAll(/`([^`]+)`|\*\*(.+?)\*\*|__(.+?)__|\*([^*\s](?:[^*]*?[^*\s])?)\*/g)) {
        add(line.slice(last, m.index), 0)
        add(m[1] ?? m[2] ?? m[3] ?? m[4], m[1] !== undefined ? CODE : m[4] !== undefined ? ITALIC : BOLD)
        last = m.index + m[0].length
    }
    add(line.slice(last), 0)
    return out
}

/*  wrap a text line to a width, keeping its leading indentation  */
const wrap = (line: Line, width: number): Line[] => {
    if (line.text.length <= width)
        return [ line ]
    const indent = /^\s*(?:(?:[-*]|\d+[.)])\s+(?:\[.\]\s+)?)?/.exec(line.text)![0].length
    const pad    = " ".repeat(Math.min(indent, Math.floor(width / 2)))
    const out    = [] as Line[]
    let   rest   = line
    while (rest.text.length > width) {
        let cut = rest.text.lastIndexOf(" ", width)
        if (cut <= pad.length)
            cut = width
        out.push({ text: rest.text.slice(0, cut), mask: rest.mask.slice(0, cut) })
        const tail = rest.text.slice(cut)
        const skip = tail.length - tail.trimStart().length
        rest = {
            text: pad + tail.slice(skip),
            mask: [ ...new Array<number>(pad.length).fill(0), ...rest.mask.slice(cut + skip) ]
        }
    }
    out.push(rest)
    return out
}

/*  make a text safe for the terminal: expand tabs and strip control characters  */
export const sanitize = (text: string): string =>
    text.replace(/\t/g, "    ").replace(/[\p{Cc}\u{061C}\u{200E}\u{200F}\u{202A}-\u{202E}\u{2066}-\u{2069}]/gu, "")

/*  mark the checkbox of a plan line in the read dialog: checkboxes of items
    which are done, in progress, or open are accented, while checkboxes of
    items which are questioned, delegated, or dropped are signaled  */
const checkbox = (line: Line): Line => {
    const m = /^(\s*(?:[-*]|\d+[.)])\s+)\[([x /?>-])\]/.exec(line.text)
    if (m !== null) {
        const style = /[x/ ]/.test(m[2]) ? ACCENT : SIGNAL
        for (let k = m[1].length; k < m[1].length + 3; k++)
            line.mask[k] |= style
    }
    return line
}

/*  the attachments of a task plan and the parts of a task plan, as fetched
    exclusively through the task interface (null if no longer existing, an
    error if loading failed, undefined while still loading)  */
type Attachment = Awaited<ReturnType<typeof Task.attachments>>[number]
export type PlanParts  = { keys: Map<string, string>, body: string, atts: Attachment[] } | null | Error | undefined

/*  a line of the read dialog  */
type DialogLine = { text: string, color?: string, bold?: boolean, mask?: number[], sign?: string, tint?: string }

/*  the key/value header lines of the read dialog (each cut to the width with
    an ellipsis), separated from the content by a line, so that the content
    starts directly after it, resp. (for Markdown content) after a blank line  */
const headerLines = (keys: [ string, string ][], width: number, blank: boolean): DialogLine[] => {
    const out = keys.map(([ key, val ]): DialogLine => {
        const text = `${(key + ":").padEnd(11)}${sanitize(val)}`
        return { text: text.length > width ? text.slice(0, Math.max(0, width - 1)) + "…" : text, color: palette.dim }
    })
    if (out.length > 0) {
        out.push({ text: "─".repeat(width), color: palette.dim })
        if (blank)
            out.push({ text: "" })
    }
    return out
}

/*  the lines of a Markdown text (without its leading blank lines) for the read dialog  */
const markdownLines = (text: string, width: number): DialogLine[] => {
    const out = [] as DialogLine[]
    for (const line of text.replace(/^(?:[ \t]*\r?\n)+/, "").split(/\r?\n/).map(sanitize)) {
        const heading = /^(#{1,6})[ \t]+/.exec(line)
        const bold    = heading !== null
        const color   = heading !== null && heading[1].length <= 4 ? palette.accent : palette.normal
        for (const part of wrap(checkbox(emphasis(heading !== null ? line.slice(heading[0].length) : line)), width))
            out.push({ text: part.text, color, bold, mask: part.mask })
    }
    return out
}

/*  the lines of a task plan for the read dialog  */
export const planLines = (parts: PlanParts, id: string, width: number): DialogLine[] => {
    if (parts === undefined)
        return [ { text: "loading...", color: palette.dim } ]
    if (parts === null)
        return [ { text: `task "${id}" no longer exists`, color: palette.signal } ]
    if (parts instanceof Error)
        return [ { text: `loading task "${id}" failed: ${parts.message}`, color: palette.signal } ]
    return [
        ...headerLines([ ...parts.keys ].filter(([ key ]) => key !== "Type"), width, true),
        ...markdownLines(parts.body, width)
    ]
}

/*  determine whether a task plan differs from its predecessor in what the read
    dialog shows (and not, for instance, only in its attachments)  */
export const planChanged = (before: PlanParts, after: PlanParts): boolean => {
    const shown = (parts: PlanParts) => parts === undefined || parts === null || parts instanceof Error ? null :
        JSON.stringify([ [ ...parts.keys ].filter(([ key ]) => key !== "Type"), parts.body ])
    return shown(before) !== null && shown(after) !== null && shown(before) !== shown(after)
}

/*  the lines of the diff of two task plans for the read dialog: the rendered lines of
    both, where removed lines are red and added lines blue, with their sign in the
    otherwise empty first column and their changed words marked, and where only the
    shown content of the lines decides about a change  */
export const planDiffLines = (before: PlanParts, after: PlanParts, id: string, width: number): DialogLine[] => {
    const changed = (line: DialogLine, sign: string, tint: string, spans: DiffSpan[]): DialogLine => {
        const mask = [ ...(line.mask ?? new Array<number>(line.text.length).fill(0)) ]
        for (const { from, to } of spans)
            for (let k = from; k < to; k++)
                mask[k] |= CHANGED
        return { ...line, mask, sign, tint }
    }
    return diffHunks(planLines(before, id, width), planLines(after, id, width), (line) => JSON.stringify(line))
        .flatMap(({ kept, removed, added }) => {
            const [ del, add ] = changedWords(removed.map((line) => line.text), added.map((line) => line.text))
            return [
                ...kept,
                ...removed.map((line, k) => changed(line, "-", "red",  del[k])),
                ...added.map((line, k)   => changed(line, "+", "blue", add[k]))
            ]
        })
}

/*  the lines of a task plan attachment for the read dialog: its embedded
    data or its (lazily loaded) file content, rendered as Markdown for a
    Markdown type, syntax-highlighted for a YAML or JSON type, colored per
    line for a diff, as a placeholder if binary, and else verbatim  */
export const attachmentLines = (att: Attachment, content: Buffer | Error | undefined, width: number): DialogLine[] => {
    const markdown = /^text\/markdown\b/i.test(att.type.trim())
    const out      = headerLines(([
        [ "Type", att.type ], [ "Desc", att.desc ], [ "Created", att.created ?? "" ], [ "Modified", att.modified ?? "" ]
    ] as [ string, string ][]).filter(([ , val ]) => val !== ""), width, markdown)
    let text = att.data
    if (text === undefined) {
        if (content === undefined)
            return [ ...out, { text: "loading...", color: palette.dim } ]
        if (content instanceof Error)
            return [ ...out, { text: `loading attachment failed: ${content.message}`, color: palette.signal } ]
        try {
            text = new TextDecoder("utf-8", { fatal: true }).decode(content)
        }
        catch (_err: unknown) {
            text = "\0"
        }
        if (text.includes("\0"))
            return [ ...out, { text: `(binary content: ${sanitize(att.type)}, ${content.length} bytes)`, color: palette.dim } ]
    }
    if (markdown)
        return [ ...out, ...markdownLines(text, width) ]

    /*  YAML or JSON data is syntax-highlighted: keys accented, numbers and
        literals signaled, indicators and comments dimmed (comments also
        italic), and strings in the default color  */
    const lang = dataLang(att.type)
    if (lang !== null) {
        const style: Record<string, number> = { key: ACCENT, num: SIGNAL, lit: SIGNAL, punct: DIM, cmt: DIM | ITALIC }
        for (const spans of dataSpans(text.replace(/^(?:[ \t]*\r?\n)+/, ""), lang)) {
            const line = { text: "", mask: [] as number[] }
            for (const span of spans) {
                const part = sanitize(span.text)
                line.text += part
                line.mask.push(...new Array<number>(part.length).fill(style[span.tone] ?? 0))
            }
            for (const part of wrap(line, width))
                out.push({ text: part.text, color: palette.normal, mask: part.mask })
        }
        return out
    }

    /*  a diff is colored per line: its file headers up to and
        including the hunk headers dimmed, inserted lines accented, removed
        lines signaled, and context lines in the default color  */
    const lines = text.replace(/^(?:[ \t]*\r?\n)+/, "").split(/\r?\n/).map(sanitize)
    const tones = isDiff(att.type) ? diffTones(lines) : null
    const tint  = { head: palette.dim, add: palette.accent, del: palette.signal, ctx: palette.normal }
    lines.forEach((line, i) => {
        const color = tones !== null ? tint[tones[i]] : palette.accent
        for (const part of wrap({ text: line, mask: new Array<number>(line.length).fill(0) }, width))
            out.push({ text: part.text, color, mask: part.mask })
    })
    return out
}

/*  the full local timestamp of a processing log line as "YYYY-MM-DD HH:MM:SS.mmm"  */
const logTime = (ms: number): string => {
    const d   = new Date(ms)
    const pad = (n: number, k = 2) => String(n).padStart(k, "0")
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
        `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
}

/*  the rows of the recent processing log of an agent in the detail view of the agents view,
    broken onto a width: per line its full timestamp as a "...: " prefix (in normal color), the id of
    its task (if any, to be rendered inversely, as " <id> ", followed by a space), its level as a
    "[...]: " prefix, and its message (level and message in accent color,
    resp. in signal color for warnings and errors), with its continuation rows indented behind the
    timestamp prefix only (starting below the task id, to save rows), where the task id and the level
    are broken together with the message as a placeholder word of their width (resp. on a row of their
    own, cut by the rendering, where they do not fit onto a row, as otherwise the placeholder word
    would be hard-broken and its remainder shown in place of the message), and where each row
    carries the index of its processing log line (for anchoring the scroll position to the content)  */
export type LogLine = { prefix: string, level: string, task: string, text: string, tone: "accent" | "signal", entry: number }
export const agentLogLines = (agent: AgentPresence, width: number): LogLine[] =>
    agent.recent.flatMap((line, entry) => {
        const prefix = `${logTime(line.time)}: `
        const level  = `[${line.level.toUpperCase()}]: `
        const tone   = line.level !== "info" ? "signal" : "accent"
        const task   = sanitize(line.task)
        const hold   = "\uE000".repeat((task !== "" ? task.length + 5 : 0) + level.length - 1)
        const textW  = Math.max(10, width - prefix.length)
        const msg    = sanitize(line.msg)
        const rows   = hold.length < textW ? clampLines(hold + " " + msg, textW, Infinity) :
            [ hold, ...clampLines(msg, textW, Infinity) ]
        return rows.map((row, k): LogLine => ({
            prefix: k === 0 ? prefix : " ".repeat(prefix.length),
            level:  k === 0 ? level  : "",
            task:   k === 0 ? task : "",
            text:   k === 0 ? row.slice(hold.length + 1) : row,
            tone,
            entry
        }))
    })

/*  the identity of a processing log line of an agent (for anchoring the scroll position
    of its log to it, as the oldest lines are dropped once the recent lines are complete)  */
export const agentLogKey = (line: AgentLine): string =>
    `${line.time}\u0000${line.level}\u0000${line.task}\u0000${line.msg}`

/*  the tab labels of the read dialog: the task content, followed by its attachments  */
export const dialogTabs = (parts: PlanParts): string[] =>
    parts !== undefined && parts !== null && !(parts instanceof Error) ?
        attachmentTabs(parts.atts, parts.keys.get("Modified") ?? "") : attachmentTabs([])

/*  the first visible tab of the tab bar, starting at a previous first
    tab, but moved so that the selected tab fits into the width  */
export const tabFirst = (tabs: string[], first: number, tab: number, width: number): number => {
    let f = Math.min(first, tab)
    const span = (from: number) => tabs.slice(from, tab + 1).reduce((n, label) => n + label.length + 3, -1)
    while (f < tab && span(f) > width)
        f++
    return f
}

/*  the layout of the tab bar within its inner width: the visible tabs
    after the first column and separated by a space (with their column
    offsets), a left scroll arrow in the first column while scrolled, a right
    scroll arrow in the last column where further tabs exist, and a too
    wide single tab cut  */
export const tabLayout = (tabs: string[], first: number, tab: number, innerW: number) => {
    const f     = tabFirst(tabs, first, tab, innerW - 2)
    const lead  = 1
    const width = innerW - 2
    const items = [] as { index: number, x: number, text: string }[]
    let   used  = 0
    let   last  = f
    for (; last < tabs.length; last++) {
        const gap  = last > f ? 1 : 0
        let   text = ` ${tabs[last]} `
        if (used + gap + text.length > width) {
            if (last > f)
                break
            text = text.slice(0, Math.max(0, width - 1)) + "…"
        }
        items.push({ index: last, x: lead + used + gap, text })
        used += gap + text.length
    }
    return { lead, width, used, items, less: f > 0, more: last < tabs.length }
}

/*  the number of non-content rows of the read dialog (borders, two
    header lines, the tab bar, four separators, and the footer)  */
export const DIALOG_CHROME = 10

/*  the column offset of the " X " close button of the read dialog from its right edge  */
export const DIALOG_CLOSE  = 5

/*  the maximum width of the read dialog  */
export const DIALOG_WIDTH  = 110

/*  the parameters of the read dialog  */
type DialogArgs = {
    card: Card | undefined, group: string | undefined, id: string, pred: string[], succ: string[],
    tint: (id: string) => string | undefined, tabs: string[], tab: number, first: number, scroll: number,
    lines: DialogLine[], width: number, columns: number, rows: number, notice: string | null, viewer: boolean, diffed: boolean
}

/*  the segments of the dependencies row of the read dialog within its inner width:
    predecessors on the left, successors on the right (padded in between to the
    full width, or cut at the end if too long), with each id rendered inverse
    behind "≡", with one extra space on each side, and carrying the referenced task id  */
export const refSegs = (pred: string[], succ: string[], tint: (id: string) => string | undefined, innerW: number) => {
    type Seg = { text: string, color: string | undefined, inverse: boolean, ref?: string }
    const refs = (ids: string[]): Seg[] => ids.length === 0 ?
        [ { text: "—", color: palette.dim, inverse: false } ] :
        ids.flatMap((ref, i) => [
            ...(i > 0 ? [ { text: " ", color: palette.dim, inverse: false } ] : []),
            { text: ` ≡ ${ref} `, color: tint(ref), inverse: true, ref }
        ])
    const fill: Seg = { text: "", color: palette.dim, inverse: false }
    const segs: Seg[] = [
        { text: " predecessors: ", color: palette.dim, inverse: false },
        ...refs(pred),
        fill,
        { text: "successors: ", color: palette.dim, inverse: false },
        ...refs(succ),
        { text: " ", color: palette.dim, inverse: false }
    ]
    const used = segs.reduce((n, seg) => n + seg.text.length, 0)
    fill.text  = " ".repeat(Math.max(1, innerW - used))
    let   room = innerW
    for (const seg of segs) {
        if (seg.text.length > room)
            seg.text = room > 0 ? seg.text.slice(0, room - 1) + "…" : ""
        room -= seg.text.length
    }
    if (room > 0)
        segs[segs.length - 1].text += " ".repeat(room)
    return segs
}

/*  the geometry of the confirmation of a task deletion: a small box, centered on
    the screen, and its inverse " delete " and " cancel " buttons, centered in its
    third inner row (as screen positions, for the mouse hit-testing)  */
export const CONFIRM_BUTTON = 8
export const confirmBox = (columns: number, rows: number) => {
    const width = Math.min(columns - 2, 60)
    const left  = Math.floor((columns - width) / 2)
    const top   = Math.floor((rows - 7) / 2)
    const pad   = Math.max(0, Math.floor((width - 2 - (2 * CONFIRM_BUTTON + 1)) / 2))
    return { width, left, top, pad, row: top + 3, deleteX: left + 1 + pad, cancelX: left + 2 + pad + CONFIRM_BUTTON }
}

/*  render the confirmation of a task deletion, with every inner cell
    written (with spaces) to hide the content underneath  */
export const renderConfirm = (id: string, yes: boolean, columns: number, rows: number) => {
    const { width, left, top, pad } = confirmBox(columns, rows)
    const innerW = width - 2
    const blank  = (key: string) => h(Text, { key }, " ".repeat(innerW))

    /*  the centered question, with the task id rendered inverse with one extra space on each side  */
    const tid    = ` ${sanitize(id)} `.slice(0, Math.max(0, innerW - 13))
    const qpad   = Math.max(0, Math.floor((innerW - 13 - tid.length) / 2))
    const hint   = "←/→/⇥: select · ⏎: press · y: delete · ESC: cancel".slice(0, innerW)
    const keys   = (" ".repeat(Math.floor((innerW - hint.length) / 2)) + hint).padEnd(innerW)
    return h(Box, { key: "confirm", top, left, width, height: 7, ...cx("popup", "border-signal") },
        h(Text, cx("normal", "bold"),
            " ".repeat(qpad) + "Delete task ",
            h(Text, cx("inverse"), tid),
            "?".padEnd(Math.max(0, innerW - qpad - 12 - tid.length))),
        blank("blank-above"),
        h(Text, {},
            " ".repeat(pad),
            h(Text, cx("button", yes && "button-active"), " delete "),
            " ",
            h(Text, cx("button", !yes && "button-active"), " cancel "),
            " ".repeat(Math.max(0, innerW - pad - 2 * CONFIRM_BUTTON - 1))),
        blank("blank-below"),
        h(Text, cx("dim"), keys))
}

/*  the first of the at most five visible suggested request names of the drop-down of the
    prompt popup, scrolled to show the selected one  */
export const DROP_ROWS = 5
export const dropFirst = (choices: string[], name: string): number => {
    const n = Math.min(DROP_ROWS, choices.length)
    return Math.max(0, Math.min(choices.length - n, choices.indexOf(name) - n + 1))
}

/*  the geometry of the prompt popup of an edit request (or, with <request>, of a request by
    prompt): a box, centered on the screen and covering about 80% of the terminal width (like
    in the web board), its input boxes (behind the equally wide labels "request name:" and
    "request prompt:" of a request by prompt, for left-aligning them, resp. behind a margin
    only, where the request name box spans 30% of the width of the prompt box), and its
    inverse request and cancel buttons, centered in the row below the prompt (as screen
    positions, for the mouse hit-testing)  */
export const promptBox = (columns: number, rows: number, request: boolean) => {
    const width   = Math.min(columns - 2, Math.max(82, Math.floor(columns * 0.8)))
    const innerW  = width - 2
    const viewH   = 5
    const height  = viewH + 9 + (request ? 3 : 0)
    const top     = Math.floor((rows - height) / 2)
    const left    = Math.floor((columns - width) / 2)
    const labelW  = 17
    const pre     = request ? labelW : 1
    const boxW    = Math.max(6, innerW - pre - 1)
    const nameW   = Math.max(12, Math.round(boxW * 0.3))
    const okText  = request ? " request " : " request edit "
    const noText  = " cancel "
    const pad     = Math.max(0, Math.floor((innerW - okText.length - 1 - noText.length) / 2))
    const promptY = top + 3 + (request ? 3 : 0)
    return {
        width, innerW, viewH, height, top, left, labelW, pre, boxW, nameW, okText, noText, pad,
        nameY: top + 4, dropY: top + 5, promptY, buttonY: promptY + viewH + 2,
        boxX: left + 1 + pre, okX: left + 1 + pad, noX: left + 2 + pad + okText.length
    }
}

/*  whether the prompt of the prompt popup is ignored: of a request by prompt
    whose request name is only processed by agents ignoring their prompts  */
export const promptIgnored = (prompt: PromptState): boolean =>
    prompt.request !== null && prompt.request.ignored.includes(prompt.request.name)

/*  the focus of the prompt popup after the request name: the prompt,
    resp. the request button if the prompt is ignored  */
export const promptNext = (prompt: PromptState): PromptFocus =>
    promptIgnored(prompt) ? "request" : "prompt"

/*  render the prompt popup of an edit request (or, with a request, of a request by prompt of
    any name, with its request name in the frame of an input box above the prompt, and with
    its suggested request names <choices> in a drop-down below it while focused) of a task,
    in the style of the confirmation of a task deletion, with the prompt (with an inverse
    cursor cell at the cursor position, resp. behind its end) broken at its newlines and
    wrapped onto the five lines of the frame of an input box (like in the web board, in
    accent color, resp. in signal color while focused), scrolled to show the cursor, with
    the request and cancel buttons below it (in accent color, resp. in signal color while
    focused), and with every inner cell written (with spaces) to hide the content underneath  */
export const renderPrompt = (prompt: PromptState, columns: number, rows: number, choices: string[] = []) => {
    const { id, text, pos, request } = prompt
    const box    = promptBox(columns, rows, request !== null)
    const { width, innerW, viewH, height, top, left, labelW, pre, boxW, nameW } = box
    const blank  = (key: string) => h(Text, { key }, " ".repeat(innerW))

    /*  the centered question, with the task id rendered inverse with one extra space on each side  */
    const lead   = request !== null ? "Request agent for task " : "Edit task "
    const fixed  = lead.length + 11
    const tid    = ` ${sanitize(id)} `.slice(0, Math.max(0, innerW - fixed))
    const qpad   = Math.max(0, Math.floor((innerW - fixed - tid.length) / 2))
    const hint   = (request !== null ?
        "⇥: switch field · ↑/↓: pick name · ⇧⏎/⌥⏎/^J: new line · ⏎: request · ESC: cancel" :
        "⇥: switch field · ⇧⏎/⌥⏎/^J: new line · ⏎: request edit · ESC: cancel").slice(0, innerW)
    const keys   = (" ".repeat(Math.floor((innerW - hint.length) / 2)) + hint).padEnd(innerW)

    /*  the cells of the prompt, sanitized per character (with newlines ending their line and
        other control characters shown as spaces), so that the cursor position stays aligned
        with the characters  */
    const cells  = [] as { ch: string, cur: boolean, nl: boolean }[]
    const chars  = [ ...text ]
    chars.forEach((c, k) => {
        const s = [ ...(/^\p{Cc}$/u.test(c) && c !== "\t" ? " " : sanitize(c)) ]
        if (s.length === 0 && k === pos)
            s.push(" ")
        s.forEach((ch, j) => cells.push({ ch, cur: k === pos && j === 0, nl: c === "\n" }))
    })
    if (pos >= chars.length)
        cells.push({ ch: " ", cur: true, nl: false })

    /*  the prompt lines, broken after the newlines and cut into chunks of the inner width (minus
        the margins and the frame of the input box), scrolled to show the line of the cursor  */
    const lineW  = boxW - 4
    const lines  = [ [] ] as (typeof cells)[]
    for (const cell of cells) {
        if (lines[lines.length - 1].length >= lineW)
            lines.push([])
        lines[lines.length - 1].push(cell)
        if (cell.nl)
            lines.push([])
    }
    const curL   = lines.findIndex((line) => line.some((cell) => cell.cur))
    const first  = Math.max(0, Math.min(lines.length - viewH, curL - viewH + 1))
    const shown  = Array.from({ length: viewH }, (_, k) => lines[first + k] ?? [])

    /*  the request name of a request by prompt in the frame of an input box behind its label
        (in signal color while focused, also its text, with an inverse cursor cell behind its
        end, where the prompt then shows no cursor), with a drop-down marker where request names
        are suggested  */
    const indent = " ".repeat(pre)
    const fieldW = nameW - 5
    const rest   = " ".repeat(Math.max(0, innerW - pre - nameW))
    const named  = request !== null ? (() => {
        const tone = prompt.focus === "name" ? "signal" : "accent"
        const name = sanitize(request.name).slice(0, fieldW - 1)
        return [
            h(Text, { key: "request-top", ...cx(tone) }, `${indent}╭${"─".repeat(nameW - 2)}╮${rest}`),
            h(Text, { key: "request" },
                h(Text, cx("normal"), " request name:".padEnd(labelW)),
                h(Text, cx(tone), "│ "),
                h(Text, cx(tone, "bold"), name),
                h(Text, cx(tone, prompt.focus === "name" && "inverse"), " "),
                h(Text, {}, " ".repeat(fieldW - 1 - name.length)),
                h(Text, cx(tone), `${request.choices.length > 0 ? "▾" : " "} │`),
                rest),
            h(Text, { key: "request-bottom", ...cx(tone) }, `${indent}╰${"─".repeat(nameW - 2)}╯${rest}`)
        ]
    })() : []

    /*  the drop-down of the suggested request names while the request name is focused, attached
        below its input box (overlaying the popup, in signal color), with at most five suggested
        request names (scrolled to show the selected one, rendered inverse, and with markers
        where scrolled)  */
    const dropH  = Math.min(DROP_ROWS, choices.length)
    const drop   = request !== null && prompt.focus === "name" && dropH > 0 ? (() => {
        const sel   = choices.indexOf(request.name)
        const first = dropFirst(choices, request.name)
        const more  = (flag: boolean, mark: string) => flag ? mark : "─"
        const place = { top: box.dropY, left: box.boxX, width: nameW, height: dropH + 2 }
        return h(Box, { key: "prompt-choices", position: "absolute", flexDirection: "column", ...place },
            h(Text, cx("signal"), `├${"─".repeat(nameW - 4)}${more(first > 0, "▴")}─┤`),
            ...choices.slice(first, first + dropH).map((choice, k) =>
                h(Text, { key: k },
                    h(Text, cx("signal"), "│"),
                    h(Text, cx("signal", first + k === sel && "inverse", first + k === sel && "bold"),
                        ` ${sanitize(choice).slice(0, nameW - 4).padEnd(nameW - 4)} `),
                    h(Text, cx("signal"), "│"))),
            h(Text, cx("signal"), `╰${"─".repeat(nameW - 4)}${more(first + dropH < choices.length, "▾")}─╯`))
    })() : null

    /*  the prompt in the frame of an input box (in signal color while focused, also its text,
        resp. dimmed with a notice instead of its text if ignored), behind its label "request
        prompt:" for a request by prompt  */
    const ignored = promptIgnored(prompt)
    const notice  = "(ignored by the agents of this request)".slice(0, lineW)
    const focus   = prompt.focus === "prompt" && !ignored
    const tone    = focus ? "signal" : ignored ? "dim" : "accent"
    const popup   = h(Box, { key: "prompt", top, left, width, height, ...cx("popup", "border-dim") },
        h(Text, cx("normal", "bold"),
            " ".repeat(qpad) + lead,
            h(Text, cx("inverse"), tid),
            " by prompt:".padEnd(Math.max(0, innerW - qpad - lead.length - tid.length))),
        blank("blank-above"),
        ...named,
        h(Text, { key: "input-top", ...cx(tone) }, `${indent}╭${"─".repeat(boxW - 2)}╮ `),
        ...shown.map((line, k) => {
            const at = focus ? line.findIndex((cell) => cell.cur) : -1
            const ch = ignored ? [ ...(k === 0 ? notice : "") ] : line.map((cell) => cell.ch)
            return h(Text, { key: k },
                h(Text, cx("normal"), request !== null && k === 0 ? " request prompt:".padEnd(labelW) : indent),
                h(Text, cx(tone), "│ "),
                h(Text, cx(tone), ...(at < 0 ? [ ch.join("").padEnd(lineW) ] : [
                    ch.slice(0, at).join(""),
                    h(Text, cx("inverse"), ch[at]),
                    ch.slice(at + 1).join("").padEnd(Math.max(0, lineW - 1 - at)) ])),
                h(Text, cx(tone), " │ "))
        }),
        h(Text, { key: "input-bottom", ...cx(tone) }, `${indent}╰${"─".repeat(boxW - 2)}╯ `),
        h(Text, { key: "buttons" },
            " ".repeat(box.pad),
            h(Text, cx("button", prompt.focus === "request" ? "button-active" : "accent"), box.okText),
            " ",
            h(Text, cx("button", prompt.focus === "cancel" ? "button-active" : "accent"), box.noText),
            " ".repeat(Math.max(0, innerW - box.pad - box.okText.length - 1 - box.noText.length))),
        blank("blank-buttons"),
        h(Text, cx("dim"), keys))
    return drop !== null ? [ popup, drop ] : popup
}

/*  render the busy popup of a slow task store operation: a small box, centered on the
    screen, with a spinner, the operation, and its elapsed time, above an indeterminate
    progress bar with a bouncing block, with every inner cell written (with spaces)  */
export const renderBusy = (label: BusyLabel, since: number, tick: number, columns: number, rows: number) => {
    const width  = Math.min(columns - 2, 50)
    const innerW = width - 2
    const blank  = (key: string) => h(Text, { key }, " ".repeat(innerW))

    /*  the centered operation, with the task id rendered inverse with one extra space on each side  */
    const head   = `${spinnerFrames[Math.floor(tick / 2) % spinnerFrames.length]} ${sanitize(label.text)}${label.id !== undefined ? " " : ""}`.slice(0, innerW)
    const tid    = label.id !== undefined ? ` ${sanitize(label.id)} `.slice(0, innerW - head.length) : ""
    const tail   = (label.suffix !== undefined ? ` ${sanitize(label.suffix)}` : "").slice(0, innerW - head.length - tid.length)
    const time   = ` (${((Date.now() - since) / 1000).toFixed(1)}s)`.slice(0, innerW - head.length - tid.length - tail.length)
    const used   = head.length + tid.length + tail.length + time.length
    const tpad   = Math.floor((innerW - used) / 2)

    /*  the progress bar: a block swiping back and forth (eased, one sweep per 1.6s at a
        50ms tick) in accent color inside a rounded box in accent color, positioned in
        eighth cells via the left eighth blocks, which at the leading edge of the block
        are drawn inverse, as there are no right eighth blocks  */
    const barW   = Math.max(1, innerW - 4)
    const from   = Math.round((barW - Math.min(8, barW)) * 8 * (1 - Math.cos(Math.PI * (tick % 64) / 32)) / 2)
    const to     = from + Math.min(8, barW) * 8
    const segs   = [] as { text: string, inverse: boolean }[]
    for (let i = 0; i < barW; i++) {
        const lo  = 8 * i
        const seg = to <= lo || from >= lo + 8 ? { text: " ",                inverse: false } :
            from <= lo && to >= lo + 8         ? { text: "█",                inverse: false } :
                from > lo                      ? { text: eighths[from - lo], inverse: true  } :
                    { text: eighths[to - lo], inverse: false }
        const last = segs[segs.length - 1]
        if (last !== undefined && (seg.text === " " || seg.text === "█") && last.text.endsWith(seg.text) && !last.inverse)
            last.text += seg.text
        else
            segs.push(seg)
    }
    const side = h(Text, {}, " \n \n ")
    return h(Box, { key: "busy", top: Math.floor((rows - 8) / 2), left: Math.floor((columns - width) / 2), width, height: 8, ...cx("popup", "border-dim") },
        /*  the parts as siblings (not nested), as a nested text cannot undo the bold and color of its parent  */
        h(Box, { flexDirection: "row" },
            h(Text, cx("accent", "bold"), " ".repeat(tpad) + head),
            h(Text, cx("accent", "bold", "inverse"), tid),
            h(Text, cx("accent", "bold"), tail),
            h(Text, cx("normal"), time.padEnd(innerW - tpad - used + time.length))),
        blank("blank-above"),
        h(Box, { flexDirection: "row" },
            side,
            h(Box, { width: innerW - 2, height: 3, ...cx("frame", "border-accent") },
                h(Text, cx("accent"),
                    ...segs.map((seg, k) => h(Text, { key: k, ...cx(seg.inverse && "inverse") }, seg.text)))),
            side),
        blank("blank-below"))
}

/*  the geometry of the transfer popup: centered on the screen, with its entries
    (starting in its third inner row) scrolled so that the selected one stays visible  */
export const transferBox = (count: number, idx: number, columns: number, rows: number) => {
    const width  = Math.min(columns - 2, 60)
    const viewH  = Math.max(1, Math.min(count, rows - 8))
    const first  = Math.max(0, Math.min(idx - Math.floor(viewH / 2), count - viewH))
    const height = viewH + 6
    const top    = Math.floor((rows - height) / 2)
    return { width, height, viewH, first, top, left: Math.floor((columns - width) / 2), row: top + 3 }
}

/*  render the transfer popup of a task, in the style of the confirmation of a task
    deletion, with the selected state marked, the current state labeled, and the
    unselectable states dimmed  */
export const renderTransfer = (id: string, from: string, entries: TransferEntry[], at: string, columns: number, rows: number) => {
    const idx    = entries.findIndex((e) => e.status === at)
    const box    = transferBox(entries.length, idx, columns, rows)
    const innerW = box.width - 2
    const blank  = (key: string) => h(Text, { key }, " ".repeat(innerW))

    /*  the centered question, with the task id rendered inverse with one extra space on each side  */
    const tid    = ` ${sanitize(id)} `.slice(0, Math.max(0, innerW - 18))
    const qpad   = Math.max(0, Math.floor((innerW - 18 - tid.length) / 2))
    const hint   = "↑/↓: select · ⏎: transition · ESC: cancel".slice(0, innerW)
    const keys   = (" ".repeat(Math.floor((innerW - hint.length) / 2)) + hint).padEnd(innerW)
    return h(Box, { key: "transfer", top: box.top, left: box.left, width: box.width, height: box.height, ...cx("popup", "border-dim") },
        h(Text, cx("normal", "bold"),
            " ".repeat(qpad) + "Transfer task ",
            h(Text, cx("inverse"), tid),
            " to:".padEnd(Math.max(0, innerW - qpad - 14 - tid.length))),
        blank("blank-above"),
        ...entries.slice(box.first, box.first + box.viewH).map((e, k) => {
            /*  the group in normal and the state in bold, cut to the inner width  */
            const on    = box.first + k === idx
            const head  = ` ${on ? "▶" : " "} ${e.group} ▷ `.slice(0, innerW)
            const state = e.status.slice(0, innerW - head.length)
            const tail  = (e.status === from ? " (current)" : "").slice(0, innerW - head.length - state.length)
            return h(Text, { key: k, ...cx("normal", !e.ok && "dim", !e.ok && "dimmed", on && "signal") },
                head, h(Text, cx("bold"), state), tail.padEnd(innerW - head.length - state.length))
        }),
        blank("blank-below"),
        h(Text, cx("dim"), keys))
}

/*  the geometry of the assign popup: centered on the screen, with the input box of the
    assignee (its text in the second inner row of it) spanning the inner width (minus a
    margin), and its drop-down of at most five suggested assignees attached below it  */
export const assignBox = (columns: number, rows: number) => {
    const width  = Math.min(columns - 2, 60)
    const innerW = width - 2
    const height = DROP_ROWS + 10
    const top    = Math.floor((rows - height) / 2)
    const left   = Math.floor((columns - width) / 2)
    return { width, innerW, height, top, left, nameW: innerW - 2, nameX: left + 2, nameY: top + 4, dropY: top + 5 }
}

/*  render the assign popup of a task, in the style of the request name of the prompt popup:
    the assignee in the frame of an input box (in signal color, with an inverse cursor cell
    behind its end, a drop-down marker, and a marker for an <unknown> assignee), with the
    suggested assignees <choices> (with the icons of their kind) in a drop-down below it
    (scrolled to show the selected one, rendered inverse, and with markers where scrolled),
    and with every inner cell written (with spaces) to hide the content underneath  */
export const renderAssign = (assign: AssignState, choices: AssignChoice[], unknown: boolean, columns: number, rows: number) => {
    const box    = assignBox(columns, rows)
    const { width, innerW, height, top, left, nameW } = box
    const blank  = (key: string) => h(Text, { key }, " ".repeat(innerW))

    /*  the centered question, with the task id rendered inverse with one extra space on each side  */
    const tid    = ` ${sanitize(assign.id)} `.slice(0, Math.max(0, innerW - 16))
    const qpad   = Math.max(0, Math.floor((innerW - 16 - tid.length) / 2))
    const hint   = "↑/↓/Click: pick assignee · ⏎: assign · ESC: cancel".slice(0, innerW)
    const keys   = (" ".repeat(Math.floor((innerW - hint.length) / 2)) + hint).padEnd(innerW)

    /*  the assignee (its end shown if too long) and the marker of an unknown assignee  */
    const mark   = unknown ? "(unknown) " : ""
    const textW  = Math.max(1, nameW - 6 - mark.length)
    const name   = [ ...sanitize(assign.name) ].slice(-textW).join("")

    /*  the suggested assignees, with the selected one rendered inverse  */
    const names  = choices.map((choice) => choice.name)
    const dropH  = Math.min(DROP_ROWS, choices.length)
    const sel    = names.indexOf(assign.name)
    const first  = dropFirst(names, assign.name)
    const more   = (flag: boolean, sign: string) => flag ? sign : "─"
    const icon   = (choice: AssignChoice) => choice.kind === "user" ? "☺" : choice.kind === "agent" ? "⚉" : " "
    const drop   = dropH === 0 ? [ h(Text, { key: "assign-bottom", ...cx("signal") }, ` ╰${"─".repeat(nameW - 2)}╯ `) ] : [
        h(Text, { key: "assign-sep", ...cx("signal") }, ` ├${"─".repeat(nameW - 4)}${more(first > 0, "▴")}─┤ `),
        ...choices.slice(first, first + dropH).map((choice, k) =>
            h(Text, { key: `assign-${k}` },
                h(Text, cx("signal"), " │"),
                h(Text, cx("signal", first + k === sel && "inverse", first + k === sel && "bold"),
                    ` ${icon(choice)} ${sanitize(choice.name).slice(0, nameW - 6).padEnd(nameW - 6)} `),
                h(Text, cx("signal"), "│ "))),
        h(Text, { key: "assign-bottom", ...cx("signal") }, ` ╰${"─".repeat(nameW - 4)}${more(first + dropH < choices.length, "▾")}─╯ `)
    ]
    return h(Box, { key: "assign", top, left, width, height, ...cx("popup", "border-dim") },
        h(Text, cx("normal", "bold"),
            " ".repeat(qpad) + "Assign task ",
            h(Text, cx("inverse"), tid),
            " to:".padEnd(Math.max(0, innerW - qpad - 12 - tid.length))),
        blank("blank-above"),
        h(Text, { key: "assign-top", ...cx("signal") }, ` ╭${"─".repeat(nameW - 2)}╮ `),
        h(Text, { key: "assign-name" },
            h(Text, cx("signal"), " │ "),
            h(Text, cx("signal", "bold"), name),
            h(Text, cx("signal", "inverse"), " "),
            " ".repeat(Math.max(0, textW - name.length)),
            h(Text, cx("signal", "bold"), mark),
            h(Text, cx("signal"), `${names.length > 0 ? "▾" : " "} │ `)),
        ...drop,
        ...Array.from({ length: DROP_ROWS - dropH + (dropH === 0 ? 1 : 0) }, (_, k) => blank(`blank-drop-${k}`)),
        blank("blank-below"),
        h(Text, cx("dim"), keys))
}

/*  render the read dialog: full height, horizontally centered, with a
    vertical scroll bar in its right border  */
export const renderDialog = ({ card, group, id, pred, succ, tint, tabs, tab, first, scroll, lines, width, columns, rows, notice, viewer, diffed }: DialogArgs) => {
    const left   = Math.floor((columns - width) / 2)
    const bodyW  = width - 5
    const viewH  = rows - DIALOG_CHROME
    const maxS   = Math.max(0, lines.length - viewH)
    const s      = Math.min(scroll, maxS)
    const thumbH = Math.max(1, Math.round(viewH * Math.min(1, viewH / Math.max(1, lines.length))))
    const thumbY = maxS === 0 ? 0 : Math.round((viewH - thumbH) * s / maxS)

    /*  without a background fill, every inner cell has to be written
        explicitly (with spaces) to hide the dimmed board underneath  */
    const innerW = width - 2

    /*  the header width, without its outer spaces and the " X " close button  */
    const titleW = Math.max(0, innerW - 2 - 4)

    /*  the header: task group (if any, and not for an epic), task id (behind "≡",
        and of an epic also behind "♛"), and title on the left (with the title cut as needed), lane
        group and status on the right (dropped if even the task group and id would not fit otherwise)  */
    const title  = card !== undefined ? cardLabel(card).replace(/^(\S+) ▶ /, "$1 ") : id
    const tgroup = card !== undefined ? groupLabel(card) : ""
    const epic   = tgroup !== "" && tgroup === id
    const prefix = tgroup !== "" && !epic ? `♛ ${tgroup} ▶ ` : ""
    const groupW = prefix.length + (epic ? 4 : 2)
    let   right  = card !== undefined ? `${group !== undefined ? `${group} ▷ ` : ""}${card.status}` : ""
    if (id.length + 3 + groupW + right.length > titleW)
        right = ""
    else if (right !== "")
        right = " " + right
    const lane   = right !== "" && card !== undefined ? card.status : ""

    /*  the id is rendered inverse with one extra space on each side,
        preceded by the task group between "♛" and "▶" in bold  */
    const leftW  = Math.max(0, titleW - right.length - 2 - groupW)
    const head   = title.length > leftW ? title.slice(0, Math.max(0, leftW - 1)) + "…" : title.padEnd(leftW)
    const pos    = `lines ${s + 1}–${Math.min(lines.length, s + viewH)} of ${lines.length} `

    /*  the dependencies: predecessors on the left, successors on the right  */
    const segs   = refSegs(pred, succ, tint, innerW)

    /*  the tab bar: all tabs inverse, the selected one in signal color, the others in accent color  */
    const lay    = tabLayout(tabs, first, tab, innerW)
    const tabBar = [
        { text: lay.less ? "◁" : " ", color: palette.dim, bold: false, inverse: false },
        ...lay.items.flatMap((item, k) => [
            ...(k > 0 ? [ { text: " ", color: undefined, bold: false, inverse: false } ] : []),
            { text: item.text, color: item.index === tab ? palette.signal : palette.accent, bold: item.index === tab, inverse: true }
        ]),
        { text: " ".repeat(Math.max(0, lay.width - lay.used)) + (lay.more ? "▷" : " "), color: palette.dim, bold: false, inverse: false }
    ]

    /*  the horizontal separator, extended over the side borders to join them with T-glyphs  */
    const separator = (key: string) => h(Box, { key, marginLeft: -1, width, flexShrink: 0 },
        h(Text, cx("dim"), "├" + "─".repeat(innerW) + "┤"))

    /*  the key hints, or instead the status notice of an edit, truncated to the free width  */
    const free   = Math.max(0, innerW - pos.length - 1)
    const keys   = (notice !== null ? " " + sanitize(notice) :
        (diffed ? " #: clear diff ·" : "") +
        " ←/→/⇤/⇥: switch tab · ↑/↓/⇈/⇊: scroll · e: edit · E: edit by prompt · R: request by prompt · T: transition · A: assign · D: delete · M: toggle mouse · " +
        (viewer ? "q: quit" : "⏎/ESC: close")).slice(0, free)

    return h(Box, { key: "dialog", top: 0, left, width, height: rows, ...cx("popup", "border-dim") },
        h(Text, {},
            " ",
            ...(prefix !== "" ? [ h(Text, { ...cx("bold"), color: tint(id) }, prefix) ] : []),
            h(Text, { ...cx("badge"), color: tint(id) }, ` ${epic ? "♛ " : ""}≡ ${head.slice(0, id.length)} `),
            h(Text, { color: tint(id) }, head.slice(id.length)),
            h(Text, cx("dim"), right.slice(0, right.length - lane.length)),
            h(Text, cx("dim", "bold"), lane),
            " ",
            h(Text, cx("dim", !viewer && "inverse"), viewer ? "   " : " X "),
            " "),
        separator("sep-title"),
        h(Text, {}, ...segs.map((seg, k) => h(Text, { key: k, color: seg.color, inverse: seg.inverse }, seg.text))),
        separator("sep-head"),
        h(Text, { wrap: "truncate" }, ...tabBar.map((seg, k) =>
            h(Text, { key: k, color: seg.color, bold: seg.bold, inverse: seg.inverse }, seg.text))),
        separator("sep-tabs"),
        ...Array.from({ length: viewH }, (_, i) => {
            const line = lines[s + i]
            const bar  = lines.length <= viewH ? " " : (i >= thumbY && i < thumbY + thumbH ? "█" : "░")

            /*  split the padded line into runs of equal inline style (cut to the body width,
                as a wider line would wrap and push the rows of the dialog out of place)  */
            const text = (line?.sign ?? " ") + (line?.text ?? "").slice(0, bodyW).padEnd(bodyW)
            const mask = [ line?.sign !== undefined ? CHANGED : 0, ...(line?.mask ?? []) ]
            const runs = [] as { text: string, style: number }[]
            for (let k = 0; k < text.length; k++) {
                const style = mask[k] ?? 0
                if (runs.length > 0 && runs[runs.length - 1].style === style)
                    runs[runs.length - 1].text += text[k]
                else
                    runs.push({ text: text[k], style })
            }
            return h(Box, { key: i },
                ...runs.map((run, k) => h(Text, {
                    key: k, wrap: "truncate",
                    color: line?.tint ?? ((run.style & (CODE | ACCENT)) !== 0 ? palette.accent : (run.style & SIGNAL) !== 0 ? palette.signal :
                        (run.style & DIM) !== 0 ? palette.dim : line?.color),
                    inverse: (run.style & CHANGED) !== 0,
                    bold: (line?.bold ?? false) || (run.style & BOLD) !== 0, italic: (run.style & ITALIC) !== 0
                }, run.text)),
                h(Text, cx("signal"), ` ${bar}`))
        }),
        separator("sep-foot"),
        h(Box, {},
            h(Text, cx("hint", notice !== null && "signal"), keys),
            h(Text, cx("hint"), pos.padStart(Math.max(0, innerW - keys.length)))))
}

