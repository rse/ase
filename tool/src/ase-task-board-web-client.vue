<!--
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
-->

<template>
    <header>
        <span>
            ⧉ ASE: <span class="emph">Task Board</span>
            <span class="sep">·</span>project: <span class="emph">{{ board?.project }}</span>
            <span class="sep">·</span>mode: <span class="emph">{{ board?.mode }}</span>
            <span class="sep">·</span>tasks: <span class="emph">{{ taskCount }}</span>
            <span class="sep">·</span>view: <button class="val toggle view" title="switch view (v, backward: V)" @click="cycleView()"><span v-for="(label, v) in viewLabels" :key="v" :class="{ off: v !== view }">{{ label }}</span></button>
            <span class="sep">·</span><span class="filter" :class="{ off: unfiltered }">filter:
                <span class="field">
                    <input ref="filterEl" v-model="filter" class="val" type="text" autocomplete="off" spellcheck="false" :disabled="unfiltered"
                        placeholder="keywords…" title="space ANDs, comma ORs fuzzy matched keywords or effort:<size> (/)" @keydown.esc="clearFilter" @keydown.enter="filterEl?.blur()">
                    <button v-show="filter !== '' && !unfiltered" class="clear" title="clear filter (ESC)" @click="clearFilter">✕</button>
                </span>
            </span>
        </span>
    </header>
    <div id="view">
        <BoardLanes />
        <BoardGraph />
        <BoardAgents />
        <BoardFlow />
        <BoardStats />
    </div>
    <!--  the horizontal scroll bar of the lanes view, resp. the info line
          of the graph view with the selected task and its status, of the agents
          view with the selected agent, of the agent graph view with the selected agent card
          and its states, and of the stats view with its number of tasks, followed by the
          hint how to show the hidden key hints again  -->
    <div id="hscroll">
        <button :style="{ visibility: view === 'lanes' && !scroll.all && !grown ? 'visible' : 'hidden' }" @click="scrollBy(-240)">◀</button>
        <span v-if="grown">lane <b>{{ board?.groups[sel.g]?.lanes[sel.l]?.status }}</b> of group <b>{{ board?.groups[sel.g]?.title }}</b> grown<span class="sep">·</span>g shrinks</span>
        <span v-else-if="view === 'lanes' && scroll.info !== ''">{{ scroll.info }}<span class="sep">·</span>{{ scroll.all ? "all visible" : "scroll or ◀/▶" }}</span>
        <span v-else-if="view === 'graph' && selStatus !== null">task: <b>{{ sel.id }}</b><span class="sep">·</span>status: <b>{{ selStatus }}</b></span>
        <span v-else-if="view === 'stats' && stats !== null">statistics of <b>{{ statsCount }}</b> {{ filter !== "" ? "filtered " : "" }}tasks<template v-if="stats.range !== 'total'">{{ " " }}<b>{{ statsRanges.find((r) => r.range === stats?.range)?.label }}</b></template></span>
        <span v-else-if="view === 'agents' && agentSel !== null">agent: <b>{{ agentLabel(agentSel) }}</b><template v-if="agentSel.title"><span class="sep">·</span>operation: <b>{{ agentSel.title }}</b></template></span>
        <span v-else-if="view === 'flow' && flowStateInfo !== null">state: <b>{{ flowStateInfo.state }}</b><span class="sep">·</span>observed by: <b>{{ flowStateInfo.input }}</b><span class="sep">·</span>written by: <b>{{ flowStateInfo.output }}</b><template v-if="flowStateInfo.gate !== ''"><span class="sep">·</span>gate of: <b>{{ flowStateInfo.gate }}</b></template></span>
        <span v-else-if="view === 'flow' && flowInfo !== null">agent: <b>{{ flowInfo.label }}</b><template v-if="flowInfo.states === undefined"><span class="sep">·</span>requests: <b>{{ flowInfo.request }}</b></template><template v-else><span class="sep">·</span>input: <b>{{ flowInfo.states.input.join(", ") || "none" }}</b><template v-if="flowInfo.states.activity !== undefined"><span class="sep">·</span>activity: <b>{{ flowInfo.states.activity }}</b></template><span class="sep">·</span>output: <b>{{ flowInfo.states.output.join(", ") || "none" }}</b><template v-if="flowInfo.states.gate !== undefined"><span class="sep">·</span>gate: <b>{{ flowInfo.states.gate }}</b></template></template></span>
        <span v-if="!surface.keys" class="keys"><span class="sep">·</span><kbd>?</kbd> show key hints</span>
        <button :style="{ visibility: view === 'lanes' && !scroll.all && !grown ? 'visible' : 'hidden' }" @click="scrollBy(240)">▶</button>
    </div>
    <footer>
        <div v-for="(line, k) in (surface.keys ? hints : [])" :key="k" class="hints">
            <template v-for="(hint, i) in line" :key="hint.key">
                <span v-if="i > 0" class="sep">·</span><template v-for="(key, j) in (hint.key === '/' ? [ '/' ] : hint.key.split('/'))" :key="j"><template v-if="j > 0">/</template><kbd>{{ key }}</kbd></template><span class="action">{{ hint.action }}</span>
            </template>
        </div>
        <div v-if="warning !== ''" class="status">{{ warning }}</div>
        <div v-else class="status idle"><template v-if="board !== null">⧉ ASE: <b>Task Board</b><span class="sep">·</span>server: <b :class="{ off: !online }">{{ online ? "online" : "offline" }}</b> <span :class="{ off: !online }">{{ online ? "●" : "○" }}</span><template v-if="store !== null"><span class="sep">·</span>store: <b>{{ store.kind }}</b> <span :class="{ off: !online || !store.connected }">{{ online && store.connected ? "●" : "○" }}</span></template><template v-if="agents !== null"><span class="sep">·</span>agents: <b>{{ agents.agents.length }}</b> <span :class="{ off: !online || !agents.connected }">{{ online && agents.connected ? "●" : "○" }}</span></template><span class="sep">·</span>version: <b>ASE {{ board.version }}</b></template></div>
    </footer>
    <TaskDialog />
    <BoardPopup />
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount } from "vue"
import BoardLanes                               from "./ase-task-board-web-client-lanes.vue"
import BoardGraph                               from "./ase-task-board-web-client-graph.vue"
import BoardAgents                              from "./ase-task-board-web-client-agents.vue"
import BoardFlow                                from "./ase-task-board-web-client-flow.vue"
import BoardStats                            from "./ase-task-board-web-client-stats.vue"
import TaskDialog                               from "./ase-task-board-web-client-dialog.vue"
import BoardPopup                               from "./ase-task-board-web-client-popup.vue"
import {
    board, actionError, actionNote, view, sel, drag, scroll, filter, filterEl, agents, agentSel, agentNow, online, store, stats, statsRanges,
    surface, titles, grown, agentDuration, agentLabel, cycleView, clearFilter, scrollBy, updateScroll, updateTabScroll,
    rowLanes, reload, startService, stopService, flowSel, flowAgents, viewLabels, viewCycleHint, type AgentFlow, type View
} from "./ase-task-board-web-client-model"
import { stopEdit }                  from "./ase-task-board-web-client-editor"
import { controlStart, controlStop } from "./ase-task-board-web-client-control"

/*  the number of open and of all tasks, for the header  */
const taskCount = computed(() => {
    const cards = board.value?.groups.flatMap((g) => g.lanes).flatMap((l) => l.cards)
    return cards === undefined ? "" : `${cards.filter((c) => c.tone !== "done").length}/${cards.length}`
})

/*  the number of tasks of the statistics, for the info line of the stats view  */
const statsCount = computed(() => stats.value?.states.reduce((n, s) => n + s.count, 0) ?? 0)

/*  whether the shown view is not filtered (and hence the filter field is disabled)  */
const unfiltered = computed(() => view.value === "agents" || view.value === "flow")

/*  the selected agent card (its first agent with the number of its merged agents, the
    states it operates on, and the name of its requests), for the info line of the agent graph view  */
const flowInfo = computed(() => {
    const list = flowAgents(flowSel.value)
    if (list.length === 0)
        return null
    return {
        label:   agentLabel(list[0]) + (list.length > 1 ? ` ×${list.length}` : ""),
        states:  list[0].states,
        request: list[0].request ?? "none"
    }
})

/*  the selected state (with the agent cards observing, writing, and gating on it),
    for the info line of the agent graph view  */
const flowStateInfo = computed(() => {
    if (!flowSel.value.startsWith("state:"))
        return null
    const state = flowSel.value.slice("state:".length)
    const cards = [ ...new Set((agents.value?.agents ?? []).map((a) => `agent:${a.kind}:${a.mode ?? ""}`)) ].map(flowAgents)
    const names = (test: (s: AgentFlow) => boolean) => cards
        .filter((list) => list[0]?.states !== undefined && test(list[0].states))
        .map((list) => agentLabel(list[0]) + (list.length > 1 ? ` ×${list.length}` : "")).join(", ")
    return {
        state,
        input:  names((s) => s.input.includes(state)) || "none",
        output: names((s) => s.output.includes(state)) || "none",
        gate:   names((s) => s.gate === state && !s.input.includes(state))
    }
})

/*  the status of the selected task, for the info line of the graph view  */
const selStatus = computed(() => {
    const lane = board.value?.groups.flatMap((g) => g.lanes).find((l) => l.cards.some((c) => c.id === sel.value.id))
    return lane?.status ?? null
})

/*  the action of the key hint cycling the views forward and backward from a view  */
const cycleHint = (v: View) => viewCycleHint(v, agents.value !== null)

/*  the status line and the key hints of the footer  */
const warning   = computed(() => {
    if (actionError.value !== null)
        return `⚠ ${actionError.value}`
    else if (actionNote.value !== null)
        return actionNote.value
    else if (drag.value?.key === true)
        return `moving task "${drag.value.id}" from ${drag.value.from}: select a highlighted lane, SPACE drops, ESC cancels`
    return (board.value?.warnings.length ?? 0) > 0 ? `⚠ ${board.value!.warnings.join(" · ")}` : ""
})
const hints     = computed(() => {
    const group  = board.value?.groups[sel.value.g]
    const minned = surface.value.minimized.includes(group?.lanes[sel.value.l]?.status ?? "")
    const folded = surface.value.collapsed.includes(group?.title ?? "")
    const rowMin = board.value !== null && rowLanes(board.value, surface.value, sel.value.l).every((s) => surface.value.minimized.includes(s))
    return grown.value ? [ [
        { key: "↑/↓/←/→",       action: "select task" },
        { key: "⇈/⇊/⇤/⇥",       action: "page/first/last task" },
        { key: "⏎",             action: "view task" },
        { key: "e",             action: "edit task" },
        { key: "SPACE",         action: "start transition task" },
        { key: "T",             action: "transition task" }
    ], [
        { key: "D",             action: "delete task" },
        { key: "A",             action: "assign task" },
        { key: "E",             action: "edit by prompt" },
        { key: "R",             action: "request by prompt" },
        { key: "N",             action: "new task" },
        { key: "g/ESC",         action: "shrink lane" }
    ], [
        { key: "t",             action: `${titles.value ? "collapse" : "expand"} titles` },
        { key: "/",             action: "filter tasks" },
        { key: "v/V",           action: cycleHint("lanes") }
    ], [
        { key: "Left-Click",    action: "select task" },
        { key: "Double-Click",  action: "view task / shrink lane" },
        { key: "?",             action: "hide key hints" }
    ] ] : view.value === "lanes" ? [ [
        { key: "↑/↓/←/→",       action: "select task" },
        { key: "⇈/⇊/⇤/⇥",       action: "select lane" },
        { key: "⏎",             action: "view task" },
        { key: "e",             action: "edit task" },
        { key: "SPACE",         action: "start/stop transition task" },
        { key: "T",             action: "transition task" }
    ], [
        { key: "D",             action: "delete task" },
        { key: "A",             action: "assign task" },
        { key: "E",             action: "edit by prompt" },
        { key: "R",             action: "request by prompt" },
        { key: "N",             action: "new task" },
        { key: "m",             action: `${minned ? "maximize/expand" : "minimize/collapse"} lane` },
        { key: "g",             action: "grow lane" }
    ], [
        { key: "c",             action: `${folded ? "expand" : "collapse"} phase` },
        { key: "C",             action: `${rowMin ? "expand" : "collapse"} lane row` },
        { key: "t",             action: `${titles.value ? "collapse" : "expand"} titles` },
        { key: "/",             action: "filter tasks" },
        { key: "v/V",           action: cycleHint("lanes") }
    ], [
        { key: "Left-Click",    action: "select task/lane/phase" },
        { key: "Double-Click",  action: "view task, collapse/expand lane/phase" },
        { key: "Drag & Drop",   action: "directly transition task" },
        { key: "?",             action: "hide key hints" }
    ] ] : view.value === "agents" ? [ [
        { key: "↑/↓/Left-Click", action: "select agent" },
        { key: "⇈/⇊/⇤/⇥",       action: "page/top/bottom agent log" },
        { key: "Wheel",         action: "scroll agent log" }
    ], [
        { key: "v/V",           action: cycleHint("agents") },
        { key: "?",             action: "hide key hints" }
    ] ] : view.value === "flow" ? [ [
        { key: "↑/↓/←/→/Left-Click", action: "select agent/state" },
        { key: "⏎/Double-Click", action: "view agent" },
        { key: "+/-/0/Wheel",   action: "zoom in/out/reset" },
        { key: "Left-Drag",     action: "scroll canvas" }
    ], [
        { key: "v/V",           action: cycleHint("flow") },
        { key: "?",             action: "hide key hints" }
    ] ] : view.value === "stats" ? [ [
        { key: "←/→",           action: "select time range" },
        { key: "/",             action: "filter tasks" },
        { key: "v/V",           action: cycleHint("stats") }
    ], [
        { key: "?",             action: "hide key hints" }
    ] ] : [ [
        { key: "↑/↓/←/→/Left-Click", action: "select task" },
        { key: "⏎/Double-Click", action: "view task" },
        { key: "e",             action: "edit task" },
        { key: "T",             action: "transition task" }
    ], [
        { key: "D",             action: "delete task" },
        { key: "A",             action: "assign task" },
        { key: "E",             action: "edit by prompt" },
        { key: "R",             action: "request by prompt" },
        { key: "N",             action: "new task" },
        { key: "t",             action: `${titles.value ? "collapse" : "expand"} titles` },
        { key: "s",             action: `${surface.value.standalone ? "hide" : "show"} standalone tasks` }
    ], [
        { key: "/",             action: "filter tasks" },
        { key: "v/V",           action: cycleHint("graph") },
        { key: "+/-/0/Wheel",   action: "zoom in/out/reset" },
        { key: "Left-Drag",     action: "scroll canvas" },
        { key: "?",             action: "hide key hints" }
    ] ]
})

/*  keep the scroll states of the lanes view and the tab bar on resizing
    (the agents view keeps the position within its agent log itself)  */
const onResize = () => {
    updateScroll()
    updateTabScroll()
}

/*  keep the pulses of all task boxes in sync, by pinning every newly started
    pulse animation onto the common origin of the document timeline  */
const onAnimationStart = (ev: AnimationEvent) => {
    if (ev.animationName !== "pulse")
        return
    for (const anim of document.getAnimations())
        if (anim instanceof CSSAnimation && anim.animationName === "pulse" && anim.startTime !== 0)
            anim.startTime = 0
}
onMounted(() => {
    startService()
    controlStart()
    window.addEventListener("resize", onResize)
    document.addEventListener("animationstart", onAnimationStart)
    reload()
})
onBeforeUnmount(() => {
    stopService()
    controlStop()
    stopEdit()
    window.removeEventListener("resize", onResize)
    document.removeEventListener("animationstart", onAnimationStart)
})
</script>

<style lang="stylus" src="./ase-task-board-web-client.styl"></style>

