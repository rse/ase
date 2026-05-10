/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under GPL 3.0 <https://spdx.org/licenses/GPL-3.0-only>
*/

import path          from "node:path"
import os            from "node:os"
import fs            from "node:fs"

import { Command }   from "commander"
import { execaSync } from "execa"

import type Log      from "./ase-log.js"

/*  validate the task id to keep it safe as a filename component  */
const validateId = (id: string): void => {
    if (typeof id !== "string" || id.length === 0)
        throw new Error("task: id must be a non-empty string")
    if (!/^[A-Za-z0-9-]+$/.test(id))
        throw new Error("task: id must match [A-Za-z0-9-]+")
}

/*  resolve the on-disk path for a given task id  */
const taskPath = (id: string): string => {
    validateId(id)
    return path.join(os.homedir(), ".ase", "task", id, "plan.md")
}

/*  load a task; returns empty string if no task exists  */
export const taskLoad = (id: string): string => {
    const file = taskPath(id)
    if (!fs.existsSync(file))
        return ""
    return fs.readFileSync(file, "utf8")
}

/*  save a task as UTF-8 text under the given id; the task's home
    directory ~/.ase/task/<id>/ is owned by ASE and removed in full
    by taskDelete, so callers must not place foreign files there  */
export const taskSave = (id: string, text: string): void => {
    if (typeof text !== "string")
        throw new Error("task: text must be a string")
    const file = taskPath(id)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, text, "utf8")
}

/*  delete a task by id; removes the entire task home directory
    ~/.ase/task/<id>/ (owned by ASE); returns true if a task existed  */
export const taskDelete = (id: string): boolean => {
    const file = taskPath(id)
    if (!fs.existsSync(file))
        return false
    fs.rmSync(path.dirname(file), { recursive: true, force: true })
    return true
}

/*  list all persisted task ids in lexicographic order  */
export const taskList = (): string[] => {
    const dir = path.join(os.homedir(), ".ase", "task")
    if (!fs.existsSync(dir))
        return []
    const ids: string[] = []
    for (const entry of fs.readdirSync(dir)) {
        if (!/^[A-Za-z0-9-]+$/.test(entry))
            continue
        const file = path.join(dir, entry, "plan.md")
        if (!fs.existsSync(file))
            continue
        const st = fs.statSync(file)
        if (!st.isFile())
            continue
        ids.push(entry)
    }
    ids.sort()
    return ids
}

/*  purge tasks whose modification time is older than the given cutoff in
    milliseconds; returns the list of removed task ids  */
export const taskPurge = (maxAgeMs: number): string[] => {
    const dir = path.join(os.homedir(), ".ase", "task")
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
            .description("Manage persisted tasks under ~/.ase/task/<id>/plan.md")
            .action(() => {
                task.outputHelp()
                process.exit(1)
            })

        /*  register CLI sub-command "ase task list"  */
        task
            .command("list")
            .description("List all persisted task ids, one per line")
            .action(() => {
                const ids = taskList()
                for (const id of ids)
                    process.stdout.write(`${id}\n`)
                process.exit(0)
            })

        /*  register CLI sub-command "ase task load"  */
        task
            .command("load")
            .description("Load a task by id and write it to stdout")
            .argument("<id>", "Task identifier")
            .action((id: string) => {
                const text = taskLoad(id)
                process.stdout.write(text)
                process.exit(0)
            })

        /*  register CLI sub-command "ase task edit"  */
        task
            .command("edit")
            .description("Edit a task by id with $EDITOR")
            .argument("<id>", "Task identifier")
            .action((id: string) => {
                const file   = taskPath(id)
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
                taskSave(id, text)
                this.log.write("info", `task: saved "${id}"`)
                process.exit(0)
            })

        /*  register CLI sub-command "ase task delete"  */
        task
            .command("delete")
            .description("Delete a task by id")
            .argument("<id>", "Task identifier")
            .action((id: string) => {
                const removed = taskDelete(id)
                if (removed)
                    this.log.write("info", `task: removed "${id}"`)
                else
                    this.log.write("info", `task: no task "${id}" to remove`)
                process.exit(removed ? 0 : 1)
            })

        /*  register CLI sub-command "ase task purge"  */
        task
            .command("purge")
            .description("Remove all tasks with a modification time older than <days> (default: 31)")
            .argument("[<days>]", "Maximum task age in days", "31")
            .action((days: string) => {
                const n = Number.parseInt(days, 10)
                if (!Number.isFinite(n) || n < 0)
                    throw new Error("task: <days> must be a non-negative integer")
                const removed = taskPurge(n * 24 * 60 * 60 * 1000)
                if (removed.length === 0)
                    this.log.write("info", "task: no tasks to purge")
                else
                    for (const id of removed)
                        this.log.write("info", `task: purged "${id}"`)
                process.exit(0)
            })
    }
}

