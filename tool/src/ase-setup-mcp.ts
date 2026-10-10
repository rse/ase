/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import * as dotenvx      from "@dotenvx/dotenvx"
import chalk             from "chalk"
import { execa }         from "execa"

import type Log          from "./ase-lib-log.js"
import { renderTable }   from "./ase-lib-table.js"
import { toolSpecs, requireClaudeScope } from "./ase-setup-common.js"
import type { Tool, Scope, SetupRunner } from "./ase-setup-common.js"

/*  per-MCP dispatch table  */
type McpServerSpec = {
    id:       string
    name:     string
    version?: string
    env:      string[]
    server:   string
    skills:   string[]
    handler:  (spec: McpServerSpec, tool: Tool, scope: Scope, action: "activate" | "deactivate", envKey: string, envVal: string) => Promise<void>
}

/*  MCP server handling of "ase setup mcp"  */
export class SetupMcp {
    constructor (private log: Log, private runner: SetupRunner) {}

    /*  handler for "ase setup mcp list"  */
    async doMcpList (): Promise<number> {
        const rows: string[][] = []
        for (const handle of this.mcpServers)
            rows.push([
                chalk.bold(handle.id),
                handle.name,
                handle.version ?? "(unknown)",
                handle.server,
                handle.env.join(", "),
                handle.skills.join(", ")
            ])
        process.stdout.write(renderTable([ "ID", "NAME", "VERS", "MCP", "KEY", "SKILLS" ], rows))
        return 0
    }

    /*  handler for "ase setup mcp activate|deactivate [<servers>]"  */
    async doMcp (action: "activate" | "deactivate", tool: Tool, servers: string, scope: Scope): Promise<number> {
        requireClaudeScope(tool, scope)
        await this.runner.ensureTool(toolSpecs[tool].cli)

        /*  source .env files into the environment so the per-server
            API keys (ASE_MCP_KEY_<XXX>) can live in a .env file instead
            of the exported interactive shell environment  */
        dotenvx.config({ quiet: true, ignore: [ "MISSING_ENV_FILE" ] })

        /*  resolve the comma-separated list of server ids, with an empty
            list or the literal "all" expanding to every registered server
            id; track whether the ids were explicitly given on the CLI  */
        const known = this.mcpServers.map((handle) => handle.id)
        const explicit = servers.trim() !== "" && servers.trim() !== "all"
        const ids = explicit ?
            servers.split(",").map((s) => s.trim()).filter((s) => s !== "") : known
        for (const id of ids)
            if (this.mcpServers.find((handle) => handle.id === id) === undefined)
                throw new Error(`unknown MCP server "${id}" ` +
                    `(known: ${known.join(", ")})`)

        /*  dispatch each selected server to its dedicated handler  */
        for (const id of ids) {
            /*  find handle  */
            const handle = this.mcpServers.find((handle) => handle.id === id)!

            /*  determine information and action  */
            let envKey = ""
            let envVal = ""
            if (action === "activate") {
                /*  on activation, require at least one of the per-server API
                    key environment variables (ASE_MCP_KEY_<XXX>) to
                    be set; skip the server when its id was only
                    implicitly selected (empty list or "all"), but fail
                    hard when it was given explicitly on the CLI  */
                envKey = handle.env.find((name) =>
                    (process.env[`ASE_MCP_KEY_${name}`] ?? "") !== "") ?? ""
                if (envKey === "") {
                    const vars = handle.env.map((name) => `ASE_MCP_KEY_${name}`).join(", ")
                    if (explicit)
                        throw new Error(`none of ${vars} set: ` +
                            `cannot activate MCP server "${handle.server}"`)
                    this.log.write("info", `setup: mcp: activate: [${id}]: none of ${vars} set: ` +
                        `skipping MCP server "${handle.server}" (${handle.name})`)
                    continue
                }
                envVal = process.env[`ASE_MCP_KEY_${envKey}`] ?? ""
            }

            /*  probe whether the MCP server is currently registered with the tool  */
            const installed = await this.mcpInstalled(tool, handle.server)

            if (action === "activate") {
                /*  on activation, remove a stale registration first so the
                    handler can re-create it cleanly  */
                if (installed) {
                    this.log.write("info", `setup: mcp: activate: [${id}]: MCP server "${handle.server}" ` +
                        "already registered: removing stale registration first")
                    await this.mcpRemove(tool, handle.server, scope)
                }
            }
            else if (!installed) {
                /*  on deactivation, skip the removal of an absent server  */
                this.log.write("info", `setup: mcp: deactivate: [${id}]: MCP server "${handle.server}" ` +
                    "not registered: skipping removal")
                continue
            }

            /*  call the handler  */
            this.log.write("info", `setup: mcp: ${action}: [${id}]: MCP server "${handle.server}" ` +
                `(name: ${handle.name}${handle.version ? (", version: " + handle.version) : ""})`)
            await handle.handler(handle, tool, scope, action, envKey, envVal)
        }
        return 0
    }

    /*  probe whether an MCP server is currently registered with the tool
        by inspecting the exit code of "<cli> mcp get <name>"  */
    private async mcpInstalled (tool: Tool, name: string): Promise<boolean> {
        const result = await execa(toolSpecs[tool].cli, [ "mcp", "get", name ],
            { stdio: "ignore", reject: false })
        return result.exitCode === 0
    }

    /*  probe the registration scope of an MCP server by scraping the
        human-readable output of "<cli> mcp get <name>"; returns "undefined"
        for a server which is not registered with the tool at all  */
    async mcpScope (tool: Tool, name: string): Promise<string | undefined> {
        const result = await execa(toolSpecs[tool].cli, [ "mcp", "get", name ],
            { stdio: "pipe", reject: false })
        if (result.exitCode !== 0)
            return undefined

        /*  the Anthropic Claude Code CLI reports "Scope: <scope> config (...)",
            the GitHub Copilot CLI reports "Source: <scope>", and the
            OpenAI Codex CLI reports no scope information at all  */
        const m = (result.stdout ?? "").match(/^\s*(?:Scope|Source):\s*(\S+)/m)
        return m !== null ? m[1].toLowerCase() : "(n/a)"
    }

    /*  register an MCP server with the tool, supporting both the "stdio"
        (a local subprocess command) and "http" (a remote URL, optionally
        with HTTP headers) transports; the per-tool command line differs
        between Anthropic Claude Code CLI, GitHub Copilot CLI, and OpenAI Codex CLI  */
    private async mcpAdd (tool: Tool, name: string, env: Record<string, string>, transport:
        { type: "stdio", command: string[] } |
        { type: "http",  url: string, headers?: Record<string, string> }, scope: Scope): Promise<void> {
        const args: string[] = [ "mcp", "add" ]
        if (tool === "claude") {
            /*  always pass the scope explicitly, as the Anthropic Claude Code CLI
                defaults to the "local" scope (and not the "user" scope) for "mcp add"  */
            args.push("--scope", scope)
            args.push("--transport", transport.type)
            if (transport.type === "stdio") {
                for (const [ key, val ] of Object.entries(env))
                    args.push("-e", `${key}=${val}`)
                args.push("--", name, ...transport.command)
            }
            else {
                for (const [ key, val ] of Object.entries(transport.headers ?? {}))
                    args.push("--header", `${key}: ${val}`)
                args.push(name, transport.url)
            }
        }
        else {
            /*  the GitHub Copilot CLI and OpenAI Codex CLI both take the
                server name as a positional argument and imply the stdio
                transport when the command is provided after "--"; for "http"
                servers the GitHub Copilot CLI needs an explicit
                "--transport" flag and takes the URL positionally, while the
                OpenAI Codex CLI takes it via the "--url" option  */
            if (transport.type === "stdio") {
                args.push(name)
                for (const [ key, val ] of Object.entries(env))
                    args.push("--env", `${key}=${val}`)
                args.push("--", ...transport.command)
            }
            else {
                if (tool === "copilot")
                    args.push("--transport", "http")
                for (const [ key, val ] of Object.entries(transport.headers ?? {}))
                    args.push("--header", `${key}: ${val}`)
                if (tool === "copilot")
                    args.push(name, transport.url)
                else
                    args.push(name, "--url", transport.url)
            }
        }
        await this.runner.run(toolSpecs[tool].cli, args)
    }

    /*  unregister an MCP server from the tool; the per-tool command line
        differs between Anthropic Claude Code CLI, GitHub Copilot CLI, and OpenAI Codex CLI  */
    private async mcpRemove (tool: Tool, name: string, scope: Scope): Promise<void> {
        /*  always pass the scope explicitly, as the Anthropic Claude Code CLI
            does not default to the "user" scope for its "mcp" commands  */
        const scopeArgs = tool === "claude" ? [ "--scope", scope ] : []
        const args = [ "mcp", "remove", ...scopeArgs, name ]
        await this.runner.run(toolSpecs[tool].cli, args,
            { ignoreError: `MCP server "${name}" not registered` })
    }

    /*  build a chat-model MCP handler from the per-model direct and
        OPENROUTER url/api/model triples, factoring out the shared
        mcp-to-openai stdio scaffold common to all chat-model servers  */
    private chatMcpHandler (
        direct: { url: string, api: string, model: string },
        router: { model: string }
    ): McpServerSpec["handler"] {
        return async (spec, tool, scope, action, envKey, envVal) => {
            if (action === "activate")
                await this.mcpAdd(tool, spec.server, { OPENAI_KEY: envVal }, {
                    type: "stdio", command: [
                        "npx", "-y", "mcp-to-openai",
                        "--service",      spec.name,
                        "--mcp-tool",     "query",
                        ...(envKey === "OPENROUTER" ? [
                            "--openai-url",   "https://openrouter.ai/api/v1",
                            "--openai-api",   "completion",
                            "--openai-model", router.model
                        ] : [
                            "--openai-url",   direct.url,
                            "--openai-api",   direct.api,
                            "--openai-model", direct.model
                        ])
                    ]
                }, scope)
            else
                await this.mcpRemove(tool, spec.server, scope)
        }
    }

    /*  build a chat-model MCP handler which bridges to a locally
        installed AI agent harness CLI via the mcp-to-harness stdio
        scaffold; the API key environment variable carries no key at all,
        but instead the harness model identifier, with the special value
        "default" selecting the default model of the harness  */
    private harnessMcpHandler (harness: string): McpServerSpec["handler"] {
        return async (spec, tool, scope, action, _envKey, envVal) => {
            if (action === "activate")
                await this.mcpAdd(tool, spec.server, {}, {
                    type: "stdio", command: [
                        "npx", "-y", "mcp-to-harness",
                        "--service",  spec.name,
                        "--mcp-tool", "query",
                        "--harness",  harness,
                        ...(envVal !== "default" ? [
                            "--harness-model", envVal
                        ] : [])
                    ]
                }, scope)
            else
                await this.mcpRemove(tool, spec.server, scope)
        }
    }

    /*  registry of pre-defined MCP servers: maps each server id onto its
        dedicated handler which performs the activate/deactivate operation  */
    readonly mcpServers: McpServerSpec[] = [
        {
            id:      "openai-chatgpt",
            name:    "OpenAI ChatGPT",
            version: "5.5",
            env:     [ "OPENAI_CHATGPT", "OPENROUTER" ],
            server:  "chat-openai-chatgpt",
            skills:  [ "ase-meta-chat", "ase-meta-quorum" ],
            handler: this.chatMcpHandler(
                { url: "https://api.openai.com/v1", api: "responses", model: "gpt-5.5" },
                { model: "openai/gpt-5.5" })
        },
        {
            id:      "google-gemini",
            name:    "Google Gemini",
            version: "3.5",
            env:     [ "GOOGLE_GEMINI", "OPENROUTER" ],
            server:  "chat-google-gemini",
            skills:  [ "ase-meta-chat", "ase-meta-quorum" ],
            handler: this.chatMcpHandler(
                { url: "https://generativelanguage.googleapis.com/v1beta/openai/", api: "completion", model: "gemini-3.5-flash" },
                { model: "google/gemini-3.5-flash" })
        },
        {
            id:      "deepseek",
            name:    "DeepSeek",
            version: "4.0",
            env:     [ "DEEPSEEK", "OPENROUTER" ],
            server:  "chat-deepseek",
            skills:  [ "ase-meta-chat", "ase-meta-quorum" ],
            handler: this.chatMcpHandler(
                { url: "https://api.deepseek.com/v1", api: "completion", model: "deepseek-v4-flash" },
                { model: "deepseek/deepseek-v4-flash" })
        },
        {
            id:      "xai-grok",
            name:    "xAI Grok",
            version: "4.3",
            env:     [ "XAI_GROK", "OPENROUTER" ],
            server:  "chat-xai-grok",
            skills:  [ "ase-meta-chat", "ase-meta-quorum" ],
            handler: this.chatMcpHandler(
                { url: "https://api.x.ai/v1", api: "completion", model: "grok-4.3" },
                { model: "x-ai/grok-4.3" })
        },
        {
            id:      "alibaba-qwen",
            name:    "Alibaba Qwen",
            version: "3.7",
            env:     [ "ALIBABA_QWEN", "OPENROUTER" ],
            server:  "chat-alibaba-qwen",
            skills:  [ "ase-meta-chat", "ase-meta-quorum" ],
            handler: this.chatMcpHandler(
                { url: "https://dashscope.aliyuncs.com/compatible-mode/v1", api: "completion", model: "qwen3.7-max" },
                { model: "qwen/qwen3.7-max" })
        },
        {
            id:      "zai-glm",
            name:    "Z.AI GLM",
            version: "5.1",
            env:     [ "ZAI_GLM", "OPENROUTER" ],
            server:  "chat-zai-glm",
            skills:  [ "ase-meta-chat", "ase-meta-quorum" ],
            handler: this.chatMcpHandler(
                { url: "https://api.z.ai/api/paas/v4/", api: "completion", model: "glm-5.1" },
                { model: "z-ai/glm-5.1" })
        },
        {
            id:      "anthropic-claude",
            name:    "Anthropic Claude",
            version: "latest",
            env:     [ "ANTHROPIC_CLAUDE" ],
            server:  "chat-anthropic-claude",
            skills:  [ "ase-meta-chat", "ase-meta-quorum" ],
            handler: this.harnessMcpHandler("claude")
        },
        {
            id:      "openai-codex",
            name:    "OpenAI Codex",
            version: "latest",
            env:     [ "OPENAI_CODEX" ],
            server:  "chat-openai-codex",
            skills:  [ "ase-meta-chat", "ase-meta-quorum" ],
            handler: this.harnessMcpHandler("codex")
        },
        {
            id:      "github-copilot",
            name:    "GitHub Copilot",
            version: "latest",
            env:     [ "GITHUB_COPILOT" ],
            server:  "chat-github-copilot",
            skills:  [ "ase-meta-chat", "ase-meta-quorum" ],
            handler: this.harnessMcpHandler("copilot")
        },
        {
            id:      "brave",
            name:    "Brave",
            version: "latest",
            env:     [ "BRAVE" ],
            server:  "search-brave",
            skills:  [ "ase-meta-search", "ase-meta-evaluate", "ase-arch-discover" ],
            handler: async (spec, tool, scope, action, _envKey, envVal) => {
                if (action === "activate")
                    await this.mcpAdd(tool, spec.server, {
                        "BRAVE_API_KEY": envVal,
                        "BRAVE_MCP_ENABLED_TOOLS": "brave_web_search"
                    }, { type: "stdio", command: [ "npx", "-y", "@brave/brave-search-mcp-server" ] }, scope)
                else
                    await this.mcpRemove(tool, spec.server, scope)
            }
        },
        {
            id:      "perplexity",
            name:    "Perplexity",
            version: "latest",
            env:     [ "PERPLEXITY" ],
            server:  "search-perplexity",
            skills:  [ "ase-meta-search", "ase-meta-evaluate", "ase-arch-discover" ],
            handler: async (spec, tool, scope, action, _envKey, envVal) => {
                if (action === "activate")
                    await this.mcpAdd(tool, spec.server, {
                        "PERPLEXITY_API_KEY": envVal
                    }, { type: "stdio", command: [ "npx", "-y", "@perplexity-ai/mcp-server" ] }, scope)
                else
                    await this.mcpRemove(tool, spec.server, scope)
            }
        },
        {
            id:      "exa",
            name:    "Exa",
            version: "latest",
            env:     [ "EXA" ],
            server:  "search-exa",
            skills:  [ "ase-meta-search", "ase-meta-evaluate", "ase-arch-discover" ],
            handler: async (spec, tool, scope, action, _envKey, envVal) => {
                if (action === "activate")
                    await this.mcpAdd(tool, spec.server, {},
                        { type: "http", url: `https://mcp.exa.ai/mcp?exaApiKey=${encodeURIComponent(envVal)}` }, scope)
                else
                    await this.mcpRemove(tool, spec.server, scope)
            }
        }
    ]
}

