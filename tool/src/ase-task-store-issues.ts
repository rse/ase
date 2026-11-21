/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import { DateTime }        from "luxon"
import type { LRUCache }   from "lru-cache"

import type * as API       from "./ase-task-store-plugin-api.js"
import * as TaskFormat     from "./ase-task-format.js"

/*  the common parts of the storage plugins persisting the task plans as the issues
    of an issue tracker (GitHub, GitLab, Gitea): the task ids of the issue numbers, the
    reserved labels, and the codecs of the registry, header, body, and attachments  */

/*  the "seq" task id scheme, the only one whose ids can be issue numbers  */
export type SeqScheme = Extract<TaskFormat.TaskIdScheme, { kind: "seq" }>

/*  the registry entry of a project: its lifecycle model, task id scheme, and the
    optional high-water mark of its sequence numbers (only persisted by Gitea)  */
export type RegistryEntry = { lifecycle: string, idscheme: string, seqmark?: number }

/*  the reserved labels: the project registry entry (carrying the lifecycle model
    and task id scheme in its description), the soft deletion marker, and the
    "ase:<key>:<value>" labels of the header keys without a native counterpart  */
export const LABEL_PROJECT = "ase:project"
export const LABEL_DELETED = "ase:deleted"
export const LABEL_KEY_RE  = /^ase:([A-Za-z]+):(.*)$/

/*  the hidden metadata header of an attachment comment  */
const ATTACH_RE = /^<!-- ase:attachment\n([\s\S]*?)\n-->\n?([\s\S]*)$/

/*  escape a hidden metadata value, so it can never close the HTML comment  */
const escapeValue   = (value: string): string => value.replace(/&/g, "&amp;").replace(/-->/g, "--&gt;")
const unescapeValue = (value: string): string => value.replace(/--&gt;/g, "-->").replace(/&amp;/g, "&")

/*  the timestamp of the task plan format for an ISO timestamp of the issue tracker  */
export const stamp = (iso: string): string => DateTime.fromISO(iso).toFormat("yyyy-LL-dd HH:mm")

/*  the task id of an issue number, and the issue number of a task id (0 if not conforming)  */
export const idOf = (scheme: SeqScheme, n: number): string =>
    `${scheme.prefix}${String(n).padStart(scheme.width, "0")}${scheme.suffix}`
export const numberOf = (scheme: SeqScheme, id: string): number => {
    const n = TaskFormat.seqNumber(scheme, id)
    return n > 0 && idOf(scheme, n) === id ? n : 0
}

/*  the description of the "ase:project" label for a registry entry, and vice versa  */
export const registryDescription = (entry: RegistryEntry): string =>
    `lifecycle=${entry.lifecycle} idscheme=${entry.idscheme}` + ((entry.seqmark ?? 0) > 0 ? ` seqmark=${String(entry.seqmark)}` : "")
export const registryEntry = (description: string | null | undefined): RegistryEntry => {
    const m = /^lifecycle=(\S+) idscheme=(\S+)(?: seqmark=(\d+))?$/.exec(description ?? "")
    return {
        lifecycle: m?.[1] ?? "solo",
        idscheme:  m?.[2] ?? "seq:#%d",
        ...(m?.[3] !== undefined ? { seqmark: Number.parseInt(m[3], 10) } : {})
    }
}

/*  reject a task id scheme of a project registration other than a "seq" one  */
export const requireSeqScheme = (idscheme: string, service: string): void => {
    if (TaskFormat.parseIdScheme(idscheme).kind !== "seq")
        throw new Error(`task id scheme "${idscheme}" not supported, as task ids are ${service} issue numbers ` +
            "(use a \"seq\" task id scheme like \"seq:#%d\")")
}

/*  the lifecycle model and "seq" task id scheme of the registry entry of a project  */
export type RegistryContext = { lifecycle: TaskFormat.TaskLifecycle, scheme: SeqScheme }
export const registryContext = (prjId: string, entry: RegistryEntry, service: string): RegistryContext => {
    const lifecycle = Object.hasOwn(TaskFormat.taskLifecycles, entry.lifecycle) ?
        TaskFormat.taskLifecycles[entry.lifecycle] : TaskFormat.taskLifecycles.solo
    const scheme = TaskFormat.parseIdScheme(entry.idscheme)
    if (scheme.kind !== "seq")
        throw new Error(`project "${prjId}" carries task id scheme "${entry.idscheme}", but ${service} requires a "seq" one`)
    return { lifecycle, scheme }
}

/*  decode the labels of an issue into the header: the "ase:<key>:<value>" labels of the
    keys without native counterpart (and of an unassignable "Assignee") and the tags, with
    a legacy "ase:Branch:<name>" label migrated into "Changeset" (see TaskFormat.migrateBranch);
    returns the state of the "ase:Status:<state>" label, as it only refines the issue state  */
export const labelHeader = (header: API.TaskHeader, names: string[], nativeKeys: string[]): string | undefined => {
    const tags: string[] = []
    let status: string | undefined
    let branch: string | undefined
    for (const name of names) {
        const m = LABEL_KEY_RE.exec(name)
        if (m === null && !name.startsWith("ase:"))
            tags.push(name)
        else if (m !== null && m[1] === "Status")
            status = m[2]
        else if (m !== null && m[1] === "Branch")
            branch = m[2]
        else if (m !== null && (!nativeKeys.includes(m[1]) || m[1] === "Assignee"))
            header[m[1]] = m[2]
    }
    if (tags.length > 0)
        header.Tags = tags
    if (branch !== undefined) {
        const changeset = TaskFormat.migrateBranch(branch)
        if (changeset !== undefined && header.Changeset === undefined)
            header.Changeset = changeset
    }
    return status
}

/*  encode the header into labels: the "ase:<key>:<value>" labels of the keys
    without native counterpart and the tags (except the reserved "ase:" ones)  */
export const headerLabels = (header: API.TaskHeader, nativeKeys: string[]): string[] => {
    const labels: string[] = []
    for (const [ key, value ] of Object.entries(header))
        if (!nativeKeys.includes(key) && typeof value === "string")
            labels.push(`ase:${key}:${value}`)
    for (const tag of Array.isArray(header.Tags) ? header.Tags : []) {
        if (tag.startsWith("ase:"))
            throw new Error(`tag "${tag}" collides with the reserved "ase:" labels`)
        labels.push(tag)
    }
    return labels
}

/*  derive "Status" from the issue state: a closed issue carries a finished state
    ("CANCELLED" if cancelled, else the finished one of its label, else the first
    finished one), an open issue the unfinished one of its label (else none)  */
export const issueStatus = (lifecycle: TaskFormat.TaskLifecycle, closed: boolean, cancelled: boolean,
    label: string | undefined): string | undefined => {
    if (closed)
        return cancelled ? "CANCELLED" :
            label !== undefined && label !== "CANCELLED" && lifecycle.finished.includes(label) ? label : lifecycle.finished[0]
    return label !== undefined && !lifecycle.finished.includes(label) ? label : undefined
}

/*  derive the body of a task plan from an issue: the "#   TASK:" heading from the
    issue title plus the issue body, and the issue title and body from a task plan  */
export const issueBody = (title: string, text: string | null | undefined): string => {
    const body = (text ?? "").replace(/\r\n/g, "\n").replace(/\n+$/, "")
    return `#   TASK: ${title}\n` + (body !== "" ? `\n${body}\n` : "")
}
export const planIssue = (taskId: string, plan: API.TaskPlan): { title: string, body: string } => ({
    title: TaskFormat.taskTitle(plan.body) || taskId,
    body:  plan.body.replace(/^#[ \t]+TASK:.*(?:\n|$)/m, "").replace(/^\n+/, "").replace(/\n+$/, "")
})

/*  whether an attachment is embedded as-is (Markdown) instead of as fenced code block  */
const isMarkdown = (type: string | undefined): boolean => /^text\/markdown\b/i.test(type ?? "")

/*  whether two attachments are equal  */
export const same = (a: API.TaskAttachment, b: API.TaskAttachment): boolean => {
    const ka = Object.keys(a).sort()
    const kb = Object.keys(b).sort()
    return ka.length === kb.length && ka.every((key, i) => key === kb[i] && a[key] === b[key])
}

/*  derive the attachment of a comment: an attachment comment carries its keys in
    the hidden metadata header (with "Data" giving the "|4+" or "|4-" chomping)
    followed by the data (fenced, unless Markdown), with a legacy "preflight" draft
    kind migrated into "draft" (see TaskFormat.migrateAttachment), and any other
    comment reads as a Markdown attachment  */
export const commentAttachment = (body: string | null | undefined, author: string,
    created: string, modified: string): API.TaskAttachment => {
    const text = (body ?? "").replace(/\r\n/g, "\n")
    const m    = ATTACH_RE.exec(text)
    if (m === null)
        return {
            Type:     "text/markdown",
            Desc:     `comment by @${author}`,
            Created:  stamp(created),
            Modified: stamp(modified),
            Data:     text
        }
    const attachment: API.TaskAttachment = {}
    let chomp: string | undefined
    for (const line of m[1].split("\n")) {
        const kv = /^([A-Za-z]+):[ \t]*(.*)$/.exec(line)
        if (kv === null)
            continue
        if (kv[1] === "Data")
            chomp = kv[2].trim()
        else
            attachment[kv[1]] = unescapeValue(kv[2].trimEnd())
    }
    if (chomp !== undefined) {
        const data = isMarkdown(attachment.Type) ?
            m[2].replace(/\n+$/, "") :
            m[2].replace(/^[^\n]*\n/, "").replace(/\n?[^\n]*$/, "")
        attachment.Data = data !== "" && chomp !== "|4-" ? `${data}\n` : data
    }
    return TaskFormat.migrateAttachment(attachment)
}

/*  render the comment of an attachment (see above), with the key column rule
    of TaskFormat.keyLine (a key too long for the column keeps one space)  */
export const attachmentComment = (attachment: API.TaskAttachment): string => {
    const lines = Object.keys(attachment).filter((key) => key !== "Data")
        .map((key) => `${key}:`.padEnd(Math.max(11, key.length + 2)) + escapeValue(attachment[key]))
    let text = ""
    if (attachment.Data !== undefined) {
        const data = attachment.Data.replace(/\n$/, "")
        lines.push("Data:".padEnd(11) + (attachment.Data !== "" && !attachment.Data.endsWith("\n") ? "|4-" : "|4+"))
        if (isMarkdown(attachment.Type))
            text = data
        else {
            const fence = "`".repeat(Math.max(3, ...Array.from(data.matchAll(/`+/g), (run) => run[0].length + 1)))
            const lang  = /diff/i.test(attachment.Type ?? "") ? "diff" : /yaml/i.test(attachment.Type ?? "") ? "yaml" : ""
            text = `${fence}${lang}\n${data}${data !== "" ? "\n" : ""}${fence}`
        }
    }
    return `<!-- ase:attachment\n${lines.join("\n")}\n-->\n${text}`
}

/*  an operation synchronizing the comments of an issue with the attachments of a
    task plan, referencing an existing comment by its position among the comments  */
export type SyncOp =
    { op: "update", index: number, attachment: API.TaskAttachment } |
    { op: "delete", index: number } |
    { op: "create", attachment: API.TaskAttachment }

/*  determine the operations synchronizing the comments (given by their attachments)
    with the wanted attachments: the attachments of their longest common subsequence
    keep their comments untouched, and in each gap before a kept attachment (and in the
    final gap) the remaining ones are paired by position and updated, with surplus
    comments deleted and surplus attachments created, so deleting or changing an
    attachment touches its own comment only (and never the ones of others, like the
    comments of humans); as comments can only be appended, an attachment inserted
    before a kept one falls back to the rewriting of all comments by position  */
export const attachmentSync = (current: API.TaskAttachment[], wanted: API.TaskAttachment[]): SyncOp[] => {
    /*  determine the equality of all attachment pairs and the lengths
        of the longest common subsequences of all suffix pairs  */
    const n   = current.length
    const m   = wanted.length
    const eq  = Array.from({ length: n }, () => new Array<boolean>(m).fill(false))
    const lcs = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
    for (let i = n - 1; i >= 0; i--)
        for (let j = m - 1; j >= 0; j--) {
            eq[i][j]  = same(current[i], wanted[j])
            lcs[i][j] = eq[i][j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
        }

    /*  determine the pairs of the longest common subsequence (plus the end as sentinel)  */
    const pairs: [ number, number ][] = []
    for (let i = 0, j = 0; i < n && j < m;) {
        if (eq[i][j])
            pairs.push([ i++, j++ ])
        else if (lcs[i + 1][j] >= lcs[i][j + 1])
            i++
        else
            j++
    }
    pairs.push([ n, m ])

    /*  synchronize the gaps before the pairs  */
    const ops: SyncOp[] = []
    let i = 0
    let j = 0
    for (const [ pi, pj ] of pairs) {
        const olds = pi - i
        const news = pj - j
        if (news > olds && pi < n) {
            /*  fallback: rewrite all comments by position  */
            ops.length = 0
            for (let k = 0; k < Math.max(n, m); k++) {
                if (k >= m)
                    ops.push({ op: "delete", index: k })
                else if (k >= n)
                    ops.push({ op: "create", attachment: wanted[k] })
                else if (!eq[k][k])
                    ops.push({ op: "update", index: k, attachment: wanted[k] })
            }
            break
        }
        for (let k = 0; k < Math.max(olds, news); k++) {
            if (k >= news)
                ops.push({ op: "delete", index: i + k })
            else if (k >= olds)
                ops.push({ op: "create", attachment: wanted[j + k] })
            else
                ops.push({ op: "update", index: i + k, attachment: wanted[j + k] })
        }
        i = pi + 1
        j = pj + 1
    }
    return ops
}

/*  the change detection state of a project: the "since" timestamp and the (optional)
    entity tag of the last poll, and the last seen update time per issue number  */
export type PollState = { since: string, etag?: string, seen: Map<number, string> }

/*  reuse the cached promise of a load, else start the load and cache its promise
    (dropped again on failure), so repeated and concurrent loads share one request  */
export const memoize = <T>(cache: LRUCache<string, Promise<T>>, key: string, load: () => Promise<T>): Promise<T> => {
    let promise = cache.get(key)
    if (promise === undefined) {
        promise = load()
        cache.set(key, promise)
        promise.catch(() => {
            cache.delete(key)
        })
    }
    return promise
}

/*  the common base of the issue tracker storage plugins: the projects mapped onto
    their locations, the storage lifecycle polling for changes while opened and
    observed (without keeping the process alive), and the project listing  */
export abstract class IssueTaskStoragePlugin<L> {
    protected url       = ""
    protected poll      = 0
    protected repos     = new Map<string, L>()
    protected listener: ((prjId: string, change: API.TaskChange) => void) | null = null
    protected timer:    ReturnType<typeof setInterval> | null = null
    protected opened:   string
    private   polling   = false
    private   polls     = new Map<string, PollState>()

    constructor (protected ctx: API.TaskStorageContext, private unit: string, private now: () => string) {
        this.opened = now()
    }

    /*  take over the URL of the instance (default scheme "https") and the polling interval, else throw  */
    protected configure (plugin: string, service: string, url: string, poll: number | undefined): URL {
        let base: URL | null = null
        try {
            base = new URL(typeof url === "string" && !/^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? `https://${url}` : url)
        }
        catch {
            /*  reported below  */
        }
        if (base === null || !/^https?:$/.test(base.protocol) || base.search !== "" || base.hash !== "")
            throw new Error(`task store: plugin "${plugin}" received invalid URL "${String(url)}" of the ${service} instance`)
        this.url  = base.href.replace(/\/+$/, "")
        this.poll = poll ?? 60
        if (typeof this.poll !== "number" || !Number.isFinite(this.poll) || (this.poll !== 0 && (this.poll < 1 || this.poll > 86400)))
            throw new Error(`task store: plugin "${plugin}" requires a "poll" interval of 0 (disabled) resp. 1 to 86400 seconds`)
        return base
    }

    /*  get a registered project, and poll the issues of a project for changes  */
    abstract projectGet (prjId: string): Promise<API.ProjectEntry | null>
    protected abstract pollProject (prjId: string): Promise<void>

    /*  the storage lifecycle  */
    async open (): Promise<void> {
        this.opened = this.now()
        if (this.poll > 0 && this.listener !== null) {
            this.timer = setInterval(() => {
                this.pollAll().catch(() => {
                    /*  failures are already logged per project  */
                })
            }, this.poll * 1000)
            this.timer.unref()
        }
        this.ctx.log("debug", `opened ${this.repos.size} ${this.unit} on ${this.url} (polling every ${this.poll}s)`)
    }
    async close (): Promise<void> {
        if (this.timer !== null)
            clearInterval(this.timer)
        this.timer = null
    }

    /*  observe the changes of the issues made outside of this plugin instance  */
    watch (listener: (prjId: string, change: API.TaskChange) => void): void {
        this.listener = listener
    }

    /*  list the registered ones of the mapped projects  */
    async projectList (): Promise<API.ProjectEntry[]> {
        const out: API.ProjectEntry[] = []
        for (const prjId of this.repos.keys()) {
            const entry = await this.projectGet(prjId)
            if (entry !== null)
                out.push(entry)
        }
        return out
    }

    /*  the change detection state of a project (starting at the opening time)  */
    protected pollState (prjId: string): PollState {
        let state = this.polls.get(prjId)
        if (state === undefined) {
            state = { since: this.opened, seen: new Map() }
            this.polls.set(prjId, state)
        }
        return state
    }

    /*  poll all mapped projects, never overlapping itself  */
    private async pollAll (): Promise<void> {
        if (this.polling)
            return
        this.polling = true
        try {
            for (const prjId of this.repos.keys())
                await this.pollProject(prjId).catch((err: unknown) => {
                    this.ctx.log("warning", `polling project "${prjId}" failed: ${err instanceof Error ? err.message : String(err)}`)
                })
        }
        finally {
            this.polling = false
        }
    }
}

