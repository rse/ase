<!--
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
-->

<!--  the statistics view (like in the TUI): the buttons of the time ranges (the one of "total" with its number of days), the framed
      column chart "Tasks per State" of the numbers of tasks per lifecycle state (labeled by state, its effort, and phase, in the colors of their
      lanes, with the framed column chart "Throughput" of the finished tasks of the last weeks beside it), the
      framed stacked bar "Task Progress" of the cancelled, finished, work-in-progress, and open tasks
      (with the framed stacked bar "Open Tasks" of the ready and blocked open tasks beside it), the
      framed bars "Usage" of the total times, tokens, and costs of the tasks, with the bars of a
      column scaled to the maximum of the column (with the framed column chart "Effort"
      of the numbers of tasks per effort size beside it), and the framed table "Top-5 Tasks" of the
      tasks of the highest usage (with the framed "Finished Tasks" of the average usage per finished
      task and the framed "Efficiency" of the AI usage beside it), where the usage sections
      show a hint (resp. "n/a" values) without any tracked usage data  -->
<template>
    <div v-show="view === 'stats'" id="stats">
        <div class="sranges">
            <template v-for="(r, i) in statsRanges" :key="r.range">
                <span v-if="i > 0" class="ssep">·</span>
                <button :class="{ on: r.range === statsRange }" @click="selectStatsRange(r.range)">{{ rangeLabel(r.range, r.label) }}</button>
            </template>
        </div>
        <div v-if="stats === null" class="sempty" :class="{ off: statsError !== null }">{{ statsError ?? "loading …" }}</div>
        <template v-else>
            <div class="spair scharts">
                <section class="schart">
                    <div class="stitle">Tasks per State</div>
                    <div class="sgrid" :style="{ gridTemplateColumns: `repeat(${stats.states.length}, minmax(0, 1fr))` }">
                        <div v-for="s in stats.states" :key="s.status" class="scol" :class="s.tone">
                            <span class="scount">{{ s.count }}</span>
                            <div class="sbar" :style="{ height: `calc((100% - 1.5em) * ${s.count / maxCount})` }"></div>
                        </div>
                        <div v-for="s in stats.states" :key="`l-${s.status}`" class="sstate" :class="s.tone" :title="s.status">{{ s.status.slice(0, 7) }}</div>
                        <div v-for="s in stats.states" :key="`e-${s.status}`" class="seffort" :class="s.tone" :title="effortTitle(s.status, s.effort)">{{ s.effort.estimated > 0 ? hours(s.effort.minutes) : "" }}</div>
                        <div v-for="p in phases" :key="p.phase" class="sphase" :style="{ gridColumn: `span ${p.n}` }" :title="p.phase"><span>{{ p.phase }}</span></div>
                        <div class="sfoot" :style="{ gridColumn: `span ${stats.states.length}` }">total tasks: {{ totalTasks }}</div>
                    </div>
                </section>
                <section class="schart">
                    <div class="stitle">Throughput</div>
                    <div class="sgrid" :style="{ gridTemplateColumns: `repeat(${stats.throughput.length}, minmax(0, 1fr))` }">
                        <div v-for="w in stats.throughput" :key="w.start" class="scol" :title="`week ${w.week} (from ${w.start}): ${w.count} finished`">
                            <span class="scount">{{ w.count }}</span>
                            <div class="sbar" :style="{ height: `calc((100% - 1.5em) * ${w.count / maxWeek})` }"></div>
                        </div>
                        <div v-for="w in stats.throughput" :key="`l-${w.start}`" class="sstate" :title="`week ${w.week} (from ${w.start})`">W{{ w.week }}</div>
                        <div class="seffort" :style="{ gridColumn: `span ${stats.throughput.length}` }"></div>
                        <div class="sphase" :style="{ gridColumn: `span ${stats.throughput.length}` }" :title="weekSummary"><span>{{ weekSummary }}</span></div>
                        <div class="sfoot" :style="{ gridColumn: `span ${stats.throughput.length}` }" :title="forecast">{{ forecast }}</div>
                    </div>
                </section>
            </div>
            <div class="spair">
                <section v-for="b in stacks" :key="b.key" class="sprogress">
                    <div class="stitle">{{ b.title }}</div>
                    <div class="sstack">
                        <div v-for="p in b.parts" v-show="p.count > 0" :key="p.key" class="spart" :class="p.key" :style="{ flexGrow: p.count }"
                            :title="`${p.label}: ${p.count} (${pct(p.count, b.parts)})`"></div>
                    </div>
                    <div class="slegend">
                        <template v-for="(p, i) in b.parts" :key="p.key">
                            <span v-if="i > 0" class="ssep">·</span>
                            <span><span class="sswatch" :class="p.key"></span>{{ p.label }}: <b>{{ p.count }}</b> ({{ pct(p.count, b.parts) }})</span>
                        </template>
                    </div>
                </section>
            </div>
            <div class="spair">
                <section class="susage">
                    <div class="stitle">Usage</div>
                    <div v-if="!stats.tracked" class="sempty">{{ UNTRACKED }}</div>
                    <div v-else class="smatrix">
                        <span class="shead">Time:</span>
                        <span class="shead">Token:</span>
                        <span class="shead">Cost:</span>
                        <div class="scell">
                            <div v-for="b in timeBars" :key="b.name" class="srow">
                                <span class="sname">{{ b.name }}</span>
                                <div class="strack"><div class="sfill" :class="b.cls" :style="{ width: share(b.value, maxTime) }"></div></div>
                                <span class="sval">{{ hours(b.value) }}</span>
                            </div>
                        </div>
                        <div class="scell">
                            <div class="srow">
                                <span class="sname">AI</span>
                                <div class="strack">
                                    <div v-for="t in tokenParts" :key="t" class="sfill" :class="t" :style="{ width: share(stats.usage[t], tokenSum) }"></div>
                                </div>
                                <span class="sval">{{ tokens(tokenSum) }}</span>
                            </div>
                            <div class="slegend stokens">
                                <span v-for="t in tokenParts" :key="t"><span class="sswatch" :class="t"></span>{{ t }} ({{ tokenPct(stats.usage[t]) }})</span>
                            </div>
                        </div>
                        <div class="scell">
                            <div v-for="b in costBars" :key="b.name" class="srow">
                                <span class="sname">{{ b.name }}</span>
                                <div class="strack"><div class="sfill" :class="b.cls" :style="{ width: share(b.value, maxCost) }"></div></div>
                                <span class="sval">{{ cost(b.value) }}</span>
                            </div>
                        </div>
                    </div>
                </section>
                <section class="schart">
                    <div class="stitle">Effort</div>
                    <div class="sgrid scompact" :style="{ gridTemplateColumns: `repeat(${stats.sizes.length}, minmax(0, 1fr))` }">
                        <div v-for="s in stats.sizes" :key="s.size" class="scol" :title="`${s.size}: ${s.count} task${s.count === 1 ? '' : 's'}`">
                            <span class="scount">{{ s.count }}</span>
                            <div class="sbar" :style="{ height: `calc((100% - 1.5em) * ${s.count / maxSize})` }"></div>
                        </div>
                        <div v-for="s in stats.sizes" :key="`l-${s.size}`" class="sstate">{{ s.size }}</div>
                        <div class="sfoot" :style="{ gridColumn: `span ${stats.sizes.length}` }">{{ estimation }}</div>
                    </div>
                </section>
            </div>
            <div class="spair">
                <section class="stop">
                    <div class="stitle">Top-5 Tasks</div>
                    <table class="stoplist">
                        <thead>
                            <tr>
                                <th>Task Id</th>
                                <th class="stask">Task Title</th>
                                <th>Total Share</th>
                                <th class="snum">Cost</th>
                                <th>Token</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="t in stats.top" :key="t.id">
                                <td><span class="cid" :class="t.tone">≡ {{ t.id }}</span></td>
                                <td class="stask" :title="t.title"><span>{{ t.title }}</span></td>
                                <td class="sbarcell" :title="`${Math.round(t.share * 100)}%`"><div class="strack"><div class="sfill ai" :style="{ width: share(t.share, 1) }"></div></div></td>
                                <td class="snum">{{ cost(t.cost) }}</td>
                                <td class="snum" title="input ▷ output tokens">
                                    <span class="stok" :style="{ minWidth: `${tokInW}ch` }">{{ tokens(t.input) }}</span>
                                    <span class="sflow">▷</span>
                                    <span class="stok" :style="{ minWidth: `${tokOutW}ch` }">{{ tokens(t.output) }}</span>
                                </td>
                            </tr>
                            <tr v-for="k in TOP_N - stats.top.length" :key="`empty-${k}`" class="sblank">
                                <td colspan="5">{{ k === 1 && stats.top.length === 0 ? (stats.tracked ? "no usage" : UNTRACKED) : "" }}</td>
                            </tr>
                        </tbody>
                    </table>
                </section>
                <div class="ssplit">
                    <section class="seffect">
                        <div class="stitle">Finished Tasks</div>
                        <template v-if="stats.tracked">
                            <div class="sline"><span>AI cost (⌀)</span><b>{{ cost(stats.efficiency.costAI) }}</b></div>
                            <div class="sline"><span>HR cost (⌀)</span><b>{{ cost(stats.efficiency.costHR) }}</b></div>
                            <div class="sline"><span>AI token (⌀)</span><b title="input ▷ output tokens">{{ tokens(stats.efficiency.input) }}<span class="sflow">▷</span>{{ tokens(stats.efficiency.output) }}</b></div>
                        </template>
                        <template v-else>
                            <div class="sline"><span>AI cost (⌀)</span><b>n/a</b></div>
                            <div class="sline"><span>HR cost (⌀)</span><b>n/a</b></div>
                            <div class="sline"><span>AI token (⌀)</span><b>n/a</b></div>
                        </template>
                        <div class="sline"><span>lead (median)</span><b>{{ duration(stats.efficiency.leadMedian) }}</b></div>
                        <div class="sline"><span>lead (p85)</span><b>{{ duration(stats.efficiency.leadP85) }}</b></div>
                    </section>
                    <section class="seffect">
                        <div class="stitle">Efficiency</div>
                        <div class="sline"><span>AI/HR time ratio</span><b>{{ ratio(stats.efficiency.timeRatio) }}</b></div>
                        <div class="sline"><span>AI/HR cost ratio</span><b>{{ ratio(stats.efficiency.costRatio) }}</b></div>
                        <div class="sline"><span>AI cache hit ratio</span><b>{{ percent(stats.efficiency.cacheRatio) }}</b></div>
                    </section>
                </div>
            </div>
        </template>
    </div>
</template>

<script setup lang="ts">
import { computed } from "vue"
import {
    view, stats, statsError, statsRange, statsRanges, selectStatsRange
} from "./ase-task-board-web-client-model"
import type { StatsEffort } from "./ase-task-board-web-client-model"

/*  the token counts of the stacked token bar, the total usage
    (zero while unknown), and the bars of the time and cost columns  */
const tokenParts = [ "cread", "cwrite", "input", "output" ] as const
const usage      = computed(() => stats.value?.usage ??
    { timeAI: 0, timeHR: 0, timeReal: 0, cread: 0, cwrite: 0, input: 0, output: 0, costAI: 0, costHR: 0 })
const timeBars   = computed(() => [
    { name: "AI",   cls: "ai",   value: usage.value.timeAI },
    { name: "HR",   cls: "hr",   value: usage.value.timeHR },
    { name: "real", cls: "real", value: usage.value.timeReal }
])
const costBars   = computed(() => [
    { name: "AI",   cls: "ai",   value: usage.value.costAI },
    { name: "HR",   cls: "hr",   value: usage.value.costHR }
])
const tokenSum   = computed(() => usage.value.cread + usage.value.cwrite + usage.value.input + usage.value.output)
const tokenPct   = (n: number) => `${tokenSum.value > 0 ? Math.round(n / tokenSum.value * 100) : 0}%`

/*  the compact amounts: a time (in minutes) in minutes below one hour, else in hours, a duration
    (in minutes) in minutes below one hour, in hours below two days, else in days (like in the TUI),
    a number of tokens with a metric suffix, and costs in USD, and the share of a value of a maximum  */
const hours    = (minutes: number) => minutes < 60 ? `${Math.round(minutes)}m` : `${(minutes / 60).toFixed(1)}h`
const duration = (minutes: number | null) =>
    minutes === null ? "n/a" : minutes < 60 ? `${Math.round(minutes)}m` :
        minutes < 48 * 60 ? `${(minutes / 60).toFixed(1)}h` : `${(minutes / (24 * 60)).toFixed(1)}d`
const tokens   = (n: number) =>
    n < 1000 ? String(n) : n < 1000 * 1000 ? `${(n / 1000).toFixed(1)}k` :
        n < 1000 * 1000 * 1000 ? `${(n / (1000 * 1000)).toFixed(1)}M` : `${(n / (1000 * 1000 * 1000)).toFixed(1)}G`
const cost     = (usd: number) => `$${usd.toFixed(2)}`
const ratio    = (r: number | null) => r !== null ? `${r.toFixed(1)}×` : "n/a"
const percent  = (r: number | null) => r !== null ? `${Math.round(r * 100)}%` : "n/a"

/*  the label of a time range button, where the time range "total" is suffixed
    with its number of days (once known, like in the TUI)  */
const rangeLabel = (range: string, label: string) => {
    const days = stats.value?.days
    return range === "total" && days !== undefined ? `${label} (${days} day${days === 1 ? "" : "s"})` : label
}

/*  the (maximum) number of tasks of the highest usage, always shown as rows (with blank
    rows for the missing tasks), to keep the height of their table (like in the TUI)  */
const TOP_N = 5

/*  the hint of the usage sections without any tracked usage data (like in the TUI)  */
const UNTRACKED = "no tracked usage data available (see telemetry.enabled)"

/*  the widths (in characters) of the input and output tokens of the tasks of the
    highest usage, to vertically align the "▷" between them (like in the TUI)  */
const tokInW  = computed(() => Math.max(0, ...(stats.value?.top ?? []).map((t) => tokens(t.input).length)))
const tokOutW = computed(() => Math.max(0, ...(stats.value?.top ?? []).map((t) => tokens(t.output).length)))

/*  the share of a value of a maximum, as a CSS percentage  */
const share = (value: number, max: number) => `${max > 0 ? value / max * 100 : 0}%`

/*  the explanation of the effort of a state (its human minutes and its numbers of tasks)  */
const effortTitle = (label: string, e: StatsEffort) =>
    `${label}: ${hours(e.minutes)} effort of ${e.estimated} of ${e.tasks} task${e.tasks === 1 ? "" : "s"} estimated`

/*  the highest and the total number of tasks of the states, and the phases with their numbers of states  */
const maxCount   = computed(() => Math.max(1, ...(stats.value?.states ?? []).map((s) => s.count)))
const totalTasks = computed(() => (stats.value?.states ?? []).reduce((n, s) => n + s.count, 0))
const phases     = computed(() => (stats.value?.states ?? []).reduce((list, s) => {
    const last = list.at(-1)
    if (last !== undefined && last.phase === s.phase)
        last.n++
    else
        list.push({ phase: s.phase, n: 1 })
    return list
}, [] as { phase: string, n: number }[]))

/*  the highest number of tasks of an effort size, and the numbers of the estimated
    and of all tasks (like in the TUI)  */
const maxSize    = computed(() => Math.max(1, ...(stats.value?.sizes ?? []).map((s) => s.count)))
const estimation = computed(() => {
    const states = stats.value?.states ?? []
    const sum    = (key: "estimated" | "tasks") => states.reduce((n, s) => n + s.effort[key], 0)
    return `estimated: ${sum("estimated")} of ${sum("tasks")} tasks`
})

/*  the highest number of finished tasks of a week, and the total and average
    number of finished tasks of all weeks (like in the TUI)  */
const maxWeek     = computed(() => Math.max(1, ...(stats.value?.throughput ?? []).map((w) => w.count)))
const weekSummary = computed(() => {
    const weeks = stats.value?.throughput ?? []
    const sum   = weeks.reduce((n, w) => n + w.count, 0)
    return `${sum} finished · ⌀ ${(weeks.length > 0 ? sum / weeks.length : 0).toFixed(1)}/week`
})

/*  the forecast of the backlog: the number of unfinished tasks and the number
    of weeks to finish them, resp. "n/a" without any throughput (like in the TUI)  */
const forecast = computed(() => {
    const { backlog, weeks } = stats.value?.forecast ?? { backlog: 0, weeks: 0 }
    return backlog === 0 ? "forecast: no unfinished tasks" :
        `forecast: ${backlog} unfinished ≈ ${weeks !== null ? `${weeks.toFixed(1)} week${weeks === 1 ? "" : "s"}` : "n/a"}`
})

/*  the stacked bars of the progress of the tasks and of the readiness of the open
    tasks with their parts, and the share of a number of tasks of the parts  */
const stacks = computed(() => {
    const p = stats.value?.progress  ?? { finished: 0, cancelled: 0, wip: 0, open: 0 }
    const r = stats.value?.readiness ?? { ready: 0, blocked: 0 }
    const progress = [
        { key: "cancelled", label: "cancelled",        count: p.cancelled },
        { key: "finished",  label: "finished",         count: p.finished },
        { key: "wip",       label: "wip",              count: p.wip },
        { key: "open",      label: "open",             count: p.open }
    ]
    const readiness = [
        { key: "ready",     label: "ready",            count: r.ready },
        { key: "blocked",   label: "blocked",          count: r.blocked }
    ]
    return [
        { key: "progress",  title: "Task Progress", parts: progress },
        { key: "readiness", title: "Open Tasks",    parts: readiness }
    ]
})
const pct = (count: number, parts: { count: number }[]) => {
    const total = parts.reduce((n, p) => n + p.count, 0)
    return `${total > 0 ? Math.round(count / total * 100) : 0}%`
}
/*  the maxima of the time and cost columns  */
const maxTime = computed(() => Math.max(usage.value.timeAI, usage.value.timeHR, usage.value.timeReal))
const maxCost = computed(() => Math.max(usage.value.costAI, usage.value.costHR))
</script>

