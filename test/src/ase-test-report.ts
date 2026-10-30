/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import * as fs   from "node:fs"
import * as path from "node:path"

import chalk     from "chalk"
import prettyMs  from "pretty-ms"

import type { OracleResult } from "./ase-test-oracle.js"

/*  the outcome of one run of a case  */
export type RunOutcome = {
    run:        number
    outcome:    "pass" | "fail" | "error" | "skipped"
    costUsd:    number
    durationMs: number
    failure:    string
    artifacts:  string
    oracles:    OracleResult[]
}

/*  the aggregated outcome of one case  */
export type CaseOutcome = {
    name:    string
    runs:    RunOutcome[]
    minPass: number
    pass:    boolean
}

/*  print the console report of one finished run  */
export const reportRun = (name: string, outcome: RunOutcome): void => {
    const mark = outcome.outcome === "pass" ? chalk.green("✔") :
        outcome.outcome === "fail"    ? chalk.red("✘") :
            outcome.outcome === "skipped" ? chalk.yellow("−") : chalk.red("⚠")
    const info = `(${prettyMs(outcome.durationMs)}, $${outcome.costUsd.toFixed(4)})`
    console.log(`${mark} ${name} run ${outcome.run} ${chalk.dim(info)}`)
    for (const oracle of outcome.oracles)
        if (!oracle.pass)
            console.log(`    ${chalk.red(`✘ ${oracle.kind}`)}: ${oracle.detail}`)
    if (outcome.outcome === "fail" && outcome.oracles.length === 0 && outcome.failure !== "")
        console.log(`    ${chalk.red("✘ evaluation")}: ${outcome.failure}`)
    if (outcome.outcome === "error")
        console.log(`    ${chalk.red("⚠ infra")}: ${outcome.failure}`)
    if (outcome.outcome !== "pass" && outcome.artifacts !== "")
        console.log(`    ${chalk.dim(`artifacts: ${outcome.artifacts}`)}`)
}

/*  print the console summary and write the "summary.json", resolving to the exit code  */
export const reportSummary = (resultsDir: string, cases: CaseOutcome[],
    totalUsd: number, aborted: string): number => {
    console.log("")
    for (const caze of cases) {
        const passed = caze.runs.filter((run) => run.outcome === "pass").length
        const mark   = caze.pass ? chalk.green("PASS") : chalk.red("FAIL")
        console.log(`${mark} ${caze.name} ` +
            chalk.dim(`(${passed}/${caze.runs.length} runs passed, ${caze.minPass} required)`))
    }
    const failed  = cases.filter((caze) => !caze.pass).length
    const errored = cases.some((caze) => caze.runs.some((run) => run.outcome === "error" || run.outcome === "skipped"))
    console.log("")
    console.log(`${cases.length - failed}/${cases.length} cases passed, ` +
        `total cost: $${totalUsd.toFixed(2)}${aborted !== "" ? chalk.red(` (aborted: ${aborted})`) : ""}`)
    fs.mkdirSync(resultsDir, { recursive: true })
    fs.writeFileSync(path.join(resultsDir, "summary.json"), JSON.stringify({
        cases: cases.map((caze) => ({
            name:    caze.name,
            pass:    caze.pass,
            minPass: caze.minPass,
            runs:    caze.runs.map((run) => ({
                run:        run.run,
                outcome:    run.outcome,
                costUsd:    run.costUsd,
                durationMs: run.durationMs,
                failure:    run.failure,
                artifacts:  run.artifacts,
                oracles:    run.oracles
            }))
        })),
        totalUsd,
        aborted
    }, null, 4), "utf8")
    console.log(chalk.dim(`summary: ${path.join(resultsDir, "summary.json")}`))
    return aborted !== "" ? 2 : (failed > 0 ? 1 : (errored ? 2 : 0))
}
