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
import { useApp, measureElement }             from "ink"
import type { DOMElement }                    from "ink"

import type Log                               from "./ase-lib-log.js"
import { Task }                               from "./ase-task.js"
import { newTaskText, createTask, saveTask, TaskConflict, requestNames, requestPrompt } from "./ase-task-board-core.js"
import type { Board, SurfaceView, AgentsState } from "./ase-task-board-core.js"
import * as TaskFormat                        from "./ase-task-format.js"
import { editRefused, editPrompt, requestEdit, requestsOf } from "./ase-task-request.js"
import type { TaskRequests }                  from "./ase-task-request.js"
import type { StatsRange }                    from "./ase-task-board-stats.js"
import type { GraphLayout, Place }            from "./ase-task-board-graph.js"
import { runChat }                            from "./ase-task-chat-client.js"
import { parseTool }                          from "./ase-setup-common.js"
import { agentLogWidth, agentOpLines, agentOpHeight, AGENT_INFO_H } from "./ase-task-board-tui-view.js"
import { agentLogLines, agentLogKey }         from "./ase-task-board-tui-popup.js"
import { BUSY_DELAY, mouseReporting }         from "./ase-task-board-tui-model.js"
import type { Sel, DialogState, PromptState, BusyLabel } from "./ase-task-board-tui-model.js"

/*  the duration (in ms) the heart of an agent card stays filled after a received heartbeat  */
const BEAT_SHOWN_MS = 1000

/*  track the task store operations: once the oldest of the pending operations
    lasts longer than BUSY_DELAY, the modal busy popup shows it (with an animation tick)  */
export const useBusy = () => {
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
export const useHitBoxes = () => {
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
export const boxAt = <K extends string>(map: Map<K, DOMElement>, mx: number, my: number): K | undefined => {
    for (const [ key, el ] of map) {
        const m = measureElement(el)
        if (mx >= m.x && mx < m.x + m.width && my >= m.y && my < m.y + m.height)
            return key
    }
    return undefined
}

/*  the box of every node of a laid out graph, for the spatial navigation and the scrolling  */
export const placesOf = (graph: GraphLayout | undefined): Map<string, Place> => {
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
export const useAgentsView = (agents: AgentsState | null, columns: number, boardH: number) => {
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
export const useBeats = (agents: AgentsState | null, view: SurfaceView) => {
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
export const usePromptActions = (ctx: {
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

/*  the actions of the $EDITOR of the terminal board: editing an existing task and
    creating a new one, with the drafts of the failed to be saved texts, per task, and
    chatting about a task, which all hand the terminal over  */
export const useEditorActions = (ctx: {
    log:       Log
    all:       Board
    mouseOn:   React.RefObject<boolean>
    setSel:    React.Dispatch<React.SetStateAction<Sel>>
    setDialog: React.Dispatch<React.SetStateAction<DialogState | null>>
    setNotice: (notice: string | null) => void
    track:     ReturnType<typeof useBusy>["track"]
}) => {
    const { log, all, mouseOn, setSel, setDialog, setNotice, track } = ctx
    const { suspendTerminal } = useApp()

    /*  the drafts of the texts which failed to save, per task (under the empty id for a new task)  */
    const drafts = React.useRef(new Map<string, string>())

    /*  run a child process, handing the terminal over to it  */
    const handOver = async (run: () => Promise<unknown>): Promise<void> => {
        await suspendTerminal(async () => {
            mouseReporting(false)

            /*  stop the read of stdin still pending from Ink, which only removes its
                listener, as it else takes the next input away from the child process and
                passes it to the board afterwards (a pause in non-flowing mode does
                not emit the event on which Node stops reading, and the stop is deferred)  */
            process.stdin.emit("pause")
            await new Promise((resolve) => { process.nextTick(resolve) })
            try {
                await run()
            }
            finally {
                mouseReporting(mouseOn.current)
            }
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
            await handOver(() => execa(`${editor} ${ref}`, { shell: true, stdio: "inherit", env: { ASE_TASK_FILE: file } }))
            return await fs.promises.readFile(file, "utf8")
        }
        finally {
            await fs.promises.rm(dir, { recursive: true, force: true })
        }
    }

    /*  chat about a task with the agent tool of "$ASE_TOOL" (see "ase task chat"), handing the
        terminal over, and close the dialog of the task (resp. quit the task viewer) if the chat
        deleted or renamed it, as the vanish check of the task viewer pauses meanwhile  */
    const chat = async (id: string): Promise<void> => {
        const envTool = process.env.ASE_TOOL ?? ""
        const tool    = parseTool(envTool !== "" ? envTool : "claude")
        let   code    = null as number | null
        await handOver(async () => {
            code = await runChat(log, id, tool)
        })
        if (await Task.source(log, id) === null) {
            setDialog((d) => d?.id === id ? null : d)
            setNotice(`task "${id}" no longer exists`)
            return
        }
        setNotice(code === null ? `chat about task "${id}" detached (it keeps running)` :
            code === 0 ? `chat about task "${id}" ended` : `chat about task "${id}" ended with exit code ${code}`)
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
    return { edit, create, chat }
}

