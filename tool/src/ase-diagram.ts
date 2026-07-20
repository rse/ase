/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import fs                                from "node:fs"

import { Command, InvalidArgumentError } from "commander"
import {
    renderMermaidASCII,
    renderMermaidSVG
}                                        from "beautiful-mermaid"
import { z }                             from "zod"
import getStdin                          from "get-stdin"

import type { McpServer }                from "@modelcontextprotocol/sdk/server/mcp.js"

import type Log                          from "./ase-log.js"

/*  options accepted by the pure rendering helper  */
export interface DiagramRenderOpts {
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

/*  custom argument parser for Commander: output format  */
const parseFormat = (name: string) => (value: string): "ascii" | "svg" => {
    if (value !== "ascii" && value !== "svg")
        throw new InvalidArgumentError(`${name} must be "ascii" or "svg"`)
    return value
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

    /*  pure rendering helper: turn a Mermaid source string plus options into
        a rendered Unicode/ASCII diagram string, or an SVG document string
        when "svg" format is requested. Throws on render failure.  */
    static render (src: string, opts: DiagramRenderOpts): string {
        /*  render as a self-contained SVG document using the library's
            themed defaults (the ANSI "colorMode" and the terminal
            clipping below are meaningful only for ASCII art)  */
        if (opts.format === "svg")
            return renderMermaidSVG(src)

        /*  create diagram rendering  */
        let out = renderMermaidASCII(src, {
            useAscii:         opts.ascii,
            paddingX:         opts.nodeMarginX,
            paddingY:         opts.nodeMarginY,
            boxBorderPadding: opts.nodePadding,
            colorMode:        opts.colorMode,
            theme: opts.colorMode !== "none" ? {
                fg:       "#000000",
                border:   "#a0a0a0",
                junction: "#a0a0a0",
                arrow:    "#404040",
                line:     "#707070",
                corner:   "#707070"
            } : {
                fg:       "#000000",
                border:   "#000000",
                junction: "#000000",
                arrow:    "#000000",
                line:     "#000000",
                corner:   "#000000"
            }
        })

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
                        `ase diagram: WARNING: rendered diagram width ${widest} exceeds budget ${maxWidth}; ` +
                        "rightmost content was clipped. Please regenerate the Mermaid source to fit " +
                        `within ${maxWidth} chars by preferring a portrait orientation ` +
                        "(\"flowchart TB\", top-to-bottom) over landscape (\"LR\"/\"RL\"/\"BT\"), " +
                        "reducing siblings per row, abbreviating node labels, or restructuring " +
                        "into nested subgraph hierarchies."
                lines = lines.map((l) => truncateAnsiLine(l, maxWidth))
            }
            if (maxHeight > 0 && lines.length > maxHeight) {
                const overflow = lines.length - maxHeight
                heightWarn =
                    `ase diagram: WARNING: rendered diagram height ${lines.length} exceeds budget ${maxHeight}; ` +
                    `bottom ${overflow} line(s) were clipped. Please regenerate the Mermaid source to fit ` +
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
            .description("Render Mermaid diagram specification as Unicode/ASCII art or SVG")
            .option("-i, --input <file>",
                "read Mermaid source from file instead of stdin")
            .option("-f, --format <format>",
                "output format (\"ascii\" or \"svg\")",
                parseFormat("--format"), "ascii")
            .option("-a, --ascii",
                "emit plain ASCII (+-|) instead of Unicode box-drawing",
                false)
            .option("-c, --color-mode <mode>",
                "force color mode (\"none\", \"ansi16\", or \"ansi256\")",
                parseColorMode("--color-mode"), Diagram.detectColorMode())
            .option("--node-margin-x <n>",
                "horizontal margin between nodes of <n> characters",
                parseInteger("--node-margin-x"), 3)
            .option("--node-margin-y <n>",
                "vertical margin between nodes of <n> lines",
                parseInteger("--node-margin-y"), 3)
            .option("--node-padding <n>",
                "horizontal and vertical inner node padding with <n> characters",
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
                /*  fetch Mermaid diagram specification from stdin  */
                let src: string
                if (opts.input !== undefined)
                    src = fs.readFileSync(opts.input, "utf8")
                else
                    src = await getStdin()
                if (src.trim() === "") {
                    this.log.write("error", "diagram: empty Mermaid diagram specification")
                    process.exit(1)
                }

                /*  create diagram rendering  */
                let out: string
                try {
                    out = Diagram.render(src, {
                        format:         opts.format,
                        ascii:          opts.ascii ?? false,
                        colorMode:      opts.colorMode,
                        nodeMarginX:    opts.nodeMarginX,
                        nodeMarginY:    opts.nodeMarginY,
                        nodePadding:    opts.nodePadding,
                        diagramClipX:   opts.diagramClipX,
                        diagramClipY:   opts.diagramClipY,
                        terminalWidth:  opts.terminalWidth,
                        terminalHeight: opts.terminalHeight
                    })
                }
                catch (err: unknown) {
                    const message = err instanceof Error ? err.message : String(err)
                    this.log.write("error", `diagram: render failed: ${message}`)
                    process.exit(1)
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
                "Render a Mermaid diagram as Unicode/ASCII art or SVG. " +
                "Use for visualizing " +
                "structure/layout/components/dependencies as a Flowchart, " +
                "control-flow/branching/concurrency as a Flowchart, " +
                "state-machine/states/transitions as a UML State Diagram, " +
                "data-flow/actors/messages/protocols as a UML Sequence Diagram, " +
                "data-structure/classes/methods as a UML Class Diagram, " +
                "data-model/entities/relationships as an ER Diagram, or " +
                "metrics/distributions/time-series as an XY-Chart. " +
                "Pass the Mermaid diagram specification as `diagram`. " +
                "Returns the rendered art (or SVG document, for `format` \"svg\") as `text`.",
            inputSchema: {
                diagram: z.string()
                    .describe("Mermaid diagram specification"),
                format: z.enum([ "ascii", "svg" ]).default("ascii")
                    .describe("output format: \"ascii\" for Unicode/ASCII art, \"svg\" for an SVG document"),
                ascii: z.boolean().default(false)
                    .describe("emit plain ASCII (+-|) instead of Unicode box-drawing characters"),
                colorMode: z.enum([ "none", "ansi16", "ansi256" ]).default("none")
                    .describe("color mode for ANSI escape sequences in the rendered output"),
                nodeMarginX: z.number().int().min(0).default(3)
                    .describe("horizontal margin between nodes, in characters"),
                nodeMarginY: z.number().int().min(0).default(3)
                    .describe("vertical margin between nodes, in lines"),
                nodePadding: z.number().int().min(0).default(1)
                    .describe("inner horizontal and vertical padding within each node, in characters"),
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
                const out = Diagram.render(args.diagram, {
                    format:         args.format,
                    ascii:          args.ascii,
                    colorMode:      args.colorMode,
                    nodeMarginX:    args.nodeMarginX,
                    nodeMarginY:    args.nodeMarginY,
                    nodePadding:    args.nodePadding,
                    diagramClipX:   args.diagramClipX,
                    diagramClipY:   args.diagramClipY,
                    terminalWidth:  args.terminalWidth,
                    terminalHeight: args.terminalHeight
                })
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
