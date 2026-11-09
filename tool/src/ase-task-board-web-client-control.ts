/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

/*  the control of the browser client of the web board: the actions on the
    tasks, the popups of these actions, and the dispatching of all keys  */
import { ref, computed, nextTick, watch } from "vue"
import Mousetrap                          from "mousetrap"
import {
    type Board, type Card, type Group, type Sel, type Surface,
    api, groupItems, rowLanes, relocate,
    board, actionError, actionNote, view, graph, task, sel, grow, editing, confirmDel, transfer, assign, prompt, watched,
    tab, taskDiff, drag, busy, boardEl, graphEl, flowEl, flowSel, planEl, filterEl, agentList, agentSel, logEl, showFlowAgent,
    surface, growable, grown, openTask, closeTask, clearDiff, selectTab, selectAgent, toggle, cycleView, stepStatsRange
} from "./ase-task-board-web-client-model"
import { startEdit, startNew, onEditorKey } from "./ase-task-board-web-client-editor"

/*  delete a task (after its confirmation), closing its task dialog
    (the task viewer stays open and notices the vanished task on its reload)  */
export const deleteTask = async (id: string) => {
    confirmDel.value = null
    const res = await api<{ ok: boolean }>(`/task-board/api/task/${encodeURIComponent(id)}`, { method: "DELETE" })
    actionError.value = res.error ?? null
    if (res.error === undefined && task.value?.id === id && watched === null)
        closeTask()
}

/*  the entries of the transfer popup: all lane states (with their group), where only the
    current state and the states reachable from it (from the actual status of the task,
    if it is foreign to the model) are selectable (none if the task vanished)  */
export const transferList = computed(() => {
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
export const cancelTransfer = () => {
    transfer.value = null
}

/*  transfer a task (from its popup) to a state, where its current state cancels  */
export const transferTo = (id: string, to: string) => {
    const entry = transferList.value.find((e) => e.status === to)
    transfer.value = null
    if (entry !== undefined && entry.ok && !entry.current)
        moveTask(id, to)
}

/*  the assignee field of the assign popup  */
export const assignEl = ref<HTMLInputElement | null>(null)

/*  the suggested assignees of the assign popup: "none", the users of "project.users" (else
    the current user), and the agents present at the agent relay which claim tasks by their
    assignee (neither request agents nor unclaimed phase agents), the latter two each sorted
    (where the users win on name clashes), and those matching the assignee as last typed (all
    of them for an empty or an exactly suggested assignee, to offer the alternatives, and else
    those containing it)  */
export type AssignChoice = { name: string, kind: "none" | "user" | "agent" }
const assignOptions = computed<AssignChoice[]>(() => {
    const users  = board.value !== null && board.value.users.length > 0 ? board.value.users : [ board.value?.self ?? "" ].filter((u) => u !== "")
    const agents = new Set(agentList.value.filter((a) => a.kind !== "editor" && a.request === undefined
        && (a.states === undefined || a.states.activity !== undefined)).map((a) => a.name))
    return [
        { name: "none", kind: "none" },
        ...[ ...new Set(users) ].sort().map((name) => ({ name, kind: "user" as const })),
        ...[ ...agents ].filter((name) => !users.includes(name)).sort().map((name) => ({ name, kind: "agent" as const }))
    ]
})
export const assignChoices = computed(() => {
    const typed = assign.value?.typed.toLowerCase() ?? ""
    return typed === "" || assignOptions.value.some((choice) => choice.name === assign.value?.typed) ? assignOptions.value :
        assignOptions.value.filter((choice) => choice.name.toLowerCase().includes(typed))
})

/*  whether the assignee of the assign popup is unknown (with a non-empty "project.users" only)  */
export const assignUnknown = computed(() => {
    const name = assign.value?.name.trim() ?? ""
    return (board.value?.users.length ?? 0) > 0 && name !== "" && name !== "me" && name !== board.value?.self
        && !assignOptions.value.some((choice) => choice.name === name)
})

/*  open the assign popup of a task, prefilled with its assignee  */
const openAssign = (id: string) => {
    const card = board.value?.groups.flatMap((g) => g.lanes).flatMap((l) => l.cards).find((c) => c.id === id)
    assign.value = { id, name: card?.assignee ?? "", typed: "" }
    nextTick(() => assignEl.value?.select())
}

/*  track the typing into the assignee field, and cancel the assign popup  */
export const typeAssign = () => {
    if (assign.value !== null)
        assign.value.typed = assign.value.name
}
export const cancelAssign = () => {
    assign.value = null
}

/*  assign a task (from its popup) to an assignee ("me" for the current user, and empty
    or "none" to unassign it), where an unknown assignee is assigned with a warning  */
export const assignTo = async (id: string, name: string) => {
    assign.value = null
    const res = await api<{ from: string, to: string, warning: string }>("/task-board/api/assign", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, assignee: name })
    })
    if (res.error !== undefined)
        actionError.value = `assigning task "${id}" failed: ${res.error}`
    else if (res.warning !== "")
        actionError.value = `task "${id}" assigned to "${res.to || "(nobody)"}" -- warning: ${res.warning}`
    else {
        actionError.value = null
        notify(`task "${id}" assigned from "${res.from || "(nobody)"}" to "${res.to || "(nobody)"}"`)
    }
}
export const submitAssign = () => {
    if (assign.value !== null)
        assignTo(assign.value.id, assign.value.name)
}

/*  the drafts of the prompts of cancelled (or failed to be sent) edit requests, per task  */
const promptDrafts = new Map<string, string>()

/*  the drafts of the cancelled (or failed to be sent) requests by prompt, per task  */
const requestDrafts = new Map<string, { name: string, text: string }>()

/*  the prompt text area, the request name field, and the request and cancel buttons of the prompt popup  */
export const promptEl   = ref<HTMLTextAreaElement | null>(null)
export const promptName = ref<HTMLInputElement | null>(null)
export const promptOk   = ref<HTMLButtonElement | null>(null)
export const promptNo   = ref<HTMLButtonElement | null>(null)

/*  the request name of the prompt popup as last typed (filtering the suggested request names
    of its drop-down, while the up/down arrows select them), and whether it is focused  */
export const promptTyped = ref("")
export const promptFocus = ref(false)

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
        if (confirmDel.value !== null || transfer.value !== null || assign.value !== null || prompt.value !== null)
            return
    }
    prompt.value = { id, text, name: null }
    nextTick(() => promptEl.value?.focus())
}

/*  the names of the requests processed by the agents announced to the agent relay (for their
    suggestion on requesting a task by prompt): "edit" of the editor agent, and the request
    names of the request agents of the definitions (e.g. of "ase agent adhoc")  */
export const requestNames = computed(() =>
    [ ...new Set(agentList.value.map((a) => a.kind === "editor" ? "edit" : a.request ?? "").filter((n) => n !== "")) ].sort())

/*  the suggested request names of the drop-down of the prompt popup, matching its request
    name as last typed (all of them for an empty or an exactly suggested request name, to
    offer the alternatives, and else those containing it)  */
export const requestChoices = computed(() => {
    const typed = promptTyped.value.trim().toLowerCase()
    return typed === "" || requestNames.value.includes(typed) ? requestNames.value :
        requestNames.value.filter((name) => name.toLowerCase().includes(typed))
})

/*  track the typing into and the focus of the request name field of the prompt popup  */
export const typeRequest = () => {
    promptTyped.value = prompt.value?.name ?? ""
}
export const focusRequest = (focus: boolean) => {
    promptFocus.value = focus
}

/*  the use of the prompt of a request of a name by the agents announced to the agent relay
    processing it: ignored if ignored by all of them (e.g. the "estimate" requests of "ase
    agent estimator"), optional if optional or ignored by all of them (e.g. the "research"
    requests of "ase agent researcher"), else (also without any such agent) required  */
const requestPrompt = (name: string): "required" | "optional" | "ignored" => {
    const agents = agentList.value.filter((a) => (a.kind === "editor" ? "edit" : a.request ?? "") === name)
    return agents.length === 0 || agents.some((a) => a.prompt === undefined) ? "required" :
        agents.every((a) => a.prompt === "ignored") ? "ignored" : "optional"
}

/*  whether the prompt of the prompt popup is ignored (and hence disabled): of a request
    by prompt whose request name is only processed by agents ignoring their prompts  */
export const promptIgnored = computed(() =>
    prompt.value !== null && prompt.value.name !== null && requestPrompt(prompt.value.name.trim()) === "ignored")

/*  focus the field of the prompt popup after the request name: the prompt,
    resp. the request button if the prompt is ignored  */
const focusNext = () => {
    nextTick(() => (promptIgnored.value ? promptOk.value : promptEl.value)?.focus())
}

/*  pick a suggested request name of the drop-down of the prompt popup and switch to the prompt  */
export const pickRequest = (name: string) => {
    if (prompt.value === null)
        return
    prompt.value.name = name
    focusNext()
}

/*  open the prompt popup of a request by prompt of any name of a task (see "ase task request",
    refused for a finished task), with the request name suggested from the request agents
    announced to the agent relay, prefilled with its draft of a cancelled (or failed to be
    sent) request, where a missing request name is to be entered first  */
const openRequest = (id: string) => {
    const card = board.value?.groups.flatMap((g) => g.lanes).flatMap((l) => l.cards).find((c) => c.id === id)
    if (card?.finished === true) {
        actionError.value = `requesting task "${id}" by prompt refused: task is finished`
        return
    }
    const draft = requestDrafts.get(id)
    const name  = draft?.name ?? requestNames.value[0] ?? ""
    prompt.value = { id, text: draft?.text ?? "", name }
    promptTyped.value = ""
    promptFocus.value = false
    if (name === "")
        nextTick(() => promptName.value?.focus())
    else
        focusNext()
}

/*  cancel the prompt popup, keeping its prompt as the draft of the task (even if
    empty, so that a cleared prompt is not prefilled again on reopening)  */
export const cancelPrompt = () => {
    if (prompt.value !== null && prompt.value.name !== null)
        requestDrafts.set(prompt.value.id, { name: prompt.value.name, text: prompt.value.text })
    else if (prompt.value !== null)
        promptDrafts.set(prompt.value.id, prompt.value.text)
    prompt.value = null
}

/*  request a task by the prompt of its popup under its request name (processed by a request
    agent of a definition, resp. by "ase agent editor" for "edit"), dropping the draft of
    the task once sent, resp. keeping the request as its draft on failure, where the prompt
    may be empty only for the requests of agents not requiring their prompts, and is dropped
    for the requests of agents ignoring their prompts  */
const submitRequest = async (p: { id: string, text: string, name: string }) => {
    const use = requestPrompt(p.name.trim())
    if (p.name.trim() === "" || (p.text.trim() === "" && use === "required")) {
        actionError.value = `requesting task "${p.id}" by prompt failed: empty ${p.name.trim() === "" ? "request name" : "prompt"}`
        return
    }
    prompt.value = null
    const res = await api<{ ok: boolean }>(`/task-board/api/task/${encodeURIComponent(p.id)}/request`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: p.name.trim(), prompt: use === "ignored" ? "" : p.text })
    })
    if (res.error !== undefined) {
        requestDrafts.set(p.id, { name: p.name, text: p.text })
        actionError.value = `requesting "${p.name}" of task "${p.id}" failed: ${res.error}`
    }
    else {
        requestDrafts.delete(p.id)
        actionError.value = null
        notify(`"${p.name.trim()}" of task "${p.id}" requested`)
    }
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

/*  cycle the color theme (auto, light, dark) of the page and of the shown task document,
    overriding the configured one in this browser until cycled back to it
    (silently not remembered if the browser storage is unavailable), where
    the page itself applies the remembered theme before its first paint  */
const themes          = [ "auto", "light", "dark" ]
const themeKey        = "ase-task-board:theme"
const themeConfigured = document.documentElement.dataset.themeConfigured ?? "auto"
const applyTheme = (theme: string) => {
    document.documentElement.dataset.theme = theme
    const root = planEl.value?.contentDocument?.documentElement
    if (root !== undefined)
        root.dataset.theme = theme
}
const cycleTheme = () => {
    const current = document.documentElement.dataset.theme ?? "auto"
    const theme   = themes[(themes.indexOf(current) + 1) % themes.length]
    applyTheme(theme)
    try {
        if (theme === themeConfigured)
            localStorage.removeItem(themeKey)
        else
            localStorage.setItem(themeKey, theme)
    }
    catch (_err: unknown) {
        /*  not remembered  */
    }
    notify(`theme: ${theme}`)
}

/*  request the edit of a task by the prompt of its popup (processed by "ase agent editor"),
    dropping the draft of the task once sent, resp. keeping the prompt as its draft on failure  */
export const submitPrompt = async () => {
    const p = prompt.value
    if (p === null)
        return
    if (p.name !== null) {
        await submitRequest({ ...p, name: p.name })
        return
    }
    if (p.text.trim() === "") {
        actionError.value = `requesting edit of task "${p.id}" failed: empty edit prompt`
        return
    }
    prompt.value = null
    const res = await api<{ ok: boolean }>(`/task-board/api/task/${encodeURIComponent(p.id)}/request`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "edit", prompt: p.text })
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

/*  whether a dragged (or carried) task can be dropped onto a lane, and the move of a task to another lane  */
export const canDrop = (status: string) =>
    drag.value !== null && (drag.value.moves ?? board.value?.moves[drag.value.from] ?? []).includes(status)
export const moveTask = async (id: string, status: string) => {
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

/*  follow the selection with the lane a carried task is moved onto (the lanes and the
    graph view follow the selection with their marks, scroll positions, and lane focus)  */
watch([ sel, graph, view, task, grown ], () => {
    const d     = drag.value
    const group = board.value?.groups[sel.value.g]
    if (d?.key === true)
        d.over = group === undefined || surface.value.collapsed.includes(group.title) ? null : group.lanes[sel.value.l]?.status ?? null
})

/*  the single-key actions of the task dialog on its task  */
const dialogKeys: Record<string, (id: string) => void> = {
    E: openPrompt, R: openRequest, T: openTransfer, A: openAssign,
    D: (id) => { confirmDel.value = id }
}

/*  in the task dialog, RETURN and ESC close it (except in the task viewer, as a browser tab
    cannot be closed by its page), "e" edits its plan, "E" edits it by a prompt, "R" requests it by a prompt,
    "D" deletes, "T" transitions, and "A" assigns its task, "#" clears the diff of its plan, "L" cycles the color theme,
    the left/right arrows (also Tab/Shift+Tab) switch its tab, and the up/down arrows and PgUp/PgDn scroll its content  */
const onDialogKey = (ev: KeyboardEvent) => {
    const win = planEl.value?.contentWindow ?? null
    if (ev.key === "Escape" || ev.key === "Enter") {
        if (watched === null)
            closeTask()
    }
    else if (ev.key === "e" && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
        ev.preventDefault()
        startEdit()
    }
    else if (Object.hasOwn(dialogKeys, ev.key) && !ev.ctrlKey && !ev.metaKey && !ev.altKey && task.value !== null) {
        ev.preventDefault()
        dialogKeys[ev.key](task.value.id)
    }
    else if (ev.key === "#" && tab.value === 0 && taskDiff.value !== null) {
        ev.preventDefault()
        clearDiff()
    }
    else if (ev.key === "L" && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
        ev.preventDefault()
        cycleTheme()
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

/*  the centers of the rendered nodes of a graph (resp. the agent graph), for the spatial navigation  */
const graphPlaces = (el: HTMLElement | null) => new Map([ ...(el?.querySelectorAll<SVGGElement>("g.node[data-id]") ?? []) ].map((n) => {
    const box = n.querySelector("foreignObject, rect")
    const num = (attr: string) => Number(box?.getAttribute(attr) ?? 0)
    return [ n.dataset.id!, { r: num("y") + num("height") / 2, c: num("x") + num("width") / 2 } ] as const
}))

/*  move spatially to the nearest graph node in the direction of the
    arrow, preferring nodes in the same row (left/right) or column
    (up/down), or initially to the first node of the left-to-right layout  */
const graphStep = (key: string, id: string, el = graphEl.value): string | undefined => {
    const places = graphPlaces(el)
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

/*  step through the lanes of the expanded phases lane row by lane row: first
    left/right through the phases, then wrap into the next/previous
    lane row (and at the very end/start around the board)  */
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

/*  on the board, act on the selected task: view, edit, edit by prompt, request by prompt, delete,
    transition, or assign it, or create a new task (answering whether the key is such an action)  */
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
    else if (ev.key === "R") {
        if (id !== "" && !carrying)
            openRequest(id)
    }
    else if (ev.key === "D") {
        if (id !== "")
            confirmDel.value = id
    }
    else if (ev.key === "T") {
        if (id !== "" && !carrying)
            openTransfer(id)
    }
    else if (ev.key === "A") {
        if (id !== "" && !carrying)
            openAssign(id)
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

/*  in the agent graph view, the arrows move spatially to the nearest agent card (resp.
    state), and ENTER shows the agents view with its (first) agent selected  */
const onFlowKey = (ev: KeyboardEvent) => {
    if (ev.target instanceof HTMLInputElement || ev.ctrlKey || ev.metaKey || ev.altKey)
        return
    if (ev.key === "Enter")
        showFlowAgent(flowSel.value)
    else if (ev.key === "ArrowLeft" || ev.key === "ArrowRight" || ev.key === "ArrowUp" || ev.key === "ArrowDown") {
        const next = graphStep(ev.key, flowSel.value, flowEl.value)
        if (next !== undefined)
            flowSel.value = next
    }
    else
        return
    ev.preventDefault()
}

/*  in the statistics view, the left/right arrows step through its time ranges  */
const onStatsKey = (ev: KeyboardEvent) => {
    if (ev.target instanceof HTMLInputElement || ev.ctrlKey || ev.metaKey || ev.altKey)
        return
    if (ev.key === "ArrowLeft" || ev.key === "ArrowRight") {
        stepStatsRange(ev.key === "ArrowLeft" ? -1 : 1)
        ev.preventDefault()
    }
}

/*  on the board, navigate the selection like in the TUI (but not while typing the filter),
    where the statistics view has no selection at all, but steps through its time ranges  */
const onBoardKey = (ev: KeyboardEvent) => {
    if (view.value === "agents") {
        onAgentsKey(ev)
        return
    }
    if (view.value === "flow") {
        onFlowKey(ev)
        return
    }
    if (view.value === "stats") {
        onStatsKey(ev)
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
            actionError.value = "only a maximized lane of an expanded phase can grow"
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
    else if (ev.key === "C") {
        const row = rowLanes(b, surf, s.l)
        if (row.length > 0)
            toggle("minimized", row)
    }
    else if (ev.key === "ArrowLeft" || ev.key === "ArrowRight") {
        const g = Math.max(0, Math.min(b.groups.length - 1, s.g + (ev.key === "ArrowLeft" ? -1 : 1)))
        if (g !== s.g) {
            const items = groupItems(b, g, surf)
            sel.value = items.find((it) => it.l === s.l) ?? items[0]
        }
    }
    else if ((ev.key === "ArrowUp" || ev.key === "ArrowDown") && carry === null) {
        /*  within a collapsed phase, the items are the lanes themselves  */
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

/*  answer the assign popup: the up/down arrows cycle through the suggested assignees of the
    drop-down (matching the assignee as last typed), RETURN assigns the task to the assignee,
    ESC cancels, TAB is consumed (keeping the focus on the assignee field), and all other keys
    belong to the assignee field, as do all keys while an input method composes text  */
const onAssignKey = (ev: KeyboardEvent, a: { id: string, name: string, typed: string }) => {
    if (ev.isComposing || ev.keyCode === 229)
        return
    const choices = assignChoices.value.map((choice) => choice.name)
    if ((ev.key === "ArrowUp" || ev.key === "ArrowDown") && choices.length > 0) {
        ev.preventDefault()
        const i  = choices.indexOf(a.name)
        const n  = choices.length
        const up = ev.key === "ArrowUp"
        a.name = choices[i < 0 ? (up ? n - 1 : 0) : (i + (up ? n - 1 : 1)) % n]
        nextTick(() => document.querySelector("#assign .sel")?.scrollIntoView({ block: "nearest" }))
    }
    else if (ev.key === "Enter" && !(ev.target instanceof HTMLButtonElement)) {
        ev.preventDefault()
        submitAssign()
    }
    else if (ev.key === "Escape") {
        ev.preventDefault()
        cancelAssign()
    }
    else if (ev.key === "Tab")
        ev.preventDefault()
}

/*  answer the prompt popup: TAB resp. Shift+TAB switch the focus to the next resp. previous
    field (the request name of a request by prompt, the prompt unless ignored, and the request
    and cancel buttons, like in the terminal board, and never leaving the popup), RETURN requests
    the edit (or the request, resp. switches from the request name to the prompt, or to the
    request button if the prompt is ignored), the up/down
    arrows cycle through the suggested request names of the drop-down (on the request name),
    ESC cancels, and all other keys (also Shift+RETURN for a line break) belong to its text
    area (or request name field), as do all keys while an input method composes text (where
    Safari reports the composition-ending RETURN with the key code 229 only), while RETURN on
    a focused button presses it  */
const onPromptKey = (ev: KeyboardEvent) => {
    if (ev.isComposing || ev.keyCode === 229)
        return
    const choices = requestChoices.value
    if (ev.key === "Tab" && !ev.ctrlKey && !ev.altKey && !ev.metaKey) {
        ev.preventDefault()
        const fields = ([ promptName.value, promptEl.value, promptOk.value, promptNo.value ] as (HTMLElement | null)[])
            .filter((el): el is HTMLElement => el !== null && el.isConnected)
        const i = fields.findIndex((el) => el === document.activeElement)
        const n = fields.length
        if (n > 0)
            fields[i < 0 ? 0 : (i + (ev.shiftKey ? n - 1 : 1)) % n].focus()
    }
    else if ((ev.key === "ArrowUp" || ev.key === "ArrowDown") && ev.target === promptName.value
        && prompt.value !== null && prompt.value.name !== null && choices.length > 0) {
        ev.preventDefault()
        const i  = choices.indexOf(prompt.value.name)
        const n  = choices.length
        const up = ev.key === "ArrowUp"
        prompt.value.name = choices[i < 0 ? (up ? n - 1 : 0) : (i + (up ? n - 1 : 1)) % n]
    }
    else if (ev.key === "Enter" && !ev.shiftKey && ev.target === promptName.value && promptName.value !== null) {
        ev.preventDefault()
        focusNext()
    }
    else if (ev.key === "Enter" && !ev.shiftKey && !(ev.target instanceof HTMLButtonElement)) {
        ev.preventDefault()
        submitPrompt()
    }
    else if (ev.key === "Escape") {
        ev.preventDefault()
        cancelPrompt()
    }
}

/*  dispatch a key to the deletion confirmation, the transfer popup, the assign popup,
    the prompt popup, the task plan editor, the task dialog, or the board  */
const onKey = (ev: KeyboardEvent) => {
    if (confirmDel.value !== null)
        onConfirmKey(ev, confirmDel.value)
    else if (transfer.value !== null)
        onTransferKey(ev, transfer.value)
    else if (assign.value !== null)
        onAssignKey(ev, assign.value)
    else if (prompt.value !== null)
        onPromptKey(ev)
    else if (editing.value !== null)
        onEditorKey(ev, editing.value.keymap)
    else if (task.value !== null)
        onDialogKey(ev)
    else if (watched === null)
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

/*  start the key handling: the single-key bindings of the board (the graph view binds its zoom
    keys itself), the dispatching of all other keys, and the swallowing of keys while busy  */
export const controlStart = () => {
    if (watched === null) {
        Mousetrap.bind("t", () => { if (board.value !== null && (view.value === "lanes" || view.value === "graph")) toggle("titles", "") })
        Mousetrap.bind("s", () => { if (board.value !== null && view.value === "graph" && task.value === null) toggle("standalone", "") })
        Mousetrap.bind("v", () => { if (task.value === null) cycleView() })
        Mousetrap.bind("V", () => { if (task.value === null) cycleView(true) })
        Mousetrap.bind("?", () => { if (board.value !== null) toggle("keys", "") })
        Mousetrap.bind("/", (ev) => {
            if (task.value !== null || view.value === "agents" || view.value === "flow")
                return
            ev.preventDefault()
            filterEl.value?.focus()
        })
    }

    /*  (in the task dialog, "onDialogKey" handles it, as only keydown passes from its document)  */
    Mousetrap.bind("L", () => { if (task.value === null) cycleTheme() })
    window.addEventListener("keydown", onBusyKey, true)
    document.addEventListener("keydown", onKey)
}

/*  stop the key handling and the timer of the transient notice  */
export const controlStop = () => {
    Mousetrap.reset()
    window.removeEventListener("keydown", onBusyKey, true)
    document.removeEventListener("keydown", onKey)
    if (noteTimer !== null)
        clearTimeout(noteTimer)
}

