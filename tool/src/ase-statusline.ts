/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under GPL 3.0 <https://spdx.org/licenses/GPL-3.0-only>
*/

import fs                                   from "node:fs"
import path                                 from "node:path"
import { execFileSync }                     from "node:child_process"

import { Command }                          from "commander"
import { execaSync }                        from "execa"

import type Log                             from "./ase-log.js"
import { Config, configSchema, parseScope } from "./ase-config.js"

/*  shape of the JSON payload Claude Code passes on stdin  */
interface StatuslineInput {
    workspace?:      { current_dir?:     string  }
    model?:          { display_name?:    string  }
    context_window?: { used_percentage?: number  }
    effort?:         { level?:           string  }
    thinking?:       { enabled?:         boolean }
    session_id?:     string
}

/*  read stdin into a single string  */
const readStdin = async (): Promise<string> => {
    const chunks: Buffer[] = []
    for await (const chunk of process.stdin)
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk)
    return Buffer.concat(chunks).toString("utf8")
}

/*  detect terminal column width via /dev/tty (stdout is a pipe under Claude Code)  */
const detectTermWidth = (): number => {
    let width = 0
    try {
        const tty = fs.openSync("/dev/tty", "r")
        const out = execFileSync("tput", [ "cols" ], { stdio: [ tty, "pipe", "ignore" ] })
        fs.closeSync(tty)
        width = parseInt(out.toString("utf8").trim()) || 0
    }
    catch (_e) {
        /*  no controlling terminal  */
    }
    return width
}

/*  command-line handling  */
export default class StatuslineCommand {
    constructor (private log: Log) {}

    /*  register commands  */
    register (program: Command): void {
        program
            .command("statusline")
            .description("Render Claude Code statusline from stdin JSON")
            .action(async () => {
                /*  read all of stdin  */
                const input = await readStdin()

                /*  parse JSON data  */
                let data: StatuslineInput
                try {
                    data = JSON.parse(input) as StatuslineInput
                }
                catch (err: unknown) {
                    const message = err instanceof Error ? err.message : String(err)
                    this.log.write("error", `statusline: invalid JSON on stdin: ${message}`)
                    process.exit(1)
                }

                /*  fetch information from data  */
                const dir       = path.basename(data.workspace?.current_dir ?? "")
                const model     = data.model?.display_name ?? ""
                const pct       = Math.floor(data.context_window?.used_percentage ?? 0)
                const effort    = data.effort?.level ?? "unknown"
                const thinking  = (data.thinking?.enabled ?? false) === true ? "yes" : "no"
                const sessionId = data.session_id ?? "unknown"

                /*  optionally determine ASE task id and persona style via in-process Config  */
                let taskId  = process.env.ASE_TASK_ID       ?? ""
                let persona = process.env.ASE_PERSONA_STYLE ?? ""
                try {
                    const cfg = new Config("config", configSchema, this.log,
                        parseScope(`session:${sessionId}`))
                    cfg.read("lenient")
                    const t = String(cfg.get("agent.task")    ?? "").trim()
                    const p = String(cfg.get("agent.persona") ?? "").trim()
                    if (t !== "")
                        taskId = t
                    if (p !== "")
                        persona = p
                }
                catch (_e) {
                    /*  cascade unavailable; keep env-var fallbacks  */
                }

                /*  optionally determine terminal width  */
                const width = detectTermWidth()

                /*  configure ANSI sequences  */
                const RESET  = "\x1b[0m"
                const BOLD   = "\x1b[1m"
                const BLACK  = "\x1b[30m"
                const BLUE   = "\x1b[34m"
                const YELLOW = "\x1b[33m"
                const RED    = "\x1b[31m"

                /*  determine context bar information  */
                const barSize  = 20
                const barColor = pct >= 80 ? RED : pct >= 60 ? YELLOW : pct >= 40 ? BLUE : RESET
                const filled   = Math.round(pct / 100 * barSize)
                const bar      = "█".repeat(filled) + "░".repeat(barSize - filled)

                /*  generate output  */
                let output = ""
                output += `${BLUE}※ user: ${BOLD}${process.env.USER ?? process.env.LOGNAME ?? "unknown"}${RESET} `
                if (width > 0 && width < 30)
                    output += "\n"
                output += `${RED}⚑ project: ${BOLD}${dir}${RESET} `
                if (width > 0 && width < 60)
                    output += "\n"
                if (taskId !== "") {
                    output += `${BLACK}◉ task: ${BOLD}${taskId}${RESET} `
                    if (width > 0 && width < 90)
                        output += "\n"
                }
                output += `⏻ session: ${BOLD}${sessionId}${RESET}\n`
                output += `⚙ model: ${BOLD}${model}${RESET} `
                if (width > 0 && width < 30)
                    output += "\n"
                output += `⚒ effort: ${BOLD}${effort}${RESET} `
                if (width > 0 && width < 60)
                    output += "\n"
                output += `⚛ thinking: ${BOLD}${thinking}${RESET}\n`
                if (persona !== "") {
                    output += `☯ persona: ${BOLD}${persona}${RESET} `
                    if (width > 0 && width < 30)
                        output += "\n"
                }
                output += `${barColor}◔ context: ${bar} ${pct}%${RESET}\n`

                /*  send output  */
                process.stdout.write(output)

                /*  optionally publish task id to the calling tmux pane as a per-pane user
                    option, so someone (like claudeX) can pick it up via #{@ase_task_id}  */
                if (process.env.TMUX !== undefined
                    && process.env.TMUX !== ""
                    && process.env.TMUX_PANE !== undefined
                    && process.env.TMUX_PANE !== "") {
                    const tid = taskId !== "" ? taskId : "default"
                    execaSync("tmux", [ "set-option", "-p", "-t", process.env.TMUX_PANE,
                        "@ase_task_id", tid ], { stdio: "ignore", reject: false })
                }
            })
    }
}
