/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import fs                                        from "node:fs"
import os                                        from "node:os"
import path                                      from "node:path"
import { execFileSync }                          from "node:child_process"

import { Command, InvalidArgumentError, Option } from "commander"
import { z }                                     from "zod"

import type { McpServer }                        from "@modelcontextprotocol/sdk/server/mcp.js"
import type { D2, Diagram as D2Diagram }        from "@d2lang/d2"

import type Log                                  from "./ase-lib-log.js"
import { readStdin, writeStdout }                from "./ase-lib-stdio.js"
import { confineColors }                         from "./ase-lib-color.js"
import { Config }                               from "./ase-config-core.js"
import { configSchema, diagramToneDefault }      from "./ase-config-schema.js"

/*  the theme style of the SVG renderings  */
export type DiagramTheme = "light" | "dark"

/*  options accepted by the pure rendering helper  */
export interface DiagramRenderOpts {
    lang:           "mermaid" | "d2"
    format:         "ascii" | "svg"
    theme?:         DiagramTheme
    tone?:          string
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
interface DiagramOpts extends Omit<DiagramRenderOpts, "theme"> {
    input?: string
    theme?: DiagramTheme | "auto"
}

/*  custom argument parser for Commander: non-negative integer  */
const parseInteger = (name: string) => (value: string): number => {
    const n = Number.parseInt(value, 10)
    if (!Number.isFinite(n) || n < 0)
        throw new InvalidArgumentError(`${name} must be a non-negative integer`)
    return n
}

/*  the D2 compiler, created on first use only (as it spins up the
    WebAssembly build of D2 in a worker thread, which keeps the process
    alive until the compiler is disposed)  */
let d2: Promise<D2> | null = null

/*  the probed theme style of "auto", cached for a few seconds only,
    as the probe can spawn a process and the appearance can change  */
let themeProbe: { theme: DiagramTheme, time: number } | null = null

/*  turn a D2 compile failure (a JSON-encoded list of errors, whose source
    lines are shifted by the number of prepended lines) into a message  */
const d2Error = (err: unknown, shift: number): string => {
    const message = err instanceof Error ? err.message : String(err)
    try {
        return (JSON.parse(message) as { errmsg: string }[])
            .map((error) => error.errmsg.replace(/^index:(\d+):/, (_, line: string) => `line ${Number(line) - shift}:`))
            .join("; ")
    }
    catch {
        return message
    }
}

/*  draw the leaf shapes of a D2 diagram (and of its boards) still in theme colors
    as boxes: those of the accent "B*" resp. the alternative accent "AA*"/"AB*"
    colors, but not the containers, the text, code, image, class, and SQL table
    shapes, nor the labels outside of the shapes  */
type D2Box = { fill: string, stroke: string, color: string }
const d2Boxes = (diagram: D2Diagram, boxes: { accent: D2Box, signal: D2Box }): void => {
    const containers = new Set(diagram.shapes.map((shape) => shape.id.replace(/\.?[^.]*$/, "")))
    for (const shape of diagram.shapes) {
        const box = /^B[1-6]$/.test(shape.fill) ? boxes.accent : /^A[AB][245]$/.test(shape.fill) ? boxes.signal : null
        if (box === null || containers.has(shape.id) || /^(?:text|code|image|class|sql_table)$/.test(shape.type))
            continue
        shape.fill = box.fill
        if (/^B[1-6]$/.test(shape.stroke))
            shape.stroke = box.stroke
        if ("color" in shape && /^N[1-7]$/.test(shape.color) && !shape.labelPosition?.startsWith("OUTSIDE"))
            shape.color = box.color
    }
    for (const board of [ ...diagram.layers ?? [], ...diagram.scenarios ?? [], ...diagram.steps ?? [] ])
        if (board !== undefined)
            d2Boxes(board, boxes)
}

/*  the theme color spreads of the SVG renderings (after the approach of
    SpecBook): a grey base spread, an accent spread derived from the first
    theme color tone, and a signal spread derived from the second one (if
    given) or else from the complement-transposed first one (a brown for the
    default blue), each of 32 colors from dark (index 0) to light (index 31)  */
type DiagramColors = { base: string[], accent: string[], signal: string[] }
const diagramColors = async (tone: string): Promise<DiagramColors> => {
    const { parse, generate } = await import("@rse/mrcs")
    const tones = tone.trim().split(/\s+/)
    if (tones.length > 2 || !tones.every((t) => /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(t)))
        throw new Error(`invalid theme color tone "${tone}" (expected "#rrggbb", optionally followed by a second one)`)
    const [ accent, signal = `${accent}^` ] = tones.map((t) => t.replace(/^#(.)(.)(.)$/, "#$1$1$2$2$3$3").toLowerCase())
    return {
        base:   generate(parse("#000000/32")),
        accent: generate(parse(`${accent}+40-5/32`)),
        signal: generate(parse(`${signal}+40-5/32`))
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

/*  reusable functionality: Mermaid and D2 diagram rendering as Unicode/ASCII art or SVG  */
export class Diagram {
    /*  detect a terminal dimension from an environment variable, else from stdout (0 if unknown)  */
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
        /*  attempt 1: query environment variable (explicitly)  */
        const env = process.env.ASE_TERM_COLORS
        if (env === "none" || env === "ansi16" || env === "ansi256")
            return env

        /*  attempt 2: query stdout  */
        const depth = process.stdout.isTTY ? process.stdout.getColorDepth() : 0
        return depth >= 8 ? "ansi256" : depth >= 4 ? "ansi16" : "none"
    }

    /*  detect the theme style of the terminal background (for theme style "auto")  */
    static detectTheme (): DiagramTheme {
        if (themeProbe !== null && Date.now() - themeProbe.time < 10 * 1000)
            return themeProbe.theme
        const query = (cmd: string, args: string[]): string => {
            try {
                return execFileSync(cmd, args, { encoding: "utf8", stdio: [ "ignore", "pipe", "ignore" ], timeout: 1000 })
            }
            catch {
                return ""
            }
        }
        const probe = (): DiagramTheme => {
            /*  attempt 1: query environment variable (explicitly)  */
            const env = process.env.ASE_TERM_THEME
            if (env === "light" || env === "dark")
                return env

            /*  attempt 2: query terminal colors (background as last ANSI color index)  */
            const bg = Number.parseInt((process.env.COLORFGBG ?? "").split(";").at(-1) ?? "", 10)
            if (bg >= 0 && bg <= 15)
                return bg <= 6 || bg === 8 ? "dark" : "light"

            /*  attempt 3: query theme of Claude Code (e.g. "dark" or "light-daltonized")  */
            if ((process.env.ASE_TOOL ?? "claude") === "claude") {
                try {
                    const file = path.join(process.env.CLAUDE_CONFIG_DIR ?? os.homedir(), ".claude.json")
                    const json = JSON.parse(fs.readFileSync(file, "utf8")) as { theme?: unknown }
                    const m    = typeof json.theme === "string" ? /^(light|dark)/.exec(json.theme) : null
                    if (m !== null)
                        return m[1] as DiagramTheme
                }
                catch {
                    /*  no or unreadable configuration  */
                }
            }

            /*  attempt 4: query appearance of the system (on macOS the key exists in dark mode only,
                on Windows the value is 0 in dark mode, and on GNOME the color scheme or GTK theme)  */
            if (process.platform === "darwin")
                return /dark/i.test(query("defaults", [ "read", "-g", "AppleInterfaceStyle" ])) ? "dark" : "light"
            else if (process.platform === "win32") {
                const out = query("reg", [ "query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize",
                    "/v", "AppsUseLightTheme" ])
                return /\b0x0\b/.test(out) ? "dark" : "light"
            }
            else {
                const scheme = query("gsettings", [ "get", "org.gnome.desktop.interface", "color-scheme" ])
                if (/prefer-(?:dark|light)/.test(scheme))
                    return scheme.includes("dark") ? "dark" : "light"
                return /dark/i.test(query("gsettings", [ "get", "org.gnome.desktop.interface", "gtk-theme" ])) ? "dark" : "light"
            }
        }
        themeProbe = { theme: probe(), time: Date.now() }
        return themeProbe.theme
    }

    /*  determine the theme style and theme color tone of the SVG renderings
        from the "agent.diagram.{theme,tone}" configuration  */
    static configTheme (log: Log): { theme: DiagramTheme, tone: string } {
        const cfg = new Config("config", configSchema, log)
        cfg.read()
        const theme = cfg.get("agent.diagram.theme")
        const tone  = cfg.get("agent.diagram.tone")
        return {
            theme: theme === "light" || theme === "dark" ? theme : Diagram.detectTheme(),
            tone:  typeof tone === "string" && tone.trim() !== "" ? tone : diagramToneDefault
        }
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

        /*  for the SVG document, determine the theme colors in the style of the
            SpecBook diagrams, picked out of the theme color spreads after the shape
            of the D2 themes "Neutral Default" (light) and "Dark Mauve" (dark): the
            neutrals "N1" (text) to "N7" (background), the base colors "B1" (strokes)
            to "B6" (fills), and the alternative accents "AA*"/"AB*" (from the signal
            spread), prepended as one line of configuration on the theme of the style,
            together with a transparent background and a padding of 20 instead of 100
            pixels, so the configuration and the background of the diagram still win  */
        let input   = src
        let themeID = 0
        let shift   = 0
        let palette = [] as string[]
        let boxes   = null as { accent: D2Box, signal: D2Box } | null
        if (opts.format === "svg") {
            const dark = opts.theme === "dark"
            const { base: b, accent: a, signal: s } = await diagramColors(opts.tone ?? diagramToneDefault)
            palette = [ ...b, ...a, ...s ]

            /*  on the light theme style, draw the leaf shapes in darker colors with
                lighter labels (like the node boxes of the Mermaid diagrams)  */
            if (!dark)
                boxes = {
                    accent: { fill: a[5]!, stroke: a[3]!, color: b[31]! },
                    signal: { fill: s[5]!, stroke: s[3]!, color: b[31]! }
                }
            const colors = dark ? {
                N1: b[28], N2: b[25], N3: b[22], N4: b[13], N5: b[10], N6: b[8], N7: b[6],
                B1: a[21], B2: a[21], B3: a[13], B4: b[9],  B5: a[0],  B6: a[5],
                AA2: s[19], AA4: s[10], AA5: s[8], AB4: s[10], AB5: s[8]
            } : {
                N1: b[3],  N2: b[13], N3: b[19], N4: b[25], N5: b[27], N6: b[29], N7: b[31],
                B1: a[7],  B2: a[11], B3: a[27], B4: a[31], B5: a[28], B6: a[24],
                AA2: s[13], AA4: s[28], AA5: s[30], AB4: s[28], AB5: s[30]
            }
            const overrides = Object.entries(colors).map(([ key, color ]) => `${key}: "${color}"`).join("; ")
            input   = `vars: { d2-config: { pad: 20; theme-overrides: { ${overrides} } } }; style.fill: transparent\n${src}`
            themeID = dark ? 200 : 0
            shift   = 1
        }

        /*  compile and render the diagram, with the custom colors of the
            diagram confined to the theme color spreads (SVG only)  */
        try {
            const result = await compiler.compile(input, { themeID })
            if (boxes !== null)
                d2Boxes(result.diagram, boxes)
            const output = await compiler.render(result.diagram, {
                ...result.renderOptions,
                ascii:     opts.format === "ascii",
                asciiMode: opts.ascii ? "standard" : "extended"
            })
            return opts.format === "svg" ? confineColors(output, palette) : output
        }
        catch (err: unknown) {
            throw new Error(d2Error(err, shift), { cause: err })
        }
    }

    /*  render a Mermaid source string as Unicode/ASCII art or SVG document
        ("beautiful-mermaid" is loaded on first use only)  */
    static async renderMermaid (src: string, opts: DiagramRenderOpts): Promise<string> {
        const { renderMermaidASCII, renderMermaidSVG } = await import("beautiful-mermaid")

        /*  render as a self-contained SVG document in the style of the SpecBook
            diagrams (the colors picked out of the theme color spreads per theme style,
            with its recoloring of the class boxes, and the arrow heads in the accent
            color of the D2 strokes "B1"), but opaque, in the font bundled
            for rasterizing, and without the web font import (the ANSI "colorMode" is
            meaningful only for ASCII art)  */
        if (opts.format === "svg") {
            const dark = opts.theme === "dark"
            const { base: b, accent: a, signal: s } = await diagramColors(opts.tone ?? diagramToneDefault)
            const colors = dark ?
                { bg: b[6]!,  fg: b[28]!, line: b[21]!, accent: a[21]!, muted: b[21]!, surface: a[7]!,  border: a[13]! } :
                { bg: b[31]!, fg: b[5]!,  line: b[21]!, accent: a[7]!,  muted: b[21]!, surface: a[30]!, border: a[23]! }
            const cls = dark ?
                { header: a[3]!, title: b[31]!, body: b[9]!,                name: a[27]!, type: a[22]!, mark: a[16]! } :
                { header: a[7]!, title: b[31]!, body: "var(--_node-fill)", name: a[5]!,  type: a[11]!, mark: a[17]! }

            /*  determine the style of the node boxes: a darker accent color with lighter
                labels on the light theme style and vice versa on the dark one, overridable
                per property by a "classDef default" (as "beautiful-mermaid" does not apply
                this class itself), split at the commas outside of parentheses (as
                in "rgb(...)"), and escaped for the SVG attributes  */
            const box: Record<string, string> = dark ?
                { fill: a[23]!, stroke: a[26]!, color: b[6]!  } :
                { fill: a[5]!,  stroke: a[3]!,  color: b[31]! }
            for (const m of src.matchAll(/^\s*classDef\s+default\s+(.+?);?\s*$/gm)) {
                for (const pair of m[1]!.split(/,(?![^(]*\))/)) {
                    const colon = pair.indexOf(":")
                    const key   = pair.slice(0, colon).trim()
                    const value = pair.slice(colon + 1).trim()
                    if (colon > 0 && key in box && value !== "")
                        box[key] = value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")
                }
            }
            const svg = renderMermaidSVG(src, { ...colors, font: "Source Sans 3", padding: 12 })
                .replace(/^\s*@import url\([^)]*\);\s*$/m, "")
                .replace(/<g class="class-node"[^>]*>[\s\S]*?<\/g>/g, (group) => group
                    .replace("fill=\"var(--_node-fill)\"",                 `fill="${cls.body}"`)
                    .replace("fill=\"var(--_group-hdr)\"",                 `fill="${cls.header}"`)
                    .replace("fill=\"var(--_text-muted)\">&lt;&lt;",       `fill="${cls.title}">&lt;&lt;`)
                    .replace("font-weight=\"700\" fill=\"var(--_text)\"",  `font-weight="700" fill="${cls.title}"`)
                    .replaceAll("<tspan fill=\"var(--_text-sec)\">",       `<tspan fill="${cls.name}">`)
                    .replaceAll("<tspan fill=\"var(--_text-muted)\">",     `<tspan fill="${cls.type}">`)
                    .replaceAll("<tspan fill=\"var(--_text-faint)\">",     `<tspan fill="${cls.mark}">`))

                /*  apply the style of the node boxes to the nodes without an explicit
                    fill, stroke, or label color (but not to the dots of the states)  */
                .replace(/<g class="node"[^>]*>[\s\S]*?<\/g>/g, (group) => group
                    .replaceAll("fill=\"var(--_node-fill)\"",       () => `fill="${box.fill}"`)
                    .replaceAll("stroke=\"var(--_node-stroke)\"",   () => `stroke="${box.stroke}"`)
                    .replace(/(<text\b[^>]*?) fill="var\(--_text\)"/, (_, text: string) => `${text} fill="${box.color}"`))

                /*  draw the frames of the subgraphs in a neutral grey instead of the accent border  */
                .replace(/(fill="var\(--_group-(?:fill|hdr)\)") stroke="var\(--_node-stroke\)"/g,
                    (_, fill: string) => `${fill} stroke="${dark ? b[13]! : b[25]!}"`)

            /*  confine the custom colors of the diagram to the theme color spreads  */
            return confineColors(svg, [ ...b, ...a, ...s ])
        }

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
            .addOption(new Option("-l, --lang <lang>", "diagram language")
                .choices([ "mermaid", "d2" ]).default("mermaid"))
            .addOption(new Option("-f, --format <format>", "output format")
                .choices([ "ascii", "svg" ]).default("ascii"))
            .addOption(new Option("-t, --theme <theme>", "theme style of SVG output (default: agent.diagram.theme)")
                .choices([ "auto", "light", "dark" ]))
            .option("-T, --tone <tone>",
                "theme color tone(s) of SVG output as \"#rrggbb [#rrggbb]\" (default: agent.diagram.tone)")
            .option("-a, --ascii",
                "emit plain ASCII (+-|) instead of Unicode box-drawing",
                false)
            .addOption(new Option("-c, --color-mode <mode>", "force color mode (Mermaid only)")
                .choices([ "none", "ansi16", "ansi256" ]).default(Diagram.detectColorMode()))
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

                /*  create diagram rendering (in the configured theme by default)  */
                let out: string
                try {
                    const theme = Diagram.configTheme(this.log)
                    const style = opts.theme === "auto" ? Diagram.detectTheme() : opts.theme ?? theme.theme
                    out = await Diagram.render(src, { ...opts, theme: style, tone: opts.tone ?? theme.tone })
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
                await writeStdout(out.endsWith("\n") ? out : `${out}\n`)
            })
    }
}

/*  MCP registration entry point for diagram tools  */
export class DiagramMCP {
    constructor (private log: Log) {}

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
                "Do not style any colors, as the SVG uses the theme colors only. " +
                "Prefer a narrow and tall layout: top-to-bottom direction, at most 4 nodes " +
                "side by side, short labels, and more sibling nodes grouped into a Mermaid " +
                "`subgraph` with `direction LR` resp. a D2 container with `grid-columns: 3`. " +
                "Returns the rendered art (or SVG document, for `format` \"svg\") as `text`.",
            inputSchema: {
                diagram: z.string()
                    .describe("Mermaid or D2 diagram specification"),
                lang: z.enum([ "mermaid", "d2" ]).default("mermaid")
                    .describe("diagram language: \"mermaid\" for Mermaid, \"d2\" for D2"),
                format: z.enum([ "ascii", "svg" ]).default("ascii")
                    .describe("output format: \"ascii\" for Unicode/ASCII art, \"svg\" for an SVG document"),
                theme: z.enum([ "light", "dark" ]).optional()
                    .describe("theme style of the SVG document; defaults to the configured agent.diagram.theme"),
                tone: z.string().optional()
                    .describe("theme color tone(s) \"#rrggbb [#rrggbb]\" of the SVG document; defaults to the configured agent.diagram.tone"),
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
                const theme = Diagram.configTheme(this.log)
                const out   = await Diagram.render(args.diagram, { ...args, theme: args.theme ?? theme.theme, tone: args.tone ?? theme.tone })
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

