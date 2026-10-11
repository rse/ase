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
            <span class="sep">·</span>view: <button class="val toggle" title="switch view (v)" @click="cycleView()">{{ view }}</button>
            <span v-show="view !== 'agents'" class="sep">·</span><span v-show="view !== 'agents'" class="filter">filter:
                <span class="field">
                    <input ref="filterEl" v-model="filter" class="val" type="text" autocomplete="off" spellcheck="false"
                        placeholder="keywords…" title="space ANDs, comma ORs fuzzy matched keywords (/)" @keydown.esc="clearFilter" @keydown.enter="filterEl?.blur()">
                    <button v-show="filter !== ''" class="clear" title="clear filter (ESC)" @click="clearFilter">✕</button>
                </span>
            </span>
        </span>
    </header>
    <div id="view">
        <div v-show="view === 'lanes'" id="board" ref="boardEl" :class="{ titles, grown }" @scroll="updateScroll">
            <template v-if="boardError !== null">{{ boardError }}</template>
            <template v-for="(g, gi) in board?.groups ?? []" :key="g.title">
                <!--  render each lane of a collapsed group as a narrow box with its
                      vertically written status and number of cards (expanding the group on click)  -->
                <div v-if="surface.collapsed.includes(g.title)" class="group coll">
                    <div class="ghd" :class="{ sel: sel.g === gi }" @click="toggle('collapsed', g.title)"><span class="arr right">▼</span></div>
                    <div v-for="(l, li) in g.lanes" :key="l.status" class="lane" tabindex="-1"
                        :class="[ { active: l.active, dashed: l.dashed, done: l.kind === 'terminal', sel: sel.g === gi && sel.l === li }, dropClass(l.status) ]"
                        :style="{ flex: `${l.weight} 1 0` }" @click="selectLane(gi, li); toggle('collapsed', g.title)"
                        @dragover="dragOver($event, l.status)" @dragleave="dragLeave($event, l.status)" @drop="drop($event, l.status)">
                        <span class="arr right">▼</span>
                        <span class="vt">{{ l.status.toUpperCase() }}</span>
                        <span class="cnt">{{ l.cards.length }}</span>
                    </div>
                </div>
                <!--  while a lane is grown, only it is shown (within its group), with its cards in a grid  -->
                <div v-else class="group" :class="{ grown: grown && sel.g === gi }">
                    <div class="ghd" :class="{ sel: sel.g === gi }" @click="toggle('collapsed', g.title)"><span class="arr">▼</span><span class="ttl">{{ g.title }}</span></div>
                    <div v-for="(l, li) in g.lanes" :key="l.status" class="lane" tabindex="-1"
                        :class="[ { active: l.active, dashed: l.dashed, done: l.kind === 'terminal', min: surface.minimized.includes(l.status), sel: sel.g === gi && sel.l === li, grown: grown && sel.g === gi && sel.l === li }, dropClass(l.status) ]"
                        :style="{ flex: `${l.weight} 1 0` }" @click="selectLane(gi, li)"
                        @dragover="dragOver($event, l.status)" @dragleave="dragLeave($event, l.status)" @drop="drop($event, l.status)">
                        <div class="lhd" :title="grown ? 'shrink lane (g)' : ''" @click="grown ? (grow = false) : toggle('minimized', l.status)">
                            <span>{{ grown ? "◆" : surface.minimized.includes(l.status) ? "▶" : "▼" }}<span class="ttl">{{ l.status }}</span></span>
                            <span>{{ l.cards.length }}</span>
                        </div>
                        <div v-if="!surface.minimized.includes(l.status)" class="cards" tabindex="-1">
                            <!--  the task carried by the keyboard, shown on top of the selected target lane  -->
                            <div v-if="carried !== null && drag?.over === l.status" class="card held sel carried" :class="`tone-${carried.tone}`">
                                <div class="cbody"><span v-if="carried.group !== '' && carried.group !== carried.id" class="cepic">♛ {{ carried.group }} ▶</span><span class="cid">{{ carried.group === carried.id ? "♛ " : "" }}{{ carried.id }}</span>{{ carried.cyclic ? "⟲ " : "" }}<span v-if="carried.edit !== ''" class="cedit" :class="carried.edit" :title="editTitles[carried.edit]">{{ editMarkers[carried.edit] }}</span><template v-for="(s, si) in titleSegments(carried.title)" :key="si"><code v-if="s.code">{{ s.text }}</code><template v-else>{{ s.text }}</template></template></div>
                            </div>
                            <div v-for="c in l.cards" :key="c.id" class="card" draggable="true"
                                :class="[ `tone-${c.tone}`, { sel: sel.id === c.id, working: working.has(c.id) }, carryClass(c.id) ]"
                                @click="sel = { g: gi, l: li, id: c.id }; openTask(c.id)"
                                @dragstart="dragStart($event, c.id, l.status, c.moves)" @dragend="dragEnd">
                                <div v-if="working.has(c.id)" class="cagents"><span v-for="name in working.get(c.id)!" :key="name" class="cagent"><span class="aicon">⚉</span> {{ name }}</span></div>
                                <div class="cbody"><span v-if="c.group !== '' && c.group !== c.id" class="cepic">♛ {{ c.group }} ▶</span><span class="cid">{{ c.group === c.id ? "♛ " : "" }}{{ c.id }}</span>{{ c.cyclic ? "⟲ " : "" }}<span v-if="c.edit !== ''" class="cedit" :class="c.edit" :title="editTitles[c.edit]">{{ editMarkers[c.edit] }}</span><template v-for="(s, si) in titleSegments(c.title)" :key="si"><code v-if="s.code">{{ s.text }}</code><template v-else>{{ s.text }}</template></template></div>
                            </div>
                        </div>
                    </div>
                </div>
            </template>
        </div>
        <!--  the dependency graph SVG, generated by the service itself (with all texts escaped),
              with its statistics overlaid onto the top-right corner of its border (like in the TUI)  -->
        <div v-show="view === 'graph'" id="gframe">
            <!-- eslint-disable vue/no-v-html -->
            <div id="graph" ref="graphEl" :class="{ titles, panning: pan !== null }" @click="graphClick"
                @wheel="graphZoom" @pointerdown="graphPanStart" @pointermove="graphPanMove" @pointerup="pan = null" @pointercancel="pan = null"
                v-html="graph"></div>
            <!-- eslint-enable vue/no-v-html -->
            <div v-if="graphStats !== null" class="gstats">{{ graphStats.tasks }} tasks, {{ graphStats.dependencies }} dependencies</div>
        </div>
        <!--  the agents view: the master list "agents" of the agents as cards (name and state, kind and
              mode of operation, uptime, the ids of the tasks it is busy with, else "none (waiting)", and its
              total and last usage of the agent tool), and the
              detail view "agent log" with the recent processing log of the selected agent (with the task ids
              inverse), with its lines broken and following its bottom unless scrolled up  -->
        <div v-show="view === 'agents'" id="agents">
            <section class="amaster">
                <div class="atitle">Agents</div>
                <div class="alist">
                    <div v-if="agentList.length === 0" class="aempty" :class="{ off: agents !== null && !agents.connected }">{{ agentsEmpty }}</div>
                    <div v-for="a in agentList" :key="a.id" class="acard" :class="{ sel: a.id === agentSel?.id, busy: a.state === 'busy' }"
                        @click="selectAgent(a.id)">
                        <div class="aname"><span class="abadge"><span class="aicon">⚉</span> {{ a.name }}</span></div>
                        <span class="abeat">{{ beatOf(a.id) ? "♥" : "♡" }}</span>
                        <div class="afields">
                            <span>kind:</span><b class="aval">{{ a.kind }}</b>
                            <span>mode:</span><b class="aval">{{ typeof a.mode === "string" && a.mode !== "" ? a.mode : "none" }}</b>
                            <span>uptime:</span><b class="aval">{{ agentUptime(a) }}</b>
                            <span>task:</span><span class="aval atasks"><b v-if="a.tasks.length === 0">none (waiting)</b><span v-for="id in a.tasks" :key="id" class="atask">{{ id }}</span></span>
                            <span>usage:</span><b class="aval">{{ agentUsage(a.usage?.total) }}</b>
                            <span>last:</span><b class="aval">{{ agentUsage(a.usage?.last) }}</b>
                        </div>
                    </div>
                </div>
            </section>
            <section class="adetail">
                <div class="atitle">Agent: Recent Log Entries</div>
                <div ref="logEl" class="alog" @scroll="onLogScroll">
                    <AgentLog />
                </div>
                <div v-if="logPos !== ''" class="apos">{{ logPos }}</div>
            </section>
        </div>
    </div>
    <!--  the horizontal scroll bar of the lanes view, resp. the info line
          of the graph view with the selected task and its status  -->
    <div id="hscroll">
        <button :style="{ visibility: view === 'lanes' && !scroll.all && !grown ? 'visible' : 'hidden' }" @click="scrollBy(-240)">◀</button>
        <span v-if="grown">lane <b>{{ board?.groups[sel.g]?.lanes[sel.l]?.status }}</b> of group <b>{{ board?.groups[sel.g]?.title }}</b> grown<span class="sep">·</span>g shrinks</span>
        <span v-else-if="view === 'lanes' && scroll.info !== ''">{{ scroll.info }}<span class="sep">·</span>{{ scroll.all ? "all visible" : "scroll or ◀/▶" }}</span>
        <span v-else-if="view === 'graph' && selStatus !== null">task: <b>{{ sel.id }}</b><span class="sep">·</span>status: <b>{{ selStatus }}</b></span>
        <span v-else-if="view === 'agents' && agentSel !== null">agent: <b>{{ agentLabel(agentSel) }}</b><span class="sep">·</span>host: <b>{{ agentSel.host }}</b><span class="sep">·</span>pid: <b>{{ agentSel.pid }}</b><span class="sep">·</span>{{ agentSel.state }}: <b>{{ agentDuration(agentNow - agentSel.since) }}</b><span class="sep">·</span>heartbeat: <b>{{ agentDuration(agentNow - agentSel.beat) }} ago</b></span>
        <button :style="{ visibility: view === 'lanes' && !scroll.all && !grown ? 'visible' : 'hidden' }" @click="scrollBy(240)">▶</button>
    </div>
    <footer>
        <div v-for="(line, k) in (surface.keys ? hints : [])" :key="k">
            <template v-for="(hint, i) in line" :key="hint.key">
                <span v-if="i > 0" class="sep">·</span><template v-for="(key, j) in (hint.key === '/' ? [ '/' ] : hint.key.split('/'))" :key="j"><template v-if="j > 0">/</template><kbd>{{ key }}</kbd></template><span class="action">{{ hint.action }}</span>
            </template>
        </div>
        <div v-if="warning !== ''" class="status">{{ warning }}</div>
        <div v-else class="status idle"><template v-if="board !== null">⧉ ASE: <b>Task Board</b><span class="sep">·</span>server: <b :class="{ off: !online }">{{ online ? "online" : "offline" }}</b> <span :class="{ off: !online }">{{ online ? "●" : "○" }}</span><template v-if="store !== null"><span class="sep">·</span>store: <b>{{ store.kind }}</b> <span :class="{ off: !online || !store.connected }">{{ online && store.connected ? "●" : "○" }}</span></template><template v-if="agents !== null"><span class="sep">·</span>agents: <b>{{ agents.agents.length }}</b> <span :class="{ off: !online || !agents.connected }">{{ online && agents.connected ? "●" : "○" }}</span></template><span class="sep">·</span>version: <b>ASE {{ board.version }}</b></template></div>
    </footer>
    <div v-show="task !== null" id="scrim" @click.self="leaveEdit(true)">
        <div v-if="task !== null" id="dlg">
            <!--  the header: task group (if any, and not for an epic), task id (of an epic behind "♛"),
                  and title on the left, lane group and lane on the right  -->
            <div class="dhd">
                <h1 :class="`tone-${task.tone}`"><span v-if="task.epic !== '' && task.epic !== task.id" class="cepic">♛ {{ task.epic }} ▶</span><span class="cid">{{ task.epic === task.id ? "♛ " : "" }}{{ task.id }}</span><template v-for="(s, si) in titleSegments(task.title)" :key="si"><code v-if="s.code">{{ s.text }}</code><template v-else>{{ s.text }}</template></template></h1>
                <span v-if="editing?.id !== ''" class="where"><span class="val">{{ task.group }}</span> ▷ <span class="val">{{ task.status }}</span></span>
                <button v-if="editing === null" class="close" title="edit (e)" @click="startEdit(false)">✎</button>
                <button class="close" title="close (ESC)" @click="leaveEdit(true)">✕</button>
            </div>

            <!--  the dependencies: predecessors on the left, successors on the right  -->
            <div class="drefs">
                <span>
                    <span class="mute">predecessors:</span>
                    <span v-if="task.pred.length === 0" class="mute">—</span>
                    <span v-for="r in task.pred" :key="r.id" class="ref" :class="`tone-${r.tone}`" @click="openTask(r.id)">{{ r.id }}</span>
                </span>
                <span>
                    <span class="mute">successors:</span>
                    <span v-if="task.succ.length === 0" class="mute">—</span>
                    <span v-for="r in task.succ" :key="r.id" class="ref" :class="`tone-${r.tone}`" @click="openTask(r.id)">{{ r.id }}</span>
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

            <!--  the content: the rendered task plan or attachment of the selected tab, or the task plan editor  -->
            <iframe v-show="editing === null" id="plan" ref="planEl" title="task plan"
                sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                :srcdoc="tab === 0 ? task.doc : (tabDocs[tab] ?? '')" @load="restorePlanScroll"></iframe>
            <div v-show="editing !== null" id="editor" ref="editorEl"></div>

            <!--  the footer: the key hints  -->
            <div v-if="editing?.keymap === 'vim'" class="dfoot"><kbd>:w</kbd><span class="action">saves</span><span class="sep">·</span><kbd>:q</kbd><span class="action">cancels</span><span class="sep">·</span><kbd>:q!</kbd><span class="action">discards</span></div>
            <div v-else-if="editing?.keymap === 'emacs'" class="dfoot"><kbd>C-x C-s</kbd><span class="action">saves</span><span class="sep">·</span><kbd>C-x C-c</kbd><span class="action">cancels</span></div>
            <div v-else-if="editing !== null" class="dfoot"><kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>S</kbd><span class="action">saves</span><span class="sep">·</span><kbd>ESC</kbd><span class="action">cancels</span></div>
            <div v-else class="dfoot"><kbd>←</kbd>/<kbd>→</kbd>/<kbd>⇤</kbd>/<kbd>⇥</kbd><span class="action">switches tab</span><span class="sep">·</span><kbd>↑</kbd>/<kbd>↓</kbd>/<kbd>⇈</kbd>/<kbd>⇊</kbd><span class="action">scrolls</span><span class="sep">·</span><kbd>e</kbd><span class="action">edits</span><span class="sep">·</span><kbd>E</kbd><span class="action">edits by prompt</span><span class="sep">·</span><kbd>T</kbd><span class="action">transitions</span><span class="sep">·</span><kbd>D</kbd><span class="action">deletes</span><span class="sep">·</span><kbd>⏎</kbd>/<kbd>ESC</kbd><span class="action">closes</span></div>
        </div>
    </div>

    <!--  the confirmation of a task deletion  -->
    <div v-if="confirmDel !== null" id="confirm" @click.self="confirmDel = null">
        <div class="box">
            <div class="ask">Delete task <span class="cid">{{ confirmDel }}</span>?</div>
            <div class="buttons">
                <button @click="deleteTask(confirmDel)">delete</button>
                <button @click="confirmDel = null">cancel</button>
            </div>
            <div class="keys"><kbd>y</kbd><span class="action">deletes</span><span class="sep">·</span><kbd>ESC</kbd><span class="action">cancels</span></div>
        </div>
    </div>

    <!--  the transfer of a task to another state: all lane states, where only the
          current state and the states reachable from it are selectable  -->
    <div v-if="transfer !== null" id="transfer" @click.self="cancelTransfer">
        <div class="box">
            <div class="ask">Transfer task <span class="cid">{{ transfer.id }}</span> to:</div>
            <div class="states">
                <button v-for="e in transferList" :key="e.status" :disabled="!e.ok" :class="{ sel: e.status === transfer.at }"
                    @click="transferTo(transfer.id, e.status)">{{ e.group }} ▷ <span class="state">{{ e.status }}</span><span v-if="e.current" class="cur"> (current)</span></button>
            </div>
            <div class="keys"><kbd>↑</kbd>/<kbd>↓</kbd><span class="action">selects</span><span class="sep">·</span><kbd>⏎</kbd><span class="action">transitions</span><span class="sep">·</span><kbd>ESC</kbd><span class="action">cancels</span></div>
        </div>
    </div>

    <!--  the prompt of an edit request of a task (processed by "ase agent editor")  -->
    <div v-if="prompt !== null" id="prompt" @click.self="cancelPrompt">
        <div class="box">
            <div class="ask">Edit task <span class="cid">{{ prompt.id }}</span> by prompt:</div>
            <textarea ref="promptEl" v-model="prompt.text" rows="5" spellcheck="false"></textarea>
            <div class="buttons">
                <button @click="submitPrompt">request edit</button>
                <button @click="cancelPrompt">cancel</button>
            </div>
            <div class="keys"><kbd>⏎</kbd><span class="action">requests edit</span><span class="sep">·</span><kbd>Shift+⏎</kbd><span class="action">breaks line</span><span class="sep">·</span><kbd>ESC</kbd><span class="action">cancels</span></div>
        </div>
    </div>

    <!--  the modal busy popup of a slow request to the service: a spinner,
          the operation, and its elapsed time, above an indeterminate progress bar  -->
    <div v-if="busy !== null" id="busy">
        <div class="box">
            <div class="ask"><span class="spinner"></span>{{ busy.label.text }}<span v-if="busy.label.id !== undefined" class="cid">{{ busy.label.id }}</span><template v-if="busy.label.suffix !== undefined">{{ busy.label.suffix }}</template><span class="time">({{ busyTime }})</span></div>
            <div class="bar"><div class="block"></div></div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, shallowRef, reactive, computed, nextTick, watch, onMounted, onBeforeUnmount, defineComponent, h } from "vue"
import Mousetrap                                                                   from "mousetrap"
import { EditorView, keymap, drawSelection, ViewPlugin, Decoration, WidgetType }   from "@codemirror/view"
import { EditorState }                                                             from "@codemirror/state"
import { defaultKeymap, history, historyKeymap, indentWithTab }                    from "@codemirror/commands"
import { HighlightStyle, syntaxHighlighting }                                      from "@codemirror/language"
import { markdown }                                                                from "@codemirror/lang-markdown"
import { tags }                                                                    from "@lezer/highlight"
import { vim, Vim, getCM }                                                         from "@replit/codemirror-vim"
import { emacs, EmacsHandler }                                                     from "@replit/codemirror-emacs"

/*  the state of the edit requests of a task (see "ase agent editor"): requested, being processed, or failed  */
type EditState = "pending" | "active" | "failed"

/*  the board model and task details, as delivered by the service  */
type Card    = { id: string, title: string, group: string, cyclic: boolean, tone: string, moves?: string[], edit: EditState | "", finished: boolean }
type Lane    = { status: string, active: boolean, weight: number, dashed: boolean, kind: "initial" | "regular" | "terminal", cards: Card[] }
type Group   = { title: string, lanes: Lane[] }
type Surface = { view: View, minimized: string[], collapsed: string[], titles: boolean, keys: boolean, standalone: boolean }
type Board   = { mode: string, project: string, version: string, warnings: string[], surface: Surface, moves: Record<string, string[]>, groups: Group[] }
type Tone    = "active" | "done" | "idle"
type Ref     = { id: string, tone: Tone }
type Task    = { id: string, title: string, tone: Tone, status: string, group: string, epic: string, doc: string, tabs: string[], pred: Ref[], succ: Ref[] }
type View    = "lanes" | "graph" | "agents"

/*  the statistics of the dependency graph: its numbers of tasks and dependencies  */
type GraphStats = { tasks: number, dependencies: number }

/*  the agents passed by the agent relay: whether the agent relay is connected, and the
    running agents (with their usage of the agent tool, but without their processing log lines), and, separately, the processing
    log lines added per agent (a delta to be appended, or a reset with all its lines)  */
type AgentLine  = { time: number, level: "error" | "warning" | "info", task: string, msg: string }
type AgentUsage = { walltimeSec: number, costToken: number | null, costUSD: number | null }
type Agent      = { id: string, kind: string, name: string, mode?: string, host: string, pid: number, started?: number, state: "waiting" | "busy", tasks: string[], usage?: { total: AgentUsage, last: AgentUsage } | null, since: number, beat: number }
type Agents     = { connected: boolean, agents: Agent[] }
type AgentLogs  = Record<string, { reset: boolean, lines: AgentLine[] }>

/*  the key bindings of the task plan editor (see "board.web.editor.keymap")  */
type Keymap  = "default" | "vim" | "emacs"

/*  the notice of the task plan editor: a restorable draft, a confirmation to
    discard the changes (before leaving the editor or also the dialog), a save
    conflict (with the current entity tag, or null if deleted meanwhile), or a save error  */
type Notice  =
    { kind: "draft", draft: string } |
    { kind: "discard", close: boolean } |
    { kind: "conflict", message: string, base: string | null } |
    { kind: "error", message: string }

/*  the selection: group, lane, and card id ("" for a lane without card focus)  */
type Sel     = { g: number, l: number, id: string }

/*  the navigable items of a group: one per card, or one per lane
    which is minimized, empty, or within a collapsed group  */
const groupItems = (b: Board, g: number, s: Surface): Sel[] => {
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

/*  re-locate a selection on a (possibly changed) board: a selected card
    is followed into its current lane, otherwise the lane is kept  */
const relocate = (b: Board, sel: Sel, s: Surface): Sel => {
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
const busy    = ref<{ label: BusyLabel, since: number } | null>(null)
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
const busyTime = computed(() => busy.value === null ? "" : `${(Math.max(0, busyNow.value - busy.value.since) / 1000).toFixed(1)}s`)

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
        new:    "preparing new task",
        toggle: "saving board state"
    }
    if (Object.hasOwn(fixed, name))
        return { text: fixed[name] }
    const method = opts?.method ?? "GET"
    const edit   = /\/api\/task\/([^/?]+)\/edit$/.exec(url)?.[1]
    if (edit !== undefined)
        return { text: method === "POST" ? "requesting edit of task" : "loading edit prompt of task", id: decodeURIComponent(edit) }
    const text   = method === "DELETE" ? "deleting" : method !== "GET" ? "saving" : "loading"
    const id     = /\/api\/task\/([^/?]+)/.exec(url)?.[1]
    return id !== undefined ? { text: `${text} task`, id: decodeURIComponent(id) } : { text }
}

/*  fetch a JSON response of the service (tracked for the busy popup, unless in the background)  */
type Result<T> = (T & { error?: undefined }) | { error: string }
const api = async <T>(url: string, opts?: RequestInit, background = false): Promise<Result<T>> => {
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

/*  the state of the page  */
const board       = ref<Board | null>(null)
const boardError  = ref<string | null>(null)
const actionError = ref<string | null>(null)
const actionNote  = ref<string | null>(null)
const view        = ref<View>("lanes")
const graph       = ref("")
const graphStats  = ref<GraphStats | null>(null)
const task        = ref<Task | null>(null)
const boardEl     = ref<HTMLElement | null>(null)
const graphEl     = ref<HTMLElement | null>(null)
const pan         = ref<{ x: number, y: number, left: number, top: number } | null>(null)
const sel         = ref<Sel>({ g: 0, l: 0, id: "" })
const grow        = ref(false)
const planEl     = ref<HTMLIFrameElement | null>(null)
const tabsEl      = ref<HTMLElement | null>(null)
const editorEl    = ref<HTMLElement | null>(null)
const editing     = ref<{ id: string, orig: string, base: string, keymap: Keymap, dirty: boolean, direct: boolean } | null>(null)
const notice      = ref<Notice | null>(null)
const confirmDel  = ref<string | null>(null)
const transfer    = ref<{ id: string, at: string } | null>(null)
const prompt      = ref<{ id: string, text: string } | null>(null)
const promptEl    = ref<HTMLTextAreaElement | null>(null)
let   editor      = null as EditorView | null
const scroll      = reactive({ all: true, info: "" })
const tab         = ref(0)
const tabDocs     = ref<Record<number, string>>({})
const tabScroll   = reactive({ less: false, more: false })
const tabScrolls  = new Map<number, number>()
const filter      = ref("")
const filterEl    = ref<HTMLInputElement | null>(null)
let   query       = ""
let   openId      = null as string | null
let   openSeq     = 0
let   reloadSeq   = 0
let   graphSeq    = 0
let   zoom        = 1

/*  the drafts of the prompts of cancelled (or failed to be sent) edit requests, per task  */
const promptDrafts = new Map<string, string>()

/*  the agents passed by the agent relay, as reported by the service (null without an agent relay)  */
const agents    = shallowRef<Agents | null>(null)
const agentsKnown = ref(false)

/*  the recent processing log lines per agent (keeping the most recent ones only), held apart
    from the agents and replaced as a whole on each change, so that their frequent changes
    re-render only the agent log (see AgentLog), and neither the lanes nor the agents  */
const AGENT_LOG_MAX = 100
const agentLogs = shallowRef(new Map<string, AgentLine[]>())
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
const agentList  = computed(() => agents.value?.agents ?? [])
const agentSelId = ref("")
const agentSel   = computed(() => agentList.value.find((a) => a.id === agentSelId.value) ?? agentList.value[0] ?? null)
const logEl      = ref<HTMLElement | null>(null)
const logStick   = ref(true)
const agentsEmpty = computed(() => agents.value === null || !agents.value.connected ?
    "agent relay unreachable — reconnecting …" : "no agents running")

/*  the derived values of the page  */
const surface   = computed<Surface>(() => board.value?.surface ?? { view: "lanes", minimized: [], collapsed: [], titles: false, keys: true, standalone: true })
const titles    = computed(() => surface.value.titles)

/*  the names of the agents busy with each task (kept as the previous value while unchanged,
    as the agents change on every heartbeat, which must not trigger the lanes)  */
const working   = computed<Map<string, string[]>>((previous) => {
    const map = new Map<string, string[]>()
    for (const agent of agents.value?.agents ?? [])
        for (const id of agent.tasks)
            map.set(id, [ ...(map.get(id) ?? []), agent.name ])
    return previous !== undefined && JSON.stringify([ ...previous ]) === JSON.stringify([ ...map ]) ? previous : map
})

/*  a duration (in ms) in its coarsest unit, the label of an agent (its name, with its
    differing kind), and its uptime (the duration since its start, measured up to its latest
    heartbeat)  */
const agentDuration = (ms: number) => {
    const s = Math.max(0, Math.floor(ms / 1000))
    return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`
}
const agentLabel  = (agent: Agent) =>
    agent.name !== agent.kind ? `${agent.name} (${agent.kind})` : agent.name
const agentUptime = (agent: Agent) =>
    agentDuration(agent.beat - (agent.started ?? agent.since))

/*  a compact usage of the agent tool: its wall time, its output tokens (with
    a metric suffix), and its costs (in USD), where an unavailable field is "n/a"
    and no usage at all (before the first finished job) is "none"  */
const agentUsage = (usage: AgentUsage | undefined) => {
    if (usage === undefined)
        return "none"
    const tok = usage.costToken
    const tokens = tok === null ? "n/a" :
        tok < 1000 ? `${tok}` : tok < 1000 * 1000 ? `${(tok / 1000).toFixed(1)}k` : `${(tok / (1000 * 1000)).toFixed(1)}M`
    const cost = usage.costUSD === null ? "$n/a" : `$${usage.costUSD.toFixed(2)}`
    return `${agentDuration(usage.walltimeSec * 1000)}, ${tokens} tok, ${cost}`
}

/*  tick the wall-clock every second while the agents view is shown, for the live
    durations of its footer (the time in the current state and the age of the heartbeat)  */
const agentNow   = ref(Date.now())
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
const beatOf = (id: string) =>
    agentNow.value - (agentBeats.value.get(id)?.seen ?? 0) < BEAT_SHOWN_MS
const pad         = (n: number, k = 2) => String(n).padStart(k, "0")
const logTime     = (time: number) => {
    const d = new Date(time)
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
        `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
}

/*  the level of an agent log line as a "[...]: " prefix  */
const logLevel    = (level: AgentLine["level"]) =>
    `[${level.toUpperCase()}]: `

/*  the agent log of the detail view: the recent processing log lines of the selected agent
    (with the task ids inverse), as a component of its own, so that only it re-renders on the
    frequent changes of these lines, keyed by their time and their position among the lines of
    the same time (so the lines stay keyed alike when the oldest lines are dropped)  */
const AgentLog = defineComponent({
    name: "AgentLog",
    setup () {
        return () => {
            const agent = agentSel.value
            if (agent === null)
                return h("div", { class: [ "aempty", { off: agents.value !== null && !agents.value.connected } ] }, agentsEmpty.value)
            const lines = agentLogs.value.get(agent.id) ?? []
            if (lines.length === 0)
                return h("div", { class: "aempty" }, "(no processing log lines yet)")
            const seen = new Map<number, number>()
            return lines.map((l) => {
                const n = seen.get(l.time) ?? 0
                seen.set(l.time, n + 1)
                return h("div", { key: `${l.time}:${n}`, class: [ "aline", l.level ] }, [
                    h("span", { class: "atime" }, `${logTime(l.time)}:`), " ",
                    ...(l.task !== "" ? [ h("span", { class: "atask" }, l.task), " " ] : []),
                    `${logLevel(l.level)}${l.msg}`
                ])
            })
        }
    }
})

/*  select an agent, following the bottom of its log  */
const selectAgent = (id: string) => {
    agentSelId.value = id
    logStick.value   = true
}

/*  the position within the agent log, shown on the bottom border of its detail view (like
    in the terminal board): the number of lines if all fit, else the range of the (at least
    partially) visible lines, and whether the log is followed or scrolled  */
const logPos = ref("")
const updateLogPos = () => {
    const el    = logEl.value
    const lines = el !== null ? Array.from(el.querySelectorAll<HTMLElement>(".aline")) : []
    if (el === null || lines.length === 0)
        logPos.value = ""
    else if (el.scrollHeight <= el.clientHeight + 1)
        logPos.value = `${lines.length} lines`
    else {
        const { top, bottom } = el.getBoundingClientRect()
        let first = -1
        let last  = -1
        lines.forEach((line, i) => {
            const r = line.getBoundingClientRect()
            if (r.bottom > top + 1 && r.top < bottom - 1) {
                if (first < 0)
                    first = i
                last = i
            }
        })
        logPos.value = first < 0 ? `${lines.length} lines` :
            `lines ${first + 1}–${last + 1} of ${lines.length} · ${logStick.value ? "following" : "scrolled"}`
    }
}

/*  follow the bottom of the agent log only while it is scrolled to the bottom  */
const onLogScroll = () => {
    const el = logEl.value
    if (el !== null)
        logStick.value = el.scrollTop + el.clientHeight >= el.scrollHeight - 4
    updateLogPos()
}

/*  keep the agent log scrolled to its bottom on every change while following it  */
watch(() => [ agentSel.value?.id, agentLogs.value.get(agentSel.value?.id ?? ""), view.value ], async () => {
    await nextTick()
    const el = logEl.value
    if (el !== null && logStick.value)
        el.scrollTop = el.scrollHeight
    updateLogPos()
})

/*  fall back to the lanes view once it is known that no agent relay is configured  */
watch(() => [ agentsKnown.value, agents.value, view.value ], () => {
    if (agentsKnown.value && agents.value === null && view.value === "agents")
        setView("lanes")
})
const taskCount = computed(() => {
    const cards = board.value?.groups.flatMap((g) => g.lanes).flatMap((l) => l.cards)
    return cards === undefined ? "" : `${cards.filter((c) => c.tone !== "done").length}/${cards.length}`
})

/*  the selected lane is grown to the full board only while it is neither
    minimized nor within a collapsed group (else it shrinks back for good)  */
const growable  = computed(() => {
    const group = board.value?.groups[sel.value.g]
    return group !== undefined && !surface.value.collapsed.includes(group.title)
        && !surface.value.minimized.includes(group.lanes[sel.value.l]?.status ?? "")
})
const grown     = computed(() => grow.value && growable.value && view.value === "lanes")
watch(growable, (ok) => {
    if (!ok)
        grow.value = false
})

/*  the status of the selected task, for the info line of the graph view  */
const selStatus = computed(() => {
    const lane = board.value?.groups.flatMap((g) => g.lanes).find((l) => l.cards.some((c) => c.id === sel.value.id))
    return lane?.status ?? null
})

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
    return grown.value ? [ [
        { key: "↑/↓/←/→",       action: "select task" },
        { key: "⇈/⇊/⇤/⇥",       action: "page/first/last task" },
        { key: "⏎",             action: "view task" },
        { key: "e",             action: "edit task" },
        { key: "SPACE",         action: "start transition task" },
        { key: "T",             action: "transition task" }
    ], [
        { key: "D",             action: "delete task" },
        { key: "E",             action: "edit task by prompt" },
        { key: "N",             action: "new task" },
        { key: "g/ESC",         action: "shrink lane" },
        { key: "t",             action: `${titles.value ? "collapse" : "expand"} titles` },
        { key: "/",             action: "filter tasks" },
        { key: "v",             action: "view graph" }
    ], [
        { key: "Left-Click",    action: "view task / shrink lane" },
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
        { key: "E",             action: "edit task by prompt" },
        { key: "N",             action: "new task" },
        { key: "m",             action: `${minned ? "maximize" : "minimize"} lane` },
        { key: "g",             action: "grow lane" },
        { key: "c",             action: `${folded ? "expand" : "collapse"} group` },
        { key: "t",             action: `${titles.value ? "collapse" : "expand"} titles` },
        { key: "/",             action: "filter tasks" },
        { key: "v",             action: "view graph" }
    ], [
        { key: "Left-Click",    action: "view task / minimize/maximize lane / collapse/expand group" },
        { key: "Drag & Drop",   action: "directly transition task" },
        { key: "?",             action: "hide key hints" }
    ] ] : view.value === "agents" ? [ [
        { key: "↑/↓/Left-Click", action: "select agent" },
        { key: "⇈/⇊/⇤/⇥",       action: "page/top/bottom agent log" },
        { key: "Mouse-Wheel",   action: "scroll agent log" }
    ], [
        { key: "v",             action: "view lanes" },
        { key: "?",             action: "hide key hints" }
    ] ] : [ [
        { key: "↑/↓/←/→",       action: "select task" },
        { key: "⏎/Left-Click",  action: "view task" },
        { key: "e",             action: "edit task" },
        { key: "T",             action: "transition task" }
    ], [
        { key: "D",             action: "delete task" },
        { key: "E",             action: "edit task by prompt" },
        { key: "N",             action: "new task" },
        { key: "t",             action: `${titles.value ? "collapse" : "expand"} titles` },
        { key: "s",             action: `${surface.value.standalone ? "hide" : "show"} standalone tasks` },
        { key: "/",             action: "filter tasks" },
        { key: "v",             action: `view ${agents.value !== null ? "agents" : "lanes"}` },
        { key: "+/-/0",         action: "zoom in/out/reset" }
    ], [
        { key: "?",             action: "hide key hints" }
    ] ]
})

/*  determine the visible groups of the horizontally scrollable lanes view  */
const updateScroll = () => {
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
const scrollBy = (left: number) =>
    boardEl.value?.scrollBy({ left, behavior: "smooth" })
watch([ board, view ], () => nextTick(updateScroll), { deep: true })

/*  load the dependency graph (laid out by the service)  */
const renderGraph = async (background = false) => {
    const seq = ++graphSeq
    const res = await api<{ svg: string, stats: GraphStats }>(`/task-board/api/graph?filter=${encodeURIComponent(query)}`, undefined, background)
    if (seq !== graphSeq)
        return
    graph.value = res.error !== undefined ? `<p class="warn">${res.error.replace(/[&<>]/g, (c) => `&#${c.charCodeAt(0)};`)}</p>` :
        res.svg !== "" ? res.svg : "<p class=\"mute\">(no tasks)</p>"
    graphStats.value = res.error !== undefined ? null : res.stats
}
const graphClick = (ev: MouseEvent) => {
    const node = (ev.target as Element).closest<SVGGElement>("g.node[data-id]")
    if (node !== null) {
        sel.value = { ...sel.value, id: node.dataset.id! }
        openTask(node.dataset.id!)
    }
}

/*  size the graph by the zoom factor (its natural size being its view box)  */
const applyZoom = () => {
    const svg = graphEl.value?.querySelector("svg")
    if (svg === null || svg === undefined)
        return
    const box = svg.viewBox.baseVal
    svg.setAttribute("width",  String(box.width  * zoom))
    svg.setAttribute("height", String(box.height * zoom))
}

/*  zoom the graph by a factor, keeping the given point (or the center of the view) in place  */
const zoomBy = (factor: number, x?: number, y?: number) => {
    const el  = graphEl.value
    const svg = el?.querySelector("svg")
    if (el === null || el === undefined || svg === null || svg === undefined)
        return
    const port = el.getBoundingClientRect()
    const cx   = x ?? port.left + port.width  / 2
    const cy   = y ?? port.top  + port.height / 2
    const old  = svg.getBoundingClientRect()
    const rx   = (cx - old.left) / old.width
    const ry   = (cy - old.top)  / old.height
    zoom = Math.min(4, Math.max(0.1, zoom * factor))
    applyZoom()
    const now = svg.getBoundingClientRect()
    el.scrollLeft += now.left + rx * now.width  - cx
    el.scrollTop  += now.top  + ry * now.height - cy
}

/*  zoom the graph with the mouse wheel, keeping the point under the pointer in place  */
const graphZoom = (ev: WheelEvent) => {
    ev.preventDefault()
    const delta = ev.deltaY * (ev.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : ev.deltaMode === WheelEvent.DOM_DELTA_PAGE ? 400 : 1)
    zoomBy(Math.exp(-delta * 0.002), ev.clientX, ev.clientY)
}

/*  scroll the graph by dragging its background with the left mouse button  */
const graphPanStart = (ev: PointerEvent) => {
    const el = graphEl.value
    if (el === null || ev.button !== 0 || (ev.target as Element).closest("g.node") !== null)
        return
    ev.preventDefault()
    el.setPointerCapture(ev.pointerId)
    pan.value = { x: ev.clientX, y: ev.clientY, left: el.scrollLeft, top: el.scrollTop }
}
const graphPanMove = (ev: PointerEvent) => {
    const el = graphEl.value
    if (el === null || pan.value === null)
        return
    el.scrollLeft = pan.value.left - (ev.clientX - pan.value.x)
    el.scrollTop  = pan.value.top  - (ev.clientY - pan.value.y)
}

/*  the centers of the rendered graph nodes, for the spatial navigation  */
const graphPlaces = () => new Map([ ...(graphEl.value?.querySelectorAll<SVGGElement>("g.node[data-id]") ?? []) ].map((n) => {
    const box = n.querySelector("foreignObject")
    const num = (attr: string) => Number(box?.getAttribute(attr) ?? 0)
    return [ n.dataset.id!, { r: num("y") + num("height") / 2, c: num("x") + num("width") / 2 } ] as const
}))

/*  select a lane (like PgUp/PgDn), unless the selection is already within it  */
const selectLane = (g: number, l: number) => {
    if (board.value === null || (sel.value.g === g && sel.value.l === l))
        return
    const next = groupItems(board.value, g, surface.value).find((it) => it.l === l)
    if (next !== undefined)
        sel.value = next
}

/*  mark the selected node and its edges in the graph, and scroll the selection into view  */
const showSel = () => {
    const id = sel.value.id
    graphEl.value?.querySelectorAll<SVGGElement>("g.node[data-id]").forEach((n) =>
        n.classList.toggle("sel", n.dataset.id === id))
    graphEl.value?.querySelectorAll<SVGPathElement>("path.edge").forEach((e) =>
        e.classList.toggle("sel", id !== "" && (e.dataset.from === id || e.dataset.to === id)))
    const el = view.value === "lanes" ?
        boardEl.value?.querySelector(".card.sel") ?? boardEl.value?.querySelector(".lane.sel") :
        graphEl.value?.querySelector(".node.sel .card")
    el?.scrollIntoView({ block: "nearest", inline: "nearest" })

    /*  focus the selected lane, so keys like HOME/END scroll it (unless typing elsewhere)  */
    const lane = boardEl.value?.querySelector<HTMLElement>(".lane.sel .cards") ?? boardEl.value?.querySelector<HTMLElement>(".lane.sel")
    if (view.value === "lanes" && task.value === null && !(document.activeElement instanceof HTMLInputElement))
        lane?.focus({ preventScroll: true })
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
const openTask = async (id: string, background = false) => {
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
        if (editing.value === null)
            closeTask()
        else
            notice.value = { kind: "error", message: t.error }
        return
    }

    /*  replace the cached attachment documents only once the selected one is re-fetched  */
    const n   = Math.min(tab.value, t.tabs.length - 1)
    const doc = n > 0 ? await fetchTabDoc(id, n, background) : ""
    if (seq !== openSeq)
        return
    tabDocs.value = n > 0 ? { [n]: doc } : {}
    task.value    = t
    tab.value     = n
    nextTick(updateTabScroll)
}
const restorePlanScroll = () => {
    planEl.value?.contentWindow?.scrollTo(0, tabScrolls.get(tab.value) ?? 0)
    bindImageZoom()
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
const closeTask = () => {
    stopEdit()
    openSeq++
    openId     = null
    task.value = null
}

/*  the block cursor of the task plan editor: the character under the cursor
    (or a space at the end of a line) rendered as a filled block, except in the
    normal and visual modes of the Vim key bindings, which draw their own block cursor  */
class BlockCursorEnd extends WidgetType {
    toDOM () {
        const span = document.createElement("span")
        span.className   = "cm-block-cursor"
        span.textContent = " "
        return span
    }
}
const blockCursor = ViewPlugin.fromClass(class {
    decorations = Decoration.none
    constructor (view: EditorView) {
        this.decorations = this.build(view)
    }
    update (update: { view: EditorView }) {
        this.decorations = this.build(update.view)
    }
    build (view: EditorView) {
        const vimState = getCM(view)?.state.vim as { insertMode?: boolean } | undefined
        if (vimState !== undefined && vimState.insertMode !== true)
            return Decoration.none
        const head = view.state.selection.main.head
        const line = view.state.doc.lineAt(head)
        if (head >= line.to)
            return Decoration.set([ Decoration.widget({ widget: new BlockCursorEnd(), side: 1 }).range(head) ])
        const char = String.fromCodePoint(line.text.codePointAt(head - line.from)!)
        return Decoration.set([ Decoration.mark({ class: "cm-block-cursor" }).range(head, head + char.length) ])
    }
}, { decorations: (plugin) => plugin.decorations })

/*  the syntax highlighting of the task plan editor, on the colors of the board  */
const editorHighlight = HighlightStyle.define([
    { tag: tags.heading,  color: "var(--c-accent)", fontWeight: "bold" },
    { tag: [ tags.monospace, tags.link, tags.url ], color: "var(--c-accent)" },
    { tag: [ tags.processingInstruction, tags.contentSeparator, tags.labelName, tags.comment ], color: "var(--c-mute)" },
    { tag: tags.quote,    color: "var(--c-text-soft)" },
    { tag: tags.emphasis, fontStyle: "italic" },
    { tag: tags.strong,   fontWeight: "bold" }
])

/*  the drafts of task plans which failed to save, kept per project and task
    in the browser (silently skipped if the browser storage is unavailable)  */
const draftKey = (id: string) => `ase-task-board:draft:${board.value?.project ?? ""}:${id}`
const draftGet = (id: string): string | null => {
    try {
        return localStorage.getItem(draftKey(id))
    }
    catch (_err: unknown) {
        return null
    }
}
const draftSet = (id: string, text: string | null) => {
    try {
        if (text === null)
            localStorage.removeItem(draftKey(id))
        else
            localStorage.setItem(draftKey(id), text)
    }
    catch (_err: unknown) {
        /*  no browser storage available  */
    }
}

/*  start editing the plan of the task of the dialog (on its task plan tab),
    offering to restore a draft of it which failed to save earlier, where an editor
    entered directly from the board also closes the dialog when left  */
const startEdit = async (direct = false) => {
    if (task.value === null || editing.value !== null)
        return
    const id  = task.value.id
    const src = await api<{ text: string, base: string, keymap: Keymap }>(`/task-board/api/task/${encodeURIComponent(id)}/source`)
    if (task.value?.id !== id || editing.value !== null)
        return
    if (src.error !== undefined) {
        notice.value = { kind: "error", message: src.error }
        return
    }
    await selectTab(0)
    await openEditor(id, src.text, src.base, src.keymap, direct)
}

/*  start creating a new task in the task plan editor of a task dialog of its own,
    on its pre-filled text (with the empty id marking the creation)  */
const startNew = async () => {
    if (task.value !== null || editing.value !== null)
        return
    const src = await api<{ text: string, keymap: Keymap }>("/task-board/api/new")
    if (task.value !== null || editing.value !== null)
        return
    if (src.error !== undefined) {
        actionError.value = src.error
        return
    }
    actionError.value = null
    tab.value     = 0
    tabDocs.value = {}
    task.value    = { id: "new", title: "New Task", tone: "idle", status: "", group: "", epic: "", doc: "", tabs: [ "0 ▶ plan" ], pred: [], succ: [] }
    await openEditor("", src.text, "", src.keymap, true)
}

/*  open the task plan editor on a text, offering to restore a draft of it which failed to save earlier  */
const openEditor = async (id: string, text: string, base: string, keys: Keymap, direct: boolean) => {
    const draft   = draftGet(id)
    editing.value = { id, orig: text, base, keymap: keys, dirty: false, direct }
    notice.value  = draft !== null && draft !== text ? { kind: "draft", draft } : null
    await nextTick()
    editor = new EditorView({
        parent: editorEl.value!,
        state:  EditorState.create({
            doc: text,
            extensions: [
                /*  the optional Vim or Emacs key bindings, taking precedence over all others  */
                ...(keys === "vim" ? [ vim({ status: true }) ] : keys === "emacs" ? [ emacs() ] : []),
                history(), drawSelection(), EditorView.lineWrapping,
                keymap.of([ ...defaultKeymap, ...historyKeymap, indentWithTab ]),
                markdown(), syntaxHighlighting(editorHighlight), blockCursor,
                EditorView.updateListener.of((update) => {
                    if (update.docChanged && editing.value !== null)
                        editing.value.dirty = update.state.doc.toString() !== editing.value.orig
                })
            ]
        })
    })
    editor.focus()
}

/*  save the edited task plan, conditionally on the plan it is based on (or on the
    current plan to overwrite a conflicting change), and keep a draft if this fails  */
const saveEdit = async (base?: string) => {
    const e = editing.value
    if (e === null || editor === null)
        return
    const text = editor.state.doc.toString()
    if (e.id === "") {
        await saveNew(e, text)
        return
    }
    const res  = await api<{ ok: boolean, id: string }>(`/task-board/api/task/${encodeURIComponent(e.id)}/source`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, base: base ?? e.base })
    })
    if (editing.value !== e)
        return
    if (res.error === undefined) {
        draftSet(e.id, null)
        stopEdit()
        if (res.id === e.id) {
            if (!e.direct)
                openTask(e.id)
        }
        else {
            /*  a renamed task is re-opened under its new id with the next board reload  */
            closeTask()
            openId    = e.direct ? null : res.id
            sel.value = { ...sel.value, id: res.id }
        }
        return
    }
    draftSet(e.id, text)
    const conflict = res as { error: string, base?: string | null }
    notice.value = conflict.base !== undefined ?
        { kind: "conflict", message: conflict.error, base: conflict.base } :
        { kind: "error", message: `${conflict.error} (draft kept)` }
}

/*  save a new task under the id of the "Id:" key of its frontmatter (refused
    for an existing id), where an unchanged text creates no task, and keep a draft if this fails  */
const saveNew = async (e: NonNullable<typeof editing.value>, text: string) => {
    if (!e.dirty) {
        stopEdit()
        return
    }
    const fm = /^---\r?\n([\s\S]*?\r?\n)---\r?\n/.exec(text)
    const id = /^Id:[ \t]*(.*)$/m.exec(fm?.[1] ?? "")?.[1].trim() ?? ""
    const res = id === "" ? { error: "no task id in the \"Id:\" line" } :
        await api<{ ok: boolean }>(`/task-board/api/task/${encodeURIComponent(id)}/source`, {
            method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text })
        })
    if (editing.value !== e)
        return
    if (res.error === undefined) {
        draftSet("", null)
        stopEdit()
        sel.value = { ...sel.value, id }
        return
    }
    draftSet("", text)
    notice.value = { kind: "error", message: `${res.error} (draft kept)` }
}

/*  delete a task (after its confirmation), closing its task dialog  */
const deleteTask = async (id: string) => {
    confirmDel.value = null
    const res = await api<{ ok: boolean }>(`/task-board/api/task/${encodeURIComponent(id)}`, { method: "DELETE" })
    actionError.value = res.error ?? null
    if (res.error === undefined && task.value?.id === id)
        closeTask()
}

/*  the entries of the transfer popup: all lane states (with their group), where only the
    current state and the states reachable from it (from the actual status of the task,
    if it is foreign to the model) are selectable (none if the task vanished)  */
const transferList = computed(() => {
    const t    = transfer.value
    const b    = board.value
    const lane = b?.groups.flatMap((g) => g.lanes).find((l) => l.cards.some((c) => c.id === t?.id))
    if (t === null || b === null || lane === undefined)
        return []
    const moves = lane.cards.find((c) => c.id === t.id)?.moves ?? b.moves[lane.status] ?? []
    return b.groups.flatMap((g) => g.lanes.map((l) => ({
        group: g.title, status: l.status, current: l.status === lane.status,
        ok:    l.status === lane.status || moves.includes(l.status)
    })))
})

/*  open the transfer popup of a task, starting at its current state  */
const openTransfer = (id: string) => {
    const lane = board.value?.groups.flatMap((g) => g.lanes).find((l) => l.cards.some((c) => c.id === id))
    if (lane !== undefined)
        transfer.value = { id, at: lane.status }
}

/*  cancel the transfer popup  */
const cancelTransfer = () => {
    transfer.value = null
}

/*  transfer a task (from its popup) to a state, where its current state cancels  */
const transferTo = (id: string, to: string) => {
    const entry = transferList.value.find((e) => e.status === to)
    transfer.value = null
    if (entry !== undefined && entry.ok && !entry.current)
        moveTask(id, to)
}

/*  the markers and their explanations of the states of the edit requests of a task  */
const editMarkers: Record<EditState, string> = { pending: "✎", active: "✎…", failed: "✎✗" }
const editTitles:  Record<EditState, string> = {
    pending: "edit by prompt requested",
    active:  "edit by prompt in progress",
    failed:  "edit by prompt failed (press E to retry)"
}

/*  split a task title into its plain text and its Markdown inline code ("`...`") segments  */
const titleSegments = (title: string) =>
    title.split(/`([^`]+)`/).map((text, i) => ({ text, code: i % 2 === 1 })).filter((s) => s.text !== "")

/*  open the prompt popup of an edit request of a task (refused for a finished task, and
    while an edit of it is in progress, as a new request would change the task under the
    running edit), prefilled with its draft of a cancelled (or failed to be sent) prompt, else
    with the prompt of its most recent failed edit request (for a retry), where a task not on
    the (possibly filtered) board, e.g. opened via a dependency link, is checked by the service  */
const openPrompt = async (id: string) => {
    const card = board.value?.groups.flatMap((g) => g.lanes).flatMap((l) => l.cards).find((c) => c.id === id)
    if (card?.finished === true) {
        actionError.value = `editing task "${id}" by prompt refused: task is finished`
        return
    }
    if (card?.edit === "active") {
        actionError.value = `editing task "${id}" by prompt refused: edit in progress`
        return
    }
    let text = promptDrafts.get(id)
    if (text === undefined || card === undefined) {
        const res = await api<{ prompt: string }>(`/task-board/api/task/${encodeURIComponent(id)}/edit`)
        if (res.error !== undefined) {
            actionError.value = res.error
            return
        }
        text ??= res.prompt

        /*  never open the popup over another one opened meanwhile  */
        if (confirmDel.value !== null || transfer.value !== null || prompt.value !== null)
            return
    }
    prompt.value = { id, text }
    nextTick(() => promptEl.value?.focus())
}

/*  cancel the prompt popup, keeping its prompt as the draft of the task (even if
    empty, so that a cleared prompt is not prefilled again on reopening)  */
const cancelPrompt = () => {
    if (prompt.value !== null)
        promptDrafts.set(prompt.value.id, prompt.value.text)
    prompt.value = null
}

/*  show a transient (non-warning) notice of a performed action in the status line  */
let noteTimer: ReturnType<typeof setTimeout> | null = null
const notify = (text: string) => {
    actionNote.value = text
    if (noteTimer !== null)
        clearTimeout(noteTimer)
    noteTimer = setTimeout(() => {
        actionNote.value = null
        noteTimer = null
    }, 5000)
}

/*  request the edit of a task by the prompt of its popup (processed by "ase agent editor"),
    dropping the draft of the task once sent, resp. keeping the prompt as its draft on failure  */
const submitPrompt = async () => {
    const p = prompt.value
    if (p === null)
        return
    if (p.text.trim() === "") {
        actionError.value = `requesting edit of task "${p.id}" failed: empty edit prompt`
        return
    }
    prompt.value = null
    const res = await api<{ ok: boolean }>(`/task-board/api/task/${encodeURIComponent(p.id)}/edit`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: p.text })
    })
    if (res.error !== undefined) {
        promptDrafts.set(p.id, p.text)
        actionError.value = `requesting edit of task "${p.id}" failed: ${res.error}`
    }
    else {
        promptDrafts.delete(p.id)
        actionError.value = null
        notify(`edit of task "${p.id}" requested`)
    }
}

/*  restore or drop the draft of the edited task plan  */
const restoreDraft = () => {
    if (notice.value?.kind === "draft" && editor !== null)
        editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: notice.value.draft } })
    notice.value = null
    editor?.focus()
}
const dropDraft = () => {
    if (editing.value !== null)
        draftSet(editing.value.id, null)
    notice.value = null
    editor?.focus()
}

/*  leave the editor, or the dialog (and with it the editor), after
    a confirmation if the edited task plan was changed  */
const leaveEdit = (close: boolean) => {
    if (editing.value?.dirty === true)
        notice.value = { kind: "discard", close }
    else if (close)
        closeTask()
    else
        stopEdit()
}

/*  the save and cancel commands of the Vim key bindings (":w", ":wq", and ":x" save,
    ":q" cancels, ":q!" discards) and the Emacs key bindings ("C-x C-s" saves, "C-x C-c" cancels)  */
Vim.defineEx("write", "w", () => { saveEdit() })
Vim.defineEx("wq",    "wq", () => { saveEdit() })
Vim.defineEx("xit",   "x", () => { saveEdit() })
Vim.defineEx("quit",  "q", (_cm, params) => {
    if (params.argString?.trimStart().startsWith("!"))
        stopEdit()
    else
        leaveEdit(false)
})
EmacsHandler.bindKey("C-x C-s", () => {
    saveEdit()
    return true
})
EmacsHandler.bindKey("C-x C-c", () => {
    leaveEdit(false)
    return true
})
const stopEdit = () => {
    const direct = editing.value?.direct === true
    editor?.destroy()
    editor        = null
    editing.value = null
    notice.value  = null

    /*  a new task, or a task edited directly from the board, has no task view to return to  */
    if (direct)
        closeTask()
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
const selectTab = async (n: number) => {
    if (task.value === null || editing.value !== null || n < 0 || n >= task.value.tabs.length || n === tab.value)
        return
    keepTabScroll()
    tab.value = n
    nextTick(() => tabsEl.value?.children[n]?.scrollIntoView({ block: "nearest", inline: "nearest" }))
    await loadTab(n)
}

/*  determine whether further tabs are hidden on the left or right side of the tab bar  */
const updateTabScroll = () => {
    const el = tabsEl.value
    if (el === null)
        return
    tabScroll.less = el.scrollLeft > 1
    tabScroll.more = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
}

/*  (re)load the board model, in the background on a change of the task store (without busy popup)  */
const reload = async (background = false) => {
    const seq  = ++reloadSeq
    const data = await api<Board>(`/task-board/api/board?filter=${encodeURIComponent(query)}`, undefined, background)
    if (seq !== reloadSeq)
        return
    if (data.error !== undefined) {
        boardError.value = data.error
        return
    }
    boardError.value = null

    /*  start in the persisted view on the first load  */
    if (board.value === null)
        view.value = data.surface.view
    board.value = data
    if (view.value === "graph")
        await renderGraph(background)
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
const clearFilter = () => {
    filter.value = ""
    filterEl.value?.blur()
}

/*  apply a changed surface state, with the graph re-laid out if the showing of titles or standalone tasks changed  */
const applySurface = (s: Surface) => {
    if (board.value === null)
        return
    const relayout = board.value.surface.titles !== s.titles || board.value.surface.standalone !== s.standalone
    board.value.surface = s
    if (relayout && view.value === "graph")
        renderGraph()
}

/*  drag & drop a task box onto another lane, changing the task status: only
    lanes whose state is reachable in the lifecycle model accept the drop
    (from the actual status of the task, if it is foreign to the model),
    where a task carried by the keyboard (SPACE) is marked as "key"  */
const drag = ref<{ id: string, from: string, moves?: string[], over: string | null, key?: boolean } | null>(null)
const canDrop = (status: string) =>
    drag.value !== null && (drag.value.moves ?? board.value?.moves[drag.value.from] ?? []).includes(status)

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
const dragStart = (ev: DragEvent, id: string, from: string, moves?: string[]) => {
    drag.value = { id, from, moves, over: null }
    if (ev.dataTransfer !== null) {
        ev.dataTransfer.setData("text/plain", id)
        ev.dataTransfer.effectAllowed = "move"
    }
}
const dragOver = (ev: DragEvent, status: string) => {
    if (!canDrop(status))
        return
    ev.preventDefault()
    if (ev.dataTransfer !== null)
        ev.dataTransfer.dropEffect = "move"
    drag.value!.over = status
}
const dragLeave = (ev: DragEvent, status: string) => {
    if (drag.value?.over === status && !(ev.currentTarget as Element).contains(ev.relatedTarget as Node | null))
        drag.value.over = null
}
const dragEnd = () => {
    drag.value = null
}
const drop = async (ev: DragEvent, status: string) => {
    ev.preventDefault()
    const d = drag.value
    if (d === null || !canDrop(status))
        return
    drag.value = null
    await moveTask(d.id, status)
}
const moveTask = async (id: string, status: string) => {
    const res = await api<{ from: string, to: string }>("/task-board/api/move", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status })
    })
    actionError.value = res.error ?? null
}

/*  keep the selection valid on every board, surface, or view change (the
    graph view keeps any selected node), and drop a task carried by the
    keyboard if it vanished or changed its status in the meantime  */
watch([ board, surface, view ], () => {
    const b = board.value
    if (b === null || b.groups.length === 0)
        return
    const d = drag.value
    if (d?.key === true && b.groups.flatMap((g) => g.lanes).find((l) => l.cards.some((c) => c.id === d.id))?.status !== d.from) {
        drag.value        = null
        actionError.value = `moving task "${d.id}" cancelled: task changed in the meantime`
    }
    if (transfer.value !== null && transferList.value.length === 0) {
        actionError.value = `transferring task "${transfer.value.id}" cancelled: task vanished in the meantime`
        transfer.value    = null
    }
    if (view.value === "lanes")
        sel.value = relocate(b, sel.value, surface.value)
})

/*  follow the selection with the lane a carried task is moved onto, the
    marks in the graph, the scroll positions, and the lane focus  */
watch([ sel, graph, view, task, grown ], () => {
    const d     = drag.value
    const group = board.value?.groups[sel.value.g]
    if (d?.key === true)
        d.over = group === undefined || surface.value.collapsed.includes(group.title) ? null : group.lanes[sel.value.l]?.status ?? null
    nextTick(() => {
        applyZoom()
        showSel()
    })
})

/*  toggle a minimized lane, a collapsed group, or the showing of task titles, key hints, or standalone tasks  */
const toggle = async (list: "minimized" | "collapsed" | "titles" | "keys" | "standalone", entry: string) => {
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

/*  cycle through the views: lanes, graph, and (with an agent relay) agents  */
const cycleView = () => {
    const views: View[] = agents.value !== null ? [ "lanes", "graph", "agents" ] : [ "lanes", "graph" ]
    setView(views[(views.indexOf(view.value) + 1) % views.length])
}

/*  switch between the lanes, the graph, and the agents view, persisting it for newly opened web boards  */
const setView = (v: View) => {
    view.value = v
    if (v !== "lanes")
        drag.value = null
    if (v === "graph")
        renderGraph()
    api<Surface>("/task-board/api/view", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ view: v })
    }).then((s) => {
        if (s.error !== undefined)
            actionError.value = s.error
    })
}

/*  the connection to the service: change event stream, keep-alive timer, and reconnect timer  */
let events: EventSource | null = null
let ping: ReturnType<typeof setInterval> | null = null
let retry: ReturnType<typeof setTimeout> | null = null

/*  the connection state to the service (the web server), and the kind
    and connection state of the task store, as reported by the service  */
const online = ref(false)
const store  = ref<{ kind: "local" | "remote", connected: boolean } | null>(null)

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
    })
    events.addEventListener("logs", (ev) => applyAgentLogs(JSON.parse((ev as MessageEvent).data)))
}

/*  in the task plan editor, Ctrl/Cmd+S saves (only Cmd+S under the Emacs key bindings,
    where Ctrl+S searches) and, under the default key bindings, ESC cancels (or dismisses
    the discard confirmation), while all other keys belong to the editor  */
const onEditorKey = (ev: KeyboardEvent, keymap: Keymap) => {
    const mod = keymap === "emacs" ? ev.metaKey : ev.ctrlKey || ev.metaKey
    if (mod && !ev.altKey && ev.key.toLowerCase() === "s") {
        ev.preventDefault()
        saveEdit()
    }
    else if (ev.key === "Escape" && keymap === "default") {
        if (notice.value?.kind === "discard") {
            notice.value = null
            editor?.focus()
        }
        else
            leaveEdit(false)
    }
}

/*  in the task dialog, RETURN and ESC close it, "e" edits its plan, "E" edits it by a prompt,
    "D" deletes and "T" transitions its task, the left/right arrows (also Tab/Shift+Tab) switch
    its tab, and the up/down arrows and PgUp/PgDn scroll its content  */
const onDialogKey = (ev: KeyboardEvent) => {
    const win = planEl.value?.contentWindow ?? null
    if (ev.key === "Escape" || ev.key === "Enter")
        closeTask()
    else if (ev.key === "e" && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
        ev.preventDefault()
        startEdit()
    }
    else if (ev.key === "E" && !ev.ctrlKey && !ev.metaKey && !ev.altKey && task.value !== null) {
        ev.preventDefault()
        openPrompt(task.value.id)
    }
    else if (ev.key === "D" && !ev.ctrlKey && !ev.metaKey && !ev.altKey && task.value !== null) {
        ev.preventDefault()
        confirmDel.value = task.value.id
    }
    else if (ev.key === "T" && !ev.ctrlKey && !ev.metaKey && !ev.altKey && task.value !== null) {
        ev.preventDefault()
        openTransfer(task.value.id)
    }
    else if (ev.key === "ArrowLeft" || ev.key === "ArrowRight" || ev.key === "Tab") {
        ev.preventDefault()
        selectTab(tab.value + (ev.key === "ArrowLeft" || (ev.key === "Tab" && ev.shiftKey) ? -1 : 1))
    }
    else if (win !== null && (ev.key === "ArrowUp" || ev.key === "ArrowDown")) {
        ev.preventDefault()
        win.scrollBy({ top: ev.key === "ArrowUp" ? -40 : 40 })
    }
    else if (win !== null && (ev.key === "PageUp" || ev.key === "PageDown")) {
        ev.preventDefault()
        const page = Math.max(40, win.innerHeight - 40)
        win.scrollBy({ top: ev.key === "PageUp" ? -page : page })
    }
}

/*  move spatially to the nearest graph node in the direction of the
    arrow, preferring nodes in the same row (left/right) or column
    (up/down), or initially to the first node of the left-to-right layout  */
const graphStep = (key: string, id: string): string | undefined => {
    const places = graphPlaces()
    const cur    = places.get(id)
    if (cur === undefined)
        return [ ...places ].sort(([ , p ], [ , q ]) => p.c - q.c || p.r - q.r)[0]?.[0]
    let best = Infinity
    let next: string | undefined
    for (const [ other, p ] of places) {
        const dr = p.r - cur.r
        const dc = p.c - cur.c
        const ok = key === "ArrowRight" ? dc > 0 : key === "ArrowLeft" ? dc < 0 : key === "ArrowDown" ? dr > 0 : dr < 0
        if (other === id || !ok)
            continue
        const score = key === "ArrowLeft" || key === "ArrowRight" ?
            Math.abs(dc) + Math.abs(dr) * 4 : Math.abs(dr) + Math.abs(dc) / 4
        if (score < best) {
            best = score
            next = other
        }
    }
    return next
}

/*  step through the lanes of the expanded groups row by row: first
    left/right through the groups, then wrap into the next/previous
    row of lanes (and at the very end/start around the board)  */
const laneStep = (b: Board, s: Sel, surf: Surface, back: boolean): Sel | undefined => {
    const rows  = Math.max(...b.groups.map((x) => x.lanes.length))
    const lanes = [] as { g: number, l: number }[]
    for (let l = 0; l < rows; l++)
        b.groups.forEach((x, g) => {
            if (l < x.lanes.length && !surf.collapsed.includes(x.title))
                lanes.push({ g, l })
        })
    if (lanes.length === 0)
        return undefined
    const idx    = lanes.findIndex((p) => p.g === s.g && p.l === s.l)
    const target = idx < 0 ? lanes[back ? lanes.length - 1 : 0] :
        lanes[(idx + (back ? lanes.length - 1 : 1)) % lanes.length]
    return groupItems(b, target.g, surf).find((it) => it.l === target.l)
}

/*  in the agents view, the arrows select an agent of the master list, while
    PgUp/PgDn and Home/End scroll the agent log of the detail view  */
const onAgentsKey = (ev: KeyboardEvent) => {
    if (ev.target instanceof HTMLInputElement || ev.ctrlKey || ev.metaKey || ev.altKey)
        return
    const list = agentList.value
    const idx  = list.findIndex((a) => a.id === agentSel.value?.id)
    const el   = logEl.value
    if ((ev.key === "ArrowUp" || ev.key === "ArrowDown") && list.length > 0)
        selectAgent(list[Math.max(0, Math.min(list.length - 1, idx + (ev.key === "ArrowUp" ? -1 : 1)))].id)
    else if (el !== null && (ev.key === "PageUp" || ev.key === "PageDown"))
        el.scrollBy({ top: (ev.key === "PageUp" ? -1 : 1) * Math.round(el.clientHeight * 0.9) })
    else if (el !== null && (ev.key === "Home" || ev.key === "End"))
        el.scrollTop = ev.key === "Home" ? 0 : el.scrollHeight
    else
        return
    ev.preventDefault()
}

/*  on the board, act on the selected task: view, edit, edit by prompt, delete, or
    transition it, or create a new task (answering whether the key is such an action)  */
const onTaskKey = (ev: KeyboardEvent, id: string, carrying: boolean): boolean => {
    if (ev.key === "Enter") {
        if (id !== "")
            openTask(id)
    }
    else if (ev.key === "e") {
        /*  open the task view of the selected task directly in the task plan editor  */
        if (id !== "")
            openTask(id).then(() => {
                if (task.value?.id === id)
                    startEdit(true)
            })
    }
    else if (ev.key === "N")
        startNew()
    else if (ev.key === "E") {
        if (id !== "" && !carrying)
            openPrompt(id)
    }
    else if (ev.key === "D") {
        if (id !== "")
            confirmDel.value = id
    }
    else if (ev.key === "T") {
        if (id !== "" && !carrying)
            openTransfer(id)
    }
    else
        return false
    return true
}

/*  within the grown lane, the arrows step through the grid of its cards (with
    the number of grid columns taken from the rendered grid), PgUp/PgDn step by
    the visible rows, Home/End jump to the first/last card, and ESC shrinks the
    lane (answering whether the key was handled, as the other lane keys are ignored)  */
const onGrownKey = (ev: KeyboardEvent, s: Sel, list: Card[]): boolean => {
    if (ev.key === "Escape") {
        grow.value = false
        return true
    }
    const grid  = boardEl.value?.querySelector<HTMLElement>(".lane.grown .cards") ?? null
    const cols  = grid === null ? 4 : Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(" ").length)
    const card  = grid?.querySelector<HTMLElement>(".card") ?? null
    const rows  = grid === null || card === null ? 1 : Math.max(1, Math.floor(grid.clientHeight / (card.offsetHeight + 8)))
    const page  = cols * rows
    const idx   = list.findIndex((c) => c.id === s.id)
    const step  = ev.key === "ArrowLeft" ? -1 : ev.key === "ArrowRight" ? 1 : ev.key === "ArrowUp" ? -cols : ev.key === "ArrowDown" ? cols :
        ev.key === "PageUp" ? -page : ev.key === "PageDown" ? page : ev.key === "Home" ? -list.length : ev.key === "End" ? list.length : 0
    if (step === 0)
        return false
    if (list.length > 0 && !(ev.key === "ArrowUp" && idx >= 0 && idx < cols)) {
        const next = idx < 0 ? 0 : Math.max(0, Math.min(list.length - 1, idx + step))
        sel.value = { ...s, id: list[next].id }
    }
    return true
}

/*  pick up the selected task, or drop the carried task onto the selected lane, if reachable  */
const onCarryKey = (s: Sel, group: Group, carry: NonNullable<typeof drag.value> | null) => {
    const card = group.lanes[s.l].cards.find((c) => c.id === s.id)
    const to   = group.lanes[s.l].status
    if (carry === null) {
        if (card !== undefined) {
            actionError.value = null
            drag.value = { id: card.id, from: to, moves: card.moves, over: null, key: true }
            grow.value = false
        }
    }
    else if (!surface.value.collapsed.includes(group.title)) {
        if (to === carry.from)
            drag.value = null
        else if (!canDrop(to))
            actionError.value = `task "${carry.id}" cannot move from ${carry.from} to ${to}: not reachable in the lifecycle model`
        else {
            drag.value = null
            sel.value  = { ...s, id: carry.id }
            moveTask(carry.id, to)
        }
    }
}

/*  on the board, navigate the selection like in the TUI (but not while typing the filter)  */
const onBoardKey = (ev: KeyboardEvent) => {
    if (view.value === "agents") {
        onAgentsKey(ev)
        return
    }
    const b = board.value
    if (b === null || b.groups.length === 0 || ev.target instanceof HTMLInputElement || ev.ctrlKey || ev.metaKey || ev.altKey)
        return
    const s     = sel.value
    const surf  = surface.value
    const group = b.groups[s.g]
    const carry = drag.value?.key === true ? drag.value : null
    const arrow = ev.key === "ArrowLeft" || ev.key === "ArrowRight" || ev.key === "ArrowUp" || ev.key === "ArrowDown"
    if (onTaskKey(ev, s.id, carry !== null)) {
        ev.preventDefault()
        return
    }
    if (view.value === "graph") {
        if (!arrow)
            return
        const next = graphStep(ev.key, s.id)
        if (next !== undefined)
            sel.value = { ...s, id: next }
    }
    else if (ev.key === "g") {
        /*  grow the selected lane to the full board, or shrink it back again  */
        if (carry !== null)
            return
        if (!grown.value && !growable.value)
            actionError.value = "only a maximized lane of an expanded group can grow"
        else {
            actionError.value = null
            grow.value = !grown.value
        }
    }
    else if (grown.value && ev.key !== " ") {
        if (!onGrownKey(ev, s, group.lanes[s.l].cards))
            return
    }
    else if (ev.key === "Escape") {
        /*  cancel the move and return the selection to the task at its original position  */
        if (carry === null)
            return
        drag.value = null
        sel.value  = relocate(b, { ...s, id: carry.id }, surf)
    }
    else if (ev.key === " ")
        onCarryKey(s, group, carry)
    else if (ev.key === "m") {
        if (!surf.collapsed.includes(group.title))
            toggle("minimized", group.lanes[s.l].status)
    }
    else if (ev.key === "c")
        toggle("collapsed", group.title)
    else if (ev.key === "ArrowLeft" || ev.key === "ArrowRight") {
        const g = Math.max(0, Math.min(b.groups.length - 1, s.g + (ev.key === "ArrowLeft" ? -1 : 1)))
        if (g !== s.g) {
            const items = groupItems(b, g, surf)
            sel.value = items.find((it) => it.l === s.l) ?? items[0]
        }
    }
    else if ((ev.key === "ArrowUp" || ev.key === "ArrowDown") && carry === null) {
        /*  within a collapsed group, the items are the lanes themselves  */
        const items = groupItems(b, s.g, surf)
        const idx   = items.findIndex((it) => it.l === s.l && it.id === s.id)
        const next  = items[Math.max(0, Math.min(items.length - 1, idx + (ev.key === "ArrowUp" ? -1 : 1)))]
        if (next !== undefined)
            sel.value = next
    }
    else if (ev.key === "PageUp" || ev.key === "PageDown" || arrow) {
        /*  jump directly to the first item of the upper or lower lane of the group
            (while moving a task, also on up/down, as only the target lane matters)  */
        const up   = ev.key === "PageUp" || ev.key === "ArrowUp"
        const l    = Math.max(0, Math.min(group.lanes.length - 1, s.l + (up ? -1 : 1)))
        const next = groupItems(b, s.g, surf).find((it) => it.l === l)
        if (next !== undefined && l !== s.l)
            sel.value = next
    }
    else if (ev.key === "Tab") {
        const next = laneStep(b, s, surf, ev.shiftKey)
        if (next !== undefined)
            sel.value = next
    }
    else
        return
    ev.preventDefault()
}

/*  answer the confirmation of a task deletion: "y" deletes, ESC or "n" cancels
    (with every key consumed, which also suppresses the single-key bindings)  */
const onConfirmKey = (ev: KeyboardEvent, id: string) => {
    if (ev.key === "y")
        deleteTask(id)
    else if (ev.key === "Escape" || ev.key === "n")
        confirmDel.value = null
    ev.preventDefault()
}

/*  answer the transfer popup: the up/down arrows select the previous/next selectable
    state, RETURN transfers the task to it, and ESC cancels (with every key consumed,
    which also suppresses the single-key bindings)  */
const onTransferKey = (ev: KeyboardEvent, t: { id: string, at: string }) => {
    const list = transferList.value
    if (ev.key === "ArrowUp" || ev.key === "ArrowDown") {
        const step = ev.key === "ArrowUp" ? -1 : 1
        for (let k = list.findIndex((e) => e.status === t.at) + step; k >= 0 && k < list.length; k += step)
            if (list[k].ok) {
                transfer.value = { ...t, at: list[k].status }
                nextTick(() => document.querySelector("#transfer .sel")?.scrollIntoView({ block: "nearest" }))
                break
            }
    }
    else if (ev.key === "Enter")
        transferTo(t.id, t.at)
    else if (ev.key === "Escape")
        cancelTransfer()
    ev.preventDefault()
}

/*  answer the prompt popup: RETURN requests the edit, ESC cancels, and all other
    keys (also Shift+RETURN for a line break) belong to its text area, as do all keys
    while an input method composes text (where Safari reports the composition-ending
    RETURN with the key code 229 only), while RETURN on a focused button presses it  */
const onPromptKey = (ev: KeyboardEvent) => {
    if (ev.isComposing || ev.keyCode === 229)
        return
    if (ev.key === "Enter" && !ev.shiftKey && !(ev.target instanceof HTMLButtonElement)) {
        ev.preventDefault()
        submitPrompt()
    }
    else if (ev.key === "Escape") {
        ev.preventDefault()
        cancelPrompt()
    }
}

/*  dispatch a key to the deletion confirmation, the transfer popup, the prompt popup,
    the task plan editor, the task dialog, or the board  */
const onKey = (ev: KeyboardEvent) => {
    if (confirmDel.value !== null)
        onConfirmKey(ev, confirmDel.value)
    else if (transfer.value !== null)
        onTransferKey(ev, transfer.value)
    else if (prompt.value !== null)
        onPromptKey(ev)
    else if (editing.value !== null)
        onEditorKey(ev, editing.value.keymap)
    else if (task.value !== null)
        onDialogKey(ev)
    else
        onBoardKey(ev)
}

/*  swallow all keys while the modal busy popup is shown (in the capture phase,
    so that neither the key dispatch, the key bindings, nor the editor see them)  */
const onBusyKey = (ev: KeyboardEvent) => {
    if (busy.value === null)
        return
    ev.preventDefault()
    ev.stopImmediatePropagation()
}
const onResize = () => {
    updateScroll()
    updateTabScroll()
    updateLogPos()
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
    connect()
    Mousetrap.bind("t", () => { if (board.value !== null && view.value !== "agents") toggle("titles", "") })
    Mousetrap.bind("s", () => { if (board.value !== null && view.value === "graph" && task.value === null) toggle("standalone", "") })
    Mousetrap.bind("v", () => { if (task.value === null) cycleView() })
    Mousetrap.bind("?", () => { if (board.value !== null) toggle("keys", "") })
    Mousetrap.bind("0", () => {
        if (view.value !== "graph" || task.value !== null)
            return
        zoom = 1
        applyZoom()
        showSel()
    })
    Mousetrap.bind([ "+", "=" ], () => { if (view.value === "graph" && task.value === null) zoomBy(1.25) })
    Mousetrap.bind("-", () => { if (view.value === "graph" && task.value === null) zoomBy(1 / 1.25) })
    Mousetrap.bind("/", (ev) => {
        if (task.value !== null || view.value === "agents")
            return
        ev.preventDefault()
        filterEl.value?.focus()
    })
    window.addEventListener("keydown", onBusyKey, true)
    document.addEventListener("keydown", onKey)
    window.addEventListener("resize", onResize)
    document.addEventListener("animationstart", onAnimationStart)

    /*  the keep-alive, which also notices a lost service while no events arrive  */
    ping = setInterval(async () => {
        const result = await api("/task-board/api/ping", undefined, true)
        online.value = result.error === undefined && events?.readyState === EventSource.OPEN
    }, 15 * 1000)
    reload()
})
onBeforeUnmount(() => {
    events?.close()
    if (retry !== null)
        clearTimeout(retry)
    Mousetrap.reset()
    stopEdit()
    window.removeEventListener("keydown", onBusyKey, true)
    document.removeEventListener("keydown", onKey)
    window.removeEventListener("resize", onResize)
    document.removeEventListener("animationstart", onAnimationStart)
    if (ping !== null)
        clearInterval(ping)
    if (filterTimer !== null)
        clearTimeout(filterTimer)
    if (busyTimer !== null)
        clearInterval(busyTimer)
    if (agentTimer !== null)
        clearInterval(agentTimer)
    if (noteTimer !== null)
        clearTimeout(noteTimer)
})
</script>

<style lang="stylus" src="./ase-task-board-web-client.styl"></style>

