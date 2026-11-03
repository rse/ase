#!/usr/bin/env node
/*
**  ASE review benchmark -- self-test of parser, assignment, metrics, and runner helpers
**  Expected values are computed by hand from the PRD rules, not derived from the code.
**  Usage: node selftest.mjs
*/

import fs   from "node:fs"
import os   from "node:os"
import path from "node:path"

import { EXPECTED_FILE, TESTDATA_DIR, stableStringify, readJson } from "./lib/common.mjs"
import { parseReview }                             from "./lib/parser.mjs"
import { assignFinding }                           from "./lib/matching.mjs"
import { evaluateRun, aggregate, calibrate }       from "./lib/scoring.mjs"
import { findLeak }                                from "./lib/leak.mjs"
import { seriesAllows, createRunDir, checkInit, claudeArgs, mcpConfig, checkContamination, runChild, childEnv, envSummary, transcriptFacts } from "./lib/runner.mjs"

let passed = 0, failed = 0
function check (name, cond, info = "") {
    if (cond) {
        passed++
        process.stdout.write(`ok   - ${name}\n`)
    }
    else {
        failed++
        process.stdout.write(`FAIL - ${name}${info ? ` (${info})` : ""}\n`)
    }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)

const expected = readJson(EXPECTED_FILE)
const row  = (sev, loc, text = "text") => `| **${sev}** | correctness | ${loc}: ${text} |`
const head = "◉ **REVIEW VERDICT**: **REJECT - DEMANDS CHANGES**\n\n| Severity | Dimension | Finding |\n| --- | --- | --- |\n"
const review = (rows) => head + rows.join("\n") + "\n"
const replayText = (file) => transcriptFacts(fs.readFileSync(path.join(TESTDATA_DIR, file), "utf8")
    .split("\n").filter(Boolean).map((l) => JSON.parse(l))).text

/*  SCN-011: parser format variants  */
{
    const p = parseReview(review([ row("HIGH", "▢ `src/cart.ts:30`") ]))
    check("parser: standard row with ▢ and backticks", p.status === "ok" && eq(p.findings[0].location, { file: "src/cart.ts", from: 30, to: 30 }))
    const q = parseReview(review([ row("MEDIUM", "src/cart.ts:30-31") ]))
    check("parser: without ▢ and backticks, range :N-M", eq(q.findings[0].location, { file: "src/cart.ts", from: 30, to: 31 }))
    const r = parseReview(review([ "| **LOW** | correctness | ▢ `src/order.ts:83`: a \\| b in text |" ]))
    check("parser: escaped \\| in the finding text", r.findings.length === 1 && r.findings[0].text.includes("a | b") && r.findings[0].location.from === 83)
    const s = parseReview(review([ row("HIGH", "▢ `C:\\Temp\\ase-rr-x\\shop\\src\\api.ts:34`") ]))
    check("parser: Windows path", s.findings[0].location.file === "C:/Temp/ase-rr-x/shop/src/api.ts" && s.findings[0].location.from === 34)
    const t = parseReview(review([ row("ACCEPTED", "▢ `src/notify.ts:7`") ]))
    check("parser: severity ACCEPTED", t.findings[0].severity === "ACCEPTED")
    const u = parseReview(review([ "| **HIGH** | correctness | the change breaks the build |" ]))
    check("parser: finding without location", u.status === "ok" && u.findings[0].location === null)
    const v = parseReview("◉ **REVIEW VERDICT**: **APPROVE**\n\n○ **NO FINDINGS**: the change is clean, nothing to flag.\n")
    check("parser: NO FINDINGS is parseable without findings", v.status === "ok" && v.findings.length === 0 && v.verdict === "APPROVE")
    const w = parseReview("◉ **REVIEW VERDICT**: **SKIPPED (boxing: black)**\n\n○ **NO FINDINGS**: the change was not reviewed, nothing to flag.\n")
    check("parser: verdict SKIPPED", w.status === "ok" && w.verdict === "SKIPPED (boxing: black)")
    const x = parseReview(review([ row("HIGH", "▢ `src/cart.ts:30`") ]).replace("REVIEW VERDICT", "RESULT"))
    check("parser: missing verdict is unparseable (negative case)", x.status === "unparseable")
    const y = parseReview("◉ **REVIEW VERDICT**: **APPROVE**\n\nlooks fine to me\n")
    check("parser: verdict without table and without NO FINDINGS is unparseable (negative case)", y.status === "unparseable")
}

/*  SCN-016: unparseable output of the replay file  */
check("parser: foreign output from testdata/unparseable.jsonl is unparseable",
    parseReview(replayText("unparseable.jsonl")).status === "unparseable")

/*  SCN-012: assignment with tolerance 3  */
{
    const f = (file, from, to = from, severity = "HIGH") => ({ severity, location: { file, from, to } })
    check("matching: distance 3 hits (B-01 at 30-31, finding at 34)", assignFinding(f("src/cart.ts", 34), expected)?.id === "B-01")
    check("matching: distance 4 misses (finding at 35, negative case)", assignFinding(f("src/cart.ts", 35), expected) === null)
    check("matching: other file name misses (negative case)", assignFinding(f("src/money.ts", 30), expected) === null)
    check("matching: path suffix hits", assignFinding(f("C:/Temp/x/shop/src/cart.ts", 30), expected)?.id === "B-01")
    const two = { entries: [
        { id: "B-1", kind: "finding", tier: "medium", locations: [ { file: "a.ts", lines: [ 10, 12 ] } ] },
        { id: "B-2", kind: "finding", tier: "medium", locations: [ { file: "a.ts", lines: [ 16, 18 ] } ] }
    ] }
    check("matching: larger overlap wins (finding 15: B-1 1 line, B-2 3 lines)", assignFinding(f("a.ts", 15), two)?.id === "B-2")
    check("matching: a tie is decided by the smallest id (finding 14)", assignFinding(f("a.ts", 14), two)?.id === "B-1")
    check("matching: finding without location stays unassigned", assignFinding({ severity: "HIGH", location: null }, expected) === null)
}

/*  SCN-014, SCN-017: metrics computed by hand
    run 1 (testdata/normal.jsonl): hits B-01, B-02 (obvious 2/2), B-03 (medium 1/3), B-06 (hidden 1/2),
           overall 4/7 = 0.5714; decoy K-04 1/4 = 0.25; unassignable 1 (inventory.ts); ACCEPTED 1; duplicate 1 (cart.ts:31)
    run 2: unparseable -> recall 0, not in false alarm rate
    run 3: NO FINDINGS -> recall 0, false alarm 0
    run 4: aborted -> not evaluated
    means: overall (0.5714 + 0 + 0) / 3 = 0.1905, obvious 1/3 = 0.3333, false alarm (0.25 + 0) / 2 = 0.125  */
{
    const runs = [
        { name: "r1", status: "ok", model: "m", review: replayText("normal.jsonl"), cost: 0.4, duration: 1000 },
        { name: "r2", status: "unparseable", model: "m", review: replayText("unparseable.jsonl"), cost: 0.1, duration: 1000 },
        { name: "r3", status: "ok", model: "m", review: "◉ **REVIEW VERDICT**: **APPROVE**\n\n○ **NO FINDINGS**: the change is clean, nothing to flag.\n", cost: 0.2, duration: 1000 },
        { name: "r4", status: "aborted", reason: "cost", model: "m", review: null, cost: 5.03, duration: 1000 }
    ].map((r) => evaluateRun(r, expected))
    const r1 = runs[0]
    check("metrics run 1: hits B-01, B-02, B-03, B-06", eq(r1.hits, [ "B-01", "B-02", "B-03", "B-06" ]))
    check("metrics run 1: recall per tier", r1.recall.obvious === 1 && r1.recall.medium === 0.3333 && r1.recall.hidden === 0.5 && r1.recall.overall === 0.5714)
    check("metrics run 1: decoy K-04, false-alarm rate 0.25", eq(r1.decoys_reported, [ "K-04" ]) && r1.false_alarm_rate === 0.25)
    check("metrics run 1: 1 unassignable, 1 ACCEPTED, 1 duplicate", r1.unassignable === 1 && r1.accepted === 1 && r1.duplicates === 1)
    check("metrics run 2: unparseable with 0 hits and no false-alarm rate", runs[1].status === "unparseable" && runs[1].recall.overall === 0 && runs[1].false_alarm_rate === null)
    const t = { recall_overall_min: 0.6, recall_obvious_min: 0.8, decoy_false_alarm_max: 0.25 }
    const agg = aggregate(runs, t)
    check("aggregation: 4 runs, 3 evaluated, 1 aborted", agg.runs.total === 4 && agg.runs.evaluated === 3 && agg.runs.aborted === 1)
    check("aggregation: overall recall mean 0.1905, min 0, max 0.5714", agg.recall.overall.mean === 0.1905 && agg.recall.overall.min === 0 && agg.recall.overall.max === 0.5714)
    check("aggregation: obvious mean 0.3333", agg.recall.obvious.mean === 0.3333)
    check("aggregation: false-alarm rate mean 0.125 over 2 runs", agg.false_alarm_rate.mean === 0.125 && agg.false_alarm_rate.n === 2)
    check("threshold: not met at 0.6 / 0.8 / 0.25 (negative case)", agg.threshold.verdict === "threshold not met")
    const agg2 = aggregate(runs, { recall_overall_min: 0.1, recall_obvious_min: 0.3, decoy_false_alarm_max: 0.2 })
    check("threshold: met at 0.1 / 0.3 / 0.2", agg2.threshold.verdict === "threshold met")
    const agg3 = aggregate(runs, { recall_overall_min: 0.1, recall_obvious_min: 0.3, decoy_false_alarm_max: 0.1 })
    check("threshold: false-alarm rate 0.125 above limit 0.1 (negative case)", agg3.threshold.verdict === "threshold not met")

    /*  SCN-023: calibration  */
    const full = { ...r1, recall: { ...r1.recall, overall: 1 } }
    check("calibration: all runs with recall 1 give \"too easy\" with a next step",
        calibrate([ full, full, full ]).statement === "too easy" && calibrate([ full ]).next_step !== null)
    check("calibration: one run below gives \"adequate\"", calibrate([ full, full, r1 ]).statement === "adequate")
}

/*  SCN-004 (part): leak terms  */
check("leak: a deny-listed term is detected", findLeak("// see sollliste") === "sollliste")
check("leak: an expected-results id is detected", findLeak("Fix B-03 now") === "B-03")
check("leak: \"debug\" is no hit for \"bug\" (negative case)", findLeak("debug output") === null)
check("leak: \"falls through\" is allowed", findLeak("/* falls through */") === null)
check("leak: plural forms like \"bugs\" and \"todos\" are detected (CR-010)", findLeak("two bugs here") === "bug" && findLeak("open todos") === "todo")

/*  SCN-005, SCN-008, SCN-010, SCN-026: runner helpers  */
check("series budget: 26 + 5 > 30 refused", seriesAllows(26, 5, 30) === false)
check("series budget: 25 + 5 with 10 % reserve (5.5) > 30 refused (CR-005)", seriesAllows(25, 5, 30) === false)
check("series budget: 24.5 + 5.5 = 30 allowed", seriesAllows(24.5, 5, 30) === true)
{
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ase-rr-selftest-"))
    createRunDir(tmp, "x")
    let threw = false
    try {
        createRunDir(tmp, "x")
    }
    catch (err) {
        threw = true
    }
    check("result folder is never overwritten", threw)
    fs.rmSync(tmp, { recursive: true, force: true })
}
check("isolation: foreign plugin is detected", checkInit({ plugins: [ { name: "ase" }, { name: "agdf", source: "agdf@market" } ], mcp_servers: [ { name: "ase" } ] }).length === 1)
check("isolation: only ASE is fine", checkInit({ plugins: [ { name: "ase" } ], mcp_servers: [ { name: "ase" } ] }).length === 0)
check("isolation: built-in CLI plugins (@builtin) are allowed",
    checkInit({ plugins: [ { name: "ase" }, { name: "cc-plugin-telemetry", path: "builtin", source: "cc-plugin-telemetry@builtin" } ], mcp_servers: [ { name: "ase" } ] }).length === 0)
check("isolation: foreign MCP server (account connector) is detected (negative case)",
    eq(checkInit({ plugins: [ { name: "ase" } ], mcp_servers: [ { name: "ase" }, { name: "claude.ai Notion" } ] }), [ "foreign MCP server loaded: claude.ai Notion" ]))
check("isolation: missing ASE MCP server is detected", checkInit({ plugins: [ { name: "ase" } ], mcp_servers: [] }).length === 1)
check("isolation: unconnected ASE MCP server is detected (CR-007)", checkInit({ plugins: [ { name: "ase" } ], mcp_servers: [ { name: "ase", status: "failed" } ] }).length === 1)
{
    const args = claudeArgs({ model: "sonnet", budget: 5, mcpConfigFile: "x.json" })
    const i = args.indexOf("--mcp-config")
    check("invocation: --strict-mcp-config and --mcp-config with file", args.includes("--strict-mcp-config") && args[i + 1] === "x.json")
    check("invocation: MCP tools mcp__ase__*", args.includes("mcp__ase__*") && !args.some((a) => a.includes("plugin_ase")))
    check("MCP configuration: exactly the server ase", eq(Object.keys(mcpConfig().mcpServers), [ "ase" ]) && mcpConfig().mcpServers.ase.args.at(-1) === "mcp")
}
{
    /*  CR-002: a multibyte character split across two output chunks stays intact  */
    const tmp    = fs.mkdtempSync(path.join(os.tmpdir(), "ase-rr-selftest-"))
    const text   = "range 12–15 ▢ café señor"
    const script = `const b = Buffer.from(JSON.stringify({ type: "result", result: ${JSON.stringify(text)} }) + "\\n"); `
        + "const i = b.indexOf(0xe2) + 1; process.stdout.write(b.subarray(0, i)); setTimeout(() => process.stdout.write(b.subarray(i)), 100)"
    const res = await runChild({ program: process.execPath, args: [ "-e", script ], cwd: tmp, env: process.env, timeoutMs: 10000,
        transcriptFile: path.join(tmp, "t.jsonl"), stderrFile: path.join(tmp, "e.txt"), onInit: () => [] })
    check("transcript: a split multibyte character stays intact (CR-002)", res.events[0]?.result === text)
    fs.rmSync(tmp, { recursive: true, force: true })
}
{
    const use = (input) => ({ type: "assistant", message: { content: [ { type: "tool_use", name: "Read", input } ] } })
    check("contamination: access to the expected-results list is detected", checkContamination([ use({ file_path: "../../solution/expected.json" }) ]).length > 0)
    check("contamination: a relative path inside the copy is fine", checkContamination([ use({ file_path: "src/cart.ts" }) ]).length === 0)
}
{
    const base = { CLAUDECODE: "1", CLAUDE_CODE_SIMPLE: "1", ANTHROPIC_BASE_URL: "http://host", ANTHROPIC_API_KEY: "k", PATH: "/usr/bin", BENCH_TOKEN: "secret-123" }
    const env  = childEnv({ base, platform: "linux", baseUrl: "https://example.invalid", authTokenEnv: "BENCH_TOKEN" })
    check("child environment: inherited CLAUDE* and ANTHROPIC_* variables removed", env.CLAUDECODE === undefined && env.CLAUDE_CODE_SIMPLE === undefined && env.ANTHROPIC_API_KEY === undefined)
    check("child environment: endpoint and token set", env.ANTHROPIC_BASE_URL === "https://example.invalid" && env.ANTHROPIC_AUTH_TOKEN === "secret-123")
    check("child environment: protocol holds names only, no token", !JSON.stringify(envSummary(env)).includes("secret"))
    check("child environment: tool/bin first in PATH", env.PATH.split(path.delimiter)[0].endsWith(path.join("tool", "bin")))
}

/*  SCN-013 (part): deterministic serialization  */
check("serialization: key order is stable", stableStringify({ b: 1, a: { d: 2, c: 3 } }) === stableStringify({ a: { c: 3, d: 2 }, b: 1 }))

process.stdout.write(`\n${passed} passed, ${failed} failed\n`)
process.exit(failed === 0 ? 0 : 1)
