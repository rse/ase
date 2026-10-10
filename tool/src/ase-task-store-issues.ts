/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import { DateTime }        from "luxon"

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
        let data = m[2]
        if (!isMarkdown(attachment.Type))
            data = data.replace(/^[^\n]*\n/, "").replace(/\n?[^\n]*$/, "")
        data = data.replace(/\n+$/, "")
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
            text = `${fence}${/diff/i.test(attachment.Type ?? "") ? "diff" : ""}\n${data}${data !== "" ? "\n" : ""}${fence}`
        }
    }
    return `<!-- ase:attachment\n${lines.join("\n")}\n-->\n${text}`
}

