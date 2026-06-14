/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under GPL 3.0 <https://spdx.org/licenses/GPL-3.0-only>
*/

import { Command }          from "commander"
import type { McpServer }   from "@modelcontextprotocol/sdk/server/mcp.js"

/*  the canonical expected values for every ase-meta-compat probe,
    keyed by "<category>/<probe-name>" as used in the skill  */
const EXPECTED: Record<string, string> = {
    /*  xml-placeholders  */
    "xml-placeholders/get-and-set":   "42",
    "xml-placeholders/self-ref":      "pre_42",
    "xml-placeholders/overwrite":     "99",
    "xml-placeholders/indexed":       "+1,-1",
    "xml-placeholders/nested-attr":   "20",
    "xml-placeholders/entity":        "○",

    /*  control-flow  */
    "control-flow/branch":            "mid",
    "control-flow/while-sum":         "15",
    "control-flow/for-order":         "-x-y-z",
    "control-flow/while-break":       "4",
    "control-flow/step-skip":         "X",
    "control-flow/expand-subst":      "[K:V]",

    /*  regex  */
    "regex/getopt-dash":              "yes",
    "regex/getopt-nodash":            "no",
    "regex/anchored-int":             "yes,no",
    "regex/alternation":              "yes",
    "regex/capture":                  "foo",
    "regex/whitespace":               "yes",
    "regex/complex":                  "yes",

    /*  arithmetic  */
    "arithmetic/increment":           "9",
    "arithmetic/product-sum":         "5.00",
    "arithmetic/percentage":          "0.43",
    "arithmetic/bar-width":           "54",
    "arithmetic/threshold":           "yes",
    "arithmetic/round-half":          "3"
}

/*  format the expected values as "<id>: <value>\n" lines  */
const formatExpected = (): string =>
    Object.entries(EXPECTED).map(([ id, value ]) => `${id}: ${value}`).join("\n") + "\n"

/*  CLI command "ase compat"  */
export default class CompatCommand {
    register (program: Command): void {
        program
            .command("compat")
            .description("Output expected probe values for the ase-meta-compat self-test skill")
            .action(() => {
                process.stdout.write(formatExpected())
            })
    }
}

/*  MCP tool "ase_compat" — lets the skill call this without a Bash tool  */
export class CompatMCP {
    register (mcp: McpServer): void {
        mcp.registerTool("ase_compat", {
            title:       "ASE compat expected values",
            description:
                "Return the canonical expected probe values for the ase-meta-compat " +
                "self-test skill as \"<id>: <value>\" lines, one per probe. " +
                "Call this AFTER recording all actual probe results so the LLM " +
                "cannot see the expected values before running the probes.",
            inputSchema: {}
        }, async () => {
            return {
                content: [ { type: "text", text: formatExpected() } ]
            }
        })
    }
}
