/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import path                     from "node:path"
import fs                       from "node:fs"

import { Command }              from "commander"
import { isScalar }             from "yaml"
import { z }                    from "zod"
import sourceCodeError          from "source-code-error"
import type { McpServer }       from "@modelcontextprotocol/sdk/server/mcp.js"
import { SpecBook, renderDiagnostic, renderVerbose, formats, parseOutputSpec, previewAddr, previewPort } from "@rse/specbook"
import type { Diagnostic, ExportFormat, VerboseLevel }                                                  from "@rse/specbook"

import type Log                 from "./ase-util-log.js"
import type { LogLevel }        from "./ase-util-log.js"
import { Config, configSchema } from "./ase-config.js"
import { Task }                 from "./ase-task.js"
import { Artifact }             from "./ase-artifact.js"
import { Meta }                 from "./ase-meta.js"
import { writeStdout }          from "./ase-util-stdio.js"

/*  reusable functionality: lint, export, and preview the SpecBook-based
    project specification, located via the "project.artifact.spec.basedir"
    and "project.artifact.spec.schema" configuration  */
export class Spec {
    /*  resolve the YAML schema configuration files: the whitespace-separated
        entries of the configured "project.artifact.spec.schema", merged in
        the given order, where each entry is either the literal "std" for the
        bundled standard "ase-format-specbook.yaml" plugin meta file or a file
        path relative to the project root, and an unset or empty value means "std"  */
    static configFiles (log: Log): string[] {
        const cfg = new Config("config", configSchema, log)
        cfg.read()
        const val     = cfg.get("project.artifact.spec.schema")
        const list    = val === undefined ? "" : String(isScalar(val) ? val.value : val)
        const entries = list.split(/\s+/).filter((entry) => entry !== "")
        if (entries.length === 0)
            entries.push("std")
        return entries.map((entry) => entry === "std" ?
            Meta.resolve("ase-format-specbook.yaml") :
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
        additionally reach the given collector  */
    private static api (log: Log, notices?: string[]): SpecBook {
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

    /*  every specification command honors the Git exclude rules, so that
        SpecBook resolves the very same artifact files as "ase artifact
        list --kind spec": both consult ".gitignore", so a specification
        the project does not track is invisible to both instead of only
        to one of them  */
    private static readonly gitignore = true

    /*  lint the specification Markdown files below the "spec" artifact
        base directory against the schema configuration  */
    static async lint (log: Log): Promise<Diagnostic[]> {
        const result = await Spec.unmarked(Spec.api(log).lint({
            config:    Spec.configFiles(log),
            basedir:   Artifact.basedir(log, "spec"),
            gitignore: Spec.gitignore
        }))
        return result.diagnostics.map((d) => ({ ...d, file: Spec.relativize(d.file) }))
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
        return Spec.unmarked(Spec.api(log, notices).export({
            config:    Spec.configFiles(log),
            basedir:   Artifact.basedir(log, "spec"),
            gitignore: Spec.gitignore,
            formats
        }))
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
        return Spec.unmarked(Spec.api(log).watch({
            config:    Spec.configFiles(log),
            basedir:   Artifact.basedir(log, "spec"),
            gitignore: Spec.gitignore,
            formats,
            outputs,
            onExport
        }))
    }

    /*  serve the HTML export of the specification as a live preview,
        kept in sync with its sources and pushed into the connected
        browsers as an in-place document update  */
    static preview (log: Log, addr: string, port: number): Promise<void> {
        return Spec.unmarked(Spec.api(log).preview({
            config:    Spec.configFiles(log),
            basedir:   Artifact.basedir(log, "spec"),
            gitignore: Spec.gitignore,
            addr,
            port
        }))
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
            .description("Lint, export, and preview the SpecBook-based project specification")
            .action(() => {
                spec.outputHelp()
                process.exit(1)
            })

        /*  register CLI sub-command "ase spec lint"  */
        spec
            .command("lint")
            .description("Lint the specification Markdown files against the SpecBook schema configuration")
            .option("-v, --verbose", "print each diagnostic with its affected source snippet")
            .action(async (opts: { verbose?: boolean }) => {
                const diagnostics = await Spec.lint(this.log)
                for (const diagnostic of diagnostics)
                    await writeStdout(opts.verbose === true ?
                        Spec.render(diagnostic, process.stdout.isTTY === true) :
                        `${renderDiagnostic(diagnostic)}\n`)
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
            .option("-a, --addr <ip-addr>", "IP address to listen on", previewAddr)
            .option("-p, --port <tcp-port>", "TCP port to listen on", String(previewPort))
            .action(async (opts: { addr: string, port: string }) => {
                const port = Number(opts.port)
                if (!Number.isInteger(port) || port < 1 || port > 65535)
                    throw new Error(`invalid TCP port "${opts.port}"`)
                await Spec.preview(this.log, opts.addr, port)
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
                "merged in order, with `std` naming the bundled standard `ase-format-specbook.yaml`, " +
                "which is also the default). " +
                "Returns a `diagnostics` array of `{ file, line, column, severity, message }` objects (with " +
                "project-relative `file` and a `severity` of `error` or `warning`), rendered as bullet " +
                "points in `text`. With `verbose`, " +
                "each diagnostic additionally carries a multi-line `snippet` rendering with the " +
                "affected source lines, which is also used for `text`. An empty array " +
                "(`text` of `specification valid`) means the specification is valid; only " +
                "diagnostics of `error` severity make an export fail.",
            inputSchema: {
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
                    snippet: z.string().optional()
                        .describe("multi-line rendering with the affected source snippet (with `verbose` only)")
                })).describe("lint diagnostics, empty if the specification is valid")
            }
        }, async (args) => {
            try {
                const verbose = args.verbose ?? false
                const diagnostics: Array<Diagnostic & { snippet?: string }> = (await Spec.lint(this.log))
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
                format: z.enum(formats).optional()
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
                /*  an explicit format takes the output as a plain file path, while
                    otherwise the output is an "[<format>:]<file>" specification  */
                const spec = args.format !== undefined || args.output === undefined ?
                    { format: args.format ?? "json", output: args.output } :
                    parseOutputSpec(args.output)
                const [ data ] = await Spec.export(this.log, [ spec.format ], notices)
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
