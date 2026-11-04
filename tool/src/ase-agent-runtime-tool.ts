/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import { stripVTControlCharacters } from "node:util"

import type { TokenCounts }         from "./ase-config-schema.js"
import type { Tool }                from "./ase-setup-common.js"
import type { AgentUsage }          from "./ase-agent-relay-core.js"
import type { LineLevel }           from "./ase-agent-runtime.js"

/*  a processing log entry decoded from an event of the agent tool,
    where an entry of agent message text is also an output line of the skill,
    and a quiet entry is not kept in the processing log attachment of the task  */
type ToolEntry = { level: LineLevel, msg: string, text?: boolean, quiet?: boolean }

/*  the maximum number of lines of an agent message kept in the processing log attachment
    of the task (as an agent message can be huge, e.g. the rendering of the whole task plan,
    which would otherwise be fed back into the next rendering of the task plan)  */
const TEXT_MAX = 20

/*  the "--model" option of all tools for the model <model> (none for the default model)  */
const modelArgs = (model: string): string[] => model !== "" ? [ "--model", model ] : []

/*  the per-tool headless invocation of the rendered prompt <prompt> with access to the
    additional directories <add> (the "--add-dir" options) and the model <model>, streaming JSONL
    events, where risky actions are denied or automatically reviewed instead of being prompted for
    (the variadic "--add-dir" of Claude has to precede the other options to not consume the prompt)  */
export const toolArgs: Record<Tool, (prompt: string, add: string[], model: string) => string[]> = {
    "claude":  (prompt, add, model) => [
        ...add, ...modelArgs(model), "-p", "--output-format", "stream-json", "--verbose", "--disallowedTools", "AskUserQuestion",
        "--permission-mode", "auto", "--permission-prompts", "none", prompt
    ],
    "copilot": (prompt, add, model) => [
        ...add, ...modelArgs(model), "--allow-all-tools", "--no-ask-user", "--no-color", "--output-format", "json", "-p", prompt
    ],
    "codex":   (prompt, add, model) => [
        "exec", ...add, ...modelArgs(model), "--json", "--approve-for-me", "--color", "never", prompt
    ]
}

/*  the per-tool rendering of the invocation of the skill <skill> with the arguments <args>:
    "/<skill>" for Claude and Copilot and "$<skill>" for Codex, where an un-namespaced ASE
    skill ("ase-*") gets the plugin namespace "ase:" for Claude only (as Copilot and Codex
    invoke the plugin skills un-namespaced), and the arguments are appended with a single
    space only if non-empty  */
export const skillPrompt = (tool: Tool, skill: string, args: string): string => {
    const name = tool === "claude" && skill.startsWith("ase-") && !skill.includes(":") ? `ase:${skill}` : skill
    return `${tool === "codex" ? "$" : "/"}${name}${args !== "" ? ` ${args}` : ""}`
}

/*  abbreviate a value into a single line of at most <max> characters  */
const brief = (value: unknown, max = 160): string => {
    const line = (typeof value === "string" ? value : JSON.stringify(value) ?? "").replace(/\s+/g, " ").trim()
    return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

/*  the constructors of processing log entries: informational, warning,
    warning on failure (else informational), and agent message text  */
const info = (msg: string): ToolEntry => ({ level: "info",    msg })
const warn = (msg: string): ToolEntry => ({ level: "warning", msg })
const note = (failed: boolean, msg: string): ToolEntry => failed ? warn(msg) : info(msg)
const text = (msg: string): ToolEntry => ({ level: "info",    msg, text: true })

/*  the per-tool decoding of a JSONL event of the agent tool into processing log entries,
    covering agent messages, tool calls, failures, and the final result only  */
const toolEvents: Record<Tool, (ev: any) => ToolEntry[]> = {
    "claude": (ev) => {
        const content: any[] = Array.isArray(ev.message?.content) ? ev.message.content : []
        if (ev.type === "system" && ev.subtype === "init")
            return [ info(`session ${ev.session_id} started (model: ${ev.model})`) ]
        else if (ev.type === "system" && ev.subtype === "api_retry")
            return [ warn(`API retry ${ev.attempt}/${ev.max_retries} (error: ${ev.error})`) ]
        else if (ev.type === "assistant")
            return content.filter((block) => block.type === "text" || block.type === "tool_use")
                .map((block) => block.type === "text" ? text(block.text) : info(`tool ${block.name}: ${brief(block.input)}`))
        else if (ev.type === "user")
            return content.filter((block) => block.type === "tool_result" && block.is_error === true)
                .map((block) => warn(`tool failed: ${brief(block.content)}`))
        else if (ev.type === "result")
            return [
                ...(Array.isArray(ev.permission_denials) ? ev.permission_denials : [])
                    .map((denial: any) => warn(`permission denied: tool ${denial.tool_name}: ${brief(denial.tool_input)}`)),
                note(ev.is_error === true, `result: ${ev.subtype} (turns: ${ev.num_turns}, ` +
                    `duration: ${Math.round((ev.duration_ms ?? 0) / 1000)}s, cost: $${Number(ev.total_cost_usd ?? 0).toFixed(2)})`)
            ]
        return []
    },
    "copilot": (ev) => {
        const data = ev.data ?? {}
        if (ev.type === "session.start")
            return [ info(`session ${data.sessionId} started (model: ${data.selectedModel ?? "default"})`) ]
        else if (ev.type === "assistant.message" && typeof data.content === "string" && data.content !== "")
            return [ text(data.content) ]
        else if (ev.type === "tool.execution_start")
            return [ info(`tool ${data.toolName}: ${brief(data.arguments ?? {})}`) ]
        else if (ev.type === "tool.execution_complete" && data.success !== true)
            return [ warn(`tool failed: ${brief(data.error?.message ?? data.result?.content ?? "")}`) ]
        else if (ev.type === "subagent.failed")
            return [ warn(`sub-agent ${data.agentName} failed: ${brief(data.error)}`) ]
        else if (ev.type === "session.error" || ev.type === "session.warning")
            return [ warn(`${ev.type.replace(/^session\./, "")}: ${brief(data.message)}`) ]
        else if (ev.type === "result")
            return [ note(ev.exitCode !== 0, `result: exit code ${ev.exitCode} ` +
                `(duration: ${Math.round((ev.usage?.sessionDurationMs ?? 0) / 1000)}s, ` +
                `premium requests: ${ev.usage?.premiumRequests ?? 0})`) ]
        return []
    },
    "codex": (ev) => {
        const item = ev.item ?? {}
        const done = ev.type === "item.completed"
        if (ev.type === "thread.started")
            return [ info(`thread ${ev.thread_id} started`) ]
        else if (ev.type === "item.started" && item.type === "command_execution")
            return [ info(`command: ${brief(item.command)}`) ]
        else if (ev.type === "item.started" && item.type === "mcp_tool_call")
            return [ info(`tool ${item.server}/${item.tool}: ${brief(item.arguments ?? {})}`) ]
        else if (done && item.type === "agent_message")
            return [ text(item.text) ]
        else if (done && item.type === "command_execution" && item.status !== "completed")
            return [ warn(`command ${item.status} (exit code ${item.exit_code ?? "none"}): ${brief(item.command)}`) ]
        else if (done && item.type === "mcp_tool_call" && item.status !== "completed")
            return [ warn(`tool ${item.server}/${item.tool} failed: ${brief(item.error?.message ?? "")}`) ]
        else if (done && item.type === "file_change")
            return [ note(item.status !== "completed", `file change ${item.status}: ` +
                (Array.isArray(item.changes) ? item.changes : []).map((change: any) => `${change.kind} ${change.path}`).join(", ")) ]
        else if (done && item.type === "web_search")
            return [ info(`web search: ${brief(item.query)}`) ]
        else if (done && item.type === "error")
            return [ warn(`error: ${brief(item.message)}`) ]
        else if (ev.type === "turn.completed")
            return [ info(`turn completed (tokens: input ${ev.usage?.input_tokens ?? 0}, output ${ev.usage?.output_tokens ?? 0})`) ]
        else if (ev.type === "turn.failed")
            return [ warn(`turn failed: ${brief(ev.error?.message)}`) ]
        else if (ev.type === "error")
            return [ warn(`error: ${brief(ev.message)}`) ]
        return []
    }
}

/*  the output tokens and the costs (in USD) of the usage of the agent tool,
    each staying null as long as the tool reports nothing about it, plus the
    cache read, cache write, and (uncached) input tokens and the AI request time
    (in ms, null if the tool reports none), for the AI usage accounting of the task  */
export type ToolCosts = Pick<AgentUsage, "costToken" | "costUSD"> & Omit<TokenCounts, "output"> & { apiMs: number | null }

/*  a reported amount (where a missing or invalid one counts as zero)  */
const amount = (value: unknown): number =>
    typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0

/*  the per-tool accounting of a JSONL event of the agent tool into its costs: the output tokens
    (as the input tokens are dominated by the context re-sent on every turn) and the costs in USD
    of Claude (over all its models, i.e. including its sub-agents, from its final result), nothing
    of Copilot (as it reports premium requests only), and the output tokens of Codex (summed over
    its turns), plus the cache and input tokens and the AI request time where reported (where
    the input tokens of Claude exclude the cache tokens, while those of Codex include them)  */
const toolCosts: Record<Tool, (ev: any, costs: ToolCosts) => void> = {
    "claude": (ev, costs) => {
        if (ev.type !== "result")
            return
        const models: any[] = ev.modelUsage !== null && typeof ev.modelUsage === "object" ? Object.values(ev.modelUsage) : []
        const sum = (key: string, fallback: string) => models.length > 0 ?
            models.reduce((acc, u) => acc + amount(u?.[key]), 0) :
            amount(ev.usage?.[fallback])
        costs.costToken = sum("outputTokens",             "output_tokens")
        costs.cread     = sum("cacheReadInputTokens",     "cache_read_input_tokens")
        costs.cwrite    = sum("cacheCreationInputTokens", "cache_creation_input_tokens")
        costs.input     = sum("inputTokens",              "input_tokens")
        costs.costUSD   = amount(ev.total_cost_usd)
        costs.apiMs     = typeof ev.duration_api_ms === "number" ? amount(ev.duration_api_ms) : null
    },
    "copilot": (ev, costs) => {
        /*  no tokens and costs reported  */
        if (ev.type === "result" && ev.usage?.sessionDurationMs !== undefined)
            costs.apiMs = amount(ev.usage.sessionDurationMs)
    },
    "codex": (ev, costs) => {
        if (ev.type === "turn.completed") {
            const cread  = amount(ev.usage?.cached_input_tokens)
            const cwrite = amount(ev.usage?.cache_write_input_tokens)
            costs.costToken = (costs.costToken ?? 0) + amount(ev.usage?.output_tokens)
            costs.cread    += cread
            costs.cwrite   += cwrite
            costs.input    += Math.max(0, amount(ev.usage?.input_tokens) - cread - cwrite)
        }
    }
}

/*  decode an output line of the agent tool into processing log entries without
    terminal control sequences: a JSONL event via the decoder of the tool (splitting
    agent message text into its lines, and accounting it into the costs), and any
    other non-blank line as plain text  */
export const toolEntries = (tool: Tool, line: string, costs: ToolCosts): ToolEntry[] => {
    let ev: unknown = null
    if (line.startsWith("{")) {
        try {
            ev = JSON.parse(line)
        }
        catch (_e) {
            /*  not a JSONL event: treat as plain text  */
        }
    }
    if (ev === null || typeof ev !== "object") {
        const plain = stripVTControlCharacters(line)
        return plain.trim() !== "" ? [ text(plain) ] : []
    }
    toolCosts[tool](ev, costs)
    return toolEvents[tool](ev).flatMap((entry) => {
        if (entry.text !== true)
            return [ { ...entry, msg: stripVTControlCharacters(entry.msg) } ]
        const msgs = stripVTControlCharacters(entry.msg).replace(/\n+$/, "").split("\n")
        return [
            ...msgs.map((msg, i) => ({ ...text(msg), ...(i >= TEXT_MAX ? { quiet: true } : {}) })),
            ...(msgs.length > TEXT_MAX ? [ info(`(${msgs.length - TEXT_MAX} further lines of agent message ` +
                "not kept in the processing log of the task)") ] : [])
        ]
    })
}

/*  whether a skill reported an error in the output lines of the headless agent tool, as the
    skills report their errors as "▶ ERROR: ..." (see "ase-common-task") while the agent tool
    still exits successfully, where an agent message merely quoting "ERROR:" (e.g. of some
    code or log) is no error  */
export const skillErrored = (output: string[]): boolean =>
    output.some((line) => /(?:^|▶ )ERROR:/.test(line.trim()))

/*  the last verdict word following the label <label> in the output lines of a skill
    (e.g. "APPROVE" of "**REVIEW VERDICT**: **APPROVE**"), or empty if none  */
export const verdictOf = (output: string[], label: string): string => {
    const re = new RegExp(`${label}\\W*([A-Z]+)`)
    let verdict = ""
    for (const line of output) {
        const m = re.exec(line)
        if (m !== null)
            verdict = m[1]
    }
    return verdict
}

