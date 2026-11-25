/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import fs                   from "node:fs"
import path                 from "node:path"

import { Command, Option }  from "commander"
import { z }                from "zod"
import { execaSync }        from "execa"
import picomatch            from "picomatch"
import semver               from "semver"
import YAML                 from "yaml"

import type { McpServer }   from "@modelcontextprotocol/sdk/server/mcp.js"

import { writeStdout }      from "./ase-lib-stdio.js"
import { Task }             from "./ase-task.js"
import { Artifact }         from "./ase-artifact.js"

/*  the supported output formats  */
export const vexFormats = [ "md", "yaml", "json" ] as const
export type VexFormat = typeof vexFormats[number]

/*  the verdicts on the published status of the project  */
export type VexVerdict = "NOT-AFFECTED" | "AFFECTED" | "FIXED" | "UNDER-INVESTIGATION" | "UNKNOWN"

/*  the result of determining the published status of the project  */
export type VexStatement = {
    verdict: VexVerdict, status: string, product: string, detail: string, timestamp: string,
    file: string, format: string
}
export type VexDocument = { file: string, format: string }
export type VexRecord = {
    id:         string
    verdict:    VexVerdict
    project:    { root: string, identities: string[], version: string }
    documents:  VexDocument[]
    statements: VexStatement[]
    warnings:   string[]
}

/*  the conventional names of the VEX documents in a project  */
const vexFiles = picomatch([
    "**/*.vex.json", "**/*.openvex.json", "**/*.cdx.json", "**/bom.json", "**/*.csaf.json",
    "**/*.spdx.json", "**/*.spdx3.json", "**/*.jsonld", "**/{.vex,vex,.openvex,openvex,csaf}/**/*.json"
], { dot: true })

/*  the mappings of the statuses of the formats onto the verdicts
    (CSAF "recommended" is no exploitability statement and hence ignored)  */
const openvexVerdicts = new Map<string, VexVerdict>([
    [ "not_affected",           "NOT-AFFECTED"        ],
    [ "affected",               "AFFECTED"            ],
    [ "fixed",                  "FIXED"               ],
    [ "under_investigation",    "UNDER-INVESTIGATION" ]
])
const cyclonedxVerdicts = new Map<string, VexVerdict>([
    [ "not_affected",           "NOT-AFFECTED"        ],
    [ "false_positive",         "NOT-AFFECTED"        ],
    [ "exploitable",            "AFFECTED"            ],
    [ "resolved",               "FIXED"               ],
    [ "resolved_with_pedigree", "FIXED"               ],
    [ "in_triage",              "UNDER-INVESTIGATION" ]
])
const csafVerdicts = new Map<string, VexVerdict>([
    [ "known_not_affected",     "NOT-AFFECTED"        ],
    [ "known_affected",         "AFFECTED"            ],
    [ "first_affected",         "AFFECTED"            ],
    [ "last_affected",          "AFFECTED"            ],
    [ "fixed",                  "FIXED"               ],
    [ "first_fixed",            "FIXED"               ],
    [ "under_investigation",    "UNDER-INVESTIGATION" ],
    [ "unknown",                "UNKNOWN"             ]
])
const spdxVerdicts = new Map<string, VexVerdict>([
    [ "doesNotAffect",          "NOT-AFFECTED"        ],
    [ "affects",                "AFFECTED"            ],
    [ "fixedIn",                "FIXED"               ],
    [ "underInvestigationFor",  "UNDER-INVESTIGATION" ]
])

/*  the precedence of the verdicts of equally recent statements (worst case first)  */
const verdictRank: Record<VexVerdict, number> = {
    "AFFECTED": 4, "UNDER-INVESTIGATION": 3, "UNKNOWN": 2, "FIXED": 1, "NOT-AFFECTED": 0
}

/*  small helpers for accessing the untyped payloads of the documents  */
type Obj = Record<string, unknown>
const obj  = (value: unknown): Obj => typeof value === "object" && value !== null && !Array.isArray(value) ? value as Obj : {}
const arr  = (value: unknown): unknown[] => Array.isArray(value) ? value : []
const str  = (value: unknown): string => typeof value === "string" ? value : ""
const isId = (value: unknown, id: string): boolean => str(value).trim().toUpperCase() === id
const decode = (text: string): string => {
    try {
        return decodeURIComponent(text)
    }
    catch {
        return text
    }
}

/*  split a Package URL (PURL) into its normalized base (without version,
    qualifiers, and subpath) and its version, or null for a non-PURL  */
const purlOf = (purl: string): { base: string, version: string } | null => {
    if (!/^pkg:/i.test(purl))
        return null
    let base    = purl.replace(/[?#].*$/, "")
    let version = ""
    const at = base.lastIndexOf("@")
    if (at > base.lastIndexOf("/")) {
        version = decode(base.slice(at + 1))
        base    = base.slice(0, at)
    }
    return { base: decode(base).replace(/^pkg:\/*/i, "pkg:").toLowerCase(), version }
}

/*  compare two versions, semantically if possible  */
const compareVersions = (a: string, b: string): number =>
    semver.valid(a) !== null && semver.valid(b) !== null ? semver.compare(a, b) : a.localeCompare(b, undefined, { numeric: true })

/*  check whether a version is within a range, given in the "vers" syntax
    (like "vers:semver/>=1.0.0|<2.0.0") or as a plain semver range  */
const inRange = (version: string, range: string): boolean => {
    const m = /^vers:[^/]+\/(.*)$/i.exec(range.trim())
    if (m === null)
        return semver.valid(version) !== null && semver.validRange(range) !== null && semver.satisfies(version, range)
    const constraints = m[1].split("|").map((c) => c.trim()).filter((c) => c !== "")
    if (constraints.includes("*"))
        return true
    const parsed = constraints.map((c) => {
        const mm = /^(>=|<=|!=|<|>|=)?(.+)$/.exec(c)!
        return { op: mm[1] ?? "=", version: decode(mm[2]) }
    })
    if (parsed.some((c) => c.op === "=" && compareVersions(version, c.version) === 0))
        return true
    if (parsed.some((c) => c.op === "!=" && compareVersions(version, c.version) === 0))
        return false
    const bounds  = parsed.filter((c) => c.op !== "=" && c.op !== "!=")
        .sort((a, b) => compareVersions(a.version, b.version))
    const lower   = (c: { op: string }): boolean => c.op === ">" || c.op === ">="
    const upper   = (c: { op: string }): boolean => c.op === "<" || c.op === "<="
    const holds   = (c: { op: string, version: string }): boolean => {
        const r = compareVersions(version, c.version)
        return c.op === "<" ? r < 0 : c.op === "<=" ? r <= 0 : c.op === ">" ? r > 0 : r >= 0
    }
    if (bounds.length === 0)
        return false
    if (upper(bounds[0]) && holds(bounds[0]))
        return true
    if (lower(bounds[bounds.length - 1]) && holds(bounds[bounds.length - 1]))
        return true
    for (let i = 0; i < bounds.length - 1; i++)
        if (lower(bounds[i]) && upper(bounds[i + 1]) && holds(bounds[i]) && holds(bounds[i + 1]))
            return true
    return false
}

/*  the collector of the statements found by the format parsers, which
    returns whether the statement concerns the project and was taken  */
type Collect = (purl: string, version: string, range: string,
    status: string, verdict: VexVerdict, detail: string, timestamp: string) => boolean

/*  parse an OpenVEX document  */
const parseOpenVex = (doc: Obj, id: string, collect: Collect): void => {
    const docTime = str(doc.last_updated) || str(doc.timestamp)
    for (const item of arr(doc.statements)) {
        const statement = obj(item)
        const vuln = typeof statement.vulnerability === "string" ?
            { name: statement.vulnerability } as Obj : obj(statement.vulnerability)
        if (![ vuln.name, vuln["@id"], ...arr(vuln.aliases) ].some((name) => isId(name, id)))
            continue
        const status  = str(statement.status)
        const verdict = openvexVerdicts.get(status)
        if (verdict === undefined)
            continue
        const detail = str(statement.justification) || str(statement.impact_statement) || str(statement.action_statement)
        const time   = str(statement.last_updated) || str(statement.timestamp) || docTime
        for (const item of arr(statement.products)) {
            const product = typeof item === "string" ? { "@id": item } as Obj : obj(item)
            for (const purl of new Set([ str(product["@id"]), str(obj(product.identifiers).purl) ]))
                collect(purl, "", "", status, verdict, detail, time)
        }
    }
}

/*  parse a CycloneDX document, resolving the "affects" references via the components  */
const parseCycloneDx = (doc: Obj, id: string, collect: Collect): void => {
    const refs = new Map<string, string>()
    const walk = (item: unknown): void => {
        const component = obj(item)
        if (str(component["bom-ref"]) !== "" && str(component.purl) !== "")
            refs.set(str(component["bom-ref"]), str(component.purl))
        for (const child of arr(component.components))
            walk(child)
    }
    walk(obj(doc.metadata).component)
    for (const component of arr(doc.components))
        walk(component)
    const docTime = str(obj(doc.metadata).timestamp)
    for (const item of arr(doc.vulnerabilities)) {
        const vuln = obj(item)
        if (![ vuln.id, ...arr(vuln.references).map((ref) => obj(ref).id) ].some((name) => isId(name, id)))
            continue
        const analysis = obj(vuln.analysis)
        const state    = str(analysis.state)
        const verdict  = cyclonedxVerdicts.get(state)
        if (verdict === undefined)
            continue
        const detail = str(analysis.justification) || str(analysis.detail) || arr(analysis.response).map(str).join(", ")
        const time   = str(analysis.lastUpdated) || str(analysis.firstIssued)
            || str(vuln.updated) || str(vuln.published) || docTime
        for (const affect of arr(vuln.affects).map(obj)) {
            const ref  = decode(str(affect.ref).replace(/^urn:cdx:[^#]*#/, ""))
            const purl = refs.get(ref) ?? (/^pkg:/i.test(ref) ? ref : "")
            const versions = arr(affect.versions).map(obj)
            if (versions.length === 0)
                collect(purl, "", "", state, verdict, detail, time)
            for (const entry of versions) {
                const [ status, entryVerdict ]: [ string, VexVerdict ] =
                    str(entry.status) === "unaffected" ? [ "unaffected", "NOT-AFFECTED" ] :
                        str(entry.status) === "unknown" ? [ "unknown", "UNKNOWN" ] : [ state, verdict ]
                if (collect(purl, str(entry.version), str(entry.range), status, entryVerdict, detail, time))
                    break
            }
        }
    }
}

/*  parse a CSAF document, resolving the product ids via the product tree  */
const parseCsaf = (doc: Obj, id: string, collect: Collect): void => {
    const products = new Map<string, { purls: string[], version: string, range: string }>()
    const addProduct = (item: unknown, version: string, range: string): void => {
        const product = obj(item)
        const helper  = obj(product.product_identification_helper)
        const purls   = [ str(helper.purl), ...arr(helper.purls).map(str) ].filter((purl) => purl !== "")
        if (str(product.product_id) !== "" && purls.length > 0)
            products.set(str(product.product_id), { purls, version, range })
    }
    const walk = (item: unknown, version: string, range: string): void => {
        const branch = obj(item)
        const v = str(branch.category) === "product_version"       ? str(branch.name) : version
        const r = str(branch.category) === "product_version_range" ? str(branch.name) : range
        if (branch.product !== undefined)
            addProduct(branch.product, v, r)
        for (const child of arr(branch.branches))
            walk(child, v, r)
    }
    const tree = obj(doc.product_tree)
    for (const branch of arr(tree.branches))
        walk(branch, "", "")
    for (const product of arr(tree.full_product_names))
        addProduct(product, "", "")
    const docTime = str(obj(obj(doc.document).tracking).current_release_date)
    for (const item of arr(doc.vulnerabilities)) {
        const vuln = obj(item)
        if (![ vuln.cve, ...arr(vuln.ids).map((ids) => obj(ids).text) ].some((name) => isId(name, id)))
            continue
        const detailOf = (pid: string): string => {
            const concerns = (entry: Obj): boolean => arr(entry.product_ids).includes(pid)
            const flag     = arr(vuln.flags).map(obj).find((entry) => concerns(entry))
            const threat   = arr(vuln.threats).map(obj).find((entry) => concerns(entry) && str(entry.category) === "impact")
            const remedy   = arr(vuln.remediations).map(obj).find((entry) => concerns(entry))
            return str(flag?.label) || str(threat?.details) || str(remedy?.details)
        }
        for (const [ status, pids ] of Object.entries(obj(vuln.product_status))) {
            const verdict = csafVerdicts.get(status)
            if (verdict === undefined)
                continue
            for (const pid of arr(pids).map(str)) {
                const product = products.get(pid)
                for (const purl of product?.purls ?? [])
                    collect(purl, product!.version, product!.range, status, verdict, detailOf(pid), docTime)
            }
        }
    }
}

/*  parse an SPDX 3 document, with or without the "security_"/"software_" property prefixes  */
const parseSpdx = (doc: Obj, id: string, collect: Collect): void => {
    const graph    = arr(doc["@graph"]).map(obj)
    const security = (el: Obj, name: string): string => str(el[`security_${name}`] ?? el[name])
    const software = (el: Obj, name: string): string => str(el[`software_${name}`] ?? el[name])
    const elements = new Map(graph.map((el) => [ str(el.spdxId), el ]))
    const vulns    = new Set(graph
        .filter((el) => /(?:^|_)Vulnerability$/.test(str(el.type)) && (isId(el.name, id)
            || arr(el.externalIdentifier).map(obj).some((ext) =>
                str(ext.externalIdentifierType) === "cve" && isId(ext.identifier, id))))
        .map((el) => str(el.spdxId)))
    for (const el of graph) {
        const status  = str(el.relationshipType)
        const verdict = spdxVerdicts.get(status)
        if (verdict === undefined || !/^(?:security_)?Vex\w+VulnAssessmentRelationship$/.test(str(el.type))
            || !vulns.has(str(el.from)) || security(el, "withdrawnTime") !== "")
            continue
        const detail = security(el, "justificationType") || security(el, "impactStatement") || security(el, "actionStatement")
        const time   = security(el, "modifiedTime") || security(el, "publishedTime")
        for (const to of (typeof el.to === "string" ? [ el.to ] : arr(el.to)).map(str)) {
            const target = elements.get(to) ?? {}
            const purls  = [
                software(target, "packageUrl"),
                ...arr(target.externalIdentifier).map(obj)
                    .filter((ext) => str(ext.externalIdentifierType) === "packageUrl")
                    .map((ext) => str(ext.identifier)),
                to
            ]
            for (const purl of new Set(purls))
                collect(purl, software(target, "packageVersion"), "", status, verdict, detail, time)
        }
    }
}

/*  the recognized formats of the documents, with their detection and parsing  */
const vexParsers: { detect: (doc: Obj) => string, parse: (doc: Obj, id: string, collect: Collect) => void }[] = [ {
    detect: (doc) => [ doc["@context"] ].flat().map(str).some((c) => c.startsWith("https://openvex.dev/ns")) ?
        "OpenVEX" : "",
    parse:  parseOpenVex
}, {
    detect: (doc) => doc.bomFormat === "CycloneDX" ? `CycloneDX ${str(doc.specVersion)}`.trim() : "",
    parse:  parseCycloneDx
}, {
    detect: (doc) => str(obj(doc.document).csaf_version) !== "" ? `CSAF ${str(obj(doc.document).csaf_version)}` : "",
    parse:  parseCsaf
}, {
    detect: (doc) => [ doc["@context"] ].flat().map(str).some((c) => /spdx\.org\/rdf\/3/.test(c))
        && Array.isArray(doc["@graph"]) ? "SPDX 3" : "",
    parse:  parseSpdx
} ]

/*  determine the identities (PURLs) and the version of the project:
    its npm package of "package.json" and its GitHub repository of the
    Git remote "origin"  */
const projectOf = (root: string): { identities: string[], version: string } => {
    const identities: string[] = []
    let version = ""
    try {
        const manifest = obj(JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")))
        if (str(manifest.name) !== "")
            identities.push(`pkg:npm/${str(manifest.name).replace(/^@/, "%40")}`)
        version = str(manifest.version)
    }
    catch {
        /*  no npm package  */
    }
    try {
        const url = execaSync("git", [ "config", "--get", "remote.origin.url" ],
            { cwd: root, stderr: "ignore" }).stdout.trim()
        const m = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i.exec(url)
        if (m !== null)
            identities.push(`pkg:github/${m[1]}/${m[2]}`.toLowerCase())
    }
    catch {
        /*  no Git remote "origin"  */
    }
    return { identities, version }
}

/*  determine the status the current project has published for itself on
    a vulnerability, from the VEX documents of the project  */
export const vex = (cveId: string): VexRecord => {
    const id = cveId.trim().toUpperCase()
    if (!/^CVE-\d{4}-\d{4,}$/.test(id))
        throw new Error(`vex: invalid CVE id "${cveId}" (expected "CVE-YYYY-NNNN")`)

    /*  determine the project  */
    const root = Task.projectRoot()
    const { identities, version } = projectOf(root)
    const bases = identities.map((identity) => purlOf(identity)?.base ?? "")
    const record: VexRecord = {
        id, verdict: "UNKNOWN", project: { root, identities, version }, documents: [], statements: [], warnings: []
    }
    if (identities.length === 0)
        record.warnings.push("project identity unknown (neither a \"package.json\" name nor a GitHub remote \"origin\")")

    /*  check whether a product version or version range covers the project version  */
    const covers = (productVersion: string, range: string): boolean => {
        if (version === "")
            return true
        else if (productVersion !== "")
            return compareVersions(version, productVersion) === 0
        else if (range !== "")
            return inRange(version, range)
        return true
    }

    /*  collect the statements of all VEX documents of the project  */
    for (const file of Artifact.universe().filter((file) => vexFiles(file))) {
        let doc: Obj
        try {
            doc = obj(JSON.parse(fs.readFileSync(path.join(root, file), "utf8")))
        }
        catch (err: unknown) {
            record.warnings.push(`${file}: unparsable document: ${err instanceof Error ? err.message : String(err)}`)
            continue
        }
        for (const parser of vexParsers) {
            const format = parser.detect(doc)
            if (format === "")
                continue
            record.documents.push({ file, format })
            parser.parse(doc, id, (purl, productVersion, range, status, verdict, detail, timestamp) => {
                const product = purlOf(purl)
                if (product === null || !bases.includes(product.base))
                    return false
                const versionOf = product.version !== "" ? product.version : productVersion
                if (!covers(versionOf, range))
                    return false
                record.statements.push({
                    verdict, status, detail, timestamp, file, format,
                    product: purl + (product.version === "" && productVersion !== "" ? `@${productVersion}` : "") +
                        (range !== "" ? ` (${range})` : "")
                })
                return true
            })
            break
        }
    }

    /*  the newest statement decides, and among equally recent ones the worst case  */
    const timeOf = (timestamp: string): number => {
        const ms = Date.parse(timestamp)
        return Number.isNaN(ms) ? 0 : ms
    }
    record.statements.sort((a, b) =>
        timeOf(b.timestamp) - timeOf(a.timestamp) || verdictRank[b.verdict] - verdictRank[a.verdict])
    if (record.statements.length > 0)
        record.verdict = record.statements[0].verdict
    return record
}

/*  render a record as Markdown  */
const renderMarkdown = (r: VexRecord): string => {
    const out: string[] = []
    const cell    = (text: string): string => text.replace(/\s+/g, " ").trim().replace(/\|/g, "\\|")
    const section = (title: string, lines: string[]): void => {
        if (lines.length > 0)
            out.push(`##  ${title}`, "", ...lines, "")
    }
    out.push(`#   ${r.id}: ${r.verdict}`, "")
    out.push(`-   **Project**: ${r.project.identities.length > 0 ?
        r.project.identities.map((identity) => `\`${identity}\``).join(", ") : "unknown"}`)
    out.push(`-   **Version**: ${r.project.version !== "" ? r.project.version : "unknown"}`)
    out.push(`-   **Documents**: ${r.documents.length} VEX document(s) found`, "")
    section("Statements", r.statements.length === 0 ? [] : [
        "The first statement decides the verdict.",
        "",
        "| Verdict | Status | Product | Detail | Timestamp | Document |",
        "| ------- | ------ | ------- | ------ | --------- | -------- |",
        ...r.statements.map((s) => `| ${s.verdict} | ${cell(s.status)} | \`${cell(s.product)}\` | ${cell(s.detail)} | ` +
            `${cell(s.timestamp)} | \`${cell(s.file)}\` (${s.format}) |`)
    ])
    section("Documents", r.documents.map((d) => `-   \`${d.file}\` (${d.format})`))
    section("Warnings", r.warnings.map((warning) => `-   ${cell(warning)}`))
    return out.join("\n").replace(/\n+$/, "\n")
}

/*  render a record in one of the output formats  */
export const renderVex = (record: VexRecord, format: VexFormat): string => {
    if (format === "json")
        return JSON.stringify(record, null, 4) + "\n"
    else if (format === "yaml")
        return YAML.stringify(record, { indent: 4, lineWidth: 0 })
    else
        return renderMarkdown(record)
}

/*  CLI command "ase util vex"  */
export default class VexCommand {
    /*  register commands  */
    register (program: Command): void {
        program
            .command("vex")
            .description("Determine the published VEX status of the project on a vulnerability by its CVE id")
            .addOption(new Option("-f, --format <format>", "output format")
                .choices(vexFormats).default("md"))
            .argument("<cve-id>", "CVE id of the vulnerability (CVE-YYYY-NNNN)")
            .action(async (cveId: string, opts: { format: VexFormat }) => {
                const record = vex(cveId)
                for (const warning of record.warnings)
                    process.stderr.write(`ase util vex: WARNING: ${warning}\n`)
                await writeStdout(renderVex(record, opts.format))
            })
    }
}

/*  render a caught error as an MCP tool error result  */
const mcpToolError = (err: unknown) => ({
    isError: true,
    content: [ { type: "text" as const, text: `ERROR: ${err instanceof Error ? err.message : String(err)}` } ]
})

/*  MCP registration entry point for VEX tool  */
export class VexMCP {
    register (mcp: McpServer): void {
        mcp.registerTool("ase_vex", {
            title: "ASE VEX",
            description:
                "Determine the status the current project has published for itself on a vulnerability, " +
                "given by its CVE `id` (like `CVE-2021-44228`), from the local VEX documents of the project " +
                "in the formats CSAF 2.0, CycloneDX, OpenVEX, and SPDX 3.0 (files named `*.vex.json`, " +
                "`*.openvex.json`, `*.cdx.json`, `bom.json`, `*.csaf.json`, `*.spdx.json`, `*.spdx3.json`, " +
                "`*.jsonld`, or any `*.json` below a directory `.vex`, `vex`, `.openvex`, `openvex`, or `csaf`). " +
                "Only statements on the project itself (its npm package or GitHub repository, covering its " +
                "current version) count, the newest statement decides, and among equally recent ones the " +
                "worst case. Returns the `verdict` `NOT-AFFECTED`, `AFFECTED`, `FIXED`, `UNDER-INVESTIGATION`, " +
                "or `UNKNOWN` (no statement found), with the matching statements and the found documents, " +
                "as `text` in the `format` `md` (Markdown), `yaml`, or `json`. No network access happens. " +
                "You MUST call this tool whenever the published VEX status of the project on a CVE is needed, " +
                "instead of guessing it from the source code.",
            inputSchema: {
                id: z.string()
                    .describe("CVE id of the vulnerability, like `CVE-2021-44228`"),
                format: z.enum(vexFormats).default("md")
                    .describe("output format: `md` (Markdown), `yaml`, or `json`, default `md`")
            }
        }, (args) => {
            try {
                const record = vex(args.id)
                return {
                    content: [ { type: "text", text: renderVex(record, args.format) } ]
                }
            }
            catch (err: unknown) {
                return mcpToolError(err)
            }
        })
    }
}

