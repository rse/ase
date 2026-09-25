#!/usr/bin/env node
/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import { Command, CommanderError, Option } from "commander"
import Log                         from "./ase-lib-log.js"
import type { LogLevel }           from "./ase-lib-log.js"
import SetupCommand                from "./ase-setup.js"
import ConfigCommand               from "./ase-config.js"
import MCPCommand                  from "./ase-mcp.js"
import ServiceCommand              from "./ase-service.js"
import HookCommand                 from "./ase-hook.js"
import StatuslineCommand           from "./ase-statusline.js"
import TaskCommand                 from "./ase-task.js"
import ArtifactCommand             from "./ase-artifact.js"
import SpecCommand                 from "./ase-spec.js"
import UtilCommand                 from "./ase-util.js"
import MetaCommand                 from "./ase-util-meta.js"
import CompatCommand               from "./ase-util-compat.js"
import DiagramCommand              from "./ase-util-diagram.js"
import WorktreeCommand             from "./ase-util-worktree.js"
import MintCommand                 from "./ase-util-mint.js"
import MetricCommand               from "./ase-util-metric.js"
import pkg                         from "../package.json" with { type: "json" }

/*  type of top-level (global) options  */
export type GlobalOpts = {
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

    /*  apply parsed global options to the logger
        before any subcommand action  */
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
    new SpecCommand(log).register(program)
    const util = new UtilCommand().register(program)
    new MetaCommand(log).register(util)
    new CompatCommand().register(util)
    new DiagramCommand(log).register(util)
    new WorktreeCommand().register(util)
    new MintCommand().register(util)
    new MetricCommand().register(util)

    /*  parse program arguments  */
    await program.parseAsync(process.argv)

    /*  gracefully terminate  */
    await log.close()
    process.exit(process.exitCode ?? 0)
}
main().catch(async (err: unknown) => {
    if (err instanceof CommanderError) {
        await log.close()
        process.exit(err.exitCode)
    }
    const message = err instanceof Error ? err.message : String(err)
    log.write("error", message)
    await log.close()
    process.exit(1)
})
