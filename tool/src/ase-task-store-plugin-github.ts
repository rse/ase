/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import { Octokit }             from "@octokit/core"
import { restEndpointMethods } from "@octokit/plugin-rest-endpoint-methods"
import { paginateRest }        from "@octokit/plugin-paginate-rest"
import { LRUCache }            from "lru-cache"

import * as API                from "./ase-task-store-plugin-api.js"
import * as TaskFormat         from "./ase-task-format.js"
import * as TaskIssues         from "./ase-task-store-issues.js"

/*  the options of the GitHub storage plugin: the web URL of the GitHub instance (default:
    "https://github.com", else e.g. the one of a GitHub Enterprise Server), the access
    token (default: $GITHUB_TOKEN, else $GH_TOKEN), the mapping of project ids onto
    "<owner>/<repo>" repositories, and the polling interval of the change
    detection in seconds (default: 60, 0 disables it)  */
export type TaskStoragePluginOptions = {
    url?:   string
    token?: string
    repos?: Record<string, string>
    poll?:  number
}

/*  the GitHub REST API client: the core with the endpoint methods and the pagination  */
const GitHub = Octokit.plugin(restEndpointMethods, paginateRest)
type Client  = InstanceType<typeof GitHub>

/*  the used parts of the issues and comments as delivered by the GitHub REST API  */
type Repo    = { owner: string, repo: string }
type Issue   = {
    id:                          number
    number:                      number
    title:                       string
    body?:                       string | null
    state:                       string
    state_reason?:               string | null
    labels:                      (string | { name?: string })[]
    assignees?:                  { login: string }[] | null
    milestone:                   { title: string } | null
    comments:                    number
    created_at:                  string
    updated_at:                  string
    repository_url:              string
    pull_request?:               unknown
    parent_issue_url?:           string | null
    issue_dependencies_summary?: { total_blocked_by: number }
}
type Comment = {
    id:          number
    body?:       string
    user:        { login: string } | null
    created_at:  string
    updated_at:  string
}

/*  the "seq" task id scheme, the only one whose ids can be issue numbers  */
type SeqScheme = TaskIssues.SeqScheme

/*  the reserved labels, the task id mapping, and the timestamp of the common issue tracker parts  */
const { LABEL_PROJECT, LABEL_DELETED, LABEL_KEY_RE, idOf, numberOf, stamp } = TaskIssues

/*  the "ase:Group:<id>" and "ase:After:<ids>" labels carrying the parent resp. blocking
    issues where the GitHub instance lacks sub-issues resp. issue dependencies (like
    older GitHub Enterprise Server versions), the latter's task ids separated by spaces  */
const LABEL_RELATION_RE = /^ase:(Group|After):(.*)$/

/*  the REST API base URL of the web URL of a GitHub instance: GitHub itself,
    GitHub Enterprise Cloud with data residency ("<sub>.ghe.com"), or GitHub
    Enterprise Server (with its REST API below "/api/v3")  */
const apiBaseOf = (base: URL): string =>
    base.hostname.toLowerCase() === "github.com" ? "https://api.github.com" :
        /\.ghe\.com$/i.test(base.hostname) ? `https://api.${base.host}` :
            `${base.href.replace(/\/+$/, "")}/api/v3`

/*  the header keys mapped onto native issue fields (or derived from them),
    hence never carried by "ase:<key>:<value>" labels  */
const nativeKeys = [ "Type", "Id", "Created", "Modified", "Group", "Phase", "After", "Tags", "Assignee" ]

/*  the current time as ISO timestamp in the second-precise shape of GitHub  */
const now = (): string => new Date().toISOString().replace(/\.\d+Z$/, "Z")

/*  map a "not found" (404) or "gone" (410) request failure onto null  */
const statusOf = (err: unknown): unknown => (err as { status?: unknown } | null)?.status
const found = <T>(p: Promise<T>): Promise<T | null> => p.catch((err: unknown) => {
    if (statusOf(err) === 404 || statusOf(err) === 410)
        return null
    throw err
})

/*  the label names of an issue, and whether an issue is a live task (no pull request, not soft deleted)  */
const labelNames = (issue: Issue): string[] =>
    issue.labels.map((label) => typeof label === "string" ? label : label.name ?? "")
const live = (issue: Issue): boolean =>
    (issue.pull_request === undefined || issue.pull_request === null) && !labelNames(issue).includes(LABEL_DELETED)

/*  whether an owner/repo pair denotes the given repository, the parent issue number
    of an issue within it (else null), and whether an issue belongs to it  */
const sameRepo = (loc: Repo, owner: string, repo: string): boolean =>
    owner.toLowerCase() === loc.owner.toLowerCase() && repo.toLowerCase() === loc.repo.toLowerCase()
const parentOf = (loc: Repo, issue: Issue): number | null => {
    const m = /\/repos\/([^/]+)\/([^/]+)\/issues\/(\d+)$/.exec(issue.parent_issue_url ?? "")
    return m !== null && sameRepo(loc, m[1], m[2]) ? Number.parseInt(m[3], 10) : null
}
const inRepo = (loc: Repo, issue: Issue): boolean => {
    const m = /\/repos\/([^/]+)\/([^/]+)$/.exec(issue.repository_url)
    return m !== null && sameRepo(loc, m[1], m[2])
}

/*  the GitHub storage plugin: a project is a repository (registered by its
    "ase:project" label) and a task plan is a live issue, its id being the issue
    number rendered through the mandatory "seq" task id scheme; the title maps onto
    the issue title (and the "#   TASK:" heading), the body onto the issue body,
    "Status" onto the issue state refined by an "ase:Status:<state>" label, "Tags"
    onto labels, "Assignee" onto the assignee, "Phase" onto the milestone, "Group"
    onto the parent issue, "After" onto the blocking issues, "Created"/"Modified"
    onto the issue timestamps, any other key onto "ase:<key>:<value>" labels, and
    the attachments onto the issue comments (where "Group" and "After" fall back
    onto "ase:Group:<id>" resp. "ase:After:<ids>" labels on instances without
    sub-issues resp. issue dependencies)  */
class GitHubTaskStoragePlugin extends TaskIssues.IssueTaskStoragePlugin<Repo> implements API.TaskStoragePlugin {
    readonly name = "github"
    private gh:         Client
    private registry    = new LRUCache<string, { value: TaskIssues.RegistryEntry | null }>({ max: 64, ttl: 60 * 1000 })
    private latest      = new Map<string, { etag: string, number: number, at: number }>()
    private labels      = new Map<string, Set<string>>()
    private milestones  = new Map<string, Map<string, number>>()
    private unsupported = new Map<string, Set<"Group" | "After">>()
    private recent      = new Map<string, Map<number, { issue: Issue, at: number }>>()
    private loads       = new LRUCache<string, Promise<{ issue: Issue, after: Issue[], comments: Comment[] } | null>>({ max: 256, ttl: 2 * 1000 })

    constructor (ctx: API.TaskStorageContext) {
        super(ctx, "repositories", now)
        const options = ctx.options as TaskStoragePluginOptions
        const token   = options.token ?? (process.env.GITHUB_TOKEN || process.env.GH_TOKEN) ?? ""
        if (typeof token !== "string" || token === "")
            throw new Error("task store: plugin \"github\" requires the \"token\" option (or $GITHUB_TOKEN resp. $GH_TOKEN)")
        const base = this.configure("github", "GitHub", options.url ?? "https://github.com", options.poll)
        const apiBase = apiBaseOf(base)
        if (typeof options.repos !== "object" || options.repos === null || Array.isArray(options.repos))
            throw new Error("task store: plugin \"github\" requires the \"repos\" option (mapping project ids onto \"<owner>/<repo>\")")
        for (const [ prjId, spec ] of Object.entries(options.repos)) {
            const m = typeof spec === "string" ? /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(spec) : null
            if (m === null || !TaskFormat.ID_RE.test(prjId))
                throw new Error(`task store: plugin "github" received invalid repository mapping "${prjId}: ${String(spec)}"`)
            this.repos.set(prjId, { owner: m[1], repo: m[2] })
        }

        /*  route the diagnostics of Octokit into the log, as the standard
            output may carry a protocol (like the one of an MCP server)  */
        this.gh = new GitHub({
            auth:      token,
            baseUrl:   apiBase,
            userAgent: "ase-task-store-github",
            log: {
                debug: () => {},
                info:  () => {},
                warn:  (message: string) => ctx.log("warning", message),
                error: (message: string) => ctx.log("error", message)
            }
        })

        /*  request the current REST API version, as the default one ("2022-11-28") is deprecated
            (its breaking changes do not affect this plugin, as it uses "assignees" only), except
            on a GitHub Enterprise Server, which answers an unsupported version with "410"  */
        if (!apiBase.endsWith("/api/v3"))
            this.gh.hook.before("request", (request) => {
                request.headers["x-github-api-version"] = "2026-03-10"
            })

        /*  explain a denied access (but not an exceeded rate limit), as the
            GitHub message names neither the token source nor the missing permission  */
        const source = options.token !== undefined ? "the \"token\" option (resp. \"project.task.store.token\")" :
            process.env.GITHUB_TOKEN !== undefined && process.env.GITHUB_TOKEN !== "" ? "$GITHUB_TOKEN" : "$GH_TOKEN"
        this.gh.hook.error("request", (err, request) => {
            const status = statusOf(err)
            if ((status === 401 || status === 403) && !/rate limit/i.test(err.message)) {
                const repo = typeof request.owner === "string" && typeof request.repo === "string" ?
                    ` to repository "${request.owner}/${request.repo}"` : ""
                throw new Error(`GitHub denied access${repo} (HTTP ${String(status)}: ${err.message}) -- ` +
                    `the token of ${source} needs access to the repository with the permission ` +
                    "\"Issues: Read and write\" (fine-grained token) resp. the scope \"repo\" or \"public_repo\" (classic token)",
                { cause: err })
            }
            throw err
        })
    }

    /*  ==== project registry ====  */

    /*  the repository of a project  */
    private repo (prjId: string): Repo {
        const loc = this.repos.get(prjId)
        if (loc === undefined)
            throw new Error(`project "${prjId}" is not mapped onto a GitHub repository (see option "repos")`)
        return loc
    }

    /*  the registry entry of a project, read from the description of its "ase:project" label  */
    private async registered (prjId: string): Promise<TaskIssues.RegistryEntry | null> {
        const cached = this.registry.get(prjId)
        if (cached !== undefined)
            return cached.value
        const loc = this.repos.get(prjId)
        let value: TaskIssues.RegistryEntry | null = null
        if (loc !== undefined) {
            const label = await found(this.gh.rest.issues.getLabel({ ...loc, name: LABEL_PROJECT }))
            if (label !== null)
                value = TaskIssues.registryEntry(label.data.description)
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
        return { loc, ...TaskIssues.registryContext(prjId, entry, "GitHub") }
    }

    /*  the highest issue or pull request number of a repository (conditionally requested)  */
    private async latestNumber (loc: Repo, fresh = false): Promise<number> {
        const key    = `${loc.owner}/${loc.repo}`
        const cached = this.latest.get(key)

        /*  reuse a number determined within the last 2 seconds (unless a fresh one
            is required), as every single task store operation asks for it  */
        if (!fresh && cached !== undefined && Date.now() - cached.at < 2 * 1000)
            return cached.number
        try {
            const r = await this.gh.request("GET /repos/{owner}/{repo}/issues", {
                ...loc, state: "all", sort: "created", direction: "desc", per_page: 1,
                headers: cached !== undefined ? { "if-none-match": cached.etag } : {}
            })
            const number = r.data[0]?.number ?? 0
            if (r.headers.etag !== undefined)
                this.latest.set(key, { etag: r.headers.etag, number, at: Date.now() })
            return number
        }
        catch (err: unknown) {
            if (cached !== undefined && statusOf(err) === 304) {
                cached.at = Date.now()
                return cached.number
            }
            throw err
        }
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
        const loc = this.repo(prjId)
        TaskIssues.requireSeqScheme(idscheme, "GitHub")

        /*  spare the requests of an unchanged (cached) registration, as the
            in-process clients re-register the project on every opening  */
        const entry = await this.registered(prjId)
        if (entry !== null && entry.lifecycle === lifecycle && entry.idscheme === idscheme)
            return "updated"
        const description = TaskIssues.registryDescription({ lifecycle, idscheme })
        if (entry === null)
            await this.gh.rest.issues.createLabel({ ...loc, name: LABEL_PROJECT, color: "5319e7", description })
        else
            await this.gh.rest.issues.updateLabel({ ...loc, name: LABEL_PROJECT, description })
        this.registry.set(prjId, { value: { lifecycle, idscheme } })
        return entry === null ? "created" : "updated"
    }
    async projectDelete (prjId: string): Promise<boolean> {
        const loc = this.repos.get(prjId)
        if (loc === undefined)
            return false
        const result = await found(this.gh.rest.issues.deleteLabel({ ...loc, name: LABEL_PROJECT }))
        this.registry.delete(prjId)
        return result !== null
    }

    /*  ==== issue mapping ====  */

    /*  fetch the live issue of an issue number (null if none)  */
    private async fetch (loc: Repo, n: number): Promise<Issue | null> {
        if (n === 0)
            return null
        const issue = await found(this.gh.rest.issues.get({ ...loc, issue_number: n }).then((r) => r.data as Issue))
        return issue !== null && issue.number === n && inRepo(loc, issue) && live(issue) ? issue : null
    }

    /*  the blocking issues of an issue within its repository  */
    private async blockers (loc: Repo, issue: Issue): Promise<Issue[]> {
        if ((issue.issue_dependencies_summary?.total_blocked_by ?? 0) === 0)
            return []
        const blockers = await this.gh.paginate(this.gh.rest.issues.listDependenciesBlockedBy,
            { ...loc, issue_number: issue.number, per_page: 100 }) as Issue[]
        return blockers.filter((blocker) => inRepo(loc, blocker))
    }

    /*  the comments of an issue  */
    private async comments (loc: Repo, issue: Issue): Promise<Comment[]> {
        if (issue.comments === 0)
            return []
        return await this.gh.paginate(this.gh.rest.issues.listComments,
            { ...loc, issue_number: issue.number, per_page: 100 }) as Comment[]
    }

    /*  derive the header of an issue: the natively mapped keys (with "Group" and
        "After" also from their fallback labels), "Status" from the
        issue state (closed for the finished states, "not_planned" for "CANCELLED")
        refined by its "ase:Status:<state>" label, and all other keys from their
        "ase:<key>:<value>" labels  */
    private header (loc: Repo, lifecycle: TaskFormat.TaskLifecycle, scheme: SeqScheme, issue: Issue, after: Issue[]): API.TaskHeader {
        const header: API.TaskHeader = {
            Type:     TaskFormat.TASK_TYPE,
            Id:       idOf(scheme, issue.number),
            Created:  stamp(issue.created_at),
            Modified: stamp(issue.updated_at)
        }
        const parent = parentOf(loc, issue)
        if (parent !== null)
            header.Group = idOf(scheme, parent)
        if (issue.milestone !== null)
            header.Phase = issue.milestone.title
        const ids = after.map((blocker) => idOf(scheme, blocker.number))
        for (const name of labelNames(issue)) {
            const m = LABEL_RELATION_RE.exec(name)
            if (m !== null && m[1] === "Group" && header.Group === undefined)
                header.Group = m[2]
            else if (m !== null && m[1] === "After")
                ids.push(...m[2].split(/\s+/).filter((id) => id !== "" && !ids.includes(id)))
        }
        if (ids.length > 0)
            header.After = ids
        const status = TaskIssues.labelHeader(header, labelNames(issue), nativeKeys)
        const assignee = issue.assignees?.[0]?.login
        if (assignee !== undefined)
            header.Assignee = assignee
        const derived = TaskIssues.issueStatus(lifecycle, issue.state === "closed", issue.state_reason === "not_planned", status)
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
        const header = this.header(loc, lifecycle, scheme, issue, await this.blockers(loc, issue))
        return { id: idOf(scheme, issue.number), title: issue.title, header, mtime: new Date(issue.updated_at) }
    }

    /*  ==== issue updating ====  */

    /*  ensure the existence of labels (with the known labels of a repository cached)  */
    private async ensureLabels (loc: Repo, names: string[]): Promise<void> {
        const key   = `${loc.owner}/${loc.repo}`
        let known   = this.labels.get(key)
        if (known === undefined) {
            const labels = await this.gh.paginate(this.gh.rest.issues.listLabelsForRepo, { ...loc, per_page: 100 })
            known = new Set(labels.map((label) => label.name.toLowerCase()))
            this.labels.set(key, known)
        }
        for (const name of names) {
            if (known.has(name.toLowerCase()))
                continue
            await this.gh.rest.issues.createLabel({ ...loc, name, color: name.startsWith("ase:") ? "c5def5" : "ededed" })
                .catch(async (err: unknown) => {
                    /*  tolerate a label created concurrently, but not a rejected one (like an invalid name)  */
                    if (statusOf(err) !== 422)
                        throw err
                    if (await found(this.gh.rest.issues.getLabel({ ...loc, name })) === null)
                        throw new Error(`label "${name}" cannot be created on GitHub (HTTP 422: ${(err as Error).message})`, { cause: err })
                })
            known.add(name.toLowerCase())
        }
    }

    /*  delete the "ase:<key>:<value>" labels no longer used by any issue  */
    private async collectLabels (loc: Repo, names: string[]): Promise<void> {
        for (const name of names) {
            if (!LABEL_KEY_RE.test(name) || name.includes(","))
                continue
            const r = await this.gh.rest.issues.listForRepo({ ...loc, labels: name, state: "all", per_page: 1 })
            if (r.data.length === 0) {
                await found(this.gh.rest.issues.deleteLabel({ ...loc, name }))
                this.labels.get(`${loc.owner}/${loc.repo}`)?.delete(name.toLowerCase())
            }
        }
    }

    /*  the number of a milestone by its title (created on demand)  */
    private async milestone (loc: Repo, title: string): Promise<number> {
        const key = `${loc.owner}/${loc.repo}`
        let map   = this.milestones.get(key)
        if (map === undefined) {
            const milestones = await this.gh.paginate(this.gh.rest.issues.listMilestones, { ...loc, state: "all", per_page: 100 })
            map = new Map(milestones.map((milestone) => [ milestone.title, milestone.number ]))
            this.milestones.set(key, map)
        }
        let number = map.get(title)
        if (number === undefined) {
            number = (await this.gh.rest.issues.createMilestone({ ...loc, title })).data.number
            map.set(title, number)
        }
        return number
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
            if (logins.includes(assignee))
                assignees = logins
            else if (await found(this.gh.rest.issues.checkUserCanBeAssigned({ ...loc, assignee })) !== null)
                assignees = [ assignee ]
            else
                labels.push(`ase:Assignee:${assignee}`)
        }
        await this.ensureLabels(loc, labels)
        return { labels, assignees }
    }

    /*  run a relation request natively; returns false if the GitHub instance lacks the
        relation (answering "404", remembered per repository, e.g. on older GitHub
        Enterprise Server versions), so the relation has to fall back onto its label  */
    private async native (loc: Repo, relation: "Group" | "After", request: () => Promise<unknown>): Promise<boolean> {
        const key = `${loc.owner}/${loc.repo}`
        let unsupported = this.unsupported.get(key)
        if (unsupported?.has(relation))
            return false
        try {
            await request()
            return true
        }
        catch (err: unknown) {
            if (statusOf(err) !== 404)
                throw err
            if (unsupported === undefined) {
                unsupported = new Set()
                this.unsupported.set(key, unsupported)
            }
            unsupported.add(relation)
            return false
        }
    }

    /*  synchronize the parent issue (keeping a parent of a foreign repository if none is
        wanted); returns whether it is carried natively  */
    private async syncParent (loc: Repo, issue: Issue, parent: Issue | null): Promise<boolean> {
        const current = parentOf(loc, issue)
        if (parent !== null && parent.number !== current)
            return this.native(loc, "Group", () =>
                this.gh.rest.issues.addSubIssue({ ...loc, issue_number: parent.number, sub_issue_id: issue.id, replace_parent: true }))
        else if (parent === null && current !== null)
            await this.gh.rest.issues.removeSubIssue({ ...loc, issue_number: current, sub_issue_id: issue.id })
        return true
    }

    /*  synchronize the blocking issues (within the repository); returns whether
        all of them are carried natively  */
    private async syncBlockers (loc: Repo, issue: Issue, after: Issue[]): Promise<boolean> {
        const current = await this.blockers(loc, issue)
        const have    = new Set(current.map((blocker) => blocker.number))
        const want    = new Set(after.map((blocker) => blocker.number))
        let native    = true
        for (const blocker of after)
            if (!have.has(blocker.number))
                native = await this.native(loc, "After", () =>
                    this.gh.rest.issues.addBlockedByDependency({ ...loc, issue_number: issue.number, issue_id: blocker.id })) && native
        for (const blocker of current)
            if (!want.has(blocker.number))
                await this.gh.rest.issues.removeDependencyBlockedBy({ ...loc, issue_number: issue.number, issue_id: blocker.id })
        return native
    }

    /*  synchronize the comments with the attachments, touching changed ones only
        (see the common issue tracker parts)  */
    private async syncComments (loc: Repo, issue: Issue, attachments: API.TaskAttachment[]): Promise<void> {
        const comments = await this.comments(loc, issue)
        const ops = TaskIssues.attachmentSync(comments.map((comment) => this.attachment(comment)), attachments)
        for (const op of ops) {
            if (op.op === "delete")
                await this.gh.rest.issues.deleteComment({ ...loc, comment_id: comments[op.index].id })
            else if (op.op === "create")
                await this.gh.rest.issues.createComment({ ...loc, issue_number: issue.number, body: TaskIssues.attachmentComment(op.attachment) })
            else
                await this.gh.rest.issues.updateComment({ ...loc, comment_id: comments[op.index].id, body: TaskIssues.attachmentComment(op.attachment) })
        }
    }

    /*  remember an issue written by this plugin instance: its update time, so the change
        detection does not report it as an external change, and the issue itself, so the
        listings (which lag behind the writes on GitHub) show it immediately  */
    private written (prjId: string, issue: Issue): void {
        this.pollState(prjId).seen.set(issue.number, issue.updated_at)
        this.loads.delete(`${prjId}#${issue.number}`)
        let recent = this.recent.get(prjId)
        if (recent === undefined) {
            recent = new Map()
            this.recent.set(prjId, recent)
        }
        recent.set(issue.number, { issue, at: Date.now() })
    }

    /*  overlay the recently written issues (of the last 60 seconds) onto a listing,
        where the listed issue is not yet present or older  */
    private overlay (prjId: string, issues: Issue[]): Issue[] {
        const recent = this.recent.get(prjId)
        if (recent === undefined)
            return issues
        const byNumber = new Map(issues.map((issue) => [ issue.number, issue ]))
        for (const [ n, { issue, at } ] of recent) {
            const listed = byNumber.get(n)
            if (Date.now() - at > 60 * 1000)
                recent.delete(n)
            else if (listed === undefined || listed.updated_at < issue.updated_at)
                byNumber.set(n, issue)
        }
        return [ ...byNumber.values() ]
    }

    /*  load a live issue together with its blocking issues and comments (the issue and
        its comments in parallel), reusing a load of the last 2 seconds (dropped on any
        own write, revision determination, or detected change of the issue), as e.g. the
        boards load the plan and its attachments in separate operations  */
    private load (prjId: string, loc: Repo, n: number): Promise<{ issue: Issue, after: Issue[], comments: Comment[] } | null> {
        return TaskIssues.memoize(this.loads, `${prjId}#${n}`, async () => {
            const [ issue, comments ] = await Promise.all([
                this.fetch(loc, n),
                n === 0 ? [] : found(this.gh.paginate(this.gh.rest.issues.listComments,
                    { ...loc, issue_number: n, per_page: 100 }) as Promise<Comment[]>)
            ])
            if (issue === null)
                return null
            return { issue, after: await this.blockers(loc, issue), comments: comments ?? [] }
        })
    }

    /*  ==== task plans ====  */

    async taskList (prjId: string): Promise<API.TaskEntry[]> {
        const { loc, lifecycle, scheme } = await this.context(prjId)
        const issues = this.overlay(prjId,
            await this.gh.paginate(this.gh.rest.issues.listForRepo, { ...loc, state: "all", per_page: 100 }) as Issue[])
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
            header:     this.header(loc, lifecycle, scheme, issue, after),
            body:       TaskIssues.issueBody(issue.title, issue.body),
            attachment: comments.map((comment) => this.attachment(comment))
        }
    }

    /*  the revision of a task plan: the update time of its live issue, dropping its
        cached load, so a subsequent load is never older than this revision  */
    async taskRevision (prjId: string, taskId: string): Promise<string | null> {
        const { loc, scheme } = await this.context(prjId)
        const number   = numberOf(scheme, taskId)
        const revision = (await this.fetch(loc, number))?.updated_at ?? null
        this.loads.delete(`${prjId}#${number}`)
        return revision
    }

    /*  create or update the issue of a task plan: all references are resolved
        upfront, a new task can only be the next issue number, and the issue itself
        is updated last, so its update time covers the relation and comment changes,
        where an expected revision is checked before any modification  */
    async taskSave (prjId: string, taskId: string, plan: API.TaskPlan, revision?: string): Promise<API.TaskWriteResult> {
        const { loc, lifecycle, scheme } = await this.context(prjId)
        const number = numberOf(scheme, taskId)
        if (number === 0)
            throw new Error(`task id "${taskId}" is no issue number rendered through the "seq" task id scheme of the project`)
        let issue    = await this.fetch(loc, number)
        if (revision !== undefined && issue?.updated_at !== revision)
            return "changed"
        const result: API.WriteResult = issue !== null ? "updated" : "created"
        const group  = plan.header.Group
        const parent = typeof group === "string" && group !== "" ? await this.target(loc, scheme, "Group", group) : null
        const after  = await Promise.all((Array.isArray(plan.header.After) ? plan.header.After : [])
            .map((id) => this.target(loc, scheme, "After", id)))
        const phase  = plan.header.Phase
        const milestone = typeof phase === "string" && phase !== "" ? await this.milestone(loc, phase) : null
        const { labels, assignees } = await this.assign(loc, plan.header, issue)
        const status = TaskFormat.taskStatus(plan.header, lifecycle)
        const closed = lifecycle.finished.includes(status)
        const { title, body } = TaskIssues.planIssue(taskId, plan)
        if (issue === null) {
            /*  reject a task id deviating from the next issue number, and
                discard an issue which lost the race for this number  */
            const next = await this.latestNumber(loc, true) + 1
            if (number !== next)
                throw new Error(`task "${taskId}" cannot be created, as the next issue will be "${idOf(scheme, next)}"`)
            issue = (await this.gh.rest.issues.create({ ...loc, title, body, labels, assignees, milestone })).data as Issue
            if (issue.number !== number) {
                await this.ensureLabels(loc, [ LABEL_DELETED ])
                await this.gh.rest.issues.update({
                    ...loc, issue_number: issue.number, state: "closed", state_reason: "not_planned",
                    labels: [ ...labels, LABEL_DELETED ]
                })
                throw new Error(`task "${taskId}" cannot be created, as issue "${idOf(scheme, number)}" was created concurrently`)
            }
        }
        /*  fall back onto the labels of the relations not carried natively  */
        const fallback: string[] = []
        if (!await this.syncParent(loc, issue, parent) && parent !== null)
            fallback.push(`ase:Group:${idOf(scheme, parent.number)}`)
        if (!await this.syncBlockers(loc, issue, after))
            fallback.push(`ase:After:${after.map((blocker) => idOf(scheme, blocker.number)).join(" ")}`)
        for (const name of fallback)
            if (name.length > 50)
                throw new Error(`label "${name}" cannot be carried by GitHub, as it exceeds 50 characters`)
        await this.ensureLabels(loc, fallback)
        labels.push(...fallback)
        await this.syncComments(loc, issue, plan.attachment)
        const updated = (await this.gh.rest.issues.update({
            ...loc, issue_number: number, title, body, labels, assignees, milestone,
            state: closed ? "closed" : "open",
            ...(closed ? { state_reason: status === "CANCELLED" ? "not_planned" as const : "completed" as const } : {})
        })).data as Issue
        this.written(prjId, updated)
        await this.collectLabels(loc, labelNames(issue).filter((name) => !labels.includes(name)))
        return result
    }

    /*  soft delete the issue of a task plan: closed as "not planned" and marked as deleted  */
    async taskDelete (prjId: string, taskId: string): Promise<boolean> {
        const { loc, scheme } = await this.context(prjId)
        const issue = await this.fetch(loc, numberOf(scheme, taskId))
        if (issue === null)
            return false
        await this.ensureLabels(loc, [ LABEL_DELETED ])
        const updated = (await this.gh.rest.issues.update({
            ...loc, issue_number: issue.number, state: "closed", state_reason: "not_planned",
            labels: [ ...labelNames(issue), LABEL_DELETED ]
        })).data as Issue
        this.written(prjId, updated)
        return true
    }

    /*  renaming is impossible, as the task id is the issue number  */
    async taskRename (prjId: string, oldId: string, newId: string): Promise<boolean> {
        const { loc, scheme } = await this.context(prjId)
        if (await this.fetch(loc, numberOf(scheme, oldId)) === null)
            return false
        throw new Error(`task "${oldId}" cannot be renamed to "${newId}", as task ids are GitHub issue numbers`)
    }

    /*  ==== change detection ====  */

    /*  poll the issues of a project updated since the last poll, conditionally
        via the entity tag of the last poll (a "304" answer is free of rate limit),
        and report the issues not seen at their update time yet: as added if created
        after the opening, as deleted if soft deleted, else as updated (issues deleted
        on GitHub are not reported, as GitHub reports no deletions)  */
    protected async pollProject (prjId: string): Promise<void> {
        const listener = this.listener
        if (listener === null || await this.registered(prjId) === null)
            return
        const { loc, lifecycle, scheme } = await this.context(prjId)
        const state  = this.pollState(prjId)
        const params = { ...loc, state: "all" as const, sort: "updated" as const, direction: "asc" as const, since: state.since, per_page: 100 }
        let issues: Issue[]
        try {
            const r = await this.gh.request("GET /repos/{owner}/{repo}/issues", {
                ...params, headers: state.etag !== undefined ? { "if-none-match": state.etag } : {}
            })
            state.etag = r.headers.etag
            issues = r.data as Issue[]
            if (issues.length === params.per_page)
                issues.push(...await this.gh.paginate("GET /repos/{owner}/{repo}/issues", { ...params, page: 2 }) as Issue[])
        }
        catch (err: unknown) {
            if (statusOf(err) === 304)
                return
            throw err
        }
        const change = { added: [] as API.TaskEntry[], updated: [] as API.TaskEntry[], deleted: [] as string[] }
        for (const issue of issues) {
            if (issue.pull_request !== undefined && issue.pull_request !== null)
                continue
            if (issue.updated_at > state.since)
                state.since = issue.updated_at
            if (state.seen.get(issue.number) === issue.updated_at)
                continue
            const known = state.seen.has(issue.number)
            state.seen.set(issue.number, issue.updated_at)
            this.loads.delete(`${prjId}#${issue.number}`)
            if (!live(issue))
                change.deleted.push(idOf(scheme, issue.number))
            else if (!known && issue.created_at >= this.opened)
                change.added.push(await this.entry(loc, lifecycle, scheme, issue))
            else
                change.updated.push(await this.entry(loc, lifecycle, scheme, issue))
        }
        if (this.timer !== null && (change.added.length > 0 || change.updated.length > 0 || change.deleted.length > 0))
            listener(prjId, change)
    }
}

/*  the plugin factory  */
const factory: API.TaskStoragePluginFactory = (ctx) => new GitHubTaskStoragePlugin(ctx)
export default factory

