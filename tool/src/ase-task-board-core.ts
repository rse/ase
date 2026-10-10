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

import type Log                  from "./ase-lib-log.js"
import { ensureAseGitignore }    from "./ase-config-scope.js"
import { Task }                  from "./ase-task.js"
import { Problem }               from "./ase-task-store-core.js"
import type { TaskLifecycle }    from "./ase-task-format.js"
import * as TaskFormat           from "./ase-task-format.js"

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
    state if foreign to the lifecycle model), and the data needed for ordering and the graph  */
export type Card = { id: string, title: string, group: string, status: string, actual: string, after: string[], created: string }

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

/*  the per-surface view state: the shown view, minimized lanes, collapsed groups, and
    whether the task titles, the key hints, and the standalone tasks of the graph are shown  */
export type Surface     = { view: SurfaceView, minimized: string[], collapsed: string[], titles: boolean, keys: boolean, standalone: boolean }
export type SurfaceView = "lanes" | "graph"
export type SurfaceList = "minimized" | "collapsed"
export type SurfaceFlag = "titles" | "keys" | "standalone"

/*  the persisted board state of a project  */
export type State = { tui: Surface, web: Surface }

/*  shorthand for a lane specification  */
const lane = (status: string, active: boolean, weight: number): LaneLayout =>
    ({ status, active, weight, dashed: status === "CANCELLED" })

/*  the fixed lane layouts per lifecycle model, mirroring the drawing
    "docs/task-states.graffle": within a group the entry state comes
    first, the active state second, and the parking state last, while the
    finished states form the final group "Done"  */
export const laneLayouts: Record<string, GroupLayout[]> = {
    solo: [
        { title: "1 - Work in Progress", lanes: [ lane("OPEN",         true,  2), lane("SHELVED",   false, 1) ] },
        { title: "2 - Done",             lanes: [ lane("CLOSED",       false, 2), lane("CANCELLED", false, 1) ] }
    ],
    team: [
        { title: "1 - Planning",         lanes: [ lane("PLANNING",     true,  2), lane("SHELVED",   false, 1) ] },
        { title: "2 - Implementation",   lanes: [ lane("IMPLEMENTING", true,  2), lane("STALLED",   false, 1) ] },
        { title: "3 - Done",             lanes: [ lane("IMPLEMENTED",  false, 2), lane("CANCELLED", false, 1) ] }
    ],
    enterprise: [
        { title: "1 - Planning",         lanes: [ lane("DRAFTED",     false, 2), lane("PLANNING",     true, 2), lane("SHELVED",  false, 1) ] },
        { title: "2 - Implementation",   lanes: [ lane("PLANNED",     false, 2), lane("IMPLEMENTING", true, 2), lane("STALLED",  false, 1) ] },
        { title: "3 - Approval",         lanes: [ lane("IMPLEMENTED", false, 2), lane("APPROVING",    true, 2), lane("DECLINED", false, 1) ] },
        { title: "4 - Integration",      lanes: [ lane("APPROVED",    false, 2), lane("INTEGRATING",  true, 2), lane("DEFERRED", false, 1) ] },
        { title: "5 - Done",             lanes: [ lane("INTEGRATED",  false, 2), lane("CANCELLED",    false, 1) ] }
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

/*  split a height into integer shares by weights, where each positively
    weighted share first gets a minimum (as far as the total allows), the
    rest is split by weights, and the remainder goes to the first such share  */
export const splitHeight = (total: number, weights: number[], min = 0): number[] => {
    const sum = weights.reduce((n, w) => n + w, 0)
    if (sum <= 0 || total <= 0)
        return weights.map(() => 0)
    const n    = weights.filter((w) => w > 0).length
    const base = Math.min(min, Math.floor(total / n))
    const rest = total - base * n
    const hs   = weights.map((w) => w > 0 ? base + Math.floor(rest * w / sum) : 0)
    hs[weights.findIndex((w) => w > 0)] += total - hs.reduce((n, h) => n + h, 0)
    return hs
}

/*  the valibot schema of the persisted board state  */
const surfaceSchema = v.object({
    view:       v.optional(v.picklist([ "lanes", "graph" ]), "lanes"),
    minimized:  v.optional(v.array(v.string()), []),
    collapsed:  v.optional(v.array(v.string()), []),

    /*  (a string of an older state file maps "all" onto true, else false)  */
    titles:     v.optional(v.pipe(v.union([ v.boolean(), v.string() ]),
        v.transform((t) => typeof t === "boolean" ? t : t === "all")), false),
    keys:       v.optional(v.boolean(), true),
    standalone: v.optional(v.boolean(), true)
})
const stateSchema = v.object({
    tui: v.optional(surfaceSchema, { view: "lanes", minimized: [], collapsed: [], titles: false, keys: true, standalone: true }),
    web: v.optional(surfaceSchema, { view: "lanes", minimized: [], collapsed: [], titles: false, keys: true, standalone: true })
})

/*  reusable functionality: the persisted per-project board state in
    ".ase/board.yaml", holding the view state of the TUI and web
    surfaces, which is display state only and hence never written into any task  */
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

    /*  toggle an entry of a surface list (minimized lanes or collapsed groups)  */
    static toggle (surface: "tui" | "web", list: SurfaceList, entry: string): Promise<State> {
        return BoardState.update((state) => {
            const items = state[surface][list]
            const i     = items.indexOf(entry)
            if (i >= 0)
                items.splice(i, 1)
            else
                items.push(entry)
        })
    }

    /*  toggle the showing of task titles, key hints, or standalone tasks  */
    static toggleFlag (surface: "tui" | "web", flag: SurfaceFlag): Promise<State> {
        return BoardState.update((state) => {
            state[surface][flag] = !state[surface][flag]
        })
    }

    /*  set the shown view (lanes or graph)  */
    static setView (surface: "tui" | "web", view: SurfaceView): Promise<State> {
        return BoardState.update((state) => {
            state[surface].view = view
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

/*  the tab labels of a task view: the task plan, followed by its attachments
    with the "kind" parameter of their type (if any) behind a filled arrow and
    their description (if any, cut after 30 characters) behind a hollow arrow
    (all made safe for the terminal)  */
export const attachmentTabs = (atts: { type: string, desc: string }[]): string[] => {
    const safe = (s: string) => s.replace(/\t/g, " ").replace(/\p{Cc}/gu, "").trim()
    return [
        "0 ▶ plan",
        ...atts.map((att, i) => {
            const m    = /;\s*kind\s*=\s*(?:"([^"]*)"|([^;\s]+))/i.exec(att.type)
            const kind = safe(m !== null ? (m[1] ?? m[2]) : "")
            const desc = safe(att.desc)
            const text = desc.length > 30 ? desc.slice(0, 30) + "…" : desc
            return `${i + 1}` + (kind !== "" ? ` ▶ ${kind}` : "") + (text !== "" ? ` ▷ ${text}` : "")
        })
    ]
}

/*  determine whether an attachment type is an implementation draft diff  */
export const isDraftDiff = (type: string): boolean =>
    /^text\/x-diff\s*(?:;|$)/i.test(type.trim()) && /;\s*kind\s*=\s*"?draft"?\s*(?:;|$)/i.test(type)

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
        let   status = item.status
        if (!lifecycle.states.includes(status)) {
            const source = Object.values(TaskFormat.taskLifecycles).find((m) => m.states.includes(status))
            status = source !== undefined ? TaskFormat.mapStatus(source, lifecycle, status) : lifecycle.initial
            warnings.push(`task "${item.id}" has status "${item.status}" unknown to lifecycle model ` +
                `"${lifecycle.name}" (shown as "${status}")`)
        }
        const group  = (keys.get("Group") ?? "").trim()
        cards.set(item.id, { id: item.id, title: item.title, group, status, actual: item.status, after, created: keys.get("Created") ?? "" })
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
            After: "", Status: lifecycle.initial, Assignee: "", Kind: "", Tags: ""
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
        warning = await Task.save(log, id, text, tag)
    }
    catch (err: unknown) {
        if (err instanceof Problem && err.status === 412)
            throw new TaskConflict(id, (await Task.source(log, id))?.tag ?? null)
        throw err
    }
    if (next !== id)
        warning = await Task.rename(log, id, next) ?? ""
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
    return Task.save(log, id, text, undefined, true)
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

