/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import { Command }          from "commander"
import { z }                from "zod"
import type { McpServer }   from "@modelcontextprotocol/sdk/server/mcp.js"

import { writeStdout }      from "./ase-lib-stdio.js"

/*  the canonical expected values for every ase-meta-compat probe,
    keyed by "<category>/<probe-name>" as used in the skill  */
const EXPECTED: Record<string, string> = {
    /*  xml-placeholders  */
    "xml-placeholders/get-and-set":   "42",
    "xml-placeholders/self-ref":      "pre_42",
    "xml-placeholders/overwrite":     "99",
    "xml-placeholders/indexed":       "+1,-1",
    "xml-placeholders/nested-attr":   "20",
    "xml-placeholders/entity":        "⦿",

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

/*  CLI command "ase util compat"  */
export default class CompatCommand {
    register (program: Command): void {
        program
            .command("compat")
            .description("Output expected probe values of the ase-meta-compat self-test skill for inspection by humans")
            .action(async () => {
                await writeStdout(formatExpected())
            })
    }
}

/*  MCP tool "ase_compat" -- grades the actual probe results of the skill,
    never revealing the expected values  */
export class CompatMCP {
    register (mcp: McpServer): void {
        mcp.registerTool("ase_compat", {
            title:       "ASE compat probe grading",
            description:
                "Grade the actual probe results of the ase-meta-compat self-test skill " +
                "against the canonical expected values. Call this only AFTER having executed " +
                "ALL probes, passing ALL actual results, keyed by \"<category>/<probe-name>\". " +
                "Returns one \"<id>: pass\" resp. \"<id>: fail\" line per probe (never the expected values), " +
                "or an error listing the missing probes, if not all of them were submitted.",
            inputSchema: {
                actuals: z.record(z.string(), z.string())
                    .describe("map of all actual probe results, keyed by \"<category>/<probe-name>\"")
            }
        }, async (args) => {
            const missing = Object.keys(EXPECTED).filter((id) => !Object.hasOwn(args.actuals, id))
            if (missing.length > 0) {
                const text = "ERROR: not all probes were submitted -- first execute the missing probes, " +
                    "then call this tool again with ALL actual results (missing: " + missing.join(", ") + ")\n"
                return {
                    isError: true,
                    content: [ { type: "text", text } ]
                }
            }
            const text = Object.entries(EXPECTED).map(([ id, value ]) =>
                `${id}: ${args.actuals[id].trim() === value ? "pass" : "fail"}`
            ).join("\n") + "\n"
            return {
                content: [ { type: "text", text } ]
            }
        })
    }
}

