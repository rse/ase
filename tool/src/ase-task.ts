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

import type { McpServer }                     from "@modelcontextprotocol/sdk/server/mcp.js"

import type Log                               from "./ase-log.js"
import { Config, configSchema, parseScope }   from "./ase-config.js"
import { Markdown }                           from "./ase-markdown.js"

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

    /*  determine the project root (Git top-level if inside a Git
        working tree, otherwise the current working directory)  */
    static projectRoot (): string {
        try {
            const result = execaSync("git", [ "rev-parse", "--show-toplevel" ], { stderr: "ignore" })
            const top = result.stdout.trim()
            if (top !== "")
                return top
        }
        catch {
            /*  not inside a Git working tree  */
        }
        return process.cwd()
    }

    /*  read the configured "basedir" anchor and "files" miniglob spec for
        task storage; "basedir" is project-root-relative (POSIX, defaults
        to ".ase/task") and "files" constrains the task filenames
        (defaults to "*.md")  */
    private static spec (log: Log): { basedir: string, files: string } {
        const cfg = new Config("config", configSchema, log)
        cfg.read()
        const read = (key: string): string => {
            const val = cfg.get(key)
            if (val === undefined)
                return ""
            return String(isScalar(val) ? val.value : val)
        }
        const basedir = (read("project.artifact.task.basedir") || ".ase/task")
            .replace(/\\/g, "/").replace(/^\/+|\/+$/g, "")
        const files   = read("project.artifact.task.files") || "*.md"
        return { basedir, files }
    }

    /*  resolve the on-disk base directory for task storage  */
    static baseDir (log: Log): string {
        return path.join(Task.projectRoot(), Task.spec(log).basedir)
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
        current <basedir>/TASK-<id>.md layout on first access (guarded by
        a cheap check, so it is a no-op once the store is migrated)  */
    static path (log: Log, id: string): string {
        Task.validateId(id)
        Task.enforceFiles(log, id)
        if (Task.needsMigration(log))
            Task.migrateAll(log)
        return path.join(Task.baseDir(log), `TASK-${id}.md`)
    }

    /*  cheaply check whether any legacy <basedir>/<id>/plan.md file still
        exists in the task base directory and thus needs migration  */
    private static needsMigration (log: Log): boolean {
        const dir = Task.baseDir(log)
        if (!fs.existsSync(dir))
            return false
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (!entry.isDirectory() || !/^[A-Za-z0-9_-]+$/.test(entry.name))
                continue
            if (fs.existsSync(path.join(dir, entry.name, "plan.md")))
                return true
        }
        return false
    }

    /*  migrate all legacy <basedir>/<id>/plan.md task files to the current
        <basedir>/TASK-<id>.md layout; an existing TASK-<id>.md is never
        overwritten; the now-empty <id>/ directory is removed afterwards;
        returns the list of migrated task ids in lexicographic order  */
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
            fs.rmSync(path.join(dir, id), { recursive: true, force: true })
            migrated.push(id)
        }
        migrated.sort((a, b) => a.localeCompare(b))
        return migrated
    }

    /*  load a task; returns empty string if no task exists  */
    static load (log: Log, id: string): string {
        const file = Task.path(log, id)
        if (!fs.existsSync(file))
            return ""
        return fs.readFileSync(file, "utf8")
    }

    /*  save a task as UTF-8 text under the given id into the
        <project>/<basedir>/TASK-<id>.md file  */
    static save (log: Log, id: string, text: string): void {
        if (typeof text !== "string")
            throw new Error("task: text must be a string")
        const file = Task.path(log, id)
        fs.mkdirSync(path.dirname(file), { recursive: true })
        fs.writeFileSync(file, text, "utf8")
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
        to <project>/<basedir>/TASK-<newId>.md; the embedded
        "#   TASK <id>:" heading inside the plan content is rewritten to
        the new id; returns true on success, false if the source task does
        not exist; throws if the target id already exists  */
    static rename (log: Log, oldId: string, newId: string): boolean {
        const oldFile = Task.path(log, oldId)
        const newFile = Task.path(log, newId)
        if (!fs.existsSync(oldFile))
            return false
        if (fs.existsSync(newFile))
            throw new Error(`task: target id "${newId}" already exists`)
        const text    = fs.readFileSync(oldFile, "utf8")
        const updated = text.replace(/(^#\s+TASK\s+)[A-Za-z0-9_-]+(\s*:)/m, `$1${newId}$2`)
        fs.mkdirSync(path.dirname(newFile), { recursive: true })
        fs.writeFileSync(newFile, updated, "utf8")
        fs.rmSync(oldFile, { force: true })
        return true
    }

    /*  list all persisted tasks in lexicographic id order; if verbose is true,
        each entry's `mtime` is set to the task file's modification time
        formatted as "YYYY-MM-DD HH:MM", otherwise it is left undefined  */
    static list (log: Log, verbose = false): { id: string, mtime: string | undefined }[] {
        if (Task.needsMigration(log))
            Task.migrateAll(log)
        const { basedir, files } = Task.spec(log)
        const dir = path.join(Task.projectRoot(), basedir)
        if (!fs.existsSync(dir))
            return []
        const isMatch = picomatch(files, { dot: true })
        const out: { id: string, mtime: string | undefined }[] = []
        for (const entry of fs.readdirSync(dir)) {
            const m = /^TASK-([A-Za-z0-9_-]+)\.md$/.exec(entry)
            if (m === null || !isMatch(entry))
                continue
            const file = path.join(dir, entry)
            const st = fs.statSync(file)
            if (!st.isFile())
                continue
            const mtime = verbose ? DateTime.fromJSDate(st.mtime).toFormat("yyyy-LL-dd HH:mm") : undefined
            out.push({ id: m[1], mtime })
        }
        out.sort((a, b) => a.id.localeCompare(b.id))
        return out
    }

    /*  purge tasks whose modification time is older than the given cutoff in
        milliseconds; returns the list of removed task ids  */
    static purge (log: Log, maxAgeMs: number): string[] {
        if (Task.needsMigration(log))
            Task.migrateAll(log)
        const { basedir, files } = Task.spec(log)
        const dir = path.join(Task.projectRoot(), basedir)
        if (!fs.existsSync(dir))
            return []
        const isMatch = picomatch(files, { dot: true })
        const cutoff  = Date.now() - maxAgeMs
        const removed: string[] = []
        for (const entry of fs.readdirSync(dir)) {
            const m = /^TASK-([A-Za-z0-9_-]+)\.md$/.exec(entry)
            if (m === null || !isMatch(entry))
                continue
            const file = path.join(dir, entry)
            const st = fs.statSync(file)
            if (!st.isFile())
                continue
            if (st.mtimeMs < cutoff) {
                fs.rmSync(file, { force: true })
                removed.push(m[1])
            }
        }
        return removed
    }

    /*  get the active task id for a given session, or empty string if none  */
    static getId (log: Log, session: string): string {
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
        const scope   = parseScope(`session:${session}`)
        const cfg = new Config("config", configSchema, log, scope)
        cfg.lock(() => {
            cfg.read()
            cfg.set("agent.task", id)
            cfg.write()
        })
    }
}

/*  read all of stdin as a UTF-8 string  */
const readStdin = (): Promise<string> => {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = []
        process.stdin.on("data",  (chunk: Buffer) => chunks.push(chunk))
        process.stdin.on("end",   () => resolve(Buffer.concat(chunks).toString("utf8")))
        process.stdin.on("error", (err) => reject(err))
    })
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
        task
            .command("list")
            .description("List all persisted task ids, one per line")
            .option("-v, --verbose", "also show the task file modification time as (YYYY-MM-DD HH:MM)")
            .action((opts: { verbose?: boolean }) => {
                const items = Task.list(this.log, opts.verbose ?? false)
                for (const item of items) {
                    if (opts.verbose)
                        process.stdout.write(`${item.id}\t(${item.mtime})\n`)
                    else
                        process.stdout.write(`${item.id}\n`)
                }
                process.exit(0)
            })

        /*  register CLI sub-command "ase task load"  */
        task
            .command("load")
            .description("Load a task by id and write it to stdout")
            .argument("<id>", "Task identifier")
            .action((id: string) => {
                const text = Task.load(this.log, id)
                process.stdout.write(text)
                process.exit(0)
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
            .description("Save a task by id, reading content from stdin")
            .argument("<id>", "Task identifier")
            .action(async (id: string) => {
                const text = await readStdin()
                Task.save(this.log, id, text)
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
                const factor =
                    unit === "h" ? hour  :
                        unit === "d" ? day :
                            unit === "m" ? month :
                                year
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
                "task `id`. If `verbose` is `true`, each item additionally has an `mtime` field " +
                "(last modification time of the task's `TASK-<id>.md` file, formatted as `YYYY-MM-DD HH:MM`). " +
                "Returns an empty array if no tasks exist.",
            inputSchema:  {
                verbose: z.boolean().optional()
                    .describe("if true, also include the `mtime` field per task (default: false)")
            },
            outputSchema: {
                tasks: z.array(z.object({
                    id:    z.string().describe("task identifier"),
                    mtime: z.string().optional()
                        .describe("`TASK-<id>.md` modification time (`YYYY-MM-DD HH:MM`); only present if `verbose` is true")
                })).describe("all persisted tasks in lexicographic id order")
            }
        }, async (args) => {
            try {
                const verbose = args.verbose ?? false
                const items   = Task.list(this.log, verbose)
                const tasks   = verbose ?
                    items.map((item) => ({ id: item.id, mtime: item.mtime ?? "" })) :
                    items.map((item) => ({ id: item.id }))
                const result  = { tasks }
                return {
                    structuredContent: result,
                    content:           [ { type: "text", text: JSON.stringify(result) } ]
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

        /*  task load  */
        mcp.registerTool("ase_task_load", {
            title: "ASE task load",
            description:
                "Load a previously persisted task by `id`. " +
                "Returns the task as `text`; returns an empty string if no task exists for the `id`.",
            inputSchema: {
                id: z.string()
                    .describe("task identifier (allowed characters: A-Z, a-z, 0-9, '_', '-')")
            }
        }, async (args) => {
            try {
                const raw  = Task.load(this.log, args.id)
                const text = Markdown.prepare(raw)
                return {
                    content: [ { type: "text", text } ]
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

        /*  task save  */
        mcp.registerTool("ase_task_save", {
            title: "ASE task save",
            description:
                "Persist a task as `text` under `id`. " +
                "Overwrites any existing task for the same `id`.",
            inputSchema: {
                id: z.string()
                    .describe("task identifier (allowed characters: A-Z, a-z, 0-9, '_', '-')"),
                text: z.string()
                    .describe("text content of the task")
            }
        }, async (args) => {
            try {
                Task.save(this.log, args.id, args.text)
                return {
                    content: [ { type: "text", text: `OK: saved task "${args.id}"` } ]
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
                const message = err instanceof Error ? err.message : String(err)
                return {
                    isError: true,
                    content: [ { type: "text", text: `ERROR: ${message}` } ]
                }
            }
        })

        /*  task rename  */
        mcp.registerTool("ase_task_rename", {
            title: "ASE task rename",
            description:
                "Rename a previously persisted task from `old` to `new` by atomically moving the " +
                "task `TASK-<id>.md` file. Returns a status `text` indicating whether the rename succeeded. " +
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
                const message = err instanceof Error ? err.message : String(err)
                return {
                    isError: true,
                    content: [ { type: "text", text: `ERROR: ${message}` } ]
                }
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
                const message = err instanceof Error ? err.message : String(err)
                return {
                    isError: true,
                    content: [ { type: "text", text: `ERROR: ${message}` } ]
                }
            }
        })
    }
}
