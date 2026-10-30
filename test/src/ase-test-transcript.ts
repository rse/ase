/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import * as fs   from "node:fs"
import * as path from "node:path"

import type { TestCase }                     from "./ase-test-case.js"
import type { Sandbox }                      from "./ase-test-sandbox.js"
import type { SessionRecord, SessionResult } from "./ase-test-session.js"
import type { OracleResult }                 from "./ase-test-oracle.js"

/*  the per-run artifact recorder: the raw SDK messages as "transcript.jsonl",
    a decoded human-readable "transcript.md", the agent tool stderr, and at the
    end the changeset diff, a copy of the task store, and the "result.json"  */
export type Transcript = {
    dir:    string
    record: SessionRecord
}

/*  abbreviate a value into a single line of at most <max> characters
    (see "brief" of "tool/src/ase-agent-runtime-tool.ts")  */
const brief = (value: unknown, max = 160): string => {
    const line = (typeof value === "string" ? value : JSON.stringify(value) ?? "").replace(/\s+/g, " ").trim()
    return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

/*  open the transcript of one run, creating its artifact directory  */
export const transcriptOpen = (resultsDir: string, caze: TestCase, run: number): Transcript => {
    const dir = path.join(resultsDir, ...caze.name.split("/"), `run-${run}`)
    fs.mkdirSync(dir, { recursive: true })
    const jsonl = path.join(dir, "transcript.jsonl")
    const md    = path.join(dir, "transcript.md")
    fs.writeFileSync(md, `# ${caze.name} (run ${run})\n\n`, "utf8")
    const record: SessionRecord = {
        onMessage: (msg) => {
            fs.appendFileSync(jsonl, `${JSON.stringify(msg)}\n`, "utf8")
            const lines: string[] = []
            if (msg.type === "system" && msg.subtype === "init")
                lines.push(`**SESSION**: \`${msg.session_id}\` (model: \`${msg.model}\`)`)
            else if (msg.type === "assistant") {
                for (const block of (Array.isArray(msg.message?.content) ? msg.message.content : []))
                    if (block.type === "text" && block.text.trim() !== "")
                        lines.push(`**ASSISTANT**:\n\n${block.text}`)
                    else if (block.type === "tool_use")
                        lines.push(`**TOOL** \`${block.name}\`: ${brief(block.input)}`)
            }
            else if (msg.type === "user") {
                const content = msg.message?.content
                if (typeof content === "string")
                    lines.push(`**USER**:\n\n${content}`)
                else if (Array.isArray(content))
                    for (const block of content)
                        if (block.type === "text")
                            lines.push(`**USER**:\n\n${block.text}`)
                        else if (block.type === "tool_result" && block.is_error === true)
                            lines.push(`**TOOL FAILED**: ${brief(block.content)}`)
            }
            else if (msg.type === "result")
                lines.push(`**RESULT**: ${msg.subtype} (turns: ${msg.num_turns}, ` +
                    `cost: $${Number(msg.total_cost_usd ?? 0).toFixed(4)})`)
            if (lines.length > 0)
                fs.appendFileSync(md, `${lines.join("\n\n")}\n\n`, "utf8")
        },
        onStderr: (data) => {
            fs.appendFileSync(path.join(dir, "stderr.log"), data, "utf8")
        }
    }
    return { dir, record }
}

/*  finish the transcript of one run with the remaining artifacts  */
export const transcriptFinish = async (transcript: Transcript, caze: TestCase, sandbox: Sandbox,
    result: SessionResult, diff: string, oracles: OracleResult[], pass: boolean): Promise<void> => {
    if (diff !== "")
        await fs.promises.writeFile(path.join(transcript.dir, "diff.patch"), diff, "utf8")
    const store = path.join(sandbox.project, ".ase", "task")
    if (fs.existsSync(store))
        await fs.promises.cp(store, path.join(transcript.dir, "taskstore"), { recursive: true })
    await fs.promises.writeFile(path.join(transcript.dir, "result.json"), JSON.stringify({
        case:      caze.name,
        pass,
        sessionId: result.sessionId,
        model:     result.model,
        turns:     result.turns,
        costUsd:   result.costUsd,
        errored:   result.errored,
        timedOut:  result.timedOut,
        failure:   result.failure,
        oracles
    }, null, 4), "utf8")
}
