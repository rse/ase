/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under GPL 3.0 <https://spdx.org/licenses/GPL-3.0-only>
*/

import fs                                   from "node:fs"
import path                                 from "node:path"
import { execFileSync }                     from "node:child_process"

import { Command, InvalidArgumentError }    from "commander"
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

/*  internal command options type  */
interface StatuslineOpts {
    width:  number
    margin: number
    icons:  boolean
    labels: boolean
}

/*  custom argument parser for Commander: non-negative integer  */
const parseInteger = (name: string) => (value: string): number => {
    const n = Number.parseInt(value, 10)
    if (!Number.isFinite(n) || n < 0)
        throw new InvalidArgumentError(`${name} must be a non-negative integer`)
    return n
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
            .option("-w, --width <n>",
                "force terminal width to <n> characters (0 = auto-detect via /dev/tty)",
                parseInteger("--width"), 0)
            .option("-m, --margin <n>",
                "reduce maximum used terminal width by <n> characters on each side",
                parseInteger("--margin"), 2)
            .option("--no-icons",
                "disable icons in placeholder rendering")
            .option("--no-labels",
                "disable labels in front of bold values")
            .argument("[lines...]",
                "one or more template lines with %u %p %T %s %m %e %t %P %c placeholders " +
                "and <color>...</color> markup (color: black, red, green, yellow, blue, " +
                "magenta, cyan, white, default) (default: single line \"%m %e %t\")")
            .action(async (lines: string[], opts: StatuslineOpts) => {
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
                const user      = process.env.USER ?? process.env.LOGNAME ?? "unknown"
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

                /*  determine effective terminal width and budget  */
                const width  = opts.width > 0 ? opts.width : detectTermWidth()
                const budget = width > 0 ? width - 2 * opts.margin : 0

                /*  configure ANSI sequences for bold  */
                const BOLD   = "\x1b[1m"
                const NOBOLD = "\x1b[22m"

                /*  configure ANSI foreground color map  */
                const FG: Record<string, string> = {
                    black:   "\x1b[30m",
                    red:     "\x1b[31m",
                    green:   "\x1b[32m",
                    yellow:  "\x1b[33m",
                    blue:    "\x1b[34m",
                    magenta: "\x1b[35m",
                    cyan:    "\x1b[36m",
                    white:   "\x1b[37m",
                    default: "\x1b[39m"
                }

                /*  determine context bar information  */
                const barSize  = 20
                const filled   = Math.round(pct / 100 * barSize)
                const bar      = "█".repeat(filled) + "░".repeat(barSize - filled)

                /*  shared output state and append helper with auto-wrap;
                    the helper itself strips ANSI CSI escape sequences to
                    measure the raw visible width of the chunk  */
                let out = ""
                let col = 0
                const appendOutput = (ansi: string): void => {
                    /*  eslint-disable-next-line no-control-regex  */
                    const raw = ansi.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")
                    if (budget > 0 && col > 0 && col + raw.length > budget) {
                        out += "\n"
                        col  = 0
                    }
                    out += ansi
                    col += raw.length
                }

                /*  helper to build the "<icon> <label>: " prefix subject to --no-icons / --no-labels  */
                const prefix = (icon: string, label: string): string => {
                    const i = opts.icons  ? `${icon} `    : ""
                    const l = opts.labels ? `${label}: ` : ""
                    return `${i}${l}`
                }

                /*  identifier -> renderer map  */
                const renderers: Record<string, () => void> = {
                    u: () => appendOutput(`${prefix("※", "user")}${BOLD}${user}${NOBOLD}`),
                    p: () => appendOutput(`${prefix("⚑", "project")}${BOLD}${dir}${NOBOLD}`),
                    T: () => {
                        if (taskId !== "")
                            appendOutput(`${prefix("◉", "task")}${BOLD}${taskId}${NOBOLD}`)
                    },
                    s: () => appendOutput(`${prefix("⏻", "session")}${BOLD}${sessionId}${NOBOLD}`),
                    m: () => appendOutput(`${prefix("⚙", "model")}${BOLD}${model}${NOBOLD}`),
                    e: () => appendOutput(`${prefix("⚒", "effort")}${BOLD}${effort}${NOBOLD}`),
                    t: () => appendOutput(`${prefix("⚛", "thinking")}${BOLD}${thinking}${NOBOLD}`),
                    P: () => {
                        if (persona !== "")
                            appendOutput(`${prefix("☯", "persona")}${BOLD}${persona}${NOBOLD}`)
                    },
                    c: () => appendOutput(`${prefix("◔", "context")}${bar} ${pct}%${NOBOLD}`)
                }

                /*  determine effective template lines  */
                const tmpl = lines.length > 0 ? lines : [ "%m %e %t" ]

                /*  walk each template line and render  */
                for (const line of tmpl) {
                    let i = 0
                    while (i < line.length) {
                        const ch   = line[i]!
                        const next = line[i + 1]
                        if (ch === "<") {
                            const m = line.slice(i).match(/^<(\/?)([a-z]+)>/)
                            if (m !== null && FG[m[2]!] !== undefined) {
                                appendOutput(m[1] === "/" ? FG.default! : FG[m[2]!]!)
                                i += m[0].length
                                continue
                            }
                        }
                        if (ch === "%" && next !== undefined && renderers[next] !== undefined) {
                            renderers[next]!()
                            i += 2
                        }
                        else {
                            appendOutput(ch)
                            i += 1
                        }
                    }
                    out += "\n"
                    col  = 0
                }

                /*  send output  */
                process.stdout.write(out)

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
