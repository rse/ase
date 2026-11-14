/*
**  ASE review benchmark -- expected-results list: loading and validation
*/

import fs   from "node:fs"
import path from "node:path"

import { git, readJson, listFiles, compareIds } from "./common.mjs"

export const TIERS           = [ "obvious", "medium", "hidden" ]
export const MIN_GAP         = 8
export const MIN_SEVERITIES  = [ "HIGH", "MEDIUM" ]
export const CLASSES         = [ "plain", "false-assurance", "omission", "interplay", "sequence", "domain" ]
export const CONTEXT_CLASSES = CLASSES.filter((c) => c !== "plain")
const        STRUCTURE       = [ "min_outside_change", "min_changed_lines_per_finding", "min_changed_files" ]
const        MIN_TIER        = 2
const        MIN_DECOYS      = 3
const        TITLE_MAX       = 80

/*  load the list  */
export function loadExpected (file) {
    return readJson(file)
}

/*  whether the list records a minimum severity per finding (version 4 and later)  */
export function hasMinSeverity (expected) {
    return Number(expected?.version) >= 4
}

/*  whether the list records a class per finding, locations outside the change, and the
    structure of the case (version 5 and later)  */
export function hasStructure (expected) {
    return Number(expected?.version) >= 5
}

/*  changed lines per file of the change commit of a copy; the diff algorithm is fixed,
    so the figures do not depend on the Git configuration of the user  */
export function changedLines (dir) {
    const diff    = git(dir, [ "diff", "--diff-algorithm=myers", "-U0", "--no-color", "HEAD~1", "HEAD" ])
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

/*  figures of a case: size of the change and findings with a location outside the change  */
export function structureFigures (expected, changed) {
    const findings = (expected?.entries ?? []).filter((e) => e.kind === "finding")
    let lines = 0
    for (const set of changed.values())
        lines += set.size
    return {
        changed_lines:     lines,
        changed_files:     changed.size,
        lines_per_finding: findings.length === 0 ? 0 : lines / findings.length,
        outside_change:    findings.filter((e) => Array.isArray(e.locations) && e.locations.some((f) => f?.outside_change === true)).length
    }
}

/*  number of lines of a file of a copy  */
function lineCount (dir, file) {
    return fs.readFileSync(path.join(dir, file), "utf8").replace(/\n$/, "").split("\n").length
}

/*  validate the list against a copy; returns { results: [ { id, ok, problems } ], global: [ ... ], figures: { ... } }  */
export function validateExpected (expected, dir) {
    const global  = []
    const results = []
    if (!expected || !Array.isArray(expected.entries))
        return { results, global: [ "field \"entries\" is missing" ], figures: null }
    const changed = changedLines(dir)
    const figures = structureFigures(expected, changed)
    const files   = new Set(listFiles(dir))
    const ids     = new Set()
    /*  lists from version 4 on record a minimum severity per finding  */
    const withSeverity = hasMinSeverity(expected)
    /*  lists from version 5 on record a class per finding and may point outside the change  */
    const withStructure = hasStructure(expected)
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
        if (typeof e.title !== "string" || e.title.trim() === "" || e.title.length > TITLE_MAX)
            problems.push(`title is missing or longer than ${TITLE_MAX} characters`)
        if (withSeverity && e.kind === "finding" && !MIN_SEVERITIES.includes(e.min_severity))
            problems.push(`min_severity must be one of ${MIN_SEVERITIES.join(", ")}`)
        if (withStructure && e.kind === "finding" && !CLASSES.includes(e.class))
            problems.push(`class must be one of ${CLASSES.join(", ")}`)
        else if (withStructure && e.kind === "finding" && e.tier === "obvious" && e.class !== "plain")
            problems.push("an obvious finding must have the class plain")
        else if (withStructure && e.kind === "finding" && e.tier !== "obvious" && e.class === "plain")
            problems.push("only an obvious finding may have the class plain")
        if (withStructure && e.kind === "decoy" && e.resembles !== undefined && !CONTEXT_CLASSES.includes(e.resembles))
            problems.push(`resembles must be one of ${CONTEXT_CLASSES.join(", ")}`)
        if (typeof e.description !== "string" || e.description.trim() === "")
            problems.push("description is missing")
        if (!Array.isArray(e.locations) || e.locations.length === 0)
            problems.push("locations are missing")
        else {
            let inHunk = false, misused = false
            for (const f of e.locations) {
                const z = f?.lines
                if (typeof f?.file !== "string" || !Array.isArray(z) || z.length !== 2
                    || !Number.isInteger(z[0]) || !Number.isInteger(z[1]) || z[0] < 1 || z[1] < z[0]) {
                    problems.push(`invalid location ${JSON.stringify(f)}`)
                    continue
                }
                /*  a location outside the change names a file of the copy exactly as the copy
                    lists it and contains no changed line  */
                if (f.outside_change !== undefined) {
                    misused = true
                    if (!withStructure)
                        problems.push("outside_change needs a list of version 5 or later")
                    else if (f.outside_change !== true)
                        problems.push("outside_change must be true or absent")
                    else if (e.kind !== "finding")
                        problems.push("only a finding may have a location outside the change")
                    else if (!files.has(f.file))
                        problems.push(`${f.file} does not exist after the change`)
                    else {
                        misused = false
                        const count = lineCount(dir, f.file)
                        if (z[1] > count)
                            problems.push(`${f.file}:${z[0]}-${z[1]} lies beyond the end of the file (${count} lines)`)
                        for (let n = z[0]; n <= z[1]; n++)
                            if (changed.get(f.file)?.has(n)) {
                                problems.push(`${f.file}:${z[0]}-${z[1]} is marked outside_change but contains a changed line`)
                                break
                            }
                    }
                    continue
                }
                if (!changed.has(f.file)) {
                    problems.push(`${f.file} is not touched by the change`)
                    continue
                }
                const count = lineCount(dir, f.file)
                if (z[1] > count)
                    problems.push(`${f.file}:${z[0]}-${z[1]} lies beyond the end of the file (${count} lines)`)
                for (let n = z[0]; n <= z[1]; n++)
                    if (changed.get(f.file).has(n))
                        inHunk = true
            }
            if (!inHunk && !misused)
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
    if (withSeverity) {
        const twice = findings.some((e) => {
            const files = (e.locations || []).map((f) => f.file)
            return files.length > new Set(files).size
        })
        if (!twice)
            global.push("no finding with two locations in the same file")
    }

    /*  version 5: every context class occurs beyond the obvious tier, and the case keeps its structure  */
    if (withStructure) {
        for (const cls of CONTEXT_CLASSES)
            if (!findings.some((e) => e.class === cls && e.tier !== "obvious"))
                global.push(`no medium or hidden finding of the class ${cls}`)
        const s = expected.structure
        if (s === null || typeof s !== "object" || STRUCTURE.some((k) => typeof s[k] !== "number" || s[k] < 0))
            global.push(`structure must give ${STRUCTURE.join(", ")} as numbers`)
        else {
            if (figures.outside_change < s.min_outside_change)
                global.push(`structure: ${figures.outside_change} findings with a location outside the change, at least ${s.min_outside_change} required`)
            if (figures.lines_per_finding < s.min_changed_lines_per_finding)
                global.push(`structure: ${figures.lines_per_finding.toFixed(1)} changed lines per finding, at least ${s.min_changed_lines_per_finding} required`)
            if (figures.changed_files < s.min_changed_files)
                global.push(`structure: ${figures.changed_files} changed files, at least ${s.min_changed_files} required`)
        }
    }

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
    return { results, global, figures }
}

/*  summary numbers  */
export function summarize (expected) {
    const findings = expected.entries.filter((e) => e.kind === "finding")
    const out = { findings: findings.length, decoys: expected.entries.length - findings.length }
    for (const tier of TIERS)
        out[tier] = findings.filter((e) => e.tier === tier).length
    return out
}
