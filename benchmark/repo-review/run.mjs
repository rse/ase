#!/usr/bin/env node
/*
**  ASE review benchmark -- runner
**  Usage: node run.mjs --help
*/

import fs   from "node:fs"
import os   from "node:os"
import path from "node:path"

import { REPO_DIR, TESTDATA_DIR, DEFAULT_CASE, resolveCase, readJson, sha256, stableStringify, git } from "./lib/common.mjs"
import { buildCopy, removeCopy, fixtureDigest } from "./lib/copy.mjs"
import { checkCopy }                            from "./lib/leak.mjs"
import { parseReview }                          from "./lib/parser.mjs"
import { thresholdVersion }                     from "./lib/report.mjs"
import {
    PROMPT, claudeArgs, childEnv, envSummary, claudeProgram, runChild, checkInit, checkContamination,
    transcriptFacts, cliVersion, aseInfo, userAseConfig, createRunDir, stamp, modelShort, seriesAllows, isAlive,
    mcpConfig, aseProcesses, killLeftovers
} from "./lib/runner.mjs"

const HELP = `Usage: node run.mjs [options]

  --case <name>             test case (default: correctness-cents)
  --model <model>           model for claude -p (default: sonnet)
  --runs <n>                number of runs (default: 1)
  --budget <usd>            cost limit per run (default: 5)
  --timeout-min <min>       time limit per run in minutes (default: 20)
  --total-budget <usd>      series budget of all runs of this call (default: 30)
  --prior-spent <usd>       cost already spent in the series (default: 0)
  --confirm-paid            explicit flag for paid runs
  --base-url <url>          other API endpoint (sets ANTHROPIC_BASE_URL)
  --auth-token-env <VAR>    name of the environment variable holding the token (sets ANTHROPIC_AUTH_TOKEN)
  --out <folder>            location of the result folders (default: results folder of the case)
  --keep                    keep the throw-away copy after the run
  --dry-run                 dry run without a model call
  --replay <file>           canned stream-json transcript for the dry run
                            (default: normal.jsonl in the testdata folder of the case)
  --simulate <case>         special case in the dry run: abort-cost, abort-time, unparseable, leak
  --help                    this help
`

/*  parse the command line  */
function options (argv) {
    const o = {
        caseName: DEFAULT_CASE,
        model: "sonnet", runs: 1, budget: 5, timeoutMin: 20, totalBudget: 30, priorSpent: 0,
        confirmPaid: false, baseUrl: null, authTokenEnv: null, out: null, keep: false,
        dryRun: false, replay: null, simulate: null
    }
    const num = (v, name) => {
        const n = Number(v)
        if (!Number.isFinite(n) || n < 0)
            throw new Error(`${name} needs a number >= 0`)
        return n
    }
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]
        const v = () => {
            if (i + 1 >= argv.length)
                throw new Error(`${a} needs a value`)
            return argv[++i]
        }
        if      (a === "--case")           o.caseName     = v()
        else if (a === "--model")          o.model        = v()
        else if (a === "--runs")           o.runs         = Math.max(1, Math.floor(num(v(), a)))
        else if (a === "--budget")         o.budget       = num(v(), a)
        else if (a === "--timeout-min")    o.timeoutMin   = num(v(), a)
        else if (a === "--total-budget")   o.totalBudget  = num(v(), a)
        else if (a === "--prior-spent")    o.priorSpent   = num(v(), a)
        else if (a === "--confirm-paid")   o.confirmPaid  = true
        else if (a === "--base-url")       o.baseUrl      = v()
        else if (a === "--auth-token-env") o.authTokenEnv = v()
        else if (a === "--out")            o.out          = path.resolve(v())
        else if (a === "--keep")           o.keep         = true
        else if (a === "--dry-run")        o.dryRun       = true
        else if (a === "--replay")         o.replay       = path.resolve(v())
        else if (a === "--simulate")       o.simulate     = v()
        else if (a === "--help")           o.help         = true
        else
            throw new Error(`unknown option: ${a}`)
    }
    if (o.simulate !== null && ![ "abort-cost", "abort-time", "unparseable", "leak" ].includes(o.simulate))
        throw new Error(`unknown special case: ${o.simulate}`)
    if (!o.dryRun && (o.replay !== null || o.simulate !== null))
        throw new Error("--replay and --simulate only with --dry-run")
    o.case = resolveCase(o.caseName)
    o.out ??= o.case.resultsDir
    return o
}

/*  preconditions before any model call  */
function preflight (o) {
    const problems = []
    const c = o.case
    try {
        const expected = readJson(c.expectedFile)
        if (!Array.isArray(expected.entries))
            problems.push(`expected-results list invalid: run node check.mjs --case ${c.name}`)
    }
    catch (err) {
        problems.push(`expected-results list missing or not JSON (${c.expectedFile})`)
    }
    let thresholds = null
    try {
        thresholds = readJson(c.thresholdFile)
    }
    catch (err) {
        problems.push(`threshold file missing or not JSON (${c.thresholdFile})`)
    }
    if (o.dryRun)
        return problems
    if (!o.confirmPaid)
        problems.push("paid run without --confirm-paid: obtain the cost approval first, then start with --confirm-paid")
    const tv = thresholdVersion(c)
    if (thresholds !== null && (tv.commit === null || tv.modified))
        problems.push(`${path.relative(process.cwd(), c.thresholdFile)} is not committed or modified: commit the threshold file before the measurement`)
    if (!fs.existsSync(path.join(REPO_DIR, "tool", "dst", "ase.js")))
        problems.push("tool/ is not built: cd tool && npm start build")
    if (o.budget > 5 || o.totalBudget > 30)
        problems.push("limits above the approved values (5 USD per run, 30 USD in total)")
    if (o.timeoutMin > 20)
        problems.push("time limit above 20 minutes")
    return problems
}

/*  events for a dry run: replay file or synthesized special case  */
function dryEvents (o) {
    if (o.simulate === "abort-cost")
        return [
            { type: "system", subtype: "init", model: "claude-sonnet-5-5", plugins: [ { name: "ase" } ], mcp_servers: [ { name: "ase", status: "connected" } ] },
            { type: "result", subtype: "error_max_budget_usd", is_error: true, total_cost_usd: 5.03, modelUsage: { "claude-sonnet-5-5": {} }, permission_denials: [] }
        ]
    /*  the normal transcript belongs to the case, the special cases are shared  */
    const file = o.replay ?? (o.simulate === "unparseable"
        ? path.join(TESTDATA_DIR, "unparseable.jsonl")
        : path.join(o.case.testdataDir, "normal.jsonl"))
    return fs.readFileSync(file, "utf8").split(/\r?\n/).filter((l) => l.trim() !== "").map((l) => JSON.parse(l))
}

/*  one run  */
async function oneRun (o, nr, env, program, pre) {
    const started = new Date()
    const name    = `${stamp(started)}-${modelShort(o.model)}-${nr}${o.dryRun ? "-dry" : ""}`
    const dir     = createRunDir(o.out, name)
    const copy    = buildCopy(o.case)
    /*  MCP configuration outside the parent of the copy, so ".." does not lead to the repository path  */
    const mcpDir  = fs.mkdtempSync(path.join(os.tmpdir(), "ase-rr-mcp-"))
    const mcpFile = path.join(mcpDir, "ase-mcp.json")
    fs.writeFileSync(mcpFile, JSON.stringify(mcpConfig(), null, 4))
    const args    = claudeArgs({ ...o, mcpConfigFile: mcpFile })
    const before  = o.dryRun ? [] : aseProcesses()
    const meta    = {
        schema:          1,
        case:            o.case.name,
        status:          null,
        reason:          null,
        details:         [],
        dry_run:         o.dryRun,
        simulate:        o.simulate,
        replay:          o.replay ? path.basename(o.replay) : (o.dryRun ? "normal.jsonl" : null),
        model:           { requested: o.model, reported: [] },
        endpoint:        { base_url: safeUrl(o.baseUrl), token_set: Boolean(o.authTokenEnv) },
        child_env:       envSummary(env),
        cli_version:     o.dryRun ? null : cliVersion(program, pre),
        ase:             aseInfo(),
        user_ase_config: userAseConfig(),
        started_at:      started.toISOString(),
        duration_ms:     null,
        cost_usd:        null,
        budget_usd:      o.budget,
        timeout_min:     o.timeoutMin,
        permission_denials: null,
        invocation:      { program: o.dryRun ? "(dry run)" : program, args: [ ...pre, ...args ], prompt: PROMPT, mcp_config: mcpConfig() },
        init_plugins:    [],
        init_mcp:        [],
        leftovers_killed: [],
        fixture_digest:  fixtureDigest(o.case),
        expected_digest: sha256(fs.readFileSync(o.case.expectedFile)),
        copy_dir:        o.keep ? copy.dir : null
    }
    const finish = (review) => {
        meta.duration_ms = Date.now() - started.getTime()
        if (review !== null)
            fs.writeFileSync(path.join(dir, "review.md"), review)
        fs.writeFileSync(path.join(dir, "run.json"), stableStringify(meta))
        return meta
    }
    try {
        return await runInCopy(o, dir, copy, args, env, before, meta, finish, program, pre)
    }
    catch (err) {
        /*  unexpected failure: still write a protocol  */
        meta.status  = "error"
        meta.reason  = "internal"
        meta.details = [ err.message ]
        return finish(null)
    }
    finally {
        fs.rmSync(mcpDir, { recursive: true, force: true })
        if (!o.keep)
            removeCopy(copy)
    }
}

/*  base URL for the protocol, without user info, query, or fragment  */
function safeUrl (url) {
    if (!url)
        return "default"
    try {
        const u = new URL(url)
        return `${u.protocol}//${u.host}${u.pathname}`
    }
    catch (err) {
        return "(invalid URL)"
    }
}

/*  the part of a run that works on the copy  */
async function runInCopy (o, dir, copy, args, env, before, meta, finish, program, pre) {

    /*  leak check before any model call  */
    if (o.simulate === "leak") {
        fs.appendFileSync(path.join(copy.dir, "src", "api.ts"), "\n// see sollliste\n")
        fs.writeFileSync(path.join(copy.dir, "NOTES.md"), "B-03\n")
        git(copy.dir, [ "commit", "-q", "--allow-empty", "-m", "Fix K-02" ])
    }
    const leaks = checkCopy(copy.dir, o.case)
    if (leaks.length > 0) {
        meta.status  = "error"
        meta.reason  = "leak"
        meta.details = leaks
        fs.writeFileSync(path.join(dir, "transcript.jsonl"), "")
        fs.writeFileSync(path.join(dir, "stderr.txt"), "")
        return finish(null)
    }

    /*  model call or dry-run replay  */
    let events, stopped = null
    const timeoutMs = o.simulate === "abort-time" ? 3000 : o.timeoutMin * 60 * 1000
    if (o.dryRun && o.simulate !== "abort-time") {
        events = dryEvents(o)
        fs.writeFileSync(path.join(dir, "transcript.jsonl"), events.map((e) => JSON.stringify(e)).join("\n") + "\n")
        fs.writeFileSync(path.join(dir, "stderr.txt"), "")
        const init = events.find((e) => e.type === "system" && e.subtype === "init")
        const problems = init ? checkInit(init) : [ "no init event" ]
        if (problems.length > 0)
            stopped = { status: "error", reason: "isolation", details: problems }
    }
    else {
        const child = o.simulate === "abort-time"
            ? { program: process.execPath, args: [ path.join(TESTDATA_DIR, "sim-hang.mjs"), path.join(dir, "grandchild.pid") ] }
            : { program, args: [ ...pre, ...args ] }
        const res = await runChild({
            program: child.program, args: child.args, cwd: copy.dir, env, timeoutMs,
            transcriptFile: path.join(dir, "transcript.jsonl"),
            stderrFile:     path.join(dir, "stderr.txt"),
            onInit:         checkInit
        })
        events  = res.events
        stopped = res.stopped
        if (!o.dryRun) {
            await new Promise((r) => setTimeout(r, 1000))
            meta.leftovers_killed = killLeftovers(before)
        }
        if (o.simulate === "abort-time") {
            const pidFile = path.join(dir, "grandchild.pid")
            const gpid    = fs.existsSync(pidFile) ? Number(fs.readFileSync(pidFile, "utf8")) : null
            await new Promise((r) => setTimeout(r, 500))
            meta.process_tree_killed = { child: !isAlive(res.pid), grandchild: gpid === null ? null : !isAlive(gpid) }
        }
    }

    /*  facts, limits, contamination  */
    const facts = transcriptFacts(events)
    meta.model.reported      = facts.reported
    meta.init_plugins        = facts.plugins
    meta.init_mcp            = facts.mcp
    meta.cost_usd            = facts.cost
    meta.permission_denials  = facts.denials
    if (stopped !== null) {
        meta.status  = stopped.status
        meta.reason  = stopped.reason
        meta.details = stopped.details ?? []
        return finish(facts.text)
    }
    if (facts.result?.subtype === "error_max_budget_usd" || (facts.cost !== null && facts.cost > o.budget)) {
        meta.status = "aborted"
        meta.reason = "cost"
        return finish(facts.text)
    }
    const contamination = checkContamination(events)
    if (contamination.length > 0) {
        meta.status  = "error"
        meta.reason  = "contamination"
        meta.details = contamination
        return finish(facts.text)
    }
    if (facts.result === null) {
        meta.status = "error"
        meta.reason = "no-result"
        return finish(null)
    }
    if (facts.result.is_error) {
        /*  infrastructure failure of the CLI, not a review result  */
        meta.status = "error"
        meta.reason = facts.result.subtype ?? "is_error"
        return finish(facts.text)
    }
    meta.status = parseReview(facts.text).status
    return finish(facts.text)
}

/*  main  */
async function main () {
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
    let env
    try {
        env = childEnv({ baseUrl: o.baseUrl, authTokenEnv: o.authTokenEnv })
    }
    catch (err) {
        process.stderr.write(`${err.message}\n`)
        return 1
    }
    const { program, pre } = claudeProgram()
    fs.mkdirSync(o.out, { recursive: true })
    let spent = o.priorSpent
    for (let nr = 1; nr <= o.runs; nr++) {
        if (!o.dryRun && !seriesAllows(spent, o.budget, o.totalBudget)) {
            process.stderr.write(`series budget reached: ${spent.toFixed(2)} USD spent, `
                + `next run could cost ${o.budget} USD, limit ${o.totalBudget} USD. No further run.\n`)
            return 3
        }
        const meta = await oneRun(o, nr, env, program, pre)
        /*  a run without cost report (time, isolation, start) counts with its full limit  */
        spent += meta.cost_usd ?? (o.dryRun ? 0 : o.budget)
        process.stdout.write(`run ${nr}/${o.runs}: ${meta.status}${meta.reason ? ` (${meta.reason})` : ""}, `
            + `cost ${meta.cost_usd === null ? "–" : meta.cost_usd.toFixed(2)} USD, `
            + `duration ${Math.round(meta.duration_ms / 1000)} s\n`)
        for (const d of meta.details)
            process.stdout.write(`  - ${d}\n`)
    }
    return 0
}

process.exitCode = await main()
