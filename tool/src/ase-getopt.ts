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
        mcp.registerTool("getopt", {
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
                "the top of a skill.",
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
                const tokens = args.spec.split(/\s+/).filter((e) => e.length > 0)
                const re = /^--([A-Za-z][A-Za-z0-9-]*)(?:\|-([A-Za-z]))?(?:=(\((.*)\)|.*))?$/
                for (const tok of tokens) {
                    const m = re.exec(tok)
                    if (m === null)
                        throw new Error(`invalid spec token "${tok}"`)
                    const long       = m[1]
                    const short      = m[2] ?? null
                    const valuePart  = m[3] ?? null
                    const choicePart = m[4] ?? null
                    const takesValue = valuePart !== null
                    const choices    = choicePart !== null ? choicePart.split("|") : null
                    const dflt       = choices !== null ? choices[0] : valuePart
                    const head       = short !== null ? `-${short}, --${long}` : `--${long}`
                    const flags      = takesValue ? `${head} <value>` : head
                    const opt        = new Option(flags)
                    if (takesValue) {
                        if (choices !== null)
                            opt.choices(choices)
                        opt.default(dflt)
                    }
                    else
                        opt.default(false)
                    cmd.addOption(opt)
                }

                /*  parse args  */
                cmd.parse(argsVec, { from: "user" })

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
