/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import fs                       from "node:fs"
import path                     from "node:path"
import readline                 from "node:readline/promises"

import { Command, Option }      from "commander"
import { execaSync }            from "execa"

import type Log                 from "./ase-lib-log.js"
import { writeStdout }          from "./ase-lib-stdio.js"
import { renderTable }          from "./ase-lib-table.js"
import {
    Aliases,
    aliasFile,
    aliasScopes,
    bundledSkills,
    commandName,
    joinArgs,
    skillSpec,
    splitArgs,
    type AliasScope
}                               from "./ase-alias-core.js"
import { getopt }               from "./ase-service-getopt.js"
import { parseTool }            from "./ase-setup-common.js"

/*  the options of the sub-commands  */
type ScopeOpts = { scope?: AliasScope }
type ToolOpts  = ScopeOpts & { tool: string }
type KindOpts  = ToolOpts & { option?: boolean, default?: boolean }

/*  CLI command "ase alias"  */
export default class AliasCommand {
    constructor (private log: Log) {}

    /*  the scope of a modifying sub-command: the given one, else the
        project scope inside a project, else the user scope  */
    private scopeOf (opts: ScopeOpts): AliasScope {
        return opts.scope ?? (aliasFile("project") !== null ? "project" : "user")
    }

    /*  report the changes of the shim skills  */
    private report (changes: string[]): void {
        for (const change of changes)
            this.log.write("info", `alias: ${change}`)
    }

    /*  check the option aliases and the option defaults of a skill against its
        options specification, as far as it is determinable from the bundled skill  */
    private checkTuning (aliases: Aliases, skill: string): void {
        const spec = skillSpec(skill)
        if (spec === null)
            return
        const tuning = aliases.tuning(skill)
        getopt(skill, `--help|-h ${spec}`, [], tuning)
        for (const option of Object.keys(tuning.options))
            getopt(skill, `--help|-h ${spec}`, [ option ], tuning)
    }

    /*  register commands  */
    register (program: Command): void {
        const scopeOption = (desc: string) =>
            new Option("-s, --scope <scope>", desc).choices([ ...aliasScopes ])
        const scopeModify = "scope of the alias file (default: \"project\" inside a project, else \"user\")"

        /*  default for --tool derived from ASE_TOOL environment variable (validated
            lazily by "parseTool", so an invalid value cannot break unrelated commands)  */
        const envTool    = process.env.ASE_TOOL ?? ""
        const toolDflt   = envTool !== "" ? envTool : "claude"
        const toolOption = () =>
            new Option("-t, --tool <tool>", "agent tool of the shim skills (\"claude\", \"copilot\", or \"codex\")").default(toolDflt)

        const text = (tokens: string[]) => tokens.length === 1 ? tokens[0] : joinArgs(tokens)

        /*  register CLI top-level command "ase alias"  */
        const aliasCmd = program
            .command("alias")
            .description("manage the skill command aliases")
            .enablePositionalOptions()
            .action(() => {
                aliasCmd.outputHelp()
                process.exit(1)
            })

        /*  register CLI sub-command "ase alias list"  */
        aliasCmd
            .command("list")
            .description("list the effective full aliases, option aliases, and option defaults")
            .addOption(scopeOption("list the entries of a single scope only (default: of both scopes)"))
            .option("-k, --skill <skill>", "list the entries of a single skill only")
            .option("-T, --tuned", "list just the skills with option aliases or option defaults")
            .action(async (opts: ScopeOpts & { skill?: string, tuned?: boolean }) => {
                const aliases = Aliases.load()
                if (opts.tuned === true) {
                    await writeStdout(`${aliases.tuned().join(" ")}\n`)
                    return
                }
                const skill   = opts.skill !== undefined ? commandName(opts.skill) : undefined
                const skillOf = (name: string) => {
                    try {
                        return aliases.resolve(name).skill
                    }
                    catch {
                        return ""
                    }
                }
                const rows = aliases.entries(opts.scope)
                    .filter((entry) => skill === undefined || (entry.kind === "alias" ? skillOf(entry.name) : entry.name) === skill)
                    .map((entry) => [ entry.kind, entry.name, entry.option, entry.value, entry.scope ])
                await writeStdout(renderTable([ "KIND", "NAME", "OPTION", "VALUE", "SCOPE" ], rows))
            })

        /*  register CLI sub-command "ase alias set"  */
        aliasCmd
            .command("set")
            .description("set a full alias, an option alias (--option), or the option defaults (--default) of a skill")
            .addOption(scopeOption(scopeModify))
            .addOption(toolOption())
            .addOption(new Option("-o, --option", "set an option alias of a skill").conflicts("default"))
            .option("-d, --default", "set the option defaults of a skill")
            .argument("<name>", "alias name, resp. skill name (with --option or --default)")
            .argument("[value...]", "command line, resp. option alias and its expansion (with --option), " +
                "resp. option tokens (with --default)")
            .passThroughOptions()
            .action((name: string, value: string[], opts: KindOpts) => {
                const scope = this.scopeOf(opts)
                const tool  = parseTool(opts.tool)
                const skill = commandName(name)
                let changes: string[]
                if (opts.option === true) {
                    const [ option, ...expansion ] = value
                    if (option === undefined || expansion.length === 0)
                        throw new Error("alias: missing option alias or its expansion")
                    changes = Aliases.modify(scope, tool, (doc) => doc.setIn([ "option", skill, option ], text(expansion)),
                        (aliases) => this.checkTuning(aliases, skill))
                }
                else if (opts.default === true)
                    changes = Aliases.modify(scope, tool, (doc) => doc.setIn([ "default", skill ], text(value)),
                        (aliases) => this.checkTuning(aliases, skill))
                else {
                    if (value.length === 0)
                        throw new Error("alias: missing command line")
                    changes = Aliases.modify(scope, tool, (doc) => doc.setIn([ "alias", name ], text(value)),
                        (aliases) => aliases.resolve(name, scope))
                }
                this.report(changes)
            })

        /*  register CLI sub-command "ase alias delete"  */
        aliasCmd
            .command("delete")
            .description("delete a full alias, an option alias (--option), or the option defaults (--default) of a skill")
            .addOption(scopeOption(scopeModify))
            .addOption(toolOption())
            .addOption(new Option("-o, --option", "delete an option alias of a skill").conflicts("default"))
            .option("-d, --default", "delete the option defaults of a skill")
            .argument("<name>", "alias name, resp. skill name (with --option or --default)")
            .argument("[option]", "option alias (with --option)")
            .passThroughOptions()
            .action((name: string, option: string | undefined, opts: KindOpts) => {
                const scope = this.scopeOf(opts)
                const tool  = parseTool(opts.tool)
                const skill = commandName(name)
                if (opts.option === true && option === undefined)
                    throw new Error("alias: missing option alias")
                const keys = opts.option === true ? [ "option", skill, option ] :
                    opts.default === true ? [ "default", skill ] : [ "alias", name ]
                this.report(Aliases.modify(scope, tool, (doc) => {
                    if (!doc.hasIn(keys))
                        throw new Error(`alias: no entry "${keys.join(" ")}" in the scope "${scope}"`)
                    doc.deleteIn(keys)
                }))
            })

        /*  register CLI sub-command "ase alias edit"  */
        aliasCmd
            .command("edit")
            .description("edit the alias file with $EDITOR")
            .addOption(scopeOption(scopeModify))
            .addOption(toolOption())
            .action(async (opts: ToolOpts) => {
                const scope = this.scopeOf(opts)
                const tool  = parseTool(opts.tool)
                const file  = aliasFile(scope)
                if (file === null)
                    throw new Error("alias: no project context for the scope \"project\"")
                const editor = [ process.env.VISUAL, process.env.EDITOR ]
                    .find((e) => e !== undefined && e.trim() !== "") ?? "vi"
                const [ editorCmd, ...editorArgs ] = editor.trim().split(/\s+/)
                fs.mkdirSync(path.dirname(file), { recursive: true })
                if (!fs.existsSync(file))
                    fs.writeFileSync(file, "#   ASE skill command aliases (see \"ase man alias\")\n", "utf8")
                const rl = readline.createInterface({ input: process.stdin, output: process.stderr })
                try {
                    for (;;) {
                        execaSync(editorCmd, [ ...editorArgs, file ], { stdio: "inherit" })
                        try {
                            const aliases = Aliases.load()
                            for (const skill of new Set(aliases.entries(scope)
                                .filter((entry) => entry.kind !== "alias").map((entry) => entry.name)))
                                this.checkTuning(aliases, skill)
                            this.report(aliases.sync(scope, tool))
                            break
                        }
                        catch (err) {
                            const msg = err instanceof Error ? err.message : String(err)
                            this.log.write("error", msg)
                            const ans = (await rl.question("re-edit? [Y/n] ")).trim().toLowerCase()
                            if (ans === "n" || ans === "no")
                                throw err
                        }
                    }
                }
                finally {
                    rl.close()
                }
            })

        /*  register CLI sub-command "ase alias sync"  */
        aliasCmd
            .command("sync")
            .description("synchronize the shim skills of the full aliases")
            .addOption(scopeOption("synchronize the shim skills of a single scope only (default: of both scopes)"))
            .addOption(toolOption())
            .action((opts: ToolOpts) => {
                const tool    = parseTool(opts.tool)
                const aliases = Aliases.load()
                for (const scope of aliasScopes)
                    if (opts.scope === undefined || opts.scope === scope)
                        this.report(aliases.sync(scope, tool))
            })

        /*  register CLI sub-command "ase alias expand"  */
        aliasCmd
            .command("expand")
            .description("expand a skill command line through the full aliases, option aliases, and option defaults")
            .argument("<command-line...>", "skill command line, like \"/<alias> <args>\" or \"/<skill> <args>\"")
            .passThroughOptions()
            .action(async (words: string[]) => {
                const aliases = Aliases.load()
                const [ head = "", ...rest ] = words.length === 1 ? splitArgs(words[0]) : words
                let skill  = commandName(head)
                let tokens = rest
                if (aliases.entries().some((entry) => entry.kind === "alias" && entry.name === skill)) {
                    const resolved = aliases.resolve(skill)
                    skill  = resolved.skill
                    tokens = [ ...resolved.tokens, ...rest ]
                }
                if (!(bundledSkills() ?? [ skill ]).includes(skill))
                    throw new Error(`alias: unknown alias or ASE skill "${head}"`)
                const lines = [ `command:   /${joinArgs([ skill, ...tokens ])}` ]
                const spec  = skillSpec(skill)
                if (spec !== null) {
                    const tuning = aliases.tuning(skill)
                    const result = getopt(skill, `--help|-h ${spec}`, tokens, tuning)
                    const opts   = Object.entries(result.opts)
                        .filter(([ key ]) => key !== "help" && !/^int[A-Z]/.test(key))
                        .map(([ key, value ]) => `${key}: ${String(value)}`)
                    lines.push(`defaults:  ${joinArgs(tuning.defaults)}`)
                    lines.push(`options:   ${opts.join(", ")}`)
                    lines.push(`arguments: ${result.args}`)
                }
                await writeStdout(`${lines.join("\n")}\n`)
            })
    }
}
