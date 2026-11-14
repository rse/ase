/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import { z }                                             from "zod"
import { structuredPatch, formatPatch, FILE_HEADERS_ONLY } from "diff"
import type { McpServer }                                from "@modelcontextprotocol/sdk/server/mcp.js"

/*  MCP registration entry point for text diff tool  */
export class DiffMCP {
    register (mcp: McpServer): void {
        mcp.registerTool("ase_text_diff", {
            title: "ASE text diff",
            description:
                "Compute the line-based unified diff between the texts `before` and `after`, " +
                "with the file headers `--- <label> (before)` and `+++ <label> (after)` " +
                "and `context` lines of context around each change (default: 3). " +
                "Returns the unified diff as `text`, or an empty `text` if both texts are identical.",
            inputSchema: {
                before:  z.string().describe("original text"),
                after:   z.string().describe("changed text"),
                label:   z.string().default("text").describe("label of both texts in the file headers (default: `text`)"),
                context: z.number().int().min(0).max(100).default(3).describe("number of context lines (default: 3)")
            }
        }, async (args) => {
            const patch = structuredPatch(`${args.label} (before)`, `${args.label} (after)`,
                args.before, args.after, undefined, undefined, { context: args.context })
            const text = patch.hunks.length > 0 ? formatPatch(patch, FILE_HEADERS_ONLY) : ""
            return {
                content: [ { type: "text", text } ]
            }
        })
    }
}
