/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import path                      from "node:path"
import fs                        from "node:fs"
import crypto                    from "node:crypto"
import { PassThrough }           from "node:stream"
import { fileURLToPath }         from "node:url"

import type Hapi                 from "@hapi/hapi"
import type { Marked }           from "marked"

import type Log                  from "./ase-lib-log.js"
import { Task }                  from "./ase-task.js"
import { Config }                from "./ase-config-core.js"
import { configSchema, webColorDefaults, webColorNames } from "./ase-config-schema.js"
import { buildBoard, watchTasks, toneOf, laneMoves, cardMoves, BoardState, attachmentTabs, isDraftDiff, diffTones, newTaskText, createTask, saveTask, TaskConflict } from "./ase-task-board-core.js"
import { layoutGraph, drawGraphSVG } from "./ase-task-board-graph.js"
import { filterBoard, dropStandalone } from "./ase-task-board-filter.js"
import type { Board, StoreState } from "./ase-task-board-core.js"
import * as TaskFormat           from "./ase-task-format.js"
import pkg                       from "../package.json" with { type: "json" }

/*  the build stamp of the loaded code (version and content hash of the board modules
    and page assets), reported by the ping route to let the CLI detect a stale running service
    (content, not mtime, as rebuilds rewrite unchanged modules, e.g. under "build-watch")  */
export const BOARD_BUILD = (() => {
    const dir  = path.dirname(fileURLToPath(import.meta.url))
    const hash = crypto.createHash("sha1")
    for (const f of [ "core.js", "filter.js", "graph.js", "web-server.js", "web-client.html", "web-client.css", "web-client.js" ])
        hash.update(fs.readFileSync(path.join(dir, `ase-task-board-${f}`)))
    return `${pkg.version}:${hash.digest("hex")}`
})()

/*  the static assets of the browser client of the web board: its HTML page,
    its stylesheet, and its code (all built by Vite out of the Vue client),
    installed next to this module and loaded once on first use  */
const clientAssets = new Map<string, string>()
const clientAsset = (ext: "html" | "css" | "js"): string => {
    let asset = clientAssets.get(ext)
    if (asset === undefined) {
        const dir = path.dirname(fileURLToPath(import.meta.url))
        asset = fs.readFileSync(path.join(dir, `ase-task-board-web-client.${ext}`), "utf8")
        clientAssets.set(ext, asset)
    }
    return asset
}

/*  escape a text for embedding into HTML  */
const escapeHTML = (s: string): string =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

/*  the pattern of the image sources: always local ones, and with remote images also HTTPS ones  */
const imageSource = (remote: boolean): RegExp =>
    remote ? /^(https:|data:image\/|\.{1,2}\/|\/(?![/\\]))/ : /^(data:image\/|\.{1,2}\/|\/(?![/\\]))/

/*  escape raw HTML, except (with remote images) its "<img>" tags, which are
    re-assembled out of their harmless attributes only (as e.g. used by GitHub
    for the images of issue comments)  */
const rawHTML = (text: string, remote: boolean): string => {
    if (!remote)
        return escapeHTML(text)
    return text.split(/(<img\b[^>]*>)/i).map((part, i) => {
        if (i % 2 === 0)
            return escapeHTML(part)
        const attrs = new Map<string, string>()
        for (const m of part.matchAll(/([a-z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi))
            attrs.set(m[1].toLowerCase(), m[2] ?? m[3] ?? m[4])
        const src = attrs.get("src") ?? ""
        if (!imageSource(remote).test(src))
            return escapeHTML(attrs.get("alt") ?? "")
        return `<img src="${escapeHTML(src)}"` + [ "alt", "title", "width", "height" ]
            .filter((key) => attrs.has(key) && (!/^(width|height)$/.test(key) || /^\d+%?$/.test(attrs.get(key)!)))
            .map((key) => ` ${key}="${escapeHTML(attrs.get(key)!)}"`).join("") + ">"
    }).join("")
}

/*  the Markdown renderers for task plans: raw HTML is escaped instead of
    passed through, links are restricted to harmless schemes, images to
    local sources (with remote images also to HTTPS sources, including raw
    "<img>" tags), and Mermaid code blocks are rendered as diagrams
    ("marked" and "beautiful-mermaid" are loaded on first use only)  */
const marked = new Map<boolean, Promise<Marked>>()
const markedLoad = async (remote: boolean): Promise<Marked> => {
    const [ { Marked }, { renderMermaidSVG } ] = await Promise.all([
        import("marked"), import("beautiful-mermaid")
    ])
    return new Marked({
        gfm: true,
        renderer: {
            html ({ text }) {
                return rawHTML(text, remote)
            },
            link ({ href, tokens }) {
                const label = this.parser.parseInline(tokens)
                return /^(https?:|mailto:|#|\.{1,2}\/|\/(?![/\\]))/.test(href) ?
                    `<a href="${escapeHTML(href)}" target="_blank" rel="noopener">${label}</a>` : label
            },
            image ({ href, title, text }) {
                return imageSource(remote).test(href) ?
                    `<img src="${escapeHTML(href)}" alt="${escapeHTML(text)}"` +
                    (title ? ` title="${escapeHTML(title)}"` : "") + ">" : escapeHTML(text)
            },
            code ({ text, lang }) {
                if (lang === "mermaid") {
                    try {
                        return `<div class="diagram">${renderMermaidSVG(text)}</div>`
                    }
                    catch {
                        /*  fall through to the plain rendering of the source  */
                    }
                }
                return `<pre class="textart"><code>${escapeHTML(text)}</code></pre>`
            }
        }
    })
}

/*  render the Markdown body of a task plan (optionally with remote images), including
    its title, and render its checkboxes (all line rewrites skip the content of fenced code blocks), where
    the checkbox placeholders carry the box state name instead of the
    box character, as Markdown rendering would escape e.g. ">"  */
const boxes: Record<string, string> = { "x": "done", "/": "part", "?": "open", "-": "cancel", ">": "defer", " ": "todo" }
const boxChars = Object.fromEntries(Object.entries(boxes).map(([ char, state ]) => [ state, char ]))
const renderPlan = async (body: string, remote = false): Promise<string> => {
    let fence = ""
    const prepared = body.split(/\r?\n/).map((line) => {
        const outside = fence === ""
        fence = TaskFormat.fenceTrack(fence, line)
        return !outside || fence !== "" ? line : line
            .replace(/^(\s*(?:[-*]|\d+[.)])\s+)\[([ x/?\->])\]/, (_m, lead: string, box: string) => `${lead}⟦box:${boxes[box]}⟧`)
    }).join("\n")
    if (!marked.has(remote))
        marked.set(remote, markedLoad(remote))
    const html = (await marked.get(remote)!).parse(prepared, { async: false })
    return html.replace(/⟦box:([a-z]+)⟧/g, (_m, state: string) =>
        `<span class="box ${state}" title="[${escapeHTML(boxChars[state] ?? " ")}]"></span>`)
}

/*  the color roles of the web board, with their base colors resolved from the
    "board.web.color.<role>" configuration (on each page load): "default" is the
    default base color of the role, a color name maps onto its base color  */
type ColorRole  = Extract<keyof typeof webColorDefaults, string>
type ColorBases = Record<ColorRole, string>
const colorRoles = Object.keys(webColorDefaults) as ColorRole[]
const colorBases = (log: Log): ColorBases => {
    const cfg = new Config("config", configSchema, log)
    cfg.read()
    const bases = {} as ColorBases
    for (const role of colorRoles) {
        const value = cfg.get(`board.web.color.${role}`)
        const color = typeof value !== "string" || value === "default" ?
            webColorDefaults[role] : (webColorNames[value] ?? value)
        bases[role] = color.replace(/^#(.)(.)(.)$/, "#$1$1$2$2$3$3").toLowerCase()
    }
    return bases
}

/*  expand each base color (via MRCS) into a spread of 64 colors over the entire
    lightness range (1: black, 64: white), rendered into the ":root" CSS variables
    "--color-<role>-{1..64}", onto which the page stylesheet maps its semantic colors  */
const colorSheet = async (bases: ColorBases): Promise<string> => {
    const { parse, generate } = await import("@rse/mrcs")
    return ":root {\n" + colorRoles.map((role) =>
        generate(parse(`${bases[role]}+0-0/64`)).map((color, i) =>
            `    --color-${role}-${i + 1}: ${color};\n`).join("")).join("") + "}\n"
}

/*  the key bindings of the task plan editor, resolved from the
    "board.web.editor.keymap" configuration (on each start of editing)  */
const editorKeymap = (log: Log): "default" | "vim" | "emacs" => {
    const cfg = new Config("config", configSchema, log)
    cfg.read()
    const value = cfg.get("board.web.editor.keymap")
    return value === "vim" || value === "emacs" ? value : "default"
}

/*  render a standalone document (styled by the client stylesheet) out of
    key/value fields, separated by a line from the content  */
const fieldsDocument = (fields: [ string, string ][], content: string): string => {
    const rows = fields.map(([ k, v ]) => `<tr><td class="k">${escapeHTML(k)}</td><td>${escapeHTML(v)}</td></tr>`).join("")
    return "<!DOCTYPE html><html><head><meta charset=\"utf-8\">" +
        "<link rel=\"stylesheet\" href=\"/task-board/colors.css\">" +
        "<link rel=\"stylesheet\" href=\"/task-board/ase-task-board-web-client.css\"></head><body class=\"plan\"><article>" +
        (rows !== "" ? `<table class="fields">${rows}</table><hr class="fields">` : "") + content +
        "</article></body></html>"
}

/*  render a task plan as a standalone document: frontmatter fields and the numbered plan sections  */
const taskDocument = async (keys: Map<string, string>, body: string): Promise<string> =>
    fieldsDocument([ ...keys ].filter(([ k ]) => k !== "Type"), await renderPlan(body))

/*  render a task plan attachment as a standalone document: its fields and
    its content, with images embedded, Markdown rendered, a draft diff
    colored per line, binary content as a placeholder, and else verbatim text  */
const attachmentDocument = async (log: Log, id: string, n: number): Promise<string | null> => {
    const att = (await Task.attachments(log, id))[n]
    if (att === undefined)
        return null
    const fields = ([
        [ "Type", att.type ], [ "Desc", att.desc ], [ "Created", att.created ?? "" ], [ "Modified", att.modified ?? "" ]
    ] as [ string, string ][]).filter(([ , v ]) => v !== "")
    const url  = `/task-board/api/task/${encodeURIComponent(id)}/attachment/${n}`
    const type = att.type.split(";")[0].trim().toLowerCase()
    if (type.startsWith("image/") && type !== "image/svg+xml")
        return fieldsDocument(fields, `<div class="embedding"><img src="${url}" alt="${escapeHTML(att.desc || att.type)}"></div>`)
    let text = att.data
    if (text === undefined) {
        const a = await Task.attachmentContent(log, id, n)
        if (a === null)
            return fieldsDocument(fields, "<p class=\"warn\">no such attachment content</p>")
        try {
            text = new TextDecoder("utf-8", { fatal: true }).decode(a.content)
        }
        catch (_err: unknown) {
            text = "\0"
        }
        if (text.includes("\0"))
            return fieldsDocument(fields, `<p class="mute">(binary content: ${escapeHTML(att.type)}, ${a.content.length} bytes, ` +
                `<a href="${url}" target="_blank" rel="noopener">download</a>)</p>`)
    }
    if (type === "text/markdown")
        return fieldsDocument(fields, await renderPlan(text, true))
    if (isDraftDiff(att.type)) {
        const lines = text.split(/\r?\n/)
        const tones = diffTones(lines)
        return fieldsDocument(fields, "<pre class=\"textart diff\"><code>" +
            lines.map((line, i) => `<span class="${tones[i]}">${escapeHTML(line)}</span>`).join("\n") + "</code></pre>")
    }
    return fieldsDocument(fields, `<pre class="textart"><code>${escapeHTML(text)}</code></pre>`)
}

/*  serialize the board for the browser  */
const boardJSON = (board: Board, lifecycle: TaskFormat.TaskLifecycle) => ({
    mode:     board.mode,
    project:  Task.projectIdOf(Task.projectRoot()),
    version:  pkg.version,
    warnings: board.warnings,
    surface:  BoardState.load().web,
    moves:    laneMoves(board, lifecycle),
    groups:   board.groups.map((g) => ({
        title: g.title,
        lanes: g.lanes.map((l) => ({
            status: l.status, active: l.active, weight: l.weight, dashed: l.dashed, kind: l.kind,
            cards:  (board.lanes.get(l.status) ?? []).map((c) => ({ id: c.id, title: c.title, group: c.group, cyclic: board.cyclic.has(c.id), tone: toneOf(board, c), moves: cardMoves(board, lifecycle, c) }))
        }))
    }))
})

/*  the connected event stream clients (with the optional response compressor
    of hapi, which has to be flushed after each event) and the shared change watcher  */
type Client = { stream: PassThrough, compressor: { flush: () => void } | null }
const clients = new Set<Client>()
let stopWatch: (() => Promise<void>) | null = null

/*  the kind and connection state of the task store, as reported by the change watcher  */
let storeState: StoreState | null = null

/*  the memoized board, valid only while the change watcher runs  */
let cached: Promise<Board> | null = null

/*  build the board at most once per task store change, sharing
    the build between concurrent requests  */
const currentBoard = (log: Log): Promise<Board> => {
    if (cached === null || stopWatch === null) {
        const build = buildBoard(log)
        build.catch(() => {
            if (cached === build)
                cached = null
        })
        cached = build
    }
    return cached
}

/*  send an event to all event stream clients  */
const emit = (event: string, data: unknown): void => {
    for (const c of clients) {
        c.stream.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        c.compressor?.flush()
    }
}

/*  drop the memoized board and broadcast a change notification to all event stream clients  */
const broadcast = (): void => {
    cached = null
    emit("change", {})
}

/*  wrap a route handler to report its failures as HTTP 500 error responses  */
type Handler = (request: Hapi.Request, h: Hapi.ResponseToolkit) => Hapi.Lifecycle.ReturnValue
const guarded = (handler: Handler): Handler =>
    async (request, h) => {
        try {
            return await handler(request, h)
        }
        catch (err: unknown) {
            return h.response({ error: err instanceof Error ? err.message : String(err) }).code(500)
        }
    }

/*  register the page routes of the web board: its client assets and its colors  */
const registerPageRoutes = (server: Hapi.Server, log: Log): void => {
    /*  the single page of the web board, with its stylesheet and browser-side code  */
    server.route({
        method:  "GET",
        path:    "/task-board",
        handler: (_request, h) => h.response(clientAsset("html")).type("text/html; charset=utf-8")
    })
    server.route({
        method:  "GET",
        path:    "/task-board/ase-task-board-web-client.css",
        handler: (_request, h) => h.response(clientAsset("css")).type("text/css; charset=utf-8")
            .etag(BOARD_BUILD).header("Cache-Control", "no-cache")
    })
    server.route({
        method:  "GET",
        path:    "/task-board/ase-task-board-web-client.js",
        handler: (_request, h) => h.response(clientAsset("js")).type("text/javascript; charset=utf-8")
            .etag(BOARD_BUILD).header("Cache-Control", "no-cache")
    })

    /*  the color spreads of the page (layer 1), onto which its stylesheet
        maps its semantic colors (layer 2), resolved on each page load  */
    server.route({
        method:  "GET",
        path:    "/task-board/colors.css",
        handler: async (_request, h) => h.response(await colorSheet(colorBases(log)))
            .type("text/css; charset=utf-8").header("Cache-Control", "no-cache")
    })
}

/*  the filter query of a request (its optional "filter" query parameter)  */
const filterQuery = (request: Hapi.Request): string =>
    typeof request.query.filter === "string" ? request.query.filter : ""

/*  register the view routes of the web board: the board, the graph, and the tasks with their attachments  */
const registerViewRoutes = (server: Hapi.Server, log: Log): void => {
    /*  the board model, reduced onto the tasks matching the filter query  */
    server.route({
        method:  "GET",
        path:    "/task-board/api/board",
        handler: guarded(async (request, h) =>
            h.response(boardJSON(filterBoard(await currentBoard(log), filterQuery(request)), await Task.lifecycle(log))))
    })

    /*  the dependency graph as SVG, reduced onto the tasks matching the
        filter query plus their direct predecessors and successors
        (and optionally without the standalone tasks)  */
    server.route({
        method:  "GET",
        path:    "/task-board/api/graph",
        handler: guarded(async (request, h) => {
            const state  = BoardState.load().web
            const found  = filterBoard(await currentBoard(log), filterQuery(request), true)
            const board  = state.standalone ? found : dropStandalone(found)
            const svg    = board.cards.size === 0 ? "" : drawGraphSVG(board, await layoutGraph(board, "px", state.titles))
            return h.response({ svg })
        })
    })

    /*  one task plan, rendered in the appearance of SpecBook  */
    server.route({
        method:  "GET",
        path:    "/task-board/api/task/{id}",
        handler: guarded(async (request, h) => {
            const id    = String(request.params.id)
            const board = await currentBoard(log)
            const card  = board.cards.get(id)
            const parts = card !== undefined ? await Task.parts(log, id) : null
            if (card === undefined || parts === null)
                return h.response({ error: `no task "${id}"` }).code(404)
            const tone = (x: string) => {
                const c = board.cards.get(x)
                return c !== undefined ? toneOf(board, c) : "idle"
            }
            const ref = (ids: string[]) => ids.map((x) => ({ id: x, tone: tone(x) }))
            return h.response({
                id,
                title:  card.title,
                tone:   toneOf(board, card),
                status: card.status,
                group:  board.groups.find((g) => g.lanes.some((l) => l.status === card.status))?.title ?? "",
                epic:   card.group,
                doc:    await taskDocument(parts.keys, parts.body),
                tabs:   attachmentTabs(await Task.attachments(log, id)),
                pred:   ref(board.pred.get(id) ?? []),
                succ:   ref(board.succ.get(id) ?? [])
            })
        })
    })

    /*  one task plan as text for editing, with the entity tag it is based on and the editor key bindings  */
    server.route({
        method:  "GET",
        path:    "/task-board/api/task/{id}/source",
        handler: guarded(async (request, h) => {
            const id = String(request.params.id)
            if (!TaskFormat.TASK_ID_RE.test(id))
                return h.response({ error: `invalid task id "${id}"` }).code(400)
            const src = await Task.source(log, id)
            if (src === null)
                return h.response({ error: `no task "${id}"` }).code(404)
            return h.response({ text: src.text, base: src.tag, keymap: editorKeymap(log) })
        })
    })

    /*  the pre-filled text of a new task, with the editor key bindings  */
    server.route({
        method:  "GET",
        path:    "/task-board/api/new",
        handler: guarded(async (_request, h) =>
            h.response({
                text:   await newTaskText(log, await currentBoard(log), await Task.lifecycle(log)),
                keymap: editorKeymap(log)
            }))
    })

    /*  one attachment of a task plan, rendered as a document for its tab of the task dialog  */
    server.route({
        method:  "GET",
        path:    "/task-board/api/task/{id}/attachment/{n}/doc",
        handler: guarded(async (request, h) => {
            const id = String(request.params.id)
            const n  = String(request.params.n)
            if (!TaskFormat.TASK_ID_RE.test(id))
                return h.response({ error: `invalid task id "${id}"` }).code(400)
            const doc = /^\d+$/.test(n) ? await attachmentDocument(log, id, Number(n)) : null
            if (doc === null)
                return h.response({ error: "no such attachment" }).code(404)
            return h.response({ doc })
        })
    })

    /*  one attachment of a task plan, fetched through the task interface  */
    server.route({
        method:  "GET",
        path:    "/task-board/api/task/{id}/attachment/{n}",
        handler: guarded(async (request, h) => {
            const id = String(request.params.id)
            const n  = String(request.params.n)
            if (!TaskFormat.TASK_ID_RE.test(id))
                return h.response({ error: `invalid task id "${id}"` }).code(400)
            const a = /^\d+$/.test(n) ? await Task.attachmentContent(log, id, Number(n)) : null
            if (a === null)
                return h.response({ error: "no such attachment" }).code(404)
            const type = a.type.split(";")[0].trim().toLowerCase()
            const res  = h.response(a.content).type(type)
                .header("Content-Security-Policy", "sandbox")
                .header("X-Content-Type-Options", "nosniff")

            /*  never render non-image attachments on the service address  */
            if (!type.startsWith("image/") || type === "image/svg+xml")
                res.header("Content-Disposition", `attachment; filename="attachment-${n}"`)
            return res
        })
    })
}

/*  register the update routes of the web board: task moves, saves, creations, and deletions  */
const registerUpdateRoutes = (server: Hapi.Server, log: Log): void => {
    /*  move a task to another lane by changing its status (the change
        watcher then pushes the changed board to all open web boards)  */
    server.route({
        method:  "POST",
        path:    "/task-board/api/move",
        options: { payload: { parse: true, allow: "application/json" } },
        handler: guarded(async (request, h) => {
            const p = request.payload as { id?: unknown, status?: unknown } | null
            if (p === null || typeof p.id !== "string" || typeof p.status !== "string")
                return h.response({ error: "invalid move request" }).code(400)
            const board = await currentBoard(log)
            const card  = board.cards.get(p.id)
            if (card === undefined)
                return h.response({ error: `no task "${p.id}"` }).code(404)

            /*  accept only moves to states reachable in the lifecycle model  */
            const lifecycle = await Task.lifecycle(log)
            const reason    = TaskFormat.checkStatus(lifecycle, card.actual, p.status)
            if (reason !== "")
                return h.response({ error: `task "${p.id}": ${reason}` }).code(400)
            return h.response(await Task.setStatus(log, p.id, p.status))
        })
    })

    /*  save an edited task plan, but only if it was not changed in the meantime
        (answering 409 with the current entity tag, or null if deleted meanwhile),
        and answering 400 if the text is invalid or its status is not reachable;
        a changed "Id:" key renames the task, answered with the resulting id  */
    server.route({
        method:  "POST",
        path:    "/task-board/api/task/{id}/source",
        options: { payload: { parse: true, allow: "application/json" } },
        handler: guarded(async (request, h) => {
            const id = String(request.params.id)
            const p  = request.payload as { text?: unknown, base?: unknown } | null
            if (p === null || typeof p.text !== "string" || typeof p.base !== "string")
                return h.response({ error: "invalid save request" }).code(400)
            let next: { id: string, warning: string }
            try {
                next = await saveTask(log, id, p.text, p.base)
            }
            catch (err: unknown) {
                if (err instanceof TaskConflict)
                    return h.response({ error: err.message, base: err.tag }).code(409)
                return h.response({ error: err instanceof Error ? err.message : String(err) }).code(400)
            }
            if (next.warning !== "")
                log.write("warning", `board: ${next.warning}`)
            return h.response({ ok: true, id: next.id })
        })
    })

    /*  create a new task plan, but only if no task of its id exists yet
        (answering 409), and answering 400 if the text or id is invalid  */
    server.route({
        method:  "PUT",
        path:    "/task-board/api/task/{id}/source",
        options: { payload: { parse: true, allow: "application/json" } },
        handler: guarded(async (request, h) => {
            const id = String(request.params.id)
            const p  = request.payload as { text?: unknown } | null
            if (p === null || typeof p.text !== "string")
                return h.response({ error: "invalid create request" }).code(400)
            if (TaskFormat.TASK_ID_RE.test(id) && await Task.source(log, id) !== null)
                return h.response({ error: `task "${id}" already exists` }).code(409)
            let warning: string
            try {
                warning = await createTask(log, id, p.text)
            }
            catch (err: unknown) {
                return h.response({ error: err instanceof Error ? err.message : String(err) }).code(400)
            }
            if (warning !== "")
                log.write("warning", `board: ${warning}`)
            return h.response({ ok: true })
        })
    })

    /*  delete a task plan (answering 404 if it does not exist)  */
    server.route({
        method:  "DELETE",
        path:    "/task-board/api/task/{id}",
        handler: guarded(async (request, h) => {
            const id = String(request.params.id)
            if (!TaskFormat.TASK_ID_RE.test(id))
                return h.response({ error: `invalid task id "${id}"` }).code(400)
            if (!await Task.delete(log, id))
                return h.response({ error: `no task "${id}"` }).code(404)
            return h.response({ ok: true })
        })
    })
}

/*  register the surface routes of the web board: view changes, surface toggles, keep-alive, and change events  */
const registerSurfaceRoutes = (server: Hapi.Server, log: Log): void => {
    /*  set the shown view (lanes or graph) of the web surface, as the view of newly opened web boards  */
    server.route({
        method:  "POST",
        path:    "/task-board/api/view",
        options: { payload: { parse: true, allow: "application/json" } },
        handler: guarded(async (request, h) => {
            const p = request.payload as { view?: unknown } | null
            if (p === null || (p.view !== "lanes" && p.view !== "graph"))
                return h.response({ error: "invalid view request" }).code(400)
            return h.response((await BoardState.setView("web", p.view)).web)
        })
    })

    /*  toggle a minimized lane, a collapsed group, or the showing of task titles,
        key hints, or standalone tasks of the web surface  */
    server.route({
        method:  "POST",
        path:    "/task-board/api/toggle",
        options: { payload: { parse: true, allow: "application/json" } },
        handler: guarded(async (request, h) => {
            const p = request.payload as { list?: unknown, entry?: unknown } | null
            if (p !== null && (p.list === "titles" || p.list === "keys" || p.list === "standalone")) {
                const surface = (await BoardState.toggleFlag("web", p.list)).web
                emit("surface", surface)
                return h.response(surface)
            }
            if (p === null || (p.list !== "minimized" && p.list !== "collapsed") || typeof p.entry !== "string")
                return h.response({ error: "invalid toggle request" }).code(400)

            /*  accept only lanes or groups of the current board layout  */
            const board = await currentBoard(log)
            const names = p.list === "minimized" ?
                board.groups.flatMap((g) => g.lanes.map((l) => l.status)) :
                board.groups.map((g) => g.title)
            if (!names.includes(p.entry))
                return h.response({ error: `unknown ${p.list === "minimized" ? "lane" : "group"} "${p.entry}"` }).code(400)
            const surface = (await BoardState.toggle("web", p.list, p.entry)).web

            /*  push the shared surface state into all open web boards  */
            emit("surface", surface)
            return h.response(surface)
        })
    })

    /*  keep-alive of the service while a board page is open  */
    server.route({
        method:  "GET",
        path:    "/task-board/api/ping",
        handler: (_request, h) => h.response({ ok: true, build: BOARD_BUILD })
    })

    /*  the change event stream: the watcher (which also notices changes
        of the lifecycle mode) runs only while at least one client is connected,
        and every client gets the task store state on connect and on each change  */
    server.route({
        method:  "GET",
        path:    "/task-board/events",
        handler: (request, h) => {
            const stream = new PassThrough()
            const client: Client = { stream, compressor: null }

            /*  hapi hands a (gzip/deflate) compressor to streams providing this hook, which
                has to be flushed once attached, as it would else hold back the initial
                writes (and hence the opening of the stream) until the first change event  */
            Object.assign(stream, {
                setCompressor: (c: { flush: () => void }) => {
                    client.compressor = c
                    setImmediate(() => { c.flush() })
                }
            })
            clients.add(client)
            if (stopWatch === null) {
                cached    = null
                stopWatch = watchTasks(log, broadcast, (state) => {
                    storeState = state
                    emit("store", state)
                })
            }
            else if (storeState !== null)
                stream.write(`event: store\ndata: ${JSON.stringify(storeState)}\n\n`)
            request.raw.res.on("close", () => {
                clients.delete(client)
                stream.end()
                if (clients.size === 0 && stopWatch !== null) {
                    stopWatch().catch((err: unknown) => {
                        log.write("warning", `board: stopping watcher failed: ${err instanceof Error ? err.message : String(err)}`)
                    })
                    stopWatch  = null
                    storeState = null
                }
            })
            stream.write(": connected\n\n")
            return h.response(stream)
                .type("text/event-stream")
                .header("Cache-Control", "no-cache")
                .header("X-Accel-Buffering", "no")
        }
    })
}

/*  register the board routes on the ASE service of the project  */
export const registerBoardRoutes = (server: Hapi.Server, log: Log): void => {
    registerPageRoutes(server, log)
    registerViewRoutes(server, log)
    registerUpdateRoutes(server, log)
    registerSurfaceRoutes(server, log)
}

