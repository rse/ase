/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import fs                 from "node:fs"

import { Command }        from "commander"
import { z }              from "zod"

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"

import { writeStdout }    from "./ase-util-stdio.js"

/*  the length metrics of a text  */
export type Metric = {
    words: number
    lines: number
    chars: number
    bytes: number
}

/*  measure the metrics of the text "content", where "words" are the
    whitespace-separated tokens, "lines" count a trailing line without a
    final newline as a full line, "chars" are Unicode characters (code
    points), and "bytes" are the UTF-8 octets of the content itself,
    overridable with the raw octet size of an underlying file  */
export const measure = (content: string, bytes = Buffer.byteLength(content, "utf8")): Metric => {
    const words = content.split(/\s+/).filter((word) => word !== "").length
    const lines = content === "" ? 0 : content.replace(/\n$/, "").split("\n").length
    const chars = Array.from(content).length
    return { words, lines, chars, bytes }
}

/*  measure the metrics of the content of a file, counting its raw
    octets as "bytes", as the file encoding is not necessarily UTF-8  */
export const measureFile = (file: string): Metric => {
    let buffer: Buffer
    try {
        buffer = fs.readFileSync(file)
    }
    catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        throw new Error(`metric: cannot read file "${file}": ${message}`, { cause: err })
    }
    return measure(buffer.toString("utf8"), buffer.length)
}

/*  measure the metrics of the mutually exclusive inputs "file" and
    "text", of which exactly one has to be given  */
export const measureInput = (file?: string, text?: string): Metric => {
    if (file !== undefined && text !== undefined)
        throw new Error("metric: \"file\" and \"text\" are mutually exclusive")
    else if (file !== undefined)
        return measureFile(file)
    else if (text !== undefined)
        return measure(text)
    else
        throw new Error("metric: either \"file\" or \"text\" has to be given")
}

/*  CLI command "ase metric"  */
export default class MetricCommand {
    /*  register commands  */
    register (program: Command): void {
        program
            .command("metric")
            .description("Measure the words, lines, characters, and bytes of a file or a text")
            .option("-f, --file <file>", "measure the content of <file> instead of the arguments")
            .argument("[text...]", "text to measure (mutually exclusive with --file)")
            .action(async (text: string[], opts: { file?: string }) => {
                const result = measureInput(opts.file, text.length > 0 ? text.join(" ") : undefined)
                await writeStdout(`${JSON.stringify(result)}\n`)
            })
    }
}

/*  render a caught error as an MCP tool error result  */
const mcpToolError = (err: unknown) => ({
    isError: true,
    content: [ { type: "text" as const, text: `ERROR: ${err instanceof Error ? err.message : String(err)}` } ]
})

/*  MCP registration entry point for metric tool  */
export class MetricMCP {
    register (mcp: McpServer): void {
        mcp.registerTool("ase_text_metric", {
            title: "ASE text metric",
            description:
                "Measure the length metrics of a text, given either as the path `file` or as the " +
                "literal `text`, which are mutually exclusive and of which exactly one has to be given. " +
                "Returns `words` (the whitespace-separated tokens), `lines` (the newline-separated " +
                "lines, where a trailing line without a final newline still counts as one line), " +
                "`chars` (the Unicode characters, i.e. code points), and `bytes` (the octets: the raw " +
                "file size for `file`, the UTF-8 length for `text`). " +
                "You MUST call this tool whenever a text length is needed, instead of counting or " +
                "estimating the length yourself.",
            inputSchema: {
                file: z.string().optional()
                    .describe("path of the file whose content is measured (mutually exclusive with `text`)"),
                text: z.string().optional()
                    .describe("literal text which is measured (mutually exclusive with `file`)")
            },
            outputSchema: {
                words: z.number().describe("number of whitespace-separated tokens"),
                lines: z.number().describe("number of lines"),
                chars: z.number().describe("number of Unicode characters (code points)"),
                bytes: z.number().describe("number of octets")
            }
        }, async (args) => {
            try {
                const result = measureInput(args.file, args.text)
                return {
                    structuredContent: result,
                    content: [ { type: "text", text: JSON.stringify(result) } ]
                }
            }
            catch (err: unknown) {
                return mcpToolError(err)
            }
        })
    }
}
