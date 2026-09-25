/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import path              from "node:path"
import { pathToFileURL } from "node:url"

import PQueue            from "p-queue"

import type * as API     from "./ase-task-store-plugin-api.js"

/*  the methods every storage plugin has to provide  */
const pluginMethods = [
    "open", "close",
    "projectList", "projectGet", "projectSet", "projectDelete",
    "taskList", "taskLoad", "taskSave", "taskDelete", "taskRename"
] as const

/*  the name of the built-in storage plugin  */
export const BUILTIN_PLUGIN = "ase"

/*  resolve a storage plugin name onto its module specifier: the name
    "ase" (or no name) selects the built-in plugin, any other plain name
    selects the NPM package "ase-task-store-<name>", a relative or
    absolute path is taken as a local module, and anything else is
    passed through as a module specifier  */
export const resolveTaskStoragePlugin = (name: string | null): string => {
    if (name === null || name === "" || name === BUILTIN_PLUGIN)
        return new URL("./ase-task-store-plugin-ase.js", import.meta.url).href
    if (/^[A-Za-z0-9_-]+$/.test(name))
        return `ase-task-store-${name}`
    if (name.startsWith(".") || path.isAbsolute(name))
        return pathToFileURL(path.resolve(name)).href
    return name
}

/*  load a storage plugin by name, instantiate it through its factory
    with the given context, and verify it provides the plugin interface  */
export const loadTaskStoragePlugin = async (name: string | null, ctx: API.TaskStorageContext): Promise<API.TaskStoragePlugin> => {
    const specifier = resolveTaskStoragePlugin(name)
    name ??= BUILTIN_PLUGIN
    let mod: unknown
    try {
        mod = await import(specifier)
    }
    catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        throw new Error(`task store: failed to load storage plugin "${name}" (module "${specifier}"): ${message}`,
            { cause: err })
    }
    const factory = (mod as { default?: unknown } | null)?.default
    if (typeof factory !== "function")
        throw new Error(`task store: storage plugin "${name}" (module "${specifier}") ` +
            "does not default-export a plugin factory function")
    let plugin: API.TaskStoragePlugin
    try {
        plugin = (factory as API.TaskStoragePluginFactory)(ctx)
    }
    catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        throw new Error(`task store: storage plugin "${name}" factory failed: ${message}`, { cause: err })
    }
    if (typeof plugin !== "object" || plugin === null)
        throw new Error(`task store: storage plugin "${name}" factory did not return a plugin object`)
    if (typeof plugin.name !== "string" || plugin.name === "")
        throw new Error(`task store: storage plugin "${name}" lacks the "name" property`)
    for (const method of pluginMethods)
        if (typeof plugin[method] !== "function")
            throw new Error(`task store: storage plugin "${name}" lacks the "${method}" method`)
    if (plugin.lock !== undefined && typeof plugin.lock !== "function")
        throw new Error(`task store: storage plugin "${name}" provides a non-function "lock" property`)
    if (plugin.fileRead !== undefined && typeof plugin.fileRead !== "function")
        throw new Error(`task store: storage plugin "${name}" provides a non-function "fileRead" property`)
    return plugin
}

/*  the storage delegate the REST API server operates on: it forwards
    every persistence operation into the loaded storage plugin and
    additionally serializes the operations per project, as the part
    endpoints are read-modify-write cycles on entire plans  */
export class TaskStore {
    private queues = new Map<string, PQueue>()

    constructor (private plugin: API.TaskStoragePlugin) {}

    /*  the name of the underlying storage plugin  */
    get name (): string {
        return this.plugin.name
    }

    /*  run an operation of a project strictly serialized: in-process
        queued in arrival order (hence not re-entrant) and additionally
        under the cross-process lock of the storage plugin (if any)  */
    async serialize<T> (prjId: string, op: () => Promise<T>): Promise<T> {
        let queue = this.queues.get(prjId)
        if (queue === undefined) {
            queue = new PQueue({ concurrency: 1 })
            queue.on("idle", () => this.queues.delete(prjId))
            this.queues.set(prjId, queue)
        }
        return queue.add(() => this.plugin.lock !== undefined ? this.plugin.lock(prjId, op) : op())
    }

    /*  delegate the storage lifecycle, closing only after all queued operations settled  */
    open (): Promise<void> { return this.plugin.open() }
    async close (): Promise<void> {
        while (this.queues.size > 0)
            await Promise.all(Array.from(this.queues.values(), (queue) => queue.onIdle()))
        return this.plugin.close()
    }

    /*  delegate the project registry operations  */
    projectList   ():                                  Promise<API.ProjectEntry[]>      { return this.plugin.projectList()                 }
    projectGet    (prjId: string):                     Promise<API.ProjectEntry | null> { return this.plugin.projectGet(prjId)             }
    projectSet    (prjId: string, lifecycle: string):  Promise<API.WriteResult>         { return this.plugin.projectSet(prjId, lifecycle)  }
    projectDelete (prjId: string):                     Promise<boolean>             { return this.plugin.projectDelete(prjId)          }

    /*  delegate the task plan operations  */
    taskList   (prjId: string):                                 Promise<API.TaskEntry[]>      { return this.plugin.taskList(prjId)                    }
    taskLoad   (prjId: string, taskId: string):                 Promise<API.TaskPlan | null>  { return this.plugin.taskLoad(prjId, taskId)            }
    taskSave   (prjId: string, taskId: string, plan: API.TaskPlan): Promise<API.WriteResult>      { return this.plugin.taskSave(prjId, taskId, plan)      }
    taskDelete (prjId: string, taskId: string):                 Promise<boolean>          { return this.plugin.taskDelete(prjId, taskId)          }
    taskRename (prjId: string, oldId: string, newId: string):   Promise<boolean>          { return this.plugin.taskRename(prjId, oldId, newId)    }

    /*  delegate the optional referenced file reading (null if unsupported)  */
    get canReadFiles (): boolean { return this.plugin.fileRead !== undefined }
    fileRead (prjId: string, file: string): Promise<Buffer | null> {
        return this.plugin.fileRead !== undefined ? this.plugin.fileRead(prjId, file) : Promise.resolve(null)
    }
}

