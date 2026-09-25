/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import path                                 from "node:path"
import fs                                   from "node:fs"
import os                                   from "node:os"

import { Command }                          from "commander"
import { execaSync }                        from "execa"
import { quote }                            from "shell-quote"
import * as v                               from "valibot"

import type Log                             from "./ase-log.js"
import Version                              from "./ase-version.js"
import { Config, configSchema, parseScope } from "./ase-config.js"
import { readStdin, writeStdout }           from "./ase-stdio.js"
import { Task }                             from "./ase-task.js"
import * as TaskFormat                      from "./ase-task-format.js"

/*  type of supported tool (host) systems  */
type Tool = "claude" | "copilot" | "codex"

/*  per-tool dispatch table for the parts that actually differ between
    Anthropic Claude Code CLI, GitHub Copilot CLI, and OpenAI Codex CLI hook integrations.  */
type ToolSpec = {
    toolNameField:           "tool_name"  | "toolName"
    toolInputField:          "tool_input" | "toolArgs"
    bashToolName:            "Bash" | "bash"
    mcpToolNamePattern:      RegExp
    addonMcpToolNamePattern: RegExp
    preToolUseWrapped:       boolean
    preToolUseEvent:         "PreToolUse" | "preToolUse"
    approvalEvent:           "PreToolUse" | "PermissionRequest"
}
const addonMcpServers = [
    "chat-alibaba-qwen",
    "chat-deepseek",
    "chat-google-gemini",
    "chat-openai-chatgpt",
    "chat-xai-grok",
    "chat-zai-glm",
    "search-brave",
    "search-exa",
    "search-perplexity"
]

/*  build a per-tool regular expression matching the tool names exposed
    by the addon MCP servers: Anthropic Claude Code CLI prefixes them as
    "mcp__<server>__<tool>", whereas GitHub Copilot CLI prefixes them as
    "<server>-<tool>"  */
const addonMcpToolNamePattern = (prefix: string, suffix: string): RegExp => {
    const alternatives = addonMcpServers
        .map((server) => server.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("|")
    return new RegExp(`^${prefix}(?:${alternatives})${suffix}`)
}

const toolSpecs: Record<Tool, ToolSpec> = {
    "claude": {
        toolNameField:           "tool_name",
        toolInputField:          "tool_input",
        bashToolName:            "Bash",
        mcpToolNamePattern:      /^mcp__plugin_ase_ase__.+/,
        addonMcpToolNamePattern: addonMcpToolNamePattern("mcp__", "__.+"),
        preToolUseWrapped:       true,
        preToolUseEvent:         "PreToolUse",
        approvalEvent:           "PreToolUse"
    },
    "copilot": {
        toolNameField:           "toolName",
        toolInputField:          "toolArgs",
        bashToolName:            "bash",
        mcpToolNamePattern:      /^ase-.+/,
        addonMcpToolNamePattern: addonMcpToolNamePattern("", "-.+"),
        preToolUseWrapped:       false,
        preToolUseEvent:         "preToolUse",
        approvalEvent:           "PreToolUse"
    },
    "codex": {
        toolNameField:           "tool_name",
        toolInputField:          "tool_input",
        bashToolName:            "Bash",
        mcpToolNamePattern:      /^mcp__ase__.+/,
        addonMcpToolNamePattern: addonMcpToolNamePattern("mcp__", "__.+"),
        preToolUseWrapped:       true,
        preToolUseEvent:         "PreToolUse",
        approvalEvent:           "PermissionRequest"
    }
}

/*  schema (and derived type) of the tool invocation input fields
    inspected by the tool-approval decision logic  */
const toolInputSchema = v.object({
    command:   v.optional(v.string()),
    skill:     v.optional(v.string()),
    file_path: v.optional(v.string())
})
type ToolInput = v.InferOutput<typeof toolInputSchema>

/*  maximum tolerated age of an idle session directory: the session-end hook
    removes it regularly, but a crashed or SIGKILLed agent leaves it behind
    forever, so orphans are garbage-collected once they exceed this age  */
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

/*  CLI command "ase hook"  */
export default class HookCommand {
    constructor (private log: Log) {}

    /*  validate a session id against the accepted character set  */
    private isValidSessionId (id: string): boolean {
        return /^[A-Za-z0-9._-]+$/.test(id)
    }

    /*  resolve the base directory holding all per-session state  */
    private sessionBaseDir (): string {
        return path.join(os.homedir(), ".ase", "session")
    }

    /*  garbage-collect orphaned session directories left behind by agents
        which died before their session-end hook could run; a live session
        keeps its directory's mtime current, as every tool call acquires a
        lock file inside it, so plain age is a reliable liveness signal  */
    private pruneStaleSessions (currentSessionId: string): void {
        const base = this.sessionBaseDir()
        let entries: fs.Dirent[]
        try {
            entries = fs.readdirSync(base, { withFileTypes: true })
        }
        catch (_e) {
            /*  best-effort: no base directory yet, or unreadable  */
            return
        }
        const deadline = Date.now() - SESSION_MAX_AGE_MS
        for (const entry of entries) {
            if (!entry.isDirectory() || entry.name === currentSessionId)
                continue
            const dir = path.join(base, entry.name)
            try {
                if (fs.statSync(dir).mtimeMs >= deadline)
                    continue
                fs.rmSync(dir, { recursive: true, force: true })
                this.log.write("debug", `hook: pruned stale session directory: ${dir}`)
            }
            catch (_e) {
                /*  best-effort: ignore vanished or undeletable directories  */
            }
        }
    }

    /*  drain and discard the stdin event payload  */
    private async drainStdin (): Promise<void> {
        await readStdin().catch(() => "")
    }

    /*  best-effort JSON parse with valibot schema validation: returns
        an empty object on blank input, malformed JSON, or schema
        mismatch, so callers can treat the result uniformly. Extra
        properties in the data are tolerated; only the declared schema
        entries are required to match.  */
    private parseJSON<TSchema extends v.BaseSchema<unknown, object, v.BaseIssue<unknown>>>
    (text: string, schema: TSchema): v.InferOutput<TSchema> {
        const empty = {} as v.InferOutput<TSchema>
        if (text.trim() === "")
            return empty
        let raw: unknown
        try {
            raw = JSON.parse(text)
        }
        catch (_e) {
            /*  best-effort: return empty object on malformed JSON  */
            return empty
        }
        const result = v.safeParse(schema, raw)
        if (!result.success)
            return empty
        return result.output
    }

    /*  recursively expand "@<path>" file references in a Markdown text,
        resolving paths relative to the directory of the containing file  */
    private expandReferences (text: string, baseDir: string, visited = new Set<string>()): string {
        return text.replace(/@(\S+)/g, (match, ref: string) => {
            let resolved = ref
            if (resolved.startsWith("~/"))
                resolved = path.join(os.homedir(), resolved.slice(2))
            const abs = path.isAbsolute(resolved) ? resolved : path.resolve(baseDir, resolved)
            if (visited.has(abs))
                return match
            if (!fs.existsSync(abs))
                return match
            let content: string
            try {
                content = fs.readFileSync(abs, "utf8")
            }
            catch (_e) {
                return match
            }
            const next = new Set(visited)
            next.add(abs)
            return this.expandReferences(content, path.dirname(abs), next)
        })
    }

    /*  determine the plugin root directory (the environment variable
        carrying it differs per tool), throwing if it cannot be found  */
    private pluginRoot (tool: Tool): string {
        let pluginRootVars: string[]
        if (tool === "copilot")
            pluginRootVars = [ "COPILOT_PLUGIN_ROOT" ]
        else if (tool === "codex")
            pluginRootVars = [ "PLUGIN_ROOT", "CLAUDE_PLUGIN_ROOT" ]
        else
            pluginRootVars = [ "CLAUDE_PLUGIN_ROOT" ]
        const pluginRoot = pluginRootVars
            .map((varName) => process.env[varName] ?? "")
            .find((value) => value !== "") ?? ""
        if (pluginRoot === "")
            throw new Error(`${pluginRootVars.join("/")} environment variable is not set`)
        return pluginRoot
    }

    /*  determine the plugin root directory like "pluginRoot", but return
        an empty string instead of throwing, so callers on the hot path of
        a tool-approval decision can silently decline to auto-approve  */
    private pluginRootSafe (tool: Tool): string {
        try {
            return this.pluginRoot(tool)
        }
        catch (_e) {
            return ""
        }
    }

    /*  handler for "ase hook session-start" (all tools)  */
    private async doSessionStart (tool: Tool): Promise<number> {
        /*  determine plugin root (env var name differs per tool)  */
        const pluginRoot = this.pluginRoot(tool)

        /*  determine path to external files  */
        const filePkg   = path.join(pluginRoot, ".claude-plugin", "plugin.json")
        const fileMd    = path.join(pluginRoot, "meta", "ase-constitution.md")
        const fileStyle = path.join(pluginRoot, "output-styles", "ase-terse.md")

        /*  read external files  */
        let pkg:   string
        let md:    string
        let style: string
        try {
            pkg = fs.readFileSync(filePkg, "utf8")
        }
        catch (err) {
            throw new Error(`failed to read plugin manifest: ${filePkg}`, { cause: err })
        }
        try {
            md = fs.readFileSync(fileMd, "utf8")
        }
        catch (err) {
            throw new Error(`failed to read constitution file: ${fileMd}`, { cause: err })
        }
        try {
            style = fs.readFileSync(fileStyle, "utf8")
        }
        catch (err) {
            throw new Error(`failed to read output style file: ${fileStyle}`, { cause: err })
        }

        /*  determine own version  */
        const pkgObj = this.parseJSON(pkg, v.object({ version: v.optional(v.string()) }))
        const versionCurrentPlugin = pkgObj.version ?? ""
        const versionCurrentTool   = Version.current()
        const versionLatestTool    = await Version.latest()

        /*  sanity check situation  */
        const versionHints: string[] = []
        if (versionCurrentPlugin !== versionCurrentTool)
            versionHints.push("**WARNING:** version *mismatch*: " +
                `tool: **${versionCurrentTool}**, plugin: **${versionCurrentPlugin}**`)
        if (versionCurrentTool !== versionLatestTool)
            versionHints.push(`**NOTICE:** *latest* version: **${versionLatestTool}**, please update!`)
        if (process.env.ASE_SETUP_DEV !== undefined)
            versionHints.push("**NOTICE:** *development* setup")
        const versionHint = versionHints.length > 0 ? "(" + versionHints.join(", ") + ")" : ""

        /*  read session information (Anthropic Claude Code CLI uses snake_case fields,
            GitHub Copilot CLI uses camelCase fields)  */
        const stdin = await readStdin().catch(() => "")
        const input = this.parseJSON(stdin, v.object({
            session_id: v.optional(v.string()),
            sessionId:  v.optional(v.string()),
            cwd:        v.optional(v.string())
        }))

        /*  determine session id  */
        const sessionId = this.pickSessionId(input)

        /*  garbage-collect orphaned session directories of previous agent runs  */
        this.pruneStaleSessions(sessionId)

        /*  establish config context (session-scoped only if a valid sessionId is present)  */
        const hasSession = this.isValidSessionId(sessionId)
        const cfg = new Config("config", configSchema, this.log,
            hasSession ? parseScope(`session:${sessionId}`) : parseScope(undefined))

        /*  determine task id (only persist when scoped to a real session)  */
        const taskId = process.env.ASE_TASK_ID ?? "default"
        cfg.lock(() => {
            cfg.read()
            if (hasSession) {
                cfg.set("agent.task", taskId)
                cfg.write()
            }
        })

        /*  initialize agent activity status  */
        this.writeAgentStatus("ready")

        /*  determine project id  */
        const cwd = input.cwd ?? process.cwd()
        let projectDir = cwd
        try {
            const result = execaSync("git", [ "rev-parse", "--show-toplevel" ], {
                stderr: "ignore", cwd
            })
            if (result.stdout.trim() !== "")
                projectDir = result.stdout.trim()
        }
        catch {
            /*  not inside a Git working tree  */
        }
        let configuredId = String(cfg.get("project.id") ?? "")
        if (configuredId !== "" && !TaskFormat.ID_RE.test(configuredId)) {
            this.log.write("warning", `hook: ignoring invalid configured "project.id" "${configuredId}" ` +
                "(must match [A-Za-z0-9_-]+)")
            configuredId = ""
        }
        const projectId = configuredId || Task.projectIdOf(projectDir)

        /*  determine user id  */
        const userId = process.env.USER ?? process.env.LOGNAME ?? "unknown"

        /*  helper function: determine a setting from the explicitly configured
            scopes, falling back to an environment variable and a default; the
            built-in "default" scope layer is deliberately skipped, as its preset
            value is always present and would hence shadow the environment variable  */
        const setting = (key: string, envVar: string, dflt: string): string => {
            const val = cfg.getExplicit(key)
            return typeof val === "string" ? val : (process.env[envVar] ?? dflt)
        }

        /*  determine agent persona style, agent guidance level, project
            boxing transparency, and project task lifecycle  */
        const persona   = setting("agent.persona",          "ASE_PERSONA_STYLE",          "engineer")
        const guidance  = setting("agent.guidance",         "ASE_GUIDANCE_LEVEL",         "normal")
        const boxing    = setting("project.boxing",         "ASE_PROJECT_BOXING",         "white")
        const lifecycle = setting("project.task.lifecycle", "ASE_PROJECT_TASK_LIFECYCLE", "solo")

        /*  determine the specification base directory and the whitespace-separated
            list of SpecBook schema configurations (empty: the bundled standard schema)  */
        const specBasedir = String(cfg.get("project.artifact.spec.basedir") ?? "")
        const specSchema  = String(cfg.get("project.artifact.spec.schema")  ?? "")

        /*  determine headless mode  */
        const headless = process.env.ASE_HEADLESS === "true" ? "true" : "false"

        /*  provide ASE information to Anthropic Claude Code CLI shell commands
            (Anthropic Claude Code CLI only -- GitHub Copilot CLI has no equivalent mechanism)  */
        const envFile = tool === "claude" ? (process.env.CLAUDE_ENV_FILE ?? "") : ""
        if (envFile !== "") {
            const script =
                `export ASE_VERSION=${quote([ versionCurrentPlugin ])}\n` +
                `export ASE_PLUGIN_ROOT=${quote([ pluginRoot ])}\n` +
                `export ASE_USER_ID=${quote([ userId ])}\n` +
                `export ASE_PROJECT_ID=${quote([ projectId ])}\n` +
                `export ASE_PROJECT_BOXING=${quote([ boxing ])}\n` +
                `export ASE_PROJECT_TASK_LIFECYCLE=${quote([ lifecycle ])}\n` +
                `export ASE_SPEC_BASEDIR=${quote([ specBasedir ])}\n` +
                `export ASE_SPEC_SCHEMA=${quote([ specSchema ])}\n` +
                `export ASE_TASK_ID=${quote([ taskId ])}\n` +
                `export ASE_SESSION_ID=${quote([ sessionId ])}\n` +
                `export ASE_HEADLESS=${quote([ headless ])}\n` +
                `export ASE_AGENT_TOOL=${quote([ tool ])}\n`
            try {
                fs.appendFileSync(envFile, script, "utf8")
            }
            catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err)
                this.log.write("warning", `hook: failed to write environment file: ${message}`)
            }
        }

        /*  prepend ASE information to constitution markdown  */
        md =
            `<ase-version>${versionCurrentPlugin}</ase-version>\n` +
            `<ase-version-hint>${versionHint}</ase-version-hint>\n` +
            `<ase-plugin-root>${pluginRoot}</ase-plugin-root>\n` +
            `<ase-persona-style>${persona}</ase-persona-style>\n` +
            `<ase-guidance-level>${guidance}</ase-guidance-level>\n` +
            `<ase-user-id>${userId}</ase-user-id>\n` +
            `<ase-project-id>${projectId}</ase-project-id>\n` +
            `<ase-project-boxing>${boxing}</ase-project-boxing>\n` +
            `<ase-project-task-lifecycle>${lifecycle}</ase-project-task-lifecycle>\n` +
            `<ase-spec-basedir>${specBasedir}</ase-spec-basedir>\n` +
            `<ase-spec-schema>${specSchema}</ase-spec-schema>\n` +
            `<ase-task-id>${taskId}</ase-task-id>\n` +
            `<ase-session-id>${sessionId}</ase-session-id>\n` +
            `<ase-headless>${headless}</ase-headless>\n` +
            `<ase-agent-tool>${tool}</ase-agent-tool>\n` +
            "\n" + md

        /*  expand all @<file> references manually  */
        md = this.expandReferences(md, path.dirname(fileMd))

        /*  append the output style to the constitution markdown (GitHub
            Copilot CLI and OpenAI Codex CLI only -- Anthropic Claude Code CLI
            applies the plugin output style natively), stripping the
            YAML frontmatter which only Anthropic Claude Code CLI understands  */
        if (tool !== "claude")
            md += "\n" + style.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "")

        /*  build the deterministic ASE banner (rendered directly by the
            agent harness, independent of any model decision, so it is
            guaranteed to appear once in every non-headless session;
            Anthropic Claude Code CLI and OpenAI Codex CLI surface a top-level
            "systemMessage" field for this -- GitHub Copilot CLI has no equivalent);
            the trailing help hint is emitted only if the guidance level asks for it  */
        const banner =
            "\n" +
            `\n⧉ ASE: ⎈ version: ${versionCurrentPlugin}${versionHint !== "" ? " " + versionHint.replace(/\*/g, "") : ""}` +
            `\n⧉ ASE: ※ user: ${userId}, ⚑ project: ${projectId}` +
            `\n⧉ ASE: ◉ task: ${taskId}, ⏻ session: ${sessionId}` +
            `\n⧉ ASE: ☯ persona: ${persona}, ▶ guidance: ${guidance}, ▢ boxing: ${boxing}` +
            (guidance === "normal" || guidance === "verbose" ?
                "\n" +
                "\n⧉ ASE: ▷ hint: use \"/ase-help-intent <intent-description>\" for skill command proposals" +
                "\n⧉ ASE: ▷ hint: use \"/ase-help-skill [<skill-name>]\" for skill catalog or skill manpage" : "")

        /*  inject markdown into session context.
            Anthropic Claude Code CLI and OpenAI Codex CLI expect the context nested in
            "hookSpecificOutput"; GitHub Copilot CLI expects a flat top-level
            "additionalContext" field.  */
        const payload: Record<string, unknown> = tool !== "copilot" ? {
            "hookSpecificOutput": {
                "hookEventName":     "SessionStart",
                "additionalContext": md
            }
        } : {
            "additionalContext": md
        }

        /*  attach the deterministic banner as a top-level "systemMessage"
            (only for the harnesses that support it and only when not
            running headless -- complementing the constitution box condition,
            which covers exactly the remaining harness GitHub Copilot CLI
            by letting the model emit the banner itself)  */
        if ((tool === "claude" || tool === "codex") && headless !== "true" && guidance !== "none")
            payload.systemMessage = banner

        await writeStdout(JSON.stringify(payload))
        return 0
    }

    /*  publish the agent activity marker to tmux as a per-pane user
        option, so tmux can render the live state via
        #{@ase_agent_status} (refreshed on tmux's own interval,
        independent of Anthropic Claude Code CLI's statusline repaint cadence).
        Notice: the Anthropic Claude Code CLI statusline is not usable for this case
        at all, as it is not repainted during agent processing!  */
    private writeAgentStatus (status: "busy" | "ready"): void {
        const icon = status === "busy" ? "▶" : "⏸"
        if (process.env.TMUX !== undefined
            && process.env.TMUX !== ""
            && process.env.TMUX_PANE !== undefined
            && process.env.TMUX_PANE !== "") {
            execaSync("tmux", [ "set-option", "-p", "-t", process.env.TMUX_PANE,
                "@ase_agent_status", icon ], { stdio: "ignore", reject: false })
        }
    }

    /*  handler for "ase hook user-prompt-submit" (all tools)  */
    private async doUserPromptSubmit (_tool: Tool): Promise<number> {
        await this.drainStdin()
        this.writeAgentStatus("busy")
        return 0
    }

    /*  handler for "ase hook stop" (all tools)  */
    private async doStop (_tool: Tool): Promise<number> {
        await this.drainStdin()
        this.writeAgentStatus("ready")
        return 0
    }

    /*  handler for "ase hook session-end" (all tools)  */
    private async doSessionEnd (_tool: Tool): Promise<number> {
        /*  determine session id  */
        const sessionId = await this.readSessionIdFromStdin()

        /*  remove the session directory ~/.ase/session/<id> (only for a valid sessionId)  */
        if (this.isValidSessionId(sessionId)) {
            const dir = path.join(this.sessionBaseDir(), sessionId)
            try {
                fs.rmSync(dir, { recursive: true, force: true })
            }
            catch (_e) {
                /*  best-effort: ignore failures  */
            }
        }
        return 0
    }

    /*  pick the session id from a parsed payload (Anthropic Claude Code CLI uses
        snake_case fields, GitHub Copilot CLI uses camelCase fields)  */
    private pickSessionId (input: { session_id?: string, sessionId?: string }): string {
        return input.session_id ?? input.sessionId ?? ""
    }

    /*  read session id from stdin JSON payload  */
    private async readSessionIdFromStdin (): Promise<string> {
        const stdin = await readStdin().catch(() => "")
        const input = this.parseJSON(stdin, v.object({
            session_id: v.optional(v.string()),
            sessionId:  v.optional(v.string())
        }))
        return this.pickSessionId(input)
    }

    /*  read the session-scoped "agent.skill" config value  */
    private readActiveSkill (sessionId: string): string {
        if (!this.isValidSessionId(sessionId))
            return ""
        try {
            const cfg = new Config("config", configSchema, this.log, parseScope(`session:${sessionId}`))
            let val = ""
            cfg.lock(() => {
                cfg.read()
                const skill = cfg.get("agent.skill")
                if (typeof skill === "string")
                    val = skill
            })
            return val
        }
        catch (_e) {
            return ""
        }
    }

    /*  determine whether a "Read" target "filePath" resolves to a
        location inside the plugin root, so the recurring loads of ASE
        skill include files (e.g. "@${CLAUDE_SKILL_DIR}/../../meta/...")
        can be auto-approved instead of prompting the user on every skill
        invocation. The path is normalized and compared with a trailing
        separator to prevent a sibling directory sharing the root's name
        prefix (or a "../" escape) from being mistaken for a descendant.  */
    private isUnderPluginRoot (tool: Tool, filePath: string): boolean {
        if (filePath === "")
            return false
        const pluginRoot = this.pluginRootSafe(tool)
        if (pluginRoot === "")
            return false
        const root = path.resolve(pluginRoot) + path.sep
        const abs  = path.resolve(filePath)
        return (abs + path.sep).startsWith(root)
    }

    /*  the edit-capable skills whose active state lets the pre-tool-use
        hook auto-approve subsequent "Edit" invocations  */
    private editCapableSkills = [ "ase-code-lint", "ase-docs-shorten", "ase-docs-refine", "ase-docs-proofread" ]

    /*  determine whether an ASE tool invocation described by the parsed
        hook input should be auto-approved, and (if so) the human-readable
        reason. The input field names and value shapes differ between
        tools, but the decision logic is shared by the "pre-tool-use" and
        "permission-request" handlers.  */
    private decideApproval (tool: Tool, spec: ToolSpec, input: Record<string, unknown>): { approve: boolean, reason: string } {
        const rawName   = input[spec.toolNameField]
        const rawInput  = input[spec.toolInputField]
        const toolName  = typeof rawName === "string" ? rawName : ""
        let   toolInput: ToolInput = {}
        if (typeof rawInput === "string")
            toolInput = this.parseJSON(rawInput, toolInputSchema)
        else if (typeof rawInput === "object" && rawInput !== null) {
            const result = v.safeParse(toolInputSchema, rawInput)
            if (result.success)
                toolInput = result.output
        }
        const command = toolInput.command ?? ""
        if (toolName === spec.bashToolName && /^ase(\s|$)/.test(command)
            && !/[;&|<>`\n]|\$\(/.test(command))
            return { approve: true, reason: "ASE CLI invocation auto-approved" }
        else if (toolName === "Skill" && /^(?:ase:)?ase-.+/.test(toolInput.skill ?? ""))
            return { approve: true, reason: "ASE skill invocation auto-approved" }
        else if (spec.mcpToolNamePattern.test(toolName))
            return { approve: true, reason: "ASE MCP tool invocation auto-approved" }
        else if (spec.addonMcpToolNamePattern.test(toolName))
            return { approve: true, reason: "ASE addon MCP tool invocation auto-approved" }
        else if (toolName === "Read" && this.isUnderPluginRoot(tool, toolInput.file_path ?? ""))
            return { approve: true, reason: "ASE plugin file read auto-approved" }
        else if (toolName === "Edit") {
            const sessionId   = this.pickSessionId(input)
            const activeSkill = this.readActiveSkill(sessionId)
            if (this.editCapableSkills.includes(activeSkill))
                return { approve: true, reason: `${activeSkill}: edit auto-approved for active edit-capable skill` }
        }
        return { approve: false, reason: "" }
    }

    /*  read the hook event payload from stdin and parse it into the
        loosely-typed input object shared by the tool-approval handlers  */
    private async readHookInput (tool: Tool): Promise<{ spec: ToolSpec, input: Record<string, unknown> }> {
        const spec  = toolSpecs[tool]
        const stdin = await readStdin().catch(() => "")
        const input = this.parseJSON(stdin, v.looseObject({
            session_id: v.optional(v.string()),
            sessionId:  v.optional(v.string())
        }))
        return { spec, input }
    }

    /*  handler for "ase hook pre-tool-use" (all tools).
        For Anthropic Claude Code CLI and GitHub Copilot CLI this is where ASE tool
        invocations are auto-approved (via "permissionDecision: allow").
        OpenAI Codex CLI rejects that mechanism in "PreToolUse", so for
        Codex this handler stays silent and approval is granted in the
        separate "permission-request" handler instead -- the handler must
        still drain stdin, as Codex treats a non-draining hook as a hard
        error.  */
    private async doPreToolUse (tool: Tool): Promise<number> {
        /*  read tool invocation information  */
        const { spec, input } = await this.readHookInput(tool)

        /*  Codex auto-approves through "PermissionRequest", not here  */
        if (spec.approvalEvent !== "PreToolUse")
            return 0

        /*  determine whether to auto-approve the tool invocation  */
        const { approve, reason } = this.decideApproval(tool, spec, input)

        /*  emit permission decision (or stay silent to defer to default flow).
            Anthropic Claude Code CLI expects the decision nested in "hookSpecificOutput";
            GitHub Copilot CLI expects flat top-level fields.  */
        if (approve) {
            const payload = spec.preToolUseWrapped ? {
                "hookSpecificOutput": {
                    "hookEventName":            spec.preToolUseEvent,
                    "permissionDecision":       "allow",
                    "permissionDecisionReason": reason
                }
            } : {
                "permissionDecision":       "allow",
                "permissionDecisionReason": reason
            }
            await writeStdout(JSON.stringify(payload))
        }
        return 0
    }

    /*  handler for "ase hook permission-request" (OpenAI Codex CLI only).
        Codex fires this event only when a tool invocation would otherwise
        require interactive user approval, and -- unlike "PreToolUse" --
        honors an auto-approval here through "decision.behavior: allow".
        Staying silent (or returning a non-approval) defers to Codex's
        normal approval flow.  */
    private async doPermissionRequest (tool: Tool): Promise<number> {
        /*  read tool invocation information  */
        const { spec, input } = await this.readHookInput(tool)

        /*  determine whether to auto-approve the tool invocation  */
        const { approve } = this.decideApproval(tool, spec, input)

        /*  emit the Codex "PermissionRequest" approval decision  */
        if (approve) {
            const payload = {
                "hookSpecificOutput": {
                    "hookEventName": "PermissionRequest",
                    "decision":      { "behavior": "allow" }
                }
            }
            await writeStdout(JSON.stringify(payload))
        }
        return 0
    }

    /*  parse and validate the --tool option  */
    private parseTool (value: string): Tool {
        if (value !== "claude" && value !== "copilot" && value !== "codex")
            throw new Error(`invalid --tool value: "${value}" (expected "claude", "copilot", or "codex")`)
        return value
    }

    /*  register commands  */
    register (program: Command): void {
        /*  default for --tool derived from ASE_TOOL environment variable
            (validated lazily by "parseTool" in each action, so an invalid
            value cannot break unrelated "ase" commands at startup)  */
        const envTool  = process.env.ASE_TOOL ?? ""
        const toolDflt = envTool !== "" ? envTool : "claude"

        /*  register CLI top-level command "ase hook"  */
        const hookCmd = program
            .command("hook")
            .description("Anthropic Claude Code CLI, GitHub Copilot CLI, and OpenAI Codex CLI hook entry points")
            .action(() => {
                hookCmd.outputHelp()
                process.exit(1)
            })

        /*  register CLI sub-commands "ase hook <event>"  */
        const subCmds: Array<{ name: string, desc: string, handler: (tool: Tool) => Promise<number> }> = [
            { name: "session-start",      desc: "handle SessionStart hook event",           handler: (tool) => this.doSessionStart(tool)      },
            { name: "session-end",        desc: "handle SessionEnd hook event",             handler: (tool) => this.doSessionEnd(tool)        },
            { name: "pre-tool-use",       desc: "handle tool PreToolUse hook event",        handler: (tool) => this.doPreToolUse(tool)        },
            { name: "permission-request", desc: "handle tool PermissionRequest hook event", handler: (tool) => this.doPermissionRequest(tool) },
            { name: "user-prompt-submit", desc: "handle UserPromptSubmit hook event",       handler: (tool) => this.doUserPromptSubmit(tool)  },
            { name: "stop",               desc: "handle Stop hook event",                   handler: (tool) => this.doStop(tool)              }
        ]
        for (const { name, desc, handler } of subCmds)
            hookCmd
                .command(name)
                .description(desc)
                .option("-t, --tool <tool>", "target tool (\"claude\", \"copilot\", or \"codex\")", toolDflt)
                .action(async (opts: { tool: string }) => {
                    process.exitCode = await handler(this.parseTool(opts.tool))
                })
    }
}
