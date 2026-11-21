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

/*  a registered project: its id, the name of its task lifecycle
    model ("solo", "team", or "enterprise"), its task id scheme
    ("slug[:<words>]", "seq[:<template>]", or "any", absent for "slug"),
    and the high-water mark of its sequence numbers (absent for 0)  */
export type ProjectEntry = {
    id:        string
    lifecycle: string
    idscheme?: string
    seqmark?:  number
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

/*  the outcome of a task plan write: additionally "changed" if a revision
    was expected (see "taskRevision"), but the task plan no longer carries it  */
export type TaskWriteResult = WriteResult | "changed"

/*  the task plans of a project changed outside of the plugin instance
    (e.g. by another client of a remote storage), as detected by the plugin itself  */
export type TaskChange = {
    added?:   TaskEntry[]
    updated?: TaskEntry[]
    deleted?: string[]
}

/*  the context handed to the plugin at load time: the verbatim
    "storage.options" configuration and a logging function  */
export type TaskStorageContext = {
    options: Record<string, unknown>
    log:     (level: "error" | "warning" | "info" | "debug", message: string) => void
}

/*  the storage plugin: every method is asynchronous, every id was already
    validated by the server against "[A-Za-z0-9_-]+" (project ids) resp.
    "[A-Za-z0-9#][A-Za-z0-9#_-]*" (task ids), and every method throws on an infrastructure
    error only (which the server maps onto a "500" response) -- the "not
    found", "conflict", and "already exists" cases are expressed through
    the return values  */
export interface TaskStoragePlugin {
    /*  the plugin name, for diagnostics  */
    readonly name: string

    /*  optionally declare that task plans are stored verbatim, i.e., that
        "taskLoad" returns a plan whose textual form equals the one of the
        plan passed to "taskSave" (instead of one normalized by the storage,
        e.g. an issue tracker), so the entity tag of a just-saved plan can be
        determined without loading it again  */
    readonly verbatim?: boolean

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

    /*  register a project with the given lifecycle model name and task id
        scheme, or change both of a registered project  */
    projectSet (prjId: string, lifecycle: string, idscheme: string): Promise<WriteResult>

    /*  optionally persist the high-water mark of the sequence numbers of a
        registered project (the highest one ever removed or allocated), so scheme
        "seq" never reuses the number of a deleted, purged, renamed, or allocated task  */
    projectMark? (prjId: string, seqmark: number): Promise<void>

    /*  unregister a project without deleting its task plans;
        returns false if the project was not registered  */
    projectDelete (prjId: string): Promise<boolean>

    /*  list all task plans of a registered project (in any order),
        each with its title, its raw header, and its modification time  */
    taskList (prjId: string): Promise<TaskEntry[]>

    /*  load a task plan, or null if it does not exist  */
    taskLoad (prjId: string, taskId: string): Promise<TaskPlan | null>

    /*  optionally determine the current revision of a task plan (an opaque token,
        changing on every change, also outside of the plugin instance), or null if
        none, so a storage without locks and conditional writes (e.g. an issue tracker)
        detects concurrent changes, where a later "taskLoad" never yields an older plan  */
    taskRevision? (prjId: string, taskId: string): Promise<string | null>

    /*  create or overwrite a task plan with the given (already validated)
        structure and refresh its modification time, where with a revision
        (passed only if "taskRevision" is provided) it returns "changed" instead,
        without any modification, if the plan no longer carries this revision  */
    taskSave (prjId: string, taskId: string, plan: TaskPlan, revision?: string): Promise<TaskWriteResult>

    /*  delete a task plan; returns false if it did not exist  */
    taskDelete (prjId: string, taskId: string): Promise<boolean>

    /*  rename a task plan by moving it from "oldId" to "newId" and
        rewriting its "Id" header key accordingly; returns false if
        the source did not exist; the server guarantees that the
        target does not exist  */
    taskRename (prjId: string, oldId: string, newId: string): Promise<boolean>

    /*  optionally observe the changes of task plans made outside of the plugin
        instance: the listener is registered before "open" and called with the
        changes of a project between "open" and "close"  */
    watch? (listener: (prjId: string, change: TaskChange) => void): void

    /*  optionally read the content of a file referenced by the "File"
        key of an attachment, relative to the storage location of the
        project; returns null if it does not exist or escapes this location  */
    fileRead? (prjId: string, file: string): Promise<Buffer | null>
}

/*  the plugin factory: the default export of the plugin module,
    called exactly once by the server at startup  */
export type TaskStoragePluginFactory = (ctx: TaskStorageContext) => TaskStoragePlugin

