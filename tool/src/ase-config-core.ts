/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import path                                         from "node:path"
import fs                                           from "node:fs"

import { Document, parseDocument, isMap, isScalar } from "yaml"
import * as v                                       from "valibot"
import writeFileAtomic                              from "write-file-atomic"
import lockfile                                     from "proper-lockfile"

import type Log                                     from "./ase-lib-log.js"
import type { ScopeTerm, Scope }                    from "./ase-config-scope.js"
import { projectRoot, userConfigDir, userStateDir } from "./ase-config-scope.js"
import {
    projectClassificationPresets,
    configWritableScopes,
    configWritableScopesDefault,
    configSecretKeys,
    sessionStateSchema
}                                                   from "./ase-config-schema.js"

/*  single layer inside the scope-inheritance stack  */
type Layer = { scope: ScopeTerm, filename: string, doc: Document }

/*  the value type of a configuration key, as derived from its schema leaf  */
export type KeyType = { type: "boolean" | "number" | "string" } | { type: "enum", options: string[] }

/*  a node of the attached valibot schema, unwrapped from its optional wrappers  */
type SchemaNode = { type?: string, wrapped?: unknown, entries?: Record<string, unknown>, options?: unknown[] }
const unwrapSchema = (s: unknown): SchemaNode | null => {
    let cur = s as SchemaNode | null | undefined
    while (cur !== undefined && cur !== null && (cur.type === "optional" || cur.type === "nullish"
        || cur.type === "nullable" || cur.type === "undefinedable"))
        cur = cur.wrapped as SchemaNode | null | undefined
    return cur ?? null
}

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
    private pruned:  string[]
    private locked:  string | null = null

    /*  creation  */
    constructor (
        name:   string,
        schema: v.GenericSchema | undefined,
        log:    Log,
        scope:  Scope = [ { kind: "user" }, { kind: "project" } ]
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
        this.pruned   = []
    }

    /*  the configuration files of the scope chain (after reading)  */
    files (): string[] {
        return this.docs.map((layer) => layer.filename).filter((filename) => filename !== "")
    }

    /*  render a scope term as a short textual label  */
    static scopeLabel (term: ScopeTerm): string {
        if (term.kind === "default" || term.kind === "user" || term.kind === "project")
            return term.kind
        return `${term.kind}:${term.id}`
    }

    /*  resolve the configuration filename based on the selected scope term  */
    private resolveFilename (name: string, term: ScopeTerm): string {
        if (term.kind === "default")
            throw new Error("internal error: \"default\" scope has no filename")
        if (term.kind === "user")
            return path.join(userConfigDir(), `${name}.yaml`)
        else if (term.kind === "project") {
            const rel   = path.join(".ase", `${name}.yaml`)
            const root  = projectRoot() ?? process.cwd()
            const found = this.findUpward(process.cwd(), root, rel)
            return found ?? path.join(root, rel)
        }
        else if (term.kind === "task") {
            const root = projectRoot() ?? process.cwd()
            return path.join(root, ".ase", "task", term.id, `${name}.yaml`)
        }
        else
            return path.join(userStateDir(), "session", term.id, `${name}.yaml`)
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

    /*  read the full scope chain into memory; the requested mode applies
        to the target scope only, inherited scopes are always lenient  */
    read (mode: "strict" | "lenient" = "lenient"): void {
        const chain = this.scope
        const docs: Layer[] = []
        this.pruned = []
        for (let i = 0; i < chain.length; i++) {
            const sc = chain[i]
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
                if (isTarget)
                    this.pruned.push(`unparsable YAML (${doc.errors[0].message.split("\n")[0]})`)
                doc = new Document()
            }
            else if (this.name === "config" && this.migrate(doc)) {
                /*  persist the migration under the file lock (unless already held by us),
                    re-reading the file there to not clobber a concurrent write  */
                const persist = () => {
                    const disk = parseDocument(fs.readFileSync(filename, "utf8"))
                    if (disk.errors.length > 0 || !this.migrate(disk))
                        return
                    const empty = isMap(disk.contents) && disk.contents.items.length === 0
                    writeFileAtomic.sync(filename, empty ? "" : disk.toString({ indent: 4 }),
                        { encoding: "utf8", mode: this.fileMode(sc, disk) })
                    this.log.write("info", `migrated obsolete configuration entries in ${filename}`)
                }
                try {
                    if (this.locked === filename)
                        persist()
                    else {
                        const release = lockfile.lockSync(filename)
                        try {
                            persist()
                        }
                        finally {
                            release()
                        }
                    }
                }
                catch (err) {
                    this.log.write("warning", `failed to migrate obsolete configuration entries in ${filename}: ` +
                        (err instanceof Error ? err.message : String(err)))
                }
            }
            docs.push({ scope: sc, filename, doc })
        }
        this.docs   = docs
        this.target = docs.length - 1
        for (let i = 0; i < docs.length; i++) {
            const isTarget   = (i === this.target)
            const perDocMode: "strict" | "lenient" = isTarget ? mode : "lenient"
            const removed    = this.validateDoc(docs[i].doc, docs[i].filename, perDocMode)
            if (isTarget)
                this.pruned.push(...removed)
        }
    }

    /*  migrate a configuration document in place from obsolete variables: the
        (pre-1.1.0) "project.artifact.task.{basedir,files}", where "basedir" becomes
        "project.task.store.url" (as "ase:<basedir>") unless the latter is already
        set and "files" is dropped, and the (pre-1.1.0) "agent.{task,skill}", which
        are dropped, as they moved into the internal session state;
        returns whether the document was changed  */
    private migrate (doc: Document): boolean {
        let changed = false
        const task = [ "project", "artifact", "task" ]
        if (isMap(doc.getIn(task))) {
            const basedir = doc.getIn([ ...task, "basedir" ])
            const parent  = doc.getIn([ "project", "task" ])
            const store   = doc.getIn([ "project", "task", "store" ])
            if (typeof basedir === "string" && basedir !== ""
                && (parent === undefined || isMap(parent)) && (store === undefined || isMap(store))
                && !doc.hasIn([ "project", "task", "store", "url" ]))
                doc.setIn([ "project", "task", "store", "url" ], `ase:${basedir}`)
            doc.deleteIn(task)
            changed = true
        }
        if (isMap(doc.getIn([ "agent" ])))
            for (const key of [ "task", "skill" ])
                if (doc.deleteIn([ "agent", key ]))
                    changed = true
        if (!changed)
            return false
        for (const p of [ [ "project", "artifact" ], [ "project" ], [ "agent" ] ]) {
            const node = doc.getIn(p)
            if (isMap(node) && node.items.length === 0)
                doc.deleteIn(p)
        }
        return true
    }

    /*  acquire a cross-process advisory lock on the target scope's file,
        execute the callback, then release the lock  */
    lock (cb: () => void): void {
        const td = this.docs[this.target]
        if (td.scope.kind === "default")
            throw new Error("internal error: \"default\" scope is not lockable")
        fs.mkdirSync(path.dirname(td.filename), { recursive: true })
        if (!fs.existsSync(td.filename))
            fs.writeFileSync(td.filename, "", { encoding: "utf8", mode: this.fileMode(td.scope, null) })
        const release = lockfile.lockSync(td.filename)
        this.locked = td.filename
        try {
            cb()
        }
        finally {
            this.locked = null
            release()
        }
    }

    /*  write in-memory configuration back to the target scope's file  */
    write (): void {
        const td = this.docs[this.target]
        if (td.scope.kind === "default")
            throw new Error("internal error: \"default\" scope is not writable")

        /*  a lenient read physically removes the invalid content from the in-memory
            target document, so writing that document back would silently erase the
            very same content from the file on disk  */
        if (this.pruned.length > 0)
            throw new Error(`refusing to overwrite ${td.filename}: it carries invalid content ` +
                `(${this.pruned.join(", ")}) which was skipped on reading and hence would be ` +
                "lost on writing -- repair the file first")

        this.validateDoc(td.doc, td.filename, "strict")
        fs.mkdirSync(path.dirname(td.filename), { recursive: true })
        writeFileAtomic.sync(td.filename, td.doc.toString({ indent: 4 }),
            { encoding: "utf8", mode: this.fileMode(td.scope, td.doc) })
    }

    /*  determine the file mode of a scope's file: user-private (0600) for the
        user scope, the "store" files, and any file carrying secrets, else
        undefined (which lets an existing file's mode be preserved)  */
    private fileMode (scope: ScopeTerm, doc: Document | null): number | undefined {
        if (scope.kind === "user" || this.name === "store"
            || (doc !== null && configSecretKeys.some((key) => doc.hasIn(key.split(".")))))
            return 0o600
        return undefined
    }

    /*  validate a single YAML document against the optional schema; in "strict"
        mode all invalid entries are reported as a thrown error, in "lenient" mode
        they are removed from the document and their dotted paths are returned  */
    private validateDoc (doc: Document, filename: string, mode: "strict" | "lenient" = "strict"): string[] {
        if (this.schema === null)
            return []
        const removed: string[] = []
        for (;;) {
            const result = v.safeParse(this.schema, doc.toJS())
            if (result.success)
                return removed
            if (mode === "strict") {
                const issues = result.issues.map((i) => {
                    const dotPath = (i.path ?? []).map((p) => String(p.key)).join(".")
                    return dotPath ? `${dotPath}: ${i.message}` : i.message
                }).join("; ")
                throw new Error(`invalid configuration in ${filename}: ${issues}`)
            }
            const before = removed.length
            for (const i of result.issues) {
                const segs    = (i.path ?? []).map((p) => String(p.key))
                const dotPath = segs.join(".")
                this.log.write("warning", `invalid entry in ${filename}: ${dotPath ? `${dotPath}: ` : ""}${i.message}`)
                if (segs.length > 0 && doc.deleteIn(segs))
                    removed.push(dotPath)
                /*  issues at the document root and issues whose stringified path does not
                    address a deletable node (e.g. a non-string YAML key like "404:", which
                    "toJS" stringifies) cannot be removed; processing continues with the
                    remaining issues  */
            }
            if (removed.length === before)
                return removed
        }
    }

    /*  enumerate all full dotted leaf paths from the attached valibot schema  */
    private schemaLeafPaths (): string[][] {
        const walk = (s: unknown, prefix: string[]): string[][] => {
            const u = unwrapSchema(s)
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

    /*  enumerate all full dotted keys known from the attached valibot schema  */
    keys (): string[] {
        if (this.schema === null)
            return []
        return this.schemaLeafPaths().map((p) => p.join("."))
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
        return this.getScoped(key)?.value
    }

    /*  retrieve the effective value at a dotted key (strongest scope wins)
        together with the scope term and the configuration file (empty for
        the built-in "default" scope) which supplied it  */
    getScoped (key: string): { value: unknown, scope: ScopeTerm, filename: string } | undefined {
        const segs = this.resolveKey(key).split(".")
        for (let i = this.docs.length - 1; i >= 0; i--) {
            const node = this.docs[i].doc.getIn(segs)
            if (node !== undefined)
                return { value: node, scope: this.docs[i].scope, filename: this.docs[i].filename }
        }
        return undefined
    }

    /*  retrieve the explicitly configured value at a dotted key, i.e. the same
        cascade as "get", but skipping the built-in "default" scope layer, so
        callers can distinguish a deliberately configured value from a merely
        preset one  */
    getExplicit (key: string): unknown {
        const segs = this.resolveKey(key).split(".")
        for (let i = this.docs.length - 1; i >= 0; i--) {
            if (this.docs[i].scope.kind === "default")
                continue
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

    /*  determine the value type of a dotted key from its schema leaf: an enum (a picklist,
        with its options), a boolean resp. number (a union with such a member), or a string  */
    keyType (key: string): KeyType {
        let node = unwrapSchema(this.schema)
        for (const seg of this.resolveKey(key).split("."))
            node = unwrapSchema(node?.entries?.[seg])
        if (node?.type === "picklist")
            return { type: "enum", options: (node.options ?? []).map((o) => String(o)) }
        const members = node?.type === "union" ? (node.options ?? []).map((o) => (o as SchemaNode).type) : []
        if (members.includes("boolean"))
            return { type: "boolean" }
        else if (members.includes("number"))
            return { type: "number" }
        return { type: "string" }
    }

    /*  retrieve the values of a dotted key on all scopes of the chain (after reading),
        from the weakest to the strongest scope, with undefined for an unset value  */
    getLayered (key: string): Array<{ scope: ScopeTerm, value: unknown }> {
        const segs = this.resolveKey(key).split(".")
        return this.docs.map((layer) => {
            const node = layer.doc.getIn(segs)
            return { scope: layer.scope, value: isScalar(node) ? node.value : node }
        })
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
        this.validateDoc(next, td.filename, "strict")
        td.doc = next
    }

    /*  delete a value at a dotted key from the target scope  */
    delete (key: string): void {
        this.assertWritable(key)
        const td   = this.docs[this.target]
        if (td.doc.contents === null || td.doc.contents === undefined)
            return
        const next = td.doc.clone()
        next.deleteIn(this.resolveKey(key).split("."))
        this.validateDoc(next, td.filename, "strict")
        td.doc = next
    }
}

/*  access the internal "state.yaml" of a session, which, unlike the
    configuration, does not cascade through any weaker scope  */
export const sessionState = (log: Log, sessionId: string): Config => {
    if (!/^[A-Za-z0-9._-]+$/.test(sessionId))
        throw new Error(`invalid session id "${sessionId}"`)
    return new Config("state", sessionStateSchema, log, [ { kind: "session", id: sessionId } ])
}
