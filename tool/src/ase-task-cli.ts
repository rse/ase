/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import path                                               from "node:path"
import fs                                                 from "node:fs"
import os                                                 from "node:os"
import readline                                           from "node:readline/promises"

import { Command }                                        from "commander"
import { execaSync }                                      from "execa"

import type Log                                           from "./ase-lib-log.js"
import { readStdin, writeStdout }                         from "./ase-lib-stdio.js"
import TaskStoreCommand                                   from "./ase-task-store-server-cli.js"
import * as Core                                          from "./ase-task-store-core.js"
import * as TaskFormat                                    from "./ase-task-format.js"
import { requestsOf }                                     from "./ase-task-request.js"
import type { AssignResult }                              from "./ase-service-otel.js"
import { Task, usageText }                                from "./ase-task.js"

/*  CLI command "ase task"  */
export default class TaskCommand {
    constructor (private log: Log) {}

    /*  edit a task by id with $EDITOR, renaming it on a changed "Id:" key  */
    private async edit (id: string): Promise<void> {
        /*  round-trip the plan through a temporary file, as the
            task store is not necessarily a local file  */
        Task.validateId(id)
        const source = await Task.source(this.log, id)
        const before = source?.text ?? Task.format(Task.minimal(id))
        const editor = process.env.EDITOR ?? process.env.VISUAL ?? "vi"
        const dir    = fs.mkdtempSync(path.join(os.tmpdir(), "ase-task-"))
        const file   = path.join(dir, `${id}.md`)
        fs.writeFileSync(file, before, "utf8")

        /*  on save failures, offer re-editing and never discard the edits:
            the temporary file is kept if the user declines re-editing, and
            the save is conditional on the plan as loaded (or create-only, if
            it did not exist), so changes of the task in the meantime (e.g. by
            the agents) are never overwritten, but merged with the edits, or, if
            both changed the same part, keep the edits unsaved instead  */
        let next     = id
        let tag      = source?.tag
        let conflict = false
        for (;;) {
            try {
                execaSync(`${editor} "${file}"`, { shell: true, stdio: "inherit" })
                const after = fs.readFileSync(file, "utf8")
                if (after !== before) {
                    /*  a changed "Id:" key renames the task (refusing
                        an existing target id before anything is saved)  */
                    next = TaskFormat.taskTextId(after) || id
                    if (next !== id) {
                        Task.validateId(next)
                        if (await Task.source(this.log, next) !== null)
                            throw new Error(`task: target id "${next}" already exists`)
                    }
                    let warning: string
                    try {
                        let merged: boolean
                        ({ warning, tag, merged } = await Task.save(this.log, id, after, tag, tag === undefined))
                        if (merged)
                            this.log.write("info", `task: "${id}" was changed in the meantime -- edits merged`)
                    }
                    catch (err: unknown) {
                        const problem = err instanceof Core.Problem ? err :
                            err instanceof Error && err.cause instanceof Core.Problem ? err.cause : null
                        conflict = problem?.status === 412
                        throw err
                    }
                    if (next !== id)
                        warning = (await Task.rename(this.log, id, next))?.warning ?? ""
                    if (warning !== "")
                        this.log.write("warning", `task: ${warning}`)
                }
                break
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err)
                this.log.write("error", msg)
                if (conflict)
                    throw new Error(`task: "${id}" was changed in the meantime -- ` +
                        `edits not saved, but kept in "${file}"`, { cause: err })
                let ans = "n"
                if (process.stdin.isTTY) {
                    const rl = readline.createInterface({ input: process.stdin, output: process.stderr })
                    try {
                        ans = (await rl.question("re-edit? [Y/n] ")).trim().toLowerCase()
                    }
                    finally {
                        rl.close()
                    }
                }
                if (ans === "n" || ans === "no")
                    throw new Error(`task: edits of "${id}" not saved, but kept in "${file}"`, { cause: err })
            }
        }
        fs.rmSync(dir, { recursive: true, force: true })
        this.log.write("info", next !== id ?
            `task: edited "${id}" and renamed it to "${next}"` : `task: edited "${id}"`)
    }

    /*  register commands  */
    register (program: Command): Command {
        /*  register CLI top-level command "ase task"  */
        const task = program
            .command("task")
            .description("Manage persisted tasks in the task store configured by \"project.task.store.url\"")
            .action(() => {
                task.outputHelp()
                process.exit(1)
            })

        /*  register CLI sub-command "ase task list"  */
        const lifecycleStates = Object.values(TaskFormat.taskLifecycles)
            .map((lifecycle) => `${lifecycle.name}: ${lifecycle.states.join("|")}`)
            .join("; ")
        task
            .command("list")
            .description("List all persisted task ids, one per line")
            .option("-v, --verbose", "also show the task plan status, the task plan " +
                "modification time as (YYYY-MM-DD HH:MM), the task effort size (\"-\" if not estimated), " +
                "and the task title")
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
                const { items: all, known, states } = await Task.listStates(this.log, opts.include, opts.exclude)
                const items = all
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
                        await writeStdout(`${item.id}\t${item.status}\t(${item.mtime})\t${item.effort || "-"}\t${item.title}\n`)
                    else
                        await writeStdout(`${item.id}\n`)
                }
            })

        /*  register CLI sub-command "ase task status"  */
        task
            .command("status")
            .description("Get or set the lifecycle status of a task: without <status> the current status " +
                "is printed, with <status> it is set (case-insensitively, failing on a status " +
                "not reachable in the task lifecycle model); <id> defaults to $ASE_TASK_ID")
            .argument("[<id>[:]]", "Task identifier (optionally colon-suffixed)")
            .argument("[<status>]", "Lifecycle status to set")
            .action(async (arg1?: string, arg2?: string) => {
                /*  resolve "[<id>[:]] [<status>]": a single token is the status
                    if it is a state of the task lifecycle model, else the id  */
                const states = (await Task.lifecycle(this.log)).states
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
                    await writeStdout(`${await Task.getStatus(this.log, id)}\n`)
                else {
                    const result = await Task.setStatus(this.log, id, status)
                    this.log.write("info", `task: set status of "${id}" from "${result.from}" to "${result.to}"`)
                    process.exit(0)
                }
            })

        /*  register the further CLI sub-commands  */
        this.registerRequestCommands(task)
        this.registerPlanCommands(task)
        this.registerProjectCommands(task)

        /*  register CLI sub-command group "ase task store"  */
        new TaskStoreCommand(this.log).register(task)

        /*  provide "ase task" command for further sub-commands  */
        return task
    }

    /*  register the CLI sub-commands requesting and assigning a task  */
    private registerRequestCommands (task: Command): void {
        /*  register CLI sub-command "ase task request"  */
        task
            .command("request")
            .description("Request the processing of a task by a prompt, attached as a request of a name " +
                "(\"edit\" for the edit requests of \"ase agent editor\", any other name for the requests " +
                "of a request agent of a definition), replacing its failed requests of the name " +
                "(refused for a finished task, and while a request of the name is being processed), " +
                "where the prompt may be omitted for any other name than \"edit\" (for the request " +
                "agents ignoring the prompts of their requests, like the estimator agent)")
            .argument("<id>", "Task identifier")
            .argument("<name>", "Request name")
            .argument("[<prompt...>]", "Prompt of the request")
            .action(async (id: string, name: string, prompt: string[]) => {
                await requestsOf(name).request(this.log, id, prompt.join(" "))
                this.log.write("info", `task: requested "${name}" of "${id}"`)
                process.exit(0)
            })

        /*  register CLI sub-command "ase task assign"  */
        task
            .command("assign")
            .description("Assign a task: set its \"Assignee:\" to <assignee> (\"me\" for the current user, " +
                "\"none\" removes it); with --session the AI usage window of the session is handled, too " +
                "(through the running ASE service of the project); <id> defaults to $ASE_TASK_ID")
            .argument("[<id>[:]]", "Task identifier (optionally colon-suffixed)")
            .argument("[<assignee>]", "Assignee (\"me\", \"none\", or any other name)")
            .option("-s, --session <id>", "agent tool session on whose behalf the task is assigned")
            .action(async (arg1: string | undefined, arg2: string | undefined, opts: { session?: string }) => {
                let id       = process.env.ASE_TASK_ID ?? "default"
                let assignee = arg2
                if (arg2 !== undefined)
                    id = arg1!
                else if (arg1?.endsWith(":"))
                    id = arg1
                else
                    assignee = arg1
                if (assignee === undefined)
                    throw new Error("task: missing <assignee>")
                id = id.replace(/:$/, "")
                const Usage = await import("./ase-service-otel-common.js")
                if (opts.session !== undefined) {
                    const result = await Usage.request(Task.projectRoot(), "/usage/assign",
                        { id, assignee, session: opts.session }) as AssignResult
                    if (result.notice !== "")
                        this.log.write("warning", `task: ${result.notice}`)
                    this.log.write("info", `task: assigned "${id}" from "${result.from}" to "${result.to}" ` +
                        `(usage window: ${result.action}, booked: ${usageText(result.booked)})`)
                }
                else {
                    const to      = assignee === "me" ? Usage.userId() : assignee
                    const warning = await Task.checkAssignee(this.log, to)
                    if (warning !== "")
                        this.log.write("warning", `task: ${warning}`)
                    const from = await Task.assign(this.log, id, to === "none" ? null : to)
                    this.log.write("info", `task: assigned "${id}" from "${from}" to "${to === "none" ? "" : to}"`)
                }
                process.exit(0)
            })
    }

    /*  register the CLI sub-commands loading, viewing, editing, saving, deleting, and renaming a task  */
    private registerPlanCommands (task: Command): void {
        /*  register CLI sub-command "ase task load"  */
        task
            .command("load")
            .description("Load a task by id and write it to stdout")
            .argument("<id>", "Task identifier")
            .action(async (id: string) => {
                const text = await Task.load(this.log, id)
                await writeStdout(text)
            })

        /*  register CLI sub-command "ase task view"  */
        task
            .command("view")
            .description("View a task by id with $PAGER")
            .argument("<id>", "Task identifier")
            .action(async (id: string) => {
                const text = await Task.load(this.log, id)
                if (text === "")
                    throw new Error(`task: no task "${id}"`)

                /*  bypass the pager if stdout is not a terminal  */
                if (!process.stdout.isTTY)
                    await writeStdout(text)
                else {
                    const pager = process.env.PAGER ?? "more"
                    execaSync(pager, { shell: true, input: text, stdout: "inherit", stderr: "inherit" })
                }
            })

        /*  register CLI sub-command "ase task edit"  */
        task
            .command("edit")
            .description("Edit a task by id with $EDITOR")
            .argument("<id>", "Task identifier")
            .action(async (id: string) => {
                await this.edit(id)
                process.exit(0)
            })

        /*  register CLI sub-command "ase task save"  */
        task
            .command("save")
            .description("Save a task by id, reading content from stdin " +
                "(failing on a Status: not reachable in the task lifecycle model)")
            .option("-c, --create", "fail if the task already exists instead of overwriting it", false)
            .argument("<id>", "Task identifier")
            .action(async (id: string, opts: { create: boolean }) => {
                const text        = await readStdin()
                const { warning } = await Task.save(this.log, id, text, undefined, opts.create)
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
            .action(async (id: string) => {
                const removed = await Task.delete(this.log, id)
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
            .action(async (oldId: string, newId: string) => {
                const result = await Task.rename(this.log, oldId, newId)
                if (result !== null) {
                    if (result.warning !== "")
                        this.log.write("warning", `task: ${result.warning}`)
                    this.log.write("info", `task: renamed "${oldId}" to "${newId}" ` +
                        `(updated references in ${result.references} other task(s))`)
                }
                else
                    this.log.write("info", `task: no task "${oldId}" to rename`)
                process.exit(result !== null ? 0 : 1)
            })
    }

    /*  register the CLI sub-commands of the task ids, the purging, and the project settings  */
    private registerProjectCommands (task: Command): void {
        /*  register CLI sub-command "ase task newid"  */
        task
            .command("newid")
            .description("Print the next free task id according to the task id scheme of the project, " +
                "determined by searching all existing task ids: for scheme \"slug\" derived from <title>, " +
                "for scheme \"seq\" the next sequence number (reserved), and for scheme \"any\" the (made unique) " +
                "--proposal, else derived from <title>; with --verbose additionally the scheme and " +
                "the regular expression matching the ids conforming to the scheme")
            .option("-p, --proposal <id>", "proposed task id (for task id scheme \"any\" only)", "")
            .option("-t, --taken <ids>", "comma-separated task ids to consider as taken additionally", "")
            .option("-v, --verbose", "print the scheme, the id, and the matching regular expression", false)
            .argument("[<title>]", "Task title", "")
            .action(async (title: string, opts: { proposal: string, taken: string, verbose: boolean }) => {
                const taken  = opts.taken.split(",").map((id) => id.trim()).filter((id) => id !== "")
                const result = await Task.newId(this.log, title, opts.proposal, taken)
                if (opts.verbose)
                    await writeStdout(`scheme: ${result.scheme}\nid:     ${result.id}\nmatch:  ${result.match}\n`)
                else
                    await writeStdout(`${result.id}\n`)
            })

        /*  register CLI sub-command "ase task purge"  */
        task
            .command("purge")
            .description("Remove all tasks with a modification time older than <age> (default: 31d); " +
                "<age> is <number><unit> with unit h (hour), d (day), m (month), y (year)")
            .argument("[<age>]", "Maximum task age as <number><unit>", "31d")
            .action(async (age: string) => {
                const removed = await Task.purge(this.log, age)
                if (removed.length === 0)
                    this.log.write("info", "task: no tasks to purge")
                else
                    for (const id of removed)
                        this.log.write("info", `task: purged "${id}"`)
                process.exit(0)
            })

        /*  register CLI sub-command "ase task lifecycle"  */
        task
            .command("lifecycle")
            .description("Get or set the task lifecycle model of the project: without <name> the effective " +
                "model is printed, with <name> the project in the task store is switched to it " +
                "(for a local task store by setting \"project.task.lifecycle\" on scope \"project\")")
            .argument("[<name>]", `Lifecycle model name (${Object.keys(TaskFormat.taskLifecycles).join("|")})`)
            .action(async (name?: string) => {
                if (name === undefined)
                    await writeStdout(`${(await Task.lifecycle(this.log)).name}\n`)
                else {
                    const from = await Task.setLifecycle(this.log, name)
                    this.log.write("info", `task: set lifecycle model of project from "${from}" to "${name}"`)
                    process.exit(0)
                }
            })

        /*  register CLI sub-command "ase task idscheme"  */
        task
            .command("idscheme")
            .description("Get or set the task id scheme of the project: without <scheme> the effective " +
                "scheme is printed, with <scheme> the project in the task store is switched to it " +
                "(for a local task store by setting \"project.task.idscheme\" on scope \"project\")")
            .argument("[<scheme>]", "Task id scheme (slug[:<words>]|seq[:<template>]|any)")
            .action(async (scheme?: string) => {
                if (scheme === undefined)
                    await writeStdout(`${await Task.idScheme(this.log)}\n`)
                else {
                    const from = await Task.setIdScheme(this.log, scheme)
                    this.log.write("info", `task: set task id scheme of project from "${from}" to "${scheme}"`)
                    process.exit(0)
                }
            })
    }
}

