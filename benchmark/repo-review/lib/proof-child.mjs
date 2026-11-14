/*
**  ASE review benchmark -- run one test of a proof on one state of a fixture
**  Usage: node proof-child.mjs <state folder> <test file>
**  Exit code 0: the test passes; 1: an assertion of the test fails; 2: anything else went wrong
*/

import assert            from "node:assert/strict"
import path              from "node:path"
import { pathToFileURL } from "node:url"

const [ stateDir, proofFile ] = process.argv.slice(2)

/*  anything but a failed assertion is a broken test, not a proof  */
function broken (err) {
    process.stdout.write(`error: ${String(err?.stack ?? err).split("\n")[0]}\n`)
    process.exit(2)
}
process.on("unhandledRejection", broken)
process.on("uncaughtException", broken)

/*  a test loads the modules of the state by their name below src/  */
const load = (name) => import(pathToFileURL(path.join(stateDir, "src", `${name}.mjs`)).href)

try {
    if (stateDir === undefined || proofFile === undefined)
        throw new Error("usage: node proof-child.mjs <state folder> <test file>")
    const proof = (await import(pathToFileURL(path.resolve(proofFile)).href)).default
    if (typeof proof !== "function")
        throw new Error("the test has no default export")
    await proof({ load, assert })

    /*  the test passes only once nothing is left to run: a promise the test did not wait for
        may still reject, which then ends the process through the handlers above  */
    process.once("beforeExit", () => {
        process.stdout.write("pass\n")
        process.exitCode = 0
    })
}
catch (err) {
    if (!(err instanceof assert.AssertionError))
        broken(err)
    process.stdout.write(`${String(err.message).split("\n")[0]}\n`)
    process.exit(1)
}
