/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import fs                                   from "node:fs"
import os                                   from "node:os"
import path                                 from "node:path"
import { execFileSync }                     from "node:child_process"

import { Command, InvalidArgumentError }    from "commander"
import { execaSync }                        from "execa"
import { Chalk }                            from "chalk"
import type { ForegroundColorName }         from "chalk"

import type Log                             from "./ase-log.js"
import { Config, configSchema, parseScope } from "./ase-config.js"
import { writeStdout }                      from "./ase-stdout.js"
import pkg                                  from "../package.json" with { type: "json" }

/*  forced-color chalk instance: stdout is a pipe under Anthropic Claude Code CLI,
    so chalk auto-detection would yield level 0; force level 1 to keep
    emitting ANSI sequences as the original implementation did  */
const c = new Chalk({ level: 1 })

/*  set of valid <color>...</color> markup names (chalk basic foreground colors plus "default")  */
const COLORS: ReadonlySet<string> = new Set<ForegroundColorName | "default">([
    "black", "red", "green", "yellow", "blue", "magenta", "cyan", "white", "default"
])

/*  type of supported tool (host) systems  */
type Tool = "claude" | "copilot" | "codex"

/*  shape of the JSON payload Anthropic Claude Code CLI / Copilot CLI passes on stdin
    (Copilot CLI's payload is mostly a subset of Anthropic Claude Code CLI's, with the
    extra top-level "cwd" field and without "effort", "thinking",
    "output_style", and "rate_limits"; the "context_window.current_usage"
    sub-object is shared, and "model.display_name" plus the cost,
    workspace, session and version fields are also shared)  */
interface StatuslineInput {
    cwd?: string
    workspace?: {
        current_dir?: string
    }
    model?: {
        display_name?: string
    }
    context_window?: {
        used_percentage?:     number
        total_input_tokens?:  number
        total_output_tokens?: number
        current_usage?: {
            input_tokens?:                number
            cache_creation_input_tokens?: number
            cache_read_input_tokens?:     number
        }
    }
    effort?: {
        level?: string
    }
    thinking?: {
        enabled?: boolean
    }
    session_id?:      string
    session_name?:    string
    transcript_path?: string
    version?:         string
    output_style?: {
        name?: string
    }
    cost?: {
        total_cost_usd?:        number
        total_duration_ms?:     number
        total_api_duration_ms?: number
        total_lines_added?:     number
        total_lines_removed?:   number
    }
    rate_limits?: {
        five_hour?: {
            used_percentage?: number
            resets_at?:       string | number
        }
        seven_day?: {
            used_percentage?: number
            resets_at?:       string | number
        }
    }
}

/*  internal command options type  */
interface StatuslineOpts {
    tool:   string
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

/*  detect terminal column width via /dev/tty (stdout is a pipe under Anthropic Claude Code CLI)  */
const detectTermWidth = (): number => {
    let width = 0
    let tty: number | null = null
    try {
        tty = fs.openSync("/dev/tty", "r")
        const out = execFileSync("tput", [ "cols" ], { stdio: [ tty, "pipe", "ignore" ] })
        width = Number.parseInt(out.toString("utf8").trim(), 10) || 0
    }
    catch (_e) {
        /*  no controlling terminal  */
    }
    finally {
        if (tty !== null) {
            try {
                fs.closeSync(tty)
            }
            catch (_e) {
                /*  best-effort  */
            }
        }
    }
    return width
}

/*  format a token count as a compact human-readable string (e.g. 334k, 104.9M)  */
const formatTokens = (n: number): string => {
    if (!Number.isFinite(n) || n < 0)
        return "0"
    if (n >= 1_000_000_000)
        return `${(n / 1_000_000_000).toFixed(1)}G`
    if (n >= 1_000_000)
        return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000)
        return `${(n / 1_000).toFixed(1)}k`
    return `${n}`
}

/*  format a millisecond duration as a compact human-readable string (e.g. 6d 12hr 7m, 4hr 27m, 12m 30s)  */
const formatDurationMs = (ms: number): string => {
    if (!Number.isFinite(ms) || ms < 0)
        return "0s"
    const totalSec = Math.floor(ms / 1000)
    const days     = Math.floor(totalSec / 86400)
    const hours    = Math.floor((totalSec % 86400) / 3600)
    const mins     = Math.floor((totalSec % 3600)  / 60)
    const secs     = totalSec % 60
    if (days > 0)
        return `${days}d ${hours}hr ${mins}m`
    if (hours > 0)
        return `${hours}hr ${mins}m`
    if (mins > 0)
        return `${mins}m ${secs}s`
    return `${secs}s`
}

/*  format a wall-clock duration as elapsed hours+minutes (e.g. 92hr 40m), without day rollover  */
const formatHoursMinutes = (ms: number): string => {
    if (!Number.isFinite(ms) || ms < 0)
        return "0hr 0m"
    const totalMin = Math.floor(ms / 60000)
    const hours    = Math.floor(totalMin / 60)
    const mins     = totalMin % 60
    return `${hours}hr ${mins}m`
}

/*  format an ISO timestamp or numeric Unix timestamp as a remaining-time relative to now (e.g. 4hr 27m, 6d 12hr 7m)  */
const formatTimeUntil = (when: string | number | undefined): string => {
    let target: number
    if (typeof when === "number") {
        if (!Number.isFinite(when))
            return ""
        /*  values below 1e12 are Unix seconds, otherwise milliseconds  */
        target = when < 1e12 ? when * 1000 : when
    }
    else if (typeof when === "string")
        target = Date.parse(when)
    else
        return ""
    if (!Number.isFinite(target))
        return ""
    const delta = target - Date.now()
    if (delta <= 0)
        return "0m"
    return formatDurationMs(delta)
}

/*  format a USD cost as a dollar string with 2 decimals (e.g. $54.44)  */
const formatCostUsd = (n: number): string => {
    if (!Number.isFinite(n) || n < 0)
        return "$0.00"
    return `$${n.toFixed(2)}`
}

/*  format a byte count as a compact human-readable string (e.g. 33.2G, 512M)  */
const formatBytes = (n: number): string => {
    if (!Number.isFinite(n) || n < 0)
        return "0"
    if (n >= 1024 ** 3)
        return `${(n / 1024 ** 3).toFixed(1)}G`
    if (n >= 1024 ** 2)
        return `${(n / 1024 ** 2).toFixed(1)}M`
    if (n >= 1024)
        return `${(n / 1024).toFixed(1)}k`
    return `${n}`
}

/*  probe local git status for the given working directory  */
const probeGit = (cwd: string): { branch: string, dirty: boolean, untracked: number, added: number, removed: number } => {
    const gitCmd = (...args: string[]): string =>
        execFileSync("git", [ "-C", cwd, ...args ],
            { stdio: [ "ignore", "pipe", "ignore" ], timeout: 1000 }).toString("utf8")
    try {
        const branch = gitCmd("rev-parse", "--abbrev-ref", "HEAD").trim()
        const porc   = gitCmd("status", "--porcelain")
        const lines     = porc.split("\n").filter((l) => l.length > 0)
        const untracked = lines.filter((l) => l.startsWith("??")).length
        const dirty     = lines.length > 0
        let added   = 0
        let removed = 0
        try {
            const shortstat = gitCmd("diff", "--shortstat", "HEAD")
            const mAdd = shortstat.match(/(\d+)\s+insertion/)
            const mDel = shortstat.match(/(\d+)\s+deletion/)
            if (mAdd !== null) added   = Number.parseInt(mAdd[1]!, 10)
            if (mDel !== null) removed = Number.parseInt(mDel[1]!, 10)
        }
        catch (_e) {
            /*  no HEAD yet or git failure; leave counts at 0  */
        }
        return { branch, dirty, untracked, added, removed }
    }
    catch (_e) {
        return { branch: "", dirty: false, untracked: 0, added: 0, removed: 0 }
    }
}

/*  probe local memory usage in bytes (used/total) using OS-portable helpers  */
const probeMemory = (): { used: number, total: number } => {
    try {
        const total = os.totalmem()
        const free  = os.freemem()
        return { used: total - free, total }
    }
    catch (_e) {
        return { used: 0, total: 0 }
    }
}

/*  command-line handling  */
export default class StatuslineCommand {
    constructor (private log: Log) {}

    /*  parse and validate the --tool option  */
    private parseTool (value: string): Tool {
        if (value !== "claude" && value !== "copilot" && value !== "codex")
            throw new InvalidArgumentError(`invalid --tool value: "${value}" (expected "claude", "copilot", or "codex")`)
        return value
    }

    /*  register commands  */
    register (program: Command): void {
        /*  default for --tool derived from ASE_TOOL environment variable  */
        const envTool  = process.env.ASE_TOOL ?? ""
        const toolDflt = envTool !== "" ? this.parseTool(envTool) : "claude"

        program
            .command("statusline")
            .description("Render Anthropic Claude Code CLI or GitHub Copilot CLI statusline from stdin JSON")
            .option("-t, --tool <tool>",
                "target tool (\"claude\" or \"copilot\"; \"codex\" is unsupported)", toolDflt)
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
                "one or more template lines with %u %p %T %s %m %e %t %O %P %c %C %a %r " +
                "%S %D %W %Q %H %X %b %g %G %d %M %V placeholders and <color>...</color> markup " +
                "(color: black, red, green, yellow, blue, magenta, cyan, white, default) " +
                "(default: single line \"%m %e %t\")")
            .action(async (lines: string[], opts: StatuslineOpts) => {
                /*  validate target tool  */
                const tool = this.parseTool(opts.tool)

                /*  OpenAI Codex CLI has no scriptable custom statusline
                    mechanism, so reject the request explicitly  */
                if (tool === "codex")
                    throw new Error("OpenAI Codex CLI does not support a custom statusline")

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

                /*  normalize Copilot CLI's top-level "cwd" into the
                    "workspace.current_dir" structure shared with Anthropic Claude Code CLI  */
                if (tool === "copilot"
                    && (data.workspace?.current_dir === undefined || data.workspace.current_dir === "")
                    && typeof data.cwd === "string" && data.cwd !== "") {
                    data.workspace = { ...(data.workspace ?? {}), current_dir: data.cwd }
                }

                /*  determine effective terminal width and budget  */
                const width  = opts.width > 0 ? opts.width : detectTermWidth()
                const budget = width > 0 ? width - 2 * opts.margin : 0

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

                /*  active <color> span state: when non-null, each emitted chunk is colored
                    individually and passed straight through appendOutput, so column
                    accounting and line-wrapping continue to work per-chunk inside the span
                    instead of treating the whole colored run as one atomic chunk  */
                let span: { color: string } | null = null
                const emit = (chunk: string): void => {
                    if (span !== null && span.color !== "default")
                        appendOutput((c[span.color as ForegroundColorName])(chunk))
                    else
                        appendOutput(chunk)
                }

                /*  helper to build the "<icon> <label>: " prefix subject to --no-icons / --no-labels  */
                const prefix = (icon: string, label: string): string => {
                    const i = opts.icons  ? `${icon} `   : ""
                    const l = opts.labels ? `${label}: ` : ""
                    return `${i}${l}`
                }

                /*  determine effective template lines  */
                const tmpl = lines.length > 0 ? lines : [ "%m %e %t" ]

                /*  lazy memoized probes for cross-renderer values: each is computed at most
                    once per run and only when first requested by a renderer (or by the
                    post-loop tmux publish for the Config cascade)  */
                let sessCache: string | null = null
                const getSession = (): string => {
                    if (sessCache === null)
                        sessCache = data.session_id ?? "unknown"
                    return sessCache
                }
                let cfgCache: { taskId: string, persona: string } | null = null
                const getCfg = (): { taskId: string, persona: string } => {
                    if (cfgCache !== null)
                        return cfgCache
                    let taskId  = process.env.ASE_TASK_ID       ?? ""
                    let persona = process.env.ASE_PERSONA_STYLE ?? ""
                    try {
                        const cfg = new Config("config", configSchema, this.log,
                            parseScope(`session:${getSession()}`))
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
                    cfgCache = { taskId, persona }
                    return cfgCache
                }
                let gitCache: ReturnType<typeof probeGit> | null = null
                const getGit = (): ReturnType<typeof probeGit> => {
                    if (gitCache === null)
                        gitCache = probeGit(data.workspace?.current_dir ?? "")
                    return gitCache
                }
                let memCache: ReturnType<typeof probeMemory> | null = null
                const getMem = (): ReturnType<typeof probeMemory> => {
                    if (memCache === null)
                        memCache = probeMemory()
                    return memCache
                }

                /*  identifier to renderer map: each callback fetches its own information
                    directly from data (or via the lazy helpers above for shared values)  */
                const renderers: Record<string, () => void> = {
                    /*  ==== SCOPE ====  */
                    u: () => {
                        const user = process.env.USER ?? process.env.LOGNAME ?? "unknown"
                        emit(`${prefix("※", "user")}${c.bold(user)}`)
                    },
                    p: () => {
                        const dir = path.basename(data.workspace?.current_dir ?? "")
                        emit(`${prefix("⚑", "project")}${c.bold(dir)}`)
                    },
                    T: () => {
                        const { taskId } = getCfg()
                        if (taskId !== "")
                            emit(`${prefix("◉", "task")}${c.bold(taskId)}`)
                    },
                    s: () => emit(`${prefix("⏻", "session")}${c.bold(getSession())}`),

                    /*  ==== MODEL ====  */
                    m: () => {
                        const model = data.model?.display_name ?? ""
                        emit(`${prefix("⚙", "model")}${c.bold(model)}`)
                    },
                    e: () => {
                        const effort = data.effort?.level ?? "unknown"
                        emit(`${prefix("⚒", "effort")}${c.bold(effort)}`)
                    },
                    t: () => {
                        const thinking = data.thinking?.enabled === true ? "yes" : "no"
                        emit(`${prefix("⚛", "thinking")}${c.bold(thinking)}`)
                    },

                    /*  ==== OUTPUT ====  */
                    O: () => {
                        const styleName = data.output_style?.name ?? ""
                        if (styleName !== "")
                            emit(`${prefix("≡", "style")}${c.bold(styleName)}`)
                    },
                    P: () => {
                        const { persona } = getCfg()
                        if (persona !== "")
                            emit(`${prefix("☯", "persona")}${c.bold(persona)}`)
                    },

                    /*  ==== CONTEXT ====  */
                    c: () => {
                        const pct     = Math.min(100, Math.max(0, Math.floor(data.context_window?.used_percentage ?? 0)))
                        const barSize = 20
                        const filled  = Math.round(pct / 100 * barSize)
                        const bar     = "█".repeat(filled) + "░".repeat(barSize - filled)
                        emit(`${prefix("◔", "context")}${bar} ${pct}%`)
                    },
                    C: () => {
                        const pct     = data.context_window?.used_percentage ?? 0
                        const tokensCur =
                            (data.context_window?.total_input_tokens  ?? 0) +
                            (data.context_window?.total_output_tokens ?? 0)
                        const tokensLim = pct > 0 && tokensCur > 0 ? Math.round(tokensCur * 100 / pct) : 0
                        if (tokensLim > 0)
                            emit(`${prefix("◆", "tokens")}${c.bold(formatTokens(tokensCur) + "/" + formatTokens(tokensLim))}`)
                    },

                    /*  ==== RATE LIMITS ====  */
                    S: () => {
                        const pct5h = data.rate_limits?.five_hour?.used_percentage
                        if (pct5h !== undefined)
                            emit(`${prefix("⏲", "session-usage")}${c.bold(`${pct5h.toFixed(1)}%`)}`)
                    },
                    D: () => {
                        const until5h = data.rate_limits?.five_hour?.resets_at
                        const s       = formatTimeUntil(until5h)
                        if (s !== "")
                            emit(`${prefix("⏱", "session-resets")}${c.bold(s)}`)
                    },
                    W: () => {
                        const pctWk = data.rate_limits?.seven_day?.used_percentage
                        if (pctWk !== undefined)
                            emit(`${prefix("⏲", "weekly-usage")}${c.bold(`${pctWk.toFixed(1)}%`)}`)
                    },
                    Q: () => {
                        const untilWk = data.rate_limits?.seven_day?.resets_at
                        const s       = formatTimeUntil(untilWk)
                        if (s !== "")
                            emit(`${prefix("⏱", "weekly-resets")}${c.bold(s)}`)
                    },

                    /*  ==== COSTS ====  */
                    H: () => {
                        const sessDurMs = data.cost?.total_duration_ms ?? 0
                        if (sessDurMs > 0)
                            emit(`${prefix("⏱", "elapsed")}${c.bold(formatHoursMinutes(sessDurMs))}`)
                    },
                    X: () => {
                        const sessCost = data.cost?.total_cost_usd
                        if (sessCost !== undefined)
                            emit(`${prefix("$", "cost")}${c.bold(formatCostUsd(sessCost))}`)
                    },

                    /*  ==== VERSION CONTROL ====  */
                    a: () => {
                        const linesAdded = data.cost?.total_lines_added ?? 0
                        emit(`${prefix("⊕", "added")}${c.bold(String(linesAdded))}`)
                    },
                    r: () => {
                        const linesRemoved = data.cost?.total_lines_removed ?? 0
                        emit(`${prefix("⊖", "removed")}${c.bold(String(linesRemoved))}`)
                    },
                    b: () => {
                        const g     = getGit()
                        const label = g.branch !== "" ? g.branch : "no git"
                        emit(`${prefix("⎇", "branch")}${c.bold(label)}`)
                    },
                    g: () => {
                        const g = getGit()
                        if (g.branch !== "")
                            emit(`${prefix("±", "changed")}${c.bold(`+${g.added}/-${g.removed}`)}`)
                    },
                    G: () => {
                        const g = getGit()
                        if (g.branch !== "")
                            emit(`${prefix("⁈", "untracked")}${c.bold(String(g.untracked))}`)
                    },
                    d: () => {
                        const cwd = data.workspace?.current_dir ?? ""
                        if (cwd !== "")
                            emit(`${prefix("▶", "cwd")}${c.bold(cwd)}`)
                    },

                    /*  ==== RESOURCES ====  */
                    M: () => {
                        const m = getMem()
                        if (m.total > 0)
                            emit(`${prefix("⛁", "mem")}${c.bold(`${formatBytes(m.used)}/${formatBytes(m.total)}`)}`)
                    },

                    /*  ==== VERSIONS ====  */
                    V: () => {
                        const ccVersion  = data.version ?? ""
                        const aseVersion = pkg.version  ?? ""
                        let version = ""
                        if (ccVersion !== "")
                            version += `claude/${ccVersion}`
                        if (aseVersion !== "")
                            version += `${version !== "" ? " " : ""}ase/${aseVersion}`
                        emit(`${prefix("⎈", "version")}${c.bold(version)}`)
                    }
                }

                /*  walk each template line and render  */
                const closeSpan = () => {
                    span = null
                }
                for (const line of tmpl) {
                    let i = 0
                    while (i < line.length) {
                        const ch   = line[i]!
                        const next = line[i + 1]
                        if (ch === "<") {
                            const m = line.slice(i).match(/^<(\/?)([a-z]+)>/)
                            if (m !== null && COLORS.has(m[2]!)) {
                                if (m[1] === "/")
                                    closeSpan()
                                else if (span === null)
                                    span = { color: m[2]! }
                                i += m[0].length
                                continue
                            }
                        }
                        if (ch === "%" && next !== undefined && renderers[next] !== undefined) {
                            renderers[next]!()
                            i += 2
                        }
                        else {
                            emit(ch)
                            i += 1
                        }
                    }
                    /*  flush any unterminated span at end of line  */
                    closeSpan()
                    out += "\n"
                    col  = 0
                }

                /*  send output  */
                await writeStdout(out)

                /*  optionally publish task id to the calling tmux pane as a per-pane user
                    option, so something (like claudeX) can pick it up via #{@ase_task_id}  */
                if (process.env.TMUX !== undefined
                    && process.env.TMUX !== ""
                    && process.env.TMUX_PANE !== undefined
                    && process.env.TMUX_PANE !== "") {
                    const { taskId } = getCfg()
                    const tid = taskId !== "" ? taskId : "default"
                    execaSync("tmux", [ "set-option", "-p", "-t", process.env.TMUX_PANE,
                        "@ase_task_id", tid ], { stdio: "ignore", reject: false })
                }
            })
    }
}
