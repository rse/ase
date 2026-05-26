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

/*  reusable functionality: gather per-package metadata with maximum parallelism  */
export class Skills {
    /*  HTTP timeout for the GitHub/npm-downloads side calls  */
    private static HTTP_TIMEOUT_MS = 10_000

    /*  cap concurrent ofetch web requests to avoid hammering the remote
        endpoints (GitHub API, npm downloads API)  */
    private static HTTP_CONCURRENCY = 4
    private static httpActive       = 0
    private static httpQueue: Array<() => void> = []
    private static async httpLimit<T> (fn: () => Promise<T>): Promise<T> {
        if (Skills.httpActive >= Skills.HTTP_CONCURRENCY)
            await new Promise<void>((resolve) => Skills.httpQueue.push(resolve))
        Skills.httpActive++
        try {
            return await fn()
        }
        finally {
            Skills.httpActive--
            const next = Skills.httpQueue.shift()
            if (next !== undefined)
                next()
        }
    }

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
            const data = await Skills.httpLimit(() => ofetch<{ stargazers_count?: number }>(
                `https://api.github.com/repos/${m[1]}`,
                { timeout: Skills.HTTP_TIMEOUT_MS, ignoreResponseError: true }
            ))
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
            const data = await Skills.httpLimit(() => ofetch<{ downloads?: number }>(
                `https://api.npmjs.org/downloads/point/last-month/${encodeURIComponent(name)}`,
                { timeout: Skills.HTTP_TIMEOUT_MS, ignoreResponseError: true }
            ))
            const n = data?.downloads
            return typeof n === "number" ? n : "N.A."
        }
        catch {
            return "N.A."
        }
    }

    /*  fetch Maven Central metadata for a single coordinate `groupId:artifactId`:
        the Solr search endpoint provides the latest version + a `timestamp` (ms
        epoch) of that release; a second `core=gav` query yields the earliest
        known release, which we treat as the "created" date. The latest POM is
        then downloaded directly from the repo to extract the SCM/project URL.  */
    private static async fetchMavenInfo (coord: string): Promise<{
        version: string, created: string, updated: string, repository: string
    }> {
        const [ groupId, artifactId ] = coord.split(":", 2)
        if (groupId === undefined || artifactId === undefined || groupId === "" || artifactId === "")
            return { version: "", created: "", updated: "", repository: "" }
        try {
            const latest = await Skills.httpLimit(() => ofetch<{
                response?: { docs?: Array<{ v?: string, latestVersion?: string, timestamp?: number }> }
            }>(
                "https://search.maven.org/solrsearch/select" +
                `?q=g:%22${encodeURIComponent(groupId)}%22+AND+a:%22${encodeURIComponent(artifactId)}%22` +
                "&rows=1&wt=json",
                { timeout: Skills.HTTP_TIMEOUT_MS, ignoreResponseError: true }
            ))
            const doc     = latest?.response?.docs?.[0]
            const version = doc?.latestVersion ?? doc?.v ?? ""
            const updated = typeof doc?.timestamp === "number" ? new Date(doc.timestamp).toISOString() : ""

            /*  Maven Central caps `rows` at 20 and ignores client `sort`,
                so paginate via `start=` to walk all versions, accumulate the
                minimum timestamp client-side  */
            const baseUrl = "https://search.maven.org/solrsearch/select" +
                `?q=g:%22${encodeURIComponent(groupId)}%22+AND+a:%22${encodeURIComponent(artifactId)}%22` +
                "&core=gav&rows=20&wt=json"
            let firstTs: number | undefined
            let start = 0
            for (let page = 0; page < 50; page++) {
                const chunk = await Skills.httpLimit(() => ofetch<{
                    response?: { numFound?: number, docs?: Array<{ timestamp?: number }> }
                }>(
                    `${baseUrl}&start=${start}`,
                    { timeout: Skills.HTTP_TIMEOUT_MS, ignoreResponseError: true }
                ))
                const docs = chunk?.response?.docs ?? []
                for (const d of docs) {
                    if (typeof d.timestamp === "number" && (firstTs === undefined || d.timestamp < firstTs))
                        firstTs = d.timestamp
                }
                start += docs.length
                const total = chunk?.response?.numFound ?? 0
                if (docs.length === 0 || start >= total)
                    break
            }
            const created = typeof firstTs === "number" ? new Date(firstTs).toISOString() : updated
            let repository = ""
            if (version !== "") {
                try {
                    const pom = await Skills.httpLimit(() => ofetch<string, "text">(
                        `https://repo1.maven.org/maven2/${groupId.replace(/\./g, "/")}` +
                        `/${artifactId}/${version}/${artifactId}-${version}.pom`,
                        { timeout: Skills.HTTP_TIMEOUT_MS, ignoreResponseError: true, responseType: "text" }
                    ))
                    if (typeof pom === "string") {
                        const scm = /<scm>[\s\S]*?<url>\s*([^<\s]+)\s*<\/url>[\s\S]*?<\/scm>/i.exec(pom)
                        if (scm !== null)
                            repository = scm[1]
                        else {
                            const url = /<project\b[\s\S]*?<url>\s*([^<\s]+)\s*<\/url>/i.exec(pom)
                            if (url !== null)
                                repository = url[1]
                        }
                    }
                }
                catch {
                    repository = ""
                }
            }
            return { version, created, updated, repository }
        }
        catch {
            return { version: "", created: "", updated: "", repository: "" }
        }
    }

    /*  fetch the "Used By" count from `mvnrepository.com` as a downloads proxy
        for a Maven coordinate (Maven Central exposes no per-artifact download
        counts). The label `Used By (NNK)` on the artifact landing page denotes
        the number of other published artifacts depending on it. Note: the site
        is fronted by *Cloudflare* and frequently serves a JS-challenge to
        non-browser clients regardless of `User-Agent` (the block is driven by
        TLS/HTTP2 fingerprinting, not headers). A realistic browser UA is
        best-effort and degrades gracefully to `"N.A."` when blocked.  */
    private static async fetchMavenDownloads (coord: string): Promise<number | "N.A."> {
        const [ groupId, artifactId ] = coord.split(":", 2)
        if (groupId === undefined || artifactId === undefined || groupId === "" || artifactId === "")
            return "N.A."
        try {
            const html = await Skills.httpLimit(() => ofetch<string, "text">(
                `https://mvnrepository.com/artifact/${encodeURIComponent(groupId)}/${encodeURIComponent(artifactId)}`,
                {
                    timeout:             Skills.HTTP_TIMEOUT_MS,
                    ignoreResponseError: true,
                    responseType:        "text",
                    headers: {
                        "User-Agent":
                            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
                            "AppleWebKit/537.36 (KHTML, like Gecko) " +
                            "Chrome/131.0.0.0 Safari/537.36"
                    }
                }
            ))
            if (typeof html !== "string")
                return "N.A."
            const m = /Used\s+By\s*\(\s*([\d.,]+)\s*([KMB]?)\s*\)/i.exec(html)
            if (m === null)
                return "N.A."
            const base = parseFloat(m[1].replace(/,/g, ""))
            const mult = m[2] === "K" ? 1_000 : m[2] === "M" ? 1_000_000 : m[2] === "B" ? 1_000_000_000 : 1
            const n    = Math.round(base * mult)
            return Number.isFinite(n) ? n : "N.A."
        }
        catch {
            return "N.A."
        }
    }

    /*  gather metadata for all given components with maximum parallelism,
        dispatching on the technology stack:
        -   "JavaScript"/"TypeScript": NPM registry (pacote) + GitHub stars + npm-downloads
        -   "Java"/"Kotlin":           Maven Central + GitHub stars + mvnrepository.com "Used By"
        -   "Unknown":                 not supported -- return empty result  */
    static async info (stack: string, components: string[]): Promise<ComponentInfo[]> {
        if (stack === "JavaScript" || stack === "TypeScript") {
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
        else if (stack === "Java" || stack === "Kotlin") {
            /*  per coordinate: kick off Maven Central info and mvnrepository
                downloads in parallel, then stars as soon as the POM-derived
                repository is known; across coordinates everything runs
                concurrently via Promise.all  */
            const results = await Promise.all(components.map(async (name): Promise<ComponentInfo> => {
                const infoPromise      = Skills.fetchMavenInfo(name)
                const downloadsPromise = Skills.fetchMavenDownloads(name)
                const starsPromise     = infoPromise.then((i) => Skills.fetchStars(i.repository))
                const [ i, downloads, stars ] = await Promise.all([
                    infoPromise, downloadsPromise, starsPromise
                ])
                const rank = Skills.computeRank(downloads, stars, i.created, i.updated)
                return {
                    name,
                    version:    i.version,
                    created:    i.created,
                    updated:    i.updated,
                    repository: i.repository,
                    stars,
                    downloads,
                    rank
                }
            }))

            /*  sort by rank in descending order (best first)  */
            results.sort((a, b) => b.rank - a.rank)
            return results
        }
        else
            return []
    }

    /*  compute composite rank score from weighted metrics:
        downloads x
        stars x
        ([lifespan =] (updated - created)) x
        ([recentness =] exp(-(now - updated) / halfLife))
        `"N.A."` factors are treated as neutral `1` so that stacks for which
        a particular metric is structurally unavailable (e.g. Maven Central
        exposes no per-artifact download counts) can still be ranked by the
        remaining metrics, instead of collapsing the entire product to zero.  */
    private static computeRank (
        downloads: number | "N.A.",
        stars:     number | "N.A.",
        created:   string,
        updated:   string
    ): number {
        const d = typeof downloads === "number" ? downloads : 1
        const s = typeof stars     === "number" ? stars     : 1
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

    /*  compute the per-alternative product-sum (rating) row from a
        weighted decision matrix. Each input row has the shape
        `[ weight, eval_1, eval_2, ..., eval_N ]`. For each alternative
        column j (1..N), the result is the sum over all rows K of
        `weight_K * eval_K_j`. The output array has length N.  */
    static productSum (matrix: number[][]): number[] {
        if (matrix.length === 0)
            return []
        const cols = matrix[0].length
        if (cols < 2)
            throw new Error("each row must contain a weight followed by at least one evaluation column")
        const N = cols - 1
        const ratings = new Array<number>(N).fill(0)
        for (let i = 0; i < matrix.length; i++) {
            const row = matrix[i]
            if (row.length !== cols)
                throw new Error(`row ${i} has ${row.length} columns, expected ${cols}`)
            const weight = row[0]
            for (let j = 0; j < N; j++)
                ratings[j] += weight * row[j + 1]
        }
        return ratings
    }
}

/*  MCP registration entry point for various skill helper tools  */
export class SkillsMCP {
    register (mcp: McpServer): void {
        mcp.registerTool("ase_component_info", {
            title: "ASE component info",
            description:
                "Gather metadata for a list of packages with maximum parallelism, " +
                "dispatching on the technology `stack`. For `JavaScript`/`TypeScript`, " +
                "components are NPM package names: fetches the full registry packument via " +
                "`pacote` (in-process, no `npm view` subprocess), the GitHub `stargazers_count` " +
                "from `api.github.com` (if the repository points to GitHub), and the " +
                "last-month downloads from `api.npmjs.org`. For `Java`/`Kotlin`, components " +
                "are Maven coordinates of the form `groupId:artifactId`: fetches the latest " +
                "version + earliest/latest release timestamps from the Maven Central Solr " +
                "search endpoint, the SCM/project URL from the latest POM at `repo1.maven.org`, " +
                "GitHub stars (if applicable), and the \"Used By\" count from `mvnrepository.com` " +
                "as the `downloads` proxy. Returns a JSON `text` array of " +
                "`{ name, version, created, updated, repository, stars, downloads, rank }` " +
                "objects, sorted in descending order by `rank`. Failures of individual side " +
                "calls are isolated and reported as `\"N.A.\"` or empty string so every entry " +
                "has the full shape.",
            inputSchema: {
                stack: z.string()
                    .describe("Technology stack: \"JavaScript\", \"TypeScript\", \"Java\", \"Kotlin\", or \"Unknown\""),
                components: z.array(z.string())
                    .describe("List of package names (NPM) or Maven coordinates `groupId:artifactId` (Java/Kotlin)")
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
        mcp.registerTool("ase_decision_matrix", {
            title: "ASE decision matrix",
            description:
                "Compute the per-alternative product-sum (rating) row of a weighted " +
                "multi-criteria decision matrix. The input `matrix` is an array of rows, " +
                "one row per criterion, where each row has the shape " +
                "`[ weight, eval_1, eval_2, ..., eval_N ]` (i.e. the criterion weight " +
                "followed by N evaluation values, one per alternative). For each " +
                "alternative column j (1..N), the result is the sum over all rows K of " +
                "`weight_K * eval_K_j`. Returns a JSON `text` array of length N with " +
                "the raw, unrounded ratings (one per alternative, in the same column " +
                "order as the input).",
            inputSchema: {
                matrix: z.array(z.array(z.number()))
                    .describe("Decision matrix rows: each row is `[weight, eval_1, ..., eval_N]`")
            }
        }, async (args) => {
            try {
                const result = Skills.productSum(args.matrix)
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
