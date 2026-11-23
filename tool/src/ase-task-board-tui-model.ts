/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import { reachableStates }                    from "./ase-task-board-core.js"
import type { Board, Card, Surface }          from "./ase-task-board-core.js"
import type * as TaskFormat                   from "./ase-task-format.js"

/*  the selection: group, lane, and card id ("" for a lane without card focus)  */
export type Sel = { g: number, l: number, id: string }

/*  the currently carried task (if any) and the lane states it can be moved to  */
export type Carry = { id: string, from: string, targets: Set<string> }

/*  the read dialog: its task, its selected tab, its first visible tab, and the scroll offsets of its tabs  */
export type DialogState = { id: string, tab: number, first: number, scrolls: Record<number, number> }

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

/*  the label of a busy task store operation: its text, the optional task id
    (rendered inverse), and an optional suffix  */
export type BusyLabel = { text: string, id?: string, suffix?: string }

/*  switch the mouse click reporting of the terminal (xterm, SGR encoding) on or off  */
export const mouseReporting = (on: boolean): void => {
    process.stdout.write(on ? "\x1b[?1000h\x1b[?1006h" : "\x1b[?1006l\x1b[?1000l")
}

