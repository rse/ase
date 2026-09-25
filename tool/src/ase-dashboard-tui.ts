/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import path                                   from "node:path"

import React                                  from "react"
import { render, Box, Text, useApp, useInput, useWindowSize } from "ink"
import type { BoxProps }                      from "ink"

import type Log                               from "./ase-log.js"
import { Task }                               from "./ase-task.js"
import {
    buildBoard, splitHeight, watchTasks, DashboardState
}                                             from "./ase-dashboard-core.js"
import type { Board, Card, GroupSpec, LaneSpec, Surface } from "./ase-dashboard-core.js"
import { layoutGraph, drawGraphText }         from "./ase-dashboard-graph.js"
import type { GraphLayout }                   from "./ase-dashboard-graph.js"

/*  shorthand for creating React elements without JSX  */
const h = React.createElement

/*  layout constants: minimum group width, collapsed group width, gap  */
const GROUP_MIN  = 26
const GROUP_COLL = 5
const GROUP_GAP  = 1

/*  the dashed border of the "CANCELLED" lane  */
const dashed: BoxProps["borderStyle"] = {
    topLeft: "╭", top: "┄", topRight: "╮", right: "┆",
    bottomRight: "╯", bottom: "┄", bottomLeft: "╰", left: "┆"
}

/*  the selection: group, lane, and card id ("" for a lane without card focus)  */
type Sel = { g: number, l: number, id: string }

/*  the navigable items of a group: one per card, or one per lane
    which is minimized or empty  */
const groupItems = (board: Board, g: number, surface: Surface): Sel[] => {
    const out = [] as Sel[]
    board.groups[g].lanes.forEach((lane, l) => {
        const cards = board.lanes.get(lane.status) ?? []
        if (surface.minimized.includes(lane.status) || cards.length === 0)
            out.push({ g, l, id: "" })
        else
            cards.forEach((c) => out.push({ g, l, id: c.id }))
    })
    return out
}

/*  re-locate a selection on a (possibly changed) board: a selected card
    is followed into its current lane, otherwise the lane is kept  */
const relocate = (board: Board, sel: Sel, surface: Surface): Sel => {
    if (sel.id !== "") {
        const card = board.cards.get(sel.id)
        if (card !== undefined)
            for (let g = 0; g < board.groups.length; g++) {
                const l = board.groups[g].lanes.findIndex((lane) => lane.status === card.status)
                if (l >= 0)
                    return surface.minimized.includes(card.status) ? { g, l, id: "" } : { g, l, id: card.id }
            }
    }
    const g     = Math.min(sel.g, board.groups.length - 1)
    const items = groupItems(board, g, surface)
    return items.find((it) => it.l === sel.l) ?? items[0]
}

/*  compute the visible group range starting at a first group, with the
    width of each visible group (collapsed groups stay narrow, expanded
    groups share the remaining width but never drop below the minimum)  */
const fitGroups = (groups: GroupSpec[], collapsed: string[], first: number, width: number) => {
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

/*  wrap a text line to a width, keeping its leading indentation  */
const wrap = (line: string, width: number): string[] => {
    if (line.length <= width)
        return [ line ]
    const indent = /^\s*(?:[-*]\s+(?:\[.\]\s+)?)?/.exec(line)![0].length
    const pad    = " ".repeat(Math.min(indent, Math.floor(width / 2)))
    const out    = [] as string[]
    let   rest   = line
    while (rest.length > width) {
        let cut = rest.lastIndexOf(" ", width)
        if (cut <= pad.length)
            cut = width
        out.push(rest.slice(0, cut))
        rest = pad + rest.slice(cut).trimStart()
    }
    out.push(rest)
    return out
}

/*  the color of a plan line in the read dialog  */
const lineColor = (line: string): string | undefined => {
    if (/^\s*-\s+\[x\]/.test(line))
        return "green"
    if (/^\s*-\s+\[\/\]/.test(line))
        return "yellow"
    if (/^\s*-\s+\[\?\]/.test(line))
        return "magenta"
    return undefined
}

/*  the lines of a task plan for the read dialog, fetched exclusively
    through the task interface  */
const planLines = (log: Log, id: string, width: number): { text: string, color?: string, bold?: boolean }[] => {
    const parts = Task.parts(log, id)
    if (parts === null)
        return [ { text: `task "${id}" no longer exists`, color: "red" } ]
    const out = [] as { text: string, color?: string, bold?: boolean }[]
    for (const [ key, val ] of parts.keys)
        if (key !== "Type")
            out.push({ text: `${(key + ":").padEnd(10)}${val}`, color: "gray" })
    out.push({ text: "─".repeat(width), color: "gray" })
    for (const line of parts.body.replace(/^\s*\n/, "").split(/\r?\n/)) {
        const bold  = /^#/.test(line)
        const color = lineColor(line)
        for (const part of wrap(line.replace(/^#+\s*/, "").replace(/\*\*(.+?)\*\*/g, "$1"), width))
            out.push({ text: part, color, bold })
    }
    return out
}

/*  the root component of the terminal dashboard  */
const App = ({ log, graph }: { log: Log, graph: boolean }) => {
    const { exit }         = useApp()
    const { columns, rows } = useWindowSize()
    const [ board,   setBoard   ] = React.useState<Board>(() => buildBoard(log))
    const [ surface, setSurface ] = React.useState<Surface>(() => DashboardState.load().cli)
    const [ view,    setView    ] = React.useState<"lanes" | "graph">(graph ? "graph" : "lanes")
    const [ sel,     setSel     ] = React.useState<Sel>(() => relocate(board, { g: 0, l: 0, id: "" }, surface))
    const [ dialog,  setDialog  ] = React.useState<{ id: string, scroll: number } | null>(null)
    const first  = React.useRef(0)
    const scroll = React.useRef({ x: 0, y: 0 })
    const [ layout,  setLayout  ] = React.useState<GraphLayout | null>(null)
    const places = React.useRef(new Map<string, { r: number, c: number, top: number, bottom: number, bl: number, br: number }>())

    /*  follow changes of the task storage and of the lifecycle mode  */
    React.useEffect(() => {
        const refresh = () => {
            setBoard(buildBoard(log))
        }
        const stop  = watchTasks(log, refresh)
        const timer = setInterval(() => {
            if (Task.lifecycle(log).name !== board.mode)
                refresh()
        }, 3000)
        return () => {
            clearInterval(timer)
            stop().catch(() => {})
        }
    }, [ log, board.mode ])

    /*  lay out the dependency graph whenever it is shown and the board changes  */
    React.useEffect(() => {
        if (view !== "graph")
            return
        let live = true
        layoutGraph(board, "cell").then((g) => {
            if (live)
                setLayout(g)
        }).catch((err: unknown) => {
            log.write("warning", `dashboard: graph layout failed: ${err instanceof Error ? err.message : String(err)}`)
        })
        return () => {
            live = false
        }
    }, [ log, board, view ])

    /*  keep the selection valid on every board or surface change  */
    React.useEffect(() => {
        setSel((s) => relocate(board, s, surface))
    }, [ board, surface ])

    const headH  = 2
    const footH  = 3
    const boardH = rows - headH - footH
    const innerW = columns - 2

    /*  determine the visible groups, following the selection  */
    let fit = fitGroups(board.groups, surface.collapsed, Math.min(first.current, board.groups.length - 1), innerW)
    while (sel.g < fit.first)
        fit = fitGroups(board.groups, surface.collapsed, fit.first - 1, innerW)
    while (sel.g > fit.last && fit.first < board.groups.length - 1)
        fit = fitGroups(board.groups, surface.collapsed, fit.first + 1, innerW)
    first.current = fit.first

    /*  the graph navigation order: by level, then by display number  */
    const nodes = [ ...board.cards.values() ].sort((a, b) =>
        board.levels.get(a.id)! - board.levels.get(b.id)! || a.num - b.num)

    /*  handle the keyboard  */
    useInput((input, key) => {
        if (dialog !== null) {
            const page = Math.max(1, rows - 6)
            if (key.escape || key.return)
                setDialog(null)
            else if (key.upArrow)
                setDialog({ ...dialog, scroll: Math.max(0, dialog.scroll - 1) })
            else if (key.downArrow)
                setDialog({ ...dialog, scroll: dialog.scroll + 1 })
            else if (key.pageUp)
                setDialog({ ...dialog, scroll: Math.max(0, dialog.scroll - page) })
            else if (key.pageDown)
                setDialog({ ...dialog, scroll: dialog.scroll + page })
            return
        }
        if (input === "q") {
            exit()
            return
        }
        if (input === "n" || input === "l") {
            setView(view === "lanes" ? "graph" : "lanes")
            return
        }
        if (key.return && sel.id !== "") {
            setDialog({ id: sel.id, scroll: 0 })
            return
        }
        if (view === "graph") {
            /*  move spatially to the nearest node in the direction of the
                arrow, as the nodes are placed on the screen, preferring nodes
                in the same row (left/right) or column (up/down)  */
            if (!(key.leftArrow || key.rightArrow || key.upArrow || key.downArrow))
                return
            const cur = places.current.get(sel.id)
            let   next: Card | undefined = cur === undefined ? nodes[0] : undefined
            if (cur !== undefined) {
                let best = Infinity
                for (const [ id, p ] of places.current) {
                    const dr = p.r - cur.r
                    const dc = p.c - cur.c
                    const ok = key.rightArrow ? dc > 0 : key.leftArrow ? dc < 0 : key.downArrow ? dr > 0 : dr < 0
                    if (id === sel.id || !ok)
                        continue
                    const score = key.leftArrow || key.rightArrow ?
                        Math.abs(dc) + Math.abs(dr) * 4 : Math.abs(dr) + Math.abs(dc) / 4
                    if (score < best) {
                        best = score
                        next = board.cards.get(id)
                    }
                }
            }
            if (next !== undefined)
                setSel(relocate(board, { g: sel.g, l: sel.l, id: next.id }, surface))
            return
        }
        if (input === "m") {
            const lane = board.groups[sel.g].lanes[sel.l]
            setSurface(DashboardState.toggle("cli", "minimized", lane.status).cli)
            return
        }
        if (input === "c") {
            setSurface(DashboardState.toggle("cli", "collapsed", board.groups[sel.g].title).cli)
            return
        }
        if (key.leftArrow || key.rightArrow) {
            const g = Math.max(0, Math.min(board.groups.length - 1, sel.g + (key.leftArrow ? -1 : 1)))
            if (g !== sel.g) {
                const items = groupItems(board, g, surface)
                setSel(items.find((it) => it.l === sel.l) ?? items[0])
            }
            return
        }
        if (key.upArrow || key.downArrow) {
            if (surface.collapsed.includes(board.groups[sel.g].title))
                return
            const items = groupItems(board, sel.g, surface)
            const idx   = items.findIndex((it) => it.l === sel.l && it.id === sel.id)
            const next  = items[Math.max(0, Math.min(items.length - 1, idx + (key.upArrow ? -1 : 1)))]
            if (next !== undefined)
                setSel(next)
        }
    })

    /*  refuse to draw into a too small window  */
    if (columns < 40 || rows < 16)
        return h(Box, { width: columns, height: rows, justifyContent: "center", alignItems: "center" },
            h(Text, { color: "yellow" }, `window too small (${columns}×${rows}) — needs at least 40×16`))

    const dim = dialog !== null

    /*  render one lane  */
    const renderLane = (lane: LaneSpec, g: number, l: number, width: number, height: number) => {
        const cards   = board.lanes.get(lane.status) ?? []
        const color   = lane.active ? "whiteBright" : "gray"
        const min     = surface.minimized.includes(lane.status)
        const focused = sel.g === g && sel.l === l && sel.id === ""
        const style: BoxProps["borderStyle"] = lane.dashed ? dashed : "round"
        const frame   = { key: lane.status, borderStyle: style, borderColor: color, borderDimColor: dim, paddingX: 1 }
        const head    = h(Box, { key: "head", justifyContent: "space-between" },
            h(Text, { color, bold: true, inverse: focused && !dim, dimColor: dim, wrap: "truncate" },
                `${min ? "▸" : "▾"} ${lane.status}`),
            h(Text, { color, dimColor: dim }, String(cards.length)))
        if (min)
            return h(Box, { ...frame, width, height: 3, flexDirection: "column" }, head)
        const room  = height - 3
        let   fitN  = Math.floor(room / 3)
        if (cards.length > fitN)
            fitN = Math.max(0, Math.floor((room - 1) / 3))
        const idx   = cards.findIndex((c) => c.id === sel.id)
        const start = idx >= fitN ? idx - fitN + 1 : 0
        const shown = cards.slice(start, start + fitN)
        const rest  = cards.length - start - shown.length
        const items = shown.map((c) => {
            const on = c.id === sel.id && !dim
            return h(Box, { key: c.id, borderStyle: "single", borderColor: on ? "cyan" : undefined, borderDimColor: dim, height: 3 },
                h(Text, { color: on ? "cyan" : undefined, dimColor: dim, wrap: "truncate" },
                    `${c.num} · ${c.id}${board.cyclic.has(c.id) ? " ⟲" : ""}`))
        })
        if (start > 0 || rest > 0)
            items.push(h(Text, { key: "more", color: "gray", dimColor: dim },
                `${start > 0 ? `▲ ${start} ` : ""}${rest > 0 ? `▼ ${rest} more` : ""}`))
        return h(Box, { ...frame, width, height, flexDirection: "column" }, head, ...items)
    }

    /*  render one group column  */
    const renderGroup = (group: GroupSpec, g: number, width: number, last: boolean) => {
        const gap = last ? 0 : GROUP_GAP
        if (surface.collapsed.includes(group.title)) {
            const total = group.lanes.reduce((n, l) => n + (board.lanes.get(l.status)?.length ?? 0), 0)
            const label = [ ...group.title.replace(/^\d+\s+/, "").toUpperCase(), " ", ...String(total) ]
            return h(Box, { key: group.title, flexDirection: "column", width, marginRight: gap },
                h(Text, { bold: true, inverse: sel.g === g && !dim, dimColor: dim }, "━".repeat(width)),
                h(Box, { borderStyle: "round", borderColor: "gray", borderDimColor: dim, height: boardH - 1, flexDirection: "column", alignItems: "center" },
                    h(Text, { color: "cyan", dimColor: dim }, "▸"),
                    ...label.map((ch, i) => h(Text, { key: i, color: "gray", dimColor: dim }, ch))))
        }
        const min     = group.lanes.map((l) => surface.minimized.includes(l.status))
        const free    = boardH - 1 - min.filter((m) => m).length * 3
        const heights = splitHeight(free, group.lanes.map((l, i) => min[i] ? 0 : l.weight))
        const title   = `━ ${group.title} `
        return h(Box, { key: group.title, flexDirection: "column", width, marginRight: gap },
            h(Text, { bold: true, dimColor: dim, wrap: "truncate" }, title + "━".repeat(Math.max(0, width - title.length))),
            ...group.lanes.map((lane, l) => renderLane(lane, g, l, width, heights[l])))
    }

    /*  render the lane view  */
    const renderLanes = () => {
        const total  = board.groups.length
        const shown  = fit.last - fit.first + 1
        const arrows = shown < total
        const track  = 30
        const on     = Math.max(1, Math.round(track * shown / total))
        const off    = Math.round(track * fit.first / total)
        return [
            h(Box, { key: "board", height: boardH, paddingX: 1 },
                ...board.groups.slice(fit.first, fit.last + 1).map((g, i) => renderGroup(g, fit.first + i, fit.widths[i], i === fit.widths.length - 1))),
            h(Box, { key: "bar", paddingX: 1 },
                h(Text, { color: arrows ? "yellow" : "gray", dimColor: dim }, arrows ? "◂ " : "  "),
                h(Text, { color: arrows ? "cyan" : "gray", dimColor: dim }, "░".repeat(off) + "█".repeat(on)),
                h(Text, { color: "gray", dimColor: dim }, "░".repeat(Math.max(0, track - off - on))),
                h(Text, { color: arrows ? "yellow" : "gray", dimColor: dim },
                    `${arrows ? " ▸" : "  "}  groups ${fit.first + 1}–${fit.last + 1} of ${total} · ` +
                    (arrows ? "←/→ scrolls" : "all visible"))),
            h(Text, { key: "keys", color: "cyan", dimColor: dim, wrap: "truncate" },
                " ←→ group   ↑↓ task/lane   ⏎ read   m minimize lane   c collapse group   n graph   q quit")
        ]
    }

    /*  render the graph view  */
    const renderGraph = () => {
        const card  = sel.id !== "" ? board.cards.get(sel.id) : undefined
        const viewH = boardH - 2
        const viewW = innerW - 4
        if (layout === null)
            return [ h(Box, { key: "graph", height: boardH, marginX: 1, paddingX: 1, borderStyle: "round", borderColor: "gray" },
                h(Text, { color: "gray" }, board.cards.size === 0 ? "(no tasks)" : "laying out …")),
            h(Text, { key: "info" }, " "), h(Text, { key: "keys" }, " ") ]

        /*  draw the ELK layout and remember the box of every node for the
            spatial navigation and the scrolling  */
        const { lines, tones } = drawGraphText(board, layout, sel.id)
        places.current = new Map()
        for (const n of layout.nodes.values())
            places.current.set(n.id, { r: n.y + Math.floor(n.h / 2), c: n.x + Math.floor(n.w / 2), top: n.y, bottom: n.y + n.h - 1, bl: n.x, br: n.x + n.w - 1 })

        /*  scroll the viewport so the box of the selected node stays visible  */
        let   { x, y } = scroll.current
        const box = places.current.get(sel.id)
        if (box !== undefined) {
            if (box.top < y)                   y = box.top
            if (box.bottom > y + viewH - 1)    y = box.bottom - viewH + 1
            if (box.bl < x)                    x = Math.max(0, box.bl - 2)
            if (box.br > x + viewW - 1)        x = box.br - viewW + 3
        }
        scroll.current = { x, y }

        const styles: Record<string, { color?: string, bold?: boolean }> = {
            sel: { color: "cyan", bold: true }, done: { color: "gray" }, active: { color: "whiteBright", bold: true },
            "edge": { color: "gray" }, "edge-sel": { color: "cyan" }
        }
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
        const edges   = [ ...board.pred.values() ].reduce((n, ps) => n + ps.length, 0)
        const roots   = [ ...board.cards.keys() ].filter((id) => (board.pred.get(id) ?? []).length === 0).length
        return [
            h(Box, { key: "graph", height: boardH, flexDirection: "column", marginX: 1, paddingX: 1, borderStyle: "round", borderColor: "gray", borderDimColor: dim },
                ...visible.map((segs, i) => h(Box, { key: i },
                    ...(segs.length === 0 ? [ h(Text, { key: 0 }, " ") ] : segs.map((seg, k) =>
                        h(Text, { key: k, dimColor: dim, ...(styles[seg.tone] ?? {}) }, seg.text)))))),
            h(Text, { key: "info", dimColor: dim, wrap: "truncate" }, card === undefined ? " " :
                ` #${card.num} ${card.id} · ${card.status} · predecessors: ` +
                `${(board.pred.get(card.id) ?? []).map((p) => board.cards.get(p)!.num).join(", ") || "—"} · successors: ` +
                `${(board.succ.get(card.id) ?? []).map((s) => board.cards.get(s)!.num).join(", ") || "—"} (computed)`),
            h(Text, { key: "keys", color: "cyan", dimColor: dim, wrap: "truncate" },
                ` ↑↓←→ move   ⏎ read   l lanes   q quit   · ${board.cards.size} nodes, ` +
                `${edges} edges, ${roots} roots${board.cyclic.size > 0 ? " · CYCLES" : ""}`)
        ]
    }

    /*  render the read dialog: full height, horizontally centered, with a
        vertical scroll bar in its right border  */
    const renderDialog = () => {
        if (dialog === null)
            return null
        const card   = board.cards.get(dialog.id)
        const width  = Math.min(columns - 2, 100)
        const left   = Math.floor((columns - width) / 2)
        const bodyW  = width - 4
        const lines  = planLines(log, dialog.id, bodyW)
        const viewH  = rows - 4
        const maxS   = Math.max(0, lines.length - viewH)
        const s      = Math.min(dialog.scroll, maxS)
        const thumbH = Math.max(1, Math.round(viewH * Math.min(1, viewH / Math.max(1, lines.length))))
        const thumbY = maxS === 0 ? 0 : Math.round((viewH - thumbH) * s / maxS)
        const title  = `TASK ${card !== undefined ? `${card.num} · ` : ""}${dialog.id}` +
            (card !== undefined ? ` · ${card.status}` : "")
        const frame = { position: "absolute", top: 0, left, width, height: rows, borderStyle: "round", borderColor: "cyan" } as const
        return h(Box, { key: "dialog", ...frame, flexDirection: "column", backgroundColor: "black" },
            h(Box, { justifyContent: "space-between", paddingX: 1 },
                h(Text, { color: "cyan", bold: true, wrap: "truncate" }, title),
                h(Text, { color: "cyan" }, "ESC closes")),
            ...Array.from({ length: viewH }, (_, i) => {
                const line = lines[s + i]
                const bar  = lines.length <= viewH ? " " : (i >= thumbY && i < thumbY + thumbH ? "█" : "░")
                return h(Box, { key: i, paddingLeft: 1 },
                    h(Text, { color: line?.color, bold: line?.bold, wrap: "truncate" }, (line?.text ?? "").padEnd(bodyW)),
                    h(Text, { color: "cyan" }, ` ${bar}`))
            }),
            h(Text, { color: "cyan" }, ` ↑↓ / PgUp / PgDn scroll    ⏎/ESC close    lines ${s + 1}–` +
            `${Math.min(lines.length, s + viewH)} of ${lines.length}`))
    }

    /*  render the whole screen  */
    const hint = "change: ase config set project.task.lifecycle <solo|team|enterprise>"
    return h(Box, { width: columns, height: rows, flexDirection: "column" },
        h(Box, { justifyContent: "space-between", paddingX: 1 },
            h(Text, { bold: true, dimColor: dim, wrap: "truncate" },
                `ASE DASHBOARD ─ ${path.basename(Task.projectRoot())} ─ ${board.cards.size} tasks` +
                (view === "graph" ? " ─ GRAPH" : "")),
            h(Text, { color: "cyan", bold: true, dimColor: dim }, `Mode: ${board.mode}`)),
        h(Box, { paddingX: 1 },
            h(Box, { flexGrow: 1, flexShrink: 1, marginRight: 1 },
                h(Text, { color: "yellow", dimColor: dim, wrap: "truncate" },
                    board.warnings.length > 0 ? `⚠ ${board.warnings.join(" · ")}` : " ")),
            h(Box, { flexShrink: 0 },
                h(Text, { color: "gray", dimColor: dim, wrap: "truncate" }, hint))),
        ...(view === "lanes" ? renderLanes() : renderGraph()),
        renderDialog())
}

/*  run the terminal dashboard until the user quits  */
export const runTUI = async (log: Log, graph: boolean): Promise<void> => {
    const app = render(h(App, { log, graph }), { alternateScreen: true, exitOnCtrlC: true, patchConsole: true })
    await app.waitUntilExit()
}
