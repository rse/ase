/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import * as fs   from "node:fs"
import * as path from "node:path"

import { Command } from "commander"
import picomatch   from "picomatch"
import chalk       from "chalk"
import { execa }   from "execa"

import { caseDiscover }                    from "./ase-test-case.js"
import type { TestCase }                   from "./ase-test-case.js"
import { sandboxCreate, sandboxTeardown, repoRoot } from "./ase-test-sandbox.js"
import type { Sandbox }                    from "./ase-test-sandbox.js"
import { runSession }                      from "./ase-test-session.js"
import { simulatorCreate }                 from "./ase-test-simulator.js"
import { transcriptOpen, transcriptFinish } from "./ase-test-transcript.js"
import { oraclesRun, changesetDiff }       from "./ase-test-oracle.js"
import { describeCase }                    from "./ase-test-describe.js"
import { reportRun, reportSummary }        from "./ase-test-report.js"
import type { RunOutcome, CaseOutcome }    from "./ase-test-report.js"

/*  the CLI of the skill test harness  */
const program = new Command()
program
    .name("ase-test")
    .description("ASE Skill Test Harness")
    .argument("[globs...]", "case name globs to run (default: all cases)")
    .option("-c, --cases <glob...>", "case name globs to run (for \"npm start test\", " +
        "whose positional words stx consumes as task names)")
    .option("-j, --jobs <n>", "number of parallel runs", "4")
    .option("-l, --list", "list the discovered cases and exit", false)
    .option("-d, --describe", "describe the matched cases (input, fixture, simulator, oracles) and exit", false)
    .option("-k, --keep", "keep the sandboxes of all runs", false)
    .option("-K, --keep-failed", "keep the sandboxes of failed runs", false)
    .option("-m, --max-cost-usd <n>", "global cost ceiling in USD", "20")
    .option("-r, --results <dir>", "results directory (default: results/<timestamp>)")
    .option("--llm <file>", "env-file profile for an Anthropic-compatible " +
        "gateway (default: $ASE_TEST_LLM)")
    .parse(process.argv)
const opts  = program.opts()
const globs = [ ...program.args, ...(opts.cases ?? []) ]

/*  optionally load an LLM gateway profile: an env file routing the harness and its
    sandboxed sessions to an Anthropic-compatible endpoint (e.g. a LiteLLM proxy in
    front of a local model) -- already exported variables take precedence  */
const llmProfile = opts.llm ?? process.env.ASE_TEST_LLM
if (llmProfile !== undefined && llmProfile !== "") {
    const file = path.resolve(llmProfile)
    if (!fs.existsSync(file)) {
        console.error(chalk.red(`LLM gateway profile not found: ${file}`))
        process.exit(2)
    }
    process.loadEnvFile(file)
}

/*  discover and filter the cases  */
const casesDir = path.join(repoRoot, "test", "cases")
let cases = caseDiscover(casesDir)
if (globs.length > 0) {
    const matchers = globs.map((glob) => picomatch(glob))
    cases = cases.filter((caze) => matchers.some((matches) => matches(caze.name)))
}
if (opts.list) {
    for (const caze of cases)
        console.log(`${caze.name} ` + chalk.dim(`(runs: ${caze.runs}, minPass: ${caze.minPass}, ` +
            `${caze.turns !== null ? `interactive/${caze.turns.simulator}` : "single-shot"})`))
    process.exit(0)
}
if (cases.length === 0) {
    console.error(chalk.red("no test cases matched"))
    process.exit(1)
}
if (opts.describe) {
    console.log(cases.map((caze) => describeCase(caze)).join("\n\n"))
    process.exit(0)
}

/*  preflight: the fully built tool (the "ase" CLI of the plugin MCP server) and credentials  */
for (const file of [ "dst/ase.js", "dst/ase-task-board-web-client.html" ])
    if (!fs.existsSync(path.join(repoRoot, "tool", file))) {
        console.error(chalk.red(`tool is not fully built ("tool/${file}" missing) -- run: cd tool && npm start build`))
        process.exit(2)
    }
if (process.env.ANTHROPIC_API_KEY === undefined
    && process.env.CLAUDE_CODE_OAUTH_TOKEN === undefined
    && !fs.existsSync(path.join(process.env.HOME ?? "", ".claude", ".credentials.json"))) {
    console.error(chalk.red("no agent tool credentials found: set ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN"))
    process.exit(2)
}

/*  the results directory of this harness invocation  */
const timestamp  = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
const resultsDir = opts.results !== undefined ?
    path.resolve(opts.results) : path.join(repoRoot, "test", "results", timestamp)

/*  the global budget state (non-numeric option values must never silently
    disable the ceiling or starve the worker pool)  */
const maxCostUsd = Number(opts.maxCostUsd)
const jobs       = Number(opts.jobs)
if (!Number.isFinite(maxCostUsd) || maxCostUsd <= 0) {
    console.error(chalk.red(`invalid --max-cost-usd value: "${opts.maxCostUsd}"`))
    process.exit(2)
}
if (!Number.isInteger(jobs) || jobs < 1) {
    console.error(chalk.red(`invalid --jobs value: "${opts.jobs}"`))
    process.exit(2)
}
let totalUsd = 0
let aborted  = ""

/*  execute one attempt of one run of a case, containing every failure (a throw
    escaping here would reject the whole worker pool and lose all results)  */
const executeAttempt = async (caze: TestCase, run: number, retried: boolean):
Promise<{ outcome: RunOutcome, retry: boolean }> => {
    const started = Date.now()
    const outcome: RunOutcome = {
        run, outcome: "fail", costUsd: 0, durationMs: 0,
        failure: "", artifacts: "", model: "", oracles: []
    }
    let retry   = false
    let sandbox: Sandbox | null = null
    let keep    = opts.keep as boolean
    try {
        const transcript  = transcriptOpen(resultsDir, caze, run, retried)
        outcome.artifacts = transcript.dir
        sandbox           = await sandboxCreate(caze, run)
        const simulator   = simulatorCreate(caze, sandbox)
        const result      = await runSession(caze, sandbox, simulator, transcript.record)
        outcome.costUsd   = result.costUsd
        outcome.model     = result.model

        /*  an inaccurate cost (timeout or crash before the final result message)
            is only a lower bound, so book the full per-run budget globally  */
        totalUsd += result.costAccurate ? result.costUsd : Math.max(result.costUsd, caze.maxUsd)

        /*  an infrastructure failure is a crash without any skill output -- a
            timeout is never one, as retrying the most expensive failure mode
            would double the spend of a merely too slow case  */
        const infra = result.errored && !result.timedOut
            && result.failure.startsWith("session crashed")
            && !result.output.some((line) => /⧉ \*\*ASE\*\*|▶ ERROR:/.test(line))
        if (infra) {
            outcome.outcome = "error"
            outcome.failure = result.failure
            retry = !retried
            await transcriptFinish(transcript, caze, sandbox, result, "", [], false)
        }
        else {
            /*  an evaluation failure after the (expensive) session is a plain
                case failure and never triggers the infrastructure retry  */
            try {
                const diff      = await changesetDiff(sandbox)
                outcome.oracles = await oraclesRun(caze, sandbox, result, diff)
                if (result.costUsd > caze.maxUsd)
                    outcome.oracles.push({
                        kind: "budget", pass: false,
                        detail: `run cost $${result.costUsd.toFixed(2)} exceeds budget $${caze.maxUsd.toFixed(2)}`
                    })
                outcome.outcome = outcome.oracles.every((oracle) => oracle.pass) ? "pass" : "fail"
                outcome.failure = result.failure
                await transcriptFinish(transcript, caze, sandbox, result, diff,
                    outcome.oracles, outcome.outcome === "pass")
            }
            catch (err) {
                outcome.outcome = "fail"
                outcome.failure = `evaluation failed: ${err instanceof Error ? err.message : String(err)}`
            }
        }
    }
    catch (err) {
        outcome.outcome = "error"
        outcome.failure = err instanceof Error ? err.message : String(err)
        retry = !retried
    }
    finally {
        outcome.durationMs = Date.now() - started
        keep = keep || (outcome.outcome !== "pass" && (opts.keepFailed as boolean))
        if (sandbox !== null) {
            try {
                await sandboxTeardown(sandbox, keep)
                if (keep && outcome.artifacts !== "")
                    await fs.promises.writeFile(path.join(outcome.artifacts, "sandbox.txt"),
                        `${sandbox.root}\n`, "utf8")
            }
            catch (err) {
                console.log(chalk.yellow(`⚠ ${caze.name} run ${run}: sandbox teardown failed: ` +
                    `${err instanceof Error ? err.message : String(err)}`))
            }
        }
    }
    return { outcome, retry }
}

/*  execute one run of a case, where an infrastructure error gets one retry in its
    own artifact directory, started only after the first attempt is fully torn down
    and only while the global ceiling still allows it  */
const executeRun = async (caze: TestCase, run: number): Promise<RunOutcome> => {
    const first = await executeAttempt(caze, run, false)
    if (!first.retry || aborted !== "" || totalUsd > maxCostUsd)
        return first.outcome
    console.log(chalk.yellow(`⚠ ${caze.name} run ${run}: ${first.outcome.failure} -- retrying once`))
    const second = await executeAttempt(caze, run, true)

    /*  carry the first attempt's spend into the reported outcome,
        so the per-run costs of the summary sum up to the total  */
    second.outcome.costUsd += first.outcome.costUsd
    return second.outcome
}

/*  the run pool: all runs of all cases, executed with bounded concurrency,
    where the global cost ceiling stops the scheduling of further runs  */
const work: { caze: TestCase, run: number, outcome: RunOutcome | null }[] = []
for (const caze of cases)
    for (let run = 1; run <= caze.runs; run++)
        work.push({ caze, run, outcome: null })
let next = 0
const worker = async (): Promise<void> => {
    while (next < work.length) {
        const item = work[next++]
        if (aborted !== "") {
            item.outcome = {
                run: item.run, outcome: "skipped", costUsd: 0, durationMs: 0,
                failure: `skipped (${aborted})`, artifacts: "", model: "", oracles: []
            }
            continue
        }
        item.outcome = await executeRun(item.caze, item.run)
        reportRun(item.caze.name, item.outcome)
        if (totalUsd > maxCostUsd && aborted === "")
            aborted = `cost ceiling $${maxCostUsd.toFixed(2)} exceeded`
    }
}
console.log(`running ${work.length} run(s) of ${cases.length} case(s) ` +
    chalk.dim(`(jobs: ${jobs}, budget: $${maxCostUsd.toFixed(2)}` +
        (process.env.ANTHROPIC_BASE_URL !== undefined ? `, endpoint: ${process.env.ANTHROPIC_BASE_URL}` : "") +
        `, results: ${resultsDir})`))
await Promise.all(Array.from({ length: Math.min(jobs, work.length) }, () => worker()))

/*  aggregate the outcomes per case (pass@k) and report, with the run provenance
    (models, endpoint, versions) as the comparison key of future summaries  */
const outcomes: CaseOutcome[] = cases.map((caze) => {
    const runs   = work.filter((item) => item.caze === caze).map((item) => item.outcome!)
    const passed = runs.filter((run) => run.outcome === "pass").length
    return { name: caze.name, skill: caze.skill, runs, minPass: caze.minPass, pass: passed >= caze.minPass }
})
const pluginCommit = await execa("git", [ "rev-parse", "HEAD" ], { cwd: repoRoot, reject: false })
    .then(({ stdout }) => (stdout ?? "").trim())
const sdkVersion = await fs.promises.readFile(
    path.join(repoRoot, "test", "node_modules", "@anthropic-ai", "claude-agent-sdk", "package.json"), "utf8")
    .then((text) => (JSON.parse(text) as { version?: string }).version ?? "").catch(() => "")
const meta = {
    timestamp,
    endpoint:     process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com",
    model:        process.env.ASE_TEST_MODEL ?? "(account default)",
    judgeModel:   process.env.ASE_TEST_JUDGE_MODEL ?? "claude-haiku-5-5",
    simModel:     process.env.ASE_TEST_SIM_MODEL ?? "claude-haiku-5-5",
    pluginCommit,
    sdkVersion,
    nodeVersion:  process.version
}
process.exit(reportSummary(resultsDir, outcomes, totalUsd, aborted, meta))
