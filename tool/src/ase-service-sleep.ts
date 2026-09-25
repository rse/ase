/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import { z }              from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"

/*  MCP registration entry point for sleep tool  */
export class SleepMCP {
    register (mcp: McpServer): void {
        mcp.registerTool("ase_sleep", {
            title: "ASE sleep",
            description:
                "Wait once for `duration` seconds and then return. " +
                "The duration can be fractional (e.g. `1.5`) and is at most 120 (default: 60). " +
                "Returns `OK: slept <duration> seconds` as `text` after the duration elapsed.",
            inputSchema: {
                duration: z.number().positive().max(120).default(60)
                    .describe("wait duration in seconds (fractional values allowed, at most 120, default 60)")
            }
        }, async (args) => {
            await new Promise<void>((resolve) => setTimeout(resolve, args.duration * 1000))
            return {
                content: [ { type: "text", text: `OK: slept ${args.duration} seconds` } ]
            }
        })
    }
}
