/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import * as path from "node:path"

import { query } from "@anthropic-ai/claude-agent-sdk"
import type { Options, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk"

import type { TestCase }               from "./ase-test-case.js"
import type { Sandbox }                from "./ase-test-sandbox.js"
import { repoRoot }                    from "./ase-test-sandbox.js"
import type { Simulator, DialogEntry, Question } from "./ase-test-simulator.js"

/*  the recorder callbacks of a session run  */
export type SessionRecord = {
    onMessage: (msg: Record<string, any>) => void
    onStderr:  (data: string)             => void
}

/*  the outcome of one session run  */
export type SessionResult = {
    output:    string[]
    lastText:  string
    dialog:    DialogEntry[]
    sessionId: string
    model:     string
    costUsd:   number
    turns:     number
    errored:   boolean
    timedOut:  boolean
    failure:   string
}

/*  render the invocation of the skill <skill> with the arguments <args>, adding the
    plugin namespace for an un-namespaced ASE skill (see "skillPrompt" of
    "tool/src/ase-agent-runtime-tool.ts")  */
export const skillPrompt = (skill: string, args: string): string => {
    const name = skill.startsWith("ase-") && !skill.includes(":") ? `ase:${skill}` : skill
    return `/${name}${args !== "" ? ` ${args}` : ""}`
}

/*  run one headless agent tool session in the sandbox: single-shot without a
    simulator, else a multi-turn conversation with streaming input, in which the
    simulator answers the intercepted "AskUserQuestion" calls and composes the
    free-text user turns until it ends the session or the turn cap is reached  */
export const runSession = async (caze: TestCase, sandbox: Sandbox,
    simulator: Simulator | null, record: SessionRecord): Promise<SessionResult> => {
    const result: SessionResult = {
        output: [], lastText: "", dialog: [], sessionId: "", model: "",
        costUsd: 0, turns: 0, errored: false, timedOut: false, failure: ""
    }
    const prompt = caze.skill !== "" ? skillPrompt(caze.skill, caze.args) : caze.prompt

    /*  the streaming input queue: user messages are pushed as the conversation
        unfolds, and a null entry ends the input stream (and with it the session)  */
    const pending: (SDKUserMessage | null)[] = []
    let notify: (() => void) | null = null
    const push = (msg: SDKUserMessage | null) => {
        pending.push(msg)
        notify?.()
        notify = null
    }
    async function * input (): AsyncGenerator<SDKUserMessage> {
        while (true) {
            while (pending.length === 0)
                await new Promise<void>((resolve) => { notify = resolve })
            const msg = pending.shift()!
            if (msg === null)
                return
            yield msg
        }
    }
    const userMessage = (text: string): SDKUserMessage => ({
        type: "user", message: { role: "user", content: text }, parent_tool_use_id: null
    })

    /*  the wall-clock timeout of the whole run  */
    const abort = new AbortController()
    const timer = setTimeout(() => {
        result.timedOut = true
        abort.abort()
    }, caze.timeoutSec * 1000)

    /*  the session options: the working-copy plugin, the sandboxed environment and
        settings, automatically classified permissions, and a hard budget and turn cap  */
    const options: Options = {
        cwd:             sandbox.project,
        env:             sandbox.env,
        plugins:         [ { type: "local", path: path.join(repoRoot, "plugin") } ],
        settingSources:  [ "user" ],
        permissionMode:  "auto",
        maxTurns:        simulator !== null ? caze.turns!.maxTurns * 4 : 32,
        maxBudgetUsd:    caze.maxUsd,
        abortController: abort,
        stderr:          record.onStderr,
        ...(process.env.ASE_TEST_MODEL !== undefined ? { model: process.env.ASE_TEST_MODEL } : {}),
        ...(simulator === null ? { disallowedTools: [ "AskUserQuestion" ] } : {
            canUseTool: async (toolName, toolInput) => {
                if (toolName === "AskUserQuestion") {
                    const questions = (toolInput as { questions?: Question[] }).questions ?? []
                    const answers   = await simulator.answers(questions)
                    for (const question of questions)
                        result.dialog.push(
                            { role: "assistant", text: question.question },
                            { role: "user",      text: answers[question.question] ?? "" })
                    return { behavior: "allow", updatedInput: { ...toolInput, answers } }
                }
                return { behavior: "allow", updatedInput: toolInput }
            }
        })
    }

    /*  send a user turn, recording it, as the SDK does not echo the
        streaming-input user messages back into its message stream  */
    const sendUser = (text: string) => {
        push(userMessage(text))
        result.dialog.push({ role: "user", text })
        record.onMessage({ type: "user", synthetic: true, message: { role: "user", content: text } })
    }

    /*  drive the conversation  */
    sendUser(prompt)
    let userTurns = 1
    try {
        for await (const msg of query({ prompt: input(), options })) {
            record.onMessage(msg as Record<string, any>)
            if (msg.type === "system" && msg.subtype === "init") {
                result.sessionId = msg.session_id
                result.model     = msg.model
            }
            else if (msg.type === "assistant") {
                const blocks = Array.isArray(msg.message?.content) ? msg.message.content : []
                for (const block of blocks)
                    if (block.type === "text" && block.text.trim() !== "") {
                        result.output.push(...block.text.split("\n"))
                        result.lastText = block.text
                        result.dialog.push({ role: "assistant", text: block.text })
                    }
            }
            else if (msg.type === "result") {
                result.turns  += 1
                result.costUsd = msg.total_cost_usd ?? result.costUsd
                if (msg.is_error) {
                    result.errored = true
                    result.failure = `session error: ${msg.subtype}`
                    push(null)
                }
                else if (simulator === null || userTurns >= caze.turns!.maxTurns)
                    push(null)
                else {
                    const turn = await simulator.nextTurn(result.dialog)
                    if (turn === null)
                        push(null)
                    else {
                        sendUser(turn)
                        userTurns += 1
                    }
                }
            }
        }
    }
    catch (err) {
        result.errored = true
        result.failure = result.timedOut ? `timeout after ${caze.timeoutSec}s` :
            `session crashed: ${err instanceof Error ? err.message : String(err)}`
    }
    finally {
        clearTimeout(timer)
    }
    if (result.timedOut) {
        result.errored = true
        if (result.failure === "")
            result.failure = `timeout after ${caze.timeoutSec}s`
    }
    return result
}
