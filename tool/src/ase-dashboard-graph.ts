/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import type { ElkNode, ElkExtendedEdge } from "elkjs/lib/elk-api.js"

import { toneOf }                        from "./ase-dashboard-core.js"
import type { Board }                    from "./ase-dashboard-core.js"

/*  a laid out node box, a laid out edge, and the whole layout  */
export type GraphBox    = { id: string, x: number, y: number, w: number, h: number }
export type GraphPoint  = { x: number, y: number }
export type GraphEdge   = { from: string, to: string, points: GraphPoint[] }
export type GraphLayout = { width: number, height: number, nodes: Map<string, GraphBox>, edges: GraphEdge[] }

/*  the unit systems a layout is computed in: terminal character cells
    (width in columns, height in rows) or browser pixels  */
const units = {
    cell: { w: (label: string) => label.length + 4, h: 3, nodeNode: 1, layers: 8, edgeEdge: 1, edgeNode: 1 },
    px:   { w: (label: string) => Math.round(label.length * 7.4) + 28, h: 36, nodeNode: 18, layers: 64, edgeEdge: 10, edgeNode: 14 }
}

/*  the label of a node: display number and task id  */
export const nodeLabel = (board: Board, id: string): string =>
    `${board.cards.get(id)!.num} · ${id}`

/*  lay out the dependency graph with ELK Layered: left to right, orthogonal
    edge routing, every edge leaving its source on the east side and entering
    its target on the west side; "elkjs" is loaded on demand only, as it is
    large and needed by the graph view alone  */
export const layoutGraph = async (board: Board, unit: "cell" | "px"): Promise<GraphLayout> => {
    const u    = units[unit]
    const linked = (id: string) => (board.pred.get(id) ?? []).length + (board.succ.get(id) ?? []).length > 0 ? 0 : 1
    const ids  = [ ...board.cards.values() ].sort((a, b) => linked(a.id) - linked(b.id) || a.num - b.num).map((c) => c.id)
    const port = { width: 0, height: 0 }
    const graph: ElkNode = {
        id: "root",
        layoutOptions: {
            "elk.algorithm":                                    "layered",
            "elk.direction":                                    "RIGHT",
            "elk.edgeRouting":                                  "ORTHOGONAL",
            "elk.padding":                                      "[top=0,left=0,bottom=0,right=0]",
            "elk.spacing.nodeNode":                             String(u.nodeNode),
            "elk.spacing.edgeEdge":                             String(u.edgeEdge),
            "elk.spacing.edgeNode":                             String(u.edgeNode),
            "elk.spacing.componentComponent":                   String(u.nodeNode),
            "elk.layered.spacing.nodeNodeBetweenLayers":        String(u.layers),
            "elk.layered.spacing.edgeNodeBetweenLayers":        String(u.edgeNode),
            "elk.layered.spacing.edgeEdgeBetweenLayers":        String(u.edgeEdge),
            "elk.layered.mergeEdges":                           "false",
            "elk.layered.considerModelOrder.components":        "MODEL_ORDER",
            "elk.layered.crossingMinimization.greedySwitch.type": "TWO_SIDED",
            "elk.layered.nodePlacement.strategy":               "NETWORK_SIMPLEX"
        },
        children: ids.map((id) => {
            const w = u.w(nodeLabel(board, id))
            const h = u.h
            return {
                id, width: w, height: h,
                layoutOptions: { "elk.portConstraints": "FIXED_POS" },
                ports: [
                    { id: `${id}:in`,  x: 0, y: Math.floor(h / 2), ...port },
                    { id: `${id}:out`, x: w, y: Math.floor(h / 2), ...port }
                ]
            }
        }),
        edges: ids.flatMap((id) => (board.pred.get(id) ?? []).map((p): ElkExtendedEdge =>
            ({ id: `${p}->${id}`, sources: [ `${p}:out` ], targets: [ `${id}:in` ] })))
    }
    const ELK   = (await import("elkjs/lib/elk.bundled.js")).default.default
    const res   = await new ELK().layout(graph)
    const round = (v: number | undefined) => Math.round(v ?? 0)
    const nodes = new Map<string, GraphBox>()
    for (const n of res.children ?? [])
        nodes.set(n.id, { id: n.id, x: round(n.x), y: round(n.y), w: round(n.width), h: round(n.height) })
    const edges = (res.edges ?? []).map((e) => {
        const [ from, to ] = e.id.split("->")
        const points = (e.sections ?? []).flatMap((s) =>
            [ s.startPoint, ...(s.bendPoints ?? []), s.endPoint ].map((p) => ({ x: round(p.x), y: round(p.y) })))
        return { from, to, points }
    })
    return { width: round(res.width), height: round(res.height), nodes, edges }
}

/*  the box drawing character of a set of line directions  */
const UP    = 1
const DOWN  = 2
const LEFT  = 4
const RIGHT = 8
const junction: Record<number, string> = {
    [LEFT]: "─", [RIGHT]: "─", [LEFT | RIGHT]: "─", [UP]: "│", [DOWN]: "│", [UP | DOWN]: "│",
    [DOWN | RIGHT]: "┌", [DOWN | LEFT]: "┐", [UP | RIGHT]: "└", [UP | LEFT]: "┘",
    [UP | DOWN | RIGHT]: "├", [UP | DOWN | LEFT]: "┤", [LEFT | RIGHT | DOWN]: "┬",
    [LEFT | RIGHT | UP]: "┴", [UP | DOWN | LEFT | RIGHT]: "┼"
}

/*  draw a cell-unit layout onto a character grid, returning per cell the
    character and a tone for coloring: the node tones "done", "active",
    "idle", and "sel" (selected node), and "edge" or "edge-sel" (an edge
    touching the selected node)  */
export const drawGraphText = (board: Board, layout: GraphLayout, selected: string) => {
    const W     = layout.width + 2
    const H     = layout.height + 1
    const mask  = Array.from({ length: H }, () => new Array<number>(W).fill(0))
    const tones = Array.from({ length: H }, () => new Array<string>(W).fill(""))
    const chars = Array.from({ length: H }, () => new Array<string>(W).fill(" "))

    /*  lines of all edges, where edges of the selected node are marked  */
    for (const e of layout.edges) {
        const tone = e.from === selected || e.to === selected ? "edge-sel" : "edge"
        const set  = (x: number, y: number, bits: number) => {
            if (y < 0 || y >= H || x < 0 || x >= W)
                return
            mask[y][x] |= bits
            if (tones[y][x] !== "edge-sel")
                tones[y][x] = tone
        }
        for (let i = 1; i < e.points.length; i++) {
            const a = e.points[i - 1]
            const b = e.points[i]
            if (a.y === b.y) {
                const [ x0, x1 ] = a.x < b.x ? [ a.x, b.x ] : [ b.x, a.x ]
                for (let x = x0; x <= x1; x++)
                    set(x, a.y, (x > x0 ? LEFT : 0) | (x < x1 ? RIGHT : 0))
            }
            else {
                const [ y0, y1 ] = a.y < b.y ? [ a.y, b.y ] : [ b.y, a.y ]
                for (let y = y0; y <= y1; y++)
                    set(a.x, y, (y > y0 ? UP : 0) | (y < y1 ? DOWN : 0))
            }
        }
    }
    for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++)
            if (mask[y][x] !== 0)
                chars[y][x] = junction[mask[y][x]] ?? "┼"

    /*  arrow heads in front of the west side of each target  */
    for (const e of layout.edges) {
        const end = e.points[e.points.length - 1]
        if (end !== undefined && end.x - 1 >= 0 && end.y < H)
            chars[end.y][end.x - 1] = "►"
    }

    /*  node boxes on top  */
    for (const n of layout.nodes.values()) {
        const tone  = n.id === selected ? "sel" : toneOf(board, board.cards.get(n.id)!)
        const label = nodeLabel(board, n.id)
        for (let y = n.y; y < n.y + n.h && y < H; y++)
            for (let x = n.x; x < n.x + n.w && x < W; x++) {
                const top = y === n.y
                const bot = y === n.y + n.h - 1
                const lft = x === n.x
                const rgt = x === n.x + n.w - 1
                chars[y][x] = top ? (lft ? "┌" : rgt ? "┐" : "─") :
                    bot ? (lft ? "└" : rgt ? "┘" : "─") : (lft || rgt ? "│" : " ")
                tones[y][x] = tone
            }
        const row = n.y + Math.floor(n.h / 2)
        for (let i = 0; i < label.length && n.x + 2 + i < W; i++)
            chars[row][n.x + 2 + i] = label[i]
    }
    return { lines: chars.map((r) => r.join("")), tones }
}

/*  escape a text for embedding into SVG  */
const escapeXML = (s: string): string =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

/*  draw a pixel-unit layout as SVG, with every node a "g.node" carrying
    its "data-id" and tone class, for the click delegation of the page  */
export const drawGraphSVG = (board: Board, layout: GraphLayout): string => {
    const pad   = 16
    const out   = [ `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width + 2 * pad}" ` +
        `height="${layout.height + 2 * pad}" viewBox="${-pad} ${-pad} ${layout.width + 2 * pad} ${layout.height + 2 * pad}">`,
    "<defs><marker id=\"arrow\" viewBox=\"0 0 10 10\" refX=\"10\" refY=\"5\" markerWidth=\"7\" markerHeight=\"7\" " +
        "orient=\"auto-start-reverse\"><path d=\"M0,0 L10,5 L0,10 z\" class=\"arrow\"/></marker></defs>" ]
    for (const e of layout.edges) {
        const d = e.points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ")
        out.push(`<path class="edge" data-from="${escapeXML(e.from)}" data-to="${escapeXML(e.to)}" d="${d}" marker-end="url(#arrow)"/>`)
    }
    for (const n of layout.nodes.values()) {
        const card = board.cards.get(n.id)!
        out.push(`<g class="node tone-${toneOf(board, card)}" data-id="n${card.num}">` +
            `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="5"/>` +
            `<text x="${n.x + 14}" y="${n.y + n.h / 2 + 4}">${escapeXML(nodeLabel(board, n.id))}</text></g>`)
    }
    out.push("</svg>")
    return out.join("\n")
}
