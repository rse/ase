/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import path              from "node:path"
import { fileURLToPath } from "node:url"

import { Command }       from "commander"
import { execa }         from "execa"
import chalk             from "chalk"

import type Log          from "./ase-lib-log.js"
import Version           from "./ase-lib-version.js"
import { renderTable }   from "./ase-lib-table.js"
import { SetupMcp }      from "./ase-setup-mcp.js"
import { SetupSettings } from "./ase-setup-settings.js"
import { toolSpecs, parseTool, parseScope, requireClaudeScope, SetupRunner } from "./ase-setup-common.js"
import type { Tool, Scope } from "./ase-setup-common.js"

/*  CLI command "ase setup"  */
export default class SetupCommand {
    private runner:   SetupRunner
    private mcp:      SetupMcp
    private settings: SetupSettings
    constructor (private log: Log) {
        this.runner   = new SetupRunner(log)
        this.mcp      = new SetupMcp(log, this.runner)
        this.settings = new SetupSettings(log)
    }

    /*  handler for "ase setup install" (all tools)  */
    private async doInstall (tool: Tool, dev: boolean, scope: Scope, statusline: boolean): Promise<number> {
        requireClaudeScope(tool, scope)
        if (statusline)
            this.settings.requireStatuslineTool(tool)
        const spec = toolSpecs[tool]
        await this.runner.ensureTool("npm")
        await this.runner.ensureTool(spec.cli)

        this.log.write("info", `setup: install${dev ? "[dev]" : ""}: used ASE version: ${Version.current()}`)
        this.log.write("info", `setup: install${dev ? "[dev]" : ""}: ` +
            `installing ASE ${spec.label} plugin (origin: ${dev ? "local" : "remote/bundled"})`)
        const pkgdir  = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
        const source  = !dev ? pkgdir : (process.env.ASE_SETUP_DEV_BASEDIR ?? path.resolve(pkgdir, ".."))
        const scopeArgs = tool === "claude" && scope !== "user" ? [ "--scope", scope ] : []
        await this.runner.run(spec.cli, [ "plugin", "marketplace", "add", source, ...scopeArgs ])
        await this.runner.run(spec.cli, [ "plugin", spec.pInstall, "ase@ase", ...scopeArgs ], { retries: 3 })

        /*  select the plugin-shipped ASE output style and enable the function
            hooks of the plugin-shipped mods (Anthropic Claude Code CLI only)  */
        if (tool === "claude") {
            await this.settings.outputStyleActivate(`install${dev ? "[dev]" : ""}`, scope)
            await this.settings.functionHooksActivate(`install${dev ? "[dev]" : ""}`, scope)
        }

        /*  optionally activate the ASE statusline, with the defaults of "ase setup statusline activate"  */
        if (statusline)
            return this.settings.doStatuslineActivate(tool, scope,
                { width: 0, margin: 2, padding: 0, icons: true, labels: true }, [])
        return 0
    }

    /*  handler for "ase setup update" (all tools)  */
    private async doUpdate (tool: Tool, force: boolean, dev: boolean, scope: Scope): Promise<number> {
        requireClaudeScope(tool, scope)
        const spec = toolSpecs[tool]
        await this.runner.ensureTool("npm")
        await this.runner.ensureTool(spec.cli)
        const scopeArgs = tool === "claude" && scope !== "user" ? [ "--scope", scope ] : []

        /*  best-effort stop of background service  */
        this.log.write("info", `setup: update${dev ? "[dev]" : ""}: ` +
            "stopping potentially running ASE service")
        await this.runner.run("ase", [ "service", "stop" ],
            { quiet: true, ignoreError: "ASE service not running" })

        if (dev) {
            /*  update ASE CLI Tool  */
            this.log.write("info", `setup: update[dev]: used ASE version: ${Version.current()}`)
            this.log.write("info", "setup: update[dev]: re-build ASE CLI tool (origin: local)")
            const pkgdir  = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
            const tooldir = process.env.ASE_SETUP_DEV_BASEDIR !== undefined ?
                path.join(process.env.ASE_SETUP_DEV_BASEDIR, "tool") : pkgdir
            await this.runner.run("npm", [ "install" ], { cwd: tooldir })
            await this.runner.run("npm", [ "start", "build" ], { cwd: tooldir })

            /*  in development mode the local plugin files are already current
                but there is no version change in the plugin manifest,
                so just re-install the plugin to let the tool update its copy  */
            this.log.write("info", `setup: update[dev]: re-install ASE ${spec.label} plugin (origin: local)`)
            await this.runner.run(spec.cli, [ "plugin", spec.pRemove,  "ase@ase", ...scopeArgs ],
                { ignoreError: `ASE ${spec.label} plugin not installed` })
            await this.runner.run(spec.cli, [ "plugin", spec.pInstall, "ase@ase", ...scopeArgs ], { retries: 3 })
        }
        else {
            /*  perform direct NPM registry version check  */
            const current = Version.current()
            this.log.write("info", `setup: update: used ASE version: ${current}`)
            const latest  = await Version.latest(true)
            if (!force && latest !== "" && latest === current) {
                this.log.write("info", `setup: update: ASE already at latest version ${current}`)
                return 0
            }

            /*  update ASE CLI tool (via an explicit version, as "npm update -g"
                stays within the caret range and hence never crosses a major version)  */
            this.log.write("info", `setup: update: updating ASE CLI tool: ${current} -> ${latest}`)
            const updateCmd = await this.runner.npmCmd([ "install", "-g", `@rse/ase@${latest !== "" ? latest : "latest"}` ], true)
            await this.runner.run(updateCmd.cmd, updateCmd.args)

            /*  update ASE plugin (refresh the marketplace snapshot, then
                update the plugin itself; the OpenAI Codex CLI has no
                "plugin update" subcommand, so re-install it instead;
                "plugin marketplace update" has no "--scope" option at all,
                so it never receives one)  */
            this.log.write("info", `setup: update: updating ASE ${spec.label} plugin`)
            await this.runner.run(spec.cli, [ "plugin", "marketplace", spec.pUpdate, "ase" ])
            if (tool !== "codex")
                await this.runner.run(spec.cli, [ "plugin", "update", "ase@ase", ...scopeArgs ])
            else {
                await this.runner.run(spec.cli, [ "plugin", spec.pRemove,  "ase@ase", ...scopeArgs ],
                    { ignoreError: `ASE ${spec.label} plugin not installed` })
                await this.runner.run(spec.cli, [ "plugin", spec.pInstall, "ase@ase", ...scopeArgs ], { retries: 3 })
            }
        }

        /*  select the plugin-shipped ASE output style and enable the function
            hooks of the plugin-shipped mods (Anthropic Claude Code CLI only)  */
        if (tool === "claude") {
            await this.settings.outputStyleActivate(`update${dev ? "[dev]" : ""}`, scope)
            await this.settings.functionHooksActivate(`update${dev ? "[dev]" : ""}`, scope)
        }

        /*  best-effort stop of a service re-spawned by a live MCP bridge
            during the update, so it gets re-spawned with the updated code  */
        this.log.write("info", `setup: update${dev ? "[dev]" : ""}: ` +
            "stopping potentially re-spawned ASE service")
        await this.runner.run("ase", [ "service", "stop" ],
            { quiet: true, ignoreError: "ASE service not running" })
        return 0
    }

    /*  handler for "ase setup enable|disable" (all tools)  */
    private async doToggle (tool: Tool, scope: Scope, action: "enable" | "disable"): Promise<number> {
        requireClaudeScope(tool, scope)
        const spec = toolSpecs[tool]
        await this.runner.ensureTool(spec.cli)
        this.log.write("info", `setup: ${action}: ${action === "enable" ? "enabling" : "disabling"} ` +
            `ASE ${spec.label} plugin`)
        /*  the GitHub Copilot CLI and OpenAI Codex CLI have no "plugin
            enable"/"plugin disable" subcommand, so (re-)install or
            uninstall the plugin instead  */
        const scopeArgs = scope !== "user" ? [ "--scope", scope ] : []
        const args = tool === "claude" ?
            [ "plugin", action, "ase@ase", ...scopeArgs ] :
            [ "plugin", action === "enable" ? spec.pInstall : spec.pRemove, "ase@ase" ]
        await this.runner.run(spec.cli, args, { retries: tool === "claude" ? 1 : 3 })
        return 0
    }

    /*  handler for "ase setup uninstall" (all tools)  */
    private async doUninstall (tool: Tool, dev: boolean, scope: Scope): Promise<number> {
        requireClaudeScope(tool, scope)
        const spec = toolSpecs[tool]
        await this.runner.ensureTool("npm")
        await this.runner.ensureTool(spec.cli)
        const scopeArgs = tool === "claude" && scope !== "user" ? [ "--scope", scope ] : []

        /*  best-effort stop of background service  */
        this.log.write("info", `setup: uninstall${dev ? "[dev]" : ""}: ` +
            "stopping potentially running ASE service")
        await this.runner.run("ase", [ "service", "stop" ],
            { quiet: true, ignoreError: "ASE service not running" })

        /*  deselect the plugin-shipped ASE output style and disable the function
            hooks of the plugin-shipped mods (Anthropic Claude Code CLI only)  */
        if (tool === "claude") {
            await this.settings.outputStyleDeactivate(`uninstall${dev ? "[dev]" : ""}`, scope)
            await this.settings.functionHooksDeactivate(`uninstall${dev ? "[dev]" : ""}`, scope)
        }

        /*  uninstall ASE plugin  */
        this.log.write("info", `setup: uninstall${dev ? "[dev]" : ""}: ` +
            `uninstalling ASE ${spec.label} plugin (origin: ${dev ? "local" : "remote/bundled"})`)
        await this.runner.run(spec.cli, [ "plugin", spec.pRemove, "ase@ase", ...scopeArgs ],
            { ignoreError: `ASE ${spec.label} plugin not installed` })
        await this.runner.run(spec.cli, [ "plugin", "marketplace", "remove", "ase", ...scopeArgs ],
            { ignoreError: `ASE ${spec.label} plugin marketplace not registered` })

        /*  uninstall ASE CLI tool (non-development only)  */
        if (!dev) {
            this.log.write("info", "setup: uninstall: uninstalling ASE CLI tool (origin: remote)")
            const uninstallCmd = await this.runner.npmCmd([ "uninstall", "-g", "@rse/ase" ], true)
            await this.runner.run(uninstallCmd.cmd, uninstallCmd.args)
        }
        return 0
    }

    /*  handler for "ase setup status"  */
    private async doStatus (tool: Tool): Promise<number> {
        const spec = toolSpecs[tool]
        await this.runner.ensureTool(spec.cli)
        this.log.write("info", `setup: status: probing ASE registrations for ${spec.label}`)
        const rows: string[][] = []

        /*  report the ASE plugin registrations, with an absent plugin
            still rendered as an explicit row instead of being omitted  */
        const plugins = await this.pluginStatus(tool)
        if (plugins.length === 0)
            rows.push([ "PLUGIN", chalk.bold("ase@ase"), "(n/a)", "not installed" ])
        else
            for (const plugin of plugins)
                rows.push([ "PLUGIN", chalk.bold("ase@ase"), plugin.scope, plugin.status ])

        /*  report the registered MCP servers, probed concurrently and
            silently skipping every server which is not registered at all  */
        const scopes = await Promise.all(this.mcp.mcpServers.map((handle) =>
            this.mcp.mcpScope(tool, handle.server)))
        for (let i = 0; i < this.mcp.mcpServers.length; i++) {
            const scope = scopes[i]
            if (scope === undefined)
                continue
            rows.push([ "MCP", chalk.bold(this.mcp.mcpServers[i].server), scope, "registered" ])
        }

        /*  report the ASE output style selections  */
        for (const outputStyle of await this.settings.outputStyleStatus(tool))
            rows.push([ "OUTPUTSTYLE", chalk.bold(outputStyle.file), outputStyle.scope, outputStyle.status ])

        /*  report the function hooks enablements  */
        for (const functionHooks of await this.settings.functionHooksStatus(tool))
            rows.push([ "FUNCTIONHOOKS", chalk.bold(functionHooks.file), functionHooks.scope, functionHooks.status ])

        /*  report the ASE statusline registrations  */
        for (const statusline of await this.settings.statuslineStatus(tool))
            rows.push([ "STATUSLINE", chalk.bold(statusline.file), statusline.scope, statusline.status ])

        /*  report the ASE telemetry configurations  */
        for (const telemetry of await this.settings.telemetryStatus(tool))
            rows.push([ "TELEMETRY", chalk.bold(telemetry.file), telemetry.scope, telemetry.status ])

        process.stdout.write(renderTable([ "KIND", "ID", "SCOPE", "STATUS" ], rows))
        return 0
    }

    /*  probe the ASE plugin registrations by scraping the human-readable
        output of "<cli> plugin list", whose format differs per tool  */
    private async pluginStatus (tool: Tool): Promise<{ scope: string, status: string }[]> {
        const result = await execa(toolSpecs[tool].cli, [ "plugin", "list" ],
            { stdio: "pipe", reject: false })
        const lines = (result.stdout ?? "").split(/\r?\n/)
        const entries: { scope: string, status: string }[] = []
        if (tool === "claude") {
            /*  the Anthropic Claude Code CLI renders one indented block per
                plugin, carrying an explicit "Scope:" and "Status:" field
                (field labels can consist of multiple words, e.g. the
                "Read from:" field of directory-based marketplaces)  */
            for (let i = 0; i < lines.length; i++) {
                if (!/(^|\s)ase@ase\s*$/.test(lines[i]))
                    continue
                let scope  = "(unknown)"
                let status = "(unknown)"
                for (let j = i + 1; j < lines.length; j++) {
                    const m = lines[j].match(/^\s+(\w[\w ]*):\s*(.+?)\s*$/)
                    if (m === null)
                        break

                    /*  strip the leading "✔"/"✘" glyph of the status value  */
                    const value = m[2].replace(/^[^\p{L}\p{N}]+/u, "")
                    if (m[1] === "Scope")
                        scope = value
                    else if (m[1] === "Status")
                        status = value
                }
                entries.push({ scope, status })
            }
        }
        else if (tool === "copilot") {
            /*  the GitHub Copilot CLI renders a flat bullet list which
                carries neither a scope nor an enabled/disabled state  */
            for (const line of lines)
                if (/(^|\s)ase@ase(\s|\(|$)/.test(line))
                    entries.push({ scope: "(n/a)", status: "installed" })
        }
        else {
            /*  the OpenAI Codex CLI renders a per-marketplace table whose
                second column carries the combined installation status  */
            for (const line of lines) {
                const m = line.match(/^ase@ase\s+(not installed|installed(?:,\s*\w+)?)/)
                if (m !== null && m[1] !== "not installed")
                    entries.push({ scope: "(n/a)", status: m[1] })
            }
        }
        return entries
    }

    /*  register commands  */
    register (program: Command): void {
        /*  default for --dev derived from ASE_SETUP_DEV environment variable  */
        const envDev  = process.env.ASE_SETUP_DEV ?? ""
        const devDflt = envDev !== "" && envDev !== "0" && envDev.toLowerCase() !== "false"

        /*  default for --tool derived from ASE_TOOL environment variable
            (validated lazily by "parseTool" in each action, so an invalid
            value cannot break unrelated "ase" commands at startup)  */
        const envTool  = process.env.ASE_TOOL ?? ""
        const toolDflt = envTool !== "" ? envTool : "claude"

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
            .option("-t, --tool <tool>",   "target tool (\"claude\", \"copilot\", or \"codex\")", toolDflt)
            .option("-s, --scope <scope>", "target scope (\"user\", \"project\", or \"local\")", "user")
            .option("-d, --dev",           "use local working copy instead of remote/bundled repository", devDflt)
            .option("--statusline",        "additionally activate the ASE statusline (like \"ase setup statusline activate\")", false)
            .action(async (opts: { tool: string, scope: string, dev: boolean, statusline: boolean }) => {
                process.exit(await this.doInstall(parseTool(opts.tool), opts.dev, parseScope(opts.scope), opts.statusline))
            })

        /*  register CLI sub-command "ase setup update"  */
        setupCmd
            .command("update")
            .description("update the ASE tool and the ASE plugin for a tool")
            .option("-t, --tool <tool>",   "target tool (\"claude\", \"copilot\", or \"codex\")", toolDflt)
            .option("-s, --scope <scope>", "target scope (\"user\", \"project\", or \"local\", default: auto-detected)")
            .option("-f, --force",         "always perform the update, even if already at latest version", false)
            .option("-d, --dev",           "use local working copy instead of remote/bundled repository", devDflt)
            .action(async (opts: { tool: string, scope: string | undefined, force: boolean, dev: boolean }) => {
                const tool  = parseTool(opts.tool)
                const scope = opts.scope === undefined ? await this.settings.detectPluginScope(tool) : parseScope(opts.scope)
                process.exit(await this.doUpdate(tool, opts.force, opts.dev, scope))
            })

        /*  register CLI sub-command "ase setup uninstall"  */
        setupCmd
            .command("uninstall")
            .description("uninstall the ASE plugin for a tool and the ASE tool")
            .option("-t, --tool <tool>",   "target tool (\"claude\", \"copilot\", or \"codex\")", toolDflt)
            .option("-s, --scope <scope>", "target scope (\"user\", \"project\", or \"local\", default: auto-detected)")
            .option("-d, --dev",           "use local working copy instead of remote/bundled repository", devDflt)
            .action(async (opts: { tool: string, scope: string | undefined, dev: boolean }) => {
                const tool  = parseTool(opts.tool)
                const scope = opts.scope === undefined ? await this.settings.detectPluginScope(tool) : parseScope(opts.scope)
                process.exit(await this.doUninstall(tool, opts.dev, scope))
            })

        /*  register CLI sub-command "ase setup enable"  */
        setupCmd
            .command("enable")
            .description("enable the ASE plugin for a tool")
            .option("-t, --tool <tool>",   "target tool (\"claude\", \"copilot\", or \"codex\")", toolDflt)
            .option("-s, --scope <scope>", "target scope (\"user\", \"project\", or \"local\", default: auto-detected)")
            .action(async (opts: { tool: string, scope: string | undefined }) => {
                const tool  = parseTool(opts.tool)
                const scope = opts.scope === undefined ? await this.settings.detectPluginScope(tool) : parseScope(opts.scope)
                process.exit(await this.doToggle(tool, scope, "enable"))
            })

        /*  register CLI sub-command "ase setup disable"  */
        setupCmd
            .command("disable")
            .description("disable the ASE plugin for a tool")
            .option("-t, --tool <tool>",   "target tool (\"claude\", \"copilot\", or \"codex\")", toolDflt)
            .option("-s, --scope <scope>", "target scope (\"user\", \"project\", or \"local\", default: auto-detected)")
            .action(async (opts: { tool: string, scope: string | undefined }) => {
                const tool  = parseTool(opts.tool)
                const scope = opts.scope === undefined ? await this.settings.detectPluginScope(tool) : parseScope(opts.scope)
                process.exit(await this.doToggle(tool, scope, "disable"))
            })

        /*  register CLI sub-command "ase setup status"  */
        setupCmd
            .command("status")
            .description("report the ASE plugin, MCP server, output style, function hooks, statusline, and telemetry registrations for a tool")
            .option("-t, --tool <tool>",   "target tool (\"claude\", \"copilot\", or \"codex\")", toolDflt)
            .action(async (opts: { tool: string }) => {
                process.exit(await this.doStatus(parseTool(opts.tool)))
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
                process.exit(await this.mcp.doMcpList())
            })

        /*  register CLI sub-command "ase setup mcp activate"  */
        mcpCmd
            .command("activate [servers]")
            .description("activate pre-defined MCP servers (comma-separated list, or \"all\")")
            .option("-t, --tool <tool>",   "target tool (\"claude\", \"copilot\", or \"codex\")", toolDflt)
            .option("-s, --scope <scope>", "target scope (\"user\", \"project\", or \"local\")", "user")
            .action(async (servers: string | undefined, opts: { tool: string, scope: string }) => {
                process.exit(await this.mcp.doMcp("activate", parseTool(opts.tool), servers ?? "all", parseScope(opts.scope)))
            })

        /*  register CLI sub-command "ase setup mcp deactivate"  */
        mcpCmd
            .command("deactivate [servers]")
            .description("deactivate pre-defined MCP servers (comma-separated list, or \"all\")")
            .option("-t, --tool <tool>",   "target tool (\"claude\", \"copilot\", or \"codex\")", toolDflt)
            .option("-s, --scope <scope>", "target scope (\"user\", \"project\", or \"local\")", "user")
            .action(async (servers: string | undefined, opts: { tool: string, scope: string }) => {
                process.exit(await this.mcp.doMcp("deactivate", parseTool(opts.tool), servers ?? "all", parseScope(opts.scope)))
            })

        /*  parser for the non-negative integer "ase setup statusline" options  */
        const parseNonNeg = (name: string) => (value: string): number => {
            if (!/^\d+$/.test(value))
                throw new Error(`invalid --${name} value: "${value}" (expected a non-negative integer)`)
            return Number.parseInt(value, 10)
        }

        /*  register CLI sub-command "ase setup statusline"  */
        const statuslineCmd = setupCmd
            .command("statusline")
            .description("activate or deactivate the ASE statusline for a tool")
            .action(() => {
                statuslineCmd.outputHelp()
                process.exit(1)
            })

        /*  register CLI sub-command "ase setup statusline activate"  */
        statuslineCmd
            .command("activate [format...]")
            .description("activate the ASE statusline (optionally with custom format lines)")
            .option("-t, --tool <tool>",   "target tool (\"claude\" or \"copilot\"; \"codex\" is unsupported)", toolDflt)
            .option("-s, --scope <scope>", "target scope (\"user\", \"project\", or \"local\")", "user")
            .option("-w, --width <n>",     "force terminal width to <n> characters (0 = auto-detect via /dev/tty)",
                parseNonNeg("width"), 0)
            .option("-m, --margin <n>",    "reduce maximum used terminal width by <n> characters on each side",
                parseNonNeg("margin"), 2)
            .option("-p, --padding <n>",   "pad each rendered line with <n> spaces on each side",
                parseNonNeg("padding"), 0)
            .option("--no-icons",          "disable icons in placeholder rendering")
            .option("--no-labels",         "disable labels in front of bold values")
            .action(async (format: string[] | undefined,
                opts: { tool: string, scope: string, width: number, margin: number, padding: number, icons: boolean, labels: boolean }) => {
                process.exit(await this.settings.doStatuslineActivate(
                    parseTool(opts.tool), parseScope(opts.scope),
                    { width: opts.width, margin: opts.margin, padding: opts.padding, icons: opts.icons, labels: opts.labels },
                    format ?? []))
            })

        /*  register CLI sub-command "ase setup statusline deactivate"  */
        statuslineCmd
            .command("deactivate")
            .description("deactivate the ASE statusline")
            .option("-t, --tool <tool>",   "target tool (\"claude\" or \"copilot\"; \"codex\" is unsupported)", toolDflt)
            .option("-s, --scope <scope>", "target scope (\"user\", \"project\", or \"local\")", "user")
            .action(async (opts: { tool: string, scope: string }) => {
                process.exit(await this.settings.doStatuslineDeactivate(parseTool(opts.tool), parseScope(opts.scope)))
            })

        /*  register CLI sub-command "ase setup telemetry"  */
        const telemetryCmd = setupCmd
            .command("telemetry")
            .description("activate or deactivate the ASE telemetry (AI usage accounting) for a tool")
            .action(() => {
                telemetryCmd.outputHelp()
                process.exit(1)
            })

        /*  register CLI sub-command "ase setup telemetry activate"  */
        telemetryCmd
            .command("activate")
            .description("activate the ASE telemetry (OpenTelemetry export to the ASE ingress)")
            .option("-t, --tool <tool>",   "target tool (\"claude\", \"copilot\", or \"codex\")", toolDflt)
            .action(async (opts: { tool: string }) => {
                process.exit(await this.settings.doTelemetryActivate(parseTool(opts.tool)))
            })

        /*  register CLI sub-command "ase setup telemetry deactivate"  */
        telemetryCmd
            .command("deactivate")
            .description("deactivate the ASE telemetry")
            .option("-t, --tool <tool>",   "target tool (\"claude\", \"copilot\", or \"codex\")", toolDflt)
            .action(async (opts: { tool: string }) => {
                process.exit(await this.settings.doTelemetryDeactivate(parseTool(opts.tool)))
            })
    }
}

