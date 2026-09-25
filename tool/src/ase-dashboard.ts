/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import path                        from "node:path"
import { fileURLToPath }           from "node:url"

import { Command, InvalidArgumentError } from "commander"
import { execa }                   from "execa"
import { ofetch }                  from "ofetch"

import type Log                    from "./ase-log.js"
import { Task }                    from "./ase-task.js"
import { loadServiceContext, SERVICE_HOST } from "./ase-service.js"
import { buildBoard, resolveNumber } from "./ase-dashboard-core.js"
import { writeStdout }             from "./ase-stdio.js"

/*  internal command options type  */
interface DashboardOpts {
    graph?:   boolean
    web?:     boolean
    text?:    boolean
    resolve?: number
}

/*  custom argument parser for Commander: positive integer  */
const parseNumber = (value: string): number => {
    const n = Number.parseInt(value, 10)
    if (!Number.isFinite(n) || n < 1 || String(n) !== value.trim())
        throw new InvalidArgumentError("display number must be a positive integer")
    return n
}

/*  render the lane overview as plain text, for use without a terminal  */
const textOverview = (log: Log): string => {
    const board = buildBoard(log)
    const out   = [
        `ASE DASHBOARD ─ ${path.basename(Task.projectRoot())} ─ ${board.cards.size} tasks ─ Mode: ${board.mode}`,
        "change: ase config set project.task.lifecycle <solo|team|enterprise>",
        ""
    ]
    for (const group of board.groups) {
        out.push(`━ ${group.title}`)
        for (const lane of group.lanes) {
            const cards = board.lanes.get(lane.status) ?? []
            out.push(`  ${lane.status}${lane.active ? " (active)" : ""} · ${cards.length}`)
            for (const c of cards)
                out.push(`    ${c.num} · ${c.id}${board.cyclic.has(c.id) ? " ⟲" : ""}`)
        }
    }
    for (const w of board.warnings)
        out.push(`⚠ ${w}`)
    return out.join("\n") + "\n"
}

/*  CLI command "ase dashboard"  */
export default class DashboardCommand {
    constructor (private log: Log) {}

    /*  ensure the ASE service of the project runs and serves the dashboard,
        restarting a service still running an older ASE without it, and
        return its port  */
    private async servicePort (): Promise<number> {
        const entry = fileURLToPath(new URL("./ase.js", import.meta.url))
        const start = async (): Promise<number> => {
            await execa(process.execPath, [ entry, "service", "start" ], { stdio: "ignore" })
            const port = loadServiceContext(this.log).port
            if (port === null)
                throw new Error("dashboard: ASE service did not report a port")
            return port
        }
        const port = await start()
        const res  = await ofetch.raw(`http://${SERVICE_HOST}:${port}/dashboard/api/ping`,
            { ignoreResponseError: true }).catch(() => null)
        if (res !== null && res.status === 404) {
            this.log.write("info", "dashboard: restarting ASE service, as it runs an older ASE without dashboard")
            await execa(process.execPath, [ entry, "service", "stop" ], { stdio: "ignore" })
            return start()
        }
        return port
    }

    /*  open an URL in the default browser of the platform  */
    private async openBrowser (url: string): Promise<void> {
        const [ cmd, ...args ] = process.platform === "darwin" ? [ "open", url ] :
            process.platform === "win32" ? [ "cmd", "/c", "start", "", url ] : [ "xdg-open", url ]
        await execa(cmd, args, { stdio: "ignore", detached: true }).catch(() => {
            this.log.write("warning", `dashboard: cannot open browser, please visit ${url}`)
        })
    }

    /*  register CLI command  */
    register (program: Command): void {
        program
            .command("dashboard")
            .description("Show the task dashboard: the lanes of the configured task lifecycle " +
                "model and the dependency graph of the tasks, following all changes live")
            .option("-g, --graph", "start in the dependency graph view instead of the lane view")
            .option("-w, --web", "serve the web dashboard through the ASE service of the project " +
                "and open it in the browser")
            .option("-t, --text", "print the lane overview as plain text and exit")
            .option("-r, --resolve <number>", "resolve a display number to its task id and exit", parseNumber)
            .action(async (opts: DashboardOpts) => {
                /*  resolve a display number  */
                if (opts.resolve !== undefined) {
                    const id = resolveNumber(opts.resolve)
                    if (id === undefined) {
                        this.log.write("error", `dashboard: no task with display number ${opts.resolve}`)
                        process.exitCode = 1
                        return
                    }
                    await writeStdout(`${id}\n`)
                    return
                }

                /*  serve and open the web dashboard  */
                if (opts.web === true) {
                    const url = `http://127.0.0.1:${await this.servicePort()}/dashboard`
                    await writeStdout(`${url}\n`)
                    await this.openBrowser(url)
                    return
                }

                /*  print the plain text overview if requested or without a terminal  */
                if (opts.text === true || !process.stdout.isTTY || !process.stdin.isTTY) {
                    await writeStdout(textOverview(this.log))
                    return
                }

                /*  run the interactive terminal dashboard  */
                const { runTUI } = await import("./ase-dashboard-tui.js")
                await runTUI(this.log, opts.graph === true)
            })
    }
}
