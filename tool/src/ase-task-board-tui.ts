/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import React                                  from "react"
import { render, Box, Text, useInput, useStdin } from "ink"
import stringWidth                            from "string-width"

import type Log                               from "./ase-lib-log.js"
import { Task }                               from "./ase-task.js"
import { buildBoard, toneOf, viewLabels }     from "./ase-task-board-core.js"
import type { Board }                         from "./ase-task-board-core.js"
import pkg                                    from "../package.json" with { type: "json" }
import { useBoardState, mouseReporting, requestChoices, assignChoices, assignUnknown } from "./ase-task-board-tui-model.js"
import type { BoardCtx }                      from "./ase-task-board-tui-model.js"
import { handleMouse, handleKey }             from "./ase-task-board-tui-control.js"
import { h, renderLanes, renderGraph, renderAgents, renderFlow, renderStats } from "./ase-task-board-tui-view.js"
import { palette, loadPalette, cx }           from "./ase-task-board-tui-style.js"
import { sanitize, renderDialog, renderConfirm, renderTransfer, renderAssign, renderPrompt, renderBusy } from "./ase-task-board-tui-popup.js"

/*  render the whole screen  */
const renderScreen = (ctx: BoardCtx, project: string) => {
    const {
        columns, rows, all, board, surface, view, filter, typing, dialog, notice, carry, confirm, transfer, assign, prompt,
        headRef, tabLabels, dialogSel, dialogLines, transferCard, transferList, dim, store, busy, busyTick,
        agents
    } = ctx

    /*  refuse to draw into a too small window  */
    if (columns < 40 || rows < 16)
        return h(Box, { width: columns, height: rows, justifyContent: "center", alignItems: "center" },
            h(Text, cx("signal"), `window too small (${columns}×${rows}) — needs at least 40×16`))

    /*  the status line in the last line of the screen, below the key hints, enclosed
        on its left and right side by the downward lines of the rule above it,
        showing the kind and connection state of the task store (a disconnected one in
        signal color), the number of agents and the connection state of the agent relay (if
        any), and the ASE version (dimmed) while there is nothing else to report  */
    const report = notice !== null ? sanitize(notice) :
        carry !== null ? `moving task "${carry.id}" from ${carry.from}: select a bold lane, SPACE drops, ESC cancels` :
            typing ? "filtering tasks by fuzzy matched keywords or effort:<size> (SPACE: and, COMMA: or): ⏎ keeps, ESC clears" : null
    const status = h(Box, { key: "status", paddingX: 1 },
        h(Box, cx("fixed"), h(Text, cx("dim", dim && "dimmed"), "│")),
        h(Box, cx("grow", "bar"),
            h(Text, cx("hint", report !== null && "signal", dim && "dimmed"),
                report ?? [ "⧉ ASE: ", h(Text, { key: "app", ...cx("bold") }, "Task Board"),
                    ...(store !== null ? [ " · store: ", h(Text, { key: "store", ...cx("bold") }, `${store.kind} `),
                        h(Text, { key: "state", ...cx(!store.connected && "signal") }, store.connected ? "●" : "○") ] : []),
                    ...(agents !== null ? [ " · agents: ", h(Text, { key: "agents", ...cx("bold") }, `${agents.agents.length} `),
                        h(Text, { key: "relay", ...cx(!agents.connected && "signal") }, agents.connected ? "●" : "○") ] : []),
                    " · version: ", h(Text, { key: "version", ...cx("bold") }, `ASE ${pkg.version}`) ])),
        h(Box, cx("fixed"), h(Text, cx("dim", dim && "dimmed"), "│")))

    /*  the counted tasks (without the context tasks of a filtered graph), and
        the (inversely rendered) filter field of the header: the tail of the
        filter query (with the cursor while typing), padded to a fixed width,
        followed by its clear button (shown with a filter query only)  */
    const tasks = [ ...board.cards.values() ].filter((c) => !board.context.has(c.id))
    const field = (sanitize(filter) + (typing ? "▏" : "")).slice(-14).padEnd(14)

    /*  the filter field is disabled (and dimmed) in the agents view and the agent graph, which are not filtered  */
    const off   = view === "agents" || view === "flow"

    /*  the view value, centered within the fixed width of the longest view name  */
    const viewW = Math.max(...Object.values(viewLabels).map((v) => v.length))
    const shown = (" ".repeat(Math.floor((viewW - viewLabels[view].length) / 2)) + viewLabels[view]).padEnd(viewW)

    /*  render the screen, with the dialog and popups on top  */
    return h(Box, { width: columns, height: rows, flexDirection: "column" },
        /*  the header, enclosed on its left and right side by the upward lines of
            the rule below it, with the view value and the filter field (disabled in the
            agents view and the agent graph, which are not filtered) in boxes of their own, so that they
            are measurable for the mouse hit-testing; the parts
            are centered as a single box, as centering them individually places them on
            half columns, which rounds the text and box parts apart by one column  */
        h(Box, { paddingX: 1 },
            h(Box, cx("fixed"), h(Text, cx("dim", dim && "dimmed"), "│")),
            h(Box, cx("grow", "bar"),
                h(Box, { flexShrink: 1, minWidth: 0 },
                    h(Text, cx("normal", "truncate", dim && "dimmed"),
                        "⧉ ASE: ",
                        h(Text, cx("bold"), "Task Board"),
                        " · project: ",
                        h(Text, cx("bold"), project),
                        " · mode: ",
                        h(Text, cx("bold"), board.mode),
                        " · tasks: ",
                        h(Text, cx("bold"), `${tasks.filter((c) => toneOf(board, c) !== "done").length}/${tasks.length}`),
                        " · view: "),
                    h(Box, { ref: headRef("view"), ...cx("fixed") },
                        h(Text, cx("dim", "badge", dim && "dimmed"), ` ${shown} `)),
                    h(Text, cx("normal", "truncate", (dim || off) && "dimmed"), " · filter: "),
                    h(Box, { ref: headRef("filter"), ...cx("fixed") },
                        h(Text, cx(typing ? "signal" : "dim", off ? "inverse" : "badge", dim && "dimmed"), field)),
                    h(Box, { ref: headRef("clear"), ...cx("fixed") },
                        h(Text, cx(typing ? "signal" : "dim", off ? "inverse" : "badge", dim && "dimmed"),
                            filter !== "" && !off ? "✕ " : "  ")))),
            h(Box, cx("fixed"), h(Text, cx("dim", dim && "dimmed"), "│"))),

        /*  the horizontal rule below the header, turning upward with rounded corners at both ends  */
        h(Text, cx("dim", dim && "dimmed"), " ╰" + "─".repeat(Math.max(0, columns - 4)) + "╯ "),
        h(Box, { paddingX: 1 },
            h(Text, cx("signal", "truncate", dim && "dimmed"),
                board.warnings.length > 0 ? `⚠ ${board.warnings.map(sanitize).join(" · ")}` : " ")),
        ...(view === "lanes" ? renderLanes(ctx) : view === "graph" ? renderGraph(ctx) : view === "stats" ? renderStats(ctx) :
            view === "flow" ? renderFlow(ctx) : renderAgents(ctx))
            .filter((el) => surface.keys || !String(el.key).startsWith("keys")),

        /*  the horizontal rule between the key hints and the status line, turning downward with rounded corners at both ends  */
        h(Text, cx("dim", dim && "dimmed"), " ╭" + "─".repeat(Math.max(0, columns - 4)) + "╮ "),
        status,
        dialog !== null ? renderDialog({
            card:    all.cards.get(dialog.id),
            group:   all.groups.find((g) => g.lanes.some((l) => l.status === all.cards.get(dialog.id)?.status))?.title,
            id:      dialog.id,
            pred:    all.pred.get(dialog.id) ?? [],
            succ:    all.succ.get(dialog.id) ?? [],
            tint:    (ref) => {
                const c    = all.cards.get(ref)
                const tone = c !== undefined ? toneOf(all, c) : "idle"
                return tone === "active" ? palette.accent : tone === "done" ? palette.dim : palette.normal
            },
            tabs:    tabLabels,
            tab:     dialogSel,
            first:   dialog.first,
            scroll:  dialog.scrolls[dialogSel] ?? 0,
            lines:   dialogLines,
            columns,
            rows,
            notice
        }) : null,
        confirm !== null ? renderConfirm(confirm.id, confirm.yes, columns, rows) : null,
        transfer !== null && transferCard !== undefined ?
            renderTransfer(transfer.id, transferCard.status, transferList, transfer.at, columns, rows) : null,
        assign !== null ? renderAssign(assign, assignChoices(assign), assignUnknown(assign), columns, rows) : null,
        prompt !== null ? renderPrompt(prompt, columns, rows, prompt.request !== null ? requestChoices(prompt.request) : []) : null,
        busy !== null ? renderBusy(busy.label, busy.since, busyTick, columns, rows) : null)
}

/*  pass each pressed SGR mouse report ("ESC[<b;x;y" plus "M"/"m" for press/release, 1-based)
    with its 0-based column/row, read directly from stdin, as Ink 8 drops them before
    "useInput"; the "data" events accompany the reads of Ink, so no input is taken away
    (and none is read while Ink pauses its input)  */
export const useMouseReports = (onPress: (button: number, col: number, row: number) => void): void => {
    const { stdin } = useStdin()
    const handler   = React.useRef(onPress)
    handler.current = onPress
    React.useEffect(() => {
        let rest = ""
        const onData = (chunk: Buffer | string) => {
            const parts = (rest + String(chunk)).split("\x1b")
            const last  = parts.length - 1
            rest = ""
            parts.forEach((part, i) => {
                const report = /^\[<(\d+);(\d+);(\d+)([Mm])/.exec(part)
                if (report !== null && report[4] === "M")
                    handler.current(Number(report[1]), Number(report[2]) - 1, Number(report[3]) - 1)
                else if (report === null && i === last && i > 0 && /^(\[(<[\d;]*)?)?$/.test(part))
                    rest = "\x1b" + part
            })
        }

        /*  listen only alongside the "readable" listener of Ink, which Ink detaches
            while "suspendTerminal" hands the terminal to a child process (like the
            $EDITOR), as a sole "data" listener would switch stdin into flowing mode
            and hence read the input of the child process away; a removed listener is
            reported after its removal, an added listener before its addition  */
        let tapped = false
        const sync = () => {
            const reading = stdin.listenerCount("readable") > 0
            if (reading && !tapped)
                stdin.on("data", onData)
            else if (!reading && tapped)
                stdin.off("data", onData)
            tapped = reading
        }
        const onAdded = (event: string | symbol) => {
            if (event === "readable")
                queueMicrotask(sync)
        }
        const onRemoved = (event: string | symbol) => {
            if (event === "readable")
                sync()
        }
        stdin.on("newListener",    onAdded)
        stdin.on("removeListener", onRemoved)
        sync()
        return () => {
            stdin.off("newListener",    onAdded)
            stdin.off("removeListener", onRemoved)
            if (tapped)
                stdin.off("data", onData)
            tapped = false
        }
    }, [ stdin ])
}

/*  the root component of the terminal board  */
const App = ({ log, initial, project, relay }: { log: Log, initial: Board, project: string, relay?: string }) => {
    const ctx = useBoardState(log, initial, relay)

    /*  handle the mouse, but ignore it while the modal busy popup is shown  */
    useMouseReports((button, col, row) => {
        if (ctx.busy === null)
            handleMouse(ctx, button, col, row)
    })

    /*  handle the keyboard  */
    useInput((input, key) => {
        /*  ignore key releases (reported under the kitty keyboard protocol),
            as otherwise every toggling key would toggle twice  */
        if (key.eventType === "release")
            return

        /*  ignore all input while the modal busy popup is shown  */
        if (ctx.busy !== null)
            return

        /*  never take a mouse report for keys (handled by "useMouseReports" above)  */
        if (/^\[<\d+;\d+;\d+[Mm]$/.test(input))
            return
        handleKey(ctx, input, key)
    })
    return renderScreen(ctx, project)
}

/*  wrap stdout to erase the tail of each changed line ("CSI <n> G" plus "CSI K" plus
    its styled text) after instead of before its text, as otherwise the line is shown
    blanked in terminals redrawing between the reads of a frame, like tmux popups;
    a text reaching the last column needs no erasing, which would there erase its
    last character, as the cursor rests on it  */
const lateErasing = (stream: NodeJS.WriteStream): NodeJS.WriteStream => {
    /*  eslint-disable-next-line no-control-regex  */
    const changed = /\x1b\[(\d+)G\x1b\[K((?:[^\x1b\n]|\x1b\[[\d;:]*m)*)/g
    const write = (data: unknown, ...args: unknown[]) =>
        (stream.write as (...args: unknown[]) => boolean)(typeof data !== "string" ? data :
            data.replace(changed, (_all, col: string, text: string) =>
                `\x1b[${col}G${text}` + (Number(col) - 1 + stringWidth(text) < stream.columns ? "\x1b[K" : "")), ...args)
    return new Proxy(stream, {
        get: (target, prop) => {
            if (prop === "write")
                return write
            const value: unknown = Reflect.get(target, prop, target)
            return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(target) : value
        }
    })
}

/*  run the terminal board until the user quits  */
export const runTUI = async (log: Log, relay?: string): Promise<void> => {
    const initial = await buildBoard(log)
    const project = Task.projectIdOf(Task.projectRoot())
    loadPalette(log)

    /*  defer stderr log output while Ink draws, as it bypasses patchConsole  */
    log.defer(true)

    /*  ensure the terminal never stays in mouse reporting mode,
        even on a premature process exit (e.g. an uncaught exception)  */
    const reset = () => {
        mouseReporting(false)
    }
    process.once("exit", reset)
    try {
        /*  enable the kitty keyboard protocol (if the terminal supports it),
            as only under it the Shift modifier of RETURN is reported, and
            rewrite only the changed lines of a frame, as otherwise every frame
            is erased and redrawn entirely, which flickers in terminals not
            honoring synchronized output (DEC mode 2026), like tmux popups  */
        const app = render(h(App, { log, initial, project, relay }), {
            alternateScreen: true, exitOnCtrlC: true, patchConsole: true, kittyKeyboard: { mode: "auto" },
            incrementalRendering: true, stdout: lateErasing(process.stdout)
        })
        await app.waitUntilExit()
    }
    finally {
        process.off("exit", reset)
        mouseReporting(false)
        log.defer(false)
    }
}

