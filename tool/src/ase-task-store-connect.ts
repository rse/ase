/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import path                                               from "node:path"
import fs                                                 from "node:fs"

import { execaSync }                                      from "execa"
import { isScalar }                                       from "yaml"
import { LRUCache }                                       from "lru-cache"

import type Log                                           from "./ase-lib-log.js"
import { Config }                                         from "./ase-config-core.js"
import { configSchema }                                   from "./ase-config-schema.js"
import { parseScope, userStateDir, projectIdOf }          from "./ase-config-scope.js"
import { storeSchema }                                    from "./ase-task-store-server-cli.js"
import { urlHost, isLoopback }                            from "./ase-lib-server-bind.js"
import * as Delegate                                      from "./ase-task-store-plugin-delegate.js"
import * as TaskFormat                                    from "./ase-task-format.js"
import type { TaskStoreClient }                           from "./ase-task-store-client.js"
import { LocalTaskStoreClient, RemoteTaskStoreClient }    from "./ase-task-store-client.js"

/*  a configuration value together with the label of its supplying scope  */
type ScopedValue = { value: string, scope: string }

/*  the task store specification of the current project  */
export type TaskStoreSpec = {
    projectId: string, projectIdExplicit: boolean, store: ScopedValue, token: ScopedValue,
    lifecycle: TaskFormat.TaskLifecycle, idscheme: string
}

/*  reusable functionality: the connection to the task store of the current
    project, selected by the "project.task.store.url" configuration URL  */
export class TaskStoreConnect {
    /*  cached project root determination (TTL-bounded, as the ASE
        service is long-running and the Git context can change)  */
    private static projectRootCache = new LRUCache<string, string>({ max: 4, ttl: 10 * 1000 })

    /*  determine the project root (Git top-level if inside a Git
        working tree, otherwise the current working directory);
        cached, as each determination spawns a Git subprocess  */
    static projectRoot (): string {
        const cwd    = process.cwd()
        const cached = TaskStoreConnect.projectRootCache.get(cwd)
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
        TaskStoreConnect.projectRootCache.set(cwd, root)
        return root
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
        TaskStoreConnect.specCache.clear()
    }

    /*  read the "project.id" of the project (defaulting to the sanitized
        basename of the project root), the "project.task.store.url" URL (defaulting to
        "ase:./.ase/task") and "project.task.store.token" (both with their
        supplying scope), the "project.task.lifecycle" model (defaulting
        to "solo"), and the "project.task.idscheme" scheme (defaulting to "slug")  */
    static spec (log: Log): TaskStoreSpec {
        const root   = TaskStoreConnect.projectRoot()
        const cached = TaskStoreConnect.specCache.get(root)
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
        const projectId = explicit || projectIdOf(root)
        const store     = scoped("project.task.store.url")
        store.value   ||= "ase:./.ase/task"
        const token     = scoped("project.task.store.token")
        const name      = read("project.task.lifecycle") || "solo"
        const lifecycle = Object.hasOwn(TaskFormat.taskLifecycles, name) ? TaskFormat.taskLifecycles[name] : undefined
        if (lifecycle === undefined)
            throw new Error(`task: configured "lifecycle" "${name}" must be one of: ` +
                Object.keys(TaskFormat.taskLifecycles).join(", "))
        const idscheme  = read("project.task.idscheme") || "slug"
        const error     = TaskFormat.checkIdScheme(idscheme)
        if (error !== "")
            throw new Error(`task: configured "project.task.idscheme": ${error}`)
        const result = { projectId, projectIdExplicit: explicit !== "", store, token, lifecycle, idscheme }
        TaskStoreConnect.specCache.set(root, result)
        return result
    }

    /*  determine whether the task store is a remote one (otherwise it
        is operated in-process and follows the local configuration)  */
    static isRemote (log: Log): boolean {
        return /^ases?:\/\//.test(TaskStoreConnect.spec(log).store.value)
    }

    /*  determine whether the task store is a local directory of the
        built-in file-based storage plugin ("ase:<path>")  */
    static isLocal (log: Log): boolean {
        return /^ase:(?!\/\/)/.test(TaskStoreConnect.spec(log).store.value)
    }

    /*  determine the identity of the task store (e.g. for keying state kept
        per task store): its "project.task.store.url" URL, with the directory of
        a local one resolved against the project root, and without the token
        and the query of a remote one  */
    static storeKey (log: Log): string {
        const store = TaskStoreConnect.spec(log).store.value
        const m = /^ase:(?!\/\/)(.+)$/.exec(store)
        if (m !== null)
            return `ase:${path.resolve(TaskStoreConnect.projectRoot(), m[1])}`
        return store.replace(/^(ases?:\/\/[^/?#]*).*$/, "$1")
    }

    /*  resolve the bearer token of a remote task store: the token embedded
        in the URL, else $ASE_TASK_STORE_TOKEN, else "project.task.store.token",
        else the token of the locally started task store server (only if the
        URL addresses it); a token potentially committed or redirected is warned about  */
    private static token (log: Log, spec: TaskStoreSpec, embedded: string | undefined, url: URL): string {
        const repoScoped = spec.store.scope === "project" || spec.store.scope.startsWith("task:")
        if (embedded !== undefined) {
            if (repoScoped)
                log.write("warning", `task: token embedded in "project.task.store.url" URL on scope "${spec.store.scope}" ` +
                    "might be committed -- use $ASE_TASK_STORE_TOKEN or \"project.task.store.token\" on scope \"user\" instead")
            return embedded
        }

        /*  warn about a user token being sent to a non-loopback host selected on
            a repository-supplied scope, as a cloned repository could redirect it this way  */
        const redirected = () => {
            if (repoScoped && !isLoopback(url.hostname))
                log.write("warning", `task: sending token to non-loopback host "${url.host}" selected by ` +
                    `"project.task.store.url" on scope "${spec.store.scope}" -- verify you trust this host` +
                    (url.protocol === "ase:" ? " (token is transmitted in plaintext)" : ""))
        }
        const env = process.env.ASE_TASK_STORE_TOKEN
        if (env !== undefined && env !== "") {
            redirected()
            return env
        }
        if (spec.token.value !== "") {
            if (spec.token.scope !== "user")
                log.write("warning", `task: "project.task.store.token" found on scope "${spec.token.scope}" ` +
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
        const loopback = isLoopback(url.hostname)
        if (tok !== "" && scalar("port") === url.port
            && (url.hostname.toLowerCase() === host || (loopback && (wildcard || isLoopback(host)))))
            return tok
        throw new Error(`task: no token for task store "${spec.store.value}" ` +
            "(set $ASE_TASK_STORE_TOKEN, \"project.task.store.token\" on scope \"user\", or \"/<token>\" in the URL)")
    }

    /*  warn about task plans being sent to a GitHub/Gitea repository resp. GitLab project selected on a
        repository-supplied scope, once per project root and repository only (persisted across
        processes), so the warning re-appears only if the repository changes  */
    private static warnRepository (log: Log, plugin: string, repo: string, scope: string): void {
        const file = path.join(userStateDir(), `task-${plugin}.json`)
        const root = TaskStoreConnect.projectRoot()
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
            `"project.task.store.url" on scope "${scope}" -- verify you trust this repository ` +
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
    static client (log: Log): TaskStoreClient {
        const spec = TaskStoreConnect.spec(log)
        const { projectId, store, lifecycle, idscheme } = spec
        const unsupported = () => new Error(`task: unsupported "project.task.store.url" URL "${store.value}" ` +
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
            catch {
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
                TaskStoreConnect.token(log, spec, embedded, url), url.search === "?insecure")
        }
        else if ((m = /^ase:(.+)$/.exec(store.value)) !== null) {
            const root    = TaskStoreConnect.projectRoot()
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
                    throw new Error(`task: "project.task.store.url" "${store.value}" on scope "${store.scope}" ` +
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
                scope, and use the token of "project.task.store.token", else $GITHUB_TOKEN resp. $GH_TOKEN
                (GitHub), $GITLAB_TOKEN (GitLab), or $GITEA_TOKEN (Gitea), and the given host (or
                the given base URL of the "+http[s]" forms), else $GITLAB_HOST (GitLab)  */
            const [ , plugin, host, repo ] = m
            if (store.scope === "project" || store.scope.startsWith("task:"))
                TaskStoreConnect.warnRepository(log, plugin, host ? `${host}/${repo}` : repo, store.scope)
            if (spec.token.value !== "" && spec.token.scope !== "user")
                log.write("warning", `task: "project.task.store.token" found on scope "${spec.token.scope}" ` +
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
    static async with<T> (log: Log, op: (client: TaskStoreClient) => Promise<T>): Promise<T> {
        const client = TaskStoreConnect.client(log)
        try {
            await client.open()
            return await op(client)
        }
        finally {
            await client.close()
        }
    }
}

