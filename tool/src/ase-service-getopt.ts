/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import type { McpServer }     from "@modelcontextprotocol/sdk/server/mcp.js"
import { z }                  from "zod"
import { Command, Option }    from "commander"
import { quote as shQuote }   from "shell-quote"

import type Log               from "./ase-lib-log.js"
import { Aliases, splitArgs, type AliasTuning } from "./ase-alias-core.js"

/*  tokenize a raw input string into [start,end) token ranges, preserving
    the quoting and escaping so the original text can later be sliced verbatim  */
const tokenizeRanges = (input: string): Array<{ start: number, end: number }> => {
    const ranges: Array<{ start: number, end: number }> = []
    let i = 0
    while (i < input.length) {
        while (i < input.length && /\s/.test(input[i]))
            i++
        if (i >= input.length)
            break
        const start = i
        while (i < input.length && !/\s/.test(input[i])) {
            const ch = input[i]
            if (ch === "\"" || ch === "'") {
                const quote = ch
                i++
                while (i < input.length && input[i] !== quote) {
                    if (quote === "\"" && input[i] === "\\" && i + 1 < input.length)
                        i++
                    i++
                }
                if (i < input.length)
                    i++
            }
            else if (ch === "\\" && i + 1 < input.length)
                i += 2
            else
                i++
        }
        ranges.push({ start, end: i })
    }
    return ranges
}

/*  strip surrounding quotes/escapes from a raw token range so it can be
    compared against an option flag spelling  */
const unquote = (s: string): string => {
    let out = ""
    let j = 0
    while (j < s.length) {
        const ch = s[j]
        if (ch === "\"" || ch === "'") {
            const quote = ch
            j++
            while (j < s.length && s[j] !== quote) {
                if (quote === "\"" && s[j] === "\\" && j + 1 < s.length) {
                    out += s[j + 1]
                    j += 2
                }
                else {
                    out += s[j]
                    j++
                }
            }
            j++
        }
        else if (ch === "\\" && j + 1 < s.length) {
            out += s[j + 1]
            j += 2
        }
        else {
            out += ch
            j++
        }
    }
    return out
}

/*  slice the verbatim trailing arguments from the raw input by skipping all
    leading option tokens (and the separate value tokens they take), mirroring
    the pass-through semantics of commander on the verbatim text  */
const verbatimArgs = (input: string, flagTakesValue: Map<string, boolean>): string => {
    const ranges = tokenizeRanges(input)
    let idx = 0
    while (idx < ranges.length) {
        const tok = unquote(input.slice(ranges[idx].start, ranges[idx].end))
        if (tok === "--") {
            idx++
            break
        }
        if (!tok.startsWith("-") || tok === "-")
            break
        idx++
        if (flagTakesValue.get(tok) === true && idx < ranges.length)
            idx++
    }
    return idx < ranges.length ? input.slice(ranges[idx].start) : ""
}

/*  convert a dashed long option name into its camel-cased commander key  */
const camelKey = (long: string) => long.replace(/-(.)/g, (_, c: string) => c.toUpperCase())

/*  parse the options specification into commander options, plus the
    information needed for list validation, negation resetting, and verbatim
    argument slicing  */
const parseSpec = (spec: string) => {
    const tokens         = spec.split(/\s+/).filter((e) => e.length > 0)
    const re             = /^--([A-Za-z][A-Za-z0-9-]*)(?:\|-([A-Za-z]))?(?:=(\((.*)\)(\.\.\.)?|.*))?$/
    const internals      = new Set<string>()
    const flagTakesValue = new Map<string, boolean>()
    const valueDefaults  = new Map<string, string>()
    const options:  Option[] = []
    const listOpts: Array<{ long: string, choices: string[] }> = []
    const longs:    string[] = []
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
        flagTakesValue.set(`--${long}`, takesValue)
        if (short !== null)
            flagTakesValue.set(`-${short}`, takesValue)
        const head       = short !== null ? `-${short}, --${long}` : `--${long}`
        const flags      = takesValue ? `${head} <value>` : head
        const opt        = new Option(flags)
        if (takesValue) {
            if (choices !== null && !isList)
                opt.choices(choices)
            opt.default(dflt)
            valueDefaults.set(camelKey(long), dflt ?? "")
        }
        else
            opt.default(false)
        longs.push(long)
        if (choices !== null && isList)
            listOpts.push({ long, choices })
        if (long.startsWith("int-")) {
            /*  internal option: hide from usage help and remember
                its camel-cased key for the info rendering  */
            opt.hideHelp()
            internals.add(camelKey(long))
        }
        options.push(opt)
    }

    /*  add the hidden, implicit negation "--no-<long>" of every option (which commander
        resolves last-one-wins against "--<long>"), except for the help, internal, and
        negating options, and except where the spec declares the negation explicitly  */
    for (const long of longs) {
        const flag = `--no-${long}`
        if (long === "help" || long.startsWith("int-") || long.startsWith("no-") || flagTakesValue.has(flag))
            continue
        flagTakesValue.set(flag, false)
        options.push(new Option(flag).hideHelp())
    }
    return { options, internals, flagTakesValue, valueDefaults, listOpts }
}

/*  expand the option aliases among the leading option tokens (skipping the separate
    value tokens of the options) in place, recursively and cycle-checked  */
const expandAliases = (tokens: string[], aliases: Record<string, string>, flagTakesValue: Map<string, boolean>): string[] => {
    const out: string[] = []
    const expand = (option: string, chain: string[]): void => {
        if (chain.includes(option))
            throw new Error(`cyclic option alias "${[ ...chain, option ].join(" -> ")}"`)
        for (const token of splitArgs(aliases[option])) {
            if (Object.hasOwn(aliases, token))
                expand(token, [ ...chain, option ])
            else
                out.push(token)
        }
    }
    let i = 0
    while (i < tokens.length) {
        const token = tokens[i]
        if (token === "--" || !token.startsWith("-") || token === "-")
            break
        i++
        if (Object.hasOwn(aliases, token))
            expand(token, [])
        else {
            out.push(token)
            if (flagTakesValue.get(token) === true && i < tokens.length)
                out.push(tokens[i++])
        }
    }
    return [ ...out, ...tokens.slice(i) ]
}

/*  the result of parsing the options  */
export type GetoptResult = {
    opts: Record<string, unknown>
    argv: string[]
    args: string
    info: string
}

/*  parse the arguments (a raw string or a token vector) against the options specification,
    after expanding the option aliases in them and in the option defaults of the <tuning>,
    where the option defaults are merged on the level of the parsed options (an explicitly
    given option wins), and a negated value-taking option is reset to its spec default  */
export const getopt = (name: string, spec: string, args: string | string[],
    tuning: AliasTuning = { options: {}, defaults: [] }): GetoptResult => {
    const { internals, flagTakesValue, valueDefaults, listOpts } = parseSpec(spec)

    /*  reject option aliases shadowing a real or a negating option  */
    for (const option of Object.keys(tuning.options))
        if (flagTakesValue.has(option))
            throw new Error(`option alias "${option}" shadows an option of "${name}"`)

    /*  parse tokens, after expanding their option aliases, with a fresh commander program  */
    const parse = (tokens: string[]) => {
        let helpText = ""
        const cmd = new Command(name)
            .exitOverride()
            .allowExcessArguments(true)
            .allowUnknownOption(false)
            .passThroughOptions(true)
            .configureOutput({
                writeOut: (str) => { helpText += str },
                writeErr: () => {}
            })
        for (const opt of parseSpec(spec).options)
            cmd.addOption(opt)
        try {
            cmd.parse(expandAliases(tokens, tuning.options, flagTakesValue), { from: "user" })
        }
        catch (err: unknown) {
            /*  intercept commander help/version output  */
            const code = (err as { code?: string } | null)?.code ?? ""
            if (code === "commander.helpDisplayed"
                || code === "commander.help"
                || code === "commander.version")
                throw new Error(`usage information requested\n\n${helpText.trimEnd()}`, { cause: err })

            /*  convert all other commander errors into regular errors, as a caller like
                the CLI terminates silently on a commander error  */
            throw new Error(err instanceof Error ? err.message : String(err), { cause: err })
        }
        return cmd
    }

    /*  parse args  */
    const argsRaw = typeof args === "string" ? args : null
    const argsVec = typeof args === "string" ? splitArgs(args) : args
    const cmd     = parse(argsVec)
    const opts    = { ...cmd.opts() } as Record<string, unknown>

    /*  merge the option defaults, where an explicitly given option wins  */
    if (tuning.defaults.length > 0) {
        let dflt: Command
        try {
            dflt = parse(tuning.defaults)
        }
        catch (err: unknown) {
            throw new Error(`invalid option defaults of "${name}": ${err instanceof Error ? err.message : String(err)}`, { cause: err })
        }
        if (dflt.args.length > 0)
            throw new Error(`invalid option defaults of "${name}": non-option arguments "${shQuote(dflt.args)}"`)
        const values = dflt.opts() as Record<string, unknown>
        for (const key of Object.keys(opts))
            if (cmd.getOptionValueSource(key) !== "cli" && dflt.getOptionValueSource(key) === "cli")
                opts[key] = values[key]
    }

    /*  reset negated value-taking options to their spec defaults  */
    for (const [ key, value ] of valueDefaults)
        if (opts[key] === false)
            opts[key] = value

    /*  validate comma-separated list-of-choices options (only
        the first supplied token is checked here -- skills
        validate the remaining tokens as they consume them)  */
    for (const { long, choices } of listOpts) {
        const v = opts[camelKey(long)]
        if (typeof v !== "string")
            continue
        const items = v.split(",").map((s) => s.trim()).filter((s) => s.length > 0)
        if (items.length > 0 && !choices.includes(items[0]))
            throw new Error(
                `invalid token "${items[0]}" for --${long} ` +
                `(allowed: ${choices.join(", ")})`
            )
    }

    /*  compute verbatim trailing argument string  */
    const argsVerbatim = argsRaw !== null ?
        verbatimArgs(argsRaw, flagTakesValue) :
        shQuote(cmd.args)

    /*  build markdown info rendering of parsed options  */
    const info = Object.entries(opts)
        .filter(([ k ]) => !internals.has(k))
        .map(([ k, v ]) => `${k}: **${shQuote([ String(v) ])}**`)
        .join(", ")

    return { opts, argv: cmd.args, args: argsVerbatim, info }
}

/*  MCP registration entry point for the option-parser tool  */
export class GetoptMCP {
    constructor (private log: Log) {}

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
                "the usage help and the `info` rendering. Every option `--x` " +
                "can be negated by `--no-x`, and the option aliases and option " +
                "defaults configured via `ase alias` for the skill `name` are " +
                "applied, too.",
            inputSchema: {
                name: z.string()
                    .describe("Name of the caller (e.g. skill name), used in error messages"),
                spec: z.string()
                    .describe("Whitespace-separated option spec, e.g. `--foo|-f --bar --baz|-b=BAZ`"),
                args: z.union([ z.string(), z.array(z.string()) ])
                    .describe("Arguments to parse (string is split shell-like, honoring quotes)")
            }
        }, async (args) => {
            try {
                /*  determine the option aliases and option defaults of the caller,
                    where unloadable alias files are ignored with a warning only  */
                let tuning: AliasTuning | undefined
                try {
                    tuning = Aliases.load().tuning(args.name)
                }
                catch (err: unknown) {
                    this.log.write("warning", `getopt: ignoring aliases: ${err instanceof Error ? err.message : String(err)}`)
                }

                /*  parse args with the option aliases and option defaults of the caller  */
                const result = getopt(args.name, args.spec, args.args, tuning)
                return {
                    content: [ { type: "text", text: JSON.stringify(result) } ]
                }
            }
            catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err)
                return {
                    isError: true,
                    content: [ { type: "text", text: `ERROR: ${message}` } ]
                }
            }
        })
    }
}
