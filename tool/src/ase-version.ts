/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under GPL 3.0 <https://spdx.org/licenses/GPL-3.0-only>
*/

import { execa }   from "execa"

import pkg         from "../package.json" with { type: "json" }

/*  determination of current and available ASE versions  */
export default class Version {
    /*  return current ASE version  */
    static current (): string {
        return pkg.version
    }

    /*  return latest ASE version available on the NPM registry  */
    static async latest (): Promise<string> {
        let latest = ""
        try {
            const r = await execa("npm", [ "view", "@rse/ase", "version" ],
                { stdio: [ "ignore", "pipe", "pipe" ] })
            latest = r.stdout.trim()
        }
        catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err)
            throw new Error(`failed to query latest ASE version: ${message}`, { cause: err })
        }
        return latest
    }
}
