#!/usr/bin/env node
/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import { Command, CommanderError, Option } from "commander"
import Log                                 from "./ase-lib-log.js"
import type { LogLevel }                   from "./ase-lib-log.js"
import { writeStdout }                     from "./ase-lib-stdio.js"
import pkg                                 from "../package.json" with { type: "json" }

/*  type of top-level (global) options  */
export type GlobalOpts = {
    logLevel: LogLevel
    logFile:  string
}

/*  globally initialize logger  */
const log = new Log("ase", "info", "-")

/*  type of a lazily imported command class; the classes taking no
    constructor argument at all are structurally compatible, too  */
type CommandClass = new (log: Log) => { register (parent: Command): unknown }

/*  type of a command registrar, returning whatever the underlying
    "register" method returns -- a Commander command for the commands
    acting as the parent of sub-commands, and nothing for all others  */
type Registrar = (parent: Command) => Promise<unknown>

/*  instantiate the default-exported command class of a lazily imported
    module and register it onto the given parent command  */
const attach = async (imported: Promise<{ default: CommandClass }>, parent: Command): Promise<unknown> => {
    const CommandClass = (await imported).default
    return new CommandClass(log).register(parent)
}

/*  registrars of the top-level commands; each one imports its module on
    demand only, as importing all of them eagerly loads the dependency
    trees of all features (about 2300 modules, costing seconds) before
    Commander even knows which single command was addressed at all  */
const commands: Record<string, Registrar> = {
    setup:      async (p) => attach(import("./ase-setup.js"), p),
    config:     async (p) => attach(import("./ase-config.js"), p),
    alias:      async (p) => attach(import("./ase-alias.js"), p),
    mcp:        async (p) => attach(import("./ase-mcp.js"), p),
    service:    async (p) => attach(import("./ase-service.js"), p),
    hook:       async (p) => attach(import("./ase-hook.js"), p),
    statusline: async (p) => attach(import("./ase-statusline.js"), p),
    task:       async (p) => attach(import("./ase-task.js"), p),
    artifact:   async (p) => attach(import("./ase-artifact.js"), p),
    spec:       async (p) => attach(import("./ase-spec.js"), p),
    util:       async (p) => attach(import("./ase-util.js"), p),
    agent:      async (p) => attach(import("./ase-agent.js"), p),
    man:        async (p) => attach(import("./ase-man.js"), p)
}

/*  registrars of those sub-commands which live in their own modules and
    hence are registered onto an already established parent command  */
const subCommands: Record<string, Record<string, Registrar>> = {
    task: {
        board:    async (p) => attach(import("./ase-task-board.js"), p)
    },
    util: {
        meta:      async (p) => attach(import("./ase-util-meta.js"), p),
        compat:    async (p) => attach(import("./ase-util-compat.js"), p),
        diagram:   async (p) => attach(import("./ase-util-diagram.js"), p),
        worktree:  async (p) => attach(import("./ase-util-worktree.js"), p),
        mint:      async (p) => attach(import("./ase-util-mint.js"), p),
        metric:    async (p) => attach(import("./ase-util-metric.js"), p),
        rasterize: async (p) => attach(import("./ase-util-rasterize.js"), p)
    }
}

/*  main entry point (wrapped in a regular async function to avoid
    top-level await, which would be reported as "unsettled" by Node in
    the long-running daemon process spawned by "ase service start")  */
const main = async (): Promise<void> => {
    await log.init()

    /*  apply the line prefix of the logger, passed by a supervising process (e.g. "ase agent
        fleet" to its members), and consume it, as it must not leak into any sub-process  */
    const prefix = process.env.ASE_LOG_PREFIX
    if (prefix !== undefined) {
        log.prefix(prefix)
        Reflect.deleteProperty(process.env, "ASE_LOG_PREFIX")
    }

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

    /*  scan the command line for the top-level command name, skipping
        the global options and the values they consume, as the required
        command modules have to be known before Commander parses  */
    const argv    = process.argv.slice(2)
    const consume = new Set<string>()
    for (const option of program.options) {
        if (!(option.required || option.optional))
            continue
        if (option.short !== undefined) consume.add(option.short)
        if (option.long  !== undefined) consume.add(option.long)
    }
    let name    = ""
    let version = false
    let i       = 0
    while (i < argv.length) {
        const arg = argv[i++]
        if (!arg.startsWith("-")) {
            name = arg
            break
        }
        if (arg === "-V" || arg === "--version")
            version = true
        else if (consume.has(arg))
            i++
    }
    const rest = argv.slice(i)

    /*  register a top-level command plus those of its sub-commands which
        the command line actually addresses; when no sub-command matches
        at all, all of them are registered, as only then Commander can
        render the complete sub-command overview of a help or a typo  */
    const register = async (top: string): Promise<void> => {
        const parent = await commands[top](program)
        const subs   = subCommands[top]
        if (subs === undefined || !(parent instanceof Command))
            return
        const wanted = Object.keys(subs).filter((sub) => rest.includes(sub))
        if (wanted.length > 0) {
            for (const sub of wanted)
                await subs[sub](parent)
        }
        else {
            const own = new Set(parent.commands.map((command) => command.name()))
            if (!rest.some((arg) => !arg.startsWith("-") && own.has(arg)))
                for (const sub of Object.keys(subs))
                    await subs[sub](parent)
        }
    }

    /*  register the addressed top-level command only; a bare "-V" is
        answered by the program itself and hence needs no command module,
        while an unknown command and any help request need all of them  */
    if (Object.hasOwn(commands, name))
        await register(name)
    else if (!(name === "" && version))
        for (const command of Object.keys(commands))
            await register(command)

    /*  parse program arguments  */
    await program.parseAsync(process.argv)

    /*  gracefully terminate  */
    await log.close()
    process.exit(process.exitCode ?? 0)
}
main().catch(async (err: unknown) => {
    if (err instanceof CommanderError) {
        /*  flush the help or version output of Commander to a pipe,
            as "process.exit" would otherwise truncate it  */
        await writeStdout("")
        await log.close()
        process.exit(err.exitCode)
    }
    const message = err instanceof Error ? err.message : String(err)
    log.write("error", message)
    await log.close()
    process.exit(1)
})

