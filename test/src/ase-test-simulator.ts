/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import * as fs      from "node:fs"

import YAML         from "yaml"
import { z }        from "zod"

import type { TestCase } from "./ase-test-case.js"
import type { Sandbox }  from "./ase-test-sandbox.js"
import { llmText }       from "./ase-test-llm.js"

/*  one entry of the recorded dialog between the tested session and the simulated user  */
export type DialogEntry = { role: "user" | "assistant", text: string }

/*  one question of an intercepted "AskUserQuestion" tool call  */
export type Question = {
    question:    string
    header?:     string
    multiSelect?: boolean
    options?:    { label: string, description?: string }[]
}

/*  the user simulator: answers the questions of an intercepted "AskUserQuestion"
    tool call, and composes the next free-text user turn of the dialog (or ends
    the session with null)  */
export type Simulator = {
    answers  (questions: Question[]): Promise<Record<string, string>>
    nextTurn (dialog: DialogEntry[]): Promise<string | null>
}

/*  the schema of a scripted simulator "answers.yaml" file: ordered rules matching
    the question or last assistant message, plus an optional fallback answer
    (without a fallback, an unmatched free-text turn ends the session)  */
const scriptSchema = z.strictObject({
    rules: z.array(z.strictObject({
        when:   z.string(),
        answer: z.string()
    })).optional(),
    default: z.string().optional(),
    end:     z.string().optional()
})
export type Script = z.infer<typeof scriptSchema>

/*  load and validate a scripted simulator script, including the compilation of
    its regular expressions, so an invalid script fails at case load time and
    never as a crash inside an already paid session  */
export const scriptLoad = (file: string, name: string): Script => {
    const parsed = scriptSchema.safeParse(YAML.parse(fs.readFileSync(file, "utf8")))
    if (!parsed.success)
        throw new Error(`case "${name}": invalid simulator script: ${z.prettifyError(parsed.error)}`)
    for (const re of [ ...(parsed.data.rules ?? []).map((rule) => rule.when), parsed.data.end ])
        if (re !== undefined) {
            try {
                RegExp(re, "s")
            }
            catch (err) {
                throw new Error(`case "${name}": invalid simulator script regular expression ` +
                    `"${re}": ${err instanceof Error ? err.message : String(err)}`, { cause: err })
            }
        }
    return parsed.data
}

/*  the scripted simulator: deterministic regular-expression rules  */
const scriptedSimulator = (caze: TestCase): Simulator => {
    const script = scriptLoad(caze.turns!.script, caze.name)
    const match = (text: string): string | null => {
        for (const rule of script.rules ?? [])
            if (new RegExp(rule.when, "s").test(text))
                return rule.answer
        return script.default ?? null
    }
    return {
        answers: async (questions) => {
            const answers: Record<string, string> = {}
            for (const question of questions) {
                const scope = [ question.question, ...(question.options ?? []).map((o) => o.label) ].join("\n")
                answers[question.question] = match(scope) ?? question.options?.[0]?.label ?? "proceed"
            }
            return answers
        },
        nextTurn: async (dialog) => {
            const last = dialog.filter((entry) => entry.role === "assistant").at(-1)
            if (last === undefined)
                return null
            if (script.end !== undefined && new RegExp(script.end, "s").test(last.text))
                return null
            return match(last.text)
        }
    }
}

/*  the token with which the LLM-driven simulated user ends the session  */
const END_TOKEN = "<<END>>"

/*  the LLM-driven simulator: a foreign LLM session plays the user along
    a persona, seeing the tested session's messages as its inputs  */
const llmSimulator = (caze: TestCase, sandbox: Sandbox): Simulator => {
    const model   = caze.turns!.model !== "" ? caze.turns!.model :
        (process.env.ASE_TEST_SIM_MODEL ?? "claude-haiku-5-5")
    const persona = caze.turns!.persona !== "" ? fs.readFileSync(caze.turns!.persona, "utf8") : ""
    const system  =
        "You simulate the human user of an interactive AI coding assistant session under test.\n" +
        "Stay fully in character and answer the assistant's questions consistently and concisely.\n" +
        (persona !== "" ? `\nYour persona and goals:\n\n${persona}\n` : "") +
        "\nWhen the assistant offers lettered or numbered answer alternatives, first check EVERY " +
        "alternative of EVERY question against your persona and goals, and pick exactly the one " +
        "which matches them; NEVER pick an alternative which contradicts your persona, even when " +
        "it is marked as the current or recommended one.\n" +
        "\nReply with the user's next message only (no commentary, no tools). When the assistant " +
        `has finished its work, asks for nothing more, or your goals are reached, reply with exactly "${END_TOKEN}".`
    const complete = async (dialog: DialogEntry[], ask: string): Promise<string> => {
        const transcript = dialog.map((entry) =>
            `${entry.role === "assistant" ? "ASSISTANT" : "YOU"}:\n${entry.text !== "" ? entry.text : "(empty)"}`)
        return llmText(sandbox, model, system,
            `${transcript.length > 0 ? `# Session So Far\n\n${transcript.join("\n\n")}\n\n` : ""}# Request\n\n${ask}`)
    }
    return {
        answers: async (questions) => {
            const answers: Record<string, string> = {}
            for (const question of questions) {
                const options = (question.options ?? []).map((o) => `- ${o.label}: ${o.description ?? ""}`).join("\n")
                const reply = await complete([], "The assistant asks you to choose. Question: " +
                    `${question.question}\n${options !== "" ? `Options:\n${options}\n` : ""}` +
                    "Reply with the chosen option label or a short free-text answer only.")
                answers[question.question] = reply !== "" && reply !== END_TOKEN ?
                    reply : (question.options?.[0]?.label ?? "proceed")
            }
            return answers
        },
        nextTurn: async (dialog) => {
            const reply = await complete(dialog, "Now reply with the user's next message " +
                `(or exactly "${END_TOKEN}" to end the session).`)
            return reply === "" || reply.includes(END_TOKEN) ? null : reply
        }
    }
}

/*  create the simulator of a test case (null for a single-shot case)  */
export const simulatorCreate = (caze: TestCase, sandbox: Sandbox): Simulator | null => {
    if (caze.turns === null)
        return null
    return caze.turns.simulator === "scripted" ? scriptedSimulator(caze) : llmSimulator(caze, sandbox)
}
