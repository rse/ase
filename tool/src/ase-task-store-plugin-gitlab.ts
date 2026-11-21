/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import {
    Issues, IssueNotes, IssueLinks, ProjectLabels, ProjectMilestones, ProjectMembers, Users,
    GitbeakerRequestError
}                              from "@gitbeaker/rest"
import { LRUCache }            from "lru-cache"
import PQueue                  from "p-queue"

import * as API                from "./ase-task-store-plugin-api.js"
import * as TaskFormat         from "./ase-task-format.js"
import * as TaskIssues         from "./ase-task-store-issues.js"

/*  the options of the GitLab storage plugin: the URL of the GitLab instance (default:
    $GITLAB_HOST, else "https://gitlab.com"), the access token (default: $GITLAB_TOKEN),
    the mapping of project ids onto "<namespace>/<project>" paths, and the polling
    interval of the change detection in seconds (default: 60, 0 disables it)  */
export type TaskStoragePluginOptions = {
    url?:   string
    token?: string
    repos?: Record<string, string>
    poll?:  number
}

/*  the used parts of the issues, notes, and issue links as delivered by the GitLab REST API  */
type Issue = {
    id:                number
    iid:               number
    project_id:        number
    title:             string
    description?:      string | null
    state:             string
    labels:            string[]
    assignees?:        { id: number, username: string }[] | null
    milestone?:        { id: number, title: string } | null
    user_notes_count:  number
    created_at:        string
    updated_at:        string
    issue_type?:       string
}
type Note = {
    id:          number
    body?:       string
    author:      { username: string } | null
    system:      boolean
    created_at:  string
    updated_at:  string
}
type Link = {
    iid:            number
    project_id:     number
    issue_link_id:  number
    link_type:      string
}

/*  the first page of a conditionally requested issue listing: its issues,
    its entity tag, and whether further pages exist  */
type Listing = { issues: Issue[], etag?: string, more: boolean }

/*  the "seq" task id scheme, the only one whose ids can be issue numbers  */
type SeqScheme = TaskIssues.SeqScheme

/*  the reserved labels, the task id mapping, and the timestamp of the common issue tracker parts  */
const { LABEL_PROJECT, LABEL_DELETED, idOf, numberOf, stamp } = TaskIssues

/*  the "ase:After:<ids>" label carrying the blocking issues where GitLab lacks
    blocking links (tier "Free"), its task ids separated by spaces  */
const LABEL_AFTER_RE = /^ase:After:(.*)$/

/*  the header keys mapped onto native issue fields (or derived from them),
    hence never carried by "ase:<key>:<value>" labels  */
const nativeKeys = [ "Type", "Id", "Created", "Modified", "Phase", "After", "Tags", "Assignee" ]

/*  the current time and a normalized timestamp as ISO timestamp (UTC, millisecond-precise)  */
const now = (): string => new Date().toISOString()
const iso = (timestamp: string): string => new Date(timestamp).toISOString()

/*  the HTTP status of a (wrapped) request failure, and a "not found" (404) request failure mapped onto null  */
const statusOf = (err: unknown): number | undefined =>
    err instanceof GitbeakerRequestError ? err.cause?.response.status :
        err instanceof Error ? statusOf(err.cause) : undefined
const found = <T>(p: Promise<T>): Promise<T | null> => p.catch((err: unknown) => {
    if (statusOf(err) === 404)
        return null
    throw err
})

/*  whether an issue is a live task (an issue of type "issue", not soft deleted)  */
const live = (issue: Issue): boolean =>
    (issue.issue_type ?? "issue") === "issue" && !issue.labels.includes(LABEL_DELETED)

/*  the GitLab storage plugin: a project is a GitLab project (registered by its
    "ase:project" label) and a task plan is a live issue, its id being the issue
    number ("iid") rendered through the mandatory "seq" task id scheme; the title maps
    onto the issue title (and the "#   TASK:" heading), the body onto the issue
    description, "Status" onto the issue state refined by an "ase:Status:<state>"
    label, "Tags" onto labels, "Assignee" onto the assignee, "Phase" onto the milestone,
    "After" onto the "is blocked by" issue links (else an "ase:After:<ids>" label),
    "Created"/"Modified" onto the issue timestamps, any other key (including "Group",
    as GitLab has no parent issues) onto "ase:<key>:<value>" labels, and the attachments
    onto the issue notes  */
class GitLabTaskStoragePlugin extends TaskIssues.IssueTaskStoragePlugin<string> implements API.TaskStoragePlugin {
    readonly name = "gitlab"
    private token:      string
    private source:     string
    private issues:     Issues
    private notes:      IssueNotes
    private links:      IssueLinks
    private labels:     ProjectLabels
    private milestones: ProjectMilestones
    private members:    ProjectMembers
    private users:      Users
    private registry    = new LRUCache<string, { value: TaskIssues.RegistryEntry | null }>({ max: 64, ttl: 60 * 1000 })
    private latest      = new Map<string, { etag: string, number: number, at: number }>()
    private titles      = new Map<string, Map<string, number>>()
    private userIds     = new Map<string, number | null>()
    private blocking    = new Map<string, boolean>()
    private linked      = new LRUCache<string, Promise<Link[]>>({ max: 1024, ttl: 60 * 1000 })
    private recent      = new Map<string, Map<number, { issue: Issue, at: number }>>()
    private loads       = new LRUCache<string, Promise<{ issue: Issue, after: Link[], notes: Note[] } | null>>({ max: 256, ttl: 2 * 1000 })

    constructor (ctx: API.TaskStorageContext) {
        super(ctx, "projects", now)
        const options = ctx.options as TaskStoragePluginOptions
        const token   = options.token ?? process.env.GITLAB_TOKEN ?? ""
        if (typeof token !== "string" || token === "")
            throw new Error("task store: plugin \"gitlab\" requires the \"token\" option (or $GITLAB_TOKEN)")
        this.token = token
        this.configure("gitlab", "GitLab", options.url ?? process.env.GITLAB_HOST ?? "https://gitlab.com", options.poll)
        if (typeof options.repos !== "object" || options.repos === null || Array.isArray(options.repos))
            throw new Error("task store: plugin \"gitlab\" requires the \"repos\" option (mapping project ids onto \"<namespace>/<project>\")")
        for (const [ prjId, spec ] of Object.entries(options.repos)) {
            if (typeof spec !== "string" || !/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+$/.test(spec) || !TaskFormat.ID_RE.test(prjId))
                throw new Error(`task store: plugin "gitlab" received invalid project mapping "${prjId}: ${String(spec)}"`)
            this.repos.set(prjId, spec)
        }

        /*  create the used GitLab REST API resources, each with every request failure explained  */
        this.source = options.token !== undefined ? "the \"token\" option (resp. \"project.task.store.token\")" : "$GITLAB_TOKEN"
        const config = { host: this.url, token }
        this.issues     = this.explained(new Issues(config))
        this.notes      = this.explained(new IssueNotes(config))
        this.links      = this.explained(new IssueLinks(config))
        this.labels     = this.explained(new ProjectLabels(config))
        this.milestones = this.explained(new ProjectMilestones(config))
        this.members    = this.explained(new ProjectMembers(config))
        this.users      = this.explained(new Users(config))
    }

    /*  explain a denied access, as the GitLab message names neither the token
        source nor the missing permission  */
    private explain (err: unknown): never {
        const status = statusOf(err)
        if (status === 401 || status === 403) {
            const m    = /\/projects\/([^/?]+)/.exec(err instanceof GitbeakerRequestError ? err.cause?.request.url ?? "" : "")
            const repo = m !== null ? ` to project "${decodeURIComponent(m[1])}"` : ""
            throw new Error(`GitLab denied access${repo} (HTTP ${String(status)}: ${(err as Error).message}) -- ` +
                `the token of ${this.source} needs the scope "api" and at least the role "Planner" ` +
                "(resp. \"Reporter\" before GitLab 17.7) in the project", { cause: err })
        }
        throw err
    }

    /*  wrap a GitLab REST API resource to explain the failures of all its requests  */
    private explained<T extends object> (resource: T): T {
        return new Proxy(resource, {
            get: (target, key, receiver) => {
                const value: unknown = Reflect.get(target, key, receiver)
                if (typeof value !== "function")
                    return value
                return (...args: unknown[]): unknown => {
                    const result = (value as (...args: unknown[]) => unknown).apply(target, args)
                    return result instanceof Promise ? result.catch((err: unknown) => this.explain(err)) : result
                }
            }
        })
    }

    /*  ==== project registry ====  */

    /*  the GitLab project path of a project  */
    private repo (prjId: string): string {
        const path = this.repos.get(prjId)
        if (path === undefined)
            throw new Error(`project "${prjId}" is not mapped onto a GitLab project (see option "repos")`)
        return path
    }

    /*  the registry entry of a project, read from the description of its "ase:project" label  */
    private async registered (prjId: string): Promise<TaskIssues.RegistryEntry | null> {
        const cached = this.registry.get(prjId)
        if (cached !== undefined)
            return cached.value
        const path = this.repos.get(prjId)
        let value: TaskIssues.RegistryEntry | null = null
        if (path !== undefined) {
            const label = await found(this.labels.show(path, LABEL_PROJECT, { includeAncestorGroups: false }))
            if (label !== null)
                value = TaskIssues.registryEntry(label.description)
        }
        this.registry.set(prjId, { value })
        return value
    }

    /*  the project path, lifecycle model, and task id scheme of a registered project  */
    private async context (prjId: string): Promise<{ path: string, lifecycle: TaskFormat.TaskLifecycle, scheme: SeqScheme }> {
        const path  = this.repo(prjId)
        const entry = await this.registered(prjId)
        if (entry === null)
            throw new Error(`project "${prjId}" not registered`)
        return { path, ...TaskIssues.registryContext(prjId, entry, "GitLab") }
    }

    /*  conditionally request the first page of a listing via the entity tag of a
        previous request (null if unchanged), as the GitLab REST API client
        supports no per-request headers  */
    private async conditional (path: string, query: Record<string, string>, etag?: string): Promise<Listing | null> {
        const url = `${this.url}/api/v4/projects/${encodeURIComponent(path)}/issues?${new URLSearchParams(query).toString()}`
        const request = new Request(url, {
            headers: { "private-token": this.token, ...(etag !== undefined ? { "if-none-match": etag } : {}) },
            signal:  AbortSignal.timeout(60 * 1000)
        })
        const response = await fetch(request)
        if (response.status === 304)
            return null
        if (!response.ok) {
            const text = await response.text()
            this.explain(new GitbeakerRequestError(`${String(response.status)} ${response.statusText}`.trim(),
                { cause: { description: text, request, response } }))
        }
        return {
            issues: await response.json() as Issue[],
            etag:   response.headers.get("etag") ?? undefined,
            more:   (response.headers.get("x-next-page") ?? "") !== ""
        }
    }

    /*  the highest issue number of a project (conditionally requested), including
        the other work item types, as they share the issue number sequence  */
    private async latestNumber (path: string, fresh = false): Promise<number> {
        const cached = this.latest.get(path)

        /*  reuse a number determined within the last 2 seconds (unless a fresh one
            is required), as every single task store operation asks for it  */
        if (!fresh && cached !== undefined && Date.now() - cached.at < 2 * 1000)
            return cached.number
        const r = await this.conditional(path,
            { scope: "all", state: "all", order_by: "created_at", sort: "desc", per_page: "1" }, cached?.etag)
        if (r === null && cached !== undefined) {
            cached.at = Date.now()
            return cached.number
        }
        const number = r?.issues[0]?.iid ?? 0
        if (r?.etag !== undefined)
            this.latest.set(path, { etag: r.etag, number, at: Date.now() })
        return number
    }

    /*  get a project, with the highest issue number as the sequence number high-water
        mark, so the next allocated task id is the one of the next created issue  */
    async projectGet (prjId: string): Promise<API.ProjectEntry | null> {
        const entry = await this.registered(prjId)
        if (entry === null)
            return null
        return { id: prjId, ...entry, seqmark: await this.latestNumber(this.repo(prjId)) }
    }
    async projectSet (prjId: string, lifecycle: string, idscheme: string): Promise<API.WriteResult> {
        const path = this.repo(prjId)
        TaskIssues.requireSeqScheme(idscheme, "GitLab")

        /*  spare the requests of an unchanged (cached) registration, as the
            in-process clients re-register the project on every opening  */
        const entry = await this.registered(prjId)
        if (entry !== null && entry.lifecycle === lifecycle && entry.idscheme === idscheme)
            return "updated"
        const description = TaskIssues.registryDescription({ lifecycle, idscheme })
        if (entry === null)
            await this.labels.create(path, LABEL_PROJECT, "#5319e7", { description })
        else
            await this.labels.edit(path, LABEL_PROJECT, { color: "#5319e7", description })
        this.registry.set(prjId, { value: { lifecycle, idscheme } })
        return entry === null ? "created" : "updated"
    }
    async projectDelete (prjId: string): Promise<boolean> {
        const path = this.repos.get(prjId)
        if (path === undefined)
            return false
        const result = await found(this.labels.remove(path, LABEL_PROJECT).then(() => true))
        this.registry.delete(prjId)
        return result !== null
    }

    /*  ==== issue mapping ====  */

    /*  fetch the live issue of an issue number (null if none)  */
    private async fetch (path: string, n: number): Promise<Issue | null> {
        if (n === 0)
            return null
        const issue = await found(this.issues.show(n, { projectId: path }).then((data) => data as unknown as Issue))
        return issue !== null && issue.iid === n && live(issue) ? issue : null
    }

    /*  the blocking issues of an issue within its project, from its issue links
        (reused for 60 seconds per update time, as a listing needs them for every issue)  */
    private async blockers (path: string, issue: Issue, fresh = false): Promise<Link[]> {
        const key = `${path}#${issue.iid}@${issue.updated_at}`
        if (fresh)
            this.linked.delete(key)
        const links = TaskIssues.memoize(this.linked, key, () =>
            this.links.all(path, issue.iid).then((data) => data as unknown as Link[]))
        return (await links).filter((link) => link.link_type === "is_blocked_by" && link.project_id === issue.project_id)
    }

    /*  the (non-system) notes of an issue  */
    private async comments (path: string, n: number): Promise<Note[]> {
        const notes = await this.notes.all(path, n, { sort: "asc", orderBy: "created_at", perPage: 100 }) as unknown as Note[]
        return notes.filter((note) => !note.system)
    }

    /*  derive the header of an issue: the natively mapped keys, "After" from the
        blocking issues plus its "ase:After:<ids>" label, "Status" from the issue state
        (closed for the finished states) refined by its "ase:Status:<state>" label,
        and all other keys from their "ase:<key>:<value>" labels  */
    private header (lifecycle: TaskFormat.TaskLifecycle, scheme: SeqScheme, issue: Issue, after: Link[]): API.TaskHeader {
        const header: API.TaskHeader = {
            Type:     TaskFormat.TASK_TYPE,
            Id:       idOf(scheme, issue.iid),
            Created:  stamp(issue.created_at),
            Modified: stamp(issue.updated_at)
        }
        if (issue.milestone !== undefined && issue.milestone !== null)
            header.Phase = issue.milestone.title
        const ids = after.map((link) => idOf(scheme, link.iid))
        for (const name of issue.labels) {
            const m = LABEL_AFTER_RE.exec(name)
            if (m !== null)
                ids.push(...m[1].split(/\s+/).filter((id) => id !== "" && !ids.includes(id)))
        }
        if (ids.length > 0)
            header.After = ids
        const status = TaskIssues.labelHeader(header, issue.labels, nativeKeys)
        const assignee = issue.assignees?.[0]?.username
        if (assignee !== undefined)
            header.Assignee = assignee
        const derived = TaskIssues.issueStatus(lifecycle, issue.state === "closed", status === "CANCELLED", status)
        if (derived !== undefined)
            header.Status = derived
        return header
    }

    /*  derive the attachment of a note (see the common issue tracker parts)  */
    private attachment (note: Note): API.TaskAttachment {
        return TaskIssues.commentAttachment(note.body, note.author?.username ?? "ghost", note.created_at, note.updated_at)
    }

    /*  the listing entry of an issue  */
    private async entry (path: string, lifecycle: TaskFormat.TaskLifecycle, scheme: SeqScheme, issue: Issue): Promise<API.TaskEntry> {
        const header = this.header(lifecycle, scheme, issue, await this.blockers(path, issue))
        return { id: idOf(scheme, issue.iid), title: issue.title, header, mtime: new Date(issue.updated_at) }
    }

    /*  ==== issue updating ====  */

    /*  delete the "ase:<key>:<value>" labels no longer used by any issue  */
    private async collectLabels (path: string, names: string[]): Promise<void> {
        for (const name of names) {
            if (!TaskIssues.LABEL_KEY_RE.test(name))
                continue
            const issues = await this.issues.all({ projectId: path, labels: name, scope: "all", state: "all", perPage: 1, maxPages: 1 })
            if (issues.length === 0)
                await found(this.labels.remove(path, name))
        }
    }

    /*  the id of a project milestone by its title (created on demand)  */
    private async milestone (path: string, title: string): Promise<number> {
        let map = this.titles.get(path)
        if (map === undefined) {
            const milestones = await this.milestones.all(path, { perPage: 100 })
            map = new Map(milestones.map((milestone) => [ milestone.title, milestone.id ]))
            this.titles.set(path, map)
        }
        let id = map.get(title)
        if (id === undefined) {
            id = (await this.milestones.create(path, title)).id
            map.set(title, id)
        }
        return id
    }

    /*  the live issue a header key references by its task id, else an error  */
    private async target (path: string, scheme: SeqScheme, key: string, id: string): Promise<Issue> {
        const issue = await this.fetch(path, numberOf(scheme, id))
        if (issue === null)
            throw new Error(`header key "${key}" references no existing task "${id}"`)
        return issue
    }

    /*  the user id of a project member by its username (else null)  */
    private async member (path: string, username: string): Promise<number | null> {
        let id = this.userIds.get(username)
        if (id === undefined) {
            const users = await this.users.all({ username, perPage: 1, maxPages: 1 })
            id = users[0]?.id ?? null
            this.userIds.set(username, id)
        }
        if (id === null || await found(this.members.show(path, id, { includeInherited: true })) === null)
            return null
        return id
    }

    /*  determine the labels and assignees of a header: the tags, the "ase:<key>:<value>"
        labels of the keys without native counterpart, and the assignee if it can be
        assigned natively (keeping further native assignees), else its label  */
    private async assign (path: string, header: API.TaskHeader, issue: Issue | null): Promise<{ labels: string[], assigneeIds: number[] }> {
        const labels = TaskIssues.headerLabels(header, nativeKeys)
        let assigneeIds: number[] = []
        const assignee = header.Assignee
        if (typeof assignee === "string" && assignee !== "") {
            const users = issue?.assignees ?? []
            let id: number | null
            if (users.some((user) => user.username === assignee))
                assigneeIds = users.map((user) => user.id)
            else if ((id = await this.member(path, assignee)) !== null)
                assigneeIds = [ id ]
            else
                labels.push(`ase:Assignee:${assignee}`)
        }

        /*  reject the labels GitLab cannot carry, as the label names are passed comma-separated  */
        for (const label of labels)
            if (label.includes(","))
                throw new Error(`label "${label}" cannot be carried by GitLab, as it contains a comma`)
        return { labels, assigneeIds }
    }

    /*  add a blocking issue natively; returns false if GitLab rejects blocking links
        (remembered per project, as they require the tier "Premium") or the issues
        are already linked otherwise (e.g. as related)  */
    private async addBlocker (path: string, issue: Issue, blocker: Issue): Promise<boolean> {
        try {
            const link = await this.links.create(path, issue.iid, issue.project_id, blocker.iid, { linkType: "is_blocked_by" })
            if (link.link_type === "is_blocked_by")
                return true

            /*  remove a link degraded to "relates_to" by a tier without blocking links  */
            const links = await this.links.all(path, issue.iid) as unknown as Link[]
            for (const other of links)
                if (other.iid === blocker.iid && other.project_id === blocker.project_id)
                    await this.links.remove(path, issue.iid, other.issue_link_id)
            this.blocking.set(path, false)
            return false
        }
        catch (err: unknown) {
            const status = statusOf(err)
            if (status === 403)
                this.blocking.set(path, false)
            else if (status !== 409)
                throw err
            return false
        }
    }

    /*  synchronize the blocking issues (within the project) natively as far as possible
        (skipping the attempts once blocking links were rejected); returns whether all
        of them are carried natively  */
    private async syncBlockers (path: string, issue: Issue, after: Issue[]): Promise<boolean> {
        const current = await this.blockers(path, issue, true)
        const have    = new Set(current.map((link) => link.iid))
        const want    = new Set(after.map((blocker) => blocker.iid))
        let native    = true
        for (const blocker of after)
            if (!have.has(blocker.iid))
                native = (this.blocking.get(path) ?? true) && await this.addBlocker(path, issue, blocker) && native
        for (const link of current)
            if (!want.has(link.iid))
                await found(this.links.remove(path, issue.iid, link.issue_link_id))
        return native
    }

    /*  synchronize the notes with the attachments, touching changed ones only
        (see the common issue tracker parts)  */
    private async syncNotes (path: string, issue: Issue, attachments: API.TaskAttachment[]): Promise<void> {
        const notes = issue.user_notes_count > 0 ? await this.comments(path, issue.iid) : []
        const ops = TaskIssues.attachmentSync(notes.map((note) => this.attachment(note)), attachments)
        for (const op of ops) {
            if (op.op === "delete")
                await this.notes.remove(path, issue.iid, notes[op.index].id)
            else if (op.op === "create")
                await this.notes.create(path, issue.iid, TaskIssues.attachmentComment(op.attachment))
            else
                await this.notes.edit(path, issue.iid, notes[op.index].id, { body: TaskIssues.attachmentComment(op.attachment) })
        }
    }

    /*  remember an issue written by this plugin instance: its update time, so the change
        detection does not report it as an external change, and the issue itself, so the
        listings (which may lag behind the writes on GitLab) show it immediately  */
    private written (prjId: string, issue: Issue): void {
        this.pollState(prjId).seen.set(issue.iid, issue.updated_at)
        this.loads.delete(`${prjId}#${issue.iid}`)
        let recent = this.recent.get(prjId)
        if (recent === undefined) {
            recent = new Map()
            this.recent.set(prjId, recent)
        }
        recent.set(issue.iid, { issue, at: Date.now() })
    }

    /*  overlay the recently written issues (of the last 60 seconds) onto a listing,
        where the listed issue is not yet present or older  */
    private overlay (prjId: string, issues: Issue[]): Issue[] {
        const recent = this.recent.get(prjId)
        if (recent === undefined)
            return issues
        const byNumber = new Map(issues.map((issue) => [ issue.iid, issue ]))
        for (const [ n, { issue, at } ] of recent) {
            const listed = byNumber.get(n)
            if (Date.now() - at > 60 * 1000)
                recent.delete(n)
            else if (listed === undefined || iso(listed.updated_at) < iso(issue.updated_at))
                byNumber.set(n, issue)
        }
        return [ ...byNumber.values() ]
    }

    /*  load a live issue together with its blocking issues and notes (the issue and
        its notes in parallel), reusing a load of the last 2 seconds (dropped on any
        own write, revision determination, or detected change of the issue), as e.g. the
        boards load the plan and its attachments in separate operations  */
    private load (prjId: string, path: string, n: number): Promise<{ issue: Issue, after: Link[], notes: Note[] } | null> {
        return TaskIssues.memoize(this.loads, `${prjId}#${n}`, async () => {
            const [ issue, notes ] = await Promise.all([
                this.fetch(path, n),
                n === 0 ? [] : found(this.comments(path, n))
            ])
            if (issue === null)
                return null
            return { issue, after: await this.blockers(path, issue), notes: notes ?? [] }
        })
    }

    /*  ==== task plans ====  */

    async taskList (prjId: string): Promise<API.TaskEntry[]> {
        const { path, lifecycle, scheme } = await this.context(prjId)
        const issues = this.overlay(prjId,
            await this.issues.all({ projectId: path, scope: "all", state: "all", perPage: 100 }) as unknown as Issue[])
        const queue = new PQueue({ concurrency: 8 })
        return Promise.all(issues.filter((issue) => live(issue))
            .map((issue) => queue.add(() => this.entry(path, lifecycle, scheme, issue))))
    }
    async taskLoad (prjId: string, taskId: string): Promise<API.TaskPlan | null> {
        const { path, lifecycle, scheme } = await this.context(prjId)
        const loaded = await this.load(prjId, path, numberOf(scheme, taskId))
        if (loaded === null)
            return null
        const { issue, after, notes } = loaded
        return {
            header:     this.header(lifecycle, scheme, issue, after),
            body:       TaskIssues.issueBody(issue.title, issue.description),
            attachment: notes.map((note) => this.attachment(note))
        }
    }

    /*  the revision of a task plan: the update time of its live issue, dropping its
        cached load, so a subsequent load is never older than this revision  */
    async taskRevision (prjId: string, taskId: string): Promise<string | null> {
        const { path, scheme } = await this.context(prjId)
        const number   = numberOf(scheme, taskId)
        const revision = (await this.fetch(path, number))?.updated_at ?? null
        this.loads.delete(`${prjId}#${number}`)
        return revision
    }

    /*  create or update the issue of a task plan: all references are resolved
        upfront, a new task can only be the next issue number, and the issue itself
        is updated last, so its update time covers the link and note changes,
        where an expected revision is checked before any modification  */
    async taskSave (prjId: string, taskId: string, plan: API.TaskPlan, revision?: string): Promise<API.TaskWriteResult> {
        const { path, lifecycle, scheme } = await this.context(prjId)
        const number = numberOf(scheme, taskId)
        if (number === 0)
            throw new Error(`task id "${taskId}" is no issue number rendered through the "seq" task id scheme of the project`)
        let issue    = await this.fetch(path, number)
        if (revision !== undefined && issue?.updated_at !== revision)
            return "changed"
        const result: API.WriteResult = issue !== null ? "updated" : "created"
        const group  = plan.header.Group
        if (typeof group === "string" && group !== "")
            await this.target(path, scheme, "Group", group)
        const after  = await Promise.all((Array.isArray(plan.header.After) ? plan.header.After : [])
            .map((id) => this.target(path, scheme, "After", id)))

        /*  keep the milestone of an unchanged "Phase" (which may be a group milestone)  */
        const phase  = plan.header.Phase
        const milestone = typeof phase === "string" && phase !== "" ?
            (issue?.milestone?.title === phase ? issue.milestone.id : await this.milestone(path, phase)) : null
        const { labels, assigneeIds } = await this.assign(path, plan.header, issue)
        const status = TaskFormat.taskStatus(plan.header, lifecycle)
        const closed = lifecycle.finished.includes(status)
        const { title, body } = TaskIssues.planIssue(taskId, plan)
        if (issue === null) {
            /*  reject a task id deviating from the next issue number, and
                discard an issue which lost the race for this number  */
            const next = await this.latestNumber(path, true) + 1
            if (number !== next)
                throw new Error(`task "${taskId}" cannot be created, as the next issue will be "${idOf(scheme, next)}"`)
            issue = await this.issues.create(path, title, {
                description: body, labels: labels.join(","), assigneeIds, ...(milestone !== null ? { milestoneId: milestone } : {})
            }) as unknown as Issue
            if (issue.iid !== number) {
                await this.issues.edit(path, issue.iid, { stateEvent: "close", addLabels: LABEL_DELETED })
                throw new Error(`task "${taskId}" cannot be created, as issue "${idOf(scheme, number)}" was created concurrently`)
            }
        }
        if (!await this.syncBlockers(path, issue, after))
            labels.push(`ase:After:${after.map((blocker) => idOf(scheme, blocker.iid)).join(" ")}`)
        await this.syncNotes(path, issue, plan.attachment)
        const updated = await this.issues.edit(path, number, {
            title, description: body, labels: labels.join(","), assigneeIds, milestoneId: milestone ?? 0,
            ...(closed !== (issue.state === "closed") ? { stateEvent: closed ? "close" : "reopen" } : {})
        }) as unknown as Issue
        this.written(prjId, updated)
        await this.collectLabels(path, issue.labels.filter((name) => !labels.includes(name)))
        return result
    }

    /*  soft delete the issue of a task plan: closed and marked as deleted  */
    async taskDelete (prjId: string, taskId: string): Promise<boolean> {
        const { path, scheme } = await this.context(prjId)
        const issue = await this.fetch(path, numberOf(scheme, taskId))
        if (issue === null)
            return false
        const updated = await this.issues.edit(path, issue.iid, {
            addLabels: LABEL_DELETED, ...(issue.state !== "closed" ? { stateEvent: "close" } : {})
        }) as unknown as Issue
        this.written(prjId, updated)
        return true
    }

    /*  renaming is impossible, as the task id is the issue number  */
    async taskRename (prjId: string, oldId: string, newId: string): Promise<boolean> {
        const { path, scheme } = await this.context(prjId)
        if (await this.fetch(path, numberOf(scheme, oldId)) === null)
            return false
        throw new Error(`task "${oldId}" cannot be renamed to "${newId}", as task ids are GitLab issue numbers`)
    }

    /*  ==== change detection ====  */

    /*  poll the issues of a project updated since the last poll, conditionally via
        the entity tag of the last poll (a "304" answer still counts against the rate
        limit of GitLab), and report the issues not seen at their update time yet: as
        added if created after the opening, as deleted if soft deleted, else as updated
        (issues deleted on GitLab are not reported, as GitLab reports no deletions)  */
    protected async pollProject (prjId: string): Promise<void> {
        const listener = this.listener
        if (listener === null || await this.registered(prjId) === null)
            return
        const { path, lifecycle, scheme } = await this.context(prjId)
        const state  = this.pollState(prjId)
        const params = { scope: "all", state: "all", order_by: "updated_at", sort: "asc", updated_after: state.since, per_page: "100" }
        const r = await this.conditional(path, params, state.etag)
        if (r === null)
            return
        state.etag = r.etag
        let issues = r.issues
        if (r.more)
            issues = await this.issues.all({
                projectId: path, scope: "all", state: "all", orderBy: "updated_at", sort: "asc", updatedAfter: state.since, perPage: 100
            }) as unknown as Issue[]
        const change = { added: [] as API.TaskEntry[], updated: [] as API.TaskEntry[], deleted: [] as string[] }
        for (const issue of issues) {
            if ((issue.issue_type ?? "issue") !== "issue")
                continue
            if (iso(issue.updated_at) > state.since)
                state.since = iso(issue.updated_at)
            if (state.seen.get(issue.iid) === issue.updated_at)
                continue
            const known = state.seen.has(issue.iid)
            state.seen.set(issue.iid, issue.updated_at)
            this.loads.delete(`${prjId}#${issue.iid}`)
            if (!live(issue))
                change.deleted.push(idOf(scheme, issue.iid))
            else if (!known && iso(issue.created_at) >= this.opened)
                change.added.push(await this.entry(path, lifecycle, scheme, issue))
            else
                change.updated.push(await this.entry(path, lifecycle, scheme, issue))
        }
        if (this.timer !== null && (change.added.length > 0 || change.updated.length > 0 || change.deleted.length > 0))
            listener(prjId, change)
    }
}

/*  the plugin factory  */
const factory: API.TaskStoragePluginFactory = (ctx) => new GitLabTaskStoragePlugin(ctx)
export default factory

