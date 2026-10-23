/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import { giteaApi, ContentType, type HttpResponse } from "gitea-js"
import { LRUCache }                    from "lru-cache"

import * as API                        from "./ase-task-store-plugin-api.js"
import * as TaskFormat                 from "./ase-task-format.js"
import * as TaskIssues                 from "./ase-task-store-issues.js"

/*  the options of the Gitea storage plugin: the URL of the Gitea instance (default:
    "https://gitea.com"), the access token (default: $GITEA_TOKEN), the mapping of
    project ids onto "<owner>/<repo>" repositories, and the polling interval of the
    change detection in seconds (default: 60, 0 disables it)  */
export type TaskStoragePluginOptions = {
    url?:   string
    token?: string
    repos?: Record<string, string>
    poll?:  number
}

/*  the Gitea REST API client  */
type Client = ReturnType<typeof giteaApi>

/*  the used parts of the issues, comments, and labels as delivered by the Gitea REST API  */
type Repo    = { owner: string, repo: string }
type Issue   = {
    number:         number
    title:          string
    body?:          string | null
    state:          string
    labels:         { id: number, name: string }[] | null
    assignees?:     { login: string }[] | null
    milestone?:     { id: number, title: string } | null
    comments:       number
    created_at:     string
    updated_at:     string
    repository?:    { owner: string, name: string } | null
    pull_request?:  unknown
}
type Comment = {
    id:          number
    body?:       string
    user:        { login: string } | null
    created_at:  string
    updated_at:  string
}
type Label   = { id: number, name: string, description?: string }

/*  the "seq" task id scheme, the only one whose ids can be issue numbers  */
type SeqScheme = TaskIssues.SeqScheme

/*  the reserved label, the task id mapping, and the timestamp of the common issue tracker parts  */
const { LABEL_PROJECT, idOf, numberOf, stamp } = TaskIssues

/*  the header keys mapped onto native issue fields (or derived from them),
    hence never carried by "ase:<key>:<value>" labels  */
const nativeKeys = [ "Type", "Id", "Created", "Modified", "Phase", "After", "Tags", "Assignee" ]

/*  the page size of the listings (the default maximum of Gitea)  */
const PAGE = 50

/*  the current time and a normalized timestamp as ISO timestamp (UTC, millisecond-precise),
    as Gitea delivers its timestamps in the time zone of the server  */
const now = (): string => new Date().toISOString()
const iso = (timestamp: string): string => new Date(timestamp).toISOString()

/*  a failed request of the Gitea REST API with its HTTP status  */
class GiteaError extends Error {
    constructor (message: string, public status: number) {
        super(message)
    }
}

/*  the HTTP status of a request failure, and a "not found" (404) request failure mapped onto null  */
const statusOf = (err: unknown): number | undefined =>
    err instanceof GiteaError ? err.status : undefined
const found = <T>(p: Promise<T>): Promise<T | null> => p.catch((err: unknown) => {
    if (statusOf(err) === 404)
        return null
    throw err
})

/*  the label names of an issue, whether an issue is a live task (no pull request),
    and whether an issue belongs to the given repository  */
const labelNames = (issue: Issue): string[] =>
    (issue.labels ?? []).map((label) => label.name)
const live = (issue: Issue): boolean =>
    issue.pull_request === undefined || issue.pull_request === null
const inRepo = (loc: Repo, issue: Issue): boolean =>
    issue.repository === undefined || issue.repository === null
    || (issue.repository.owner.toLowerCase() === loc.owner.toLowerCase()
        && issue.repository.name.toLowerCase() === loc.repo.toLowerCase())

/*  the Gitea storage plugin: a project is a repository (registered by its
    "ase:project" label, which also persists the sequence number high-water mark, as
    Gitea never reuses the number of a deleted issue) and a task plan is a live issue,
    its id being the issue number rendered through the mandatory "seq" task id scheme;
    the title maps onto the issue title (and the "#   TASK:" heading), the body onto
    the issue body, "Status" onto the issue state refined by an "ase:Status:<state>"
    label, "Tags" onto labels, "Assignee" onto the assignee, "Phase" onto the milestone,
    "After" onto the dependencies (the blocking issues), "Created"/"Modified" onto the
    issue timestamps, any other key (including "Group", as Gitea has no parent issues)
    onto "ase:<key>:<value>" labels, and the attachments onto the issue comments  */
class GiteaTaskStoragePlugin extends TaskIssues.IssueTaskStoragePlugin<Repo> implements API.TaskStoragePlugin {
    readonly name = "gitea"
    private source:     string
    private gt:         Client
    private registry    = new LRUCache<string, { value: TaskIssues.RegistryEntry | null }>({ max: 64, ttl: 60 * 1000 })
    private latest      = new Map<string, { number: number, at: number }>()
    private labels      = new Map<string, Map<string, Label>>()
    private milestones  = new Map<string, Map<string, number>>()
    private assignable  = new LRUCache<string, Promise<Set<string>>>({ max: 64, ttl: 60 * 1000 })
    private depends     = new LRUCache<string, Promise<Issue[]>>({ max: 1024, ttl: 60 * 1000 })
    private loads       = new LRUCache<string, Promise<{ issue: Issue, after: Issue[], comments: Comment[] } | null>>({ max: 256, ttl: 2 * 1000 })

    constructor (ctx: API.TaskStorageContext) {
        super(ctx, "repositories", now)
        const options = ctx.options as TaskStoragePluginOptions
        const token   = options.token ?? process.env.GITEA_TOKEN ?? ""
        if (typeof token !== "string" || token === "")
            throw new Error("task store: plugin \"gitea\" requires the \"token\" option (or $GITEA_TOKEN)")
        const url = options.url ?? "https://gitea.com"
        let base: URL | null = null
        try {
            base = new URL(typeof url === "string" && !/^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? `https://${url}` : url)
        }
        catch {
            /*  reported below  */
        }
        if (base === null || !/^https?:$/.test(base.protocol) || base.search !== "" || base.hash !== "")
            throw new Error(`task store: plugin "gitea" received invalid URL "${String(url)}" of the Gitea instance`)
        this.url = base.href.replace(/\/+$/, "")
        if (typeof options.repos !== "object" || options.repos === null || Array.isArray(options.repos))
            throw new Error("task store: plugin \"gitea\" requires the \"repos\" option (mapping project ids onto \"<owner>/<repo>\")")
        for (const [ prjId, spec ] of Object.entries(options.repos)) {
            const m = typeof spec === "string" ? /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(spec) : null
            if (m === null || !TaskFormat.ID_RE.test(prjId))
                throw new Error(`task store: plugin "gitea" received invalid repository mapping "${prjId}: ${String(spec)}"`)
            this.repos.set(prjId, { owner: m[1], repo: m[2] })
        }
        this.poll = options.poll ?? 60
        if (typeof this.poll !== "number" || !Number.isFinite(this.poll) || (this.poll !== 0 && (this.poll < 1 || this.poll > 86400)))
            throw new Error("task store: plugin \"gitea\" requires a \"poll\" interval of 0 (disabled) resp. 1 to 86400 seconds")

        /*  create the Gitea REST API client, with every request bounded in time  */
        this.source = options.token !== undefined ? "the \"token\" option (resp. \"project.task.store.token\")" : "$GITEA_TOKEN"
        this.gt = giteaApi(this.url, {
            token,
            customFetch: (input, init) => fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(60 * 1000) })
        })
    }

    /*  convert a failed request (thrown as its response by the Gitea REST API client)
        into an error, explaining a denied access, as the Gitea message names neither
        the token source nor the missing permission  */
    private explain (err: unknown, loc?: Repo): never {
        if (!(err instanceof Response))
            throw err
        const info    = (err as HttpResponse<unknown, { message?: string } | null>).error
        const message = typeof info?.message === "string" && info.message !== "" ? info.message : err.statusText
        if (err.status === 401 || err.status === 403) {
            const repo = loc !== undefined ? ` to repository "${loc.owner}/${loc.repo}"` : ""
            throw new Error(`Gitea denied access${repo} (HTTP ${String(err.status)}: ${message}) -- ` +
                `the token of ${this.source} needs the scopes "write:issue" and "read:repository" ` +
                "and write access to the repository (resp. its administration, for deleting a task)")
        }
        throw new GiteaError(`Gitea request failed (HTTP ${String(err.status)}: ${message})`, err.status)
    }

    /*  perform a request, delivering its data  */
    private async call<T> (loc: Repo, request: Promise<HttpResponse<T>>): Promise<T> {
        try {
            return (await request).data
        }
        catch (err: unknown) {
            this.explain(err, loc)
        }
    }

    /*  perform a paginated listing request, delivering the data of all pages  */
    private async all<T> (loc: Repo, request: (query: { page: number, limit: number }) => Promise<HttpResponse<T[]>>): Promise<T[]> {
        const out: T[] = []
        for (let page = 1; ; page++) {
            let r: HttpResponse<T[]>
            try {
                r = await request({ page, limit: PAGE })
            }
            catch (err: unknown) {
                this.explain(err, loc)
            }
            out.push(...r.data)
            const total = Number.parseInt(r.headers.get("x-total-count") ?? "", 10)
            if (r.data.length === 0 || (Number.isFinite(total) ? out.length >= total : r.data.length < PAGE))
                return out
        }
    }

    /*  ==== project registry ====  */

    /*  the repository of a project  */
    private repo (prjId: string): Repo {
        const loc = this.repos.get(prjId)
        if (loc === undefined)
            throw new Error(`project "${prjId}" is not mapped onto a Gitea repository (see option "repos")`)
        return loc
    }

    /*  the labels of a repository by their lower-cased name (freshly listed on request)  */
    private async labelMap (loc: Repo, fresh = false): Promise<Map<string, Label>> {
        const key = `${loc.owner}/${loc.repo}`
        let map   = this.labels.get(key)
        if (map === undefined || fresh) {
            const labels = await this.all(loc, (query) => this.gt.repos.issueListLabels(loc.owner, loc.repo, query)) as Label[]
            map = new Map(labels.map((label) => [ label.name.toLowerCase(), label ]))
            this.labels.set(key, map)
        }
        return map
    }

    /*  the registry entry of a project, read from the description of its "ase:project" label  */
    private async registered (prjId: string): Promise<TaskIssues.RegistryEntry | null> {
        const cached = this.registry.get(prjId)
        if (cached !== undefined)
            return cached.value
        const loc = this.repos.get(prjId)
        let value: TaskIssues.RegistryEntry | null = null
        if (loc !== undefined) {
            const label = (await this.labelMap(loc, true)).get(LABEL_PROJECT)
            if (label !== undefined)
                value = TaskIssues.registryEntry(label.description)
        }
        this.registry.set(prjId, { value })
        return value
    }

    /*  the repository, lifecycle model, and task id scheme of a registered project  */
    private async context (prjId: string): Promise<{ loc: Repo, lifecycle: TaskFormat.TaskLifecycle, scheme: SeqScheme }> {
        const loc   = this.repo(prjId)
        const entry = await this.registered(prjId)
        if (entry === null)
            throw new Error(`project "${prjId}" not registered`)
        return { loc, ...TaskIssues.registryContext(prjId, entry, "Gitea") }
    }

    /*  write the registry entry of a project into the description of its "ase:project" label  */
    private async register (prjId: string, loc: Repo, entry: TaskIssues.RegistryEntry, exists: boolean): Promise<void> {
        const description = TaskIssues.registryDescription(entry)
        const label = exists ? (await this.labelMap(loc, true)).get(LABEL_PROJECT) : undefined
        if (label === undefined)
            await this.call(loc, this.gt.repos.issueCreateLabel(loc.owner, loc.repo, { name: LABEL_PROJECT, color: "#5319e7", description }))
        else
            await this.call(loc, this.gt.repos.issueEditLabel(loc.owner, loc.repo, label.id, { color: "#5319e7", description }))
        this.labels.delete(`${loc.owner}/${loc.repo}`)
        this.registry.set(prjId, { value: entry })
    }

    /*  the highest issue or pull request number of a repository, as the listing
        delivers the most recently created issue first  */
    private async latestNumber (loc: Repo, fresh = false): Promise<number> {
        const key    = `${loc.owner}/${loc.repo}`
        const cached = this.latest.get(key)

        /*  reuse a number determined within the last 2 seconds (unless a fresh one
            is required), as every single task store operation asks for it  */
        if (!fresh && cached !== undefined && Date.now() - cached.at < 2 * 1000)
            return cached.number
        const issues = await this.call(loc, this.gt.repos.issueListIssues(loc.owner, loc.repo, { state: "all", page: 1, limit: 1 })) as Issue[]
        const number = issues[0]?.number ?? 0
        this.latest.set(key, { number, at: Date.now() })
        return number
    }

    /*  the high-water mark of the sequence numbers of a registered project: the highest
        issue number, or the persisted one if higher (as numbers of deleted issues)  */
    private async seqmark (loc: Repo, entry: TaskIssues.RegistryEntry | null, fresh = false): Promise<number> {
        return Math.max(await this.latestNumber(loc, fresh), entry?.seqmark ?? 0)
    }

    /*  get a project, with the sequence number high-water mark as the next
        allocated task id is the one of the next created issue  */
    async projectGet (prjId: string): Promise<API.ProjectEntry | null> {
        const entry = await this.registered(prjId)
        if (entry === null)
            return null
        return { id: prjId, lifecycle: entry.lifecycle, idscheme: entry.idscheme, seqmark: await this.seqmark(this.repo(prjId), entry) }
    }
    async projectSet (prjId: string, lifecycle: string, idscheme: string): Promise<API.WriteResult> {
        const loc = this.repo(prjId)
        TaskIssues.requireSeqScheme(idscheme, "Gitea")

        /*  spare the requests of an unchanged (cached) registration, as the
            in-process clients re-register the project on every opening  */
        const entry = await this.registered(prjId)
        if (entry !== null && entry.lifecycle === lifecycle && entry.idscheme === idscheme)
            return "updated"
        await this.register(prjId, loc, { lifecycle, idscheme, ...(entry?.seqmark !== undefined ? { seqmark: entry.seqmark } : {}) }, entry !== null)
        return entry === null ? "created" : "updated"
    }

    /*  persist the high-water mark of the sequence numbers for the number of a hard deleted
        issue, if it exceeds the known one (deliberately not as the optional "projectMark"
        method, as the server also marks allocated task ids, which have to stay the numbers
        of the next created issues)  */
    private async retire (prjId: string, seqmark: number): Promise<void> {
        const loc   = this.repo(prjId)
        const entry = await this.registered(prjId)
        if (entry !== null && seqmark > (entry.seqmark ?? 0))
            await this.register(prjId, loc, { ...entry, seqmark }, true)
    }
    async projectDelete (prjId: string): Promise<boolean> {
        const loc = this.repos.get(prjId)
        if (loc === undefined)
            return false
        const label  = (await this.labelMap(loc, true)).get(LABEL_PROJECT)
        const result = label !== undefined ?
            await found(this.call(loc, this.gt.repos.issueDeleteLabel(loc.owner, loc.repo, label.id)).then(() => true)) : null
        this.labels.delete(`${loc.owner}/${loc.repo}`)
        this.registry.delete(prjId)
        return result !== null
    }

    /*  ==== issue mapping ====  */

    /*  fetch the live issue of an issue number (null if none)  */
    private async fetch (loc: Repo, n: number): Promise<Issue | null> {
        if (n === 0)
            return null
        const issue = await found(this.call(loc, this.gt.repos.issueGetIssue(loc.owner, loc.repo, n))) as Issue | null
        return issue !== null && issue.number === n && inRepo(loc, issue) && live(issue) ? issue : null
    }

    /*  the blocking issues of an issue within its repository, from its dependencies (none if
        disabled), reused for 60 seconds per update time, as a listing needs them for every issue  */
    private async blockers (loc: Repo, issue: Issue, fresh = false): Promise<Issue[]> {
        const key = `${loc.owner}/${loc.repo}#${issue.number}@${issue.updated_at}`
        if (fresh)
            this.depends.delete(key)
        const depends = TaskIssues.memoize(this.depends, key, () =>
            found(this.all(loc, (query) =>
                this.gt.repos.issueListIssueDependencies(loc.owner, loc.repo, String(issue.number), query)))
                .then((issues) => (issues ?? []) as Issue[]))
        return (await depends).filter((blocker) => inRepo(loc, blocker))
    }

    /*  the comments of an issue  */
    private async comments (loc: Repo, n: number): Promise<Comment[]> {
        return await this.call(loc, this.gt.repos.issueGetComments(loc.owner, loc.repo, n)) as Comment[]
    }

    /*  derive the header of an issue: the natively mapped keys, "Status" from the issue
        state (closed for the finished states) refined by its "ase:Status:<state>" label
        (where an open issue with a finished state could not be closed because of its
        open blocking issues), and all other keys from their "ase:<key>:<value>" labels  */
    private header (lifecycle: TaskFormat.TaskLifecycle, scheme: SeqScheme, issue: Issue, after: Issue[]): API.TaskHeader {
        const header: API.TaskHeader = {
            Type:     TaskFormat.TASK_TYPE,
            Id:       idOf(scheme, issue.number),
            Created:  stamp(issue.created_at),
            Modified: stamp(issue.updated_at)
        }
        if (issue.milestone !== undefined && issue.milestone !== null)
            header.Phase = issue.milestone.title
        if (after.length > 0)
            header.After = after.map((blocker) => idOf(scheme, blocker.number))
        const status = TaskIssues.labelHeader(header, labelNames(issue), nativeKeys)
        const assignee = issue.assignees?.[0]?.login
        if (assignee !== undefined)
            header.Assignee = assignee
        const closed  = issue.state === "closed"
        const derived = !closed && status !== undefined && lifecycle.finished.includes(status) ? status :
            TaskIssues.issueStatus(lifecycle, closed, status === "CANCELLED", status)
        if (derived !== undefined)
            header.Status = derived
        return header
    }

    /*  derive the attachment of a comment (see the common issue tracker parts)  */
    private attachment (comment: Comment): API.TaskAttachment {
        return TaskIssues.commentAttachment(comment.body, comment.user?.login ?? "ghost", comment.created_at, comment.updated_at)
    }

    /*  the listing entry of an issue  */
    private async entry (loc: Repo, lifecycle: TaskFormat.TaskLifecycle, scheme: SeqScheme, issue: Issue): Promise<API.TaskEntry> {
        const header = this.header(lifecycle, scheme, issue, await this.blockers(loc, issue))
        return { id: idOf(scheme, issue.number), title: issue.title, header, mtime: new Date(issue.updated_at) }
    }

    /*  ==== issue updating ====  */

    /*  the ids of labels, created on demand  */
    private async ensureLabels (loc: Repo, names: string[]): Promise<number[]> {
        const ids: number[] = []
        for (const name of names) {
            let label = (await this.labelMap(loc)).get(name.toLowerCase())
            if (label === undefined) {
                label = await this.call(loc, this.gt.repos.issueCreateLabel(loc.owner, loc.repo,
                    { name, color: name.startsWith("ase:") ? "#c5def5" : "#ededed" })).catch(async (err: unknown) => {
                    /*  tolerate a label created concurrently  */
                    const existing = statusOf(err) === 422 ? (await this.labelMap(loc, true)).get(name.toLowerCase()) : undefined
                    if (existing === undefined)
                        throw err
                    return existing
                }) as Label
                const map = await this.labelMap(loc)
                map.set(name.toLowerCase(), label)
            }
            ids.push(label.id)
        }
        return ids
    }

    /*  delete the "ase:<key>:<value>" labels no longer used by any issue  */
    private async collectLabels (loc: Repo, names: string[]): Promise<void> {
        for (const name of names) {
            if (!TaskIssues.LABEL_KEY_RE.test(name) || name.includes(","))
                continue
            const label = (await this.labelMap(loc)).get(name.toLowerCase())
            if (label === undefined)
                continue
            const issues = await this.call(loc, this.gt.repos.issueListIssues(loc.owner, loc.repo,
                { state: "all", labels: name, page: 1, limit: 1 })) as Issue[]
            if (issues.length === 0) {
                await found(this.call(loc, this.gt.repos.issueDeleteLabel(loc.owner, loc.repo, label.id)))
                this.labels.get(`${loc.owner}/${loc.repo}`)?.delete(name.toLowerCase())
            }
        }
    }

    /*  the id of a milestone by its title (created on demand)  */
    private async milestone (loc: Repo, title: string): Promise<number> {
        const key = `${loc.owner}/${loc.repo}`
        let map   = this.milestones.get(key)
        if (map === undefined) {
            const milestones = await this.all(loc, (query) =>
                this.gt.repos.issueGetMilestonesList(loc.owner, loc.repo, { state: "all", ...query }))
            map = new Map(milestones.map((milestone) => [ milestone.title ?? "", milestone.id ?? 0 ]))
            this.milestones.set(key, map)
        }
        let id = map.get(title)
        if (id === undefined) {
            id = (await this.call(loc, this.gt.repos.issueCreateMilestone(loc.owner, loc.repo, { title }))).id ?? 0
            map.set(title, id)
        }
        return id
    }

    /*  the live issue a header key references by its task id, else an error  */
    private async target (loc: Repo, scheme: SeqScheme, key: string, id: string): Promise<Issue> {
        const issue = await this.fetch(loc, numberOf(scheme, id))
        if (issue === null)
            throw new Error(`header key "${key}" references no existing task "${id}"`)
        return issue
    }

    /*  determine the labels and assignees of a header: the tags, the "ase:<key>:<value>"
        labels of the keys without native counterpart, and the assignee if it can be
        assigned natively (keeping further native assignees), else its label  */
    private async assign (loc: Repo, header: API.TaskHeader, issue: Issue | null): Promise<{ labels: string[], assignees: string[] }> {
        const labels = TaskIssues.headerLabels(header, nativeKeys)
        let assignees: string[] = []
        const assignee = header.Assignee
        if (typeof assignee === "string" && assignee !== "") {
            const logins = issue?.assignees?.map((user) => user.login) ?? []
            const key    = `${loc.owner}/${loc.repo}`
            const users  = TaskIssues.memoize(this.assignable, key, () =>
                this.call(loc, this.gt.repos.repoGetAssignees(loc.owner, loc.repo))
                    .then((list) => new Set(list.map((user) => (user.login ?? "").toLowerCase()))))
            if (logins.includes(assignee))
                assignees = logins
            else if ((await users).has(assignee.toLowerCase()))
                assignees = [ assignee ]
            else
                labels.push(`ase:Assignee:${assignee}`)
        }
        return { labels, assignees }
    }

    /*  synchronize the blocking issues (within the repository)  */
    private async syncBlockers (loc: Repo, issue: Issue, after: Issue[]): Promise<void> {
        const current = await this.blockers(loc, issue, true)
        const have    = new Set(current.map((blocker) => blocker.number))
        const want    = new Set(after.map((blocker) => blocker.number))
        const meta    = (blocker: Issue) => ({ owner: loc.owner, repo: loc.repo, index: blocker.number })
        for (const blocker of after) {
            if (have.has(blocker.number))
                continue
            await this.call(loc, this.gt.repos.issueCreateIssueDependencies(loc.owner, loc.repo, String(issue.number), meta(blocker), { type: ContentType.Json }))
                .catch((err: unknown) => {
                    if (statusOf(err) === 404)
                        throw new Error(`Gitea rejected the dependency of issue #${issue.number} on issue #${blocker.number} ` +
                            `-- enable the issue dependencies in the settings of repository "${loc.owner}/${loc.repo}"`, { cause: err })
                    throw err
                })
        }
        for (const blocker of current)
            if (!want.has(blocker.number))
                await found(this.call(loc, this.gt.repos.issueRemoveIssueDependencies(loc.owner, loc.repo, String(issue.number), meta(blocker), { type: ContentType.Json })))
    }

    /*  synchronize the comments with the attachments, touching changed ones only
        (see the common issue tracker parts)  */
    private async syncComments (loc: Repo, issue: Issue, attachments: API.TaskAttachment[]): Promise<void> {
        const comments = issue.comments > 0 ? await this.comments(loc, issue.number) : []
        const ops = TaskIssues.attachmentSync(comments.map((comment) => this.attachment(comment)), attachments)
        for (const op of ops) {
            if (op.op === "delete")
                await this.call(loc, this.gt.repos.issueDeleteComment(loc.owner, loc.repo, comments[op.index].id))
            else if (op.op === "create")
                await this.call(loc, this.gt.repos.issueCreateComment(loc.owner, loc.repo, issue.number,
                    { body: TaskIssues.attachmentComment(op.attachment) }))
            else
                await this.call(loc, this.gt.repos.issueEditComment(loc.owner, loc.repo, comments[op.index].id,
                    { body: TaskIssues.attachmentComment(op.attachment) }))
        }
    }

    /*  remember an issue written by this plugin instance: its update time, so the
        change detection does not report it as an external change  */
    private written (prjId: string, issue: Issue): void {
        this.pollState(prjId).seen.set(issue.number, issue.updated_at)
        this.loads.delete(`${prjId}#${issue.number}`)
    }

    /*  load a live issue together with its blocking issues and comments (the issue and
        its comments in parallel), reusing a load of the last 2 seconds (dropped on any
        own write or detected change of the issue), as e.g. the boards load the plan
        and its attachments in separate operations  */
    private load (prjId: string, loc: Repo, n: number): Promise<{ issue: Issue, after: Issue[], comments: Comment[] } | null> {
        return TaskIssues.memoize(this.loads, `${prjId}#${n}`, async () => {
            const [ issue, comments ] = await Promise.all([
                this.fetch(loc, n),
                n === 0 ? [] : found(this.comments(loc, n))
            ])
            if (issue === null)
                return null
            return { issue, after: await this.blockers(loc, issue), comments: comments ?? [] }
        })
    }

    /*  ==== task plans ====  */

    async taskList (prjId: string): Promise<API.TaskEntry[]> {
        const { loc, lifecycle, scheme } = await this.context(prjId)
        const issues = await this.all(loc, (query) =>
            this.gt.repos.issueListIssues(loc.owner, loc.repo, { state: "all", type: "issues", ...query })) as Issue[]
        return Promise.all(issues.filter((issue) => live(issue))
            .map((issue) => this.entry(loc, lifecycle, scheme, issue)))
    }
    async taskLoad (prjId: string, taskId: string): Promise<API.TaskPlan | null> {
        const { loc, lifecycle, scheme } = await this.context(prjId)
        const loaded = await this.load(prjId, loc, numberOf(scheme, taskId))
        if (loaded === null)
            return null
        const { issue, after, comments } = loaded
        return {
            header:     this.header(lifecycle, scheme, issue, after),
            body:       TaskIssues.issueBody(issue.title, issue.body),
            attachment: comments.map((comment) => this.attachment(comment))
        }
    }

    /*  create or update the issue of a task plan: all references are resolved
        upfront, a new task can only be the next issue number, and the issue itself
        is updated last, so its update time covers the relation, comment, and label
        changes; an issue which cannot be closed because of its open blocking issues
        stays open, with its finished state carried by the "ase:Status:<state>" label  */
    async taskSave (prjId: string, taskId: string, plan: API.TaskPlan): Promise<API.WriteResult> {
        const { loc, lifecycle, scheme } = await this.context(prjId)
        const number = numberOf(scheme, taskId)
        if (number === 0)
            throw new Error(`task id "${taskId}" is no issue number rendered through the "seq" task id scheme of the project`)
        let issue    = await this.fetch(loc, number)
        const result: API.WriteResult = issue !== null ? "updated" : "created"
        const group  = plan.header.Group
        if (typeof group === "string" && group !== "")
            await this.target(loc, scheme, "Group", group)
        const after  = await Promise.all((Array.isArray(plan.header.After) ? plan.header.After : [])
            .map((id) => this.target(loc, scheme, "After", id)))
        const phase  = plan.header.Phase
        const milestone = typeof phase === "string" && phase !== "" ? await this.milestone(loc, phase) : 0
        const { labels, assignees } = await this.assign(loc, plan.header, issue)
        const labelIds = await this.ensureLabels(loc, labels)
        const status = TaskFormat.taskStatus(plan.header, lifecycle)
        const closed = lifecycle.finished.includes(status)
        const { title, body } = TaskIssues.planIssue(taskId, plan)
        if (issue === null) {
            /*  reject a task id deviating from the next issue number, and delete an issue
                which lost the race for this number (retiring its number)  */
            const next = await this.seqmark(loc, await this.registered(prjId), true) + 1
            if (number !== next)
                throw new Error(`task "${taskId}" cannot be created, as the next issue will be "${idOf(scheme, next)}"`)
            issue = await this.call(loc, this.gt.repos.issueCreateIssue(loc.owner, loc.repo, {
                title, body, labels: labelIds, assignees, ...(milestone !== 0 ? { milestone } : {})
            })) as Issue
            if (issue.number !== number) {
                await this.call(loc, this.gt.repos.issueDelete(loc.owner, loc.repo, issue.number))
                await this.retire(prjId, issue.number)
                throw new Error(`task "${taskId}" cannot be created, as issue "${idOf(scheme, number)}" was created concurrently`)
            }
        }
        await this.syncBlockers(loc, issue, after)
        await this.syncComments(loc, issue, plan.attachment)
        const current = (issue.labels ?? []).map((label) => label.id).sort((a, b) => a - b)
        if (current.join(",") !== [ ...labelIds ].sort((a, b) => a - b).join(","))
            await this.call(loc, this.gt.repos.issueReplaceLabels(loc.owner, loc.repo, number, { labels: labelIds }))
        const edit = { title, body, assignees, milestone }
        let updated: Issue
        if (closed === (issue.state === "closed"))
            updated = await this.call(loc, this.gt.repos.issueEditIssue(loc.owner, loc.repo, number, edit)) as Issue
        else {
            updated = await this.call(loc, this.gt.repos.issueEditIssue(loc.owner, loc.repo, number,
                { ...edit, state: closed ? "closed" : "open" })).catch(async (err: unknown) => {
                /*  keep an issue with open blocking issues open, as Gitea refuses to close it
                    (after it applied all other changes)  */
                if (!closed || statusOf(err) !== 412)
                    throw err
                return await this.call(loc, this.gt.repos.issueGetIssue(loc.owner, loc.repo, number))
            }) as Issue
        }
        this.written(prjId, updated)
        await this.collectLabels(loc, labelNames(issue).filter((name) => !labels.includes(name)))
        return result
    }

    /*  hard delete the issue of a task plan (requiring the administration of the repository)  */
    async taskDelete (prjId: string, taskId: string): Promise<boolean> {
        const { loc, scheme } = await this.context(prjId)
        const issue = await this.fetch(loc, numberOf(scheme, taskId))
        if (issue === null)
            return false
        await this.call(loc, this.gt.repos.issueDelete(loc.owner, loc.repo, issue.number))
        await this.retire(prjId, issue.number)
        this.pollState(prjId).seen.delete(issue.number)
        this.loads.delete(`${prjId}#${issue.number}`)
        await this.collectLabels(loc, labelNames(issue))
        return true
    }

    /*  renaming is impossible, as the task id is the issue number  */
    async taskRename (prjId: string, oldId: string, newId: string): Promise<boolean> {
        const { loc, scheme } = await this.context(prjId)
        if (await this.fetch(loc, numberOf(scheme, oldId)) === null)
            return false
        throw new Error(`task "${oldId}" cannot be renamed to "${newId}", as task ids are Gitea issue numbers`)
    }

    /*  ==== change detection ====  */

    /*  poll the issues of a project updated since the last poll (Gitea supports no
        conditional requests), and report the issues not seen at their update time yet:
        as added if created after the opening, else as updated (issues deleted on Gitea
        are not reported, as Gitea reports no deletions)  */
    protected async pollProject (prjId: string): Promise<void> {
        const listener = this.listener
        if (listener === null || await this.registered(prjId) === null)
            return
        const { loc, lifecycle, scheme } = await this.context(prjId)
        const state  = this.pollState(prjId)
        const issues = await this.all(loc, (query) =>
            this.gt.repos.issueListIssues(loc.owner, loc.repo, { state: "all", type: "issues", since: state.since, ...query })) as Issue[]
        const change = { added: [] as API.TaskEntry[], updated: [] as API.TaskEntry[] }
        for (const issue of issues.reverse()) {
            if (!live(issue))
                continue
            if (iso(issue.updated_at) > state.since)
                state.since = iso(issue.updated_at)
            if (state.seen.get(issue.number) === issue.updated_at)
                continue
            const known = state.seen.has(issue.number)
            state.seen.set(issue.number, issue.updated_at)
            this.loads.delete(`${prjId}#${issue.number}`)
            if (!known && iso(issue.created_at) >= this.opened)
                change.added.push(await this.entry(loc, lifecycle, scheme, issue))
            else
                change.updated.push(await this.entry(loc, lifecycle, scheme, issue))
        }
        if (this.timer !== null && (change.added.length > 0 || change.updated.length > 0))
            listener(prjId, change)
    }
}

/*  the plugin factory  */
const factory: API.TaskStoragePluginFactory = (ctx) => new GiteaTaskStoragePlugin(ctx)
export default factory

