/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import path                     from "node:path"
import fs                       from "node:fs"
import os                       from "node:os"
import { Worker }               from "node:worker_threads"

import { Command }              from "commander"
import { isScalar }             from "yaml"
import { z }                    from "zod"
import sourceCodeError          from "source-code-error"
import type { McpServer }       from "@modelcontextprotocol/sdk/server/mcp.js"
import { renderDiagnostic }     from "@rse/specbook/dst/specbook-diagnostic.js"
import { renderVerbose }        from "@rse/specbook/dst/specbook-verbose.js"
import type { SpecBook, Diagnostic, ExportFormat, VerboseLevel } from "@rse/specbook"

import type Log                 from "./ase-lib-log.js"
import type { LogLevel }        from "./ase-lib-log.js"
import { Config }               from "./ase-config-core.js"
import { configSchema }         from "./ase-config-schema.js"
import { Task }                 from "./ase-task.js"
import { Artifact }             from "./ase-artifact.js"
import { writeStdout }          from "./ase-lib-stdio.js"

/*  a job of the SpecBook worker thread (see "Spec.isolated") and its replies  */
export type SpecJob =
    { op: "lint",   markdown: boolean } |
    { op: "export", formats:  ExportFormat[] }
export type SpecReply =
    { type: "log",    level: LogLevel, msg: string } |
    { type: "lint",   diagnostics: Diagnostic[] } |
    { type: "export", buffers: Uint8Array[], notices: string[] } |
    { type: "error",  message: string }

/*  reusable functionality: initialize, lint, export, and preview the
    SpecBook-based project specification, located via the
    "project.artifact.spec.basedir" and "project.artifact.spec.schema"
    configuration  */
export class Spec {
    /*  the SpecBook export formats, mirrored here (and checked for completeness
        against SpecBook at compile-time) to not load SpecBook for the MCP schema  */
    static readonly formats = Object.keys({
        json: true, json5: true, yaml: true, toon: true, html: true, pdf: true, md: true
    } satisfies Record<ExportFormat, true>) as [ ExportFormat, ...ExportFormat[] ]

    /*  resolve the YAML schema configuration files: the whitespace-separated
        entries of the configured "project.artifact.spec.schema", merged in
        the given order, where each entry is either the literal "std" for the
        full SpecBook standard schema (not the agent-compressed plugin meta file
        "ase-format-specbook.yaml") or a file path relative to the project
        root, and an unset or empty value means "std"  */
    static configFiles (log: Log): string[] {
        const cfg = new Config("config", configSchema, log)
        cfg.read()
        const val     = cfg.get("project.artifact.spec.schema")
        const list    = val === undefined ? "" : String(isScalar(val) ? val.value : val)
        const entries = list.split(/\s+/).filter((entry) => entry !== "")
        if (entries.length === 0)
            entries.push("std")
        return entries.map((entry) => entry === "std" ?
            "std" :
            path.resolve(Task.projectRoot(), entry))
    }

    /*  the ASE log level each SpecBook verbosity level maps onto: the
        "none" level carries the messages a bare SpecBook CLI run always
        prints -- the environment notices plus the lifecycle and failure
        reports of the long-running "watch" and "preview" loops, whose
        loss would leave a broken observation entirely unreported -- and
        reaches the info log like the regular and detailed processing
        messages, while the tracing ones reach the debug log  */
    private static logLevel: Record<VerboseLevel, LogLevel> = {
        none:   "info",
        notice: "info",
        detail: "info",
        trace:  "debug"
    }

    /*  create the SpecBook API instance, routing its verbose processing
        messages into the log according to their verbosity level, while
        its "none" level messages, for consumers which never see the log,
        additionally reach the given collector
        (SpecBook itself is loaded on first use only)  */
    private static async api (log: Log, notices?: string[]): Promise<SpecBook> {
        const { SpecBook } = await import("@rse/specbook")
        return new SpecBook({
            verbose: (cmd, msg, level) => {
                const text = renderVerbose(msg)
                if (level === "none")
                    notices?.push(text)
                log.write(Spec.logLevel[level], `specbook: ${cmd}: ${text}`)
            }
        })
    }

    /*  SpecBook marks the literal values inside its messages, but only
        its verbose messages ever reach a renderer, so strip the markers
        off the error messages here at the API boundary -- unstyled, as
        they travel on into the log and the MCP tool results  */
    private static async unmarked <T> (result: Promise<T>): Promise<T> {
        try {
            return await result
        }
        catch (err: unknown) {
            if (err instanceof Error)
                err.message = renderVerbose(err.message)
            throw err
        }
    }

    /*  render a diagnostic file path relative to the project root,
        keeping paths outside the project (like the bundled schema) as-is  */
    private static relativize (file: string): string {
        const rel = path.relative(Task.projectRoot(), file)
        if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel))
            return file
        return rel.replace(/\\/g, "/")
    }

    /*  every reading specification command honors the Git exclude rules, so that
        SpecBook resolves the very same artifact files as "ase artifact
        list --kind spec": both consult ".gitignore", so a specification
        the project does not track is invisible to both instead of only
        to one of them  */
    private static readonly gitignore = true

    /*  initialize the absent artifact files of the schema configuration below
        the "spec" artifact base directory, letting SpecBook persist its project
        options file ".specbook.yaml" into a throw-away working directory, as
        ASE keeps these options in its own configuration  */
    static async init (log: Log): Promise<string[]> {
        const basedir = Artifact.basedir(log, "spec")
        const cwd     = await fs.promises.mkdtemp(path.join(os.tmpdir(), "ase-spec-"))
        try {
            const result = await Spec.unmarked(Spec.api(log).then((api) => api.init({
                config: Spec.configFiles(log),
                basedir,
                cwd
            })))
            return result.files.map((file) => Spec.relativize(path.join(basedir, file)))
        }
        finally {
            await fs.promises.rm(cwd, { recursive: true, force: true })
        }
    }

    /*  lint the specification Markdown files below the "spec" artifact
        base directory against the schema configuration, optionally
        followed by the generic Markdown linting  */
    static async lint (log: Log, markdown = false): Promise<Diagnostic[]> {
        const result = await Spec.unmarked(Spec.api(log).then((api) => api.lint({
            config:    Spec.configFiles(log),
            basedir:   Artifact.basedir(log, "spec"),
            gitignore: Spec.gitignore
        })))
        const diagnostics = result.diagnostics.map((d) => ({ ...d, file: Spec.relativize(d.file) }))
        return markdown ? diagnostics.concat(await Spec.markdownlint(log)) : diagnostics
    }

    /*  run a job like "lint" or "export", but in a worker thread, as the
        SpecBook processing is CPU-bound for seconds and would otherwise
        block the event loop of the service for all parallel requests  */
    private static isolated (log: Log, job: SpecJob): Promise<SpecReply> {
        return new Promise((resolve, reject) => {
            const worker = new Worker(new URL("./ase-spec-worker.js", import.meta.url), { workerData: job })
            let settled = false
            const settle = (fn: () => void) => {
                if (settled)
                    return
                settled = true
                fn()
                worker.terminate().catch(() => {})
            }
            worker.on("message", (reply: SpecReply) => {
                if (reply.type === "log")
                    log.write(reply.level, reply.msg)
                else if (reply.type === "error")
                    settle(() => { reject(new Error(reply.message)) })
                else
                    settle(() => { resolve(reply) })
            })
            worker.on("error", (err) => { settle(() => { reject(err) }) })
            worker.on("exit",  (code) => { settle(() => { reject(new Error(`SpecBook worker exited with code ${code}`)) }) })
        })
    }

    /*  lint like "lint", but in a worker thread  */
    static async lintIsolated (log: Log, markdown: boolean): Promise<Diagnostic[]> {
        const reply = await Spec.isolated(log, { op: "lint", markdown })
        if (reply.type !== "lint")
            throw new Error(`SpecBook worker: unexpected "${reply.type}" reply`)
        return reply.diagnostics
    }

    /*  export like "export", but in a worker thread  */
    static async exportIsolated (log: Log, formats: ExportFormat[], notices: string[]): Promise<Buffer[]> {
        const reply = await Spec.isolated(log, { op: "export", formats })
        if (reply.type !== "export")
            throw new Error(`SpecBook worker: unexpected "${reply.type}" reply`)
        notices.push(...reply.notices)
        return reply.buffers.map((data) => Buffer.from(data.buffer, data.byteOffset, data.byteLength))
    }

    /*  the markdownlint rules conflicting with the SpecBook format
        (trailing blank line, mixed ATX and Setext headings, free ordered list numbering,
        padded list markers and headings, unwrapped lines, frontmatter first, images without
        alternate text, and multiple artifacts or same-named objects per file)  */
    private static readonly markdownConfig = {
        "no-multiple-blanks":    { maximum: 2 },
        "heading-style":         false,
        "ol-prefix":             false,
        "no-alt-text":           false,
        "list-marker-space":     false,
        "ul-indent":             false,
        "no-multiple-space-atx": false,
        "line-length":           false,
        "first-line-heading":    false,
        "single-title":          false,
        "no-duplicate-heading":  false,
        "no-inline-html":        false
    }

    /*  the message prefix of the markdownlint diagnostics  */
    static readonly markdownPrefix = "markdownlint: "

    /*  lint the specification Markdown files with markdownlint, reporting
        its findings as warnings, as they never break the SpecBook parsing
        (markdownlint itself is loaded on first use only)  */
    private static async markdownlint (log: Log): Promise<Diagnostic[]> {
        const { lint } = await import("markdownlint/promise")
        const files = Artifact.list(log, [ "spec" ]).flatMap((entry) => entry.files)
            .filter((file) => /\.md$/i.test(file))
            .map((file) => path.resolve(Task.projectRoot(), file))
        const results = await lint({ files, config: Spec.markdownConfig })
        return Object.entries(results).flatMap(([ file, errors ]) => errors.map((e) => ({
            file:     Spec.relativize(file),
            line:     e.lineNumber,
            column:   e.errorRange?.[0] ?? 1,
            severity: "warning" as const,
            message:  `${Spec.markdownPrefix}${e.ruleNames.join("/")}: ${e.ruleDescription}` +
                (e.errorDetail  !== null ? ` [${e.errorDetail}]` : "") +
                (e.errorContext !== null ? ` [context: "${e.errorContext}"]` : "")
        })))
    }

    /*  render a diagnostic as a multi-line message with the affected
        source snippet (like the verbose SpecBook CLI), falling back to
        the single-line message when the source file is unreadable or
        empty (as there is no snippet to show)  */
    static render (diagnostic: Diagnostic, colors: boolean): string {
        let code: string
        try {
            code = fs.readFileSync(path.resolve(Task.projectRoot(), diagnostic.file), "utf8")
        }
        catch {
            return `${renderDiagnostic(diagnostic)}\n`
        }
        if (code === "")
            return `${renderDiagnostic(diagnostic)}\n`
        return sourceCodeError({
            type:     diagnostic.severity === "warning" ? "WARNING" : "ERROR",
            message:  diagnostic.message,
            filename: diagnostic.file,
            code,
            line:     diagnostic.line,
            column:   diagnostic.column,
            colors
        })
    }

    /*  export the specification Markdown files below the "spec" artifact
        base directory into the requested formats, one buffer per format,
        collecting the emitted environment notices if requested  */
    static export (log: Log, formats: ExportFormat[], notices?: string[]): Promise<Buffer[]> {
        return Spec.unmarked(Spec.api(log, notices).then((api) => api.export({
            config:    Spec.configFiles(log),
            basedir:   Artifact.basedir(log, "spec"),
            gitignore: Spec.gitignore,
            formats
        })))
    }

    /*  export the specification like "export" and then keep the export
        in sync with its sources, handing every fresh set of buffers to
        "onExport", where "outputs" names the files "onExport" writes,
        so an output which is itself an observed source can be refused  */
    static watch (
        log:      Log,
        formats:  ExportFormat[],
        outputs:  string[],
        onExport: (buffers: Buffer[]) => Promise<void>
    ): Promise<void> {
        return Spec.unmarked(Spec.api(log).then((api) => api.watch({
            config:    Spec.configFiles(log),
            basedir:   Artifact.basedir(log, "spec"),
            gitignore: Spec.gitignore,
            formats,
            outputs,
            onExport
        })))
    }

    /*  serve the HTML export of the specification as a live preview,
        kept in sync with its sources and pushed into the connected
        browsers as an in-place document update  */
    static preview (log: Log, addr: string, port: number): Promise<void> {
        return Spec.unmarked(Spec.api(log).then((api) => api.preview({
            config:    Spec.configFiles(log),
            basedir:   Artifact.basedir(log, "spec"),
            gitignore: Spec.gitignore,
            addr,
            port
        })))
    }
}

/*  CLI command "ase spec"  */
export default class SpecCommand {
    constructor (private log: Log) {}

    /*  register commands  */
    register (program: Command): void {
        /*  register CLI top-level command "ase spec"  */
        const spec = program
            .command("spec")
            .description("Initialize, lint, export, and preview the SpecBook-based project specification")
            .action(() => {
                spec.outputHelp()
                process.exit(1)
            })

        /*  register CLI sub-command "ase spec init"  */
        spec
            .command("init")
            .description("Initialize the absent specification Markdown files of the SpecBook schema configuration")
            .action(async () => {
                const files = await Spec.init(this.log)
                await writeStdout(files.length > 0 ?
                    `initialized artifact file(s): ${files.join(", ")}\n` :
                    "no artifact files were created\n")
            })

        /*  register CLI sub-command "ase spec lint"  */
        spec
            .command("lint")
            .description("Lint the specification Markdown files against the SpecBook schema configuration")
            .option("-m, --markdown", "additionally lint the generic Markdown formatting via markdownlint")
            .option("-v, --verbose", "print each diagnostic with its affected source snippet")
            .action(async (opts: { markdown?: boolean, verbose?: boolean }) => {
                const diagnostics = await Spec.lint(this.log, opts.markdown === true)
                for (const diagnostic of diagnostics) {
                    /*  report a diagnostic as a log message of its severity, tagged with its linter  */
                    const { file, line, column, severity, message } = diagnostic
                    const markdown = message.startsWith(Spec.markdownPrefix)
                    if (opts.verbose === true)
                        await writeStdout(Spec.render(diagnostic, process.stdout.isTTY === true))
                    else
                        this.log.write(severity, `lint: ${markdown ? "markdownlint" : "specbook"}: ` +
                            `${file}:${line}:${column}: ${markdown ? message.slice(Spec.markdownPrefix.length) : message}`)
                }
                if (diagnostics.some((diagnostic) => diagnostic.severity === "error"))
                    process.exitCode = 1
            })

        /*  register CLI sub-command "ase spec export"  */
        spec
            .command("export")
            .description("Export the specification Markdown files as JSON, JSON5, YAML, TOON, HTML, PDF, or normalized Markdown")
            .option("-o, --output <[format:]file>",
                "output file (\"-\" for stdout, repeatable), with the format inferred " +
                "from the filename extension unless explicitly prefixed " +
                "(default: \"index.html\" inside the specification base directory)",
                (value: string, previous: string[]) => previous.concat(value), new Array<string>())
            .option("-w, --watch", "keep the outputs in sync by re-exporting on every source change")
            .action(async (opts: { output: string[], watch?: boolean }) => {
                const { parseOutputSpec } = await import("@rse/specbook")
                const outputs  = (opts.output.length > 0 ? opts.output :
                    [ path.join(Artifact.basedir(this.log, "spec"), "index.html") ]).map(parseOutputSpec)

                /*  a re-export has to land somewhere it can be picked up again,
                    which a one-shot stdout stream cannot provide  */
                if (opts.watch === true && outputs.some(({ output }) => output === "-"))
                    throw new Error("the watch mode requires regular output files " +
                        "(\"-\" for stdout is not supported)")

                /*  parse the input once and export each distinct format once  */
                const distinct = Array.from(new Set(outputs.map(({ format }) => format)))
                const write = async (buffers: Buffer[]) => {
                    for (const { format, output } of outputs) {
                        const data = buffers[distinct.indexOf(format)]
                        if (output === "-")
                            await writeStdout(data)
                        else {
                            await fs.promises.writeFile(output, data)
                            this.log.write("info", `spec: exported specification into "${output}" (${data.length} bytes)`)
                        }
                    }
                }
                if (opts.watch === true) {
                    await Spec.watch(this.log, distinct, outputs.map(({ output }) => output), write)
                    await new Promise<void>(() => { /*  never resolves  */ })
                }
                else
                    await write(await Spec.export(this.log, distinct))
            })

        /*  register CLI sub-command "ase spec preview"  */
        spec
            .command("preview")
            .description("Serve the HTML export of the specification Markdown files as a live preview")
            .option("-a, --addr <ip-addr>", "IP address to listen on (default: SpecBook preview address)")
            .option("-p, --port <tcp-port>", "TCP port to listen on (default: SpecBook preview port)")
            .action(async (opts: { addr?: string, port?: string }) => {
                const { previewAddr, previewPort } = await import("@rse/specbook")
                const port = Number(opts.port ?? previewPort)
                if (!Number.isInteger(port) || port < 1 || port > 65535)
                    throw new Error(`invalid TCP port "${opts.port}"`)
                await Spec.preview(this.log, opts.addr ?? previewAddr, port)
                await new Promise<void>(() => { /*  never resolves  */ })
            })
    }
}

/*  render a caught error as an MCP tool error result  */
const mcpToolError = (err: unknown) => ({
    isError: true,
    content: [ { type: "text" as const, text: `ERROR: ${err instanceof Error ? err.message : String(err)}` } ]
})

/*  MCP registration entry point for SpecBook tools  */
export class SpecMCP {
    constructor (private log: Log) {}

    /*  register MCP tools  */
    register (mcp: McpServer): void {
        mcp.registerTool("ase_specbook_lint", {
            title: "ASE SpecBook lint",
            description:
                "Lint the SpecBook specification Markdown files of the project (located via the " +
                "`project.artifact.spec.basedir` configuration) against the SpecBook YAML schema " +
                "configuration (`project.artifact.spec.schema`, a whitespace-separated list of schema files " +
                "merged in order, with `std` naming the standard schema bundled with SpecBook, " +
                "which is also the default). With `markdown`, the files are additionally linted " +
                "for their generic Markdown formatting via markdownlint, whose findings are reported " +
                "as `warning` diagnostics with a message prefixed by `markdownlint: `. " +
                "Returns a `diagnostics` array of `{ file, line, column, severity, message }` objects (with " +
                "project-relative `file` and a `severity` of `error` or `warning`), rendered as bullet " +
                "points in `text`. With `verbose`, " +
                "each diagnostic additionally carries a multi-line `snippet` rendering with the " +
                "affected source lines, which is also used for `text`. An empty array " +
                "(`text` of `specification valid`) means the specification is valid; only " +
                "diagnostics of `error` severity make an export fail.",
            inputSchema: {
                markdown: z.boolean().optional()
                    .describe("if true, additionally lint the generic Markdown formatting via markdownlint (default: false)"),
                verbose: z.boolean().optional()
                    .describe("if true, render each diagnostic with its affected source snippet (default: false)")
            },
            outputSchema: {
                diagnostics: z.array(z.object({
                    file:     z.string().describe("project-relative file path"),
                    line:     z.number().describe("line number (1-based)"),
                    column:   z.number().describe("column number (1-based)"),
                    severity: z.enum([ "error", "warning" ]).describe("diagnostic severity"),
                    message:  z.string().describe("diagnostic message"),
                    snippet:  z.string().optional()
                        .describe("multi-line rendering with the affected source snippet (with `verbose` only)")
                })).describe("lint diagnostics, empty if the specification is valid")
            }
        }, async (args) => {
            try {
                const verbose = args.verbose ?? false
                const diagnostics: Array<Diagnostic & { snippet?: string }> = (await Spec.lintIsolated(this.log, args.markdown ?? false))
                    .map((d) => verbose ? { ...d, snippet: Spec.render(d, false) } : d)
                const text = diagnostics.length === 0 ? "specification valid" :
                    verbose ?
                        diagnostics.map((d) => d.snippet ?? "").join("").replace(/\n$/, "") :
                        diagnostics.map((d) => `- ${renderDiagnostic(d)}`).join("\n")
                return {
                    structuredContent: { diagnostics },
                    content: [ { type: "text", text } ]
                }
            }
            catch (err: unknown) {
                return mcpToolError(err)
            }
        })

        mcp.registerTool("ase_specbook_export", {
            title: "ASE SpecBook export",
            description:
                "Export the SpecBook specification Markdown files of the project (located via the " +
                "`project.artifact.spec.basedir` configuration) as JSON, JSON5, YAML, TOON, HTML, PDF, " +
                "or normalized Markdown. The result is written to the `output` file (a relative path " +
                "resolves against the project root) if given, else it is returned directly " +
                "(PDF as a base64-encoded resource). The export fails on any lint diagnostic. " +
                "The `notices` array carries the environment notices emitted during the export " +
                "(like a PDF rendering falling back onto a system-installed browser), which are " +
                "worth reporting to the user verbatim.",
            inputSchema: {
                format: z.enum(Spec.formats).optional()
                    .describe("output format (default: inferred from the `output` file extension, else `json`)"),
                output: z.string().optional()
                    .describe("output file path (\"-\" or omitted returns the result directly)")
            },
            outputSchema: {
                notices: z.array(z.string())
                    .describe("environment notices emitted during the export, empty if there were none")
            }
        }, async (args) => {
            const notices = new Array<string>()
            try {
                const { parseOutputSpec } = await import("@rse/specbook")

                /*  an explicit format takes the output as a plain file path, while
                    otherwise the output is an "[<format>:]<file>" specification  */
                const spec = args.format !== undefined || args.output === undefined ?
                    { format: args.format ?? "json", output: args.output } :
                    parseOutputSpec(args.output)
                const [ data ] = await Spec.exportIsolated(this.log, [ spec.format ], notices)
                if (spec.output !== undefined && spec.output !== "-") {
                    await fs.promises.writeFile(path.resolve(Task.projectRoot(), spec.output), data)
                    return {
                        structuredContent: { notices },
                        content: [ { type: "text", text: `exported specification into "${spec.output}" (${data.length} bytes)` } ]
                    }
                }
                else if (spec.format === "pdf")
                    return {
                        structuredContent: { notices },
                        content: [ {
                            type:     "resource",
                            resource: { uri: "ase:specbook-export.pdf", mimeType: "application/pdf", blob: data.toString("base64") }
                        } ]
                    }
                else
                    return {
                        structuredContent: { notices },
                        content: [ { type: "text", text: data.toString("utf8") } ]
                    }
            }
            catch (err: unknown) {
                return mcpToolError(err)
            }
        })
    }
}

