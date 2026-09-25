/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

/*  the JSON task plan structure as exchanged by the REST API:
    the header is a flat key/value object (with the array-typed
    keys "After" and "Tags"), the body is the Markdown source, and
    the attachments are flat key/value objects with string values  */
export type TaskHeaderValue = string | string[]
export type TaskHeader      = Record<string, TaskHeaderValue>
export type TaskAttachment  = Record<string, string>
export type TaskPlan        = {
    header:     TaskHeader
    body:       string
    attachment: TaskAttachment[]
}

/*  a registered project: its id and the name of its task lifecycle
    model ("solo", "team", or "enterprise")  */
export type ProjectEntry = {
    id:        string
    lifecycle: string
}

/*  a task plan listing entry: its id, its title (derived from the
    body as defined by the "Task titles" convention), its raw header
    (from which the server derives the effective status, applying the
    initial state of the lifecycle model if "Status" is absent), and
    the time of its last modification  */
export type TaskEntry = {
    id:     string
    title:  string
    header: TaskHeader
    mtime:  Date
}

/*  the outcome of an idempotent write: whether the entity was
    newly created or an existing one updated  */
export type WriteResult = "created" | "updated"

/*  the context handed to the plugin at load time: the verbatim
    "storage.options" configuration and a logging function  */
export type TaskStorageContext = {
    options: Record<string, unknown>
    log:     (level: "error" | "warning" | "info" | "debug", message: string) => void
}

/*  the storage plugin: every method is asynchronous, every id was
    already validated by the server against "[A-Za-z0-9_-]+", and
    every method throws on an infrastructure error only (which the
    server maps onto a "500" response) -- the "not found", "conflict",
    and "already exists" cases are expressed through the return values  */
export interface TaskStoragePlugin {
    /*  the plugin name, for diagnostics  */
    readonly name: string

    /*  open the storage (connect, create directories, etc.) and
        close it again (flush, disconnect, etc.); "close" is called
        exactly once after a successful "open" (on shutdown or failed startup)  */
    open  (): Promise<void>
    close (): Promise<void>

    /*  optionally run an operation under the exclusive cross-process
        lock of a project, in case the storage is shared with other
        processes and provides no transactions of its own  */
    lock? <T> (prjId: string, op: () => Promise<T>): Promise<T>

    /*  list all registered projects (in any order)  */
    projectList (): Promise<ProjectEntry[]>

    /*  get a registered project, or null if not registered  */
    projectGet (prjId: string): Promise<ProjectEntry | null>

    /*  register a project with the given lifecycle model name, or
        change the lifecycle model name of a registered project  */
    projectSet (prjId: string, lifecycle: string): Promise<WriteResult>

    /*  unregister a project without deleting its task plans;
        returns false if the project was not registered  */
    projectDelete (prjId: string): Promise<boolean>

    /*  list all task plans of a registered project (in any order),
        each with its title, its raw header, and its modification time  */
    taskList (prjId: string): Promise<TaskEntry[]>

    /*  load a task plan, or null if it does not exist  */
    taskLoad (prjId: string, taskId: string): Promise<TaskPlan | null>

    /*  create or overwrite a task plan with the given (already
        validated) structure and refresh its modification time  */
    taskSave (prjId: string, taskId: string, plan: TaskPlan): Promise<WriteResult>

    /*  delete a task plan; returns false if it did not exist  */
    taskDelete (prjId: string, taskId: string): Promise<boolean>

    /*  rename a task plan by moving it from "oldId" to "newId" and
        rewriting its "Id" header key accordingly; returns false if
        the source did not exist; the server guarantees that the
        target does not exist  */
    taskRename (prjId: string, oldId: string, newId: string): Promise<boolean>
}

/*  the plugin factory: the default export of the plugin module,
    called exactly once by the server at startup  */
export type TaskStoragePluginFactory = (ctx: TaskStorageContext) => TaskStoragePlugin

