#!/usr/bin/env node
/*
**  ASE review benchmark -- self-test of parser, assignment, metrics, runner helpers, measurement log,
**  rules of the expected-results list, and proofs
**  Expected values are computed by hand from the rules in DESIGN.md, not derived from the code.
**  Usage: node selftest.mjs
*/

import fs            from "node:fs"
import os            from "node:os"
import path          from "node:path"
import { spawnSync } from "node:child_process"

import { BENCH_DIR, TESTDATA_DIR, resolveCase, stableStringify, readJson } from "./lib/common.mjs"
import { nodeIsRecent, translate, applyEdits, proveCase, renderProof }     from "./lib/proof.mjs"
import { collectRunDirs, buildReport }             from "./lib/report.mjs"
import { seriesId, renderSection, appendJournal }  from "./lib/journal.mjs"
import { parseReview, parseLocation }              from "./lib/parser.mjs"
import { buildCopy, removeCopy }                   from "./lib/copy.mjs"
import { validateExpected }                        from "./lib/expected.mjs"
import { assignFinding }                           from "./lib/matching.mjs"
import { evaluateRun, aggregate, calibrate }       from "./lib/scoring.mjs"
import { findLeak }                                from "./lib/leak.mjs"
import { options as measureOptions, preflight as measurePreflight } from "./measure.mjs"
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

const shop     = resolveCase("correctness-cents")
const expected = readJson(shop.expectedFile)
const row  = (sev, loc, text = "text") => `| **${sev}** | correctness | ${loc}: ${text} |`
const head = "◉ **REVIEW VERDICT**: **REJECT - DEMANDS CHANGES**\n\n| Severity | Dimension | Finding |\n| --- | --- | --- |\n"
const review = (rows) => head + rows.join("\n") + "\n"
const replayText = (file, dir = TESTDATA_DIR) => transcriptFacts(fs.readFileSync(path.join(dir, file), "utf8")
    .split("\n").filter(Boolean).map((l) => JSON.parse(l))).text

/*  parser format variants  */
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

/*  unparseable output of the replay file  */
check("parser: foreign output from testdata/unparseable.jsonl is unparseable",
    parseReview(replayText("unparseable.jsonl")).status === "unparseable")

/*  assignment with tolerance 3  */
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
    const multi = parseLocation("▢ `src/order.ts:29,51-52`: tags")
    check("parser: several ranges are kept", eq(multi, { file: "src/order.ts", from: 29, to: 29, extra: [ { from: 51, to: 52 } ] }))
    check("parser: ranges with blanks and single lines", eq(parseLocation("`src/order.ts:21, 33-35, 40`")?.extra, [ { from: 33, to: 35 }, { from: 40, to: 40 } ]))
    check("parser: a comma followed by text is no range", parseLocation("`src/cart.ts:30`, and more")?.extra === undefined)
    check("matching: a later range hits (B-04 at 51-52 via 29,51-52)", assignFinding({ severity: "HIGH", location: multi }, expected)?.id === "B-04")
    check("matching: the first range alone misses B-04 (negative case)", assignFinding(f("src/order.ts", 29), expected) === null)
}

/*  metrics computed by hand
    run 1 (cases/correctness-cents/testdata/normal.jsonl): hits B-01, B-02 (obvious 2/2), B-03 (medium 1/3), B-06 (hidden 1/2),
           overall 4/7 = 0.5714; decoy K-04 1/4 = 0.25; unassignable 1 (inventory.ts); ACCEPTED 1; duplicate 1 (cart.ts:31)
    run 2: unparseable -> recall 0, not in false alarm rate
    run 3: NO FINDINGS -> recall 0, false alarm 0
    run 4: aborted -> not evaluated
    means: overall (0.5714 + 0 + 0) / 3 = 0.1905, obvious 1/3 = 0.3333, false alarm (0.25 + 0) / 2 = 0.125  */
{
    const runs = [
        { name: "r1", status: "ok", model: "m", review: replayText("normal.jsonl", shop.testdataDir), cost: 0.4, duration: 1000 },
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

    /*  calibration  */
    const full = { ...r1, recall: { ...r1.recall, overall: 1 } }
    check("calibration: all runs with recall 1 give \"too easy\" with a next step",
        calibrate([ full, full, full ]).statement === "too easy" && calibrate([ full ]).next_step !== null)
    check("calibration: one run below gives \"adequate\"", calibrate([ full, full, r1 ]).statement === "adequate")
}

/*  leak terms  */
check("leak: a deny-listed term is detected", findLeak("// see sollliste") === "sollliste")
check("leak: an expected-results id is detected", findLeak("Fix B-03 now") === "B-03")
check("leak: \"debug\" is no hit for \"bug\" (negative case)", findLeak("debug output") === null)
check("leak: \"falls through\" is allowed", findLeak("/* falls through */") === null)
check("leak: plural forms like \"bugs\" and \"todos\" are detected", findLeak("two bugs here") === "bug" && findLeak("open todos") === "todo")
for (const text of [ "set intentionally", "a deliberate choice", "done deliberately", "on purpose", "on  purpose", "on-purpose", "by design", "by\tdesign", "seeded here", "planted here" ])
    check(`leak: the term of intent in "${text}" is detected`, findLeak(text) !== null)
for (const text of [ "the purpose of", "design of the API", "seed data", "the plant list", "designed by" ])
    check(`leak: "${text}" is no term of intent (negative case)`, findLeak(text) === null)

/*  runner helpers  */
check("series budget: 26 + 5 > 30 refused", seriesAllows(26, 5, 30) === false)
check("series budget: 25 + 5 with 10 % reserve (5.5) > 30 refused", seriesAllows(25, 5, 30) === false)
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
check("isolation: unconnected ASE MCP server is detected", checkInit({ plugins: [ { name: "ase" } ], mcp_servers: [ { name: "ase", status: "failed" } ] }).length === 1)
{
    const args = claudeArgs({ model: "sonnet", budget: 5, mcpConfigFile: "x.json" })
    const i = args.indexOf("--mcp-config")
    check("invocation: --strict-mcp-config and --mcp-config with file", args.includes("--strict-mcp-config") && args[i + 1] === "x.json")
    check("invocation: MCP tools mcp__ase__*", args.includes("mcp__ase__*") && !args.some((a) => a.includes("plugin_ase")))
    check("MCP configuration: exactly the server ase", eq(Object.keys(mcpConfig().mcpServers), [ "ase" ]) && mcpConfig().mcpServers.ase.args.at(-1) === "mcp")
}
{
    /*  a multibyte character split across two output chunks stays intact  */
    const tmp    = fs.mkdtempSync(path.join(os.tmpdir(), "ase-rr-selftest-"))
    const text   = "range 12–15 ▢ café señor"
    const script = `const b = Buffer.from(JSON.stringify({ type: "result", result: ${JSON.stringify(text)} }) + "\\n"); `
        + "const i = b.indexOf(0xe2) + 1; process.stdout.write(b.subarray(0, i)); setTimeout(() => process.stdout.write(b.subarray(i)), 100)"
    const res = await runChild({ program: process.execPath, args: [ "-e", script ], cwd: tmp, env: process.env, timeoutMs: 10000,
        transcriptFile: path.join(tmp, "t.jsonl"), stderrFile: path.join(tmp, "e.txt"), onInit: () => [] })
    check("transcript: a split multibyte character stays intact", res.events[0]?.result === text)
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

/*  deterministic serialization  */
check("serialization: key order is stable", stableStringify({ b: 1, a: { d: 2, c: 3 } }) === stableStringify({ a: { c: 3, d: 2 }, b: 1 }))

/*  measurement log  */
{
    const dirs    = collectRunDirs([ path.join(TESTDATA_DIR, "runs") ])
    const report  = buildReport(dirs, expected, shop)
    const entry   = renderSection({ title: "Series A", dirs, report, expected, c: shop })
    check("log: series id does not depend on folder order", seriesId(dirs, "c1", "x") === seriesId([ ...dirs ].reverse(), "c1", "x"))
    check("log: another scorer commit gives another series id", seriesId(dirs, "c1", "x") !== seriesId(dirs, "c2", "x"))
    check("log: another case gives another series id", seriesId(dirs, "c1", "x") !== seriesId(dirs, "c1", "y"))
    check("log: the configuration table names the case", entry.section.includes("| Case | correctness-cents |"))
    check("log: one overview row per configuration", entry.rows.length === Object.keys(report.models).length)
    const reading = entry.section.slice(entry.section.indexOf("### Manual reading"))
    check("log: the manual reading has a findings table per run with two empty columns",
        dirs.every((d, i) => reading.includes(`#### R${i + 1} `)) && reading.includes("| Severity | Location | Finding | Matched | Correct? | False alarm? |"))
    check("log: the reading table names the automated match of a finding", /\| `src\/cart\.ts:[^|]*\| [^|]*\| B-01 \|  \|  \|/.test(reading))
    check("log: defect matrix names the defect in plain words", /\| B-01 countUnits [^|]*\| obvious( \| ✓){6} \|/.test(entry.section))
    check("log: a finding at order.ts:29,51-52 now counts for B-04 in every run", /\| B-04 [^|]*\| medium( \| ✓){6} \|/.test(entry.section)
        && !entry.section.slice(entry.section.indexOf("### Unassignable findings"), entry.section.indexOf("### Manual reading")).includes("`src/order.ts:29,51-52`"))
    const tmp  = fs.mkdtempSync(path.join(os.tmpdir(), "ase-rr-log-"))
    const file = path.join(tmp, "MEASUREMENTS.md")
    appendJournal(file, entry)
    const first = fs.readFileSync(file, "utf8")
    let refused = false
    try {
        appendJournal(file, entry)
    }
    catch (err) {
        refused = true
    }
    check("log: the same series is refused a second time", refused && fs.readFileSync(file, "utf8") === first)
    const other = { ...entry, id: "sha256:other", section: "## Series B\n", rows: [ "| Series B | x | default | 1 / 1 | 1.00 | 1.00 | 0.00 | 0.0 | met | 0.00 | not yet |" ] }
    appendJournal(file, other)
    const second = fs.readFileSync(file, "utf8")
    check("log: earlier content stays unchanged", second.startsWith(first.slice(0, first.indexOf("<!-- overview:end -->")))
        && second.includes(first.slice(first.indexOf("<!-- overview:end -->"))))
    check("log: new overview row lands inside the table", /\| Series B [^\n]*\n<!-- overview:end -->/.test(second))
    fs.rmSync(tmp, { recursive: true, force: true })
}

/*  one-command measurement: options and preconditions  */
{
    const d = measureOptions([])
    check("measure: defaults are the default case, opus and sonnet, three runs", d.case.name === "correctness-cents" && d.models.join(",") === "opus,sonnet" && d.runs === 3)
    const m = measureOptions([ "--case", "security-refunds", "--models", "sonnet, opus", "--runs", "2" ])
    check("measure: case, model list, and run count are taken over", m.case.name === "security-refunds" && m.models.join(",") === "sonnet,opus" && m.runs === 2)
    let refused = false
    try {
        measureOptions([ "--dry-run", "--keep-reference" ])
    }
    catch (err) {
        refused = /only for paid runs/.test(err.message)
    }
    check("measure: a reference copy of dry runs is refused (negative case)", refused)
    check("measure: a dry run has no preconditions", measurePreflight(measureOptions([ "--dry-run" ])).length === 0)
    check("measure: paid runs without --confirm-paid are refused (negative case)", measurePreflight(d).some((p) => /--confirm-paid/.test(p)))
}

/*  case resolution  */
{
    const sec = resolveCase("security-refunds")
    check("cases: the default case is correctness-cents under cases/correctness-cents", resolveCase().name === "correctness-cents"
        && shop.expectedFile.endsWith(path.join("cases", "correctness-cents", "solution", "expected.json")))
    check("cases: security-refunds lives under cases/security-refunds", sec.dir.endsWith(path.join("cases", "security-refunds")) && sec.thresholdFile.startsWith(sec.dir))
    let refused = false
    try {
        resolveCase("other")
    }
    catch (err) {
        refused = /unknown case "other"/.test(err.message)
    }
    check("cases: an unknown case is refused (negative case)", refused)
}

/*  every case: its list is valid against its own copy and has four decoys  */
for (const name of [ "correctness-cents", "security-refunds" ]) {
    const c    = resolveCase(name)
    const exp  = readJson(c.expectedFile)
    const copy = buildCopy(c)
    try {
        const res = validateExpected(exp, copy.dir)
        check(`cases: the ${name} list is valid`, res.results.every((r) => r.ok) && res.global.length === 0)
    }
    finally {
        removeCopy(copy)
    }
    check(`cases: ${name} has four decoys`, exp.entries.filter((e) => e.kind === "decoy").length === 4)
}

/*  expected-results list version 4: minimum severity and double locations
    the security-refunds list is validated against its own copy; three altered copies must fail  */
{
    const sec    = resolveCase("security-refunds")
    const secExp = readJson(sec.expectedFile)
    const copy   = buildCopy(sec)
    try {
        const clone = () => JSON.parse(JSON.stringify(secExp))
        check("list v4: the security-refunds list is valid", validateExpected(secExp, copy.dir).results.every((r) => r.ok) && validateExpected(secExp, copy.dir).global.length === 0)
        const noSev = clone()
        delete noSev.entries[0].min_severity
        check("list v4: a finding without min_severity is invalid (negative case)", validateExpected(noSev, copy.dir).results[0].problems.some((p) => /min_severity/.test(p)))
        const single = clone()
        single.entries[1].locations = [ single.entries[1].locations[0] ]
        single.entries[5].locations = single.entries[5].locations.slice(0, 2)
        check("list v4: no finding with two locations in one file is invalid (negative case)", validateExpected(single, copy.dir).global.some((g) => /two locations/.test(g)))
        const near = clone()
        near.entries.find((e) => e.id === "K-04").locations = [ { file: "src/api.ts", lines: [ 40, 41 ] } ]
        check("list v4: a decoy 3 lines after a finding is invalid (negative case)", validateExpected(near, copy.dir).global.some((g) => /less than 8 lines/.test(g)))
        const v3 = clone()
        v3.version = 3
        delete v3.entries[0].min_severity
        check("list v3: without the version the severity rules do not apply", validateExpected(v3, copy.dir).results[0].ok)
    }
    finally {
        removeCopy(copy)
    }
}

/*  hits with adequate severity, computed by hand from cases/security-refunds/testdata/normal.jsonl:
    B-01 HIGH (min HIGH, adequate), B-02 MEDIUM (min HIGH, not adequate), B-03 HIGH (adequate),
    B-05 LOW (min MEDIUM, not adequate), B-06 HIGH (adequate); K-01 reported; store.ts unassignable
    hits 5/7 = 0.7143, obvious 1, medium 0.6667, hidden 0.5; adequate 3/7 = 0.4286; decoys 1/4 = 0.25  */
{
    const sec    = resolveCase("security-refunds")
    const secExp = readJson(sec.expectedFile)
    const text   = transcriptFacts(fs.readFileSync(path.join(sec.testdataDir, "normal.jsonl"), "utf8")
        .split("\n").filter(Boolean).map((l) => JSON.parse(l))).text
    const r = evaluateRun({ name: "s1", status: "ok", model: "m", review: text, cost: 0.5, duration: 1000 }, secExp)
    check("severity: hits B-01, B-02, B-03, B-05, B-06", eq(r.hits, [ "B-01", "B-02", "B-03", "B-05", "B-06" ]))
    check("severity: adequate hits B-01, B-03, B-06", eq(r.hits_adequate, [ "B-01", "B-03", "B-06" ]))
    check("severity: recall overall 0.7143, adequate 0.4286", r.recall.overall === 0.7143 && r.recall.adequate === 0.4286)
    check("severity: decoy K-01, 1 unassignable", eq(r.decoys_reported, [ "K-01" ]) && r.unassignable === 1)
    const dup = evaluateRun({ name: "s2", status: "ok", model: "m", cost: 0.1, duration: 100,
        review: review([ row("LOW", "▢ `src/admin.ts:21`"), row("HIGH", "▢ `src/admin.ts:31`") ]) }, secExp)
    check("severity: the highest severity of duplicate findings decides (LOW and HIGH on B-02)", eq(dup.hits_adequate, [ "B-02" ]))
    const low = evaluateRun({ name: "s3", status: "ok", model: "m", cost: 0.1, duration: 100,
        review: review([ row("MEDIUM", "▢ `src/mail.ts:26`"), row("LOW", "▢ `src/api.ts:34`") ]) }, secExp)
    check("severity: MEDIUM on a MEDIUM minimum is adequate, LOW on a HIGH minimum is not", eq(low.hits, [ "B-03", "B-05" ]) && eq(low.hits_adequate, [ "B-05" ]))
    const base = { recall_overall_min: 0.6, recall_obvious_min: 0.8, decoy_false_alarm_max: 0.25 }
    check("threshold: met without the fourth criterion (0.7143 / 1 / 0.25)", aggregate([ r ], base).threshold.verdict === "threshold met")
    check("threshold: not met with recall_adequate_min 0.5 at 0.4286 (negative case)", aggregate([ r ], { ...base, recall_adequate_min: 0.5 }).threshold.verdict === "threshold not met")
    check("threshold: met with recall_adequate_min 0.4", aggregate([ r ], { ...base, recall_adequate_min: 0.4 }).threshold.verdict === "threshold met")
    const first = evaluateRun({ name: "r1", status: "ok", model: "m", review: replayText("normal.jsonl", shop.testdataDir), cost: 0.4, duration: 1000 }, expected)
    check("severity: the version 3 list of correctness-cents yields no severity fields", first.hits_adequate === undefined && first.recall.adequate === undefined
        && aggregate([ first ], base).recall.adequate === undefined)
}

/*  the hard case context-returns and the expected-results list version 5:
    a class per finding, locations outside the change, and the structure of the case;
    the list is validated against its own copy, altered copies of the list must fail  */
{
    const hard = resolveCase("context-returns")
    check("cases: context-returns lives under cases/context-returns", hard.dir.endsWith(path.join("cases", "context-returns"))
        && hard.changeMessage === "Add returns, partial refunds and store credit")
    const exp  = readJson(hard.expectedFile)
    const copy = buildCopy(hard)
    try {
        const clone   = () => JSON.parse(JSON.stringify(exp))
        const entry   = (list, id) => list.entries.find((e) => e.id === id)
        const result  = (list, id) => validateExpected(list, copy.dir).results.find((r) => r.id === id)
        const globals = (list) => validateExpected(list, copy.dir).global
        const res     = validateExpected(exp, copy.dir)
        check("list v5: the context-returns list is valid", res.results.every((r) => r.ok) && res.global.length === 0, res.global.join("; "))
        const tiers = (tier) => exp.entries.filter((e) => e.kind === "finding" && e.tier === tier).length
        check("list v5: 8 findings (2 obvious, 2 medium, 4 hidden) and 5 decoys", tiers("obvious") === 2 && tiers("medium") === 2 && tiers("hidden") === 4
            && exp.entries.filter((e) => e.kind === "decoy").length === 5)
        check("list v5: at least 480 changed lines in at least 10 files, 60 per finding, 4 findings outside the change",
            res.figures.changed_lines >= 480 && res.figures.changed_files >= 10 && res.figures.lines_per_finding >= 60 && res.figures.outside_change === 4,
            JSON.stringify(res.figures))

        const noSeverity = clone()
        delete entry(noSeverity, "B-01").min_severity
        check("list v5: a finding without min_severity is invalid (negative case)", result(noSeverity, "B-01").problems.some((p) => /min_severity/.test(p)))
        const noClass = clone()
        delete entry(noClass, "B-03").class
        check("list v5: a finding without class is invalid (negative case)", result(noClass, "B-03").problems.some((p) => /class must be one of/.test(p)))
        const obvious = clone()
        entry(obvious, "B-01").class = "sequence"
        check("list v5: an obvious finding of another class than plain is invalid (negative case)", result(obvious, "B-01").problems.some((p) => /must have the class plain/.test(p)))
        const hiddenPlain = clone()
        entry(hiddenPlain, "B-05").class = "plain"
        check("list v5: a hidden finding of the class plain is invalid (negative case)", result(hiddenPlain, "B-05").problems.some((p) => /only an obvious finding may have the class plain/.test(p)))
        const resembles = clone()
        entry(resembles, "K-01").resembles = "plain"
        check("list v5: a decoy that resembles no context class is invalid (negative case)", result(resembles, "K-01").problems.some((p) => /resembles must be one of/.test(p)))
        const noDomain = clone()
        entry(noDomain, "B-04").class = "sequence"
        check("list v5: a list without a medium or hidden finding of the class domain is invalid (negative case)", globals(noDomain).some((g) => /class domain/.test(g)))

        const onChanged = clone()
        entry(onChanged, "B-05").locations[0].outside_change = true
        check("list v5: outside_change on a changed line is invalid (negative case)", result(onChanged, "B-05").problems.some((p) => /contains a changed line/.test(p)))
        const otherName = clone()
        entry(otherName, "B-01").locations.push({ file: "./src/returns.ts", lines: [ 93, 94 ], outside_change: true })
        check("list v5: a location outside the change must name its file as the copy lists it (negative case)", result(otherName, "B-01").problems.some((p) => /does not exist after the change/.test(p)))
        const notTrue = clone()
        entry(notTrue, "B-05").locations[1].outside_change = false
        check("list v5: outside_change must be true (negative case)", eq(result(notTrue, "B-05").problems, [ "outside_change must be true or absent" ]))
        const beyond = clone()
        entry(beyond, "B-05").locations[1].lines = [ 400, 401 ]
        check("list v5: a location outside the change beyond the end of its file is invalid (negative case)", result(beyond, "B-05").problems.some((p) => /beyond the end of the file/.test(p)))
        const unmarked = clone()
        delete entry(unmarked, "B-05").locations[1].outside_change
        check("list v5: a location in an untouched file without outside_change is invalid (negative case)", result(unmarked, "B-05").problems.some((p) => /not touched by the change/.test(p)))
        const v4 = clone()
        v4.version = 4
        check("list v4: outside_change needs version 5 (negative case)", eq(result(v4, "B-05").problems, [ "outside_change needs a list of version 5 or later" ]))
        const onDecoy = clone()
        entry(onDecoy, "K-03").locations.push({ file: "src/report.ts", lines: [ 30, 30 ], outside_change: true })
        check("list v5: a decoy with a location outside the change is invalid (negative case)", result(onDecoy, "K-03").problems.some((p) => /only a finding/.test(p)))
        const nowhere = clone()
        entry(nowhere, "B-06").locations[1].file = "src/nowhere.ts"
        check("list v5: a location outside the change in a missing file is invalid (negative case)", result(nowhere, "B-06").problems.some((p) => /does not exist after the change/.test(p)))
        const allInside = clone()
        entry(allInside, "B-08").locations = [ entry(allInside, "B-08").locations[1] ]
        check("list v5: a finding with only locations outside the change is invalid (negative case)", result(allInside, "B-08").problems.some((p) => /no location lies in a changed line/.test(p)))

        const fewOutside = clone()
        fewOutside.structure.min_outside_change = 5
        check("list v5: structure asks for 5 findings outside the change, 4 exist (negative case)", globals(fewOutside).some((g) => /4 findings with a location outside the change, at least 5/.test(g)))
        const sparse = clone()
        sparse.structure.min_changed_lines_per_finding = 1000
        check("list v5: structure asks for 1000 changed lines per finding (negative case)", globals(sparse).some((g) => /changed lines per finding, at least 1000/.test(g)))
        const manyFiles = clone()
        manyFiles.structure.min_changed_files = 50
        check("list v5: structure asks for 50 changed files (negative case)", globals(manyFiles).some((g) => /changed files, at least 50/.test(g)))
        const negative = clone()
        negative.structure.min_changed_files = -1
        check("list v5: a negative figure in structure is invalid (negative case)", globals(negative).some((g) => /structure must give/.test(g)))
        const noStructure = clone()
        delete noStructure.structure
        check("list v5: a list without structure is invalid (negative case)", globals(noStructure).some((g) => /structure must give/.test(g)))
    }
    finally {
        removeCopy(copy)
    }

    /*  computed by hand from cases/context-returns/testdata/normal.jsonl:
        B-01 HIGH (min MEDIUM, adequate), B-02 MEDIUM (min MEDIUM, adequate), B-03 MEDIUM (min HIGH, not adequate),
        B-08 HIGH at the location outside the change in src/admin.ts (min HIGH, adequate); K-02 reported; api.ts unassignable
        hits 4/8 = 0.5, obvious 1, medium 0.5, hidden 0.25; adequate 3/8 = 0.375; decoys 1/5 = 0.2  */
    const r = evaluateRun({ name: "h1", status: "ok", model: "m", review: replayText("normal.jsonl", hard.testdataDir), cost: 0.7, duration: 1000 }, exp)
    check("context-returns: hits B-01, B-02, B-03, and B-08 through its location outside the change", eq(r.hits, [ "B-01", "B-02", "B-03", "B-08" ]))
    check("context-returns: recall overall 0.5, obvious 1, medium 0.5, hidden 0.25, adequate 0.375",
        r.recall.overall === 0.5 && r.recall.obvious === 1 && r.recall.medium === 0.5 && r.recall.hidden === 0.25 && r.recall.adequate === 0.375)
    check("context-returns: decoy K-02, false-alarm rate 0.2, 1 unassignable", eq(r.decoys_reported, [ "K-02" ]) && r.false_alarm_rate === 0.2 && r.unassignable === 1)
}

/*  proofs: edits of a fix, exit codes of a single test, the command line, translation of
    TypeScript, and the proof of the hard case  */
{
    /*  the edits of a fix: text that occurs exactly once inside the project  */
    const project = fs.mkdtempSync(path.join(os.tmpdir(), "ase-rr-selftest-edits-"))
    try {
        fs.mkdirSync(path.join(project, "src"))
        fs.writeFileSync(path.join(project, "src", "a.ts"), "const a = 1\r\nconst b = 2\r\nconst c = 2\r\n")
        const edit = (file, find, replace) => applyEdits(project, [ { file, find, replace } ])
        check("proof: an edit replaces its text once, also in a file with CRLF", eq(edit("src/a.ts", [ "const a = 1", "const b = 2" ], [ "const a = 3" ]), [])
            && fs.readFileSync(path.join(project, "src", "a.ts"), "utf8") === "const a = 3\nconst c = 2\n")
        check("proof: text that does not occur is a problem (negative case)", /occurs 0 times/.test(edit("src/a.ts", [ "const z" ], [ "" ])[0]))
        check("proof: text that occurs twice is a problem (negative case)", /occurs 2 times/.test(edit("src/a.ts", [ "const" ], [ "let" ])[0]))
        check("proof: a missing file and a folder are problems (negative case)", /does not exist/.test(edit("src/b.ts", [ "x" ], [ "y" ])[0])
            && /does not exist/.test(edit("src", [ "x" ], [ "y" ])[0]))
        check("proof: a file outside the project is a problem (negative case)", /outside the project/.test(edit("../elsewhere.ts", [ "x" ], [ "y" ])[0]))
        check("proof: a malformed edit is a problem (negative case)", /invalid edit/.test(applyEdits(project, [ null ])[0])
            && /invalid edit/.test(applyEdits(project, [ { file: "src/a.ts", find: "const a" } ])[0]))
    }
    finally {
        fs.rmSync(project, { recursive: true, force: true })
    }

    /*  one test in a process of its own: 0 passes, 1 a failed assertion, 2 anything else  */
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ase-rr-selftest-proof-"))
    try {
        const tests = {
            "passes.mjs":    "export default async function ({ assert }) {\n    assert.equal(1, 1)\n}\n",
            "fails.mjs":     "export default async function ({ assert }) {\n    console.log(\"a line of the project\")\n    assert.equal(1, 2, \"one is not two\")\n}\n",
            "throws.mjs":    "export default async function () {\n    null.x\n}\n",
            "floating.mjs":  "export default async function () {\n    Promise.reject(new Error(\"late\"))\n}\n",
            "unawaited.mjs": "export default async function ({ assert }) {\n    assert.rejects(Promise.resolve(1), \"must reject\")\n}\n",
            "then.mjs":      "export default function ({ assert }) {\n    Promise.resolve().then(() => assert.equal(1, 2))\n}\n",
            "timer.mjs":     "export default async function ({ assert }) {\n    setTimeout(() => assert.equal(1, 2), 20)\n}\n",
            "empty.mjs":     "export const nothing = 1\n"
        }
        const child = (name) => {
            fs.writeFileSync(path.join(tmp, name), tests[name])
            const res = spawnSync(process.execPath, [ path.join(BENCH_DIR, "lib", "proof-child.mjs"), tmp, path.join(tmp, name) ], { encoding: "utf8" })
            return { status: res.status, out: res.stdout.trim().split("\n").at(-1) }
        }
        check("proof: a passing test ends with 0", eq(child("passes.mjs"), { status: 0, out: "pass" }))
        check("proof: a failed assertion ends with 1 and its message in the last line", eq(child("fails.mjs"), { status: 1, out: "one is not two" }))
        const thrown = child("throws.mjs")
        check("proof: another exception ends with 2 (negative case)", thrown.status === 2 && thrown.out.startsWith("error: TypeError"))
        check("proof: a rejection nobody handles ends with 2 (negative case)", child("floating.mjs").status === 2)
        check("proof: an assertion the test does not wait for ends with 2 (negative case)", child("unawaited.mjs").status === 2
            && child("then.mjs").status === 2 && child("timer.mjs").status === 2)
        check("proof: a test file without a default export ends with 2 (negative case)", child("empty.mjs").status === 2)
    }
    finally {
        fs.rmSync(tmp, { recursive: true, force: true })
    }

    /*  the command line of prove.mjs  */
    const prove = (...args) => {
        const res = spawnSync(process.execPath, [ path.join(BENCH_DIR, "prove.mjs"), ...args ], { encoding: "utf8" })
        return { status: res.status, out: res.stdout, err: res.stderr }
    }
    const unknown = prove("--case", "other")
    check("prove: an unknown case ends with 2 (negative case)", unknown.status === 2 && /unknown case "other"/.test(unknown.err))
    const noName = prove("--case")
    check("prove: --case without a name ends with 2 (negative case)", noName.status === 2 && /--case needs a name/.test(noName.err))
    check("prove: an unknown option ends with 2 (negative case)", prove("--fast").status === 2)

    const none = proveCase(resolveCase("correctness-cents"))
    check("proof: a case without proofs is not proven (negative case)", !none.ok && none.problems.some((p) => /has no proofs/.test(p))
        && renderProof(none).at(-1) === "result: FAILED")

    if (!nodeIsRecent())
        check("proof: this Node.js can translate TypeScript", false, `Node.js ${process.versions.node}`)
    else {
        const withoutProofs = prove()
        check("prove: without --case the default case has no proofs and the command ends with 1 (negative case)", withoutProofs.status === 1
            && /case correctness-cents has no proofs/.test(withoutProofs.out) && /result: FAILED/.test(withoutProofs.out))

        const source = [
            "import type { Order } from \"./order\"",
            "import { total } from \"./cart\"",
            "import { createHmac } from \"node:crypto\"",
            "import { rate } from \"./rates.js\"",
            "export { total as sum } from \"../shared/cart\"",
            "/*  restore it from \"./backup\"  */",
            "const note = 'restore it from \"./backup\"'",
            "export function f(order: Order, n: number = 2): number {",
            "    return total(order) as number",
            "}"
        ].join("\n")
        const js = translate(source)
        check("proof: the translation keeps the line count and blanks out the types", js.split("\n").length === 10
            && !js.includes("./order") && !js.includes(": number") && !js.includes(" as number") && js.includes("f(order"))
        check("proof: relative imports and exports get the suffix .mjs", js.includes("from \"./cart.mjs\"") && js.includes("from \"../shared/cart.mjs\""))
        check("proof: other specifiers, specifiers with a suffix, comments, and strings stay as they are", js.includes("from \"node:crypto\"")
            && js.includes("from \"./rates.js\"") && js.includes("/*  restore it from \"./backup\"  */") && js.includes("'restore it from \"./backup\"'"))

        const hard = resolveCase("context-returns")
        const exp  = readJson(hard.expectedFile)
        const good = proveCase(hard)
        const of   = (res, id) => res.entries.find((e) => e.id === id)
        check("proof: every entry of context-returns is proven", good.ok && good.entries.length === 13 && good.entries.every((e) => e.proven), renderProof(good).join(" / "))
        check("proof: every finding fails on the change and passes with its own fix",
            good.entries.filter((e) => e.kind === "finding").every((e) => e.on_change === "fails" && e.with_fix === "pass"))
        check("proof: every decoy passes on the change", good.entries.filter((e) => e.kind === "decoy").every((e) => e.on_change === "pass"))
        check("proof: with all fixes together 13 of 13 tests pass", good.together.total === 13 && good.together.passed === 13
            && renderProof(good).includes("all fixes together: 13 of 13 tests pass") && renderProof(good).at(-1) === "result: OK")

        /*  four ways a proof must not go through, in one run:
            B-01 with a fix that changes nothing, B-03 with a test that throws instead of asserting,
            K-01 with a test whose only assertion is not waited for, K-02 with a test that fails  */
        const fixes = readJson(hard.fixesFile).fixes
        fixes["B-01"] = [ { file: "src/returns.ts", find: [ "    for (let i = 1; i < lines.length; i++)" ], replace: [ "    for (let i = 1; i <  lines.length; i++)" ] } ]
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ase-rr-selftest-proofs-"))
        try {
            fs.cpSync(hard.proofsDir, dir, { recursive: true })
            fs.writeFileSync(path.join(dir, "B-03.mjs"), "export default async function ({ load }) {\n    (await load(\"credit\")).noSuchFunction()\n}\n")
            fs.writeFileSync(path.join(dir, "K-01.mjs"), "export default async function ({ assert }) {\n    assert.rejects(Promise.resolve(1), \"must reject\")\n}\n")
            fs.writeFileSync(path.join(dir, "K-02.mjs"), "export default async function ({ assert }) {\n    assert.equal(1, 2, \"one is not two\")\n}\n")
            const bad = proveCase(hard, { fixes, proofsDir: dir })
            check("proof: a fix that changes nothing leaves its finding unproven (negative case)", !bad.ok && !of(bad, "B-01").proven
                && of(bad, "B-01").on_change === "fails" && of(bad, "B-01").with_fix === "fails")
            check("proof: a test that throws instead of asserting proves nothing (negative case)", !of(bad, "B-03").proven && of(bad, "B-03").on_change === "error"
                && of(bad, "B-03").message.startsWith("error:"))
            check("proof: a decoy whose test does not wait for its assertion is not proven (negative case)", !of(bad, "K-01").proven && of(bad, "K-01").on_change === "error")
            check("proof: a decoy whose test fails is not proven (negative case)", !of(bad, "K-02").proven && of(bad, "K-02").on_change === "fails")
            check("proof: all fixes together name the tests that do not pass (negative case)", eq(bad.together.failing, [ "B-01", "B-03", "K-01", "K-02" ])
                && renderProof(bad).includes("all fixes together: 9 of 13 tests pass (not: B-01, B-03, K-01, K-02)") && renderProof(bad).at(-1) === "result: FAILED")
            check("proof: the other entries stay proven", bad.entries.filter((e) => ![ "B-01", "B-03", "K-01", "K-02" ].includes(e.id)).every((e) => e.proven))

            /*  a fix whose text does not occur: its finding is not proven, and the fixes cannot be applied together  */
            const absent = readJson(hard.fixesFile).fixes
            absent["B-02"] = [ { file: "src/mail.ts", find: [ "            to:      order.customerId," ], replace: [ "            to:      order.customer.email," ] } ]
            const noText = proveCase(hard, { fixes: absent })
            check("proof: a fix whose text does not occur is reported (negative case)", !noText.ok && !of(noText, "B-02").proven && of(noText, "B-02").with_fix === "error"
                && /occurs 0 times/.test(of(noText, "B-02").message) && noText.together === null
                && noText.problems.some((p) => /all fixes together: src\/mail.ts/.test(p)))

            fs.rmSync(path.join(dir, "K-05.mjs"))
            fs.writeFileSync(path.join(dir, "K-09.mjs"), "export default async function () {}\n")
            delete fixes["B-08"]
            fixes["B-09"] = fixes["B-01"]
            const incomplete = proveCase(hard, { fixes, proofsDir: dir })
            check("proof: a missing test, a test without an entry, a missing fix, and a fix without a finding are reported (negative case)",
                !incomplete.ok && incomplete.entries.length === 0
                && incomplete.problems.some((p) => /K-05: no test/.test(p)) && incomplete.problems.some((p) => /K-09\.mjs: a test without an entry/.test(p))
                && incomplete.problems.some((p) => /B-08: no fix/.test(p)) && incomplete.problems.some((p) => /B-09: a fix without a finding/.test(p)))
        }
        finally {
            fs.rmSync(dir, { recursive: true, force: true })
        }
        check("proof: every finding of the list has a fix and every fix a finding", eq(Object.keys(readJson(hard.fixesFile).fixes).sort(),
            exp.entries.filter((e) => e.kind === "finding").map((e) => e.id).sort()))
    }
}

process.stdout.write(`\n${passed} passed, ${failed} failed\n`)
process.exit(failed === 0 ? 0 : 1)
