/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under GPL 3.0 <https://spdx.org/licenses/GPL-3.0-only>
*/

import path                                   from "node:path"
import fs                                     from "node:fs"

import { Command }                            from "commander"
import { execaSync }                          from "execa"
import { DateTime }                           from "luxon"
import { isScalar }                           from "yaml"
import { z }                                  from "zod"

import type { McpServer }                     from "@modelcontextprotocol/sdk/server/mcp.js"

import type Log                               from "./ase-log.js"
import { Config, configSchema, parseScope }   from "./ase-config.js"

/*  reusable functionality: persisted task plans under
    <project>/.ase/task/<id>/plan.md  */
export class Task {
    /*  validate the task id to keep it safe as a filename component  */
    static validateId (id: string): void {
        if (typeof id !== "string" || id.length === 0)
            throw new Error("task: id must be a non-empty string")
        if (!/^[A-Za-z0-9-]+$/.test(id))
            throw new Error("task: id must match [A-Za-z0-9-]+")
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

    /*  resolve the on-disk base directory for task storage  */
    static baseDir (): string {
        return path.join(Task.projectRoot(), ".ase", "task")
    }

    /*  resolve the on-disk path for a given task id  */
    static path (id: string): string {
        Task.validateId(id)
        return path.join(Task.baseDir(), id, "plan.md")
    }

    /*  load a task; returns empty string if no task exists  */
    static load (id: string): string {
        const file = Task.path(id)
        if (!fs.existsSync(file))
            return ""
        return fs.readFileSync(file, "utf8")
    }

    /*  save a task as UTF-8 text under the given id; the task's home
        directory <project>/.ase/task/<id>/ is owned by ASE and removed
        in full by Task.delete, so callers must not place foreign files there  */
    static save (id: string, text: string): void {
        if (typeof text !== "string")
            throw new Error("task: text must be a string")
        const file = Task.path(id)
        fs.mkdirSync(path.dirname(file), { recursive: true })
        fs.writeFileSync(file, text, "utf8")
    }

    /*  delete a task by id; removes the entire task home directory
        <project>/.ase/task/<id>/ (owned by ASE); returns true if a task existed  */
    static delete (id: string): boolean {
        const file = Task.path(id)
        if (!fs.existsSync(file))
            return false
        fs.rmSync(path.dirname(file), { recursive: true, force: true })
        return true
    }

    /*  list all persisted tasks in lexicographic id order; if verbose is true,
        each entry's `mtime` is set to the `plan.md` modification time formatted
        as "YYYY-MM-DD HH:MM", otherwise it is left undefined  */
    static list (verbose = false): { id: string, mtime: string | undefined }[] {
        const dir = Task.baseDir()
        if (!fs.existsSync(dir))
            return []
        const out: { id: string, mtime: string | undefined }[] = []
        for (const entry of fs.readdirSync(dir)) {
            if (!/^[A-Za-z0-9-]+$/.test(entry))
                continue
            const file = path.join(dir, entry, "plan.md")
            if (!fs.existsSync(file))
                continue
            const st = fs.statSync(file)
            if (!st.isFile())
                continue
            const mtime = verbose ? DateTime.fromJSDate(st.mtime).toFormat("yyyy-LL-dd HH:mm") : undefined
            out.push({ id: entry, mtime })
        }
        out.sort((a, b) => a.id.localeCompare(b.id))
        return out
    }

    /*  purge tasks whose modification time is older than the given cutoff in
        milliseconds; returns the list of removed task ids  */
    static purge (maxAgeMs: number): string[] {
        const dir = Task.baseDir()
        if (!fs.existsSync(dir))
            return []
        const cutoff  = Date.now() - maxAgeMs
        const removed: string[] = []
        for (const entry of fs.readdirSync(dir)) {
            if (!/^[A-Za-z0-9-]+$/.test(entry))
                continue
            const sub  = path.join(dir, entry)
            const file = path.join(sub, "plan.md")
            if (!fs.existsSync(file))
                continue
            const st = fs.statSync(file)
            if (!st.isFile())
                continue
            if (st.mtimeMs < cutoff) {
                fs.rmSync(sub, { recursive: true, force: true })
                removed.push(entry)
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
        const scope = parseScope(`session:${session}`)
        const cfg = new Config("config", configSchema, log, scope)
        cfg.read()
        cfg.set("agent.task", id)
        cfg.write()
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
            .description("Manage persisted tasks under <project>/.ase/task/<id>/plan.md")
            .action(() => {
                task.outputHelp()
                process.exit(1)
            })

        /*  register CLI sub-command "ase task list"  */
        task
            .command("list")
            .description("List all persisted task ids, one per line")
            .option("-v, --verbose", "also show the plan.md modification time as (YYYY-MM-DD HH:MM)")
            .action((opts: { verbose?: boolean }) => {
                const items = Task.list(opts.verbose ?? false)
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
                const text = Task.load(id)
                process.stdout.write(text)
                process.exit(0)
            })

        /*  register CLI sub-command "ase task edit"  */
        task
            .command("edit")
            .description("Edit a task by id with $EDITOR")
            .argument("<id>", "Task identifier")
            .action((id: string) => {
                const file   = Task.path(id)
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
                Task.save(id, text)
                this.log.write("info", `task: saved "${id}"`)
                process.exit(0)
            })

        /*  register CLI sub-command "ase task delete"  */
        task
            .command("delete")
            .description("Delete a task by id")
            .argument("<id>", "Task identifier")
            .action((id: string) => {
                const removed = Task.delete(id)
                if (removed)
                    this.log.write("info", `task: removed "${id}"`)
                else
                    this.log.write("info", `task: no task "${id}" to remove`)
                process.exit(removed ? 0 : 1)
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
                const removed = Task.purge(n * factor)
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

    register (mcp: McpServer): void {
        mcp.registerTool("task_list", {
            title:       "ASE task list",
            description:
                "List all persisted tasks. " +
                "Returns a `tasks` array (in lexicographic `id` order) where each item has the " +
                "task `id`. If `verbose` is `true`, each item additionally has an `mtime` field " +
                "(last modification time of the task's `plan.md`, formatted as `YYYY-MM-DD HH:MM`). " +
                "Returns an empty array if no tasks exist.",
            inputSchema:  {
                verbose: z.boolean().optional()
                    .describe("if true, also include the `mtime` field per task (default: false)")
            },
            outputSchema: {
                tasks: z.array(z.object({
                    id:    z.string().describe("task identifier"),
                    mtime: z.string().optional()
                        .describe("plan.md modification time (`YYYY-MM-DD HH:MM`); only present if `verbose` is true")
                })).describe("all persisted tasks in lexicographic id order")
            }
        }, async (args) => {
            try {
                const verbose = args.verbose ?? false
                const items   = Task.list(verbose)
                const tasks   = verbose ?
                    items.map((item) => ({ id: item.id, mtime: item.mtime as string })) :
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
                    content: [ { type: "text", text: `task_list: ERROR: ${message}` } ]
                }
            }
        })
        mcp.registerTool("task_load", {
            title:       "ASE task load",
            description:
                "Load a previously persisted task by `id`. " +
                "Returns the task as `text`; returns an empty string if no task exists for the `id`.",
            inputSchema: {
                id: z.string()
                    .describe("task identifier (allowed characters: A-Z, a-z, 0-9, '-')")
            }
        }, async (args) => {
            try {
                const text = Task.load(args.id)
                return {
                    content: [ { type: "text", text } ]
                }
            }
            catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err)
                return {
                    isError: true,
                    content: [ { type: "text", text: `task_load: ERROR: ${message}` } ]
                }
            }
        })
        mcp.registerTool("task_save", {
            title:       "ASE task save",
            description:
                "Persist a task as `text` under `id`. " +
                "Overwrites any existing task for the same `id`.",
            inputSchema: {
                id: z.string()
                    .describe("task identifier (allowed characters: A-Z, a-z, 0-9, '-')"),
                text: z.string()
                    .describe("text content of the task")
            }
        }, async (args) => {
            try {
                Task.save(args.id, args.text)
                return {
                    content: [ { type: "text", text: `task_save: OK: saved task "${args.id}"` } ]
                }
            }
            catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err)
                return {
                    isError: true,
                    content: [ { type: "text", text: `task_save: ERROR: ${message}` } ]
                }
            }
        })
        mcp.registerTool("task_delete", {
            title:       "ASE task delete",
            description:
                "Delete a previously persisted task by `id`. " +
                "Returns a status `text` indicating whether a task existed and was removed.",
            inputSchema: {
                id: z.string()
                    .describe("task identifier (allowed characters: A-Z, a-z, 0-9, '-')")
            }
        }, async (args) => {
            try {
                const removed = Task.delete(args.id)
                const msg     = removed ?
                    `task_delete: OK: removed task "${args.id}"` :
                    `task_delete: WARNING: no task "${args.id}" to remove`
                return {
                    content: [ { type: "text", text: msg } ]
                }
            }
            catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err)
                return {
                    isError: true,
                    content: [ { type: "text", text: `task_delete: ERROR: ${message}` } ]
                }
            }
        })
        mcp.registerTool("task_id", {
            title:       "ASE task id get/set",
            description:
                "Get or set the active ASE task `id` for a given `session`. " +
                "If `id` is provided, it sets the task id in the given `session`, " +
                "otherwise it returns the current task `id` of the `session`.",
            inputSchema: {
                id: z.string().optional()
                    .describe("task identifier to set (allowed characters: A-Z, a-z, 0-9, '-'); " +
                        "if omitted, the current task id is returned"),
                session: z.string()
                    .describe("session identifier (allowed characters: A-Z, a-z, 0-9, '-')")
            }
        }, async (args) => {
            try {
                if (args.id !== undefined) {
                    Task.setId(this.log, args.session, args.id)
                    const msg = `task_id: OK: set agent.task to "${args.id}" ` +
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
                    content: [ { type: "text", text: `task_id: ERROR: ${message}` } ]
                }
            }
        })
    }
}
