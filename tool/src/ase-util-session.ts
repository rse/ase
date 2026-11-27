/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import fs                  from "node:fs"
import os                  from "node:os"
import path                from "node:path"
import readline            from "node:readline"

import { Command, Option } from "commander"
import { z }               from "zod"
import YAML                from "yaml"

import type { McpServer }  from "@modelcontextprotocol/sdk/server/mcp.js"

import { writeStdout }     from "./ase-lib-stdio.js"
import { toolSpecs }       from "./ase-setup-common.js"
import type { Tool }       from "./ase-setup-common.js"

/*  the supported agent tools (in their lookup order), output formats, and event kinds  */
export const sessionTools   = [ "claude", "codex", "copilot" ] as const
export const sessionFormats = [ "md", "yaml", "json" ] as const
export const sessionKinds   = [ "prompt", "dispatch", "reply", "tool-call", "tool-error", "compaction", "error" ] as const
export type SessionFormat   = typeof sessionFormats[number]
export type SessionKind     = typeof sessionKinds[number]

/*  the maximum length of the text of an event  */
const TEXT_MAX = 200

/*  the maximum number of most recent rollout files of OpenAI Codex CLI
    inspected when determining the latest session of the project  */
const LATEST_MAX = 200

/*  the maximum number of first records of a transcript of Anthropic
    Claude Code CLI inspected for its working directory  */
const CWD_LINES_MAX = 20

/*  the maximum number of transcript file results kept in the cache  */
const FILE_CACHE_MAX = 64

/*  the result of reading a session: its metadata, its transcript files,
    and the (filtered and paged) normalized events of its timeline  */
export type SessionFile   = { role: "main" | "subagent", path: string, lines: number, bytes: number }
export type SessionEvent  = { path: string, line: number, time: string, kind: SessionKind, text: string }
export type SessionUsage  = { input: number, output: number, cacheRead: number, cacheWrite: number }
export type SessionRecord = {
    tool:     Tool
    id:       string
    cwd:      string
    version:  string
    start:    string
    end:      string
    models:   string[]
    usage:    SessionUsage | null
    files:    SessionFile[]
    counts:   Record<SessionKind, number>
    total:    number
    offset:   number
    events:   SessionEvent[]
    warnings: string[]
}

/*  the options of reading a session  */
export type SessionOptions = {
    id?:     string
    tool?:   Tool
    kinds?:  SessionKind[]
    offset?: number
    limit?:  number
}

/*  a transcript record of any of the agent tools, whose formats are internal
    to the agent tools and change between their versions  */
type Rec = Record<string, any>

/*  the reading state of a session  */
type State = {
    record:      SessionRecord
    events:      SessionEvent[]
    models:      Set<string>
    claudeUsage: Map<string, SessionUsage>
}

/*  the result of reading a single transcript file, cached by its path
    and stamped by its size and modification time, as the parallel paging
    through a session re-reads the same unchanged files over and over  */
type FileResult = {
    stamp:      string
    lines:      number
    bytes:      number
    st:         State
    codexUsage: SessionUsage | null
}
const fileCache = new Map<string, FileResult>()

/*  create a fresh reading state  */
const makeState = (tool: Tool): State => ({
    record: {
        tool, id: "", cwd: "", version: "", start: "", end: "", models: [], usage: null, files: [],
        counts: Object.fromEntries(sessionKinds.map((kind) => [ kind, 0 ])) as Record<SessionKind, number>,
        total: 0, offset: 0, events: [], warnings: []
    },
    events:      [],
    models:      new Set<string>(),
    claudeUsage: new Map<string, SessionUsage>()
})

/*  tolerant field accessors and text helpers  */
const str  = (value: unknown): string => typeof value === "string" ? value : ""
const num  = (value: unknown): number => typeof value === "number" && Number.isFinite(value) ? value : 0
const clip = (text: string): string => {
    const flat = text.replace(/\s+/g, " ").trim()
    return flat.length > TEXT_MAX ? flat.slice(0, TEXT_MAX - 1) + "…" : flat
}
const texts = (content: unknown, types: string[]): string => {
    if (typeof content === "string")
        return content
    if (!Array.isArray(content))
        return ""
    return content.filter((block: Rec) => types.includes(str(block?.type)))
        .map((block: Rec) => str(block.text)).join(" ")
}
const parseRecord = (line: string): Rec | null => {
    try {
        const value: unknown = JSON.parse(line)
        return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Rec : null
    }
    catch {
        return null
    }
}

/*  tolerant filesystem accessors  */
const isFile = (file: string): boolean => {
    try {
        return fs.statSync(file).isFile()
    }
    catch {
        return false
    }
}
const mtimeOf = (file: string): number => {
    try {
        return fs.statSync(file).mtimeMs
    }
    catch {
        return 0
    }
}
const realOf = (file: string): string => {
    try {
        return fs.realpathSync(file)
    }
    catch {
        return file
    }
}
const listDir = (dir: string, recursive = false): string[] => {
    try {
        return fs.readdirSync(dir, { recursive, encoding: "utf8" }).map((name) => path.join(dir, name))
    }
    catch {
        return []
    }
}

/*  the home directory of an agent tool, below which it stores its sessions  */
const homeOf = (tool: Tool): string => {
    const env = { claude: "CLAUDE_CONFIG_DIR", codex: "CODEX_HOME", copilot: "COPILOT_HOME" }[tool]
    const dir = process.env[env] ?? ""
    return dir !== "" ? dir : path.join(os.homedir(), `.${tool}`)
}

/*  validate a session id to keep it safe as a path component  */
const validateId = (id: string): void => {
    if (!/^[A-Za-z0-9._-]+$/.test(id) || id === "." || id === "..")
        throw new Error(`session: invalid session id "${id}" (expected [A-Za-z0-9._-]+)`)
}

/*  the rollout files of OpenAI Codex CLI (active and archived ones)  */
const codexRollouts = (): string[] =>
    [ "sessions", "archived_sessions" ]
        .flatMap((sub) => listDir(path.join(homeOf("codex"), sub), true))
        .filter((file) => path.basename(file).startsWith("rollout-"))

/*  locate the transcript files of a session of an agent tool by its id  */
const locateById = (tool: Tool, id: string, warnings: string[]): SessionFile[] => {
    const file = (role: "main" | "subagent", file: string): SessionFile => ({ role, path: file, lines: 0, bytes: 0 })
    if (tool === "claude") {
        for (const dir of listDir(path.join(homeOf(tool), "projects"))) {
            const main = path.join(dir, `${id}.jsonl`)
            if (!isFile(main))
                continue
            const subagents = listDir(path.join(dir, id, "subagents"), true)
                .filter((name) => name.endsWith(".jsonl") && isFile(name)).sort()
            return [ file("main", main), ...subagents.map((name) => file("subagent", name)) ]
        }
        return []
    }
    else if (tool === "codex") {
        const matches = codexRollouts().filter((name) =>
            path.basename(name).includes(`-${id}.`) || path.basename(name).includes(`-${id}_`))
        for (const name of matches.filter((name) => name.endsWith(".jsonl.zst")))
            warnings.push(`compressed rollout file "${name}" skipped (unsupported)`)
        return matches.filter((name) => name.endsWith(".jsonl") && isFile(name)).sort()
            .map((name) => file("main", name))
    }
    else {
        const dir = path.join(homeOf(tool), "session-state")
        for (const name of [ path.join(dir, id, "events.jsonl"), path.join(dir, `${id}.jsonl`) ])
            if (isFile(name))
                return [ file("main", name) ]
        return []
    }
}

/*  read the first record of a transcript file only  */
const readFirstRecord = async (file: string): Promise<Rec | null> => {
    const input = fs.createReadStream(file, { encoding: "utf8" })
    const rl    = readline.createInterface({ input, crlfDelay: Infinity })
    try {
        const first = await rl[Symbol.asyncIterator]().next()
        return first.done === true ? null : parseRecord(first.value)
    }
    finally {
        rl.close()
        input.destroy()
    }
}

/*  read the working directory of a transcript of Anthropic Claude Code CLI
    from the first of its first records carrying one  */
const readClaudeCwd = async (file: string): Promise<string> => {
    const input = fs.createReadStream(file, { encoding: "utf8" })
    const rl    = readline.createInterface({ input, crlfDelay: Infinity })
    let n = 0
    try {
        for await (const line of rl) {
            const cwd = str(parseRecord(line)?.cwd)
            if (cwd !== "" || ++n >= CWD_LINES_MAX)
                return cwd
        }
        return ""
    }
    finally {
        rl.close()
        input.destroy()
    }
}

/*  determine the most recent session of an agent tool whose working
    directory is (inside) the project directory  */
const latestOfTool = async (tool: Tool, projects: string[]): Promise<{ id: string, mtime: number } | null> => {
    const inside = (cwd: string) =>
        cwd !== "" && [ cwd, realOf(cwd) ].some((cand) =>
            projects.some((dir) => cand === dir || cand.startsWith(dir + path.sep)))
    let latest: { id: string, mtime: number } | null = null
    const beats    = (mtime: number) => latest === null || mtime > latest.mtime
    const consider = (id: string, mtime: number) => {
        if (id !== "" && beats(mtime))
            latest = { id, mtime }
    }
    if (tool === "claude") {
        const keys = projects.map((dir) => dir.replace(/[^a-zA-Z0-9]/g, "-"))
        for (const dir of listDir(path.join(homeOf(tool), "projects"))) {
            const base  = path.basename(dir)
            const exact = keys.some((key) => base === key || (key.length > 200 && base.startsWith(key.slice(0, 200))))

            /*  the key of a subdirectory extends the key of the project, but so
                does the key of a sibling with a dash, hence verify its cwd  */
            if (!exact && !keys.some((key) => base.startsWith(key + "-")))
                continue
            for (const file of listDir(dir).filter((name) => name.endsWith(".jsonl") && isFile(name))) {
                const mtime = mtimeOf(file)
                if (beats(mtime) && (exact || inside(await readClaudeCwd(file))))
                    consider(path.basename(file, ".jsonl"), mtime)
            }
        }
    }
    else if (tool === "codex") {
        const files = codexRollouts().filter((name) => name.endsWith(".jsonl") && isFile(name))
            .map((name) => ({ name, mtime: mtimeOf(name) }))
            .sort((a, b) => b.mtime - a.mtime).slice(0, LATEST_MAX)
        for (const { name, mtime } of files) {
            const rec = await readFirstRecord(name)
            if (rec?.type === "session_meta" && inside(str(rec.payload?.cwd))) {
                consider(str(rec.payload?.id), mtime)
                break
            }
        }
    }
    else {
        for (const dir of listDir(path.join(homeOf(tool), "session-state"))) {
            const events = path.join(dir, "events.jsonl")
            if (!isFile(events))
                continue
            let cwd = ""
            try {
                cwd = /^cwd:\s*(.+?)\s*$/m.exec(fs.readFileSync(path.join(dir, "workspace.yaml"), "utf8"))?.[1] ?? ""
                cwd = cwd.replace(/^(["'])(.*)\1$/, "$2")
            }
            catch {
                /*  a session without workspace metadata cannot be attributed to a project  */
            }
            if (inside(cwd))
                consider(path.basename(dir), mtimeOf(events))
        }
    }
    return latest
}

/*  normalize a transcript record of Anthropic Claude Code CLI  */
const readClaude = (rec: Rec, file: SessionFile, st: State, emit: (kind: SessionKind, text: string) => void): void => {
    const r = st.record
    if (r.cwd === "")
        r.cwd = str(rec.cwd)
    if (r.version === "")
        r.version = str(rec.version)

    /*  sidechain records in the main transcript are replay duplicates  */
    if (rec.isSidechain === true && file.role === "main")
        return
    const msg = rec.message ?? {}

    /*  the summary after a compaction is written by the harness, not typed by the user  */
    if (rec.type === "user" && rec.isMeta !== true && rec.isCompactSummary !== true) {
        if (Array.isArray(msg.content))
            for (const block of msg.content)
                if (block?.type === "tool_result" && block.is_error === true)
                    emit("tool-error", texts(block.content, [ "text" ]))
        /*  besides slash commands and bash inputs, tagged texts are injected
            by the harness (like task notifications), not typed by the user  */
        const text    = texts(msg.content, [ "text" ])
        const command = /<command-name>(.*?)<\/command-name>/s.exec(text)
        const args    = /<command-args>(.*?)<\/command-args>/s.exec(text)
        const bash    = /<bash-input>(.*?)<\/bash-input>/s.exec(text)
        const kind    = file.role === "subagent" ? "dispatch" : "prompt"
        if (command !== null)
            emit(kind, `${command[1]} ${args?.[1] ?? ""}`)
        else if (bash !== null)
            emit(kind, `!${bash[1]}`)
        else if (text !== "" && !text.trimStart().startsWith("<"))
            emit(kind, text)
    }
    else if (rec.type === "assistant") {
        const model = str(msg.model)
        if (model !== "" && model !== "<synthetic>")
            st.models.add(model)

        /*  one reply is written in several records sharing one message id and its usage  */
        if (typeof msg.usage === "object" && msg.usage !== null)
            st.claudeUsage.set(str(msg.id) !== "" ? str(msg.id) : str(rec.uuid), {
                input:      num(msg.usage.input_tokens),
                output:     num(msg.usage.output_tokens),
                cacheRead:  num(msg.usage.cache_read_input_tokens),
                cacheWrite: num(msg.usage.cache_creation_input_tokens)
            })
        if (rec.isApiErrorMessage === true)
            emit("error", texts(msg.content, [ "text" ]))
        else if (Array.isArray(msg.content)) {
            for (const block of msg.content) {
                if (block?.type === "text")
                    emit("reply", str(block.text))
                else if (block?.type === "tool_use")
                    emit("tool-call", `${str(block.name)} ${JSON.stringify(block.input ?? {})}`)
            }
        }
    }
    else if (rec.type === "system") {
        if (rec.subtype === "compact_boundary")
            emit("compaction", str(rec.content) !== "" ? str(rec.content) : "compact boundary")
        else if (rec.level === "error" || str(rec.subtype).includes("error"))
            emit("error", str(rec.content) !== "" ? str(rec.content) : str(rec.subtype))
    }
}

/*  normalize a transcript record of OpenAI Codex CLI  */
const readCodex = (rec: Rec, st: State, emit: (kind: SessionKind, text: string) => void): SessionUsage | null => {
    const r = st.record
    const p = rec.payload ?? {}
    if (rec.type === "session_meta" && r.cwd === "") {
        r.cwd     = str(p.cwd)
        r.version = str(p.cli_version)
    }
    else if (rec.type === "turn_context" && str(p.model) !== "")
        st.models.add(str(p.model))
    else if (rec.type === "response_item") {
        const type = str(p.type)
        if (type === "message") {
            const text = texts(p.content, [ "input_text", "output_text", "text" ])

            /*  injected environment context and instructions are no human prompts  */
            if (p.role === "user" && text !== "" && !/^\s*(<|# AGENTS\.md)/.test(text))
                emit("prompt", text)
            else if (p.role === "assistant" && text !== "")
                emit("reply", text)
        }
        else if (/^(function|custom_tool|local_shell)_call$/.test(type))
            emit("tool-call", `${str(p.name) !== "" ? str(p.name) : type} ` +
                `${str(p.arguments) !== "" ? str(p.arguments) : str(p.input) !== "" ? str(p.input) : JSON.stringify(p.action ?? {})}`)
        else if (type.endsWith("_call_output")) {
            const output = typeof p.output === "string" ? p.output : JSON.stringify(p.output ?? "")
            const json   = parseRecord(output)
            const match  = /^Exit code: (\d+)/m.exec(output)
            const code   = typeof json?.metadata?.exit_code === "number" ? json.metadata.exit_code : match !== null ? Number(match[1]) : 0
            if (code !== 0)
                emit("tool-error", `exit code ${code}: ${json !== null ? str(json.output) : output}`)
        }
    }
    else if (rec.type === "event_msg") {
        const type = str(p.type)
        if (type === "token_count" && typeof p.info?.total_token_usage === "object") {
            const u = p.info.total_token_usage
            return { input: num(u.input_tokens), output: num(u.output_tokens), cacheRead: num(u.cached_input_tokens), cacheWrite: 0 }
        }
        else if (type === "turn_aborted")
            emit("error", `turn aborted: ${str(p.reason)}`)
        else if (type === "error" || type === "stream_error")
            emit("error", str(p.message))
    }
    else if (rec.type === "compacted")
        emit("compaction", str(p.message) !== "" ? str(p.message) : "compacted")
    return null
}

/*  normalize a transcript record of GitHub Copilot CLI  */
const readCopilot = (rec: Rec, st: State, emit: (kind: SessionKind, text: string) => void): void => {
    const r    = st.record
    const d    = rec.data ?? {}
    const type = str(rec.type)
    if (type === "session.start") {
        if (r.cwd === "")
            r.cwd = str(d.context?.cwd)
        r.version = str(d.copilotVersion)
        if (str(d.selectedModel) !== "")
            st.models.add(str(d.selectedModel))
    }
    else if (type === "session.model_change" && str(d.newModel) !== "")
        st.models.add(str(d.newModel))
    else if (type === "user.message")
        emit("prompt", str(d.content))
    else if (type === "assistant.message")
        emit("reply", str(d.content))
    else if (type === "tool.execution_start")
        emit("tool-call", `${str(d.toolName)} ${JSON.stringify(d.arguments ?? {})}`)
    else if (type === "tool.execution_complete" && d.success === false)
        emit("tool-error", str(d.error?.message) !== "" ? str(d.error.message) :
            str(d.result?.content) !== "" ? str(d.result.content) : "tool execution failed")
    else if (type === "session.compaction_complete")
        emit("compaction", "compaction complete")
    else if (type === "session.error" || type === "abort" || type === "subagent.failed")
        emit("error", `${type}: ${str(d.message) !== "" ? str(d.message) :
            str(d.error?.message) !== "" ? str(d.error.message) : str(d.reason)}`)
}

/*  read a single transcript file line by line, as a line can be huge
    and a file can be gigabytes large, tolerating malformed lines  */
const readFile = async (tool: Tool, file: SessionFile): Promise<FileResult> => {
    const stat   = fs.statSync(file.path)
    const stamp  = `${tool}:${file.role}:${stat.size}:${stat.mtimeMs}`
    const cached = fileCache.get(file.path)
    if (cached !== undefined && cached.stamp === stamp)
        return cached
    const st    = makeState(tool)
    const input = fs.createReadStream(file.path, { encoding: "utf8" })
    const rl    = readline.createInterface({ input, crlfDelay: Infinity })
    let usage: SessionUsage | null = null
    let line      = 0
    let malformed = 0
    for await (const text of rl) {
        line++
        if (text.trim() === "")
            continue
        const rec = parseRecord(text)
        if (rec === null) {
            malformed++
            continue
        }
        const time = str(rec.timestamp)
        if (time !== "") {
            if (st.record.start === "" && file.role === "main")
                st.record.start = time
            if (time > st.record.end)
                st.record.end = time
        }
        const emit = (kind: SessionKind, text: string) => {
            const clipped = clip(text)
            if (clipped !== "")
                st.events.push({ path: file.path, line, time, kind, text: clipped })
        }
        if (tool === "claude")
            readClaude(rec, file, st, emit)
        else if (tool === "codex")
            usage = readCodex(rec, st, emit) ?? usage
        else
            readCopilot(rec, st, emit)
    }
    if (malformed > 0)
        st.record.warnings.push(`${malformed} malformed line(s) skipped in "${file.path}"`)
    const result: FileResult = { stamp, lines: line, bytes: stat.size, st, codexUsage: usage }
    fileCache.delete(file.path)
    fileCache.set(file.path, result)
    const oldest = fileCache.keys().next()
    if (fileCache.size > FILE_CACHE_MAX && oldest.done !== true)
        fileCache.delete(oldest.value)
    return result
}

/*  read a session of an agent tool: the session given by its id, else the
    most recent session of the project directory, of the given agent tool,
    else of the first agent tool knowing it  */
export const session = async (opts: SessionOptions = {}): Promise<SessionRecord> => {
    const id       = opts.id ?? ""
    const tools    = opts.tool !== undefined ? [ opts.tool ] : [ ...sessionTools ]
    const warnings = [] as string[]
    let tool: Tool | null = null
    let files: SessionFile[] = []
    let sid = id
    if (id !== "") {
        validateId(id)
        for (const candidate of tools) {
            files = locateById(candidate, id, warnings)
            if (files.length > 0) {
                tool = candidate
                break
            }
        }
        if (tool === null)
            throw new Error(`session: no transcript of session "${id}" found in the session stores of ` +
                tools.map((candidate) => `${candidate} (${homeOf(candidate)})`).join(", ") +
                (warnings.length > 0 ? ` -- ${warnings.join("; ")}` : ""))
    }
    else {
        /*  the agent tools record the logical working directory, which can
            differ from the physical one of the process (e.g. "/tmp" on macOS)  */
        const cwd      = process.cwd()
        const pwd      = process.env.PWD ?? ""
        const projects = [ ...new Set([ cwd, realOf(cwd),
            ...(pwd !== "" && realOf(pwd) === realOf(cwd) ? [ pwd ] : []) ]) ]
        let latest: { tool: Tool, id: string, mtime: number } | null = null
        for (const candidate of tools) {
            const found = await latestOfTool(candidate, projects)
            if (found !== null && (latest === null || found.mtime > latest.mtime))
                latest = { tool: candidate, ...found }
        }
        if (latest === null)
            throw new Error(`session: no session of the project directory "${cwd}" found in the session stores of ` +
                tools.map((candidate) => `${candidate} (${homeOf(candidate)})`).join(", "))
        tool  = latest.tool
        sid   = latest.id
        files = locateById(tool, sid, warnings)
    }

    /*  read all transcript files and merge their results  */
    const counts = Object.fromEntries(sessionKinds.map((kind) => [ kind, 0 ])) as Record<SessionKind, number>
    const r: SessionRecord = {
        tool, id: sid, cwd: "", version: "", start: "", end: "", models: [], usage: null,
        files, counts, total: 0, offset: 0, events: [], warnings
    }
    const models      = new Set<string>()
    const claudeUsage = new Map<string, SessionUsage>()
    const keyed       = [] as { key: string, event: SessionEvent }[]
    let codexUsage: SessionUsage | null = null
    for (const file of files) {
        const res  = await readFile(tool, file)
        const fr   = res.st.record
        file.lines = res.lines
        file.bytes = res.bytes
        if (r.cwd === "")
            r.cwd = fr.cwd
        if (r.version === "")
            r.version = fr.version
        if (r.start === "")
            r.start = fr.start
        if (fr.end > r.end)
            r.end = fr.end
        r.warnings.push(...fr.warnings)
        for (const model of res.st.models)
            models.add(model)
        for (const [ key, u ] of res.st.claudeUsage)
            claudeUsage.set(key, u)
        codexUsage = res.codexUsage ?? codexUsage

        /*  events without own timestamp inherit the one of their predecessor  */
        let key = ""
        for (const event of res.st.events) {
            key = event.time !== "" ? event.time : key
            keyed.push({ key, event })
        }
    }

    /*  order the events of all files chronologically (stable within equal
        times), so that events appended to growing transcript files or of
        new subagent transcript files do not shift the paging  */
    keyed.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
    const events = keyed.map((entry) => entry.event)
    r.models = [ ...models ]
    if (tool === "claude" && claudeUsage.size > 0) {
        r.usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
        for (const u of claudeUsage.values()) {
            r.usage.input      += u.input
            r.usage.output     += u.output
            r.usage.cacheRead  += u.cacheRead
            r.usage.cacheWrite += u.cacheWrite
        }
    }
    else if (tool === "codex")
        r.usage = codexUsage

    /*  count all events, then filter and page them  */
    for (const event of events)
        r.counts[event.kind]++
    const kinds    = opts.kinds !== undefined && opts.kinds.length > 0 ? opts.kinds : [ ...sessionKinds ]
    const matching = events.filter((event) => kinds.includes(event.kind))
    const limit    = opts.limit ?? 0
    r.total  = matching.length
    r.offset = Math.max(0, opts.offset ?? 0)
    r.events = limit > 0 ? matching.slice(r.offset, r.offset + limit) : matching.slice(r.offset)
    return r
}

/*  render a session as Markdown  */
const renderMarkdown = (r: SessionRecord): string => {
    const out: string[] = []
    const cell    = (text: string): string => text.replace(/\|/g, "\\|")
    const section = (title: string, lines: string[]): void => {
        if (lines.length > 0)
            out.push(`##  ${title}`, "", ...lines, "")
    }
    const usage = r.usage !== null ?
        `${r.usage.input} input, ${r.usage.output} output, ${r.usage.cacheRead} cache read, ` +
        `${r.usage.cacheWrite} cache write tokens (as recorded)` : "not recorded"
    out.push(`#   Session ${r.id}`, "")
    out.push(`-   **Tool**: ${r.tool} (${toolSpecs[r.tool].label}${r.version !== "" ? ` ${r.version}` : ""})`)
    out.push(`-   **Directory**: ${r.cwd !== "" ? `\`${r.cwd}\`` : "unknown"}`)
    out.push(`-   **Period**: ${r.start !== "" ? r.start : "unknown"} to ${r.end !== "" ? r.end : "unknown"}`)
    out.push(`-   **Models**: ${r.models.length > 0 ? r.models.map((model) => `\`${model}\``).join(", ") : "unknown"}`)
    out.push(`-   **Usage**: ${usage}`)
    out.push(`-   **Events**: ${sessionKinds.map((kind) => `${r.counts[kind]} ${kind}`).join(", ")}`, "")
    section("Files", [
        "| Role | Path | Lines | Bytes |",
        "| ---- | ---- | ----: | ----: |",
        ...r.files.map((f) => `| ${f.role} | \`${cell(f.path)}\` | ${f.lines} | ${f.bytes} |`)
    ])
    const events: string[] = []
    if (r.total > 0)
        events.push(r.events.length > 0 ?
            `Showing events ${r.offset + 1} to ${r.offset + r.events.length} of ${r.total} matching ones.` :
            `Showing no events, as offset ${r.offset} exceeds the ${r.total} matching ones.`)
    let current = ""
    for (const event of r.events) {
        if (event.path !== current) {
            events.push("", `### \`${event.path}\``, "")
            current = event.path
        }
        const time = /T(\d\d:\d\d:\d\d)/.exec(event.time)?.[1] ?? "--:--:--"
        events.push(`-   \`${event.line}\` ${time} **${event.kind}**: ${event.text}`)
    }
    section("Events", events)
    section("Warnings", r.warnings.map((warning) => `-   ${warning}`))
    return out.join("\n").replace(/\n+$/, "\n")
}

/*  render a session in one of the output formats  */
export const renderSession = (record: SessionRecord, format: SessionFormat): string => {
    if (format === "json")
        return JSON.stringify(record, null, 4) + "\n"
    else if (format === "yaml")
        return YAML.stringify(record, { indent: 4, lineWidth: 0 })
    else
        return renderMarkdown(record)
}

/*  CLI command "ase util session"  */
export default class SessionCommand {
    /*  register commands  */
    register (program: Command): void {
        program
            .command("session")
            .description("Summarize the transcript of an agent tool session (Claude Code, Codex, Copilot CLI)")
            .addOption(new Option("-t, --tool <tool>", "agent tool of the session (default: auto-detected)")
                .choices(sessionTools))
            .addOption(new Option("-f, --format <format>", "output format")
                .choices(sessionFormats).default("md"))
            .argument("[session-id]", "id of the session (default: latest session of the current directory)")
            .action(async (id: string | undefined, opts: { tool?: Tool, format: SessionFormat }) => {
                const record = await session({ id, tool: opts.tool })
                for (const warning of record.warnings)
                    process.stderr.write(`ase util session: WARNING: ${warning}\n`)
                await writeStdout(renderSession(record, opts.format))
            })
    }
}

/*  render a caught error as an MCP tool error result  */
const mcpToolError = (err: unknown) => ({
    isError: true,
    content: [ { type: "text" as const, text: `ERROR: ${err instanceof Error ? err.message : String(err)}` } ]
})

/*  MCP registration entry point for session tool  */
export class SessionMCP {
    register (mcp: McpServer): void {
        mcp.registerTool("ase_session", {
            title: "ASE session",
            description:
                "Locate and summarize the on-disk transcript of an agent tool session of Anthropic Claude " +
                "Code CLI (`claude`), OpenAI Codex CLI (`codex`), or GitHub Copilot CLI (`copilot`), read-only. " +
                "The session is given by its `session` id (pass `<ase-session-id/>` for the current session), " +
                "else the most recent session of the project directory is taken. The agent tool is given by " +
                "`tool`, else auto-detected by searching the session stores of all agent tools. " +
                "Returns, as `text` in the `format` `md` (Markdown, default), `yaml`, or `json`, the metadata " +
                "of the session (agent tool and version, working directory, period, models, token usage as " +
                "recorded), its transcript files (main and subagent ones, with absolute path, lines, and bytes), " +
                "the counts of all events per kind, and a page of its normalized timeline: one event per human " +
                "`prompt`, parent agent `dispatch` (in subagent transcripts), assistant `reply`, `tool-call`, " +
                "`tool-error`, `compaction`, or `error`, each with the absolute `path` and the 1-based `line` of " +
                "its transcript record (to be cited as `path:line`) and a text truncated to 200 characters. " +
                "Narrow the timeline by `kinds` and page through it by `offset` and `limit`. " +
                "Fails with an error if no transcript of the session is found.",
            inputSchema: {
                session: z.string().optional()
                    .describe("id of the session (allowed characters: A-Z, a-z, 0-9, '.', '_', '-'); " +
                        "if omitted, the most recent session of the project directory is taken"),
                tool: z.enum(sessionTools).optional()
                    .describe("agent tool of the session: `claude`, `codex`, or `copilot` " +
                        "(default: auto-detected)"),
                kinds: z.array(z.enum(sessionKinds)).optional()
                    .describe("kinds of the timeline events to return: `prompt`, `dispatch`, `reply`, " +
                        "`tool-call`, `tool-error`, `compaction`, `error` (default: all)"),
                offset: z.number().int().nonnegative().default(0)
                    .describe("number of matching timeline events to skip (default: 0)"),
                limit: z.number().int().nonnegative().default(200)
                    .describe("maximum number of timeline events to return, 0 for all (default: 200)"),
                format: z.enum(sessionFormats).default("md")
                    .describe("output format: `md` (Markdown), `yaml`, or `json`, default `md`")
            }
        }, async (args) => {
            try {
                const record = await session({
                    id:     args.session !== undefined && args.session !== "" ? args.session : undefined,
                    tool:   args.tool,
                    kinds:  args.kinds,
                    offset: args.offset,
                    limit:  args.limit
                })
                return {
                    content: [ { type: "text", text: renderSession(record, args.format) } ]
                }
            }
            catch (err: unknown) {
                return mcpToolError(err)
            }
        })
    }
}

