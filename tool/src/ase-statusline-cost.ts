/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under GPL 3.0 <https://spdx.org/licenses/GPL-3.0-only>
*/

import fs          from "node:fs"
import os          from "node:os"
import path        from "node:path"
import { spawn }   from "node:child_process"

import { prices }  from "./ase-statusline-prices.js"
import type { Price } from "./ase-statusline-prices.js"

/*  on-disk cache shape for the cumulative current-month cost  */
export interface MonthCostCache {
    version:    number   /*  computation scheme, to invalidate results of an older ASE  */
    month:      string   /*  "YYYY-MM" in UTC  */
    costUsd:    number   /*  cumulative cost across all sessions of all agent tools  */
    computedAt: number   /*  epoch milliseconds of the last computation  */
}

/*  current computation scheme: bump whenever the scanning, pricing, or
    month-bucketing semantics change, so that a cache written by an older
    ASE is discarded instead of being rendered as if it were current  */
const SCHEME = 2

/*  normalized token usage of a single billed model call  */
interface Usage {
    input:        number   /*  uncached input tokens  */
    output:       number   /*  generated tokens, including reasoning tokens  */
    cacheRead:    number   /*  prompt-cache read tokens  */
    cacheWrite5m: number   /*  prompt-cache write tokens with the 5-minute TTL  */
    cacheWrite1h: number   /*  prompt-cache write tokens with the 1-hour TTL  */
}

/*  a single billed model call, as reconstructed from an agent tool session log  */
interface Call {
    key:   string   /*  stable identity, so that a call logged more than once is billed once  */
    model: string
    usage: Usage
}

const noUsage = (): Usage => ({ input: 0, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 })

/*  resolve the token prices of a model id. The agent tools log ids in
    varying shapes, so the lookup widens step by step: the bare id, the id
    with dots normalized to dashes (Copilot renders "claude-sonnet-4.5"),
    the id without its vendor prefix ("anthropic/claude-opus-5"), and
    finally the longest matching id prefix, which maps dated snapshots
    like "claude-opus-5-20260401" onto their base entry. A model that
    remains unknown contributes nothing, since it cannot be priced.  */
const resolved = new Map<string, Price | null>()
const resolvePrice = (model: string): Price | null => {
    const memo = resolved.get(model)
    if (memo !== undefined)
        return memo
    const price = resolvePriceUncached(model)
    resolved.set(model, price)
    return price
}
const resolvePriceUncached = (model: string): Price | null => {
    const candidates = [ model, model.replace(/\./g, "-") ]
    if (model.includes("/"))
        candidates.push(model.slice(model.indexOf("/") + 1))
    for (const candidate of candidates)
        if (prices[candidate] !== undefined)
            return prices[candidate]!
    let best: string | null = null
    for (const candidate of candidates)
        for (const id of Object.keys(prices))
            if (candidate.startsWith(id) && (best === null || id.length > best.length))
                best = id
    return best !== null ? prices[best]! : null
}

/*  price a single call, returning 0 for a model without known prices  */
const costOf = (call: Call): number => {
    const price = resolvePrice(call.model)
    if (price === null)
        return 0
    const [ input, output, cacheRead, cacheWrite5m, cacheWrite1h ] = price
    return call.usage.input        * input +
           call.usage.output       * output +
           call.usage.cacheRead    * cacheRead +
           call.usage.cacheWrite5m * cacheWrite5m +
           call.usage.cacheWrite1h * cacheWrite1h
}

/*  derive the "YYYY-MM" key of a date in UTC: the agent vendors bill and
    reset their usage windows on UTC days, so a local-time month boundary
    would attribute the calls of a late evening to the wrong month  */
const monthKeyOf = (d: Date): string => {
    const y = d.getUTCFullYear()
    const m = d.getUTCMonth() + 1
    return `${y}-${m < 10 ? "0" : ""}${m}`
}

/*  first millisecond of the UTC month a date falls into  */
const startOfMonth = (d: Date): number =>
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)

/*  parse a timestamp of any shape the session logs use (ISO 8601 string or
    epoch seconds/milliseconds), returning null when it is unusable  */
const parseTime = (raw: unknown): Date | null => {
    if (typeof raw === "number") {
        const d = new Date(raw < 1e12 ? raw * 1000 : raw)
        return Number.isNaN(d.getTime()) ? null : d
    }
    if (typeof raw === "string" && raw !== "") {
        const d = new Date(raw)
        return Number.isNaN(d.getTime()) ? null : d
    }
    return null
}

/*  resolve a configuration root directory, honoring an environment override  */
const rootDir = (envVar: string, fallback: string): string => {
    const env = process.env[envVar]
    if (env !== undefined && env.trim() !== "")
        return env.trim()
    return path.join(os.homedir(), fallback)
}

/*  recursively yield every file below a directory whose name passes a filter  */
function * filesBelow (dir: string, accept: (name: string) => boolean): Generator<string> {
    let entries: fs.Dirent[]
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
    }
    catch (_e) {
        return
    }
    for (const ent of entries) {
        const p = path.join(dir, ent.name)
        if (ent.isDirectory())
            yield * filesBelow(p, accept)
        else if (ent.isFile() && accept(ent.name))
            yield p
    }
}

/*  read a session log as parsed JSONL records, skipping whole files that were
    not touched within the month (they cannot hold a current-month call, which
    keeps the scan off the entire archive) and tolerating malformed lines  */
function * records (file: string, since: number): Generator<{ obj: any, line: number }> {
    try {
        if (fs.statSync(file).mtimeMs < since)
            return
    }
    catch (_e) {
        return
    }
    let lines: string[]
    try {
        lines = fs.readFileSync(file, "utf8").split("\n")
    }
    catch (_e) {
        return
    }
    for (let i = 0; i < lines.length; i++) {
        if (lines[i] === "")
            continue
        try {
            yield { obj: JSON.parse(lines[i]!), line: i }
        }
        catch (_e) {
            /*  a truncated trailing line of a live session is expected  */
        }
    }
}

/*  scan the session logs of Anthropic Claude Code. Every assistant record
    carries the usage of exactly one API call, but the same call is written
    repeatedly while its response streams and again when a session is resumed
    or forked, so the message id keys the de-duplication.  */
function * scanClaude (month: string, since: number): Generator<Call> {
    const root = path.join(rootDir("CLAUDE_CONFIG_DIR", ".claude"), "projects")
    for (const file of filesBelow(root, (n) => n.endsWith(".jsonl"))) {
        for (const { obj, line } of records(file, since)) {
            const usage = obj?.message?.usage
            if (usage === undefined || usage === null)
                continue
            const at = parseTime(obj?.timestamp)
            if (at === null || monthKeyOf(at) !== month)
                continue
            const u = noUsage()
            u.input     = usage.input_tokens            ?? 0
            u.output    = usage.output_tokens           ?? 0
            u.cacheRead = usage.cache_read_input_tokens ?? 0
            const c5 = usage.cache_creation?.ephemeral_5m_input_tokens
            const c1 = usage.cache_creation?.ephemeral_1h_input_tokens
            if (c5 !== undefined || c1 !== undefined) {
                u.cacheWrite5m = c5 ?? 0
                u.cacheWrite1h = c1 ?? 0
            }
            else
                u.cacheWrite5m = usage.cache_creation_input_tokens ?? 0
            const id = typeof obj?.message?.id === "string" ? obj.message.id : ""
            yield {
                key:   id !== "" ? `claude:${id}` : `claude:${file}:${line}`,
                model: typeof obj?.message?.model === "string" ? obj.message.model : "",
                usage: u
            }
        }
    }
}

/*  scan the rollout logs of the OpenAI Codex CLI. Codex reports the usage of
    a call in a dedicated "token_count" event whose "last_token_usage" holds
    the delta of that very call, so the events are summed as they come and
    keyed positionally. The model is carried by the session and turn headers
    rather than by the usage event itself.  */
function * scanCodex (month: string, since: number): Generator<Call> {
    const root = rootDir("CODEX_HOME", ".codex")
    for (const dir of [ path.join(root, "sessions"), path.join(root, "archived_sessions") ]) {
        for (const file of filesBelow(dir, (n) => n.startsWith("rollout-") && n.endsWith(".jsonl"))) {
            let model = "gpt-5"
            for (const { obj, line } of records(file, since)) {
                const payload = obj?.payload
                const named   = payload?.model ?? payload?.info?.model ?? payload?.info?.model_name
                if (typeof named === "string" && named !== "")
                    model = named
                if (obj?.type !== "event_msg" || payload?.type !== "token_count")
                    continue
                const usage = payload?.info?.last_token_usage
                if (usage === undefined || usage === null)
                    continue
                const at = parseTime(obj?.timestamp)
                if (at === null || monthKeyOf(at) !== month)
                    continue

                /*  Codex counts the cached tokens within its input total,
                    so the uncached remainder has to be recovered  */
                const cached = usage.cached_input_tokens ?? 0
                const u = noUsage()
                u.input     = Math.max(0, (usage.input_tokens ?? 0) - cached)
                u.output    = (usage.output_tokens ?? 0) + (usage.reasoning_output_tokens ?? 0)
                u.cacheRead = cached
                yield { key: `codex:${file}:${line}`, model, usage: u }
            }
        }
    }
}

/*  scan the session state of the GitHub Copilot CLI. Copilot aggregates the
    usage per model over the whole session, so a single record yields one
    entry per involved model, and its input total covers the cached tokens as
    well. Since that aggregate is cumulative, the entries of one session and
    model are keyed identically, which bills only the final one.  */
function * scanCopilot (month: string, since: number): Generator<Call> {
    const root = path.join(rootDir("COPILOT_CONFIG_DIR", ".copilot"), "session-state")
    for (const file of filesBelow(root, (n) => n.endsWith(".jsonl"))) {
        for (const { obj } of records(file, since)) {
            const metrics = obj?.modelMetrics
            if (typeof metrics !== "object" || metrics === null)
                continue
            const at = parseTime(obj?.timestamp)
            if (at === null || monthKeyOf(at) !== month)
                continue
            for (const [ model, entry ] of Object.entries<any>(metrics)) {
                const usage = entry?.usage ?? entry
                if (typeof usage !== "object" || usage === null)
                    continue
                const cacheRead  = usage.cacheReadTokens  ?? 0
                const cacheWrite = usage.cacheWriteTokens ?? 0
                const u = noUsage()
                u.input        = Math.max(0, (usage.inputTokens ?? 0) - cacheRead - cacheWrite)
                u.output       = (usage.outputTokens ?? 0) + (usage.reasoningTokens ?? 0)
                u.cacheRead    = cacheRead
                u.cacheWrite5m = cacheWrite
                yield { key: `copilot:${file}:${model}`, model, usage: u }
            }
        }
    }
}

/*  all supported agent tools, scanned in one pass  */
const scanners = [ scanClaude, scanCodex, scanCopilot ]

/*  per-user cache file in the temporary directory  */
const cacheFile = (): string => {
    let user: string
    try {
        user = os.userInfo().username || "default"
    }
    catch (_e) {
        user = process.env.USER ?? "default"
    }
    return path.join(os.tmpdir(), `ase-statusline-month-cost-${user}.json`)
}

/*  read the persisted month-cost cache, or null when absent, unreadable, or
    written by an ASE with a different computation scheme  */
export const readMonthCostCache = (): MonthCostCache | null => {
    try {
        const obj = JSON.parse(fs.readFileSync(cacheFile(), "utf8")) as MonthCostCache
        if (obj.version === SCHEME
            && typeof obj.month === "string"
            && typeof obj.costUsd === "number"
            && typeof obj.computedAt === "number")
            return obj
        return null
    }
    catch (_e) {
        return null
    }
}

const writeMonthCostCache = (cache: MonthCostCache): void => {
    try {
        fs.writeFileSync(cacheFile(), JSON.stringify(cache), "utf8")
    }
    catch (_e) {
        /*  best-effort: a non-writable temp directory just means no caching  */
    }
}

/*  scan the local session logs of every supported agent tool and sum the cost
    of all calls billed within the given UTC month. Calls that were logged
    more than once are billed once, keeping the most expensive of their
    snapshots: the usage counts of a call grow while its response streams, so
    the largest snapshot reflects the finally billed state. Missing or
    unreadable logs simply contribute 0 without throwing.  */
export const computeMonthCost = (now: Date): number => {
    const month = monthKeyOf(now)
    const since = startOfMonth(now)
    const seen  = new Map<string, number>()
    for (const scan of scanners) {
        for (const call of scan(month, since)) {
            const cost = costOf(call)
            if (cost > (seen.get(call.key) ?? -1))
                seen.set(call.key, cost)
        }
    }
    let total = 0
    for (const cost of seen.values())
        total += cost
    return total
}

/*  recompute the current-month cost and persist it to the cache file  */
export const refreshMonthCostCache = (now: Date): void => {
    writeMonthCostCache({
        version:    SCHEME,
        month:      monthKeyOf(now),
        costUsd:    computeMonthCost(now),
        computedAt: now.getTime()
    })
}

/*  spawn a detached background process that recomputes the cache without
    blocking the current statusline render; any failure is swallowed since a
    missed refresh only means the next render keeps using the stale value  */
const spawnMonthCostRefresh = (): void => {
    try {
        const entry = process.argv[1]
        if (entry === undefined)
            return
        const child = spawn(process.execPath, [ entry, "statusline", "--refresh-month-cost" ],
            { detached: true, stdio: "ignore" })
        child.unref()
    }
    catch (_e) {
        /*  unable to spawn: keep serving the last cached value  */
    }
}

/*  resolve the value to render for the %Y current-month cost placeholder:
    returns the cached cost when it is for the current month, and triggers a
    non-blocking background refresh whenever the cache is missing, stale
    (older than ttlSec), or from a previous month. Returns null when there is
    no usable current-month value yet (first run, or no logged usage).  */
export const monthCostForRender = (now: Date, ttlSec: number): number | null => {
    const month = monthKeyOf(now)
    const cache = readMonthCostCache()
    const fresh = cache !== null
        && cache.month === month
        && now.getTime() - cache.computedAt < ttlSec * 1000
    if (!fresh)
        spawnMonthCostRefresh()
    if (cache !== null && cache.month === month && cache.costUsd > 0)
        return cache.costUsd
    return null
}
