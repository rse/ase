/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import fs                                        from "node:fs"
import os                                        from "node:os"
import path                                      from "node:path"
import { createHash }                            from "node:crypto"
import { createRequire }                         from "node:module"
import { execFileSync }                          from "node:child_process"
import { Worker }                                from "node:worker_threads"

import { Command, InvalidArgumentError, Option } from "commander"
import { z }                                     from "zod"

import type { McpServer }                        from "@modelcontextprotocol/sdk/server/mcp.js"

import type Log                                  from "./ase-lib-log.js"
import { readStdinBuffer, writeStdout }          from "./ase-lib-stdio.js"
import { Diagram }                               from "./ase-util-diagram.js"

/*  supported output formats  */
export type RasterizeFormat = "png" | "kitty" | "iip" | "sixel"

/*  options accepted by the rendering helper  */
export interface RasterizeRenderOpts {
    scale:      number | "auto"
    width:      number
    height:     number
    density:    number
    background: string
    font:       string[]
    smart:      boolean
    maximum?:   number
}

/*  the terminal cell box of an image fitted into the terminal,
    constrained either by its columns or by its rows  */
export interface RasterizeCells {
    columns: number
    rows:    number
    by:      "columns" | "rows"
}

/*  internal command options type  */
interface RasterizeOpts extends RasterizeRenderOpts {
    format: RasterizeFormat | "auto"
    output: string
    data?:  string
}

/*  the rasterized image  */
export interface RasterizeImage {
    png:    Uint8Array
    pixels: Uint8Array
    width:  number
    height: number
    cells?: RasterizeCells
}

/*  a job of the rasterizing worker thread, and its reply  */
export interface RasterizeJob {
    id:   number
    svg:  string
    opts: RasterizeRenderOpts
}
export type RasterizeReply = { id: number, error: string } |
    { id: number, png: Uint8Array, width: number, height: number, cells?: RasterizeCells }

/*  the settling of a still running job of the rasterizing worker thread  */
type RasterizeSettle = { resolve: (image: RasterizeImage) => void, reject: (err: Error) => void }

/*  the decoded input: its raw data, its image information
    (or null for an SVG document), and its SVG document  */
export interface RasterizeInput {
    data: Uint8Array
    info: { type: string, width: number, height: number } | null
    svg:  string
}

/*  the properties of the tmux client (or null outside tmux or on
    failure), queried once: its cell pixel size, its native SIXEL
    support, its passing through of terminal graphics, the identification
    of its outer terminal (the "XTVERSION" answer and the "TERM"), and the
    session environment (which carries the outer terminal variables of
    the session creation, as the pane only sees "TERM_PROGRAM=tmux")  */
type TmuxInfo = {
    cellWidth:   number
    cellHeight:  number
    sixel:       boolean
    passthrough: boolean
    termType:    string
    termName:    string
    env:         Record<string, string>
}
let tmuxInfo: TmuxInfo | null | undefined
const tmux = (): TmuxInfo | null => {
    if (tmuxInfo !== undefined)
        return tmuxInfo
    tmuxInfo = null
    if (process.env.TMUX) {
        try {
            const format = "#{client_cell_width}\t#{client_cell_height}\t#{client_termfeatures}\t" +
                "#{allow-passthrough}\t#{client_termtype}\t#{client_termname}"
            const [ cw, ch, features, passthrough, termType, termName ] =
                execFileSync("tmux", [ "display", "-p", format ], { encoding: "utf8" }).replace(/\n$/, "").split("\t")
            const env: Record<string, string> = {}
            for (const line of execFileSync("tmux", [ "show-environment" ], { encoding: "utf8" }).split("\n")) {
                const m = /^([^-=][^=]*)=(.*)$/.exec(line)
                if (m !== null)
                    env[m[1]!] = m[2]!
            }
            tmuxInfo = {
                cellWidth:   Number(cw) || 0,
                cellHeight:  Number(ch) || 0,
                sixel:       (features ?? "").split(",").includes("sixel"),
                passthrough: passthrough === "on" || passthrough === "all",
                termType:    termType ?? "",
                termName:    termName ?? "",
                env
            }
        }
        catch {
            /*  keep defaults  */
        }
    }
    return tmuxInfo
}

/*  check whether the outer terminal of tmux supports the Unicode
    placeholders of the Kitty Graphics Protocol (Kitty and Ghostty),
    preferring its live "XTVERSION" answer over its "TERM" and over the
    potentially stale variables of the pane and session environment  */
const tmuxKittyPlaceholders = (info: TmuxInfo): boolean => {
    const known = /^(?:kitty|ghostty)\b/i
    if (info.termType !== "")
        return known.test(info.termType)
    return /^xterm-(?:kitty|ghostty)$/.test(info.termName)
        || !!(process.env.KITTY_WINDOW_ID || process.env.GHOSTTY_RESOURCES_DIR)
        || !!(info.env.KITTY_WINDOW_ID || info.env.GHOSTTY_RESOURCES_DIR)
        || known.test(info.env.TERM_PROGRAM ?? "")
}

/*  pixel size of a terminal character cell: as reported by tmux, else
    assumed (as the terminal pixel geometry cannot be queried portably)  */
const cellSize = (): { width: number, height: number } => {
    const info = tmux()
    return info !== null && info.cellWidth > 0 && info.cellHeight > 0 ?
        { width: info.cellWidth, height: info.cellHeight } :
        { width: 10, height: 20 }
}

/*  check whether the output passes through tmux: a local one (by "TMUX"),
    or a remote one, like for SSH from inside tmux (by a "TERM" of tmux, or
    of "screen" outside of GNU screen, as tmux formerly defaulted to it)  */
const insideTmux = (): boolean =>
    !!process.env.TMUX || /^tmux\b/.test(process.env.TERM ?? "")
        || (/^screen\b/.test(process.env.TERM ?? "") && !process.env.STY)

/*  wrap an escape sequence into a tmux passthrough sequence (with all
    inner ESCs doubled), as tmux otherwise drops it silently  */
const tmuxWrap = (sequence: string): string =>
    insideTmux() ? `\x1bPtmux;${sequence.replaceAll("\x1b", "\x1b\x1b")}\x1b\\` : sequence

/*  the combining diacritics encoding the row and column numbers of the
    Unicode placeholders of the Kitty Graphics Protocol (the code point
    ranges of Kitty's "gen/rowcolumn-diacritics.txt", for 297 numbers)  */
const kittyDiacritics = [
    [ 0x305 ], [ 0x30D, 0x30E ], [ 0x310 ], [ 0x312 ], [ 0x33D, 0x33F ], [ 0x346 ], [ 0x34A, 0x34C ],
    [ 0x350, 0x352 ], [ 0x357 ], [ 0x35B ], [ 0x363, 0x36F ], [ 0x483, 0x487 ], [ 0x592, 0x595 ],
    [ 0x597, 0x599 ], [ 0x59C, 0x5A1 ], [ 0x5A8, 0x5A9 ], [ 0x5AB, 0x5AC ], [ 0x5AF ], [ 0x5C4 ],
    [ 0x610, 0x617 ], [ 0x657, 0x65B ], [ 0x65D, 0x65E ], [ 0x6D6, 0x6DC ], [ 0x6DF, 0x6E2 ], [ 0x6E4 ],
    [ 0x6E7, 0x6E8 ], [ 0x6EB, 0x6EC ], [ 0x730 ], [ 0x732, 0x733 ], [ 0x735, 0x736 ], [ 0x73A ],
    [ 0x73D ], [ 0x73F, 0x741 ], [ 0x743 ], [ 0x745 ], [ 0x747 ], [ 0x749, 0x74A ], [ 0x7EB, 0x7F1 ],
    [ 0x7F3 ], [ 0x816, 0x819 ], [ 0x81B, 0x823 ], [ 0x825, 0x827 ], [ 0x829, 0x82D ], [ 0x951 ],
    [ 0x953, 0x954 ], [ 0xF82, 0xF83 ], [ 0xF86, 0xF87 ], [ 0x135D, 0x135F ], [ 0x17DD ], [ 0x193A ],
    [ 0x1A17 ], [ 0x1A75, 0x1A7C ], [ 0x1B6B ], [ 0x1B6D, 0x1B73 ], [ 0x1CD0, 0x1CD2 ],
    [ 0x1CDA, 0x1CDB ], [ 0x1CE0 ], [ 0x1DC0, 0x1DC1 ], [ 0x1DC3, 0x1DC9 ], [ 0x1DCB, 0x1DCC ],
    [ 0x1DD1, 0x1DE6 ], [ 0x1DFE ], [ 0x20D0, 0x20D1 ], [ 0x20D4, 0x20D7 ], [ 0x20DB, 0x20DC ],
    [ 0x20E1 ], [ 0x20E7 ], [ 0x20E9 ], [ 0x20F0 ], [ 0x2CEF, 0x2CF1 ], [ 0x2DE0, 0x2DFF ], [ 0xA66F ],
    [ 0xA67C, 0xA67D ], [ 0xA6F0, 0xA6F1 ], [ 0xA8E0, 0xA8F1 ], [ 0xAAB0 ], [ 0xAAB2, 0xAAB3 ],
    [ 0xAAB7, 0xAAB8 ], [ 0xAABE, 0xAABF ], [ 0xAAC1 ], [ 0xFE20, 0xFE26 ], [ 0x10A0F ], [ 0x10A38 ],
    [ 0x1D185, 0x1D189 ], [ 0x1D1AA, 0x1D1AD ], [ 0x1D242, 0x1D244 ]
].flatMap(([ from, to ]) => Array.from({ length: (to ?? from!) - from! + 1 },
    (_, i) => String.fromCodePoint(from! + i)))

/*  check whether an output format passes through tmux to the outer
    terminal, instead of being handled natively by tmux (SIXEL only)  */
const tmuxPassthrough = (format: RasterizeFormat): boolean =>
    insideTmux() && format !== "png" && !(format === "sixel" && tmux()?.sixel)

/*  custom argument parser for Commander: scale factor or "auto"  */
const parseScale = (value: string): number | "auto" => {
    if (value === "auto")
        return value
    const n = Number(value)
    if (!Number.isFinite(n) || n <= 0)
        throw new InvalidArgumentError("--scale must be a positive number or \"auto\"")
    return n
}

/*  custom argument parser for Commander: non-negative integer  */
const parseInteger = (name: string) => (value: string): number => {
    const n = Number(value)
    if (!Number.isInteger(n) || n < 0)
        throw new InvalidArgumentError(`${name} must be a non-negative integer`)
    return n
}

/*  the resvg WebAssembly module, loaded and initialized on first use only  */
let resvg: Promise<typeof import("@resvg/resvg-wasm")> | null = null
const loadResvg = () => {
    resvg ??= import("@resvg/resvg-wasm").then(async (module) => {
        const require = createRequire(import.meta.url)
        await module.initWasm(fs.readFileSync(require.resolve("@resvg/resvg-wasm/index_bg.wasm")))
        return module
    }).catch((err: unknown) => {
        resvg = null
        throw err
    })
    return resvg
}

/*  find the end index of the parenthesized group opened at text[i]
    (where text[i]==="("), or -1 if the group is unterminated  */
const scanParens = (text: string, i: number): number => {
    let depth = 0
    for (let j = i; j < text.length; j++) {
        if (text[j] === "(")
            depth++
        else if (text[j] === ")" && --depth === 0)
            return j
    }
    return -1
}

/*  split a function argument list at its top-level commas  */
const splitArgs = (text: string): string[] => {
    const args: string[] = []
    let depth = 0
    let start = 0
    for (let i = 0; i < text.length; i++) {
        if (text[i] === "(")
            depth++
        else if (text[i] === ")")
            depth--
        else if (text[i] === "," && depth === 0) {
            args.push(text.slice(start, i).trim())
            start = i + 1
        }
    }
    args.push(text.slice(start).trim())
    return args
}

/*  parse a hexadecimal CSS color into its RGB components  */
const parseHexColor = (color: string): number[] | null => {
    let m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(color)
    if (m !== null)
        return m.slice(1, 4).map((c) => Number.parseInt(c + c, 16))
    m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color)
    if (m !== null)
        return m.slice(1, 4).map((c) => Number.parseInt(c, 16))
    return null
}

/*  evaluate a CSS "color-mix(in srgb, <color> [<p>%], <color> [<p>%])"
    argument list into a hexadecimal color (or null if unsupported)  */
const colorMix = (args: string[]): string | null => {
    if (args.length !== 3 || args[0] !== "in srgb")
        return null
    const parse = (arg: string) => {
        const m = /^(\S+)(?:\s+([\d.]+)%)?$/.exec(arg)
        return m === null ? null : { rgb: parseHexColor(m[1]!), p: m[2] !== undefined ? Number(m[2]) : undefined }
    }
    const c1 = parse(args[1]!)
    const c2 = parse(args[2]!)
    if (c1 === null || c2 === null || c1.rgb === null || c2.rgb === null)
        return null
    let p1 = c1.p ?? (c2.p !== undefined ? 100 - c2.p : 50)
    let p2 = c2.p ?? 100 - p1
    if (p1 + p2 <= 0)
        return null
    p1 = p1 / (p1 + p2)
    p2 = 1 - p1
    const rgb1 = c1.rgb
    const rgb2 = c2.rgb
    return "#" + rgb1.map((v, i) => Math.round(v * p1 + rgb2[i]! * p2)
        .toString(16).padStart(2, "0")).join("")
}

/*  reusable functionality: SVG rasterizing and terminal graphics encoding  */
export class Rasterize {
    /*  determine the MIME type and dimensions of a PNG, GIF, or JPEG
        image (by its signature and header), or null for other input  */
    static imageInfo (data: Uint8Array): { type: string, width: number, height: number } | null {
        const view  = new DataView(data.buffer, data.byteOffset, data.byteLength)
        const match = (signature: number[]) => data.length >= 24 && signature.every((octet, i) => data[i] === octet)

        /*  PNG: dimensions in the leading IHDR chunk  */
        if (match([ 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A ]))
            return { type: "image/png", width: view.getUint32(16), height: view.getUint32(20) }

        /*  GIF: dimensions in the logical screen descriptor  */
        else if (match([ 0x47, 0x49, 0x46, 0x38 ]))
            return { type: "image/gif", width: view.getUint16(6, true), height: view.getUint16(8, true) }

        /*  JPEG: dimensions in the first start-of-frame (SOF0-SOF15,
            except DHT, JPG, and DAC) segment of the marker segments  */
        else if (match([ 0xFF, 0xD8, 0xFF ])) {
            let i = 2
            while (i + 9 < data.length && data[i] === 0xFF) {
                const marker = data[i + 1]!
                if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC)
                    return { type: "image/jpeg", width: view.getUint16(i + 7), height: view.getUint16(i + 5) }
                i += 2 + view.getUint16(i + 2)
            }
        }
        return null
    }

    /*  wrap a PNG, GIF, or JPEG image into an SVG document of its
        dimensions, so it passes the same rendering  */
    static wrapImage (image: Uint8Array, info: { type: string, width: number, height: number }): string {
        const { type, width, height } = info
        const data = Buffer.from(image).toString("base64")
        return "<svg xmlns=\"http://www.w3.org/2000/svg\" " +
            `width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
            `<image width="${width}" height="${height}" href="data:${type};base64,${data}"/></svg>`
    }

    /*  decode an SVG document or PNG/GIF/JPEG image, given as a buffer or
        string of its raw content, of a "data:" URL, or of base64 data,
        into its raw data, its image information, and its SVG document  */
    static decode (input: Uint8Array | string): RasterizeInput {
        let data = typeof input === "string" ? new Uint8Array(Buffer.from(input, "utf8")) : input
        let info = Rasterize.imageInfo(data)
        if (info === null) {
            const text = Buffer.from(data).toString("utf8").trim()
            const m    = /^data:([^,]*),/.exec(text)
            if (m !== null) {
                const payload = text.slice(m[0].length)
                data = new Uint8Array(/;base64$/i.test(m[1]!) ?
                    Buffer.from(payload, "base64") :
                    Buffer.from(decodeURIComponent(payload), "utf8"))
            }
            else if (/^[A-Za-z0-9+/=_\s-]+$/.test(text))
                data = new Uint8Array(Buffer.from(text.replace(/\s+/g, ""), "base64"))
            info = Rasterize.imageInfo(data)
        }
        const svg = info !== null ? Rasterize.wrapImage(data, info) : Buffer.from(data).toString("utf8")
        if (svg.trim() === "")
            throw new Error("empty SVG document")
        return { data, info, svg }
    }

    /*  resolve the CSS custom properties ("var(...)") and color mixings
        ("color-mix(...)") of an SVG document into plain values, as resvg
        supports neither of them (custom properties are treated as
        document-global, with inline style attributes taking precedence)  */
    static smartify (svg: string): string {
        /*  collect the custom property definitions  */
        const defs = new Map<string, string>()
        const collect = (css: string) => {
            for (const m of css.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g))
                defs.set(m[1]!, m[2]!.trim())
        }
        for (const m of svg.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g))
            collect(m[1]!)
        for (const m of svg.matchAll(/\sstyle="([^"]*)"/g))
            collect(m[1]!)

        /*  substitute all resolvable function calls in a text  */
        const substitute = (text: string, depth: number): string => {
            if (depth > 16)
                return text
            let out = ""
            let i   = 0
            for (const m of text.matchAll(/\b(var|color-mix)\(/g)) {
                if (m.index < i)
                    continue
                const open  = m.index + m[1]!.length
                const close = scanParens(text, open)
                if (close < 0)
                    break
                const args = splitArgs(substitute(text.slice(open + 1, close), depth + 1))
                let value: string | null = null
                if (m[1] === "var") {
                    const def = defs.get(args[0]!)
                    if (def !== undefined)
                        value = substitute(def, depth + 1)
                    else if (args.length > 1)
                        value = args.slice(1).join(", ")
                }
                else
                    value = colorMix(args)
                out += text.slice(i, m.index) + (value ?? text.slice(m.index, close + 1))
                i = close + 1
            }
            return out + text.slice(i)
        }
        return substitute(svg, 0)
    }

    /*  the bundled default fonts (loaded on first use only)  */
    private static bundled: Uint8Array[] | null = null

    /*  load the bundled default fonts plus the given font files  */
    static loadFonts (files: string[]): Uint8Array[] {
        const read = (file: string | URL) => {
            try {
                return new Uint8Array(fs.readFileSync(file))
            }
            catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err)
                throw new Error(`cannot read font file "${file.toString()}": ${message}`, { cause: err })
            }
        }
        if (Rasterize.bundled === null) {
            const dir = new URL("./font/", import.meta.url)
            Rasterize.bundled = fs.existsSync(dir) ?
                fs.readdirSync(dir).filter((file) => file.endsWith(".ttf")).map((file) => read(new URL(file, dir))) :
                []
        }
        return [ ...Rasterize.bundled, ...files.map((file) => read(file)) ]
    }

    /*  fit an image of the given pixel dimensions into the terminal (all
        its columns and all its rows except two), or null if unknown, where
        the terminal size is the given one or else the detected one  */
    static fitTerminal (width: number, height: number, termWidth = 0, termHeight = 0): RasterizeCells | null {
        const columns = termWidth  > 0 ? termWidth  : Diagram.detectTermWidth()
        const rows    = (termHeight > 0 ? termHeight : Diagram.detectTermHeight()) - 2
        if (columns <= 0 || rows <= 0 || width <= 0 || height <= 0)
            return null
        const cell    = cellSize()
        const fitRows = Math.ceil(columns * (height / width) * (cell.width / cell.height))
        if (fitRows <= rows)
            return { columns, rows: fitRows, by: "columns" }
        const fitColumns = Math.ceil(rows * (width / height) * (cell.height / cell.width))
        return { columns: fitColumns, rows, by: "rows" }
    }

    /*  rasterize an SVG document into a PNG image and its RGBA pixels,
        where scale "auto" fits the image into the terminal with "density"
        rendered pixels per assumed pixel of the terminal cells  */
    static async render (svg: string, opts: RasterizeRenderOpts): Promise<RasterizeImage> {
        const { Resvg } = await loadResvg()
        if (opts.smart)
            svg = Rasterize.smartify(svg)
        const options = {
            font: {
                fontBuffers:       Rasterize.loadFonts(opts.font),
                defaultFontFamily: "Source Sans 3",
                sansSerifFamily:   "Source Sans 3",
                serifFamily:       "Source Sans 3",
                monospaceFamily:   "Source Code Pro"
            },
            ...(opts.background !== "auto" ? { background: opts.background } : {})
        }

        /*  determine the zoom factor, bounded by the optional maximum
            width and height of the rasterized image in pixels  */
        let zoom  = opts.scale === "auto" ? 1 : opts.scale
        let cells: RasterizeCells | null = null
        if (opts.scale === "auto" || opts.maximum !== undefined) {
            const probe = new Resvg(svg, options)
            if (opts.scale === "auto") {
                cells = Rasterize.fitTerminal(probe.width, probe.height, opts.width, opts.height)
                const cell = cellSize()
                if (cells !== null)
                    zoom = cells.by === "columns" ?
                        cells.columns * cell.width  * opts.density / probe.width :
                        cells.rows    * cell.height * opts.density / probe.height
            }
            if (opts.maximum !== undefined)
                zoom = Math.min(zoom, Math.floor(opts.maximum) / Math.max(probe.width, probe.height))
            probe.free()
        }

        /*  rasterize the SVG document  */
        const renderer = new Resvg(svg, { ...options, fitTo: { mode: "zoom", value: zoom } })
        try {
            const image = renderer.render()
            const result: RasterizeImage = { png: image.asPng(), pixels: image.pixels, width: image.width, height: image.height }
            if (cells !== null)
                result.cells = cells
            image.free()
            return result
        }
        finally {
            renderer.free()
        }
    }

    /*  the worker thread of "renderIsolated" (started on first use, and keeping
        the process alive only while it has jobs), with its still running jobs,
        and the number of the last job  */
    private static pool: { worker: Worker, jobs: Map<number, RasterizeSettle> } | null = null
    private static job = 0

    /*  rasterize like "render", but without the RGBA pixels and in a persistent
        worker thread (keeping resvg and the fonts loaded), as the rasterizing is
        CPU-bound and would otherwise block the event loop of the service  */
    static renderIsolated (svg: string, opts: RasterizeRenderOpts): Promise<RasterizeImage> {
        if (Rasterize.pool === null) {
            const worker = new Worker(new URL("./ase-util-rasterize-worker.js", import.meta.url))
            const jobs   = new Map<number, RasterizeSettle>()
            const pool   = { worker, jobs }
            const fail   = (err: Error) => {
                if (Rasterize.pool === pool)
                    Rasterize.pool = null
                for (const job of jobs.values())
                    job.reject(err)
                jobs.clear()
            }
            worker.on("message", (reply: RasterizeReply) => {
                const job = jobs.get(reply.id)
                if (job === undefined)
                    return
                jobs.delete(reply.id)
                if (jobs.size === 0)
                    worker.unref()
                if ("error" in reply)
                    job.reject(new Error(reply.error))
                else {
                    const cells = reply.cells !== undefined ? { cells: reply.cells } : {}
                    job.resolve({ png: reply.png, pixels: new Uint8Array(0), width: reply.width, height: reply.height, ...cells })
                }
            })
            worker.on("error", (err: unknown) => { fail(err instanceof Error ? err : new Error(String(err))) })
            worker.on("exit",  (code) => { fail(new Error(`rasterize worker exited with code ${code}`)) })
            worker.unref()
            Rasterize.pool = pool
        }
        const { worker, jobs } = Rasterize.pool
        const id = ++Rasterize.job
        return new Promise((resolve, reject) => {
            jobs.set(id, { resolve, reject })
            worker.ref()
            worker.postMessage({ id, svg, opts: { ...opts, font: [ ...opts.font ] } } satisfies RasterizeJob)
        })
    }

    /*  determine the output format for format "auto": PNG for a file
        or non-terminal output, else the detected terminal protocol  */
    static async detectFormat (output: string): Promise<RasterizeFormat> {
        if (output !== "-" || !process.stdout.isTTY)
            return "png"

        /*  under tmux, prefer the formats which tmux manages as regular pane
            content: Kitty with Unicode placeholders, or natively handled SIXEL  */
        const info = tmux()
        if (info !== null && tmuxKittyPlaceholders(info))
            return "kitty"
        else if (info?.sixel)
            return "sixel"

        /*  detect the protocols, under tmux from the outer terminal variables
            of the session environment and the "TERM" of the client (overlaid
            onto the process environment, as the detection reads it directly)  */
        const { createSupportsTerminalGraphics } = await import("supports-terminal-graphics")
        const overlay: Record<string, string> = info === null ? {} : {
            ...info.env, ...(info.termName !== "" ? { TERM: info.termName } : {})
        }
        const saved = Object.fromEntries(Object.keys(overlay).map((key) => [ key, process.env[key] ]))
        Object.assign(process.env, overlay)
        const termProgram = process.env.TERM_PROGRAM
        let support: ReturnType<typeof createSupportsTerminalGraphics>
        try {
            support = createSupportsTerminalGraphics(process.stdout)
        }
        finally {
            for (const [ key, value ] of Object.entries(saved)) {
                if (value === undefined)
                    Reflect.deleteProperty(process.env, key)
                else
                    process.env[key] = value
            }
        }

        /*  prefer IIP under iTerm2, as its Kitty support is unreliable, and
            skip Kitty under tmux, as it then requires the Unicode placeholders  */
        if (support.iterm2 && termProgram === "iTerm.app")
            return "iip"
        else if (support.kitty && !insideTmux())
            return "kitty"
        else if (support.iterm2)
            return "iip"
        else if (support.sixel)
            return "sixel"
        else
            throw new Error("no terminal graphics protocol detected " +
                `(${insideTmux() ? "inside tmux, the outer terminal is often hidden: " : ""}use an explicit --format)`)
    }

    /*  check whether the agent tool can show inline images, which it draws only into
        terminals with the Unicode placeholders of the Kitty Graphics Protocol (Kitty
        and Ghostty), directly or through a tmux passing the terminal graphics through  */
    static detectInlineImages (): boolean {
        const info = tmux()
        if (info !== null)
            return info.passthrough && tmuxKittyPlaceholders(info)
        else if (insideTmux())
            return false
        else
            return !!(process.env.KITTY_WINDOW_ID || process.env.GHOSTTY_RESOURCES_DIR)
                || /^xterm-(?:kitty|ghostty)$/.test(process.env.TERM ?? "")
                || /^(?:kitty|ghostty)$/i.test(process.env.TERM_PROGRAM ?? "")
    }

    /*  ensure that tmux passes the terminal graphics through to the outer terminal  */
    static checkTmuxPassthrough (format: RasterizeFormat): void {
        if (tmuxPassthrough(format) && tmux()?.passthrough === false)
            throw new Error("tmux drops terminal graphics, as its option \"allow-passthrough\" is off " +
                "(enable it via \"tmux set -g allow-passthrough on\")")
    }

    /*  encode the rasterized image into the output format, where only the
        output onto a terminal is passed through tmux (if inside tmux)  */
    static async encode (image: RasterizeImage, format: RasterizeFormat, terminal = false): Promise<Uint8Array | string> {
        const passthrough = terminal && tmuxPassthrough(format)
        const wrap = (sequence: string) => passthrough ? tmuxWrap(sequence) : sequence
        if (format === "png")
            return image.png
        else if (format === "kitty") {
            /*  Kitty Graphics Protocol: transmit and display PNG data in chunks
                of 4096 base64 characters, suppressing the terminal responses,
                and let the terminal scale it onto its fitted cell box  */
            const data = Buffer.from(image.png).toString("base64")
            let size = image.cells === undefined ? "" : image.cells.by === "columns" ?
                `,c=${image.cells.columns}` : `,r=${image.cells.rows}`

            /*  inside tmux, display the image through a virtual placement and
                its Unicode placeholders, i.e., text cells which tmux manages
                like regular pane content (cell box limited to the diacritics)  */
            const placeholders = passthrough
            const cell    = cellSize()
            const columns = Math.min(image.cells?.columns ?? Math.ceil(image.width  / cell.width),  kittyDiacritics.length)
            const rows    = Math.min(image.cells?.rows    ?? Math.ceil(image.height / cell.height), kittyDiacritics.length)
            const id      = 1 + Math.floor(Math.random() * 0xFFFFFE)
            if (placeholders)
                size = `,U=1,i=${id},c=${columns},r=${rows}`

            let out = ""
            for (let i = 0; i < data.length; i += 4096) {
                const more = i + 4096 < data.length ? 1 : 0
                const ctrl = i === 0 ? `f=100,a=T,q=2${size}` : "q=2"
                out += wrap(`\x1b_G${ctrl},m=${more};${data.slice(i, i + 4096)}\x1b\\`)
            }
            if (placeholders) {
                /*  one line of placeholders per row, each in the foreground color
                    encoding the image id, where only the first placeholder carries
                    the diacritics of its row and column, while the subsequent
                    ones inherit the row and increment the column  */
                const color = `\x1b[38;2;${(id >> 16) & 0xFF};${(id >> 8) & 0xFF};${id & 0xFF}m`
                const lines: string[] = []
                for (let row = 0; row < rows; row++)
                    lines.push(color + "\u{10EEEE}" + kittyDiacritics[row]! + kittyDiacritics[0]! +
                        "\u{10EEEE}".repeat(columns - 1) + "\x1b[39m")
                out += lines.join("\n")
            }
            return out
        }
        else if (format === "iip") {
            /*  iTerm2 Inline Image Protocol (scaled onto the fitted cell box)  */
            const size = image.cells === undefined ? "" : image.cells.by === "columns" ?
                `;width=${image.cells.columns}` : `;height=${image.cells.rows}`
            const data = Buffer.from(image.png)
            return wrap(`\x1b]1337;File=inline=1${size};size=${data.byteLength}:${data.toString("base64")}\x07`)
        }
        else {
            /*  SIXEL: quantize a copy of the pixels into a palette (the
                quantizer dithers its input in place) and encode the original
                pixels against it, keeping fully transparent pixels untouched  */
            const { reduce } = await import("sixel/lib/Quantizer.js")
            const { introducer, sixelEncode, FINALIZER } = await import("sixel")
            const { palette } = reduce(image.pixels.slice(), image.width, 256)
            const sixel = introducer(1) + sixelEncode(image.pixels, image.width, image.height, palette) + FINALIZER
            return wrap(sixel)
        }
    }
}

/*  command-line handling  */
export default class RasterizeCommand {
    constructor (private log: Log) {}

    /*  register commands  */
    register (program: Command): void {
        program
            .command("rasterize")
            .description("Rasterize SVG document or PNG/GIF/JPEG image into PNG, Kitty Graphics, iTerm2 Inline Image, or SIXEL")
            .addOption(new Option("-f, --format <format>", "output format")
                .choices([ "png", "kitty", "iip", "sixel", "auto" ]).default("auto"))
            .option("-o, --output <file>",
                "write output to <file> instead of stdout (\"-\")", "-")
            .option("-s, --scale <factor>",
                "scale by <factor>, or fit into terminal (\"auto\", factor 1 for PNG)", parseScale, "auto")
            .option("--width <n>",
                "width of terminal of <n> characters (for scale \"auto\", 0 = auto-detect)",
                parseInteger("--width"), 0)
            .option("--height <n>",
                "height of terminal of <n> lines (for scale \"auto\", 0 = auto-detect)",
                parseInteger("--height"), 0)
            .option("-b, --background <color>",
                "fill transparent areas with CSS <color>, or keep transparency (\"auto\")", "auto")
            .option("--font <file>",
                "load additional TrueType/OpenType font <file> (repeatable)",
                (value: string, prev: string[]) => [ ...prev, value ], [] as string[])
            .option("--smart",
                "resolve CSS custom properties and color mixings before rasterizing",
                false)
            .option("-d, --data <data>",
                "rasterize <data> (SVG document, \"data:\" URL, or base64 data) instead of <input-file>")
            .argument("[input-file]", "SVG document or PNG/GIF/JPEG image to rasterize (\"-\" for stdin)")
            .action(async (input: string | undefined, opts: RasterizeOpts) => {
                try {
                    /*  fetch SVG document or PNG/GIF/JPEG image from data, file, or stdin  */
                    if ((input === undefined) === (opts.data === undefined))
                        throw new Error("either <input-file> or option --data has to be given")
                    const raw = opts.data !== undefined ? opts.data :
                        input === "-" ? await readStdinBuffer() : new Uint8Array(fs.readFileSync(input!))
                    const { data, info, svg } = Rasterize.decode(raw)

                    /*  rasterize and encode SVG document (but pass through an
                        unchanged PNG image to all formats not needing its pixels)  */
                    const format   = opts.format === "auto" ? await Rasterize.detectFormat(opts.output) : opts.format
                    const terminal = opts.output === "-" && process.stdout.isTTY
                    if (terminal)
                        Rasterize.checkTmuxPassthrough(format)
                    const scale   = opts.scale === "auto" && format === "png" ? 1 : opts.scale
                    const density = format === "sixel" ? 1 : 2
                    const image   = info?.type === "image/png" && scale === 1
                        && opts.background === "auto" && format !== "sixel" ?
                        { png: data, pixels: new Uint8Array(0), width: info.width, height: info.height } :
                        await Rasterize.render(svg, { ...opts, scale, density })
                    let out       = await Rasterize.encode(image, format, terminal)

                    /*  output encoded image (on a terminal followed by a newline,
                        so the subsequent output starts below the image)  */
                    if (terminal && typeof out === "string") {
                        /*  inside tmux, which is unaware of the passed through image,
                            reserve its rows upfront, draw it at the reserved position
                            without moving the outer terminal cursor, and move the
                            tmux cursor onto its last row  */
                        if (tmuxPassthrough(format) && format !== "kitty") {
                            const rows = image.cells?.rows ?? Math.ceil(image.height / cellSize().height)
                            out = "\n".repeat(rows) + `\x1b[${rows}A` +
                                tmuxWrap("\x1b7") + out + tmuxWrap("\x1b8") +
                                (rows > 1 ? `\x1b[${rows - 1}B` : "")
                        }
                        await writeStdout(out + "\n")
                    }
                    else if (opts.output === "-")
                        await writeStdout(typeof out === "string" ? out : Buffer.from(out))
                    else
                        fs.writeFileSync(opts.output, out)
                }
                catch (err: unknown) {
                    const message = err instanceof Error ? err.message : String(err)
                    this.log.write("error", `rasterize: ${message}`)
                    process.exit(1)
                }
            })
    }
}

/*  MCP registration entry point for rasterize tool  */
export class RasterizeMCP {
    /*  the largest PNG image returned as image content for output "auto" (the limit
        of an inline image of Claude Code), the number of kept PNG image files, and
        the temporary directory of the PNG image files (removed on process exit)  */
    private static readonly INLINE = 2 * 1024 * 1024
    private static readonly KEEP   = 16
    private static dir: Promise<string> | null = null

    /*  write a PNG image into a temporary file, named by its content (so a changed
        image gets a new path), and keep only the latest files  */
    private static async spill (png: Uint8Array): Promise<string> {
        if (RasterizeMCP.dir === null) {
            RasterizeMCP.dir = fs.promises.mkdtemp(path.join(os.tmpdir(), "ase-rasterize-"))
                .then((dir) => fs.promises.realpath(dir))
                .then((dir) => {
                    process.once("exit", () => { fs.rmSync(dir, { recursive: true, force: true }) })
                    return dir
                })
        }
        const dir  = await RasterizeMCP.dir
        const file = path.join(dir, `${createHash("sha1").update(png).digest("hex")}.png`)
        await fs.promises.writeFile(file, png)
        const files = await Promise.all((await fs.promises.readdir(dir)).map(async (name) => {
            const p = path.join(dir, name)
            return { p, mtime: (await fs.promises.stat(p).catch(() => null))?.mtimeMs ?? 0 }
        }))
        files.sort((a, b) => b.mtime - a.mtime)
        for (const old of files.slice(RasterizeMCP.KEEP))
            if (old.p !== file)
                await fs.promises.rm(old.p, { force: true })
        return file
    }

    register (mcp: McpServer): void {
        mcp.registerTool("ase_rasterize", {
            title:       "ASE SVG rasterize",
            description:
                "Rasterize an SVG document or PNG/GIF/JPEG image into a PNG image, e.g., to visually " +
                "inspect a diagram rendered by the `ase_diagram` tool with `format` \"svg\". " +
                "Pass either its content as `data`, or, preferably for existing files, its path as `file`. " +
                "Returns the PNG image as image content, or, for `output` \"file\" (or \"auto\" and a PNG " +
                "image above 2 MiB), the text \"[PNG: <file>, <width>x<height>]\" of a temporary PNG file, " +
                "plus, for `scale` \"auto\", the text \"[Cells: <columns>x<rows>]\" of the fitted terminal cell box.",
            inputSchema: {
                data: z.string().optional()
                    .describe("SVG document or PNG/GIF/JPEG image to rasterize, as raw SVG text, " +
                        "as \"data:\" URL, or as base64 data"),
                file: z.string().optional()
                    .describe("path of SVG document or PNG/GIF/JPEG image file to rasterize, " +
                        "relative to the project root or absolute"),
                scale: z.union([ z.number().positive(), z.literal("auto") ]).default(1)
                    .describe("scale factor of the image, or \"auto\" to fit it into a terminal of `width` and `height`"),
                width: z.number().int().nonnegative().default(0)
                    .describe("width of terminal in characters (for `scale` \"auto\", 0 = ASE_TERM_WIDTH env var)"),
                height: z.number().int().nonnegative().default(0)
                    .describe("height of terminal in lines (for `scale` \"auto\", 0 = ASE_TERM_HEIGHT env var)"),
                background: z.string().default("auto")
                    .describe("CSS color to fill transparent areas with, or \"auto\" to keep transparency"),
                smart: z.boolean().default(false)
                    .describe("resolve CSS custom properties and color mixings first (needed for `ase_diagram` SVG output)"),
                maximum: z.number().int().positive().optional()
                    .describe("maximum width and height of the rasterized image in pixels (default: unbounded)"),
                output: z.enum([ "inline", "file", "auto" ]).default("inline")
                    .describe("return the PNG image as image content (\"inline\"), as a temporary file (\"file\"), " +
                        "or as a temporary file only above 2 MiB (\"auto\")")
            }
        }, async (args) => {
            try {
                const { data, file } = args
                if ((data === undefined) === (file === undefined))
                    throw new Error("either `data` or `file` has to be given")
                let raw: Uint8Array | string
                if (file !== undefined) {
                    const { Task } = await import("./ase-task.js")
                    raw = new Uint8Array(await fs.promises.readFile(path.resolve(Task.projectRoot(), file)))
                }
                else
                    raw = data!
                const input = Rasterize.decode(raw)
                const image = await Rasterize.renderIsolated(input.svg, {
                    scale: args.scale, width: args.width, height: args.height, density: 1,
                    background: args.background, font: [], smart: args.smart,
                    ...(args.maximum !== undefined ? { maximum: args.maximum } : {})
                })
                const cells = image.cells === undefined ? [] :
                    [ { type: "text" as const, text: `[Cells: ${image.cells.columns}x${image.cells.rows}]` } ]
                if (args.output === "file" || (args.output === "auto" && image.png.length > RasterizeMCP.INLINE)) {
                    const file = await RasterizeMCP.spill(image.png)
                    return { content: [ { type: "text", text: `[PNG: ${file}, ${image.width}x${image.height}]` }, ...cells ] }
                }
                return {
                    content: [ { type: "image", data: Buffer.from(image.png).toString("base64"), mimeType: "image/png" }, ...cells ]
                }
            }
            catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err)
                return {
                    isError: true,
                    content: [ { type: "text", text: `rasterize: render failed: ${message}` } ]
                }
            }
        })
    }
}
