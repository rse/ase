#!/usr/bin/env node
/*
**  ASE review benchmark -- deterministic comparison against the expected-results list
**  Usage: node compare.mjs [--case <name>] [--out <folder>] [--journal <file> [--title <text>]] <result folder or parent folder>...
*/

import fs   from "node:fs"
import path from "node:path"

import { DEFAULT_CASE, resolveCase, stableStringify }       from "./lib/common.mjs"
import { loadExpected }                                     from "./lib/expected.mjs"
import { collectRunDirs, loadRun, buildReport, renderMarkdown } from "./lib/report.mjs"
import { renderSection, appendJournal }                     from "./lib/journal.mjs"

const USAGE = "Usage: node compare.mjs [--case <name>] [--out <folder>] [--journal <file> [--title <text>]] <result folder or parent folder>...\n"
    + "  --case <name>     test case (default: shop-core)\n"
    + "  --out <folder>    location of report.md and report.json (default: results folder of the case)\n"
    + "  --journal <file>  append the series as a new section to a measurement log (never rewrites entries)\n"
    + "  --title <text>    heading of the new section (default: start date, case, and models)\n"
const argv     = process.argv.slice(2)
let   caseName = DEFAULT_CASE
let   out      = null
let   journal  = null
let   title    = null
const paths    = []
for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--case")
        caseName = argv[++i]
    else if (argv[i] === "--out")
        out = path.resolve(argv[++i])
    else if (argv[i] === "--journal")
        journal = path.resolve(argv[++i])
    else if (argv[i] === "--title")
        title = argv[++i]
    else if (argv[i] === "--help") {
        process.stdout.write(USAGE)
        process.exit(0)
    }
    else
        paths.push(argv[i])
}
let c
try {
    c = resolveCase(caseName)
}
catch (err) {
    process.stderr.write(`${err.message}\n${USAGE}`)
    process.exit(2)
}
out ??= path.join(c.resultsDir, "report")
if (paths.length === 0)
    paths.push(c.resultsDir)

/*  only folders of the selected case; protocols without a case field belong to the first case  */
const dirs = collectRunDirs(paths).filter((d) => path.resolve(d) !== path.resolve(out)).filter((d) => {
    const runCase = loadRun(d).case
    if (runCase === c.name)
        return true
    process.stderr.write(`skipped ${path.basename(d)}: case "${runCase}", not "${c.name}"\n`)
    return false
})
if (dirs.length === 0) {
    process.stderr.write(`no completed result folders of case "${c.name}" found (run.json is missing or of another case)\n`)
    process.exit(1)
}
const expected = loadExpected(c.expectedFile)
const report   = buildReport(dirs, expected, c)
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
        title: title ?? `${date ? `${date[1]}-${date[2]}-${date[3]}` : first}: ${c.name}, ${Object.keys(report.models).join(", ")}`,
        dirs, report, expected, c
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
