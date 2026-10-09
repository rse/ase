/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import fs                                from "node:fs"

import { Command, InvalidArgumentError } from "commander"
import { z }                             from "zod"

import type { McpServer }                from "@modelcontextprotocol/sdk/server/mcp.js"
import type { D2 }                       from "@d2lang/d2"

import type Log                          from "./ase-lib-log.js"
import { readStdin }                     from "./ase-lib-stdio.js"

/*  options accepted by the pure rendering helper  */
export interface DiagramRenderOpts {
    lang:           "mermaid" | "d2"
    format:         "ascii" | "svg"
    ascii:          boolean
    colorMode:      "none" | "ansi16" | "ansi256"
    nodeMarginX:    number
    nodeMarginY:    number
    nodePadding:    number
    diagramClipX:   number
    diagramClipY:   number
    terminalWidth:  number
    terminalHeight: number
}

/*  internal command options type  */
interface DiagramOpts extends DiagramRenderOpts {
    input?: string
}

/*  custom argument parser for Commander: non-negative integer  */
const parseInteger = (name: string) => (value: string): number => {
    const n = Number.parseInt(value, 10)
    if (!Number.isFinite(n) || n < 0)
        throw new InvalidArgumentError(`${name} must be a non-negative integer`)
    return n
}

/*  custom argument parser for Commander: color mode  */
const parseColorMode = (name: string) => (value: string): "none" | "ansi16" | "ansi256" => {
    if (value !== "none" && value !== "ansi16" && value !== "ansi256")
        throw new InvalidArgumentError(`${name} must be "none", "ansi16", or "ansi256"`)
    return value
}

/*  custom argument parser for Commander: diagram language  */
const parseLang = (name: string) => (value: string): "mermaid" | "d2" => {
    if (value !== "mermaid" && value !== "d2")
        throw new InvalidArgumentError(`${name} must be "mermaid" or "d2"`)
    return value
}

/*  custom argument parser for Commander: output format  */
const parseFormat = (name: string) => (value: string): "ascii" | "svg" => {
    if (value !== "ascii" && value !== "svg")
        throw new InvalidArgumentError(`${name} must be "ascii" or "svg"`)
    return value
}

/*  the D2 compiler, created on first use only (as it spins up the
    WebAssembly build of D2 in a worker thread, which keeps the process
    alive until the compiler is disposed)  */
let d2: Promise<D2> | null = null

/*  turn a D2 compile failure (a JSON-encoded list of errors) into a message  */
const d2Error = (err: unknown): string => {
    const message = err instanceof Error ? err.message : String(err)
    try {
        return (JSON.parse(message) as { errmsg: string }[])
            .map((error) => error.errmsg.replace(/^index:/, "line "))
            .join("; ")
    }
    catch {
        return message
    }
}

/*  scan a CSI escape sequence starting at line[i] (where line[i]===ESC and
    line[i+1]==="["); return the index just past the terminating letter, or
    -1 if the sequence is unterminated within the line  */
const scanAnsiSeq = (line: string, i: number): number => {
    let j = i + 2
    while (j < line.length && !/[A-Za-z]/.test(line[j]!))
        j++
    return j < line.length ? j + 1 : -1
}

/*  truncate a single rendered line to a maximum visible column,
    preserving ANSI escape sequences (CSI ...m) and appending an ANSI
    reset sequence if any styling was active at the truncation point  */
const truncateAnsiLine = (line: string, budget: number): string => {
    if (budget <= 0)
        return ""
    let out     = ""
    let visible = 0
    let styled  = false
    let i       = 0
    while (i < line.length) {
        const ch = line[i]!
        if (ch === "\x1b" && line[i + 1] === "[") {
            const j = scanAnsiSeq(line, i)
            if (j >= 0) {
                const seq = line.slice(i, j)
                out += seq
                if (seq.endsWith("m")) {
                    const body = seq.slice(2, -1)
                    styled = !(body === "" || body === "0")
                }
                i = j
                continue
            }
            i++
            continue
        }
        if (visible >= budget)
            break
        out += ch
        visible++
        i++
    }
    if (styled)
        out += "\x1b[0m"
    return out
}

/*  measure visible column width of a rendered line, ignoring ANSI escape
    sequences (CSI ...m); mirrors the visibility model of truncateAnsiLine  */
const visibleWidth = (line: string): number => {
    let visible = 0
    let i       = 0
    while (i < line.length) {
        const ch = line[i]!
        if (ch === "\x1b" && line[i + 1] === "[") {
            const j = scanAnsiSeq(line, i)
            if (j >= 0) {
                i = j
                continue
            }
            i++
            continue
        }
        visible++
        i++
    }
    return visible
}

/*  reusable functionality: Mermaid diagram rendering as Unicode/ASCII art  */
export class Diagram {
    static detectTermDimension (envVar: string, stdoutProp: "columns" | "rows"): number {
        let value = 0

        /*  attempt 1: query environment variable  */
        const env = process.env[envVar]
        if (env !== undefined) {
            const n = Number.parseInt(env, 10)
            if (Number.isFinite(n) && n > 0)
                value = n
        }

        /*  attempt 2: query stdout  */
        if (value === 0 && process.stdout.isTTY) {
            const n = process.stdout[stdoutProp]
            if (typeof n === "number" && n > 0)
                value = n
        }

        return value
    }

    /*  detect terminal column width  */
    static detectTermWidth (): number {
        return Diagram.detectTermDimension("ASE_TERM_WIDTH", "columns")
    }

    /*  detect terminal row height  */
    static detectTermHeight (): number {
        return Diagram.detectTermDimension("ASE_TERM_HEIGHT", "rows")
    }

    /*  detect terminal color capability  */
    static detectColorMode (): "none" | "ansi16" | "ansi256" {
        let mode: "none" | "ansi16" | "ansi256" = "none"
        let explicit = false

        /*  attempt 1: query environment variable (explicitly)  */
        if (process.env.ASE_TERM_COLORS !== undefined)
            if (/^(?:none|ansi16|ansi256)$/.test(process.env.ASE_TERM_COLORS)) {
                mode = process.env.ASE_TERM_COLORS as "none" | "ansi16" | "ansi256"
                explicit = true
            }

        /*  attempt 2: query stdout  */
        if (!explicit && process.stdout.isTTY) {
            const depth = process.stdout.getColorDepth()
            if      (depth >= 8) mode = "ansi256"
            else if (depth >= 4) mode = "ansi16"
        }

        return mode
    }

    /*  dispose the D2 compiler (if any), so its worker thread no longer
        keeps the process alive (used by the short-lived CLI only)  */
    static async dispose (): Promise<void> {
        if (d2 === null)
            return
        const compiler = d2
        d2 = null
        await (await compiler).dispose()
    }

    /*  render a D2 source string as Unicode/ASCII art or SVG document
        ("@d2lang/d2" is loaded on first use only; the ANSI "colorMode"
        and the node margins/padding are not supported by D2)  */
    static async renderD2 (src: string, opts: DiagramRenderOpts): Promise<string> {
        d2 ??= import("@d2lang/d2").then((module) => new module.D2()).catch((err: unknown) => {
            d2 = null
            throw err
        })
        const compiler = await d2
        try {
            const result = await compiler.compile(src)
            return await compiler.render(result.diagram, {
                ...result.renderOptions,
                ascii:     opts.format === "ascii",
                asciiMode: opts.ascii ? "standard" : "extended"
            })
        }
        catch (err: unknown) {
            throw new Error(d2Error(err), { cause: err })
        }
    }

    /*  render a Mermaid source string as Unicode/ASCII art or SVG document
        ("beautiful-mermaid" is loaded on first use only)  */
    static async renderMermaid (src: string, opts: DiagramRenderOpts): Promise<string> {
        const { renderMermaidASCII, renderMermaidSVG } = await import("beautiful-mermaid")

        /*  render as a self-contained SVG document using the library's
            themed defaults (the ANSI "colorMode" is meaningful only for ASCII art)  */
        if (opts.format === "svg")
            return renderMermaidSVG(src)

        /*  determine theme colors (gray shades once colors are enabled)  */
        const colored = opts.colorMode !== "none"

        /*  create diagram rendering  */
        return renderMermaidASCII(src, {
            useAscii:         opts.ascii,
            paddingX:         opts.nodeMarginX,
            paddingY:         opts.nodeMarginY,
            boxBorderPadding: opts.nodePadding,
            colorMode:        opts.colorMode,
            theme: {
                fg:       "#000000",
                border:   colored ? "#a0a0a0" : "#000000",
                junction: colored ? "#a0a0a0" : "#000000",
                arrow:    colored ? "#404040" : "#000000",
                line:     colored ? "#707070" : "#000000",
                corner:   colored ? "#707070" : "#000000"
            }
        })
    }

    /*  pure rendering helper: turn a Mermaid or D2 source string plus
        options into a rendered Unicode/ASCII diagram string, or an SVG
        document string when "svg" format is requested. Throws on render
        failure. (the terminal clipping is meaningful only for ASCII art)  */
    static async render (src: string, opts: DiagramRenderOpts): Promise<string> {
        /*  create diagram rendering  */
        let out = opts.lang === "d2" ?
            await Diagram.renderD2(src, opts) :
            await Diagram.renderMermaid(src, opts)
        if (opts.format === "svg")
            return out

        /*  determine language-specific regeneration hints  */
        const lang     = opts.lang === "d2" ? "D2" : "Mermaid"
        const portrait = opts.lang === "d2" ?
            "(\"direction: down\", top-to-bottom) over landscape (\"direction: right\"/\"left\"/\"up\")" :
            "(\"flowchart TB\", top-to-bottom) over landscape (\"LR\"/\"RL\"/\"BT\")"
        const nesting  = opts.lang === "d2" ? "nested container" : "nested subgraph"

        /*  optionally clip diagram rendering  */
        const termWidth  = opts.terminalWidth
        const termHeight = opts.terminalHeight
        if (termWidth > 0 || termHeight > 0) {
            const maxWidth   = termWidth  > 0 ? termWidth  - opts.diagramClipX : 0
            const maxHeight  = termHeight > 0 ? termHeight - opts.diagramClipY : 0
            const trailingNL = out.endsWith("\n")
            let lines        = (trailingNL ? out.slice(0, -1) : out).split("\n")
            let widthWarn    = ""
            let heightWarn   = ""
            if (maxWidth > 0) {
                const widest = lines.reduce((m, l) => Math.max(m, visibleWidth(l)), 0)
                if (widest > maxWidth)
                    widthWarn =
                        `ase util diagram: WARNING: rendered diagram width ${widest} exceeds budget ${maxWidth}; ` +
                        `rightmost content was clipped. Please regenerate the ${lang} source to fit ` +
                        `within ${maxWidth} chars by preferring a portrait orientation ` +
                        `${portrait}, ` +
                        "reducing siblings per row, abbreviating node labels, or restructuring " +
                        `into ${nesting} hierarchies.`
                lines = lines.map((l) => truncateAnsiLine(l, maxWidth))
            }
            if (maxHeight > 0 && lines.length > maxHeight) {
                const overflow = lines.length - maxHeight
                heightWarn =
                    `ase util diagram: WARNING: rendered diagram height ${lines.length} exceeds budget ${maxHeight}; ` +
                    `bottom ${overflow} line(s) were clipped. Please regenerate the ${lang} source to fit ` +
                    `within ${maxHeight} lines by reducing depth or splitting into multiple diagrams.`
                lines = lines.slice(0, maxHeight)
            }
            out = lines.join("\n") + (trailingNL ? "\n" : "")
            if (widthWarn !== "")
                out += "\n" + widthWarn + "\n"
            if (heightWarn !== "")
                out += "\n" + heightWarn + "\n"
        }

        return out
    }
}

/*  command-line handling  */
export default class DiagramCommand {
    constructor (private log: Log) {}

    /*  register commands  */
    register (program: Command): void {
        program
            .command("diagram")
            .description("Render Mermaid or D2 diagram specification as Unicode/ASCII art or SVG")
            .option("-i, --input <file>",
                "read diagram source from file instead of stdin")
            .option("-l, --lang <lang>",
                "diagram language (\"mermaid\" or \"d2\")",
                parseLang("--lang"), "mermaid")
            .option("-f, --format <format>",
                "output format (\"ascii\" or \"svg\")",
                parseFormat("--format"), "ascii")
            .option("-a, --ascii",
                "emit plain ASCII (+-|) instead of Unicode box-drawing",
                false)
            .option("-c, --color-mode <mode>",
                "force color mode (\"none\", \"ansi16\", or \"ansi256\") (Mermaid only)",
                parseColorMode("--color-mode"), Diagram.detectColorMode())
            .option("--node-margin-x <n>",
                "horizontal margin between nodes of <n> characters (Mermaid only)",
                parseInteger("--node-margin-x"), 3)
            .option("--node-margin-y <n>",
                "vertical margin between nodes of <n> lines (Mermaid only)",
                parseInteger("--node-margin-y"), 3)
            .option("--node-padding <n>",
                "horizontal and vertical inner node padding with <n> characters (Mermaid only)",
                parseInteger("--node-padding"), 1)
            .option("--diagram-clip-x <n>",
                "extra horizontal clipping of diagram to terminal width minus <n> characters",
                parseInteger("--diagram-clip-x"), 0)
            .option("--diagram-clip-y <n>",
                "extra vertical clipping of diagram to terminal height minus <n> lines",
                parseInteger("--diagram-clip-y"), 0)
            .option("--terminal-width <n>",
                "width of terminal of <n> characters (for diagram clipping)",
                parseInteger("--terminal-width"), Diagram.detectTermWidth())
            .option("--terminal-height <n>",
                "height of terminal of <n> lines (for diagram clipping)",
                parseInteger("--terminal-height"), Diagram.detectTermHeight())
            .action(async (opts: DiagramOpts) => {
                /*  fetch diagram specification from file or stdin  */
                let src: string
                if (opts.input !== undefined) {
                    try {
                        src = fs.readFileSync(opts.input, "utf8")
                    }
                    catch (err: unknown) {
                        const message = err instanceof Error ? err.message : String(err)
                        this.log.write("error", `diagram: failed to read input file: ${message}`)
                        process.exit(1)
                    }
                }
                else
                    src = await readStdin()
                if (src.trim() === "") {
                    this.log.write("error", "diagram: empty diagram specification")
                    process.exit(1)
                }

                /*  create diagram rendering  */
                let out: string
                try {
                    out = await Diagram.render(src, opts)
                }
                catch (err: unknown) {
                    const message = err instanceof Error ? err.message : String(err)
                    this.log.write("error", `diagram: render failed: ${message}`)
                    process.exit(1)
                }
                finally {
                    await Diagram.dispose()
                }

                /*  output diagram rendering  */
                process.stdout.write(out)
                if (!out.endsWith("\n"))
                    process.stdout.write("\n")
            })
    }
}

/*  MCP registration entry point for diagram tools  */
export class DiagramMCP {
    register (mcp: McpServer): void {
        mcp.registerTool("ase_diagram", {
            title:       "ASE diagram render",
            description:
                "Render a Mermaid or D2 diagram as Unicode/ASCII art or SVG. " +
                "Use for visualizing " +
                "structure/layout/components/dependencies as a Flowchart, " +
                "control-flow/branching/concurrency as a Flowchart, " +
                "state-machine/states/transitions as a UML State Diagram, " +
                "data-flow/actors/messages/protocols as a UML Sequence Diagram, " +
                "data-structure/classes/methods as a UML Class Diagram, " +
                "data-model/entities/relationships as an ER Diagram, or " +
                "metrics/distributions/time-series as an XY-Chart. " +
                "Pass the diagram specification as `diagram` and its language as `lang` " +
                "(\"mermaid\" by default, or \"d2\"). " +
                "Returns the rendered art (or SVG document, for `format` \"svg\") as `text`.",
            inputSchema: {
                diagram: z.string()
                    .describe("Mermaid or D2 diagram specification"),
                lang: z.enum([ "mermaid", "d2" ]).default("mermaid")
                    .describe("diagram language: \"mermaid\" for Mermaid, \"d2\" for D2"),
                format: z.enum([ "ascii", "svg" ]).default("ascii")
                    .describe("output format: \"ascii\" for Unicode/ASCII art, \"svg\" for an SVG document"),
                ascii: z.boolean().default(false)
                    .describe("emit plain ASCII (+-|) instead of Unicode box-drawing characters"),
                colorMode: z.enum([ "none", "ansi16", "ansi256" ]).default("none")
                    .describe("color mode for ANSI escape sequences in the rendered output (Mermaid only)"),
                nodeMarginX: z.number().int().min(0).default(3)
                    .describe("horizontal margin between nodes, in characters (Mermaid only)"),
                nodeMarginY: z.number().int().min(0).default(3)
                    .describe("vertical margin between nodes, in lines (Mermaid only)"),
                nodePadding: z.number().int().min(0).default(1)
                    .describe("inner horizontal and vertical padding within each node, in characters (Mermaid only)"),
                diagramClipX: z.number().int().min(0).default(0)
                    .describe("extra horizontal clipping: subtract this many characters from `terminalWidth`"),
                diagramClipY: z.number().int().min(0).default(0)
                    .describe("extra vertical clipping: subtract this many lines from `terminalHeight`"),
                terminalWidth: z.number().int().min(0).default(Diagram.detectTermWidth())
                    .describe("terminal width in characters; 0 disables horizontal clipping; defaults to ASE_TERM_WIDTH env var if set"),
                terminalHeight: z.number().int().min(0).default(Diagram.detectTermHeight())
                    .describe("terminal height in lines; 0 disables vertical clipping; defaults to ASE_TERM_HEIGHT env var if set")
            }
        }, async (args) => {
            try {
                const out = await Diagram.render(args.diagram, args)
                return {
                    content: [ { type: "text", text: out } ]
                }
            }
            catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err)
                return {
                    isError: true,
                    content: [ { type: "text", text: `diagram: render failed: ${message}` } ]
                }
            }
        })
    }
}
