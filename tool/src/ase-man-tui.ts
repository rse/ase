/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import React                                  from "react"
import { render, Box, Text, useApp, useInput, useWindowSize } from "ink"
import type { Key, TextProps }                from "ink"

import type Log                               from "./ase-lib-log.js"
import pkg                                    from "../package.json" with { type: "json" }
import { loadCatalog, searchPages, findPage } from "./ase-man-catalog.js"
import type { Catalog, ManPage, ManGroup }    from "./ase-man-catalog.js"
import { renderPage, markMatches, codeLoad }  from "./ase-man-render.js"
import type { Line, Tone, Rendered }          from "./ase-man-render.js"
import { useMouseReports }                    from "./ase-task-board-tui.js"
import { mouseReporting }                     from "./ase-task-board-tui-model.js"
import { h }                                  from "./ase-task-board-tui-view.js"
import { palette, loadPalette, cx }           from "./ase-task-board-tui-style.js"
import { sanitize }                           from "./ase-task-board-tui-popup.js"

/*  layout constants: the screen rows above the content (header, rule, top of
    the panel, the three rows of the search field, and a blank line) and below
    it (bottom of the panel, two key hint lines, rule, and status line), the
    screen columns left of the content (margin, side, and padding of the panel),
    the left and right padding of the rendered page within the detail, the
    minimum width, the maximum count, the gap, and the overload tolerance of
    the catalog columns, and the minimum window size  */
const TOP     = 7
const BOTTOM  = 5
const LEFT    = 3
const PAD     = 2
const COL_MIN = 24
const COL_MAX = 5
const GAP     = 2
const COL_TOL = 1.25
const MIN_W   = 60
const MIN_H   = 20

/*  the text properties of the tones of the rendered manual pages  */
const toneProps = (tone: Tone): TextProps => ({
    text:   { color: palette.normal },
    bold:   { color: palette.normal, bold: true },
    italic: { color: palette.normal, italic: true },
    code:   { color: palette.accent },
    link:   { color: palette.accent, underline: true },
    title:  { color: palette.accent, bold: true },
    head:   { color: palette.accent, bold: true },
    sub:    { color: palette.normal, bold: true },
    dim:    { color: palette.dim },
    bullet: { color: palette.accent },
    cmt:    { color: palette.dim, italic: true },
    str:    { color: palette.accent },
    num:    { color: palette.signal },
    opt:    { color: palette.signal },
    var:    { color: palette.signal },
    key:    { color: palette.accent, bold: true },
    cmd:    { color: palette.normal, bold: true },
    kw:     { color: palette.normal, bold: true },
    punct:  { color: palette.dim }
} satisfies Record<Tone, TextProps>)[tone]

/*  an entry of the catalog grid and of the master: a section heading,
    a group heading, a manual page, or empty  */
type Cell = { kind: "section" | "group", text: string } | { kind: "page", page: ManPage } | null

/*  the catalog grid of the start page: the column count and width, the
    lines of cells, and the positions (column and line) of the pages  */
type Grid = { n: number, colW: number, lines: Cell[][], pos: Map<string, { c: number, l: number }> }

/*  reduce groups to the matching pages of a search (if any), dropping the empty groups  */
const filterGroups = (groups: ManGroup[], hits: Map<string, RegExp> | null): ManGroup[] =>
    hits === null ? groups : groups
        .map((group) => ({ ...group, pages: group.pages.filter((page) => hits.has(page.id)) }))
        .filter((group) => group.pages.length > 0)

/*  lay out the catalog grid onto a width (with 1-5 columns, like the
    catalog of the website), reduced to the matching pages of a search (if any),
    where the groups of each section are distributed in their order onto the
    columns, each filled up to the balanced height, resp., if this overloads a
    column too much, up to the lowest height at which all groups fit  */
const layoutGrid = (catalog: Catalog, hits: Map<string, RegExp> | null, width: number): Grid => {
    const n     = Math.max(1, Math.min(COL_MAX, Math.floor((width + GAP) / (COL_MIN + GAP))))
    const colW  = Math.floor((width - (n - 1) * GAP) / n)
    const lines = [] as Cell[][]
    const empty = (): Cell[] => new Array<Cell>(n).fill(null)
    const section = (title: string, groups: ManGroup[]) => {
        if (groups.length === 0)
            return
        if (lines.length > 0)
            lines.push(empty())
        lines.push([ { kind: "section", text: title }, ...empty().slice(1) ], empty())
        const total  = groups.reduce((sum, group) => sum + group.pages.length + 2, -1)
        const fill   = (target: number) => {
            const cols = Array.from({ length: n }, () => [] as Cell[])
            let c = 0
            for (const group of groups) {
                if (cols[c].length > 0 && cols[c].length + group.pages.length + 2 > target && c < n - 1)
                    c++
                if (cols[c].length > 0)
                    cols[c].push(null)
                cols[c].push({ kind: "group", text: group.label }, ...group.pages.map((page) => ({ kind: "page" as const, page })))
            }
            return cols
        }
        let target = Math.ceil(total / n)
        let cols   = fill(target)
        if (cols.some((col) => col.length > target * COL_TOL))
            while (cols.some((col) => col.length > target))
                cols = fill(++target)
        const height = Math.max(...cols.map((col) => col.length))
        for (let l = 0; l < height; l++)
            lines.push(cols.map((col) => col[l] ?? null))
    }
    section("AI SKILLS", filterGroups(catalog.skills, hits))
    section("CLI COMMANDS", filterGroups(catalog.commands, hits))
    const pos = new Map<string, { c: number, l: number }>()
    lines.forEach((cells, l) => {
        cells.forEach((cell, c) => {
            if (cell !== null && cell.kind === "page")
                pos.set(cell.page.id, { c, l })
        })
    })
    return { n, colW, lines, pos }
}

/*  move the selection within the catalog grid: vertically onto the nearest page
    of the same column (or, at the end of the column, onto the nearest page further
    in this direction of any other column, so the entire grid stays reachable),
    resp. horizontally onto the nearest page of the neighbor column  */
const moveGrid = (grid: Grid, id: string, dc: number, dl: number): string => {
    const cur = grid.pos.get(id)
    if (cur === undefined)
        return id
    let best = id
    let dist = Infinity
    for (const [ other, p ] of grid.pos) {
        let d = Infinity
        if (dl !== 0 && p.c === cur.c && Math.sign(p.l - cur.l) === dl)
            d = Math.abs(p.l - cur.l)
        else if (dc !== 0 && p.c === cur.c + dc)
            d = Math.abs(p.l - cur.l) * 2 + (p.l < cur.l ? 1 : 0)
        if (d < dist) {
            best = other
            dist = d
        }
    }
    if (dist === Infinity && dl !== 0) {
        for (const [ other, p ] of grid.pos) {
            const d = Math.sign(p.l - cur.l) === dl ? Math.abs(p.l - cur.l) * grid.n + Math.abs(p.c - cur.c) : Infinity
            if (d < dist) {
                best = other
                dist = d
            }
        }
    }
    return best
}

/*  the entries of the master: the sections and groups with their pages,
    reduced to the matching pages of a search (if any)  */
const masterItems = (catalog: Catalog, hits: Map<string, RegExp> | null): Cell[] => {
    const items = [] as Cell[]
    for (const [ title, groups ] of [ [ "AI SKILLS", catalog.skills ], [ "CLI COMMANDS", catalog.commands ] ] as const) {
        let head = false
        for (const group of filterGroups(groups, hits)) {
            if (items.length > 0)
                items.push(null)
            if (!head)
                items.push({ kind: "section", text: title }, null)
            head = true
            items.push({ kind: "group", text: group.label }, ...group.pages.map((page) => ({ kind: "page" as const, page })))
        }
    }
    return items
}

/*  keep an index visible within a viewport of a height, by minimally moving its
    offset, where scrolling up reveals the entries from a top index on  */
const follow = (off: number, top: number, idx: number, height: number, total: number): number =>
    Math.max(0, Math.min(Math.max(0, total - height), top < off ? top : idx >= off + height ? idx - height + 1 : off))

/*  the index of the topmost entry to reveal together with an entry of a list:
    the heading of its group (and the heading of its section, if the group is
    the first one of the section), as long as they fit into a viewport of a height  */
const headOf = (list: Cell[], idx: number, height: number): number => {
    let k = idx
    while (k > 0 && list[k - 1] !== null)
        k--
    if (k >= 2 && list[k - 2]?.kind === "section")
        k -= 2
    return idx - k < height ? k : idx
}

/*  render a cell onto a width: the label of a page with its last part
    accented in bold (or, in the same style, inversely in signal color over the
    entire width if selected), resp. a heading  */
const renderCell = (cell: Cell, width: number, selected: boolean) => {
    if (cell === null)
        return h(Text, {}, " ")
    if (cell.kind !== "page")
        return h(Text, { ...(cell.kind === "group" ? cx("accent", "bold") : cx("bold")), wrap: "truncate" }, cell.text)
    const label = cell.page.label.length > width ? cell.page.label.slice(0, width - 1) + "…" : cell.page.label
    const idx   = cell.page.kind === "skill" ? label.lastIndexOf("-") : label.lastIndexOf(" ")
    const base  = selected ? { color: palette.signal, inverse: true } : cx("normal")
    const last  = selected ? { color: palette.signal, bold: true, inverse: true } : cx("accent", "bold")
    return h(Text, { wrap: "truncate" },
        h(Text, base, label.slice(0, idx + 1)),
        h(Text, last, label.slice(idx + 1)),
        ...(selected ? [ h(Text, base, " ".repeat(Math.max(0, width - label.length))) ] : []))
}

/*  render a vertical scroll bar (like the one of the read dialog of the task board)
    over the rows of a viewport of a height (at an offset into a total count of
    lines) below some leading blank rows, shown only if the lines do not fit  */
const scrollBar = (lead: number, height: number, total: number, off: number) => {
    const max    = Math.max(0, total - height)
    const thumbH = Math.max(1, Math.round(height * Math.min(1, height / Math.max(1, total))))
    const thumbY = max === 0 ? 0 : Math.round((height - thumbH) * Math.min(off, max) / max)
    return h(Box, { flexDirection: "column", width: 1 },
        ...Array.from({ length: lead + height }, (_, i) => h(Text, { key: `bar-${i}`, ...cx("signal") },
            i < lead || total <= height ? " " : i - lead >= thumbY && i - lead < thumbY + thumbH ? "█" : "░")))
}

/*  render a line of a page, with its search matches and its selected reference highlighted  */
const renderLine = (line: Line, refSel: number) =>
    h(Text, { wrap: "truncate" }, line.length === 0 ? " " : line.map((span, i) => h(Text, {
        key: i,
        ...toneProps(span.tone),
        ...(span.ref !== undefined ? { underline: true } : {}),
        ...(span.match === true ? { color: palette.signal, inverse: true } : {}),
        ...(span.ref !== undefined && span.ref === refSel ? { color: palette.signal, inverse: true } : {})
    }, sanitize(span.text))))

/*  the initial state of the browser page: the selected page, or the search query  */
type Initial = { id: string | null, query: string }

/*  the root component of the manual page browser, starting on the start page,
    resp. on the browser page with an initially selected page or search  */
const App = ({ catalog, initial }: { catalog: Catalog, initial: Initial | null }) => {
    const { exit } = useApp()
    const { columns, rows } = useWindowSize()
    const first = initial?.id ?? [ ...catalog.pages.keys() ][0] ?? ""

    /*  the state: the shown page (the start page with the catalog, or the
        browser page with master and detail), the search query (with its
        cursor position, and whether it is being typed), the selected page of
        the catalog and of the master, the scroll offset of the detail, the
        selected reference of the detail, and whether the syntax highlighter of
        the code blocks is loaded  */
    const [ page,     setPage     ] = React.useState<"start" | "browse">(initial !== null ? "browse" : "start")
    const [ query,    setQuery    ] = React.useState(initial?.query ?? "")
    const [ cursor,   setCursor   ] = React.useState(initial?.query.length ?? 0)
    const [ typing,   setTyping   ] = React.useState(false)
    const [ startSel, setStartSel ] = React.useState(first)
    const [ sel,      setSel      ] = React.useState(first)
    const [ scroll,   setScroll   ] = React.useState(0)
    const [ ref,      setRef      ] = React.useState(-1)
    const [ coded,    setCoded    ] = React.useState(false)
    const gridOff   = React.useRef(0)
    const masterOff = React.useRef(0)

    /*  the cursor position within the search query, clamped as the query
        can be cleared without moving the cursor  */
    const cur = Math.min(cursor, query.length)

    /*  load the syntax highlighter of the code blocks in the background  */
    React.useEffect(() => {
        codeLoad().then(() => {
            setCoded(true)
        }).catch(() => {
            /*  keep the code blocks without syntax highlighting  */
        })
    }, [])

    /*  report mouse presses while the browser runs  */
    React.useEffect(() => {
        mouseReporting(true)
        return () => {
            mouseReporting(false)
        }
    }, [])

    /*  the geometry: the content width and height (without and with the
        search field and its blank line within the panel), the catalog grid,
        the master width (of its longest label plus its padding, capped at a
        third of the content width), the detail width (besides the adjacent
        borders and paddings of the master and detail panes, where the scroll bar
        of the detail takes the right padding column of its pane), and the
        search field width (on the start page, resp. of the master)  */
    const W    = columns - 2 * LEFT
    const H    = Math.max(1, rows - TOP - BOTTOM)
    const HC   = H + 4
    const MW   = React.useMemo(() => Math.min(Math.floor(W / 3),
        Math.max(16, ...[ ...catalog.pages.values() ].map((p) => p.label.length + 1)) + 2 * PAD), [ catalog, W ])
    const DW   = Math.max(10, W - MW - 4)
    const FW   = page === "start" ? Math.min(44, W) : MW

    /*  the search hits (live while typing), the catalog grid and the master
        entries (both reduced to the matching pages), and the selected page of the
        catalog and of the master, which fall back to the first matching page if
        the selected one does not match the search  */
    const hits    = React.useMemo(() => searchPages(catalog, query), [ catalog, query ])
    const grid    = React.useMemo(() => layoutGrid(catalog, hits, W - 2 * PAD), [ catalog, hits, W ])
    const items   = React.useMemo(() => masterItems(catalog, hits), [ catalog, hits ])
    const pageIds = items.flatMap((item) => item !== null && item.kind === "page" ? [ item.page.id ] : [])
    const startId = hits === null || hits.has(startSel) ? startSel : pageIds[0] ?? startSel
    const selId   = hits === null || hits.has(sel) ? sel : pageIds[0] ?? sel
    const current = hits === null || hits.has(selId) ? catalog.pages.get(selId) : undefined
    React.useEffect(() => {
        if (startId !== startSel)
            setStartSel(startId)
        if (selId !== sel)
            setSel(selId)
    }, [ startId, startSel, selId, sel ])

    /*  the rendered selected page (wrapped within the left and right padding of the detail),
        whose detail starts at its top without any selected reference whenever
        another page is selected  */
    const rendered: Rendered = React.useMemo(() => current !== undefined ?
        renderPage(current.md, DW - 2 * PAD, current.id, (id) => catalog.pages.has(id)) : { lines: [], refs: [] },
    [ catalog, current, DW, coded ])
    React.useEffect(() => {
        setScroll(0)
        setRef(-1)
    }, [ selId ])
    const maxScroll = Math.max(0, rendered.lines.length - H)
    const top       = Math.min(scroll, maxScroll)

    /*  open a page on the browser page, leaving a search not matching it  */
    const open = (id: string) => {
        if (hits !== null && !hits.has(id))
            setQuery("")
        setTyping(false)
        setSel(id)
        setPage("browse")
    }

    /*  step the selection of the master, scroll the detail, and select the
        next/previous reference of the detail, starting at the shown part of
        the detail (and scrolling to the reference if it is not shown)  */
    const selectStep = (step: number) => {
        if (pageIds.length > 0)
            setSel(pageIds[Math.max(0, Math.min(pageIds.length - 1, pageIds.indexOf(selId) + step))])
    }
    const scrollBy = (delta: number) => {
        setScroll(Math.max(0, Math.min(maxScroll, top + delta)))
    }
    const cycleRef = (step: number) => {
        const refs = rendered.refs.map((r, i) => ({ ...r, i })).filter((r) => r.line >= 0)
        if (refs.length === 0)
            return
        const shown = (r: { line: number }) => r.line >= top && r.line < top + H
        const k     = refs.findIndex((r) => r.i === ref)
        const next  = k >= 0 && shown(refs[k]) ? refs[(k + step + refs.length) % refs.length] :
            step > 0 ? refs.find((r) => r.line >= top) ?? refs[0] : refs.findLast((r) => r.line < top + H) ?? refs[refs.length - 1]
        setRef(next.i)
        if (!shown(next))
            setScroll(Math.max(0, Math.min(maxScroll, next.line - Math.floor(H / 3))))
    }

    /*  edit the search query by a typed key at the cursor position (like the input
        boxes of the task board): the left/right arrows move the cursor by one
        character, HOME/END move it to the start/end, BACKSPACE removes the character
        before the cursor, DELETE removes the character at the cursor, and all other
        input is inserted at the cursor  */
    const edit = (input: string, key: Key): boolean => {
        if (key.leftArrow || key.rightArrow) {
            setCursor(Math.max(0, Math.min(query.length, cur + (key.leftArrow ? -1 : 1))))
            return true
        }
        if (key.home || key.end) {
            setCursor(key.home ? 0 : query.length)
            return true
        }
        if (key.backspace) {
            if (cur > 0) {
                setQuery(query.slice(0, cur - 1) + query.slice(cur))
                setCursor(cur - 1)
            }
            return true
        }
        if (key.delete) {
            if (cur < query.length)
                setQuery(query.slice(0, cur) + query.slice(cur + 1))
            return true
        }
        if (input !== "" && !key.ctrl && !key.meta && !key.tab && !key.return && !key.escape) {
            const text = sanitize(input.replace(/[\r\n]+/g, " "))
            setQuery(query.slice(0, cur) + text + query.slice(cur))
            setCursor(cur + text.length)
            return true
        }
        return false
    }

    /*  handle the mouse: a click onto the search field starts typing into it
        (clearing the search on its clear symbol), a click onto a page of the
        catalog or the master opens it, a click onto a reference of the detail
        follows it, and the wheel (64/65: up/down) steps the selection of the
        catalog and the master, resp. scrolls the detail  */
    useMouseReports((btn, mx, my) => {
        const wheel = btn === 64 ? -1 : btn === 65 ? 1 : 0
        if (btn !== 0 && wheel === 0)
            return
        if (btn === 0) {
            const inField = my >= TOP - 4 && my < TOP - 1 && mx < LEFT + FW
            setTyping(inField)
            if (inField && my === TOP - 3 && mx >= LEFT + FW - 4 && mx <= LEFT + FW - 2)
                setQuery("")
            if (inField) {
                setRef(-1)
                return
            }
        }
        if (page === "start") {
            if (wheel !== 0) {
                setStartSel(moveGrid(grid, startId, 0, wheel))
                return
            }
            const gx   = mx - LEFT - PAD
            const c    = Math.floor(gx / (grid.colW + GAP))
            const cell = my >= TOP && my < TOP + H && gx >= 0 && c < grid.n && gx - c * (grid.colW + GAP) < grid.colW ?
                grid.lines[gridOff.current + my - TOP]?.[c] : undefined
            if (cell !== undefined && cell !== null && cell.kind === "page") {
                setStartSel(cell.page.id)
                setSel(cell.page.id)
                setPage("browse")
            }
            return
        }
        const inMaster = mx <= LEFT + MW + 1
        if (wheel !== 0) {
            if (inMaster)
                selectStep(wheel)
            else
                scrollBy(3 * wheel)
            return
        }
        if (my < TOP || my >= TOP + H)
            return
        if (inMaster) {
            const item = items[masterOff.current + my - TOP]
            if (item !== undefined && item !== null && item.kind === "page") {
                setSel(item.page.id)
                setRef(-1)
            }
            return
        }
        const line = rendered.lines[top + my - TOP]
        let x = LEFT + MW + 4 + PAD
        for (const span of line ?? []) {
            if (mx >= x && mx < x + span.text.length) {
                if (span.ref !== undefined)
                    open(rendered.refs[span.ref].id)
                break
            }
            x += span.text.length
        }
    })

    /*  handle the keyboard  */
    useInput((input, key) => {
        /*  ignore key releases and mouse reports (handled by "useMouseReports" above)  */
        if (key.eventType === "release" || /^\[<\d+;\d+;\d+[Mm]$/.test(input))
            return

        /*  on the start page, typing into the search field (filtering the catalog
            live) and submitting the search (opening the browser page with the
            selected, i.e. initially the first, matching page) or leaving the field,
            clearing the search, and selecting and opening a page of the catalog  */
        if (page === "start") {
            if (typing) {
                if (key.escape)
                    setTyping(false)
                else if (key.return) {
                    setTyping(false)
                    if (hits !== null) {
                        if (grid.pos.size > 0)
                            setSel(startId)
                        setPage("browse")
                    }
                }
                if (key.escape || key.return || edit(input, key))
                    return
            }
            else if (input === "/") {
                setTyping(true)
                return
            }
            else if (input === "q") {
                exit()
                return
            }
            else if (key.escape) {
                setQuery("")
                return
            }
            else if (key.return) {
                if (grid.pos.size > 0) {
                    setSel(startId)
                    setPage("browse")
                }
                return
            }
            if (key.upArrow || key.downArrow)
                setStartSel(moveGrid(grid, startId, 0, key.upArrow ? -1 : 1))
            else if (key.leftArrow || key.rightArrow)
                setStartSel(moveGrid(grid, startId, key.leftArrow ? -1 : 1, 0))
            else if (key.home || key.end) {
                const ids = [ ...grid.pos.keys() ]
                setStartSel(ids[key.home ? 0 : ids.length - 1] ?? startId)
            }
            return
        }

        /*  on the browser page, ESCAPE first clears the search query, then leaves
            the search field, and finally returns to the start page  */
        if (key.escape) {
            if (query !== "")
                setQuery("")
            else if (typing)
                setTyping(false)
            else {
                setStartSel(selId)
                setPage("start")
            }
            return
        }

        /*  typing into the search field (filtering the master live), resp.
            starting it, quitting, selecting and following a reference, and
            entering resp. leaving the references of the detail  */
        if (typing) {
            if (key.return) {
                setTyping(false)
                return
            }
            if (edit(input, key))
                return
        }
        else if (input === "/") {
            setTyping(true)
            setRef(-1)
            return
        }
        else if (input === "q") {
            exit()
            return
        }
        else if (key.tab) {
            cycleRef(key.shift ? -1 : 1)
            return
        }
        else if (key.rightArrow) {
            if (ref < 0)
                cycleRef(1)
            return
        }
        else if (key.leftArrow) {
            setRef(-1)
            return
        }
        else if (key.return) {
            const target = rendered.refs[ref]
            if (target !== undefined)
                open(target.id)
            return
        }
        else if (input === " ") {
            scrollBy(H - 1)
            return
        }

        /*  selecting in the master (resp. the references of the detail, while
            one is selected) and scrolling the detail  */
        if ((key.upArrow || key.downArrow) && ref >= 0)
            cycleRef(key.upArrow ? -1 : 1)
        else if (key.upArrow || key.downArrow)
            selectStep(key.upArrow ? -1 : 1)
        else if (key.pageUp || key.pageDown)
            scrollBy((key.pageUp ? -1 : 1) * (H - 1))
        else if (key.home || key.end)
            setScroll(key.home ? 0 : maxScroll)
    })

    /*  refuse to draw into a too small window  */
    if (columns < MIN_W || rows < MIN_H)
        return h(Box, { width: columns, height: rows, justifyContent: "center", alignItems: "center" },
            h(Text, cx("signal"), `window too small (${columns}×${rows}) — needs at least ${MIN_W}×${MIN_H}`))

    /*  the header, enclosed on its left and right side by the upward lines of the rule below it,
        with the page counts (as matching/total counts during a search, in signal color without any match)  */
    const count  = (groups: ManGroup[]) => {
        const pages = groups.flatMap((group) => group.pages)
        return hits === null ? String(pages.length) : `${pages.filter((p) => hits.has(p.id)).length}/${pages.length}`
    }
    const counts = cx("bold", hits !== null && hits.size === 0 && "signal")
    const header = h(Box, { paddingX: 1 },
        h(Box, cx("fixed"), h(Text, cx("dim"), "│")),
        h(Box, cx("grow", "bar"),
            h(Text, cx("normal", "truncate"),
                "⧉ ASE: ", h(Text, cx("bold"), "Manpage Browser"),
                " · skills: ", h(Text, counts, count(catalog.skills)),
                " · commands: ", h(Text, counts, count(catalog.commands)))),
        h(Box, cx("fixed"), h(Text, cx("dim"), "│")))

    /*  the search field in the frame of an input box (like the input boxes of the
        task board, in accent color, resp. in signal color while typing): the part
        of the query around the cursor (with an inverse cursor cell at the cursor,
        resp. behind its end) while typing, else its tail, or a placeholder,
        followed by a clickable clear symbol for a non-empty query  */
    const fieldW = FW
    const textW  = Math.max(1, fieldW - 8)
    const tone   = typing ? "signal" : "accent"
    const shown  = sanitize(query)
    const hint   = "search manpages… (/)".slice(0, textW)
    const cells  = shown.length + (typing && cur >= shown.length ? 1 : 0)
    const fieldX = Math.max(0, typing ? cur + 1 - textW : shown.length - textW)
    const used   = typing || query !== "" ? Math.min(cells, fieldX + textW) - fieldX : hint.length
    const text   = typing ? [
        h(Text, { key: "pre",  ...cx(tone, "bold") }, shown.slice(fieldX, cur)),
        h(Text, { key: "cur",  ...cx(tone, "bold", "inverse") }, shown[cur] ?? " "),
        h(Text, { key: "post", ...cx(tone, "bold") }, shown.slice(cur + 1, fieldX + textW))
    ] : query !== "" ?
        [ h(Text, { key: "text", ...cx(tone, "bold") }, shown.slice(fieldX)) ] :
        [ h(Text, { key: "hint", ...cx("dim") }, hint) ]
    const field  = h(Box, { flexDirection: "column", width: fieldW },
        h(Text, cx(tone), `╭${"─".repeat(fieldW - 2)}╮`),
        h(Text, {},
            h(Text, cx(tone), "│ "),
            h(Text, cx(typing ? "signal" : "dim"), "⌕ "),
            ...text,
            " ".repeat(Math.max(0, textW - used)),
            h(Text, cx(tone, "bold"), query !== "" ? " ✕" : "  "),
            h(Text, cx(tone), " │")),
        h(Text, cx(tone), `╰${"─".repeat(fieldW - 2)}╯`))

    /*  the content of the start page: the search field, a blank line, and the
        catalog grid (reduced to the matching pages of a search, and laid out
        within a left and right padding, also towards its scroll bar)  */
    let content: React.ReactElement
    if (page === "start") {
        /*  the column of the selected page (with the section headings of the first column)  */
        const at  = grid.pos.get(startId) ?? { c: 0, l: 0 }
        const col = grid.lines.map((cells) => cells[at.c] ?? (cells[0]?.kind === "section" ? cells[0] : null))
        gridOff.current = follow(gridOff.current, headOf(col, at.l, H), at.l, H, grid.lines.length)
        content = h(Box, { height: HC },
            h(Box, { flexDirection: "column", width: W },
                field,
                h(Text, {}, " "),
                ...(grid.lines.length === 0 ? [ h(Text, { key: "none", ...cx("dim") }, " ".repeat(PAD) + "(no matching manpages)") ] :
                    grid.lines.slice(gridOff.current, gridOff.current + H).map((cells, l) =>
                        h(Box, { key: `line-${gridOff.current + l}`, paddingX: PAD }, ...cells.map((cell, c) =>
                            h(Box, { key: `cell-${c}`, width: grid.colW, marginRight: c < grid.n - 1 ? GAP : 0 },
                                renderCell(cell, grid.colW, cell !== null && cell.kind === "page" && cell.page.id === startId))))))),
            scrollBar(HC - H, H, grid.lines.length, gridOff.current))
    }

    /*  the content of the browser page, in two adjacent panes (with the border
        of the active one in signal color, i.e. of the detail while one of its
        references is selected, else of the master): the master with the search
        field, a blank line, and the entries, and the detail with the information
        line in the frame of a box (aligned with the search field), a blank line,
        and the rendered selected page (aligned with the entries)  */
    else {
        const selIdx = Math.max(0, items.findIndex((item) => item !== null && item.kind === "page" && item.page.id === selId))
        masterOff.current = follow(masterOff.current, headOf(items, selIdx, H), selIdx, H, items.length)
        const re     = hits?.get(selId)
        const master = h(Box, { flexDirection: "column", width: MW },
            field,
            h(Text, {}, " "),
            ...items.slice(masterOff.current, masterOff.current + H).map((item, i) =>
                h(Box, { key: `item-${masterOff.current + i}`, width: MW, paddingX: PAD },
                    renderCell(item, MW - 2 * PAD, item !== null && item.kind === "page" && item.page.id === selId))))
        const where  = rendered.lines.length <= H ? "all" :
            `${top + 1}-${Math.min(rendered.lines.length, top + H)}/${rendered.lines.length}`
        const bar    = scrollBar(HC - H, H, rendered.lines.length, top)
        const detail = h(Box, { flexDirection: "column", width: DW },
            h(Text, cx("dim"), `╭${"─".repeat(DW - 2)}╮`),
            h(Box, { width: DW },
                h(Box, cx("fixed"), h(Text, cx("dim"), "│ ")),
                h(Box, { flexGrow: 1, flexShrink: 1, minWidth: 0 },
                    current === undefined ? h(Text, cx("dim"), " ") :
                        h(Text, cx("normal", "truncate"), `${current.kind}: `, h(Text, cx("bold"), current.label),
                            ` — ${sanitize(current.title)}`)),
                h(Box, cx("fixed"), h(Text, cx("dim"), ` lines: ${where} │`))),
            h(Text, cx("dim"), `╰${"─".repeat(DW - 2)}╯`),
            h(Text, {}, " "),
            ...(current === undefined ? [ h(Text, { key: "none", ...cx("dim") }, " ".repeat(PAD) + "(no matching manpages)") ] :
                rendered.lines.slice(top, top + H).map((line, i) =>
                    h(Box, { key: `line-${top + i}`, width: DW, paddingX: PAD },
                        renderLine(re !== undefined ? markMatches(line, re) : line, ref)))))

        const pane = (active: boolean) =>
            ({ borderStyle: "round", borderColor: active ? palette.signal : palette.dim, height: HC + 2, paddingLeft: LEFT - 2 } as const)
        content = h(Box, { marginX: 1 },
            h(Box, { ...pane(ref < 0), paddingRight: 1 }, master),
            h(Box, pane(ref >= 0), detail, bar))
    }

    /*  the key hints and the status line in the last line of the screen, enclosed
        on its left and right side by the downward lines of the rule above it  */
    const hints = page === "start" ? [
        "↑/↓/←/→/Wheel: select manpage · ⏎/Left-Click: open manpage · ⇤/⇥: first/last manpage",
        typing ? "⏎: search manpages · ESC: leave search field · ←/→/⇤/⇥: move cursor · ⌫/DEL: delete character" :
            `/: search manpages${query !== "" ? " · ESC: clear search" : ""} · q: quit`
    ] : [
        ref >= 0 ?
            "↑/↓/TAB/⇧TAB: select previous/next reference · ←: select side-bar · ⇈/⇊/SPACE/⇤/⇥/Wheel: scroll manpage" :
            "↑/↓/Wheel: select manpage · →/TAB/⇧TAB: select first reference · ⇈/⇊/SPACE/⇤/⇥/Wheel: scroll manpage",
        typing ? "ESC: clear search, leave search field · ⏎: leave search field · ←/→/⇤/⇥: move cursor · ⌫/DEL: delete character" :
            `⏎/Left-Click: follow reference · /: search manpages · ESC: ${query !== "" ? "clear search" : "back to catalog"} · q: quit`
    ]
    const report = typing ? "searching all manpages for all keywords (with fuzzy matching as fallback)" : null

    /*  the screen: the header, the content (of the start page in a panel, always
        active and hence with its border in signal color, aligned with the rules
        of the header and the status line, and without a right padding, as the
        content covers it with its scroll bar), the key hints, and the status line  */
    const panel = { borderStyle: "round", borderColor: palette.signal, marginX: 1, paddingLeft: LEFT - 2 } as const
    return h(Box, { width: columns, height: rows, flexDirection: "column" },
        header,
        h(Text, cx("dim"), " ╰" + "─".repeat(Math.max(0, columns - 4)) + "╯ "),
        page === "start" ? h(Box, { flexDirection: "column", ...panel }, content) : content,
        ...hints.map((hint, i) => h(Box, { key: `keys-${i}`, ...cx("bar") }, h(Text, cx("hint"), hint))),
        h(Text, cx("dim"), " ╭" + "─".repeat(Math.max(0, columns - 4)) + "╮ "),
        h(Box, { paddingX: 1 },
            h(Box, cx("fixed"), h(Text, cx("dim"), "│")),
            h(Box, cx("grow", "bar"),
                h(Text, cx("hint", report !== null && "signal"),
                    report ?? [ "⧉ ASE: ", h(Text, { key: "app", ...cx("bold") }, "Manpage Browser"),
                        " · version: ", h(Text, { key: "version", ...cx("bold") }, `ASE ${pkg.version}`) ])),
            h(Box, cx("fixed"), h(Text, cx("dim"), "│"))))
}

/*  run the manual page browser until the user quits, where the words of a
    requested page select the page fitting exactly onto them, else are searched  */
export const runManTUI = async (log: Log, words: string[] = []): Promise<void> => {
    const catalog = loadCatalog()
    const query   = words.join(" ").trim()
    const found   = query !== "" ? findPage(catalog, words) : undefined
    const initial = query === "" ? null : { id: found?.id ?? null, query: found !== undefined ? "" : sanitize(query) }
    loadPalette(log)

    /*  defer stderr log output while Ink draws, as it bypasses patchConsole  */
    log.defer(true)

    /*  ensure the terminal never stays in mouse reporting mode,
        even on a premature process exit (e.g. an uncaught exception)  */
    const reset = () => {
        mouseReporting(false)
    }
    process.once("exit", reset)
    try {
        const app = render(h(App, { catalog, initial }), {
            alternateScreen: true, exitOnCtrlC: true, patchConsole: true
        })
        await app.waitUntilExit()
    }
    finally {
        process.off("exit", reset)
        mouseReporting(false)
        log.defer(false)
    }
}

