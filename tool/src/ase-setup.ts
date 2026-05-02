/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under GPL 3.0 <https://spdx.org/licenses/GPL-3.0-only>
*/

import { Command } from "commander"
import { execa }   from "execa"

import type Log    from "./ase-log.js"
import pkg         from "../package.json" with { type: "json" }

/*  CLI command "ase setup"  */
export default class SetupCommand {
    constructor (private log: Log) {}

    /*  run a sub-process with inherited stdio so users see live output  */
    private async run (cmd: string, args: string[]): Promise<void> {
        this.log.write("info", `setup: running: ${cmd} ${args.join(" ")}`)
        await execa(cmd, args, { stdio: "inherit" })
    }

    /*  capture stdout of a sub-process  */
    private async capture (cmd: string, args: string[]): Promise<string> {
        this.log.write("info", `setup: running: ${cmd} ${args.join(" ")}`)
        const r = await execa(cmd, args, { stdio: [ "ignore", "pipe", "pipe" ] })
        return r.stdout.trim()
    }

    /*  handler for "ase setup install"  */
    private async doInstall (dev: boolean): Promise<number> {
        this.log.write("info", "setup: install: installing ASE Claude Code plugin")
        const source = dev ? process.cwd() : "rse/ase"
        await this.run("claude", [ "plugin", "marketplace", "add", source ])
        await this.run("claude", [ "plugin", "install", "ase@ase" ])
        return 0
    }

    /*  handler for "ase setup update"  */
    private async doUpdate (force: boolean, dev: boolean): Promise<number> {
        if (dev) {
            /*  in dev mode the local files are already current, so just
                re-install the plugin to pick up local changes  */
            this.log.write("info", "setup: update: re-installing ASE Claude Code plugin from local hierarchy")
            await this.run("claude", [ "plugin", "uninstall", "ase@ase" ])
            await this.run("claude", [ "plugin", "install",   "ase@ase" ])
            return 0
        }
        else {
            /*  perform version check  */
            const current = pkg.version
            let   latest  = ""
            try {
                latest = await this.capture("npm", [ "view", "@rse/ase", "version" ])
            }
            catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err)
                this.log.write("warning", `setup: update: failed to query latest ASE version: ${message}`)
            }
            if (!force && latest !== "" && latest === current) {
                this.log.write("info", `setup: update: ASE already at latest version ${current}`)
                return 0
            }
            this.log.write("info", `setup: update: updating ASE tool: ${current} -> ${latest}`)

            /*  update ASE CLI Tool  */
            this.log.write("info", "setup: update: updating ASE CLI tool")
            await this.run("npm", [ "update", "-g", "@rse/ase" ])

            /*  update ASE Claude Code Plugin  */
            this.log.write("info", "setup: update: updating ASE Claude Code plugin")
            await this.run("claude", [ "plugin", "marketplace", "update", "ase" ])
            await this.run("claude", [ "plugin", "update", "ase@ase" ])
        }
        return 0
    }

    /*  handler for "ase setup uninstall"  */
    private async doUninstall (_dev: boolean): Promise<number> {
        this.log.write("info", "setup: uninstall: uninstalling ASE Claude Code plugin")
        await this.run("claude", [ "plugin", "uninstall", "ase@ase" ])
        await this.run("claude", [ "plugin", "marketplace", "remove", "ase" ])
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
            .option("-d, --dev", "use local installation hierarchy instead of GitHub", devDflt)
            .action(async (opts: { dev: boolean }) => {
                process.exit(await this.doInstall(opts.dev))
            })

        /*  register CLI sub-command "ase setup update"  */
        setupCmd
            .command("update")
            .description("update the ASE tool and the ASE Claude Code plugin")
            .option("-f, --force", "always perform the update, even if already at latest version", false)
            .option("-d, --dev",   "use local installation hierarchy instead of GitHub", devDflt)
            .action(async (opts: { force: boolean, dev: boolean }) => {
                process.exit(await this.doUpdate(opts.force, opts.dev))
            })

        /*  register CLI sub-command "ase setup uninstall"  */
        setupCmd
            .command("uninstall")
            .description("uninstall the ASE Claude Code plugin and the ASE tool")
            .option("-d, --dev", "use local installation hierarchy instead of GitHub", devDflt)
            .action(async (opts: { dev: boolean }) => {
                process.exit(await this.doUninstall(opts.dev))
            })
    }
}
