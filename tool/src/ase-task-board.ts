/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import { fileURLToPath }                    from "node:url"

import { Command }                          from "commander"
import { execa }                            from "execa"
import { ofetch }                           from "ofetch"

import type Log                             from "./ase-lib-log.js"
import { Task }                             from "./ase-task.js"
import { loadServiceContext, SERVICE_HOST } from "./ase-service.js"
import { writeStdout }                      from "./ase-lib-stdio.js"

/*  internal command options type  */
interface BoardOpts {
    web?:  boolean
    text?: boolean
}

/*  render the lane overview as plain text, for use without a terminal  */
const textOverview = async (log: Log): Promise<string> => {
    const { buildBoard, cardLabel } = await import("./ase-task-board-core.js")
    const board = await buildBoard(log)
    const out   = [
        `⧉ ASE: Task Board · project: ${Task.projectIdOf(Task.projectRoot())} · mode: ${board.mode} · tasks: ${board.cards.size}`,
        ""
    ]
    for (const group of board.groups) {
        out.push(`━ ${group.title}`)
        for (const lane of group.lanes) {
            const cards = board.lanes.get(lane.status) ?? []
            out.push(`  ${lane.status}${lane.active ? " (active)" : ""} · ${cards.length}`)
            for (const c of cards)
                out.push(`    ${cardLabel(c).replace(c.id, c.id + (board.cyclic.has(c.id) ? " ⟲" : ""))}`)
        }
    }
    for (const w of board.warnings)
        out.push(`⚠ ${w}`)
    return out.join("\n") + "\n"
}

/*  CLI sub-command "ase task board"  */
export default class TaskBoardCommand {
    constructor (private log: Log) {}

    /*  ensure the ASE service of the project runs and serves the board, and return its
        port (a service running other ASE code is never restarted, as this would break
        the MCP connections of all agent sessions using it)  */
    private async servicePort (): Promise<number> {
        const entry = fileURLToPath(new URL("./ase.js", import.meta.url))
        await execa(process.execPath, [ entry, "service", "start" ], { stdin: "ignore" })
        const port = loadServiceContext(this.log).port
        if (port === null)
            throw new Error("board: ASE service did not report a port")
        const res = await ofetch.raw(`http://${SERVICE_HOST}:${port}/task-board/api/ping`,
            { ignoreResponseError: true, timeout: 5 * 1000 }).catch((err: unknown) => {
            throw new Error(`board: ASE service not reachable on port ${port}`, { cause: err })
        })
        if (res.status === 404)
            throw new Error("board: ASE service runs older ASE code without web board " +
                "(restart it with \"ase service stop\" once no agent session uses it)")
        const data = res._data as { build?: string } | null | undefined
        const { BOARD_BUILD } = await import("./ase-task-board-web-server.js")
        if (data?.build !== BOARD_BUILD)
            this.log.write("warning", "board: ASE service runs other ASE code " +
                "(restart it with \"ase service stop\" once no agent session uses it)")
        return port
    }

    /*  open an URL in the default browser of the platform, waiting only for
        the opener to spawn, as e.g. "xdg-open" can stay attached to the browser  */
    private async openBrowser (url: string): Promise<void> {
        const [ cmd, ...args ] = process.platform === "darwin" ? [ "open", url ] :
            process.platform === "win32" ? [ "cmd", "/c", "start", "", url ] : [ "xdg-open", url ]
        const opener = execa(cmd, args, { stdio: "ignore", detached: true })
        const child  = opener.nodeChildProcess
        await new Promise<void>((resolve) => {
            child.once("spawn", () => {
                child.unref()
                resolve()
            })
            opener.catch(() => {
                this.log.write("warning", `board: cannot open browser, please visit ${url}`)
                resolve()
            })
        })
    }

    /*  register CLI sub-command "ase task board"  */
    register (task: Command): void {
        task
            .command("board")
            .description("Show the task board: the lanes of the configured task lifecycle " +
                "model and the dependency graph of the tasks, following all changes live")
            .option("-w, --web", "serve the web board through the ASE service of the project " +
                "and open it in the browser")
            .option("-t, --text", "print the lane overview as plain text and exit")
            .action(async (opts: BoardOpts) => {
                /*  serve and open the web board  */
                if (opts.web === true) {
                    const url = `http://${SERVICE_HOST}:${await this.servicePort()}/task-board`
                    await writeStdout(`${url}\n`)
                    await this.openBrowser(url)
                    return
                }

                /*  print the plain text overview if requested or without a terminal  */
                if (opts.text === true || !process.stdout.isTTY || !process.stdin.isTTY) {
                    await writeStdout(await textOverview(this.log))
                    return
                }

                /*  run the interactive terminal board, with the production build of React
                    (its development build records a never cleared performance measure per render)  */
                process.env.NODE_ENV ??= "production"
                const { runTUI } = await import("./ase-task-board-tui.js")
                await runTUI(this.log)
            })
    }
}

