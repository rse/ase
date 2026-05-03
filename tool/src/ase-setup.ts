/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under GPL 3.0 <https://spdx.org/licenses/GPL-3.0-only>
*/

import path              from "node:path"
import { fileURLToPath } from "node:url"

import { Command }       from "commander"
import { execa }         from "execa"
import which             from "which"

import type Log          from "./ase-log.js"
import Version           from "./ase-version.js"

/*  CLI command "ase setup"  */
export default class SetupCommand {
    constructor (private log: Log) {}

    /*  ensure a tool is available  */
    private async ensureTool (tool: string) {
        return which(tool).catch(() => {
            throw new Error(`mandatory tool "${tool}" not found in $PATH`)
        })
    }

    /*  run a sub-process, suppressing output on success and emitting it on failure  */
    private async run (cmd: string, args: string[], opts: { cwd?: string, quiet?: boolean } = {}): Promise<void> {
        const { cwd, quiet = false } = opts
        this.log.write("info", `setup: $ ${cmd} ${args.join(" ")}` +
            (cwd !== undefined ? ` (cwd: ${cwd})` : ""))
        if (quiet) {
            await execa(cmd, args, { stdio: "ignore", cwd, reject: false })
            return
        }
        await execa(cmd, args, { stdio: "pipe", cwd }).catch((err) => {
            const exitCode = typeof err?.exitCode === "number" ? err.exitCode : -1
            this.log.write("error", `setup: command failed: exit code: ${exitCode}`)
            if (typeof err?.stdout === "string" && err.stdout.length > 0) {
                this.log.write("error", "setup: command failed: stdout:")
                process.stdout.write(err.stdout)
            }
            if (typeof err?.stderr === "string" && err.stderr.length > 0) {
                this.log.write("error", "setup: command failed: stderr:")
                process.stderr.write(err.stderr)
            }
            throw err
        })
    }

    /*  handler for "ase setup install"  */
    private async doInstall (dev: boolean): Promise<number> {
        await this.ensureTool("npm")
        await this.ensureTool("claude")

        this.log.write("info", `setup: install${dev ? "[dev]" : ""}: ` +
            `installing ASE Claude Code plugin (origin: ${dev ? "local" : "remote"})`)
        const source = dev ? process.cwd() : "rse/ase"
        await this.run("claude", [ "plugin", "marketplace", "add", source ])
        await this.run("claude", [ "plugin", "install", "ase@ase" ])
        return 0
    }

    /*  handler for "ase setup update"  */
    private async doUpdate (force: boolean, dev: boolean): Promise<number> {
        await this.ensureTool("npm")
        await this.ensureTool("claude")

        /*  best-effort stop of background service  */
        this.log.write("info", `setup: update${dev ? "[dev]" : ""}: ` +
            "stopping a potentially running ASE service")
        await this.run("ase", [ "service", "stop" ], { quiet: true })

        if (dev) {
            /*  update ASE CLI Tool  */
            this.log.write("info", "setup: update[dev]: re-build ASE CLI tool (origin: local)")
            const tooldir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
            await this.run("npm", [ "install" ], { cwd: tooldir })
            await this.run("npm", [ "start", "build" ], { cwd: tooldir })

            /*  in development mode the local plugin files are already current
                but there is no version change in the plugin manifest,
                so just re-install the plugin to let Claude Code update its copy  */
            this.log.write("info", "setup: update[dev]: re-install ASE Claude Code plugin (origin: local)")
            await this.run("claude", [ "plugin", "uninstall", "ase@ase" ])
            await this.run("claude", [ "plugin", "install",   "ase@ase" ])
        }
        else {
            /*  perform NPM version check  */
            const current = Version.current()
            const latest  = await Version.latest()
            if (!force && latest !== "" && latest === current) {
                this.log.write("info", `setup: update: ASE already at latest version ${current}`)
                return 0
            }

            /*  update ASE CLI tool  */
            this.log.write("info", `setup: update: updating ASE CLI tool: ${current} -> ${latest}`)
            await this.run("npm", [ "update", "-g", "@rse/ase" ])

            /*  update ASE Claude Code plugin  */
            this.log.write("info", "setup: update: updating ASE Claude Code plugin")
            await this.run("claude", [ "plugin", "marketplace", "update", "ase" ])
            await this.run("claude", [ "plugin", "update", "ase@ase" ])
        }
        return 0
    }

    /*  handler for "ase setup uninstall"  */
    private async doUninstall (dev: boolean): Promise<number> {
        await this.ensureTool("npm")
        await this.ensureTool("claude")

        /*  best-effort stop of background service  */
        this.log.write("info", `setup: uninstall${dev ? "[dev]" : ""}: ` +
            "stopping a potentially running ASE service")
        await this.run("ase", [ "service", "stop" ], { quiet: true })

        /*  uninstall ASE Claude Code plugin  */
        this.log.write("info", `setup: uninstall${dev ? "[dev]" : ""}: ` +
            `uninstalling ASE Claude Code plugin (origin: ${dev ? "local" : "remote"})`)
        await this.run("claude", [ "plugin", "uninstall", "ase@ase" ])
        await this.run("claude", [ "plugin", "marketplace", "remove", "ase" ])

        /*  uninstall ASE CLI tool (non-development only)  */
        if (!dev) {
            this.log.write("info", "setup: uninstall: uninstalling ASE CLI tool (origin: remote)")
            await this.run("npm", [ "uninstall", "-g", "@rse/ase" ])
        }
        return 0
    }

    /*  register commands  */
    register (program: Command): void {
        /*  default for --dev derived from ASE_SETUP_DEV environment variable  */
        const envDev  = process.env.ASE_SETUP_DEV ?? ""
        const devDflt = envDev !== "" && envDev !== "0" && envDev.toLowerCase() !== "false"

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
            .description("install the ASE Claude Code plugin")
            .option("-d, --dev", "use local working copy instead of remote repository", devDflt)
            .action(async (opts: { dev: boolean }) => {
                process.exit(await this.doInstall(opts.dev))
            })

        /*  register CLI sub-command "ase setup update"  */
        setupCmd
            .command("update")
            .description("update the ASE tool and the ASE Claude Code plugin")
            .option("-f, --force", "always perform the update, even if already at latest version", false)
            .option("-d, --dev",   "use local working copy instead of remote repository", devDflt)
            .action(async (opts: { force: boolean, dev: boolean }) => {
                process.exit(await this.doUpdate(opts.force, opts.dev))
            })

        /*  register CLI sub-command "ase setup uninstall"  */
        setupCmd
            .command("uninstall")
            .description("uninstall the ASE Claude Code plugin and the ASE tool")
            .option("-d, --dev", "use local working copy instead of remote repository", devDflt)
            .action(async (opts: { dev: boolean }) => {
                process.exit(await this.doUninstall(opts.dev))
            })
    }
}
