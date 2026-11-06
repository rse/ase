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
    web?:        boolean
    text?:       boolean
    agentRelay?: string
    task?:       string
}

/*  render the lane overview (and the agents passed by the agent relay, if any)
    as plain text, for use without a terminal  */
const textOverview = async (log: Log, relay?: string): Promise<string> => {
    const { buildBoard, cardLabel, editMarker, effortMarker, fetchAgents, busyAgents, agentLabel, agentStatus } = await import("./ase-task-board-core.js")
    const [ board, agents ] = await Promise.all([ buildBoard(log), fetchAgents(log, relay) ])
    const busy  = busyAgents(agents)
    const out   = [
        `⧉ ASE: Task Board · project: ${Task.projectIdOf(Task.projectRoot())} · mode: ${board.mode} · tasks: ${board.cards.size}`,
        ""
    ]
    for (const group of board.groups) {
        out.push(`━ ${group.title}`)
        for (const lane of group.lanes) {
            const cards = board.lanes.get(lane.status) ?? []
            out.push(`  ${lane.status}${lane.active ? " (active)" : ""} · ${cards.length}`)
            for (const c of cards) {
                /*  mark the task (like the terminal board) with the state of its edit requests,
                    and with its effort size  */
                const edit  = editMarker(c)
                const size  = effortMarker(c)
                const marks = (edit !== "" ? ` ${edit}` : "") + (size !== "" ? ` ${size}` : "")
                out.push(`    ${cardLabel(c).replace(c.id, c.id + marks)}` +
                    (busy.has(c.id) ? ` ⚙ ${busy.get(c.id)!.map((agent) => agent.name).join(", ")}` : ""))
            }
        }
    }
    if (agents !== null) {
        out.push(`━ agents · ${agents.connected ? agents.agents.length : "agent relay unreachable"}`)
        for (const agent of agents.agents) {
            const op = agent.recent.at(-1)
            out.push(`  ${agent.state === "busy" ? "●" : "○"} ${agentLabel(agent)} · ${agentStatus(agent)}`)
            if (op !== undefined)
                out.push(`    ${op.task !== "" ? `${op.task}: ` : ""}${op.msg}`)
        }
    }
    for (const w of board.warnings)
        out.push(`⚠ ${w}`)

    /*  make the lines safe for the terminal (strip control characters,
        e.g. in the texts passed by the agent relay)  */
    return out.map((line) => line.replace(/\p{Cc}/gu, "")).join("\n") + "\n"
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

    /*  open a URL in the default browser of the platform, waiting only for
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
            .option("--agent-relay <url>", "agent relay to receive the live presence of the agents from, " +
                "as \"ase[s]://<addr>:<port>[/<token>]\" (default: the configured \"project.relay.url\", else none; " +
                "the web board always follows the configured one)")
            .option("-T, --task <id>", "show only the task dialog of the given task as a task viewer, " +
                "following all its changes live (with --text or without a terminal: print its plan and exit)")
            .action(async (opts: BoardOpts) => {
                /*  refuse the task viewer on an unknown task  */
                const plan = opts.task !== undefined ? await Task.load(this.log, opts.task) : ""
                if (opts.task !== undefined && plan === "")
                    throw new Error(`board: no task "${opts.task}"`)

                /*  serve and open the web board  */
                if (opts.web === true) {
                    if (opts.agentRelay !== undefined)
                        this.log.write("warning", "board: \"--agent-relay\" is ignored by the web board, " +
                            "which follows the configured \"project.relay.url\"")
                    const url = `http://${SERVICE_HOST}:${await this.servicePort()}/task-board` +
                        (opts.task !== undefined ? `?task=${encodeURIComponent(opts.task)}` : "")
                    await writeStdout(`${url}\n`)
                    await this.openBrowser(url)
                    return
                }

                /*  print the plain text overview (resp. the plan of the task
                    of the task viewer) if requested or without a terminal  */
                if (opts.text === true || !process.stdout.isTTY || !process.stdin.isTTY) {
                    await writeStdout(opts.task !== undefined ? plan : await textOverview(this.log, opts.agentRelay))
                    return
                }

                /*  run the interactive terminal board, with the production build of React
                    (its development build records a never cleared performance measure per render)  */
                process.env.NODE_ENV ??= "production"
                const { runTUI } = await import("./ase-task-board-tui.js")
                await runTUI(this.log, opts.agentRelay, opts.task)
            })
    }
}

