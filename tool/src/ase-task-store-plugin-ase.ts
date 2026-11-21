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
import { watch }              from "chokidar"
import type { FSWatcher }     from "chokidar"

import type * as API          from "./ase-task-store-plugin-api.js"
import * as TaskFormat        from "./ase-task-format.js"

/*  the options of the built-in storage plugin: the base directory, the
    "solo" mode (a single project stored flat in the base directory, any
    project id accepted), and the default lifecycle model and task id
    scheme of a project  */
export type TaskStoragePluginOptions = {
    basedir?:   string
    solo?:      boolean
    lifecycle?: string
    idscheme?:  string
}

/*  the task file pattern and the per-project registry file  */
const TASK_FILE_RE = /^TASK-([A-Za-z0-9#][A-Za-z0-9#_-]*)\.md$/
const PROJECT_FILE = "PROJECT.yaml"

/*  check for the existence of a filesystem path (without blocking the event loop)  */
const exists = (p: string): Promise<boolean> =>
    fs.promises.access(p).then(() => true, () => false)

/*  the built-in storage plugin: task plans persisted as "TASK-<id>.md"
    files in the textual task format (see "ase-format-task.md"), either
    flat in the base directory ("solo" mode, accepting any project id)
    or below "<basedir>/<prjId>/", with the "PROJECT.yaml" file of the
    directory serving as the project registry entry and carrying the
    lifecycle model name, the task id scheme, and the sequence number
    high-water mark  */
class FileTaskStoragePlugin implements API.TaskStoragePlugin {
    readonly name     = "ase"
    readonly verbatim = true
    private basedir:   string
    private solo:      boolean
    private lifecycle: string
    private idscheme:  string

    /*  the change detection state: the listener, the directory watcher, the
        observed projects (onto their directories), the stamps of the task plan
        files per directory, and the debounced, non-overlapping rescanning  */
    private listener: ((prjId: string, change: API.TaskChange) => void) | null = null
    private watcher:  FSWatcher | null = null
    private tracked   = new Map<string, string>()
    private stamps    = new Map<string, Map<string, string>>()
    private timer:    ReturnType<typeof setTimeout> | null = null
    private watching  = false
    private scanning  = false
    private pending   = false

    constructor (private ctx: API.TaskStorageContext) {
        const options = ctx.options as TaskStoragePluginOptions
        if (typeof options.basedir !== "string" || options.basedir === "")
            throw new Error("task store: plugin \"ase\" requires the \"basedir\" option")
        this.basedir   = path.resolve(options.basedir)
        this.solo      = options.solo === true
        this.lifecycle = typeof options.lifecycle === "string" && options.lifecycle !== "" ? options.lifecycle : "solo"
        this.idscheme  = typeof options.idscheme  === "string" && options.idscheme  !== "" ? options.idscheme  : "slug"
        if (!Object.hasOwn(TaskFormat.taskLifecycles, this.lifecycle))
            throw new Error(`task store: plugin "ase" received unknown lifecycle model "${this.lifecycle}"`)
        if (TaskFormat.checkIdScheme(this.idscheme) !== "")
            throw new Error(`task store: plugin "ase" received invalid task id scheme "${this.idscheme}"`)
    }

    /*  the storage lifecycle (the base directory is not created upfront,
        but on demand once the first file is stored into it), watching
        the base directory for changes while opened and observed  */
    async open (): Promise<void> {
        if (this.listener !== null) {
            this.watching = true
            this.arm()
        }
        this.ctx.log("debug", `opened base directory "${this.basedir}" ` +
            `(storage: ${this.solo ? "single" : "multi"}, lifecycle: ${this.lifecycle})`)
    }
    async close (): Promise<void> {
        this.watching = false
        if (this.timer !== null)
            clearTimeout(this.timer)
        this.timer = null
        const watcher = this.watcher
        this.watcher = null
        await watcher?.close()
        this.tracked.clear()
        this.stamps.clear()
    }

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
        name, its task id scheme, the high-water mark of its sequence numbers,
        and (in "solo" mode only) the id it was first registered under (a
        malformed file falls back to the defaults and is flagged as broken)  */
    private async projectOf (dir: string): Promise<{ id?: string, lifecycle: string, idscheme: string, seqmark: number, broken?: true }> {
        const file = path.join(dir, PROJECT_FILE)
        if (!await exists(file))
            return { lifecycle: this.lifecycle, idscheme: this.idscheme, seqmark: 0 }
        const text = await fs.promises.readFile(file, "utf8")
        let doc: { id?: unknown, lifecycle?: unknown, idscheme?: unknown, seqmark?: unknown } | null
        try {
            doc = parseYAML(text) as typeof doc
        }
        catch (err) {
            this.ctx.log("warning", `malformed project file "${file}" ignored: ${err instanceof Error ? err.message : String(err)}`)
            return { lifecycle: this.lifecycle, idscheme: this.idscheme, seqmark: 0, broken: true }
        }
        return {
            ...(typeof doc?.id === "string" && TaskFormat.ID_RE.test(doc.id) ? { id: doc.id } : {}),
            lifecycle: typeof doc?.lifecycle === "string" && doc.lifecycle !== "" ? doc.lifecycle : this.lifecycle,
            idscheme:  typeof doc?.idscheme  === "string" && doc.idscheme  !== "" ? doc.idscheme  : this.idscheme,
            seqmark:   typeof doc?.seqmark  === "number" && Number.isSafeInteger(doc.seqmark) && doc.seqmark > 0 ? doc.seqmark : 0
        }
    }

    /*  write the registry entry of a project directory, where in "solo" mode the id
        of the first registration is kept, as any project id is accepted and a
        differing one must not cause a rewrite of the file (all strings are
        quoted, as e.g. the task id scheme can contain "#" and ":")  */
    private async projectWrite (dir: string, id: string, lifecycle: string, idscheme: string, seqmark: number): Promise<void> {
        await fs.promises.mkdir(dir, { recursive: true })
        await writeFileAtomic(path.join(dir, PROJECT_FILE),
            (this.solo ? `id: ${JSON.stringify(id)}\n` : "") + `lifecycle: ${JSON.stringify(lifecycle)}\n` +
            `idscheme: ${JSON.stringify(idscheme)}\n` +
            (seqmark > 0 ? `seqmark: ${seqmark}\n` : ""), { encoding: "utf8" })
    }

    /*  the project registry  */
    async projectList (): Promise<API.ProjectEntry[]> {
        const out: API.ProjectEntry[] = []
        if (this.solo) {
            if (await exists(path.join(this.basedir, PROJECT_FILE))) {
                const { id, lifecycle, idscheme, seqmark } = await this.projectOf(this.basedir)
                out.push({ id: id ?? path.basename(this.basedir), lifecycle, idscheme, seqmark })
            }
        }
        else if (await exists(this.basedir))
            for (const entry of await fs.promises.readdir(this.basedir, { withFileTypes: true }))
                if (entry.isDirectory() && TaskFormat.ID_RE.test(entry.name) && await exists(path.join(this.basedir, entry.name, PROJECT_FILE))) {
                    const { lifecycle, idscheme, seqmark } = await this.projectOf(path.join(this.basedir, entry.name))
                    out.push({ id: entry.name, lifecycle, idscheme, seqmark })
                }
        return out
    }
    async projectGet (prjId: string): Promise<API.ProjectEntry | null> {
        const dir = this.dir(prjId)
        if (!await exists(path.join(dir, PROJECT_FILE)))
            return null
        const { lifecycle, idscheme, seqmark } = await this.projectOf(dir)
        await this.track(prjId)
        return { id: prjId, lifecycle, idscheme, seqmark }
    }
    async projectSet (prjId: string, lifecycle: string, idscheme: string): Promise<API.WriteResult> {
        const dir    = this.dir(prjId)
        const result = await exists(path.join(dir, PROJECT_FILE)) ? "updated" : "created"
        const prev   = await this.projectOf(dir)
        if (result === "created" || prev.broken || prev.lifecycle !== lifecycle || prev.idscheme !== idscheme)
            await this.projectWrite(dir, prev.id ?? prjId, lifecycle, idscheme, prev.seqmark)
        await this.track(prjId)
        return result
    }
    async projectMark (prjId: string, seqmark: number): Promise<void> {
        const dir  = this.dir(prjId)
        const prev = await this.projectOf(dir)
        if (seqmark !== prev.seqmark)
            await this.projectWrite(dir, prev.id ?? prjId, prev.lifecycle, prev.idscheme, seqmark)
    }
    async projectDelete (prjId: string): Promise<boolean> {
        const dir  = this.dir(prjId)
        const file = path.join(dir, PROJECT_FILE)
        if (!await exists(file))
            return false
        this.untrack(prjId)

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

    /*  the listing entry of a task plan file of a directory (null if missing or empty)  */
    private async entry (dir: string, taskId: string, lifecycle: TaskFormat.TaskLifecycle): Promise<API.TaskEntry | null> {
        const file = path.join(dir, `TASK-${taskId}.md`)
        const st   = await fs.promises.stat(file).catch(() => null)
        if (st === null || !st.isFile())
            return null
        const text = await fs.promises.readFile(file, "utf8")
        if (text === "")
            return null
        const plan = TaskFormat.parseTaskText(taskId, text, lifecycle)
        return { id: taskId, title: TaskFormat.taskTitle(plan.body), header: plan.header, mtime: st.mtime }
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
            const task = await this.entry(dir, m[1], lifecycle)
            if (task !== null)
                out.push(task)
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
        const result = await exists(file) ? "updated" : "created"
        await fs.promises.mkdir(path.dirname(file), { recursive: true })
        await writeFileAtomic(file, TaskFormat.formatTaskText(plan), { encoding: "utf8" })
        await this.written(prjId, taskId)
        return result
    }
    async taskDelete (prjId: string, taskId: string): Promise<boolean> {
        const file = this.file(prjId, taskId)
        if (!await exists(file))
            return false
        await fs.promises.rm(file, { force: true })
        await this.written(prjId, taskId)
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
        await this.written(prjId, oldId, newId)
        return true
    }

    /*  the referenced attachment files, confined to the project directory  */
    async fileRead (prjId: string, file: string): Promise<Buffer | null> {
        const dir  = await fs.promises.realpath(this.dir(prjId)).catch(() => null)
        const full = dir !== null ? await fs.promises.realpath(path.resolve(dir, file)).catch(() => null) : null
        if (dir === null || full === null || !full.startsWith(dir + path.sep))
            return null
        const st = await fs.promises.stat(full).catch(() => null)
        if (st === null || !st.isFile())
            return null
        return fs.promises.readFile(full)
    }

    /*  ==== change detection ====  */

    /*  observe the changes of the task plan files made outside of this plugin instance  */
    watch (listener: (prjId: string, change: API.TaskChange) => void): void {
        this.listener = listener
    }

    /*  watch the base directory, or, as long as it does not exist yet, its
        nearest existing ancestor for the creation of the next path step
        towards it, re-arming once it appears (chokidar alone misses this)  */
    private arm (): void {
        if (!this.watching)
            return
        const dir = this.basedir
        let w: FSWatcher
        if (fs.existsSync(dir)) {
            w = watch(dir, {
                ignoreInitial: true,
                depth:         this.solo ? 0 : 1,
                ignored:       (file, stats) => (file !== dir && file.endsWith(".lock"))
                    || (stats?.isFile() === true && !TASK_FILE_RE.test(path.basename(file)))
            })
            w.on("all", () => this.schedule())
        }
        else {
            let base = path.dirname(dir)
            while (!fs.existsSync(base) && path.dirname(base) !== base)
                base = path.dirname(base)
            const next = path.join(base, path.relative(base, dir).split(path.sep)[0])
            w = watch(base, {
                ignoreInitial: true,
                depth:         0,
                ignored:       (file) => file !== base && file !== next
            })
            const rearm = (): void => {
                if (this.watcher !== w)
                    return
                this.watcher = null
                w.close().catch(() => {
                    /*  re-arm even if the outdated watcher fails to close  */
                }).finally(() => {
                    this.arm()
                    this.schedule()
                })
            }
            w.on("addDir", (file) => {
                if (file === next)
                    rearm()
            })
            w.on("ready", () => {
                if (fs.existsSync(next))
                    rearm()
            })
        }
        w.on("error", (err: unknown) => {
            this.ctx.log("warning", `watcher: ${err instanceof Error ? err.message : String(err)}`)
        })
        this.watcher = w
    }

    /*  the stamp (modification time and size) of a non-empty task plan file (null if missing or empty)  */
    private async stamp (file: string): Promise<string | null> {
        const st = await fs.promises.stat(file).catch(() => null)
        return st !== null && st.isFile() && st.size > 0 ? `${st.mtimeMs}:${st.size}` : null
    }

    /*  the stamps of the task plan files of a directory  */
    private async scan (dir: string): Promise<Map<string, string>> {
        const stamps  = new Map<string, string>()
        const entries = await fs.promises.readdir(dir).catch((err: NodeJS.ErrnoException) => {
            if (err.code === "ENOENT")
                return [] as string[]
            throw err
        })
        for (const entry of entries) {
            const m = TASK_FILE_RE.exec(entry)
            if (m === null)
                continue
            const stamp = await this.stamp(path.join(dir, entry))
            if (stamp !== null)
                stamps.set(m[1], stamp)
        }
        return stamps
    }

    /*  start resp. stop observing a project, taking the initial stamps of its directory  */
    private async track (prjId: string): Promise<void> {
        if (!this.watching || this.tracked.has(prjId))
            return
        const dir = this.dir(prjId)
        this.tracked.set(prjId, dir)
        if (!this.stamps.has(dir))
            this.stamps.set(dir, await this.scan(dir))
    }
    private untrack (prjId: string): void {
        const dir = this.tracked.get(prjId)
        this.tracked.delete(prjId)
        if (dir !== undefined && ![ ...this.tracked.values() ].includes(dir))
            this.stamps.delete(dir)
    }

    /*  record the stamps of the task plan files written by this plugin instance,
        so the change detection does not report them as external changes  */
    private async written (prjId: string, ...taskIds: string[]): Promise<void> {
        const stamps = this.stamps.get(this.dir(prjId))
        if (stamps === undefined)
            return
        for (const taskId of taskIds) {
            const stamp = await this.stamp(this.file(prjId, taskId))
            if (stamp === null)
                stamps.delete(taskId)
            else
                stamps.set(taskId, stamp)
        }
    }

    /*  schedule a rescan of the observed projects, debounced  */
    private schedule (): void {
        if (!this.watching)
            return
        if (this.timer !== null)
            clearTimeout(this.timer)
        this.timer = setTimeout(() => {
            this.timer = null
            this.rescan().catch(() => {
                /*  failures are already logged per directory  */
            })
        }, 100)
        this.timer.unref()
    }

    /*  rescan the directories of the observed projects, never overlapping itself,
        and report the task plan files whose stamps changed: as added if unknown
        before, as deleted if gone, else as updated (to all projects of a directory)  */
    private async rescan (): Promise<void> {
        if (this.scanning) {
            this.pending = true
            return
        }
        this.scanning = true
        try {
            const dirs = new Map<string, string[]>()
            for (const [ prjId, dir ] of this.tracked)
                dirs.set(dir, [ ...(dirs.get(dir) ?? []), prjId ])
            for (const [ dir, prjIds ] of dirs) {
                try {
                    const before = this.stamps.get(dir)
                    if (before === undefined)
                        continue
                    const known     = new Map(before)
                    const after     = await this.scan(dir)
                    const lifecycle = await this.model(prjIds[0])
                    const change    = { added: [] as API.TaskEntry[], updated: [] as API.TaskEntry[], deleted: [] as string[] }
                    for (const [ taskId, stamp ] of after) {
                        if (known.get(taskId) === stamp)
                            continue
                        const entry = await this.entry(dir, taskId, lifecycle)
                        if (entry !== null)
                            (known.has(taskId) ? change.updated : change.added).push(entry)
                    }
                    for (const taskId of known.keys())
                        if (!after.has(taskId))
                            change.deleted.push(taskId)

                    /*  skip the task plans written by this plugin instance during the scan  */
                    if (!this.watching || this.stamps.get(dir) !== before)
                        continue
                    const own = (taskId: string): boolean => before.get(taskId) !== known.get(taskId)
                    change.added   = change.added.filter((entry) => !own(entry.id))
                    change.updated = change.updated.filter((entry) => !own(entry.id))
                    change.deleted = change.deleted.filter((taskId) => !own(taskId))

                    /*  update the stamps in place (and only of the reported task plans),
                        as the own writes meanwhile already recorded theirs  */
                    for (const entry of [ ...change.added, ...change.updated ])
                        before.set(entry.id, after.get(entry.id)!)
                    for (const taskId of change.deleted)
                        before.delete(taskId)
                    if (this.listener !== null && (change.added.length > 0 || change.updated.length > 0 || change.deleted.length > 0))
                        for (const prjId of prjIds)
                            this.listener(prjId, change)
                }
                catch (err: unknown) {
                    this.ctx.log("warning", `scanning directory "${dir}" failed: ${err instanceof Error ? err.message : String(err)}`)
                }
            }
        }
        finally {
            this.scanning = false
            if (this.pending) {
                this.pending = false
                this.schedule()
            }
        }
    }
}

/*  the plugin factory  */
const factory: API.TaskStoragePluginFactory = (ctx) => new FileTaskStoragePlugin(ctx)
export default factory

