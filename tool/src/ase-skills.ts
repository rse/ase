/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under GPL 3.0 <https://spdx.org/licenses/GPL-3.0-only>
*/

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z }              from "zod"
import { ofetch }         from "ofetch"
import pacote             from "pacote"

/*  shape of a single component-info entry  */
export interface ComponentInfo {
    name:       string
    version:    string
    created:    string
    updated:    string
    repository: string
    stars:      number | "N.A."
    downloads:  number | "N.A."
    rank:       number
}

/*  reusable functionality: gather per-package metadata in maximum parallel  */
export class Skills {
    /*  HTTP timeout for the GitHub/npm-downloads side calls  */
    private static HTTP_TIMEOUT_MS = 10_000

    /*  fetch the full registry packument for a single package  */
    private static async fetchPackument (name: string): Promise<{
        version: string, time: Record<string, string>, repository: string
    }> {
        try {
            const pkg = await pacote.packument(name, { fullMetadata: true }) as unknown as {
                "dist-tags"?: { latest?: string }
                time?:        Record<string, string>
                versions?:    Record<string, { repository?: { url?: string } | string }>
            }
            const version  = pkg["dist-tags"]?.latest ?? ""
            const time     = pkg.time ?? {}
            const verEntry = version !== "" ? pkg.versions?.[version] : undefined
            let repository = ""
            if (verEntry !== undefined) {
                const r = verEntry.repository
                if (typeof r === "string")
                    repository = r
                else if (r !== undefined && typeof r.url === "string")
                    repository = r.url
            }
            return { version, time, repository }
        }
        catch {
            return { version: "", time: {}, repository: "" }
        }
    }

    /*  fetch GitHub stars given a repository URL (or empty string)  */
    private static async fetchStars (repository: string): Promise<number | "N.A."> {
        const m = /^.+?\/\/github\.com\/([^/]+\/[^/#?]+?)(?:\.git)?(?:[/#?].*)?$/.exec(repository)
        if (m === null)
            return "N.A."
        try {
            const data = await ofetch<{ stargazers_count?: number }>(
                `https://api.github.com/repos/${m[1]}`,
                { timeout: Skills.HTTP_TIMEOUT_MS, ignoreResponseError: true }
            )
            const n = data?.stargazers_count
            return typeof n === "number" ? n : "N.A."
        }
        catch {
            return "N.A."
        }
    }

    /*  fetch last-month npm downloads for a single package  */
    private static async fetchDownloads (name: string): Promise<number | "N.A."> {
        try {
            const data = await ofetch<{ downloads?: number }>(
                `https://api.npmjs.org/downloads/point/last-month/${encodeURIComponent(name)}`,
                { timeout: Skills.HTTP_TIMEOUT_MS, ignoreResponseError: true }
            )
            const n = data?.downloads
            return typeof n === "number" ? n : "N.A."
        }
        catch {
            return "N.A."
        }
    }

    /*  gather metadata for all given components in maximum parallel,
        dispatching on the technology stack:
        -   "JavaScript"/"TypeScript": NPM registry (pacote) + GitHub stars + npm-downloads
        -   "Java"/"Kotlin"/"Unknown": not yet supported -- return empty result  */
    static async info (stack: string, components: string[]): Promise<ComponentInfo[]> {
        /*  FIXME: currently just limited technology stack support  */
        if (stack !== "JavaScript" && stack !== "TypeScript")
            return []

        /*  per package: kick off packument and downloads in parallel,
            then stars as soon as the packument resolves; across packages
            everything runs concurrently via Promise.all  */
        const results = await Promise.all(components.map(async (name): Promise<ComponentInfo> => {
            const packumentPromise = Skills.fetchPackument(name)
            const downloadsPromise = Skills.fetchDownloads(name)
            const starsPromise     = packumentPromise.then((p) => Skills.fetchStars(p.repository))
            const [ p, downloads, stars ] = await Promise.all([
                packumentPromise, downloadsPromise, starsPromise
            ])
            const created = p.time.created ?? ""
            const updated = p.version !== "" ? (p.time[p.version] ?? "") : ""
            const rank    = Skills.computeRank(downloads, stars, created, updated)
            return {
                name,
                version:    p.version,
                created,
                updated,
                repository: p.repository,
                stars,
                downloads,
                rank
            }
        }))

        /*  sort by rank in descending order (best first)  */
        results.sort((a, b) => b.rank - a.rank)
        return results
    }

    /*  compute composite rank score from weighted metrics:
        downloads x
        stars x
        ([lifespan =] (updated - created)) x
        ([recentness =] exp(-(now - updated) / halfLife))  */
    private static computeRank (
        downloads: number | "N.A.",
        stars:     number | "N.A.",
        created:   string,
        updated:   string
    ): number {
        const d = typeof downloads === "number" ? downloads : 0
        const s = typeof stars     === "number" ? stars     : 0
        const cMs = created !== "" ? Date.parse(created) : NaN
        const uMs = updated !== "" ? Date.parse(updated) : NaN
        if (Number.isNaN(cMs) || Number.isNaN(uMs))
            return 0
        const now        = Date.now()
        const msPerDay   = 1000 * 60 * 60 * 24
        const halfLife   = 365 / 2
        const lifespan   = Math.max(0, uMs - cMs)
        const ageDays    = Math.max(0, (now - uMs) / msPerDay)
        const recentness = Math.exp(-ageDays / halfLife)
        return d * s * lifespan * recentness
    }
}

/*  MCP registration entry point for the component-info tool  */
export class SkillsMCP {
    register (mcp: McpServer): void {
        mcp.registerTool("component_info", {
            title: "ASE component info",
            description:
                "Gather metadata for a list of NPM packages in maximum parallel. " +
                "For each package, fetches the full registry packument via `pacote` " +
                "(in-process, no `npm view` subprocess), the GitHub `stargazers_count` " +
                "from `api.github.com` (if the repository points to GitHub), and the " +
                "last-month downloads from `api.npmjs.org`. Returns a JSON `text` array " +
                "of `{ name, version, created, updated, repository, stars, downloads, rank }` " +
                "objects, sorted in descending order by `rank`. Failures of " +
                "individual side calls are isolated and reported as `\"N.A.\"` or empty " +
                "string so every entry has the full shape.",
            inputSchema: {
                stack: z.string()
                    .describe("Technology stack: \"JavaScript\", \"TypeScript\", \"Java\", \"Kotlin\", or \"Unknown\""),
                components: z.array(z.string())
                    .describe("List of package names to gather metadata for")
            }
        }, async (args) => {
            try {
                const result = await Skills.info(args.stack, args.components)
                return {
                    content: [ { type: "text", text: JSON.stringify(result) } ]
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
