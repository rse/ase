/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import fs                                     from "node:fs"
import os                                     from "node:os"
import path                                   from "node:path"

import React                                  from "react"
import { execa }                              from "execa"
import { useApp, useWindowSize, measureElement } from "ink"
import type { DOMElement }                    from "ink"

import type Log                               from "./ase-lib-log.js"
import { Task }                               from "./ase-task.js"
import { userId }                             from "./ase-service-otel.js"
import {
    buildBoard, watchTasks, BoardState, byCreation, newTaskText, createTask, saveTask, TaskConflict, reachableStates, toneOf,
    watchAgents, busyAgents, agentsDigest, requestNames, requestPrompt, assignable, dataLoad, viewOrder
}                                             from "./ase-task-board-core.js"
import type { Board, Card, Surface, SurfaceFlag, SurfaceList, SurfaceView, StoreState, AgentsState } from "./ase-task-board-core.js"
import * as TaskFormat                        from "./ase-task-format.js"
import { editRefused, editPrompt, requestEdit, requestsOf } from "./ase-task-request.js"
import type { TaskRequests }                  from "./ase-task-request.js"
import { filterBoard, dropStandalone }        from "./ase-task-board-filter.js"
import { statsOf, statsRanges, effortScale }  from "./ase-task-board-stats.js"
import type { StatsRange }                    from "./ase-task-board-stats.js"
import { layoutGraph }                        from "./ase-task-board-graph.js"
import type { GraphLayout, Place }            from "./ase-task-board-graph.js"
import { flowOf, layoutFlow, flowState }      from "./ase-task-board-flow.js"
import type { Flow }                          from "./ase-task-board-flow.js"
import { fitGroups, agentLogWidth, agentOpLines, agentOpHeight, AGENT_INFO_H } from "./ase-task-board-tui-view.js"
import { dialogTabs, planLines, planChanged, planDiffLines, attachmentLines, agentLogLines, agentLogKey, DIALOG_CHROME, DIALOG_WIDTH } from "./ase-task-board-tui-popup.js"
import type { PlanParts }                     from "./ase-task-board-tui-popup.js"
import { pulseFrames }                        from "./ase-task-board-tui-style.js"

/*  the selection: group, lane, and card id ("" for a lane without card focus)  */
export type Sel = { g: number, l: number, id: string }

/*  the currently carried task (if any) and the lane states it can be moved to  */
export type Carry = { id: string, from: string, targets: Set<string> }

/*  the prompt popup of a task: its prompt with the cursor position, its focused field (the
    request name, the prompt, or the request or cancel button), and, for a request by prompt
    of any name (instead of an edit request), its request name, the suggested request names,
    and the request name as last typed (filtering the suggested request names, while the
    up/down arrows select them)  */
export type PromptFocus   = "name" | "prompt" | "request" | "cancel"
export type PromptRequest = { name: string, choices: string[], ignored: string[], typed: string }
export type PromptState   = { id: string, text: string, pos: number, focus: PromptFocus, request: PromptRequest | null }

/*  the suggested request names of a request by prompt, matching its request name as last
    typed (all of them for an empty or an exactly suggested request name, to offer the
    alternatives, and else those containing it)  */
export const requestChoices = (request: PromptRequest): string[] => {
    const typed = request.typed.toLowerCase()
    return typed === "" || request.choices.includes(typed) ? request.choices :
        request.choices.filter((choice) => choice.toLowerCase().includes(typed))
}

/*  the assign popup of a task: its assignee (as typed or picked), the assignee as last
    typed (filtering the suggested assignees, while the up/down arrows select them), the
    suggested assignees ("none", the users, and the assignable agents at the agent relay), the
    current user, and whether the assignees are restricted (by a non-empty "project.users")  */
export type AssignChoice = { name: string, kind: "none" | "user" | "agent" }
export type AssignState  = { id: string, name: string, typed: string, choices: AssignChoice[], self: string, strict: boolean }

/*  the suggested assignees of the assign popup (with "none" first, then the users, then the
    agents, each sorted, where the users win on name clashes), and those matching the assignee
    as last typed (all of them for an empty or an exactly suggested assignee, to offer the
    alternatives, and else those containing it)  */
export const assignOptions = (users: string[], agents: string[]): AssignChoice[] => [
    { name: "none", kind: "none" },
    ...[ ...new Set(users) ].sort().map((name) => ({ name, kind: "user" as const })),
    ...[ ...new Set(agents) ].filter((name) => !users.includes(name)).sort().map((name) => ({ name, kind: "agent" as const }))
]
export const assignChoices = (assign: AssignState): AssignChoice[] => {
    const typed = assign.typed.toLowerCase()
    return typed === "" || assign.choices.some((choice) => choice.name === assign.typed) ? assign.choices :
        assign.choices.filter((choice) => choice.name.toLowerCase().includes(typed))
}

/*  whether the assignee of the assign popup is unknown (with restricted assignees only)  */
export const assignUnknown = (assign: AssignState): boolean => {
    const name = assign.name.trim()
    return assign.strict && name !== "" && name !== "me" && name !== assign.self
        && !assign.choices.some((choice) => choice.name === name)
}

/*  the navigable items of a group: one per card, or one per lane
    which is minimized, empty, or within a collapsed phase  */
export const groupItems = (board: Board, g: number, surface: Surface): Sel[] => {
    const out  = [] as Sel[]
    const coll = surface.collapsed.includes(board.groups[g].title)
    board.groups[g].lanes.forEach((lane, l) => {
        const cards = board.lanes.get(lane.status) ?? []
        if (coll || surface.minimized.includes(lane.status) || cards.length === 0)
            out.push({ g, l, id: "" })
        else
            cards.forEach((c) => out.push({ g, l, id: c.id }))
    })
    return out
}

/*  re-locate a selection on a (possibly changed) board: a selected card
    is followed into its current lane, otherwise the lane is kept  */
export const relocate = (board: Board, sel: Sel, surface: Surface): Sel => {
    if (sel.id !== "") {
        const card = board.cards.get(sel.id)
        if (card !== undefined)
            for (let g = 0; g < board.groups.length; g++) {
                const l = board.groups[g].lanes.findIndex((lane) => lane.status === card.status)
                if (l >= 0)
                    return surface.minimized.includes(card.status) || surface.collapsed.includes(board.groups[g].title) ?
                        { g, l, id: "" } : { g, l, id: card.id }
            }
    }
    const g     = Math.min(sel.g, board.groups.length - 1)
    const items = groupItems(board, g, surface)
    return items.find((it) => it.l === sel.l) ?? items[0]
}

/*  the entries of the transfer popup: all lane states (with their group), where
    only the current state and the states reachable from it are selectable  */
export type TransferEntry = { group: string, status: string, ok: boolean }
export const transferEntries = (board: Board, cycle: TaskFormat.TaskLifecycle, card: Card): TransferEntry[] => {
    const reachable = new Set(reachableStates(board, cycle, card))
    return board.groups.flatMap((g) => g.lanes.map((l) => ({
        group: g.title, status: l.status,
        ok:    l.status === card.status || reachable.has(l.status)
    })))
}

/*  the duration (in ms) a task store operation has to last before the busy popup shows it  */
export const BUSY_DELAY = 800

/*  the duration (in ms) the heart of an agent card stays filled after a received heartbeat  */
const BEAT_SHOWN_MS = 1000

/*  the label of a busy task store operation: its text, the optional task id
    (rendered inverse), and an optional suffix  */
export type BusyLabel = { text: string, id?: string, suffix?: string }

/*  switch the mouse click reporting of the terminal (xterm, SGR encoding) on or off  */
export const mouseReporting = (on: boolean): void => {
    process.stdout.write(on ? "\x1b[?1000h\x1b[?1006h" : "\x1b[?1006l\x1b[?1000l")
}

/*  track the task store operations: once the oldest of the pending operations
    lasts longer than BUSY_DELAY, the modal busy popup shows it (with an animation tick)  */
const useBusy = () => {
    const pending = React.useRef(new Map<number, BusyLabel>())
    const seq     = React.useRef(0)
    const [ busy,     setBusy     ] = React.useState<{ label: BusyLabel, since: number } | null>(null)
    const [ busyTick, setBusyTick ] = React.useState(0)
    const track = <T>(label: BusyLabel, op: Promise<T>): Promise<T> => {
        const n = ++seq.current
        pending.current.set(n, label)
        const timer = setTimeout(() => {
            setBusy((b) => b ?? { label: pending.current.values().next().value ?? label, since: Date.now() - BUSY_DELAY })
        }, BUSY_DELAY)
        return op.finally(() => {
            clearTimeout(timer)
            pending.current.delete(n)
            const next = pending.current.values().next()
            setBusy((b) => b === null || next.done === true ? null : { ...b, label: next.value })
        })
    }
    React.useEffect(() => {
        if (busy === null)
            return
        const timer = setInterval(() => {
            setBusyTick((n) => n + 1)
        }, 50)
        return () => {
            clearInterval(timer)
        }
    }, [ busy ])
    return { busy, busyTick, track }
}

/*  the rendered boxes for the mouse hit-testing: the card, lane, and group boxes of the
    lane view, the agent cards of the agents view, the time range buttons of the statistics
    view, the view value, filter field, and clear button of the header, and the graph viewport content  */
const useHitBoxes = () => {
    const cardBoxes  = React.useRef(new Map<string, DOMElement>())
    const laneBoxes  = React.useRef(new Map<string, DOMElement>())
    const groupBoxes = React.useRef(new Map<string, DOMElement>())
    const headBoxes  = React.useRef(new Map<string, DOMElement>())
    const agentBoxes = React.useRef(new Map<string, DOMElement>())
    const rangeBoxes = React.useRef(new Map<StatsRange, DOMElement>())
    const graphView  = React.useRef<DOMElement | null>(null)
    const register   = <K extends string>(map: Map<K, DOMElement>, key: K) => (el: DOMElement | null) => {
        if (el !== null)
            map.set(key, el)
        else
            map.delete(key)
    }
    const cardRef    = (id: string) => register(cardBoxes.current, id)
    const laneRef    = (g: number, l: number) => register(laneBoxes.current, `${g}:${l}`)
    const groupRef   = (g: number) => register(groupBoxes.current, String(g))
    const headRef    = (key: "view" | "filter" | "clear") => register(headBoxes.current, key)
    const agentRef   = (id: string) => register(agentBoxes.current, id)
    const rangeRef   = (range: StatsRange) => register(rangeBoxes.current, range)
    return { cardBoxes, laneBoxes, groupBoxes, headBoxes, agentBoxes, rangeBoxes, graphView, cardRef, laneRef, groupRef, headRef, agentRef, rangeRef }
}

/*  find the registered box under a (0-based) mouse position  */
const boxAt = <K extends string>(map: Map<K, DOMElement>, mx: number, my: number): K | undefined => {
    for (const [ key, el ] of map) {
        const m = measureElement(el)
        if (mx >= m.x && mx < m.x + m.width && my >= m.y && my < m.y + m.height)
            return key
    }
    return undefined
}

/*  the box of every node of a laid out graph, for the spatial navigation and the scrolling  */
const placesOf = (graph: GraphLayout | undefined): Map<string, Place> => {
    const map = new Map<string, Place>()
    if (graph !== undefined)
        for (const n of graph.nodes.values())
            map.set(n.id, { r: n.y + Math.floor(n.h / 2), c: n.x + Math.floor(n.w / 2), top: n.y, bottom: n.y + n.h - 1, bl: n.x, br: n.x + n.w - 1 })
    return map
}

/*  the state of the agents view: the agents of the master list, the selected one (followed by its id,
    else, until explicitly selected again, the one at the index of the previously selected one),
    the lines of its operation pane, and the lines of its recent processing log in the detail view (within its frame), scrolled
    to the bottom unless explicitly scrolled up, where the scroll position is anchored to the
    processing log line at its top (as the oldest lines are dropped once the recent lines are
    complete), falling back to the top once this line was dropped, too  */
const useAgentsView = (agents: AgentsState | null, columns: number, boardH: number) => {
    const [ agentSel,  setAgentSel  ] = React.useState("")
    const [ logScroll, setLogScroll ] = React.useState<{ key: string, offset: number } | null>(null)
    const agentList = agents?.agents ?? []
    const agentHit  = agentList.findIndex((a) => a.id === agentSel)
    const agentLast = React.useRef(0)
    const agentIdx  = agentHit >= 0 ? agentHit : Math.max(0, Math.min(agentLast.current, agentList.length - 1))
    const agent     = agentList.at(agentIdx)
    const agentOp   = React.useMemo(() => agentOpLines(agent, columns), [ agent, columns ])
    const logLines  = React.useMemo(() => agent !== undefined ? agentLogLines(agent, agentLogWidth(columns)) : [], [ agent, columns ])
    const logH      = Math.max(1, boardH - agentOpHeight(agentOp) - AGENT_INFO_H - 2)
    const logMax    = Math.max(0, logLines.length - logH)
    let   logFirst  = logMax
    if (logScroll !== null && agentHit >= 0 && agent !== undefined) {
        const entry = agent.recent.findIndex((line) => agentLogKey(line) === logScroll.key)
        logFirst = entry < 0 ? 0 :
            Math.max(0, Math.min(logMax, logLines.findIndex((line) => line.entry === entry) + logScroll.offset))
    }

    /*  remember the index of the selected agent, and once it vanished (or initially), explicitly
        select the agent at its previous index (resp. the first one), following its log at the bottom  */
    React.useEffect(() => {
        if (agentHit >= 0)
            agentLast.current = agentHit
        else if (agentList.length > 0) {
            setAgentSel(agentList[agentIdx].id)
            setLogScroll(null)
        }
    }, [ agentHit, agentIdx, agentList ])

    /*  select another agent (relative to the selected one), following its log at the bottom  */
    const selectAgent = (delta: number): void => {
        if (agentList.length === 0)
            return
        setAgentSel(agentList[Math.max(0, Math.min(agentList.length - 1, agentIdx + delta))].id)
        setLogScroll(null)
    }

    /*  scroll the log of the detail view (by lines, or to its top or bottom),
        anchored to the processing log line of its top row, and following it
        again at the bottom once scrolled down to it  */
    const scrollLog = (delta: number | "top" | "bottom"): void => {
        const next = delta === "top" ? 0 : delta === "bottom" ? logMax : Math.max(0, Math.min(logMax, logFirst + delta))
        const line = logLines[next]
        if (next >= logMax || line === undefined || agent === undefined) {
            setLogScroll(null)
            return
        }
        const start = logLines.findIndex((l) => l.entry === line.entry)
        setLogScroll({ key: agentLogKey(agent.recent[line.entry]), offset: next - start })
    }

    /*  select an agent by its id (e.g. from the agent graph), following its log at the bottom  */
    const focusAgent = (id: string): void => {
        setAgentSel(id)
        setLogScroll(null)
    }
    return { agentList, agentIdx, agent, agentOp, logLines, logH, logFirst, logMax, selectAgent, scrollLog, focusAgent }
}

/*  the wall-clock and the heartbeats of the agents of the agents view and the agent graph  */
const useBeats = (agents: AgentsState | null, view: SurfaceView) => {
    /*  tick the wall-clock every second while the agents view is shown, for the live
        durations of its footer (the time in the current state and the age of the heartbeat)  */
    const [ now, setNow ] = React.useState(Date.now())
    React.useEffect(() => {
        if (view !== "agents")
            return
        setNow(Date.now())
        const timer = setInterval(() => {
            setNow(Date.now())
        }, 1000)
        return () => {
            clearInterval(timer)
        }
    }, [ view ])

    /*  the local time at which the latest heartbeat of each agent was received (measured
        locally, as the clock of the agent relay may be skewed), for the heart of its card
        (filled for BEAT_SHOWN_MS after a heartbeat, else empty), where the heartbeats are
        recognized by their changed time stamps and a filled heart is re-rendered once it is
        due to be emptied (as the wall-clock tick alone would empty it too early or too late)  */
    const beats     = React.useRef(new Map<string, { beat: number, seen: number }>())
    const beatsSeen = React.useMemo(() => {
        const at   = Date.now()
        const list = agents?.agents ?? []
        const next = new Map<string, { beat: number, seen: number }>()
        for (const a of list) {
            const prev = beats.current.get(a.id)
            next.set(a.id, prev !== undefined && prev.beat === a.beat ? prev : { beat: a.beat, seen: at })
        }
        beats.current = next
        return next
    }, [ agents ])
    React.useEffect(() => {
        if (view !== "agents" && view !== "flow")
            return
        const latest = Math.max(0, ...[ ...beatsSeen.values() ].map((b) => b.seen))
        const due    = latest + BEAT_SHOWN_MS - Date.now()
        if (latest === 0 || due <= 0)
            return
        const timer = setTimeout(() => {
            setNow(Date.now())
        }, due)
        return () => {
            clearTimeout(timer)
        }
    }, [ view, beatsSeen ])
    const beatOf = (id: string): boolean =>
        now - (beatsSeen.get(id)?.seen ?? 0) < BEAT_SHOWN_MS
    return { now, beatOf }
}

/*  the actions of the prompt popup of the terminal board: opening it for an edit request
    or for a request by prompt of any name, cancelling it, and submitting it, with the
    drafts of the cancelled (or failed to be sent) prompts and requests, per task  */
const usePromptActions = (ctx: {
    log:        Log
    all:        Board
    cycle:      TaskFormat.TaskLifecycle | null
    agents:     AgentsState | null
    prompt:     PromptState | null
    setPrompt:  (prompt: PromptState | null) => void
    setNotice:  (notice: string | null) => void
    track:      ReturnType<typeof useBusy>["track"]
    promptLoad: React.RefObject<number>
}) => {
    const { log, all, cycle, agents, prompt, setPrompt, setNotice, track, promptLoad } = ctx

    /*  the drafts of the prompts of cancelled (or failed to be sent) edit requests, per task  */
    const promptDrafts = React.useRef(new Map<string, { text: string, pos: number }>())

    /*  the drafts of the cancelled (or failed to be sent) requests by prompt, per task  */
    const requestDrafts = React.useRef(new Map<string, { name: string, text: string, pos: number }>())

    /*  open the prompt popup of an edit request of a task (refused for a finished task, and
        while an edit of it is in progress, as a new request would change the task under the
        running edit), prefilled with its draft of a cancelled (or failed to be sent) prompt,
        else with the prompt of its most recent failed edit request (for a retry)  */
    const startPrompt = (id: string): void => {
        const card = all.cards.get(id)
        if (card === undefined)
            return
        if (cycle !== null && editRefused(cycle, card.actual)) {
            setNotice(`editing task "${id}" by prompt refused: task is finished`)
            return
        }
        if (card.edit === "active") {
            setNotice(`editing task "${id}" by prompt refused: edit in progress`)
            return
        }
        const draft = promptDrafts.current.get(id)
        if (draft !== undefined) {
            setPrompt({ id, ...draft, focus: "prompt", request: null })
            return
        }
        const token = ++promptLoad.current
        track({ text: "loading edit prompt of task", id }, editPrompt(log, id)).then((text) => {
            if (token === promptLoad.current)
                setPrompt({ id, text, pos: [ ...text ].length, focus: "prompt", request: null })
        }).catch((err: unknown) => {
            if (token === promptLoad.current)
                setNotice(`editing task "${id}" by prompt failed: ${err instanceof Error ? err.message : String(err)}`)
        })
    }

    /*  open the prompt popup of a request by prompt of any name of a task (see "ase task
        request", refused for a finished task), with the request name suggested from the
        request agents announced to the agent relay, prefilled with its draft of a cancelled
        (or failed to be sent) request, where a missing request name is to be entered first  */
    const startRequest = (id: string): void => {
        const card = all.cards.get(id)
        if (card === undefined)
            return
        if (cycle !== null && editRefused(cycle, card.actual)) {
            setNotice(`requesting task "${id}" by prompt refused: task is finished`)
            return
        }
        const choices = requestNames(agents)
        const ignored = choices.filter((choice) => requestPrompt(agents, choice) === "ignored")
        const draft   = requestDrafts.current.get(id)
        const name    = draft?.name ?? choices[0] ?? ""
        const focus   = name === "" ? "name" : ignored.includes(name) ? "request" : "prompt"
        setPrompt({ id, text: draft?.text ?? "", pos: draft?.pos ?? 0, focus, request: { name, choices, ignored, typed: "" } })
    }

    /*  cancel the prompt popup, keeping its prompt as the draft of the task (even if
        empty, so that a cleared prompt is not prefilled again on reopening)  */
    const cancelPrompt = (): void => {
        if (prompt === null)
            return
        if (prompt.request !== null) {
            requestDrafts.current.set(prompt.id, { name: prompt.request.name, text: prompt.text, pos: prompt.pos })
            setNotice(`requesting task "${prompt.id}" by prompt cancelled`)
        }
        else {
            promptDrafts.current.set(prompt.id, { text: prompt.text, pos: prompt.pos })
            setNotice(`editing task "${prompt.id}" by prompt cancelled`)
        }
        setPrompt(null)
    }

    /*  request a task by the prompt of its popup under its request name (processed by a
        request agent of a definition, resp. by "ase agent editor" for "edit"), dropping
        the draft of the task once sent, resp. keeping the request as its draft on failure,
        where the prompt may be empty only for the requests of agents not requiring their prompts,
        and is dropped for the requests of agents ignoring their prompts  */
    const submitRequest = (id: string, text: string, pos: number, name: string): void => {
        let requests: TaskRequests
        try {
            requests = requestsOf(name)
        }
        catch (err: unknown) {
            setNotice(`requesting task "${id}" by prompt failed: ${err instanceof Error ? err.message : String(err)}`)
            return
        }
        const use = requestPrompt(agents, name)
        if (text.trim() === "" && use === "required") {
            setNotice(`requesting "${name}" of task "${id}" failed: empty prompt`)
            return
        }
        setPrompt(null)
        track({ text: `requesting "${name}" of task`, id }, requests.request(log, id, use === "ignored" ? "" : text)).then(() => {
            requestDrafts.current.delete(id)
            setNotice(`"${name}" of task "${id}" requested`)
        }).catch((err: unknown) => {
            requestDrafts.current.set(id, { name, text, pos })
            setNotice(`requesting "${name}" of task "${id}" failed: ${err instanceof Error ? err.message : String(err)}`)
        })
    }

    /*  request the edit of a task by the prompt of its popup (processed by "ase agent editor"),
        dropping the draft of the task once sent, resp. keeping the prompt as its draft on failure,
        or request a task by the prompt of its popup under its request name  */
    const submitPrompt = (): void => {
        if (prompt === null)
            return
        const { id, text, pos } = prompt
        if (prompt.request !== null) {
            submitRequest(id, text, pos, prompt.request.name)
            return
        }
        if (text.trim() === "") {
            setNotice(`requesting edit of task "${id}" failed: empty edit prompt`)
            return
        }
        setPrompt(null)
        track({ text: "requesting edit of task", id }, requestEdit(log, id, text)).then(() => {
            promptDrafts.current.delete(id)
            setNotice(`edit of task "${id}" requested`)
        }).catch((err: unknown) => {
            promptDrafts.current.set(id, { text, pos })
            setNotice(`requesting edit of task "${id}" failed: ${err instanceof Error ? err.message : String(err)}`)
        })
    }
    return { startPrompt, startRequest, cancelPrompt, submitPrompt }
}

/*  the state of the terminal board (resp. with a task id, of the
    task viewer): all state, the derived values, and the actions  */
export const useBoardState = (log: Log, initial: Board, relay?: string, watched?: string) => {
    const { exit, suspendTerminal } = useApp()
    const { columns, rows } = useWindowSize()
    const [ all,     setBoard   ] = React.useState<Board>(initial)
    const [ surface, setSurface ] = React.useState<Surface>(() => BoardState.load().tui)
    const [ view,    setView    ] = React.useState<SurfaceView>(() => watched !== undefined ? "lanes" : surface.view)
    const [ filter,  setFilter  ] = React.useState("")
    const [ typing,  setTyping  ] = React.useState(false)

    /*  the shown board: all tasks reduced onto the ones matching the filter
        query (plus, in the graph view, their direct dependencies as context,
        and optionally without the standalone tasks)  */
    const board = React.useMemo(() => {
        const found = filterBoard(all, filter, view === "graph")
        return view === "graph" && !surface.standalone ? dropStandalone(found) : found
    }, [ all, filter, view, surface.standalone ])
    const [ sel,     setSel     ] = React.useState<Sel>(() => relocate(board, { g: 0, l: 0, id: "" }, surface))
    const [ dialog,  setDialog  ] = React.useState<{ id: string, tab: number, first: number, scrolls: Record<number, number> } | null>(
        watched !== undefined ? { id: watched, tab: 0, first: 0, scrolls: {} } : null)
    const [ plan,    setPlan    ] = React.useState<{ id: string, parts: PlanParts, before?: PlanParts } | null>(null)
    const [ files,   setFiles   ] = React.useState<Map<string, Buffer | Error>>(new Map())
    const [ first,   setFirst   ] = React.useState(0)
    const [ scroll,  setScroll  ] = React.useState({ x: 0, y: 0 })
    const [ layout,  setLayout  ] = React.useState<{ board: Board, graph: GraphLayout, titles: boolean } | null>(null)
    const [ flowLayout, setFlowLayout ] = React.useState<{ key: string, graph: GraphLayout } | null>(null)
    const [ flowSel, setFlowSel ] = React.useState("")
    const followed = React.useRef("")
    const [ notice,  setNotice  ] = React.useState<string | null>(null)
    const [ carry,   setCarry   ] = React.useState<Carry | null>(null)
    const [ cycle,   setCycle   ] = React.useState<TaskFormat.TaskLifecycle | null>(null)
    const [ confirm, setConfirm ] = React.useState<{ id: string, yes: boolean } | null>(null)
    const [ transfer, setTransfer ] = React.useState<{ id: string, at: string } | null>(null)
    const [ prompt,  setPrompt  ] = React.useState<PromptState | null>(null)
    const [ assign,  setAssign  ] = React.useState<AssignState | null>(null)
    const [ store,   setStore   ] = React.useState<StoreState | null>(null)
    const [ relayed, setRelayed ] = React.useState<AgentsState | null | undefined>(undefined)
    const [ usage,   setUsage   ] = React.useState<Awaited<ReturnType<typeof Task.listUsage>> | null>(null)
    const [ range,   setRange   ] = React.useState<StatsRange>("total")
    const [ grow,    setGrow    ] = React.useState(false)
    const editing = React.useRef(false)
    const drafts  = React.useRef(new Map<string, string>())

    /*  the busy popup of slow task store operations  */
    const { busy, busyTick, track } = useBusy()

    /*  the rendered boxes for the mouse hit-testing  */
    const { cardBoxes, laneBoxes, groupBoxes, headBoxes, agentBoxes, rangeBoxes, graphView, cardRef, laneRef, groupRef, headRef, agentRef, rangeRef } = useHitBoxes()

    /*  report mouse clicks while the board runs and mouse support is enabled
        (disabling it gives the regular text selection of the terminal back)  */
    const [ mouse, setMouse ] = React.useState(true)
    const mouseOn = React.useRef(true)
    React.useEffect(() => {
        mouseOn.current = mouse
        mouseReporting(mouse)
        return () => {
            mouseReporting(false)
        }
    }, [ mouse ])

    /*  the last left click (cell and time), for detecting double clicks  */
    const lastClick = React.useRef<{ x: number, y: number, at: number } | null>(null)

    /*  fetch the task lifecycle model (for checking the moves of tasks)
        whenever the board and hence possibly its lifecycle mode changes  */
    React.useEffect(() => {
        let live = true
        Task.lifecycle(log).then((lifecycle) => {
            if (live)
                setCycle(lifecycle)
        }).catch((err: unknown) => {
            log.write("warning", `board: loading lifecycle failed: ${err instanceof Error ? err.message : String(err)}`)
        })
        return () => {
            live = false
        }
    }, [ log, all ])

    /*  persist the shown view for the next start of the terminal board  */
    React.useEffect(() => {
        if (watched !== undefined)
            return
        BoardState.setView("tui", view).catch((err: unknown) => {
            log.write("warning", `board: persisting view failed: ${err instanceof Error ? err.message : String(err)}`)
        })
    }, [ log, view ])

    /*  auto-clear a status notice after 5 seconds  */
    React.useEffect(() => {
        if (notice === null)
            return
        const timer = setTimeout(() => {
            setNotice(null)
        }, 5 * 1000)
        return () => {
            clearTimeout(timer)
        }
    }, [ notice ])

    /*  drop a carried task if it vanished or changed its status in the meantime  */
    React.useEffect(() => {
        if (carry !== null && all.cards.get(carry.id)?.status !== carry.from) {
            setCarry(null)
            setNotice(`moving task "${carry.id}" cancelled: task changed in the meantime`)
        }
    }, [ all, carry ])

    /*  close the transfer popup if its task vanished in the meantime  */
    React.useEffect(() => {
        if (transfer !== null && !all.cards.has(transfer.id)) {
            setTransfer(null)
            setNotice(`transferring task "${transfer.id}" cancelled: task vanished in the meantime`)
        }
    }, [ all, transfer ])

    /*  close the assign popup if its task vanished in the meantime  */
    React.useEffect(() => {
        if (assign !== null && !all.cards.has(assign.id)) {
            setAssign(null)
            setNotice(`assigning task "${assign.id}" cancelled: task vanished in the meantime`)
        }
    }, [ all, assign ])

    /*  close the prompt popup if its task vanished in the meantime  */
    React.useEffect(() => {
        if (prompt !== null && !all.cards.has(prompt.id)) {
            setPrompt(null)
            setNotice(`editing task "${prompt.id}" by prompt cancelled: task vanished in the meantime`)
        }
    }, [ all, prompt ])

    /*  quit the task viewer once its dialog is closed, resp. with a warning once
        its task vanished (except while an edit may rename it, which the dialog follows)  */
    const seen = React.useRef("")
    React.useEffect(() => {
        if (watched === undefined)
            return
        if (dialog === null)
            exit()
        else if (all.cards.has(dialog.id))
            seen.current = dialog.id
        else if (seen.current === dialog.id && !editing.current) {
            log.write("warning", `board: task "${dialog.id}" no longer exists`)
            exit()
        }
    }, [ all, dialog?.id ])

    /*  remember the box of every graph node for the spatial navigation and the scrolling  */
    const places = React.useMemo(() => placesOf(layout?.graph), [ layout ])

    /*  follow changes of the task storage and of the lifecycle mode,
        and the kind and connection state of the task store
        (in the background, i.e. without the busy popup)  */
    React.useEffect(() => {
        const refresh = async () => {
            setBoard(await buildBoard(log))
        }
        const stop = watchTasks(log, refresh, setStore)
        return () => {
            stop().catch((err: unknown) => {
                log.write("warning", `board: stopping task watcher failed: ${err instanceof Error ? err.message : String(err)}`)
            })
        }
    }, [ log ])

    /*  follow the agents passed by the agent relay (if any, else null, and undefined until
        known), where the agents view and the agent graph fall back to the lanes view without
        an agent relay, and where, outside of them, a frame of the agent relay is taken over only
        if it visibly changes the agents there (and not on a mere heartbeat or on new
        processing log lines), in order to not needlessly re-render the board, while the
        latest frame is taken over as soon as the agents view or the agent graph is entered  */
    const viewRef   = React.useRef(view)
    viewRef.current = view
    const latest    = React.useRef<AgentsState | null | undefined>(undefined)
    React.useEffect(() => {
        return watchAgents(log, relay, (next) => {
            latest.current = next
            setRelayed((prev) => viewRef.current === "agents" || viewRef.current === "flow"
                || agentsDigest(prev) !== agentsDigest(next) ? next : prev)
        })
    }, [ log, relay ])
    React.useEffect(() => {
        if ((view === "agents" || view === "flow") && latest.current !== undefined)
            setRelayed(latest.current)
    }, [ view ])
    const agents  = relayed ?? null
    const working = React.useMemo(() => busyAgents(agents), [ agents ])
    React.useEffect(() => {
        if ((view === "agents" || view === "flow") && relayed === null)
            setView("lanes")
    }, [ view, relayed ])

    /*  cycle (forward or backward) through the views: lanes, graph, stats, and (with an agent relay) agents and flow  */
    const cycleView = (back = false): void => {
        const views = viewOrder(agents !== null)
        setView(views[(views.indexOf(view) + (back ? views.length - 1 : 1)) % views.length])
    }

    /*  the agent graph of the agents (with the lifecycle states placed as in the lanes), laid out
        only whenever its structure changes (and not on a mere change of the contents of its cards),
        with the selected agent card kept valid  */
    const flow    = React.useMemo((): Flow => flowOf(agents?.agents ?? [], all.groups), [ agents, all ])
    const flowKey = JSON.stringify([ [ ...flow.cards.keys() ], flow.states, flow.edges ])
    React.useEffect(() => {
        if (view !== "flow" || flowLayout?.key === flowKey)
            return
        let live = true
        layoutFlow(flow, "cell").then((g) => {
            if (live)
                setFlowLayout({ key: flowKey, graph: g })
        }).catch((err: unknown) => {
            log.write("warning", `board: agent graph layout failed: ${err instanceof Error ? err.message : String(err)}`)
        })
        return () => {
            live = false
        }
    }, [ log, view, flowKey ])
    React.useEffect(() => {
        if (!flow.cards.has(flowSel) && !flow.states.some((s) => flowState(s) === flowSel) && flow.cards.size > 0)
            setFlowSel(flow.cards.keys().next().value!)
    }, [ flow, flowSel ])
    const flowPlaces = React.useMemo(() => placesOf(flowLayout?.graph), [ flowLayout ])

    /*  fetch the AI usage of all tasks whenever the statistics view is shown or the board
        changes, but only while the statistics view is shown (as each fetching loads all
        plans), and once known in the background, i.e. without the busy popup  */
    React.useEffect(() => {
        if (view !== "stats")
            return
        let live = true
        const load = Task.listUsage(log)
        const run  = usage === null ? track({ text: "loading usage of tasks" }, load) : load
        run.then((next) => {
            if (live)
                setUsage(next)
        }).catch((err: unknown) => {
            log.write("warning", `board: loading usage failed: ${err instanceof Error ? err.message : String(err)}`)
        })
        return () => {
            live = false
        }
    }, [ log, all, view ])

    /*  the statistics of the shown tasks within the time range (while the statistics view is shown),
        with their effort on the configured scale (re-read on each change of the board)  */
    const stats = React.useMemo(() =>
        view === "stats" ? statsOf(board, all, usage ?? new Map(), range, effortScale(log)) : null, [ log, board, all, usage, view, range ])

    /*  step the time range of the statistics to the previous or next one (without wrapping around)  */
    const stepRange = (delta: number): void => {
        const k = statsRanges.indexOf(range) + delta
        if (k >= 0 && k < statsRanges.length)
            setRange(statsRanges[k])
    }

    /*  fetch the plan (with its attachments) of the read dialog whenever it is opened or the board changes
        (the latter in the background, i.e. without the busy popup), together with loading the
        syntax highlighter of YAML or JSON attachments (on the first opening only), where a
        change with a shown effect remembers its predecessor for the diff of the read dialog,
        and where closing the dialog forgets the plan, as its changes are followed only while open  */
    const dialogId  = dialog?.id
    const dialogTab = dialog?.tab ?? 0
    React.useEffect(() => {
        if (dialogId === undefined) {
            setPlan(null)
            return
        }
        let live = true
        const load = Promise.all([ Task.parts(log, dialogId), Task.attachments(log, dialogId), dataLoad() ])
        const run  = plan?.id === dialogId ? load : track({ text: "loading task", id: dialogId }, load)
        run.then(([ parts, atts ]) => {
            if (live)
                setPlan((prev) => {
                    const next = parts === null ? null : { ...parts, atts }
                    const same = prev?.id === dialogId && next !== null
                    return { id: dialogId, parts: next, before: !same ? undefined : planChanged(prev.parts, next) ? prev.parts : prev.before }
                })
        }).catch((err: unknown) => {
            log.write("warning", `board: loading plan failed: ${err instanceof Error ? err.message : String(err)}`)
            if (live)
                setPlan({ id: dialogId, parts: err instanceof Error ? err : new Error(String(err)) })
        })
        return () => {
            live = false
        }
    }, [ log, all, dialogId ])

    /*  fetch the file content of the attachment of the selected tab, whenever the tab is selected or the plan changes
        (the latter in the background, i.e. without the busy popup)  */
    React.useEffect(() => {
        if (plan === null || plan.id !== dialogId)
            return
        const { id, parts } = plan
        if (parts === undefined || parts === null || parts instanceof Error)
            return
        const tab = Math.min(dialogTab, parts.atts.length)
        if (tab === 0 || parts.atts[tab - 1].file === undefined)
            return
        const key = `${id}:${tab}`
        let live = true
        const load = Task.attachmentContent(log, id, tab - 1)
        const run  = files.has(key) ? load : track({ text: "loading attachment of task", id }, load)
        run.then((content) =>
            content?.content ?? new Error("no such attachment content")
        ).catch((err: unknown) =>
            err instanceof Error ? err : new Error(String(err))
        ).then((content) => {
            if (live)
                setFiles(new Map([[ key, content ]]))
        })
        return () => {
            live = false
        }
    }, [ log, plan, dialogId, dialogTab ])

    /*  lay out the dependency graph whenever it is shown, the board changes,
        the showing of task titles is toggled, or the window width changes
        (as every task box gets a fixed quarter of the graph viewport width)  */
    const graphTitles = surface.titles
    const graphNodeW  = Math.max(12, Math.floor((columns - 6) / 4))
    React.useEffect(() => {
        if (view !== "graph")
            return
        let live = true
        layoutGraph(board, "cell", graphTitles, graphNodeW).then((g) => {
            if (live)
                setLayout({ board, graph: g, titles: graphTitles })
        }).catch((err: unknown) => {
            log.write("warning", `board: graph layout failed: ${err instanceof Error ? err.message : String(err)}`)
        })
        return () => {
            live = false
        }
    }, [ log, board, view, graphTitles, graphNodeW ])

    /*  toggle a minimized lane or a collapsed phase (resp. multiple at once) of the TUI surface  */
    const toggle = (list: SurfaceList, entry: string | string[]): void => {
        BoardState.toggle("tui", list, entry).then((state) => {
            setSurface(state.tui)
        }).catch((err: unknown) => {
            log.write("warning", `board: toggling ${list} failed: ${err instanceof Error ? err.message : String(err)}`)
        })
    }

    /*  run $EDITOR on a text in a temporary file, handing the terminal over
        to the editor, and return the edited text  */
    const runEditor = async (name: string, text: string): Promise<string> => {
        const dir  = await fs.promises.mkdtemp(path.join(os.tmpdir(), "ase-task-"))
        const file = path.join(dir, `${name}.md`)
        try {
            await fs.promises.writeFile(file, text, "utf8")

            /*  run $EDITOR through the shell (to support values with arguments or
                quoting), passing the file via the environment to avoid quoting it  */
            const editor = (process.env.EDITOR ?? "").trim() || "vi"
            const ref    = process.platform === "win32" ? "\"%ASE_TASK_FILE%\"" : "\"$ASE_TASK_FILE\""
            await suspendTerminal(async () => {
                mouseReporting(false)

                /*  stop the read of stdin still pending from Ink, which only removes its
                    listener, as it else takes the next input away from the editor and
                    passes it to the board afterwards (a pause in non-flowing mode does
                    not emit the event on which Node stops reading, and the stop is deferred)  */
                process.stdin.emit("pause")
                await new Promise((resolve) => { process.nextTick(resolve) })
                try {
                    await execa(`${editor} ${ref}`, { shell: true, stdio: "inherit", env: { ASE_TASK_FILE: file } })
                }
                finally {
                    mouseReporting(mouseOn.current)
                }
            })
            return await fs.promises.readFile(file, "utf8")
        }
        finally {
            await fs.promises.rm(dir, { recursive: true, force: true })
        }
    }

    /*  edit a task with $EDITOR; a draft which failed to save is kept and
        offered again on the next edit of the same task  */
    const edit = async (id: string): Promise<void> => {
        const src = await track({ text: "loading task", id }, Task.source(log, id))
        if (src === null) {
            setNotice(`task "${id}" no longer exists`)
            return
        }
        const text = await runEditor(id, drafts.current.get(id) ?? src.text)
        if (text === src.text) {
            drafts.current.delete(id)
            setNotice(`task "${id}" unchanged`)
            return
        }
        try {
            /*  conditionally save with the entity tag, to refuse overwriting changes
                made meanwhile by others (e.g. an agent or the web board)  */
            const { id: next, warning } = await track({ text: "saving task", id }, saveTask(log, id, text, src.tag))
            drafts.current.delete(id)
            if (next !== id) {
                setSel((s) => s.id === id ? { ...s, id: next } : s)
                setDialog((d) => d?.id === id ? { ...d, id: next } : d)
            }
            setNotice((next !== id ? `task "${id}" saved and renamed to "${next}"` : `task "${id}" saved`) +
                (warning !== "" ? ` (${warning})` : ""))
        }
        catch (err: unknown) {
            if (err instanceof TaskConflict) {
                if (err.tag === null) {
                    drafts.current.delete(id)
                    setNotice(`task "${id}" was deleted meanwhile (edit discarded)`)
                }
                else {
                    drafts.current.set(id, text)
                    setNotice(`task "${id}" was changed meanwhile (press "e" to re-edit and overwrite)`)
                }
                return
            }
            drafts.current.set(id, text)
            const msg = err instanceof Error ? err.message : String(err)
            setNotice(`saving task "${id}" failed: ${msg} (press "e" to re-edit)`)
        }
    }

    /*  create a new task with $EDITOR on its pre-filled text, under the id of
        its "Id:" key; an unchanged pre-filled text creates no task, and a text which
        failed to save is kept as a draft (under the empty id) for the next new task,
        where even an unchanged draft is created again, while an emptied text
        discards the draft (and any new task)  */
    const create = async (): Promise<void> => {
        const draft = drafts.current.get("")
        const orig  = draft ?? await track<string>({ text: "preparing new task" },
            Task.lifecycle(log).then((lifecycle) => newTaskText(log, all, lifecycle)))
        const text  = await runEditor("new-task", orig)
        if ((draft === undefined && text === orig) || text.trim() === "") {
            drafts.current.delete("")
            setNotice(draft !== undefined ? "new task draft discarded" : "new task discarded")
            return
        }
        const id = TaskFormat.taskTextId(text)
        try {
            const warning = await track({ text: "creating task", id }, createTask(log, id, text))
            drafts.current.delete("")
            setSel((s) => ({ ...s, id }))
            setNotice(`task "${id}" created` + (warning !== "" ? ` (${warning})` : ""))
        }
        catch (err: unknown) {
            drafts.current.set("", text)
            const msg = err instanceof Error ? err.message : String(err)
            setNotice(`creating task failed: ${msg} (press "N" to re-edit, or empty it to discard)`)
        }
    }

    /*  delete a task (after its confirmation), closing its read dialog
        (in the task viewer only once it vanished, as closing it quits the process)  */
    const remove = (id: string): void => {
        if (dialog?.id === id && watched === undefined)
            setDialog(null)
        track({ text: "deleting task", id }, Task.delete(log, id)).then((existed) => {
            setNotice(existed ? `task "${id}" deleted` : `task "${id}" no longer exists`)
        }).catch((err: unknown) => {
            setNotice(`deleting task "${id}" failed: ${err instanceof Error ? err.message : String(err)}`)
        })
    }

    /*  transfer a task (from its popup) to a state, where its current state cancels  */
    const transferTo = (id: string, to: string): void => {
        setTransfer(null)
        if (to === all.cards.get(id)?.status) {
            setNotice(`transferring task "${id}" cancelled`)
            return
        }
        track({ text: "moving task", id, suffix: `to ${to}` }, Task.setStatus(log, id, to)).then((result) => {
            setNotice(`task "${id}" moved from ${result.from} to ${result.to}`)
        }).catch((err: unknown) => {
            setNotice(`moving task "${id}" failed: ${err instanceof Error ? err.message : String(err)}`)
        })
    }

    /*  open the assign popup of a task, prefilled with its assignee, suggesting the users of
        "project.users" (else the current user) and the assignable agents present at the agent relay  */
    const startAssign = (id: string): void => {
        const card = all.cards.get(id)
        if (card === undefined)
            return
        let users: string[]
        try {
            users = Task.users(log)
        }
        catch (err: unknown) {
            setNotice(`assigning task "${id}" failed: ${err instanceof Error ? err.message : String(err)}`)
            return
        }
        const self    = userId()
        const present = (latest.current ?? agents)?.agents.filter(assignable).map((a) => a.name) ?? []
        const choices = assignOptions(users.length > 0 ? users : [ self ], present)
        setAssign({ id, name: card.assignee, typed: "", choices, self, strict: users.length > 0 })
    }

    /*  assign a task (from its popup) to an assignee ("me" for the current user, and
        empty or "none" to unassign it), where an unknown assignee is assigned with a warning  */
    const assignTo = (id: string, name: string): void => {
        setAssign(null)
        const to = name.trim() === "me" ? userId() : name.trim()
        const op = Task.checkAssignee(log, to).then(async (warning) =>
            ({ warning, from: await Task.assign(log, id, to === "" || to === "none" ? null : to) }))
        track({ text: "assigning task", id, suffix: `to ${to === "" ? "none" : to}` }, op).then(({ warning, from }) => {
            setNotice(`task "${id}" assigned from "${from || "(nobody)"}" to "${to === "" || to === "none" ? "(nobody)" : to}"` +
                (warning !== "" ? ` -- warning: ${warning}` : ""))
        }).catch((err: unknown) => {
            setNotice(`assigning task "${id}" failed: ${err instanceof Error ? err.message : String(err)}`)
        })
    }

    /*  drop a carried task onto a lane state, keeping it selected  */
    const drop = (id: string, to: string): void => {
        setCarry(null)
        track({ text: "moving task", id, suffix: `to ${to}` }, Task.setStatus(log, id, to)).then((result) => {
            setSel({ g: sel.g, l: sel.l, id })
            setNotice(`task "${id}" moved from ${result.from} to ${result.to}`)
        }).catch((err: unknown) => {
            setNotice(`moving task "${id}" failed: ${err instanceof Error ? err.message : String(err)}`)
        })
    }

    /*  edit an existing task, or create a new one (without id)  */
    const startEdit = (id: string | null) => {
        if (editing.current)
            return
        editing.current = true
        setNotice(null)
        const run = id !== null ? edit(id) : create()
        run.catch((err: unknown) => {
            setNotice(`${id !== null ? `editing task "${id}"` : "creating task"} failed: ${err instanceof Error ? err.message : String(err)}`)
        }).finally(() => {
            editing.current = false
        })
    }

    /*  the token of the pending loading of the prompt of an edit request, invalidated by every
        later loading and every change of the popups, the read dialog, the selection, or the view
        (so a slowly loaded prompt never opens its popup over another one or for another task)  */
    const promptLoad = React.useRef(0)
    React.useEffect(() => {
        promptLoad.current++
    }, [ confirm, transfer, assign, prompt, dialog?.id, sel.id, view ])

    /*  the actions of the prompt popup (with the drafts of its prompts and requests, per task)  */
    const { startPrompt, startRequest, cancelPrompt, submitPrompt } =
        usePromptActions({ log, all, cycle, agents, prompt, setPrompt, setNotice, track, promptLoad })

    /*  toggle a flag (task titles, key hints, or standalone tasks) of the TUI surface  */
    const toggleFlag = (flag: SurfaceFlag): void => {
        BoardState.toggleFlag("tui", flag).then((state) => {
            setSurface(state.tui)
        }).catch((err: unknown) => {
            log.write("warning", `board: toggling ${flag} failed: ${err instanceof Error ? err.message : String(err)}`)
        })
    }

    /*  keep the selection valid on every board, surface, or view change
        (the graph view shows all nodes, so it ignores minimized lanes and collapsed phases)  */
    React.useEffect(() => {
        setSel((s) => relocate(board, s, view === "graph" ? { ...surface, minimized: [], collapsed: [] } : surface))
    }, [ board, surface, view ])

    /*  the selected lane is grown to the full board only while it is neither
        minimized nor within a collapsed phase (else it shrinks back for good)  */
    const growable = board.groups[sel.g] !== undefined
        && !surface.collapsed.includes(board.groups[sel.g].title)
        && !surface.minimized.includes(board.groups[sel.g].lanes[sel.l]?.status ?? "")
    const grown    = grow && growable
    React.useEffect(() => {
        if (grow && !growable)
            setGrow(false)
    }, [ grow, growable ])

    /*  the heights of the header, footer, and board area, and the inner board width  */
    const headH  = 3
    const footH  = surface.keys ? (view === "agents" || view === "stats" || view === "flow" ? 5 : view === "lanes" ? 7 : 6) : 3
    const boardH = rows - headH - footH
    const innerW = columns - 2

    /*  the agents view: its agents, the selected one, and the scrolled processing log of the latter  */
    const { agentList, agentIdx, agent, agentOp, logLines, logH, logFirst, logMax, selectAgent, scrollLog, focusAgent } =
        useAgentsView(agents, columns, boardH)

    /*  the tabs of the read dialog, the lines of its selected tab (clamped to
        the existing tabs), and the maximum scroll offset of these lines  */
    const dialogW     = watched !== undefined ? columns : Math.min(columns - 2, DIALOG_WIDTH)
    const dialogParts = dialog !== null && plan?.id === dialog.id ? plan.parts : undefined
    const tabLabels   = dialogTabs(dialogParts)
    const dialogSel   = Math.min(dialogTab, tabLabels.length - 1)
    const dialogAtt   = dialogSel > 0 && dialogParts !== undefined && dialogParts !== null && !(dialogParts instanceof Error) ?
        dialogParts.atts[dialogSel - 1] : undefined
    const planDiff    = React.useMemo(() => plan?.before !== undefined ?
        planDiffLines(plan.before, plan.parts, plan.id, Math.max(1, dialogW - 5)) : null, [ plan, dialogW ])
    const dialogDiff  = planDiff !== null && dialogSel === 0 && plan?.id === dialog?.id
    const dialogLines = dialog === null ? [] : dialogAtt !== undefined ?
        attachmentLines(dialogAtt, files.get(`${dialog.id}:${dialogSel}`), Math.max(1, dialogW - 5)) :
        dialogDiff ? planDiff : planLines(dialogParts, dialog.id, Math.max(1, dialogW - 5))
    const dialogMax   = Math.max(0, dialogLines.length - (rows - DIALOG_CHROME))

    /*  drop the diff of the last change from the read dialog, so just the latest state remains  */
    const clearDiff = () => {
        setPlan((prev) => prev !== null ? { ...prev, before: undefined } : prev)
    }

    /*  the entries of the transfer popup of its (still existing) task  */
    const transferCard = transfer !== null ? all.cards.get(transfer.id) : undefined
    const transferList = transferCard !== undefined && cycle !== null ? transferEntries(all, cycle, transferCard) : []

    /*  scroll the selected tab of the read dialog  */
    const dialogScroll = (delta: number) => {
        if (dialog === null)
            return
        const scroll = Math.max(0, Math.min(dialogMax, (dialog.scrolls[dialogSel] ?? 0) + delta))
        setDialog({ ...dialog, scrolls: { ...dialog.scrolls, [dialogSel]: scroll } })
    }

    /*  determine the visible groups, following the selection
        (storing the derived state during rendering is idempotent)  */
    let fit = fitGroups(board.groups, surface.collapsed, Math.min(first, board.groups.length - 1), innerW)
    while (sel.g < fit.first)
        fit = fitGroups(board.groups, surface.collapsed, fit.first - 1, innerW)
    while (sel.g > fit.last && fit.first < board.groups.length - 1)
        fit = fitGroups(board.groups, surface.collapsed, fit.first + 1, innerW)
    if (fit.first !== first)
        setFirst(fit.first)

    /*  scroll the viewport of the graph (resp. the agent graph) so the box of the selected node
        stays visible, with the rows of a surrounding group frame (padding) above and below it,
        where the agent graph follows its selection only once per change of it, as its viewport
        can also be scrolled freely (to its state boxes, which are not selectable)  */
    const viewH  = boardH - 2
    const viewW  = innerW - 4
    let   { x, y } = scroll
    const box    = view === "graph" ? places.get(sel.id) : view === "flow" ? flowPlaces.get(flowSel) : undefined
    const graph  = view === "graph" ? layout?.graph : view === "flow" ? flowLayout?.graph : undefined
    const height = graph?.height
    const follow = `${view}:${flowSel}`
    if (box !== undefined && height !== undefined && (view !== "flow" || followed.current !== follow)) {
        const top    = Math.max(0, box.top - 2)
        const bottom = Math.min(height, box.bottom + 1)
        if (top < y)                       y = top
        if (bottom > y + viewH - 1)        y = bottom - viewH + 1
        if (box.bl < x)                    x = Math.max(0, box.bl - 2)
        if (box.br > x + viewW - 1)        x = box.br - viewW + 3
        if (view === "flow")
            followed.current = follow
    }
    if (view !== "flow")
        followed.current = ""

    /*  keep the viewport within the bounds of the shown graph, as the scroll position is shared
        by both graphs (and else, a position carried over from the other one may show only its tail)  */
    if (graph !== undefined) {
        x = Math.max(0, Math.min(Math.max(0, graph.width  + 2 - viewW), x))
        y = Math.max(0, Math.min(Math.max(0, graph.height + 1 - viewH), y))
    }
    if (x !== scroll.x || y !== scroll.y)
        setScroll({ x, y })

    /*  scroll the viewport of the agent graph freely (within its bounds)  */
    const scrollFlow = (dx: number, dy: number): void => {
        const g = flowLayout?.graph
        if (g === undefined)
            return
        setScroll((s) => ({
            x: Math.max(0, Math.min(Math.max(0, g.width  + 2 - viewW), s.x + dx)),
            y: Math.max(0, Math.min(Math.max(0, g.height + 1 - viewH), s.y + dy))
        }))
    }

    /*  the graph navigation order: by level, then by creation time  */
    const nodes = [ ...board.cards.values() ].sort((a, b) =>
        board.levels.get(a.id)! - board.levels.get(b.id)! || byCreation(a, b))

    /*  the board is dimmed while a dialog or popup is shown (incl. the busy popup)  */
    const dim = dialog !== null || confirm !== null || transfer !== null || assign !== null || prompt !== null || busy !== null

    /*  pulse the tasks of active lanes (or the active nodes of the graph, or the busy agents), but only while
        any of them (or its pulse) is actually visible, in order to not needlessly re-render the board  */
    const shown   = grown ? [ { ...board.groups[sel.g], lanes: [ board.groups[sel.g].lanes[sel.l] ] } ] : board.groups.slice(fit.first, fit.last + 1)
    const agentsBusy = (view === "agents" && agentList.some((a) => a.state === "busy"))
        || (view === "flow" && flowLayout !== null && [ ...flowLayout.graph.nodes.values() ].some((n) => flow.cards.get(n.id)?.busy === true
            && n.y >= y && n.y < y + viewH && n.x + n.w - 3 >= x && n.x + n.w - 3 < x + viewW))
    const pulsing = !dim && (agentsBusy || (view === "lanes" ?
        shown.some((g) => !surface.collapsed.includes(g.title)
            && g.lanes.some((l) => l.active && !surface.minimized.includes(l.status) && (board.lanes.get(l.status)?.length ?? 0) > 0)) :
        view === "graph" && layout !== null && [ ...layout.graph.nodes.values() ].some((n) => !layout.board.context.has(n.id)
            && toneOf(layout.board, layout.board.cards.get(n.id)!) === "active"
            && n.y >= y && n.y < y + viewH && n.x + n.w - 3 >= x && n.x + n.w - 3 < x + viewW)))
    const [ pulseTick, setPulseTick ] = React.useState(0)
    React.useEffect(() => {
        if (!pulsing)
            return
        const timer = setInterval(() => {
            setPulseTick((n) => (n + 1) % pulseFrames.length)
        }, 250)
        return () => {
            clearInterval(timer)
        }
    }, [ pulsing ])
    const pulse = pulsing ? pulseTick : -1

    /*  the wall-clock and the heartbeats of the agents (for the agents view and the agent graph)  */
    const { now, beatOf } = useBeats(agents, view)

    return {
        log, exit, watched, columns, rows, all, board, surface, view, setView, filter, setFilter, typing, setTyping,
        sel, setSel, dialog, setDialog, scroll, layout, notice, setNotice, carry, setCarry, cycle,
        confirm, setConfirm, transfer, setTransfer, assign, setAssign, prompt, setPrompt, mouse, setMouse, lastClick, grown, setGrow,
        cardBoxes, laneBoxes, groupBoxes, headBoxes, agentBoxes, rangeBoxes, cardRef, laneRef, groupRef, headRef, agentRef, rangeRef, boxAt, graphView,
        places, graphTitles, boardH, dialogW, tabLabels, dialogSel, dialogLines, dialogScroll, dialogDiff, clearDiff,
        transferCard, transferList, fit, viewH, viewW, x, y, nodes, dim, pulse, now, beatOf, store, busy, busyTick,
        agents, working, cycleView, agentList, agentIdx, agent, agentOp, logLines, logH, logFirst, logMax, selectAgent, scrollLog, stats, usage, range, setRange, stepRange,
        flow, flowLayout, flowSel, setFlowSel, flowPlaces, focusAgent, scrollFlow,
        toggle, toggleFlag, startEdit, startPrompt, startRequest, cancelPrompt, submitPrompt, remove, transferTo,
        startAssign, assignTo, drop
    }
}

/*  the state of the terminal board, as shared by its controller and view  */
export type BoardCtx = ReturnType<typeof useBoardState>

