#!/usr/bin/env node
/*
**  ASE review benchmark -- check the expected-results list against the fixture
**  Usage: node check.mjs [--case <name>] [--expected <file>]
*/

import path from "node:path"

import { DEFAULT_CASE, resolveCase }                 from "./lib/common.mjs"
import { buildCopy, removeCopy }                     from "./lib/copy.mjs"
import { loadExpected, validateExpected, summarize } from "./lib/expected.mjs"

const USAGE = "Usage: node check.mjs [--case <name>] [--expected <file>]\n"
let caseName = DEFAULT_CASE
let file     = null
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--expected")
        file = path.resolve(argv[++i])
    else if (argv[i] === "--case")
        caseName = argv[++i]
    else {
        process.stderr.write(`unknown option: ${argv[i]}\n${USAGE}`)
        process.exit(2)
    }
}
let c
try {
    c = resolveCase(caseName)
}
catch (err) {
    process.stderr.write(`${err.message}\n${USAGE}`)
    process.exit(2)
}

const expected = loadExpected(file ?? c.expectedFile)
const copy     = buildCopy(c)
let failed = false
try {
    const { results, global, figures } = validateExpected(expected, copy.dir)
    for (const r of results) {
        if (r.ok)
            process.stdout.write(`${r.id}: valid\n`)
        else {
            failed = true
            process.stdout.write(`${r.id}: invalid -- ${r.problems.join("; ")}\n`)
        }
    }
    for (const g of global) {
        failed = true
        process.stdout.write(`expected-results list: ${g}\n`)
    }
    const s = summarize(expected)
    process.stdout.write(`case: ${c.name}\n`)
    process.stdout.write(`summary: ${s.findings} findings (obvious ${s.obvious}, `
        + `medium ${s.medium}, hidden ${s.hidden}), ${s.decoys} decoys\n`)
    if (figures)
        process.stdout.write(`change: ${figures.changed_lines} changed lines in ${figures.changed_files} files, `
            + `${figures.lines_per_finding.toFixed(1)} per finding; `
            + `findings with a location outside the change: ${figures.outside_change}\n`)
    process.stdout.write(failed ? "result: FAILED\n" : "result: OK\n")
}
finally {
    removeCopy(copy)
}
process.exit(failed ? 1 : 0)
