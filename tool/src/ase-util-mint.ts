/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import { createHash }        from "node:crypto"

import { Command, Option }   from "commander"
import { z }                 from "zod"
import UUID                  from "pure-uuid"

import type { McpServer }    from "@modelcontextprotocol/sdk/server/mcp.js"

import { writeStdout }       from "./ase-lib-stdio.js"

/*  the fixed ASE namespace UUID, itself a UUID V5 over the ASE home URL
    within the standard URL namespace, so that all hint-derived UUIDs
    stay stable over time and disjoint from those of other applications  */
const NAMESPACE = new UUID(5, "ns:URL", "https://ase.tools").format("std")

/*  the identifier types which are derivable without any AI reasoning  */
export type MintType = "uuid" | "sha1"

/*  the outcome of a minting request: the identifiers themselves, plus
    an optional warning about a request which could not be honored
    literally  */
export type MintResult = {
    ids:     string[]
    warning: string
}

/*  mint "count" identifiers of "type" out of "hint": an empty hint
    yields "count" random UUIDs (V4), while a non-empty hint yields
    exactly one deterministic hash (UUID V5, SHA-1), as hashing is a
    pure function of the hint and hence cannot produce distinct results
    for it -- a larger count is clamped and reported back as a warning  */
export const mint = (type: MintType, hint: string, count: number): MintResult => {
    if (!Number.isInteger(count) || count < 1)
        throw new Error("mint: count has to be a positive integer")
    if (type === "sha1" && hint === "")
        throw new Error("mint: type \"sha1\" requires a non-empty hint")
    let warning = ""
    if (hint !== "" && count > 1) {
        warning = `WARNING: type "${type}" is deterministic for a non-empty hint, ` +
            `so the requested count ${count} was reduced to 1`
        count = 1
    }
    const ids: string[] = []
    for (let i = 0; i < count; i++) {
        if (type === "uuid")
            ids.push(hint === "" ?
                new UUID(4).format("std") :
                new UUID(5, NAMESPACE, hint).format("std"))
        else
            ids.push(createHash("sha1").update(hint).digest("hex"))
    }
    return { ids, warning }
}

/*  CLI command "ase mint"  */
export default class MintCommand {
    /*  register commands  */
    register (program: Command): void {
        program
            .command("mint")
            .description("Mint hash-derived identifiers (UUID, SHA-1) out of a hint")
            .addOption(new Option("-t, --type <type>", "identifier type")
                .choices([ "uuid", "sha1" ]).default("uuid"))
            .option("-c, --count <count>", "number of identifiers to mint (empty hint only)", "1")
            .argument("[hint...]", "hint the identifiers are derived from")
            .action(async (hint: string[], opts: { type: MintType, count: string }) => {
                const count  = Number(opts.count)
                const result = mint(opts.type, hint.join(" "), count)
                if (result.warning !== "")
                    process.stderr.write(`ase mint: ${result.warning}\n`)
                await writeStdout(`${result.ids.join("\n")}\n`)
            })
    }
}

/*  MCP registration entry point for mint tool  */
export class MintMCP {
    register (mcp: McpServer): void {
        mcp.registerTool("ase_mint", {
            title: "ASE mint",
            description:
                "Mint one or more hash-derived identifiers out of a free-text `hint`. " +
                "For `type` `uuid`, a deterministic UUID V5 within the fixed ASE namespace " +
                "is derived from the hint, or a random UUID V4 if the hint is empty. " +
                "For `type` `sha1`, the 40-character hexadecimal SHA-1 digest of the hint " +
                "is derived, which requires a non-empty hint. " +
                "Pass `count` to mint more than one random UUID V4 at once, which is " +
                "possible for an empty hint only, as hashing a non-empty hint is " +
                "deterministic and hence always yields exactly one identifier. " +
                "Returns the minted identifiers as `text`, one per line, optionally " +
                "preceded by a line starting with `WARNING:`.",
            inputSchema: {
                type: z.enum([ "uuid", "sha1" ]).default("uuid")
                    .describe("identifier type: `uuid` (UUID V5, or V4 for an empty hint) or " +
                        "`sha1` (SHA-1 hexadecimal digest), default `uuid`"),
                hint: z.string().default("")
                    .describe("free-text hint the identifiers are derived from " +
                        "(an empty hint is allowed for `uuid` only)"),
                count: z.number().int().positive().max(100).default(1)
                    .describe("number of identifiers to mint (at most 100, default 1); " +
                        "honored for an empty hint only, else clamped to 1")
            }
        }, async (args) => {
            try {
                const result = mint(args.type, args.hint, args.count)
                const text   = (result.warning !== "" ? [ result.warning ] : [])
                    .concat(result.ids).join("\n")
                return {
                    content: [ { type: "text", text } ]
                }
            }
            catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err)
                return {
                    isError: true,
                    content: [ { type: "text", text: `ERROR: ${message}` } ]
                }
            }
        })
    }
}
