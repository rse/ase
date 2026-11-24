/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import fs                   from "node:fs"
import path                 from "node:path"

import { Command, Option }  from "commander"
import { z }                from "zod"
import { ofetch }           from "ofetch"
import YAML                 from "yaml"
import writeFileAtomic      from "write-file-atomic"

import type { McpServer }   from "@modelcontextprotocol/sdk/server/mcp.js"

import { writeStdout }      from "./ase-lib-stdio.js"
import { userStateDir }     from "./ase-config-scope.js"
import pkg                  from "../package.json" with { type: "json" }

/*  the supported output formats  */
export const cveFormats = [ "md", "yaml", "json" ] as const
export type CveFormat = typeof cveFormats[number]

/*  the merged information on a vulnerability  */
export type CveScore      = { version: string, score: number, severity: string, vector: string, sources: string[] }
export type CveWeakness   = { id: string, name: string, sources: string[] }
export type CveSsvc       = {
    source: string, role: string, version: string, timestamp: string,
    exploitation: string, automatable: string, technicalImpact: string
}
export type CveProduct    = { vendor: string, product: string, versions: string[], source: string }
export type CvePackage    = { ecosystem: string, name: string, vulnerable: string, patched: string, sources: string[] }
export type CveAdvisory   = { id: string, url: string, summary: string, severity: string, source: string }
export type CveReference  = { url: string, tags: string[] }
export type CveEpss       = { score: number, percentile: number, date: string }
export type CveKev        = {
    name: string, vendor: string, product: string, description: string,
    dateAdded: string, dueDate: string, requiredAction: string, ransomware: string, notes: string, catalog: string
}
export type CveRecord = {
    id:          string
    state:       string
    assigner:    string
    title:       string
    description: string
    rejection:   string
    dates:       { reserved: string, published: string, updated: string, rejected: string }
    nvd:         { status: string, published: string, modified: string, tags: string[] } | null
    scores:      CveScore[]
    ssvc:        CveSsvc[]
    epss:        CveEpss | null
    kev:         CveKev | null
    weaknesses:  CveWeakness[]
    impacts:     string[]
    products:    CveProduct[]
    platforms:   string[]
    packages:    CvePackage[]
    advisories:  CveAdvisory[]
    solutions:   string[]
    workarounds: string[]
    exploits:    string[]
    credits:     string[]
    references:  CveReference[]
    warnings:    string[]
}

/*  the (partial) payload types of the sources  */
type Text        = { lang?: string, value?: string }
type Cvss        = { version?: string, baseScore?: number, baseSeverity?: string, vectorString?: string }
type OrgVersion  = { version?: string, status?: string, lessThan?: string, lessThanOrEqual?: string }
type OrgContainer = {
    providerMetadata?: { shortName?: string }
    title?:            string
    descriptions?:     Text[]
    rejectedReasons?:  Text[]
    metrics?:          {
        cvssV4_0?: Cvss, cvssV3_1?: Cvss, cvssV3_0?: Cvss, cvssV2_0?: Cvss,
        other?: { type?: string, content?: Record<string, unknown> }
    }[]
    problemTypes?:     { descriptions?: { cweId?: string, description?: string }[] }[]
    impacts?:          { capecId?: string, descriptions?: Text[] }[]
    affected?:         {
        vendor?: string, product?: string, packageName?: string, defaultStatus?: string,
        cpes?: string[], versions?: OrgVersion[]
    }[]
    solutions?:        Text[]
    workarounds?:      Text[]
    exploits?:         Text[]
    credits?:          Text[]
    references?:       { url?: string, tags?: string[] }[]
}
type OrgRecord = {
    cveMetadata?: {
        state?: string, assignerShortName?: string, dateReserved?: string,
        datePublished?: string, dateUpdated?: string, dateRejected?: string
    }
    containers?:  { cna?: OrgContainer, adp?: OrgContainer[] }
}
type NvdCvss     = { source?: string, baseSeverity?: string, cvssData?: Cvss }
type NvdCpeMatch = {
    vulnerable?: boolean, criteria?: string,
    versionStartIncluding?: string, versionStartExcluding?: string,
    versionEndIncluding?: string, versionEndExcluding?: string
}
type NvdCve = {
    vulnStatus?:            string
    published?:             string
    lastModified?:          string
    cveTags?:               { tags?: string[] }[]
    descriptions?:          Text[]
    metrics?:               {
        cvssMetricV40?: NvdCvss[], cvssMetricV31?: NvdCvss[],
        cvssMetricV30?: NvdCvss[], cvssMetricV2?: NvdCvss[]
    }
    weaknesses?:            { source?: string, description?: Text[] }[]
    configurations?:        { nodes?: { cpeMatch?: NvdCpeMatch[] }[] }[]
    references?:            { url?: string, tags?: string[] }[]
    cisaExploitAdd?:        string
    cisaActionDue?:         string
    cisaRequiredAction?:    string
    cisaVulnerabilityName?: string
}
type NvdResponse  = { vulnerabilities?: { cve?: NvdCve }[] }
type EpssResponse = { data?: { epss?: string, percentile?: string, date?: string }[] }
type KevEntry = {
    cveID?: string, vendorProject?: string, product?: string, vulnerabilityName?: string,
    dateAdded?: string, shortDescription?: string, requiredAction?: string, dueDate?: string,
    knownRansomwareCampaignUse?: string, notes?: string, cwes?: string[]
}
type KevCatalog = { catalogVersion?: string, vulnerabilities?: KevEntry[] }
type OsvRecord = {
    id?:         string
    summary?:    string
    details?:    string
    aliases?:    string[]
    related?:    string[]
    affected?:   {
        package?: { ecosystem?: string, name?: string },
        ranges?: { type?: string, repo?: string, events?: Record<string, string>[] }[]
    }[]
    references?: { url?: string }[]
}
type GhsaCvss = { vector_string?: string | null, score?: number | null }
type GhsaAdvisory = {
    ghsa_id?:         string
    html_url?:        string
    type?:            string
    summary?:         string
    severity?:        string
    withdrawn_at?:    string | null
    cvss_severities?: { cvss_v3?: GhsaCvss, cvss_v4?: GhsaCvss }
    cwes?:            { cwe_id?: string, name?: string }[]
    vulnerabilities?: {
        package?: { ecosystem?: string, name?: string },
        vulnerable_version_range?: string, first_patched_version?: string | null
    }[]
    references?:      string[]
    credits?:         { user?: { login?: string }, type?: string }[]
}

/*  the HTTP request parameters  */
const HTTP_TIMEOUT_MS = 10 * 1000
const KEV_TIMEOUT_MS  = 30 * 1000
const USER_AGENT      = `ase/${pkg.version} (https://ase.tools)`

/*  the CISA KEV catalog sources (official feed and its official GitHub mirror) and cache lifetime  */
const KEV_URLS = [
    "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
    "https://raw.githubusercontent.com/cisagov/kev-data/develop/known_exploited_vulnerabilities.json"
]
const KEV_TTL_MS = 6 * 60 * 60 * 1000

/*  the well-known source identifiers of NVD  */
const nvdSources: Record<string, string> = {
    "nvd@nist.gov":                         "NVD",
    "134c704f-9b21-4f2e-91b3-4a467353bcc0": "CISA-ADP"
}

/*  fetch a JSON resource, resolving to null on HTTP 404 (resource not existing),
    and retrying once on HTTP 403/429/5xx (rate limits and server errors) or network errors  */
const fetchData = async <T> (url: string, headers: Record<string, string> = {}, timeout = HTTP_TIMEOUT_MS): Promise<T | null> => {
    let reason = ""
    for (let attempt = 1; attempt <= 2; attempt++) {
        let delay = 2000
        try {
            const res = await ofetch.raw<T>(url, {
                timeout, ignoreResponseError: true, responseType: "json",
                headers: { "User-Agent": USER_AGENT, ...headers }
            })
            if (res.ok)
                return res._data ?? null
            else if (res.status === 404)
                return null
            reason = `HTTP ${res.status}`
            if (res.status !== 403 && res.status !== 429 && res.status < 500)
                break
            const retryAfter = Number.parseInt(res.headers.get("retry-after") ?? "", 10)
            if (!Number.isNaN(retryAfter))
                delay = Math.min(retryAfter * 1000, 6000)
        }
        catch (err: unknown) {
            reason = err instanceof Error ? err.message : String(err)
        }
        if (attempt < 2)
            await new Promise((resolve) => setTimeout(resolve, delay))
    }
    throw new Error(`request failed: ${reason}`)
}

/*  fetch the CISA KEV catalog: from the cache while it is fresh, else from the official
    feed or its mirror, and from the stale cache as the last resort  */
const fetchKev = async (warn: (message: string) => void): Promise<KevCatalog> => {
    const file = path.join(userStateDir(), "cve-kev.json")
    let cache: { time: number, data: KevCatalog } | null = null
    try {
        const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as { time?: unknown, data?: KevCatalog }
        if (typeof parsed.time === "number" && parsed.data !== undefined)
            cache = { time: parsed.time, data: parsed.data }
    }
    catch {
        cache = null
    }
    if (cache !== null && Math.abs(Date.now() - cache.time) < KEV_TTL_MS)
        return cache.data
    const reasons: string[] = []
    for (const url of KEV_URLS) {
        try {
            const data = await fetchData<KevCatalog>(url, {}, KEV_TIMEOUT_MS)
            if (data === null || !Array.isArray(data.vulnerabilities))
                throw new Error("no valid catalog")
            try {
                fs.mkdirSync(path.dirname(file), { recursive: true })
                writeFileAtomic.sync(file, JSON.stringify({ time: Date.now(), data }) + "\n")
            }
            catch {
                /*  caching is best-effort only  */
            }
            return data
        }
        catch (err: unknown) {
            reasons.push(`${new URL(url).hostname}: ${err instanceof Error ? err.message : String(err)}`)
        }
    }
    if (cache === null)
        throw new Error(reasons.join("; "))
    warn(`using stale cached catalog, as refreshing failed (${reasons.join("; ")})`)
    return cache.data
}

/*  fetch the OSV.dev record of the CVE id, plus the records of its foreign
    aliases (like PYSEC-xxx or GO-xxx), which carry the package-level information  */
const fetchOsv = async (id: string): Promise<OsvRecord[] | null> => {
    const record = await fetchData<OsvRecord>(`https://api.osv.dev/v1/vulns/${id}`)
    if (record === null)
        return null
    const aliases = (record.aliases ?? []).filter((alias) => !/^(?:CVE|GHSA)-/.test(alias)).slice(0, 10)
    const others  = await Promise.all(aliases.map((alias) =>
        fetchData<OsvRecord>(`https://api.osv.dev/v1/vulns/${encodeURIComponent(alias)}`).catch(() => null)))
    return [ record, ...others.filter((other) => other !== null) ]
}

/*  small helpers for normalizing the payloads  */
const str     = (value: unknown): string => typeof value === "string" ? value : ""
const oneLine = (text: string): string => text.replace(/\s+/g, " ").trim()
const english = (texts?: Text[]): string =>
    (texts?.find((text) => text.lang?.startsWith("en")) ?? texts?.[0])?.value?.trim() ?? ""
const uniq    = (list: string[], item: string): void => {
    if (item !== "" && !list.includes(item))
        list.push(item)
}

/*  the qualitative severity rating of a CVSS base score  */
const severityOf = (version: string, score: number): string => {
    if (version.startsWith("2"))
        return score >= 7 ? "HIGH" : score >= 4 ? "MEDIUM" : "LOW"
    else
        return score >= 9 ? "CRITICAL" : score >= 7 ? "HIGH" : score >= 4 ? "MEDIUM" : score > 0 ? "LOW" : "NONE"
}

/*  the textual range of a version entry of a CVE.org "affected" entry  */
const versionOf = (v: OrgVersion): string => {
    const range = v.lessThan !== undefined ?
        `>= ${v.version ?? "0"}, < ${v.lessThan}` :
        v.lessThanOrEqual !== undefined ?
            `>= ${v.version ?? "0"}, <= ${v.lessThanOrEqual}` :
            `= ${v.version ?? "*"}`
    return `${v.status ?? "affected"}: ${range}`
}

/*  the CPE name of an NVD CPE match, with its version range  */
const cpeOf = (m: NvdCpeMatch): string => {
    const bounds = [
        m.versionStartIncluding !== undefined ? `>= ${m.versionStartIncluding}` : "",
        m.versionStartExcluding !== undefined ? `> ${m.versionStartExcluding}`  : "",
        m.versionEndIncluding   !== undefined ? `<= ${m.versionEndIncluding}`   : "",
        m.versionEndExcluding   !== undefined ? `< ${m.versionEndExcluding}`    : ""
    ].filter((bound) => bound !== "")
    return bounds.length > 0 ? `${m.criteria ?? ""} (${bounds.join(", ")})` : m.criteria ?? ""
}

/*  the vulnerable ranges and the fixing versions of the events of an OSV range  */
const rangeOf = (events: Record<string, string>[]): { vulnerable: string, patched: string } => {
    const ranges: string[] = []
    const fixed:  string[] = []
    let lower: string | null = null
    for (const event of events) {
        if (event.introduced !== undefined)
            lower = event.introduced === "0" ? "" : `>= ${event.introduced}`
        else if (lower !== null) {
            const upper = event.fixed !== undefined ? `< ${event.fixed}` :
                event.last_affected !== undefined ? `<= ${event.last_affected}` :
                    event.limit !== undefined ? `< ${event.limit}` : ""
            ranges.push([ lower, upper ].filter((bound) => bound !== "").join(", "))
            lower = null
        }
        if (event.fixed !== undefined)
            fixed.push(event.fixed)
    }
    if (lower !== null)
        ranges.push(lower === "" ? "*" : lower)
    return { vulnerable: ranges.join(" || "), patched: fixed.join(", ") }
}

/*  the SSVC decisions of a CVE.org "other" metric of type "ssvc"  */
const ssvcOf = (source: string, content: Record<string, unknown> = {}): CveSsvc => {
    const decisions: Record<string, string> = {}
    const options = Array.isArray(content.options) ? content.options as Record<string, unknown>[] : []
    for (const option of options)
        for (const [ key, value ] of Object.entries(option))
            decisions[key.toLowerCase().replace(/\s+/g, "")] = str(value)
    return {
        source,
        role:            str(content.role),
        version:         str(content.version),
        timestamp:       str(content.timestamp),
        exploitation:    decisions.exploitation    ?? "",
        automatable:     decisions.automatable     ?? "",
        technicalImpact: decisions.technicalimpact ?? ""
    }
}

/*  gather the information on a vulnerability from all sources and merge it into one record  */
export const cve = async (cveId: string): Promise<CveRecord> => {
    const id = cveId.trim().toUpperCase()
    if (!/^CVE-\d{4}-\d{4,}$/.test(id))
        throw new Error(`cve: invalid CVE id "${cveId}" (expected "CVE-YYYY-NNNN")`)

    /*  query all sources in parallel, degrading each failed source to a warning  */
    const warnings: string[] = []
    const query = async <T> (source: string, fn: () => Promise<T | null>): Promise<T | null> =>
        fn().catch((err: unknown) => {
            warnings.push(`${source}: ${err instanceof Error ? err.message : String(err)}`)
            return null
        })
    const [ org, nvd, epss, kevCatalog, osv, ghsa ] = await Promise.all([
        query("CVE.org", () => fetchData<OrgRecord>(`https://cveawg.mitre.org/api/cve/${id}`)),
        query("NVD",     async () => (await fetchData<NvdResponse>(
            `https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=${id}`))?.vulnerabilities?.[0]?.cve ?? null),
        query("EPSS",    async () => (await fetchData<EpssResponse>(
            `https://api.first.org/data/v1/epss?cve=${id}`))?.data?.[0] ?? null),
        query("KEV",     () => fetchKev((message) => warnings.push(`KEV: ${message}`))),
        query("OSV",     () => fetchOsv(id)),
        query("GitHub",  () => fetchData<GhsaAdvisory[]>(`https://api.github.com/advisories?cve_id=${id}`,
            { "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" }))
    ])
    const advisories = Array.isArray(ghsa) ? ghsa : []
    if (org === null && nvd === null && epss === null && osv === null && advisories.length === 0) {
        if (warnings.length > 0)
            throw new Error(`cve: no information available on "${id}": ${warnings.join("; ")}`)
        else
            throw new Error(`cve: no information found on "${id}" (unknown or RESERVED CVE id)`)
    }

    /*  prepare the record and its merging helpers  */
    const meta = org?.cveMetadata
    const record: CveRecord = {
        id,
        state:       meta?.state ?? (nvd?.vulnStatus === "Rejected" ? "REJECTED" : nvd !== null ? "PUBLISHED" : ""),
        assigner:    meta?.assignerShortName ?? "",
        title:       "",
        description: "",
        rejection:   english(org?.containers?.cna?.rejectedReasons),
        dates: {
            reserved:  meta?.dateReserved  ?? "",
            published: meta?.datePublished ?? "",
            updated:   meta?.dateUpdated   ?? "",
            rejected:  meta?.dateRejected  ?? ""
        },
        nvd: nvd === null ? null : {
            status:    nvd.vulnStatus   ?? "",
            published: nvd.published    ?? "",
            modified:  nvd.lastModified ?? "",
            tags:      (nvd.cveTags ?? []).flatMap((tag) => tag.tags ?? [])
        },
        scores: [], ssvc: [], epss: null, kev: null, weaknesses: [], impacts: [], products: [],
        platforms: [], packages: [], advisories: [], solutions: [], workarounds: [], exploits: [],
        credits: [], references: [], warnings
    }
    const scores     = new Map<string, CveScore>()
    const weaknesses = new Map<string, CveWeakness>()
    const packages   = new Map<string, CvePackage>()
    const references = new Map<string, CveReference>()
    const advisoryOf = new Map<string, CveAdvisory>()
    const addScore = (source: string, cvss?: Cvss): void => {
        if (cvss?.baseScore === undefined || cvss.vectorString === undefined || cvss.vectorString === "")
            return
        const version = cvss.version ?? /^CVSS:(\d\.\d)\//.exec(cvss.vectorString)?.[1] ?? "2.0"
        const key     = `${version} ${cvss.vectorString}`
        const entry   = scores.get(key) ?? {
            version, score: cvss.baseScore, vector: cvss.vectorString,
            severity: cvss.baseSeverity ?? severityOf(version, cvss.baseScore), sources: []
        }
        uniq(entry.sources, source)
        scores.set(key, entry)
    }
    const addWeakness = (source: string, cweId?: string, name?: string): void => {
        const wid = cweId ?? /^(CWE-\d+)/.exec(name ?? "")?.[1] ?? ""
        if (wid === "")
            return
        const entry = weaknesses.get(wid) ?? { id: wid, name: "", sources: [] }
        if (entry.name === "" && name !== undefined)
            entry.name = name.replace(/^CWE-\d+:?\s*/, "")
        uniq(entry.sources, source)
        weaknesses.set(wid, entry)
    }
    const addPackage = (source: string, ecosystem: string, name: string, vulnerable: string, patched: string): void => {
        const key   = `${ecosystem} ${name} ${vulnerable}`
        const entry = packages.get(key) ?? { ecosystem, name, vulnerable, patched, sources: [] }
        uniq(entry.sources, source)
        packages.set(key, entry)
    }
    const addReference = (url?: string, tags: string[] = []): void => {
        if (url === undefined || url === "")
            return
        const entry = references.get(url) ?? { url, tags: [] }
        for (const tag of tags)
            uniq(entry.tags, tag)
        references.set(url, entry)
    }
    const addAdvisory = (advisory: CveAdvisory): void => {
        const entry = advisoryOf.get(advisory.id)
        if (entry === undefined)
            advisoryOf.set(advisory.id, advisory)
        else if (entry.summary === "")
            entry.summary = advisory.summary
    }

    /*  merge CVE.org: the CNA container and the ADP containers (like CISA Vulnrichment)  */
    const cna = org?.containers?.cna
    const containers = [
        ...(cna !== undefined ? [ { source: record.assigner !== "" ? record.assigner : "CNA", container: cna } ] : []),
        ...(org?.containers?.adp ?? []).map((adp) => ({ source: adp.providerMetadata?.shortName ?? "ADP", container: adp }))
    ]
    record.title       = cna?.title ?? ""
    record.description = english(cna?.descriptions)
    for (const { source, container } of containers) {
        for (const metric of container.metrics ?? []) {
            for (const cvss of [ metric.cvssV4_0, metric.cvssV3_1, metric.cvssV3_0, metric.cvssV2_0 ])
                addScore(source, cvss)
            if (metric.other?.type === "ssvc")
                record.ssvc.push(ssvcOf(source, metric.other.content))
        }
        for (const problemType of container.problemTypes ?? [])
            for (const description of problemType.descriptions ?? [])
                addWeakness(source, description.cweId, description.description)
        for (const impact of container.impacts ?? [])
            uniq(record.impacts, oneLine(`${impact.capecId ?? ""} ${english(impact.descriptions)}`))
        for (const affected of container.affected ?? []) {
            const versions = (affected.versions ?? []).map((version) => versionOf(version))
            if (affected.defaultStatus !== undefined)
                versions.push(`default: ${affected.defaultStatus}`)
            record.products.push({
                vendor: affected.vendor ?? "", product: affected.product ?? affected.packageName ?? "",
                versions, source
            })
            for (const cpe of affected.cpes ?? [])
                uniq(record.platforms, cpe)
        }
        for (const [ list, texts ] of [ [ record.solutions, container.solutions ], [ record.workarounds, container.workarounds ],
            [ record.exploits, container.exploits ], [ record.credits, container.credits ] ] as [ string[], Text[] | undefined ][])
            for (const text of texts ?? [])
                uniq(list, oneLine(text.value ?? ""))
        for (const reference of container.references ?? [])
            addReference(reference.url, reference.tags)
    }

    /*  merge NVD: its own analysis plus the scores of the CNA and ADPs  */
    if (nvd !== null) {
        if (record.description === "")
            record.description = english(nvd.descriptions)
        const metrics = nvd.metrics ?? {}
        for (const list of [ metrics.cvssMetricV40, metrics.cvssMetricV31, metrics.cvssMetricV30, metrics.cvssMetricV2 ])
            for (const metric of list ?? [])
                addScore(nvdSources[metric.source ?? ""] ?? metric.source ?? "NVD",
                    { ...metric.cvssData, baseSeverity: metric.cvssData?.baseSeverity ?? metric.baseSeverity })
        for (const weakness of nvd.weaknesses ?? [])
            for (const description of weakness.description ?? [])
                addWeakness(nvdSources[weakness.source ?? ""] ?? weakness.source ?? "NVD", description.value)
        for (const configuration of nvd.configurations ?? [])
            for (const node of configuration.nodes ?? [])
                for (const match of node.cpeMatch ?? [])
                    if (match.vulnerable === true && match.criteria !== undefined)
                        uniq(record.platforms, cpeOf(match))
        for (const reference of nvd.references ?? [])
            addReference(reference.url, reference.tags)
    }

    /*  merge FIRST EPSS  */
    if (epss !== null)
        record.epss = { score: Number(epss.epss ?? 0), percentile: Number(epss.percentile ?? 0), date: epss.date ?? "" }

    /*  merge CISA KEV, falling back to the KEV information of NVD  */
    const kev = kevCatalog?.vulnerabilities?.find((entry) => entry.cveID === id)
    if (kev !== undefined) {
        record.kev = {
            name:           kev.vulnerabilityName ?? "",
            vendor:         kev.vendorProject ?? "",
            product:        kev.product ?? "",
            description:    kev.shortDescription ?? "",
            dateAdded:      kev.dateAdded ?? "",
            dueDate:        kev.dueDate ?? "",
            requiredAction: kev.requiredAction ?? "",
            ransomware:     kev.knownRansomwareCampaignUse ?? "",
            notes:          kev.notes ?? "",
            catalog:        kevCatalog?.catalogVersion ?? ""
        }
        for (const cwe of kev.cwes ?? [])
            addWeakness("CISA-KEV", cwe)
    }
    else if (nvd?.cisaExploitAdd !== undefined) {
        record.kev = {
            name:           nvd.cisaVulnerabilityName ?? "",
            vendor:         "",
            product:        "",
            description:    "",
            dateAdded:      nvd.cisaExploitAdd,
            dueDate:        nvd.cisaActionDue ?? "",
            requiredAction: nvd.cisaRequiredAction ?? "",
            ransomware:     "",
            notes:          "",
            catalog:        "(via NVD)"
        }
    }

    /*  merge OSV.dev: aliases, related advisories, and package-level information  */
    for (const entry of osv ?? []) {
        if (entry.id !== undefined && entry.id !== id)
            addAdvisory({
                id: entry.id, url: `https://osv.dev/vulnerability/${entry.id}`,
                summary: oneLine(entry.summary ?? ""), severity: "", source: "OSV"
            })
        for (const other of [ ...(entry.aliases ?? []), ...(entry.related ?? []) ])
            if (other !== id)
                addAdvisory({ id: other, url: `https://osv.dev/vulnerability/${other}`, summary: "", severity: "", source: "OSV" })
        for (const affected of entry.affected ?? []) {
            for (const range of affected.ranges ?? []) {
                const { vulnerable, patched } = rangeOf(range.events ?? [])
                if (range.type === "GIT")
                    addPackage(entry.id ?? "OSV", "Git", range.repo ?? "", vulnerable, patched)
                else if (affected.package !== undefined)
                    addPackage(entry.id ?? "OSV", affected.package.ecosystem ?? "", affected.package.name ?? "", vulnerable, patched)
            }
        }
        for (const reference of entry.references ?? [])
            addReference(reference.url)
        if (record.title === "")
            record.title = oneLine(entry.summary ?? "")
        if (record.description === "")
            record.description = entry.details?.trim() ?? ""
    }

    /*  merge GitHub Advisory Database: reviewed advisories with package-level information  */
    for (const advisory of advisories) {
        const ghsaId = advisory.ghsa_id ?? "GHSA"
        addAdvisory({
            id: ghsaId, url: advisory.html_url ?? "",
            summary: oneLine(advisory.summary ?? "") + (advisory.withdrawn_at ? ` (withdrawn ${advisory.withdrawn_at})` : ""),
            severity: advisory.severity ?? "", source: `GitHub (${advisory.type ?? "advisory"})`
        })
        for (const cvss of [ advisory.cvss_severities?.cvss_v4, advisory.cvss_severities?.cvss_v3 ])
            if (cvss?.score && cvss.vector_string)
                addScore("GitHub", { baseScore: cvss.score, vectorString: cvss.vector_string })
        for (const cwe of advisory.cwes ?? [])
            addWeakness("GitHub", cwe.cwe_id, cwe.name)
        for (const vulnerability of advisory.vulnerabilities ?? [])
            addPackage(ghsaId, vulnerability.package?.ecosystem ?? "", vulnerability.package?.name ?? "",
                vulnerability.vulnerable_version_range ?? "", vulnerability.first_patched_version ?? "")
        for (const credit of advisory.credits ?? [])
            uniq(record.credits, `${credit.user?.login ?? ""} (${credit.type ?? "credit"})`)
        for (const url of advisory.references ?? [])
            addReference(url)
        if (record.title === "")
            record.title = oneLine(advisory.summary ?? "")
    }

    /*  finalize the record  */
    record.scores     = [ ...scores.values() ].sort((a, b) =>
        b.version.localeCompare(a.version) || b.score - a.score)
    record.weaknesses = [ ...weaknesses.values() ]
    record.packages   = [ ...packages.values() ]
    record.advisories = [ ...advisoryOf.values() ]
    record.references = [ ...references.values() ]
    return record
}

/*  render a record as Markdown  */
const renderMarkdown = (r: CveRecord): string => {
    const out: string[] = []
    const day     = (date: string): string => date.slice(0, 10)
    const cell    = (text: string): string => oneLine(text).replace(/\|/g, "\\|")
    const section = (title: string, lines: string[]): void => {
        if (lines.length > 0)
            out.push(`##  ${title}`, "", ...lines, "")
    }
    const dates = Object.entries(r.dates).filter(([ , date ]) => date !== "").map(([ kind, date ]) => `${kind} ${day(date)}`)
    out.push(`#   ${r.id}${r.title !== "" ? `: ${oneLine(r.title)}` : ""}`, "")
    out.push(`-   **State**: ${r.state !== "" ? r.state : "unknown"}${r.assigner !== "" ? ` (assigner: ${r.assigner})` : ""}`)
    if (dates.length > 0)
        out.push(`-   **Dates**: ${dates.join(", ")}`)
    if (r.nvd !== null)
        out.push(`-   **NVD Status**: ${r.nvd.status} (published ${day(r.nvd.published)}, modified ${day(r.nvd.modified)})` +
            (r.nvd.tags.length > 0 ? `, tags: ${r.nvd.tags.join(", ")}` : ""))
    out.push("")
    section("Description", r.description !== "" ? [ r.description ] : [])
    section("Rejection", r.rejection !== "" ? [ r.rejection ] : [])
    section("Severity", r.scores.length === 0 ? [] : [
        "| CVSS | Score | Severity | Vector | Sources |",
        "| ---- | ----- | -------- | ------ | ------- |",
        ...r.scores.map((s) => `| ${s.version} | ${s.score.toFixed(1)} | ${s.severity} | \`${s.vector}\` | ${cell(s.sources.join(", "))} |`)
    ])
    const exploitation: string[] = []
    if (r.epss !== null)
        exploitation.push(`-   **EPSS**: ${r.epss.score.toFixed(5)} probability of exploitation within 30 days ` +
            `(percentile ${r.epss.percentile.toFixed(5)}, scored ${r.epss.date})`)
    else
        exploitation.push("-   **EPSS**: not scored")
    if (r.kev !== null) {
        exploitation.push(`-   **CISA KEV**: known exploited, added ${r.kev.dateAdded}, due ${r.kev.dueDate}` +
            (r.kev.ransomware !== "" ? `, ransomware use: ${r.kev.ransomware}` : "") +
            (r.kev.catalog !== "" ? ` (catalog ${r.kev.catalog})` : ""))
        for (const [ label, value ] of [ [ "Name", r.kev.name ], [ "Product", oneLine(`${r.kev.vendor} ${r.kev.product}`) ],
            [ "Description", r.kev.description ], [ "Required Action", r.kev.requiredAction ], [ "Notes", r.kev.notes ] ])
            if (value !== "")
                exploitation.push(`    -   ${label}: ${oneLine(value)}`)
    }
    else
        exploitation.push("-   **CISA KEV**: not listed")
    for (const s of r.ssvc)
        exploitation.push(`-   **SSVC** (${s.source}, ${s.role} ${s.version}, ${day(s.timestamp)}): ` +
            `exploitation ${s.exploitation}, automatable ${s.automatable}, technical impact ${s.technicalImpact}`)
    section("Exploitation", exploitation)
    section("Weaknesses", r.weaknesses.map((w) => `-   ${w.id}${w.name !== "" ? `: ${w.name}` : ""} (${w.sources.join(", ")})`))
    section("Impacts", r.impacts.map((impact) => `-   ${impact}`))
    section("Affected Products", r.products.flatMap((p) => [
        `-   ${oneLine(`${p.vendor} ${p.product}`)} (${p.source})`,
        ...p.versions.map((version) => `    -   ${version}`)
    ]))
    section("Affected Packages", r.packages.length === 0 ? [] : [
        "| Ecosystem | Package | Vulnerable | Patched | Sources |",
        "| --------- | ------- | ---------- | ------- | ------- |",
        ...r.packages.map((p) => `| ${cell(p.ecosystem)} | ${cell(p.name)} | ${cell(p.vulnerable)} | ` +
            `${cell(p.patched)} | ${cell(p.sources.join(", "))} |`)
    ])
    section("Affected Platforms", r.platforms.map((platform) => `-   \`${platform}\``))
    section("Solutions", r.solutions.map((text) => `-   ${text}`))
    section("Workarounds", r.workarounds.map((text) => `-   ${text}`))
    section("Exploits", r.exploits.map((text) => `-   ${text}`))
    section("Advisories", r.advisories.length === 0 ? [] : [
        "| Advisory | Source | Severity | Summary |",
        "| -------- | ------ | -------- | ------- |",
        ...r.advisories.map((a) => `| ${a.url !== "" ? `[${a.id}](${a.url})` : a.id} | ${cell(a.source)} | ` +
            `${cell(a.severity)} | ${cell(a.summary)} |`)
    ])
    section("Credits", r.credits.map((credit) => `-   ${credit}`))
    section("References", r.references.map((ref) => `-   <${ref.url}>${ref.tags.length > 0 ? ` (${ref.tags.join(", ")})` : ""}`))
    section("Warnings", r.warnings.map((warning) => `-   ${oneLine(warning)}`))
    return out.join("\n").replace(/\n+$/, "\n")
}

/*  render a record in one of the output formats  */
export const renderCve = (record: CveRecord, format: CveFormat): string => {
    if (format === "json")
        return JSON.stringify(record, null, 4) + "\n"
    else if (format === "yaml")
        return YAML.stringify(record, { indent: 4, lineWidth: 0 })
    else
        return renderMarkdown(record)
}

/*  CLI command "ase util cve"  */
export default class CveCommand {
    /*  register commands  */
    register (program: Command): void {
        program
            .command("cve")
            .description("Gather all information on a vulnerability by its CVE id")
            .addOption(new Option("-f, --format <format>", "output format")
                .choices(cveFormats).default("md"))
            .argument("<cve-id>", "CVE id of the vulnerability (CVE-YYYY-NNNN)")
            .action(async (cveId: string, opts: { format: CveFormat }) => {
                const record = await cve(cveId)
                for (const warning of record.warnings)
                    process.stderr.write(`ase util cve: WARNING: ${warning}\n`)
                await writeStdout(renderCve(record, opts.format))
            })
    }
}

/*  render a caught error as an MCP tool error result  */
const mcpToolError = (err: unknown) => ({
    isError: true,
    content: [ { type: "text" as const, text: `ERROR: ${err instanceof Error ? err.message : String(err)}` } ]
})

/*  MCP registration entry point for CVE tool  */
export class CveMCP {
    register (mcp: McpServer): void {
        mcp.registerTool("ase_cve", {
            title: "ASE CVE",
            description:
                "Gather all available information on a vulnerability, given by its CVE `id` " +
                "(like `CVE-2021-44228`), from CVE.org (the CVE record of the CNA and the ADPs, " +
                "including CISA SSVC decisions), NIST NVD (its analysis, CVSS scores, CWE weaknesses, " +
                "and CPE platforms), FIRST EPSS (exploitation probability), CISA KEV (known exploited " +
                "vulnerabilities catalog), OSV.dev, and the GitHub Advisory Database (affected and " +
                "patched package versions), merged into one record. " +
                "Returns the record as `text` in the `format` `md` (Markdown), `yaml`, or `json`. " +
                "A source which cannot be queried is reported in the `warnings` of the record. " +
                "An unknown or RESERVED CVE id results in an error. " +
                "You MUST call this tool whenever details of a CVE are needed, instead of relying " +
                "on your own knowledge, as vulnerability information changes frequently.",
            inputSchema: {
                id: z.string()
                    .describe("CVE id of the vulnerability, like `CVE-2021-44228`"),
                format: z.enum(cveFormats).default("md")
                    .describe("output format: `md` (Markdown), `yaml`, or `json`, default `md`")
            }
        }, async (args) => {
            try {
                const record = await cve(args.id)
                return {
                    content: [ { type: "text", text: renderCve(record, args.format) } ]
                }
            }
            catch (err: unknown) {
                return mcpToolError(err)
            }
        })
    }
}
