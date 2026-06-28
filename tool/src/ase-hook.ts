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
import getStdin                             from "get-stdin"
import * as v                               from "valibot"

import type Log                             from "./ase-log.js"
import Version                              from "./ase-version.js"
import { Config, configSchema, parseScope } from "./ase-config.js"
import { writeStdout }                      from "./ase-stdout.js"

/*  type of supported tool (host) systems  */
type Tool = "claude" | "copilot" | "codex"

/*  per-tool dispatch table for the parts that actually differ between
    Claude Code, GitHub Copilot CLI, and OpenAI Codex CLI hook integrations.  */
type ToolSpec = {
    toolNameField:           "tool_name"  | "toolName"
    toolInputField:          "tool_input" | "toolArgs"
    toolInputIsString:       boolean
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
    by the addon MCP servers: Claude Code prefixes them as
    "mcp__<server>__<tool>", whereas Copilot CLI prefixes them as
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
        toolInputIsString:       false,
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
        toolInputIsString:       true,
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
        toolInputIsString:       false,
        bashToolName:            "Bash",
        mcpToolNamePattern:      /^mcp__ase__.+/,
        addonMcpToolNamePattern: addonMcpToolNamePattern("mcp__", "__.+"),
        preToolUseWrapped:       true,
        preToolUseEvent:         "PreToolUse",
        approvalEvent:           "PermissionRequest"
    }
}

/*  CLI command "ase hook"  */
export default class HookCommand {
    constructor (private log: Log) {}

    /*  validate a session id against the accepted character set  */
    private isValidSessionId (id: string): boolean {
        return /^[A-Za-z0-9._-]+$/.test(id)
    }

    /*  read the entire stdin payload asynchronously  */
    private readStdin (): Promise<string> {
        /*  best-effort: treat an unreadable/closed stdin as empty  */
        return getStdin().catch(() => "")
    }

    /*  drain and discard the stdin event payload  */
    private async drainStdin (): Promise<void> {
        await this.readStdin()
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
        let pluginRoot = ""
        for (const pluginRootVar of pluginRootVars)
            if ((process.env[pluginRootVar] ?? "") !== "") {
                pluginRoot = process.env[pluginRootVar]!
                break
            }
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
        const filePkg = path.join(pluginRoot, ".claude-plugin", "plugin.json")
        const fileMd  = path.join(pluginRoot, "meta", "ase-constitution.md")

        /*  read external files  */
        let pkg: string
        let md:  string
        try {
            pkg = fs.readFileSync(filePkg, "utf8")
        }
        catch (_e) {
            throw new Error(`failed to read plugin manifest: ${filePkg}`)
        }
        try {
            md = fs.readFileSync(fileMd, "utf8")
        }
        catch (_e) {
            throw new Error(`failed to read constitution file: ${fileMd}`)
        }

        /*  determine own version  */
        const pkgObj = this.parseJSON(pkg, v.object({ version: v.optional(v.string()) }))
        const versionCurrentPlugin = pkgObj.version ?? ""
        const versionCurrentTool   = Version.current()
        const versionLatestTool    = await Version.latest()

        /*  sanity check situation  */
        const versionHints = []
        if (versionCurrentPlugin !== versionCurrentTool)
            versionHints.push("**WARNING:** version *mismatch*: " +
                `tool: **${versionCurrentTool}**, plugin: **${versionCurrentPlugin}**`)
        if (versionCurrentTool !== versionLatestTool)
            versionHints.push(`**NOTICE:** *latest* version: **${versionLatestTool}**, please update!`)
        if (process.env.ASE_SETUP_DEV !== undefined)
            versionHints.push("**NOTICE:** *development* setup")
        const versionHint = versionHints.length > 0 ? "(" + versionHints.join(", ") + ")" : ""

        /*  read session information (Claude Code uses snake_case fields,
            Copilot CLI uses camelCase fields)  */
        const stdin = await this.readStdin()
        const input = this.parseJSON(stdin, v.object({
            session_id: v.optional(v.string()),
            sessionId:  v.optional(v.string()),
            cwd:        v.optional(v.string())
        }))

        /*  determine session id  */
        const sessionId = this.pickSessionId(input)

        /*  establish config context (session-scoped only if a valid sessionId is present)  */
        const hasSession = this.isValidSessionId(sessionId)
        const cfg = new Config("config", configSchema, this.log,
            hasSession ? parseScope(`session:${sessionId}`) : parseScope(undefined))
        /*  determine task id (only persist when scoped to a real session)  */
        const taskId = process.env.ASE_TASK_ID ?? "default"
        if (hasSession)
            cfg.lock(() => {
                cfg.read()
                cfg.set("agent.task", taskId)
                cfg.write()
            })
        else
            cfg.lock(() => {
                cfg.read()
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
        const projectId = path.basename(projectDir)

        /*  determine user id  */
        const userId = process.env.USER ?? process.env.LOGNAME ?? "unknown"

        /*  determine agent persona style  */
        let persona = process.env.ASE_PERSONA_STYLE ?? "engineer"
        const val = cfg.get("agent.persona")
        if (typeof val === "string")
            persona = val

        /*  determine headless mode  */
        const headless = (process.env.ASE_HEADLESS ?? "false") === "true" ? "true" : "false"

        /*  provide ASE information to Claude Code shell commands
            (Claude Code only -- Copilot CLI has no equivalent mechanism)  */
        const envFile = tool === "claude" ? (process.env.CLAUDE_ENV_FILE ?? "") : ""
        if (envFile !== "") {
            const script =
                `export ASE_VERSION=${quote([ versionCurrentPlugin ])}\n` +
                `export ASE_PLUGIN_ROOT=${quote([ pluginRoot ])}\n` +
                `export ASE_USER_ID=${quote([ userId ])}\n` +
                `export ASE_PROJECT_ID=${quote([ projectId ])}\n` +
                `export ASE_TASK_ID=${quote([ taskId ])}\n` +
                `export ASE_SESSION_ID=${quote([ sessionId ])}\n` +
                `export ASE_HEADLESS=${quote([ headless ])}\n` +
                `export ASE_AGENT_TOOL=${quote([ tool ])}\n`
            fs.appendFileSync(envFile, script, "utf8")
        }

        /*  prepend ASE information to constitution markdown  */
        md =
            `<ase-version>${versionCurrentPlugin}</ase-version>\n` +
            `<ase-version-hint>${versionHint}</ase-version-hint>\n` +
            `<ase-plugin-root>${pluginRoot}</ase-plugin-root>\n` +
            `<ase-persona-style>${persona}</ase-persona-style>\n` +
            `<ase-user-id>${userId}</ase-user-id>\n` +
            `<ase-project-id>${projectId}</ase-project-id>\n` +
            `<ase-task-id>${taskId}</ase-task-id>\n` +
            `<ase-session-id>${sessionId}</ase-session-id>\n` +
            `<ase-headless>${headless}</ase-headless>\n` +
            `<ase-agent-tool>${tool}</ase-agent-tool>\n` +
            "\n" + md

        /*  expand all @<file> references manually  */
        md = this.expandReferences(md, path.dirname(fileMd))

        /*  build the deterministic ASE banner (rendered directly by the
            agent harness, independent of any model decision, so it is
            guaranteed to appear once in every non-headless session;
            Claude Code and OpenAI Codex CLI surface a top-level
            "systemMessage" field for this -- Copilot CLI has no equivalent)  */
        const banner =
            `\n⧉ ASE: ⎈ version: ${versionCurrentPlugin}${versionHint !== "" ? " " + versionHint.replaceAll(/\*/g, "") : ""}` +
            `\n⧉ ASE: ※ user: ${userId}, ⚑ project: ${projectId}` +
            `\n⧉ ASE: ◉ task: ${taskId}, ⏻ session: ${sessionId}` +
            `\n⧉ ASE: ☯ persona: ${persona}`

        /*  inject markdown into session context.
            Claude Code and OpenAI Codex CLI expect the context nested in
            "hookSpecificOutput"; Copilot CLI expects a flat top-level
            "additionalContext" field.  */
        const payload = tool !== "copilot" ? {
            "hookSpecificOutput": {
                "hookEventName":     "SessionStart",
                "additionalContext": md
            }
        } : {
            "additionalContext": md
        }

        /*  attach the deterministic banner as a top-level "systemMessage"
            (only for the harnesses that support it and only when not
            running headless -- mirroring the constitution box condition)  */
        if ((tool === "claude" || tool === "codex") && headless !== "true")
            (payload as Record<string, unknown>).systemMessage = banner

        await writeStdout(JSON.stringify(payload))
        return 0
    }

    /*  publish the agent activity marker to tmux as a per-pane user
        option, so tmux can render the live state via
        #{@ase_agent_status} (refreshed on tmux's own interval,
        independent of Claude Code's statusline repaint cadence).
        Notice: the Claude Code statusline is not usable for this case
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

    /*  handler for "ase hook user-prompt-submit" (both tools)  */
    private async doUserPromptSubmit (_tool: Tool): Promise<number> {
        await this.drainStdin()
        this.writeAgentStatus("busy")
        return 0
    }

    /*  handler for "ase hook stop" (both tools)  */
    private async doStop (_tool: Tool): Promise<number> {
        await this.drainStdin()
        this.writeAgentStatus("ready")
        return 0
    }

    /*  handler for "ase hook session-end" (both tools)  */
    private async doSessionEnd (_tool: Tool): Promise<number> {
        /*  determine session id  */
        const sessionId = await this.readSessionIdFromStdin()

        /*  remove the session directory ~/.ase/session/<id> (only for a valid sessionId)  */
        if (this.isValidSessionId(sessionId)) {
            const dir = path.join(os.homedir(), ".ase", "session", sessionId)
            try {
                fs.rmSync(dir, { recursive: true, force: true })
            }
            catch (_e) {
                /*  best-effort: ignore failures  */
            }
        }
        return 0
    }

    /*  pick the session id from a parsed payload (Claude Code uses
        snake_case fields, Copilot CLI uses camelCase fields)  */
    private pickSessionId (input: { session_id?: string, sessionId?: string }): string {
        return input.session_id ?? input.sessionId ?? ""
    }

    /*  read session id from stdin JSON payload  */
    private async readSessionIdFromStdin (): Promise<string> {
        const stdin = await this.readStdin()
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
    private editCapableSkills = [ "ase-code-lint", "ase-docs-proofread" ]

    /*  determine whether an ASE tool invocation described by the parsed
        hook input should be auto-approved, and (if so) the human-readable
        reason. The input field names and value shapes differ between
        tools, but the decision logic is shared by the "pre-tool-use" and
        "permission-request" handlers.  */
    private decideApproval (tool: Tool, spec: ToolSpec, input: Record<string, unknown>): { approve: boolean, reason: string } {
        const toolName  = typeof input[spec.toolNameField] === "string" ?
            input[spec.toolNameField] as string : ""
        let toolInput: { command?: string, skill?: string, file_path?: string } = {}
        const rawInput  = input[spec.toolInputField]
        if (spec.toolInputIsString && typeof rawInput === "string")
            toolInput = this.parseJSON(rawInput, v.object({
                command:   v.optional(v.string()),
                skill:     v.optional(v.string()),
                file_path: v.optional(v.string())
            }))
        else if (!spec.toolInputIsString && typeof rawInput === "object" && rawInput !== null)
            toolInput = rawInput as { command?: string, skill?: string, file_path?: string }
        if (toolName === spec.bashToolName && /^ase(\s|$)/.test(toolInput.command ?? ""))
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

    /*  handler for "ase hook pre-tool-use" (all tools).
        For Claude Code and Copilot CLI this is where ASE tool
        invocations are auto-approved (via "permissionDecision: allow").
        OpenAI Codex CLI rejects that mechanism in "PreToolUse", so for
        Codex this handler stays silent and approval is granted in the
        separate "permission-request" handler instead -- the handler must
        still drain stdin, as Codex treats a non-draining hook as a hard
        error.  */
    private async doPreToolUse (tool: Tool): Promise<number> {
        const spec = toolSpecs[tool]

        /*  read tool invocation information  */
        const stdin = await this.readStdin()
        const input = this.parseJSON(stdin, v.looseObject({
            session_id: v.optional(v.string()),
            sessionId:  v.optional(v.string())
        }))

        /*  Codex auto-approves through "PermissionRequest", not here  */
        if (spec.approvalEvent !== "PreToolUse")
            return 0

        /*  determine whether to auto-approve the tool invocation  */
        const { approve, reason } = this.decideApproval(tool, spec, input)

        /*  emit permission decision (or stay silent to defer to default flow).
            Claude Code expects the decision nested in "hookSpecificOutput";
            Copilot CLI expects flat top-level fields.  */
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
        const spec = toolSpecs[tool]

        /*  read tool invocation information  */
        const stdin = await this.readStdin()
        const input = this.parseJSON(stdin, v.looseObject({
            session_id: v.optional(v.string()),
            sessionId:  v.optional(v.string())
        }))

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
        /*  default for --tool derived from ASE_TOOL environment variable  */
        const envTool  = process.env.ASE_TOOL ?? ""
        const toolDflt = envTool !== "" ? this.parseTool(envTool) : "claude"

        /*  register CLI top-level command "ase hook"  */
        const hookCmd = program
            .command("hook")
            .description("Claude Code and Copilot CLI hook entry points")
            .action(() => {
                hookCmd.outputHelp()
                process.exit(1)
            })

        /*  register CLI sub-command "ase hook session-start"  */
        hookCmd
            .command("session-start")
            .description("handle SessionStart hook event")
            .option("-t, --tool <tool>", "target tool (\"claude\", \"copilot\", or \"codex\")", toolDflt)
            .action(async (opts: { tool: string }) => {
                process.exitCode = await this.doSessionStart(this.parseTool(opts.tool))
            })

        /*  register CLI sub-command "ase hook session-end"  */
        hookCmd
            .command("session-end")
            .description("handle SessionEnd hook event")
            .option("-t, --tool <tool>", "target tool (\"claude\", \"copilot\", or \"codex\")", toolDflt)
            .action(async (opts: { tool: string }) => {
                process.exitCode = await this.doSessionEnd(this.parseTool(opts.tool))
            })

        /*  register CLI sub-command "ase hook pre-tool-use"  */
        hookCmd
            .command("pre-tool-use")
            .description("handle tool PreToolUse hook event")
            .option("-t, --tool <tool>", "target tool (\"claude\", \"copilot\", or \"codex\")", toolDflt)
            .action(async (opts: { tool: string }) => {
                process.exitCode = await this.doPreToolUse(this.parseTool(opts.tool))
            })

        /*  register CLI sub-command "ase hook permission-request"  */
        hookCmd
            .command("permission-request")
            .description("handle tool PermissionRequest hook event (Codex CLI)")
            .option("-t, --tool <tool>", "target tool (\"claude\", \"copilot\", or \"codex\")", toolDflt)
            .action(async (opts: { tool: string }) => {
                process.exitCode = await this.doPermissionRequest(this.parseTool(opts.tool))
            })

        /*  register CLI sub-command "ase hook user-prompt-submit"  */
        hookCmd
            .command("user-prompt-submit")
            .description("handle UserPromptSubmit hook event (mark agent as busy)")
            .option("-t, --tool <tool>", "target tool (\"claude\", \"copilot\", or \"codex\")", toolDflt)
            .action(async (opts: { tool: string }) => {
                process.exitCode = await this.doUserPromptSubmit(this.parseTool(opts.tool))
            })

        /*  register CLI sub-command "ase hook stop"  */
        hookCmd
            .command("stop")
            .description("handle Stop hook event (mark agent as ready)")
            .option("-t, --tool <tool>", "target tool (\"claude\", \"copilot\", or \"codex\")", toolDflt)
            .action(async (opts: { tool: string }) => {
                process.exitCode = await this.doStop(this.parseTool(opts.tool))
            })
    }
}
