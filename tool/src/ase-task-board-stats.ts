/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import { DateTime }                 from "luxon"

import type Log                     from "./ase-lib-log.js"
import { Config }                   from "./ase-config-core.js"
import { configSchema }             from "./ase-config-schema.js"
import type { Board, Card, Tone }   from "./ase-task-board-core.js"
import * as TaskFormat              from "./ase-task-format.js"

/*  the time range of the statistics: all tasks, resp. only the tasks
    worked on within the last 30 or 7 days  */
export type StatsRange = "total" | "30d" | "7d"
export const statsRanges: StatsRange[] = [ "total", "30d", "7d" ]

/*  the labels of the time ranges (for their buttons)  */
export const statsRangeLabels: Record<StatsRange, string> = {
    "total": "total",
    "30d":   "within last 30 days",
    "7d":    "within last 7 days"
}

/*  the label of a time range (for its button), where the time range "total" is
    suffixed with its number of days  */
export const statsRangeLabel = (range: StatsRange, days: number): string =>
    range === "total" ? `${statsRangeLabels[range]} (${days} day${days === 1 ? "" : "s"})` : statsRangeLabels[range]

/*  the effort of tasks: the sum of the representative human minutes of their effort sizes
    (see "effortMinutes"), the number of their estimated tasks, and the number of all of
    them (without the explicit epics, as these carry no effort of their own)  */
export type StatsEffort = { minutes: number, estimated: number, tasks: number }

/*  the number of tasks of a lifecycle state, with its phase (the title of its
    group of the lane layout), its tone (like the tasks of its lane), and their effort  */
export type StatsState = { phase: string, status: string, count: number, tone: Tone, effort: StatsEffort }

/*  the progress of the tasks: the numbers of the finished (in a terminal state except
    "CANCELLED"), cancelled, work-in-progress (in an active state), and open (in any other
    state) tasks  */
export type StatsProgress = { finished: number, cancelled: number, wip: number, open: number }

/*  the total AI usage of the tasks: the AI request, human, and real time (in minutes), the cache
    read, cache write, (uncached) input, and output tokens, and the AI and human costs (in USD)  */
export type StatsUsage = {
    timeAI: number, timeHR: number, timeReal: number,
    cread: number, cwrite: number, input: number, output: number,
    costAI: number, costHR: number
}

/*  the readiness of the open tasks: the numbers of the ready tasks (all predecessors
    in a terminal state) and of the blocked tasks (any predecessor in another state)  */
export type StatsReadiness = { ready: number, blocked: number }

/*  the number of the estimated tasks of an effort size  */
export type StatsSize = { size: TaskFormat.EffortSize, count: number }

/*  a task of the highest usage: its id, its title, its tone (like the tasks of its lane),
    its total (AI and human) costs (in USD), its (uncached) input and output tokens, and its
    share (0-1) of the total costs of all tasks (resp. of their input and output tokens
    without any costs)  */
export type StatsTop = { id: string, title: string, tone: Tone, cost: number, input: number, output: number, share: number }

/*  the efficiency of the AI usage: the AI/HR time ratio (the AI request time per human
    time) and the AI/HR cost ratio (the AI costs per human costs), each null without any
    human time resp. costs, the cache hit ratio (0-1, the cache read tokens per all input
    tokens, i.e., the cache read, cache write, and uncached input tokens), null without any
    input tokens, the average AI costs, human costs (in USD), and (uncached) input and
    output tokens per finished task (all zero without any finished task), and the median
    and 85th percentile of the lead times of the finished tasks (in minutes, from their
    creation to their last modification), each null without any finished task  */
export type StatsEfficiency = {
    timeRatio: number | null, costRatio: number | null, cacheRatio: number | null,
    costAI: number, costHR: number, input: number, output: number,
    leadMedian: number | null, leadP85: number | null
}

/*  the throughput of a week: its ISO week number, its start day (its Monday, as "YYYY-MM-DD"),
    and the number of tasks finished within it (in a terminal state except "CANCELLED")  */
export type StatsWeek = { week: number, start: string, count: number }

/*  the forecast of the backlog: the number of unfinished tasks (work-in-progress and open),
    and the number of weeks to finish them at the average throughput of the last weeks
    (zero without any unfinished task, null without any throughput)  */
export type StatsForecast = { backlog: number, weeks: number | null }

/*  the statistics of the board: its time range, the tasks per lifecycle state, the progress
    of the tasks, the readiness of the open tasks, the distribution of the effort sizes of the
    tasks (from the smallest to the largest size), the total AI usage
    of the tasks, the (up to five) tasks of the highest usage, the efficiency of the AI usage,
    the throughput of the last weeks (oldest first, ending with the current week), the forecast
    of the backlog, the number of days of the time range "total" (from the creation of the
    oldest task until now), and whether any usage attachment of the tasks overlaps with the time range  */
export type Stats = {
    range:      StatsRange
    days:       number
    tracked:    boolean
    states:     StatsState[]
    progress:   StatsProgress
    readiness:  StatsReadiness
    sizes:      StatsSize[]
    usage:      StatsUsage
    top:        StatsTop[]
    efficiency: StatsEfficiency
    throughput: StatsWeek[]
    forecast:   StatsForecast
}

/*  the number of tasks of the highest usage  */
const TOP_N = 5

/*  the number of weeks of the throughput (a quarter)  */
const WEEKS_N = 12

/*  the fields of the AI usage, by the amounts of the usage attachment  */
const usageFields: [ keyof StatsUsage, (typeof TaskFormat.usageKeys)[number] ][] = [
    [ "timeAI", "time.ai" ], [ "timeHR", "time.hr" ], [ "timeReal", "time.real" ],
    [ "cread", "token.cread" ], [ "cwrite", "token.cwrite" ], [ "input", "token.input" ], [ "output", "token.output" ],
    [ "costAI", "cost.ai" ], [ "costHR", "cost.hr" ]
]

/*  the scale of the effort sizes (the upper band bounds of "XS" to "L" in human minutes) of the
    "project.task.effort.scale" configuration, else (if unset or invalid) of the default one  */
export const effortScale = (log: Log): number[] => {
    try {
        const cfg = new Config("config", configSchema, log)
        cfg.read()
        const value = cfg.get("project.task.effort.scale")
        return TaskFormat.parseEffortScale(typeof value === "string" ? value : TaskFormat.EFFORT_SCALE)
    }
    catch {
        return TaskFormat.parseEffortScale(TaskFormat.EFFORT_SCALE)
    }
}

/*  parse a timestamp of a task (in milliseconds, or NaN if absent or unparsable)  */
const timeOf = (text: string): number => {
    const dt = DateTime.fromFormat(text.trim(), "yyyy-LL-dd HH:mm")
    return dt.isValid ? dt.toMillis() : DateTime.fromISO(text.trim()).toMillis()
}

/*  the share of an activity period (from its creation to its last modification) within the time
    range of the statistics (from now back to its start): null if it does not overlap with the time
    range, else its overlapping part (where a period without extent overlaps entirely)  */
const shareOf = (createdAt: string, modifiedAt: string, range: StatsRange, now: number): number | null => {
    if (range === "total")
        return 1
    const from = now - (range === "7d" ? 7 : 30) * 24 * 60 * 60 * 1000
    let created  = timeOf(createdAt)
    let modified = timeOf(modifiedAt)
    if (Number.isNaN(created))
        created = modified
    if (Number.isNaN(modified))
        modified = created
    if (Number.isNaN(created) || modified < from || Math.min(created, modified) > now)
        return null
    if (modified <= created)
        return 1
    return Math.max(0, Math.min(modified, now) - Math.max(created, from)) / (modified - created)
}

/*  the throughput of the last weeks: the finished tasks per (ISO) week, by their last
    modification as the (approximated) time of their completion  */
const throughputOf = (board: Board, kindOf: Map<string, keyof StatsProgress>, now: number): StatsWeek[] => {
    const thisWeek   = DateTime.fromMillis(now).startOf("week")
    const throughput = Array.from({ length: WEEKS_N }, (_x, i) => {
        const start = thisWeek.minus({ weeks: WEEKS_N - 1 - i })
        return { week: start.weekNumber, start: start.toFormat("yyyy-LL-dd"), count: 0 }
    })
    for (const card of board.cards.values()) {
        if (board.context.has(card.id) || kindOf.get(card.status) !== "finished")
            continue
        const time = timeOf(card.modified)
        if (Number.isNaN(time) || time > now)
            continue
        const ago = Math.round(thisWeek.diff(DateTime.fromMillis(time).startOf("week"), "weeks").weeks)
        if (ago >= 0 && ago < WEEKS_N)
            throughput[WEEKS_N - 1 - ago].count++
    }
    return throughput
}

/*  the number of days from the creation (resp. the last modification without any creation)
    of the oldest task until now (zero without any task)  */
const daysOf = (board: Board, now: number): number => {
    let oldest = now
    for (const card of board.cards.values()) {
        if (board.context.has(card.id))
            continue
        let time = timeOf(card.created)
        if (Number.isNaN(time))
            time = timeOf(card.modified)
        if (!Number.isNaN(time))
            oldest = Math.min(oldest, time)
    }
    return Math.ceil((now - oldest) / (24 * 60 * 60 * 1000))
}

/*  the lead times of the finished tasks <within> the time range (in minutes, sorted ascending),
    by their last modification as the (approximated) time of their completion (like the throughput)  */
const leadsOf = (board: Board, within: Set<string>, kindOf: Map<string, keyof StatsProgress>): number[] => {
    const leads = [] as number[]
    for (const id of within) {
        const card = board.cards.get(id)!
        if (kindOf.get(card.status) !== "finished")
            continue
        const created  = timeOf(card.created)
        const modified = timeOf(card.modified)
        if (!Number.isNaN(created) && !Number.isNaN(modified) && modified >= created)
            leads.push((modified - created) / (60 * 1000))
    }
    return leads.sort((a, b) => a - b)
}

/*  a percentile <p> (0-1) of the ascending <values> (linearly interpolated
    between their closest ranks), or null without any values  */
const percentileOf = (values: number[], p: number): number | null => {
    if (values.length === 0)
        return null
    const pos  = (values.length - 1) * p
    const low  = Math.floor(pos)
    const high = Math.ceil(pos)
    return Math.round(values[low] + (values[high] - values[low]) * (pos - low))
}

/*  compute the statistics of the (possibly filtered) tasks of a board within a time range, where
    a task counts if the period of its plan (its "Created" and "Modified" keys) overlaps with the
    time range, and its usage counts with the overlapping part of the period of its usage attachment
    (its "Created" and "Modified" keys) -- as the usage attachment does not track when the usage
    accrued, the usage is taken as being evenly spread over this period, i.e., the usage within a
    time range other than "total" is just an approximation, and where the effort of a task counts
    with the representative human minutes of its effort size on a scale (see "effortScale"), and
    where the readiness of the tasks is determined on the unfiltered board "all"  */
export const statsOf = (board: Board, all: Board, usage: Map<string, { usage: TaskFormat.TaskUsage, period: TaskFormat.TaskUsagePeriod }>,
    range: StatsRange = "total", scale = TaskFormat.parseEffortScale(TaskFormat.EFFORT_SCALE), now = Date.now()): Stats => {
    /*  the tasks within the time range  */
    const within = new Set<string>()
    for (const card of board.cards.values())
        if (!board.context.has(card.id) && shareOf(card.created, card.modified, range, now) !== null)
            within.add(card.id)

    /*  the effort of tasks within the time range (without the explicit epics)  */
    const effortOf = (cards: Card[]): StatsEffort => {
        const sum = { minutes: 0, estimated: 0, tasks: 0 }
        for (const card of cards) {
            if (!within.has(card.id) || card.group === card.id)
                continue
            sum.tasks++
            if (card.effort !== "") {
                sum.estimated++
                sum.minutes += TaskFormat.effortMinutes(card.effort, scale)
            }
        }
        return sum
    }

    /*  the tasks per state and their progress and effort,
        and the tones and categories of the lanes  */
    const states   = [] as StatsState[]
    const progress = { finished: 0, cancelled: 0, wip: 0, open: 0 }
    const toneOf   = new Map<string, Tone>()
    const kindOf   = new Map<string, keyof StatsProgress>()
    for (const g of board.groups) {
        for (const l of g.lanes) {
            const tone: Tone = l.kind === "terminal" ? "done" : l.active ? "active" : "idle"
            const kind = l.kind === "terminal" ? (l.status === "CANCELLED" ? "cancelled" : "finished") : l.active ? "wip" : "open"
            const cards = board.lanes.get(l.status) ?? []
            const count = cards.filter((c) => within.has(c.id)).length
            states.push({ phase: g.title, status: l.status, count, tone, effort: effortOf(cards) })
            progress[kind] += count
            toneOf.set(l.status, tone)
            kindOf.set(l.status, kind)
        }
    }

    /*  the readiness of the open tasks, by the states of their (known) predecessors
        (independent of the time range and the filter, as they block the tasks nevertheless)  */
    const done      = (id: string) => {
        const card = all.cards.get(id)
        return card === undefined || toneOf.get(card.status) === "done"
    }
    const readiness = { ready: 0, blocked: 0 }
    for (const id of within)
        if (kindOf.get(board.cards.get(id)!.status) === "open")
            readiness[(all.pred.get(id) ?? []).every(done) ? "ready" : "blocked"]++

    /*  the distribution of the effort sizes of the estimated tasks within the time range
        (without the explicit epics, like their effort), from the smallest to the largest size  */
    const sizes = TaskFormat.effortSizes.map((size): StatsSize => ({ size, count: 0 }))
    for (const id of within) {
        const card = board.cards.get(id)!
        if (card.effort !== "" && card.group !== card.id)
            sizes[TaskFormat.effortSizes.indexOf(card.effort)].count++
    }

    /*  the total AI usage of the tasks (proportionally to the overlapping parts of their usage
        periods), the usage of each task, and the total usage of the finished tasks  */
    const zero     = () => ({ timeAI: 0, timeHR: 0, timeReal: 0, cread: 0, cwrite: 0, input: 0, output: 0, costAI: 0, costHR: 0 })
    const total    = zero()
    const finished = zero()
    const tops     = [] as StatsTop[]
    let tracked    = false
    for (const card of board.cards.values()) {
        const u = usage.get(card.id)
        if (u === undefined || board.context.has(card.id))
            continue
        const share = shareOf(u.period.created, u.period.modified, range, now)
        if (share === null)
            continue
        tracked = true
        const task = zero()
        for (const [ field, key ] of usageFields)
            task[field] = (u.usage[key] ?? 0) * share
        for (const [ field ] of usageFields) {
            total[field] += task[field]
            if (within.has(card.id) && kindOf.get(card.status) === "finished")
                finished[field] += task[field]
        }
        const input  = Math.round(task.input)
        const output = Math.round(task.output)
        const cost   = Number((task.costAI + task.costHR).toFixed(4))
        if (input + output > 0 || cost > 0)
            tops.push({ id: card.id, title: card.title, tone: toneOf.get(card.status) ?? "idle", cost, input, output, share: 0 })
    }
    for (const [ field, key ] of usageFields)
        total[field] = Number(total[field].toFixed(key.startsWith("cost.") ? 4 : 0))

    /*  the tasks of the highest usage: by their costs, then by their input and output
        tokens, with their shares of the total costs (resp. input and output tokens)  */
    const top    = tops.sort((a, b) => b.cost - a.cost || (b.input + b.output) - (a.input + a.output)).slice(0, TOP_N)
    const costs  = total.costAI + total.costHR
    const tokens = total.input + total.output
    for (const t of top)
        t.share = costs > 0 ? t.cost / costs : tokens > 0 ? (t.input + t.output) / tokens : 0

    /*  the lead times of the finished tasks (see "leadsOf")  */
    const leads = leadsOf(board, within, kindOf)

    /*  the efficiency of the AI usage  */
    const n      = progress.finished
    const inputs = total.cread + total.cwrite + total.input
    const efficiency = {
        timeRatio:  total.timeHR > 0 ? Number((total.timeAI / total.timeHR).toFixed(2)) : null,
        costRatio:  total.costHR > 0 ? Number((total.costAI / total.costHR).toFixed(2)) : null,
        cacheRatio: inputs > 0 ? Number((total.cread / inputs).toFixed(4)) : null,
        costAI:     n > 0 ? Number((finished.costAI / n).toFixed(4)) : 0,
        costHR:     n > 0 ? Number((finished.costHR / n).toFixed(4)) : 0,
        input:      n > 0 ? Math.round(finished.input  / n) : 0,
        output:     n > 0 ? Math.round(finished.output / n) : 0,
        leadMedian: percentileOf(leads, 0.50),
        leadP85:    percentileOf(leads, 0.85)
    }

    /*  the throughput of the last weeks (independent of the time range,
        as the weeks are a time range on their own)  */
    const throughput = throughputOf(board, kindOf, now)

    /*  the forecast of the backlog: all unfinished tasks, divided by the average throughput
        of the last weeks (independent of the time range, like the throughput, as all
        unfinished tasks have to be finished nevertheless)  */
    let backlog = 0
    for (const card of board.cards.values()) {
        const kind = kindOf.get(card.status)
        if (!board.context.has(card.id) && (kind === "wip" || kind === "open"))
            backlog++
    }
    const perWeek  = throughput.reduce((sum, w) => sum + w.count, 0) / WEEKS_N
    const forecast = {
        backlog,
        weeks: backlog === 0 ? 0 : perWeek > 0 ? Number((backlog / perWeek).toFixed(1)) : null
    }

    /*  the number of days of the time range "total"  */
    const days = daysOf(board, now)
    return { range, days, tracked, states, progress, readiness, sizes, usage: total, top, efficiency, throughput, forecast }
}

