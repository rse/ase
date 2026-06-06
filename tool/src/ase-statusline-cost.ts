/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under GPL 3.0 <https://spdx.org/licenses/GPL-3.0-only>
*/

import fs        from "node:fs"
import os        from "node:os"
import path      from "node:path"
import { spawn } from "node:child_process"

/*  on-disk cache shape for the cumulative current-month cost  */
export interface MonthCostCache {
    month:      string   /*  "YYYY-MM" in local time  */
    costUsd:    number   /*  cumulative cost across all sessions for that month  */
    computedAt: number   /*  epoch milliseconds of the last computation  */
}

/*  minimal shape of a single Claude Code session-log JSONL entry  */
interface LogUsage {
    input_tokens?:                number
    output_tokens?:               number
    cache_read_input_tokens?:     number
    cache_creation_input_tokens?: number
    cache_creation?: {
        ephemeral_5m_input_tokens?: number
        ephemeral_1h_input_tokens?: number
    }
}
interface LogEntry {
    timestamp?: string
    requestId?: string
    message?: {
        id?:    string
        model?: string
        usage?: LogUsage
    }
}

/*  per-model pricing in USD per one million tokens (input/output prices),
    cross-checked against LiteLLM's model_prices_and_context_window.json (the
    same source ccusage uses). Cache-read and cache-write token prices are
    derived from the input price via Anthropic's standard prompt-caching
    economics: read 0.1x, 5-minute write 1.25x, 1-hour write 2x -- matching
    LiteLLM's cache_read_input_token_cost, cache_creation_input_token_cost,
    and cache_creation_input_token_cost_above_1hr respectively. None of the
    current Claude models carry a >200k long-context premium, so per-request
    token tiering is intentionally omitted. Models resolve by exact id or id
    prefix, so dated snapshots (e.g. "claude-haiku-4-5-20251001") map to their
    base entry. Unknown models contribute nothing (cannot be priced reliably).  */
const PRICING: Record<string, { input: number, output: number }> = {
    "claude-opus-4-8":   { input: 5.00, output: 25.00 },
    "claude-opus-4-7":   { input: 5.00, output: 25.00 },
    "claude-opus-4-6":   { input: 5.00, output: 25.00 },
    "claude-sonnet-4-6": { input: 3.00, output: 15.00 },
    "claude-haiku-4-5":  { input: 1.00, output:  5.00 }
}

const resolvePricing = (model: string): { input: number, output: number } | null => {
    if (PRICING[model] !== undefined)
        return PRICING[model]!
    for (const key of Object.keys(PRICING))
        if (model.startsWith(key))
            return PRICING[key]!
    return null
}

/*  derive the "YYYY-MM" key (local time) for a given date  */
const monthKeyOf = (d: Date): string => {
    const y = d.getFullYear()
    const m = d.getMonth() + 1
    return `${y}-${m < 10 ? "0" : ""}${m}`
}

/*  root directory of the local Claude Code session logs, honoring the
    CLAUDE_CONFIG_DIR override and otherwise defaulting to ~/.claude  */
const logsRoot = (): string => {
    const cfg  = process.env.CLAUDE_CONFIG_DIR
    const base = cfg !== undefined && cfg.trim() !== "" ? cfg.trim() : path.join(os.homedir(), ".claude")
    return path.join(base, "projects")
}

/*  per-user cache file in the temporary directory  */
const cacheFile = (): string => {
    let user = "default"
    try {
        user = os.userInfo().username || "default"
    }
    catch (_e) {
        user = process.env.USER ?? "default"
    }
    return path.join(os.tmpdir(), `ase-statusline-month-cost-${user}.json`)
}

/*  read the persisted month-cost cache, or null when absent/unreadable  */
export const readMonthCostCache = (): MonthCostCache | null => {
    try {
        const obj = JSON.parse(fs.readFileSync(cacheFile(), "utf8")) as MonthCostCache
        if (typeof obj.month === "string" && typeof obj.costUsd === "number" && typeof obj.computedAt === "number")
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

/*  recursively yield every "*.jsonl" file below a directory  */
function * jsonlFiles (dir: string): Generator<string> {
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
            yield * jsonlFiles(p)
        else if (ent.isFile() && ent.name.endsWith(".jsonl"))
            yield p
    }
}

/*  scan all local Claude Code session logs and sum the cost of every entry
    belonging to the given month (local time). Returns the cumulative cost in
    USD; missing or unreadable logs simply yield 0 without throwing.  */
export const computeMonthCost = (now: Date): number => {
    const month        = monthKeyOf(now)
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
    const seen         = new Set<string>()
    let total = 0
    for (const file of jsonlFiles(logsRoot())) {
        /*  skip whole files not touched this month: they cannot hold any
            current-month entry, which avoids re-reading the entire archive  */
        try {
            if (fs.statSync(file).mtimeMs < startOfMonth)
                continue
        }
        catch (_e) {
            continue
        }
        let lines: string[]
        try {
            lines = fs.readFileSync(file, "utf8").split("\n")
        }
        catch (_e) {
            continue
        }
        for (const line of lines) {
            if (line === "")
                continue
            let o: LogEntry
            try {
                o = JSON.parse(line) as LogEntry
            }
            catch (_e) {
                continue
            }
            const usage = o.message?.usage
            if (usage === undefined)
                continue
            const ts = typeof o.timestamp === "string" ? o.timestamp : ""
            if (ts === "")
                continue
            const d = new Date(ts)
            if (Number.isNaN(d.getTime()) || monthKeyOf(d) !== month)
                continue
            /*  de-duplicate identical messages that appear in more than one
                session log (e.g. after a resume/fork), keyed by message id
                plus request id, mirroring ccusage's approach  */
            const id  = o.message?.id ?? ""
            const req = o.requestId   ?? ""
            if (id !== "" && req !== "") {
                const key = `${id} ${req}`
                if (seen.has(key))
                    continue
                seen.add(key)
            }
            const price = resolvePricing(o.message?.model ?? "")
            if (price === null)
                continue
            const inM  = price.input  / 1_000_000
            const outM = price.output / 1_000_000
            total += (usage.input_tokens             ?? 0) * inM
            total += (usage.output_tokens            ?? 0) * outM
            total += (usage.cache_read_input_tokens  ?? 0) * inM * 0.1
            const c5 = usage.cache_creation?.ephemeral_5m_input_tokens
            const c1 = usage.cache_creation?.ephemeral_1h_input_tokens
            if (c5 !== undefined || c1 !== undefined) {
                total += (c5 ?? 0) * inM * 1.25
                total += (c1 ?? 0) * inM * 2.00
            }
            else
                total += (usage.cache_creation_input_tokens ?? 0) * inM * 1.25
        }
    }
    return total
}

/*  recompute the current-month cost and persist it to the cache file  */
export const refreshMonthCostCache = (now: Date): void => {
    writeMonthCostCache({ month: monthKeyOf(now), costUsd: computeMonthCost(now), computedAt: now.getTime() })
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
