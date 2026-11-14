#!/usr/bin/env node
/*
**  ASE review benchmark -- prove the expected-results list of a case
**  Every finding must fail its test on the change and pass it with its own fix,
**  every decoy must pass its test on the change. No model call, no cost.
**  Usage: node prove.mjs --case <name>
*/

import { DEFAULT_CASE, resolveCase }                      from "./lib/common.mjs"
import { MIN_NODE, nodeIsRecent, proveCase, renderProof } from "./lib/proof.mjs"

const USAGE = "Usage: node prove.mjs --case <name>\n"
let caseName = DEFAULT_CASE
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--case" && argv[i + 1] !== undefined)
        caseName = argv[++i]
    else {
        process.stderr.write(argv[i] === "--case" ? `option --case needs a name\n${USAGE}` : `unknown option: ${argv[i]}\n${USAGE}`)
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
if (!nodeIsRecent()) {
    process.stdout.write(`prove.mjs needs Node.js ${MIN_NODE.join(".")} or newer to translate TypeScript (this is ${process.versions.node})\n`)
    process.stdout.write("result: FAILED\n")
    process.exit(1)
}

const result = proveCase(c)
for (const line of renderProof(result))
    process.stdout.write(`${line}\n`)
process.exit(result.ok ? 0 : 1)
