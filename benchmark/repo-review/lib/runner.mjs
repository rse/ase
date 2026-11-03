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
    "Read", "Grep", "Glob", "Skill", "Task",
    "Bash(git diff:*)", "Bash(git log:*)", "Bash(git show:*)", "Bash(git rev-parse:*)",
    "Bash(git rev-list:*)", "Bash(git merge-base:*)", "Bash(git status:*)",
    "Bash(git branch:*)", "Bash(git for-each-ref:*)",
    "mcp__plugin_ase_ase__*"
]
export const DISALLOWED_TOOLS = [ "Edit", "Write", "NotebookEdit", "WebFetch", "WebSearch" ]

/*  command-line arguments of the claude invocation (SDD-005)  */
export function claudeArgs ({ model, budget }) {
    return [
        "-p", PROMPT,
        "--plugin-dir", path.join(REPO_DIR, "plugin"),
        "--model", model,
        "--output-format", "stream-json",
        "--verbose",
        "--max-budget-usd", String(budget),
        "--no-session-persistence",
        "--setting-sources", "",
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

/*  series budget: may another run start? (SDD-007)  */
export function seriesAllows (spent, perRun, total) {
    return spent + perRun <= total + 1e-9
}

/*  isolation check of the init event (SDD-006)  */
export function checkInit (event) {
    const problems = []
    const plugins  = Array.isArray(event.plugins) ? event.plugins : []
    for (const p of plugins) {
        const name = typeof p === "string" ? p : p.name
        if (name !== "ase")
            problems.push(`fremdes Plugin geladen: ${name}`)
    }
    if (!plugins.some((p) => (typeof p === "string" ? p : p.name) === "ase"))
        problems.push("ASE-Plugin nicht geladen")
    const servers = Array.isArray(event.mcp_servers) ? event.mcp_servers : []
    if (!servers.some((s) => /ase/i.test(s.name ?? "")))
        problems.push("MCP-Server von ASE fehlt")
    return problems
}

/*  collect strings of a tool input that may name paths  */
function toolStrings (input) {
    const out = []
    for (const key of [ "file_path", "path", "pattern", "command", "notebook_path", "glob" ])
        if (typeof input?.[key] === "string")
            out.push(input[key])
    return out
}

/*  contamination check of all tool calls (SDD-006): any access to the benchmark itself or
    to the ASE repository outside of plugin/ and tool/ (which the run legitimately uses)  */
export function checkContamination (events) {
    const problems = []
    const norm     = (p) => p.replace(/\\/g, "/").toLowerCase()
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
    return {
        result,
        init,
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
export function runChild ({ program, args, cwd, env, timeoutMs, transcriptFile, stderrFile, onInit }) {
    return new Promise((resolve) => {
        const out     = fs.createWriteStream(transcriptFile)
        const err     = fs.createWriteStream(stderrFile)
        const events  = []
        let   stopped = null
        let   buffer  = ""
        const child = spawn(program, args, {
            cwd, env, stdio: [ "ignore", "pipe", "pipe" ],
            detached: process.platform !== "win32", windowsHide: true
        })
        const timer = setTimeout(() => {
            stopped = { status: "abgebrochen", reason: "zeit" }
            killTree(child)
        }, timeoutMs)
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
                }
            }
        }
        child.stdout.on("data", (chunk) => {
            out.write(chunk)
            buffer += chunk.toString("utf8")
            let i
            while ((i = buffer.indexOf("\n")) >= 0) {
                handle(buffer.slice(0, i))
                buffer = buffer.slice(i + 1)
            }
        })
        child.stderr.on("data", (chunk) => err.write(chunk))
        child.on("error", (e) => {
            clearTimeout(timer)
            stopped = stopped ?? { status: "fehler", reason: "start", details: [ e.message ] }
        })
        child.on("close", (code) => {
            clearTimeout(timer)
            handle(buffer)
            out.end()
            err.end()
            resolve({ events, exitCode: code, stopped, pid: child.pid })
        })
    })
}
