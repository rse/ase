#!/usr/bin/env node
/*
**  ASE review benchmark -- deterministic comparison against the expected-results list (AC-006 to AC-009, AC-011)
**  Usage: node compare.mjs [--out <folder>] <result folder or parent folder>...
*/

import fs   from "node:fs"
import path from "node:path"

import { RESULTS_DIR, SOLL_FILE, stableStringify } from "./lib/common.mjs"
import { loadSoll }                                from "./lib/sollliste.mjs"
import { collectRunDirs, buildReport, renderMarkdown } from "./lib/bericht.mjs"

const argv  = process.argv.slice(2)
let   out   = path.join(RESULTS_DIR, "report")
const paths = []
for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out")
        out = path.resolve(argv[++i])
    else if (argv[i] === "--help") {
        process.stdout.write("Aufruf: node compare.mjs [--out <ordner>] <ergebnisordner oder übergeordneter ordner>...\n")
        process.exit(0)
    }
    else
        paths.push(argv[i])
}
if (paths.length === 0)
    paths.push(RESULTS_DIR)

const dirs = collectRunDirs(paths).filter((d) => path.resolve(d) !== path.resolve(out))
if (dirs.length === 0) {
    process.stderr.write("keine abgeschlossenen Ergebnisordner gefunden (run.json fehlt)\n")
    process.exit(1)
}
const report = buildReport(dirs, loadSoll(SOLL_FILE))
fs.mkdirSync(out, { recursive: true })
fs.writeFileSync(path.join(out, "report.json"), stableStringify(report))
fs.writeFileSync(path.join(out, "report.md"), renderMarkdown(report))
process.stdout.write(`${dirs.length} Läufe ausgewertet, Bericht in ${out}\n`)
for (const [ model, m ] of Object.entries(report.modelle))
    process.stdout.write(`  ${model}: ${m.schwelle.urteil}`
        + (m.kalibrierung?.aussage ? `, Kalibrierung: ${m.kalibrierung.aussage}` : "") + "\n")
