#!/usr/bin/env node
/*
**  ASE review benchmark -- check the expected-results list against the fixture
**  Usage: node check.mjs [--expected <file>]
*/

import path from "node:path"

import { EXPECTED_FILE }                             from "./lib/common.mjs"
import { buildCopy, removeCopy }                     from "./lib/copy.mjs"
import { loadExpected, validateExpected, summarize } from "./lib/expected.mjs"

let file = EXPECTED_FILE
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--expected")
        file = path.resolve(argv[++i])
    else {
        process.stderr.write(`unknown option: ${argv[i]}\nUsage: node check.mjs [--expected <file>]\n`)
        process.exit(2)
    }
}

const expected = loadExpected(file)
const copy     = buildCopy()
let failed = false
try {
    const { results, global } = validateExpected(expected, copy.dir)
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
    process.stdout.write(`summary: ${s.findings} findings (obvious ${s.obvious}, `
        + `medium ${s.medium}, hidden ${s.hidden}), ${s.decoys} decoys\n`)
    process.stdout.write(failed ? "result: FAILED\n" : "result: OK\n")
}
finally {
    removeCopy(copy)
}
process.exit(failed ? 1 : 0)
