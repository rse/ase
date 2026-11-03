/*
**  ASE review benchmark -- expected-results list: loading and validation (SDD-015)
*/

import fs   from "node:fs"
import path from "node:path"

import { git, readJson, compareIds } from "./common.mjs"

export const TIERS      = [ "offensichtlich", "mittel", "versteckt" ]
export const MIN_GAP    = 8
const        MIN_TIER   = 2
const        MIN_DECOYS = 3

/*  load the list  */
export function loadSoll (file) {
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
export function validateSoll (soll, dir) {
    const global  = []
    const results = []
    if (!soll || !Array.isArray(soll.eintraege))
        return { results, global: [ "Feld \"eintraege\" fehlt" ] }
    const changed = changedLines(dir)
    const ids     = new Set()
    for (const e of soll.eintraege) {
        const problems = []
        if (typeof e.id !== "string" || !/^[BK]-\d+$/.test(e.id))
            problems.push("ungültige ID")
        else if (ids.has(e.id))
            problems.push("doppelte ID")
        ids.add(e.id)
        if (e.art !== "befund" && e.art !== "koeder")
            problems.push("art muss \"befund\" oder \"koeder\" sein")
        if (e.art === "befund" && !TIERS.includes(e.stufe))
            problems.push(`stufe muss eine von ${TIERS.join(", ")} sein`)
        if (e.art === "koeder" && (typeof e.begruendung !== "string" || e.begruendung.trim() === ""))
            problems.push("Köder ohne begruendung")
        if (typeof e.beschreibung !== "string" || e.beschreibung.trim() === "")
            problems.push("beschreibung fehlt")
        if (!Array.isArray(e.fundstellen) || e.fundstellen.length === 0)
            problems.push("fundstellen fehlen")
        else {
            let inHunk = false
            for (const f of e.fundstellen) {
                const z = f.zeilen
                if (typeof f.datei !== "string" || !Array.isArray(z) || z.length !== 2
                    || !Number.isInteger(z[0]) || !Number.isInteger(z[1]) || z[0] < 1 || z[1] < z[0]) {
                    problems.push(`ungültige Fundstelle ${JSON.stringify(f)}`)
                    continue
                }
                if (!changed.has(f.datei)) {
                    problems.push(`${f.datei} wird von der Änderung nicht berührt`)
                    continue
                }
                const file = path.join(dir, f.datei)
                const count = fs.readFileSync(file, "utf8").replace(/\n$/, "").split("\n").length
                if (z[1] > count)
                    problems.push(`${f.datei}:${z[0]}-${z[1]} liegt hinter dem Dateiende (${count} Zeilen)`)
                for (let n = z[0]; n <= z[1]; n++)
                    if (changed.get(f.datei).has(n))
                        inHunk = true
            }
            if (!inHunk)
                problems.push("keine Fundstelle liegt in einer geänderten Zeile")
        }
        results.push({ id: e.id, ok: problems.length === 0, problems })
    }

    /*  minimum numbers (AC-001)  */
    const findings = soll.eintraege.filter((e) => e.art === "befund")
    for (const tier of TIERS) {
        const n = findings.filter((e) => e.stufe === tier).length
        if (n < MIN_TIER)
            global.push(`Stufe ${tier}: ${n} Befunde, mindestens ${MIN_TIER} nötig`)
    }
    const crossFile = findings.filter((e) => e.stufe === "versteckt"
        && new Set((e.fundstellen || []).map((f) => f.datei)).size >= 2)
    if (crossFile.length === 0)
        global.push("kein versteckter Befund mit Fundstellen in zwei Dateien")
    const decoys = soll.eintraege.filter((e) => e.art === "koeder").length
    if (decoys < MIN_DECOYS)
        global.push(`${decoys} Köder, mindestens ${MIN_DECOYS} nötig`)

    /*  minimum distance between entries of the same file (SDD-010)  */
    const ranges = []
    for (const e of soll.eintraege)
        for (const f of e.fundstellen || [])
            if (Array.isArray(f.zeilen))
                ranges.push({ id: e.id, datei: f.datei, von: f.zeilen[0], bis: f.zeilen[1] })
    ranges.sort((a, b) => a.datei.localeCompare(b.datei) || a.von - b.von || compareIds(a.id, b.id))
    for (let i = 1; i < ranges.length; i++) {
        const a = ranges[i - 1]
        const b = ranges[i]
        if (a.datei === b.datei && a.id !== b.id && b.von - a.bis < MIN_GAP)
            global.push(`${a.id} und ${b.id} liegen in ${a.datei} weniger als ${MIN_GAP} Zeilen auseinander`)
    }
    return { results, global }
}

/*  summary numbers  */
export function summarize (soll) {
    const findings = soll.eintraege.filter((e) => e.art === "befund")
    const out = { befunde: findings.length, koeder: soll.eintraege.length - findings.length }
    for (const tier of TIERS)
        out[tier] = findings.filter((e) => e.stufe === tier).length
    return out
}
