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
import { isScalar }                                       from "yaml"
import { z }                                              from "zod"
import { LRUCache }                                       from "lru-cache"
import type { McpServer }                                 from "@modelcontextprotocol/sdk/server/mcp.js"

import type Log                                           from "./ase-lib-log.js"
import { Config }                                         from "./ase-config-core.js"
import { configSchema }                                   from "./ase-config-schema.js"
import { parseScope, userStateDir, projectIdOf }          from "./ase-config-scope.js"
import { Markdown }                                       from "./ase-service-markdown.js"
import { readStdin, writeStdout }                         from "./ase-lib-stdio.js"
import TaskStoreCommand, { storeSchema }                  from "./ase-task-store-server-cli.js"
import { urlHost }                                        from "./ase-task-store-server-bind.js"
import * as API                                           from "./ase-task-store-plugin-api.js"
import * as Core                                          from "./ase-task-store-core.js"
import * as Delegate                                      from "./ase-task-store-plugin-delegate.js"
import * as TaskFormat                                    from "./ase-task-format.js"
import type { TaskStoreClient }                           from "./ase-task-store-client.js"
import { LocalTaskStoreClient, RemoteTaskStoreClient }    from "./ase-task-store-client.js"

/*  a configuration value together with the label of its supplying scope  */
type ScopedValue = { value: string, scope: string }

/*  the task store specification of the current project  */
type TaskStoreSpec = {
    projectId: string, projectIdExplicit: boolean, store: ScopedValue, token: ScopedValue,
    lifecycle: TaskFormat.TaskLifecycle, idscheme: string
}

/*  reusable functionality: the task plans of the current project,
    forwarded to the task store selected by the "project.task.store"
    configuration URL  */
export class Task {
    /*  validate the task id to keep it safe as a filename component  */
    static validateId (id: string): void {
        if (typeof id !== "string" || id.length === 0)
            throw new Error("task: id must be a non-empty string")
        if (!TaskFormat.TASK_ID_RE.test(id))
            throw new Error("task: id must match [A-Za-z0-9#][A-Za-z0-9#_-]*")
    }

    /*  validate the session id to keep it safe as a config scope term  */
    static validateSession (session: string): void {
        if (typeof session !== "string" || session.length === 0)
            throw new Error("task: session must be a non-empty string")
        if (!TaskFormat.ID_RE.test(session))
            throw new Error("task: session must match [A-Za-z0-9_-]+")
    }

    /*  cached project root determination (TTL-bounded, as the ASE
        service is long-running and the Git context can change)  */
    private static projectRootCache = new LRUCache<string, string>({ max: 4, ttl: 10 * 1000 })

    /*  determine the project root (Git top-level if inside a Git
        working tree, otherwise the current working directory);
        cached, as each determination spawns a Git subprocess  */
    static projectRoot (): string {
        const cwd    = process.cwd()
        const cached = Task.projectRootCache.get(cwd)
        if (cached !== undefined)
            return cached
        let root = cwd
        try {
            const result = execaSync("git", [ "rev-parse", "--show-toplevel" ], { stderr: "ignore" })
            const top = result.stdout.trim()
            if (top !== "")
                root = top
        }
        catch {
            /*  not inside a Git working tree  */
        }
        Task.projectRootCache.set(cwd, root)
        return root
    }

    /*  derive the fallback project id from a project root
        (shared by task store, hook, and service)  */
    static projectIdOf (root: string): string {
        return projectIdOf(root)
    }

    /*  cached task store specification (TTL-bounded, mirroring the project
        root cache, as each read parses the whole layered YAML config chain)  */
    private static specCache = new LRUCache<string, TaskStoreSpec>({ max: 4, ttl: 2 * 1000 })

    /*  the configuration files the task store specification is read from
        (for read-only consumers watching them), and the invalidation of the
        cached specification after a change of them  */
    static configFiles (log: Log): string[] {
        const cfg = new Config("config", configSchema, log)
        cfg.read()
        return cfg.files()
    }
    static invalidate (): void {
        Task.specCache.clear()
    }

    /*  read the "project.id" of the project (defaulting to the sanitized
        basename of the project root), the "project.task.store" URL (defaulting to
        "ase:./.ase/task") and "project.task.token" (both with their
        supplying scope), the "project.task.lifecycle" model (defaulting
        to "solo"), and the "project.task.idscheme" scheme (defaulting to "slug")  */
    private static spec (log: Log): TaskStoreSpec {
        const root   = Task.projectRoot()
        const cached = Task.specCache.get(root)
        if (cached !== undefined)
            return cached
        const cfg    = new Config("config", configSchema, log)
        cfg.read()
        const read = (key: string): string => {
            const val = cfg.get(key)
            if (val === undefined)
                return ""
            return String(isScalar(val) ? val.value : val)
        }
        const scoped = (key: string): ScopedValue => {
            const entry = cfg.getScoped(key)
            if (entry === undefined)
                return { value: "", scope: "" }
            return {
                value: String(isScalar(entry.value) ? entry.value.value : entry.value),
                scope: Config.scopeLabel(entry.scope)
            }
        }
        const explicit  = read("project.id")
        if (explicit !== "" && !TaskFormat.ID_RE.test(explicit))
            throw new Error(`task: configured "project.id" "${explicit}" must match [A-Za-z0-9_-]+`)

        /*  sanitize a basename-derived project id, as it only keys the local
            solo-mode store (a remote store requires an explicit one anyway)  */
        const projectId = explicit || Task.projectIdOf(root)
        const store    = scoped("project.task.store")
        store.value   ||= "ase:./.ase/task"
        const token     = scoped("project.task.token")
        const name      = read("project.task.lifecycle") || "solo"
        const lifecycle = TaskFormat.taskLifecycles[name]
        if (lifecycle === undefined)
            throw new Error(`task: configured "lifecycle" "${name}" must be one of: ` +
                Object.keys(TaskFormat.taskLifecycles).join(", "))
        const idscheme  = read("project.task.idscheme") || "slug"
        const error     = TaskFormat.checkIdScheme(idscheme)
        if (error !== "")
            throw new Error(`task: configured "project.task.idscheme": ${error}`)
        const result = { projectId, projectIdExplicit: explicit !== "", store, token, lifecycle, idscheme }
        Task.specCache.set(root, result)
        return result
    }

    /*  resolve the effective task lifecycle model: the configured one for a
        local task store, the one of the registered project for a remote one  */
    static lifecycle (log: Log): Promise<TaskFormat.TaskLifecycle> {
        return Task.with(log, (client) => Promise.resolve(client.lifecycle))
    }

    /*  set the lifecycle model of the project in the task store (for a local
        task store via "project.task.lifecycle" on scope "project"); returns
        the name of the previous lifecycle model  */
    static async setLifecycle (log: Log, name: string): Promise<string> {
        if (TaskFormat.taskLifecycles[name] === undefined)
            throw new Error(`task: invalid lifecycle model "${name}" ` +
                `(expected one of: ${Object.keys(TaskFormat.taskLifecycles).join(", ")})`)
        return Task.with(log, async (client) => {
            const from = client.lifecycle.name

            /*  invalidate the cached specification, as a local
                task store changed its configuration in any case  */
            try {
                await client.setLifecycle(name)
            }
            finally {
                Task.invalidate()
            }
            return from
        })
    }

    /*  resolve the effective task id scheme: the configured one for a
        local task store, the one of the registered project for a remote one  */
    static idScheme (log: Log): Promise<string> {
        return Task.with(log, (client) => Promise.resolve(client.idscheme))
    }

    /*  set the task id scheme of the project in the task store (for a local
        task store via "project.task.idscheme" on scope "project"); returns the
        previous task id scheme  */
    static async setIdScheme (log: Log, spec: string): Promise<string> {
        const error = TaskFormat.checkIdScheme(spec)
        if (error !== "")
            throw new Error(`task: ${error}`)
        return Task.with(log, async (client) => {
            const from = client.idscheme
            try {
                await client.setIdScheme(spec)
            }
            finally {
                Task.invalidate()
            }
            return from
        })
    }

    /*  allocate the next free task id according to the effective task id scheme,
        derived from a title (scheme "slug") or a proposed id (scheme "any"),
        by searching all existing task ids plus the additionally taken ones and,
        for scheme "seq", the high-water mark of the removed and allocated ids
        (reserving the allocated one); returns the scheme, the id, and the
        regular expression matching the ids conforming to the scheme  */
    static async newId (log: Log, title = "", proposal = "", taken: string[] = []): Promise<{ scheme: string, id: string, match: string }> {
        return Task.with(log, async (client) => {
            try {
                const { scheme, id } = await client.newId(title, proposal, taken)
                return { scheme, id, match: TaskFormat.parseIdScheme(scheme).match }
            }
            catch (err) {
                if (err instanceof Core.Problem && err.status === 422)
                    throw new Error(`task: ${err.message}`, { cause: err })
                throw err
            }
        })
    }

    /*  determine whether a WHATWG URL hostname denotes the loopback interface  */
    private static isLoopback (hostname: string): boolean {
        return /^(?:127(?:\.\d{1,3}){3}|\[::1\]|localhost)$/i.test(hostname)
    }

    /*  determine whether the task store is a remote one (otherwise it
        is operated in-process and follows the local configuration)  */
    static isRemote (log: Log): boolean {
        return /^ases?:\/\//.test(Task.spec(log).store.value)
    }

    /*  resolve the bearer token of a remote task store: the token embedded
        in the URL, else $ASE_TASK_STORE_TOKEN, else "project.task.token",
        else the token of the locally started task store server (only if the
        URL addresses it); a token potentially committed or redirected is warned about  */
    private static token (log: Log, spec: TaskStoreSpec, embedded: string | undefined, url: URL): string {
        const repoScoped = spec.store.scope === "project" || spec.store.scope.startsWith("task:")
        if (embedded !== undefined) {
            if (repoScoped)
                log.write("warning", `task: token embedded in "project.task.store" URL on scope "${spec.store.scope}" ` +
                    "might be committed -- use $ASE_TASK_STORE_TOKEN or \"project.task.token\" on scope \"user\" instead")
            return embedded
        }

        /*  warn about a user token being sent to a non-loopback host selected on
            a repository-supplied scope, as a cloned repository could redirect it this way  */
        const redirected = () => {
            if (repoScoped && !Task.isLoopback(url.hostname))
                log.write("warning", `task: sending token to non-loopback host "${url.host}" selected by ` +
                    `"project.task.store" on scope "${spec.store.scope}" -- verify you trust this host` +
                    (url.protocol === "ase:" ? " (token is transmitted in plaintext)" : ""))
        }
        const env = process.env.ASE_TASK_STORE_TOKEN
        if (env !== undefined && env !== "") {
            redirected()
            return env
        }
        if (spec.token.value !== "") {
            if (spec.token.scope !== "user")
                log.write("warning", `task: "project.task.token" found on scope "${spec.token.scope}" ` +
                    "-- configure it on scope \"user\" only")
            redirected()
            return spec.token.value
        }

        /*  fall back to the token of the locally started task store server,
            but only if the URL addresses exactly this server  */
        const cfg = new Config("store", storeSchema, log, parseScope("user"))
        cfg.read()
        const scalar = (key: string): string => {
            const val = cfg.get(key)
            return val === undefined ? "" : String(isScalar(val) ? val.value : val)
        }
        const tok      = scalar("token")
        const address  = scalar("address") || "127.0.0.1"
        const wildcard = address === "0.0.0.0" || address === "::"
        const host     = urlHost(address).toLowerCase()
        const loopback = Task.isLoopback(url.hostname)
        if (tok !== "" && scalar("port") === url.port
            && (url.hostname.toLowerCase() === host || (loopback && (wildcard || Task.isLoopback(host)))))
            return tok
        throw new Error(`task: no token for task store "${spec.store.value}" ` +
            "(set $ASE_TASK_STORE_TOKEN, \"project.task.token\" on scope \"user\", or \"/<token>\" in the URL)")
    }

    /*  warn about task plans being sent to a GitHub/Gitea repository resp. GitLab project selected on a
        repository-supplied scope, once per project root and repository only (persisted across
        processes), so the warning re-appears only if the repository changes  */
    private static warnRepository (log: Log, plugin: string, repo: string, scope: string): void {
        const file = path.join(userStateDir(), `task-${plugin}.json`)
        const root = Task.projectRoot()
        let seen: Record<string, string> = {}
        try {
            const data: unknown = JSON.parse(fs.readFileSync(file, "utf8"))
            if (typeof data === "object" && data !== null && !Array.isArray(data))
                seen = data as Record<string, string>
        }
        catch {
            /*  no (valid) state yet  */
        }
        if (seen[root] === repo)
            return
        log.write("warning", `task: sending task plans to ${plugin === "gitlab" ? "GitLab project" :
            plugin === "gitea" ? "Gitea repository" : "GitHub repository"} ` +
            `"${repo}" selected by ` +
            `"project.task.store" on scope "${scope}" -- verify you trust this repository ` +
            "(reported once per repository only)")
        seen[root] = repo
        try {
            fs.mkdirSync(path.dirname(file), { recursive: true })
            fs.writeFileSync(file, JSON.stringify(seen, null, 4) + "\n", "utf8")
        }
        catch {
            /*  best-effort only (the warning then repeats)  */
        }
    }

    /*  create the (unopened) client of the configured task store: the
        URL "ase://<addr>:<port>[/<token>]" selects a remote task store
        server via HTTP, "ases://<addr>:<port>[/<token>][?insecure]" via
        HTTPS (optionally without certificate verification),
        "ase:<path>" the built-in storage plugin in-process on <path>
        (resolved relative to the project root), "github:<owner>/<repo>" resp.
        "github+http[s]://<host>/<owner>/<repo>" the built-in GitHub storage plugin
        in-process on the repository (of GitHub resp. the given instance),
        "gitlab:[//<host>/]<namespace>/<project>" resp. "gitlab+http[s]://<host>/<namespace>/<project>"
        the built-in GitLab storage plugin in-process on the project (of the default resp. given
        instance), and
        "gitea+http[s]://<host>/<owner>/<repo>" the built-in Gitea storage plugin
        in-process on the repository of the given instance  */
    private static client (log: Log): TaskStoreClient {
        const spec = Task.spec(log)
        const { projectId, store, lifecycle, idscheme } = spec
        const unsupported = () => new Error(`task: unsupported "project.task.store" URL "${store.value}" ` +
            "(expected: \"ase:<path>\", \"ase://<addr>:<port>[/<token>]\", " +
            "\"ases://<addr>:<port>[/<token>][?insecure]\", \"github:<owner>/<repo>\", " +
            "\"github+http[s]://<host>/<owner>/<repo>\", " +
            "\"gitlab:[//<host>/]<namespace>/<project>\", \"gitlab+http[s]://<host>/<namespace>/<project>\", " +
            "or \"gitea+http[s]://<host>/<owner>/<repo>\")")
        let client: TaskStoreClient
        let m: RegExpExecArray | null
        if ((m = /^(ases?):\/\//.exec(store.value)) !== null) {
            /*  parse via WHATWG URL, as it supports bracketed IPv6 addresses (e.g. "[::1]")
                and retains the brackets in "hostname" for direct reuse in the HTTP URL  */
            const secure = m[1] === "ases"
            let url: URL
            try {
                url = new URL(store.value)
            }
            catch (_err: unknown) {
                throw unsupported()
            }
            if (url.hostname === "" || url.port === "" || url.username !== "" || url.password !== ""
                || url.hash !== "" || (url.search !== "" && !(secure && url.search === "?insecure"))
                || (m = /^(?:\/([^/]+))?$/.exec(url.pathname)) === null)
                throw unsupported()
            const embedded = m[1] !== undefined ? decodeURIComponent(m[1]) : undefined

            /*  require an explicit project id, as a basename-derived one
                likely collides with unrelated projects on a shared server  */
            if (!spec.projectIdExplicit)
                throw new Error(`task: remote task store "${url.protocol}//${url.host}" requires an explicit "project.id" ` +
                    `(set it via "ase config --scope project set project.id ${projectId}")`)
            client = new RemoteTaskStoreClient(projectId, lifecycle, idscheme, log,
                `${secure ? "https" : "http"}://${url.hostname}:${url.port}`,
                Task.token(log, spec, embedded, url), url.search === "?insecure")
        }
        else if ((m = /^ase:(.+)$/.exec(store.value)) !== null) {
            const root    = Task.projectRoot()
            const basedir = path.resolve(root, m[1])

            /*  confine a base directory selected by a repository-supplied scope
                ("project" or "task:<id>") to the project root (also through
                symlinks), as a cloned repository could otherwise direct task
                writes anywhere  */
            if (store.scope === "project" || store.scope.startsWith("task:")) {
                let existing = basedir
                while (!fs.existsSync(existing) && path.dirname(existing) !== existing)
                    existing = path.dirname(existing)
                const real = path.join(fs.realpathSync(existing), path.relative(existing, basedir))
                const rel  = path.relative(fs.realpathSync(root), real)
                if (rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel))
                    throw new Error(`task: "project.task.store" "${store.value}" on scope "${store.scope}" ` +
                        "must not escape the project root (configure it on scope \"user\" instead)")
            }
            client = new LocalTaskStoreClient(projectId, lifecycle, idscheme, {
                plugin:  Delegate.BUILTIN_PLUGIN,
                options: { basedir, solo: true, lifecycle: lifecycle.name, idscheme },
                key:     basedir
            }, log)
        }
        else if ((m = /^(github):()([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)$/.exec(store.value)) !== null
            || (m = /^(github)\+(https?:\/\/[A-Za-z0-9.-]+(?::\d+)?)\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)$/.exec(store.value)) !== null
            || (m = /^(gitlab):(?:\/\/([A-Za-z0-9.-]+(?::\d+)?)\/)?([A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+)$/.exec(store.value)) !== null
            || (m = /^(gitlab)\+(https?:\/\/[A-Za-z0-9.-]+(?::\d+)?)\/([A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+)$/.exec(store.value)) !== null
            || (m = /^(gitea)\+(https?:\/\/[A-Za-z0-9.-]+(?::\d+)?)\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)$/.exec(store.value)) !== null) {
            /*  warn about task plans being sent to a repository selected on a repository-supplied
                scope, and use the token of "project.task.token", else $GITHUB_TOKEN resp. $GH_TOKEN
                (GitHub), $GITLAB_TOKEN (GitLab), or $GITEA_TOKEN (Gitea), and the given host (or
                the given base URL of the "+http[s]" forms), else $GITLAB_HOST (GitLab)  */
            const [ , plugin, host, repo ] = m
            if (store.scope === "project" || store.scope.startsWith("task:"))
                Task.warnRepository(log, plugin, host ? `${host}/${repo}` : repo, store.scope)
            if (spec.token.value !== "" && spec.token.scope !== "user")
                log.write("warning", `task: "project.task.token" found on scope "${spec.token.scope}" ` +
                    "-- configure it on scope \"user\" only")
            client = new LocalTaskStoreClient(projectId, lifecycle, idscheme, {
                plugin,
                options: {
                    repos: { [projectId]: repo },
                    ...(host ? { url: /^https?:\/\//.test(host) ? host : `https://${host}` } : {}),
                    ...(spec.token.value !== "" ? { token: spec.token.value } : {})
                },
                key: `${store.value}#${projectId}`
            }, log)
        }
        else
            throw unsupported()
        return client
    }

    /*  run an operation on the opened client of the configured task store  */
    private static async with<T> (log: Log, op: (client: TaskStoreClient) => Promise<T>): Promise<T> {
        const client = Task.client(log)
        try {
            await client.open()
            return await op(client)
        }
        finally {
            await client.close()
        }
    }

    /*  the textual form of a plan, or the minimal plan of a task id  */
    static format (plan: API.TaskPlan): string {
        return TaskFormat.formatTaskText(plan)
    }
    static minimal (id: string): API.TaskPlan {
        return { header: { Type: TaskFormat.TASK_TYPE, Id: id }, body: "", attachment: [] }
    }

    /*  load a task as text, normalized into the current Markdown
        frontmatter shape; returns empty string if no task exists  */
    static async load (log: Log, id: string): Promise<string> {
        Task.validateId(id)
        const plan = await Task.with(log, (client) => client.load(id))
        return plan === null ? "" : TaskFormat.formatTaskText(plan)
    }

    /*  load a task as text together with its entity tag (for a conditional
        save); returns null if no task exists  */
    static async source (log: Log, id: string): Promise<{ text: string, tag: string } | null> {
        Task.validateId(id)
        const plan = await Task.with(log, (client) => client.load(id))
        return plan === null ? null : { text: TaskFormat.formatTaskText(plan), tag: Core.taskTag(plan) }
    }

    /*  save a task as text under the given id; throws if its "Status:"
        frontmatter key is unknown to the task lifecycle model or not
        reachable from the previous status, on a conditional save (with
        an entity tag) a problem 412 if the task was changed in the meantime,
        and on a create-only save an error if the task already exists;
        returns a warning (else empty) if the id does not conform to the task id scheme  */
    static async save (log: Log, id: string, text: string, tag?: string, create = false): Promise<string> {
        if (typeof text !== "string")
            throw new Error("task: text must be a string")
        Task.validateId(id)
        try {
            return await Task.with(log, async (client) => {
                await client.save(id, TaskFormat.parseTaskText(id, text, client.lifecycle), tag, create)
                return TaskFormat.idWarning(client.idscheme, id)
            })
        }
        catch (err: unknown) {
            if (create && tag === undefined && err instanceof Core.Problem && err.status === 412)
                throw new Error(`task: task "${id}" already exists`, { cause: err })
            throw err
        }
    }

    /*  delete a task by id; returns true if a task existed  */
    static async delete (log: Log, id: string): Promise<boolean> {
        Task.validateId(id)
        return Task.with(log, (client) => client.delete(id))
    }

    /*  rename a task, rewriting its "Id:" frontmatter key; returns null if
        the source task does not exist, else a warning (else empty) if the new
        id does not conform to the task id scheme; throws if the target id
        already exists  */
    static async rename (log: Log, oldId: string, newId: string): Promise<string | null> {
        Task.validateId(oldId)
        Task.validateId(newId)
        try {
            return await Task.with(log, async (client) =>
                await client.patch(oldId, { id: newId }) === null ? null : TaskFormat.idWarning(client.idscheme, newId))
        }
        catch (err: unknown) {
            if (err instanceof Core.Problem && err.status === 409)
                throw new Error(`task: target id "${newId}" already exists`, { cause: err })
            throw err
        }
    }

    /*  flatten a task plan header into string values (joining the
        array-typed keys "After" and "Tags" with commas)  */
    private static flatHeader (header: API.TaskHeader): Map<string, string> {
        return new Map(Object.entries(header).map(([ key, val ]) =>
            [ key, Array.isArray(val) ? val.join(", ") : val ] as [ string, string ]))
    }

    /*  split a task plan into its flattened header keys and its Markdown
        body (without the attachments), for read-only consumers which must
        not parse plans themselves; returns null if no task exists  */
    static async parts (log: Log, id: string): Promise<{ keys: Map<string, string>, body: string } | null> {
        Task.validateId(id)
        const plan = await Task.with(log, (client) => client.load(id))
        return plan === null ? null : { keys: Task.flatHeader(plan.header), body: plan.body }
    }

    /*  list the attachments of a task plan, each with its type, description,
        creation and modification timestamps (if any), and either the referenced
        file (relative to a local task store) or the embedded data; returns an
        empty list if no task exists  */
    static async attachments (log: Log, id: string): Promise<{ type: string, desc: string, created?: string, modified?: string, file?: string, data?: string }[]> {
        Task.validateId(id)
        const plan = await Task.with(log, (client) => client.load(id))
        return (plan?.attachment ?? []).filter((a) => a.Type !== undefined).map((a) => ({
            type: a.Type,
            desc: a.Desc ?? "",
            ...(a.Created  !== undefined ? { created:  a.Created  } : {}),
            ...(a.Modified !== undefined ? { modified: a.Modified } : {}),
            ...(a.File !== undefined ? { file: a.File } : {}),
            ...(a.Data !== undefined ? { data: a.Data } : {})
        }))
    }

    /*  get the raw content of an attachment of a task plan (its embedded data or
        its referenced file), through the task store; returns null if missing  */
    static async attachmentContent (log: Log, id: string, index: number): Promise<{ type: string, content: Buffer } | null> {
        Task.validateId(id)
        return Task.with(log, (client) => client.content(id, index))
    }

    /*  add an attachment to a task plan, or on "append" extend the "Data" of its
        last attachment with the same "Type" (see "POST {task}/attachment");
        returns false if no task exists  */
    static async attach (log: Log, id: string, attachment: API.TaskAttachment, append = false): Promise<boolean> {
        Task.validateId(id)
        return Task.with(log, (client) => client.attach(id, attachment, append))
    }

    /*  subscribe to the change events of the task store: a remote one
        (reconnecting automatically) or an in-process one (whose storage plugin
        detects the external changes, e.g. by watching its directory or by polling),
        reporting each change of the connection state; returns a function to unsubscribe  */
    static subscribe (log: Log, onChange: () => void, onState?: (connected: boolean) => void): () => void {
        return Task.client(log).subscribe(onChange, onState)
    }

    /*  list all persisted tasks (see list) with their flattened header keys,
        plus the effective task lifecycle model, within a single task store access  */
    static async listHeaders (log: Log): Promise<{
        lifecycle: TaskFormat.TaskLifecycle,
        items:     { id: string, status: string, title: string, mtime: string, keys: Map<string, string> }[]
    }> {
        return Task.with(log, async (client) => {
            const items = (await client.list("header")).map((item) =>
                ({ ...item, keys: Task.flatHeader(item.header ?? {}) }))
            return { lifecycle: client.lifecycle, items }
        })
    }

    /*  get the lifecycle status of a task plan: the "Status:" frontmatter
        key of the plan, falling back to the initial state of the task
        lifecycle model; throws if no task exists  */
    static async getStatus (log: Log, id: string): Promise<string> {
        Task.validateId(id)
        return Task.with(log, async (client) => {
            const plan = await client.load(id)
            if (plan === null)
                throw new Error(`task: no task "${id}"`)
            return TaskFormat.taskStatus(plan.header, client.lifecycle)
        })
    }

    /*  set the lifecycle status of a task plan: the (case-insensitively
        given) status has to be a state of the task lifecycle model, while
        the "Modified:" frontmatter key is left alone, as it tracks body
        changes only; returns the previous and the new status; throws if no
        task exists, the status is unknown, or it is not reachable from the
        previous one in the state machine of the model  */
    static async setStatus (log: Log, id: string, status: string): Promise<{ from: string, to: string }> {
        Task.validateId(id)
        const to = status.trim().toUpperCase()
        return Task.with(log, async (client) => {
            const lifecycle = client.lifecycle
            if (!lifecycle.states.includes(to))
                throw new Error(`task: invalid state "${status}" ` +
                    `(expected one of: ${lifecycle.states.join(", ")})`)
            const result = await client.patch(id, { status: to })
            if (result === null)
                throw new Error(`task: no task "${id}"`)
            return { from: result.from ?? lifecycle.initial, to: result.status }
        })
    }

    /*  list all persisted tasks in lexicographic id order, each with the
        `status` and `title` of its plan and the `mtime` of its last
        modification formatted as "YYYY-MM-DD HH:MM"  */
    static async list (log: Log): Promise<{ id: string, status: string, title: string, mtime: string }[]> {
        return Task.with(log, (client) => client.list())
    }

    /*  list all persisted tasks (see list), plus the known states of the task lifecycle
        model and the effective state set of the "--include" and "--exclude" lifecycle
        state lists, all resolved within a single task store access  */
    static async listStates (log: Log, include: string, exclude: string): Promise<{
        items:  { id: string, status: string, title: string, mtime: string }[],
        known:  string[],
        states: string[]
    }> {
        return Task.with(log, async (client) => {
            let states: string[]
            try {
                states = TaskFormat.resolveStates(client.lifecycle, include, exclude)
            }
            catch (err) {
                throw new Error(`task: ${err instanceof Error ? err.message : String(err)}`, { cause: err })
            }
            return { items: await client.list(), known: client.lifecycle.states, states }
        })
    }

    /*  purge tasks whose modification time is older than the given age
        ("<number><unit>" with unit h, d, m, or y); returns the removed task ids  */
    static async purge (log: Log, age: string): Promise<string[]> {
        if (!/^\d+[hdmy]$/.test(age))
            throw new Error("task: <age> must match <number><unit> with unit h, d, m, or y")
        return Task.with(log, (client) => client.purge(age))
    }

    /*  get the active task id for a given session, or empty string if none  */
    static getId (log: Log, session: string): string {
        Task.validateSession(session)
        const scope = parseScope(`session:${session}`)
        const cfg = new Config("config", configSchema, log, scope)
        cfg.read()
        const val = cfg.get("agent.task")
        if (val === undefined)
            return ""
        return String(isScalar(val) ? val.value : val)
    }

    /*  set the active task id for a given session; returns a warning (else empty)
        if the id does not conform to the effective task id scheme of the task store
        (an unreachable task store skips the check, as switching does not require it)  */
    static async setId (log: Log, session: string, id: string): Promise<string> {
        Task.validateSession(session)
        Task.validateId(id)
        const scope   = parseScope(`session:${session}`)
        const cfg = new Config("config", configSchema, log, scope)
        cfg.lock(() => {
            cfg.read()
            cfg.set("agent.task", id)
            cfg.write()
        })
        let idscheme: string
        try {
            idscheme = await Task.idScheme(log)
        }
        catch (err) {
            log.write("warning", `task: cannot check task id "${id}" against the task id scheme: ` +
                `${err instanceof Error ? err.message : String(err)}`)
            return ""
        }
        return TaskFormat.idWarning(idscheme, id)
    }
}

/*  CLI command "ase task"  */
export default class TaskCommand {
    constructor (private log: Log) {}

    /*  edit a task by id with $EDITOR, renaming it on a changed "Id:" key  */
    private async edit (id: string): Promise<void> {
        /*  round-trip the plan through a temporary file, as the
            task store is not necessarily a local file  */
        Task.validateId(id)
        const before = await Task.load(this.log, id) || Task.format(Task.minimal(id))
        const editor = process.env.EDITOR ?? process.env.VISUAL ?? "vi"
        const dir    = fs.mkdtempSync(path.join(os.tmpdir(), "ase-task-"))
        const file   = path.join(dir, `${id}.md`)
        fs.writeFileSync(file, before, "utf8")

        /*  on save failures, offer re-editing and never discard the edits:
            the temporary file is kept if the user declines re-editing  */
        let next = id
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
                    let warning = await Task.save(this.log, id, after)
                    if (next !== id)
                        warning = await Task.rename(this.log, id, next) ?? ""
                    if (warning !== "")
                        this.log.write("warning", `task: ${warning}`)
                }
                break
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err)
                this.log.write("error", msg)
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
            .description("Manage persisted tasks in the task store configured by \"project.task.store\"")
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
                "modification time as (YYYY-MM-DD HH:MM), and the task title")
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
                        await writeStdout(`${item.id}\t${item.status}\t(${item.mtime})\t${item.title}\n`)
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
                const text    = await readStdin()
                const warning = await Task.save(this.log, id, text, undefined, opts.create)
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
                const warning = await Task.rename(this.log, oldId, newId)
                if (warning !== null) {
                    if (warning !== "")
                        this.log.write("warning", `task: ${warning}`)
                    this.log.write("info", `task: renamed "${oldId}" to "${newId}"`)
                }
                else
                    this.log.write("info", `task: no task "${oldId}" to rename`)
                process.exit(warning !== null ? 0 : 1)
            })

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

        /*  register CLI sub-command group "ase task store"  */
        new TaskStoreCommand(this.log).register(task)

        /*  provide "ase task" command for further sub-commands  */
        return task
    }
}


/*  render a caught error as an MCP tool error result  */
const mcpError = (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err)
    return {
        isError: true,
        content: [ { type: "text" as const, text: `ERROR: ${message}` } ]
    }
}

/*  render a task id scheme warning as a trailing notice line of an MCP tool result
    (not as "WARNING:", as callers treat such a result as a failed operation)  */
const notice = (warning: string): string =>
    warning !== "" ? `\nNOTICE: ${warning}` : ""

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
                "task `id`, the `status` of its plan (the `Status:` frontmatter key, defaulting " +
                "to the initial state of the configured task lifecycle model), and the `title` of " +
                "its plan (the `#   TASK: <title>` heading, empty if absent). " +
                "If `verbose` is `true`, each item additionally has an `mtime` field " +
                "(last modification time of the task plan, formatted as `YYYY-MM-DD HH:MM`). " +
                "Returns an empty array if no tasks exist.",
            inputSchema:  {
                verbose: z.boolean().optional()
                    .describe("if true, also include the `mtime` field per task (default: false)")
            },
            outputSchema: {
                tasks: z.array(z.object({
                    id:     z.string().describe("task identifier"),
                    status: z.string().describe("task plan lifecycle status (`Status:` frontmatter key, " +
                        "defaulting to the initial state of the configured task lifecycle model)"),
                    title:  z.string().describe("task plan title (`#   TASK: <title>` heading, empty if absent)"),
                    mtime:  z.string().optional()
                        .describe("task plan modification time (`YYYY-MM-DD HH:MM`); only present if `verbose` is true")
                })).describe("all persisted tasks in lexicographic id order")
            }
        }, async (args) => {
            try {
                const verbose = args.verbose ?? false
                const items   = await Task.list(this.log)
                const tasks   = verbose ?
                    items.map((item) => ({ id: item.id, status: item.status, title: item.title, mtime: item.mtime })) :
                    items.map((item) => ({ id: item.id, status: item.status, title: item.title }))
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

        /*  task load  */
        mcp.registerTool("ase_task_load", {
            title: "ASE task load",
            description:
                "Load a previously persisted task by `id`. " +
                "Returns the task as `text`, normalized into the current Markdown frontmatter shape; " +
                "returns an empty string if no task exists for the `id`. " +
                "The `variant` argument selects the returned form of the plan: " +
                "`source` (the default) is the *authoring* form and the *only* form which may be " +
                "edited and passed back into `ase_task_save`; " +
                "`render` is the *rendering-prepared* form, which is for *display only* and " +
                "MUST NOT be persisted; " +
                "`both` returns the source form enclosed in `<task-plan-source>` delimiter lines, " +
                "followed by the render form enclosed in `<task-plan-render>` delimiter lines.",
            inputSchema: {
                id: z.string()
                    .describe("task identifier (allowed characters: A-Z, a-z, 0-9, '#', '_', '-')"),
                variant: z.enum([ "source", "render", "both" ]).optional()
                    .describe("returned form of the plan: `source` (authoring form, the default), " +
                        "`render` (rendering-prepared form, display only), or `both` " +
                        "(both forms, each enclosed in its delimiter lines)")
            }
        }, async (args) => {
            try {
                const source  = await Task.load(this.log, args.id)
                const variant = args.variant ?? "source"
                let text = source
                if (source !== "" && variant === "render")
                    text = Markdown.prepare(source)
                else if (source !== "" && variant === "both")
                    text =
                        `<task-plan-source>\n${source}\n</task-plan-source>\n\n` +
                        `<task-plan-render>\n${Markdown.prepare(source)}\n</task-plan-render>\n`
                return {
                    content: [ { type: "text", text } ]
                }
            }
            catch (err: unknown) {
                return mcpError(err)
            }
        })

        /*  task save  */
        mcp.registerTool("ase_task_save", {
            title: "ASE task save",
            description:
                "Persist a task as `text` under `id`. " +
                "The `text` MUST be the *authoring* form of the plan (as returned by the " +
                "`source` variant of `ase_task_load`) and hence MUST NOT carry any rendering " +
                "artifacts. Overwrites any existing task for the same `id`, unless `create` is `true`, " +
                "in which case the save fails if a task with this `id` already exists (to be used on the " +
                "first save of a task whose `id` was allocated via `ase_task_newid`). " +
                "Returns a status `text` by default, or, if `render` is `true`, the " +
                "*rendering-prepared* form of the just-saved plan, for display purposes only. " +
                "The `Status:` frontmatter key of `text` is checked against the configured task " +
                "lifecycle model: if a changed status is not a state of the model or not reachable " +
                "from the previously saved status via one or more transitions of the state machine, " +
                "the save fails with an error. Prefer the `ase_task_status` MCP tool for pure status changes. " +
                "If `id` does not conform to the task id scheme of the project, the returned `text` " +
                "additionally carries a trailing `NOTICE: <info>` line.",
            inputSchema: {
                id: z.string()
                    .describe("task identifier (allowed characters: A-Z, a-z, 0-9, '#', '_', '-')"),
                text: z.string()
                    .describe("text content of the task, in its authoring form"),
                create: z.boolean().optional()
                    .describe("if true, fail if a task with `id` already exists instead of overwriting it (default: false)"),
                render: z.boolean().optional()
                    .describe("if true, return the rendering-prepared form of the just-saved " +
                        "plan instead of a status message (default: false)")
            }
        }, async (args) => {
            try {
                const warning = await Task.save(this.log, args.id, args.text, undefined, args.create ?? false)

                /*  return the rendering-prepared content on demand, so a caller
                    displaying the just-saved plan does not have to re-load it
                    (rendered from the stored plan, as the store normalizes the text)  */
                const text = ((args.render ?? false) ?
                    Markdown.prepare(await Task.load(this.log, args.id)) :
                    `OK: saved task "${args.id}"`) + notice(warning)
                return {
                    content: [ { type: "text", text } ]
                }
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
                return {
                    content: [ { type: "text", text: msg } ]
                }
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
                "rewriting its embedded `Id:` frontmatter key. " +
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
                const warning = await Task.rename(this.log, args.old, args.new)
                const msg     = warning !== null ?
                    `OK: renamed task "${args.old}" to "${args.new}"` + notice(warning) :
                    `WARNING: no task "${args.old}" to rename`
                return {
                    content: [ { type: "text", text: msg } ]
                }
            }
            catch (err: unknown) {
                return mcpError(err)
            }
        })

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
                    return {
                        content: [ { type: "text", text } ]
                    }
                }
                const text = await Task.getStatus(this.log, args.id)
                return {
                    content: [ { type: "text", text } ]
                }
            }
            catch (err: unknown) {
                return mcpError(err)
            }
        })

        /*  task id generation  */
        mcp.registerTool("ase_task_newid", {
            title: "ASE task id generation",
            description:
                "Determine the next free task id according to the task id scheme of the project " +
                "(the `project.task.idscheme` configuration, resp. the scheme registered in the task store), " +
                "by searching all existing task ids. The scheme is either `slug[:<words>]` (the first " +
                "`<words>` (default: 2) words of `title`, lower-cased and joined with `-`), " +
                "`seq[:<template>]` (the highest sequence number of all existing and ever removed ids plus one, rendered " +
                "through the sprintf-style `<template>` like `FOO-%03d`, `#%d`, or `%d` (the default)), or " +
                "`any` (the `proposal`, else derived from `title` like for `slug:2`). A slug or proposed id " +
                "which is already taken gets a numeric suffix `-2`, `-3`, etc. " +
                "Returns the `scheme`, the new `id`, and the regular expression `match` of all ids " +
                "conforming to the scheme (for `seq` capturing the sequence number, for `slug` accepting " +
                "the numeric suffix). For scheme `seq` the id is reserved (never handed out again), " +
                "for the other schemes it is not, so for allocating several ids at once pass the " +
                "already allocated ones as `taken`, and on the first save of the new task pass " +
                "`create: true` to `ase_task_save` to detect a concurrently created task with the same id.",
            inputSchema: {
                title: z.string().optional()
                    .describe("title of the new task (required for scheme `slug`, ignored for scheme `seq`)"),
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
                    const msg = `OK: set agent.task to "${args.id}" ` +
                        `for session "${args.session}"` + notice(warning)
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
                return mcpError(err)
            }
        })
    }
}

