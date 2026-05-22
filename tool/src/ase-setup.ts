/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under GPL 3.0 <https://spdx.org/licenses/GPL-3.0-only>
*/

import fs                from "node:fs/promises"
import path              from "node:path"
import { fileURLToPath } from "node:url"

import { Command }       from "commander"
import { execa }         from "execa"
import which             from "which"

import type Log          from "./ase-log.js"
import Version           from "./ase-version.js"

/*  type of supported tool (host) systems  */
type Tool = "claude" | "copilot"

/*  per-tool dispatch table for the parts that actually differ between
    Claude Code and GitHub Copilot CLI plugin marketplace integrations  */
type ToolSpec = {
    cli:   string
    label: string
}
const toolSpecs: Record<Tool, ToolSpec> = {
    "claude":  { cli: "claude",  label: "Claude Code" },
    "copilot": { cli: "copilot", label: "Copilot CLI" }
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
        this.log.write("info", `setup: $ ${cmd} ${args.join(" ")}` +
            (cwd !== undefined ? ` (cwd: ${cwd})` : ""))
        for (let i = 0; i < retries; i++) {
            const final = (i === retries - 1)
            try {
                if (quiet) {
                    const result = await execa(cmd, args, { stdio: "ignore", cwd, reject: false })
                    if (typeof result.exitCode === "number" && result.exitCode !== 0 && !final) {
                        this.log.write("info",
                            `setup: attempt ${i + 1}/${retries} failed for "${cmd} ${args.join(" ")}" ` +
                            `(exit code: ${result.exitCode}): retrying...`)
                        await new Promise((resolve) => setTimeout(resolve, 1000))
                        continue
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
        await this.run(spec.cli, [ "plugin", "install", "ase@ase" ], { retries: 3 })
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
            await this.run(spec.cli, [ "plugin", "uninstall", "ase@ase" ],
                { ignoreError: `ASE ${spec.label} plugin not installed` })
            await this.run(spec.cli, [ "plugin", "install",   "ase@ase" ], { retries: 3 })
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

            /*  update ASE plugin  */
            this.log.write("info", `setup: update: updating ASE ${spec.label} plugin`)
            await this.run(spec.cli, [ "plugin", "marketplace", "update", "ase" ])
            await this.run(spec.cli, [ "plugin", "update", "ase@ase" ])
        }
        return 0
    }

    /*  handler for "ase setup enable" (both tools)  */
    private async doEnable (tool: Tool): Promise<number> {
        const spec = toolSpecs[tool]
        await this.ensureTool(spec.cli)
        this.log.write("info", `setup: enable: enabling ASE ${spec.label} plugin`)
        const args = tool === "claude" ?
            [ "plugin", "enable",  "ase@ase" ] :
            [ "plugin", "install", "ase@ase" ]
        await this.run(spec.cli, args, { retries: tool === "claude" ? 1 : 3 })
        return 0
    }

    /*  handler for "ase setup disable" (both tools)  */
    private async doDisable (tool: Tool): Promise<number> {
        const spec = toolSpecs[tool]
        await this.ensureTool(spec.cli)
        this.log.write("info", `setup: disable: disabling ASE ${spec.label} plugin`)
        const args = tool === "claude" ?
            [ "plugin", "disable",   "ase@ase" ] :
            [ "plugin", "uninstall", "ase@ase" ]
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
        await this.run(spec.cli, [ "plugin", "uninstall", "ase@ase" ],
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

    /*  parse and validate the --tool option  */
    private parseTool (value: string): Tool {
        if (value !== "claude" && value !== "copilot")
            throw new Error(`invalid --tool value: "${value}" (expected "claude" or "copilot")`)
        return value
    }

    /*  register commands  */
    register (program: Command): void {
        /*  default for --dev derived from ASE_SETUP_DEV environment variable  */
        const envDev  = process.env.ASE_SETUP_DEV ?? ""
        const devDflt = envDev !== "" && envDev !== "0" && envDev.toLowerCase() !== "false"

        /*  default for --tool derived from ASE_TOOL environment variable  */
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
            .option("-t, --tool <tool>", "target tool (\"claude\" or \"copilot\")", toolDflt)
            .option("-d, --dev",         "use local working copy instead of remote/bundled repository", devDflt)
            .action(async (opts: { tool: string, dev: boolean }) => {
                process.exit(await this.doInstall(this.parseTool(opts.tool), opts.dev))
            })

        /*  register CLI sub-command "ase setup update"  */
        setupCmd
            .command("update")
            .description("update the ASE tool and the ASE plugin for a tool")
            .option("-t, --tool <tool>", "target tool (\"claude\" or \"copilot\")", toolDflt)
            .option("-f, --force",       "always perform the update, even if already at latest version", false)
            .option("-d, --dev",         "use local working copy instead of remote/bundled repository", devDflt)
            .action(async (opts: { tool: string, force: boolean, dev: boolean }) => {
                process.exit(await this.doUpdate(this.parseTool(opts.tool), opts.force, opts.dev))
            })

        /*  register CLI sub-command "ase setup uninstall"  */
        setupCmd
            .command("uninstall")
            .description("uninstall the ASE plugin for a tool and the ASE tool")
            .option("-t, --tool <tool>", "target tool (\"claude\" or \"copilot\")", toolDflt)
            .option("-d, --dev",         "use local working copy instead of remote/bundled repository", devDflt)
            .action(async (opts: { tool: string, dev: boolean }) => {
                process.exit(await this.doUninstall(this.parseTool(opts.tool), opts.dev))
            })

        /*  register CLI sub-command "ase setup enable"  */
        setupCmd
            .command("enable")
            .description("enable the ASE plugin for a tool")
            .option("-t, --tool <tool>", "target tool (\"claude\" or \"copilot\")", toolDflt)
            .action(async (opts: { tool: string }) => {
                process.exit(await this.doEnable(this.parseTool(opts.tool)))
            })

        /*  register CLI sub-command "ase setup disable"  */
        setupCmd
            .command("disable")
            .description("disable the ASE plugin for a tool")
            .option("-t, --tool <tool>", "target tool (\"claude\" or \"copilot\")", toolDflt)
            .action(async (opts: { tool: string }) => {
                process.exit(await this.doDisable(this.parseTool(opts.tool)))
            })
    }
}
