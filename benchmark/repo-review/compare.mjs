#!/usr/bin/env node
/*
**  ASE review benchmark -- deterministic comparison against the expected-results list
**  Usage: node compare.mjs [--out <folder>] [--journal <file> [--title <text>]] <result folder or parent folder>...
*/

import fs   from "node:fs"
import path from "node:path"

import { RESULTS_DIR, EXPECTED_FILE, stableStringify }  from "./lib/common.mjs"
import { loadExpected }                                 from "./lib/expected.mjs"
import { collectRunDirs, buildReport, renderMarkdown }  from "./lib/report.mjs"
import { renderSection, appendJournal }                 from "./lib/journal.mjs"

const argv    = process.argv.slice(2)
let   out     = path.join(RESULTS_DIR, "report")
let   journal = null
let   title   = null
const paths   = []
for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out")
        out = path.resolve(argv[++i])
    else if (argv[i] === "--journal")
        journal = path.resolve(argv[++i])
    else if (argv[i] === "--title")
        title = argv[++i]
    else if (argv[i] === "--help") {
        process.stdout.write("Usage: node compare.mjs [--out <folder>] [--journal <file> [--title <text>]] <result folder or parent folder>...\n"
            + "  --journal <file>  append the series as a new section to a measurement log (never rewrites entries)\n"
            + "  --title <text>    heading of the new section (default: start date and models)\n")
        process.exit(0)
    }
    else
        paths.push(argv[i])
}
if (paths.length === 0)
    paths.push(RESULTS_DIR)

const dirs = collectRunDirs(paths).filter((d) => path.resolve(d) !== path.resolve(out))
if (dirs.length === 0) {
    process.stderr.write("no completed result folders found (run.json is missing)\n")
    process.exit(1)
}
const expected = loadExpected(EXPECTED_FILE)
const report   = buildReport(dirs, expected)
fs.mkdirSync(out, { recursive: true })
fs.writeFileSync(path.join(out, "report.json"), stableStringify(report))
fs.writeFileSync(path.join(out, "report.md"), renderMarkdown(report))
process.stdout.write(`${dirs.length} runs evaluated, report in ${out}\n`)
for (const [ model, m ] of Object.entries(report.models))
    process.stdout.write(`  ${model}: ${m.threshold.verdict}`
        + (m.calibration?.statement ? `, calibration: ${m.calibration.statement}` : "") + "\n")

/*  append the series to the measurement log  */
if (journal !== null) {
    const first = dirs.map((d) => path.basename(d)).sort()[0]
    const date  = /^(\d{4})(\d{2})(\d{2})T/.exec(first)
    const entry = renderSection({
        title: title ?? `${date ? `${date[1]}-${date[2]}-${date[3]}` : first}: ${Object.keys(report.models).join(", ")}`,
        dirs, report, expected
    })
    if (entry.dryRun) {
        process.stderr.write("dry runs are not logged; pass only result folders of real runs\n")
        process.exit(1)
    }
    if (entry.scorerModified) {
        process.stderr.write("the scoring code has uncommitted changes; commit it first, so the log names the scorer that produced the figures\n")
        process.exit(1)
    }
    try {
        appendJournal(journal, entry)
    }
    catch (err) {
        process.stderr.write(`${err.message}\n`)
        process.exit(1)
    }
    process.stdout.write(`series ${entry.id} appended to ${journal}\n`)
}
