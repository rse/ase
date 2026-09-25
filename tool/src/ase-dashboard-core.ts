/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import path                      from "node:path"
import fs                        from "node:fs"

import { watch }                 from "chokidar"
import picomatch                 from "picomatch"
import lockfile                  from "proper-lockfile"
import writeFileAtomic           from "write-file-atomic"
import YAML                      from "yaml"
import * as v                    from "valibot"

import type Log                  from "./ase-log.js"
import { Task }                  from "./ase-task.js"
import type { TaskLifecycle }    from "./ase-task.js"

/*  a lane of the board: one lifecycle state, whether its tasks are
    actively worked on (otherwise it is a parking lane), its share of
    the group height, and whether it is drawn dashed (for "CANCELLED")  */
export type LaneSpec  = { status: string, active: boolean, weight: number, dashed: boolean }

/*  a group of the board: one phase of the lifecycle model and its lanes  */
export type GroupSpec = { title: string, lanes: LaneSpec[] }

/*  a card of the board: the sticky display number, the task id, its
    lifecycle state, and the data needed for ordering and the graph  */
export type Card = { num: number, id: string, status: string, after: string[], created: string }

/*  the board: the lane layout of the detected lifecycle model, the cards
    per lane in display order, the computed graph, and all diagnostics  */
export type Board = {
    mode:     string
    groups:   GroupSpec[]
    cards:    Map<string, Card>
    lanes:    Map<string, Card[]>
    pred:     Map<string, string[]>
    succ:     Map<string, string[]>
    levels:   Map<string, number>
    cyclic:   Set<string>
    warnings: string[]
}

/*  the per-surface view state: minimized lanes and collapsed groups  */
export type Surface = { minimized: string[], collapsed: string[] }

/*  the persisted dashboard state of a project  */
export type State = { numbers: Record<string, number>, cli: Surface, web: Surface }

/*  shorthand for a lane specification  */
const lane = (status: string, active: boolean, weight: number): LaneSpec =>
    ({ status, active, weight, dashed: status === "CANCELLED" })

/*  the fixed lane layouts per lifecycle model, mirroring the drawing
    "docs/task-states.graffle": within a group the entry state comes
    first, the active state second, and the parking state last, while the
    finished states form the final group "Done"  */
export const laneLayouts: Record<string, GroupSpec[]> = {
    solo: [
        { title: "1 Work in Progress", lanes: [ lane("OPEN",         true,  2), lane("SHELVED",   false, 1) ] },
        { title: "Done",               lanes: [ lane("CLOSED",       false, 2), lane("CANCELLED", false, 1) ] }
    ],
    team: [
        { title: "1 Planning",         lanes: [ lane("PLANNING",     true,  2), lane("SHELVED",   false, 1) ] },
        { title: "2 Implementation",   lanes: [ lane("IMPLEMENTING", true,  2), lane("STALLED",   false, 1) ] },
        { title: "Done",               lanes: [ lane("IMPLEMENTED",  false, 2), lane("CANCELLED", false, 1) ] }
    ],
    enterprise: [
        { title: "1 Planning",         lanes: [ lane("DRAFTED",     false, 2), lane("PLANNING",     true, 2), lane("SHELVED",  false, 1) ] },
        { title: "2 Implementation",   lanes: [ lane("PLANNED",     false, 2), lane("IMPLEMENTING", true, 2), lane("STALLED",  false, 1) ] },
        { title: "3 Approval",         lanes: [ lane("IMPLEMENTED", false, 2), lane("APPROVING",    true, 2), lane("DECLINED", false, 1) ] },
        { title: "4 Integration",      lanes: [ lane("APPROVED",    false, 2), lane("INTEGRATING",  true, 2), lane("DEFERRED", false, 1) ] },
        { title: "Done",               lanes: [ lane("INTEGRATED",  false, 2), lane("CANCELLED",    false, 1) ] }
    ]
}

/*  resolve the lane layout of a lifecycle model and check it against the
    model, so every state of the model occurs in exactly one lane  */
export const layoutOf = (lifecycle: TaskLifecycle): GroupSpec[] => {
    const groups = laneLayouts[lifecycle.name]
    if (groups === undefined)
        throw new Error(`dashboard: no lane layout for lifecycle model "${lifecycle.name}"`)
    const seen    = groups.flatMap((g) => g.lanes.map((l) => l.status))
    const missing = lifecycle.states.filter((s) => !seen.includes(s))
    const extra   = seen.filter((s, i) => !lifecycle.states.includes(s) || seen.indexOf(s) !== i)
    if (missing.length > 0 || extra.length > 0)
        throw new Error(`dashboard: lane layout of lifecycle model "${lifecycle.name}" does not match ` +
            `its states (missing: ${missing.join(", ") || "none"}, surplus: ${extra.join(", ") || "none"})`)
    return groups
}

/*  split a height into integer shares by weights, where the remainder
    of the division goes to the first share  */
export const splitHeight = (total: number, weights: number[]): number[] => {
    const sum = weights.reduce((n, w) => n + w, 0)
    if (sum <= 0 || total <= 0)
        return weights.map(() => 0)
    const hs = weights.map((w) => Math.floor(total * w / sum))
    hs[0] += total - hs.reduce((n, h) => n + h, 0)
    return hs
}

/*  the valibot schema of the persisted dashboard state  */
const surfaceSchema = v.object({
    minimized: v.optional(v.array(v.string()), []),
    collapsed: v.optional(v.array(v.string()), [])
})
const stateSchema = v.object({
    numbers: v.optional(v.record(v.string(), v.pipe(v.number(), v.integer(), v.minValue(1))), {}),
    cli:     v.optional(surfaceSchema, { minimized: [], collapsed: [] }),
    web:     v.optional(surfaceSchema, { minimized: [], collapsed: [] })
})

/*  reusable functionality: the persisted per-project dashboard state in
    ".ase/dashboard.yaml", holding the sticky card numbers and the view
    state of the CLI and web surfaces, which is display state only and
    hence never written into any task  */
export class DashboardState {
    /*  resolve the state file of the current project  */
    static filename (): string {
        return path.join(Task.projectRoot(), ".ase", "dashboard.yaml")
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
        const file = DashboardState.filename()
        return DashboardState.parse(fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "")
    }

    /*  update the state under a cross-process lock, writing the file only
        if its content actually changed; returns the updated state  */
    static update (fn: (state: State) => void): State {
        const file = DashboardState.filename()
        fs.mkdirSync(path.dirname(file), { recursive: true })
        if (!fs.existsSync(file))
            fs.writeFileSync(file, "", "utf8")
        const release = lockfile.lockSync(file)
        try {
            const before = fs.readFileSync(file, "utf8")
            const state  = DashboardState.parse(before)
            fn(state)
            const after  = YAML.stringify(state)
            if (after !== before)
                writeFileAtomic.sync(file, after, { encoding: "utf8" })
            return state
        }
        finally {
            release()
        }
    }

    /*  toggle an entry of a surface list (minimized lanes or collapsed groups)  */
    static toggle (surface: "cli" | "web", list: keyof Surface, entry: string): State {
        return DashboardState.update((state) => {
            const items = state[surface][list]
            const i     = items.indexOf(entry)
            if (i >= 0)
                items.splice(i, 1)
            else
                items.push(entry)
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

/*  order the cards of one lane: dependency order among the cards of the
    same lane, with the creation time and then the task id breaking ties,
    and any cyclic remainder sorted by task id at the end  */
const orderLane = (cards: Card[], pred: Map<string, string[]>, cyclic: Set<string>): Card[] => {
    const ids   = new Set(cards.map((c) => c.id))
    const deg   = new Map<string, number>()
    const tie   = (a: Card, b: Card) => a.created.localeCompare(b.created) || a.id.localeCompare(b.id)
    for (const c of cards)
        deg.set(c.id, (pred.get(c.id) ?? []).filter((p) => ids.has(p) && !(cyclic.has(p) && cyclic.has(c.id))).length)
    const out   = [] as Card[]
    const ready = cards.filter((c) => deg.get(c.id) === 0).sort(tie)
    while (ready.length > 0) {
        const c = ready.shift()!
        out.push(c)
        for (const d of cards) {
            if (!(pred.get(d.id) ?? []).includes(c.id) || (cyclic.has(c.id) && cyclic.has(d.id)))
                continue
            deg.set(d.id, deg.get(d.id)! - 1)
            if (deg.get(d.id) === 0) {
                ready.push(d)
                ready.sort(tie)
            }
        }
    }
    const rest = cards.filter((c) => !out.includes(c)).sort((a, b) => a.id.localeCompare(b.id))
    return [ ...out, ...rest ]
}

/*  build the board of the current project exclusively through the task
    interface of ASE, assigning sticky display numbers on the way  */
export const buildBoard = (log: Log): Board => {
    const lifecycle = Task.lifecycle(log)
    const groups    = layoutOf(lifecycle)
    const warnings  = [] as string[]

    /*  load all tasks  */
    const cards = new Map<string, Card>()
    for (const item of Task.list(log)) {
        const parts = Task.parts(log, item.id)
        const keys  = parts?.keys ?? new Map<string, string>()
        const after = (keys.get("After") ?? "").split(",").map((s) => s.trim()).filter((s) => s !== "")
        cards.set(item.id, { num: 0, id: item.id, status: item.status, after, created: keys.get("Created") ?? "" })
        if (!lifecycle.states.includes(item.status))
            warnings.push(`task "${item.id}" has status "${item.status}" unknown to lifecycle model "${lifecycle.name}"`)
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
        pred.set(c.id, known)
        for (const p of known)
            succ.set(p, [ ...(succ.get(p) ?? []), c.id ])
    }

    /*  detect cycles  */
    const cyclic = new Set<string>()
    for (const comp of components([ ...cards.keys() ].sort(), pred)) {
        if (comp.length > 1 || (pred.get(comp[0]) ?? []).includes(comp[0])) {
            comp.forEach((id) => cyclic.add(id))
            warnings.push(`tasks ${comp.sort().map((id) => `"${id}"`).join(", ")} form a dependency cycle`)
        }
    }

    /*  compute the graph levels (longest predecessor path, ignoring cyclic edges)  */
    const levels = new Map<string, number>()
    const level  = (id: string, seen: Set<string>): number => {
        if (levels.has(id))
            return levels.get(id)!
        seen.add(id)
        let l = 0
        for (const p of pred.get(id) ?? [])
            if (!seen.has(p) && !(cyclic.has(p) && cyclic.has(id)))
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
            lanes.set(l.status, orderLane([ ...cards.values() ].filter((c) => c.status === l.status), pred, cyclic))

    /*  assign sticky display numbers: a task keeps its number while it
        exists, a new task receives the smallest free number  */
    const display = [ ...lanes.values() ].flat().map((c) => c.id)
    const others  = [ ...cards.keys() ].filter((id) => !display.includes(id)).sort()
    const state   = DashboardState.update((s) => {
        s.numbers  = Object.fromEntries(Object.entries(s.numbers).filter(([ id ]) => cards.has(id)))
        const used = new Set(Object.values(s.numbers))
        let   free = 1
        for (const id of [ ...display, ...others ]) {
            if (s.numbers[id] !== undefined)
                continue
            while (used.has(free))
                free++
            s.numbers[id] = free
            used.add(free)
        }
    })
    for (const c of cards.values())
        c.num = state.numbers[c.id] ?? 0

    return { mode: lifecycle.name, groups, cards, lanes, pred, succ, levels, cyclic, warnings }
}

/*  classify a card for highlighting: "done" in the final "Done" group,
    "active" in an active lane, and "idle" in any other lane  */
export type Tone = "done" | "active" | "idle"
export const toneOf = (board: Board, card: Card): Tone => {
    const last = board.groups[board.groups.length - 1]
    if (last.lanes.some((l) => l.status === card.status))
        return "done"
    return board.groups.some((g) => g.lanes.some((l) => l.active && l.status === card.status)) ? "active" : "idle"
}

/*  resolve a display number to its task id, or undefined if unknown  */
export const resolveNumber = (num: number): string | undefined => {
    const numbers = DashboardState.load().numbers
    return Object.keys(numbers).find((id) => numbers[id] === num)
}

/*  watch the local task storage for changes and invoke the callback,
    debounced and guarded against re-entrance; the storage directory and
    file pattern are resolved through the task interface, never assumed;
    returns a function to stop watching  */
export const watchTasks = (log: Log, onChange: () => Promise<void> | void): (() => Promise<void>) => {
    const dir     = Task.baseDir(log)
    const match   = picomatch(Task.files(log), { dot: true })
    const watcher = watch(dir, {
        ignoreInitial: true,
        depth:         0,
        ignored:       (file, stats) => stats?.isFile() === true && !match(path.basename(file))
    })
    let timer:   ReturnType<typeof setTimeout> | null = null
    let running  = false
    let pending  = false
    const schedule = (): void => {
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
            log.write("warning", `dashboard: refresh failed: ${err instanceof Error ? err.message : String(err)}`)
        }
        finally {
            running = false
            if (pending) {
                pending = false
                schedule()
            }
        }
    }
    watcher.on("all", schedule)
    watcher.on("error", (err: unknown) => {
        log.write("warning", `dashboard: watcher: ${err instanceof Error ? err.message : String(err)}`)
    })
    return async () => {
        if (timer !== null)
            clearTimeout(timer)
        await watcher.close()
    }
}
