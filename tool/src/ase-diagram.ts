/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under GPL 3.0 <https://spdx.org/licenses/GPL-3.0-only>
*/

import fs                                from "node:fs"
import tty                               from "node:tty"

import { Command, InvalidArgumentError } from "commander"
import { renderMermaidASCII }            from "beautiful-mermaid"

import type Log                          from "./ase-log.js"

/*  internal command options type  */
interface DiagramOpts {
    ascii?:       boolean
    colorMode?:   string
    input?:       string
    padX:         number
    padY:         number
    padBox:       number
    marginLeft:   number
    marginRight:  number
}

/*  custom argument parser for Commander: non-negative integer  */
const parseInteger = (name: string) => (value: string): number => {
    const n = Number.parseInt(value, 10)
    if (!Number.isFinite(n) || n < 0)
        throw new InvalidArgumentError(`${name} must be a non-negative integer`)
    return n
}

/*  detect terminal column width  */
const detectTermWidth = (): number => {
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

    /*  attempt 3: query stderr  */
    if (width === 0 && process.stderr.isTTY) {
        const cols = process.stderr.columns
        if (typeof cols === "number" && cols > 0)
            width = cols
    }

    /*  attempt 4: query /dev/tty  */
    if (width === 0) {
        let fd = -1
        try {
            fd = fs.openSync("/dev/tty", "r+")
            const stream = new tty.WriteStream(fd)
            const cols   = stream.columns
            stream.destroy()
            if (typeof cols === "number" && cols > 0)
                width = cols
        }
        catch {
            if (fd >= 0) {
                try { fs.closeSync(fd) }
                catch { /*  ignore  */ }
            }
        }
    }
    return width
}

/*  detect terminal color capability  */
const detectColorMode = (): "none" | "ansi16" | "ansi256" => {
    let mode: "none" | "ansi16" | "ansi256" = "none"

    /*  attempt 1: query environment variable  */
    if (process.env.ASE_TERM_COLORS !== undefined)
        if (process.env.ASE_TERM_COLORS.match(/^(?:none|ansi16|ansi256)$/) !== null)
            mode = process.env.ASE_TERM_COLORS as "none" | "ansi16" | "ansi256"

    /*  helper function for querying a writable stream  */
    const getColorDepth = (stream: tty.WriteStream): "none" | "ansi16" | "ansi256" => {
        const depth = stream.getColorDepth()
        if      (depth >= 8) return "ansi256"
        else if (depth >= 4) return "ansi16"
        else                 return "none"
    }

    /*  attempt 2: query stdout  */
    if (mode === "none" && process.stdout.isTTY)
        mode = getColorDepth(process.stdout)

    /*  attempt 3: query stderr  */
    if (mode === "none" && process.stderr.isTTY)
        mode = getColorDepth(process.stderr)

    /*  attempt 4: query /dev/tty  */
    if (mode === "none") {
        let fd = -1
        try {
            fd = fs.openSync("/dev/tty", "r+")
            const stream = new tty.WriteStream(fd)
            mode = getColorDepth(stream)
            stream.destroy()
        }
        catch {
            if (fd >= 0) {
                try { fs.closeSync(fd) }
                catch { /*  ignore  */ }
            }
        }
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
                "force color mode (\"none\", \"ansi16\", or \"ansi256\")")
            .option("-x, --pad-x <n>",
                "horizontal spacing between nodes",
                parseInteger("--pad-x"), 3)
            .option("-y, --pad-y <n>",
                "vertical spacing between nodes",
                parseInteger("--pad-y"), 3)
            .option("-b, --pad-box <n>",
                "inner node box spacing",
                parseInteger("--pad-box"), 1)
            .option("-l, --margin-left <n>",
                "left margin (columns reserved on the left)",
                parseInteger("--margin-left"), 0)
            .option("-r, --margin-right <n>",
                "right margin (columns reserved on the right)",
                parseInteger("--margin-right"), 0)
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

                /*  determine color mode  */
                let colorMode: "none" | "ansi16" | "ansi256"
                if (opts.colorMode === "none" || opts.colorMode === "ansi16" || opts.colorMode === "ansi256")
                    colorMode = opts.colorMode
                else if (opts.colorMode === undefined)
                    colorMode = detectColorMode()
                else {
                    this.log.write("error", "diagram: --color-mode must be \"none\", \"ansi16\", or \"ansi256\"")
                    process.exit(1)
                }

                /*  create diagram rendering  */
                let out: string
                try {
                    out = renderMermaidASCII(src, {
                        useAscii:         opts.ascii ?? false,
                        paddingX:         opts.padX,
                        paddingY:         opts.padY,
                        boxBorderPadding: opts.padBox,
                        colorMode,
                        theme: colorMode !== "none" ? {
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
                }
                catch (err: unknown) {
                    const message = err instanceof Error ? err.message : String(err)
                    this.log.write("error", `diagram: render failed: ${message}`)
                    process.exit(1)
                }

                /*  optionally clip diagram rendering  */
                const termWidth = detectTermWidth()
                process.stderr.write(`w=<${termWidth}>\n`)
                if (termWidth > 0) {
                    const budget = termWidth - opts.marginLeft - opts.marginRight
                    if (budget > 0) {
                        const trailingNL = out.endsWith("\n")
                        const lines = (trailingNL ? out.slice(0, -1) : out).split("\n")
                        const clipped = lines.map((l) => truncateAnsiLine(l, budget))
                        out = clipped.join("\n") + (trailingNL ? "\n" : "")
                    }
                }

                /*  output diagram rendering  */
                process.stdout.write(out)
                if (!out.endsWith("\n"))
                    process.stdout.write("\n")
            })
    }
}
