/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under GPL 3.0 <https://spdx.org/licenses/GPL-3.0-only>
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

/*  type of supported tool (host) systems  */
type Tool = "claude" | "copilot"

/*  per-tool dispatch table for the parts that actually differ between
    Claude Code and GitHub Copilot CLI hook integrations.  */
type ToolSpec = {
    toolNameField:          "tool_name"  | "toolName"
    toolInputField:         "tool_input" | "toolArgs"
    toolInputIsString:      boolean
    bashToolName:           "Bash" | "bash"
    mcpToolNamePattern:     RegExp
    preToolUseWrapped:      boolean
    preToolUseEvent:        "PreToolUse" | "preToolUse"
}
const toolSpecs: Record<Tool, ToolSpec> = {
    "claude": {
        toolNameField:      "tool_name",
        toolInputField:     "tool_input",
        toolInputIsString:  false,
        bashToolName:       "Bash",
        mcpToolNamePattern: /^mcp__plugin_ase_ase__.+/,
        preToolUseWrapped:  true,
        preToolUseEvent:    "PreToolUse"
    },
    "copilot": {
        toolNameField:      "toolName",
        toolInputField:     "toolArgs",
        toolInputIsString:  true,
        bashToolName:       "bash",
        mcpToolNamePattern: /^ase-.+/,
        preToolUseWrapped:  false,
        preToolUseEvent:    "preToolUse"
    }
}

/*  CLI command "ase hook"  */
export default class HookCommand {
    constructor (private log: Log) {}

    /*  validate a session id against the accepted character set  */
    private isValidSessionId (id: string): boolean {
        return /^[A-Za-z0-9._-]+$/.test(id)
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
                resolved = path.join(process.env.HOME ?? "", resolved.slice(2))
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

    /*  handler for "ase hook session-start" (both tools)  */
    private async doSessionStart (tool: Tool): Promise<number> {
        /*  determine plugin root (env var name differs per tool)  */
        const pluginRootVar = tool === "copilot" ? "COPILOT_PLUGIN_ROOT" : "CLAUDE_PLUGIN_ROOT"
        const pluginRoot = process.env[pluginRootVar] ?? ""
        if (pluginRoot === "")
            throw new Error(`${pluginRootVar} environment variable is not set`)

        /*  determine path to external files  */
        const filePkg = path.join(pluginRoot, ".claude-plugin", "plugin.json")
        const fileMd  = path.join(pluginRoot, "meta", "ase-constitution.md")

        /*  read external files  */
        const pkg = fs.readFileSync(filePkg, "utf8")
        let   md  = fs.readFileSync(fileMd,  "utf8")

        /*  determine own version  */
        const versionCurrentPlugin = (JSON.parse(pkg).version as string | undefined) ?? ""
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
        const stdin = fs.readFileSync(0, "utf8")
        const input = this.parseJSON(stdin, v.object({
            session_id: v.optional(v.string()),
            sessionId:  v.optional(v.string()),
            cwd:        v.optional(v.string())
        }))

        /*  determine session id  */
        const sessionId = input.session_id ?? input.sessionId ?? ""

        /*  establish config context (session-scoped only if a valid sessionId is present)  */
        const hasSession = this.isValidSessionId(sessionId)
        const cfg = new Config("config", configSchema, this.log,
            hasSession ? parseScope(`session:${sessionId}`) : parseScope(undefined))
        cfg.lock(() => {
            cfg.read()
        })

        /*  determine task id (only persist when scoped to a real session)  */
        const taskId = process.env.ASE_TASK_ID ?? "default"
        if (hasSession)
            cfg.lock(() => {
                cfg.set("agent.task", taskId)
                cfg.write()
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

        /*  inject markdown into session context.
            Claude Code expects the context nested in "hookSpecificOutput";
            Copilot CLI expects a flat top-level "additionalContext" field.  */
        const payload = tool === "claude" ? {
            "hookSpecificOutput": {
                "hookEventName":     "SessionStart",
                "additionalContext": md
            }
        } : {
            "additionalContext": md
        }
        process.stdout.write(JSON.stringify(payload))
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
    private doUserPromptSubmit (_tool: Tool): number {
        this.writeAgentStatus("busy")
        return 0
    }

    /*  handler for "ase hook stop" (both tools)  */
    private doStop (_tool: Tool): number {
        this.writeAgentStatus("ready")

        /*  safety net: clear any lingering "agent.skill" marker so a
            crashed or aborted skill loop does not leave information active  */
        const sessionId = this.readSessionIdFromStdin()
        if (this.isValidSessionId(sessionId)) {
            try {
                const cfg = new Config("config", configSchema, this.log,
                    parseScope(`session:${sessionId}`))
                cfg.lock(() => {
                    cfg.read()
                    if (typeof cfg.get("agent.skill") === "string") {
                        cfg.delete("agent.skill")
                        cfg.write()
                    }
                })
            }
            catch (_e) {
                /*  best-effort: ignore failures  */
            }
        }
        return 0
    }

    /*  handler for "ase hook session-end" (both tools)  */
    private doSessionEnd (_tool: Tool): number {
        /*  determine session id  */
        const sessionId = this.readSessionIdFromStdin()

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

    /*  read session id from stdin JSON payload (Claude Code uses
        snake_case fields, Copilot CLI uses camelCase fields)  */
    private readSessionIdFromStdin (): string {
        const stdin = fs.readFileSync(0, "utf8")
        const input = this.parseJSON(stdin, v.object({
            session_id: v.optional(v.string()),
            sessionId:  v.optional(v.string())
        }))
        return input.session_id ?? input.sessionId ?? ""
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

    /*  handler for "ase hook pre-tool-use" (both tools)  */
    private doPreToolUse (tool: Tool): number {
        const spec = toolSpecs[tool]

        /*  read tool invocation information  */
        const stdin = fs.readFileSync(0, "utf8")
        const input = this.parseJSON(stdin, v.looseObject({
            session_id: v.optional(v.string()),
            sessionId:  v.optional(v.string())
        }))

        /*  determine whether to auto-approve the tool invocation
            (field names and value shapes differ between tools)  */
        const toolName  = typeof input[spec.toolNameField] === "string" ?
            input[spec.toolNameField] as string : ""
        let toolInput: { command?: string, skill?: string } = {}
        const rawInput  = input[spec.toolInputField]
        if (spec.toolInputIsString && typeof rawInput === "string")
            toolInput = this.parseJSON(rawInput, v.object({
                command: v.optional(v.string()),
                skill:   v.optional(v.string())
            }))
        else if (!spec.toolInputIsString && typeof rawInput === "object" && rawInput !== null)
            toolInput = rawInput as { command?: string, skill?: string }
        let approve = false
        let reason  = ""
        if (toolName === spec.bashToolName && /^ase(\s|$)/.test(toolInput.command ?? "")) {
            approve = true
            reason  = "ASE CLI invocation auto-approved"
        }
        else if (toolName === "Skill" && /^(?:ase:)?ase-.+/.test(toolInput.skill ?? "")) {
            approve = true
            reason  = "ASE skill invocation auto-approved"
        }
        else if (spec.mcpToolNamePattern.test(toolName)) {
            approve = true
            reason  = "ASE MCP tool invocation auto-approved"
        }
        else if (toolName === "Edit") {
            const sessionId   = input.session_id ?? input.sessionId ?? ""
            const activeSkill = this.readActiveSkill(sessionId)
            if (activeSkill === "ase-docs-proofread") {
                approve = true
                reason  = `${activeSkill}: user already consented via AskUserQuestion`
            }
        }

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
            process.stdout.write(JSON.stringify(payload))
        }
        return 0
    }

    /*  parse and validate the --tool option  */
    private parseTool (value: string): Tool {
        if (value !== "claude" && value !== "copilot")
            throw new Error(`invalid --tool value: "${value}" (expected "claude" or "copilot")`)
        return value
    }

    /*  register commands  */
    register (program: Command): void {
        /*  default for --tool derived from ASE_TOOL environment variable  */
        const envTool  = process.env.ASE_TOOL ?? ""
        const toolDflt = envTool !== "" ? envTool : "claude"

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
            .option("-t, --tool <tool>", "target tool (\"claude\" or \"copilot\")", toolDflt)
            .action(async (opts: { tool: string }) => {
                process.exit(await this.doSessionStart(this.parseTool(opts.tool)))
            })

        /*  register CLI sub-command "ase hook session-end"  */
        hookCmd
            .command("session-end")
            .description("handle SessionEnd hook event")
            .option("-t, --tool <tool>", "target tool (\"claude\" or \"copilot\")", toolDflt)
            .action((opts: { tool: string }) => {
                process.exit(this.doSessionEnd(this.parseTool(opts.tool)))
            })

        /*  register CLI sub-command "ase hook pre-tool-use"  */
        hookCmd
            .command("pre-tool-use")
            .description("handle tool PreToolUse hook event")
            .option("-t, --tool <tool>", "target tool (\"claude\" or \"copilot\")", toolDflt)
            .action((opts: { tool: string }) => {
                process.exit(this.doPreToolUse(this.parseTool(opts.tool)))
            })

        /*  register CLI sub-command "ase hook user-prompt-submit"  */
        hookCmd
            .command("user-prompt-submit")
            .description("handle UserPromptSubmit hook event (mark agent as busy)")
            .option("-t, --tool <tool>", "target tool (\"claude\" or \"copilot\")", toolDflt)
            .action((opts: { tool: string }) => {
                process.exit(this.doUserPromptSubmit(this.parseTool(opts.tool)))
            })

        /*  register CLI sub-command "ase hook stop"  */
        hookCmd
            .command("stop")
            .description("handle Stop hook event (mark agent as ready)")
            .option("-t, --tool <tool>", "target tool (\"claude\" or \"copilot\")", toolDflt)
            .action((opts: { tool: string }) => {
                process.exit(this.doStop(this.parseTool(opts.tool)))
            })
    }
}
