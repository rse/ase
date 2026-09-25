/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import path                   from "node:path"
import fs                     from "node:fs"

import { parse as parseYAML } from "yaml"
import writeFileAtomic        from "write-file-atomic"
import lockfile               from "proper-lockfile"

import * as API               from "./ase-task-store-plugin-api.js"
import * as TaskFormat        from "./ase-task-format.js"

/*  the options of the built-in storage plugin: the base directory, the
    "solo" mode (a single project stored flat in the base directory, any
    project id accepted) and the default lifecycle model of a project  */
export type TaskStoragePluginOptions = {
    basedir?:   string
    solo?:      boolean
    lifecycle?: string
}

/*  the task file pattern and the per-project registry file  */
const TASK_FILE_RE = /^TASK-([A-Za-z0-9_-]+)\.md$/
const PROJECT_FILE = "PROJECT.yaml"

/*  check for the existence of a filesystem path (without blocking the event loop)  */
const exists = (p: string): Promise<boolean> =>
    fs.promises.access(p).then(() => true, () => false)

/*  the built-in storage plugin: task plans persisted as "TASK-<id>.md"
    files in the textual task format (see "ase-format-task.md"), either
    flat in the base directory ("solo" mode, accepting any project id)
    or below "<basedir>/<prjId>/", with the "PROJECT.yaml" file of the
    directory serving as the project registry entry and carrying the
    lifecycle model name  */
class FileTaskStoragePlugin implements API.TaskStoragePlugin {
    readonly name = "ase"
    private basedir:   string
    private solo:      boolean
    private lifecycle: string

    constructor (private ctx: API.TaskStorageContext) {
        const options = ctx.options as TaskStoragePluginOptions
        if (typeof options.basedir !== "string" || options.basedir === "")
            throw new Error("task store: plugin \"ase\" requires the \"basedir\" option")
        this.basedir   = path.resolve(options.basedir)
        this.solo      = options.solo === true
        this.lifecycle = typeof options.lifecycle === "string" && options.lifecycle !== "" ? options.lifecycle : "solo"
        if (!Object.hasOwn(TaskFormat.taskLifecycles, this.lifecycle))
            throw new Error(`task store: plugin "ase" received unknown lifecycle model "${this.lifecycle}"`)
    }

    /*  the storage lifecycle (the base directory is not created upfront,
        but on demand once the first file is stored into it)  */
    async open (): Promise<void> {
        this.ctx.log("debug", `opened base directory "${this.basedir}"` + (this.solo ? " (solo mode)" : ""))
    }
    async close (): Promise<void> {}

    /*  the directory of a project  */
    private dir (prjId: string): string {
        return this.solo ? this.basedir : path.join(this.basedir, prjId)
    }

    /*  the cross-process lock of a project, taken beside its directory
        (as "<dir>.lock"), as the directory itself is created on demand only;
        parent directories created for the lock are removed again afterwards,
        unless the operation stored something into them  */
    async lock<T> (prjId: string, op: () => Promise<T>): Promise<T> {
        const dir    = this.dir(prjId)
        const parent = path.resolve(path.dirname(dir))
        let topmost: string | undefined
        const release = await lockfile.lock(dir, {
            realpath: false,
            retries:  { retries: 50, minTimeout: 20, maxTimeout: 200 },
            onCompromised: (err) => this.ctx.log("error", `lock of project "${prjId}" compromised: ${err.message}`),
            fs: {
                ...fs,
                mkdir: (p: string, cb: (err: NodeJS.ErrnoException | null) => void) => {
                    const attempt = (tries: number): void => {
                        fs.mkdir(path.dirname(p), { recursive: true }, (err, made) => {
                            if (err !== null)
                                return cb(err)
                            if (made !== undefined && (topmost === undefined || made.length < topmost.length))
                                topmost = made
                            fs.mkdir(p, (error) => {
                                /*  retry if a concurrent cleanup removed the parent directory meanwhile  */
                                if (error?.code === "ENOENT" && tries > 0)
                                    return attempt(tries - 1)
                                cb(error)
                            })
                        })
                    }
                    attempt(3)
                }
            }
        })
        try {
            return await op()
        }
        finally {
            await release().catch((err: Error) => this.ctx.log("warning", `unlock of project "${prjId}" failed: ${err.message}`))
            if (topmost !== undefined)
                for (let d = parent; d.length >= topmost.length; d = path.dirname(d))
                    try {
                        await fs.promises.rmdir(d)
                    }
                    catch {
                        break
                    }
        }
    }

    /*  read the registry entry of a project directory: its lifecycle model
        name and (in "solo" mode only) the id it was first registered under
        (a malformed file falls back to the defaults and is flagged as broken)  */
    private async projectOf (dir: string): Promise<{ id?: string, lifecycle: string, broken?: true }> {
        const file = path.join(dir, PROJECT_FILE)
        if (!await exists(file))
            return { lifecycle: this.lifecycle }
        const text = await fs.promises.readFile(file, "utf8")
        let doc: { id?: unknown, lifecycle?: unknown } | null
        try {
            doc = parseYAML(text) as { id?: unknown, lifecycle?: unknown } | null
        }
        catch (err) {
            this.ctx.log("warning", `malformed project file "${file}" ignored: ${(err as Error).message}`)
            return { lifecycle: this.lifecycle, broken: true }
        }
        return {
            ...(typeof doc?.id === "string" && TaskFormat.ID_RE.test(doc.id) ? { id: doc.id } : {}),
            lifecycle: typeof doc?.lifecycle === "string" && doc.lifecycle !== "" ? doc.lifecycle : this.lifecycle
        }
    }

    /*  the project registry  */
    async projectList (): Promise<API.ProjectEntry[]> {
        const out: API.ProjectEntry[] = []
        if (this.solo) {
            if (await exists(path.join(this.basedir, PROJECT_FILE))) {
                const { id, lifecycle } = await this.projectOf(this.basedir)
                out.push({ id: id ?? path.basename(this.basedir), lifecycle })
            }
        }
        else if (await exists(this.basedir))
            for (const entry of await fs.promises.readdir(this.basedir, { withFileTypes: true }))
                if (entry.isDirectory() && TaskFormat.ID_RE.test(entry.name) && await exists(path.join(this.basedir, entry.name, PROJECT_FILE)))
                    out.push({ id: entry.name, lifecycle: (await this.projectOf(path.join(this.basedir, entry.name))).lifecycle })
        return out
    }
    async projectGet (prjId: string): Promise<API.ProjectEntry | null> {
        const dir = this.dir(prjId)
        if (!await exists(path.join(dir, PROJECT_FILE)))
            return null
        return { id: prjId, lifecycle: (await this.projectOf(dir)).lifecycle }
    }
    async projectSet (prjId: string, lifecycle: string): Promise<API.WriteResult> {
        const dir    = this.dir(prjId)
        const result: API.WriteResult = await exists(path.join(dir, PROJECT_FILE)) ? "updated" : "created"
        const prev   = await this.projectOf(dir)
        await fs.promises.mkdir(dir, { recursive: true })

        /*  in "solo" mode keep the id of the first registration, as any project id
            is accepted and a differing one must not cause a rewrite of the file  */
        if (result === "created" || prev.broken || prev.lifecycle !== lifecycle)
            await writeFileAtomic(path.join(dir, PROJECT_FILE),
                (this.solo ? `id: "${prev.id ?? prjId}"\n` : "") + `lifecycle: ${lifecycle}\n`, { encoding: "utf8" })
        return result
    }
    async projectDelete (prjId: string): Promise<boolean> {
        const dir  = this.dir(prjId)
        const file = path.join(dir, PROJECT_FILE)
        if (!await exists(file))
            return false

        /*  unregister the project, but keep its directory as long as it still carries any files  */
        await fs.promises.rm(file, { force: true })
        if ((await fs.promises.readdir(dir)).length === 0)
            await fs.promises.rmdir(dir)
        return true
    }

    /*  the task plan file of a project and the lifecycle model its
        legacy content is normalized against  */
    private file (prjId: string, taskId: string): string {
        return path.join(this.dir(prjId), `TASK-${taskId}.md`)
    }
    private async model (prjId: string): Promise<TaskFormat.TaskLifecycle> {
        const name = (await this.projectOf(this.dir(prjId))).lifecycle
        return Object.hasOwn(TaskFormat.taskLifecycles, name) ? TaskFormat.taskLifecycles[name] : TaskFormat.taskLifecycles[this.lifecycle]
    }

    /*  the task plans  */
    async taskList (prjId: string): Promise<API.TaskEntry[]> {
        const dir = this.dir(prjId)
        if (!await exists(dir))
            return []
        const lifecycle = await this.model(prjId)
        const out: API.TaskEntry[] = []
        for (const entry of await fs.promises.readdir(dir)) {
            const m = TASK_FILE_RE.exec(entry)
            if (m === null)
                continue
            const file = path.join(dir, entry)
            const st   = await fs.promises.stat(file)
            if (!st.isFile())
                continue
            const text = await fs.promises.readFile(file, "utf8")
            if (text === "")
                continue
            const plan = TaskFormat.parseTaskText(m[1], text, lifecycle)
            out.push({ id: m[1], title: TaskFormat.taskTitle(plan.body), header: plan.header, mtime: st.mtime })
        }
        return out
    }
    async taskLoad (prjId: string, taskId: string): Promise<API.TaskPlan | null> {
        const file = this.file(prjId, taskId)
        if (!await exists(file))
            return null

        /*  an empty task file reads as no task (as before the task store)  */
        const text = await fs.promises.readFile(file, "utf8")
        if (text === "")
            return null
        return TaskFormat.parseTaskText(taskId, text, await this.model(prjId))
    }
    async taskSave (prjId: string, taskId: string, plan: API.TaskPlan): Promise<API.WriteResult> {
        const file   = this.file(prjId, taskId)
        const result: API.WriteResult = await exists(file) ? "updated" : "created"
        await fs.promises.mkdir(path.dirname(file), { recursive: true })
        await writeFileAtomic(file, TaskFormat.formatTaskText(plan), { encoding: "utf8" })
        return result
    }
    async taskDelete (prjId: string, taskId: string): Promise<boolean> {
        const file = this.file(prjId, taskId)
        if (!await exists(file))
            return false
        await fs.promises.rm(file, { force: true })
        return true
    }
    async taskRename (prjId: string, oldId: string, newId: string): Promise<boolean> {
        const oldFile = this.file(prjId, oldId)
        const newFile = this.file(prjId, newId)
        if (!await exists(oldFile))
            return false

        /*  move atomically first and rewrite the header afterwards, as a crash
            in between is harmless: parsing takes the "Id" from the filename  */
        await fs.promises.rename(oldFile, newFile)
        const plan = TaskFormat.parseTaskText(newId, await fs.promises.readFile(newFile, "utf8"), await this.model(prjId))
        await writeFileAtomic(newFile, TaskFormat.formatTaskText(plan), { encoding: "utf8" })
        return true
    }
}

/*  the plugin factory  */
const factory: API.TaskStoragePluginFactory = (ctx) => new FileTaskStoragePlugin(ctx)
export default factory

