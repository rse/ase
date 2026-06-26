/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under GPL 3.0 <https://spdx.org/licenses/GPL-3.0-only>
*/

import path                   from "node:path"
import os                     from "node:os"
import fs                     from "node:fs"
import readline               from "node:readline/promises"

import { Command }                                  from "commander"
import { Document, parseDocument, isMap, isScalar } from "yaml"
import { execaSync }                                from "execa"
import * as v                                       from "valibot"
import Table                                        from "cli-table3"
import writeFileAtomic                              from "write-file-atomic"
import lockfile                                     from "proper-lockfile"
import { z }                                        from "zod"
import type { McpServer }                           from "@modelcontextprotocol/sdk/server/mcp.js"

import type Log                                     from "./ase-log.js"

/*  classification taxonomy  */
export const projectClassification = {
    boxing: [ "white", "grey", "black"     ]
} as const

/*  agent classification taxonomy  */
export const agentClassification = {
    persona: [ "writer", "engineer", "journalist", "telegrapher", "caveman" ]
} as const

/*  classification presets  */
export const projectClassificationPresets: Record<string, Record<string, string>> = {
    vibe: {
        "agent.persona":   "writer",
        "project.id":      "example",
        "project.name":    "Example Project",
        "project.boxing":  "black"
    },
    pro: {
        "agent.persona":   "engineer",
        "project.id":      "example",
        "project.name":    "Example Project",
        "project.boxing":  "white"
    },
    default: {
        "agent.task":      "default",
        "agent.persona":   "engineer",
        "project.id":      "example",
        "project.name":    "Example Project",
        "project.boxing":  "white",
        "project.artifact.task.basedir": ".ase/task",
        "project.artifact.task.files":   "*.md",
        "project.artifact.spec.basedir": "doc/spec",
        "project.artifact.spec.files":   "*.{md,txt}",
        "project.artifact.arch.basedir": "doc/arch",
        "project.artifact.arch.files":   "*.{md,txt}",
        "project.artifact.code.basedir": "src",
        "project.artifact.code.files":   "** !**/etc/** !**/{.gitignore,.npmignore,package.json}",
        "project.artifact.docs.basedir": "doc",
        "project.artifact.docs.files":   "** **/{README,LICENSE,CHANGELOG}.{md,txt} !{spec,arch}/**",
        "project.artifact.infr.basedir": "",
        "project.artifact.infr.files":   "**/{.github,.claude*,etc}/** **/{AGENTS.md,{package,tsconfig*}.json,.{git,npm}ignore}"
    },
    industry: {
        "agent.persona":   "engineer",
        "project.id":      "example",
        "project.name":    "Example Project",
        "project.boxing":  "grey"
    }
}

/*  single scope term  */
type ScopeTerm =
    | { kind: "default"             }
    | { kind: "user"                }
    | { kind: "project"             }
    | { kind: "task",    id: string }
    | { kind: "session", id: string }

/*  hard-coded map: which scope kinds each variable may be SET on
    (reads always cascade through the full chain; this restricts writes only);
    keys absent from this map default to all non-"default" scope kinds  */
export const configWritableScopes: Record<string, ReadonlyArray<ScopeTerm["kind"]>> = {
    "agent.task":                    [ "session" ],
    "agent.skill":                   [ "session" ],
    "project.artifact.task.basedir": [ "user", "project" ],
    "project.artifact.task.files":   [ "user", "project" ],
    "project.artifact.spec.basedir": [ "user", "project" ],
    "project.artifact.spec.files":   [ "user", "project" ],
    "project.artifact.arch.basedir": [ "user", "project" ],
    "project.artifact.arch.files":   [ "user", "project" ],
    "project.artifact.code.basedir": [ "user", "project" ],
    "project.artifact.code.files":   [ "user", "project" ],
    "project.artifact.docs.basedir": [ "user", "project" ],
    "project.artifact.docs.files":   [ "user", "project" ],
    "project.artifact.infr.basedir": [ "user", "project" ],
    "project.artifact.infr.files":   [ "user", "project" ]
}

/*  default set of scope kinds writable for any unrestricted key  */
const configWritableScopesDefault: ReadonlyArray<ScopeTerm["kind"]> =
    [ "user", "project", "task", "session" ]

/*  a scope chain (one or more terms, canonical order default<user<project<task<session)  */
type Scope = ScopeTerm[]

/*  canonical ordering rank of a scope kind  */
const scopeRank = (kind: ScopeTerm["kind"]): number =>
    ({ default: -1, user: 0, project: 1, task: 2, session: 3 })[kind]

/*  parse a single scope term  */
const parseScopeTerm = (value: string): ScopeTerm => {
    if (value === "user")
        return { kind: "user" }
    else if (value === "project")
        return { kind: "project" }
    const m = /^(session|task):([A-Za-z0-9._-]+)$/.exec(value)
    if (m !== null)
        return { kind: m[1] as "session" | "task", id: m[2] }
    throw new Error(`invalid --scope term "${value}" ` +
        "(expected: \"user\", \"project\", \"task:<id>\", or \"session:<id>\")")
}

/*  detect whether a project context exists, i.e. either we are inside
    a Git working tree or a ".ase" directory is present at or above cwd  */
const hasProjectContext = (): boolean => {
    try {
        const result = execaSync("git", [ "rev-parse", "--show-toplevel" ], { stderr: "ignore" })
        if (result.stdout.trim() !== "")
            return true
    }
    catch {
        /*  not inside a Git working tree  */
    }
    let dir = fs.realpathSync(process.cwd())
    for (;;) {
        if (fs.existsSync(path.join(dir, ".ase")))
            return true
        const parent = path.dirname(dir)
        if (parent === dir)
            return false
        dir = parent
    }
}

/*  parse a raw "--scope" option value into a canonical Scope chain;
    accepts a comma-separated list of terms in any order. The "user"
    term is always implicitly added at the bottom of the chain; the
    "project" term is implicitly added only when a project context
    exists (Git repository or ".ase" directory at or above cwd), and
    an explicit "project" term requires that same context  */
export const parseScope = (value: string | undefined): Scope => {
    const projectActive = hasProjectContext()
    const input         = (value === undefined || value === "") ?
        (projectActive ? "project" : "user") :
        value.trim()
    if (input === "")
        throw new Error("invalid --scope: value must not be empty")
    const terms: ScopeTerm[] = input.split(",").map((s) => parseScopeTerm(s.trim()))
    const seen = new Set<string>()
    for (const t of terms) {
        if (seen.has(t.kind))
            throw new Error(`invalid --scope: duplicate term of kind "${t.kind}"`)
        seen.add(t.kind)
    }
    if (seen.has("project") && !projectActive)
        throw new Error("invalid --scope: \"project\" requires a project context " +
            "(a Git repository or a \".ase\" directory at or above the current directory)")
    if (!seen.has("project") && projectActive)
        terms.unshift({ kind: "project" })
    if (!seen.has("user"))
        terms.unshift({ kind: "user" })
    terms.sort((a, b) => scopeRank(a.kind) - scopeRank(b.kind))
    terms.unshift({ kind: "default" })
    return terms
}

/*  schema for ".ase/config.yaml"  */
export const configSchema = v.nullish(v.strictObject({
    project: v.optional(v.strictObject({
        id:      v.optional(v.pipe(v.string(), v.minLength(1))),
        name:    v.optional(v.pipe(v.string(), v.minLength(1))),
        boxing:  v.optional(v.picklist(projectClassification.boxing)),
        artifact: v.optional(v.strictObject({
            spec: v.optional(v.strictObject({ basedir: v.optional(v.string()), files: v.optional(v.string()) })),
            arch: v.optional(v.strictObject({ basedir: v.optional(v.string()), files: v.optional(v.string()) })),
            code: v.optional(v.strictObject({ basedir: v.optional(v.string()), files: v.optional(v.string()) })),
            docs: v.optional(v.strictObject({ basedir: v.optional(v.string()), files: v.optional(v.string()) })),
            infr: v.optional(v.strictObject({ basedir: v.optional(v.string()), files: v.optional(v.string()) })),
            task: v.optional(v.strictObject({ basedir: v.optional(v.string()), files: v.optional(v.string()) }))
        }))
    })),
    agent: v.optional(v.strictObject({
        persona: v.optional(v.picklist(agentClassification.persona)),
        task:    v.optional(v.pipe(v.string(), v.minLength(1))),
        skill:   v.optional(v.pipe(v.string(), v.minLength(1)))
    }))
}))

/*  single layer inside the scope-inheritance stack  */
type Layer = { scope: ScopeTerm, filename: string, doc: Document }

/*  encapsulate read/write access to a stack of "<name>.yaml" configuration files,
    each associated with a scope term; reads cascade along user < project < task < session,
    writes are confined to the target (strongest) scope term  */
export class Config {
    /*  public state  */
    public  filename: string

    /*  private state  */
    private name:    string
    private scope:   Scope
    private schema:  v.GenericSchema | null
    private log:     Log
    private docs:    Layer[]
    private target:  number

    /*  creation  */
    constructor (
        name:   string,
        schema: v.GenericSchema | undefined,
        log:    Log,
        scope:  Scope = [ { kind: "project" } ]
    ) {
        if (scope.length === 0)
            throw new Error("invalid scope: chain must not be empty")
        this.name     = name
        this.scope    = scope[0].kind === "default" ? scope : [ { kind: "default" }, ...scope ]
        this.schema   = schema ?? null
        this.log      = log
        const tgt     = this.scope[this.scope.length - 1]
        this.filename = this.resolveFilename(name, tgt)
        this.docs     = [ { scope: tgt, filename: this.filename, doc: new Document() } ]
        this.target   = 0
    }

    /*  render a scope term as a short textual label  */
    static scopeLabel (term: ScopeTerm): string {
        if (term.kind === "default" || term.kind === "user" || term.kind === "project")
            return term.kind
        return `${term.kind}:${term.id}`
    }

    /*  resolve the per-OS user-scope base directory  */
    private userConfigDir (): string {
        if (process.platform === "darwin")
            /*  macOS  */
            return path.join(os.homedir(), "Library", "Application Support", "ase")
        else if (process.platform === "win32")
            /*  Windows  */
            return path.join(process.env.APPDATA ?? os.homedir(), "ase")
        else {
            /*  Linux  */
            const xdg  = process.env.XDG_CONFIG_HOME
            const base = xdg !== undefined && xdg !== "" ? xdg : path.join(os.homedir(), ".config")
            return path.join(base, "ase")
        }
    }

    /*  resolve the configuration filename based on the selected scope term  */
    private resolveFilename (name: string, term: ScopeTerm): string {
        if (term.kind === "default")
            throw new Error("internal error: \"default\" scope has no filename")
        if (term.kind === "user")
            return path.join(this.userConfigDir(), `${name}.yaml`)
        else if (term.kind === "project") {
            const rel   = path.join(".ase", `${name}.yaml`)
            const cwd   = process.cwd()
            const top   = this.gitToplevel()
            const found = top !== null ?
                this.findUpward(cwd, top, rel) :
                (fs.existsSync(path.join(cwd, rel)) ? path.join(cwd, rel) : null)
            return found ?? path.join(top ?? cwd, rel)
        }
        else if (term.kind === "task") {
            const top = this.gitToplevel() ?? process.cwd()
            return path.join(top, ".ase", "task", term.id, `${name}.yaml`)
        }
        else
            return path.join(os.homedir(), ".ase", "session", term.id, `${name}.yaml`)
    }

    /*  upward-walk on filesystem for a file path relative to a start directory,
        bounded above (inclusive) by a stop directory  */
    private findUpward (start: string, stop: string, rel: string): string | null {
        let   dir     = fs.realpathSync(start)
        const end     = fs.realpathSync(stop)
        const steps   = dir.split(path.sep).length - end.split(path.sep).length
        if (steps < 0)
            return null
        for (let i = 0; i <= steps; i++) {
            const candidate = path.join(dir, rel)
            if (fs.existsSync(candidate))
                return candidate
            const parent = path.dirname(dir)
            if (parent === dir)
                return null
            dir = parent
        }
        return null
    }

    /*  determine the Git top-level directory, if inside a Git repository  */
    private gitToplevel (): string | null {
        try {
            const result = execaSync("git", [ "rev-parse", "--show-toplevel" ], {
                stderr: "ignore"
            })
            return result.stdout.trim() || null
        }
        catch {
            return null
        }
    }

    /*  read the full scope chain into memory; the requested mode applies
        to the target scope only, inherited scopes are always lenient  */
    read (mode: "strict" | "lenient" = "lenient"): void {
        const chain = this.scope
        const docs: Layer[] = []
        for (let i = 0; i < chain.length; i++) {
            const sc         = chain[i]
            if (sc.kind === "default") {
                const doc = new Document()
                doc.contents = doc.createNode({})
                if (this.name === "config") {
                    const preset = projectClassificationPresets.default
                    for (const [ k, val ] of Object.entries(preset)) {
                        const segments = k.split(".")
                        for (let j = 1; j < segments.length; j++) {
                            const prefix = segments.slice(0, j)
                            const node   = doc.getIn(prefix, true)
                            if (node === undefined)
                                doc.setIn(prefix, doc.createNode({}))
                        }
                        doc.setIn(segments, doc.createNode(val))
                    }
                }
                docs.push({ scope: sc, filename: "", doc })
                continue
            }
            const filename   = this.resolveFilename(this.name, sc)
            const isTarget   = (i === chain.length - 1)
            const perDocMode: "strict" | "lenient" = isTarget ? mode : "lenient"
            const text       = fs.existsSync(filename) ? fs.readFileSync(filename, "utf8") : ""
            let   doc: Document = parseDocument(text)
            if (doc.errors.length > 0) {
                const msg = `invalid YAML in ${filename}: ${doc.errors[0].message}`
                if (perDocMode === "strict")
                    throw new Error(msg)
                this.log.write("warning", msg)
                doc = new Document()
            }
            docs.push({ scope: sc, filename, doc })
        }
        this.docs   = docs
        this.target = docs.length - 1
        for (let i = 0; i < docs.length; i++) {
            const isTarget   = (i === this.target)
            const perDocMode: "strict" | "lenient" = isTarget ? mode : "lenient"
            this.validateDoc(docs[i].doc, docs[i].filename, perDocMode)
        }
    }

    /*  acquire a cross-process advisory lock on the target scope's file,
        execute the callback, then release the lock  */
    lock (cb: () => void): void {
        const td = this.docs[this.target]
        if (td.scope.kind === "default")
            throw new Error("internal error: \"default\" scope is not lockable")
        fs.mkdirSync(path.dirname(td.filename), { recursive: true })
        if (!fs.existsSync(td.filename))
            fs.writeFileSync(td.filename, "", "utf8")
        const release = lockfile.lockSync(td.filename)
        try {
            cb()
        }
        finally {
            release()
        }
    }

    /*  write in-memory configuration back to the target scope's file  */
    write (): void {
        const td = this.docs[this.target]
        if (td.scope.kind === "default")
            throw new Error("internal error: \"default\" scope is not writable")
        this.validateDoc(td.doc, td.filename, "strict")
        fs.mkdirSync(path.dirname(td.filename), { recursive: true })
        writeFileAtomic.sync(td.filename, td.doc.toString({ indent: 4 }), { encoding: "utf8" })
    }

    /*  validate a single YAML document against the optional schema  */
    private validateDoc (doc: Document, filename: string, mode: "strict" | "lenient" = "strict"): void {
        if (this.schema === null)
            return
        for (;;) {
            const result = v.safeParse(this.schema, doc.toJS())
            if (result.success)
                return
            if (mode === "strict") {
                const issues = result.issues.map((i) => {
                    const dotPath = (i.path ?? []).map((p) => String(p.key)).join(".")
                    return dotPath ? `${dotPath}: ${i.message}` : i.message
                }).join("; ")
                throw new Error(`invalid configuration in ${filename}: ${issues}`)
            }
            let progressed = false
            for (const i of result.issues) {
                const segs    = (i.path ?? []).map((p) => String(p.key))
                const dotPath = segs.join(".")
                this.log.write("warning", `invalid entry in ${filename}: ${dotPath ? `${dotPath}: ` : ""}${i.message}`)
                if (segs.length > 0) {
                    doc.deleteIn(segs)
                    progressed = true
                }
                /*  root-level issues cannot be deleted; processing continues with the remaining issues  */
            }
            if (!progressed)
                return
        }
    }

    /*  enumerate all full dotted leaf paths from the attached valibot schema  */
    private schemaLeafPaths (): string[][] {
        type SchemaNode = { type?: string, wrapped?: unknown, entries?: Record<string, unknown> }
        const unwrap = (s: unknown): SchemaNode | null => {
            let cur = s as SchemaNode | null | undefined
            while (cur !== undefined && cur !== null && (cur.type === "optional" || cur.type === "nullish"
                || cur.type === "nullable" || cur.type === "undefinedable"))
                cur = cur.wrapped as SchemaNode | null | undefined
            return cur ?? null
        }
        const walk = (s: unknown, prefix: string[]): string[][] => {
            const u = unwrap(s)
            if (u !== null
                && (u.type === "object" || u.type === "strict_object" || u.type === "loose_object")
                && u.entries !== undefined) {
                const paths: string[][] = []
                for (const [ k, sub ] of Object.entries(u.entries))
                    paths.push(...walk(sub, [ ...prefix, k ]))
                return paths
            }
            return [ prefix ]
        }
        return walk(this.schema, [])
    }

    /*  resolve a (possibly trailing-segment) dotted key to its full schema path  */
    resolveKey (key: string): string {
        if (this.schema === null)
            return key
        const segs    = key.split(".")
        const matches = this.schemaLeafPaths().filter((p) => {
            if (p.length < segs.length)
                return false
            for (let i = 0; i < segs.length; i++)
                if (p[p.length - segs.length + i] !== segs[i])
                    return false
            return true
        })
        if (matches.length === 0)
            return key
        if (matches.length > 1)
            throw new Error(`ambiguous key "${key}" matches: ${matches.map((m) => m.join(".")).join(", ")}`)
        return matches[0].join(".")
    }

    /*  retrieve the effective value at a dotted key (strongest scope wins),
        or the target scope's root contents if no key is given  */
    get (key?: string): unknown {
        if (key === undefined)
            return this.docs[this.target].doc.contents
        const segs = this.resolveKey(key).split(".")
        for (let i = this.docs.length - 1; i >= 0; i--) {
            const node = this.docs[i].doc.getIn(segs)
            if (node !== undefined)
                return node
        }
        return undefined
    }

    /*  enumerate the effective leaf entries across the full scope chain;
        each returned entry identifies the originating scope  */
    entries (): Array<{ key: string, value: unknown, scope: ScopeTerm }> {
        const keys = new Set<string>()
        const walk = (node: unknown, prefix: string[]): void => {
            if (isMap(node))
                for (const item of node.items) {
                    const k = [ ...prefix, String(item.key) ]
                    if (isMap(item.value))
                        walk(item.value, k)
                    else if (isScalar(item.value))
                        keys.add(k.join("."))
                    else
                        throw new Error(`key "${k.join(".")}" has unsupported node type`)
                }
        }
        for (const d of this.docs)
            walk(d.doc.contents, [])
        const result: Array<{ key: string, value: unknown, scope: ScopeTerm }> = []
        for (const k of keys) {
            const segs = k.split(".")
            for (let i = this.docs.length - 1; i >= 0; i--) {
                const node = this.docs[i].doc.getIn(segs)
                if (node !== undefined) {
                    result.push({ key: k, value: node, scope: this.docs[i].scope })
                    break
                }
            }
        }
        result.sort((a, b) => a.key.localeCompare(b.key))
        return result
    }

    /*  determine whether a key is writable on a given scope kind  */
    isWritableOn (key: string, kind: ScopeTerm["kind"]): boolean {
        if (kind === "default")
            return false
        const resolved = this.resolveKey(key)
        const allowed  = configWritableScopes[resolved] ?? configWritableScopesDefault
        return allowed.includes(kind)
    }

    /*  enforce write-scope policy for the current target scope  */
    private assertWritable (key: string): void {
        const td       = this.docs[this.target]
        const resolved = this.resolveKey(key)
        const allowed  = configWritableScopes[resolved] ?? configWritableScopesDefault
        if (!allowed.includes(td.scope.kind))
            throw new Error(`cannot set "${resolved}" on scope "${Config.scopeLabel(td.scope)}": ` +
                `this key is only writable on scope(s): ${allowed.join(", ")}`)
    }

    /*  set a value at a dotted key in the target scope, creating intermediate maps as needed  */
    set (key: string, value: unknown): void {
        this.assertWritable(key)
        const segments = this.resolveKey(key).split(".")
        const td       = this.docs[this.target]
        const next     = td.doc.clone()
        for (let i = 1; i < segments.length; i++) {
            const prefix = segments.slice(0, i)
            const node   = next.getIn(prefix, true)
            if (node !== undefined && !isMap(node))
                throw new Error(`cannot set "${key}": intermediate path "${prefix.join(".")}" is not a map`)
            if (node === undefined)
                next.setIn(prefix, next.createNode({}))
        }
        next.setIn(segments, value)
        const saved = td.doc
        td.doc      = next
        try {
            this.validateDoc(td.doc, td.filename, "strict")
        }
        catch (err) {
            td.doc = saved
            throw err
        }
    }

    /*  delete a value at a dotted key from the target scope  */
    delete (key: string): void {
        this.assertWritable(key)
        const td    = this.docs[this.target]
        if (td.doc.contents === null || td.doc.contents === undefined)
            return
        const next  = td.doc.clone()
        next.deleteIn(this.resolveKey(key).split("."))
        const saved = td.doc
        td.doc      = next
        try {
            this.validateDoc(td.doc, td.filename, "strict")
        }
        catch (err) {
            td.doc = saved
            throw err
        }
    }
}

/*  CLI command "ase config"  */
export default class ConfigCommand {
    constructor (private log: Log) {}

    /*  register commands  */
    register (program: Command): void {
        /*  register CLI top-level command "ase config"  */
        const configCmd = program
            .command("config")
            .option("--scope <scope>",
                "configuration scope chain: comma-separated list of \"user\", \"project\", " +
                "\"task:<id>\", and/or \"session:<id>\" terms (e.g. \"task:N,session:M\"); " +
                "\"user\" is always implicitly included and \"project\" is implicitly " +
                "included whenever a project context (Git repo or upward \".ase\" directory) exists")
            .description("manage ASE configuration")
            .action((_opts, cmd: Command) => {
                cmd.outputHelp()
                process.exit(1)
            })

        /*  register CLI sub-command "ase config init"  */
        configCmd
            .command("init")
            .description("initialize configuration with preset values (default|vibe|pro|industry)")
            .argument("<type>", "Preset type (default|vibe|pro|industry)")
            .action((type: string, _opts: unknown, cmd: Command) => {
                const scope  = parseScope(cmd.optsWithGlobals().scope as string | undefined)
                const preset = projectClassificationPresets[type]
                if (preset === undefined)
                    throw new Error(`unknown preset "${type}" (expected: default|vibe|pro|industry)`)
                const cfg = new Config("config", configSchema, this.log, scope)
                cfg.lock(() => {
                    cfg.read()
                    const targetKind = scope[scope.length - 1].kind
                    for (const [ k, val ] of Object.entries(preset)) {
                        if (!cfg.isWritableOn(k, targetKind))
                            continue
                        cfg.set(k, val)
                    }
                    cfg.write()
                })
            })

        /*  register CLI sub-command "ase config list"  */
        configCmd
            .command("list")
            .description("list all configured values as flat dotted keys")
            .action((_opts: unknown, cmd: Command) => {
                const scope = parseScope(cmd.optsWithGlobals().scope as string | undefined)
                const cfg   = new Config("config", configSchema, this.log, scope)
                cfg.read()
                const table = new Table({
                    head:  [ "KEY", "VALUE", "SCOPE" ],
                    chars: { "mid": "", "left-mid": "", "mid-mid": "", "right-mid": "" },
                    style: { head: [ "blue" ] }
                })
                for (const e of cfg.entries()) {
                    const val = isScalar(e.value) ? e.value.value : e.value
                    table.push([ e.key, String(val), Config.scopeLabel(e.scope) ])
                }
                process.stdout.write(`${table.toString()}\n`)
            })

        /*  register CLI sub-command "ase config edit"  */
        configCmd
            .command("edit")
            .description("edit configuration file with $EDITOR")
            .action(async (_opts: unknown, cmd: Command) => {
                const scope  = parseScope(cmd.optsWithGlobals().scope as string | undefined)
                const editor = process.env.EDITOR ?? process.env.VISUAL ?? "vi"
                const cfg    = new Config("config", configSchema, this.log, scope)
                fs.mkdirSync(path.dirname(cfg.filename), { recursive: true })
                if (!fs.existsSync(cfg.filename))
                    fs.writeFileSync(cfg.filename, "", "utf8")
                const rl = readline.createInterface({ input: process.stdin, output: process.stderr })
                try {
                    for (;;) {
                        execaSync(editor, [ cfg.filename ], { stdio: "inherit" })
                        try {
                            cfg.read("strict")
                            break
                        }
                        catch (err) {
                            const msg = err instanceof Error ? err.message : String(err)
                            this.log.write("error", msg)
                            const ans = (await rl.question("re-edit? [Y/n] ")).trim().toLowerCase()
                            if (ans === "n" || ans === "no")
                                throw err
                        }
                    }
                }
                finally {
                    rl.close()
                }
            })

        /*  register CLI sub-command "ase config get"  */
        configCmd
            .command("get")
            .description("print the value at a dotted configuration key")
            .argument("<key>", "configuration key (dotted path)")
            .action((key: string, _opts: unknown, cmd: Command) => {
                const scope = parseScope(cmd.optsWithGlobals().scope as string | undefined)
                const cfg   = new Config("config", configSchema, this.log, scope)
                cfg.read()
                const val = cfg.get(key)
                if (val === undefined)
                    throw new Error(`key "${key}" is not set`)
                if (isMap(val))
                    throw new Error(`key "${key}" is not a leaf key`)
                process.stdout.write(`${isScalar(val) ? val.value : val}\n`)
            })

        /*  register CLI sub-command "ase config set"  */
        configCmd
            .command("set")
            .description("set the value at a dotted configuration key")
            .argument("<key>",   "configuration key (dotted path)")
            .argument("<value>", "configuration value")
            .action((key: string, value: string, _opts: unknown, cmd: Command) => {
                const scope = parseScope(cmd.optsWithGlobals().scope as string | undefined)
                const cfg   = new Config("config", configSchema, this.log, scope)
                cfg.lock(() => {
                    cfg.read()
                    cfg.set(key, value)
                    cfg.write()
                })
            })

        /*  register CLI sub-command "ase config delete"  */
        configCmd
            .command("delete")
            .description("delete the value at a dotted configuration key")
            .argument("<key>", "configuration key (dotted path)")
            .action((key: string, _opts: unknown, cmd: Command) => {
                const scope = parseScope(cmd.optsWithGlobals().scope as string | undefined)
                const cfg   = new Config("config", configSchema, this.log, scope)
                cfg.lock(() => {
                    cfg.read()
                    cfg.delete(key)
                    cfg.write()
                })
            })
    }
}

/*  MCP registration entry point for layered YAML configuration access  */
export class ConfigMCP {
    constructor (private log: Log) {}

    /*  register the MCP tools  */
    register (mcp: McpServer): void {
        /*  config get  */
        mcp.registerTool("ase_config_get", {
            title: "ASE config get",
            description:
                "Read the effective value of a dotted configuration `key` from the layered " +
                "configuration, cascading through default/user/project/task/session chain up to and " +
                "including the requested `scope`. Returns the value as JSON-encoded `text`; " +
                "returns an empty string if no value is set.",
            inputSchema: {
                key: z.string()
                    .describe("dotted configuration key (e.g. \"agent.skill\")"),
                scope: z.string()
                    .describe("scope chain (e.g. \"session:<id>\", \"task:<id>\", \"project\", \"user\")")
            }
        }, async (args) => {
            try {
                const scope = parseScope(args.scope)
                const cfg   = new Config("config", configSchema, this.log, scope)
                let text = ""
                cfg.lock(() => {
                    cfg.read()
                    const val = cfg.get(args.key)
                    text = val === undefined ? "" : JSON.stringify(val)
                })
                return { content: [ { type: "text", text } ] }
            }
            catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err)
                return { isError: true, content: [ { type: "text", text: `config_get: ERROR: ${message}` } ] }
            }
        })

        /*  config set  */
        mcp.registerTool("ase_config_set", {
            title: "ASE config set",
            description:
                "Write `val` to a dotted configuration `key` at the target `scope` " +
                "(the strongest scope term in the chain). The value is validated against " +
                "the configuration schema before being persisted.",
            inputSchema: {
                key: z.string()
                    .describe("dotted configuration key (e.g. \"agent.skill\")"),
                val: z.union([ z.string(), z.number(), z.boolean(), z.null(), z.array(z.any()), z.record(z.string(), z.any()) ])
                    .describe("value to store under `key`"),
                scope: z.string()
                    .describe("scope chain (e.g. \"session:<id>\", \"task:<id>\", \"project\", \"user\")")
            }
        }, async (args) => {
            try {
                const scope = parseScope(args.scope)
                const cfg   = new Config("config", configSchema, this.log, scope)
                cfg.lock(() => {
                    cfg.read()
                    cfg.set(args.key, args.val)
                    cfg.write()
                })
                return { content: [ { type: "text", text: `config_set: OK: stored "${args.key}" on scope "${args.scope}"` } ] }
            }
            catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err)
                return { isError: true, content: [ { type: "text", text: `config_set: ERROR: ${message}` } ] }
            }
        })

        /*  config delete  */
        mcp.registerTool("ase_config_delete", {
            title: "ASE config delete",
            description:
                "Delete the value at a dotted configuration `key` from the target `scope` " +
                "(the strongest scope term in the chain). No-op if the key is not present.",
            inputSchema: {
                key: z.string()
                    .describe("dotted configuration key (e.g. \"agent.skill\")"),
                scope: z.string()
                    .describe("scope chain (e.g. \"session:<id>\", \"task:<id>\", \"project\", \"user\")")
            }
        }, async (args) => {
            try {
                const scope = parseScope(args.scope)
                const cfg   = new Config("config", configSchema, this.log, scope)
                cfg.lock(() => {
                    cfg.read()
                    cfg.delete(args.key)
                    cfg.write()
                })
                return { content: [ { type: "text", text: `config_delete: OK: removed "${args.key}" on scope "${args.scope}"` } ] }
            }
            catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err)
                return { isError: true, content: [ { type: "text", text: `config_delete: ERROR: ${message}` } ] }
            }
        })
    }
}

