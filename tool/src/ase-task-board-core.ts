/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import path                      from "node:path"
import fs                        from "node:fs"

import { watch }                 from "chokidar"
import type { FSWatcher }        from "chokidar"
import lockfile                  from "proper-lockfile"
import { DateTime }              from "luxon"
import writeFileAtomic           from "write-file-atomic"
import YAML                      from "yaml"
import * as v                    from "valibot"
import type { HighlighterCore }  from "shiki/core"

import type Log                  from "./ase-lib-log.js"
import { ensureAseGitignore }    from "./ase-config-scope.js"
import { Task }                  from "./ase-task.js"
import { Problem }               from "./ase-task-store-core.js"
import type { TaskLifecycle }    from "./ase-task-format.js"
import * as TaskFormat           from "./ase-task-format.js"
import { relaySpec }             from "./ase-agent-relay-client.js"
import { AgentRelayClient }      from "./ase-agent-relay-client.js"
import type { RelaySpec }        from "./ase-agent-relay-client.js"
import type { AgentPresence }    from "./ase-agent-relay-core.js"
import type { AgentUsage }       from "./ase-agent-relay-core.js"
import type { AgentPrompt }      from "./ase-agent-relay-core.js"
import { editOf }                from "./ase-task-request.js"
import type { EditState }        from "./ase-task-request.js"

/*  the kind of a lifecycle state: the initial state, a terminal (finished) state, or else a regular one  */
export type LaneKind  = "initial" | "regular" | "terminal"

/*  a lane of the board: one lifecycle state, whether its tasks are
    actively worked on (otherwise it is a parking lane), its share of
    the group height, whether it is drawn dashed (for "CANCELLED"),
    and the kind of its state (derived from the lifecycle model)  */
export type LaneSpec  = { status: string, active: boolean, weight: number, dashed: boolean, kind: LaneKind }

/*  a group of the board: one phase of the lifecycle model and its lanes  */
export type GroupSpec = { title: string, lanes: LaneSpec[] }

/*  a lane and a group of the fixed lane layouts (without the derived state kind)  */
type LaneLayout  = Omit<LaneSpec, "kind">
type GroupLayout = { title: string, lanes: LaneLayout[] }

/*  a card of the board: the task id, its title, its group (epic, else empty),
    its lifecycle state (its lane), its actual status (differing from its lifecycle
    state if foreign to the lifecycle model), the state of its edit requests
    (see "ase agent editor", else empty), its assignee (else empty), its effort
    size (of its valid "Effort" key, else empty if not estimated), the data
    needed for ordering and the graph, and the time of its last modification  */
export type Card = { id: string, title: string, group: string, status: string, actual: string, edit: EditState | "", assignee: string, effort: TaskFormat.EffortSize | "", after: string[], created: string, modified: string }

/*  the marker of the state of the edit requests of a card, enclosed in brackets
    (else empty): requested, being processed, or failed  */
export const editMarker = (card: Card): string =>
    card.edit === "pending" ? "[✎]" : card.edit === "active" ? "[✎…]" : card.edit === "failed" ? "[✎✗]" : ""

/*  the marker of the effort size of a card: the size behind "⚖",
    enclosed in brackets (else empty if not estimated)  */
export const effortMarker = (card: Card): string =>
    card.effort !== "" ? `[⚖${card.effort}]` : ""

/*  the board: the lane layout of the detected lifecycle model, the cards
    per lane in display order, the computed graph, the cards shown as
    dependency context only (of a filtered graph), and all diagnostics  */
export type Board = {
    mode:     string
    groups:   GroupSpec[]
    cards:    Map<string, Card>
    lanes:    Map<string, Card[]>
    pred:     Map<string, string[]>
    succ:     Map<string, string[]>
    levels:   Map<string, number>
    cyclic:   Set<string>
    context:  Set<string>
    warnings: string[]
}

/*  the per-surface view state: the shown view (the lanes, the dependency graph, the statistics, the agents,
    or the agent graph), minimized lanes, collapsed phases, resized lanes (with their height weights), and
    whether the task titles, the key hints, and the standalone tasks of the graph are shown  */
export type Surface     = { view: SurfaceView, minimized: string[], collapsed: string[], heights: Record<string, number>, titles: boolean, keys: boolean, standalone: boolean }
export type SurfaceView = "lanes" | "graph" | "stats" | "agents" | "flow"

/*  the displayed names of the views (the persisted view ids being kept short)  */
export const viewLabels: Record<SurfaceView, string> = {
    lanes:  "task-lanes",
    graph:  "task-graph",
    stats:  "statistics",
    agents: "agent-logs",
    flow:   "agent-graph"
}

/*  the cycle order of the views (with the agent views only with an agent relay), and
    the action of the key hint cycling them forward ("v") and backward ("V")  */
export const viewOrder = (relay: boolean): SurfaceView[] =>
    relay ? [ "lanes", "graph", "stats", "agents", "flow" ] : [ "lanes", "graph", "stats" ]
export const viewCycleHint = (view: SurfaceView, relay: boolean): string => {
    const views = viewOrder(relay)
    const i     = views.indexOf(view)
    return `view ${viewLabels[views[(i + 1) % views.length]]}/${viewLabels[views[(i + views.length - 1) % views.length]]}`
}
export type SurfaceList = "minimized" | "collapsed"
export type SurfaceFlag = "titles" | "keys" | "standalone"

/*  the persisted board state of a project (the one of the TUI surface only,
    as the web board keeps its surface state per browser)  */
export type State = { tui: Surface }

/*  shorthand for a lane specification  */
const lane = (status: string, active: boolean, weight: number): LaneLayout =>
    ({ status, active, weight, dashed: status === "CANCELLED" })

/*  the fixed lane layouts per lifecycle model, mirroring the drawing
    "docs/task-states.graffle": within a group the entry state comes
    first, the active state second, and the parking state last, while the
    finished states form the final group "Done"  */
export const laneLayouts: Record<string, GroupLayout[]> = {
    solo: [
        { title: "1 - Work in Progress", lanes: [ lane("OPEN",         true,  1), lane("SHELVED",   false, 1) ] },
        { title: "2 - Done",             lanes: [ lane("CLOSED",       false, 1), lane("CANCELLED", false, 1) ] }
    ],
    team: [
        { title: "1 - Planning",         lanes: [ lane("PLANNING",     true,  1), lane("SHELVED",   false, 1) ] },
        { title: "2 - Implementation",   lanes: [ lane("IMPLEMENTING", true,  1), lane("STALLED",   false, 1) ] },
        { title: "3 - Done",             lanes: [ lane("IMPLEMENTED",  false, 1), lane("CANCELLED", false, 1) ] }
    ],
    enterprise: [
        { title: "1 - Planning",         lanes: [ lane("DRAFTED",     false, 2.0), lane("PLANNING",     true,  2.0), lane("SHELVED",  false, 2.0) ] },
        { title: "2 - Implementation",   lanes: [ lane("PLANNED",     false, 1.0), lane("IMPLEMENTING", true,  3.0), lane("STALLED",  false, 2.0) ] },
        { title: "3 - Qualification",    lanes: [ lane("IMPLEMENTED", false, 2.0), lane("QUALIFYING",   true,  2.0), lane("DECLINED", false, 2.0) ] },
        { title: "4 - Integration",      lanes: [ lane("QUALIFIED",   false, 1.0), lane("INTEGRATING",  true,  3.0), lane("DEFERRED", false, 2.0) ] },
        { title: "5 - Done",             lanes: [ lane("INTEGRATED",  false, 5.0), lane("CANCELLED",    false, 1.0) ] }
    ]
}

/*  the kind of a lifecycle state, as defined by the lifecycle model itself  */
export const kindOf = (lifecycle: TaskLifecycle, status: string): LaneKind =>
    status === lifecycle.initial ? "initial" :
        lifecycle.finished.includes(status) ? "terminal" : "regular"

/*  resolve the lane layout of a lifecycle model and check it against the
    model, so every state of the model occurs in exactly one lane, and
    annotate each lane with the kind of its state  */
export const layoutOf = (lifecycle: TaskLifecycle): GroupSpec[] => {
    const groups = laneLayouts[lifecycle.name]
    if (groups === undefined)
        throw new Error(`board: no lane layout for lifecycle model "${lifecycle.name}"`)
    const seen    = groups.flatMap((g) => g.lanes.map((l) => l.status))
    const missing = lifecycle.states.filter((s) => !seen.includes(s))
    const extra   = seen.filter((s, i) => !lifecycle.states.includes(s) || seen.indexOf(s) !== i)
    if (missing.length > 0 || extra.length > 0)
        throw new Error(`board: lane layout of lifecycle model "${lifecycle.name}" does not match ` +
            `its states (missing: ${missing.join(", ") || "none"}, surplus: ${extra.join(", ") || "none"})`)
    return groups.map((g) => ({
        title: g.title,
        lanes: g.lanes.map((l) => ({ ...l, kind: kindOf(lifecycle, l.status) }))
    }))
}

/*  the lane states of a lane row: the lanes at the same position in all expanded phases  */
export const rowLanes = (groups: GroupSpec[], collapsed: string[], l: number): string[] =>
    groups.filter((g) => l < g.lanes.length && !collapsed.includes(g.title)).map((g) => g.lanes[l].status)

/*  split a height into integer shares by weights, where each positively
    weighted share first gets a minimum (as far as the total allows), the
    rest is split by weights, and the remainder goes one by one to the shares
    of the largest fractional parts (the first ones on ties), so that moving
    weight between two shares never changes the height of any other share  */
export const splitHeight = (total: number, weights: number[], min = 0): number[] => {
    const sum = weights.reduce((n, w) => n + w, 0)
    if (sum <= 0 || total <= 0)
        return weights.map(() => 0)
    const n    = weights.filter((w) => w > 0).length
    const base = Math.min(min, Math.floor(total / n))
    const rest = total - base * n
    const quot = weights.map((w) => w > 0 ? rest * w / sum : 0)
    const hs   = weights.map((w, i) => w > 0 ? base + Math.floor(quot[i]) : 0)
    const frac = (i: number) => quot[i] - Math.floor(quot[i])
    weights.map((_w, i) => i).filter((i) => weights[i] > 0)
        .sort((a, b) => frac(b) - frac(a) || a - b)
        .slice(0, total - hs.reduce((n, h) => n + h, 0))
        .forEach((i) => { hs[i]++ })
    return hs
}

/*  the height weight of a lane: its persisted one (see "+"/"-"), else the one of its lane layout  */
export const laneWeight = (surface: Surface, lane: LaneSpec): number =>
    surface.heights[lane.status] ?? lane.weight

/*  the valibot schema of the persisted board state  */
const surfaceSchema = v.object({
    view:       v.optional(v.picklist([ "lanes", "graph", "stats", "agents", "flow" ]), "lanes"),
    minimized:  v.optional(v.array(v.string()), []),
    collapsed:  v.optional(v.array(v.string()), []),
    heights:    v.optional(v.record(v.string(), v.pipe(v.number(), v.gtValue(0))), {}),

    /*  (a string of an older state file maps "all" onto true, else false)  */
    titles:     v.optional(v.pipe(v.union([ v.boolean(), v.string() ]),
        v.transform((t) => typeof t === "boolean" ? t : t === "all")), false),
    keys:       v.optional(v.boolean(), true),
    standalone: v.optional(v.boolean(), true)
})
const stateSchema = v.object({
    tui: v.optional(surfaceSchema, { view: "lanes", minimized: [], collapsed: [], heights: {}, titles: false, keys: true, standalone: true })
})

/*  reusable functionality: the persisted per-project board state in
    ".ase/board.yaml", holding the view state of the TUI surface (the
    "web" section of older state files is dropped on the next update),
    which is display state only and hence never written into any task  */
export class BoardState {
    /*  resolve the state file of the current project  */
    static filename (): string {
        return path.join(Task.projectRoot(), ".ase", "board.yaml")
    }

    /*  parse a state file text, falling back to the empty state on any error  */
    private static parse (text: string): State {
        try {
            return v.parse(stateSchema, YAML.parse(text) ?? {})
        }
        catch {
            return v.parse(stateSchema, {})
        }
    }

    /*  load the state of the current project  */
    static load (): State {
        const file = BoardState.filename()
        return BoardState.parse(fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "")
    }

    /*  update the state under a cross-process lock, writing the file only
        if its content actually changed; returns the updated state  */
    static async update (fn: (state: State) => void): Promise<State> {
        const file = BoardState.filename()
        fs.mkdirSync(path.dirname(file), { recursive: true })
        ensureAseGitignore(path.dirname(file))

        /*  ensure the lockable file exists without truncating a concurrently written one  */
        fs.appendFileSync(file, "", "utf8")

        /*  wait for a concurrent holder (e.g. TUI vs. web service) instead of failing with ELOCKED  */
        const release = await lockfile.lock(file, {
            retries: { retries: 50, minTimeout: 20, maxTimeout: 200 }
        })
        try {
            const before = fs.readFileSync(file, "utf8")
            const state  = BoardState.parse(before)
            fn(state)
            const after  = YAML.stringify(state)
            if (after !== before)
                writeFileAtomic.sync(file, after, { encoding: "utf8" })
            return state
        }
        finally {
            await release()
        }
    }

    /*  toggle an entry of a surface list (minimized lanes or collapsed phases), resp. multiple
        entries at once (all removed if all are listed already, else all missing ones added)  */
    static toggle (surface: keyof State, list: SurfaceList, entry: string | string[]): Promise<State> {
        return BoardState.update((state) => {
            const items = state[surface][list]
            if (Array.isArray(entry)) {
                if (entry.every((e) => items.includes(e)))
                    state[surface][list] = items.filter((e) => !entry.includes(e))
                else
                    items.push(...entry.filter((e) => !items.includes(e)))
                return
            }
            const i = items.indexOf(entry)
            if (i >= 0)
                items.splice(i, 1)
            else
                items.push(entry)
        })
    }

    /*  toggle the showing of task titles, key hints, or standalone tasks  */
    static toggleFlag (surface: keyof State, flag: SurfaceFlag): Promise<State> {
        return BoardState.update((state) => {
            state[surface][flag] = !state[surface][flag]
        })
    }

    /*  set the shown view (lanes, graph, stats, agents, or flow)  */
    static setView (surface: keyof State, view: SurfaceView): Promise<State> {
        return BoardState.update((state) => {
            state[surface].view = view
        })
    }

    /*  set the height weights of lanes, resp. reset them (with null) to the ones of their lane layout  */
    static setHeights (surface: keyof State, entries: Record<string, number | null>): Promise<State> {
        return BoardState.update((state) => {
            state[surface].heights = Object.fromEntries(Object.entries({ ...state[surface].heights, ...entries })
                .filter((entry): entry is [ string, number ] => entry[1] !== null))
        })
    }
}

/*  compute the strongly connected components of a graph (Tarjan)  */
const components = (nodes: string[], pred: Map<string, string[]>): string[][] => {
    const index  = new Map<string, number>()
    const low    = new Map<string, number>()
    const stack  = [] as string[]
    const onStk  = new Set<string>()
    const result = [] as string[][]
    let   next   = 0
    const visit = (n: string): void => {
        index.set(n, next)
        low.set(n, next)
        next++
        stack.push(n)
        onStk.add(n)
        for (const p of pred.get(n) ?? []) {
            if (!index.has(p)) {
                visit(p)
                low.set(n, Math.min(low.get(n)!, low.get(p)!))
            }
            else if (onStk.has(p))
                low.set(n, Math.min(low.get(n)!, index.get(p)!))
        }
        if (low.get(n) === index.get(n)) {
            const comp = [] as string[]
            let m: string
            do {
                m = stack.pop()!
                onStk.delete(m)
                comp.push(m)
            } while (m !== n)
            result.push(comp)
        }
    }
    for (const n of nodes)
        if (!index.has(n))
            visit(n)
    return result
}

/*  the neutral order of cards: by creation time, then by task id  */
export const byCreation = (a: Card, b: Card): number =>
    a.created.localeCompare(b.created) || TaskFormat.compareIds(a.id, b.id)

/*  the label text of a card: the task id and, if existing, its title
    (made safe for the terminal) behind a filled arrow  */
export const cardLabel = (card: Card): string => {
    const title = card.title.replace(/\t/g, " ").replace(/\p{Cc}/gu, "").trim()
    return title !== "" ? `${card.id} ▶ ${title}` : card.id
}

/*  the group label of a card (made safe for the terminal), or empty if it has no group  */
export const groupLabel = (card: Card): string =>
    card.group.replace(/\s+/g, " ").replace(/\p{Cc}/gu, "").trim()

/*  determine whether an attachment type is a diff (like an implementation draft or a change set snapshot)  */
export const isDiff = (type: string): boolean =>
    /^text\/x-diff\s*(?:;|$)/i.test(type.trim())

/*  the tab labels of a task view: the task plan, followed by its attachments
    with the "kind" parameter of their type (if any) behind a filled arrow,
    a "(stale)" marker for a change set snapshot older than the "Modified"
    timestamp of the plan (as it was captured for an earlier plan), and
    their description (if any, cut after 30 characters) behind a hollow arrow
    (all made safe for the terminal)  */
export const attachmentTabs = (atts: { type: string, desc: string, modified?: string }[], modified = ""): string[] => {
    const safe = (s: string) => s.replace(/\t/g, " ").replace(/\p{Cc}/gu, "").trim()
    return [
        "0 ▶ plan",
        ...atts.map((att, i) => {
            const m     = /;\s*kind\s*=\s*(?:"([^"]*)"|([^;\s]+))/i.exec(att.type)
            const kind  = safe(m !== null ? (m[1] ?? m[2]) : "")
            const desc  = safe(att.desc)
            const text  = desc.length > 30 ? desc.slice(0, 30) + "…" : desc
            const stale = isDiff(att.type) && kind === "changeset" && modified !== "" && (att.modified ?? "") < modified
            return `${i + 1}` + (kind !== "" ? ` ▶ ${kind}` : "") + (stale ? " (stale)" : "") + (text !== "" ? ` ▷ ${text}` : "")
        })
    ]
}

/*  classify the lines of a diff: its file headers up to and including the
    hunk headers as "head", and within hunks the inserted lines as "add", the
    removed lines as "del", and the context lines as "ctx"  */
export type DiffTone = "head" | "add" | "del" | "ctx"
export const diffTones = (lines: string[]): DiffTone[] => {
    let hunk = false
    return lines.map((line, i) => {
        if (line.startsWith("diff ") || (line.startsWith("--- ") && (lines[i + 1] ?? "").startsWith("+++ ")))
            hunk = false
        if (line.startsWith("@@"))
            hunk = true
        if (!hunk || line.startsWith("@@"))
            return "head"
        return line.startsWith("+") ? "add" : line.startsWith("-") ? "del" : "ctx"
    })
}

/*  determine the language of an attachment type of structured data in YAML or JSON
    (like "application/yaml", "text/x-yaml", "application/json", or "application/ld+json"),
    or null if it is no such type  */
export type DataLang = "yaml" | "json"
export const dataLang = (type: string): DataLang | null => {
    const m = /^(?:application|text)\/(?:x-|[\w.-]+\+)?(yaml|json)\s*(?:;|$)/i.exec(type.trim())
    return m !== null ? m[1].toLowerCase() as DataLang : null
}

/*  the syntax highlighter of structured data in YAML or JSON (via Shiki, with
    its JavaScript regular expression engine, i.e. without WebAssembly, and
    with an empty theme, as only the TextMate scopes of the tokens are used),
    loaded on demand only once  */
let dataHighlighter: HighlighterCore | null = null
let dataLoading: Promise<void> | null = null
export const dataLoad = (): Promise<void> => {
    if (dataLoading === null) {
        dataLoading = (async () => {
            const [ { createHighlighterCore }, { createJavaScriptRegexEngine }, { bundledLanguages } ] = await Promise.all([
                import("shiki/core"), import("shiki/engine/javascript"), import("shiki/langs")
            ])
            dataHighlighter = await createHighlighterCore({
                themes: [ { name: "ase", type: "dark", settings: [] } ],
                langs:  [ bundledLanguages.yaml, bundledLanguages.json ],
                engine: createJavaScriptRegexEngine()
            })
        })()
    }
    return dataLoading
}

/*  split the text of structured data in YAML or JSON into lines of syntax-highlighting
    spans, by the TextMate scopes of the tokens: mapping keys as "key", strings
    (including block scalar content) as "str", numbers as "num", booleans, nulls,
    anchors, aliases, and tags as "lit", indicators, directives, and document
    markers as "punct", comments as "cmt", and everything else as "text"
    (all as "text" while the highlighter is not loaded yet, see "dataLoad")  */
export type DataTone = "key" | "str" | "num" | "lit" | "punct" | "cmt" | "text"
export type DataSpan = { text: string, tone: DataTone }
const dataScopes: [ DataTone, string[] ][] = [
    [ "cmt",   [ "comment" ] ],
    [ "punct", [ "meta.directive" ] ],
    [ "key",   [ "entity.name.tag", "support.type.property-name" ] ],
    [ "num",   [ "constant.numeric" ] ],
    [ "lit",   [ "constant.language", "meta.property", "keyword.control.flow.alias", "variable.other.alias" ] ],
    [ "str",   [ "string" ] ],
    [ "punct", [ "punctuation", "keyword", "storage", "entity.other.document" ] ]
]
export const dataSpans = (text: string, lang: DataLang): DataSpan[][] => {
    if (dataHighlighter === null)
        return text.split(/\r?\n/).map((line) => [ { text: line, tone: "text" } ])
    const { tokens } = dataHighlighter.codeToTokens(text, { lang, theme: "ase", includeExplanation: "scopeName" })
    return tokens.map((line) => {
        const out = [] as DataSpan[]
        for (const part of line.flatMap((token) => token.explanation ?? [ { content: token.content, scopes: [] } ])) {
            const scopes = part.scopes.map((scope) => scope.scopeName)
            const tone   = dataScopes.find(([ , prefixes ]) => scopes.some((scope) =>
                prefixes.some((prefix) => scope === prefix || scope.startsWith(prefix + "."))))?.[0] ?? "text"
            const last   = out[out.length - 1]
            if (last !== undefined && last.tone === tone)
                last.text += part.content
            else
                out.push({ text: part.content, tone })
        }
        return out
    })
}

/*  the placeholder columns in the task box labels (glued to the following
    word for word-wrapping), in front of the task id, in front of the title,
    and around and within the group (gluing it to the task id)  */
export const glueId    = String.fromCodePoint(0xE000)
export const glueTitle = String.fromCodePoint(0xE001)
export const glueGroup = String.fromCodePoint(0xE002)

/*  word-wrap a text onto at most a maximum number of lines of a width,
    hard-breaking too long words and ending a cut text with an ellipsis  */
export const clampLines = (text: string, width: number, max: number): string[] => {
    const w     = Math.max(1, width)
    const lines = [] as string[]
    for (let word of text.split(/\s+/).filter((s) => s !== "")) {
        const last = lines.length - 1
        if (last >= 0 && lines[last].length + 1 + word.length <= w) {
            lines[last] += " " + word
            continue
        }
        while (word.length > w) {
            lines.push(word.slice(0, w))
            word = word.slice(w)
        }
        if (word !== "")
            lines.push(word)
    }
    if (lines.length > max) {
        lines.length = max
        lines[max - 1] = lines[max - 1].slice(0, w - 1).trimEnd() + "…"
    }
    return lines
}

/*  order the cards of one lane: dependency order among the cards of the
    same lane (ignoring edges within a cycle), with the creation time and
    then the task id breaking ties, and any remainder sorted by task id at the end  */
const orderLane = (cards: Card[], pred: Map<string, string[]>, cyclicEdge: (a: string, b: string) => boolean): Card[] => {
    const ids   = new Set(cards.map((c) => c.id))
    const deg   = new Map<string, number>()
    const tie   = byCreation
    for (const c of cards)
        deg.set(c.id, (pred.get(c.id) ?? []).filter((p) => ids.has(p) && !cyclicEdge(p, c.id)).length)
    const out   = [] as Card[]
    const ready = cards.filter((c) => deg.get(c.id) === 0).sort(tie)
    while (ready.length > 0) {
        const c = ready.shift()!
        out.push(c)
        for (const d of cards) {
            if (!(pred.get(d.id) ?? []).includes(c.id) || cyclicEdge(c.id, d.id))
                continue
            deg.set(d.id, deg.get(d.id)! - 1)
            if (deg.get(d.id) === 0) {
                ready.push(d)
                ready.sort(tie)
            }
        }
    }
    const rest = cards.filter((c) => !out.includes(c)).sort((a, b) => TaskFormat.compareIds(a.id, b.id))
    return [ ...out, ...rest ]
}

/*  build the board of the current project exclusively through the task interface of ASE  */
export const buildBoard = async (log: Log): Promise<Board> => {
    const { lifecycle, items } = await Task.listHeaders(log)
    const groups    = layoutOf(lifecycle)
    const warnings  = [] as string[]

    /*  load all tasks, mapping a status foreign to the lifecycle model onto
        it via the first model knowing the status (else its initial state)  */
    const cards = new Map<string, Card>()
    for (const item of items) {
        const keys   = item.keys
        const after  = [ ...new Set((keys.get("After") ?? "").split(",").map((s) => s.trim()).filter((s) => s !== "")) ]
        const status = TaskFormat.adaptStatus(lifecycle, item.status)
        if (status !== item.status)
            warnings.push(`task "${item.id}" has status "${item.status}" unknown to lifecycle model ` +
                `"${lifecycle.name}" (shown as "${status}")`)
        const group    = (keys.get("Group") ?? "").trim()
        const assignee = (keys.get("Assignee") ?? "").trim()
        const effort   = TaskFormat.parseEffort(keys.get("Effort") ?? "")?.size ?? ""
        const created  = keys.get("Created")  ?? ""
        const modified = keys.get("Modified") ?? ""
        cards.set(item.id, { id: item.id, title: item.title, group, status, actual: item.status, edit: editOf(keys), assignee, effort, after, created, modified })
    }

    /*  derive predecessors (known ones only) and successors  */
    const pred = new Map<string, string[]>()
    const succ = new Map<string, string[]>()
    for (const c of cards.values()) {
        const known = [] as string[]
        for (const p of c.after) {
            if (cards.has(p))
                known.push(p)
            else
                warnings.push(`task "${c.id}" references unknown predecessor "${p}"`)
        }

        /*  an epic (a task being its own group) implicitly comes after all other tasks of its group  */
        if (c.group === c.id)
            for (const m of cards.values())
                if (m.group === c.id && m.id !== c.id && !known.includes(m.id))
                    known.push(m.id)
        pred.set(c.id, known)
        for (const p of known)
            succ.set(p, [ ...(succ.get(p) ?? []), c.id ])
    }

    /*  detect cycles  */
    const cyclic = new Set<string>()
    const sccOf  = new Map<string, number>()
    for (const [ i, comp ] of components([ ...cards.keys() ].sort(), pred).entries()) {
        comp.forEach((id) => sccOf.set(id, i))
        if (comp.length > 1 || (pred.get(comp[0]) ?? []).includes(comp[0])) {
            comp.forEach((id) => cyclic.add(id))
            warnings.push(`tasks ${comp.sort().map((id) => `"${id}"`).join(", ")} form a dependency cycle`)
        }
    }
    const cyclicEdge = (a: string, b: string) => sccOf.get(a) === sccOf.get(b)

    /*  compute the graph levels (longest predecessor path, ignoring cyclic edges)  */
    const levels = new Map<string, number>()
    const level  = (id: string, seen: Set<string>): number => {
        if (levels.has(id))
            return levels.get(id)!
        seen.add(id)
        let l = 0
        for (const p of pred.get(id) ?? [])
            if (!seen.has(p) && !cyclicEdge(p, id))
                l = Math.max(l, level(p, seen) + 1)
        seen.delete(id)
        levels.set(id, l)
        return l
    }
    for (const id of cards.keys())
        level(id, new Set())

    /*  distribute the cards onto the lanes in display order  */
    const lanes = new Map<string, Card[]>()
    for (const g of groups)
        for (const l of g.lanes)
            lanes.set(l.status, orderLane([ ...cards.values() ].filter((c) => c.status === l.status), pred, cyclicEdge))

    return { mode: lifecycle.name, groups, cards, lanes, pred, succ, levels, cyclic, context: new Set(), warnings }
}

/*  classify a card for highlighting: "done" in a lane of a terminal state,
    "active" in an active lane, and "idle" in any other lane  */
export type Tone = "done" | "active" | "idle"
export const toneOf = (board: Board, card: Card): Tone => {
    const lane = board.groups.flatMap((g) => g.lanes).find((l) => l.status === card.status)
    return lane?.kind === "terminal" ? "done" : lane?.active === true ? "active" : "idle"
}

/*  the lane states (except an own lane state) directly or indirectly
    reachable from a status in the lifecycle model  */
const reachableFrom = (board: Board, lifecycle: TaskLifecycle, from: string, own: string): string[] =>
    board.groups.flatMap((g) => g.lanes.map((l) => l.status))
        .filter((to) => to !== own && TaskFormat.checkStatus(lifecycle, from, to) === "")

/*  the lane states a card can be moved to, reachable from its actual status  */
export const reachableStates = (board: Board, lifecycle: TaskLifecycle, card: Card): string[] =>
    reachableFrom(board, lifecycle, card.actual, card.status)

/*  the lane states a task can be moved to from each lane state  */
export const laneMoves = (board: Board, lifecycle: TaskLifecycle): Record<string, string[]> =>
    Object.fromEntries(board.groups.flatMap((g) => g.lanes.map((l) =>
        [ l.status, reachableFrom(board, lifecycle, l.status, l.status) ])))

/*  the lane states a task with an actual status foreign to the lifecycle
    model can be moved to (overriding the moves of its lane state)  */
export const cardMoves = (board: Board, lifecycle: TaskLifecycle, card: Card): string[] | undefined =>
    card.actual === card.status ? undefined : reachableStates(board, lifecycle, card)

/*  the pre-filled text of a new task: all frontmatter keys (the optional ones
    empty, except for the change set flow keys, left out to read their configured
    defaults), the next free id of the task id scheme (derived from the sample title),
    the initial state, and the body template of the task format with a sample
    title, the three sections, and their placeholder items  */
export const newTaskText = async (log: Log, board: Board, lifecycle: TaskLifecycle): Promise<string> => {
    const id  = (await Task.newId(log, "New Task", "new-task", [ ...board.cards.keys() ])).id
    const now = DateTime.now().toFormat("yyyy-LL-dd HH:mm")
    return TaskFormat.formatTaskText({
        header: {
            Type: TaskFormat.TASK_TYPE, Id: id, Created: now, Modified: now, Group: "", Phase: "",
            After: "", Status: lifecycle.initial, Assignee: "", Kind: "", Effort: "", Tags: ""
        },
        body: "#   TASK: New Task\n\n" +
            "##  SPECIFICATION (WHAT)\n\n-   [ ] DOM: **[...]**: [...]\n\n-   [ ] IFC: **[...]**: [...]\n\n" +
            "##  DESIGN (HOW)\n\n-   [ ] ARC: **[...]**: [...]\n\n-   [ ] IMP: **[...]**: [...]\n\n" +
            "##  VERIFICATION (WHEN)\n\n-   [ ] REG: **[...]**: [...]\n\n-   [ ] CON: **[...]**: [...]\n",
        attachment: []
    })
}

/*  the conflict of saving a task which was changed meanwhile, carrying
    its current entity tag, or null if it was deleted meanwhile  */
export class TaskConflict extends Error {
    constructor (public id: string, public tag: string | null) {
        super(`task "${id}" was ${tag === null ? "deleted" : "changed"} meanwhile`)
    }
}

/*  save an edited task text (conditionally with an entity tag, throwing a
    TaskConflict on a mismatch), renaming the task if the "Id:" key of its
    frontmatter was changed (refusing an existing target id before anything
    is saved); returns the resulting task id and a warning (else empty) if
    it does not conform to the task id scheme  */
export const saveTask = async (log: Log, id: string, text: string, tag?: string): Promise<{ id: string, warning: string }> => {
    const next = TaskFormat.taskTextId(text) || id
    if (next !== id) {
        if (!TaskFormat.TASK_ID_RE.test(next))
            throw new Error(`invalid task id "${next}"`)
        if (await Task.source(log, next) !== null)
            throw new Error(`task "${next}" already exists`)
    }
    let warning: string
    try {
        warning = (await Task.save(log, id, text, tag)).warning
    }
    catch (err: unknown) {
        if (err instanceof Problem && err.status === 412)
            throw new TaskConflict(id, (await Task.source(log, id))?.tag ?? null)
        throw err
    }
    if (next !== id)
        warning = (await Task.rename(log, id, next))?.warning ?? ""
    return { id: next, warning }
}

/*  create a task from its text under a new id, refusing an existing id,
    and dropping the frontmatter keys left without a (non-blank) value;
    returns a warning (else empty) if the id does not conform to the task id scheme  */
export const createTask = async (log: Log, id: string, text: string): Promise<string> => {
    if (!TaskFormat.TASK_ID_RE.test(id))
        throw new Error(`invalid task id "${id}"`)
    if (await Task.source(log, id) !== null)
        throw new Error(`task "${id}" already exists`)
    text = text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, (fm) =>
        fm.replace(/^[A-Za-z]+:[ \t]*\r?\n/gm, ""))
    return (await Task.save(log, id, text, undefined, true)).warning
}

/*  watch the configuration files of a local task store (via their existing
    directories, as a file may not exist yet), as its lifecycle model follows them  */
const watchConfigs = (log: Log, onChange: () => void): FSWatcher => {
    const files   = Task.configFiles(log)
    const dirs    = [ ...new Set(files.map((file) => path.dirname(file))) ].filter((d) => fs.existsSync(d))
    const watcher = watch(dirs, {
        ignoreInitial: true,
        depth:         0,
        ignored:       (file, stats) => stats !== undefined && !dirs.includes(file) && !files.includes(file)
    })
    watcher.on("all", () => {
        Task.invalidate()
        onChange()
    })
    watcher.on("error", (err: unknown) => {
        log.write("warning", `board: config watcher: ${err instanceof Error ? err.message : String(err)}`)
    })
    return watcher
}

/*  the kind of the task store and whether it is connected (once opened for a local one)  */
export type StoreState = { kind: "local" | "remote", connected: boolean }

/*  watch the task store for changes and invoke the callback, debounced
    and guarded against re-entrance: by subscribing to the change events of
    the task store (for an in-process one incl. the external changes its storage
    plugin detects, plus its configuration files; for a remote one incl. the
    lifecycle model changes); reports the store state initially and on each
    change of it; returns a function to stop watching  */
export const watchTasks = (log: Log, onChange: () => Promise<void> | void,
    onStore?: (state: StoreState) => void): (() => Promise<void>) => {
    const kind: StoreState["kind"] = Task.isRemote(log) ? "remote" : "local"
    let configs: FSWatcher | null = null
    let timer:   ReturnType<typeof setTimeout> | null = null
    let running  = false
    let pending  = false
    let stopped  = false
    const schedule = (): void => {
        if (stopped)
            return
        if (timer !== null)
            clearTimeout(timer)
        timer = setTimeout(() => {
            timer = null
            fire().catch(() => {})
        }, 150)
    }
    const fire = async (): Promise<void> => {
        if (running) {
            pending = true
            return
        }
        running = true
        try {
            await onChange()
        }
        catch (err: unknown) {
            log.write("warning", `board: refresh failed: ${err instanceof Error ? err.message : String(err)}`)
        }
        finally {
            running = false
            if (pending) {
                pending = false
                schedule()
            }
        }
    }

    /*  the lifecycle model of an in-process task store follows the configuration  */
    if (kind === "local")
        configs = watchConfigs(log, schedule)
    onStore?.({ kind, connected: false })
    const unsubscribe = Task.subscribe(log, schedule, (connected) => {
        if (!stopped)
            onStore?.({ kind, connected })
    })
    return async () => {
        stopped = true
        if (timer !== null)
            clearTimeout(timer)
        unsubscribe()
        await configs?.close()
    }
}

/*  the agents of the project as passed by the agent relay: whether
    the agent relay is connected, and the running agents (by name)  */
export type AgentsState = { connected: boolean, agents: AgentPresence[] }

/*  resolve the agent relay of the project (from the given override, else from
    "project.relay.url"), where a misconfigured one is warned about and ignored  */
const boardRelay = (log: Log, relay: string | undefined): RelaySpec | null => {
    try {
        return relaySpec(log, relay)
    }
    catch (err: unknown) {
        log.write("warning", `board: ${err instanceof Error ? err.message : String(err)} -- agents not shown`)
        return null
    }
}

/*  the names of the requests processed by the agents announced to the agent relay (for their
    suggestion on requesting a task by prompt): "edit" of the editor agent, and the request
    names of the request agents of the definitions (e.g. of "ase agent adhoc")  */
export const requestNames = (state: AgentsState | null): string[] =>
    [ ...new Set((state?.agents ?? []).map((agent) => agent.kind === "editor" ? "edit" : agent.request ?? "")
        .filter((name) => name !== "")) ].sort()

/*  the use of the prompt of a request of a name by the agents announced to the agent relay
    processing it: ignored if ignored by all of them (e.g. the "estimate" requests of "ase
    agent estimator"), optional if optional or ignored by all of them (e.g. the "research"
    requests of "ase agent researcher"), else (also without any such agent) required  */
export const requestPrompt = (state: AgentsState | null, name: string): AgentPrompt => {
    const agents = (state?.agents ?? []).filter((agent) => (agent.kind === "editor" ? "edit" : agent.request ?? "") === name)
    return agents.length === 0 || agents.some((agent) => agent.prompt === undefined) ? "required" :
        agents.every((agent) => agent.prompt === "ignored") ? "ignored" : "optional"
}

/*  whether an agent announced to the agent relay claims tasks by their assignee (for its
    suggestion on assigning a task): not a request agent (which reacts on the requests of
    a task only) and not an unclaimed phase agent (which never claims a task)  */
export const assignable = (agent: AgentPresence): boolean =>
    agent.kind !== "editor" && agent.request === undefined
        && (agent.states === undefined || agent.states.activity !== undefined)

/*  order the agents by name (and id, for equally named agents on different hosts)  */
const byName = (a: AgentPresence, b: AgentPresence): number =>
    a.name.localeCompare(b.name) || a.id.localeCompare(b.id)

/*  fetch the agents of the project once (null without an agent relay)  */
export const fetchAgents = async (log: Log, relay?: string): Promise<AgentsState | null> => {
    const spec = boardRelay(log, relay)
    if (spec === null)
        return null
    try {
        return { connected: true, agents: (await new AgentRelayClient(log, spec).list()).sort(byName) }
    }
    catch (err: unknown) {
        log.write("warning", `board: ${err instanceof Error ? err.message : String(err)}`)
        return { connected: false, agents: [] }
    }
}

/*  watch the agents of the project via the agent relay and invoke the callback initially
    and on each change of them or of the connection state, where no agent relay at all
    is reported once as null; returns a function to stop watching  */
export const watchAgents = (log: Log, relay: string | undefined, onChange: (state: AgentsState | null) => void): (() => void) => {
    const spec = boardRelay(log, relay)
    if (spec === null) {
        onChange(null)
        return () => {}
    }
    let state: AgentsState = { connected: false, agents: [] }
    onChange(state)
    return new AgentRelayClient(log, spec).subscribe((agents) => {
        state = { ...state, agents: agents.sort(byName) }
        onChange(state)
    }, (connected) => {
        state = { ...state, connected }
        onChange(state)
    })
}

/*  a duration (in ms) in its coarsest unit, the label of an agent (its name, with its
    differing kind), its user (its user id with its user name, resp. "n/a" for an
    older agent), its uptime (the duration since its start, measured up to its latest
    heartbeat), and its plain-text status (its uptime, its tasks, else "none" with its
    state, its total and last usage of the agent tool, and its host and process id)  */
export const agentDuration = (ms: number): string => {
    const s = Math.max(0, Math.floor(ms / 1000))
    return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`
}
export const agentLabel = (agent: AgentPresence): string =>
    agent.name !== agent.kind ? `${agent.name} (${agent.kind})` : agent.name
export const agentUser = (agent: AgentPresence): string =>
    agent.user === undefined ? "n/a" :
        `${agent.uid !== undefined && agent.uid >= 0 ? agent.uid : "n/a"} (${agent.user !== "" ? agent.user : "unknown"})`
export const agentUptime = (agent: AgentPresence): string =>
    agentDuration(agent.beat - agent.started)
export const agentStatus = (agent: AgentPresence): string =>
    `uptime: ${agentUptime(agent)} · ` +
    `task: ${agent.tasks.length > 0 ? agent.tasks.join(", ") : `none (${agent.state})`} · ` +
    `usage: ${agentUsage(agent.usage?.total)} (last: ${agentUsage(agent.usage?.last)}) · ` +
    `host: ${agent.host} · pid: ${agent.pid}`

/*  a compact usage of the agent tool: its wall time, its output tokens (with
    a metric suffix), and its costs (in USD), where an unavailable field is "n/a"
    and no usage at all (before the first finished job) is "none"  */
export const agentUsage = (usage: AgentUsage | undefined): string => {
    if (usage === undefined)
        return "none"
    const tok = usage.costToken
    const tokens = tok === null ? "n/a" :
        tok < 1000 ? `${tok}` : tok < 1000 * 1000 ? `${(tok / 1000).toFixed(1)}k` : `${(tok / (1000 * 1000)).toFixed(1)}M`
    const cost = usage.costUSD === null ? "$n/a" : `$${usage.costUSD.toFixed(2)}`
    return `${agentDuration(usage.walltimeSec * 1000)}, ${tokens} tok, ${cost}`
}

/*  the digest of the agents as shown outside the agents view (the agents with their
    states and tasks, and the connection state), for detecting a visible change of them
    (e.g. a mere heartbeat or new processing log lines are none)  */
export const agentsDigest = (state: AgentsState | null | undefined): string =>
    state === undefined ? "" : state === null ? "null" :
        JSON.stringify([ state.connected, state.agents.map((a) => [ a.id, a.kind, a.name, a.mode, a.state, a.tasks ]) ])

/*  the agents busy with each task  */
export const busyAgents = (state: AgentsState | null): Map<string, AgentPresence[]> => {
    const busy = new Map<string, AgentPresence[]>()
    for (const agent of state?.agents ?? [])
        for (const id of agent.tasks)
            busy.set(id, [ ...(busy.get(id) ?? []), agent ])
    return busy
}

/*  the badges of a task, shown on the left part of its top border: the agents busy with
    it (marked "⚉"), else its assignee (if any), marked "⚉" if it is the name of a known
    agent and else "☺" (as a person), each name stripped of its control characters
    (as the agents busy with a task always hold it under their assignee, which
    might differ from their name, the assignee is not shown besides them)  */
export type Badge = { icon: string, name: string }
export const badgesOf = (card: Card, state: AgentsState | null, busy: AgentPresence[] | undefined): Badge[] => {
    const clean = (text: string) => text.replace(/\p{Cc}/gu, "")
    if (busy !== undefined && busy.length > 0)
        return busy.map((agent) => ({ icon: "⚉", name: clean(agent.name) }))
    if (card.assignee === "")
        return []
    const agent = state?.agents.some((a) => a.name === card.assignee) ?? false
    return [ { icon: agent ? "⚉" : "☺", name: clean(card.assignee) } ]
}

