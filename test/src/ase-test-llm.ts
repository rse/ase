/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import Anthropic from "@anthropic-ai/sdk"
import { query } from "@anthropic-ai/claude-agent-sdk"

import type { Sandbox } from "./ase-test-sandbox.js"

/*  the hard timeout of a single completion, so a hung endpoint or a wedged agent
    tool subprocess can never freeze a worker of the run pool forever  */
const LLM_TIMEOUT_MS = 120 * 1000

/*  a single-shot, tool-less LLM text completion for the user simulator and the
    rubric judge: with an API key the plain Anthropic SDK is used directly, else
    the completion runs through the Agent SDK, whose process authenticates with
    the same (OAuth) credentials of the sandboxed HOME as the tested sessions  */
export const llmText = async (sandbox: Sandbox, model: string,
    system: string, prompt: string): Promise<string> => {
    const abort = new AbortController()
    const timer = setTimeout(() => { abort.abort() }, LLM_TIMEOUT_MS)
    try {
        if (process.env.ANTHROPIC_API_KEY !== undefined) {
            const client   = new Anthropic()
            const response = await client.messages.create({
                model, max_tokens: 1024, system,
                messages: [ { role: "user", content: prompt } ]
            }, { signal: abort.signal })
            return response.content.filter((block) => block.type === "text")
                .map((block) => block.text).join("\n").trim()
        }
        let text = ""
        for await (const msg of query({
            prompt,
            options: {
                cwd:             sandbox.home,
                env:             sandbox.env,
                settingSources:  [],
                systemPrompt:    { type: "custom", prompt: system },
                tools:           [],
                maxTurns:        1,
                abortController: abort,
                model
            }
        })) {
            if (msg.type === "assistant")
                for (const block of (Array.isArray(msg.message?.content) ? msg.message.content : []))
                    if (block.type === "text")
                        text += block.text
        }
        return text.trim()
    }
    catch (err) {
        if (abort.signal.aborted)
            throw new Error(`LLM completion timeout after ${LLM_TIMEOUT_MS / 1000}s (model: ${model})`, { cause: err })
        throw err
    }
    finally {
        clearTimeout(timer)
    }
}
