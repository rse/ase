/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import fs                from "node:fs/promises"
import path              from "node:path"
import { fileURLToPath } from "node:url"

import { Command }       from "commander"
import { execa }         from "execa"
import which             from "which"
import * as dotenvx      from "@dotenvx/dotenvx"
import Table             from "cli-table3"
import chalk             from "chalk"

import type Log          from "./ase-log.js"
import Version           from "./ase-version.js"

/*  type of supported tool (host) systems  */
type Tool = "claude" | "copilot" | "codex"

/*  per-tool dispatch table for the parts that actually differ between
    Claude Code, GitHub Copilot CLI, and OpenAI Codex CLI plugin
    marketplace integrations  */
type ToolSpec = {
    cli:       string
    label:     string
    pInstall:  string  /*  plugin subcommand to install   a plugin  */
    pRemove:   string  /*  plugin subcommand to uninstall a plugin  */
    pUpdate:   string  /*  plugin marketplace subcommand to refresh a snapshot  */
}
const toolSpecs: Record<Tool, ToolSpec> = {
    "claude":  { cli: "claude",  label: "Claude Code",      pInstall: "install", pRemove: "uninstall", pUpdate: "update"  },
    "copilot": { cli: "copilot", label: "Copilot CLI",      pInstall: "install", pRemove: "uninstall", pUpdate: "update"  },
    "codex":   { cli: "codex",   label: "OpenAI Codex CLI", pInstall: "add",     pRemove: "remove",    pUpdate: "upgrade" }
}

/*  per-MCP dispatch table  */
type mcpServerSpec = {
    id:       string,
    name:     string,
    version?: string,
    env:      string[],
    server:   string,
    skills:   string[],
    handler:  (spec: mcpServerSpec, tool: Tool, action: "activate" | "deactivate", envKey: string, envVal: string) => Promise<void>
}

/*  CLI command "ase setup"  */
export default class SetupCommand {
    constructor (private log: Log) {}

    /*  ensure a tool is available  */
    private async ensureTool (tool: string) {
        return which(tool).catch(() => {
            throw new Error(`mandatory tool "${tool}" not found in $PATH`)
        })
    }

    /*  determine whether a global "npm" operation requires "sudo" by
        checking whether the npm global install root is writable by the
        current user; on Windows or when already running as root, no
        elevation is needed  */
    private async npmGlobalNeedsSudo (): Promise<boolean> {
        /*  Windows has no "sudo" concept here  */
        if (process.platform === "win32")
            return false

        /*  already running as root  */
        const getuid = (process as unknown as { getuid?: () => number }).getuid
        if (typeof getuid === "function" && getuid.call(process) === 0)
            return false

        /*  determine the npm global prefix and probe writability of the
            directories that "npm -g" actually mutates  */
        let prefix = ""
        try {
            const result = await execa("npm", [ "prefix", "-g" ], { stdio: "pipe" })
            prefix = result.stdout.trim()
        }
        catch {
            /*  if we cannot determine the prefix, fall back to "no sudo"  */
            return false
        }
        if (prefix === "")
            return false
        const candidates = [
            prefix,
            path.join(prefix, "bin"),
            path.join(prefix, "lib", "node_modules")
        ]
        for (const dir of candidates) {
            try {
                await fs.access(dir, fs.constants.W_OK)
            }
            catch {
                /*  directory exists but not writable, or does not exist
                    inside a non-writable parent: require sudo  */
                try {
                    await fs.access(dir, fs.constants.F_OK)
                    return true
                }
                catch {
                    /*  directory does not exist: check parent writability  */
                    try {
                        await fs.access(path.dirname(dir), fs.constants.W_OK)
                    }
                    catch {
                        return true
                    }
                }
            }
        }
        return false
    }

    /*  build the (cmd, args) pair for an "npm" invocation, prefixing
        with "sudo" when necessary for global operations  */
    private async npmCmd (args: string[], global: boolean): Promise<{ cmd: string, args: string[] }> {
        if (global && await this.npmGlobalNeedsSudo()) {
            const sudo = await which("sudo").catch(() => "")
            if (sudo !== "") {
                this.log.write("info",
                    "setup: npm global install root not writable: using \"sudo\"")
                return { cmd: "sudo", args: [ "npm", ...args ] }
            }
            this.log.write("warning",
                "setup: npm global install root is not writable by current user " +
                "and \"sudo\" not found in $PATH: attempting without elevation")
        }
        return { cmd: "npm", args }
    }

    /*  run a sub-process, suppressing output on success and emitting it on failure  */
    private async run (cmd: string, args: string[], opts: { cwd?: string, quiet?: boolean, retries?: number, ignoreError?: string } = {}): Promise<void> {
        const { cwd, quiet = false, retries = 1, ignoreError } = opts
        const argsLog = args.map((arg) => arg.replace(/(_KEY=)(\S+)/, (_, k, v) => k + "*".repeat(v.length)))
        this.log.write("info", `setup: $ ${cmd} ${argsLog.join(" ")}` +
            (cwd !== undefined ? ` (cwd: ${cwd})` : ""))
        for (let i = 0; i < retries; i++) {
            const final = (i === retries - 1)
            try {
                if (quiet) {
                    const result = await execa(cmd, args, { stdio: "ignore", cwd, reject: false })
                    if (typeof result.exitCode === "number" && result.exitCode !== 0) {
                        if (!final) {
                            this.log.write("info",
                                `setup: attempt ${i + 1}/${retries} failed for "${cmd} ${args.join(" ")}" ` +
                                `(exit code: ${result.exitCode}): retrying...`)
                            await new Promise((resolve) => setTimeout(resolve, 1000))
                            continue
                        }
                        if (ignoreError !== undefined) {
                            this.log.write("info", `setup: ${ignoreError} (skipped)`)
                            return
                        }
                        this.log.write("error", `setup: command failed: exit code: ${result.exitCode}`)
                        throw new Error(`command "${cmd} ${args.join(" ")}" failed (exit code: ${result.exitCode})`)
                    }
                    return
                }
                await execa(cmd, args, { stdio: "pipe", cwd })
                return
            }
            catch (err: unknown) {
                if (!final) {
                    this.log.write("info",
                        `setup: attempt ${i + 1}/${retries} failed for "${cmd} ${args.join(" ")}": retrying...`)
                    await new Promise((resolve) => setTimeout(resolve, 1000))
                    continue
                }
                if (ignoreError !== undefined) {
                    this.log.write("info", `setup: ${ignoreError} (skipped)`)
                    return
                }
                const e = err as { exitCode?: number, stdout?: string, stderr?: string }
                const exitCode = typeof e.exitCode === "number" ? e.exitCode : -1
                this.log.write("error", `setup: command failed: exit code: ${exitCode}`)
                if (typeof e.stdout === "string" && e.stdout.length > 0) {
                    this.log.write("error", "setup: command failed: stdout:")
                    process.stdout.write(e.stdout)
                }
                if (typeof e.stderr === "string" && e.stderr.length > 0) {
                    this.log.write("error", "setup: command failed: stderr:")
                    process.stderr.write(e.stderr)
                }
                throw err
            }
        }
    }

    /*  handler for "ase setup install" (both tools)  */
    private async doInstall (tool: Tool, dev: boolean): Promise<number> {
        const spec = toolSpecs[tool]
        await this.ensureTool("npm")
        await this.ensureTool(spec.cli)

        this.log.write("info", `setup: install${dev ? "[dev]" : ""}: used ASE version: ${Version.current()}`)
        this.log.write("info", `setup: install${dev ? "[dev]" : ""}: ` +
            `installing ASE ${spec.label} plugin (origin: ${dev ? "local" : "remote/bundled"})`)
        const pkgdir  = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
        const source  = dev ? path.resolve(pkgdir, "..") : pkgdir
        await this.run(spec.cli, [ "plugin", "marketplace", "add", source ])
        await this.run(spec.cli, [ "plugin", spec.pInstall, "ase@ase" ], { retries: 3 })
        return 0
    }

    /*  handler for "ase setup update" (both tools)  */
    private async doUpdate (tool: Tool, force: boolean, dev: boolean): Promise<number> {
        const spec = toolSpecs[tool]
        await this.ensureTool("npm")
        await this.ensureTool(spec.cli)

        /*  best-effort stop of background service  */
        this.log.write("info", `setup: update${dev ? "[dev]" : ""}: ` +
            "stopping potentially running ASE service")
        await this.run("ase", [ "service", "stop" ], { quiet: true })

        if (dev) {
            /*  update ASE CLI Tool  */
            this.log.write("info", `setup: update[dev]: used ASE version: ${Version.current()}`)
            this.log.write("info", "setup: update[dev]: re-build ASE CLI tool (origin: local)")
            const tooldir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
            await this.run("npm", [ "install" ], { cwd: tooldir })
            await this.run("npm", [ "start", "build" ], { cwd: tooldir })

            /*  in development mode the local plugin files are already current
                but there is no version change in the plugin manifest,
                so just re-install the plugin to let the tool update its copy  */
            this.log.write("info", `setup: update[dev]: re-install ASE ${spec.label} plugin (origin: local)`)
            await this.run(spec.cli, [ "plugin", spec.pRemove,  "ase@ase" ],
                { ignoreError: `ASE ${spec.label} plugin not installed` })
            await this.run(spec.cli, [ "plugin", spec.pInstall, "ase@ase" ], { retries: 3 })
        }
        else {
            /*  perform NPM version check  */
            const current = Version.current()
            this.log.write("info", `setup: update: used ASE version: ${current}`)
            const latest  = await Version.latest()
            if (!force && latest !== "" && latest === current) {
                this.log.write("info", `setup: update: ASE already at latest version ${current}`)
                return 0
            }

            /*  update ASE CLI tool  */
            this.log.write("info", `setup: update: updating ASE CLI tool: ${current} -> ${latest}`)
            const updateCmd = await this.npmCmd([ "update", "-g", "@rse/ase" ], true)
            await this.run(updateCmd.cmd, updateCmd.args)

            /*  update ASE plugin (refresh the marketplace snapshot, then
                update the plugin itself; the OpenAI Codex CLI has no
                "plugin update" subcommand, so re-install it instead)  */
            this.log.write("info", `setup: update: updating ASE ${spec.label} plugin`)
            await this.run(spec.cli, [ "plugin", "marketplace", spec.pUpdate, "ase" ])
            if (tool !== "codex")
                await this.run(spec.cli, [ "plugin", "update", "ase@ase" ])
            else {
                await this.run(spec.cli, [ "plugin", spec.pRemove,  "ase@ase" ],
                    { ignoreError: `ASE ${spec.label} plugin not installed` })
                await this.run(spec.cli, [ "plugin", spec.pInstall, "ase@ase" ], { retries: 3 })
            }
        }
        return 0
    }

    /*  handler for "ase setup enable" (both tools)  */
    private async doEnable (tool: Tool): Promise<number> {
        const spec = toolSpecs[tool]
        await this.ensureTool(spec.cli)
        this.log.write("info", `setup: enable: enabling ASE ${spec.label} plugin`)
        /*  the GitHub Copilot CLI and OpenAI Codex CLI have no "plugin
            enable" subcommand, so (re-)install the plugin instead  */
        const args = tool === "claude" ?
            [ "plugin", "enable",   "ase@ase" ] :
            [ "plugin", spec.pInstall, "ase@ase" ]
        await this.run(spec.cli, args, { retries: tool === "claude" ? 1 : 3 })
        return 0
    }

    /*  handler for "ase setup disable" (both tools)  */
    private async doDisable (tool: Tool): Promise<number> {
        const spec = toolSpecs[tool]
        await this.ensureTool(spec.cli)
        this.log.write("info", `setup: disable: disabling ASE ${spec.label} plugin`)
        /*  the GitHub Copilot CLI and OpenAI Codex CLI have no "plugin
            disable" subcommand, so uninstall the plugin instead  */
        const args = tool === "claude" ?
            [ "plugin", "disable",  "ase@ase" ] :
            [ "plugin", spec.pRemove, "ase@ase" ]
        await this.run(spec.cli, args, { retries: tool === "claude" ? 1 : 3 })
        return 0
    }

    /*  handler for "ase setup uninstall" (both tools)  */
    private async doUninstall (tool: Tool, dev: boolean): Promise<number> {
        const spec = toolSpecs[tool]
        await this.ensureTool("npm")
        await this.ensureTool(spec.cli)

        /*  best-effort stop of background service  */
        this.log.write("info", `setup: uninstall${dev ? "[dev]" : ""}: ` +
            "stopping potentially running ASE service")
        await this.run("ase", [ "service", "stop" ], { quiet: true })

        /*  uninstall ASE plugin  */
        this.log.write("info", `setup: uninstall${dev ? "[dev]" : ""}: ` +
            `uninstalling ASE ${spec.label} plugin (origin: ${dev ? "local" : "remote/bundled"})`)
        await this.run(spec.cli, [ "plugin", spec.pRemove, "ase@ase" ],
            { ignoreError: `ASE ${spec.label} plugin not installed` })
        await this.run(spec.cli, [ "plugin", "marketplace", "remove", "ase" ],
            { ignoreError: `ASE ${spec.label} plugin marketplace not registered` })

        /*  uninstall ASE CLI tool (non-development only)  */
        if (!dev) {
            this.log.write("info", "setup: uninstall: uninstalling ASE CLI tool (origin: remote)")
            const uninstallCmd = await this.npmCmd([ "uninstall", "-g", "@rse/ase" ], true)
            await this.run(uninstallCmd.cmd, uninstallCmd.args)
        }
        return 0
    }

    /*  handler for "ase setup mcp list"  */
    private async doMcpList (): Promise<number> {
        const table = new Table({
            head:      [ "ID", "NAME", "VERS", "MCP", "KEY", "SKILLS" ],
            colWidths: [ 16, 16, 8, 21, 17, 20 ],
            wordWrap:  true,
            chars:     { "mid": "", "left-mid": "", "mid-mid": "", "right-mid": "" },
            style:     { head: [ "blue" ] }
        })
        for (const handle of this.mcpServers)
            table.push([
                chalk.bold(handle.id),
                handle.name,
                handle.version ?? "(unknown)",
                handle.server,
                handle.env.join(", "),
                handle.skills.join(", ")
            ])
        process.stdout.write(`${table.toString()}\n`)
        return 0
    }

    /*  handler for "ase setup mcp activate|deactivate [<servers>]"  */
    private async doMcp (action: "activate" | "deactivate", tool: Tool, servers: string): Promise<number> {
        await this.ensureTool(toolSpecs[tool].cli)

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
                    await this.mcpRemove(tool, handle.server)
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
            await handle.handler(handle, tool, action, envKey, envVal)
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

    /*  register an MCP server with the tool, supporting both the "stdio"
        (a local subprocess command) and "http" (a remote URL, optionally
        with HTTP headers) transports; the per-tool command line differs
        between Claude Code, GitHub Copilot CLI, and OpenAI Codex CLI  */
    private async mcpAdd (tool: Tool, name: string, env: Record<string, string>, transport:
        { type: "stdio", command: string[] } |
        { type: "http",  url: string, headers?: Record<string, string> }): Promise<void> {
        const args: string[] = [ "mcp", "add" ]
        if (tool === "claude") {
            args.push("--scope", "user")
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
        else if (tool === "copilot") {
            /*  GitHub Copilot CLI implies the stdio transport when the
                command is provided after "--"; only "http"/"sse" servers
                need an explicit "--transport" flag and take the URL as a
                positional argument  */
            if (transport.type === "stdio") {
                args.push(name)
                for (const [ key, val ] of Object.entries(env))
                    args.push("--env", `${key}=${val}`)
                args.push("--", ...transport.command)
            }
            else {
                args.push("--transport", "http")
                for (const [ key, val ] of Object.entries(transport.headers ?? {}))
                    args.push("--header", `${key}: ${val}`)
                args.push(name, transport.url)
            }
        }
        else {
            /*  OpenAI Codex CLI takes the server name as the first
                positional argument and implies the stdio transport when the
                command is provided after "--"; "http" servers take the URL
                via the "--url" option (with optional "--header" flags)  */
            if (transport.type === "stdio") {
                args.push(name)
                for (const [ key, val ] of Object.entries(env))
                    args.push("--env", `${key}=${val}`)
                args.push("--", ...transport.command)
            }
            else {
                for (const [ key, val ] of Object.entries(transport.headers ?? {}))
                    args.push("--header", `${key}: ${val}`)
                args.push(name, "--url", transport.url)
            }
        }
        await this.run(toolSpecs[tool].cli, args)
    }

    /*  unregister an MCP server from the tool; the per-tool command line
        differs between Claude Code, GitHub Copilot CLI, and OpenAI Codex CLI  */
    private async mcpRemove (tool: Tool, name: string): Promise<void> {
        const args = tool === "claude" ?
            [ "mcp", "remove", "--scope", "user", name ] :
            [ "mcp", "remove", name ]
        await this.run(toolSpecs[tool].cli, args,
            { ignoreError: `MCP server "${name}" not registered` })
    }

    /*  build a chat-model MCP handler from the per-model direct and
        OPENROUTER url/api/model triples, factoring out the shared
        mcp-to-openai stdio scaffold common to all chat-model servers  */
    private chatMcpHandler (
        direct: { url: string, api: string, model: string },
        router: { model: string }
    ): mcpServerSpec["handler"] {
        return async (spec, tool, action, envKey, envVal) => {
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
                })
            else
                await this.mcpRemove(tool, spec.server)
        }
    }

    /*  registry of pre-defined MCP servers: maps each server id onto its
        dedicated handler which performs the activate/deactivate operation  */
    private mcpServers: mcpServerSpec[] = [
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
            id:      "brave",
            name:    "Brave",
            version: "latest",
            env:     [ "BRAVE" ],
            server:  "search-brave",
            skills:  [ "ase-meta-search", "ase-meta-evaluate", "ase-arch-discover" ],
            handler: async (spec, tool, action, _envKey, envVal) => {
                if (action === "activate")
                    await this.mcpAdd(tool, spec.server, {
                        "BRAVE_API_KEY": envVal,
                        "BRAVE_MCP_ENABLED_TOOLS": "brave_web_search"
                    }, { type: "stdio", command: [ "npx", "-y", "@brave/brave-search-mcp-server" ] })
                else
                    await this.mcpRemove(tool, spec.server)
            }
        },
        {
            id:      "perplexity",
            name:    "Perplexity",
            version: "latest",
            env:     [ "PERPLEXITY" ],
            server:  "search-perplexity",
            skills:  [ "ase-meta-search", "ase-meta-evaluate", "ase-arch-discover" ],
            handler: async (spec, tool, action, _envKey, envVal) => {
                if (action === "activate")
                    await this.mcpAdd(tool, spec.server, {
                        "PERPLEXITY_API_KEY": envVal
                    }, { type: "stdio", command: [ "npx", "-y", "@perplexity-ai/mcp-server" ] })
                else
                    await this.mcpRemove(tool, spec.server)
            }
        },
        {
            id:      "exa",
            name:    "Exa",
            version: "latest",
            env:     [ "EXA" ],
            server:  "search-exa",
            skills:  [ "ase-meta-search", "ase-meta-evaluate", "ase-arch-discover" ],
            handler: async (spec, tool, action, _envKey, envVal) => {
                if (action === "activate")
                    await this.mcpAdd(tool, spec.server, {},
                        { type: "http", url: `https://mcp.exa.ai/mcp?exaApiKey=${envVal}` })
                else
                    await this.mcpRemove(tool, spec.server)
            }
        }
    ]

    /*  parse and validate the --tool option  */
    private parseTool (value: string): Tool {
        if (value !== "claude" && value !== "copilot" && value !== "codex")
            throw new Error(`invalid --tool value: "${value}" (expected "claude", "copilot", or "codex")`)
        return value
    }

    /*  register commands  */
    register (program: Command): void {
        /*  default for --dev derived from ASE_SETUP_DEV environment variable  */
        const envDev  = process.env.ASE_SETUP_DEV ?? ""
        const devDflt = envDev !== "" && envDev !== "0" && envDev.toLowerCase() !== "false"

        /*  default for --tool derived from ASE_TOOL environment variable  */
        const envTool  = process.env.ASE_TOOL ?? ""
        const toolDflt = envTool !== "" ? this.parseTool(envTool) : "claude"

        /*  register CLI top-level command "ase setup"  */
        const setupCmd = program
            .command("setup")
            .description("install, update, or uninstall the ASE tool and plugin")
            .action(() => {
                setupCmd.outputHelp()
                process.exit(1)
            })

        /*  register CLI sub-command "ase setup install"  */
        setupCmd
            .command("install")
            .description("install the ASE plugin for a tool")
            .option("-t, --tool <tool>", "target tool (\"claude\", \"copilot\", or \"codex\")", toolDflt)
            .option("-d, --dev",         "use local working copy instead of remote/bundled repository", devDflt)
            .action(async (opts: { tool: string, dev: boolean }) => {
                process.exit(await this.doInstall(this.parseTool(opts.tool), opts.dev))
            })

        /*  register CLI sub-command "ase setup update"  */
        setupCmd
            .command("update")
            .description("update the ASE tool and the ASE plugin for a tool")
            .option("-t, --tool <tool>", "target tool (\"claude\", \"copilot\", or \"codex\")", toolDflt)
            .option("-f, --force",       "always perform the update, even if already at latest version", false)
            .option("-d, --dev",         "use local working copy instead of remote/bundled repository", devDflt)
            .action(async (opts: { tool: string, force: boolean, dev: boolean }) => {
                process.exit(await this.doUpdate(this.parseTool(opts.tool), opts.force, opts.dev))
            })

        /*  register CLI sub-command "ase setup uninstall"  */
        setupCmd
            .command("uninstall")
            .description("uninstall the ASE plugin for a tool and the ASE tool")
            .option("-t, --tool <tool>", "target tool (\"claude\", \"copilot\", or \"codex\")", toolDflt)
            .option("-d, --dev",         "use local working copy instead of remote/bundled repository", devDflt)
            .action(async (opts: { tool: string, dev: boolean }) => {
                process.exit(await this.doUninstall(this.parseTool(opts.tool), opts.dev))
            })

        /*  register CLI sub-command "ase setup enable"  */
        setupCmd
            .command("enable")
            .description("enable the ASE plugin for a tool")
            .option("-t, --tool <tool>", "target tool (\"claude\", \"copilot\", or \"codex\")", toolDflt)
            .action(async (opts: { tool: string }) => {
                process.exit(await this.doEnable(this.parseTool(opts.tool)))
            })

        /*  register CLI sub-command "ase setup disable"  */
        setupCmd
            .command("disable")
            .description("disable the ASE plugin for a tool")
            .option("-t, --tool <tool>", "target tool (\"claude\", \"copilot\", or \"codex\")", toolDflt)
            .action(async (opts: { tool: string }) => {
                process.exit(await this.doDisable(this.parseTool(opts.tool)))
            })

        /*  register CLI sub-command "ase setup mcp"  */
        const mcpCmd = setupCmd
            .command("mcp")
            .description("activate or deactivate pre-defined MCP servers for a tool")
            .action(() => {
                mcpCmd.outputHelp()
                process.exit(1)
            })

        /*  register CLI sub-command "ase setup mcp list"  */
        mcpCmd
            .command("list")
            .description("list all available pre-defined MCP server names")
            .action(async () => {
                process.exit(await this.doMcpList())
            })

        /*  register CLI sub-command "ase setup mcp activate"  */
        mcpCmd
            .command("activate [servers]")
            .description("activate pre-defined MCP servers (comma-separated list, or \"all\")")
            .option("-t, --tool <tool>", "target tool (\"claude\", \"copilot\", or \"codex\")", toolDflt)
            .action(async (servers: string | undefined, opts: { tool: string }) => {
                process.exit(await this.doMcp("activate", this.parseTool(opts.tool), servers ?? "all"))
            })

        /*  register CLI sub-command "ase setup mcp deactivate"  */
        mcpCmd
            .command("deactivate [servers]")
            .description("deactivate pre-defined MCP servers (comma-separated list, or \"all\")")
            .option("-t, --tool <tool>", "target tool (\"claude\", \"copilot\", or \"codex\")", toolDflt)
            .action(async (servers: string | undefined, opts: { tool: string }) => {
                process.exit(await this.doMcp("deactivate", this.parseTool(opts.tool), servers ?? "all"))
            })
    }
}
