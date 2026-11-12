/*
**  ASE review benchmark -- proofs of an expected-results list
**  Every finding has a test that fails on the change and passes with the fix of this finding alone;
**  every decoy has a test that passes on the change; with all fixes together every test passes.
**  Node.js built-ins only (design rationale: DESIGN.md)
*/

import fs                from "node:fs"
import os                from "node:os"
import path              from "node:path"
import * as nodeModule   from "node:module"
import { spawnSync }     from "node:child_process"
import { fileURLToPath } from "node:url"

import { readJson, listFiles, compareIds } from "./common.mjs"
import { buildCopy, removeCopy }           from "./copy.mjs"

const CHILD = path.join(path.dirname(fileURLToPath(import.meta.url)), "proof-child.mjs")

/*  Node.js version the proofs ask for: the minimum of the root package.json of this repository  */
export const MIN_NODE = [ 22, 18 ]

/*  outcome of one test run: the exit codes of proof-child.mjs  */
const OUTCOMES = { 0: "pass", 1: "fails" }

/*  whether a Node.js version can run the proofs  */
export function nodeIsRecent (version = process.versions.node) {
    const [ major, minor ] = version.split(".").map(Number)
    return (major > MIN_NODE[0] || (major === MIN_NODE[0] && minor >= MIN_NODE[1]))
        && typeof nodeModule.stripTypeScriptTypes === "function"
}

/*  translate TypeScript to JavaScript: the types are blanked out, so line numbers stay, and
    the relative specifier at the end of an import or export line gets the suffix of the
    translated files; a specifier that already has a suffix is left alone  */
export function translate (source) {
    const emit = process.emitWarning
    process.emitWarning = (warning, ...rest) => {
        if (!/stripTypeScriptTypes/.test(String(warning?.message ?? warning)))
            emit.call(process, warning, ...rest)
    }
    let code
    try {
        code = nodeModule.stripTypeScriptTypes(source, { mode: "strip" })
    }
    finally {
        process.emitWarning = emit
    }
    const suffix = (match, before, spec, after) => /\.[A-Za-z0-9]+$/.test(spec) ? match : `${before}${spec}.mjs${after}`
    return code.split("\n").map((line) => /^\s*(import|export|\})/.test(line)
        ? line.replace(/(\bfrom\s+")(\.{1,2}\/[^"]+)("\s*)$/, suffix)
        : line).join("\n")
}

/*  apply the edits of one or more fixes below a folder; returns a list of problems  */
export function applyEdits (dir, edits) {
    const problems = []
    for (const edit of edits) {
        if (edit === null || typeof edit !== "object" || typeof edit.file !== "string"
            || !Array.isArray(edit.find) || !Array.isArray(edit.replace)) {
            problems.push(`invalid edit ${JSON.stringify(edit)}`)
            continue
        }
        const file  = path.resolve(dir, edit.file)
        const below = path.relative(path.resolve(dir), file)
        if (below === "" || below.startsWith("..") || path.isAbsolute(below)) {
            problems.push(`${edit.file} lies outside the project`)
            continue
        }
        if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
            problems.push(`${edit.file} does not exist after the change`)
            continue
        }
        const find  = edit.find.join("\n")
        const text  = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n")
        const count = text.split(find).length - 1
        if (count !== 1) {
            problems.push(`${edit.file}: the text to replace occurs ${count} times, not once`)
            continue
        }
        fs.writeFileSync(file, text.replace(find, () => edit.replace.join("\n")))
    }
    return problems
}

/*  build one state below root: the files of the copy, the edits, and the translated sources  */
function buildState (root, name, copyDir, edits) {
    const dir = path.join(root, name)
    for (const file of listFiles(copyDir)) {
        const target = path.join(dir, file)
        fs.mkdirSync(path.dirname(target), { recursive: true })
        fs.writeFileSync(target, fs.readFileSync(path.join(copyDir, file), "utf8").replace(/\r\n/g, "\n"))
    }
    const problems = applyEdits(dir, edits)
    if (problems.length === 0)
        for (const file of listFiles(dir).filter((f) => f.endsWith(".ts"))) {
            try {
                fs.writeFileSync(path.join(dir, file.replace(/\.ts$/, ".mjs")), translate(fs.readFileSync(path.join(dir, file), "utf8")))
            }
            catch (err) {
                problems.push(`${file} cannot be translated: ${err.message}`)
            }
        }
    return { dir, problems }
}

/*  the last line a process wrote that is not empty  */
function lastLine (text) {
    return (text || "").split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== "").at(-1) ?? ""
}

/*  run one test on one state in a process of its own; the test reports its result in its last line  */
function runProof (stateDir, proofFile) {
    const res = spawnSync(process.execPath, [ CHILD, stateDir, proofFile ], {
        encoding: "utf8", timeout: 60 * 1000, windowsHide: true
    })
    const outcome = res.error || res.status === null ? "error" : OUTCOMES[res.status] ?? "error"
    let message = lastLine(res.stdout)
    if (outcome === "error" && !message.startsWith("error:"))
        message = res.error ? `error: ${res.error.message}`
            : `error: no result of the test (exit code ${res.status})${lastLine(res.stderr) ? `, ${lastLine(res.stderr)}` : ""}`
    return { outcome, message }
}

/*  prove a case; options replace the fixes or the folder of the tests (for the self-test)  */
export function proveCase (c, options = {}) {
    const proofsDir = options.proofsDir ?? c.proofsDir
    const result    = { case: c.name, problems: [], entries: [], together: null, ok: false }
    if (!fs.existsSync(proofsDir) || (options.fixes === undefined && !fs.existsSync(c.fixesFile))) {
        result.problems.push(`case ${c.name} has no proofs`)
        return result
    }
    const expected = options.expected ?? readJson(c.expectedFile)
    const fixes    = options.fixes ?? readJson(c.fixesFile).fixes ?? {}
    const entries  = [ ...expected.entries ].sort((a, b) => compareIds(a.id, b.id))
    const findings = entries.filter((e) => e.kind === "finding")

    /*  every entry has one test, every finding has a fix, and nothing is left over  */
    const proofFile = (e) => path.join(proofsDir, `${e.id}.mjs`)
    for (const e of entries)
        if (!fs.existsSync(proofFile(e)))
            result.problems.push(`${e.id}: no test ${e.id}.mjs`)
    for (const file of listFiles(proofsDir))
        if (!entries.some((e) => file === `${e.id}.mjs`))
            result.problems.push(`${file}: a test without an entry`)
    for (const e of findings)
        if (!Array.isArray(fixes[e.id]) || fixes[e.id].length === 0)
            result.problems.push(`${e.id}: no fix`)
    for (const id of Object.keys(fixes))
        if (!findings.some((e) => e.id === id))
            result.problems.push(`${id}: a fix without a finding`)
    if (result.problems.length > 0)
        return result

    const copy = buildCopy(c)
    let   root = null
    try {
        root = fs.mkdtempSync(path.join(os.tmpdir(), "ase-rr-proof-"))
        const change = buildState(root, "change", copy.dir, [])
        result.problems.push(...change.problems)
        for (const e of entries) {
            const onChange = change.problems.length === 0 ? runProof(change.dir, proofFile(e)) : { outcome: "error", message: "" }
            const entry    = { id: e.id, kind: e.kind, proven: false, on_change: onChange.outcome, message: onChange.message }
            if (e.kind === "finding") {
                const fixed   = buildState(root, `fix-${e.id}`, copy.dir, fixes[e.id])
                const withFix = fixed.problems.length === 0 ? runProof(fixed.dir, proofFile(e)) : { outcome: "error", message: fixed.problems.join("; ") }
                entry.with_fix = withFix.outcome
                entry.proven   = onChange.outcome === "fails" && withFix.outcome === "pass"
                if (withFix.outcome !== "pass")
                    entry.message = withFix.message || entry.message
            }
            else
                entry.proven = onChange.outcome === "pass"
            result.entries.push(entry)
        }

        /*  all fixes together: the corrected project passes every test  */
        const all = buildState(root, "all-fixes", copy.dir, findings.flatMap((e) => fixes[e.id]))
        result.problems.push(...all.problems.map((p) => `all fixes together: ${p}`))
        if (all.problems.length === 0) {
            const failing = entries.filter((e) => runProof(all.dir, proofFile(e)).outcome !== "pass").map((e) => e.id)
            result.together = { total: entries.length, passed: entries.length - failing.length, failing }
        }
        result.ok = result.problems.length === 0
            && result.entries.every((e) => e.proven)
            && result.together !== null && result.together.failing.length === 0
    }
    finally {
        try {
            removeCopy(copy)
        }
        finally {
            if (root !== null)
                fs.rmSync(root, { recursive: true, force: true })
        }
    }
    return result
}

/*  the lines prove.mjs prints for a result  */
export function renderProof (result) {
    const lines = []
    for (const p of result.problems)
        lines.push(`proofs: ${p}`)
    for (const e of result.entries)
        if (e.kind === "finding")
            lines.push(e.proven
                ? `${e.id}: proven (fails on the change, passes with its fix) -- ${e.message}`
                : `${e.id}: NOT proven (on the change: ${e.on_change}; with its fix: ${e.with_fix}) -- ${e.message}`)
        else
            lines.push(e.proven
                ? `${e.id}: proven (passes on the change)`
                : `${e.id}: NOT proven (on the change: ${e.on_change}) -- ${e.message}`)
    if (result.together !== null)
        lines.push(`all fixes together: ${result.together.passed} of ${result.together.total} tests pass`
            + (result.together.failing.length > 0 ? ` (not: ${result.together.failing.join(", ")})` : ""))
    lines.push(`case: ${result.case}`)
    lines.push(result.ok ? "result: OK" : "result: FAILED")
    return lines
}
