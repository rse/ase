/*
**  ASE review benchmark -- expected-results list: loading and validation
*/

import fs   from "node:fs"
import path from "node:path"

import { git, readJson, compareIds } from "./common.mjs"

export const TIERS      = [ "obvious", "medium", "hidden" ]
export const MIN_GAP    = 8
const        MIN_TIER   = 2
const        MIN_DECOYS = 3

/*  load the list  */
export function loadExpected (file) {
    return readJson(file)
}

/*  changed lines per file of the change commit of a copy  */
export function changedLines (dir) {
    const diff    = git(dir, [ "diff", "-U0", "--no-color", "HEAD~1", "HEAD" ])
    const changed = new Map()
    let   file    = null
    for (const line of diff.split(/\r?\n/)) {
        let m
        if ((m = /^\+\+\+ (?:b\/(.+)|\/dev\/null)$/.exec(line))) {
            file = m[1] ?? null
            if (file !== null && !changed.has(file))
                changed.set(file, new Set())
        }
        else if (file !== null && (m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line))) {
            const start = Number(m[1])
            const count = m[2] === undefined ? 1 : Number(m[2])
            for (let n = start; n < start + count; n++)
                changed.get(file).add(n)
        }
    }
    return changed
}

/*  validate the list against a copy; returns { results: [ { id, ok, problems } ], global: [ ... ] }  */
export function validateExpected (expected, dir) {
    const global  = []
    const results = []
    if (!expected || !Array.isArray(expected.entries))
        return { results, global: [ "field \"entries\" is missing" ] }
    const changed = changedLines(dir)
    const ids     = new Set()
    for (const e of expected.entries) {
        const problems = []
        if (typeof e.id !== "string" || !/^[BK]-\d+$/.test(e.id))
            problems.push("invalid id")
        else if (ids.has(e.id))
            problems.push("duplicate id")
        ids.add(e.id)
        if (e.kind !== "finding" && e.kind !== "decoy")
            problems.push("kind must be \"finding\" or \"decoy\"")
        if (e.kind === "finding" && !TIERS.includes(e.tier))
            problems.push(`tier must be one of ${TIERS.join(", ")}`)
        if (e.kind === "decoy" && (typeof e.rationale !== "string" || e.rationale.trim() === ""))
            problems.push("decoy without rationale")
        if (typeof e.description !== "string" || e.description.trim() === "")
            problems.push("description is missing")
        if (!Array.isArray(e.locations) || e.locations.length === 0)
            problems.push("locations are missing")
        else {
            let inHunk = false
            for (const f of e.locations) {
                const z = f.lines
                if (typeof f.file !== "string" || !Array.isArray(z) || z.length !== 2
                    || !Number.isInteger(z[0]) || !Number.isInteger(z[1]) || z[0] < 1 || z[1] < z[0]) {
                    problems.push(`invalid location ${JSON.stringify(f)}`)
                    continue
                }
                if (!changed.has(f.file)) {
                    problems.push(`${f.file} is not touched by the change`)
                    continue
                }
                const count = fs.readFileSync(path.join(dir, f.file), "utf8").replace(/\n$/, "").split("\n").length
                if (z[1] > count)
                    problems.push(`${f.file}:${z[0]}-${z[1]} lies beyond the end of the file (${count} lines)`)
                for (let n = z[0]; n <= z[1]; n++)
                    if (changed.get(f.file).has(n))
                        inHunk = true
            }
            if (!inHunk)
                problems.push("no location lies in a changed line")
        }
        results.push({ id: e.id, ok: problems.length === 0, problems })
    }

    /*  minimum numbers  */
    const findings = expected.entries.filter((e) => e.kind === "finding")
    for (const tier of TIERS) {
        const n = findings.filter((e) => e.tier === tier).length
        if (n < MIN_TIER)
            global.push(`tier ${tier}: ${n} findings, at least ${MIN_TIER} required`)
    }
    const crossFile = findings.filter((e) => e.tier === "hidden"
        && new Set((e.locations || []).map((f) => f.file)).size >= 2)
    if (crossFile.length === 0)
        global.push("no hidden finding with locations in two files")
    const decoys = expected.entries.filter((e) => e.kind === "decoy").length
    if (decoys < MIN_DECOYS)
        global.push(`${decoys} decoys, at least ${MIN_DECOYS} required`)

    /*  minimum distance between entries of the same file  */
    const ranges = []
    for (const e of expected.entries)
        for (const f of e.locations || [])
            if (Array.isArray(f.lines))
                ranges.push({ id: e.id, file: f.file, from: f.lines[0], to: f.lines[1] })
    ranges.sort((a, b) => a.file.localeCompare(b.file) || a.from - b.from || compareIds(a.id, b.id))
    for (let i = 1; i < ranges.length; i++) {
        const a = ranges[i - 1]
        const b = ranges[i]
        if (a.file === b.file && a.id !== b.id && b.from - a.to < MIN_GAP)
            global.push(`${a.id} and ${b.id} are less than ${MIN_GAP} lines apart in ${a.file}`)
    }
    return { results, global }
}

/*  summary numbers  */
export function summarize (expected) {
    const findings = expected.entries.filter((e) => e.kind === "finding")
    const out = { findings: findings.length, decoys: expected.entries.length - findings.length }
    for (const tier of TIERS)
        out[tier] = findings.filter((e) => e.tier === tier).length
    return out
}
