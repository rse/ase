<!--
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
-->

<!--  the task dialog: the rendered task plan and its attachments, or the task plan editor  -->
<template>
    <div v-show="task !== null" id="scrim" @click.self="leaveEdit(true)">
        <div v-if="task !== null" id="dlg" :class="{ full: watched !== null }">
            <!--  the header: task group (if any, and not for an epic), task id (behind "≡", and of an epic also behind "♛"),
                  and title on the left, lane group and lane on the right  -->
            <div class="dhd">
                <h1 :class="`tone-${task.tone}`"><TaskTitle :id="task.id" :epic="task.epic" :title="task.title" /></h1>
                <span v-if="editing?.id !== ''" class="where"><span class="val">{{ task.group }}</span> ▷ <span class="val">{{ task.status }}</span></span>
                <button v-if="editing === null" class="close" title="edit (e)" @click="startEdit(false)">✎</button>
                <button v-if="watched === null" class="close" title="close (ESC)" @click="leaveEdit(true)">✕</button>
            </div>

            <!--  the dependencies: predecessors on the left, successors on the right  -->
            <div class="drefs">
                <span>
                    <span class="mute">predecessors:</span>
                    <span v-if="task.pred.length === 0" class="mute">—</span>
                    <span v-for="r in task.pred" :key="r.id" class="ref" :class="`tone-${r.tone}`" @click="openTask(r.id)">≡ {{ r.id }}</span>
                </span>
                <span>
                    <span class="mute">successors:</span>
                    <span v-if="task.succ.length === 0" class="mute">—</span>
                    <span v-for="r in task.succ" :key="r.id" class="ref" :class="`tone-${r.tone}`" @click="openTask(r.id)">≡ {{ r.id }}</span>
                </span>
            </div>

            <!--  the tabs: the task plan, followed by its attachments, with a
                  scroll arrow on each side where further tabs are hidden  -->
            <div class="dtabs">
                <button class="tarr" :style="{ visibility: tabScroll.less ? 'visible' : 'hidden' }" @click="selectTab(tab - 1)">◁</button>
                <div ref="tabsEl" class="tlist" @scroll="updateTabScroll">
                    <button v-for="(label, i) in task.tabs" :key="i" class="tab" :class="{ sel: i === tab }" @click="selectTab(i)">{{ label }}</button>
                </div>
                <button class="tarr" :style="{ visibility: tabScroll.more ? 'visible' : 'hidden' }" @click="selectTab(tab + 1)">▷</button>
            </div>

            <!--  the notice of the task plan editor: a restorable draft, a confirmation
                  to discard the changes, a save conflict, or a save error  -->
            <div v-if="notice !== null" class="dnote">
                <template v-if="notice.kind === 'draft'">
                    an unsaved draft of this task exists
                    <button @click="restoreDraft">restore</button>
                    <button @click="dropDraft">discard</button>
                </template>
                <template v-else-if="notice.kind === 'discard'">
                    discard the unsaved changes?
                    <button @click="notice.close ? closeTask() : stopEdit()">discard</button>
                    <button @click="notice = null">keep editing</button>
                </template>
                <template v-else-if="notice.kind === 'conflict'">
                    {{ notice.message }} (draft kept)
                    <button v-if="notice.base !== null" @click="saveEdit(notice.base)">overwrite</button>
                    <button @click="dropDraft(); stopEdit()">discard</button>
                </template>
                <template v-else>{{ notice.message }}</template>
            </div>

            <!--  the notices of the task actions, as the status line is behind the backdrop, and for
                  the task viewer, which has no status line, also their errors (stale ones of the board stay out)  -->
            <div v-if="actionNote !== null || (watched !== null && actionError !== null)" class="dnote">{{ actionNote ?? actionError }}</div>

            <!--  the content: the rendered task plan or attachment of the selected tab, or the task plan editor  -->
            <iframe v-show="editing === null" id="plan" ref="planEl" title="task plan"
                sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                :srcdoc="planDoc" @load="restorePlanScroll"></iframe>
            <div v-show="editing !== null" id="editor" ref="editorEl"></div>

            <!--  the footer: the key hints  -->
            <div v-if="editing?.keymap === 'vim'" class="dfoot"><kbd>:w</kbd><span class="action">saves</span><span class="sep">·</span><kbd>:q</kbd><span class="action">cancels</span><span class="sep">·</span><kbd>:q!</kbd><span class="action">discards</span></div>
            <div v-else-if="editing?.keymap === 'emacs'" class="dfoot"><kbd>C-x C-s</kbd><span class="action">saves</span><span class="sep">·</span><kbd>C-x C-c</kbd><span class="action">cancels</span></div>
            <div v-else-if="editing !== null" class="dfoot"><kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>S</kbd><span class="action">saves</span><span class="sep">·</span><kbd>ESC</kbd><span class="action">cancels</span></div>
            <div v-else class="dfoot"><template v-if="tab === 0 && taskDiff !== null"><kbd>#</kbd><span class="action">clears diff</span><span class="sep">·</span></template><kbd>←</kbd>/<kbd>→</kbd>/<kbd>⇤</kbd>/<kbd>⇥</kbd><span class="action">switches tab</span><span class="sep">·</span><kbd>↑</kbd>/<kbd>↓</kbd>/<kbd>⇈</kbd>/<kbd>⇊</kbd><span class="action">scrolls</span><span class="sep">·</span><kbd>e</kbd><span class="action">edits</span><span class="sep">·</span><kbd>E</kbd><span class="action">edits by prompt</span><span class="sep">·</span><kbd>R</kbd><span class="action">requests by prompt</span><span class="sep">·</span><kbd>T</kbd><span class="action">transitions</span><span class="sep">·</span><kbd>A</kbd><span class="action">assigns</span><span class="sep">·</span><kbd>D</kbd><span class="action">deletes</span><span class="sep">·</span><kbd>L</kbd><span class="action">cycles theme</span><template v-if="watched === null"><span class="sep">·</span><kbd>⏎</kbd>/<kbd>ESC</kbd><span class="action">closes</span></template></div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from "vue"
import TaskTitle from "./ase-task-board-web-client-title.vue"
import {
    task, editing, notice, tab, tabDocs, taskDiff, tabScroll, tabScrolls, planEl, tabsEl, actionError, actionNote, watched,
    openTask, closeTask, selectTab, updateTabScroll, themed
} from "./ase-task-board-web-client-model"
import {
    editorEl, startEdit, saveEdit, stopEdit, leaveEdit, restoreDraft, dropDraft
} from "./ase-task-board-web-client-editor"

/*  the document of the selected tab, themed only when it changes, as a theme
    change adjusts the root element of the shown one and must not reload it  */
const planDoc = computed(() => themed(tab.value === 0 ? (taskDiff.value ?? task.value?.doc ?? "") : (tabDocs.value[tab.value] ?? "")))

/*  restore the scroll position of the document of the selected tab once it is loaded  */
const restorePlanScroll = () => {
    planEl.value?.contentWindow?.scrollTo(0, tabScrolls.get(tab.value) ?? 0)
    bindKeys()
    bindImageZoom()
}

/*  pass the keys pressed within the document of the selected tab, which takes
    the keyboard focus on a click into it, on to the key dispatching of the page  */
const bindKeys = () => {
    planEl.value?.contentDocument?.addEventListener("keydown", (ev) => {
        if (!document.dispatchEvent(new KeyboardEvent("keydown", ev)))
            ev.preventDefault()
    })
}

/*  zoom the embedded image of an attachment tab with the mouse wheel, keeping
    the point under the pointer in place, and pan it by dragging, as in the graph  */
const bindImageZoom = () => {
    const doc  = planEl.value?.contentDocument
    const img  = doc?.querySelector<HTMLImageElement>(".embedding img")
    const view = doc?.scrollingElement
    if (img === null || img === undefined || view === null || view === undefined)
        return
    let scale = 1
    let base  = 0
    let drag: { x: number, y: number, left: number, top: number } | null = null
    img.addEventListener("wheel", (ev) => {
        ev.preventDefault()
        if (base === 0)
            base = img.getBoundingClientRect().width
        const delta = ev.deltaY * (ev.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : ev.deltaMode === WheelEvent.DOM_DELTA_PAGE ? 400 : 1)
        const old   = img.getBoundingClientRect()
        const rx    = (ev.clientX - old.left) / old.width
        const ry    = (ev.clientY - old.top)  / old.height
        scale = Math.min(16, Math.max(0.1, scale * Math.exp(-delta * 0.002)))
        img.style.maxWidth = "none"
        img.style.width    = `${base * scale}px`
        const now = img.getBoundingClientRect()
        view.scrollLeft += now.left + rx * now.width  - ev.clientX
        view.scrollTop  += now.top  + ry * now.height - ev.clientY
    }, { passive: false })
    img.addEventListener("pointerdown", (ev) => {
        if (ev.button !== 0)
            return
        ev.preventDefault()
        img.setPointerCapture(ev.pointerId)
        drag = { x: ev.clientX, y: ev.clientY, left: view.scrollLeft, top: view.scrollTop }
    })
    img.addEventListener("pointermove", (ev) => {
        if (drag === null)
            return
        view.scrollLeft = drag.left - (ev.clientX - drag.x)
        view.scrollTop  = drag.top  - (ev.clientY - drag.y)
    })
    img.addEventListener("pointerup",     () => { drag = null })
    img.addEventListener("pointercancel", () => { drag = null })
}
</script>

