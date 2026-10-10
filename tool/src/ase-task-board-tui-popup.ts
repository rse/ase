/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import { Box, Text }                          from "ink"

import type { Task }                          from "./ase-task.js"
import { cardLabel, groupLabel, attachmentTabs, isDraftDiff, diffTones } from "./ase-task-board-core.js"
import type { Card }                          from "./ase-task-board-core.js"
import { h }                                  from "./ase-task-board-tui-view.js"
import { palette, cx, spinnerFrames, eighths } from "./ase-task-board-tui-style.js"
import type { TransferEntry, BusyLabel }      from "./ase-task-board-tui-model.js"

/*  a text line with a per-character mask of its inline style
    (bit 0: bold, bit 1: italic, bit 2: code, bit 3: accent, bit 4: signal)  */
type Line = { text: string, mask: number[] }
const BOLD   = 1
const ITALIC = 2
const CODE   = 4
const ACCENT = 8
const SIGNAL = 16

/*  strip the Markdown inline markers of a line ("`" for code, "**" and
    "__" for bold, "*" for italic), recording the style of the marked text  */
const emphasis = (line: string): Line => {
    const out  = { text: "", mask: [] as number[] }
    const add  = (text: string, style: number) => {
        out.text += text
        out.mask.push(...new Array<number>(text.length).fill(style))
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
    text.replace(/\t/g, "    ").replace(/[\p{Cc}؜‎‏‪-‮⁦-⁩]/gu, "")

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
type DialogLine = { text: string, color?: string, bold?: boolean, mask?: number[] }

/*  the key/value header lines of the read dialog, separated from the
    content by a line, so that the content starts after a blank line  */
const headerLines = (keys: [ string, string ][], width: number): DialogLine[] => {
    const out = keys.map(([ key, val ]): DialogLine => ({ text: `${(key + ":").padEnd(11)}${sanitize(val)}`, color: palette.dim }))
    if (out.length > 0)
        out.push({ text: "─".repeat(width), color: palette.dim }, { text: "" })
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
        ...headerLines([ ...parts.keys ].filter(([ key ]) => key !== "Type"), width),
        ...markdownLines(parts.body, width)
    ]
}

/*  the lines of a task plan attachment for the read dialog: its embedded
    data or its (lazily loaded) file content, rendered as Markdown for a
    Markdown type, as a placeholder if binary, and else verbatim  */
export const attachmentLines = (att: Attachment, content: Buffer | Error | undefined, width: number): DialogLine[] => {
    const out = headerLines(([
        [ "Type", att.type ], [ "Desc", att.desc ], [ "Created", att.created ?? "" ], [ "Modified", att.modified ?? "" ]
    ] as [ string, string ][]).filter(([ , val ]) => val !== ""), width)
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
    if (/^text\/markdown\b/i.test(att.type.trim()))
        return [ ...out, ...markdownLines(text, width) ]

    /*  a draft diff is colored per line: its file headers up to and
        including the hunk headers dimmed, inserted lines accented, removed
        lines signaled, and context lines in the default color  */
    const lines = text.replace(/^(?:[ \t]*\r?\n)+/, "").split(/\r?\n/).map(sanitize)
    const tones = isDraftDiff(att.type) ? diffTones(lines) : null
    const tint  = { head: palette.dim, add: palette.accent, del: palette.signal, ctx: palette.normal }
    lines.forEach((line, i) => {
        const color = tones !== null ? tint[tones[i]] : palette.accent
        for (const part of wrap({ text: line, mask: new Array<number>(line.length).fill(0) }, width))
            out.push({ text: part.text, color, mask: part.mask })
    })
    return out
}

/*  the tab labels of the read dialog: the task content, followed by its attachments  */
export const dialogTabs = (parts: PlanParts): string[] =>
    attachmentTabs(parts !== undefined && parts !== null && !(parts instanceof Error) ? parts.atts : [])

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
    lines: DialogLine[], columns: number, rows: number, notice: string | null
}

/*  the segments of the dependencies row of the read dialog within its inner width:
    predecessors on the left, successors on the right (padded in between to the
    full width, or cut at the end if too long), with each id rendered inverse
    with one extra space on each side and carrying the referenced task id  */
export const refSegs = (pred: string[], succ: string[], tint: (id: string) => string | undefined, innerW: number) => {
    type Seg = { text: string, color: string | undefined, inverse: boolean, ref?: string }
    const refs = (ids: string[]): Seg[] => ids.length === 0 ?
        [ { text: "—", color: palette.dim, inverse: false } ] :
        ids.flatMap((ref, i) => [
            ...(i > 0 ? [ { text: " ", color: palette.dim, inverse: false } ] : []),
            { text: ` ${ref} `, color: tint(ref), inverse: true, ref }
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

/*  render the read dialog: full height, horizontally centered, with a
    vertical scroll bar in its right border  */
export const renderDialog = ({ card, group, id, pred, succ, tint, tabs, tab, first, scroll, lines, columns, rows, notice }: DialogArgs) => {
    const width  = Math.min(columns - 2, DIALOG_WIDTH)
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

    /*  the header: task group (if any, and not for an epic), task id (of an epic
        behind "♛"), and title on the left (with the title cut as needed), lane
        group and status on the right (dropped if even the task group and id would not fit otherwise)  */
    const title  = card !== undefined ? cardLabel(card).replace(/^(\S+) ▶ /, "$1 ") : id
    const tgroup = card !== undefined ? groupLabel(card) : ""
    const epic   = tgroup !== "" && tgroup === id
    const prefix = tgroup !== "" && !epic ? `♛ ${tgroup} ▶ ` : ""
    const groupW = prefix.length + (epic ? 2 : 0)
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
        " ←/→/⇤/⇥: switch tab · ↑/↓/⇈/⇊: scroll · e: edit · T: transition · D: delete · M: toggle mouse · ⏎/ESC: close").slice(0, free)

    return h(Box, { key: "dialog", top: 0, left, width, height: rows, ...cx("popup", "border-dim") },
        h(Text, {},
            " ",
            ...(prefix !== "" ? [ h(Text, { ...cx("bold"), color: tint(id) }, prefix) ] : []),
            h(Text, { ...cx("badge"), color: tint(id) }, ` ${epic ? "♛ " : ""}${head.slice(0, id.length)} `),
            h(Text, { color: tint(id) }, head.slice(id.length)),
            h(Text, cx("dim"), right.slice(0, right.length - lane.length)),
            h(Text, cx("dim", "bold"), lane),
            " ",
            h(Text, cx("dim", "inverse"), " X "),
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

            /*  split the padded line into runs of equal inline style  */
            const text = " " + (line?.text ?? "").padEnd(bodyW)
            const mask = [ 0, ...(line?.mask ?? []) ]
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
                    color: (run.style & (CODE | ACCENT)) !== 0 ? palette.accent : (run.style & SIGNAL) !== 0 ? palette.signal : line?.color,
                    bold: (line?.bold ?? false) || (run.style & BOLD) !== 0, italic: (run.style & ITALIC) !== 0
                }, run.text)),
                h(Text, cx("signal"), ` ${bar}`))
        }),
        separator("sep-foot"),
        h(Box, {},
            h(Text, cx("hint", notice !== null && "signal"), keys),
            h(Text, cx("hint"), pos.padStart(Math.max(0, innerW - keys.length)))))
}

