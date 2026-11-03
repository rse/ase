/*
**  ASE review benchmark -- runner building blocks (SDD-005 to SDD-008, SDD-013, SDD-014)
*/

import fs                    from "node:fs"
import os                    from "node:os"
import path                  from "node:path"
import { spawn, spawnSync }  from "node:child_process"

import { REPO_DIR, BENCH_DIR, git } from "./common.mjs"

/*  the fixed skill invocation (PRD approval decision)  */
export const PROMPT = "/ase:ase-repo-review -c HEAD -S LOW"

/*  tool permissions (TP planning decision)  */
export const ALLOWED_TOOLS = [
    "Read", "Grep", "Glob", "Skill", "Task", "Agent", "ToolSearch",
    "Bash(git:*)", "Bash(cd:*)", "PowerShell(git:*)", "PowerShell(cd:*)",
    "mcp__ase__*"
]
export const DISALLOWED_TOOLS = [ "Edit", "Write", "NotebookEdit", "WebFetch", "WebSearch" ]

/*  MCP configuration with exactly the ASE server (SDD-005, revision 1)  */
export function mcpConfig () {
    return { mcpServers: { ase: { command: process.execPath, args: [ path.join(REPO_DIR, "tool", "bin", "ase"), "mcp" ] } } }
}

/*  command-line arguments of the claude invocation (SDD-005)  */
export function claudeArgs ({ model, budget, mcpConfigFile = "{ase.json}" }) {
    return [
        "-p", PROMPT,
        "--plugin-dir", path.join(REPO_DIR, "plugin"),
        "--model", model,
        "--output-format", "stream-json",
        "--verbose",
        "--max-budget-usd", String(budget),
        "--no-session-persistence",
        "--setting-sources", "",
        "--strict-mcp-config",
        "--mcp-config", mcpConfigFile,
        "--permission-mode", "dontAsk",
        "--allowedTools", ...ALLOWED_TOOLS,
        "--disallowedTools", ...DISALLOWED_TOOLS
    ]
}

/*  find Git Bash on Windows (Claude Code needs it for its Bash tool)  */
function findGitBash (env) {
    const candidates = []
    if (env.SHELL && /bash\.exe$/i.test(env.SHELL))
        candidates.push(env.SHELL)
    const res = spawnSync("where", [ "git" ], { encoding: "utf8", env })
    for (const hit of (res.stdout || "").split(/\r?\n/).filter(Boolean)) {
        let dir = path.dirname(hit)
        for (let i = 0; i < 3; i++) {
            dir = path.dirname(dir)
            candidates.push(path.join(dir, "bin", "bash.exe"))
        }
    }
    return candidates.find((c) => fs.existsSync(c)) ?? null
}

/*  environment of the child process: no inherited session or endpoint variables  */
export function childEnv ({ baseUrl = null, authTokenEnv = null, base = process.env, platform = process.platform } = {}) {
    const env = { ...base }
    for (const name of Object.keys(env))
        if (/^(CLAUDE|ANTHROPIC_|npm_)/i.test(name) && name !== "CLAUDE_CODE_GIT_BASH_PATH")
            delete env[name]
    const pathKey = Object.keys(env).find((k) => k.toUpperCase() === "PATH") ?? "PATH"
    env[pathKey] = path.join(REPO_DIR, "tool", "bin") + path.delimiter + (env[pathKey] ?? "")
    if (platform === "win32" && !env.CLAUDE_CODE_GIT_BASH_PATH) {
        const bash = findGitBash(env)
        if (bash)
            env.CLAUDE_CODE_GIT_BASH_PATH = bash
    }
    if (baseUrl)
        env.ANTHROPIC_BASE_URL = baseUrl
    if (authTokenEnv) {
        const token = base[authTokenEnv]
        if (!token)
            throw new Error(`Umgebungsvariable ${authTokenEnv} ist nicht gesetzt`)
        env.ANTHROPIC_AUTH_TOKEN = token
    }
    return env
}

/*  names of the environment variables relevant for the protocol (never values)  */
export function envSummary (env) {
    return Object.keys(env).filter((k) => /^(ANTHROPIC_|CLAUDE)/i.test(k)).sort()
}

/*  program to start: BENCH_CLAUDE_BIN or claude; a Node script runs through node  */
export function claudeProgram (bin = process.env.BENCH_CLAUDE_BIN || "claude") {
    return /\.(m?js)$/i.test(bin) ? { program: process.execPath, pre: [ bin ] } : { program: bin, pre: [] }
}

/*  kill a process tree (SDD-007)  */
export function killTree (child) {
    if (!child.pid)
        return
    if (process.platform === "win32") {
        spawnSync("taskkill", [ "/pid", String(child.pid), "/T", "/F" ])
        return
    }
    try {
        process.kill(-child.pid, "SIGKILL")
    }
    catch (err) {
        child.kill("SIGKILL")
    }
}

/*  whether a process is still alive  */
export function isAlive (pid) {
    try {
        process.kill(pid, 0)
        return true
    }
    catch (err) {
        return err.code === "EPERM"
    }
}

/*  series budget: may another run start? (SDD-007); a run can overshoot its limit
    slightly before the CLI stops it, so a margin is reserved (CR-005)  */
export const OVERSHOOT = 1.1
export function seriesAllows (spent, perRun, total) {
    return spent + perRun * OVERSHOOT <= total + 1e-9
}

/*  whether a plugin of the init event is built into the CLI itself  */
export function isBuiltinPlugin (p) {
    return typeof p === "object" && p !== null && (p.path === "builtin" || /@builtin$/.test(p.source ?? ""))
}

/*  isolation check of the init event (SDD-006, revision 1): built-in CLI plugins are
    allowed (and logged), any other plugin besides "ase" and any MCP server besides "ase" is not  */
export function checkInit (event) {
    const problems = []
    const plugins  = Array.isArray(event.plugins) ? event.plugins : []
    const name     = (p) => typeof p === "string" ? p : p.name
    for (const p of plugins)
        if (name(p) !== "ase" && !isBuiltinPlugin(p))
            problems.push(`fremdes Plugin geladen: ${name(p)}`)
    if (!plugins.some((p) => name(p) === "ase"))
        problems.push("ASE-Plugin nicht geladen")
    const servers = Array.isArray(event.mcp_servers) ? event.mcp_servers : []
    for (const s of servers)
        if (s.name !== "ase")
            problems.push(`fremder MCP-Server geladen: ${s.name}`)
    const ase = servers.find((s) => s.name === "ase")
    if (!ase)
        problems.push("MCP-Server von ASE fehlt")
    else if (ase.status !== undefined && ase.status !== "connected")
        problems.push(`MCP-Server von ASE nicht verbunden: ${ase.status}`)
    return problems
}

/*  PIDs and command lines of running ASE processes of this working copy (R3)  */
export function aseProcesses () {
    const marker = path.join(REPO_DIR, "tool").toLowerCase()
    let rows = []
    if (process.platform === "win32") {
        const res = spawnSync("powershell", [ "-NoProfile", "-NonInteractive", "-Command",
            "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | ForEach-Object { \"$($_.ProcessId)`t$($_.CommandLine)\" }" ],
            { encoding: "utf8", windowsHide: true })
        rows = (res.stdout || "").split(/\r?\n/)
    }
    else {
        const res = spawnSync("ps", [ "-eo", "pid=,args=" ], { encoding: "utf8" })
        rows = (res.stdout || "").split("\n").map((l) => l.trim().replace(/^(\d+)\s+/, "$1\t"))
    }
    return rows.map((l) => l.split("\t")).filter(([ pid, cmd ]) => /^\d+$/.test(pid ?? "") && (cmd ?? "").toLowerCase().includes(marker))
        .map(([ pid, cmd ]) => ({ pid: Number(pid), cmd: cmd.trim() }))
}

/*  kill ASE processes started during the run (R3)  */
export function killLeftovers (before) {
    const known = new Set(before.map((p) => p.pid))
    const left  = aseProcesses().filter((p) => !known.has(p.pid) && p.pid !== process.pid)
    for (const p of left) {
        if (process.platform === "win32")
            killTree({ pid: p.pid })
        else {
            try {
                process.kill(p.pid, "SIGKILL")
            }
            catch (err) {
                /*  already gone  */
            }
        }
    }
    return left.map((p) => p.cmd.replace(/\s+/g, " ").slice(0, 200))
}

/*  collect all strings of a tool input (any tool, including MCP and sub-agent prompts, CR-004)  */
function toolStrings (input) {
    const out  = []
    const walk = (v) => {
        if (typeof v === "string")
            out.push(v)
        else if (Array.isArray(v))
            v.forEach(walk)
        else if (v !== null && typeof v === "object")
            Object.values(v).forEach(walk)
    }
    walk(input)
    return out
}

/*  contamination check of all tool calls (SDD-006): any access to the benchmark itself or
    to the ASE repository outside of plugin/ and tool/ (which the run legitimately uses)  */
export function checkContamination (events) {
    const problems = []
    /*  normalize Windows and Git Bash forms ("C:\x", "C:/x", "/c/x") to "c:/x" (CR-004)  */
    const norm     = (p) => p.replace(/\\/g, "/").toLowerCase().replace(/(^|[\s"'=(])\/([a-z])\//g, "$1$2:/")
    const bench    = norm(BENCH_DIR)
    const repo     = norm(REPO_DIR)
    const allowed  = [ norm(path.join(REPO_DIR, "plugin")), norm(path.join(REPO_DIR, "tool")) ]
    for (const ev of events) {
        const content = ev?.message?.content
        if (ev.type !== "assistant" || !Array.isArray(content))
            continue
        for (const block of content) {
            if (block.type !== "tool_use")
                continue
            for (const s of toolStrings(block.input)) {
                const n = norm(s)
                if (/sollliste|benchmark\/repo-review|solution\//.test(n) || n.includes(bench))
                    problems.push(`${block.name}: Zugriff auf ${s}`)
                else if (n.includes(repo) && !allowed.some((a) => n.includes(a)))
                    problems.push(`${block.name}: Zugriff auf das ASE-Repository ${s}`)
            }
        }
    }
    return [ ...new Set(problems) ]
}

/*  facts from the transcript: result event, reported models, denials  */
export function transcriptFacts (events) {
    const result = [ ...events ].reverse().find((e) => e.type === "result") ?? null
    const init   = events.find((e) => e.type === "system" && e.subtype === "init") ?? null
    const models = new Set()
    if (result?.modelUsage)
        for (const m of Object.keys(result.modelUsage))
            models.add(m)
    if (init?.model)
        models.add(init.model)
    const plugins = Array.isArray(init?.plugins) ? init.plugins : []
    return {
        result,
        init,
        plugins:  plugins.map((p) => typeof p === "string" ? p : `${p.name}${isBuiltinPlugin(p) ? " (builtin)" : ""}`).sort(),
        mcp:      (Array.isArray(init?.mcp_servers) ? init.mcp_servers : []).map((s) => `${s.name}:${s.status}`).sort(),
        reported: [ ...models ].sort(),
        cost:     typeof result?.total_cost_usd === "number" ? result.total_cost_usd : null,
        denials:  Array.isArray(result?.permission_denials) ? result.permission_denials.length : null,
        text:     typeof result?.result === "string" ? result.result : null
    }
}

/*  version of the Claude Code CLI  */
export function cliVersion (program, pre) {
    const res = spawnSync(program, [ ...pre, "--version" ], { encoding: "utf8" })
    return res.status === 0 ? res.stdout.trim() : null
}

/*  ASE version and commit of the working copy  */
export function aseInfo () {
    const manifest = JSON.parse(fs.readFileSync(path.join(REPO_DIR, "plugin", ".claude-plugin", "plugin.json"), "utf8"))
    let commit = null, dirty = null
    try {
        commit = git(REPO_DIR, [ "rev-parse", "HEAD" ]).trim()
        dirty  = git(REPO_DIR, [ "status", "--porcelain", "--", "plugin", "tool" ]).trim() !== ""
    }
    catch (err) {
        commit = null
    }
    return { version: manifest.version, commit, arbeitskopie_geaendert: dirty }
}

/*  candidate locations of a per-user ASE configuration (protocol only)  */
export function userAseConfig () {
    const home = os.homedir()
    const candidates = [
        process.env.XDG_CONFIG_HOME && path.join(process.env.XDG_CONFIG_HOME, "ase", "config.yaml"),
        path.join(home, ".config", "ase", "config.yaml"),
        process.env.APPDATA && path.join(process.env.APPDATA, "ase", "config.yaml"),
        process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "ase", "config.yaml"),
        path.join(home, "Library", "Preferences", "ase", "config.yaml")
    ].filter(Boolean)
    return candidates.filter((c) => fs.existsSync(c))
}

/*  create a fresh result folder; never overwrite (SDD-008)  */
export function createRunDir (parent, name) {
    const dir = path.join(parent, name)
    if (fs.existsSync(dir))
        throw new Error(`Ergebnisordner existiert bereits: ${dir}`)
    fs.mkdirSync(dir, { recursive: true })
    return dir
}

/*  UTC time stamp for folder names  */
export function stamp (date = new Date()) {
    return date.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")
}

/*  short model name for folder names  */
export function modelShort (model) {
    return model.replace(/^claude-/, "").replace(/[^A-Za-z0-9.-]/g, "_")
}

/*  run the child and collect its stream-json output (SDD-006, SDD-007)  */
export function runChild ({ program, args, cwd, env, timeoutMs, transcriptFile, stderrFile, onInit, graceMs = 5000 }) {
    return new Promise((resolve) => {
        const out     = fs.createWriteStream(transcriptFile)
        const err     = fs.createWriteStream(stderrFile)
        const events  = []
        let   stopped = null
        let   buffer  = ""
        let   done    = false
        let   grace   = null
        let   child   = null
        let   timer   = null
        const finish = (code) => {
            if (done)
                return
            done = true
            clearTimeout(timer)
            clearTimeout(grace)
            handle(buffer)
            buffer = ""
            out.end()
            err.end()
            resolve({ events, exitCode: code, stopped, pid: child?.pid ?? null })
        }
        /*  resolve even if a surviving descendant keeps the pipes open (CR-006)  */
        const armGrace = () => {
            if (grace === null)
                grace = setTimeout(() => finish(null), graceMs)
        }
        const handle = (line) => {
            if (line.trim() === "")
                return
            let ev
            try {
                ev = JSON.parse(line)
            }
            catch (e) {
                return
            }
            events.push(ev)
            if (ev.type === "system" && ev.subtype === "init" && stopped === null) {
                const problems = onInit(ev)
                if (problems.length > 0) {
                    stopped = { status: "fehler", reason: "isolation", details: problems }
                    killTree(child)
                    armGrace()
                }
            }
        }
        try {
            child = spawn(program, args, {
                cwd, env, stdio: [ "ignore", "pipe", "pipe" ],
                detached: process.platform !== "win32", windowsHide: true
            })
        }
        catch (e) {
            stopped = { status: "fehler", reason: "start", details: [ e.message ] }
            finish(null)
            return
        }
        timer = setTimeout(() => {
            stopped = stopped ?? { status: "abgebrochen", reason: "zeit" }
            killTree(child)
            armGrace()
        }, timeoutMs)
        /*  decode as a stream, so multibyte characters split across chunks stay intact (CR-002)  */
        child.stdout.setEncoding("utf8")
        child.stdout.on("data", (text) => {
            out.write(text)
            buffer += text
            let i
            while ((i = buffer.indexOf("\n")) >= 0) {
                handle(buffer.slice(0, i))
                buffer = buffer.slice(i + 1)
            }
        })
        child.stderr.on("data", (chunk) => err.write(chunk))
        child.on("error", (e) => {
            stopped = stopped ?? { status: "fehler", reason: "start", details: [ e.message ] }
            finish(null)
        })
        child.on("exit", () => {
            clearTimeout(timer)
            armGrace()
        })
        child.on("close", (code) => finish(code))
    })
}
