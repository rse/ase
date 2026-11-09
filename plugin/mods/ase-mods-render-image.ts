/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

/*  Claude Code function hooks module ("mod", EARLY ACCESS):
    Image rendering, showing for the tool "ase_mods_render_image" (registered by this
    mod) an SVG document or PNG/GIF/JPEG image, resp. for the tool "ase_mods_diagram"
    (registered by this mod) a Mermaid or D2 diagram, rendered into SVG by the MCP
    tool "ase_diagram", inline in the transcript, below the row of the tool call,
    rasterized by the MCP tool "ase_rasterize" and fitted into the terminal (or into
    the requested cells), and rasterized again whenever the width of the terminal
    changes, where a terminal without inline images gets the Unicode half-block
    text art of the image instead (but no diagram tool at all).  */

import type { Elements, Frozen, ImageSource, MatchedEvent, RenderElement, RenderViewport } from "claude-code"
import { type Engine, type Char, edge, paint } from "./ase-mods-common.ts"

/*  the tool showing an image, as listed for the model  */
export const TOOL = {
    name:        "ase_mods_render_image",
    description: "Render an SVG document or PNG/GIF/JPEG image inline into the terminal of the user, " +
        "fitted into the terminal width, or into at most `columns` x `rows` character cells. ALWAYS use this " +
        "tool whenever an SVG, PNG, JPEG, or GIF file or content should be shown, rendered, rasterized, " +
        "displayed, or viewed for the user, instead of reading or describing it. Pass either its " +
        "path as `file` or its content as `data`. The user will see the image, while you only get " +
        "`OK: ...` or `ERROR: ...` as text. On `OK: ...`, do NOT describe, comment on, or confirm the " +
        "shown image, and if showing it was the entire request, end your turn without any further text.",
    inputSchema: {
        type: "object",
        properties: {
            file:       { type: "string",  description: "path of SVG document or PNG/GIF/JPEG image file, " +
                "relative to the project root or absolute" },
            data:       { type: "string",  description: "SVG document or PNG/GIF/JPEG image, as raw SVG text, " +
                "as \"data:\" URL, or as base64 data" },
            background: { type: "string",  description: "CSS color to fill transparent areas with, " +
                "or \"auto\" (default) to keep transparency; do NOT pass it implicitly, " +
                "only when the user requests it or the default is known to not work" },
            smart:      { type: "boolean", description: "resolve CSS custom properties and color mixings first " +
                "(needed for `ase_diagram` SVG output)" },
            columns:    { type: "number",  description: "maximum width in terminal columns (default: terminal width)" },
            rows:       { type: "number",  description: "maximum height in terminal rows (default: unbounded, " +
                "as the transcript scrolls vertically)" }
        }
    }
}

/*  the tool showing a diagram, as listed for the model  */
export const DIAGRAM = {
    name:        "ase_mods_diagram",
    description: "Render a Mermaid or D2 diagram inline into the terminal of the user as an image, " +
        "fitted into the terminal width, or into at most `columns` x `rows` character cells. Pass the " +
        "diagram specification as `diagram` and its language as `lang` (\"mermaid\" by default, or \"d2\"). " +
        "Do not style any colors, as the diagram uses the theme colors only. " +
        "Prefer a narrow and tall layout, as a wide diagram is downscaled to the terminal width: " +
        "top-to-bottom direction, at most 4 nodes side by side, short labels, and more sibling " +
        "nodes grouped into a Mermaid `subgraph` with `direction LR` resp. a D2 container with " +
        "`grid-columns: 3`. " +
        "The user will see the diagram, while you only get `OK: ...` or `ERROR: ...` as text. On `OK: ...`, " +
        "do NOT reproduce, describe, comment on, or confirm the shown diagram, and if showing it was the " +
        "entire request, end your turn without any further text.",
    inputSchema: {
        type: "object",
        properties: {
            diagram:    { type: "string",  description: "Mermaid or D2 diagram specification" },
            lang:       { type: "string",  enum: [ "mermaid", "d2" ], description: "diagram language: " +
                "\"mermaid\" (default) for Mermaid, \"d2\" for D2" },
            background: { type: "string",  description: "CSS color to fill transparent areas with, " +
                "or \"auto\" (default) to keep transparency; do NOT pass it implicitly, " +
                "only when the user requests it or the default is known to not work" },
            columns:    { type: "number",  description: "maximum width in terminal columns (default: terminal width)" },
            rows:       { type: "number",  description: "maximum height in terminal rows (default: unbounded, " +
                "as the transcript scrolls vertically)" }
        },
        required: [ "diagram" ]
    }
}

/*  the full names of the tools, the columns of the transcript taken by its
    indentation, the rows "ase_rasterize" keeps free below a fitted image, the
    columns and rows taken by the border around an image, the largest cell box
    of an image, the largest pixel width and height of an image (else the
    terminal shows a blank box), the largest PNG of an image (base64, as larger
    ones are rasterized again with fewer pixels, since a file is not shown by
    every terminal), the number of these rasterizings, the number of kept
    images, the viewport assumed before any was measured, the delays of sending
    a drawn image again, and the titles of the border  */
const NAME          = "mcp__ase__ase_mods_render_image"
const NAME_DIAGRAM  = "mcp__ase__ase_mods_diagram"
const MARGIN        = 2
const FREE          = 2
const BORDER        = 2
const CELLS         = 255
const PIXELS        = 2048
const LIMIT         = 2 * 1024 * 1024 * 4 / 3
const ATTEMPTS      = 4
const KEEP          = 16
const VIEWPORT      = { columns: 80, rows: 24 }
const RESEND        = [ 250, 1000 ]
const TITLE         = "[ ⧉ ASE: Inline Image Rendering ]"

/*  the event of drawing the row of a tool call  */
export type ImageRender = Frozen<MatchedEvent<"ui.render", { component: "ToolUse", surface: "terminal" }>>

/*  the event of drawing the result block of a tool call  */
export type ImageResult = Frozen<MatchedEvent<"ui.render", { component: "ToolResult", surface: "terminal" }>>

/*  the input of the tools, as taken over from the call  */
type Input = { file?: string, data?: string, diagram?: string, lang?: string,
    background?: string, smart?: boolean, columns?: number, rows?: number }

/*  take over the input of a call of either tool, with the fields of its tool only  */
const parse = (tool: string, raw: unknown): Input => {
    const { file, data, diagram, lang, smart, ...rest } = (raw ?? {}) as Input
    return tool === NAME_DIAGRAM ? { diagram, lang, ...rest } : { file, data, smart, ...rest }
}

/*  a rasterized image: the viewport width it was rasterized for, and either the
    error of its rasterizing, or its PNG (base64) resp. its text art, its pixel
    size, and its cell box  */
type Shown = { width: number } & ({ error: string } |
    ({ source: ImageSource } | { art: Char[][] }) &
    { pixels: { width: number, height: number }, columns: number, rows: number })

/*  the variables of the terminal environment probed for inline images  */
export type Terminal = { tmux?: string, sty?: string, term?: string, termProgram?: string,
    kitty?: string, ghostty?: string }

/*  check whether the terminal can show inline images, as the session-start hook
    probes for "<ase-diagram-probe/>": only Kitty and Ghostty (with the Unicode
    placeholders of the Kitty Graphics Protocol), directly or through a local
    tmux passing the terminal graphics through, where "query" yields the option
    "allow-passthrough" of tmux and the "XTVERSION" answer and the "TERM" of its
    outer terminal (tab-separated)  */
export const graphics = async (env: Terminal, query: () => Promise<string>): Promise<boolean> => {
    const outer = !!(env.kitty || env.ghostty)
    if (env.tmux) {
        const [ passthrough, termType, termName ] = (await query().catch(() => "")).replace(/\n$/, "").split("\t")
        if (passthrough !== "on" && passthrough !== "all")
            return false
        const known = /^(?:kitty|ghostty)\b/i
        return termType ? known.test(termType) : /^xterm-(?:kitty|ghostty)$/.test(termName ?? "") || outer
    }
    else if (/^tmux\b/.test(env.term ?? "") || (/^screen\b/.test(env.term ?? "") && !env.sty))
        return false
    return outer || /^xterm-(?:kitty|ghostty)$/.test(env.term ?? "")
        || /^(?:kitty|ghostty)$/i.test(env.termProgram ?? "")
}

/*  convert a line of the text art of "ase_rasterize" (half blocks with
    ANSI truecolor escapes) into styled characters  */
const art = (line: string): Char[] => {
    const chars: Char[] = []
    let color: string | undefined
    let background: string | undefined
    const hex = (codes: number[], i: number) =>
        "#" + codes.slice(i + 2, i + 5).map((c) => c.toString(16).padStart(2, "0")).join("")
    for (const m of line.matchAll(/\u001b\[([\d;]*)m|([^\u001b])/gu)) {
        if (m[2] !== undefined) {
            chars.push({ ch: m[2], bold: false, color, ...(background !== undefined ? { background } : {}) })
            continue
        }
        const codes = m[1]!.split(";").map(Number)
        for (let i = 0; i < codes.length; i++) {
            if (codes[i] === 0)
                [ color, background ] = [ undefined, undefined ]
            else if (codes[i] === 39)
                color = undefined
            else if (codes[i] === 49)
                background = undefined
            else if (codes[i] === 38 && codes[i + 1] === 2)
                color = hex(codes, i)
            else if (codes[i] === 48 && codes[i + 1] === 2)
                background = hex(codes, i)
            if (codes[i] === 38 || codes[i] === 48)
                i += 4
        }
    }
    return chars
}

/*  determine the pixel size of a PNG image (base64) from its IHDR chunk
    (decoding just the leading 24 bytes, as no base64 decoder is at hand)  */
const B64  = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
const size = (png: string): { width: number, height: number } => {
    const bytes: number[] = []
    for (let i = 0; i < 32; i += 4) {
        const n = [ 0, 1, 2, 3 ].reduce((acc, k) => acc * 64 + Math.max(0, B64.indexOf(png[i + k] ?? "A")), 0)
        bytes.push((n >> 16) & 0xFF, (n >> 8) & 0xFF, n & 0xFF)
    }
    const u32 = (o: number) => ((bytes[o]! << 24) | (bytes[o + 1]! << 16) | (bytes[o + 2]! << 8) | bytes[o + 3]!) >>> 0
    return { width: u32(16), height: u32(20) }
}

/*  fit an image of the given pixel size into a box of cells, by its columns or
    else by its rows (as "ase_rasterize" does, with cells twice as high as wide)  */
const fit = (width: number, height: number, columns: number, rows: number): { columns: number, rows: number } => {
    const clamp   = (n: number) => Math.max(1, Math.min(CELLS, n))
    const fitRows = Math.ceil(columns * height / width / 2)
    return fitRows <= rows ? { columns: clamp(columns), rows: clamp(fitRows) } :
        { columns: clamp(Math.ceil(rows * width / height * 2)), rows: clamp(rows) }
}

/*  the image rendering: its state and its operations  */
export const modRenderImage = () => {
    /*  the last measured viewport, the rasterized images by their tool call,
        the viewport widths of the evicted images by their tool call (as they
        are not rasterized again for the same width, else the images beyond
        the kept ones would evict each other in an endless loop), the still
        running rasterizings, and the viewport widths the drawn images were
        sent again for  */
    let viewport  = VIEWPORT
    const images  = new Map<string, Shown>()
    const evicted = new Map<string, number>()
    const pending = new Map<string, Promise<Shown>>()
    const resent  = new Map<string, number>()

    /*  track the viewport of a drawing  */
    const track = (measured: RenderViewport | undefined): void => {
        if (measured !== undefined && measured.columns > 0 && measured.rows > 0)
            viewport = { columns: measured.columns, rows: measured.rows }
    }

    /*  rasterize the image of a tool call for the current viewport width (once
        per width, joining a still running rasterizing), fitted into the
        terminal width, with an unbounded height (as the transcript scrolls
        vertically), resp. the requested cells, and keep the latest images only  */
    const load = (id: string, input: Input,
        engine: Pick<Engine, "rasterize" | "diagram" | "bytes" | "graphics">): Promise<Shown> => {
        const width = viewport.columns
        const known = images.get(id)
        if (known !== undefined && known.width === width)
            return Promise.resolve(known)
        const running = pending.get(id)
        if (running !== undefined)
            return running
        const box = {
            columns: Math.max(1, Math.min(input.columns ?? CELLS, width - MARGIN - BORDER, CELLS)),
            rows:    Math.max(1, Math.min(input.rows    ?? CELLS, CELLS))
        }
        const args = Object.fromEntries(Object.entries({
            file: input.file, data: input.data, background: input.background, smart: input.smart,
            scale: "auto", width: box.columns, height: box.rows + FREE, output: "auto"
        }).filter(([ , value ]) => value !== undefined))

        /*  rasterize the image, bounded by a pixel width and height, into a PNG
            image (base64), taking over one passed as a temporary file by
            "ase_rasterize" resp. persisted into a file by the engine, as then
            just referenced by a text block "[PNG: <file>, ...]" resp.
            "[Image: source: <file>, ...]", plus the cell box fitted by
            "ase_rasterize" for the actual pixel size of the terminal cells  */
        type Raster = { png: string, cells?: { columns: number, rows: number } } | { error: string }
        const rasterize = async (source: Record<string, unknown>, maximum: number): Promise<Raster> => {
            const result = await engine.rasterize({ ...args, ...source, maximum })
            const error  = result.content.map((block) => block.text ?? "").join(" ").trim() || "no image rasterized"
            if (result.isError)
                return { error }
            const texts = result.content.filter((block) => block.type === "text").map((block) => block.text ?? "")
            const match = (re: RegExp) => texts.map((text) => re.exec(text)).find((m) => m !== null)
            const image = result.content.find((block) => block.type === "image")?.data
            const file  = match(/^\[PNG: (.+), \d+x\d+\]$/)?.[1] ?? match(/^\[Image: source: (.+?\.png)(?:,|\])/)?.[1]
            const box   = match(/^\[Cells: (\d+)x(\d+)\]$/)
            const cells = box ? { columns: Number(box[1]), rows: Number(box[2]) } : undefined
            const png   = typeof image === "string" ? image : file !== undefined ? await engine.bytes(file) : undefined
            return png === undefined ? { error } : { png, ...(cells !== undefined ? { cells } : {}) }
        }

        /*  render a diagram into an SVG document first (with its CSS custom
            properties resolved by "ase_rasterize"), and rasterize the image again
            with proportionally fewer pixels, as long as its PNG image is too large
            to be passed inline  */
        const promise = (async (): Promise<Shown> => {
            let source: Record<string, unknown> = {}
            if (input.diagram !== undefined) {
                const result = await engine.diagram({ diagram: input.diagram, lang: input.lang ?? "mermaid", format: "svg" })
                const text   = result.content.map((block) => block.text ?? "").join("").trim()
                if (result.isError || !text.startsWith("<"))
                    return { width, error: text || "no diagram rendered" }
                source = { data: text, smart: true }
            }

            /*  rasterize the image into its text art, if the terminal cannot show it  */
            if (!await engine.graphics()) {
                const result = await engine.rasterize({ ...args, ...source, maximum: PIXELS, output: "text" })
                const texts  = result.content.filter((block) => block.type === "text").map((block) => block.text ?? "")
                const pixels = /^\[Text: (\d+)x(\d+)\]$/.exec(texts[1] ?? "")
                const cells  = /^\[Cells: (\d+)x(\d+)\]$/.exec(texts[2] ?? "")
                if (result.isError || pixels === null || cells === null)
                    return { width, error: texts.join(" ").trim() || "no text art rasterized" }
                const lines = texts[0]!.split("\n").slice(0, box.rows).map(art)
                return { width, art: lines, pixels: { width: Number(pixels[1]), height: Number(pixels[2]) },
                    columns: Math.max(1, Math.min(Number(cells[1]), box.columns)), rows: Math.max(1, lines.length) }
            }

            /*  rasterize the image into a PNG image  */
            let maximum = PIXELS
            for (let attempt = 1; ; attempt++) {
                const result = await rasterize(source, maximum)
                if ("error" in result)
                    return { width, error: result.error }
                const pixels = size(result.png)
                const clamp  = (n: number, max: number) => Math.max(1, Math.min(max, n))
                if (result.png.length <= LIMIT)
                    return { width, source: { png: result.png }, pixels, ...(result.cells !== undefined ?
                        { columns: clamp(result.cells.columns, box.columns), rows: clamp(result.cells.rows, box.rows) } :
                        fit(pixels.width, pixels.height, box.columns, box.rows)) }
                if (attempt >= ATTEMPTS)
                    return { width, error: `PNG image of ${pixels.width}x${pixels.height} pixels too large` }
                maximum = Math.floor(Math.max(pixels.width, pixels.height)
                    * Math.sqrt(LIMIT / result.png.length) * 0.9)
            }
        })().catch((err: unknown): Shown =>
            ({ width, error: err instanceof Error ? err.message : String(err) })
        ).then((shown) => {
            pending.delete(id)
            images.delete(id)
            images.set(id, shown)
            evicted.delete(id)
            for (const old of images.keys()) {
                if (images.size <= KEEP)
                    break
                images.delete(old)
                resent.delete(old)
                evicted.set(old, width)
            }
            return shown
        })
        pending.set(id, promise)
        return promise
    }

    /*  serve a call of either tool, rasterizing its image for the drawing of its
        row, and determine the answer of the tool  */
    const call = async (tool: string, id: string, e: unknown,
        engine: Pick<Engine, "rasterize" | "diagram" | "bytes" | "graphics">): Promise<string> => {
        const input = parse(tool, e)
        if (tool === NAME_DIAGRAM && typeof input.diagram !== "string")
            return "ERROR: `diagram` has to be given"
        if (tool !== NAME_DIAGRAM && (input.file === undefined) === (input.data === undefined))
            return "ERROR: either `file` or `data` has to be given"
        const shown = await load(id, input, engine)
        const kind  = tool === NAME_DIAGRAM ? "diagram" : "image"
        return "error" in shown ? `ERROR: ${shown.error}` :
            `OK: ${shown.pixels.width}x${shown.pixels.height} image pixels shown to the user ` +
            `in ${shown.columns}x${shown.rows} terminal cells. The user already sees the ${kind}: ` +
            "do NOT reproduce, describe, comment on, or confirm it, and if showing it was the entire " +
            "request, end your turn without any further text."
    }

    /*  the dimmed notice of an image whose border is not drawn (terminal only)  */
    const notice = (ui: Elements["terminal"], pixels: string, cells: string): RenderElement =>
        ui.Text({ dimColor: true, children: `⧉ ASE: rendering ${pixels} image pixels into ${cells} terminal cells` })

    /*  draw the image, framed by a dimmed rounded border with a title at its top
        left and the image size at its bottom right, below the row of a tool call
        (terminal only), rasterizing it (again) in the background whenever it is
        missing (like after a resumption, but not after its eviction at the
        same width) or the viewport width changed, while showing the latest
        image meanwhile, but only for a resolved call, as before its input can
        still be partial  */
    const render = (e: ImageRender, ui: Elements["terminal"], row: RenderElement,
        engine: Pick<Engine, "rasterize" | "diagram" | "bytes" | "graphics" | "invalidate" | "sleep" | "blit">):
        RenderElement | undefined => {
        if (e.props.tool !== NAME && e.props.tool !== NAME_DIAGRAM)
            return undefined
        track(e.viewport)
        const id       = e.props.tool_use_id
        const input    = parse(e.props.tool, e.props.input)
        const shown    = images.get(id)
        const resolved = e.props.output !== undefined && !e.props.isErrored && !e.props.isInterrupted
        if (shown?.width !== viewport.columns && evicted.get(id) !== viewport.columns && resolved)
            load(id, input, engine).then(() => engine.invalidate()).catch(() => {
                /*  ignore a failed rasterizing, as it is kept as an error  */
            })

        /*  draw the image only for a resolved call, as an image drawn for the
            still running call is redrawn without being transmitted again  */
        if (!resolved || shown === undefined || "error" in shown)
            return undefined

        /*  send the drawn image again shortly after its first drawing at a
            width (while still drawn), as the terminal sporadically misses its
            transmission and then shows a blank box, while a blit always sends  */
        if ("source" in shown && resent.get(id) !== shown.width) {
            resent.set(id, shown.width)
            const requestId = e.requestId
            const resend = async () => {
                for (const ms of RESEND) {
                    await engine.sleep(ms)
                    if (images.get(id) !== shown)
                        break
                    await engine.blit({ requestId, key: "image", source: shown.source,
                        columns: shown.columns, rows: shown.rows })
                }
            }
            resend().catch(() => {
                /*  ignore a failed sending, as the image is drawn already  */
            })
        }
        const rule = "─".repeat(shown.columns)
        const side = () => ui.Text({ dimColor: true, children: Array(shown.rows).fill("│").join("\n") })
        const size = `[ ${shown.pixels.width}x${shown.pixels.height}px, ${shown.columns}x${shown.rows}ch ]`
        return ui.Box({ flexDirection: "column", children: [
            row,
            ui.Box({ flexDirection: "column", marginTop: 1, children: [
                edge(ui.Text, `╭${rule}╮`, TITLE),
                ui.Box({ flexDirection: "row", children: [
                    side(),
                    ui.Box({ width: shown.columns, height: shown.rows, flexShrink: 0, flexDirection: "column",
                        children: "source" in shown ? [
                            ui.Image({ key: "image", source: shown.source, columns: shown.columns, rows: shown.rows,
                                alt: input.file?.replace(/^.*[/\\]/, "") ??
                                    (input.diagram !== undefined ? "diagram" : "image") })
                        ] : shown.art.map((chars) => ui.Text({ wrap: "truncate", children: paint(ui.Text, chars) })) }),
                    side()
                ] }),
                edge(ui.Text, `╰${rule}╯`, "", size)
            ] })
        ] })
    }

    /*  draw the answer of a successful call of the tool as nothing, as the border
        of the shown image carries its size already, or else as a dimmed notice,
        without its instructions for the model (terminal only)  */
    const result = (e: ImageResult, ui: Elements["terminal"]): RenderElement | undefined => {
        if ((e.props.tool !== NAME && e.props.tool !== NAME_DIAGRAM) || e.props.isErrored)
            return undefined
        const shown = images.get(e.props.tool_use_id)
        if (shown !== undefined && !("error" in shown))
            return ui.Box({ children: [] })
        const output = e.props.output as unknown
        const text   = typeof output === "string" ? output :
            Array.isArray(output) ? output.map((block: { text?: unknown }) =>
                typeof block?.text === "string" ? block.text : "").join("") : ""
        const m = /^OK: (\d+x\d+) image pixels shown to the user in (\d+x\d+) terminal cells\./.exec(text)
        if (m === null)
            return undefined
        return notice(ui, m[1]!, m[2]!)
    }

    return { track, call, render, result }
}
