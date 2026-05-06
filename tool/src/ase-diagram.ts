/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under GPL 3.0 <https://spdx.org/licenses/GPL-3.0-only>
*/

import fs                                from "node:fs"

import { Command, InvalidArgumentError } from "commander"
import { renderMermaidASCII }            from "beautiful-mermaid"

import type Log                          from "./ase-log.js"

/*  internal command options type  */
interface DiagramOpts {
    ascii:          boolean
    colorMode:      "none" | "ansi16" | "ansi256",
    input?:         string
    nodeMarginX:    number
    nodeMarginY:    number
    nodePadding:    number
    diagramClipX:   number
    diagramClipY:   number
    terminalWidth:  number
    terminalHeight: number
}

/*  options accepted by the pure rendering helper  */
export interface DiagramRenderOpts {
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

/*  detect terminal column width  */
export const detectTermWidth = (): number => {
    let width = 0

    /*  attempt 1: query environment variable  */
    if (process.env.ASE_TERM_WIDTH !== undefined) {
        const cols = Number.parseInt(process.env.ASE_TERM_WIDTH, 10)
        if (Number.isFinite(cols) && cols > 0)
            width = cols
    }

    /*  attempt 2: query stdout  */
    if (width === 0 && process.stdout.isTTY) {
        const cols = process.stdout.columns
        if (typeof cols === "number" && cols > 0)
            width = cols
    }

    return width
}

/*  detect terminal row height  */
export const detectTermHeight = (): number => {
    let height = 0

    /*  attempt 1: query environment variable  */
    if (process.env.ASE_TERM_HEIGHT !== undefined) {
        const rows = Number.parseInt(process.env.ASE_TERM_HEIGHT, 10)
        if (Number.isFinite(rows) && rows > 0)
            height = rows
    }

    /*  attempt 2: query stdout  */
    if (height === 0 && process.stdout.isTTY) {
        const rows = process.stdout.rows
        if (typeof rows === "number" && rows > 0)
            height = rows
    }

    return height
}

/*  detect terminal color capability  */
const detectColorMode = (): "none" | "ansi16" | "ansi256" => {
    let mode: "none" | "ansi16" | "ansi256" = "none"

    /*  attempt 1: query environment variable (explicitly)  */
    if (process.env.ASE_TERM_COLORS !== undefined)
        if (process.env.ASE_TERM_COLORS.match(/^(?:none|ansi16|ansi256)$/) !== null)
            mode = process.env.ASE_TERM_COLORS as "none" | "ansi16" | "ansi256"

    /*  attempt 2: query stdout  */
    if (mode === "none" && process.stdout.isTTY) {
        const depth = process.stdout.getColorDepth()
        if      (depth >= 8) mode = "ansi256"
        else if (depth >= 4) mode = "ansi16"
    }

    return mode
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
            let j = i + 2
            while (j < line.length && !/[A-Za-z]/.test(line[j]!))
                j++
            if (j < line.length) {
                const seq = line.slice(i, j + 1)
                out += seq
                if (seq.endsWith("m")) {
                    const body = seq.slice(2, -1)
                    if (body === "" || body === "0")
                        styled = false
                    else
                        styled = true
                }
                i = j + 1
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
            let j = i + 2
            while (j < line.length && !/[A-Za-z]/.test(line[j]!))
                j++
            if (j < line.length) {
                i = j + 1
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

/*  pure rendering helper: turn a Mermaid source string plus options into
    a rendered Unicode/ASCII diagram string. Throws on render failure.  */
export const renderDiagram = (src: string, opts: DiagramRenderOpts): string => {
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

/*  read stdin into a single string  */
const readStdin = async (): Promise<string> => {
    const chunks: Buffer[] = []
    for await (const chunk of process.stdin)
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk)
    return Buffer.concat(chunks).toString("utf8")
}

/*  command-line handling  */
export default class DiagramCommand {
    constructor (private log: Log) {}

    /*  register commands  */
    register (program: Command): void {
        program
            .command("diagram")
            .description("Render Mermaid diagram specification as Unicode/ASCII art")
            .option("-i, --input <file>",
                "read Mermaid source from file instead of stdin")
            .option("-a, --ascii",
                "emit plain ASCII (+-|) instead of Unicode box-drawing",
                false)
            .option("-c, --color-mode <mode>",
                "force color mode (\"none\", \"ansi16\", or \"ansi256\")",
                parseColorMode("--color-mode"), detectColorMode())
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
                parseInteger("--terminal-width"), detectTermWidth())
            .option("--terminal-height <n>",
                "height of terminal of <n> lines (for diagram clipping)",
                parseInteger("--terminal-height"), detectTermHeight())
            .action(async (opts: DiagramOpts) => {
                /*  fetch Mermaid diagram specification from stdin  */
                let src: string
                if (opts.input !== undefined)
                    src = fs.readFileSync(opts.input, "utf8")
                else
                    src = await readStdin()
                if (src.trim() === "") {
                    this.log.write("error", "diagram: empty Mermaid diagram specification")
                    process.exit(1)
                }

                /*  create diagram rendering  */
                let out: string
                try {
                    out = renderDiagram(src, {
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
