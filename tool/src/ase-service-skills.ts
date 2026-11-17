/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z }              from "zod"
import { ofetch }         from "ofetch"
import pacote             from "pacote"
import PQueue             from "p-queue"

/*  shape of a single component-info entry  */
export interface ComponentInfo {
    name:       string
    version:    string
    created:    string
    updated:    string
    repository: string
    stars:      number | "N.A."
    downloads:  number | "N.A."
    deps:       number | "N.A."
    rank:       number
}

/*  reusable functionality: gather per-package metadata with maximum parallelism  */
export class Skills {
    /*  HTTP timeout for the GitHub/npm-downloads side calls  */
    private static readonly HTTP_TIMEOUT_MS = 10_000

    /*  cap concurrent ofetch web requests to avoid hammering the remote
        endpoints (GitHub API, npm downloads API)  */
    private static readonly httpQueue = new PQueue({ concurrency: 4 })
    private static httpLimit<T> (fn: () => Promise<T>) {
        return Skills.httpQueue.add(fn)
    }

    /*  fetch the full registry packument for a single package  */
    private static async fetchPackument (name: string): Promise<{
        version: string, created: string, updated: string, repository: string, deps: number | "N.A."
    }> {
        try {
            const pkg = await pacote.packument(name, { fullMetadata: true }) as unknown as {
                "dist-tags"?: { latest?: string }
                time?:        Record<string, string>
                versions?:    Record<string, {
                    repository?:   { url?: string } | string
                    dependencies?: Record<string, string>
                }>
            }
            const version  = pkg["dist-tags"]?.latest ?? ""
            const time     = pkg.time ?? {}
            const verEntry = version !== "" ? pkg.versions?.[version] : undefined
            let repository = ""
            let deps: number | "N.A." = "N.A."
            if (verEntry !== undefined) {
                const r = verEntry.repository
                if (typeof r === "string")
                    repository = r
                else if (r !== undefined && typeof r.url === "string")
                    repository = r.url
                deps = Object.keys(verEntry.dependencies ?? {}).length
            }
            const created = time.created ?? ""
            const updated = version !== "" ? (time[version] ?? "") : ""
            return { version, created, updated, repository, deps }
        }
        catch {
            return { version: "", created: "", updated: "", repository: "", deps: "N.A." }
        }
    }

    /*  fetch GitHub stars given a repository URL (or empty string)  */
    private static async fetchStars (repository: string): Promise<number | "N.A."> {
        const m = /^(?:.*?:\/\/)?(?:[^@/]*@)?github\.com[:/]([^/]+\/[^/#?]+?)(?:\.git)?(?:[/#?].*)?$/.exec(repository)
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
        version: string, created: string, updated: string, repository: string, deps: number | "N.A."
    }> {
        const [ groupId, artifactId ] = coord.split(":", 2)
        if (groupId === undefined || artifactId === undefined || groupId === "" || artifactId === "")
            return { version: "", created: "", updated: "", repository: "", deps: "N.A." }
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
            let deps: number | "N.A." = "N.A."
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

                        /*  count the `<dependency>` entries of the direct
                            `<dependencies>` block, skipping `test`/`provided`
                            scopes; a `<dependencyManagement>` block is ignored
                            as it only declares versions, not real dependencies  */
                        const managed  = /<dependencyManagement>[\s\S]*?<\/dependencyManagement>/gi
                        const stripped = pom.replace(managed, "")
                        const depRe    = /<dependency>([\s\S]*?)<\/dependency>/gi
                        let count = 0
                        let dep: RegExpExecArray | null
                        while ((dep = depRe.exec(stripped)) !== null) {
                            const scope = /<scope>\s*([^<\s]+)\s*<\/scope>/i.exec(dep[1])
                            if (scope === null || (scope[1] !== "test" && scope[1] !== "provided"))
                                count++
                        }
                        deps = count
                    }
                }
                catch {
                    repository = ""
                }
            }
            return { version, created, updated, repository, deps }
        }
        catch {
            return { version: "", created: "", updated: "", repository: "", deps: "N.A." }
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
            const unit = m[2].toUpperCase()
            const mult = unit === "K" ? 1_000 : unit === "M" ? 1_000_000 : unit === "B" ? 1_000_000_000 : 1
            const n    = Math.round(base * mult)
            return Number.isFinite(n) ? n : "N.A."
        }
        catch {
            return "N.A."
        }
    }

    /*  normalize a Python distribution name (PEP 503)  */
    private static pypiName (name: string): string {
        return name.trim().replace(/[-_.]+/g, "-").toLowerCase()
    }

    /*  fetch PyPI metadata for a single distribution via the JSON API: the latest
        version, the earliest upload of its files ("updated") resp. of all release
        files ("created"), the repository from the project URLs (preferring the
        source/repository/code keys), and the direct, non-extra `requires_dist`  */
    private static async fetchPyPIInfo (name: string): Promise<{
        version: string, created: string, updated: string, repository: string, deps: number | "N.A."
    }> {
        try {
            type PyPIFile = { upload_time_iso_8601?: string }
            const pkg = await Skills.httpLimit(() => ofetch<{
                info?: {
                    version?:       string
                    home_page?:     string | null
                    project_urls?:  Record<string, string> | null
                    requires_dist?: string[] | null
                }
                releases?: Record<string, PyPIFile[]>
                urls?:     PyPIFile[]
            }>(
                `https://pypi.org/pypi/${encodeURIComponent(Skills.pypiName(name))}/json`,
                { timeout: Skills.HTTP_TIMEOUT_MS, ignoreResponseError: true }
            ))
            const info    = pkg?.info
            const version = info?.version ?? ""
            if (version === "")
                return { version: "", created: "", updated: "", repository: "", deps: "N.A." }
            const earliest = (files: PyPIFile[]) => {
                let min = ""
                for (const f of files) {
                    const t = f.upload_time_iso_8601 ?? ""
                    if (t !== "" && (min === "" || Date.parse(t) < Date.parse(min)))
                        min = t
                }
                return min
            }
            const updated = earliest(pkg?.urls ?? [])
            const first   = earliest(Object.values(pkg?.releases ?? {}).flat())
            const created = first !== "" ? first : updated
            const projectUrls = info?.project_urls ?? {}
            const urls = [
                ...Object.entries(projectUrls).filter(([ k ]) => /source|repo|code/i.test(k)).map(([ , u ]) => u),
                ...Object.values(projectUrls),
                info?.home_page ?? ""
            ].filter((u) => u !== "")
            const repository = urls.find((u) => /github\.com[:/](?!sponsors\/)[^/]+\/[^/#?]+/.test(u)) ?? urls[0] ?? ""

            /*  an absent `requires_dist` denotes a distribution without dependencies  */
            const deps = (info?.requires_dist ?? []).filter((r) => !/;.*\bextra\s*==/.test(r)).length
            return { version, created, updated, repository, deps }
        }
        catch {
            return { version: "", created: "", updated: "", repository: "", deps: "N.A." }
        }
    }

    /*  fetch last-month PyPI downloads for a single distribution from `pypistats.org`  */
    private static async fetchPyPIDownloads (name: string): Promise<number | "N.A."> {
        try {
            const data = await Skills.httpLimit(() => ofetch<{ data?: { last_month?: number } }>(
                `https://pypistats.org/api/packages/${encodeURIComponent(Skills.pypiName(name))}/recent?period=month`,
                { timeout: Skills.HTTP_TIMEOUT_MS, ignoreResponseError: true }
            ))
            const n = data?.data?.last_month
            return typeof n === "number" ? n : "N.A."
        }
        catch {
            return "N.A."
        }
    }

    /*  gather metadata for all given components with maximum parallelism,
        dispatching on the technology stack:
        -   "JavaScript"/"TypeScript": NPM registry (pacote) + GitHub stars + npm-downloads
        -   "Java"/"Kotlin":           Maven Central + GitHub stars + mvnrepository.com "Used By"
        -   "Python":                  PyPI JSON API + GitHub stars + pypistats.org downloads
        -   "Unknown":                 not supported -- return empty result  */
    static async info (
        stack:      string,
        components: string[],
        staleMonths = 18,
        smallScope  = false
    ): Promise<ComponentInfo[]> {
        /*  select the per-stack metadata and downloads fetchers  */
        const fetchers =
            stack === "JavaScript" || stack === "TypeScript" ?
                { meta: Skills.fetchPackument, downloads: Skills.fetchDownloads } :
                stack === "Java" || stack === "Kotlin" ?
                    { meta: Skills.fetchMavenInfo, downloads: Skills.fetchMavenDownloads } :
                    stack === "Python" ?
                        { meta: Skills.fetchPyPIInfo, downloads: Skills.fetchPyPIDownloads } :
                        null
        if (fetchers === null)
            return []

        /*  per component: kick off metadata and downloads in parallel,
            then stars as soon as the repository is known; across components
            everything runs concurrently via Promise.all  */
        const results = await Promise.all(components.map(async (name): Promise<ComponentInfo> => {
            const metaPromise      = fetchers.meta(name)
            const downloadsPromise = fetchers.downloads(name)
            const starsPromise     = metaPromise.then((m) => Skills.fetchStars(m.repository))
            const [ m, downloads, stars ] = await Promise.all([
                metaPromise, downloadsPromise, starsPromise
            ])
            const rank = Skills.computeRank(downloads, stars, m.created, m.updated, m.deps, staleMonths, smallScope)
            return { name, ...m, stars, downloads, rank }
        }))

        /*  sort by rank in descending order (best first)  */
        results.sort((a, b) => b.rank - a.rank)
        return results
    }

    /*  compute composite rank score from weighted metrics:
        (downloads + 1) x
        (stars + 1) x
        ([lifespan =] (updated - created)) x
        ([recentness =] 0.5 ^ ((now - updated) / halfLife))
        Numeric count metrics are shifted by `+1` so that a genuine `0`
        (e.g. a real package with zero downloads or stars) contributes a
        neutral `1` instead of collapsing the entire product to zero, while
        still ordering `0 < 1 < 2 ...`. The `"N.A."` sentinel (a metric that
        is structurally unavailable, e.g. Maven Central exposes no
        per-artifact download counts) is likewise treated as neutral `1`, so
        such stacks can still be ranked by the remaining metrics.  */
    private static computeRank (
        downloads:   number | "N.A.",
        stars:       number | "N.A.",
        created:     string,
        updated:     string,
        deps:        number | "N.A.",
        staleMonths: number,
        smallScope:  boolean
    ): number {
        const d = typeof downloads === "number" ? downloads + 1 : 1
        const s = typeof stars     === "number" ? stars     + 1 : 1
        const cMs = created !== "" ? Date.parse(created) : NaN
        const uMs = updated !== "" ? Date.parse(updated) : NaN
        const now        = Date.now()
        const msPerDay   = 1000 * 60 * 60 * 24
        const halfLife   = 365 / 2
        /*  an unavailable date-derived factor gets a neutral default: a missing lifespan
            its floor "1", a missing recentness (whose ceiling is "1") the decay value at
            one half-life ("0.5"), so a missing date is never rewarded  */
        const lifespan   = (!Number.isNaN(cMs) && !Number.isNaN(uMs)) ? Math.max(1, uMs - cMs) : 1
        const recentness = !Number.isNaN(uMs) ? 0.5 ** (Math.max(0, (now - uMs) / msPerDay) / halfLife) : 0.5
        let rank = d * s * lifespan * recentness
        /*  hard, caller-tunable staleness penalty on top of the soft
            `recentness` decay: unlike the smooth exp-decay above, this is a
            two-tier *cliff* keyed off the `staleMonths` threshold. Past the
            first tier (`staleMonths`) the rank is cut to `0.3x`, past the
            second tier (`2 x staleMonths`, i.e. long abandoned) to `0.1x`.
            A component below the first tier -- or one whose `updated` date
            is unknown -- is left unpenalized.  */
        if (!Number.isNaN(uMs)) {
            const ageMonths = (now - uMs) / msPerDay / 30
            if (ageMonths > 2 * staleMonths)
                rank *= 0.1
            else if (ageMonths > staleMonths)
                rank *= 0.3
        }
        /*  small-scope dependency-weight penalty: for a narrow, self-
            contained need, dragging in a heavy dependency tree is usually
            the wrong call, so each real component is demoted in proportion
            to its own number of *direct* dependencies (`1 / (1 + deps)`).
            A zero-dep component is left unpenalized; an unknown `deps` count
            (`"N.A."`) is treated neutrally. This only applies when the
            caller flags the need as small-scope.  */
        if (smallScope && typeof deps === "number")
            rank *= 1 / (1 + deps)
        return rank
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

/*  render the JSON-encoded result of a computation (or its error) as an MCP tool result  */
const mcpJsonResult = async (fn: () => unknown) => {
    try {
        return { content: [ { type: "text" as const, text: JSON.stringify(await fn()) } ] }
    }
    catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        return { isError: true, content: [ { type: "text" as const, text: `ERROR: ${message}` } ] }
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
                "as the `downloads` proxy. For `Python`, components are PyPI distribution names: " +
                "fetches the latest version, release timestamps, project URLs, and `requires_dist` " +
                "from the PyPI JSON API at `pypi.org`, GitHub stars (if applicable), and the " +
                "last-month downloads from `pypistats.org`. The number of *direct* dependencies " +
                "is read as `deps` (from the packument version entry for NPM, the latest POM's " +
                "`<dependencies>` block for Maven, or the non-extra `requires_dist` entries for " +
                "PyPI). Returns a JSON `text` array of " +
                "`{ name, version, created, updated, repository, stars, downloads, deps, rank }` " +
                "objects, sorted in descending order by `rank`. The `rank` applies a two-tier hard " +
                "staleness penalty keyed off `staleMonths` (0.3x past the threshold, 0.1x past twice " +
                "it) and, when `smallScope` is set, a dependency-weight penalty of `1/(1+deps)` so " +
                "dependency-heavy components sink. Failures of individual side calls are isolated " +
                "and reported as `\"N.A.\"` or empty string so every entry has the full shape.",
            inputSchema: {
                stack: z.string()
                    .describe("Technology stack: \"JavaScript\", \"TypeScript\", \"Java\", \"Kotlin\", \"Python\", or \"Unknown\""),
                components: z.array(z.string())
                    .describe("List of package names (NPM), Maven coordinates `groupId:artifactId` (Java/Kotlin), " +
                        "or distribution names (PyPI)"),
                staleMonths: z.number().optional()
                    .describe("Staleness threshold in months (default 18); a release older than this is rank-penalized"),
                smallScope: z.boolean().optional()
                    .describe("If true, penalize each component by its direct-dependency count (small-scope need)")
            }
        }, async (args) => mcpJsonResult(() => Skills.info(args.stack, args.components, args.staleMonths, args.smallScope)))
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
        }, async (args) => mcpJsonResult(() => Skills.productSum(args.matrix)))
    }
}
