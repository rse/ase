<!--
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
-->

<!--  the lanes view: the groups of lanes with the task boxes  -->
<template>
    <div v-show="view === 'lanes'" id="board" ref="boardEl" :class="{ titles, grown }" @scroll="updateScroll">
        <div v-if="boardError !== null" class="berror">{{ boardError }}</div>
        <template v-for="(g, gi) in board?.groups ?? []" :key="g.title">
            <!--  render each lane of a collapsed phase as a narrow box with its
                  vertically written status and number of cards (expanding the phase on double click)  -->
            <div v-if="surface.collapsed.includes(g.title)" class="group coll">
                <div class="ghd" :class="{ sel: sel.g === gi }" @click="selectPhase(gi)" @dblclick="toggle('collapsed', g.title)"><span class="arr right">▼</span></div>
                <div v-for="(l, li) in g.lanes" :key="l.status" class="lane" tabindex="-1" :data-status="l.status"
                    :class="[ { active: l.active, dashed: l.dashed, done: l.kind === 'terminal', sel: sel.g === gi && sel.l === li }, dropClass(l.status) ]"
                    :style="{ flex: `${shownWeight(l)} 1 0` }" @click="selectLane(gi, li)" @dblclick="toggle('collapsed', g.title)">
                    <span class="arr right">▼</span>
                    <span class="vt">{{ l.status.toUpperCase() }}</span>
                    <span class="cnt">{{ l.cards.length }}</span>
                </div>
            </div>
            <!--  while a lane is grown, only it is shown (within its phase), with its cards in a grid,
                  where a click selects a card, lane, or phase, and a double click opens the task of a card,
                  minimizes/maximizes a lane (resp. shrinks a grown lane), or collapses a phase  -->
            <div v-else class="group" :class="{ grown: grown && sel.g === gi }">
                <div class="ghd" :class="{ sel: sel.g === gi }" @click="selectPhase(gi)" @dblclick="toggle('collapsed', g.title)"><span class="arr">▼</span><span class="ttl">{{ g.title }}</span></div>
                <div v-for="(l, li) in g.lanes" :key="l.status" class="lane" tabindex="-1" :data-status="l.status"
                    :class="[ { active: l.active, dashed: l.dashed, done: l.kind === 'terminal', min: surface.minimized.includes(l.status), sel: sel.g === gi && sel.l === li, grown: grown && sel.g === gi && sel.l === li }, dropClass(l.status) ]"
                    :style="{ flex: `${shownWeight(l)} 1 0` }" @click="selectLane(gi, li)" @dblclick="grown ? (grow = false) : toggle('minimized', l.status)">
                    <div class="lhd" :title="grown ? 'shrink lane (g)' : ''">
                        <span>{{ grown ? "◆" : surface.minimized.includes(l.status) ? "▶" : "▼" }}<span class="ttl">{{ l.status }}</span></span>
                        <span>{{ l.cards.length }}</span>
                    </div>
                    <div v-if="!surface.minimized.includes(l.status)" class="cards" tabindex="-1">
                        <!--  the task carried by the keyboard, shown on top of the selected target lane  -->
                        <div v-if="carried !== null && drag?.over === l.status" class="card held sel carried" :class="`tone-${carried.tone}`">
                            <div class="cbody"><TaskTitle :id="carried.id" :epic="carried.group" :title="carried.title" :edit="carried.edit" :effort="carried.effort" /></div>
                        </div>
                        <div v-for="c in l.cards" :key="c.id" class="card"
                            :class="[ `tone-${c.tone}`, { sel: sel.id === c.id, badged: badges.has(c.id) }, carryClass(c.id) ]"
                            @click="sel = { g: gi, l: li, id: c.id }" @dblclick.stop="openTask(c.id)"
                            @pointerdown="pointerDown($event, c.id, l.status, c.moves)">
                            <div v-if="badges.has(c.id)" class="cagents"><span v-for="(b, bi) in badges.get(c.id)!" :key="bi" class="cagent"><span class="aicon">{{ b.icon }}</span> {{ b.name }}</span></div>
                            <div class="cbody"><TaskTitle :id="c.id" :epic="c.group" :title="c.title" :edit="c.edit" :effort="c.effort" /></div>
                        </div>
                    </div>
                    <!--  the grip bar between the lane and its lower neighbor lane,
                          moving the border to it by dragging it vertically  -->
                    <div v-if="!grown && hasLower(g, li)" class="grip" title="resize lane (drag, or +/-/0)"
                        @pointerdown.stop="gripDown($event, gi, li)" @dblclick.stop></div>
                </div>
            </div>
        </template>
    </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, watch } from "vue"
import TaskTitle                                            from "./ase-task-board-web-client-title.vue"
import {
    type Group, type LaneGeometry,
    groupItems, resizeLane, lanePreview, shownWeight, stopSnap, laneGeometry, snapLane,
    board, boardError, view, graph, task, sel, grow, drag, boardEl,
    surface, titles, grown, badges, openTask, toggle, updateScroll
} from "./ase-task-board-web-client-model"
import { canDrop, moveTask } from "./ase-task-board-web-client-control"

/*  select a lane (like PgUp/PgDn), unless the selection is already within it  */
const selectLane = (g: number, l: number) => {
    if (board.value === null || (sel.value.g === g && sel.value.l === l))
        return
    const next = groupItems(board.value, g, surface.value).find((it) => it.l === l)
    if (next !== undefined)
        sel.value = next
}

/*  select a phase (like ←/→), i.e., the lane of the same row as the selected lane,
    unless the selection is already within it  */
const selectPhase = (g: number) => {
    if (board.value === null || sel.value.g === g)
        return
    const items = groupItems(board.value, g, surface.value)
    sel.value = items.find((it) => it.l === sel.value.l) ?? items[0]
}

/*  the task carried by the keyboard while the selected lane is a reachable target (as then it is
    shown on top of this lane, while a dim ghost of it stays at its original position until the drop)  */
const carried = computed(() => {
    const d = drag.value
    if (d?.key !== true || d.over === null || !canDrop(d.over))
        return null
    return board.value?.groups.flatMap((g) => g.lanes).flatMap((l) => l.cards).find((c) => c.id === d.id) ?? null
})
const carryClass = (id: string) => drag.value?.id !== id ? {} : {
    dragging: drag.value.key !== true,
    held:     drag.value.key === true && carried.value === null,
    ghost:    drag.value.key === true && carried.value !== null
}
const dropClass = (status: string) => drag.value === null ? {} : {
    target:  canDrop(status),
    over:    canDrop(status) && drag.value.over === status,
    blocked: !canDrop(status) && status !== drag.value.from
}

/*  drag & drop a task box onto another lane (see "drag" of the model) through pointer events, as HTML5
    drag & drop is unsupported by off-screen rendering web views (like the one of the Herdr desktop app),
    where the drag starts once the pressed pointer moved a few pixels, with a floating clone of the
    task box following the pointer (like the HTML5 drag image), and ESC cancels it  */
let press: { id: string, from: string, moves?: string[], x: number, y: number, el: HTMLElement, pid: number, ghost: HTMLElement | null } | null = null
const laneAt = (ev: PointerEvent) =>
    document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>("#board .lane[data-status]")?.dataset.status ?? null
const release = () => {
    press?.ghost?.remove()
    press = null
}
const pointerDown = (ev: PointerEvent, id: string, from: string, moves?: string[]) => {
    if (ev.button !== 0 || drag.value !== null)
        return
    press = { id, from, moves, x: ev.clientX, y: ev.clientY, el: ev.currentTarget as HTMLElement, pid: ev.pointerId, ghost: null }
}
const pointerMove = (ev: PointerEvent) => {
    if (press === null || ev.pointerId !== press.pid)
        return
    if (press.ghost === null) {
        if (Math.hypot(ev.clientX - press.x, ev.clientY - press.y) < 5)
            return
        const r = press.el.getBoundingClientRect()
        press.ghost = press.el.cloneNode(true) as HTMLElement
        press.ghost.classList.add("floating")
        Object.assign(press.ghost.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px` })
        boardEl.value?.appendChild(press.ghost)
        press.el.setPointerCapture(ev.pointerId)
        drag.value = { id: press.id, from: press.from, moves: press.moves, over: null }
    }
    if (drag.value?.id !== press.id || drag.value.key === true) {
        release()
        return
    }
    press.ghost.style.transform = `translate(${ev.clientX - press.x}px, ${ev.clientY - press.y}px)`
    const status = laneAt(ev)
    drag.value.over = status !== null && canDrop(status) ? status : null
}
const pointerUp = async (ev: PointerEvent) => {
    if (press === null || ev.pointerId !== press.pid)
        return
    const started = press.ghost !== null
    const id      = press.id
    release()
    const d = drag.value
    if (!started || d?.id !== id || d.key === true)
        return
    const status = laneAt(ev)
    const ok     = status !== null && canDrop(status)
    drag.value = null
    if (ok)
        await moveTask(d.id, status)
}
const pointerCancel = (ev?: Event) => {
    if (press === null || (ev instanceof KeyboardEvent && ev.key !== "Escape"))
        return
    if (press.ghost !== null && drag.value?.id === press.id && drag.value.key !== true)
        drag.value = null
    release()
}

/*  resize a lane against its lower neighbor lane by dragging its grip, where the pixels moved are
    taken as a share of the pixel heights of all maximized lanes of the phase (which flex distributes
    by their weights), with the resized weights previewed while dragging (starting from the shown
    ones, also within a running snapping), snapped onto the grid of the lanes and persisted on its
    release (see "snapLane"), and dropped by ESC  */
let resize: { geom: LaneGeometry, base: Record<string, number>, g: number, l: number, y: number, pid: number } | null = null
const hasLower = (g: Group, l: number) => !surface.value.minimized.includes(g.lanes[l].status)
    && g.lanes.some((lane, i) => i > l && !surface.value.minimized.includes(lane.status))
const gripDown = (ev: PointerEvent, gi: number, li: number) => {
    const el = ev.currentTarget as HTMLElement
    if (ev.button !== 0 || drag.value !== null)
        return
    stopSnap()
    const geom = laneGeometry(gi, li)
    if (geom === null)
        return
    resize = { geom, base: lanePreview.value ?? {}, g: gi, l: li, y: ev.clientY, pid: ev.pointerId }
    el.setPointerCapture(ev.pointerId)
    ev.preventDefault()
}
const gripMove = (ev: PointerEvent) => {
    const lanes = resize === null ? undefined : board.value?.groups[resize.g]?.lanes
    if (resize === null || ev.pointerId !== resize.pid || lanes === undefined)
        return
    const share   = resize.geom.sign * (ev.clientY - resize.y) / resize.geom.px
    const entries = resizeLane(lanes, resize.geom.weights, surface.value.minimized, resize.l, share)
    if (entries !== null)
        lanePreview.value = { ...resize.base, ...entries }
}
const gripUp = (ev: PointerEvent) => {
    if (resize === null || ev.pointerId !== resize.pid)
        return
    const r = resize
    resize = null
    if (!snapLane(r.g, r.l, r.geom, r.geom.sign * (ev.clientY - r.y)))
        lanePreview.value = null
}
const gripCancel = (ev?: Event) => {
    if (resize === null || (ev instanceof KeyboardEvent && ev.key !== "Escape"))
        return
    resize = null
    lanePreview.value = null
}
onMounted(() => {
    window.addEventListener("pointermove",   pointerMove)
    window.addEventListener("pointerup",     pointerUp)
    window.addEventListener("pointercancel", pointerCancel)
    window.addEventListener("keydown",       pointerCancel)
    window.addEventListener("pointermove",   gripMove)
    window.addEventListener("pointerup",     gripUp)
    window.addEventListener("pointercancel", gripCancel)
    window.addEventListener("keydown",       gripCancel)
})
onUnmounted(() => {
    window.removeEventListener("pointermove",   pointerMove)
    window.removeEventListener("pointerup",     pointerUp)
    window.removeEventListener("pointercancel", pointerCancel)
    window.removeEventListener("keydown",       pointerCancel)
    window.removeEventListener("pointermove",   gripMove)
    window.removeEventListener("pointerup",     gripUp)
    window.removeEventListener("pointercancel", gripCancel)
    window.removeEventListener("keydown",       gripCancel)
})

/*  scroll the selection into view, and focus the selected lane,
    so keys like HOME/END scroll it (unless typing elsewhere)  */
const showSel = () => {
    if (view.value !== "lanes")
        return
    const el = boardEl.value?.querySelector(".card.sel") ?? boardEl.value?.querySelector(".lane.sel")
    el?.scrollIntoView({ block: "nearest", inline: "nearest" })
    const lane = boardEl.value?.querySelector<HTMLElement>(".lane.sel .cards") ?? boardEl.value?.querySelector<HTMLElement>(".lane.sel")
    if (task.value === null && !(document.activeElement instanceof HTMLInputElement))
        lane?.focus({ preventScroll: true })
}
watch([ sel, graph, view, task, grown ], () => nextTick(showSel))
</script>

