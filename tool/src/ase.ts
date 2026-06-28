#!/usr/bin/env node
/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import { Command, CommanderError, Option } from "commander"
import Log                         from "./ase-log.js"
import type { LogLevel }           from "./ase-log.js"
import ConfigCommand               from "./ase-config.js"
import ServiceCommand              from "./ase-service.js"
import MCPCommand                  from "./ase-mcp.js"
import HookCommand                 from "./ase-hook.js"
import DiagramCommand              from "./ase-diagram.js"
import SetupCommand                from "./ase-setup.js"
import StatuslineCommand           from "./ase-statusline.js"
import TaskCommand                 from "./ase-task.js"
import ArtifactCommand             from "./ase-artifact.js"
import MetaCommand                 from "./ase-meta.js"
import CompatCommand               from "./ase-compat.js"
import pkg                         from "../package.json" with { type: "json" }

/*  type of top-level (global) options  */
export type GlobalOpts = {
    debug:    boolean
    logLevel: LogLevel
    logFile:  string
}

/*  globally initialize logger  */
const log = new Log("ase", "info", "-")

/*  main entry point (wrapped in a regular async function to avoid
    top-level await, which would be reported as "unsettled" by Node in
    the long-running daemon process spawned by "ase service start")  */
const main = async (): Promise<void> => {
    await log.init()

    /*  establish top-level program  */
    const program = new Command()
    program
        .name("ase")
        .usage("<command> [options]")
        .version(`ASE ${pkg.version}`, "-V, --version", "show version information")
        .addOption(new Option("-l, --log-level <level>", "log level")
            .choices([ "error", "warning", "info", "debug" ]).default("info"))
        .option("-L, --log-file  <file>",  "log file path, or \"-\" for stdout", "-")
        .showHelpAfterError()
        .enablePositionalOptions()
        .exitOverride()

    /*  establish shared logger with defaults and then apply parsed
        global options to the logger before any subcommand action  */
    program.hook("preAction", async () => {
        const opts = program.opts<GlobalOpts>()
        log.logLevel(opts.logLevel)
        log.logFile(opts.logFile)
    })

    /*  register top-level commands  */
    new SetupCommand(log).register(program)
    new ConfigCommand(log).register(program)
    new MCPCommand(log).register(program)
    new ServiceCommand(log).register(program)
    new HookCommand(log).register(program)
    new StatuslineCommand(log).register(program)
    new TaskCommand(log).register(program)
    new ArtifactCommand(log).register(program)
    new MetaCommand(log).register(program)
    new CompatCommand().register(program)
    new DiagramCommand(log).register(program)

    /*  parse program arguments  */
    await program.parseAsync(process.argv)

    /*  gracefully terminate  */
    process.exit(0)
}
main().catch((err: unknown) => {
    if (err instanceof CommanderError) {
        if (err.exitCode !== 0)
            process.exit(err.exitCode)
        else
            process.exit(0)
    }
    const message = err instanceof Error ? err.message : String(err)
    log.write("error", message)
    process.exit(1)
})
