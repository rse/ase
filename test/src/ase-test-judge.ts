/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import * as fs   from "node:fs"

import type { TestCase }      from "./ase-test-case.js"
import type { Sandbox }       from "./ase-test-sandbox.js"
import type { SessionResult } from "./ase-test-session.js"
import { llmText }            from "./ase-test-llm.js"

/*  the maximum number of output characters shown to the judge  */
const OUTPUT_MAX = 40000

/*  judge the output of one run against a rubric with an LLM: each of the <votes>
    independent votes scores the output from 0.0 to 1.0, a vote passes when its
    score reaches the threshold, and the majority of the votes decides  */
export const judgeRubric = async (caze: TestCase, sandbox: Sandbox, result: SessionResult,
    spec: { file: string, threshold?: number, votes?: number }):
Promise<{ kind: string, pass: boolean, detail: string }> => {
    const model     = process.env.ASE_TEST_JUDGE_MODEL ?? "claude-haiku-5-5"
    const threshold = spec.threshold ?? 0.7
    const votes     = spec.votes ?? 3
    const rubric    = fs.readFileSync(spec.file, "utf8")
    const output    = result.output.join("\n").slice(0, OUTPUT_MAX)
    const system    =
        "You are a strict, impartial evaluator of the output of an AI coding assistant skill.\n" +
        "Score how well the output satisfies the rubric, from 0.0 (not at all) to 1.0 (fully).\n" +
        "Respond with a single JSON object of the form { \"score\": <number>, \"reason\": \"<one sentence>\" } " +
        "only, without using any tools."
    const prompt    = `# Rubric\n\n${rubric}\n\n# Output Under Evaluation\n\n${output}`
    const scores: { score: number, reason: string }[] = []
    for (let vote = 0; vote < votes; vote++) {
        const text = await llmText(sandbox, model, system, prompt)
        const m    = /\{[\s\S]*\}/.exec(text)
        let score  = 0
        let reason = "unparsable judge response"
        if (m !== null) {
            try {
                const parsed = JSON.parse(m[0])
                if (typeof parsed.score === "number" && parsed.score >= 0 && parsed.score <= 1) {
                    score  = parsed.score
                    reason = typeof parsed.reason === "string" ? parsed.reason : ""
                }
            }
            catch (_err) {
                /*  keep the unparsable default  */
            }
        }
        scores.push({ score, reason })
    }
    const passed = scores.filter((entry) => entry.score >= threshold).length
    const pass   = passed > votes / 2
    return {
        kind: "rubric", pass,
        detail: `${passed}/${votes} votes >= ${threshold} ` +
            `(scores: ${scores.map((entry) => entry.score.toFixed(2)).join(", ")}; ` +
            `${scores.map((entry) => entry.reason).filter((reason) => reason !== "").at(-1) ?? ""})`
    }
}
