/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import * as fs   from "node:fs"
import * as path from "node:path"

import chalk     from "chalk"

import type { TestCase, OracleSpec } from "./ase-test-case.js"
import { skillPrompt }               from "./ase-test-session.js"
import { scriptLoad }                from "./ase-test-simulator.js"

/*  normalize a string-or-list oracle value into a list  */
const asList = (value: string | string[] | undefined): string[] =>
    value === undefined ? [] : (Array.isArray(value) ? value : [ value ])

/*  render a list of regular expressions as "/re/" literals  */
const res = (list: string[]): string =>
    list.map((re) => `/${re}/`).join(", ")

/*  summarize one seeded fixture task file as "<id> (<status>, "<title>")"  */
const taskSummary = (file: string): string => {
    const text   = fs.readFileSync(file, "utf8")
    const id     = text.match(/^Id:\s*(\S+)\s*$/m)?.[1] ??
        path.basename(file).replace(/^TASK-(.+)\.md$/, "$1")
    const status = text.match(/^Status:\s*(\S+)\s*$/m)?.[1] ?? "?"
    const title  = text.match(/^#\s+(?:TASK:\s*)?(.+?)\s*$/m)?.[1] ?? "?"
    return `${id} (${status}, "${title}")`
}

/*  render the EXPECTED bullet of one oracle in human-readable prose, with the
    golden/rubric file contents of the LLM judge oracles inlined and indented  */
const describeOracle = (caze: TestCase, oracle: OracleSpec): string[] => {
    const lines: string[] = []
    const fileBlock = (file: string) => {
        for (const line of fs.readFileSync(file, "utf8").trimEnd().split("\n"))
            lines.push(`        ${line}`)
    }
    if ("notErrored" in oracle)
        lines.push("    - skill reports no \"▶ ERROR:\" line and the session succeeds")
    else if ("verdict" in oracle)
        lines.push(`    - verdict after label "${oracle.verdict.label}" is "${oracle.verdict.expect}"`)
    else if ("regex" in oracle) {
        const target = oracle.regex.in === "file" ?
            `file "${oracle.regex.file ?? "?"}"` : (oracle.regex.in ?? "lastMessage")
        const match  = asList(oracle.regex.match)
        const not    = asList(oracle.regex.not)
        if (match.length > 0)
            lines.push(`    - ${target} matches ${res(match)}`)
        if (not.length > 0)
            lines.push(`    - ${target} does not match ${res(not)}`)
    }
    else if ("fileExists" in oracle)
        lines.push(`    - project file(s) exist: ${asList(oracle.fileExists).join(", ")}`)
    else if ("gitDiff" in oracle) {
        const spec = oracle.gitDiff
        if (spec.empty === true)
            lines.push("    - changeset diff is empty (no repository changes)")
        else if (spec.empty === false)
            lines.push("    - changeset diff is non-empty")
        if (spec.changed !== undefined && spec.changed.length > 0)
            lines.push(`    - changeset changes: ${spec.changed.join(", ")}`)
        if (spec.unchanged !== undefined && spec.unchanged.length > 0)
            lines.push(`    - changeset leaves untouched: ${spec.unchanged.join(", ")}`)
        if (spec.mustMatch !== undefined && spec.mustMatch.length > 0)
            lines.push(`    - changeset diff matches ${res(spec.mustMatch)}`)
        if (spec.mustNotMatch !== undefined && spec.mustNotMatch.length > 0)
            lines.push(`    - changeset diff does not match ${res(spec.mustNotMatch)}`)
    }
    else if ("taskStore" in oracle) {
        const spec = oracle.taskStore
        const name = spec.id !== undefined ? `task "${spec.id}"` : "task store"
        if (spec.exists !== undefined)
            lines.push(`    - ${name} does ${spec.exists ? "" : "not "}exist`)
        if (spec.status !== undefined)
            lines.push(`    - ${name} has status ${spec.status}`)
        if (spec.titleMatch !== undefined)
            lines.push(`    - ${name} title matches /${spec.titleMatch}/`)
        if (spec.bodyMatch !== undefined)
            lines.push(`    - ${name} body matches /${spec.bodyMatch}/`)
        if (spec.count !== undefined)
            lines.push(`    - task store holds ${spec.count} task(s)`)
    }
    else if ("textMetric" in oracle) {
        const spec   = oracle.textMetric
        const target = spec.in === "file" ? `file "${spec.file ?? "?"}"` : (spec.in ?? "lastMessage")
        const bounds: string[] = []
        if (spec.minChars !== undefined) bounds.push(`>= ${spec.minChars} chars`)
        if (spec.maxChars !== undefined) bounds.push(`<= ${spec.maxChars} chars`)
        if (spec.minWords !== undefined) bounds.push(`>= ${spec.minWords} words`)
        if (spec.maxWords !== undefined) bounds.push(`<= ${spec.maxWords} words`)
        lines.push(`    - ${target} is ${bounds.join(" and ")}`)
    }
    else if ("exec" in oracle) {
        lines.push(`    - output of "${oracle.exec.command}" (in the project) matches the output of ` +
            `"${oracle.exec.oracle}" (the oracle code, in the case directory) for ` +
            `${oracle.exec.stdin.length} stdin vector(s):`)
        for (const input of oracle.exec.stdin)
            lines.push(`        ${JSON.stringify(input)}`)
    }
    else if ("rubric" in oracle) {
        lines.push(`    - LLM judge scores the output against rubric "${path.relative(caze.dir, oracle.rubric.file)}" ` +
            `(threshold: ${(oracle.rubric.threshold ?? 0.7).toFixed(2)}, votes: ${oracle.rubric.votes ?? 3}):`)
        fileBlock(oracle.rubric.file)
    }
    else if ("similar" in oracle) {
        const target = (oracle.similar.in ?? "lastMessage") === "taskBody" ?
            `task "${oracle.similar.id ?? "?"}" body` : (oracle.similar.in ?? "lastMessage")
        lines.push(`    - LLM judge scores ${target} as semantically similar to ` +
            `"${path.relative(caze.dir, oracle.similar.expected)}" ` +
            `(threshold: ${(oracle.similar.threshold ?? 0.7).toFixed(2)}, votes: ${oracle.similar.votes ?? 3}):`)
        fileBlock(oracle.similar.expected)
    }
    return lines
}

/*  render the human-readable description of one test case: its exact input
    (prompt, fixture, simulator) and its expected output (the oracles in prose)  */
export const describeCase = (caze: TestCase): string => {
    const lines: string[] = []
    lines.push(chalk.bold(caze.name) + " " + chalk.dim(`(runs: ${caze.runs}, minPass: ${caze.minPass}, ` +
        `${caze.turns !== null ? `interactive/${caze.turns.simulator}` : "single-shot"}, ` +
        `timeout: ${caze.timeoutSec}s, budget: $${caze.maxUsd.toFixed(2)})`))

    /*  the input: the first user turn, the sandbox fixture, and the simulator  */
    lines.push(chalk.underline("  INPUT"))
    if (caze.skill !== "")
        lines.push(`    prompt:    ${skillPrompt(caze.skill, caze.args)}`)
    else
        lines.push(`    prompt:    ${caze.prompt.split("\n")[0]}` +
            (caze.prompt.includes("\n") ? chalk.dim(` (+${caze.prompt.split("\n").length - 1} more lines)`) : ""))
    const fixture: string[] = []
    fixture.push(`${caze.fixture.lifecycle} lifecycle`)
    if (caze.fixture.git)
        fixture.push("git repository")
    if (caze.fixture.files !== "")
        fixture.push(`files "${path.relative(caze.dir, caze.fixture.files)}"`)
    if (caze.fixture.config !== null)
        fixture.push(`config ${JSON.stringify(caze.fixture.config)}`)
    for (const task of caze.fixture.tasks)
        fixture.push(`task ${taskSummary(task)}`)
    lines.push(`    fixture:   ${fixture.join(", ")}`)
    if (caze.turns !== null) {
        if (caze.turns.simulator === "scripted") {
            const script = scriptLoad(caze.turns.script, caze.name)
            lines.push(`    simulator: scripted "${path.relative(caze.dir, caze.turns.script)}" ` +
                `(rules: ${script.rules?.length ?? 0}` +
                (script.default !== undefined ? `, default: "${script.default}"` : "") +
                (script.end     !== undefined ? `, end: /${script.end}/` : "") +
                `, max turns: ${caze.turns.maxTurns})`)
        }
        else {
            const model   = caze.turns.model !== "" ? caze.turns.model :
                (process.env.ASE_TEST_SIM_MODEL ?? "claude-haiku-5-5")
            const persona = caze.turns.persona !== "" ?
                `"${path.relative(caze.dir, caze.turns.persona)}"` : "(none)"
            lines.push(`    simulator: llm persona ${persona} ` +
                `(model: ${model}, max turns: ${caze.turns.maxTurns})`)
        }
    }

    /*  the expected output: all oracles in prose  */
    lines.push(chalk.underline("  EXPECTED"))
    for (const oracle of caze.oracles)
        lines.push(...describeOracle(caze, oracle))
    return lines.join("\n")
}
