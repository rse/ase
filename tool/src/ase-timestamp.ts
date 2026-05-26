/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under GPL 3.0 <https://spdx.org/licenses/GPL-3.0-only>
*/

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z }              from "zod"
import { DateTime }       from "luxon"

/*  MCP registration entry point for timestamp tool  */
export class TimestampMCP {
    register (mcp: McpServer): void {
        mcp.registerTool("ase_timestamp", {
            title: "ASE timestamp",
            description:
                "Return the current local date/time formatted via a Luxon format string. " +
                "Pass the Luxon format tokens as `format` (default: `yyyy-LL-dd HH:mm`). " +
                "Returns the formatted timestamp as `text`.",
            inputSchema: {
                format: z.string().default("yyyy-LL-dd HH:mm")
                    .describe("Luxon format tokens (default: `yyyy-LL-dd HH:mm`)")
            }
        }, async (args) => {
            try {
                const text = DateTime.now().toFormat(args.format)
                return {
                    content: [ { type: "text", text } ]
                }
            }
            catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err)
                return {
                    isError: true,
                    content: [ { type: "text", text: `timestamp: format failed: ${message}` } ]
                }
            }
        })
    }
}
