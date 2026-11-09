/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import { measureElement }                     from "ink"
import type { Key }                           from "ink"

import { reachableStates, rowLanes }          from "./ase-task-board-core.js"
import { nearestPlace }                       from "./ase-task-board-graph.js"
import { groupItems, relocate, requestChoices, assignChoices } from "./ase-task-board-tui-model.js"
import type { BoardCtx, PromptFocus }         from "./ase-task-board-tui-model.js"
import { gridColumns }                        from "./ase-task-board-tui-view.js"
import {
    refSegs, tabFirst, tabLayout, confirmBox, transferBox, assignBox, promptBox, promptIgnored, promptNext, dropFirst,
    CONFIRM_BUTTON, DIALOG_CHROME, DIALOG_CLOSE, DROP_ROWS
}                                             from "./ase-task-board-tui-popup.js"

/*  handle a mouse press onto the deletion confirmation, the transfer popup, the assign
    popup, the prompt popup, or the read dialog, returning whether one of them was open  */
const handlePopupMouse = (ctx: BoardCtx, btn: number, mx: number, my: number): boolean => {
    const {
        columns, rows, all, dialog, setDialog, setNotice, confirm, setConfirm, transfer, setTransfer,
        assign, setAssign, assignTo, prompt, setPrompt, cancelPrompt, submitPrompt,
        dialogW, tabLabels, dialogSel, dialogScroll, transferList, remove, transferTo, watched
    } = ctx

    if (prompt !== null) {
        /*  a click onto a suggested request name of the drop-down picks it (and switches to the
            prompt, resp. to the request button if the prompt is ignored), a click onto the request
            or cancel button presses it, and a click onto the input box of the request name or the
            prompt (unless ignored) focuses it  */
        const box     = promptBox(columns, rows, prompt.request !== null)
        const choices = prompt.request !== null && prompt.focus === "name" ? requestChoices(prompt.request) : []
        const k       = dropFirst(choices, prompt.request?.name ?? "") + my - box.dropY - 1
        const inBox   = mx >= box.boxX && mx < box.boxX + box.boxW
        const inName  = mx >= box.boxX && mx < box.boxX + box.nameW
        if (btn !== 0)
            return true
        if (prompt.request !== null && inName && my > box.dropY && my <= box.dropY + Math.min(DROP_ROWS, choices.length)) {
            const picked = { ...prompt, request: { ...prompt.request, name: choices[k] } }
            setPrompt({ ...picked, focus: promptNext(picked) })
        }
        else if (my === box.buttonY && mx >= box.okX && mx < box.okX + box.okText.length)
            submitPrompt()
        else if (my === box.buttonY && mx >= box.noX && mx < box.noX + box.noText.length)
            cancelPrompt()
        else if (prompt.request !== null && inName && my >= box.nameY - 1 && my <= box.nameY + 1)
            setPrompt({ ...prompt, focus: "name" })
        else if (inBox && my >= box.promptY && my <= box.promptY + box.viewH + 1 && !promptIgnored(prompt))
            setPrompt({ ...prompt, focus: "prompt" })
        return true
    }
    if (confirm !== null) {
        /*  a click onto the " delete " or " cancel " button of the deletion confirmation  */
        const box = confirmBox(columns, rows)
        if (btn === 0 && my === box.row && mx >= box.deleteX && mx < box.deleteX + CONFIRM_BUTTON) {
            remove(confirm.id)
            setConfirm(null)
        }
        else if (btn === 0 && my === box.row && mx >= box.cancelX && mx < box.cancelX + CONFIRM_BUTTON) {
            setNotice(`deleting task "${confirm.id}" cancelled`)
            setConfirm(null)
        }
        return true
    }
    if (assign !== null) {
        /*  a click onto a suggested assignee of the drop-down assigns the task to it,
            while a click outside the popup cancels  */
        const box     = assignBox(columns, rows)
        const choices = assignChoices(assign)
        const k       = dropFirst(choices.map((choice) => choice.name), assign.name) + my - box.dropY - 1
        if (btn !== 0)
            return true
        if (mx < box.left || mx >= box.left + box.width || my < box.top || my >= box.top + box.height) {
            setNotice(`assigning task "${assign.id}" cancelled`)
            setAssign(null)
        }
        else if (mx >= box.nameX && mx < box.nameX + box.nameW
            && my > box.dropY && my <= box.dropY + Math.min(DROP_ROWS, choices.length))
            assignTo(assign.id, choices[k].name)
        return true
    }
    if (transfer !== null) {
        /*  a click onto a selectable entry of the transfer popup transfers
            the task to its state, while a click outside the popup cancels  */
        const box = transferBox(transferList.length, transferList.findIndex((e) => e.status === transfer.at), columns, rows)
        const k   = box.first + my - box.row
        if (btn !== 0)
            return true
        if (mx < box.left || mx >= box.left + box.width || my < box.top || my >= box.top + box.height) {
            setNotice(`transferring task "${transfer.id}" cancelled`)
            setTransfer(null)
        }
        else if (k >= box.first && k < box.first + box.viewH && transferList[k]?.ok)
            transferTo(transfer.id, transferList[k].status)
        return true
    }
    if (dialog !== null) {
        /*  a click onto the " X " of the header (the second dialog row) closes
            (the task viewer has no " X " at all, as only "q" quits it)  */
        const barX   = Math.floor((columns - dialogW) / 2) + 1
        const closeX = barX - 1 + dialogW - DIALOG_CLOSE
        if (btn === 0 && my === 1 && mx >= closeX && mx < closeX + 3 && watched === undefined)
            setDialog(null)
        else if (btn === 0 && my === 3 && mx >= barX && mx < barX + dialogW - 2) {
            /*  a click onto a predecessor or successor id (in the fourth dialog row) jumps to its task view  */
            let x = barX
            for (const seg of refSegs(all.pred.get(dialog.id) ?? [], all.succ.get(dialog.id) ?? [], () => undefined, dialogW - 2)) {
                if (mx >= x && mx < x + seg.text.length) {
                    if (seg.ref !== undefined && all.cards.has(seg.ref))
                        setDialog({ id: seg.ref, tab: 0, first: 0, scrolls: {} })
                    break
                }
                x += seg.text.length
            }
        }
        else if (btn === 0 && my === 5 && mx >= barX && mx < barX + dialogW - 2) {
            /*  a click onto the tab bar (the sixth dialog row) selects the clicked
                tab, or the previous/next tab on a scroll arrow, but never closes  */
            const lay  = tabLayout(tabLabels, dialog.first, dialogSel, dialogW - 2)
            const x    = mx - barX
            const item = lay.items.find((it) => x >= it.x && x < it.x + it.text.length)
            let   tab  = dialogSel
            if (item !== undefined)
                tab = item.index
            else if (x === 0 && lay.less)
                tab = dialogSel - 1
            else if (x === dialogW - 3 && lay.more)
                tab = dialogSel + 1
            if (tab !== dialogSel)
                setDialog({ ...dialog, tab, first: tabFirst(tabLabels, dialog.first, tab, dialogW - 4) })
        }
        else if (btn === 64 || btn === 65)
            dialogScroll(btn === 64 ? -3 : 3)
        return true
    }
    return false
}

/*  show the agents view with the (first) agent of an agent card of the agent graph selected  */
const showAgent = (ctx: BoardCtx, id: string): void => {
    const card = ctx.flow.cards.get(id)
    if (card === undefined)
        return
    ctx.focusAgent(card.agents[0].id)
    ctx.setView("agents")
}

/*  handle a mouse press (0-based column/row, button 0: left press,
    64/65: wheel up/down): a click selects the clicked task and a double click
    opens it, while a click onto its " X " closes an open task view, a click onto a
    predecessor/successor id jumps to its task view, and the wheel scrolls it  */
export const handleMouse = (ctx: BoardCtx, btn: number, mx: number, my: number): void => {
    const {
        board, surface, view, setFilter, typing, setTyping, sel, setSel, setDialog, scroll, layout,
        carry, setCarry, lastClick, cardBoxes, laneBoxes, groupBoxes, headBoxes, agentBoxes, boxAt, graphView, toggle, grown, setGrow,
        cycleView, agentList, agentIdx, selectAgent, scrollLog, rangeBoxes, setRange, flowLayout, setFlowSel, scrollFlow
    } = ctx
    if (handlePopupMouse(ctx, btn, mx, my))
        return

    /*  a click onto the view value of the header switches the view, a click
        onto the filter field starts typing into it (unless a task is moved),
        a click onto its clear button clears it, and any other click ends
        typing (keeping the filter query)  */
    const head = btn === 0 ? boxAt(headBoxes.current, mx, my) : undefined
    if (typing && head !== "filter")
        setTyping(false)
    if (head === "clear") {
        if (view !== "agents" && view !== "flow")
            setFilter("")
        return
    }
    if (head === "view") {
        setCarry(null)
        cycleView()
        return
    }

    /*  in the agents view, the wheel scrolls the log of the detail view
        and a click onto the card of an agent selects the agent  */
    if (view === "agents") {
        if (btn === 64 || btn === 65)
            scrollLog(btn === 64 ? -3 : 3)
        else if (btn === 0) {
            const id = boxAt(agentBoxes.current, mx, my)
            const k  = agentList.findIndex((agent) => agent.id === id)
            if (k >= 0 && k !== agentIdx)
                selectAgent(k - agentIdx)
        }
        return
    }
    if (head === "filter") {
        if (carry === null && view !== "flow")
            setTyping(true)
        return
    }
    if (view === "stats") {
        /*  a click onto a time range button of the statistics view selects the time range  */
        const range = btn === 0 ? boxAt(rangeBoxes.current, mx, my) : undefined
        if (range !== undefined)
            setRange(range)
        return
    }
    if ((btn === 64 || btn === 65) && view === "flow") {
        /*  the wheel scrolls the viewport of the agent graph  */
        scrollFlow(0, btn === 64 ? -3 : 3)
        return
    }
    if ((btn === 64 || btn === 65) && view === "lanes") {
        /*  the wheel over a lane scrolls it, by stepping the selection
            through its cards (entering the lane at its first card)  */
        const at = boxAt(laneBoxes.current, mx, my)
        if (at === undefined)
            return
        const [ g, l ] = at.split(":").map(Number)
        const lane = board.groups[g].lanes[l]
        const list = board.lanes.get(lane.status) ?? []
        if (list.length === 0 || surface.minimized.includes(lane.status) || surface.collapsed.includes(board.groups[g].title))
            return
        const idx  = sel.g === g && sel.l === l ? list.findIndex((c) => c.id === sel.id) : -1
        const next = idx < 0 ? 0 : Math.max(0, Math.min(list.length - 1, idx + (btn === 64 ? -1 : 1)))
        setSel({ g, l, id: list[next].id })
        return
    }
    if (btn !== 0)
        return

    /*  detect a double click: a second left click onto the same cell within 400ms  */
    const now    = Date.now()
    const last   = lastClick.current
    const double = last !== null && last.x === mx && last.y === my && now - last.at <= 400
    lastClick.current = double ? null : { x: mx, y: my, at: now }

    /*  in the agent graph, a click selects the agent card or state under it (mapped into
        the graph grid via the measured viewport origin), and a double click onto an agent
        card additionally shows the agents view with its (first) agent selected  */
    if (view === "flow") {
        if (flowLayout === null || graphView.current === null)
            return
        const m  = measureElement(graphView.current)
        const gx = mx - m.x + scroll.x
        const gy = my - m.y + scroll.y
        for (const n of flowLayout.graph.nodes.values())
            if (gx >= n.x && gx < n.x + n.w && gy >= n.y && gy < n.y + n.h) {
                setFlowSel(n.id)
                if (double)
                    showAgent(ctx, n.id)
            }
        return
    }

    /*  a click onto a lane outside its cards (and while moving a task, anywhere
        onto a lane) selects the lane, like PgUp/PgDn, where a double click onto the
        lane minimizes/maximizes it (resp. shrinks a grown lane, resp. expands its
        collapsed phase), while a click onto the title of a phase selects it, like ←/→,
        and a double click onto it collapses/expands it  */
    const card = view === "lanes" && carry === null ? boxAt(cardBoxes.current, mx, my) : undefined
    if (view === "lanes" && card === undefined) {
        const grp = boxAt(groupBoxes.current, mx, my)
        if (grp !== undefined && my === measureElement(groupBoxes.current.get(grp)!).y) {
            const g = Number(grp)
            if (double)
                toggle("collapsed", board.groups[g].title)
            else if (g !== sel.g) {
                const items = groupItems(board, g, surface)
                setSel(items.find((it) => it.l === sel.l) ?? items[0])
            }
            return
        }
        const at = boxAt(laneBoxes.current, mx, my)
        if (at !== undefined) {
            const [ g, l ] = at.split(":").map(Number)
            if (double && surface.collapsed.includes(board.groups[g].title))
                toggle("collapsed", board.groups[g].title)
            else if (double && grown)
                setGrow(false)
            else if (double)
                toggle("minimized", board.groups[g].lanes[l].status)
            const next = groupItems(board, g, surface).find((it) => it.l === l)
            if (next !== undefined && !(sel.g === g && sel.l === l))
                setSel(next)
        }
        return
    }
    if (carry !== null)
        return
    let hit: string | undefined
    if (view === "lanes")
        hit = card
    else if (layout !== null && graphView.current !== null) {
        /*  map the click into the graph grid via the measured viewport origin  */
        const m  = measureElement(graphView.current)
        const gx = mx - m.x + scroll.x
        const gy = my - m.y + scroll.y
        for (const n of layout.graph.nodes.values())
            if (gx >= n.x && gx < n.x + n.w && gy >= n.y && gy < n.y + n.h)
                hit = n.id
    }
    if (hit !== undefined && board.cards.has(hit)) {
        /*  a click selects the clicked task, a double click additionally opens its view  */
        setSel(relocate(board, { g: sel.g, l: sel.l, id: hit },
            view === "graph" ? { ...surface, minimized: [], collapsed: [] } : surface))
        if (double)
            setDialog({ id: hit, tab: 0, first: 0, scrolls: {} })
    }
}

/*  handle a key press onto the prompt popup  */
const handlePromptKey = (ctx: BoardCtx, prompt: NonNullable<BoardCtx["prompt"]>, input: string, key: Key): void => {
    const { setPrompt, cancelPrompt, submitPrompt } = ctx

    /*  operate the prompt popup: TAB resp. Shift+TAB switch the focus to the next resp.
        previous field (the request name of a request by prompt, the prompt unless ignored, and
        the request and cancel buttons), and ESC cancels in every field  */
    if (key.tab || key.escape) {
        if (key.escape)
            cancelPrompt()
        else {
            const fields = ([ "name", "prompt", "request", "cancel" ] as PromptFocus[])
                .filter((field) => (field !== "name" || prompt.request !== null) && (field !== "prompt" || !promptIgnored(prompt)))
            const i      = Math.max(0, fields.indexOf(prompt.focus))
            setPrompt({ ...prompt, focus: fields[(i + (key.shift ? fields.length - 1 : 1)) % fields.length] })
        }
        return
    }

    /*  press the focused button of the prompt popup: RETURN (or SPACE) presses it,
        and the left/right arrows switch between the request and cancel buttons  */
    if (prompt.focus === "request" || prompt.focus === "cancel") {
        if ((key.return || input === " ") && prompt.focus === "request")
            submitPrompt()
        else if (key.return || input === " ")
            cancelPrompt()
        else if (key.leftArrow || key.rightArrow)
            setPrompt({ ...prompt, focus: prompt.focus === "request" ? "cancel" : "request" })
        return
    }
    if (prompt.request !== null && prompt.focus === "name") {
        /*  type the request name of a request by prompt: RETURN switches to the prompt (resp. to
            the request button if the prompt is ignored), the
            up/down arrows cycle through the suggested request names of the drop-down (matching
            the request name as last typed), BACKSPACE removes the last character, and all
            other input of letters, digits, and dashes is appended (lower-cased)  */
        const request = prompt.request
        const choices = requestChoices(request)
        const name    = (value: string, typed = value) => setPrompt({ ...prompt, request: { ...request, name: value, typed } })
        if (key.return)
            setPrompt({ ...prompt, focus: promptNext(prompt) })
        else if ((key.upArrow || key.downArrow) && choices.length > 0) {
            const i = choices.indexOf(request.name)
            const n = choices.length
            name(choices[i < 0 ? (key.upArrow ? n - 1 : 0) : (i + (key.upArrow ? n - 1 : 1)) % n], request.typed)
        }
        else if (key.backspace || key.delete)
            name([ ...request.name ].slice(0, -1).join(""))
        else if (!key.ctrl && !key.meta && /^[A-Za-z0-9-]+$/.test(input))
            name(request.name + input.toLowerCase())
        return
    }

    /*  type the prompt of an edit request: RETURN requests the edit, Shift+RETURN
        (under the kitty keyboard protocol only), Alt+RETURN (under the kitty keyboard
        protocol, or where the terminal sends it as ESC+RETURN, e.g. with "Option as Meta"
        on macOS), and Ctrl+J (in every terminal, as a plain linefeed without the kitty
        keyboard protocol) insert a newline,
        the left/right arrows move the cursor by one character, HOME/END move it
        to the start/end, BACKSPACE removes the character before the cursor, DELETE
        removes the character at the cursor, and all other input (also pasted text,
        with its newlines kept and its other control characters turned into spaces)
        is inserted at the cursor  */
    const chars  = [ ...prompt.text ]
    const pos    = Math.max(0, Math.min(prompt.pos, chars.length))
    const insert = (text: string) => {
        const ins = [ ...text ]
        chars.splice(pos, 0, ...ins)
        setPrompt({ ...prompt, text: chars.join(""), pos: pos + ins.length })
    }
    if ((key.return && (key.shift || key.meta)) || (key.ctrl && input === "j"))
        insert("\n")
    else if (key.return)
        submitPrompt()
    else if (key.leftArrow || key.rightArrow)
        setPrompt({ ...prompt, pos: Math.max(0, Math.min(chars.length, pos + (key.leftArrow ? -1 : 1))) })
    else if (key.home || key.end)
        setPrompt({ ...prompt, pos: key.home ? 0 : chars.length })
    else if (key.backspace) {
        if (pos > 0) {
            chars.splice(pos - 1, 1)
            setPrompt({ ...prompt, text: chars.join(""), pos: pos - 1 })
        }
    }
    else if (key.delete) {
        if (pos < chars.length) {
            chars.splice(pos, 1)
            setPrompt({ ...prompt, text: chars.join(""), pos })
        }
    }
    else if (!key.ctrl && !key.meta && input !== "")
        insert(input.replace(/\r\n?/g, "\n").replace(/[^\P{Cc}\n]/gu, " "))
}

/*  handle a key press onto the deletion confirmation, the transfer popup, the assign
    popup, the prompt popup, or the filter field (outside of the read dialog)  */
const handlePopupKey = (ctx: BoardCtx, input: string, key: Key): void => {
    const {
        dialog, setFilter, typing, setTyping, setNotice, confirm, setConfirm,
        transfer, setTransfer, transferList, remove, transferTo, assign, setAssign, assignTo,
        prompt
    } = ctx

    /*  operate the prompt popup  */
    if (prompt !== null) {
        handlePromptKey(ctx, prompt, input, key)
        return
    }

    /*  answer the confirmation of a task deletion: "y" deletes, ESC cancels, the
        left/right arrows and TAB/Shift+TAB switch the selected button, RETURN
        presses it, and all other keys are ignored  */
    if (confirm !== null) {
        if (input === "y" || (key.return && confirm.yes)) {
            remove(confirm.id)
            setConfirm(null)
        }
        else if (key.escape || key.return) {
            setNotice(`deleting task "${confirm.id}" cancelled`)
            setConfirm(null)
        }
        else if (key.leftArrow || key.rightArrow || key.tab)
            setConfirm({ ...confirm, yes: !confirm.yes })
        return
    }

    /*  answer the transfer popup: the up/down arrows select the previous/next
        selectable state, RETURN transfers the task to it, ESC cancels, and all
        other keys are ignored  */
    if (transfer !== null) {
        if (key.upArrow || key.downArrow) {
            const step = key.upArrow ? -1 : 1
            for (let k = transferList.findIndex((e) => e.status === transfer.at) + step; k >= 0 && k < transferList.length; k += step)
                if (transferList[k].ok) {
                    setTransfer({ ...transfer, at: transferList[k].status })
                    break
                }
        }
        else if (key.return)
            transferTo(transfer.id, transfer.at)
        else if (key.escape) {
            setNotice(`transferring task "${transfer.id}" cancelled`)
            setTransfer(null)
        }
        return
    }

    /*  answer the assign popup: RETURN assigns the task to the assignee, ESC cancels, the
        up/down arrows cycle through the suggested assignees of the drop-down (matching the
        assignee as last typed), BACKSPACE removes the last character, and all other input
        (without control characters and commas) is appended  */
    if (assign !== null) {
        const choices = assignChoices(assign).map((choice) => choice.name)
        const name    = (value: string, typed = value) => setAssign({ ...assign, name: value, typed })
        if (key.return)
            assignTo(assign.id, assign.name)
        else if (key.escape) {
            setNotice(`assigning task "${assign.id}" cancelled`)
            setAssign(null)
        }
        else if ((key.upArrow || key.downArrow) && choices.length > 0) {
            const i = choices.indexOf(assign.name)
            const n = choices.length
            name(choices[i < 0 ? (key.upArrow ? n - 1 : 0) : (i + (key.upArrow ? n - 1 : 1)) % n], assign.typed)
        }
        else if (key.backspace || key.delete)
            name([ ...assign.name ].slice(0, -1).join(""))
        else if (!key.ctrl && !key.meta && /^[^\p{Cc},]+$/u.test(input))
            name(assign.name + input)
        return
    }

    /*  while typing into the filter field, all keys edit the filter query
        (applied live), until ENTER keeps it or ESC clears it  */
    if (typing && dialog === null) {
        if (key.return)
            setTyping(false)
        else if (key.escape) {
            setFilter("")
            setTyping(false)
        }
        else if (key.backspace || key.delete)
            setFilter((f) => f.slice(0, -1))
        else if (!key.ctrl && !key.meta && !/\p{Cc}/u.test(input))
            setFilter((f) => f + input)
    }
}

/*  handle a key press within the read dialog  */
const handleDialogKey = (ctx: BoardCtx, dialog: NonNullable<BoardCtx["dialog"]>, input: string, key: Key): void => {
    const { rows, setDialog, dialogW, tabLabels, dialogSel, dialogScroll, dialogDiff, clearDiff, startEdit, watched } = ctx
    const page = Math.max(1, rows - DIALOG_CHROME - 2)
    if (watched !== undefined ? input === "q" : key.escape || key.return)
        setDialog(null)
    else if (input === "e")
        startEdit(dialog.id)
    else if (input === "#" && dialogDiff)
        clearDiff()
    else if (key.leftArrow || key.rightArrow || key.tab) {
        const tab = Math.max(0, Math.min(tabLabels.length - 1, dialogSel + (key.leftArrow || (key.tab && key.shift) ? -1 : 1)))
        setDialog({ ...dialog, tab, first: tabFirst(tabLabels, dialog.first, tab, dialogW - 4) })
    }
    else if (key.upArrow)
        dialogScroll(-1)
    else if (key.downArrow)
        dialogScroll(1)
    else if (key.pageUp)
        dialogScroll(-page)
    else if (key.pageDown)
        dialogScroll(page)
}

/*  handle a key press within the lane view: moving and growing, else navigating  */
const handleLaneKey = (ctx: BoardCtx, input: string, key: Key): void => {
    const { columns, board, surface, sel, setSel, setNotice, carry, setCarry, cycle, drop, grown, setGrow, boardH } = ctx
    if (key.escape && carry !== null) {
        /*  cancel the move and return the selection to the task at its original position  */
        setCarry(null)
        setSel(relocate(board, { g: sel.g, l: sel.l, id: carry.id }, surface))
        setNotice(`moving task "${carry.id}" cancelled`)
        return
    }
    if (input === " ") {
        /*  pick up the selected task, determining all lanes whose state
            is directly or indirectly reachable from its current state  */
        if (carry === null) {
            const card = board.cards.get(sel.id)
            if (card === undefined)
                return
            if (cycle === null) {
                setNotice("task lifecycle model not yet loaded")
                return
            }
            const targets = new Set(reachableStates(board, cycle, card))
            setCarry({ id: card.id, from: card.status, targets })
            setGrow(false)
            return
        }

        /*  drop the carried task onto the selected lane, if reachable  */
        if (surface.collapsed.includes(board.groups[sel.g].title))
            return
        const to = board.groups[sel.g].lanes[sel.l].status
        if (to === carry.from) {
            setCarry(null)
            setNotice(`moving task "${carry.id}" cancelled`)
            return
        }
        if (!carry.targets.has(to)) {
            setNotice(`task "${carry.id}" cannot move from ${carry.from} to ${to}: not reachable in the lifecycle model`)
            return
        }
        drop(carry.id, to)
        return
    }
    if (input === "g") {
        /*  grow the selected lane to the full board, or shrink it back again  */
        if (carry !== null)
            return
        if (!grown && (surface.collapsed.includes(board.groups[sel.g].title)
            || surface.minimized.includes(board.groups[sel.g].lanes[sel.l].status)))
            setNotice("only a maximized lane of an expanded phase can grow")
        else
            setGrow(!grown)
        return
    }
    if (grown) {
        /*  within the grown lane, the arrows step through the grid of its cards,
            PgUp/PgDn step by (roughly) the visible rows, Home/End jump to the
            first/last card, ESC shrinks the lane, and the other lane keys are ignored  */
        if (key.escape) {
            setGrow(false)
            return
        }
        const list = board.lanes.get(board.groups[sel.g].lanes[sel.l].status) ?? []
        const cols = gridColumns(columns - 2)
        const page = cols * Math.max(1, Math.floor((boardH - 4) / (surface.titles ? 5 : 3)))
        const step = key.leftArrow ? -1 : key.rightArrow ? 1 : key.upArrow ? -cols : key.downArrow ? cols :
            key.pageUp ? -page : key.pageDown ? page : key.home ? -list.length : key.end ? list.length : 0
        const idx  = list.findIndex((c) => c.id === sel.id)
        if (step === 0 || list.length === 0 || (key.upArrow && idx >= 0 && idx < cols))
            return
        const next = idx < 0 ? 0 : Math.max(0, Math.min(list.length - 1, idx + step))
        setSel({ g: sel.g, l: sel.l, id: list[next].id })
        return
    }
    handleNavKey(ctx, input, key)
}

/*  handle a key press navigating the lanes and groups of the lane view  */
const handleNavKey = (ctx: BoardCtx, input: string, key: Key): void => {
    const { board, surface, sel, setSel, carry, toggle } = ctx
    if (input === "m" && !key.shift) {
        if (surface.collapsed.includes(board.groups[sel.g].title))
            return
        const lane = board.groups[sel.g].lanes[sel.l]
        toggle("minimized", lane.status)
        return
    }
    if (input === "c" && !key.shift) {
        toggle("collapsed", board.groups[sel.g].title)
        return
    }

    /*  collapse or expand the lane row of the selected lane in all expanded phases at once
        (under the kitty keyboard protocol, Shift+c arrives as "c" with the shift modifier)  */
    if (input === "C" || (input === "c" && key.shift)) {
        const row = rowLanes(board.groups, surface.collapsed, sel.l)
        if (row.length > 0)
            toggle("minimized", row)
        return
    }
    if (key.leftArrow || key.rightArrow) {
        const g = Math.max(0, Math.min(board.groups.length - 1, sel.g + (key.leftArrow ? -1 : 1)))
        if (g !== sel.g) {
            const items = groupItems(board, g, surface)
            setSel(items.find((it) => it.l === sel.l) ?? items[0])
        }
        return
    }
    if ((key.home || key.end) && carry === null) {
        /*  jump to the first or last item of the selected lane, scrolling it to its top or bottom  */
        const items = groupItems(board, sel.g, surface).filter((it) => it.l === sel.l)
        const next  = key.home ? items[0] : items[items.length - 1]
        if (next !== undefined)
            setSel(next)
        return
    }
    if ((key.upArrow || key.downArrow) && carry === null) {
        /*  within a collapsed phase, the items are the lanes themselves  */
        const items = groupItems(board, sel.g, surface)
        const idx   = items.findIndex((it) => it.l === sel.l && it.id === sel.id)
        const next  = items[Math.max(0, Math.min(items.length - 1, idx + (key.upArrow ? -1 : 1)))]
        if (next !== undefined)
            setSel(next)
        return
    }
    if (key.pageUp || key.pageDown || key.upArrow || key.downArrow) {
        /*  jump directly to the first item of the upper or lower lane of the group
            (while moving a task, also on up/down, as only the target lane matters)  */
        const up   = key.pageUp || key.upArrow
        const l    = Math.max(0, Math.min(board.groups[sel.g].lanes.length - 1, sel.l + (up ? -1 : 1)))
        const next = groupItems(board, sel.g, surface).find((it) => it.l === l)
        if (next !== undefined && l !== sel.l)
            setSel(next)
        return
    }
    if (key.tab) {
        /*  step through the lanes of the expanded phases lane row by lane row: first
            left/right through the phases, then wrap into the next/previous
            lane row (and at the very end/start around the board)  */
        const rows  = Math.max(...board.groups.map((g) => g.lanes.length))
        const lanes = [] as { g: number, l: number }[]
        for (let l = 0; l < rows; l++)
            board.groups.forEach((group, g) => {
                if (l < group.lanes.length && !surface.collapsed.includes(group.title))
                    lanes.push({ g, l })
            })
        if (lanes.length === 0)
            return
        const idx    = lanes.findIndex((p) => p.g === sel.g && p.l === sel.l)
        const target = idx < 0 ? lanes[key.shift ? lanes.length - 1 : 0] :
            lanes[(idx + (key.shift ? lanes.length - 1 : 1)) % lanes.length]
        const next   = groupItems(board, target.g, surface).find((it) => it.l === target.l)
        if (next !== undefined)
            setSel(next)
    }
}

/*  handle a key press  */
export const handleKey = (ctx: BoardCtx, input: string, key: Key): void => {
    const {
        exit, all, board, surface, view, setView, typing, setTyping, sel, setSel, dialog, setDialog,
        notice, setNotice, carry, setCarry, cycle, confirm, setConfirm, transfer, setTransfer, assign, startAssign,
        prompt, mouse, setMouse, places, nodes, toggleFlag, startEdit, startPrompt, startRequest, cycleView, selectAgent, scrollLog, logH, stepRange,
        flowSel, setFlowSel, flowPlaces, scrollFlow, viewH
    } = ctx
    if (notice !== null)
        setNotice(null)

    /*  answer the deletion confirmation, the transfer popup, the assign popup, the prompt popup, or the filter field  */
    if (confirm !== null || transfer !== null || assign !== null || prompt !== null || (typing && dialog === null)) {
        handlePopupKey(ctx, input, key)
        return
    }

    /*  toggle the mouse support in every view (under the kitty keyboard
        protocol, Shift+m arrives as "m" with the shift modifier)  */
    if (input === "M" || (input === "m" && key.shift)) {
        setMouse(!mouse)
        setNotice(mouse ? "mouse support disabled: regular text selection available" : "mouse support enabled")
        return
    }

    /*  request the deletion of a task in every view (under the kitty keyboard
        protocol, Shift+d arrives as "d" with the shift modifier)  */
    const target = dialog !== null ? dialog.id : view === "agents" || view === "stats" || view === "flow" ? "" : sel.id
    if ((input === "D" || (input === "d" && key.shift)) && target !== "" && carry === null) {
        setConfirm({ id: target, yes: false })
        return
    }

    /*  request the transfer of a task to another state in every view, starting
        at its current state (under the kitty keyboard protocol, Shift+t
        arrives as "t" with the shift modifier)  */
    if ((input === "T" || (input === "t" && key.shift)) && target !== "" && carry === null) {
        const card = all.cards.get(target)
        if (cycle === null)
            setNotice("task lifecycle model not yet loaded")
        else if (card !== undefined)
            setTransfer({ id: card.id, at: card.status })
        return
    }

    /*  request the assignment of a task in every view (under the kitty keyboard
        protocol, Shift+a arrives as "a" with the shift modifier)  */
    if ((input === "A" || (input === "a" && key.shift)) && target !== "" && carry === null) {
        startAssign(target)
        return
    }

    /*  request the edit of a task by a prompt in every view (under the kitty
        keyboard protocol, Shift+e arrives as "e" with the shift modifier)  */
    if ((input === "E" || (input === "e" && key.shift)) && target !== "" && carry === null) {
        startPrompt(target)
        return
    }

    /*  request a task by a prompt of any request name in every view (under the kitty
        keyboard protocol, Shift+r arrives as "r" with the shift modifier)  */
    if ((input === "R" || (input === "r" && key.shift)) && target !== "" && carry === null) {
        startRequest(target)
        return
    }
    if (dialog !== null) {
        handleDialogKey(ctx, dialog, input, key)
        return
    }
    if (input === "q") {
        exit()
        return
    }
    if (input === "/") {
        if (carry === null && view !== "agents" && view !== "flow")
            setTyping(true)
        return
    }
    /*  cycle the views forward (resp. backward with "V", which arrives as "v"
        with the shift modifier under the kitty keyboard protocol)  */
    if (input === "v" || input === "V") {
        setCarry(null)
        cycleView(input === "V" || key.shift)
        return
    }
    if (view === "agents") {
        /*  the arrows select an agent of the master list, while Shift with the arrows,
            PgUp/PgDn, and Home/End scroll the log of the detail view  */
        if ((key.upArrow || key.downArrow) && key.shift)
            scrollLog(key.upArrow ? -1 : 1)
        else if (key.upArrow || key.downArrow)
            selectAgent(key.upArrow ? -1 : 1)
        else if (key.pageUp || key.pageDown)
            scrollLog((key.pageUp ? -1 : 1) * Math.max(1, logH - 1))
        else if (key.home || key.end)
            scrollLog(key.home ? "top" : "bottom")
        else if (input === "?")
            toggleFlag("keys")
        return
    }
    if (view === "stats") {
        /*  the left/right arrows step through the time ranges of the statistics  */
        if (key.leftArrow || key.rightArrow)
            stepRange(key.leftArrow ? -1 : 1)
        else if (input === "?")
            toggleFlag("keys")
        return
    }
    if (view === "flow") {
        /*  the arrows move spatially to the nearest agent card or state in their direction,
            and ENTER on an agent card shows the agents view with its (first) agent selected, while
            PgUp/PgDn and Home/End scroll the viewport  */
        const dir = key.leftArrow ? "left" : key.rightArrow ? "right" : key.upArrow ? "up" : key.downArrow ? "down" : null
        if (key.return)
            showAgent(ctx, flowSel)
        else if (key.pageUp || key.pageDown)
            scrollFlow(0, (key.pageUp ? -1 : 1) * Math.max(1, viewH - 1))
        else if (key.home || key.end)
            scrollFlow(0, key.home ? -Infinity : Infinity)
        else if (dir !== null) {
            const next = nearestPlace(flowPlaces, flowSel, dir)
            if (next !== undefined)
                setFlowSel(next)
        }
        else if (input === "?")
            toggleFlag("keys")
        return
    }
    if (key.return && sel.id !== "") {
        setDialog({ id: sel.id, tab: 0, first: 0, scrolls: {} })
        return
    }
    if (input === "e") {
        if (sel.id !== "")
            startEdit(sel.id)
        return
    }
    if (input === "N" || (input === "n" && key.shift)) {
        if (carry === null)
            startEdit(null)
        return
    }
    if ((input === "t" && !key.shift) || input === "?") {
        toggleFlag(input === "t" ? "titles" : "keys")
        return
    }
    if (input === "s" && view === "graph") {
        toggleFlag("standalone")
        return
    }
    if (view === "graph") {
        /*  move spatially to the nearest node in the direction of the arrow  */
        const dir = key.leftArrow ? "left" : key.rightArrow ? "right" : key.upArrow ? "up" : key.downArrow ? "down" : null
        if (dir === null)
            return
        const next = places.has(sel.id) ? nearestPlace(places, sel.id, dir) : nodes[0]?.id
        if (next !== undefined && board.cards.has(next))
            setSel(relocate(board, { g: sel.g, l: sel.l, id: next }, { ...surface, minimized: [], collapsed: [] }))
        return
    }
    handleLaneKey(ctx, input, key)
}

