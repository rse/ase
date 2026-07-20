/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import { isScalar }                           from "yaml"
import { z }                                  from "zod"

import type { McpServer }                     from "@modelcontextprotocol/sdk/server/mcp.js"

import type Log                               from "./ase-log.js"
import { Config, configSchema, parseScope }   from "./ase-config.js"

/*  reusable functionality: ASE agent persona style get/set  */
export class Persona {
    /*  allowed persona style values  */
    static styles = [ "writer", "engineer", "journalist", "telegrapher", "caveman" ] as const

    /*  get the effective persona style for an optional session;
        returns the default "engineer" if nothing is configured  */
    static get (log: Log, session?: string): string {
        const scope = parseScope(session !== undefined ? `session:${session}` : undefined)
        const cfg = new Config("config", configSchema, log, scope)
        cfg.read()
        const val = cfg.get("agent.persona")
        if (val === undefined)
            return "engineer"
        const style = String(isScalar(val) ? val.value : val)
        if (!(Persona.styles as readonly string[]).includes(style))
            return "engineer"
        return style
    }

    /*  set the persona style on the strongest scope of an optional session  */
    static set (log: Log, style: string, session?: string): void {
        const scope = parseScope(session !== undefined ? `session:${session}` : undefined)
        const cfg = new Config("config", configSchema, log, scope)
        cfg.lock(() => {
            cfg.read()
            cfg.set("agent.persona", style)
            cfg.write()
        })
    }
}

/*  MCP registration entry point for persona tools  */
export default class PersonaMCP {
    constructor (private log: Log) {}

    register (mcp: McpServer): void {
        mcp.registerTool("ase_persona", {
            title:       "ASE persona style get/set",
            description:
                "Get or set the active ASE agent persona `style`. " +
                "If `style` is provided, it sets the persona style, " +
                "otherwise it returns the current persona `style`. " +
                "If `session` is provided, the operation is scoped to that session, " +
                "otherwise it operates on the strongest/closest scope (user/project cascade). " +
                "Allowed styles: \"writer\" (decorative, eloquent, explaining), " +
                "\"engineer\" (concise, factual, accurate), " +
                "\"journalist\" (layered, pyramid-structured title/core/detail), " +
                "\"telegrapher\" (very brief, factual, abbreviating), " +
                "\"caveman\" (ultra brief, rough, stuttering).",
            inputSchema: {
                style: z.enum(Persona.styles).optional()
                    .describe("persona style to set; if omitted, the current persona style is returned"),
                session: z.string().optional()
                    .describe("session identifier (allowed characters: A-Z, a-z, 0-9, '.', '_', '-'); " +
                        "if omitted, the operation is not scoped to a specific session")
            }
        }, async (args) => {
            try {
                if (args.style !== undefined) {
                    Persona.set(this.log, args.style, args.session)
                    const where = args.session !== undefined ?
                        ` for session "${args.session}"` : ""
                    const msg = `OK: set agent.persona to "${args.style}"${where}`
                    return {
                        content: [ { type: "text", text: msg } ]
                    }
                }
                const text = Persona.get(this.log, args.session)
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
