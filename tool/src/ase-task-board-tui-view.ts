/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import React                                  from "react"
import { Box, Text }                          from "ink"
import type { BoxProps, DOMElement }          from "ink"

import { splitHeight, rowLanes, toneOf, cardLabel, groupLabel, editMarker, effortMarker, clampLines, glueId, glueTitle, glueGroup, agentLabel, agentUser, agentUptime, agentUsage, agentDuration, badgesOf, viewCycleHint } from "./ase-task-board-core.js"
import type { Board, Card, GroupSpec, LaneSpec, Surface, AgentsState } from "./ase-task-board-core.js"
import type { AgentPresence }              from "./ase-agent-relay-core.js"
import { drawGraphText }                      from "./ase-task-board-graph.js"
import { drawFlowText, isFlowCard, flowRelations } from "./ase-task-board-flow.js"
import type { FlowCard }                      from "./ase-task-board-flow.js"
import { statsRanges, statsRangeLabels, statsRangeLabel } from "./ase-task-board-stats.js"
import type { BoardCtx, Sel, Carry }          from "./ase-task-board-tui-model.js"
import { palette, dashed, dashedBold, cx, isClass, pulseFrames, lowerEighths } from "./ase-task-board-tui-style.js"

/*  shorthand for creating React elements without JSX  */
export const h = React.createElement

/*  layout constants: minimum group width, collapsed group width, gap  */
const GROUP_MIN  = 26
const GROUP_COLL = 5
const GROUP_GAP  = 1

/*  layout constants of a grown lane: minimum card width, gap between cards  */
const GRID_MIN   = 30
const GRID_GAP   = 1

/*  make a text of the agent relay safe for the terminal (strip control characters)  */
const clean = (text: string): string =>
    text.replace(/\p{Cc}/gu, "")

/*  append to the content of an info line (" " if empty) the hint how to show the
    hidden key hints again, so it need not be remembered while the key hints are hidden  */
const keysHint = (surface: Surface, info: React.ReactNode): React.ReactNode =>
    surface.keys ? info : info === " " ? "?: show key hints" :
        [ ...(Array.isArray(info) ? info : [ info ]), " · ?: show key hints" ]

/*  compute the visible group range starting at a first group, with the
    width of each visible group (collapsed groups stay narrow, expanded
    groups share the remaining width but never drop below the minimum)  */
export const fitGroups = (groups: GroupSpec[], collapsed: string[], first: number, width: number) => {
    const widths = [] as number[]
    let   used   = 0
    for (let g = first; g < groups.length; g++) {
        const w   = collapsed.includes(groups[g].title) ? GROUP_COLL : GROUP_MIN
        const gap = widths.length > 0 ? GROUP_GAP : 0
        if (widths.length > 0 && used + gap + w > width)
            break
        widths.push(w)
        used += gap + w
    }
    const expanded = widths.map((w, i) => w === GROUP_COLL && collapsed.includes(groups[first + i].title) ? -1 : i)
        .filter((i) => i >= 0)
    if (expanded.length > 0) {
        const extra = Math.max(0, width - used)
        const each  = Math.floor(extra / expanded.length)
        expanded.forEach((i) => { widths[i] += each })
        widths[expanded[0]] += extra - each * expanded.length
    }
    return { first, last: first + widths.length - 1, widths }
}

/*  the rendering context of the lane view, with the currently carried
    task (if any) and the lane states it can be moved to, the groups
    whose lanes show a scroll arrow on their left or right border (or -1),
    the current pulse frame of the tasks of active lanes (or -1),
    the known agents and the agents busy with each task,
    and the registration of the rendered card, lane, and group boxes for the mouse hit-testing  */
type ViewCtx = {
    board: Board, surface: Surface, sel: Sel, dim: boolean, carry: Carry | null, titles: boolean, scroll: Scroll, pulse: number,
    agents:   AgentsState | null
    working:  Map<string, AgentPresence[]>
    cardRef:  (id: string) => (el: DOMElement | null) => void
    laneRef:  (g: number, l: number) => (el: DOMElement | null) => void
    groupRef: (g: number) => (el: DOMElement | null) => void
}
type Scroll  = { left: number, right: number }

/*  the scroll arrows of a lane box, attached outside to the vertical middle
    of its side borders (in the side padding of the board), placed either
    within the bordered box itself (whose offsets start inside the border)
    or within an unbordered wrapper around it  */
const scrollArrows = ({ scroll, dim }: ViewCtx, g: number, height: number, wrapper = false) => {
    const off = wrapper ? -1 : -2
    const top = Math.max(0, Math.floor((height - 2) / 2)) + (wrapper ? 1 : 0)
    return [
        ...(scroll.left  === g ? [ h(Box, { key: "scroll-left",  position: "absolute", left:  off, top },
            h(Text, cx("dim", "bold", dim && "dimmed"), "◁")) ] : []),
        ...(scroll.right === g ? [ h(Box, { key: "scroll-right", position: "absolute", right: off, top },
            h(Text, cx("dim", "bold", dim && "dimmed"), "▷")) ] : [])
    ]
}

/*  the label lines of a card of a width: its group (if any, and not for an epic,
    between "♛" and "▶"), the task id (behind "≡", and of an epic also behind "♛"), its markers
    (of the edit requests and of the effort size), and title,
    cut onto a single line, or if titles are shown, wrapped onto at most three lines
    (with an ellipsis if cut), padded by one column on each side, with the group
    glued to the task id by five placeholder columns (the "♛", the "▶", their
    spacing, and the gap), a placeholder column glued
    in front of the task id to reserve the extra column of its inverse
    rendering (plus two for the "≡", and two more for the "♛" of an epic), the arrow in front of the
    title dropped, and a placeholder column glued in front of the first marker
    (resp. the title) for its spacing to the inverse task id, where, if titles are
    shown and the group and the task id together do not fit onto the first line,
    the task id starts on the second line  */
const cardLines = ({ titles }: ViewCtx, c: Card, width: number): string[] => {
    const textW = Math.max(3, width - 2)
    const edit  = editMarker(c)
    const size  = effortMarker(c)
    const marks = (edit !== "" ? ` ${edit}` : "") + (size !== "" ? ` ${size}` : "")
    const group = groupLabel(c)
    const epic  = group === c.id
    const glued = group !== "" && !epic ? glueGroup.repeat(3) + group.replace(/ /g, glueGroup) + glueGroup.repeat(2) : ""
    const head  = glueId + glueGroup.repeat(epic ? 4 : 2) + c.id
    const text  = glued + (titles && glued !== "" && glued.length + head.length > textW - 2 ? " " : "") + head +
        (marks + cardLabel(c).slice(c.id.length).replace(/^ ▶ /, " ")).replace(/^ /, ` ${glueTitle}`)
    return clampLines(text, textW - 2, titles ? 3 : 1).map((line) => ` ${line}`)
}

/*  render one card of a width and height (in rows) of a lane, either regularly,
    as the carried task on top of the selected target lane (moving), or as the
    dim ghost of the carried task at its original position (phantom)  */
const renderCard = (ctx: ViewCtx, lane: LaneSpec, c: Card, lines: string[], width: number, rows: number,
    cut: "none" | "top" | "bottom", moving: boolean, phantom: boolean) => {
    const { board, sel, dim, carry } = ctx
    const held    = carry?.id === c.id && !phantom
    const on      = (c.id === sel.id || moving) && !dim && !phantom
    const tone    = toneOf(board, c)
    const tint    = phantom ? palette.dim : on ? palette.signal : tone === "active" ? palette.accent : tone === "done" ? palette.dim : palette.normal

    /*  the group (if any, and not for an epic) at the start of the first line
        (behind the margin) between "♛" and "▶" in bold box color, followed by the task id
        (behind the placeholder), which is always bold and inverse, with one column
        of spacing on each side (behind "≡", and for an epic also behind "♛"), and then the
        rest of the label, where a partially visible card loses its cut border and text lines,
        and where the task id is either on the first line behind the group or on the second line  */
    const group   = groupLabel(c)
    const epic    = group === c.id
    const lead    = group !== "" && !epic ? group.length + 5 : 0
    const at      = Math.max(0, lines.findIndex((line) => line.includes(glueId)))
    const from    = (at > 0 ? lines[at].indexOf(glueId) : lead + 1) + (epic ? 5 : 3)
    const to      = from + c.id.length
    const badge   = lead > 0 ? [ h(Text, { key: "group", ...cx("bold") },
        `♛ ${lines[0].slice(4, lead - 1).replace(new RegExp(glueGroup, "g"), " ")} ▶`), " " ] : []
    const box     = {
        key: moving ? "moving" : c.id, ...(moving ? {} : { ref: ctx.cardRef(c.id) }),
        borderStyle: phantom ? dashed : held ? "double" : "single", borderColor: tint, borderDimColor: dim,
        borderTop: cut !== "top", borderBottom: cut !== "bottom", width, height: rows, flexDirection: "column"
    } as const

    /*  the markers of the edit requests and of the effort size (in this order, each on
        whatever line it was wrapped onto) in bold (except for their enclosing brackets),
        and in the regular color of the card text  */
    const marks   = [ { key: "edit", text: editMarker(c) }, { key: "effort", text: effortMarker(c) } ]
        .filter((mark) => mark.text !== "")
    let   marked  = 0
    const marker  = (text: string): React.ReactNode[] => {
        const out = [] as React.ReactNode[]
        let   rest = text
        while (marked < marks.length) {
            const mark = marks[marked]
            const at   = rest.indexOf(mark.text)
            if (at < 0)
                break
            marked++
            const inner = mark.text.replace(/^\[(.*)\]$/, "$1")
            const frame = inner !== mark.text
            out.push(rest.slice(0, at), h(Text, { key: mark.key }, frame ? "[" : "",
                h(Text, { bold: true }, inner), frame ? "]" : ""))
            rest = rest.slice(at + mark.text.length)
        }
        return [ ...out, rest ]
    }
    /*  the part of a task id too long for its line, which is hard-wrapped onto the
        following lines (behind the margin), is also rendered inverse, with the trailing
        column of spacing behind its last part  */
    let   spill   = Math.max(0, to - lines[at].length)
    const spills  = lines.map((line, k) => {
        const n = k <= at ? 0 : Math.min(spill, line.length - 1)
        spill -= n
        return { n, end: n > 0 && spill === 0 }
    })
    const text    = lines.map((line, k) => h(Text, { key: k, color: tint, dimColor: dim, wrap: "truncate" },
        ...(k < at ? [ line.slice(0, 1), ...badge ] :
            k === at ? [ line.slice(0, 1), ...(k === 0 ? badge : []), h(Text, { key: "id", ...cx("badge") }, ` ${epic ? "♛ " : ""}≡ ${line.slice(from, to)} `),
                ...marker(line.slice(to + 1).replace(new RegExp(`^${glueTitle}`), " ").replace(glueTitle, "")) ] :
                spills[k].n > 0 ? [ line.slice(0, 1), h(Text, { key: "id", ...cx("badge") }, line.slice(1, 1 + spills[k].n) + (spills[k].end ? " " : "")),
                    ...marker(line.slice(2 + spills[k].n).replace(new RegExp(`^${glueTitle}`), " ").replace(glueTitle, "")) ] :
                    marker(line.replace(glueTitle, "")))))
        .slice(cut === "top" ? lines.length + 1 - rows : 0, cut === "bottom" ? rows - 1 : lines.length)

    /*  the badges of the task (the agents busy with it, else its assignee), each as an inverse
        " <icon> <name> " box (separated by a border character) in signal color when selected,
        in accent color when active, and else in normal color, on the left part of its top border (placed
        on the border row, i.e. above the content of a bordered box, and behind one border character)  */
    const badges  = !moving && !phantom && cut !== "top" ? badgesOf(c, ctx.agents, ctx.working.get(c.id)) : []
    const shade   = on ? palette.signal : tone === "active" ? palette.accent : palette.normal
    const labels  = (top: number) => badges.length > 0 && width > 10 ? [
        h(Box, { key: "badges", position: "absolute", top, left: top < 0 ? 1 : 2, width: width - 7 },
            h(Text, { color: tint, dimColor: dim, wrap: "truncate" },
                ...badges.flatMap((badge, k) => [ k > 0 ? (held ? "═" : "─") : "",
                    h(Text, { key: k, ...cx("badge"), color: shade, dimColor: dim }, ` ${badge.icon} ${badge.name} `) ]))) ] : []
    if (!lane.active || ctx.pulse < 0 || moving || phantom || cut === "top")
        return h(Box, box, ...text, ...labels(-1))

    /*  the tasks of active lanes pulse in their top border, which hence
        is drawn on its own above the box without its regular top border  */
    const [ cl, cm, cr ] = held ? [ "╔", "═", "╗" ] : [ "┌", "─", "┐" ]
    const top     = cl + cm.repeat(Math.max(0, width - 4)) + pulseFrames[ctx.pulse] + cm + cr
    return h(Box, { key: box.key, ref: ctx.cardRef(c.id), width, height: rows, flexDirection: "column" },
        h(Text, { color: tint, dimColor: dim, wrap: "truncate" }, top),
        ...(rows > 1 ? [ h(Box, { ...box, key: "box", ref: undefined, borderTop: false, height: rows - 1 }, ...text) ] : []),
        ...labels(0))
}

/*  render one lane of the lane view  */
const renderLane = (ctx: ViewCtx, lane: LaneSpec, g: number, l: number, width: number, height: number) => {
    const { board, surface, sel, dim, carry } = ctx
    const cards   = board.lanes.get(lane.status) ?? []
    const color   = lane.active ? palette.accent : lane.kind === "terminal" ? palette.dim : palette.normal
    const target  = carry?.targets.has(lane.status) ?? false
    const min     = surface.minimized.includes(lane.status)

    /*  a signal-colored border marks the selected lane, and a heavy border marks
        the selected lane or, while moving a task, the target lanes instead  */
    const picked  = sel.g === g && sel.l === l
    const heavy   = carry !== null ? target : picked
    const style: BoxProps["borderStyle"] = lane.dashed ? (heavy ? dashedBold : dashed) : (heavy ? "bold" : "round")
    const frame   = { key: lane.status, borderStyle: style, borderColor: picked ? palette.signal : color, borderDimColor: dim }
    const head    = h(Box, { key: "head", justifyContent: "space-between", paddingX: 1 },
        h(Text, { color, bold: true, dimColor: dim, wrap: "truncate" },
            `${min ? "▶" : "▼"} ${lane.status}`),
        h(Text, { color, dimColor: dim }, String(cards.length)))
    if (min)
        return h(Box, { ...frame, ref: ctx.laneRef(g, l), width, height: 3, flexDirection: "column" }, head, ...scrollArrows(ctx, g, 3))

    /*  while moving a task onto a reachable target lane, the carried task is
        shown on top of the selected target lane, while a dim ghost of it
        stays at its original position until the drop happens  */
    const moved   = carry !== null && carry.targets.has(board.groups[sel.g]?.lanes[sel.l]?.status ?? "")
    const carried = moved && picked ? board.cards.get(carry.id) : undefined
    const list    = carried !== undefined ? [ carried, ...cards ] : cards

    /*  determine the visible cards by their actual heights, keeping the
        selected card (or the carried task instead) visible and, if not all
        cards fit, reserving one line for the indicator of the hidden cards  */
    const labels  = list.map((c) => cardLines(ctx, c, width - 2))
    const heights = labels.map((lines) => lines.length + 2)
    const sum     = (a: number, b: number) => heights.slice(a, b).reduce((n, x) => n + x, 0)
    const room    = height - 3
    const idx     = carried !== undefined ? 0 : list.findIndex((c) => c.id === sel.id)
    let   start   = 0
    let   end     = list.length
    if (sum(0, list.length) > room) {
        end = 0
        while (end < list.length && sum(0, end + 1) <= room - 1)
            end++
        if (idx >= end) {
            start = idx
            end   = idx + 1
            while (start > 0 && sum(start - 1, end) <= room - 1)
                start--
        }
    }
    const rest  = list.length - end

    /*  the space left besides the fully visible cards is filled by a partially
        visible card, cut at its top above them if scrolled, else cut at its bottom below them  */
    const part  = start > 0 || rest > 0 ? room - 1 - sum(start, end) : 0
    const cuts  = [
        ...(part > 0 && start > 0 ? [ { n: start - 1, cut: "top"    as const, rows: part } ] : []),
        ...list.slice(start, end).map((_c, i) => ({ n: start + i, cut: "none" as const, rows: heights[start + i] })),
        ...(part > 0 && start === 0 ? [ { n: end, cut: "bottom" as const, rows: part } ] : [])
    ]
    const items = cuts.map(({ n, cut, rows }) => {
        const moving  = carried !== undefined && n === 0
        const phantom = moved && !moving && list[n].id === carry?.id
        return renderCard(ctx, lane, list[n], labels[n], width - 2, rows, cut, moving, phantom)
    })

    /*  the centered indicator of the hidden cards, pushed to the bottom of the lane by a growing spacer  */
    if (start > 0 || rest > 0)
        items.push(h(Box, { key: "spacer", flexGrow: 1 }),
            h(Box, { key: "more", justifyContent: "center" },
                h(Text, cx("dim", dim && "dimmed"),
                    [ ...(start > 0 ? [ `△ ${start}` ] : []), ...(rest > 0 ? [ `▽ ${rest}` ] : []) ].join(" "))))
    return h(Box, { ...frame, ref: ctx.laneRef(g, l), width, height, flexDirection: "column" }, head, ...items, ...scrollArrows(ctx, g, height))
}

/*  the number of grid columns of the cards of a grown lane of a width:
    at least four, but more if the cards then still keep their minimum width  */
export const gridColumns = (width: number) =>
    Math.max(4, Math.floor((width - 4 + GRID_GAP) / (GRID_MIN + GRID_GAP)))

/*  render the grown lane of the lane view: all its cards in a grid of rows,
    all cards of a row having the height of its highest card, where only
    the rows fitting into the lane are shown, keeping the selected card visible  */
const renderGrown = (ctx: ViewCtx, lane: LaneSpec, g: number, l: number, width: number, height: number) => {
    const { board, sel, dim } = ctx
    const cards   = board.lanes.get(lane.status) ?? []
    const color   = lane.active ? palette.accent : lane.kind === "terminal" ? palette.dim : palette.normal
    const style: BoxProps["borderStyle"] = lane.dashed ? dashedBold : "bold"
    const head    = h(Box, { key: "head", justifyContent: "space-between", paddingX: 1 },
        h(Text, { color, bold: true, dimColor: dim, wrap: "truncate" }, `◆ ${lane.status}`),
        h(Text, { color, dimColor: dim }, String(cards.length)))

    /*  the column widths, distributing the remaining width onto the first columns  */
    const cols    = gridColumns(width)
    const free    = width - 4 - (cols - 1) * GRID_GAP
    const widths  = Array.from({ length: cols }, (_x, i) => Math.floor(free / cols) + (i < free % cols ? 1 : 0))

    /*  determine the visible rows by their actual heights, keeping the row of
        the selected card visible and, if not all rows fit, reserving one line
        for the indicator of the hidden cards  */
    const labels  = cards.map((c, i) => cardLines(ctx, c, widths[i % cols]))
    const total   = Math.ceil(cards.length / cols)
    const heights = Array.from({ length: total }, (_x, r) =>
        Math.max(...labels.slice(r * cols, (r + 1) * cols).map((lines) => lines.length + 2)))
    const sum     = (a: number, b: number) => heights.slice(a, b).reduce((n, x) => n + x, 0)
    const room    = height - 3
    const idx     = Math.floor(Math.max(0, cards.findIndex((c) => c.id === sel.id)) / cols)
    let   start   = 0
    let   end     = total
    if (sum(0, total) > room) {
        end = 0
        while (end < total && sum(0, end + 1) <= room - 1)
            end++
        if (idx >= end) {
            start = idx
            end   = idx + 1
            while (start > 0 && sum(start - 1, end) <= room - 1)
                start--
        }
    }
    const above   = start * cols
    const below   = Math.max(0, cards.length - end * cols)
    const items   = heights.slice(start, end).map((rows, i) => {
        const r = start + i
        return h(Box, { key: `row${r}`, height: rows, columnGap: GRID_GAP, paddingX: 1 },
            ...cards.slice(r * cols, (r + 1) * cols).map((c, k) =>
                renderCard(ctx, lane, c, labels[r * cols + k], widths[k], rows, "none", false, false)))
    })

    /*  the centered indicator of the hidden cards, pushed to the bottom of the lane by a growing spacer  */
    if (above > 0 || below > 0)
        items.push(h(Box, { key: "spacer", flexGrow: 1 }),
            h(Box, { key: "more", justifyContent: "center" },
                h(Text, cx("dim", dim && "dimmed"),
                    [ ...(above > 0 ? [ `△ ${above}` ] : []), ...(below > 0 ? [ `▽ ${below}` ] : []) ].join(" "))))
    return h(Box, {
        key: lane.status, ref: ctx.laneRef(g, l), borderStyle: style, borderColor: palette.signal, borderDimColor: dim,
        width, height, flexDirection: "column"
    }, head, ...items)
}

/*  render one group column of the lane view  */
const renderGroup = (ctx: ViewCtx, group: GroupSpec, g: number, width: number, height: number, last: boolean) => {
    const { board, surface, sel, dim } = ctx
    const gap = last ? 0 : GROUP_GAP
    if (surface.collapsed.includes(group.title)) {
        /*  render each lane of the collapsed phase as a narrow column with
            its vertically written status and number of cards  */
        const heights = splitHeight(height - 1, group.lanes.map((l) => l.weight), 3)
        const label   = "▶"
        const rest    = Math.max(0, width - label.length)
        const left    = Math.floor(rest / 2)
        return h(Box, { key: group.title, ref: ctx.groupRef(g), flexDirection: "column", width, marginRight: gap },
            h(Text, cx("group-head", sel.g === g && "group-head-selected", dim && "dimmed"),
                " ".repeat(left) + label + " ".repeat(rest - left)),
            ...group.lanes.map((lane, l) => {
                const count = board.lanes.get(lane.status)?.length ?? 0
                const picked = sel.g === g && sel.l === l
                const color  = lane.active ? palette.accent : lane.kind === "terminal" ? palette.dim : palette.normal
                const digits = [ ...String(count) ]

                /*  the title fits between the arrow and the count, each separated
                    by a blank line (inside the two border lines), and is cut with an ellipsis  */
                const room   = Math.max(0, heights[l] - 2 - 1 - 1 - 1 - digits.length)
                let title    = [ ...lane.status.toUpperCase() ]
                if (title.length > room)
                    title = room > 0 ? [ ...title.slice(0, room - 1), "…" ] : []

                /*  the selection marks only the border (signal-colored and bold), not the text  */
                const frame  = {
                    borderStyle: lane.dashed ? (picked ? dashedBold : dashed) : (picked ? "bold" : "round"),
                    borderColor: picked ? palette.signal : color, borderDimColor: dim,
                    height: heights[l], flexDirection: "column", alignItems: "center", overflow: "hidden"
                } as const

                /*  the characters must not shrink, so a too long label is cut  */
                const char   = (key: string, ch: string, bold: boolean) =>
                    h(Box, { key, flexShrink: 0 }, h(Text, { color, bold, dimColor: dim }, ch))

                /*  the unbordered wrapper allows the scroll arrows to escape the clipping,
                    the growing spacer pushes the count to the bottom  */
                return h(Box, { key: lane.status, ref: ctx.laneRef(g, l), height: heights[l], flexDirection: "column" },
                    h(Box, frame,
                        char("arrow", "▶", false),
                        h(Box, { height: 1, flexShrink: 0 }),
                        ...title.map((ch, i) => char(`t${i}`, ch, ch !== "…")),
                        h(Box, { flexGrow: 1, minHeight: 1 }),
                        h(Box, { flexDirection: "column", alignItems: "center", flexShrink: 0 },
                            ...digits.map((ch, i) => char(`c${i}`, ch, false)))),
                    ...scrollArrows(ctx, g, heights[l], true))
            }))
    }
    const min     = group.lanes.map((l) => surface.minimized.includes(l.status))
    const free    = height - 1 - min.filter((m) => m).length * 3
    const heights = splitHeight(free, group.lanes.map((l, i) => min[i] ? 0 : l.weight), 3)
    const label   = ` ▼ ${group.title} `
    const rest    = Math.max(0, width - label.length)
    const left    = Math.floor(rest / 2)
    return h(Box, { key: group.title, ref: ctx.groupRef(g), flexDirection: "column", width, marginRight: gap },
        h(Text, cx("group-head", sel.g === g && "group-head-selected", dim && "dimmed"),
            " ".repeat(left) + label + " ".repeat(rest - left)),
        ...group.lanes.map((lane, l) => renderLane(ctx, lane, g, l, width, heights[l])))
}

/*  render the lane view  */
export const renderLanes = (ctx: BoardCtx) => {
    const { board, surface, sel, dim, carry, fit, columns, boardH, mouse, pulse, grown, cardRef, laneRef, groupRef, agents, working } = ctx
    const total  = board.groups.length
    const shown  = fit.last - fit.first + 1
    const arrows = shown < total && !grown
    const group  = board.groups[sel.g]
    const info   = grown ? `lane ${group.lanes[sel.l].status} of group ${group.title} grown · g shrinks` :
        `groups ${fit.first + 1}–${fit.last + 1} of ${total} · ${arrows ? "←/→ scrolls" : "all visible"}` +
        (surface.keys ? "" : " · ?: show key hints")
    const view   = { board, surface, sel, dim, carry, titles: surface.titles, scroll: { left: -1, right: -1 }, pulse, cardRef, laneRef, groupRef, agents, working }

    /*  the scroll bar consumes the entire width remaining besides the info  */
    const track  = Math.max(1, columns - 2 - info.length - 3)
    const on     = Math.max(1, Math.round(track * shown / total))
    const off    = Math.round(track * fit.first / total)
    const minned = surface.minimized.includes(board.groups[sel.g]?.lanes[sel.l]?.status ?? "")
    const folded = surface.collapsed.includes(board.groups[sel.g]?.title ?? "")
    const rowMin = rowLanes(board.groups, surface.collapsed, sel.l).every((s) => surface.minimized.includes(s))
    const edges  = { left: fit.first > 0 ? fit.first : -1, right: fit.last < total - 1 ? fit.last : -1 }
    return [
        h(Box, { key: "board", height: boardH, paddingX: 1 },
            ...(grown ? [ renderGrown(view, group.lanes[sel.l], sel.g, sel.l, columns - 2, boardH) ] :
                board.groups.slice(fit.first, fit.last + 1).map((g, i) => renderGroup({ ...view, scroll: edges }, g, fit.first + i, fit.widths[i], boardH, i === fit.widths.length - 1)))),
        h(Box, { key: "bar", ...cx("bar") },
            h(Text, cx("hint", dim && "dimmed"),
                (arrows ? "░".repeat(off) + "█".repeat(on) + "░".repeat(Math.max(0, track - off - on)) + " · " : "") + info)),
        h(Box, { key: "keys1", ...cx("bar") },
            h(Text, cx("hint", dim && "dimmed"),
                grown ?
                    "↑/↓/←/→: select task · ⇈/⇊/⇤/⇥: page/first/last task · ⏎: view task · e: edit task · SPACE: start transition task · T: transition task" :
                    "↑/↓/←/→: select task · ⇈/⇊/⇤/⇥: select lane · ⏎: view task · e: edit task · SPACE: start/stop transition task · T: transition task")),
        h(Box, { key: "keys2", ...cx("bar") },
            h(Text, cx("hint", dim && "dimmed"),
                "D: delete task · A: assign task · E: edit by prompt · R: request by prompt · N: new task · " +
                (grown ? "g/ESC: shrink lane" : `m: ${minned ? "maximize/expand" : "minimize/collapse"} lane · g: grow lane`))),
        h(Box, { key: "keys3", ...cx("bar") },
            h(Text, cx("hint", dim && "dimmed"),
                (grown ? "" :
                    `c: ${folded ? "expand" : "collapse"} phase · C: ${rowMin ? "expand" : "collapse"} lane row · `) +
                `t: ${surface.titles ? "collapse" : "expand"} titles · ` +
                `/: filter tasks · v/V: ${viewCycleHint("lanes", agents !== null)}`)),
        h(Box, { key: "keys4", ...cx("bar") },
            h(Text, cx("hint", dim && "dimmed"),
                `Left-Click: select task/lane/phase · Double-Click: ${grown ? "view task / shrink lane" : "view task, collapse/expand lane/phase"} · ` +
                `M: ${mouse ? "disable" : "enable"} mouse · ?: hide key hints · q: quit`))
    ]
}

/*  render the graph view  */
export const renderGraph = (ctx: BoardCtx) => {
    const { board, sel, dim, layout, boardH, x, y, viewH, viewW, graphView, graphTitles, surface, mouse, pulse, agents, working } = ctx
    const card = sel.id !== "" ? board.cards.get(sel.id) : undefined
    if (layout === null)
        return [ h(Box, { key: "graph", height: boardH, marginX: 1, paddingX: 1, ...cx("frame", "border-dim") },
            h(Text, cx("dim"), board.cards.size === 0 ? "(no tasks)" : "laying out …")),
        h(Text, { key: "info" }, " "), h(Text, { key: "keys1" }, " "), h(Text, { key: "keys2" }, " "), h(Text, { key: "keys3" }, " ") ]

    /*  draw the ELK layout, with the active nodes pulsing and the badges of the
        nodes (by their current cards, as the layout might lag behind the board)  */
    const badges = new Map([ ...layout.board.cards.values() ].map((c) =>
        [ c.id, badgesOf(board.cards.get(c.id) ?? c, agents, working.get(c.id)) ]))
    const { lines, tones } = drawGraphText(layout.board, layout.graph, sel.id, layout.titles, pulse >= 0 ? pulseFrames[pulse] : "", badges)
    const visible = lines.slice(y, y + viewH).map((l, i) => {
        const segs = [] as { text: string, tone: string }[]
        for (let k = x; k < Math.min(l.length, x + viewW); k++) {
            const tone = tones[y + i][k]
            if (segs.length > 0 && segs[segs.length - 1].tone === tone)
                segs[segs.length - 1].text += l[k]
            else
                segs.push({ text: l[k], tone })
        }
        return segs
    })
    const deps    = [ ...board.pred.values() ].reduce((n, ps) => n + ps.length, 0)
    return [
        h(Box, { key: "graph", height: boardH, marginX: 1 },
            /*  a graph smaller than the viewport is centered in it  */
            h(Box, { paddingX: 1, justifyContent: "center", alignItems: "center", ...cx("grow", "column", "frame", "border-dim", dim && "border-dimmed") },
                h(Box, { ref: graphView, ...cx("column") },
                    ...visible.map((segs, i) => h(Box, { key: i },
                        ...(segs.length === 0 ? [ h(Text, { key: 0 }, " ") ] : segs.map((seg, k) => {
                            const tone = `tone-${seg.tone}`
                            return h(Text, { key: k, ...cx(dim && "dimmed", isClass(tone) && tone) }, seg.text)
                        })))))),

            /*  overlay the graph statistics centered onto the top border  */
            h(Box, { position: "absolute", top: 0, left: 0, width: "100%", justifyContent: "center" },
                h(Text, { ...cx("dim", dim && "dimmed"), wrap: "truncate" },
                    `[ ${board.cards.size} tasks, ${deps} dependencies ]`))),
        h(Box, { key: "info", ...cx("bar") },
            h(Text, cx("hint", dim && "dimmed"), keysHint(surface, card === undefined ? " " :
                [ "task: ", h(Text, { key: "id", ...cx("bold") }, card.id), " · status: ", h(Text, { key: "status", ...cx("bold") }, card.status) ]))),
        h(Box, { key: "keys1", ...cx("bar") },
            h(Text, cx("hint", dim && "dimmed"),
                "↑/↓/←/→/Left-Click: select task · ⏎/Double-Click: view task · e: edit task · T: transition task")),
        h(Box, { key: "keys2", ...cx("bar") },
            h(Text, cx("hint", dim && "dimmed"),
                `D: delete task · A: assign task · E: edit by prompt · R: request by prompt · N: new task · t: ${graphTitles ? "collapse" : "expand"} titles · ` +
                `s: ${surface.standalone ? "hide" : "show"} standalone tasks`)),
        h(Box, { key: "keys3", ...cx("bar") },
            h(Text, cx("hint", dim && "dimmed"),
                `/: filter tasks · v/V: ${viewCycleHint("graph", agents !== null)} · M: ${mouse ? "disable" : "enable"} mouse · ?: hide key hints · q: quit`))
    ]
}

/*  render the agent graph view (like the graph view): the agent cards with the lifecycle states
    they observe, operate in, and write, with the selected agent card (with its states), resp.
    the selected state (with the agent cards observing, writing, and gating on it), in the
    information line  */
export const renderFlow = (ctx: BoardCtx) => {
    const { agents, flow, flowLayout, flowSel, dim, boardH, x, y, viewH, viewW, graphView, mouse, pulse, beatOf } = ctx
    const card  = flow.cards.get(flowSel)
    const rel   = card === undefined && flowSel !== "" && !isFlowCard(flowSel) ? flowRelations(flow, flowSel) : null
    const names = (cards: FlowCard[]) => cards.map((c) =>
        clean(agentLabel(c.agents[0])) + (c.agents.length > 1 ? ` ×${c.agents.length}` : "")).join(", ") || "none"
    const empty = agents === null || !agents.connected ? "agent relay unreachable — reconnecting …" : "no agents running"
    if (flowLayout === null || flow.cards.size === 0)
        return [ h(Box, { key: "flow", height: boardH, marginX: 1, paddingX: 1, ...cx("frame", "border-dim") },
            h(Text, cx("dim"), flow.cards.size === 0 ? empty : "laying out …")),
        h(Text, { key: "info" }, " "), h(Text, { key: "keys1" }, " "), h(Text, { key: "keys2" }, " ") ]

    /*  draw the ELK layout, with the busy agent cards pulsing  */
    const { lines, tones } = drawFlowText(flow, flowLayout.graph, flowSel, pulse >= 0 ? pulseFrames[pulse] : "", beatOf)
    const visible = lines.slice(y, y + viewH).map((l, i) => {
        const segs = [] as { text: string, tone: string }[]
        for (let k = x; k < Math.min(l.length, x + viewW); k++) {
            const tone = tones[y + i][k]
            if (segs.length > 0 && segs[segs.length - 1].tone === tone)
                segs[segs.length - 1].text += l[k]
            else
                segs.push({ text: l[k], tone })
        }
        return segs
    })
    const states = card?.states
    return [
        h(Box, { key: "flow", height: boardH, marginX: 1 },
            /*  a graph smaller than the viewport is centered in it  */
            h(Box, { paddingX: 1, justifyContent: "center", alignItems: "center", ...cx("grow", "column", "frame", "border-dim", dim && "border-dimmed") },
                h(Box, { ref: graphView, ...cx("column") },
                    ...visible.map((segs, i) => h(Box, { key: i },
                        ...(segs.length === 0 ? [ h(Text, { key: 0 }, " ") ] : segs.map((seg, k) => {
                            const tone = `tone-${seg.tone}`
                            return h(Text, { key: k, ...cx(dim && "dimmed", isClass(tone) && tone) }, seg.text)
                        })))))),

            /*  overlay the graph statistics centered onto the top border  */
            h(Box, { position: "absolute", top: 0, left: 0, width: "100%", justifyContent: "center" },
                h(Text, { ...cx("dim", dim && "dimmed"), wrap: "truncate" },
                    `[ ${agents?.agents.length ?? 0} agents, ${flow.states.length} states ]`))),
        h(Box, { key: "info", ...cx("bar") },
            h(Text, cx("hint", dim && "dimmed"), keysHint(ctx.surface, rel !== null ? [
                "state: ",          h(Text, { key: "state", ...cx("bold") }, rel.state),
                " · observed by: ", h(Text, { key: "in",    ...cx("bold") }, names(rel.input)),
                " · written by: ",  h(Text, { key: "out",   ...cx("bold") }, names(rel.output)),
                ...(rel.gate.length > 0 ? [ " · gate of: ", h(Text, { key: "gate", ...cx("bold") }, names(rel.gate)) ] : [])
            ] : card === undefined ? " " : [
                "agent: ", h(Text, { key: "agent", ...cx("bold") }, clean(agentLabel(card.agents[0])) +
                    (card.agents.length > 1 ? ` ×${card.agents.length}` : "")),
                ...(states === undefined ? [ " · requests: ", h(Text, { key: "req", ...cx("bold") }, clean(card.agents[0].request ?? "none")) ] : [
                    " · input: ",  h(Text, { key: "in",  ...cx("bold") }, states.input.join(", ") || "none"),
                    ...(states.activity !== undefined ? [ " · activity: ", h(Text, { key: "act", ...cx("bold") }, states.activity) ] : []),
                    " · output: ", h(Text, { key: "out", ...cx("bold") }, states.output.join(", ") || "none"),
                    ...(states.gate !== undefined ? [ " · gate: ", h(Text, { key: "gate", ...cx("bold") }, states.gate) ] : []) ]) ]))),
        h(Box, { key: "keys1", ...cx("bar") },
            h(Text, cx("hint", dim && "dimmed"),
                "↑/↓/←/→/Left-Click: select agent/state · ⏎/Double-Click: view agent · " +
                "⇈/⇊/⇤/⇥/Wheel: scroll canvas")),
        h(Box, { key: "keys2", ...cx("bar") },
            h(Text, cx("hint", dim && "dimmed"),
                `v/V: ${viewCycleHint("flow", agents !== null)} · M: ${mouse ? "disable" : "enable"} mouse · ?: hide key hints · q: quit`))
    ]
}

/*  the width of the master list (incl. its frame) and the height of an agent card of the agents view,
    and the height of its panes with the process and accounting of the selected agent (incl. their frames)  */
const AGENT_W = 36
const AGENT_H = 6
export const AGENT_INFO_H = 6

/*  the inner width of the detail view of the agents view on a screen width (without the side paddings
    of the screen, the frame and its left padding, the master list, the gap between the master list
    and the detail view, and the always reserved scroll bar)  */
export const agentLogWidth = (columns: number): number =>
    Math.max(10, columns - 2 - AGENT_W - 1 - 3 - 2)

/*  the pane with the operation of the selected agent of the agents view on a screen width: its
    name and title on its first line and its description, word-wrapped onto the inner width of the
    pane (the one of the detail view plus the scroll bar, minus the right padding) and clamped to at
    most six lines, and the height of this pane (incl. its frame)  */
export type AgentOp = { name: string, title: string, desc: string[] }
export const agentOpLines = (agent: AgentPresence | undefined, columns: number): AgentOp => ({
    name:  clean(agent?.name ?? ""),
    title: clean(agent?.title ?? ""),
    desc:  clampLines(clean(agent?.description ?? ""), agentLogWidth(columns) + 1, 6)
})
export const agentOpHeight = (op: AgentOp): number =>
    2 + 1 + op.desc.length

/*  render the agents view: on the left the framed master list "agents" of the agents as vertically
    aligned cards (name and state, kind and mode of operation, and the ids of the tasks it is
    busy with, inversely with the task icon, else "none (waiting)"), scrolled to keep the selected agent visible, and on
    the right (taking the remaining width) the framed pane of the operation of the selected agent (its
    name inversely with the agent icon, its title in bold, and its description), below it two equally wide framed panes of the selected agent
    (in accent color, like the efficiency of the statistics view): its process (host, process id,
    user name and id, and working directory, cut at its start) and its accounting (uptime, age of its
    heartbeat, and total and last usage of the agent tool), and below them the framed detail view "agent log" with the recent processing log of
    the selected agent, scrolled to the bottom unless scrolled up, and with the scroll position
    overlaid onto its frame  */
export const renderAgents = (ctx: BoardCtx) => {
    const { agents, agentList, agentIdx, agent, agentOp, logLines, logH, logFirst, logMax, boardH, dim, mouse, pulse, now, beatOf, agentRef } = ctx
    /*  the visible agent cards, where a line is reserved for the indicator of the hidden ones (like in the lanes)  */
    const room  = boardH - 2
    const all   = Math.max(1, Math.floor(room / AGENT_H))
    const fit   = agentList.length > all ? Math.max(1, Math.floor((room - 1) / AGENT_H)) : all
    const first = Math.max(0, Math.min(agentIdx - fit + 1, agentList.length - fit))
    const above = first
    const below = Math.max(0, agentList.length - first - fit)
    const empty = agents === null || !agents.connected ? "agent relay unreachable — reconnecting …" : "no agents running"
    const title = (text: string, accent = false) => h(Box, { key: "title", position: "absolute", top: 0, left: 0, width: "100%", justifyContent: "center" },
        h(Text, { ...cx(accent ? "accent" : "dim", dim && "dimmed"), wrap: "truncate" }, "[ ", h(Text, cx("bold"), text), " ]"))

    /*  the master list, where the top border of a card carries on its right side (like the
        task cards of the active lanes) the pulse of a busy agent, resp. the circle of a waiting one,
        and the top right corner inside the card carries the heart of the agent (filled for a
        second after each received heartbeat, else empty)  */
    const cardW = AGENT_W - 4
    const card  = (a: AgentPresence, n: number) => {
        const on    = n === agentIdx && !dim
        const tint  = on ? palette.signal : a.state === "busy" ? palette.accent : palette.normal
        const label = (text: string) => text.padEnd(6)
        const val   = (text: string) => h(Text, { bold: true }, text)
        const mode  = typeof a.mode === "string" && a.mode !== "" ? clean(a.mode) : "none"
        const [ cl, cm, cr ] = on ? [ "┏", "━", "┓" ] : [ "┌", "─", "┐" ]
        const mark  = a.state !== "busy" ? "○" : pulse >= 0 ? pulseFrames[pulse] : pulseFrames[0]
        return h(Box, { key: a.id, ref: agentRef(a.id), width: cardW, height: AGENT_H, flexShrink: 0, flexDirection: "column" },
            h(Text, { color: tint, dimColor: dim, wrap: "truncate" }, cl + cm.repeat(Math.max(0, cardW - 4)) + mark + cm + cr),
            h(Box, {
                height: AGENT_H - 1, flexDirection: "column", paddingX: 1,
                borderStyle: on ? "bold" : "single", borderTop: false, borderColor: tint, borderDimColor: dim
            },
            h(Box, { flexDirection: "row" },
                h(Box, { flexGrow: 1, flexShrink: 1 },
                    h(Text, { wrap: "truncate" }, h(Text, { ...cx("badge"), color: tint, dimColor: dim }, ` ⚉ ${clean(a.name)} `))),
                h(Box, { flexShrink: 0, marginLeft: 1 },
                    h(Text, { color: tint, dimColor: dim }, beatOf(a.id) ? "♥" : "♡"))),
            h(Text, { color: tint, dimColor: dim, wrap: "truncate" }, label("kind:"), val(clean(a.kind))),
            h(Text, { color: tint, dimColor: dim, wrap: "truncate" }, label("mode:"), val(mode)),
            h(Text, { color: tint, dimColor: dim, wrap: "truncate" }, label("task:"), ...(a.tasks.length === 0 ? [ val("none (waiting)") ] :
                a.tasks.flatMap((id, k) => [ k > 0 ? " " : "", h(Text, { key: id, ...cx("badge"), color: tint, dimColor: dim }, ` ≡ ${clean(id)} `) ])))))
    }

    /*  the space left besides the fully visible cards is filled by a partially visible
        card (like in the lanes), cut at its top above them if scrolled, else cut at its bottom below them  */
    const part  = above > 0 || below > 0 ? room - 1 - fit * AGENT_H : 0
    const clip  = (n: number, cut: "top" | "bottom") => h(Box, {
        key: `part-${cut}`, height: part, flexShrink: 0, overflow: "hidden", flexDirection: "column",
        justifyContent: cut === "top" ? "flex-end" : "flex-start"
    }, card(agentList[n], n))
    const cards = [
        ...(part > 0 && above > 0 ? [ clip(first - 1, "top") ] : []),
        ...agentList.slice(first, first + fit).map((a, i) => card(a, first + i)),
        ...(part > 0 && above === 0 && below > 0 ? [ clip(first + fit, "bottom") ] : [])
    ]
    const master = h(Box, { key: "master", width: AGENT_W, height: boardH, flexShrink: 0 },
        h(Box, { paddingX: 1, ...cx("grow", "column", "frame", "border-dim", dim && "border-dimmed") },
            ...(cards.length > 0 ? cards : [ h(Text, { key: "empty", ...cx("dim", dim && "dimmed") }, empty) ]),

            /*  the centered indicator of the hidden agent cards, pushed to the bottom by a growing spacer  */
            ...(above > 0 || below > 0 ? [ h(Box, { key: "spacer", flexGrow: 1 }),
                h(Box, { key: "more", justifyContent: "center" },
                    h(Text, cx("dim", dim && "dimmed"),
                        [ ...(above > 0 ? [ `△ ${above}` ] : []), ...(below > 0 ? [ `▽ ${below}` ] : []) ].join(" "))) ] : [])),
        title("Agents"))

    /*  the detail view, with a vertical scroll bar directly at its right border (like the read dialog)  */
    const lines  = logLines.slice(logFirst, logFirst + logH)
    const thumbH = Math.max(1, Math.round(logH * Math.min(1, logH / Math.max(1, logLines.length))))
    const thumbY = logMax === 0 ? 0 : Math.round((logH - thumbH) * logFirst / logMax)
    const field  = (name: string, value: string, width: number, wrap: "truncate" | "truncate-start" = "truncate") =>
        h(Box, { key: name },
            h(Box, { flexShrink: 0 },
                h(Text, cx("accent", dim && "dimmed"), name.padEnd(width))),
            h(Box, { flexGrow: 1, flexShrink: 1 },
                h(Text, { ...cx("accent", "bold", dim && "dimmed"), wrap }, value)))
    const pane   = (key: string, text: string, fields: () => ReturnType<typeof field>[], first = false, accent = false) =>
        h(Box, { key, flexGrow: 1, flexBasis: 0, marginLeft: first ? 0 : 1 },
            h(Box, { paddingX: 1, ...cx("grow", "column", "frame", accent ? "border-accent" : "border-dim", dim && "border-dimmed") },
                ...(agent === undefined ? [ h(Text, { key: "none", ...cx("dim", "truncate", dim && "dimmed") }, empty) ] : fields())),
            title(text, accent))
    const op     = h(Box, { key: "op", height: agentOpHeight(agentOp), flexShrink: 0 },
        pane("operation", "Operation", () => [
            h(Text, { key: "title", ...cx("normal", "truncate", dim && "dimmed") },
                h(Text, cx("normal", "badge", dim && "dimmed"), ` ⚉ ${agentOp.name} `), " ",
                agentOp.title !== "" ? h(Text, cx("bold"), agentOp.title) :
                    agentOp.desc.length === 0 ? h(Text, cx("dim"), "(no operation title and description)") : ""),
            ...agentOp.desc.map((line, i) => h(Text, { key: `desc-${i}`, ...cx("normal", "truncate", dim && "dimmed") }, line)) ], true))
    const info   = h(Box, { key: "info", height: AGENT_INFO_H, flexShrink: 0 },
        pane("process", "Process", () => [
            field("host:",              clean(agent!.host), 6),
            field("pid:",               String(agent!.pid), 6),
            field("uid:",               clean(agentUser(agent!)), 6),
            field("cwd:",               clean(agent!.cwd ?? "n/a"), 6, "truncate-start") ], true, true),
        pane("accounting", "Accounting", () => [
            field("uptime:",            agentUptime(agent!), 18),
            field("heartbeat:",         `${agentDuration(now - agent!.beat)} ago`, 18),
            field("usage (total):",     agentUsage(agent!.usage?.total), 18),
            field("usage (last job):",  agentUsage(agent!.usage?.last), 18) ], false, true))
    const log    = h(Box, { key: "log", flexGrow: 1 },
        h(Box, { paddingLeft: 1, ...cx("grow", "column", "frame", "border-dim", dim && "border-dimmed") },
            ...(agent === undefined ? [ h(Text, { key: "none", ...cx("dim", dim && "dimmed") }, empty) ] :
                lines.length === 0 ? [ h(Text, { key: "none", ...cx("dim", dim && "dimmed") }, "(no processing log lines yet)") ] :
                    lines.map((line, i) => h(Box, { key: logFirst + i },
                        h(Box, { flexGrow: 1, flexShrink: 1 },
                            h(Text, cx("truncate", dim && "dimmed"),
                                h(Text, cx("normal", dim && "dimmed"), line.prefix),
                                ...(line.task !== "" ? [ h(Text, cx(line.tone, "badge", dim && "dimmed"), ` ≡ ${line.task} `), " " ] : []),
                                h(Text, cx(line.tone, dim && "dimmed"), line.level),
                                h(Text, cx(line.tone, dim && "dimmed"), line.text))),
                        h(Text, cx("signal", dim && "dimmed"),
                            logLines.length <= logH ? "  " : i >= thumbY && i < thumbY + thumbH ? " █" : " ░"))))),
        title("Recent Log Entries"),
        ...(agent !== undefined ? [ h(Box, { key: "pos", position: "absolute", bottom: 0, right: 2 },
            h(Text, cx("dim", dim && "dimmed"), logLines.length <= logH ? `[ ${logLines.length} lines ]` :
                `[ lines ${logFirst + 1}–${logFirst + lines.length} of ${logLines.length} · ${logFirst >= logMax ? "following" : "scrolled"} ]`)) ] : []))
    const detail = h(Box, { key: "detail", flexGrow: 1, height: boardH, marginLeft: 1, flexDirection: "column" }, op, info, log)
    return [
        h(Box, { key: "agents", height: boardH, paddingX: 1 }, master, detail),
        h(Box, { key: "info", ...cx("bar") },
            h(Text, cx("hint", "truncate", dim && "dimmed"), keysHint(ctx.surface, agent === undefined ? " " : [
                "agent: ",    h(Text, { key: "agent",  ...cx("bold") }, clean(agentLabel(agent))),
                ...(agentOp.title !== "" ? [
                    " · operation: ", h(Text, { key: "op", ...cx("bold") }, agentOp.title) ] : []) ]))),
        h(Box, { key: "keys1", ...cx("bar") },
            h(Text, cx("hint", dim && "dimmed"),
                "↑/↓/Left-Click: select agent · ⇈/⇊/⇤/⇥: page/top/bottom agent log · Mouse-Wheel: scroll agent log")),
        h(Box, { key: "keys2", ...cx("bar") },
            h(Text, cx("hint", dim && "dimmed"),
                `v/V: ${viewCycleHint("agents", agents !== null)} · M: ${mouse ? "disable" : "enable"} mouse · ?: hide key hints · q: quit`))
    ]
}

/*  the heights of the buttons of the time ranges (with a blank line below them), and of the
    frames "Task Progress" (and "Open Tasks" besides it), "Usage" (and "Effort" besides
    it), and "Top-5 Tasks" (and "Finished Tasks" and "Efficiency" besides it), each
    with an inner blank line at its top and bottom (except for the column charts), of the
    statistics view  */
const RANGES_H   = 2
const PROGRESS_H = 6
const USAGE_H    = 8
const TOP_H      = 10

/*  the compact amounts of the statistics view: a time (in minutes) in minutes below one
    hour, else in hours (for the narrow columns of a column chart in whole hours from ten
    hours on), a number of tokens with a metric suffix, and costs in USD  */
const statsHours  = (minutes: number) => minutes < 60 ? `${Math.round(minutes)}m` : `${(minutes / 60).toFixed(1)}h`
const statsHoursN = (minutes: number) => minutes < 10 * 60 ? statsHours(minutes) : `${Math.round(minutes / 60)}h`
const statsTokens = (n: number) =>
    n < 1000 ? String(n) : n < 1000 * 1000 ? `${(n / 1000).toFixed(1)}k` :
        n < 1000 * 1000 * 1000 ? `${(n / (1000 * 1000)).toFixed(1)}M` : `${(n / (1000 * 1000 * 1000)).toFixed(1)}G`
const statsCost   = (usd: number) => `$${usd.toFixed(2)}`

/*  the compact duration (in minutes) of the statistics view: in minutes below one hour,
    in hours below two days, else in days, resp. "n/a" if unknown  */
const statsDuration = (minutes: number | null) =>
    minutes === null ? "n/a" : minutes < 60 ? `${Math.round(minutes)}m` :
        minutes < 48 * 60 ? `${(minutes / 60).toFixed(1)}h` : `${(minutes / (24 * 60)).toFixed(1)}d`

/*  the forecast of the backlog of the statistics view: the number of unfinished tasks
    and the number of weeks to finish them (resp. "n/a" without any throughput)  */
const statsForecast = (backlog: number, weeks: number | null) =>
    backlog === 0 ? "forecast: no unfinished tasks" :
        `forecast: ${backlog} unfinished ≈ ${weeks !== null ? `${weeks.toFixed(1)} week${weeks === 1 ? "" : "s"}` : "n/a"}`

/*  center a text within a width (cut with an ellipsis if too long), padded by a fill character  */
const center = (text: string, width: number, fill = " "): string => {
    const cut  = text.length <= width ? text : width > 1 ? text.slice(0, width - 1) + "…" : text.slice(0, width)
    const left = Math.floor((width - cut.length) / 2)
    return fill.repeat(left) + cut + fill.repeat(width - cut.length - left)
}

/*  split a number of cells onto parts by their amounts (by the largest remainder method)  */
const splitCells = (cells: number, amounts: number[]): number[] => {
    const sum = amounts.reduce((n, a) => n + a, 0)
    if (sum <= 0)
        return amounts.map(() => 0)
    const exact = amounts.map((a) => cells * a / sum)
    const parts = exact.map((e) => Math.floor(e))
    const order = exact.map((_e, i) => i).sort((a, b) => (exact[b] - parts[b]) - (exact[a] - parts[a]))
    const rest  = cells - parts.reduce((n, p) => n + p, 0)
    for (let k = 0; k < rest; k++)
        parts[order[k]]++
    return parts
}

/*  a horizontal bar of a width for a value of a maximum, in whole cells (as a partially filled
    cell would leave a gap before the track), on a light shaded track (in the color of the bar)  */
const statsBar = (value: number, max: number, width: number): string => {
    const n = max > 0 ? Math.round(value / max * width) : 0
    return "█".repeat(n).padEnd(width, "░")
}

/*  render the statistics view: the framed column chart "Tasks per State" of the numbers of tasks per
    lifecycle state (labeled by state, its effort, and phase, in the colors of their lanes, with the framed column
    chart "Throughput" of the finished tasks of the last weeks besides it), the framed stacked bar
    "Task Progress" of the cancelled, finished, work-in-progress, and open tasks (with the framed
    stacked bar "Open Tasks" of the ready and blocked open tasks besides it), the framed bars "Usage"
    of the total times, tokens, and costs of the tasks (with the framed column chart "Effort"
    of the numbers of tasks per effort size besides it), and the framed table "Top-5 Tasks" of the
    tasks of the highest usage (with the framed "Finished Tasks" of the usage per finished task and
    the framed "Efficiency" of the AI usage besides it), below the buttons of the time ranges  */
export const renderStats = (ctx: BoardCtx) => {
    const { stats, usage, range, rangeRef, columns, boardH, dim, mouse, filter, agents } = ctx
    const innerW = Math.max(20, columns - 6)

    /*  the widths of the frames of the rows with two frames (the left one taking two thirds,
        less the columns the right one is grown by), and the inner widths of these frames
        (without their borders and paddings)  */
    const rightW = Math.max(16, Math.floor((innerW + 4) / 3))
    const leftW  = Math.max(16, innerW + 4 - rightW - 1)
    const pair   = (key: string, height: number, left: React.ReactNode, right: React.ReactNode, grow = 0) =>
        h(Box, { key, height, flexShrink: 0 },
            h(Box, { width: leftW - grow, flexShrink: 0, flexDirection: "column" }, left),
            h(Box, { width: 1, flexShrink: 0 }),
            h(Box, { width: rightW + grow, flexShrink: 0, flexDirection: "column" }, right))

    /*  the number of columns the frames "Finished Tasks" and "Efficiency" are each grown by
        (at the expense of the frame "Top-5 Tasks")  */
    const avgGrow = 4
    const tint   = (tone: string) => tone === "active" ? palette.accent : tone === "done" ? palette.dim : palette.normal
    const frameOf = (accent: boolean) => (key: string, height: number, title: string, padY: number, ...content: React.ReactNode[]) =>
        h(Box, { key, height, flexShrink: 0 },
            h(Box, { paddingX: 1, paddingY: padY, ...cx("grow", "column", "frame", accent ? "border-accent" : "border-dim", dim && "border-dimmed") }, ...content),
            h(Box, { position: "absolute", top: 0, left: 0, width: "100%", justifyContent: "center" },
                h(Text, { ...cx(accent ? "accent" : "dim", dim && "dimmed"), wrap: "truncate" }, "[ ", h(Text, cx("bold"), title), " ]")))
    const frame       = frameOf(false)
    const accentFrame = frameOf(true)
    if (stats === null)
        return [ h(Box, { key: "stats", height: boardH }), h(Text, { key: "info" }, " "), h(Text, { key: "keys1" }, " "), h(Text, { key: "keys2" }, " ") ]

    /*  a framed column chart of an inner width, where the highest column leaves the top row
        for its number, each number sits on top of its column (being at least a thin line,
        even without any number, like in the web board), the columns stand on a blank line above
        their labels (each cut to its first five characters, without an ellipsis, for
        readability) and their sub-labels below them (like the effort of a state, cut with
        an ellipsis, and blank if empty, to keep the columns of all charts aligned), and each
        group of columns is labeled below its line spanning its columns
        (like in the web board), followed by a footer line (blank if empty, to keep the columns
        of all charts aligned), where the columns start directly at the left padding of the
        frame, are separated by a gap of one column, and leave the remaining width on the right,
        and where a compact chart of a height omits the blank line, the sub-labels, and the groups  */
    const chartH   = Math.max(9, boardH - RANGES_H - PROGRESS_H - USAGE_H - TOP_H)
    const colChart = (key: string, title: string, width: number,
        cols: { label: string, count: number, tone: string, sub?: string }[], groups: { label: string, n: number }[], footer = "",
        height = chartH, compact = false) => {
        const areaH  = Math.max(1, height - (compact ? 4 : 8))
        const colW   = Math.max(2, Math.floor((width + 1) / cols.length))
        const lineW  = colW - 1
        const fitW   = Math.max(1, Math.min(14, lineW))
        const barW   = fitW > 1 && (lineW - fitW) % 2 !== 0 ? fitW - 1 : fitW
        const barL   = Math.floor((lineW - barW) / 2)
        const max    = Math.max(1, ...cols.map((c) => c.count))
        const gapOf  = (i: number, n: number) => i < n - 1 ? " " : ""
        const column = (k: number, tone: string, text: string) =>
            h(Text, { key: k, color: tint(tone), dimColor: dim },
                " ".repeat(barL) + text + " ".repeat(Math.max(0, lineW - barW - barL)) + gapOf(k, cols.length))
        const rows   = Array.from({ length: areaH }, (_x, r) => {
            const level = areaH - 1 - r
            return h(Box, { key: `row${r}` }, h(Text, { wrap: "truncate" }, ...cols.map((c, i) => {
                const fill = Math.max(1, Math.round(c.count / max * (areaH - 1) * 8))
                const cell = Math.max(0, Math.min(8, fill - level * 8))
                const text = String(c.count)
                if (cell === 0 && level === Math.ceil(fill / 8) && text.length > barW)
                    return h(Text, { key: i, color: tint(c.tone), dimColor: dim }, center(text, lineW) + gapOf(i, cols.length))
                return column(i, c.tone, cell > 0 ? lowerEighths[cell].repeat(barW) :
                    level === Math.ceil(fill / 8) ? center(text, barW) : " ".repeat(barW))
            })))
        })
        const labels = h(Box, { key: "labels" }, h(Text, { wrap: "truncate" }, ...cols.map((c, i) =>
            h(Text, { key: i, color: tint(c.tone), dimColor: dim, bold: true },
                center(c.label.slice(0, Math.min(5, lineW)), lineW) + gapOf(i, cols.length)))))
        const foot   = h(Box, { key: "footer" }, h(Text, { ...cx("dim", dim && "dimmed"), wrap: "truncate" },
            center(footer, Math.max(0, cols.length * colW - 1))))
        if (compact)
            return frame(key, height, title, 0, ...rows, labels, foot)
        return frame(key, height, title, 0, ...rows,
            h(Box, { key: "base" }, h(Text, { wrap: "truncate" }, " ")),
            labels,
            h(Box, { key: "subs" }, h(Text, { wrap: "truncate" }, ...cols.map((c, i) =>
                h(Text, { key: i, color: tint(c.tone), dimColor: dim },
                    center(c.sub ?? "", lineW) + gapOf(i, cols.length))))),
            h(Box, { key: "groups" }, h(Text, { ...cx("dim", dim && "dimmed"), wrap: "truncate" }, groups.map((g, i) =>
                "─".repeat(Math.max(0, g.n * colW - 1)) + gapOf(i, groups.length)).join(""))),
            h(Box, { key: "group-labels" }, h(Text, { ...cx("dim", dim && "dimmed"), wrap: "truncate" }, groups.map((g, i) =>
                center(g.label, g.n * colW - 1) + gapOf(i, groups.length)).join(""))),
            foot)
    }

    /*  the column chart of the number of tasks per state (labeled by the states and below by the
        effort of their estimated tasks, grouped by their phases, and with the total number of tasks
        as its footer), with the column chart of the throughput of the last weeks besides it (labeled by
        their week numbers, prefixed with "W" if fitting, and grouped by all weeks with the total
        and average number of finished tasks, and with the forecast of the backlog as its footer),
        grown like the frames "Finished Tasks" and "Efficiency" together, to align with them  */
    const phases  = stats.states.reduce((list, s) => {
        const last = list.at(-1)
        if (last !== undefined && last.label === s.phase)
            last.n++
        else
            list.push({ label: s.phase, n: 1 })
        return list
    }, [] as { label: string, n: number }[])
    const weeksW  = rightW + 2 * avgGrow - 4
    const weekW   = Math.max(2, Math.floor(weeksW / Math.max(1, stats.throughput.length))) - 1
    const weekSum = stats.throughput.reduce((n, w) => n + w.count, 0)
    const weekAvg = stats.throughput.length > 0 ? weekSum / stats.throughput.length : 0
    const chart   = pair("charts", chartH,
        colChart("chart", "Tasks per State", leftW - 2 * avgGrow - 4,
            stats.states.map((s) => ({
                label: s.status, count: s.count, tone: s.tone,
                sub:   s.effort.estimated > 0 ? statsHoursN(s.effort.minutes) : ""
            })), phases,
            `total tasks: ${stats.states.reduce((n, s) => n + s.count, 0)}`),
        colChart("throughput", "Throughput", weeksW,
            stats.throughput.map((w) => ({ label: weekW >= 3 ? `W${w.week}` : String(w.week), count: w.count, tone: "idle" })),
            [ { label: `${weekSum} finished · ⌀ ${weekAvg.toFixed(1)}/week`, n: stats.throughput.length } ],
            statsForecast(stats.forecast.backlog, stats.forecast.weeks)),
        2 * avgGrow)

    /*  a framed stacked bar of the numbers of tasks of parts, with its legend  */
    const stacked = (key: string, title: string, width: number,
        parts: { label: string, count: number, glyph: string, color: string | undefined }[]) => {
        const total = parts.reduce((n, p) => n + p.count, 0)
        const cells = splitCells(width, parts.map((p) => p.count))
        const pct   = (count: number) => `${total > 0 ? Math.round(count / total * 100) : 0}%`
        return frame(key, PROGRESS_H, title, 1,
            h(Text, { key: "bar", wrap: "truncate" }, ...(total === 0 ? [ h(Text, { key: "none", ...cx("dim", dim && "dimmed") }, "░".repeat(width)) ] :
                parts.map((p, i) => h(Text, { key: i, color: p.color, dimColor: dim }, p.glyph.repeat(cells[i]))))),
            h(Box, { key: "legend", justifyContent: "center" },
                h(Text, cx("normal", "truncate", dim && "dimmed"), ...parts.flatMap((p, i) => [
                    i > 0 ? " · " : "", h(Text, { key: `g${i}`, color: p.color, dimColor: dim }, p.glyph), ` ${p.label}: `,
                    h(Text, { key: `n${i}`, ...cx("bold") }, String(p.count)), ` (${pct(p.count)})` ]))))
    }

    /*  the stacked bars of the progress of the tasks and of the readiness of the open tasks
        (grown like the frames "Finished Tasks" and "Efficiency" together, to align with them)  */
    const { finished, cancelled, wip, open } = stats.progress
    const progress = pair("progress", PROGRESS_H,
        stacked("progress", "Task Progress", leftW - 2 * avgGrow - 4, [
            { label: "cancelled",        count: cancelled, glyph: "▒", color: palette.dim },
            { label: "finished",         count: finished,  glyph: "█", color: palette.normal },
            { label: "wip",              count: wip,       glyph: "█", color: palette.accent },
            { label: "open",             count: open,      glyph: "░", color: palette.normal }
        ]),
        stacked("readiness", "Open Tasks", rightW + 2 * avgGrow - 4, [
            { label: "ready",            count: stats.readiness.ready,   glyph: "░", color: palette.normal },
            { label: "blocked",          count: stats.readiness.blocked, glyph: "▒", color: palette.signal }
        ]), 2 * avgGrow)

    /*  the bars of the total usage by times, tokens (stacked by their kinds),
        and costs (columns), with the bars of a column scaled to its maximum, where each
        column ends with a gap (which the last column lets run out at the frame), within
        the frame on the left (grown like the frames "Finished Tasks" and "Efficiency"
        together, to align with them), where the token column is widened (at the expense of
        the time and cost columns) as far as needed to fit the two-column legend of the token
        kinds below its bar, which is indented like the bar as far as the column keeps its gap,
        and where the values of a column are as wide as its widest one, so the bars take all
        the remaining width of the column and the columns are separated by a gap of two spaces  */
    const u       = stats.usage
    const nameW   = 5
    const gapW    = 2
    const tokens  = u.cread + u.cwrite + u.input + u.output
    const share   = (n: number) => `${tokens > 0 ? Math.round(n / tokens * 100) : 0}%`
    const kind    = (name: string, n: number) => ` ${name} (${share(n)})`
    const leftL   = Math.max(kind("cread", u.cread).length, kind("cwrite", u.cwrite).length) + 1
    const rightL  = Math.max(kind("input", u.input).length, kind("output", u.output).length)
    const timeV   = Math.max(...[ u.timeAI, u.timeHR, u.timeReal ].map((m) => statsHours(m).length))
    const tokenV  = statsTokens(tokens).length
    const costV   = Math.max(...[ u.costAI, u.costHR ].map((usd) => statsCost(usd).length))
    const usageW  = leftW - 2 * avgGrow - 4 + gapW
    const tokenW  = Math.max(Math.floor(usageW / 3), 1 + leftL + 1 + rightL + gapW, nameW + 2 + tokenV + gapW)
    const cellW   = Math.max(nameW + 2 + Math.max(timeV, costV) + gapW, Math.floor((usageW - tokenW) / 2))
    const timeM   = cellW - nameW - 1 - timeV - gapW
    const costM   = cellW - nameW - 1 - costV - gapW
    const stackW  = tokenW - nameW - 1 - tokenV - gapW
    const maxTime = Math.max(u.timeAI, u.timeHR, u.timeReal)
    const maxCost = Math.max(u.costAI, u.costHR)
    const cell    = (key: string, name: string, color: string | undefined, meter: string, value: string, valW: number, last = false) => [
        name.padEnd(nameW), h(Text, { key, color, dimColor: dim }, meter), " ", last ? value : value.padEnd(valW + gapW) ]
    const split   = splitCells(tokens > 0 ? stackW : 0, [ u.cread, u.cwrite, u.input, u.output ])
    const stack   = [ "░", "▒", "▓", "█" ].map((glyph, i) => glyph.repeat(split[i])).join("")
    const time    = (name: string, color: string | undefined, minutes: number) =>
        cell(`time-${name}`, name, color, statsBar(minutes, maxTime, timeM), statsHours(minutes), timeV)
    const cost    = (name: string, color: string | undefined, usd: number) =>
        cell(`cost-${name}`, name, color, statsBar(usd, maxCost, costM), statsCost(usd), costV, true)
    const indent  = Math.max(0, Math.min(nameW, tokenW - gapW - (1 + leftL + 1 + rightL)))
    const legend  = (key: string, left: [ string, string, number ], right: [ string, string, number ]) => [
        " ".repeat(indent), h(Text, { key: `${key}-l`, color: palette.accent, dimColor: dim }, left[0]),
        kind(left[1], left[2]).padEnd(leftL),
        h(Text, { key: `${key}-r`, color: palette.accent, dimColor: dim }, right[0]),
        kind(right[1], right[2]).padEnd(Math.max(0, tokenW - indent - 1 - leftL - 1)) ]
    const lines   = [
        [ ...time("AI", palette.accent, u.timeAI), ...cell("token", "AI", palette.accent, stack.padEnd(stackW), statsTokens(tokens), tokenV),
            ...cost("AI", palette.accent, u.costAI) ],
        [ ...time("HR", palette.accent, u.timeHR), ...legend("legend1", [ "░", "cread", u.cread ], [ "▓", "input", u.input ]),
            ...cost("HR", palette.accent, u.costHR) ],
        [ ...time("real", palette.dim, u.timeReal), ...legend("legend2", [ "▒", "cwrite", u.cwrite ], [ "█", "output", u.output ]) ]
    ].map((segs, i) => h(Text, { key: `line${i}`, ...cx("normal", "truncate", dim && "dimmed") }, ...segs))
    const head    = h(Text, { key: "head", ...cx("normal", "bold", "truncate", dim && "dimmed") },
        "Time:".padEnd(cellW) + "Token:".padEnd(tokenW) + "Cost:")
    const matrix  = frame("usage", USAGE_H, "Usage", 1, ...(usage === null ?
        [ h(Text, { key: "loading", ...cx("dim", dim && "dimmed") }, "loading …") ] : [ head, ...lines ]))

    /*  the compact column chart of the distribution of the effort sizes (the numbers of the
        estimated tasks per size, from the smallest to the largest size), with the numbers of
        the estimated and of all tasks as its footer, besides the bars of the total usage  */
    const effort  = stats.states.reduce((sum, s) =>
        ({ estimated: sum.estimated + s.effort.estimated, tasks: sum.tasks + s.effort.tasks }), { estimated: 0, tasks: 0 })
    const usages  = pair("usage", USAGE_H, matrix,
        colChart("sizes", "Effort", rightW + 2 * avgGrow - 4,
            stats.sizes.map((s) => ({ label: s.size, count: s.count, tone: "idle" })), [],
            `estimated: ${effort.estimated} of ${effort.tasks} tasks`, USAGE_H, true),
        2 * avgGrow)

    /*  the table of the tasks of the highest usage: the id (inverse behind "≡", in the color of
        its lane), the title (cut with an ellipsis), a bar of its share of the total costs (resp.
        tokens), the costs, and the input and output tokens (as "<input> ▷ <output>", with
        the "▷" vertically aligned), with two columns of spacing between the columns  */
    const topW    = leftW - 2 * avgGrow - 4
    const fit     = (text: string, width: number) => text.length <= width ? text.padEnd(width) : text.slice(0, Math.max(0, width - 1)) + "…"
    const idW     = Math.min(28, Math.max(7, ...stats.top.map((t) => t.id.length + 4)))
    const pctW    = Math.max(11, Math.min(16, Math.floor(topW / 8)))
    const costW   = 7
    const inW     = Math.max(0, ...stats.top.map((t) => statsTokens(t.input).length))
    const outW    = Math.max(0, ...stats.top.map((t) => statsTokens(t.output).length))
    const tokW    = Math.max(5, inW + 3 + outW)
    const gap     = "  "
    const titleW  = Math.max(0, topW - idW - pctW - costW - tokW - 4 * gap.length)
    const topHead = h(Text, { key: "head", ...cx("normal", "bold", "truncate", dim && "dimmed") },
        [ "Task Id".padEnd(idW), "Task Title".padEnd(titleW), "Total Share".padEnd(pctW),
            "Cost".padStart(costW), "Token".padEnd(tokW) ].join(gap))
    const topList = usage === null ? [ h(Text, { key: "loading", ...cx("dim", dim && "dimmed") }, "loading …") ] :
        stats.top.length === 0 ? [ h(Text, { key: "none", ...cx("dim", dim && "dimmed") }, "no usage") ] :
            [ topHead, ...stats.top.map((t, i) => {
                const id = fit(t.id, idW - 4).trimEnd()
                return h(Text, { key: `top${i}`, ...cx("normal", "truncate", dim && "dimmed") },
                    h(Text, { key: "id", color: tint(t.tone), dimColor: dim, ...cx("badge") }, ` ≡ ${id} `),
                    " ".repeat(idW - id.length - 4) + gap + fit(clean(t.title), titleW) + gap,
                    h(Text, { key: "bar", color: palette.accent, dimColor: dim }, statsBar(t.share, 1, pctW)),
                    gap + statsCost(t.cost).padStart(costW) + gap +
                    `${statsTokens(t.input).padStart(inW)} ▷ ${statsTokens(t.output).padStart(outW)}`.padStart(tokW))
            }) ]

    /*  the averages and lead times of the finished tasks and the efficiency of the AI usage (the
        AI/HR time and cost ratios and the AI cache hit ratio), side by side, in accent color (like the
        active lanes), each as lines of labels with their values right-aligned (where a too long
        label is cut with an ellipsis)  */
    const avgW    = Math.floor((rightW - 1) / 2) + avgGrow
    const effW    = rightW + 2 * avgGrow - 1 - avgW
    const eff     = stats.efficiency
    const ratio   = (r: number | null) => r !== null ? `${r.toFixed(1)}×` : "n/a"
    const percent = (r: number | null) => r !== null ? `${Math.round(r * 100)}%` : "n/a"
    const valLine = (key: string, width: number, label: string, value: string) =>
        h(Text, { key, ...cx("accent", "truncate", dim && "dimmed") },
            fit(label, Math.max(0, width - 4 - value.length)), h(Text, { key: "v", ...cx("bold") }, value))
    const loading = [ h(Text, { key: "loading", ...cx("dim", dim && "dimmed") }, "loading …") ]
    const avgList = usage === null ? loading : [
        valLine("cost-ai", avgW, "AI cost (⌀)",  statsCost(eff.costAI)),
        valLine("cost-hr", avgW, "HR cost (⌀)",  statsCost(eff.costHR)),
        valLine("tokens",  avgW, "AI token (⌀)", `${statsTokens(eff.input)} ▷ ${statsTokens(eff.output)}`),
        valLine("lead-median", avgW, "lead (median)", statsDuration(eff.leadMedian)),
        valLine("lead-p85",    avgW, "lead (p85)",    statsDuration(eff.leadP85))
    ]
    const effList = usage === null ? loading : [
        valLine("time-ratio", effW, "AI/HR time ratio", ratio(eff.timeRatio)),
        valLine("cost-ratio", effW, "AI/HR cost ratio", ratio(eff.costRatio)),
        valLine("cache-ratio", effW, "AI cache hit ratio", percent(eff.cacheRatio))
    ]
    const tops    = pair("top", TOP_H, frame("top", TOP_H, "Top-5 Tasks", 1, ...topList),
        h(Box, { height: TOP_H },
            h(Box, { width: avgW, flexShrink: 0, flexDirection: "column" }, accentFrame("averages", TOP_H, "Finished Tasks", 1, ...avgList)),
            h(Box, { width: 1, flexShrink: 0 }),
            h(Box, { width: effW, flexShrink: 0, flexDirection: "column" }, accentFrame("efficiency", TOP_H, "Efficiency", 1, ...effList))),
        2 * avgGrow)

    /*  the buttons of the time ranges, separated by dots, with the one of the shown time range
        highlighted, and the one of the time range "total" with its number of days  */
    const ranges  = h(Box, { key: "ranges", height: RANGES_H, flexShrink: 0, justifyContent: "center" },
        ...statsRanges.flatMap((r, i) => [
            ...(i > 0 ? [ h(Text, { key: `sep${i}`, ...cx("dim", dim && "dimmed") }, " · ") ] : []),
            h(Box, { key: r, ref: rangeRef(r) },
                h(Text, cx("button", r === range && "button-active", dim && "dimmed"), ` ${statsRangeLabel(r, stats.days)} `)) ]))
    const shown   = stats.states.reduce((n, s) => n + s.count, 0)
    return [
        h(Box, { key: "stats", height: boardH, paddingX: 1, flexDirection: "column", overflow: "hidden" }, ranges, chart, progress, usages, tops),
        h(Box, { key: "info", ...cx("bar") },
            h(Text, cx("hint", dim && "dimmed"), keysHint(ctx.surface, [ "statistics of ", h(Text, { key: "n", ...cx("bold") }, String(shown)),
                ` ${filter !== "" ? "filtered " : ""}tasks`, ...(range !== "total" ? [ " ", h(Text, { key: "r", ...cx("bold") }, statsRangeLabels[range]) ] : []) ]))),
        h(Box, { key: "keys1", ...cx("bar") },
            h(Text, cx("hint", dim && "dimmed"), `←/→: select time range · /: filter tasks · v/V: ${viewCycleHint("stats", agents !== null)}`)),
        h(Box, { key: "keys2", ...cx("bar") },
            h(Text, cx("hint", dim && "dimmed"),
                `M: ${mouse ? "disable" : "enable"} mouse · ?: hide key hints · q: quit`))
    ]
}

