/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under GPL 3.0 <https://spdx.org/licenses/GPL-3.0-only>
*/

import type { McpServer }     from "@modelcontextprotocol/sdk/server/mcp.js"
import { z }                  from "zod"
import { Command, Option }    from "commander"
import {
    parse as shParse,
    quote as shQuote
} from "shell-quote"

/*  MCP registration entry point for the option-parser tool  */
export class GetoptMCP {
    register (mcp: McpServer): void {
        mcp.registerTool("ase_getopt", {
            title: "ASE option parser",
            description:
                "Parse `args` against the options specification in " +
                "`spec` of the form `--<long>[|-<short>][=<default>] ...` " +
                "and return `{ opts, argv, args, info }` as JSON `text`, where " +
                "`argv` is the array of remaining tokens after option parsing, " +
                "`args` is the verbatim substring of the original input " +
                "containing those remaining tokens (quotes preserved), and " +
                "`info` is a markdown rendering of the parsed options in the " +
                "form `key: **value**, key: **value**, ...` for printing at " +
                "the top of a skill. Options whose long name starts with " +
                "`int-` are treated as internal and are excluded from both " +
                "the usage help and the `info` rendering.",
            inputSchema: {
                name: z.string()
                    .describe("Name of the caller (e.g. skill name), used in error messages"),
                spec: z.string()
                    .describe("Whitespace-separated option spec, e.g. `--foo/-f --bar --baz/-b=BAZ`"),
                args: z.union([ z.string(), z.array(z.string()) ])
                    .describe("Arguments to parse (string is split on whitespace)")
            }
        }, async (args) => {
            let helpText = ""
            try {
                /*  normalize args  */
                const argsRaw    = typeof args.args === "string" ? args.args : null
                const argsVec    = typeof args.args === "string" ?
                    shParse(args.args)
                        .map((e) => typeof e === "string" ? e :
                            (e !== null && typeof e === "object" && "op" in e && e.op === "glob" ?
                                (e as { pattern: string }).pattern : null))
                        .filter((e): e is string => e !== null) :
                    args.args

                /*  build a fresh commander program  */
                const cmd = new Command(args.name)
                    .exitOverride()
                    .allowExcessArguments(true)
                    .allowUnknownOption(false)
                    .passThroughOptions(true)
                    .configureOutput({
                        writeOut: (str) => { helpText += str },
                        writeErr: () => {}
                    })

                /*  tokenize spec and add one option per token  */
                const tokens    = args.spec.split(/\s+/).filter((e) => e.length > 0)
                const re        = /^--([A-Za-z][A-Za-z0-9-]*)(?:\|-([A-Za-z]))?(?:=(\((.*)\)(\.\.\.)?|.*))?$/
                const internals = new Set<string>()
                for (const tok of tokens) {
                    const m = re.exec(tok)
                    if (m === null)
                        throw new Error(`invalid spec token "${tok}"`)
                    const long       = m[1]
                    const short      = m[2] ?? null
                    const valuePart  = m[3] ?? null
                    const choicePart = m[4] ?? null
                    const listMarker = m[5] ?? null
                    const takesValue = valuePart !== null
                    const choices    = choicePart !== null ? choicePart.split("|") : null
                    const isList     = listMarker !== null
                    const dflt       = choices !== null ? choices[0] : valuePart
                    const head       = short !== null ? `-${short}, --${long}` : `--${long}`
                    const flags      = takesValue ? `${head} <value>` : head
                    const opt        = new Option(flags)
                    if (takesValue) {
                        if (choices !== null && !isList)
                            opt.choices(choices)
                        opt.default(dflt)
                    }
                    else
                        opt.default(false)
                    if (long !== undefined && long.startsWith("int-")) {
                        /*  internal option: hide from usage help and remember
                            its camel-cased key for the info rendering below  */
                        opt.hideHelp()
                        internals.add(long.replace(/-(.)/g, (_, c: string) => c.toUpperCase()))
                    }
                    cmd.addOption(opt)
                }

                /*  parse args  */
                cmd.parse(argsVec, { from: "user" })

                /*  validate comma-separated list-of-choices options  */
                const listOpts: Array<{ long: string, choices: string[] }> = []
                for (const tok of tokens) {
                    const m = re.exec(tok)
                    if (m === null)
                        continue
                    const long       = m[1]
                    const choicePart = m[4] ?? null
                    const listMarker = m[5] ?? null
                    if (choicePart !== null && listMarker !== null)
                        listOpts.push({ long, choices: choicePart.split("|") })
                }
                if (listOpts.length > 0) {
                    const opts = cmd.opts() as Record<string, unknown>
                    for (const { long, choices } of listOpts) {
                        const v = opts[long]
                        if (typeof v !== "string")
                            continue
                        const items = v.split(",").map((s) => s.trim()).filter((s) => s.length > 0)
                        if (items.length > 0 && !choices.includes(items[0]))
                            throw new Error(
                                `invalid token "${items[0]}" for --${long} ` +
                                `(allowed: ${choices.join(", ")})`
                            )
                    }
                }

                /*  compute verbatim trailing argument string  */
                let argsVerbatim = ""
                if (argsRaw !== null) {
                    /*  tokenize raw input into [start,end) ranges, preserving quotes  */
                    const ranges: Array<{ start: number, end: number }> = []
                    let i = 0
                    while (i < argsRaw.length) {
                        while (i < argsRaw.length && /\s/.test(argsRaw[i]))
                            i++
                        if (i >= argsRaw.length)
                            break
                        const start = i
                        while (i < argsRaw.length && !/\s/.test(argsRaw[i])) {
                            const ch = argsRaw[i]
                            if (ch === "\"" || ch === "'") {
                                const quote = ch
                                i++
                                while (i < argsRaw.length && argsRaw[i] !== quote) {
                                    if (argsRaw[i] === "\\" && i + 1 < argsRaw.length)
                                        i++
                                    i++
                                }
                                if (i < argsRaw.length)
                                    i++
                            }
                            else
                                i++
                        }
                        ranges.push({ start, end: i })
                    }
                    const consumed = argsVec.length - cmd.args.length
                    if (cmd.args.length > 0 && consumed >= 0 && consumed < ranges.length) {
                        const first = ranges[consumed].start
                        argsVerbatim = argsRaw.slice(first)
                    }
                }
                else
                    argsVerbatim = cmd.args.join(" ")

                /*  build markdown info rendering of parsed options  */
                const opts = cmd.opts()
                const info = Object.entries(opts)
                    .filter(([ k ]) => !internals.has(k))
                    .map(([ k, v ]) => `${k}: **${shQuote([ String(v) ])}**`)
                    .join(", ")

                /*  build result  */
                const result = { opts, argv: cmd.args, args: argsVerbatim, info }
                return {
                    content: [ { type: "text", text: JSON.stringify(result) } ]
                }
            }
            catch (err: unknown) {
                /*  intercept commander help/version output  */
                const code = (err as { code?: string } | null)?.code ?? ""
                if (code === "commander.helpDisplayed"
                    || code === "commander.help"
                    || code === "commander.version") {
                    return {
                        isError: true,
                        content: [ { type: "text", text: `ERROR: usage information requested\n\n${helpText.trimEnd()}` } ]
                    }
                }
                const message = err instanceof Error ? err.message : String(err)
                return {
                    isError: true,
                    content: [ { type: "text", text: `ERROR: ${message}` } ]
                }
            }
        })
    }
}
