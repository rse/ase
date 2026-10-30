/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import Anthropic from "@anthropic-ai/sdk"
import { query } from "@anthropic-ai/claude-agent-sdk"

import type { Sandbox } from "./ase-test-sandbox.js"

/*  a single-shot, tool-less LLM text completion for the user simulator and the
    rubric judge: with an API key the plain Anthropic SDK is used directly, else
    the completion runs through the Agent SDK, whose process authenticates with
    the same (OAuth) credentials of the sandboxed HOME as the tested sessions  */
export const llmText = async (sandbox: Sandbox, model: string,
    system: string, prompt: string): Promise<string> => {
    if (process.env.ANTHROPIC_API_KEY !== undefined) {
        const client   = new Anthropic()
        const response = await client.messages.create({
            model, max_tokens: 1024, system,
            messages: [ { role: "user", content: prompt } ]
        })
        return response.content.filter((block) => block.type === "text")
            .map((block) => block.text).join("\n").trim()
    }
    let text = ""
    for await (const msg of query({
        prompt,
        options: {
            cwd:            sandbox.home,
            env:            sandbox.env,
            settingSources: [],
            systemPrompt:   { type: "custom", prompt: system },
            tools:          [],
            maxTurns:       1,
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
