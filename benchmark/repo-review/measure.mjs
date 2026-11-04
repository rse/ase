#!/usr/bin/env node
/*
**  ASE review benchmark -- one measurement in one command: runs of several models,
**  comparison, and log entry with a template for the manual reading
**  Usage: node measure.mjs --help
*/

import fs            from "node:fs"
import path          from "node:path"
import { spawnSync } from "node:child_process"

import { BENCH_DIR, DEFAULT_CASE, resolveCase, readJson } from "./lib/common.mjs"
import { loadExpected }                                   from "./lib/expected.mjs"
import { collectRunDirs, buildReport, thresholdVersion }  from "./lib/report.mjs"
import { renderSection, scorerVersion }                   from "./lib/journal.mjs"
import { stamp }                                          from "./lib/runner.mjs"

const JOURNAL = path.join(BENCH_DIR, "MEASUREMENTS.md")
const HELP = `Usage: node measure.mjs [options]

  --case <name>        test case (default: ${DEFAULT_CASE})
  --models <list>      comma-separated models for claude -p (default: opus,sonnet)
  --runs <n>           runs per model (default: 3)
  --confirm-paid       explicit flag for paid runs
  --dry-run            whole pipeline without a model call; writes a preview of the
                       log entry into the series folder instead of MEASUREMENTS.md
  --title <text>       heading of the log entry (default: start date, case, and models)
  --keep-reference     copy the runs into the reference folder of the case
  --help               this help

All runs of one call go into one series folder under the results folder of the
case; only these runs are compared and logged. Paid runs need the threshold file,
the expected-results list, and the scoring code committed, and a built tool/.
`

/*  parse the command line  */
export function options (argv) {
    const o = { caseName: DEFAULT_CASE, models: [ "opus", "sonnet" ], runs: 3,
        confirmPaid: false, dryRun: false, title: null, keepReference: false, help: false }
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]
        const v = () => {
            if (i + 1 >= argv.length)
                throw new Error(`${a} needs a value`)
            return argv[++i]
        }
        if      (a === "--case")           o.caseName      = v()
        else if (a === "--models")         o.models        = v().split(",").map((m) => m.trim()).filter(Boolean)
        else if (a === "--runs")           o.runs          = Math.max(1, Math.floor(Number(v()) || 0))
        else if (a === "--confirm-paid")   o.confirmPaid   = true
        else if (a === "--dry-run")        o.dryRun        = true
        else if (a === "--title")          o.title         = v()
        else if (a === "--keep-reference") o.keepReference = true
        else if (a === "--help")           o.help          = true
        else
            throw new Error(`unknown option: ${a}`)
    }
    if (o.models.length === 0)
        throw new Error("--models needs at least one model")
    if (o.dryRun && o.keepReference)
        throw new Error("--keep-reference only for paid runs")
    o.case = resolveCase(o.caseName)
    return o
}

/*  preconditions checked before any money is spent  */
export function preflight (o) {
    if (o.dryRun)
        return []
    const problems = []
    if (!o.confirmPaid)
        problems.push("paid runs without --confirm-paid: obtain the cost approval first, then start with --confirm-paid")
    const tv = thresholdVersion(o.case)
    if (tv.commit === null || tv.modified)
        problems.push("the threshold file of the case is not committed or modified: commit it first")
    const sv = scorerVersion(o.case)
    if (sv.commit === null || sv.modified)
        problems.push("the scoring code or the expected-results list has uncommitted changes: commit them first, "
            + "otherwise the log entry would be refused after the paid runs")
    return problems
}

/*  cost spent so far in a series folder; a run without cost report counts with its full limit  */
function spentIn (dir, dryRun) {
    return collectRunDirs([ dir ]).reduce((sum, d) => {
        const m = readJson(path.join(d, "run.json"))
        return sum + (m.cost_usd ?? (dryRun ? 0 : m.budget_usd ?? 5))
    }, 0)
}

/*  run a benchmark script with the same Node.js and show its output  */
function node (script, args) {
    return spawnSync(process.execPath, [ path.join(BENCH_DIR, script), ...args ], { stdio: "inherit" }).status
}

/*  main  */
function main () {
    let o
    try {
        o = options(process.argv.slice(2))
    }
    catch (err) {
        process.stderr.write(`${err.message}\n\n${HELP}`)
        return 2
    }
    if (o.help) {
        process.stdout.write(HELP)
        return 0
    }
    const problems = preflight(o)
    if (problems.length > 0) {
        process.stderr.write("preconditions not met, no model call:\n" + problems.map((p) => `  - ${p}\n`).join(""))
        return 1
    }
    const c      = o.case
    const series = path.join(c.resultsDir, `series-${stamp()}${o.dryRun ? "-dry" : ""}`)
    fs.mkdirSync(series, { recursive: true })

    /*  runs, one model after the other, within one shared series budget  */
    for (const model of o.models) {
        process.stdout.write(`== ${c.name}, ${model}, ${o.runs} run(s)\n`)
        const status = node("run.mjs", [ "--case", c.name, "--model", model, "--runs", String(o.runs), "--out", series,
            "--prior-spent", spentIn(series, o.dryRun).toFixed(2), ...(o.dryRun ? [ "--dry-run" ] : [ "--confirm-paid" ]) ])
        if (status === 3) {
            process.stderr.write("series budget reached; the remaining models are skipped\n")
            break
        }
        if (status !== 0) {
            process.stderr.write(`run.mjs ended with exit code ${status}; measurement stopped\n`)
            return 1
        }
    }
    const dirs = collectRunDirs([ series ])
    if (dirs.length === 0) {
        process.stderr.write(`no completed runs in ${series}\n`)
        return 1
    }

    /*  comparison and log entry; a dry run only previews the entry  */
    const report = path.join(series, "report")
    if (o.dryRun) {
        if (node("compare.mjs", [ "--case", c.name, "--out", report, series ]) !== 0)
            return 1
        const expected = loadExpected(c.expectedFile)
        const entry    = renderSection({ title: o.title ?? `${c.name} (dry run)`, dirs, report: buildReport(dirs, expected, c), expected, c })
        const preview  = path.join(series, "log-preview.md")
        fs.writeFileSync(preview, entry.section)
        process.stdout.write(`dry run: log entry previewed in ${preview}, MEASUREMENTS.md unchanged\n`)
        return 0
    }
    if (node("compare.mjs", [ "--case", c.name, "--out", report, "--journal", JOURNAL, ...(o.title ? [ "--title", o.title ] : []), series ]) !== 0)
        return 1

    /*  optional reference copy of the runs  */
    if (o.keepReference) {
        for (const d of dirs) {
            const target = path.join(c.referenceDir, "runs", path.basename(d))
            fs.cpSync(d, target, { recursive: true, errorOnExist: true, force: false })
        }
        process.stdout.write(`${dirs.length} runs copied to ${path.join(c.referenceDir, "runs")}\n`)
    }
    process.stdout.write("next: complete the manual reading in MEASUREMENTS.md, then commit the log"
        + (o.keepReference ? " and the reference runs" : "") + "\n")
    return 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(BENCH_DIR, "measure.mjs"))
    process.exitCode = main()
