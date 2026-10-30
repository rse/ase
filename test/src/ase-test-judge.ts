/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import * as fs   from "node:fs"

import type { Sandbox }       from "./ase-test-sandbox.js"
import type { SessionResult } from "./ase-test-session.js"
import { llmText }            from "./ase-test-llm.js"

/*  the maximum number of characters of a judged text  */
const TEXT_MAX = 40000

/*  the shared vote loop of the LLM judges: each of the <votes> independent votes
    scores from 0.0 to 1.0 as a JSON object, a vote passes when its score reaches
    the threshold, and the majority of the votes decides  */
const judgeVotes = async (sandbox: Sandbox, system: string, prompt: string,
    threshold: number, votes: number, kind: string):
Promise<{ kind: string, pass: boolean, detail: string }> => {
    const model  = process.env.ASE_TEST_JUDGE_MODEL ?? "claude-haiku-5-5"
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
        kind, pass,
        detail: `${passed}/${votes} votes >= ${threshold} ` +
            `(scores: ${scores.map((entry) => entry.score.toFixed(2)).join(", ")}; ` +
            `${scores.map((entry) => entry.reason).filter((reason) => reason !== "").at(-1) ?? ""})`
    }
}

/*  judge the output of one run against a rubric  */
export const judgeRubric = async (sandbox: Sandbox, result: SessionResult,
    spec: { file: string, threshold?: number, votes?: number }):
Promise<{ kind: string, pass: boolean, detail: string }> => {
    const rubric = fs.readFileSync(spec.file, "utf8")
    const output = result.output.join("\n").slice(0, TEXT_MAX)
    const system =
        "You are a strict, impartial evaluator of the output of an AI coding assistant skill.\n" +
        "Score how well the output satisfies the rubric, from 0.0 (not at all) to 1.0 (fully).\n" +
        "Respond with a single JSON object of the form { \"score\": <number>, \"reason\": \"<one sentence>\" } " +
        "only, without using any tools."
    const prompt = `# Rubric\n\n${rubric}\n\n# Output Under Evaluation\n\n${output}`
    return judgeVotes(sandbox, system, prompt, spec.threshold ?? 0.7, spec.votes ?? 3, "rubric")
}

/*  judge the semantic similarity of the actual text of one run against the golden
    expected text: shared decisions, facts, and constraints count, while wording,
    structure, ordering, and extra elaboration do not  */
export const judgeSimilar = async (sandbox: Sandbox,
    expectedText: string, actualText: string,
    spec: { threshold?: number, votes?: number }):
Promise<{ kind: string, pass: boolean, detail: string }> => {
    const system =
        "You are a strict, impartial evaluator of the semantic similarity of two texts: " +
        "the EXPECTED text states the decisions, facts, and constraints a result must carry, " +
        "and the ACTUAL text is the result under evaluation.\n" +
        "Score from 0.0 (semantically unrelated or contradicting) to 1.0 (semantically equivalent): " +
        "count only whether the ACTUAL text commits to the same decisions, facts, and constraints " +
        "as the EXPECTED text; ignore wording, structure, ordering, formatting, and extra elaboration " +
        "which contradicts nothing; lower the score for every contradicted or missing commitment.\n" +
        "Respond with a single JSON object of the form { \"score\": <number>, \"reason\": \"<one sentence>\" } " +
        "only, without using any tools."
    const prompt =
        `# EXPECTED\n\n${expectedText.slice(0, TEXT_MAX)}\n\n` +
        `# ACTUAL\n\n${actualText.slice(0, TEXT_MAX)}`
    return judgeVotes(sandbox, system, prompt, spec.threshold ?? 0.7, spec.votes ?? 3, "similar")
}
