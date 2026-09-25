/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import path                                   from "node:path"
import fs                                     from "node:fs"

import { Command }                            from "commander"
import { execaSync }                          from "execa"
import { DateTime }                           from "luxon"
import picomatch                              from "picomatch"
import { isScalar }                           from "yaml"
import { z }                                  from "zod"
import { LRUCache }                           from "lru-cache"

import type { McpServer }                     from "@modelcontextprotocol/sdk/server/mcp.js"

import type Log                               from "./ase-log.js"
import { Config, configSchema, parseScope }   from "./ase-config.js"
import { Markdown }                           from "./ase-markdown.js"
import { readStdin, writeStdout }             from "./ase-stdio.js"

/*  a task lifecycle model: the lifecycle states a task plan can be in
    (the accepted values of its "Status:" frontmatter key), the initial
    state an absent key reads as, the "finished" states, and the allowed
    state transitions (from each state to its successor states)  */
export type TaskLifecycle = {
    name: string, states: string[], initial: string, finished: string[],
    transitions: Record<string, string[]>
}

/*  the pre-defined task lifecycle models (see "project.task.lifecycle")  */
export const taskLifecycles: Record<string, TaskLifecycle> = {
    solo: {
        name:     "solo",
        states:   [ "OPEN", "SHELVED", "CLOSED", "CANCELLED" ],
        initial:  "OPEN",
        finished: [ "CLOSED", "CANCELLED" ],
        transitions: {
            OPEN:         [ "SHELVED", "CLOSED", "CANCELLED" ],
            SHELVED:      [ "OPEN", "CANCELLED" ],
            CLOSED:       [],
            CANCELLED:    []
        }
    },
    team: {
        name:     "team",
        states:   [ "PLANNING", "SHELVED", "IMPLEMENTING", "STALLED", "IMPLEMENTED", "CANCELLED" ],
        initial:  "PLANNING",
        finished: [ "IMPLEMENTED", "CANCELLED" ],
        transitions: {
            PLANNING:     [ "SHELVED", "IMPLEMENTING", "CANCELLED" ],
            SHELVED:      [ "PLANNING", "CANCELLED" ],
            IMPLEMENTING: [ "PLANNING", "STALLED", "IMPLEMENTED", "CANCELLED" ],
            STALLED:      [ "IMPLEMENTING", "CANCELLED" ],
            IMPLEMENTED:  [],
            CANCELLED:    []
        }
    },
    enterprise: {
        name:     "enterprise",
        states:   [ "DRAFTED", "SHELVED", "PLANNING", "PLANNED", "STALLED", "IMPLEMENTING",
            "IMPLEMENTED", "DECLINED", "APPROVING", "APPROVED", "DEFERRED", "INTEGRATING",
            "INTEGRATED", "CANCELLED" ],
        initial:  "DRAFTED",
        finished: [ "INTEGRATED", "CANCELLED" ],
        transitions: {
            DRAFTED:      [ "SHELVED", "PLANNING", "CANCELLED" ],
            SHELVED:      [ "DRAFTED", "CANCELLED" ],
            PLANNING:     [ "DRAFTED", "SHELVED", "PLANNED", "CANCELLED" ],
            PLANNED:      [ "STALLED", "IMPLEMENTING", "CANCELLED" ],
            STALLED:      [ "PLANNED", "CANCELLED" ],
            IMPLEMENTING: [ "DRAFTED", "PLANNED", "STALLED", "IMPLEMENTED", "CANCELLED" ],
            IMPLEMENTED:  [ "DECLINED", "APPROVING", "CANCELLED" ],
            DECLINED:     [ "IMPLEMENTED", "CANCELLED" ],
            APPROVING:    [ "DRAFTED", "PLANNED", "IMPLEMENTED", "DECLINED", "APPROVED", "CANCELLED" ],
            APPROVED:     [ "DEFERRED", "INTEGRATING", "CANCELLED" ],
            DEFERRED:     [ "APPROVED", "CANCELLED" ],
            INTEGRATING:  [ "DRAFTED", "PLANNED", "APPROVED", "DEFERRED", "INTEGRATED", "CANCELLED" ],
            INTEGRATED:   [],
            CANCELLED:    []
        }
    }
}

/*  reusable functionality: persisted task plans under
    <project>/<basedir>/TASK-<id>.md (driven by the
    "project.artifact.task.{basedir,files}" configuration)  */
export class Task {
    /*  validate the task id to keep it safe as a filename component  */
    static validateId (id: string): void {
        if (typeof id !== "string" || id.length === 0)
            throw new Error("task: id must be a non-empty string")
        if (!/^[A-Za-z0-9_-]+$/.test(id))
            throw new Error("task: id must match [A-Za-z0-9_-]+")
    }

    /*  validate the session id to keep it safe as a config scope term  */
    static validateSession (session: string): void {
        if (typeof session !== "string" || session.length === 0)
            throw new Error("task: session must be a non-empty string")
        if (!/^[A-Za-z0-9_-]+$/.test(session))
            throw new Error("task: session must match [A-Za-z0-9_-]+")
    }

    /*  cached project root determination (TTL-bounded, as the ASE
        service is long-running and the Git context can change)  */
    private static projectRootCache = new LRUCache<string, string>({ max: 4, ttl: 10 * 1000 })

    /*  determine the project root (Git top-level if inside a Git
        working tree, otherwise the current working directory);
        cached, as each determination spawns a Git subprocess  */
    static projectRoot (): string {
        const cwd    = process.cwd()
        const cached = Task.projectRootCache.get(cwd)
        if (cached !== undefined)
            return cached
        let root = cwd
        try {
            const result = execaSync("git", [ "rev-parse", "--show-toplevel" ], { stderr: "ignore" })
            const top = result.stdout.trim()
            if (top !== "")
                root = top
        }
        catch {
            /*  not inside a Git working tree  */
        }
        Task.projectRootCache.set(cwd, root)
        return root
    }

    /*  cached task storage specification (TTL-bounded, mirroring the project
        root cache, as each read parses the whole layered YAML config chain)  */
    private static specCache = new LRUCache<string, { basedir: string, files: string, lifecycle: TaskLifecycle }>({ max: 4, ttl: 2 * 1000 })

    /*  read the configured "basedir" anchor and "files" miniglob spec for
        task storage plus the task "lifecycle" model; "basedir" is
        project-root-relative (POSIX, defaults to ".ase/task"), "files"
        constrains the task filenames (defaults to "*.md"), and
        "lifecycle" selects the task lifecycle model (defaults to "solo")  */
    private static spec (log: Log): { basedir: string, files: string, lifecycle: TaskLifecycle } {
        const root   = Task.projectRoot()
        const cached = Task.specCache.get(root)
        if (cached !== undefined)
            return cached
        const cfg    = new Config("config", configSchema, log)
        cfg.read()
        const read = (key: string): string => {
            const val = cfg.get(key)
            if (val === undefined)
                return ""
            return String(isScalar(val) ? val.value : val)
        }
        const basedir = (read("project.artifact.task.basedir") || ".ase/task")
            .replace(/\\/g, "/").replace(/^\/+|\/+$/g, "")
        if (basedir.split("/").includes(".."))
            throw new Error(`task: configured "basedir" "${basedir}" must not escape the project root`)
        const files   = read("project.artifact.task.files") || "*.md"
        const name    = read("project.task.lifecycle") || "solo"
        const lifecycle = taskLifecycles[name]
        if (lifecycle === undefined)
            throw new Error(`task: configured "lifecycle" "${name}" must be one of: ` +
                Object.keys(taskLifecycles).join(", "))
        const result  = { basedir, files, lifecycle }
        Task.specCache.set(root, result)
        return result
    }

    /*  resolve the configured task lifecycle model  */
    static lifecycle (log: Log): TaskLifecycle {
        return Task.spec(log).lifecycle
    }

    /*  resolve the on-disk base directory for task storage  */
    static baseDir (log: Log): string {
        return path.join(Task.projectRoot(), Task.spec(log).basedir)
    }

    /*  resolve the configured "files" miniglob of task storage  */
    static files (log: Log): string {
        return Task.spec(log).files
    }

    /*  ensure a task id's "TASK-<id>.md" filename satisfies
        the configured "files" miniglob  */
    private static enforceFiles (log: Log, id: string): void {
        const { files } = Task.spec(log)
        const filename  = `TASK-${id}.md`
        if (!picomatch(files, { dot: true })(filename))
            throw new Error(`task: id "${id}" yields filename "${filename}" ` +
                `which does not match the configured "files" glob "${files}"`)
    }

    /*  resolve the on-disk path for a given task id; as a side effect,
        eagerly migrate any legacy <basedir>/<id>/plan.md files to the
        current <basedir>/TASK-<id>.md layout ("migrateAll" is a cheap
        no-op once the store is migrated)  */
    static path (log: Log, id: string): string {
        Task.validateId(id)
        Task.enforceFiles(log, id)
        Task.migrateAll(log)
        return path.join(Task.baseDir(log), `TASK-${id}.md`)
    }

    /*  migrate all legacy <basedir>/<id>/plan.md task files to the current
        <basedir>/TASK-<id>.md layout; an existing TASK-<id>.md is never
        overwritten; the legacy <id>/ directory is removed only if it is
        empty afterwards; returns the migrated task ids in lexicographic order  */
    static migrateAll (log: Log): string[] {
        const dir = Task.baseDir(log)
        if (!fs.existsSync(dir))
            return []
        const migrated: string[] = []
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (!entry.isDirectory() || !/^[A-Za-z0-9_-]+$/.test(entry.name))
                continue
            const id      = entry.name
            const oldFile = path.join(dir, id, "plan.md")
            const newFile = path.join(dir, `TASK-${id}.md`)
            if (!fs.existsSync(oldFile))
                continue
            if (fs.existsSync(newFile)) {
                log.write("warning", `task: not migrating "${id}": target "TASK-${id}.md" already exists`)
                continue
            }
            fs.renameSync(oldFile, newFile)

            /*  drop the legacy directory, but only if it is really empty  */
            const legacyDir = path.dirname(oldFile)
            if (fs.readdirSync(legacyDir).length === 0)
                fs.rmdirSync(legacyDir)
            else
                log.write("warning", `task: keeping non-empty legacy directory "${legacyDir}"`)
            migrated.push(id)
        }
        migrated.sort((a, b) => a.localeCompare(b))
        return migrated
    }

    /*  the legacy task plan header lines, each mapped onto the
        frontmatter key which superseded it  */
    private static legacy = [
        { key: "Created",  re: /^⎈[ \t]+Created:[ \t]*(.*)$/m  },
        { key: "Modified", re: /^⚙[ \t]+Modified:[ \t]*(.*)$/m },
        { key: "Kind",     re: /^☯[ \t]+Kind:[ \t]*(.*)$/m     }
    ]

    /*  the frontmatter keys of the current task plan format, in their
        canonical order (see "ase-format-task.md")  */
    private static frontKeys = [
        "Type", "Id", "Created", "Modified", "Group", "Phase",
        "After", "Status", "Kind", "Tags", "Branch"
    ]

    /*  the legacy lifecycle states of the pre-lifecycle-model task plan
        format, each mapped onto its candidate states in the current models
        (first candidate present in the configured model wins, otherwise
        the initial state of the model is used)  */
    private static legacyStates: Record<string, string[]> = {
        DRAFTED:   [],
        REJECTED:  [],
        APPROVED:  [ "PLANNED", "PLANNING", "OPEN" ],
        DEFERRED:  [ "SHELVED" ],
        STARTED:   [ "IMPLEMENTING", "OPEN" ],
        BLOCKED:   [ "STALLED", "OPEN" ],
        COMPLETED: [ "INTEGRATED", "IMPLEMENTED", "CLOSED" ],
        CANCELLED: [ "CANCELLED" ]
    }

    /*  render a single frontmatter line with a column-aligned key  */
    private static frontLine (key: string, value: string): string {
        return (key + ":").padEnd(10) + value
    }

    /*  parse the frontmatter block of a plan into its key/value pairs,
        keeping any non-key lines for a verbatim pass-through, plus the
        length of the block; returns null if the plan carries no block  */
    private static parseFront (text: string): { keys: Map<string, string>, other: string[], length: number } | null {
        const fm = /^---\r?\n([\s\S]*?\r?\n)---\r?\n/.exec(text)
        if (fm === null)
            return null
        const keys  = new Map<string, string>()
        const other = [] as string[]
        for (const line of fm[1].split(/\r?\n/)) {
            const m = /^([A-Za-z]+):[ \t]*(.*?)[ \t]*$/.exec(line)
            if (m !== null)
                keys.set(m[1], m[2])
            else if (line !== "")
                other.push(line)
        }
        return { keys, other, length: fm[0].length }
    }

    /*  re-assemble a frontmatter block with the keys in canonical order
        (unknown keys and non-key lines trailing) and the values re-aligned  */
    private static assembleFront (keys: Map<string, string>, other: string[]): string {
        const front = Task.frontKeys
            .filter((key) => keys.has(key))
            .map((key) => Task.frontLine(key, keys.get(key)!))
        for (const [ key, value ] of keys)
            if (!Task.frontKeys.includes(key))
                front.push(Task.frontLine(key, value))
        return `---\n${[ ...front, ...other ].join("\n")}\n---\n`
    }

    /*  normalize a legacy task plan into the current Markdown frontmatter
        shape, so every consumer sees a single plan shape only: a plan
        carrying its metadata in the "#   TASK <id>: <title>" heading and
        the "⎈"/"⚙"/"☯" glyph header lines is first lifted into a
        frontmatter block; then the frontmatter block is migrated by
        inserting the mandatory "Type:" key, mapping a legacy "Status:" value
        onto the configured lifecycle model, rewriting the legacy "Properties:"
        key into "Tags:", and re-ordering and re-aligning the keys; any content
        without a frontmatter block or task heading is passed through
        verbatim; absent optional keys are never materialized, as they read
        as their default value  */
    static normalize (id: string, text: string, lifecycle: TaskLifecycle): string {
        if (text === "")
            return text

        /*  lift the heading and the glyph header lines into their frontmatter
            keys, with the task id taken from the authoritative filename-derived id  */
        if (!/^---\r?\n/.test(text)) {
            const heading = /^#[ \t]+TASK(?:[ \t]+[A-Za-z0-9_-]+)?[ \t]*:[ \t]*(.*)$/m.exec(text)
            if (heading === null)
                return text
            let body    = text.replace(heading[0], "")
            const front = [ Task.frontLine("Id", id) ]
            for (const legacy of Task.legacy) {
                const m = legacy.re.exec(body)
                if (m === null)
                    continue
                front.push(Task.frontLine(legacy.key, m[1].trim()))
                body = body.replace(m[0], "")
            }
            text = `---\n${front.join("\n")}\n---\n\n` +
                `#   TASK: ${heading[1].trim()}\n\n` +
                body.replace(/^(?:[ \t]*\r?\n)+/, "")
        }

        /*  parse the frontmatter block into its key/value pairs  */
        const fm = Task.parseFront(text)
        if (fm === null)
            return text
        const keys = fm.keys

        /*  a plan is legacy if it lacks the mandatory "Type:" key (or still
            carries the "Properties:" key), decided before "Type:" is inserted  */
        const isLegacy = !keys.has("Type") || keys.has("Properties")

        /*  insert the mandatory "Type:" key  */
        if (!keys.has("Type"))
            keys.set("Type", "text/vnd.ase.task")

        /*  map a legacy "Status:" value unconditionally onto the configured
            lifecycle model, as legacy values like "APPROVED" or "DEFERRED"
            carry a different meaning than their same-named current states  */
        const status = keys.get("Status")
        if (isLegacy && status !== undefined && Object.hasOwn(Task.legacyStates, status)) {
            const state = Task.legacyStates[status].find((state) => lifecycle.states.includes(state))
            keys.set("Status", state ?? lifecycle.initial)
        }

        /*  rewrite the legacy "Properties:" key into "Tags:", where the
            legacy "grilled" property (a fully grilled plan) becomes one
            "grilled:" tag per section and any other property a plain tag  */
        const properties = keys.get("Properties")
        if (properties !== undefined) {
            keys.delete("Properties")
            const tags = properties.split(",")
                .map((token) => token.trim())
                .filter((token) => token !== "" && token.toLowerCase() !== "none")
                .flatMap((token) => token.toLowerCase() === "grilled" ?
                    [ "grilled:specification", "grilled:design", "grilled:verification" ] : [ token ])
            if (tags.length > 0)
                keys.set("Tags", [ keys.get("Tags") ?? "", ...tags ].filter((tag) => tag !== "").join(", "))
        }

        /*  re-assemble the frontmatter block, followed by the untouched
            remainder of the plan  */
        return Task.assembleFront(keys, fm.other) + text.slice(fm.length)
    }

    /*  load a task, normalized into the current Markdown frontmatter
        shape; returns empty string if no task exists  */
    static load (log: Log, id: string): string {
        const file = Task.path(log, id)
        if (!fs.existsSync(file))
            return ""
        return Task.normalize(id, fs.readFileSync(file, "utf8"), Task.lifecycle(log))
    }

    /*  check a "Status:" change against the task lifecycle model: returns
        a warning (else empty) if the new status is not a state of the
        model or not reachable from the old status by traversing one or
        more transitions of the state machine (as a single operation may
        perform several lifecycle stages in one go)  */
    private static checkStatus (lifecycle: TaskLifecycle, from: string, to: string): string {
        if (!lifecycle.states.includes(to))
            return `status "${to}" is not a state of the "${lifecycle.name}" task lifecycle model ` +
                `(expected one of: ${lifecycle.states.join(", ")})`
        const seen  = new Set<string>([ from ])
        const queue = [ from ]
        while (queue.length > 0) {
            const state = queue.shift()!
            if (state === to)
                return ""
            for (const next of lifecycle.transitions[state] ?? [])
                if (!seen.has(next)) {
                    seen.add(next)
                    queue.push(next)
                }
        }
        return `transition from "${from}" to "${to}" is not reachable in the "${lifecycle.name}" task lifecycle model`
    }

    /*  save a task as UTF-8 text under the given id into the
        <project>/<basedir>/TASK-<id>.md file; the plan is saved as-is, but
        its "Status:" frontmatter key is checked against the task lifecycle
        model and a warning (else empty) is returned if the status is
        unknown or not reachable from the previous status  */
    static save (log: Log, id: string, text: string): string {
        if (typeof text !== "string")
            throw new Error("task: text must be a string")
        const lifecycle = Task.lifecycle(log)
        const from      = Task.status(Task.load(log, id), lifecycle.initial)
        const to        = Task.status(text, lifecycle.initial)
        const file = Task.path(log, id)
        fs.mkdirSync(path.dirname(file), { recursive: true })
        fs.writeFileSync(file, text, "utf8")
        return Task.checkStatus(lifecycle, from, to)
    }

    /*  delete a task by id; removes the single
        <project>/<basedir>/TASK-<id>.md file; returns true if a task existed  */
    static delete (log: Log, id: string): boolean {
        const file = Task.path(log, id)
        if (!fs.existsSync(file))
            return false
        fs.rmSync(file, { force: true })
        return true
    }

    /*  rename a task by moving its <project>/<basedir>/TASK-<oldId>.md file
        to <project>/<basedir>/TASK-<newId>.md; the embedded "Id:"
        frontmatter key inside the plan content is rewritten to the new id
        (falling back to the "#   TASK <id>:" heading of a still legacy,
        not yet normalized plan); returns true on success, false if the
        source task does not exist; throws if the target id already exists  */
    static rename (log: Log, oldId: string, newId: string): boolean {
        const oldFile = Task.path(log, oldId)
        const newFile = Task.path(log, newId)
        if (!fs.existsSync(oldFile))
            return false
        if (fs.existsSync(newFile))
            throw new Error(`task: target id "${newId}" already exists`)
        const text    = fs.readFileSync(oldFile, "utf8")
        const updated = /^---\r?\n/.test(text) ?
            text.replace(/^(Id:[ \t]*)[A-Za-z0-9_-]+[ \t]*$/m, `$1${newId}`) :
            text.replace(/(^#\s+TASK\s+)[A-Za-z0-9_-]+(\s*:)/m, `$1${newId}$2`)
        fs.mkdirSync(path.dirname(newFile), { recursive: true })
        fs.writeFileSync(newFile, updated, "utf8")
        fs.rmSync(oldFile, { force: true })
        return true
    }

    /*  scan the task base directory (after eager migration) for
        "TASK-<id>.md" files matching the configured "files" miniglob  */
    private static scan (log: Log): { id: string, file: string, st: fs.Stats }[] {
        Task.migrateAll(log)
        const { basedir, files } = Task.spec(log)
        const dir = path.join(Task.projectRoot(), basedir)
        if (!fs.existsSync(dir))
            return []
        const isMatch = picomatch(files, { dot: true })
        const out: { id: string, file: string, st: fs.Stats }[] = []
        for (const entry of fs.readdirSync(dir)) {
            const m = /^TASK-([A-Za-z0-9_-]+)\.md$/.exec(entry)
            if (m === null || !isMatch(entry))
                continue
            const file = path.join(dir, entry)
            const st   = fs.statSync(file)
            if (!st.isFile())
                continue
            out.push({ id: m[1], file, st })
        }
        return out
    }

    /*  read the "Status:" frontmatter key of a (normalized) task plan,
        falling back to the initial state of the task lifecycle model for a
        plan whose frontmatter is absent or carries no such key  */
    private static status (text: string, initial: string): string {
        const fm = /^---\r?\n([\s\S]*?\r?\n)---\r?\n/.exec(text)
        if (fm === null)
            return initial
        const m = /^Status:[ \t]*(\S+)[ \t]*$/m.exec(fm[1])
        if (m === null)
            return initial
        return m[1]
    }

    /*  split a (normalized) task plan into its frontmatter keys and its
        Markdown body (without the backmatter), for read-only consumers
        which must not parse plans themselves; returns null if no task exists  */
    static parts (log: Log, id: string): { keys: Map<string, string>, body: string } | null {
        const text = Task.load(log, id)
        if (text === "")
            return null
        const fm = Task.parseFront(text)
        if (fm === null)
            return { keys: new Map(), body: text }
        const rest = text.slice(fm.length)
        const end  = /^---\r?$/m.exec(rest)
        return { keys: fm.keys, body: end === null ? rest : rest.slice(0, end.index) }
    }

    /*  list the attachments of a (normalized) task plan, i.e. its backmatter
        blocks, each with its type, description, and either the referenced
        file (relative to the task storage) or the embedded data  */
    static attachments (log: Log, id: string): { type: string, desc: string, file?: string, data?: string }[] {
        const text = Task.load(log, id)
        const fm   = text === "" ? null : Task.parseFront(text)
        if (fm === null)
            return []
        const out = [] as { type: string, desc: string, file?: string, data?: string }[]
        for (const block of text.slice(fm.length).split(/^---\r?\n/m).slice(1)) {
            const keys = new Map<string, string>()
            const data = [] as string[]
            let   body = false
            for (const line of block.split(/\r?\n/)) {
                const m = body ? null : /^([A-Za-z]+):[ \t]*(.*?)[ \t]*$/.exec(line)
                if (m !== null && m[1] === "Data")
                    body = true
                else if (m !== null)
                    keys.set(m[1], m[2])
                else if (body)
                    data.push(line.replace(/^ {4}/, ""))
            }
            const type = keys.get("Type")
            if (type === undefined)
                continue
            out.push({
                type,
                desc: keys.get("Desc") ?? "",
                ...(keys.has("File") ? { file: keys.get("File")! } : {}),
                ...(body ? { data: data.join("\n") } : {})
            })
        }
        return out
    }

    /*  read a referenced attachment file of a task, resolved against the task
        storage and confined to it; returns null if missing or escaping  */
    static attachmentFile (log: Log, file: string): Buffer | null {
        const base = Task.baseDir(log)
        const full = path.resolve(base, file)
        if (!full.startsWith(base + path.sep) || !fs.existsSync(full))
            return null
        return fs.readFileSync(full)
    }

    /*  get the lifecycle status of a task plan: the "Status:" frontmatter
        key of the normalized plan, falling back to the initial state of the
        task lifecycle model; throws if no task exists  */
    static getStatus (log: Log, id: string): string {
        const text = Task.load(log, id)
        if (text === "")
            throw new Error(`task: no task "${id}"`)
        return Task.status(text, Task.lifecycle(log).initial)
    }

    /*  set the lifecycle status of a task plan: the (case-insensitively
        given) status has to be a state of the task lifecycle model, while
        the "Modified:" frontmatter key is left alone, as it tracks body
        changes only; returns the previous and the new status plus a warning
        (else empty) if the new status is not reachable from the previous
        one in the state machine of the model; throws if no task exists, the plan has no frontmatter
        block, or the status is unknown  */
    static setStatus (log: Log, id: string, status: string): { from: string, to: string, warning: string } {
        const lifecycle = Task.lifecycle(log)
        const text = Task.load(log, id)
        if (text === "")
            throw new Error(`task: no task "${id}"`)
        const to = status.trim().toUpperCase()
        if (!lifecycle.states.includes(to))
            throw new Error(`task: invalid state "${status}" ` +
                `(expected one of: ${lifecycle.states.join(", ")})`)
        const fm = Task.parseFront(text)
        if (fm === null)
            throw new Error(`task: task "${id}" has no frontmatter block`)
        const from = fm.keys.get("Status") ?? lifecycle.initial
        fm.keys.set("Status", to)
        const warning = Task.save(log, id, Task.assembleFront(fm.keys, fm.other) + text.slice(fm.length))
        return { from, to, warning }
    }

    /*  list all persisted tasks in lexicographic id order, each with the
        `status` of its (normalized) plan; if verbose is true, each entry's
        `mtime` is set to the task file's modification time formatted as
        "YYYY-MM-DD HH:MM", otherwise it is left undefined  */
    static list (log: Log, verbose = false): { id: string, status: string, mtime: string | undefined }[] {
        const lifecycle = Task.lifecycle(log)
        const out = Task.scan(log).map((entry) => ({
            id:     entry.id,
            status: Task.status(Task.normalize(entry.id, fs.readFileSync(entry.file, "utf8"), lifecycle), lifecycle.initial),
            mtime:  verbose ? DateTime.fromJSDate(entry.st.mtime).toFormat("yyyy-LL-dd HH:mm") : undefined
        }))
        out.sort((a, b) => a.id.localeCompare(b.id))
        return out
    }

    /*  resolve an "include" and an "exclude" comma-separated lifecycle
        state list into the effective state set a task plan has to be in
        to be listed at all; the "none" sentinel and empty tokens are
        silently dropped, the "finished" sentinel expands to the finished
        states of the task lifecycle model, an empty "include" list means
        all states, and the "exclude" list is applied after the "include" list  */
    static states (log: Log, include: string, exclude: string): string[] {
        const lifecycle = Task.lifecycle(log)
        const parse = (list: string) => list.split(",")
            .map((token) => token.trim())
            .filter((token) => token !== "" && token.toUpperCase() !== "NONE")
            .flatMap((token) => {
                const state = token.toUpperCase()
                if (state === "FINISHED")
                    return lifecycle.finished
                if (!lifecycle.states.includes(state))
                    throw new Error(`task: invalid state "${token}" ` +
                        `(expected one of: ${lifecycle.states.join(", ")}, or "finished")`)
                return [ state ]
            })
        const included = parse(include)
        const excluded = parse(exclude)
        const states   = (included.length > 0 ? included : lifecycle.states)
            .filter((state) => !excluded.includes(state))
        if (states.length === 0)
            throw new Error("task: options \"--include\" and \"--exclude\" cancel out to an empty state set")
        return states
    }

    /*  purge tasks whose modification time is older than the given cutoff in
        milliseconds; returns the list of removed task ids  */
    static purge (log: Log, maxAgeMs: number): string[] {
        const cutoff = Date.now() - maxAgeMs
        const removed: string[] = []
        for (const entry of Task.scan(log)) {
            if (entry.st.mtimeMs < cutoff) {
                fs.rmSync(entry.file, { force: true })
                removed.push(entry.id)
            }
        }
        return removed
    }

    /*  get the active task id for a given session, or empty string if none  */
    static getId (log: Log, session: string): string {
        Task.validateSession(session)
        const scope = parseScope(`session:${session}`)
        const cfg = new Config("config", configSchema, log, scope)
        cfg.read()
        const val = cfg.get("agent.task")
        if (val === undefined)
            return ""
        return String(isScalar(val) ? val.value : val)
    }

    /*  set the active task id for a given session  */
    static setId (log: Log, session: string, id: string): void {
        Task.validateSession(session)
        Task.validateId(id)
        const scope   = parseScope(`session:${session}`)
        const cfg = new Config("config", configSchema, log, scope)
        cfg.lock(() => {
            cfg.read()
            cfg.set("agent.task", id)
            cfg.write()
        })
    }
}

/*  CLI command "ase task"  */
export default class TaskCommand {
    constructor (private log: Log) {}

    /*  register commands  */
    register (program: Command): void {
        /*  register CLI top-level command "ase task"  */
        const task = program
            .command("task")
            .description("Manage persisted tasks under <project>/<basedir>/TASK-<id>.md")
            .action(() => {
                task.outputHelp()
                process.exit(1)
            })

        /*  register CLI sub-command "ase task list"  */
        const lifecycleStates = Object.values(taskLifecycles)
            .map((lifecycle) => `${lifecycle.name}: ${lifecycle.states.join("|")}`)
            .join("; ")
        task
            .command("list")
            .description("List all persisted task ids, one per line")
            .option("-v, --verbose", "also show the task plan status and the task file " +
                "modification time as (YYYY-MM-DD HH:MM)")
            .option("-i, --include <states>",
                "comma-separated list of lifecycle states to list " +
                `(${lifecycleStates}), "finished" for the finished states, ` +
                "or \"none\" for no restriction",
                "none")
            .option("-e, --exclude <states>",
                "comma-separated list of lifecycle states to not list " +
                `(${lifecycleStates}), "finished" for the finished states, ` +
                "or \"none\" for no exclusion",
                "finished")
            .action(async (opts: { verbose?: boolean, include: string, exclude: string }) => {
                const states = Task.states(this.log, opts.include, opts.exclude)
                const known  = Task.lifecycle(this.log).states
                const items  = Task.list(this.log, opts.verbose ?? false)
                    .filter((item) => {
                        /*  keep (but warn about) a task in an unknown state
                            instead of silently dropping it from the list  */
                        if (!known.includes(item.status)) {
                            this.log.write("warning", `task: "${item.id}" has unknown status "${item.status}" ` +
                                `(expected one of: ${known.join(", ")})`)
                            return true
                        }
                        return states.includes(item.status)
                    })
                for (const item of items) {
                    if (opts.verbose)
                        await writeStdout(`${item.id}\t${item.status}\t(${item.mtime})\n`)
                    else
                        await writeStdout(`${item.id}\n`)
                }
            })

        /*  register CLI sub-command "ase task status"  */
        task
            .command("status")
            .description("Get or set the lifecycle status of a task: without <status> the current status " +
                "is printed, with <status> it is set (case-insensitively, warning about a status " +
                "not reachable in the task lifecycle model); <id> defaults to $ASE_TASK_ID")
            .argument("[<id>[:]]", "Task identifier (optionally colon-suffixed)")
            .argument("[<status>]", "Lifecycle status to set")
            .action(async (arg1?: string, arg2?: string) => {
                /*  resolve "[<id>[:]] [<status>]": a single token is the status
                    if it is a state of the task lifecycle model, else the id  */
                const states = Task.lifecycle(this.log).states
                let id     = process.env.ASE_TASK_ID ?? "default"
                let status = arg2
                if (arg2 !== undefined)
                    id = arg1!
                else if (arg1 !== undefined) {
                    if (!arg1.endsWith(":") && states.includes(arg1.toUpperCase()))
                        status = arg1
                    else
                        id = arg1
                }
                id = id.replace(/:$/, "")
                if (status === undefined)
                    await writeStdout(`${Task.getStatus(this.log, id)}\n`)
                else {
                    const result = Task.setStatus(this.log, id, status)
                    if (result.warning !== "")
                        this.log.write("warning", `task: ${result.warning}`)
                    this.log.write("info", `task: set status of "${id}" from "${result.from}" to "${result.to}"`)
                    process.exit(0)
                }
            })

        /*  register CLI sub-command "ase task load"  */
        task
            .command("load")
            .description("Load a task by id and write it to stdout")
            .argument("<id>", "Task identifier")
            .action(async (id: string) => {
                const text = Task.load(this.log, id)
                await writeStdout(text)
            })

        /*  register CLI sub-command "ase task edit"  */
        task
            .command("edit")
            .description("Edit a task by id with $EDITOR")
            .argument("<id>", "Task identifier")
            .action((id: string) => {
                const file   = Task.path(this.log, id)
                const editor = process.env.EDITOR ?? process.env.VISUAL ?? "vi"
                fs.mkdirSync(path.dirname(file), { recursive: true })
                if (!fs.existsSync(file))
                    fs.writeFileSync(file, "", "utf8")
                execaSync(editor, [ file ], { stdio: "inherit" })
                this.log.write("info", `task: edited "${id}"`)
                process.exit(0)
            })

        /*  register CLI sub-command "ase task save"  */
        task
            .command("save")
            .description("Save a task by id, reading content from stdin " +
                "(warning about a Status: not reachable in the task lifecycle model)")
            .argument("<id>", "Task identifier")
            .action(async (id: string) => {
                const text    = await readStdin()
                const warning = Task.save(this.log, id, text)
                if (warning !== "")
                    this.log.write("warning", `task: ${warning}`)
                this.log.write("info", `task: saved "${id}"`)
                process.exit(0)
            })

        /*  register CLI sub-command "ase task delete"  */
        task
            .command("delete")
            .description("Delete a task by id")
            .argument("<id>", "Task identifier")
            .action((id: string) => {
                const removed = Task.delete(this.log, id)
                if (removed)
                    this.log.write("info", `task: removed "${id}"`)
                else
                    this.log.write("info", `task: no task "${id}" to remove`)
                process.exit(removed ? 0 : 1)
            })

        /*  register CLI sub-command "ase task rename"  */
        task
            .command("rename")
            .description("Rename a task from <old> to <new>")
            .argument("<old>", "Old task identifier")
            .argument("<new>", "New task identifier")
            .action((oldId: string, newId: string) => {
                const renamed = Task.rename(this.log, oldId, newId)
                if (renamed)
                    this.log.write("info", `task: renamed "${oldId}" to "${newId}"`)
                else
                    this.log.write("info", `task: no task "${oldId}" to rename`)
                process.exit(renamed ? 0 : 1)
            })

        /*  register CLI sub-command "ase task purge"  */
        task
            .command("purge")
            .description("Remove all tasks with a modification time older than <age> (default: 31d); " +
                "<age> is <number><unit> with unit h (hour), d (day), m (month), y (year)")
            .argument("[<age>]", "Maximum task age as <number><unit>", "31d")
            .action((age: string) => {
                const m = /^(\d+)([hdmy])$/.exec(age)
                if (m === null)
                    throw new Error("task: <age> must match <number><unit> with unit h, d, m, or y")
                const n = Number.parseInt(m[1], 10)
                const unit = m[2]
                const hour  = 60 * 60 * 1000
                const day   = 24 * hour
                const month = 30 * day
                const year  = 365 * day
                const factors: Record<string, number> = { h: hour, d: day, m: month, y: year }
                const factor  = factors[unit]
                const removed = Task.purge(this.log, n * factor)
                if (removed.length === 0)
                    this.log.write("info", "task: no tasks to purge")
                else
                    for (const id of removed)
                        this.log.write("info", `task: purged "${id}"`)
                process.exit(0)
            })
    }
}

/*  render a caught error as an MCP tool error result  */
const mcpError = (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err)
    return {
        isError: true,
        content: [ { type: "text" as const, text: `ERROR: ${message}` } ]
    }
}

/*  MCP registration entry point for task tools  */
export class TaskMCP {
    constructor (private log: Log) {}

    /*  register MCP tools  */
    register (mcp: McpServer): void {
        /*  task list  */
        mcp.registerTool("ase_task_list", {
            title: "ASE task list",
            description:
                "List all persisted tasks. " +
                "Returns a `tasks` array (in lexicographic `id` order) where each item has the " +
                "task `id` and the `status` of its plan (the `Status:` frontmatter key, defaulting " +
                "to the initial state of the configured task lifecycle model). " +
                "If `verbose` is `true`, each item additionally has an `mtime` field " +
                "(last modification time of the task's `TASK-<id>.md` file, formatted as `YYYY-MM-DD HH:MM`). " +
                "Returns an empty array if no tasks exist.",
            inputSchema:  {
                verbose: z.boolean().optional()
                    .describe("if true, also include the `mtime` field per task (default: false)")
            },
            outputSchema: {
                tasks: z.array(z.object({
                    id:     z.string().describe("task identifier"),
                    status: z.string().describe("task plan lifecycle status (`Status:` frontmatter key, " +
                        "defaulting to the initial state of the configured task lifecycle model)"),
                    mtime:  z.string().optional()
                        .describe("`TASK-<id>.md` modification time (`YYYY-MM-DD HH:MM`); only present if `verbose` is true")
                })).describe("all persisted tasks in lexicographic id order")
            }
        }, async (args) => {
            try {
                const verbose = args.verbose ?? false
                const items   = Task.list(this.log, verbose)
                const tasks   = verbose ?
                    items.map((item) => ({ id: item.id, status: item.status, mtime: item.mtime ?? "" })) :
                    items.map((item) => ({ id: item.id, status: item.status }))
                const result  = { tasks }
                return {
                    structuredContent: result,
                    content:           [ { type: "text", text: JSON.stringify(result) } ]
                }
            }
            catch (err: unknown) {
                return mcpError(err)
            }
        })

        /*  task load  */
        mcp.registerTool("ase_task_load", {
            title: "ASE task load",
            description:
                "Load a previously persisted task by `id`. " +
                "Returns the task as `text`, normalized into the current Markdown frontmatter shape; " +
                "returns an empty string if no task exists for the `id`. " +
                "The `variant` argument selects the returned form of the plan: " +
                "`source` (the default) is the *authoring* form and the *only* form which may be " +
                "edited and passed back into `ase_task_save`; " +
                "`render` is the *rendering-prepared* form, which is for *display only* and " +
                "MUST NOT be persisted; " +
                "`both` returns the source form enclosed in `<task-plan-source>` delimiter lines, " +
                "followed by the render form enclosed in `<task-plan-render>` delimiter lines.",
            inputSchema: {
                id: z.string()
                    .describe("task identifier (allowed characters: A-Z, a-z, 0-9, '_', '-')"),
                variant: z.enum([ "source", "render", "both" ]).optional()
                    .describe("returned form of the plan: `source` (authoring form, the default), " +
                        "`render` (rendering-prepared form, display only), or `both` " +
                        "(both forms, each enclosed in its delimiter lines)")
            }
        }, async (args) => {
            try {
                const source  = Task.load(this.log, args.id)
                const variant = args.variant ?? "source"
                let text = source
                if (source !== "" && variant === "render")
                    text = Markdown.prepare(source)
                else if (source !== "" && variant === "both")
                    text =
                        `<task-plan-source>\n${source}\n</task-plan-source>\n\n` +
                        `<task-plan-render>\n${Markdown.prepare(source)}\n</task-plan-render>\n`
                return {
                    content: [ { type: "text", text } ]
                }
            }
            catch (err: unknown) {
                return mcpError(err)
            }
        })

        /*  task save  */
        mcp.registerTool("ase_task_save", {
            title: "ASE task save",
            description:
                "Persist a task as `text` under `id`. " +
                "The `text` MUST be the *authoring* form of the plan (as returned by the " +
                "`source` variant of `ase_task_load`) and hence MUST NOT carry any rendering " +
                "artifacts. Overwrites any existing task for the same `id`. " +
                "Returns a status `text` by default, or, if `render` is `true`, the " +
                "*rendering-prepared* form of the just-saved plan, for display purposes only. " +
                "The `Status:` frontmatter key of `text` is checked against the configured task " +
                "lifecycle model: if the status is not a state of the model or not reachable from " +
                "the previously saved status via one or more transitions of the state machine, the " +
                "result is prefixed with a `WARNING:` line (the plan is saved nevertheless). Prefer the " +
                "`ase_task_status` MCP tool for pure status changes, as it validates strictly.",
            inputSchema: {
                id: z.string()
                    .describe("task identifier (allowed characters: A-Z, a-z, 0-9, '_', '-')"),
                text: z.string()
                    .describe("text content of the task, in its authoring form"),
                render: z.boolean().optional()
                    .describe("if true, return the rendering-prepared form of the just-saved " +
                        "plan instead of a status message (default: false)")
            }
        }, async (args) => {
            try {
                const warning = Task.save(this.log, args.id, args.text)

                /*  return the rendering-prepared content on demand, so a caller
                    displaying the just-saved plan does not have to re-load it  */
                const text = (args.render ?? false) ?
                    Markdown.prepare(args.text) :
                    `OK: saved task "${args.id}"`
                return {
                    content: [
                        ...(warning !== "" ? [ { type: "text" as const, text: `WARNING: ${warning}` } ] : []),
                        { type: "text", text }
                    ]
                }
            }
            catch (err: unknown) {
                return mcpError(err)
            }
        })

        /*  task delete  */
        mcp.registerTool("ase_task_delete", {
            title: "ASE task delete",
            description:
                "Delete a previously persisted task by `id`. " +
                "Returns a status `text` indicating whether a task existed and was removed.",
            inputSchema: {
                id: z.string()
                    .describe("task identifier (allowed characters: A-Z, a-z, 0-9, '_', '-')")
            }
        }, async (args) => {
            try {
                const removed = Task.delete(this.log, args.id)
                const msg     = removed ?
                    `OK: removed task "${args.id}"` :
                    `WARNING: no task "${args.id}" to remove`
                return {
                    content: [ { type: "text", text: msg } ]
                }
            }
            catch (err: unknown) {
                return mcpError(err)
            }
        })

        /*  task rename  */
        mcp.registerTool("ase_task_rename", {
            title: "ASE task rename",
            description:
                "Rename a previously persisted task from `old` to `new` by moving the " +
                "task `TASK-<id>.md` file and rewriting its embedded `Id:` frontmatter key. " +
                "Returns a status `text` indicating whether the rename succeeded. " +
                "Fails with an error if the target id already exists.",
            inputSchema: {
                old: z.string()
                    .describe("old task identifier (allowed characters: A-Z, a-z, 0-9, '_', '-')"),
                new: z.string()
                    .describe("new task identifier (allowed characters: A-Z, a-z, 0-9, '_', '-')")
            }
        }, async (args) => {
            try {
                const renamed = Task.rename(this.log, args.old, args.new)
                const msg     = renamed ?
                    `OK: renamed task "${args.old}" to "${args.new}"` :
                    `WARNING: no task "${args.old}" to rename`
                return {
                    content: [ { type: "text", text: msg } ]
                }
            }
            catch (err: unknown) {
                return mcpError(err)
            }
        })

        /*  task status get/set  */
        mcp.registerTool("ase_task_status", {
            title: "ASE task status get/set",
            description:
                "Get or set the lifecycle `status` of the task plan `id` (its `Status:` frontmatter key). " +
                "If `status` is provided, it is set (case-insensitively, validated against the states of " +
                "the configured task lifecycle model, leaving the `Modified:` key alone) and a status `text` " +
                "is returned, prefixed with `WARNING:` if the status is not reachable from the current one " +
                "via one or more transitions of the state machine of the model (the status is set " +
                "nevertheless). Otherwise the current status is returned " +
                "as `text`, defaulting to the initial state of the model. " +
                "Fails with an error if no task exists or the status is unknown.",
            inputSchema: {
                id: z.string()
                    .describe("task identifier (allowed characters: A-Z, a-z, 0-9, '_', '-')"),
                status: z.string().optional()
                    .describe("lifecycle status to set (a state of the configured task lifecycle model, " +
                        "case-insensitive); if omitted, the current status is returned")
            }
        }, async (args) => {
            try {
                if (args.status !== undefined) {
                    const result = Task.setStatus(this.log, args.id, args.status)
                    const change = `status of task "${args.id}" from "${result.from}" to "${result.to}"`
                    const msg    = result.warning !== "" ?
                        `WARNING: ${result.warning} -- set ${change} nevertheless` :
                        `OK: set ${change}`
                    return {
                        content: [ { type: "text", text: msg } ]
                    }
                }
                const text = Task.getStatus(this.log, args.id)
                return {
                    content: [ { type: "text", text } ]
                }
            }
            catch (err: unknown) {
                return mcpError(err)
            }
        })

        /*  task id get/set  */
        mcp.registerTool("ase_task_id", {
            title: "ASE task id get/set",
            description:
                "Get or set the active ASE task `id` for a given `session`. " +
                "If `id` is provided, it sets the task id in the given `session`, " +
                "otherwise it returns the current task `id` of the `session`.",
            inputSchema: {
                id: z.string().optional()
                    .describe("task identifier to set (allowed characters: A-Z, a-z, 0-9, '_', '-'); " +
                        "if omitted, the current task id is returned"),
                session: z.string()
                    .describe("session identifier (allowed characters: A-Z, a-z, 0-9, '_', '-')")
            }
        }, async (args) => {
            try {
                if (args.id !== undefined) {
                    Task.setId(this.log, args.session, args.id)
                    const msg = `OK: set agent.task to "${args.id}" ` +
                        `for session "${args.session}"`
                    return {
                        content: [ { type: "text", text: msg } ]
                    }
                }
                const text = Task.getId(this.log, args.session)
                return {
                    content: [ { type: "text", text } ]
                }
            }
            catch (err: unknown) {
                return mcpError(err)
            }
        })
    }
}
