/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import React                                  from "react"
import { useApp, useWindowSize }              from "ink"

import type Log                               from "./ase-lib-log.js"
import { Task }                               from "./ase-task.js"
import { userId }                             from "./ase-service-otel-common.js"
import {
    buildBoard, watchTasks, BoardState, byCreation, toneOf,
    watchAgents, busyAgents, agentsDigest, assignable, dataLoad, viewOrder
}                                             from "./ase-task-board-core.js"
import type { Board, Surface, SurfaceFlag, SurfaceList, SurfaceView, StoreState, AgentsState } from "./ase-task-board-core.js"
import type * as TaskFormat                   from "./ase-task-format.js"
import { filterBoard, dropStandalone }        from "./ase-task-board-filter.js"
import { statsOf, statsRanges, effortScale }  from "./ase-task-board-stats.js"
import type { StatsRange }                    from "./ase-task-board-stats.js"
import { layoutGraph }                        from "./ase-task-board-graph.js"
import type { GraphLayout }                   from "./ase-task-board-graph.js"
import { flowOf, layoutFlow, flowState }      from "./ase-task-board-flow.js"
import type { Flow }                          from "./ase-task-board-flow.js"
import { fitGroups }                          from "./ase-task-board-tui-view.js"
import { dialogTabs, planLines, planChanged, planDiffLines, attachmentLines, DIALOG_CHROME, DIALOG_WIDTH } from "./ase-task-board-tui-popup.js"
import type { PlanParts }                     from "./ase-task-board-tui-popup.js"
import { pulseFrames }                        from "./ase-task-board-tui-style.js"
import { assignOptions, relocate, transferEntries, mouseReporting } from "./ase-task-board-tui-model.js"
import type { Sel, Carry, DialogState, PromptState, AssignState } from "./ase-task-board-tui-model.js"
import {
    useBusy, useHitBoxes, boxAt, placesOf, useAgentsView, useBeats, usePromptActions, useEditorActions
}                                             from "./ase-task-board-tui-hooks.js"

/*  the state of the terminal board (resp. with a task id, of the
    task viewer): all state, the derived values, and the actions  */
export const useBoardState = (log: Log, initial: Board, relay?: string, watched?: string) => {
    const { exit } = useApp()
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
    const [ dialog,  setDialog  ] = React.useState<DialogState | null>(
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

    /*  take over the surface state changed by other terminal boards of the project, except
        their view, as each terminal board keeps its own view (taken from the surface on start only)  */
    React.useEffect(() => BoardState.watch(log, (state) => {
        setSurface(state.tui)
    }), [ log ])

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

    /*  set (resp. with null reset) the height weights of lanes of the TUI surface  */
    const setHeights = (entries: Record<string, number | null>): void => {
        BoardState.setHeights("tui", entries).then((state) => {
            setSurface(state.tui)
        }).catch((err: unknown) => {
            log.write("warning", `board: resizing lanes failed: ${err instanceof Error ? err.message : String(err)}`)
        })
    }

    /*  the actions of the $EDITOR (with the drafts of the failed to be saved texts, per task)  */
    const { edit, create } = useEditorActions({ log, all, mouseOn, setSel, setDialog, setNotice, track })

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
        toggle, toggleFlag, setHeights, startEdit, startPrompt, startRequest, cancelPrompt, submitPrompt, remove, transferTo,
        startAssign, assignTo, drop
    }
}

/*  the state of the terminal board, as shared by its controller and view  */
export type BoardCtx = ReturnType<typeof useBoardState>

