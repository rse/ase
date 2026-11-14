/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import path                       from "node:path"
import fs                         from "node:fs"
import readline                   from "node:readline/promises"

import { Command }                from "commander"
import { isMap, isScalar }        from "yaml"
import { execaSync }              from "execa"
import { z }                      from "zod"
import type { McpServer }         from "@modelcontextprotocol/sdk/server/mcp.js"

import type Log                   from "./ase-lib-log.js"
import { writeStdout }            from "./ase-lib-stdio.js"
import { renderTable }            from "./ase-lib-table.js"
import { parseScope }             from "./ase-config-scope.js"
import {
    projectClassificationPresets,
    configSecretKeys,
    configSchema
}                                 from "./ase-config-schema.js"
import { Config }                 from "./ase-config-core.js"

/*  CLI command "ase config"  */
export default class ConfigCommand {
    constructor (private log: Log) {}

    /*  register commands  */
    register (program: Command): void {
        /*  register CLI top-level command "ase config"  */
        const configCmd = program
            .command("config")
            .option("--scope <scope>",
                "configuration scope chain: comma-separated list of \"user\", \"project\", " +
                "\"task:<id>\", and/or \"session:<id>\" terms (e.g. \"task:N,session:M\"); " +
                "\"user\" is always implicitly included and \"project\" is implicitly " +
                "included whenever a project context (Git repo or upward \".ase\" directory) exists, " +
                "but never above the strongest explicitly requested term")
            .description("manage ASE configuration")
            .action(() => {
                configCmd.outputHelp()
                process.exit(1)
            })

        /*  register CLI sub-command "ase config init"  */
        configCmd
            .command("init")
            .description("initialize configuration with preset values (default|vibe|pro|industry)")
            .argument("<type>", "Preset type (default|vibe|pro|industry)")
            .action((type: string, _opts: unknown, cmd: Command) => {
                const scope  = parseScope(cmd.optsWithGlobals().scope as string | undefined)
                const preset = projectClassificationPresets[type]
                if (preset === undefined)
                    throw new Error(`unknown preset "${type}" (expected: default|vibe|pro|industry)`)
                const cfg = new Config("config", configSchema, this.log, scope)
                cfg.lock(() => {
                    cfg.read()
                    const targetKind = scope[scope.length - 1].kind
                    for (const [ k, val ] of Object.entries(preset)) {
                        if (!cfg.isWritableOn(k, targetKind))
                            continue
                        cfg.set(k, val)
                    }
                    cfg.write()
                })
            })

        /*  register CLI sub-command "ase config list"  */
        configCmd
            .command("list")
            .description("list all available configuration keys and their effective values")
            .action(async (_opts: unknown, cmd: Command) => {
                const scope = parseScope(cmd.optsWithGlobals().scope as string | undefined)
                const cfg   = new Config("config", configSchema, this.log, scope)
                cfg.read()
                const rows = new Map<string, string[]>()
                for (const key of cfg.keys())
                    rows.set(key, [ key, "", "-" ])
                for (const e of cfg.entries()) {
                    const val = isScalar(e.value) ? e.value.value : e.value
                    rows.set(e.key, [ e.key, configSecretKeys.includes(e.key) ? "***" : String(val), Config.scopeLabel(e.scope) ])
                }
                const sorted = [ ...rows.values() ].sort((a, b) => a[0].localeCompare(b[0]))
                await writeStdout(renderTable([ "KEY", "VALUE", "SCOPE" ], sorted))
            })

        /*  register CLI sub-command "ase config edit"  */
        configCmd
            .command("edit")
            .description("edit configuration file with $EDITOR")
            .action(async (_opts: unknown, cmd: Command) => {
                const scope  = parseScope(cmd.optsWithGlobals().scope as string | undefined)
                const editor = [ process.env.VISUAL, process.env.EDITOR ]
                    .find((e) => e !== undefined && e.trim() !== "") ?? "vi"
                const [ editorCmd, ...editorArgs ] = editor.trim().split(/\s+/)
                const cfg    = new Config("config", configSchema, this.log, scope)
                fs.mkdirSync(path.dirname(cfg.filename), { recursive: true })
                if (!fs.existsSync(cfg.filename))
                    fs.writeFileSync(cfg.filename, "", {
                        encoding: "utf8",
                        mode:     scope[scope.length - 1].kind === "user" ? 0o600 : undefined
                    })
                const rl = readline.createInterface({ input: process.stdin, output: process.stderr })
                try {
                    for (;;) {
                        execaSync(editorCmd, [ ...editorArgs, cfg.filename ], { stdio: "inherit" })
                        try {
                            cfg.read("strict")
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

        /*  register CLI sub-command "ase config ui"  */
        configCmd
            .command("ui")
            .description("edit configuration interactively in a terminal UI")
            .action(async (_opts: unknown, cmd: Command) => {
                if (!process.stdin.isTTY || !process.stdout.isTTY)
                    throw new Error("the terminal UI requires an interactive terminal (stdin and stdout)")
                const scope = parseScope(cmd.optsWithGlobals().scope as string | undefined)
                const { runConfigTUI } = await import("./ase-config-tui.js")
                await runConfigTUI(this.log, scope)
            })

        /*  register CLI sub-command "ase config get"  */
        configCmd
            .command("get")
            .description("print the value at a dotted configuration key")
            .argument("<key>", "configuration key (dotted path)")
            .action(async (key: string, _opts: unknown, cmd: Command) => {
                const scope = parseScope(cmd.optsWithGlobals().scope as string | undefined)
                const cfg   = new Config("config", configSchema, this.log, scope)
                cfg.read()
                const val = cfg.get(key)
                if (val === undefined)
                    throw new Error(`key "${key}" is not set`)
                if (isMap(val))
                    throw new Error(`key "${key}" is not a leaf key`)
                await writeStdout(`${isScalar(val) ? val.value : val}\n`)
            })

        /*  register CLI sub-command "ase config set"  */
        configCmd
            .command("set")
            .description("set the value at a dotted configuration key")
            .argument("<key>",   "configuration key (dotted path)")
            .argument("<value>", "configuration value")
            .action((key: string, value: string, _opts: unknown, cmd: Command) => {
                const scope = parseScope(cmd.optsWithGlobals().scope as string | undefined)
                const cfg   = new Config("config", configSchema, this.log, scope)
                cfg.lock(() => {
                    cfg.read()
                    cfg.set(key, value)
                    cfg.write()
                })
            })

        /*  register CLI sub-command "ase config delete"  */
        configCmd
            .command("delete")
            .description("delete the value at a dotted configuration key")
            .argument("<key>", "configuration key (dotted path)")
            .action((key: string, _opts: unknown, cmd: Command) => {
                const scope = parseScope(cmd.optsWithGlobals().scope as string | undefined)
                const cfg   = new Config("config", configSchema, this.log, scope)
                cfg.lock(() => {
                    cfg.read()
                    cfg.delete(key)
                    cfg.write()
                })
            })
    }
}

/*  render a caught error as an MCP tool error result  */
const mcpToolError = (err: unknown) => ({
    isError: true,
    content: [ { type: "text" as const, text: `ERROR: ${err instanceof Error ? err.message : String(err)}` } ]
})

/*  MCP registration entry point for layered YAML configuration access  */
export class ConfigMCP {
    constructor (private log: Log) {}

    /*  register the MCP tools  */
    register (mcp: McpServer): void {
        /*  config get  */
        mcp.registerTool("ase_config_get", {
            title: "ASE config get",
            description:
                "Read the effective value of a dotted configuration `key` from the layered " +
                "configuration, cascading through default/user/project/task/session chain up to and " +
                "including the requested `scope`. Returns the value as JSON-encoded `text`; " +
                "returns an empty string if no value is set.",
            inputSchema: {
                key: z.string()
                    .describe("dotted configuration key (e.g. \"agent.persona\")"),
                scope: z.string()
                    .describe("scope chain (e.g. \"session:<id>\", \"task:<id>\", \"project\", \"user\")")
            }
        }, async (args) => {
            try {
                const scope = parseScope(args.scope)
                const cfg   = new Config("config", configSchema, this.log, scope)
                cfg.read()
                const val  = cfg.get(args.key)
                if (isMap(val))
                    throw new Error(`key "${args.key}" is not a leaf key`)
                const text = val === undefined ? "" :
                    JSON.stringify(configSecretKeys.includes(cfg.resolveKey(args.key)) ? "***" : val)
                return { content: [ { type: "text", text } ] }
            }
            catch (err: unknown) {
                return mcpToolError(err)
            }
        })

        /*  config set  */
        mcp.registerTool("ase_config_set", {
            title: "ASE config set",
            description:
                "Write `val` to a dotted configuration `key` at the target `scope` " +
                "(the strongest scope term in the chain). The value is validated against " +
                "the configuration schema before being persisted.",
            inputSchema: {
                key: z.string()
                    .describe("dotted configuration key (e.g. \"agent.persona\")"),
                val: z.union([ z.string(), z.number(), z.boolean(), z.null(), z.array(z.any()), z.record(z.string(), z.any()) ])
                    .describe("value to store under `key`"),
                scope: z.string()
                    .describe("scope chain (e.g. \"session:<id>\", \"task:<id>\", \"project\", \"user\")")
            }
        }, async (args) => {
            try {
                const scope = parseScope(args.scope)
                const cfg   = new Config("config", configSchema, this.log, scope)
                cfg.lock(() => {
                    cfg.read()
                    cfg.set(args.key, args.val)
                    cfg.write()
                })
                return { content: [ { type: "text", text: `OK: stored "${args.key}" on scope "${args.scope}"` } ] }
            }
            catch (err: unknown) {
                return mcpToolError(err)
            }
        })

        /*  config delete  */
        mcp.registerTool("ase_config_delete", {
            title: "ASE config delete",
            description:
                "Delete the value at a dotted configuration `key` from the target `scope` " +
                "(the strongest scope term in the chain). No-op if the key is not present.",
            inputSchema: {
                key: z.string()
                    .describe("dotted configuration key (e.g. \"agent.persona\")"),
                scope: z.string()
                    .describe("scope chain (e.g. \"session:<id>\", \"task:<id>\", \"project\", \"user\")")
            }
        }, async (args) => {
            try {
                const scope = parseScope(args.scope)
                const cfg   = new Config("config", configSchema, this.log, scope)
                cfg.lock(() => {
                    cfg.read()
                    cfg.delete(args.key)
                    cfg.write()
                })
                return { content: [ { type: "text", text: `OK: removed "${args.key}" on scope "${args.scope}"` } ] }
            }
            catch (err: unknown) {
                return mcpToolError(err)
            }
        })

        /*  config list  */
        mcp.registerTool("ase_config_list", {
            title: "ASE config list",
            description:
                "List all effective configuration entries of the layered configuration, " +
                "cascading through the default/user/project/task/session chain up to and " +
                "including the requested `scope`. Returns an `entries` array (in lexicographic " +
                "`key` order) where each item has the dotted `key`, its effective `value`, and " +
                "the `scope` label (\"default\", \"user\", \"project\", \"task:<id>\", or " +
                "\"session:<id>\") that supplied it. For overlapping keys only the value of the " +
                "strongest scope is reported.",
            inputSchema: {
                scope: z.string()
                    .describe("scope chain (e.g. \"session:<id>\", \"task:<id>\", \"project\", \"user\")")
            },
            outputSchema: {
                entries: z.array(z.object({
                    key:   z.string().describe("dotted configuration key"),
                    value: z.string().describe("effective configuration value"),
                    scope: z.string().describe("scope label which supplied the value")
                })).describe("all effective configuration entries in lexicographic key order")
            }
        }, async (args) => {
            try {
                const scope = parseScope(args.scope)
                const cfg   = new Config("config", configSchema, this.log, scope)
                cfg.read()
                const entries = cfg.entries().map((e) => ({
                    key:   e.key,
                    value: configSecretKeys.includes(e.key) ? "***" : String(isScalar(e.value) ? e.value.value : e.value),
                    scope: Config.scopeLabel(e.scope)
                }))
                const result = { entries }
                return {
                    structuredContent: result,
                    content:           [ { type: "text", text: JSON.stringify(result) } ]
                }
            }
            catch (err: unknown) {
                return mcpToolError(err)
            }
        })
    }
}
