/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import path                                   from "node:path"
import fs                                     from "node:fs"

import React                                  from "react"
import { render, Box, Text, useApp, useInput, useWindowSize } from "ink"
import type { Key, TextProps }                from "ink"
import { execa }                              from "execa"
import { stringify }                          from "yaml"

import type Log                               from "./ase-lib-log.js"
import pkg                                    from "../package.json" with { type: "json" }
import type { Scope }                         from "./ase-config-scope.js"
import { configSchema, configSecretKeys, configDescriptions } from "./ase-config-schema.js"
import { Config }                             from "./ase-config-core.js"
import type { KeyType }                       from "./ase-config-core.js"
import { useMouseReports }                    from "./ase-task-board-tui.js"
import { mouseReporting }                     from "./ase-task-board-tui-model.js"
import { h }                                  from "./ase-task-board-tui-view.js"
import { palette, loadPalette, cx }           from "./ase-task-board-tui-style.js"
import { sanitize }                           from "./ase-task-board-tui-popup.js"

/*  layout constants: the screen rows of the header (with its rule), of the text of
    the description box, and of the footer (two key hint lines, rule, and status
    line), the rows of the panel above its list per view (column header, resp. tabs,
    each with a rule below), the width of the filter field, the screen columns left of the panel content
    (margin, frame, and padding), the label width of the modal, the debounce delay
    of the text inputs, and the minimum window size  */
const HEAD    = 2
const DESC    = 3
const FOOT    = 4
const PRE     = { param: 2, scope: 2 } as const
const FILTER  = 14
const INSET   = 3
const LABEL   = 8
const DELAY   = 4000
const MIN_W   = 60
const MIN_H   = 22

/*  the pseudo choice of the pull-down which unsets the value  */
const UNSET   = "(unset)"

/*  a text segment of a line, with its text properties  */
type Seg = [ string, TextProps? ]

/*  a line of the YAML rendering of a scope: a map line (of a key prefix, without key)
    or a key line (with its value, explicitly configured on the scope or inherited,
    and whether the key is writable on the scope)  */
type YamlLine = { indent: number, seg: string, key: string | null, value: string, explicit: boolean, writable: boolean }

/*  the open configuration modal: the key, the chain index of the selected scope (or -1
    if the key is writable on no scope of the chain), the text of the value editor (the
    own value of the scope, or else the inherited one), its cursor position, whether the
    text is the own value, and the highlighted choice of the open pull-down (or null)  */
type Modal = { key: string, idx: number, text: string, pos: number, own: boolean, pull: number | null }

/*  render a value as table text resp. as YAML text, masking the secrets  */
const valueText = (key: string, value: unknown): string =>
    value === undefined ? "" : configSecretKeys.includes(key) ? "***" : sanitize(String(value))
const yamlText = (key: string, value: unknown): string =>
    value === undefined ? "~" : configSecretKeys.includes(key) ? "***" : sanitize(stringify(value, { lineWidth: 0 }).trimEnd())

/*  fit a text onto a width: truncated at its end with an ellipsis, resp. padded with spaces  */
const fit = (text: string, width: number): string =>
    width <= 0 ? "" : text.length > width ? text.slice(0, width - 1) + "…" : text.padEnd(width)

/*  wrap a text at word boundaries onto lines of a width, cut down to a maximum line
    count (with an ellipsis ending the last line if the text does not fit)  */
const wrapText = (text: string, width: number, max: number): string[] => {
    const lines = [] as string[]
    let line = ""
    for (const word of text.split(/\s+/).filter((w) => w !== "")) {
        if (line !== "" && line.length + 1 + word.length > width) {
            lines.push(line)
            line = ""
        }
        line = line === "" ? word : `${line} ${word}`
    }
    if (line !== "")
        lines.push(line)
    if (lines.length > max) {
        lines.length = max
        lines[max - 1] = lines[max - 1].slice(0, width - 1) + "…"
    }
    return lines.map((l) => l.trimEnd().length > width ? fit(l, width).trimEnd() : l)
}

/*  render a line of segments, padded with spaces onto a width (to hide the content
    underneath a popup)  */
const segLine = (key: string, segs: Seg[], width: number) => {
    const used = segs.reduce((n, [ t ]) => n + t.length, 0)
    return h(Text, { key, wrap: "truncate" },
        ...segs.map(([ t, p ], i) => h(Text, { key: i, ...(p ?? {}) }, t)),
        " ".repeat(Math.max(0, width - used)))
}

/*  keep an index visible within a viewport of a height, by minimally moving its
    offset, where scrolling up reveals the entries from a top index on  */
const follow = (off: number, top: number, idx: number, height: number, total: number): number =>
    Math.max(0, Math.min(Math.max(0, total - height), top < off ? top : idx >= off + height ? idx - height + 1 : off))

/*  the root component of the configuration editor  */
const App = ({ log, chain }: { log: Log, chain: Scope }) => {
    const { exit, suspendTerminal } = useApp()
    const { columns, rows } = useWindowSize()

    /*  the state: the view, the selected key (shared by both views), the selected tab
        of the scope view, the key filter (and whether it is being typed), the open
        modal, the status line report, the revision of the configuration files, and
        whether the key hints are shown  */
    const [ view,   setView   ] = React.useState<"param" | "scope">("param")
    const [ sel,    setSel    ] = React.useState("")
    const [ tab,    setTab    ] = React.useState(chain.length - 1)
    const [ query,  setQuery  ] = React.useState("")
    const [ typing, setTyping ] = React.useState(false)
    const [ modal,  setModal  ] = React.useState<Modal | null>(null)
    const [ report, setReport ] = React.useState<string | null>(null)
    const [ rev,    setRev    ] = React.useState(0)
    const [ keys,   setKeys   ] = React.useState(true)
    const paramOff = React.useRef(0)
    const scopeOff = React.useRef(0)
    const pending  = React.useRef<{ key: string, idx: number, text: string } | null>(null)
    const timer    = React.useRef<ReturnType<typeof setTimeout> | null>(null)

    /*  report mouse presses while the editor runs  */
    React.useEffect(() => {
        mouseReporting(true)
        return () => {
            mouseReporting(false)
        }
    }, [])

    /*  the configuration of the entire chain: all keys (in schema order), and per key
        its values on all scopes, its value type, and its writability on all scopes  */
    const data = React.useMemo(() => {
        const cfg = new Config("config", configSchema, log, chain)
        cfg.read()
        const keys     = cfg.keys()
        const layers   = new Map(keys.map((key) => [ key, cfg.getLayered(key).map((l) => l.value) ]))
        const types    = new Map(keys.map((key) => [ key, cfg.keyType(key) ]))
        const writable = new Map(keys.map((key) => [ key, chain.map((t) => cfg.isWritableOn(key, t.kind)) ]))
        return { keys, layers, types, writable }
    }, [ log, chain, rev ])
    const valueOn   = (key: string, idx: number) => data.layers.get(key)?.[idx]
    const typeOf    = (key: string): KeyType => data.types.get(key) ?? { type: "string" }
    const writable  = (key: string) => data.writable.get(key) ?? []
    const effective = (key: string) => {
        const vals = data.layers.get(key) ?? []
        const idx  = vals.findLastIndex((v) => v !== undefined)
        return idx >= 0 ? { value: vals[idx], idx } : undefined
    }

    /*  the labels of the scopes and the files of the tabs  */
    const labels = chain.map((t) => Config.scopeLabel(t))
    const files  = React.useMemo(() => chain.map((t, i) =>
        t.kind === "default" ? "(built-in defaults)" : new Config("config", configSchema, log, chain.slice(0, i + 1)).filename),
    [ log, chain ])

    /*  the keys of the parameter view (sorted, as in "ase config list") and the lines
        of the YAML rendering of the selected tab (in schema order), both reduced by the
        key filter (with the map lines of the matching keys only)  */
    const matches   = (key: string) => query === "" || key.toLowerCase().includes(query.toLowerCase())
    const sorted    = React.useMemo(() => [ ...data.keys ].sort((a, b) => a.localeCompare(b)), [ data ])
    const paramKeys = sorted.filter((key) => matches(key))
    const yaml      = React.useMemo(() => {
        const lines = [] as YamlLine[]
        let prev = [] as string[]
        for (const key of data.keys.filter((k) => matches(k))) {
            const segs = key.split(".")
            let k = 0
            while (k < segs.length - 1 && k < prev.length - 1 && segs[k] === prev[k])
                k++
            for (let i = k; i < segs.length - 1; i++)
                lines.push({ indent: i, seg: segs[i], key: null, value: "", explicit: false, writable: false })
            const vals = data.layers.get(key) ?? []
            const own  = vals[tab]
            const base = vals.slice(0, tab).findLast((v) => v !== undefined)
            const can  = data.writable.get(key)?.[tab] ?? false
            lines.push({ indent: segs.length - 1, seg: segs[segs.length - 1], key, value: yamlText(key, own ?? base), explicit: own !== undefined, writable: can })
            prev = segs
        }
        return lines
    }, [ data, tab, query ])
    const scopeKeys = yaml.flatMap((l) => l.key !== null ? [ l.key ] : [])

    /*  the selected key of the current view, which falls back to its first key if the
        shared selection is not shown in it  */
    const list = view === "param" ? paramKeys : scopeKeys
    const cur  = list.includes(sel) ? sel : list[0] ?? ""

    /*  the geometry: the panel content width and the list height of the current view  */
    const W  = columns - 2 * INSET
    const H  = Math.max(1, rows - HEAD - 2 - PRE[view] - DESC - 2 - (keys ? FOOT : FOOT - 2))

    /*  persist a value (or unset it with null) on the scope at a chain index, through a
        configuration of the chain up to this scope, and re-read all scopes  */
    const commit = (key: string, idx: number, value: string | null) => {
        try {
            const cfg = new Config("config", configSchema, log, chain.slice(0, idx + 1))
            cfg.lock(() => {
                cfg.read()
                if (value === null)
                    cfg.delete(key)
                else
                    cfg.set(key, value)
                cfg.write()
            })
            setReport(null)
        }
        catch (err) {
            setReport(err instanceof Error ? err.message : String(err))
        }
        setRev((r) => r + 1)
    }

    /*  persist a pending text input of the modal immediately (an emptied text unsets the value)  */
    const flush = () => {
        if (timer.current !== null)
            clearTimeout(timer.current)
        timer.current = null
        const p = pending.current
        pending.current = null
        if (p !== null)
            commit(p.key, p.idx, p.text === "" ? null : p.text)
    }
    React.useEffect(() => () => {
        flush()
    }, [])

    /*  the editor state of a key on a scope: its own value there, or else the value
        inherited from the weaker scopes (with the cursor behind the text)  */
    const baseText  = (key: string, idx: number) => {
        const v = (data.layers.get(key) ?? []).slice(0, Math.max(0, idx)).findLast((x) => x !== undefined)
        return v === undefined ? "" : String(v)
    }
    const editState = (key: string, idx: number) => {
        const v    = valueOn(key, idx)
        const text = v !== undefined ? String(v) : baseText(key, idx)
        return { text, pos: text.length, own: v !== undefined }
    }

    /*  open the modal of a key on a preferred scope, resp. on its strongest writable
        scope (or read-only on the preferred scope if the key is writable on none)  */
    const openModal = (key: string, prefer: number) => {
        const w   = writable(key)
        const idx = w[prefer] === true || !w.includes(true) ? prefer : w.lastIndexOf(true)
        setModal({ key, idx, ...editState(key, idx), pull: null })
    }
    const open = (key: string) => {
        if (view === "param")
            openModal(key, chain.length - 1)
        else
            setModal({ key, idx: tab, ...editState(key, tab), pull: null })
    }

    /*  type a text into the value editor of the modal, persisting it after the debounce delay  */
    const typeText = (m: Modal, text: string, pos: number) => {
        setModal({ ...m, text, pos, own: true })
        pending.current = { key: m.key, idx: m.idx, text }
        if (timer.current !== null)
            clearTimeout(timer.current)
        timer.current = setTimeout(flush, DELAY)
    }

    /*  unset the value of a key on the scope at a chain index (if set there), dropping a pending text input  */
    const unset = (key: string, idx: number) => {
        if (timer.current !== null)
            clearTimeout(timer.current)
        timer.current   = null
        pending.current = null
        if (valueOn(key, idx) !== undefined)
            commit(key, idx, null)
    }

    /*  step the selection within the keys of the current view  */
    const step = (delta: number) => {
        if (list.length > 0)
            setSel(list[Math.max(0, Math.min(list.length - 1, list.indexOf(cur) + delta))])
    }

    /*  hand the terminal over to the editor on the file of the selected tab, and
        strictly validate the file afterwards  */
    const editFile = async () => {
        const term = chain[tab]
        const cfg  = new Config("config", configSchema, log, chain.slice(0, tab + 1))
        try {
            fs.mkdirSync(path.dirname(cfg.filename), { recursive: true })
            if (!fs.existsSync(cfg.filename))
                fs.writeFileSync(cfg.filename, "", { encoding: "utf8", mode: term.kind === "user" ? 0o600 : undefined })

            /*  run the editor through the shell (to support values with arguments or
                quoting), passing the file via the environment to avoid quoting it  */
            const editor = [ process.env.VISUAL, process.env.EDITOR ]
                .find((e) => e !== undefined && e.trim() !== "")?.trim() ?? "vi"
            const ref    = process.platform === "win32" ? "\"%ASE_CONFIG_FILE%\"" : "\"$ASE_CONFIG_FILE\""
            await suspendTerminal(async () => {
                mouseReporting(false)

                /*  stop the read of stdin still pending from Ink, as it else takes the
                    next input away from the editor (see "runEditor" of the task board)  */
                process.stdin.emit("pause")
                await new Promise((resolve) => { process.nextTick(resolve) })
                try {
                    await execa(`${editor} ${ref}`, { shell: true, stdio: "inherit", env: { ASE_CONFIG_FILE: cfg.filename } })
                }
                finally {
                    mouseReporting(true)
                }
            })
            cfg.read("strict")
            setReport(null)
        }
        catch (err) {
            setReport(err instanceof Error ? err.message : String(err))
        }
        setRev((r) => r + 1)
    }

    /*  the layout of the modal: its lines (padded onto its inner width) and its
        geometry (for the mouse hit-testing of the scopes)  */
    const modalLayout = (m: Modal) => {
        const width  = Math.min(columns - 4, 84)
        const innerW = width - 2
        const textW  = innerW - 2
        const left   = Math.floor((columns - width) / 2)
        const type   = typeOf(m.key)
        const w      = writable(m.key)
        const lines  = [] as Seg[][]
        lines.push([ [ " " ], [ m.key, cx("accent", "bold") ] ])
        lines.push([])
        for (const text of wrapText(configDescriptions[m.key] ?? "", textW, 4))
            lines.push([ [ " " ], [ text, cx("normal") ] ])
        lines.push([])

        /*  the scope list, with the x positions of the scopes  */
        const scopeLine = lines.length
        const scopeSegs = [ [ " " ], [ "scope:".padEnd(LABEL), cx("normal") ] ] as Seg[]
        const scopeX    = [] as { idx: number, x0: number, x1: number }[]
        let x = left + 1 + 1 + LABEL
        labels.forEach((label, i) => {
            const text = ` ${label} `
            const set  = valueOn(m.key, i) !== undefined
            const tone = i === m.idx ? palette.signal : set && i > 0 ? palette.accent : w[i] ? palette.normal : palette.dim
            scopeSegs.push([ text, { color: tone, inverse: i === m.idx, bold: set } ], [ " " ])
            scopeX.push({ idx: i, x0: x, x1: x + text.length })
            x += text.length + 1
        })
        lines.push(scopeSegs)
        lines.push([])

        /*  the value editor in the frame of an input box (in signal color, resp. dimmed
            on a read-only scope), with an inherited value dimmed, and with the choices of
            an open pull-down below it  */
        const ro     = w[m.idx] !== true
        const fieldW = textW - LABEL
        const areaW  = Math.max(1, fieldW - 4)
        const tone   = ro ? "dim" : "signal"
        const look   = m.own ? cx(ro ? "normal" : tone, "bold") : cx("dim")
        const indent = " ".repeat(1 + LABEL)
        let shown: Seg[]
        if (ro)
            shown = [ [ fit(m.text === "" ? UNSET : sanitize(m.text), areaW - 10), m.text === "" ? cx("dim") : look ],
                [ "read-only", cx("dim") ], [ " " ] ]
        else if (type.type === "boolean" || type.type === "enum") {
            const mark = type.type === "boolean" ? " ⇄" : " ▾"
            shown = m.text === "" ?
                [ [ fit(UNSET, areaW - 2), cx("dim") ], [ mark, cx(tone, "bold") ] ] :
                [ [ fit(sanitize(m.text), areaW - 2), look ], [ mark, cx(tone, "bold") ] ]
        }
        else {
            /*  the part of the text around the cursor, with an inverse cursor cell  */
            const text  = sanitize(m.text)
            const pos   = Math.min(m.pos, text.length)
            const start = Math.max(0, pos - (areaW - 1))
            const part  = text.slice(start, start + areaW)
            const c     = pos - start
            shown = [ [ part.slice(0, c), look ], [ part[c] ?? " ", cx(tone, "inverse") ], [ part.slice(c + 1), look ],
                [ " ".repeat(Math.max(0, areaW - Math.max(part.length, c + 1))) ] ]
        }
        lines.push([ [ indent ], [ `╭${"─".repeat(fieldW - 2)}╮`, cx(tone) ] ])
        lines.push([ [ " " ], [ "value:".padEnd(LABEL), cx("normal") ], [ "│ ", cx(tone) ], ...shown, [ " │", cx(tone) ] ])
        lines.push([ [ indent ], [ `╰${"─".repeat(fieldW - 2)}╯`, cx(tone) ] ])
        if (m.pull !== null && type.type === "enum") {
            /*  the choices of the open pull-down, in the frame of a box below the input box  */
            lines.push([ [ indent ], [ `╭${"─".repeat(fieldW - 2)}╮`, cx(tone) ] ])
            const choices = [ ...type.options, UNSET ]
            for (const [ i, choice ] of choices.entries())
                lines.push([ [ indent ], [ "│ ", cx(tone) ],
                    [ fit(choice, fieldW - 4), i === m.pull ? { color: palette.signal, inverse: true } : cx("normal") ],
                    [ " │", cx(tone) ] ])
            lines.push([ [ indent ], [ `╰${"─".repeat(fieldW - 2)}╯`, cx(tone) ] ])
        }
        lines.push([])

        /*  the centered key hints of the modal  */
        const base = "DEL: unset · ⏎: take · ESC: close"
        const hint = (ro ? "read-only on this scope · ←/→/⇥: scope · ⏎/ESC: close" :
            m.pull !== null ? "↑/↓: select · ⏎: take · ESC: close list" :
                type.type === "boolean" ? `SPACE: toggle · ←/→/⇥: scope · ${base}` :
                    type.type === "enum" ? "SPACE/⏎: choose · ←/→/⇥: scope · DEL: unset · ESC: close" :
                        `type ${type.type === "number" ? "digits" : "text"} · ←/→: cursor · ⇥: scope · ${base}`).slice(0, innerW)
        lines.push([ [ " ".repeat(Math.max(0, Math.floor((innerW - hint.length) / 2))) + hint, cx("dim") ] ])
        const height = lines.length + 2
        const top    = Math.max(0, Math.floor((rows - height) / 2))
        return { lines, width, innerW, left, top, height, scopeRow: top + 1 + scopeLine, scopeX }
    }
    const layout = modal !== null ? modalLayout(modal) : null

    /*  handle the keyboard within the modal  */
    const modalKey = (m: Modal, input: string, key: Key) => {
        const type = typeOf(m.key)
        const w    = writable(m.key)

        /*  the open pull-down: select a choice, resp. take it (closing the modal) or close it  */
        if (m.pull !== null && type.type === "enum") {
            const choices = [ ...type.options, UNSET ]
            if (key.escape)
                setModal({ ...m, pull: null })
            else if (key.upArrow || key.downArrow)
                setModal({ ...m, pull: Math.max(0, Math.min(choices.length - 1, m.pull + (key.upArrow ? -1 : 1))) })
            else if (key.return) {
                const choice = choices[m.pull]
                if (choice === UNSET)
                    unset(m.key, m.idx)
                else
                    commit(m.key, m.idx, choice)
                setModal(null)
            }
            return
        }

        /*  closing the modal and switching between the scopes (by TAB, and, outside of
            the text inputs, also by the left/right arrows), both persisting a pending
            text input first, where non-writable scopes are shown read-only  */
        const ro    = w[m.idx] !== true
        const texty = !ro && (type.type === "number" || type.type === "string")
        if (key.escape) {
            flush()
            setModal(null)
            return
        }
        if (key.tab || (!texty && (key.leftArrow || key.rightArrow))) {
            /*  TAB cycles (wrapping around), the arrows stop at the ends  */
            const n = w.length
            const d = key.leftArrow || (key.tab && key.shift) ? -1 : 1
            const i = key.tab ? (m.idx + d + n) % n : Math.max(0, Math.min(n - 1, m.idx + d))
            if (i !== m.idx) {
                flush()
                setModal({ ...m, idx: i, ...editState(m.key, i) })
            }
            return
        }
        if (ro) {
            if (key.return)
                setModal(null)
            return
        }

        /*  taking the value and closing the modal: a pending text input is persisted,
            and a shown inherited value is taken over as the own value of the scope
            (except for an enum, whose RETURN opens the pull-down below)  */
        if (key.return && type.type !== "enum") {
            if (pending.current !== null)
                flush()
            else if (!m.own && m.text !== "")
                commit(m.key, m.idx, m.text)
            setModal(null)
            return
        }
        if (key.delete) {
            unset(m.key, m.idx)
            const text = baseText(m.key, m.idx)
            setModal({ ...m, text, pos: text.length, own: false })
            return
        }

        /*  the value editors: toggling a boolean (true, false, unset, where an
            inherited value is toggled into an own one), opening the pull-down of an
            enum, and typing a number resp. a text at the cursor position  */
        if (type.type === "boolean") {
            if (input === " ") {
                const next = !m.own ? (m.text === "true" ? "false" : "true") :
                    m.text === "true" ? "false" : null
                if (next === null)
                    unset(m.key, m.idx)
                else
                    commit(m.key, m.idx, next)
                const text = next ?? baseText(m.key, m.idx)
                setModal({ ...m, text, pos: text.length, own: next !== null })
            }
        }
        else if (type.type === "enum") {
            if (input === " " || key.return) {
                const choices = [ ...type.options, UNSET ]
                setModal({ ...m, pull: Math.max(0, choices.indexOf(m.text === "" ? UNSET : m.text)) })
            }
        }
        else if (key.leftArrow || key.rightArrow)
            setModal({ ...m, pos: Math.max(0, Math.min(m.text.length, m.pos + (key.leftArrow ? -1 : 1))) })
        else if (key.home || key.end)
            setModal({ ...m, pos: key.home ? 0 : m.text.length })
        else if (key.backspace) {
            if (m.pos > 0)
                typeText(m, m.text.slice(0, m.pos - 1) + m.text.slice(m.pos), m.pos - 1)
        }
        else if (input !== "" && !key.ctrl && !key.meta && !key.return) {
            const text = sanitize(input.replace(/[\r\n]+/g, " "))
            const add  = type.type === "number" ? text.replace(/[^0-9.]/g, "") : text
            if (add !== "")
                typeText(m, m.text.slice(0, m.pos) + add + m.text.slice(m.pos), m.pos + add.length)
        }
    }

    /*  handle the mouse: within the modal a click onto a writable scope selects it,
        else the wheel (64/65: up/down) steps the selection, a click onto the search
        field starts typing into it, a click onto a tab selects it, and a click onto a
        key selects it, resp. opens its modal if already selected  */
    useMouseReports((btn, mx, my) => {
        const wheel = btn === 64 ? -1 : btn === 65 ? 1 : 0
        if (btn !== 0 && wheel === 0)
            return
        if (modal !== null && layout !== null) {
            const hit = layout.scopeX.find((s) => mx >= s.x0 && mx < s.x1)
            if (btn === 0 && my === layout.scopeRow && hit !== undefined && hit.idx !== modal.idx) {
                flush()
                setModal({ ...modal, idx: hit.idx, ...editState(modal.key, hit.idx), pull: null })
            }
            return
        }
        if (wheel !== 0) {
            step(wheel)
            return
        }
        if (my === 0) {
            setTyping(true)
            return
        }
        if (view === "scope" && my === HEAD + 1) {
            let x = INSET
            labels.forEach((label, i) => {
                if (mx >= x && mx < x + label.length + 2)
                    setTab(i)
                x += label.length + 3
            })
            return
        }
        const listTop = HEAD + 1 + PRE[view]
        if (my < listTop || my >= listTop + H)
            return
        const n   = (view === "param" ? paramOff.current : scopeOff.current) + my - listTop
        const key = view === "param" ? paramKeys[n] : yaml[n]?.key
        if (key === undefined || key === null)
            return
        if (key === cur)
            open(key)
        else
            setSel(key)
    })

    /*  handle the keyboard  */
    useInput((input, key) => {
        /*  ignore key releases and mouse reports (handled by "useMouseReports" above)  */
        if (key.eventType === "release" || /^\[<\d+;\d+;\d+[Mm]$/.test(input))
            return
        setReport(null)

        /*  the modal takes all keys while open  */
        if (modal !== null) {
            modalKey(modal, input, key)
            return
        }

        /*  typing into the key filter of the header (filtering both views live), where
            RETURN keeps and ESCAPE clears the filter, both leaving the field  */
        if (typing) {
            if (key.escape) {
                setQuery("")
                setTyping(false)
                return
            }
            if (key.return) {
                setTyping(false)
                return
            }
            if (key.backspace) {
                setQuery(query.slice(0, -1))
                return
            }
            if (input !== "" && !key.ctrl && !key.meta && !key.tab) {
                setQuery(query + sanitize(input.replace(/[\r\n]+/g, " ")))
                return
            }
        }

        /*  quitting (with ESCAPE first clearing the key filter) and toggling the view  */
        if (key.escape) {
            if (query !== "")
                setQuery("")
            else
                exit()
            return
        }
        if (input === "q" && !typing) {
            exit()
            return
        }
        if (input === "?" && !typing) {
            setKeys(!keys)
            return
        }
        if (input === "v" && !typing) {
            setView(view === "param" ? "scope" : "param")
            return
        }

        /*  selecting and configuring a key, filtering the keys, selecting a tab,
            deleting a key from the scope of the tab, and editing its file  */
        if (key.upArrow || key.downArrow)
            step(key.upArrow ? -1 : 1)
        else if (key.pageUp || key.pageDown)
            step((key.pageUp ? -1 : 1) * Math.max(1, H - 1))
        else if (key.home || key.end)
            setSel(list[key.home ? 0 : list.length - 1] ?? sel)
        else if (key.return && list.includes(cur))
            open(cur)
        else if (input === "/")
            setTyping(true)
        else if (view === "scope" && (key.leftArrow || key.rightArrow))
            setTab(Math.max(0, Math.min(chain.length - 1, tab + (key.leftArrow ? -1 : 1))))
        else if (view === "scope" && key.delete && list.includes(cur) && writable(cur)[tab] === true)
            unset(cur, tab)
        else if (view === "scope" && input === "e" && tab > 0)
            editFile().catch((err: unknown) => {
                setReport(err instanceof Error ? err.message : String(err))
            })
    })

    /*  refuse to draw into a too small window  */
    if (columns < MIN_W || rows < MIN_H)
        return h(Box, { width: columns, height: rows, justifyContent: "center", alignItems: "center" },
            h(Text, cx("signal"), `window too small (${columns}×${rows}) — needs at least ${MIN_W}×${MIN_H}`))

    /*  the header, enclosed on its left and right side by the upward lines of the
        rule below it, with the key count (as shown/total count, padded to a fixed
        width, in signal color without any match), the view, and (like in
        the task board) the inversely rendered key filter field, with the tail of the
        filter query (with the cursor while typing) and its clear mark  */
    const total  = String(data.keys.length)
    const count  = `${String(list.length).padStart(total.length)}/${total}`
    const field  = (sanitize(query) + (typing ? "▏" : "")).slice(-FILTER).padEnd(FILTER)
    const header = h(Box, { paddingX: 1 },
        h(Box, cx("fixed"), h(Text, cx("dim"), "│")),
        h(Box, cx("grow", "bar"),
            h(Text, cx("normal", "truncate"),
                "⧉ ASE: ", h(Text, cx("bold"), "Configuration Editor"),
                " · keys: ", h(Text, cx("bold", list.length === 0 && "signal"), count),
                " · view: ", h(Text, cx("dim", "badge"), ` ${(view === "param" ? "parameters" : "scopes").padEnd(10)} `),
                " · filter: ", h(Text, cx(typing ? "signal" : "dim", "badge"), field + (query !== "" ? "✕ " : "  ")))),
        h(Box, cx("fixed"), h(Text, cx("dim"), "│")))

    /*  the content of the parameter view: the column header, a rule below it (connected
        to the frame of the panel, like the one below the tabs), and the table rows  */
    let content: React.ReactElement[]
    if (view === "param") {
        const kw  = Math.min(Math.floor(W * 0.45), Math.max(3, ...data.keys.map((k) => k.length)))
        const sw  = Math.max(5, ...labels.map((l) => l.length))
        const vw  = Math.max(1, W - kw - sw - 2)
        const idx = paramKeys.indexOf(cur)
        paramOff.current = follow(paramOff.current, idx, idx, H, paramKeys.length)
        content = [
            h(Text, { key: "head", ...cx("bold") }, `${fit("KEY", kw)} ${fit("VALUE", vw)} ${fit("SCOPE", sw)}`),
            h(Box, { key: "rule", marginLeft: -2, width: W + 4 },
                h(Text, { color: palette.signal }, `├${"─".repeat(W + 2)}┤`)),
            ...(paramKeys.length === 0 ? [ h(Text, { key: "none", ...cx("dim") }, "(no matching keys)") ] :
                paramKeys.slice(paramOff.current, paramOff.current + H).map((key) => {
                    /*  an existing value is bold, an explicitly set one (outside of "default") also accented  */
                    const eff = effective(key)
                    const col = `${fit(key, kw)} `
                    const val = `${fit(eff !== undefined ? valueText(key, eff.value) : "~", vw)} `
                    const scp = fit(eff !== undefined ? labels[eff.idx] : "-", sw)
                    const exp = eff !== undefined && eff.idx > 0
                    return key === cur ?
                        h(Text, { key, color: palette.signal, inverse: true, wrap: "truncate" }, col + val + scp) :
                        h(Text, { key, wrap: "truncate" },
                            h(Text, cx("normal"), col),
                            h(Text, cx(exp ? "accent" : eff !== undefined ? "normal" : "dim", eff !== undefined && "bold"), val),
                            h(Text, cx(exp ? "accent" : "dim", exp && "bold"), scp))
                }))
        ]
    }

    /*  the content of the scope view: the tabs of the scopes (with the file of the
        selected one), a blank line, and the YAML rendering of the selected tab  */
    else {
        const idx = yaml.findIndex((l) => l.key === cur)
        let top = idx
        while (top > 0 && yaml[top - 1].key === null)
            top--
        scopeOff.current = follow(scopeOff.current, Math.max(0, top), Math.max(0, idx), H, yaml.length)
        const tabSegs = labels.flatMap((label, i) => [
            [ ` ${label} `, i === tab ? { color: palette.signal, inverse: true, bold: true } : cx(i === 0 ? "dim" : "normal") ],
            [ " " ]
        ] as Seg[])
        /*  the rule below the tabs, connected to the frame of the panel (by a negative
            margin over its padding and frame), with the file of the selected tab flush right  */
        const name = sanitize(files[tab])
        const file = name.length > W - 4 ? "…" + name.slice(-(W - 5)) : name
        content = [
            segLine("tabs", tabSegs, W),
            h(Box, { key: "rule", marginLeft: -2, width: W + 4 },
                h(Text, { wrap: "truncate" },
                    h(Text, { color: palette.signal }, `├${"─".repeat(Math.max(0, W + 1 - file.length - 2))} `),
                    h(Text, cx("dim"), file),
                    h(Text, { color: palette.signal }, " ─┤"))),
            ...(yaml.length === 0 ? [ h(Text, { key: "none", ...cx("dim") }, "(no matching keys)") ] :
                yaml.slice(scopeOff.current, scopeOff.current + H).map((l, i) => {
                    const text = fit("    ".repeat(l.indent) + l.seg + ":" + (l.key !== null ? ` ${l.value}` : ""), W)
                    const props = l.key !== null && l.key === cur ? { color: palette.signal, inverse: true } :
                        cx(l.key !== null && !l.writable ? "dim" : "normal", l.explicit && tab > 0 && "accent", l.explicit && "bold")
                    return h(Text, { key: `line-${scopeOff.current + i}`, ...props, wrap: "truncate" }, text)
                }))
        ]
    }

    /*  the description box of the selected key, with the key in its top border  */
    const boxW  = columns - 2
    const descW = boxW - 4
    const title = cur !== "" ? ` ${cur} ` : ""
    const desc  = wrapText(configDescriptions[cur] ?? "", descW, DESC)
    const descBox = h(Box, { flexDirection: "column", marginX: 1 },
        h(Text, cx("dim"), "╭─", h(Text, cx("accent", "bold"), title), "─".repeat(Math.max(0, boxW - 3 - title.length)) + "╮"),
        ...Array.from({ length: DESC }, (_, i) => h(Text, { key: `desc-${i}` },
            h(Text, cx("dim"), "│ "), h(Text, cx("normal"), fit(desc[i] ?? "", descW)), h(Text, cx("dim"), " │"))),
        h(Text, cx("dim"), `╰${"─".repeat(Math.max(0, boxW - 2))}╯`))

    /*  the key hints (toggled by "?", like in the task board) and the status line in
        the last line of the screen, enclosed on its left and right side by the downward
        lines of the rule above it, which shows how to show the hidden key hints again  */
    const quit  = `/: filter keys · ?: hide key hints · ESC: ${query !== "" ? "clear filter" : "quit"} · q: quit`
    const hints = typing ? [
        "↑/↓/⇞/⇟/⇤/⇥/Wheel: select key",
        "type to filter keys · ⏎: keep filter · ESC: clear filter · ⌫: delete character"
    ] : view === "param" ? [
        "↑/↓/⇞/⇟/⇤/⇥/Wheel: select key · ⏎/Click: configure key · v: scope view",
        quit
    ] : [
        "←/→/Click: select scope · ↑/↓/⇞/⇟/⇤/⇥/Wheel: select key · ⏎/Click: configure key",
        `DEL: delete key · e: edit scope file · v: parameter view · ${quit}`
    ]

    /*  the screen: the header, the panel with the view content, the description box,
        the key hints, the status line, and the modal on top of it all  */
    const panel = { borderStyle: "round", borderColor: palette.signal, marginX: 1, paddingX: 1, flexDirection: "column", height: PRE[view] + H + 2 } as const
    return h(Box, { width: columns, height: rows, flexDirection: "column" },
        header,
        h(Text, cx("dim"), " ╰" + "─".repeat(Math.max(0, columns - 4)) + "╯ "),
        h(Box, panel, ...content),
        descBox,
        ...(keys ? hints : []).map((hint, i) => h(Box, { key: `keys-${i}`, ...cx("bar") }, h(Text, cx("hint"), hint))),
        h(Text, cx("dim"), " ╭" + "─".repeat(Math.max(0, columns - 4)) + "╮ "),
        h(Box, { paddingX: 1 },
            h(Box, cx("fixed"), h(Text, cx("dim"), "│")),
            h(Box, cx("grow", "bar"),
                h(Text, cx("hint", report !== null && "signal"),
                    report !== null ? sanitize(report) : [ "⧉ ASE: ", h(Text, { key: "app", ...cx("bold") }, "Configuration Editor"),
                        " · version: ", h(Text, { key: "version", ...cx("bold") }, `ASE ${pkg.version}`),
                        ...(keys ? [] : [ " · ?: show key hints" ]) ])),
            h(Box, cx("fixed"), h(Text, cx("dim"), "│"))),
        ...(layout !== null ? [ h(Box, { key: "modal", top: layout.top, left: layout.left, width: layout.width, height: layout.height, ...cx("popup", "border-signal") },
            ...layout.lines.map((segs, i) => segLine(`modal-${i}`, segs, layout.innerW))) ] : []))
}

/*  run the configuration editor on a scope chain until the user quits  */
export const runConfigTUI = async (log: Log, scope: Scope): Promise<void> => {
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
        const app = render(h(App, { log, chain: scope }), {
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
