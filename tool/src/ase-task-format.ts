/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import type * as API from "./ase-task-store-plugin-api.js"

/*  a task lifecycle model: the lifecycle states a task plan can be in
    (the accepted values of its "Status:" frontmatter key), the initial
    state an absent key reads as, the "finished" states, and the allowed
    state transitions (from each state to its successor states)  */
export type TaskLifecycle = {
    name: string, states: string[], initial: string, finished: string[],
    transitions: Record<string, string[]>
}

/*  the pre-defined task lifecycle models (see "project.task.lifecycle")  */
export const taskLifecycles: Record<string, TaskLifecycle> = {
    solo: {
        name:             "solo",
        states:           [ "OPEN", "SHELVED", "CLOSED", "CANCELLED" ],
        initial:          "OPEN",
        finished:         [ "CLOSED", "CANCELLED" ],
        transitions: {
            OPEN:         [ "SHELVED", "CLOSED", "CANCELLED" ],
            SHELVED:      [ "OPEN", "CANCELLED" ],
            CLOSED:       [],
            CANCELLED:    []
        }
    },
    team: {
        name:             "team",
        states:           [ "PLANNING", "SHELVED", "IMPLEMENTING", "STALLED", "IMPLEMENTED", "CANCELLED" ],
        initial:          "PLANNING",
        finished:         [ "IMPLEMENTED", "CANCELLED" ],
        transitions: {
            PLANNING:     [ "SHELVED", "IMPLEMENTING", "CANCELLED" ],
            SHELVED:      [ "PLANNING", "CANCELLED" ],
            IMPLEMENTING: [ "PLANNING", "STALLED", "IMPLEMENTED", "CANCELLED" ],
            STALLED:      [ "IMPLEMENTING", "CANCELLED" ],
            IMPLEMENTED:  [],
            CANCELLED:    []
        }
    },
    enterprise: {
        name:             "enterprise",
        states:           [
            "DRAFTED", "SHELVED", "PLANNING", "PLANNED", "STALLED", "IMPLEMENTING",
            "IMPLEMENTED", "DECLINED", "APPROVING", "APPROVED", "DEFERRED", "INTEGRATING",
            "INTEGRATED", "CANCELLED"
        ],
        initial:          "DRAFTED",
        finished:         [ "INTEGRATED", "CANCELLED" ],
        transitions: {
            DRAFTED:      [ "SHELVED", "PLANNING", "CANCELLED" ],
            SHELVED:      [ "DRAFTED", "CANCELLED" ],
            PLANNING:     [ "DRAFTED", "SHELVED", "PLANNED", "CANCELLED" ],
            PLANNED:      [ "STALLED", "IMPLEMENTING", "CANCELLED" ],
            STALLED:      [ "PLANNED", "CANCELLED" ],
            IMPLEMENTING: [ "DRAFTED", "PLANNED", "STALLED", "IMPLEMENTED", "CANCELLED" ],
            IMPLEMENTED:  [ "DECLINED", "APPROVING", "CANCELLED" ],
            DECLINED:     [ "IMPLEMENTED", "CANCELLED" ],
            APPROVING:    [ "DRAFTED", "PLANNED", "IMPLEMENTED", "DECLINED", "APPROVED", "CANCELLED" ],
            APPROVED:     [ "DEFERRED", "INTEGRATING", "CANCELLED" ],
            DEFERRED:     [ "APPROVED", "CANCELLED" ],
            INTEGRATING:  [ "DRAFTED", "PLANNED", "APPROVED", "DEFERRED", "INTEGRATED", "CANCELLED" ],
            INTEGRATED:   [],
            CANCELLED:    []
        }
    }
}

/*  the effective lifecycle status of a header: its "Status" key
    (upper-cased), or the initial state of the model if absent  */
export const taskStatus = (header: API.TaskHeader, lifecycle: TaskLifecycle): string => {
    const status = header.Status
    if (typeof status === "string" && status.trim() !== "")
        return status.trim().toUpperCase()
    return lifecycle.initial
}

/*  check a "Status" change against the task lifecycle model: returns
    an error (else empty) if the changed status is not a state of the
    model or not reachable from the old status via one or more transitions
    (as one operation may perform several stages); an old status foreign
    to the model may change to any state, to allow its correction  */
export const checkStatus = (lifecycle: TaskLifecycle, from: string, to: string): string => {
    if (to === from)
        return ""
    if (!lifecycle.states.includes(to))
        return `status "${to}" is not a state of the "${lifecycle.name}" task lifecycle model ` +
            `(expected one of: ${lifecycle.states.join(", ")})`
    if (!lifecycle.states.includes(from))
        return ""
    const seen  = new Set<string>([ from ])
    const queue = [ from ]
    while (queue.length > 0) {
        const state = queue.shift()!
        if (state === to)
            return ""
        for (const next of lifecycle.transitions[state] ?? [])
            if (!seen.has(next)) {
                seen.add(next)
                queue.push(next)
            }
    }
    return `status "${to}" is not reachable from status "${from}" in the "${lifecycle.name}" task lifecycle model`
}

/*  the states of the task lifecycle models, each mapped onto its candidate
    states in another model (tried after the state itself), where absent
    states fall back to the initial (resp. first finished) state only  */
const statusCandidates: Record<string, string[]> = {
    PLANNING:     [ "OPEN" ],
    PLANNED:      [ "PLANNING", "OPEN" ],
    IMPLEMENTING: [ "OPEN" ],
    STALLED:      [ "OPEN" ],
    DECLINED:     [ "IMPLEMENTING", "OPEN" ],
    IMPLEMENTED:  [ "INTEGRATED", "CLOSED" ],
    APPROVING:    [ "IMPLEMENTED", "CLOSED" ],
    APPROVED:     [ "IMPLEMENTED", "CLOSED" ],
    DEFERRED:     [ "IMPLEMENTED", "CLOSED" ],
    INTEGRATING:  [ "IMPLEMENTED", "CLOSED" ],
    INTEGRATED:   [ "IMPLEMENTED", "CLOSED" ],
    CLOSED:       [ "INTEGRATED", "IMPLEMENTED" ]
}

/*  map a status from one task lifecycle model onto another: the first
    candidate state present in the target model wins (for a finished
    status only a finished one), else the initial (resp. first finished)
    state; a status foreign to the source model is kept as-is  */
export const mapStatus = (from: TaskLifecycle, to: TaskLifecycle, status: string): string => {
    if (!from.states.includes(status))
        return status
    const finished = from.finished.includes(status)
    const mapped = [ status, ...(statusCandidates[status] ?? []) ]
        .find((state) => to.states.includes(state) && (!finished || to.finished.includes(state)))
    return mapped ?? (finished ? to.finished[0] : to.initial)
}

/*  resolve an "include" and an "exclude" comma-separated lifecycle
    state list into the effective state set a task plan has to be in
    to be listed at all; the "none" sentinel and empty tokens are
    silently dropped, the "finished" sentinel expands to the finished
    states of the task lifecycle model, an empty "include" list means
    all states, and the "exclude" list is applied after the "include" list  */
export const resolveStates = (lifecycle: TaskLifecycle, include: string, exclude: string): string[] => {
    const parse = (list: string) => list.split(",")
        .map((token) => token.trim())
        .filter((token) => token !== "" && token.toUpperCase() !== "NONE")
        .flatMap((token) => {
            const state = token.toUpperCase()
            if (state === "FINISHED")
                return lifecycle.finished
            if (!lifecycle.states.includes(state))
                throw new Error(`invalid state "${token}" ` +
                    `(expected one of: ${lifecycle.states.join(", ")}, or "finished")`)
            return [ state ]
        })
    const included = parse(include)
    const excluded = parse(exclude)
    const states   = (included.length > 0 ? included : lifecycle.states)
        .filter((state) => !excluded.includes(state))
    if (states.length === 0)
        throw new Error("\"include\" and \"exclude\" cancel out to an empty state set")
    return states
}

/*  the id pattern of projects and sessions, and the one of tasks
    (additionally allowing "#", as in ids like "#42", but no leading "-" or "_")  */
export const ID_RE      = /^[A-Za-z0-9_-]+$/
export const TASK_ID_RE = /^[A-Za-z0-9#][A-Za-z0-9#_-]*$/

/*  the reserved task id of the default task of a session  */
export const DEFAULT_TASK_ID = "default"

/*  a task id scheme (see "project.task.idscheme"): "slug[:<words>]" (the first
    <words> words of the title, lower-cased and joined with "-", default 2),
    "seq[:<template>]" (a sequence number rendered through a sprintf-style
    template with exactly one "%d" or "%0<width>d", default "%d"), or "any"
    (an arbitrary id, proposed by the caller), each with the regular expression
    "match" of its conforming ids (for "seq" capturing the sequence number)  */
export type TaskIdScheme = (
    { kind: "slug", words: number } |
    { kind: "seq", prefix: string, width: number, suffix: string } |
    { kind: "any" }
) & { match: string }

/*  the task id scheme callbacks, each mapping the optional argument
    <arg> of "<kind>[:<arg>]" onto the scheme or an error message  */
const idSchemes: Record<string, (arg: string | undefined) => TaskIdScheme | string> = {
    slug: (arg) => {
        if (arg !== undefined && !/^\d+$/.test(arg))
            return "word count has to be a number"
        const words = arg !== undefined ? Number.parseInt(arg, 10) : 2
        if (words < 1 || words > 16)
            return "word count has to be 1-16"
        return { kind: "slug", words, match: `^[a-z][a-z0-9]*(?:-[a-z0-9]+){0,${words - 1}}(?:-[0-9]+)?$` }
    },
    seq: (arg) => {
        const m = /^((?:[A-Za-z#][A-Za-z#_-]*)?)%(?:0(\d+))?d([A-Za-z#_-]*)$/.exec(arg ?? "%d")
        if (m === null)
            return "template has to contain exactly one \"%d\" or \"%0<width>d\" " +
                "and otherwise only the characters [A-Za-z#_-] (but not start with \"-\" or \"_\")"
        const width = m[2] !== undefined ? Number.parseInt(m[2], 10) : 0
        if (width > 16)
            return "width has to be 0-16"

        /*  prefix and suffix need no quoting, as [A-Za-z#_-] are no metacharacters  */
        const match = `^${m[1]}([0-9]${width > 0 ? `{${width},}` : "+"})${m[3]}$`
        return { kind: "seq", prefix: m[1], width, suffix: m[3], match }
    },
    any: (arg) => {
        if (arg !== undefined)
            return "scheme takes no argument"
        return { kind: "any", match: TASK_ID_RE.source }
    }
}

/*  parse a task id scheme specification  */
export const parseIdScheme = (spec: string): TaskIdScheme => {
    const m        = /^([a-z]+)(?::(.*))?$/.exec(spec)
    const callback = m !== null && Object.hasOwn(idSchemes, m[1]) ? idSchemes[m[1]] : undefined
    if (m === null || callback === undefined)
        throw new Error(`invalid task id scheme "${spec}" (expected "slug[:<words>]", "seq[:<template>]", or "any")`)
    const scheme = callback(m[2])
    if (typeof scheme === "string")
        throw new Error(`invalid task id scheme "${spec}" (${scheme})`)
    return scheme
}

/*  check a task id scheme specification: returns an error (else empty)  */
export const checkIdScheme = (spec: string): string => {
    try {
        parseIdScheme(spec)
        return ""
    }
    catch (err) {
        return err instanceof Error ? err.message : String(err)
    }
}

/*  derive a slug from a title: diacritics stripped (and "ß" expanded), lower-cased,
    and the first <words> alphanumeric words, starting with the first word
    beginning with a letter, joined with "-"  */
export const slugify = (title: string, words: number): string => {
    const list = title.normalize("NFKD").replace(/\p{M}/gu, "").replace(/ß/g, "ss").toLowerCase()
        .split(/[^a-z0-9]+/).filter((word) => word !== "")
    const i = list.findIndex((word) => /^[a-z]/.test(word))
    return i < 0 ? "" : list.slice(i, i + words).join("-")
}

/*  check whether a task id conforms to a task id scheme
    (the reserved default task id always conforms)  */
export const idConforms = (scheme: TaskIdScheme, id: string): boolean =>
    id === DEFAULT_TASK_ID || new RegExp(scheme.match).test(id)

/*  the warning (else empty) about a task id not conforming to a task id scheme  */
export const idWarning = (spec: string, id: string): string =>
    idConforms(parseIdScheme(spec), id) ? "" :
        `task id "${id}" does not conform to the task id scheme "${spec}" (see "project.task.idscheme")`

/*  the sequence number of a task id conforming to a "seq" task id scheme
    (else 0, as for all ids under any other scheme or beyond the safe integer range)  */
export const seqNumber = (scheme: TaskIdScheme, id: string): number => {
    if (scheme.kind !== "seq")
        return 0
    const n = Number.parseInt(new RegExp(scheme.match).exec(id)?.[1] ?? "0", 10)
    return Number.isSafeInteger(n) ? n : 0
}

/*  determine the next free task id of a task id scheme, given all existing
    task ids: for "seq" the highest number of all conforming ids and of the
    high-water mark "seqmark" (of the removed ids) plus one, for "slug" the slug
    of the title, and for "any" the proposed id (sanitized, else the slug of the
    title), where a taken slug or id gets a numeric suffix  */
export const nextTaskId = (scheme: TaskIdScheme, ids: string[], title = "", proposal = "", seqmark = 0): string => {
    const taken = new Set([ ...ids, DEFAULT_TASK_ID ])
    let base: string
    if (scheme.kind === "seq") {
        const n = ids.reduce((max, id) => Math.max(max, seqNumber(scheme, id)), seqmark) + 1
        return `${scheme.prefix}${String(n).padStart(scheme.width, "0")}${scheme.suffix}`
    }
    else if (scheme.kind === "slug")
        base = slugify(title, scheme.words)
    else
        base = proposal.trim().replace(/\s+/g, "-").replace(/[^A-Za-z0-9#_-]/g, "").replace(/^[_-]+/, "") || slugify(title, 2)
    if (base === "")
        throw new Error(`task id scheme "${scheme.kind}" requires a ` +
            (scheme.kind === "any" ? "proposed id or " : "") + "title with at least one word beginning with a letter")
    let id = base
    for (let n = 2; taken.has(id); n++)
        id = `${base}-${n}`
    return id
}

/*  compare two task ids in natural order (numbers by their value)  */
export const compareIds = (a: string, b: string): number =>
    a.localeCompare(b, "en", { numeric: true })

/*  the task id of a task text: the value of the "Id:" key of its frontmatter,
    or the empty string if absent  */
export const taskTextId = (text: string): string => {
    const fm = /^---\r?\n([\s\S]*?\r?\n)---\r?\n/.exec(text)
    return fm === null ? "" : (/^Id:[ \t]*(.*)$/m.exec(fm[1])?.[1].trim() ?? "")
}

/*  the fixed value of the "Type" frontmatter key  */
export const TASK_TYPE = "text/vnd.ase.task"

/*  the frontmatter keys of the task plan format in their canonical
    order, the array-typed ones among them, and the attachment keys
    in their canonical order (see "ase-format-task.md")  */
const frontKeys        = [ "Type", "Id", "Created", "Modified", "Group", "Phase", "After", "Status", "Assignee", "Kind", "Tags", "Source", "Changeset", "Target" ]
export const arrayKeys = [ "After", "Tags" ]
const attachKeys       = [ "Type", "Desc", "Created", "Modified", "Data", "File" ]

/*  the legacy task plan header lines, each mapped onto the
    frontmatter key which superseded it  */
const legacy = [
    { key: "Created",  re: /^⎈[ \t]+Created:[ \t]*(.*)$/m  },
    { key: "Modified", re: /^⚙[ \t]+Modified:[ \t]*(.*)$/m },
    { key: "Kind",     re: /^☯[ \t]+Kind:[ \t]*(.*)$/m     }
]

/*  the legacy lifecycle states of the pre-lifecycle-model task plan
    format, each mapped onto its candidate states in the current models
    (first candidate present in the configured model wins, otherwise
    the initial state of the model is used)  */
const legacyStates: Record<string, string[]> = {
    DRAFTED:   [],
    REJECTED:  [],
    APPROVED:  [ "PLANNED", "PLANNING", "OPEN" ],
    DEFERRED:  [ "SHELVED" ],
    STARTED:   [ "IMPLEMENTING", "OPEN" ],
    BLOCKED:   [ "STALLED", "OPEN" ],
    COMPLETED: [ "INTEGRATED", "IMPLEMENTED", "CLOSED" ],
    CANCELLED: [ "CANCELLED" ]
}

/*  migrate the legacy "Branch:" key (the branch the change set lands on, created
    from HEAD on demand) into "Changeset:" (created from the source on demand),
    where the legacy "current" (the checked-out branch) is the default "worktree":
    returns the "Changeset:" value, or undefined if the key is to be dropped only  */
export const migrateBranch = (branch: string): string | undefined =>
    branch !== "" && branch !== "current" ? `branch:${branch}` : undefined

/*  migrate the legacy "preflight" kind of an implementation draft attachment
    into "draft" (in place)  */
export const migrateAttachment = (att: API.TaskAttachment): API.TaskAttachment => {
    if (att.Type !== undefined && /^text\/x-diff\s*(?:;|$)/i.test(att.Type))
        att.Type = att.Type.replace(/(;\s*kind\s*=\s*)("?)preflight\2(\s*(?:;|$))/i, "$1$2draft$2$3")
    return att
}

/*  render a single key line with a column-aligned key
    (a key too long for the column keeps at least one separating space)  */
const keyLine = (key: string, value: string): string => {
    if (!/^[A-Za-z]+$/.test(key) || /[\r\n]/.test(value))
        throw new Error(`invalid key line for key "${key}" (key has to be alphabetic and value single-line)`)
    return value === "" ? key + ":" : (key + ":").padEnd(Math.max(11, key.length + 2)) + value
}

/*  the key line pattern of the frontmatter and attachment blocks
    (value to be right-trimmed by the caller, avoiding regex backtracking)  */
const keyLineRe = /^([A-Za-z]+):[ \t]*(.*)$/

/*  parse the frontmatter block of a plan text into its key/value pairs,
    keeping any non-key lines for a verbatim pass-through, plus the
    length of the block; returns null if the text carries no block  */
const parseFront = (text: string): { keys: Map<string, string>, other: string[], length: number } | null => {
    const fm = /^---\r?\n([\s\S]*?\r?\n)---\r?\n/.exec(text)
    if (fm === null)
        return null
    const keys  = new Map<string, string>()
    const other = [] as string[]
    for (const line of fm[1].split(/\r?\n/)) {
        const m = keyLineRe.exec(line)
        if (m !== null)
            keys.set(m[1], m[2].trimEnd())
        else if (line !== "")
            other.push(line)
    }
    return { keys, other, length: fm[0].length }
}

/*  order keys canonically, with any unknown keys trailing  */
const orderKeys = (canonical: string[], keys: string[]): string[] =>
    [ ...canonical.filter((key) => keys.includes(key)), ...keys.filter((key) => !canonical.includes(key)) ]

/*  re-assemble a frontmatter block with the keys in canonical order
    (unknown keys and non-key lines trailing) and the values re-aligned  */
const assembleFront = (keys: Map<string, string>, other: string[]): string => {
    const front = orderKeys(frontKeys, [ ...keys.keys() ]).map((key) => keyLine(key, keys.get(key)!))
    return `---\n${[ ...front, ...other ].join("\n")}\n---\n`
}

/*  normalize a legacy task plan text into the current Markdown frontmatter
    shape, so every consumer sees a single plan shape only: a plan
    carrying its metadata in the "#   TASK <id>: <title>" heading and
    the "⎈"/"⚙"/"☯" glyph header lines is first lifted into a
    frontmatter block; then the frontmatter block is migrated by
    inserting the mandatory "Type:" key, mapping a legacy "Status:" value
    onto the configured lifecycle model, rewriting the legacy "Properties:"
    key into "Tags:", rewriting the legacy "Branch:" key into "Changeset:",
    and re-ordering and re-aligning the keys; any content without a
    frontmatter block or task heading is passed through verbatim; absent
    optional keys are never materialized, as they read as their default
    value  */
export const normalizeTaskText = (id: string, text: string, lifecycle: TaskLifecycle): string => {
    if (text === "")
        return text

    /*  lift the heading and the glyph header lines into their frontmatter
        keys, with the task id taken from the authoritative filename-derived id  */
    if (!/^---\r?\n/.test(text)) {
        const heading = /^#[ \t]+TASK(?:[ \t]+[A-Za-z0-9#][A-Za-z0-9#_-]*)?[ \t]*:[ \t]*(.*)$/m.exec(text)
        if (heading === null)
            return text
        let body    = text.replace(heading[0], "")
        const front = [ keyLine("Id", id) ]
        for (const entry of legacy) {
            const m = entry.re.exec(body)
            if (m === null)
                continue
            front.push(keyLine(entry.key, m[1].trim()))
            body = body.replace(m[0], "")
        }
        text = `---\n${front.join("\n")}\n---\n\n` +
            `#   TASK: ${heading[1].trim()}\n\n` +
            body.replace(/^(?:[ \t]*\r?\n)+/, "")
    }

    /*  parse the frontmatter block into its key/value pairs  */
    const fm = parseFront(text)
    if (fm === null)
        return text
    const keys = fm.keys

    /*  a plan is legacy if it lacks the mandatory "Type:" key (or still
        carries the "Properties:" key), decided before "Type:" is inserted  */
    const isLegacy = !keys.has("Type") || keys.has("Properties")

    /*  insert the mandatory "Type:" key  */
    if (!keys.has("Type"))
        keys.set("Type", TASK_TYPE)

    /*  map a legacy "Status:" value unconditionally onto the configured
        lifecycle model, as legacy values like "APPROVED" or "DEFERRED"
        carry a different meaning than their same-named current states  */
    const status = keys.get("Status")
    if (isLegacy && status !== undefined && Object.hasOwn(legacyStates, status)) {
        const state = legacyStates[status].find((state) => lifecycle.states.includes(state))
        keys.set("Status", state ?? lifecycle.initial)
    }

    /*  rewrite the legacy "Properties:" key into "Tags:", where the
        legacy "grilled" property (a fully grilled plan) becomes one
        "grilled:" tag per section and any other property a plain tag  */
    const properties = keys.get("Properties")
    if (properties !== undefined) {
        keys.delete("Properties")
        const tags = properties.split(",")
            .map((token) => token.trim())
            .filter((token) => token !== "" && token.toLowerCase() !== "none")
            .flatMap((token) => token.toLowerCase() === "grilled" ?
                [ "grilled:specification", "grilled:design", "grilled:verification" ] : [ token ])
        if (tags.length > 0)
            keys.set("Tags", [ keys.get("Tags") ?? "", ...tags ].filter((tag) => tag !== "").join(", "))
    }

    /*  rewrite the legacy "Branch:" key into "Changeset:" (see migrateBranch)  */
    const branch = keys.get("Branch")
    if (branch !== undefined) {
        keys.delete("Branch")
        const changeset = migrateBranch(branch)
        if (changeset !== undefined && !keys.has("Changeset"))
            keys.set("Changeset", changeset)
    }

    /*  re-assemble the frontmatter block, followed by the untouched
        remainder of the plan  */
    return assembleFront(keys, fm.other) + text.slice(fm.length)
}

/*  track the fenced code block state across a body line: returns the
    opening fence, or an empty string if outside any fenced code block  */
export const fenceTrack = (fence: string, line: string): string => {
    const m = /^ {0,3}(`{3,}|~{3,})[ \t]*(.*)$/.exec(line)
    if (m !== null && fence === "")
        return m[1]
    else if (m !== null && m[2] === "" && m[1][0] === fence[0] && m[1].length >= fence.length)
        return ""
    return fence
}

/*  check whether a body survives a round-trip through the task plan text:
    returns null, or the reason why the parser would misread it -- a "---"
    line outside a fenced code block followed by a "Type:" line (read as an
    attachment start) or an unclosed fenced code block (swallowing all attachments)  */
export const bodyConflict = (body: string): string | null => {
    const lines = body.split(/\r?\n/)
    let fence = ""
    let open  = 0
    for (let i = 0; i < lines.length; i++) {
        const prev = fence
        fence = fenceTrack(fence, lines[i])
        if (prev === "" && fence !== "")
            open = i + 1
        if (lines[i] === "---" && fence === "" && /^Type:/.test(lines[i + 1] ?? ""))
            return `line ${i + 1}: a "---" line followed by a "Type:" line would start an attachment`
    }
    return fence !== "" ? `line ${open}: fenced code block is not closed` : null
}

/*  parse a task plan text (after legacy normalization) into the JSON
    task plan structure: the text is split into blocks at its "---"
    lines, the first block yields the header (with "After" and "Tags"
    split into arrays and "Id" taken from the authoritative id), the
    second block the body (without its leading and trailing empty line),
    and every further block an attachment (with a "Data: |4+" or "|4-" literal
    block scalar de-indented and a legacy "preflight" diff kind migrated into
    "draft"); a text without a closed frontmatter is taken as body;
    a "---" line not starting a block stays part of the body  */
export const parseTaskText = (id: string, text: string, lifecycle: TaskLifecycle): API.TaskPlan => {
    text = normalizeTaskText(id, text, lifecycle)
    const lines = text.split(/\r?\n/)
    if (lines.length > 0 && lines[lines.length - 1] === "")
        lines.pop()
    const blocks: string[][] = []
    let fence = ""
    for (let i = 0; i < lines.length; i++) {
        /*  track the fenced code blocks of the body  */
        if (blocks.length >= 2)
            fence = fenceTrack(fence, lines[i])

        /*  beyond the frontmatter, a "---" line starts a block only outside a
            fenced code block and if followed by the mandatory "Type:" key of an
            attachment -- else it is kept as body (lossless for legacy plans)  */
        if (lines[i] === "---" && lines[0] === "---" && fence === ""
            && (blocks.length < 2 || /^Type:/.test(lines[i + 1] ?? "")))
            blocks.push([])
        else if (blocks.length > 0)
            blocks[blocks.length - 1].push(lines[i])
    }
    const header: API.TaskHeader = {}
    let body: string
    const attachment: API.TaskAttachment[] = []
    if (blocks.length < 2)
        body = text
    else {
        for (const line of blocks[0]) {
            const m = keyLineRe.exec(line)
            if (m === null)
                continue
            header[m[1]] = arrayKeys.includes(m[1]) ?
                m[2].split(",").map((token) => token.trim()).filter((token) => token !== "") :
                m[2].trimEnd()
        }
        const bodyLines = blocks[1] ?? []
        if (bodyLines[0] === "")
            bodyLines.shift()
        while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1] === "")
            bodyLines.pop()
        body = bodyLines.length > 0 ? `${bodyLines.join("\n")}\n` : ""
        for (const block of blocks.slice(2)) {
            const att: API.TaskAttachment = {}
            for (let i = 0; i < block.length; i++) {
                const m = keyLineRe.exec(block[i])
                if (m === null)
                    continue
                if (m[1] === "Data" && m[2].startsWith("|")) {
                    const data: string[] = []
                    while (i + 1 < block.length && (block[i + 1] === "" || block[i + 1].startsWith("    ")))
                        data.push(block[++i].slice(4))

                    /*  honor the "strip" chomping indicator of a "|4-" block scalar  */
                    if (m[2].trimEnd().endsWith("-")) {
                        while (data.length > 0 && data[data.length - 1] === "")
                            data.pop()
                        att.Data = data.join("\n")
                    }
                    else
                        att.Data = `${data.join("\n")}\n`
                }
                else
                    att[m[1]] = m[2].trimEnd()
            }
            attachment.push(migrateAttachment(att))
        }
    }
    header.Type ??= TASK_TYPE
    header.Id = id
    return { header, body, attachment }
}

/*  format the header of the JSON task plan structure into the key lines
    of the task plan text (without the enclosing "---" lines): the keys in
    canonical order (unknown keys trailing) with the array values comma-joined  */
export const formatTaskHeader = (header: API.TaskHeader): string => {
    const value = (v: string | string[]): string => Array.isArray(v) ? v.join(", ") : v
    return orderKeys(frontKeys, Object.keys(header).filter((key) => header[key] !== undefined))
        .map((key) => `${keyLine(key, value(header[key]))}\n`).join("")
}

/*  format the JSON task plan structure into the task plan text: the
    header (see formatTaskHeader), the body enclosed in its leading and
    trailing empty line, and every attachment as its own block with
    "Data" rendered as a "|4+" (or, without trailing newline, "|4-")
    literal block scalar, or as an empty value if empty  */
export const formatTaskText = (plan: API.TaskPlan): string => {
    let text = `---\n${formatTaskHeader(plan.header)}---\n\n`
    if (plan.body !== "")
        text += plan.body.endsWith("\n") ? `${plan.body}\n` : `${plan.body}\n\n`
    for (const att of plan.attachment) {
        const keys = orderKeys(attachKeys, Object.keys(att).filter((key) => att[key] !== undefined))
        text += "---\n"
        for (const key of keys) {
            if (key === "Data" && att.Data === "")
                text += `${keyLine("Data", "")}\n`
            else if (key === "Data") {
                const keep = att.Data.endsWith("\n")
                const data = att.Data.split("\n")
                if (keep)
                    data.pop()
                text += `${keyLine("Data", keep ? "|4+" : "|4-")}\n`
                for (const line of data)
                    text += line === "" ? "\n" : `    ${line}\n`
            }
            else
                text += `${keyLine(key, att[key])}\n`
        }
    }
    return text
}

/*  derive the title of a task plan from its body as defined by the
    "Task titles" convention: the text following "TASK:" on the first
    "#   TASK: <title>" heading line, or the empty string if absent  */
export const taskTitle = (body: string): string => {
    const m = /^#[ \t]+TASK:[ \t]*(.*)$/m.exec(body)
    return m === null ? "" : m[1].trim()
}

