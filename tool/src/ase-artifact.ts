/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import path                     from "node:path"
import fs                       from "node:fs"

import { Command }              from "commander"
import picomatch                from "picomatch"
import { isScalar }             from "yaml"
import { z }                    from "zod"
import type { McpServer }       from "@modelcontextprotocol/sdk/server/mcp.js"

import type Log                 from "./ase-log.js"
import { Config, configSchema } from "./ase-config.js"
import { Task }                 from "./ase-task.js"
import { writeStdout }          from "./ase-stdout.js"

/*  the recognized artifact kinds, in descending precedence order;
    "othr" is the implicit catch-all and is always resolved last  */
export const artifactKinds = [ "spec", "arch", "code", "docs", "infr", "othr" ] as const
export type ArtifactKind = (typeof artifactKinds)[number]

/*  the five configured kinds (i.e. all kinds except the implicit "othr")  */
const configuredKinds: ReadonlyArray<Exclude<ArtifactKind, "othr">> =
    [ "spec", "arch", "code", "docs", "infr" ]

/*  a single ".gitignore" rule, pre-compiled into a picomatch matcher  */
type IgnoreRule = { matcher: (p: string) => boolean, negated: boolean, dirOnly: boolean }

/*  reusable functionality: resolve artifact kinds to project-relative
    file lists, driven by the "project.artifact.<kind>" configuration  */
export class Artifact {
    /*  validate a requested kind against the known set  */
    static validateKind (kind: string): ArtifactKind {
        if (!(artifactKinds as ReadonlyArray<string>).includes(kind))
            throw new Error(`artifact: unknown kind "${kind}" ` +
                `(expected one of: ${artifactKinds.join(", ")})`)
        return kind as ArtifactKind
    }

    /*  translate a single ".gitignore" line into a picomatch-backed rule,
        honoring the anchored-vs-floating, directory-only, and negation
        semantics of ".gitignore" patterns  */
    private static compileIgnoreRule (line: string): IgnoreRule | null {
        let pattern = line.trim()
        if (pattern === "" || pattern.startsWith("#"))
            return null
        let negated = false
        if (pattern.startsWith("!")) {
            negated = true
            pattern = pattern.slice(1)
        }
        let dirOnly = false
        if (pattern.endsWith("/")) {
            dirOnly = true
            pattern = pattern.slice(0, -1)
        }
        const anchored = pattern.includes("/")
        if (pattern.startsWith("/"))
            pattern = pattern.slice(1)
        const glob    = anchored ? pattern : `**/${pattern}`
        const isMatch = picomatch(glob, { dot: true })
        return { matcher: (p: string) => isMatch(p), negated, dirOnly }
    }

    /*  load the ".gitignore" rules located directly in a directory  */
    private static loadIgnoreRules (dir: string): IgnoreRule[] {
        const file = path.join(dir, ".gitignore")
        if (!fs.existsSync(file))
            return []
        const rules: IgnoreRule[] = []
        for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
            const rule = Artifact.compileIgnoreRule(line)
            if (rule !== null)
                rules.push(rule)
        }
        return rules
    }

    /*  decide whether a project-relative path is ignored by the given
        ordered ".gitignore" rule set (last matching rule wins)  */
    private static isIgnored (rel: string, isDir: boolean, rules: IgnoreRule[]): boolean {
        let ignored = false
        for (const rule of rules) {
            if (rule.dirOnly && !isDir)
                continue
            if (rule.matcher(rel))
                ignored = !rule.negated
        }
        return ignored
    }

    /*  build the file universe by walking the project tree from the
        project root, honoring ".gitignore" rules (root plus nested) and
        always pruning ".git". Yields POSIX project-relative, sorted,
        de-duplicated file paths  */
    static universe (): string[] {
        const root  = Task.projectRoot()
        const files = new Set<string>()
        const walk = (dir: string, relDir: string, inherited: IgnoreRule[]): void => {
            const rules = [ ...inherited, ...Artifact.loadIgnoreRules(dir) ]
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                if (entry.name === ".git")
                    continue
                const rel    = relDir === "" ? entry.name : `${relDir}/${entry.name}`
                const isDir  = entry.isDirectory()
                if (Artifact.isIgnored(rel, isDir, rules))
                    continue
                if (isDir)
                    walk(path.join(dir, entry.name), rel, rules)
                else if (entry.isFile())
                    files.add(rel)
            }
        }
        walk(root, "", [])
        return [ ...files ].sort((a, b) => a.localeCompare(b))
    }

    /*  raw-resolve a single kind's configuration spec against the file
        universe via "seed-then-mutate" miniglob semantics: the spec is a
        whitespace-separated list of tokens.  */
    private static rawResolve (spec: string, all: string[]): Set<string> {
        const tokens = spec.split(/\s+/).filter((t) => t !== "")
        if (tokens.length === 0)
            return new Set<string>()
        const result = new Set<string>(tokens[0].startsWith("!") ? all : [])
        for (const token of tokens) {
            const negated = token.startsWith("!")
            const glob    = negated ? token.slice(1) : token
            if (glob === "")
                continue
            const isMatch = picomatch(glob, { dot: true })
            for (const file of all) {
                if (!isMatch(file))
                    continue
                if (negated)
                    result.delete(file)
                else
                    result.add(file)
            }
        }
        return result
    }

    /*  read a single scalar configuration value as a plain string  */
    private static configString (cfg: Config, key: string): string {
        const val = cfg.get(key)
        if (val === undefined)
            return ""
        return String(isScalar(val) ? val.value : val)
    }

    /*  read the configured "basedir" anchor and "files" miniglob spec
        for a single kind; "basedir" is project-root-relative (POSIX,
        "" ≡ project root) and "files" resolves relative to "basedir"  */
    private static spec (log: Log, kind: Exclude<ArtifactKind, "othr">): { basedir: string, files: string } {
        const cfg = new Config("config", configSchema, log)
        cfg.read()
        const basedir = Artifact.configString(cfg, `project.artifact.${kind}.basedir`)
            .replace(/\\/g, "/").replace(/^\/+|\/+$/g, "")
            .replace(/^\.$/, "")
        const files   = Artifact.configString(cfg, `project.artifact.${kind}.files`)
        return { basedir, files }
    }

    /*  raw-resolve a single kind's "basedir"/"files" spec against the
        file universe: the "files" miniglob resolves relative to
        "basedir", then matches are re-prefixed with "basedir" to stay
        project-relative  */
    private static resolveKind (basedir: string, files: string, all: string[]): Set<string> {
        if (basedir === "")
            return Artifact.rawResolve(files, all)
        const prefix = `${basedir}/`
        const local  = all
            .filter((file) => file.startsWith(prefix))
            .map((file) => file.slice(prefix.length))
        const result = new Set<string>()
        for (const file of Artifact.rawResolve(files, local))
            result.add(`${prefix}${file}`)
        return result
    }

    /*  resolve the requested kinds to project-relative file lists  */
    static list (log: Log, kinds: ArtifactKind[]): { kind: ArtifactKind, files: string[] }[] {
        const all = Artifact.universe()

        /*  raw-resolve all five configured kinds  */
        const raw = new Map<Exclude<ArtifactKind, "othr">, Set<string>>()
        for (const kind of configuredKinds) {
            const { basedir, files } = Artifact.spec(log, kind)
            raw.set(kind, Artifact.resolveKind(basedir, files, all))
        }

        /*  partition the universe by descending precedence  */
        const claimed = new Set<string>()
        const part    = new Map<ArtifactKind, string[]>()
        for (const kind of configuredKinds) {
            const own: string[] = []
            for (const file of raw.get(kind)!.size > 0 ? all : []) {
                if (raw.get(kind)!.has(file) && !claimed.has(file)) {
                    own.push(file)
                    claimed.add(file)
                }
            }
            part.set(kind, own)
        }
        part.set("othr", all.filter((file) => !claimed.has(file)))

        /*  project onto the requested kinds  */
        return kinds.map((kind) => ({
            kind,
            files: part.get(kind) ?? []
        }))
    }

    /*  resolve a base-relative "filename" within a kind's "basedir" to a
        project-root-relative POSIX path; the implicit "othr" catch-all
        has no configured "basedir" and is therefore rejected  */
    static name (log: Log, kind: ArtifactKind, filename: string): string {
        if (kind === "othr")
            throw new Error("artifact: kind \"othr\" has no configured basedir")
        const file = filename.replace(/\\/g, "/").replace(/^\/+/, "")
        if (file === "")
            throw new Error("artifact: filename must not be empty")
        const { basedir } = Artifact.spec(log, kind)
        return basedir === "" ? file : `${basedir}/${file}`
    }
}

/*  CLI command "ase artifact"  */
export default class ArtifactCommand {
    constructor (private log: Log) {}

    /*  register commands  */
    register (program: Command): void {
        /*  register CLI top-level command "ase artifact"  */
        const artifact = program
            .command("artifact")
            .description("Resolve project artifact kinds to project-relative file lists")
            .action(() => {
                artifact.outputHelp()
                process.exit(1)
            })

        /*  register CLI sub-command "ase artifact list"  */
        artifact
            .command("list")
            .description("Resolve one or more artifact kinds to project-relative file paths")
            .option("--kind <kinds>",
                "comma-separated list of artifact kinds " +
                `(${artifactKinds.join("|")})`,
                artifactKinds.join(","))
            .action(async (opts: { kind: string }) => {
                const kinds  = opts.kind.split(",").map((k) => Artifact.validateKind(k.trim()))
                const result = Artifact.list(this.log, kinds)
                const single = result.length === 1
                for (const { kind, files } of result) {
                    if (!single)
                        await writeStdout(`# ${kind}:\n`)
                    for (const file of files)
                        await writeStdout(`- ${file}\n`)
                }
            })

        /*  register CLI sub-command "ase artifact name"  */
        artifact
            .command("name")
            .description("Resolve a base-relative filename within an artifact kind to a project-relative path")
            .argument("<filename>", "base-relative filename within the kind's basedir")
            .option("--kind <kind>",
                "artifact kind " +
                `(${configuredKinds.join("|")})`,
                "code")
            .action(async (filename: string, opts: { kind: string }) => {
                const kind = Artifact.validateKind(opts.kind.trim())
                await writeStdout(`${Artifact.name(this.log, kind, filename)}\n`)
            })
    }
}

/*  MCP registration entry point for artifact tools  */
export class ArtifactMCP {
    constructor (private log: Log) {}

    /*  register MCP tools  */
    register (mcp: McpServer): void {
        mcp.registerTool("ase_artifact_list", {
            title: "ASE artifact list",
            description:
                "Resolve one or more artifact `kind`s to project-relative file lists. " +
                "Recognized kinds are `spec`, `arch`, `code`, `docs`, `infr`, and `othr`. " +
                "Returns an `artifacts` array of `{ kind, files }` objects. " +
                "If `kind` is omitted or empty, all kinds are resolved.",
            inputSchema: {
                kind: z.array(z.string()).optional()
                    .describe("list of artifact kinds (`spec`, `arch`, `code`, `docs`, `infr`, " +
                        "`othr`); if omitted or empty, all kinds are resolved")
            },
            outputSchema: {
                artifacts: z.array(z.object({
                    kind:  z.string().describe("artifact kind"),
                    files: z.array(z.string()).describe("project-relative file paths for the kind")
                })).describe("resolved artifacts, one entry per requested kind")
            }
        }, async (args) => {
            try {
                const requested = args.kind !== undefined && args.kind.length > 0 ?
                    args.kind : [ ...artifactKinds ]
                const kinds  = requested.map((k) => Artifact.validateKind(k))
                const result = { artifacts: Artifact.list(this.log, kinds) }
                return {
                    structuredContent: result,
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

        mcp.registerTool("ase_artifact_name", {
            title: "ASE artifact name",
            description:
                "Resolve a base-relative `filename` within an artifact `kind` to a project-relative path " +
                "by prefixing it with the kind's configured `basedir`. " +
                "Recognized kinds are `spec`, `arch`, `code`, `docs`, and `infr` " +
                "(the implicit `othr` catch-all has no basedir and is rejected). " +
                "If `kind` is omitted, it defaults to `code`. " +
                "Returns the resolved path as `name`.",
            inputSchema: {
                kind: z.string().optional()
                    .describe("artifact kind (`spec`, `arch`, `code`, `docs`, `infr`); defaults to `code`"),
                filename: z.string()
                    .describe("base-relative filename within the kind's basedir")
            },
            outputSchema: {
                name: z.string().describe("project-relative file path")
            }
        }, async (args) => {
            try {
                const kind   = Artifact.validateKind(args.kind ?? "code")
                const result = { name: Artifact.name(this.log, kind, args.filename) }
                return {
                    structuredContent: result,
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
