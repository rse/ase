#!/usr/bin/env node
/*
**  ASE review benchmark -- language check of the deliverable
**  Reports German words and umlauts in file names and file contents. The deny-list terms of
**  the leak check are exempt, as they are search data for German-language hints in the fixture.
**  Recorded model output (transcript.jsonl, review.md, stderr.txt of result folders) is not checked.
**  Usage: node check-language.mjs [--root <folder>]
*/

import fs   from "node:fs"
import path from "node:path"

import { BENCH_DIR, listFiles } from "./lib/common.mjs"
import { DENY_TERMS }           from "./lib/leak.mjs"

/*  unambiguous German words (no English homographs)  */
const GERMAN_WORDS = [
    "und", "vom", "nicht", "kein", "keine", "oder", "ist", "sind", "wird", "werden", "mit", "für", "auf", "über", "unter",
    "eine", "einer", "einem", "einen", "des", "dem", "den", "der", "zum", "zur", "beim", "nach", "bei", "wenn", "dann",
    "lauf", "läufe", "laeufe", "treffer", "befunde", "köder", "koeder", "sollliste", "schwelle", "schwellen", "kosten",
    "dauer", "fehler", "unauswertbar", "abgebrochen", "gesamt", "stufe", "bericht", "datei", "zeile", "zeilen",
    "eintraege", "fundstellen", "beschreibung", "begruendung", "offensichtlich", "versteckt", "urteil", "erreicht",
    "kalibrierung", "aussage", "angemessen", "leck", "kopie", "zuordnung", "auswertung", "anmerkungen", "trockenlauf",
    "ergebnisordner", "kontamination", "gesetzt", "beendet", "geaendert", "uebrig", "nächster", "naechster", "schritt", "gültig", "ungültig"
]
const WORD_RE   = new RegExp(`(?<![\\p{L}\\p{N}_])(${GERMAN_WORDS.join("|")})(?![\\p{L}\\p{N}_])`, "iu")
const UMLAUT_RE = /[äöüÄÖÜß]/
const EXEMPT_RE = new RegExp(`(?<![\\p{L}\\p{N}_])(${DENY_TERMS.join("|")})(?:s|e|en|es)?(?![\\p{L}\\p{N}_])`, "giu")
const SELF      = "check-language.mjs"
const RAW       = /(^|\/)(results|reference\/runs\/[^/]+)\/(transcript\.jsonl|review\.md|stderr\.txt)$/

/*  check one text, returning the offending match (or null)  */
export function findGerman (text) {
    const cleaned = text.replace(EXEMPT_RE, " ").replace(/_/g, " ")
    const w = WORD_RE.exec(cleaned)
    if (w)
        return w[1]
    const u = UMLAUT_RE.exec(cleaned)
    return u ? u[0] : null
}

/*  check all files below a root folder  */
export function checkTree (root) {
    const problems = []
    for (const file of listFiles(root, [ ".git", "results", "node_modules" ])) {
        if (file === SELF || RAW.test(file))
            continue
        const inName = findGerman(file.replace(/[/._-]/g, " "))
        if (inName)
            problems.push(`${file}: file name contains "${inName}"`)
        const data = fs.readFileSync(path.join(root, file))
        if (data.includes(0))
            continue
        const lines = data.toString("utf8").split(/\r?\n/)
        lines.forEach((line, i) => {
            const hit = findGerman(line)
            if (hit)
                problems.push(`${file}:${i + 1}: contains "${hit}"`)
        })
    }
    return problems
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(BENCH_DIR, SELF)) {
    let root = BENCH_DIR
    const argv = process.argv.slice(2)
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === "--root")
            root = path.resolve(argv[++i])
        else {
            process.stderr.write(`unknown option: ${argv[i]}\nUsage: node check-language.mjs [--root <folder>]\n`)
            process.exit(2)
        }
    }
    const problems = checkTree(root)
    for (const p of problems)
        process.stdout.write(`${p}\n`)
    process.stdout.write(problems.length === 0 ? "result: OK, no German terms found\n" : `result: FAILED, ${problems.length} German terms found\n`)
    process.exit(problems.length === 0 ? 0 : 1)
}
