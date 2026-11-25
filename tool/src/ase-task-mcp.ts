/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import { z }                                              from "zod"
import type { McpServer }                                 from "@modelcontextprotocol/sdk/server/mcp.js"

import type Log                                           from "./ase-lib-log.js"
import { Markdown }                                       from "./ase-service-markdown.js"
import * as Core                                          from "./ase-task-store-core.js"
import { requestsOf }                                     from "./ase-task-request.js"
import type { UsageTracker }                              from "./ase-service-otel.js"
import { Task, usageText }                                from "./ase-task.js"
import type { TaskSaved }                                 from "./ase-task.js"

/*  render a caught error as an MCP tool error result  */
const mcpError = (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err)
    return {
        isError: true,
        content: [ { type: "text" as const, text: `ERROR: ${message}` } ]
    }
}

/*  render a text as an MCP tool result  */
const mcpText = (text: string) =>
    ({ content: [ { type: "text" as const, text } ] })

/*  render a task id scheme warning as a trailing notice line of an MCP tool result
    (not as "WARNING:", as callers treat such a result as a failed operation)  */
const notice = (warning: string): string =>
    warning !== "" ? `\nNOTICE: ${warning}` : ""

/*  MCP registration entry point for task tools (with the task assignment
    handling the AI usage windows through the usage tracker of the service)  */
export class TaskMCP {
    constructor (private log: Log, private usage?: UsageTracker) {}

    /*  register MCP tools  */
    register (mcp: McpServer): void {
        /*  task list  */
        mcp.registerTool("ase_task_list", {
            title: "ASE task list",
            description:
                "List all persisted tasks. " +
                "Returns a `tasks` array (in natural `id` order, numbers by their value) where each item has the " +
                "task `id`, the `status` of its plan (the `Status:` frontmatter key, defaulting " +
                "to the initial state of the configured task lifecycle model), and the `title` of " +
                "its plan (the `#   TASK: <title>` heading, empty if absent). " +
                "If `verbose` is `true`, each item additionally has an `mtime` field " +
                "(last modification time of the task plan, formatted as `YYYY-MM-DD HH:MM`) " +
                "and an `effort` field (the T-shirt size of its valid `Effort:` frontmatter key, " +
                "empty if not estimated). " +
                "Returns an empty array if no tasks exist.",
            inputSchema:  {
                verbose: z.boolean().optional()
                    .describe("if true, also include the `mtime` and `effort` fields per task (default: false)")
            },
            outputSchema: {
                tasks: z.array(z.object({
                    id:     z.string().describe("task identifier"),
                    status: z.string().describe("task plan lifecycle status (`Status:` frontmatter key, " +
                        "defaulting to the initial state of the configured task lifecycle model)"),
                    title:  z.string().describe("task plan title (`#   TASK: <title>` heading, empty if absent)"),
                    mtime:  z.string().optional()
                        .describe("task plan modification time (`YYYY-MM-DD HH:MM`); only present if `verbose` is true"),
                    effort: z.string().optional()
                        .describe("task effort size (`XS`, `S`, `M`, `L`, or `XL`, empty if not estimated); " +
                            "only present if `verbose` is true")
                })).describe("all persisted tasks in natural id order")
            }
        }, async (args) => {
            try {
                const verbose = args.verbose ?? false
                const items   = await Task.list(this.log)
                const tasks   = verbose ? items :
                    items.map(({ id, status, title }) => ({ id, status, title }))
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

        /*  register the further MCP tools  */
        this.registerLoadTool(mcp)
        this.registerSaveTool(mcp)
        this.registerPlanTools(mcp)
        this.registerStatusTools(mcp)
        this.registerAssignTool(mcp)
        this.registerIdTools(mcp)
    }

    /*  register the MCP tool loading a task plan  */
    private registerLoadTool (mcp: McpServer): void {
        /*  task load  */
        mcp.registerTool("ase_task_load", {
            title: "ASE task load",
            _meta: { "anthropic/alwaysLoad": true },
            description:
                "Load a previously persisted task by `id`. " +
                "Returns the task as `text`, normalized into the current Markdown frontmatter shape; " +
                "returns a `WARNING: no task plan \"<id>\" exists yet (a new task)` line instead " +
                "(without any delimiter or tag lines) if no task exists for the `id`. " +
                "The `variant` argument selects the returned form of the plan: " +
                "`source` (the default) is the *authoring* form and the *only* form which may be " +
                "edited and passed back into `ase_task_save`; " +
                "`render` is the *rendering-prepared* form, which is for *display only* and " +
                "MUST NOT be persisted; " +
                "`both` returns the source form enclosed in `<task-plan-source>` delimiter lines, " +
                "followed by the render form enclosed in `<task-plan-render>` delimiter lines. " +
                "If `tag` is `true`, the entity tag of the loaded plan is additionally returned in a trailing " +
                "`<task-plan-tag>` delimiter line, to be passed as `base` into `ase_task_save` for a conditional save. " +
                "The `attachments` argument selects the returned form of the attachment payloads: `elided` (the default) " +
                "replaces the non-empty `Data` of each attachment block with a `[elided: <n> lines]` marker " +
                "(keeping all other keys), which `ase_task_save` restores from the stored plan as long as the " +
                "block is kept (removing the block removes the attachment, replacing the marker replaces the " +
                "payload); `full` returns the complete payloads, needed only to process them as a whole " +
                "(a single payload is better fetched via `ase_task_attachment`).",
            inputSchema: {
                id: z.string()
                    .describe("task identifier (allowed characters: A-Z, a-z, 0-9, '#', '_', '-')"),
                variant: z.enum([ "source", "render", "both" ]).optional()
                    .describe("returned form of the plan: `source` (authoring form, the default), " +
                        "`render` (rendering-prepared form, display only), or `both` " +
                        "(both forms, each enclosed in its delimiter lines)"),
                attachments: z.enum([ "elided", "full" ]).optional()
                    .describe("returned form of the attachment payloads: `elided` (each replaced " +
                        "by a marker restored on saving, the default) or `full` (complete)"),
                tag: z.boolean().optional()
                    .describe("if true, additionally return the entity tag of the plan in a trailing " +
                        "`<task-plan-tag>` delimiter line (default: false)")
            }
        }, async (args) => {
            try {
                const loaded = await Task.source(this.log, args.id, args.attachments !== "full")

                /*  explicitly report a missing task, as an empty result looks like a tool failure  */
                if (loaded === null)
                    return mcpText(`WARNING: no task plan "${args.id}" exists yet (a new task)`)
                const source  = loaded.text
                const variant = args.variant ?? "source"
                let text = source
                if (variant === "render")
                    text = Markdown.prepare(source)
                else if (variant === "both")
                    text =
                        `<task-plan-source>\n${source}\n</task-plan-source>\n\n` +
                        `<task-plan-render>\n${Markdown.prepare(source)}\n</task-plan-render>\n`
                if (args.tag === true)
                    text += `\n<task-plan-tag>${loaded.tag}</task-plan-tag>\n`
                return mcpText(text)
            }
            catch (err: unknown) {
                return mcpError(err)
            }
        })
    }

    /*  register the MCP tool saving a task plan  */
    private registerSaveTool (mcp: McpServer): void {
        /*  task save  */
        mcp.registerTool("ase_task_save", {
            title: "ASE task save",
            _meta: { "anthropic/alwaysLoad": true },
            description:
                "Persist a task as `text` under `id`. " +
                "The `text` MUST be the *authoring* form of the plan (as returned by the " +
                "`source` variant of `ase_task_load`) and hence MUST NOT carry any rendering " +
                "artifacts. Overwrites an existing task for the same `id` only with `base` (conditionally, " +
                "see below) or with `force` (unconditionally, for a deliberate overwrite only), and otherwise " +
                "fails if a task with this `id` already exists (as it does with `create` being `true`, to be used " +
                "on the first save of a task whose `id` was allocated via `ase_task_newid`), where the error of a save " +
                "without `create` carries the current entity tag of the stored plan, to be passed as `base`. " +
                "Returns a status `text` by default, or, if `render` is `true`, the " +
                "*rendering-prepared* form of the just-saved plan (with its attachment payloads elided), " +
                "for display purposes only. " +
                "An attachment block whose `Data` is an `[elided: <n> lines]` marker (see `ase_task_load`) gets " +
                "its payload restored from the stored attachment of the same `Type` (preferably also of the same " +
                "`Created`); the save fails if there is no such stored attachment. " +
                "The `Status:` frontmatter key of `text` is checked against the configured task " +
                "lifecycle model: if a changed status is not a state of the model or not reachable " +
                "from the previously saved status via one or more transitions of the state machine, " +
                "the save fails with an error. Prefer the `ase_task_status` MCP tool for pure status changes. " +
                "If `id` does not conform to the task id scheme of the project, the returned `text` " +
                "additionally carries a trailing `NOTICE: <info>` line. " +
                "With `base` (the entity tag of the plan the `text` is based on, as returned by `ase_task_load` " +
                "with `tag` or by a previous `ase_task_save` with `tag` or `base`), the save is conditional: if the " +
                "plan was changed meanwhile (by anybody else), the change of `text` is merged part-wise (per frontmatter " +
                "key, per `##` body section, and per attachment) into the changed plan, reported by a trailing " +
                "`NOTICE:` line, and the save fails with an error only if both changed the same part. " +
                "If `tag` is `true` or `base` is given, the returned `text` additionally carries the entity tag " +
                "of the just-saved plan (after a merge, the one of `text`, so a next save is merged again) in a " +
                "trailing `<task-plan-tag>` delimiter line, to be passed as `base` into the next `ase_task_save` of this plan.",
            inputSchema: {
                id: z.string()
                    .describe("task identifier (allowed characters: A-Z, a-z, 0-9, '#', '_', '-')"),
                text: z.string()
                    .describe("text content of the task, in its authoring form"),
                create: z.boolean().optional()
                    .describe("if true, fail if a task with `id` already exists instead of overwriting it (default: false)"),
                render: z.boolean().optional()
                    .describe("if true, return the rendering-prepared form of the just-saved " +
                        "plan instead of a status message (default: false)"),
                base: z.string().optional()
                    .describe("entity tag of the plan the text is based on, for a conditional save, " +
                        "merging a change made meanwhile (default: no overwrite of an existing task, unless `force`)"),
                force: z.boolean().optional()
                    .describe("if true and without `base`, unconditionally overwrite an existing task, " +
                        "discarding any change made meanwhile (default: false)"),
                tag: z.boolean().optional()
                    .describe("if true, additionally return the entity tag of the just-saved plan in a trailing " +
                        "`<task-plan-tag>` delimiter line (default: false, but implied by `base`)")
            }
        }, async (args) => {
            try {
                /*  without "base" and "force", never overwrite an existing task (i.e., save create-only)  */
                const base     = args.base !== undefined && args.base !== "" ? args.base : undefined
                const implicit = base === undefined && args.create !== true && args.force !== true
                let result: TaskSaved
                try {
                    result = await Task.save(this.log, args.id, args.text, base, args.create === true || implicit)
                }
                catch (err: unknown) {
                    if (base !== undefined && err instanceof Core.Problem && err.status === 412)
                        throw new Error(`task: task "${args.id}" was changed meanwhile and cannot be merged -- ` +
                            `save refused (reload the task and apply the change again): ${err.message}`, { cause: err })
                    if (implicit && err instanceof Error && err.cause instanceof Core.Problem && err.cause.status === 412) {
                        /*  report the current entity tag, so a single follow-up save succeeds without a re-load  */
                        const stored = await Task.source(this.log, args.id).catch(() => null)
                        if (stored === null)
                            throw new Error(`task: task "${args.id}" already exists -- save refused ` +
                                "(pass its entity tag as `base` for a conditional save, or `force` for an overwrite)", { cause: err })
                        throw new Error(`task: task "${args.id}" already exists -- save refused -- ` +
                            `current entity tag: ${stored.tag} (pass it as \`base\` for a conditional save ` +
                            "of your text over the stored plan, or `force` for an overwrite)", { cause: err })
                    }
                    throw err
                }

                /*  return the rendering-prepared content on demand, so a caller
                    displaying the just-saved plan does not have to re-load it
                    (rendered from the stored plan, as the store normalizes the text,
                    but only if it still is the just-saved one, i.e., carries its
                    entity tag, else from the plan as sent), and the entity tag of the
                    just-saved plan for a conditional save (as reported by the save
                    itself, so it never is the one of a subsequent save of somebody else)  */
                const render = args.render ?? false
                const stored = render ? await Task.source(this.log, args.id, true) : null
                const source = stored !== null && (stored.tag === result.tag || result.merged) ? stored.text : result.text
                const text   = (render ? Markdown.prepare(source) : `OK: saved task "${args.id}"`) +
                    notice(result.warning) +
                    notice(result.merged ? `task "${args.id}" was changed meanwhile and the change was merged ` +
                        "into it -- load it again before showing or further changing its content" : "") +
                    (base !== undefined || args.tag === true ? `\n<task-plan-tag>${result.tag}</task-plan-tag>\n` : "")
                return mcpText(text)
            }
            catch (err: unknown) {
                return mcpError(err)
            }
        })
    }

    /*  register the MCP tools reading an attachment of, deleting, and renaming a task plan  */
    private registerPlanTools (mcp: McpServer): void {
        /*  task attachment  */
        mcp.registerTool("ase_task_attachment", {
            title: "ASE task attachment",
            description:
                "Get the complete payload (`Data`) of an attachment of the persisted task `id` by its exact `type` " +
                "(the value of its `Type` key, like `text/x-diff; charset=utf-8; kind=\"draft\"`), " +
                "e.g. to process a payload elided by `ase_task_load`. If several attachments carry this `Type`, " +
                "the last one is taken. Returns the payload verbatim as `text`, or a `WARNING:` " +
                "if no such attachment with an embedded payload exists.",
            inputSchema: {
                id: z.string()
                    .describe("task identifier (allowed characters: A-Z, a-z, 0-9, '#', '_', '-')"),
                type: z.string()
                    .describe("exact value of the `Type` key of the attachment")
            }
        }, async (args) => {
            try {
                const attachment = (await Task.attachments(this.log, args.id)).findLast((a) => a.type === args.type)
                const text = attachment?.data !== undefined ? attachment.data :
                    `WARNING: no attachment of type "${args.type}" with an embedded payload in task "${args.id}"`
                return mcpText(text)
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
                    .describe("task identifier (allowed characters: A-Z, a-z, 0-9, '#', '_', '-')")
            }
        }, async (args) => {
            try {
                const removed = await Task.delete(this.log, args.id)
                const msg     = removed ?
                    `OK: removed task "${args.id}"` :
                    `WARNING: no task "${args.id}" to remove`
                return mcpText(msg)
            }
            catch (err: unknown) {
                return mcpError(err)
            }
        })

        /*  task rename  */
        mcp.registerTool("ase_task_rename", {
            title: "ASE task rename",
            description:
                "Rename a previously persisted task from `old` to `new`, " +
                "rewriting its embedded `Id:` frontmatter key, the `After:` references of all " +
                "other tasks, and, for an explicit epic (`Group:` equals `Id:`), the `Group:` " +
                "references of itself and its member tasks. " +
                "Returns a status `text` indicating whether the rename succeeded. " +
                "Fails with an error if the target id already exists.",
            inputSchema: {
                old: z.string()
                    .describe("old task identifier (allowed characters: A-Z, a-z, 0-9, '#', '_', '-')"),
                new: z.string()
                    .describe("new task identifier (allowed characters: A-Z, a-z, 0-9, '#', '_', '-')")
            }
        }, async (args) => {
            try {
                const result = await Task.rename(this.log, args.old, args.new)
                const msg    = result !== null ?
                    `OK: renamed task "${args.old}" to "${args.new}" ` +
                    `(updated references in ${result.references} other task(s))` + notice(result.warning) :
                    `WARNING: no task "${args.old}" to rename`
                return mcpText(msg)
            }
            catch (err: unknown) {
                return mcpError(err)
            }
        })
    }

    /*  register the MCP tools getting/setting the status of and requesting the processing of a task plan  */
    private registerStatusTools (mcp: McpServer): void {
        /*  task status get/set  */
        mcp.registerTool("ase_task_status", {
            title: "ASE task status get/set",
            description:
                "Get or set the lifecycle `status` of the task plan `id` (its `Status:` frontmatter key). " +
                "If `status` is provided, it is set (case-insensitively, validated against the states of " +
                "the configured task lifecycle model, leaving the `Modified:` key alone) and a status `text` " +
                "is returned. Otherwise the current status is returned " +
                "as `text`, defaulting to the initial state of the model. " +
                "Fails with an error if no task exists, the status is unknown, or the status is not " +
                "reachable from the current one via one or more transitions of the state machine of the model.",
            inputSchema: {
                id: z.string()
                    .describe("task identifier (allowed characters: A-Z, a-z, 0-9, '#', '_', '-')"),
                status: z.string().optional()
                    .describe("lifecycle status to set (a state of the configured task lifecycle model, " +
                        "case-insensitive); if omitted, the current status is returned")
            }
        }, async (args) => {
            try {
                if (args.status !== undefined) {
                    const result = await Task.setStatus(this.log, args.id, args.status)
                    const text   = `OK: set status of task "${args.id}" from "${result.from}" to "${result.to}"`
                    return mcpText(text)
                }
                const text = await Task.getStatus(this.log, args.id)
                return mcpText(text)
            }
            catch (err: unknown) {
                return mcpError(err)
            }
        })

        /*  task request  */
        mcp.registerTool("ase_task_request", {
            title: "ASE task request",
            description:
                "Request the processing of the persisted task `id` by a `prompt`, attached as a request of the " +
                "`name` (`edit` for the edit requests of the `ase agent editor`, any other name for the requests " +
                "of a request agent of a definition), replacing its failed requests of the name. " +
                "Returns a status `text`. Fails with an error if the task does not exist or is finished, " +
                "while a request of the name is being processed, or if the `prompt` of an `edit` request is empty.",
            inputSchema: {
                id: z.string()
                    .describe("task identifier (allowed characters: A-Z, a-z, 0-9, '#', '_', '-')"),
                name: z.string()
                    .describe("request name (a lower-case word of letters, digits, and dashes)"),
                prompt: z.string().optional()
                    .describe("prompt of the request (may be empty for any other name than `edit`, " +
                        "for the request agents ignoring the prompts of their requests)")
            }
        }, async (args) => {
            try {
                await requestsOf(args.name).request(this.log, args.id, args.prompt ?? "")
                return mcpText(`OK: requested "${args.name}" of task "${args.id}"`)
            }
            catch (err: unknown) {
                return mcpError(err)
            }
        })
    }

    /*  register the MCP tool assigning a task plan (with AI usage accounting)  */
    private registerAssignTool (mcp: McpServer): void {
        /*  task assignment (with AI usage accounting)  */
        mcp.registerTool("ase_task_assign", {
            title: "ASE task assignment",
            description:
                "Assign the task plan `id` to `assignee` (its `Assignee:` frontmatter key, leaving the " +
                "`Modified:` key alone) on behalf of the agent tool `session`. The assignee `me` (or the " +
                "current user id) assigns it to oneself and opens (or attaches the session to) the AI usage " +
                "window of the task, which accounts the AI request time, tokens, and costs of all turns of the " +
                "session (received via OpenTelemetry), plus the human time and costs. Any other assignee, or " +
                "`none` (removing the `Assignee:` key), gives the task back: it closes the usage window and, " +
                "after a grace period of 10 seconds for late telemetry, atomically adds the accumulated usage " +
                "to the `time.{ai,hr,real}` (minutes), `token.{cread,cwrite,input,output}`, and `cost.{ai,hr}` " +
                "(USD) amounts of the usage attachment (`Type: application/yaml; kind=\"usage\"`) of the task. " +
                "Returns a status `text` with the previous and new assignee, the window action " +
                "(`opened`, `attached`, `closed`, or `none`), and the booked usage, plus a trailing " +
                "`NOTICE: <info>` line if telemetry seems not to be activated.",
            inputSchema: {
                id: z.string()
                    .describe("task identifier (allowed characters: A-Z, a-z, 0-9, '#', '_', '-')"),
                assignee: z.string()
                    .describe("assignee: `me` (oneself), `none` (unassign), or any other name"),
                session: z.string()
                    .describe("session identifier of the agent tool (allowed characters: A-Z, a-z, 0-9, '_', '-')"),
                tool: z.enum([ "claude", "codex", "copilot" ]).optional()
                    .describe("agent tool of the session, for checking its telemetry activation (default: none)")
            }
        }, async (args) => {
            try {
                if (this.usage === undefined)
                    throw new Error("task: assignment requires the usage tracker of the ASE service")
                const result = await this.usage.assign(args.id, args.assignee, args.session)
                let warning  = result.notice
                if (warning === "" && args.tool !== undefined && (result.action === "opened" || result.action === "attached")) {
                    const { SetupSettings } = await import("./ase-setup-settings.js")
                    if (!await new SetupSettings(this.log).telemetryActive(args.tool))
                        warning = `telemetry is not activated for tool "${args.tool}" ` +
                            `(run "ase setup telemetry activate --tool ${args.tool}"), so no usage is accounted`
                }
                const text = `OK: assigned task "${args.id}" from "${result.from || "(nobody)"}" ` +
                    `to "${result.to || "(nobody)"}", usage window: ${result.action}` +
                    (result.action === "closed" ? `, booked: ${usageText(result.booked)}` : "") +
                    notice(warning)
                return mcpText(text)
            }
            catch (err: unknown) {
                return mcpError(err)
            }
        })
    }

    /*  register the MCP tools generating task ids and getting/setting the active task id  */
    private registerIdTools (mcp: McpServer): void {
        /*  task id generation  */
        mcp.registerTool("ase_task_newid", {
            title: "ASE task id generation",
            description:
                "Determine the next free task id according to the task id scheme of the project " +
                "(the `project.task.idscheme` configuration, resp. the scheme registered in the task store), " +
                "by searching all existing task ids. The scheme is either `slug[:<words>]` (the first " +
                "`<words>` (default: 2) words of `title`, lower-cased and joined with `-`), " +
                "`seq[:<template>]` (the highest sequence number of all existing and ever removed ids plus one, rendered " +
                "through the sprintf-style `<template>` like `FOO-%03d`, `#%d`, or `%d` (the default)), " +
                "`flex[:<template>]` (like `seq`, but with the slug of `title` like for `slug:2` via `%s` " +
                "before or after the number, like `%d-%s` (the default) or `%s-%d`), or " +
                "`any` (the `proposal`, else derived from `title` like for `slug:2`). A slug or proposed id " +
                "which is already taken gets a numeric suffix `-2`, `-3`, etc. " +
                "Returns the `scheme`, the new `id`, and the regular expression `match` of all ids " +
                "conforming to the scheme (for `seq` and `flex` capturing the sequence number, for `slug` accepting " +
                "the numeric suffix). For schemes `seq` and `flex` the id is reserved (never handed out again), " +
                "for the other schemes it is not, so for allocating several ids at once pass the " +
                "already allocated ones as `taken`, and on the first save of the new task pass " +
                "`create: true` to `ase_task_save` to detect a concurrently created task with the same id.",
            inputSchema: {
                title: z.string().optional()
                    .describe("title of the new task (required for schemes `slug` and `flex`, ignored for scheme `seq`)"),
                proposal: z.string().optional()
                    .describe("proposed task id (used for scheme `any` only)"),
                taken: z.array(z.string()).optional()
                    .describe("task ids to consider as taken in addition to the existing ones (default: none)")
            },
            outputSchema: {
                scheme: z.string().describe("task id scheme of the project"),
                id:     z.string().describe("next free task id"),
                match:  z.string().describe("regular expression matching the ids conforming to the scheme")
            }
        }, async (args) => {
            try {
                const result = await Task.newId(this.log, args.title ?? "", args.proposal ?? "", args.taken ?? [])
                return {
                    structuredContent: result,
                    content:           [ { type: "text", text: JSON.stringify(result) } ]
                }
            }
            catch (err: unknown) {
                return mcpError(err)
            }
        })

        /*  task id get/set  */
        mcp.registerTool("ase_task_id", {
            title: "ASE task id get/set",
            _meta: { "anthropic/alwaysLoad": true },
            description:
                "Get or set the active ASE task `id` for a given `session`. " +
                "If `id` is provided, it sets the task id in the given `session`, " +
                "otherwise it returns the current task `id` of the `session`. " +
                "If a set `id` does not conform to the task id scheme of the project, the returned `text` " +
                "additionally carries a trailing `NOTICE: <info>` line.",
            inputSchema: {
                id: z.string().optional()
                    .describe("task identifier to set (allowed characters: A-Z, a-z, 0-9, '#', '_', '-'); " +
                        "if omitted, the current task id is returned"),
                session: z.string()
                    .describe("session identifier (allowed characters: A-Z, a-z, 0-9, '_', '-')")
            }
        }, async (args) => {
            try {
                if (args.id !== undefined) {
                    const warning = await Task.setId(this.log, args.session, args.id)
                    this.usage?.activate(args.session)
                    const msg = `OK: set active task id to "${args.id}" ` +
                        `for session "${args.session}"` + notice(warning)
                    return mcpText(msg)
                }
                const text = Task.getId(this.log, args.session)
                return mcpText(text)
            }
            catch (err: unknown) {
                return mcpError(err)
            }
        })
    }
}

