#!/usr/bin/env node
/*
**  ASE review benchmark -- check the expected-results list against the fixture (AC-001, AC-002)
**  Usage: node check.mjs [--sollliste <file>]
*/

import path from "node:path"

import { SOLL_FILE }                         from "./lib/common.mjs"
import { buildCopy, removeCopy }             from "./lib/kopie.mjs"
import { loadSoll, validateSoll, summarize } from "./lib/sollliste.mjs"

let file = SOLL_FILE
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--sollliste")
        file = path.resolve(argv[++i])
    else {
        process.stderr.write(`unbekannte Option: ${argv[i]}\nAufruf: node check.mjs [--sollliste <datei>]\n`)
        process.exit(2)
    }
}

const soll = loadSoll(file)
const copy = buildCopy()
let failed = false
try {
    const { results, global } = validateSoll(soll, copy.dir)
    for (const r of results) {
        if (r.ok)
            process.stdout.write(`${r.id}: gültig\n`)
        else {
            failed = true
            process.stdout.write(`${r.id}: ungültig -- ${r.problems.join("; ")}\n`)
        }
    }
    for (const g of global) {
        failed = true
        process.stdout.write(`Sollliste: ${g}\n`)
    }
    const s = summarize(soll)
    process.stdout.write(`Zusammenfassung: ${s.befunde} Befunde (offensichtlich ${s.offensichtlich}, `
        + `mittel ${s.mittel}, versteckt ${s.versteckt}), ${s.koeder} Köder\n`)
    process.stdout.write(failed ? "Ergebnis: FEHLER\n" : "Ergebnis: OK\n")
}
finally {
    removeCopy(copy)
}
process.exit(failed ? 1 : 0)
