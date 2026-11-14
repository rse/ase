/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

/*  the model of the browser client of the web board: the types of the board,
    the reactive state shared by all components, and the access to the service  */
import { ref, shallowRef, reactive, computed, nextTick, watch } from "vue"

/*  the state of the edit requests of a task (see "ase agent editor"): requested, being processed, or failed  */
export type EditState = "pending" | "active" | "failed"

/*  the board model and task details, as delivered by the service  */
export type Card    = { id: string, title: string, group: string, tone: string, moves?: string[], edit: EditState | "", finished: boolean, assignee: string, effort: string }
export type Lane    = { status: string, active: boolean, weight: number, dashed: boolean, kind: "initial" | "regular" | "terminal", cards: Card[] }
export type Group   = { title: string, lanes: Lane[] }
export type Surface = { view: View, minimized: string[], collapsed: string[], titles: boolean, keys: boolean, standalone: boolean }
export type Board   = { mode: string, project: string, version: string, warnings: string[], users: string[], self: string, surface: Surface, moves: Record<string, string[]>, groups: Group[] }
export type Tone    = "active" | "done" | "idle"
export type Ref     = { id: string, tone: Tone }
export type Task    = { id: string, title: string, tone: Tone, status: string, group: string, epic: string, doc: string, plan: { keys: [ string, string ][], body: string }, tabs: string[], pred: Ref[], succ: Ref[] }
export type View    = "lanes" | "graph" | "stats" | "agents" | "flow"

/*  the displayed names of the views (the persisted view ids being kept short)  */
export const viewLabels: Record<View, string> = {
    lanes:  "task-lanes",
    graph:  "task-graph",
    stats:  "statistics",
    agents: "agent-logs",
    flow:   "agent-graph"
}

/*  the cycle order of the views (with the agent views only with an agent relay), and
    the action of the key hint cycling them forward ("v") and backward ("V")  */
export const viewOrder = (relay: boolean): View[] =>
    relay ? [ "lanes", "graph", "stats", "agents", "flow" ] : [ "lanes", "graph", "stats" ]
export const viewCycleHint = (v: View, relay: boolean): string => {
    const views = viewOrder(relay)
    const i     = views.indexOf(v)
    return `view ${viewLabels[views[(i + 1) % views.length]]}/${viewLabels[views[(i + views.length - 1) % views.length]]}`
}

/*  the statistics of the dependency graph: its numbers of tasks and dependencies  */
export type GraphStats = { tasks: number, dependencies: number }

/*  the statistics of the agent graph: its numbers of agents and lifecycle states  */
export type FlowStats  = { agents: number, states: number }

/*  the statistics of the tasks (see the statistics view): its time range (all tasks, resp. the
    tasks of the last 30 or 7 days), the tasks per lifecycle state (with its phase, tone, and
    effort, i.e., the human minutes of the estimated tasks, and the numbers of the estimated
    and of all tasks), their progress, the readiness of the open tasks, the distribution of
    their effort sizes (the number of tasks per size), their total AI usage (times in minutes,
    costs in USD), the tasks of the highest usage, the efficiency of the AI usage, the
    finished tasks of the last weeks (oldest first), and the forecast of the backlog, with
    the number of days of the time range "total", and whether any usage data is tracked  */
export type StatsRange  = "total" | "30d" | "7d"
export type StatsUsage  = { timeAI: number, timeHR: number, timeReal: number, cread: number, cwrite: number, input: number, output: number, costAI: number, costHR: number }
export type StatsEffort = { minutes: number, estimated: number, tasks: number }
export type BoardStats  = {
    range:      StatsRange
    days:       number
    tracked:    boolean
    states:     { phase: string, status: string, count: number, tone: Tone, effort: StatsEffort }[]
    progress:   { finished: number, cancelled: number, wip: number, open: number }
    readiness:  { ready: number, blocked: number }
    sizes:      { size: string, count: number }[]
    usage:      StatsUsage
    top:        { id: string, title: string, tone: Tone, cost: number, input: number, output: number, share: number }[]
    efficiency: { timeRatio: number | null, costRatio: number | null, cacheRatio: number | null, costAI: number, costHR: number, input: number, output: number, leadMedian: number | null, leadP85: number | null }
    throughput: { week: number, start: string, count: number }[]
    forecast:   { backlog: number, weeks: number | null }
}

/*  the agents passed by the agent relay: whether the agent relay is connected, and the
    running agents (with their usage of the agent tool, but without their processing log lines), and, separately, the processing
    log lines added per agent (a delta to be appended, or a reset with all its lines)  */
export type AgentLine  = { time: number, level: "error" | "warning" | "info", task: string, msg: string }
export type AgentUsage = { walltimeSec: number, costToken: number | null, costUSD: number | null }
export type AgentFlow  = { input: string[], activity?: string, output: string[], gate?: string }
export type Agent      = { id: string, kind: string, name: string, mode?: string, title?: string, description?: string, request?: string, prompt?: "optional" | "ignored", states?: AgentFlow, host: string, pid: number, cwd?: string, user?: string, uid?: number, started?: number, state: "waiting" | "busy", tasks: string[], usage?: { total: AgentUsage, last: AgentUsage } | null, since: number, beat: number }
export type Agents     = { connected: boolean, agents: Agent[] }
export type AgentLogs  = Record<string, { reset: boolean, lines: AgentLine[] }>

/*  the key bindings of the task plan editor (see "board.web.editor.keymap")  */
export type Keymap  = "default" | "vim" | "emacs"

/*  the notice of the task plan editor: a restorable draft, a confirmation to
    discard the changes (before leaving the editor or also the dialog), a save
    conflict (with the current entity tag, or null if deleted meanwhile), or a save error  */
export type Notice  =
    { kind: "draft", draft: string } |
    { kind: "discard", close: boolean } |
    { kind: "conflict", message: string, base: string | null } |
    { kind: "error", message: string }

/*  the selection: group, lane, and card id ("" for a lane without card focus)  */
export type Sel     = { g: number, l: number, id: string }

/*  the navigable items of a group: one per card, or one per lane
    which is minimized, empty, or within a collapsed phase  */
export const groupItems = (b: Board, g: number, s: Surface): Sel[] => {
    const out  = [] as Sel[]
    const coll = s.collapsed.includes(b.groups[g].title)
    b.groups[g].lanes.forEach((lane, l) => {
        if (coll || s.minimized.includes(lane.status) || lane.cards.length === 0)
            out.push({ g, l, id: "" })
        else
            lane.cards.forEach((c) => out.push({ g, l, id: c.id }))
    })
    return out
}

/*  the lane states of a lane row: the lanes at the same position in all expanded phases  */
export const rowLanes = (b: Board, s: Surface, l: number): string[] =>
    b.groups.filter((g) => l < g.lanes.length && !s.collapsed.includes(g.title)).map((g) => g.lanes[l].status)

/*  re-locate a selection on a (possibly changed) board: a selected card
    is followed into its current lane, otherwise the lane is kept  */
export const relocate = (b: Board, sel: Sel, s: Surface): Sel => {
    if (sel.id !== "")
        for (let g = 0; g < b.groups.length; g++) {
            const l = b.groups[g].lanes.findIndex((lane) => lane.cards.some((c) => c.id === sel.id))
            if (l >= 0)
                return s.minimized.includes(b.groups[g].lanes[l].status) || s.collapsed.includes(b.groups[g].title) ?
                    { g, l, id: "" } : { g, l, id: sel.id }
        }
    const g     = Math.min(sel.g, b.groups.length - 1)
    const items = groupItems(b, g, s)
    return items.find((it) => it.l === sel.l) ?? items[0]
}

/*  the requests in progress (by sequence number, with their label), and the modal
    busy popup, shown once the oldest of them lasts longer than 800ms  */
type BusyLabel = { text: string, id?: string, suffix?: string }
const pending = new Map<number, BusyLabel>()
let   pendSeq = 0
export const busy = ref<{ label: BusyLabel, since: number } | null>(null)
const busyNow = ref(Date.now())
let   busyTimer = null as ReturnType<typeof setInterval> | null
watch(busy, (b) => {
    if (b !== null && busyTimer === null)
        busyTimer = setInterval(() => { busyNow.value = Date.now() }, 100)
    else if (b === null && busyTimer !== null) {
        clearInterval(busyTimer)
        busyTimer = null
    }
})
export const busyTime = computed(() => busy.value === null ? "" : `${(Math.max(0, busyNow.value - busy.value.since) / 1000).toFixed(1)}s`)

/*  the label of a request to the service, for the busy popup: its text, the
    optional task id (rendered inverse), and an optional suffix  */
const busyLabel = (url: string, opts?: RequestInit): BusyLabel => {
    const name = /\/api\/([a-z]+)/.exec(url)?.[1] ?? ""
    if (name === "move" && typeof opts?.body === "string") {
        const { id, status } = JSON.parse(opts.body) as { id: string, status: string }
        return { text: "moving task", id, suffix: `to ${status}` }
    }
    const fixed: Record<string, string> = {
        board:  "loading tasks",
        graph:  "loading graph",
        flow:   "loading agent graph",
        stats:  "loading statistics",
        new:    "preparing new task",
        toggle: "saving board state"
    }
    if (Object.hasOwn(fixed, name))
        return { text: fixed[name] }
    const method = opts?.method ?? "GET"
    const edit   = /\/api\/task\/([^/?]+)\/edit$/.exec(url)?.[1]
    const req    = /\/api\/task\/([^/?]+)\/request$/.exec(url)?.[1]
    if (req !== undefined)
        return { text: "requesting task", id: decodeURIComponent(req) }
    if (edit !== undefined)
        return { text: "loading edit prompt of task", id: decodeURIComponent(edit) }
    const text   = method === "DELETE" ? "deleting" : method !== "GET" ? "saving" : "loading"
    const id     = /\/api\/task\/([^/?]+)/.exec(url)?.[1]
    return id !== undefined ? { text: `${text} task`, id: decodeURIComponent(id) } : { text }
}

/*  fetch a JSON response of the service (tracked for the busy popup, unless in the background)  */
type Result<T> = (T & { error?: undefined }) | { error: string }
export const api = async <T>(url: string, opts?: RequestInit, background = false): Promise<Result<T>> => {
    const n = background ? 0 : ++pendSeq
    let timer = null as ReturnType<typeof setTimeout> | null
    if (n > 0) {
        pending.set(n, busyLabel(url, opts))
        timer = setTimeout(() => {
            busy.value ??= { label: pending.values().next().value ?? { text: "" }, since: Date.now() - 800 }
        }, 800)
    }
    try {
        return await (await fetch(url, opts)).json()
    }
    catch (err: unknown) {
        return { error: err instanceof Error ? err.message : String(err) }
    }
    finally {
        if (n > 0) {
            clearTimeout(timer!)
            pending.delete(n)
            const next = pending.values().next()
            if (busy.value !== null)
                busy.value = next.done === true ? null : { ...busy.value, label: next.value }
        }
    }
}

/*  stamp the color theme of the page (see "board.web.theme") onto a
    standalone document, so that it renders in the theme right away  */
export const themed = (doc: string): string =>
    doc.replace(/<html\b/, `<html data-theme="${document.documentElement.dataset.theme ?? "auto"}"`)

/*  the state of the page  */
export const board       = ref<Board | null>(null)
export const boardError  = ref<string | null>(null)
export const actionError = ref<string | null>(null)
export const actionNote  = ref<string | null>(null)
export const view        = ref<View>("lanes")
export const graph       = ref("")
export const graphStats  = ref<GraphStats | null>(null)
export const flow        = ref("")
export const flowStats   = ref<FlowStats | null>(null)
export const flowSel     = ref("")
export const stats       = ref<BoardStats | null>(null)
export const statsError  = ref<string | null>(null)
export const statsRange  = ref<StatsRange>("total")
export const task        = ref<Task | null>(null)
export const sel         = ref<Sel>({ g: 0, l: 0, id: "" })
export const grow        = ref(false)
export const editing     = ref<{ id: string, orig: string, base: string, keymap: Keymap, dirty: boolean, direct: boolean } | null>(null)
export const notice      = ref<Notice | null>(null)
export const confirmDel  = ref<string | null>(null)
export const transfer    = ref<{ id: string, at: string } | null>(null)
export const assign      = ref<{ id: string, name: string, typed: string } | null>(null)
export const prompt      = ref<{ id: string, text: string, name: string | null } | null>(null)
export const scroll      = reactive({ all: true, info: "" })
export const tab         = ref(0)
export const tabDocs     = ref<Record<number, string>>({})
export const taskDiff    = ref<string | null>(null)
export const tabScroll   = reactive({ less: false, more: false })
export const tabScrolls  = new Map<number, number>()
export const filter      = ref("")

/*  the task of the task viewer (if any), and why it is currently not shown  */
export const watched     = new URLSearchParams(window.location.search).get("task")
export const watchError  = ref<string | null>(null)
let   query       = ""
let   openId      = watched
let   openSeq     = 0
let   reloadSeq   = 0
let   graphSeq    = 0
let   flowSeq     = 0
let   statsSeq    = 0

/*  the elements of the page used by more than the component rendering them  */
export const boardEl     = ref<HTMLElement | null>(null)
export const graphEl     = ref<HTMLElement | null>(null)
export const flowEl      = ref<HTMLElement | null>(null)
export const planEl      = ref<HTMLIFrameElement | null>(null)
export const tabsEl      = ref<HTMLElement | null>(null)
export const filterEl    = ref<HTMLInputElement | null>(null)

/*  drag & drop a task box onto another lane, changing the task status: only
    lanes whose state is reachable in the lifecycle model accept the drop
    (from the actual status of the task, if it is foreign to the model),
    where a task carried by the keyboard (SPACE) is marked as "key"  */
export const drag = ref<{ id: string, from: string, moves?: string[], over: string | null, key?: boolean } | null>(null)

/*  the agents passed by the agent relay, as reported by the service (null without an agent relay)  */
export const agents      = shallowRef<Agents | null>(null)
export const agentsKnown = ref(false)

/*  the recent processing log lines per agent (keeping the most recent ones only), held apart
    from the agents and replaced as a whole on each change, so that their frequent changes
    re-render only the agent log (see AgentLog), and neither the lanes nor the agents  */
const AGENT_LOG_MAX = 100
export const agentLogs = shallowRef(new Map<string, AgentLine[]>())
const applyAgents = (next: Agents | null) => {
    agents.value = next
    const present = new Set(next?.agents.map((a) => a.id) ?? [])
    if ([ ...agentLogs.value.keys() ].some((id) => !present.has(id)))
        agentLogs.value = new Map([ ...agentLogs.value ].filter(([ id ]) => present.has(id)))
}
const applyAgentLogs = (delta: AgentLogs) => {
    const logs = new Map(agentLogs.value)
    for (const [ id, { reset, lines } ] of Object.entries(delta))
        logs.set(id, reset ? lines : [ ...(logs.get(id) ?? []), ...lines ].slice(-AGENT_LOG_MAX))
    agentLogs.value = logs
}

/*  the agents view: the agents of the master list, the selected one (followed by its id, else the
    first one), the detail view element, and whether it follows the bottom of the agent log  */
export const agentList  = computed(() => agents.value?.agents ?? [])
export const agentSelId = ref("")
export const agentSel   = computed(() => agentList.value.find((a) => a.id === agentSelId.value) ?? agentList.value[0] ?? null)
export const logEl      = ref<HTMLElement | null>(null)
export const logStick   = ref(true)

/*  select an agent, following the bottom of its log  */
export const selectAgent = (id: string) => {
    agentSelId.value = id
    logStick.value   = true
}

/*  the derived values of the page  */
export const surface   = computed<Surface>(() => board.value?.surface ?? { view: "lanes", minimized: [], collapsed: [], titles: false, keys: true, standalone: true })
export const titles    = computed(() => surface.value.titles)

/*  the names of the agents busy with each task (kept as the previous value while unchanged,
    as the agents change on every heartbeat, which must not trigger the lanes)  */
export const working   = computed<Map<string, string[]>>((previous) => {
    const map = new Map<string, string[]>()
    for (const agent of agents.value?.agents ?? [])
        for (const id of agent.tasks)
            map.set(id, [ ...(map.get(id) ?? []), agent.name ])
    return previous !== undefined && JSON.stringify([ ...previous ]) === JSON.stringify([ ...map ]) ? previous : map
})

/*  the names of the known agents (kept as the previous value while unchanged, like above)  */
export const agentNames = computed<Set<string>>((previous) => {
    const set = new Set((agents.value?.agents ?? []).map((agent) => agent.name))
    return previous !== undefined && JSON.stringify([ ...previous ]) === JSON.stringify([ ...set ]) ? previous : set
})

/*  the badges of a task, shown on the left part of its top border (like in the TUI): the agents
    busy with it (marked "⚉"), else its assignee (if any), marked "⚉" if it is the name of a known
    agent and else "☺" (as a person), and the badges of all tasks of the lanes  */
type Badge = { icon: string, name: string }
export const badgesOf = (id: string, assignee: string): Badge[] => {
    const busy = working.value.get(id)
    if (busy !== undefined)
        return busy.map((name) => ({ icon: "⚉", name }))
    if (assignee === "")
        return []
    return [ { icon: agentNames.value.has(assignee) ? "⚉" : "☺", name: assignee } ]
}
export const badges = computed(() => {
    const map = new Map<string, Badge[]>()
    for (const g of board.value?.groups ?? [])
        for (const l of g.lanes)
            for (const c of l.cards) {
                const list = badgesOf(c.id, c.assignee)
                if (list.length > 0)
                    map.set(c.id, list)
            }
    return map
})

/*  a duration (in ms) in its coarsest unit, and the label of an agent (its name, with its differing kind)  */
export const agentDuration = (ms: number) => {
    const s = Math.max(0, Math.floor(ms / 1000))
    return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`
}
export const agentLabel = (agent: Agent) =>
    agent.name !== agent.kind ? `${agent.name} (${agent.kind})` : agent.name

/*  tick the wall-clock every second while the agents view is shown, for the live
    durations of its footer (the time in the current state and the age of the heartbeat)  */
export const agentNow = ref(Date.now())
let   agentTimer = null as ReturnType<typeof setInterval> | null
watch(view, (v) => {
    if (v === "agents" && agentTimer === null) {
        agentNow.value = Date.now()
        agentTimer = setInterval(() => { agentNow.value = Date.now() }, 1000)
    }
    else if (v !== "agents" && agentTimer !== null) {
        clearInterval(agentTimer)
        agentTimer = null
    }
}, { immediate: true })

/*  the local time at which the latest heartbeat of each agent was received (measured locally,
    as the clock of the agent relay may be skewed), for the heart of its card (filled for
    BEAT_SHOWN_MS after a heartbeat, else empty), where the heartbeats are recognized by their
    changed time stamps and a filled heart is re-rendered once it is due to be emptied (as the
    wall-clock tick alone would empty it too early or too late)  */
const BEAT_SHOWN_MS = 1000
const agentBeats = shallowRef(new Map<string, { beat: number, seen: number }>())
let   beatTimer  = null as ReturnType<typeof setTimeout> | null
watch(agents, (next) => {
    const at    = Date.now()
    const beats = new Map<string, { beat: number, seen: number }>()
    let   fresh = false
    for (const a of next?.agents ?? []) {
        const prev = agentBeats.value.get(a.id)
        if (prev !== undefined && prev.beat === a.beat)
            beats.set(a.id, prev)
        else {
            beats.set(a.id, { beat: a.beat, seen: at })
            fresh = true
        }
    }
    agentBeats.value = beats
    if (fresh) {
        agentNow.value = at
        if (beatTimer !== null)
            clearTimeout(beatTimer)
        beatTimer = setTimeout(() => { beatTimer = null; agentNow.value = Date.now() }, BEAT_SHOWN_MS)
    }
})
export const beatOf = (id: string) =>
    agentNow.value - (agentBeats.value.get(id)?.seen ?? 0) < BEAT_SHOWN_MS

/*  fall back to the lanes view once it is known that no agent relay is configured  */
watch(() => [ agentsKnown.value, agents.value, view.value ], () => {
    if (agentsKnown.value && agents.value === null && (view.value === "agents" || view.value === "flow"))
        setView("lanes")
})

/*  the agents merged into an agent card of the agent graph (the ones of its kind and mode),
    ordered by their start time, and showing the agents view with the first of them selected  */
export const flowAgents = (id: string): Agent[] =>
    (agents.value?.agents ?? []).filter((a) => `agent:${a.kind}:${a.mode ?? ""}` === id)
        .sort((a, b) => (a.started ?? a.since) - (b.started ?? b.since))
export const showFlowAgent = (id: string) => {
    const agent = flowAgents(id)[0]
    if (agent === undefined)
        return
    selectAgent(agent.id)
    setView("agents")
}

/*  the selected lane is grown to the full board only while it is neither
    minimized nor within a collapsed phase (else it shrinks back for good)  */
export const growable  = computed(() => {
    const group = board.value?.groups[sel.value.g]
    return group !== undefined && !surface.value.collapsed.includes(group.title)
        && !surface.value.minimized.includes(group.lanes[sel.value.l]?.status ?? "")
})
export const grown     = computed(() => grow.value && growable.value && view.value === "lanes")
watch(growable, (ok) => {
    if (!ok)
        grow.value = false
})

/*  determine the visible groups of the horizontally scrollable lanes view  */
export const updateScroll = () => {
    const el = boardEl.value
    if (el === null)
        return
    const groups  = [ ...el.querySelectorAll<HTMLElement>(".group") ]
    const visible = groups.map((g, i) => ({ g, i })).filter(({ g }) =>
        g.offsetLeft + g.offsetWidth > el.scrollLeft + 1 && g.offsetLeft < el.scrollLeft + el.clientWidth - 1)
    scroll.all  = visible.length === groups.length
    scroll.info = visible.length === 0 ? "" : `groups ${visible[0].i + 1}–${visible[visible.length - 1].i + 1} ` +
        `of ${groups.length}`
}
export const scrollBy = (left: number) =>
    boardEl.value?.scrollBy({ left, behavior: "smooth" })
watch([ board, view ], () => nextTick(updateScroll), { deep: true })

/*  load the dependency graph (laid out by the service)  */
export const renderGraph = async (background = false) => {
    const seq = ++graphSeq
    const res = await api<{ svg: string, stats: GraphStats }>(`/task-board/api/graph?filter=${encodeURIComponent(query)}`, undefined, background)
    if (seq !== graphSeq)
        return
    graph.value = res.error !== undefined ? `<p class="warn">${res.error.replace(/[&<>]/g, (c) => `&#${c.charCodeAt(0)};`)}</p>` :
        res.svg !== "" ? res.svg : "<p class=\"mute\">(no tasks)</p>"
    graphStats.value = res.error !== undefined ? null : res.stats
}

/*  mark the edges of the selected node of a rendered graph (resp. agent graph), and draw them
    above all other edges (but still below the nodes), as the edges entering the same
    target share their last part, which would else be covered by a later unmarked edge  */
export const raiseEdges = (el: HTMLElement | null, id: string) => {
    const edges = [ ...(el?.querySelectorAll<SVGPathElement>("path.edge") ?? []) ]
    for (const e of edges)
        e.classList.toggle("sel", id !== "" && (e.dataset.from === id || e.dataset.to === id))
    const marked = edges.filter((e) => e.classList.contains("sel"))
    const anchor = edges.findLast((e) => !e.classList.contains("sel"))
    if (anchor !== undefined && marked.length > 0)
        anchor.after(...marked)
}

/*  load the agent graph (laid out by the service)  */
export const renderFlow = async (background = false) => {
    const seq = ++flowSeq
    const res = await api<{ svg: string, stats: FlowStats }>("/task-board/api/flow", undefined, background)
    if (seq !== flowSeq)
        return
    flow.value = res.error !== undefined ? `<p class="warn">${res.error.replace(/[&<>]/g, (c) => `&#${c.charCodeAt(0)};`)}</p>` :
        res.svg !== "" ? res.svg : "<p class=\"mute\">(no agents running)</p>"
    flowStats.value = res.error !== undefined ? null : res.stats
}

/*  load the statistics of the tasks (computed by the service)  */
export const loadStats = async (background = false) => {
    const seq = ++statsSeq
    const res = await api<BoardStats>(`/task-board/api/stats?filter=${encodeURIComponent(query)}&range=${statsRange.value}`, undefined, background)
    if (seq !== statsSeq)
        return
    statsError.value = res.error !== undefined ? res.error : null
    if (res.error === undefined)
        stats.value = res
}

/*  the time ranges of the statistics with their labels (for their buttons)  */
export const statsRanges: { range: StatsRange, label: string }[] = [
    { range: "total", label: "total" },
    { range: "30d",   label: "within last 30 days" },
    { range: "7d",    label: "within last 7 days" }
]

/*  select a time range of the statistics, resp. step to the previous or next one (without wrapping around)  */
export const selectStatsRange = (range: StatsRange) => {
    if (range === statsRange.value)
        return
    statsRange.value = range
    loadStats(true)
}
export const stepStatsRange = (delta: number) => {
    const k = statsRanges.findIndex((r) => r.range === statsRange.value) + delta
    if (k >= 0 && k < statsRanges.length)
        selectStatsRange(statsRanges[k].range)
}

/*  remember the scroll position of the document of the selected tab  */
const keepTabScroll = () => {
    const win = planEl.value?.contentWindow ?? null
    if (task.value !== null && win !== null)
        tabScrolls.set(tab.value, win.scrollY)
}

/*  open the dialog of a task, keeping the selected tab and the scroll
    positions of the tab documents when re-opening the same task (on changes),
    but never switching away from a task whose plan is being edited  */
export const openTask = async (id: string, background = false) => {
    if (editing.value !== null && editing.value.id !== id)
        return
    const seq = ++openSeq
    if (openId === id)
        keepTabScroll()
    else {
        tab.value = 0
        tabScrolls.clear()
    }
    openId = id
    const t = await api<Task>(`/task-board/api/task/${encodeURIComponent(id)}`, undefined, background)
    if (seq !== openSeq)
        return
    if (t.error !== undefined) {
        if (editing.value !== null)
            notice.value = { kind: "error", message: t.error }
        else if (watched !== null) {
            /*  the task viewer stays open, and shows the task again once it re-appears  */
            task.value       = null
            watchError.value = t.error
        }
        else
            closeTask()
        return
    }
    watchError.value = null

    /*  a change of the shown plan of the still open task replaces its diff (always
        in the background), any other task starts without a diff  */
    const prev = task.value?.id === id ? task.value : null
    let   diff = prev !== null ? taskDiff.value : null
    if (prev !== null && JSON.stringify(prev.plan) !== JSON.stringify(t.plan)) {
        const d = await api<{ doc: string }>("/task-board/api/diff", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ before: prev.plan, after: t.plan })
        }, true)
        if (seq !== openSeq)
            return
        diff = d.error !== undefined ? null : d.doc
    }

    /*  replace the cached attachment documents only once the selected one is re-fetched  */
    const n   = Math.min(tab.value, t.tabs.length - 1)
    const doc = n > 0 ? await fetchTabDoc(id, n, background) : ""
    if (seq !== openSeq)
        return
    tabDocs.value  = n > 0 ? { [n]: doc } : {}
    taskDiff.value = diff
    task.value     = t
    tab.value      = n
    nextTick(updateTabScroll)
}

/*  drop the diff of the last change, so just the latest state of the task remains  */
export const clearDiff = () => {
    keepTabScroll()
    taskDiff.value = null
}

/*  re-open the dialog under another task id (or none) with the next board reload  */
export const reopenTask = (id: string | null) => {
    openId = id
}

/*  close the dialog of a task, after running the hooks registered
    for this (by the task plan editor, which stops editing)  */
const closeHooks = [] as (() => void)[]
export const onCloseTask = (hook: () => void) => {
    closeHooks.push(hook)
}
export const closeTask = () => {
    for (const hook of closeHooks)
        hook()
    openSeq++
    openId         = null
    task.value     = null
    taskDiff.value = null
}

/*  fetch the document of an attachment tab, or load it into the cache
    (the task plan tab has its document already)  */
const fetchTabDoc = async (id: string, n: number, background = false): Promise<string> => {
    const d = await api<{ doc: string }>(`/task-board/api/task/${encodeURIComponent(id)}/attachment/${n - 1}/doc`, undefined, background)
    return d.error !== undefined ? `<p class="warn">${d.error.replace(/[&<>]/g, (c) => `&#${c.charCodeAt(0)};`)}</p>` : d.doc
}
const loadTab = async (n: number) => {
    if (n === 0 || task.value === null || tabDocs.value[n] !== undefined)
        return
    const id  = task.value.id
    const doc = await fetchTabDoc(id, n)
    if (task.value?.id === id)
        tabDocs.value[n] = doc
}

/*  select a tab of the task dialog, scrolled into the visible part of the tab bar  */
export const selectTab = async (n: number) => {
    if (task.value === null || editing.value !== null || n < 0 || n >= task.value.tabs.length || n === tab.value)
        return
    keepTabScroll()
    tab.value = n
    nextTick(() => tabsEl.value?.children[n]?.scrollIntoView({ block: "nearest", inline: "nearest" }))
    await loadTab(n)
}

/*  determine whether further tabs are hidden on the left or right side of the tab bar  */
export const updateTabScroll = () => {
    const el = tabsEl.value
    if (el === null)
        return
    tabScroll.less = el.scrollLeft > 1
    tabScroll.more = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
}

/*  (re)load the board model, in the background on a change of the task store (without busy popup)  */
export const reload = async (background = false) => {
    const seq  = ++reloadSeq
    const data = await api<Board>(`/task-board/api/board?filter=${encodeURIComponent(query)}`, undefined, background)
    if (seq !== reloadSeq)
        return
    if (data.error !== undefined) {
        boardError.value = data.error
        return
    }
    boardError.value = null

    /*  start in the persisted view on the first load (the task viewer shows no view at all)  */
    if (board.value === null && watched === null)
        view.value = data.surface.view
    board.value = data
    if (view.value === "graph")
        await renderGraph(background)
    else if (view.value === "flow")
        await renderFlow(background)
    else if (view.value === "stats")
        await loadStats(background || stats.value !== null)
    if (openId !== null)
        await openTask(openId, background)
}

/*  apply the filter query debounced while typing (as each change
    re-fetches the board), or immediately when it is cleared  */
let filterTimer: ReturnType<typeof setTimeout> | null = null
watch(filter, (value) => {
    if (filterTimer !== null)
        clearTimeout(filterTimer)
    filterTimer = setTimeout(() => {
        filterTimer = null
        query = value
        reload()
    }, value === "" ? 0 : 250)
})
export const clearFilter = () => {
    filter.value = ""
    filterEl.value?.blur()
}

/*  the number of view changes of this board still being persisted  */
let viewPending = 0

/*  apply a changed surface state: switch to a view changed by another board (except
    while own view changes are pending, and in the task viewer, which shows no view),
    and re-lay out the graph if the showing of titles or standalone tasks changed  */
const applySurface = (s: Surface) => {
    if (board.value === null)
        return
    const relayout = board.value.surface.titles !== s.titles || board.value.surface.standalone !== s.standalone
    board.value.surface = s
    if (viewPending === 0 && watched === null && s.view !== view.value)
        showView(s.view)
    else if (relayout && view.value === "graph")
        renderGraph()
}

/*  toggle a minimized lane, a collapsed phase (resp. multiple at once),
    or the showing of task titles, key hints, or standalone tasks  */
export const toggle = async (list: "minimized" | "collapsed" | "titles" | "keys" | "standalone", entry: string | string[]) => {
    const s = await api<Surface>("/task-board/api/toggle", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ list, entry })
    })
    if (s.error !== undefined) {
        actionError.value = s.error
        return
    }
    actionError.value = null
    applySurface(s)
}

/*  cycle (forward or backward) through the views: lanes, graph, stats, and (with an agent relay) agents and flow  */
export const cycleView = (back = false) => {
    const views = viewOrder(agents.value !== null)
    setView(views[(views.indexOf(view.value) + (back ? views.length - 1 : 1)) % views.length])
}

/*  show one of the lanes, the graph, the stats, the agents, and the flow view  */
const showView = (v: View) => {
    view.value = v
    if (v !== "lanes")
        drag.value = null
    if (v === "graph")
        renderGraph()
    else if (v === "flow")
        renderFlow()
    else if (v === "stats")
        loadStats(stats.value !== null)
}

/*  switch between the views, persisting it for all open and newly opened web boards  */
export const setView = (v: View) => {
    showView(v)
    viewPending++
    api<Surface>("/task-board/api/view", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ view: v })
    }).then((s) => {
        if (s.error !== undefined)
            actionError.value = s.error
    }).finally(() => {
        viewPending--
    })
}

/*  the connection to the service: change event stream, keep-alive timer, and reconnect timer  */
let events: EventSource | null = null
let ping: ReturnType<typeof setInterval> | null = null
let retry: ReturnType<typeof setTimeout> | null = null

/*  the connection state to the service (the web server), and the kind
    and connection state of the task store, as reported by the service  */
export const online = ref(false)
export const store  = ref<{ kind: "local" | "remote", connected: boolean } | null>(null)

/*  open the change event stream, which the browser re-opens itself after a
    connection loss, except after a failed (re-)connect, where it is re-created
    here; a re-opened stream reloads the board, as changes may have been missed, and
    drops the known agent log lines, as the service passes all of them again  */
const connect = () => {
    events = new EventSource("/task-board/events")
    events.addEventListener("open", () => {
        online.value    = true
        agentLogs.value = new Map()
        if (board.value !== null)
            reload(true)
    })
    events.addEventListener("error", () => {
        online.value = false
        if (events?.readyState === EventSource.CLOSED) {
            events.close()
            retry = setTimeout(connect, 5 * 1000)
        }
    })
    events.addEventListener("change", () => reload(true))
    events.addEventListener("surface", (ev) => applySurface(JSON.parse((ev as MessageEvent).data)))
    events.addEventListener("store", (ev) => { store.value = JSON.parse((ev as MessageEvent).data) })
    events.addEventListener("agents", (ev) => {
        applyAgents(JSON.parse((ev as MessageEvent).data))
        agentsKnown.value = true
        if (view.value === "flow")
            renderFlow(true)
    })
    events.addEventListener("logs", (ev) => applyAgentLogs(JSON.parse((ev as MessageEvent).data)))
}

/*  start the connection to the service: the change event stream, and the
    keep-alive, which also notices a lost service while no events arrive  */
export const startService = () => {
    connect()
    ping = setInterval(async () => {
        const result = await api("/task-board/api/ping", undefined, true)
        online.value = result.error === undefined && events?.readyState === EventSource.OPEN
    }, 15 * 1000)
}

/*  stop the connection to the service and all timers of the model  */
export const stopService = () => {
    events?.close()
    if (retry !== null)
        clearTimeout(retry)
    if (ping !== null)
        clearInterval(ping)
    if (filterTimer !== null)
        clearTimeout(filterTimer)
    if (busyTimer !== null)
        clearInterval(busyTimer)
    if (agentTimer !== null)
        clearInterval(agentTimer)
    if (beatTimer !== null)
        clearTimeout(beatTimer)
}

