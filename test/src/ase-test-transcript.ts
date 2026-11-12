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
import { diffPaths }                         from "./ase-test-oracle.js"
import type { OracleResult }                 from "./ase-test-oracle.js"

/*  the per-run artifact recorder: the raw SDK messages as "transcript.jsonl",
    a decoded human-readable "transcript.md", the agent tool stderr, and at the
    end the changeset diff, a copy of the task store, and the "result.json",
    where a staged case records each stage <N> into "stage-<N>-" prefixed files  */
export type Transcript = {
    dir:    string
    record: (stage: number) => SessionRecord
}

/*  the outcome of one stage of a staged case, as part of its "result.json"  */
export type StageOutcome = {
    stage:     number
    skill:     string
    sessionId: string
    model:     string
    costUsd:   number
    turns:     number
    errored:   boolean
    timedOut:  boolean
    failure:   string
    oracles:   OracleResult[]
}

/*  abbreviate a value into a single line of at most <max> characters
    (see "brief" of "tool/src/ase-agent-runtime-tool.ts")  */
const brief = (value: unknown, max = 160): string => {
    const line = (typeof value === "string" ? value : JSON.stringify(value) ?? "").replace(/\s+/g, " ").trim()
    return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

/*  open the transcript of one run, creating its artifact directory (a retried
    run gets its own directory, so the attempts' artifacts never interleave)  */
export const transcriptOpen = (resultsDir: string, caze: TestCase, run: number, retried = false): Transcript => {
    const dir = path.join(resultsDir, ...caze.name.split("/"), `run-${run}${retried ? "-retry" : ""}`)
    fs.mkdirSync(dir, { recursive: true })

    /*  the recorder of the stage <stage> (of a single-skill case only stage 1, unprefixed)  */
    const record = (stage: number): SessionRecord => {
        const prefix = caze.staged ? `stage-${stage}-` : ""
        const jsonl  = path.join(dir, `${prefix}transcript.jsonl`)
        const md     = path.join(dir, `${prefix}transcript.md`)
        fs.writeFileSync(md, `# ${caze.name} (run ${run}` +
            `${caze.staged ? `, stage ${stage}: ${caze.stages[stage - 1].skill}` : ""})\n\n`, "utf8")
        return {
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
                fs.appendFileSync(path.join(dir, `${prefix}stderr.log`), data, "utf8")
            }
        }
    }
    return { dir, record }
}

/*  finish the transcript of one run with the remaining artifacts  */
export const transcriptFinish = async (transcript: Transcript, caze: TestCase, sandbox: Sandbox,
    result: SessionResult, diff: string, oracles: OracleResult[], pass: boolean,
    stages: StageOutcome[] = []): Promise<void> => {
    if (diff !== "")
        await fs.promises.writeFile(path.join(transcript.dir, "diff.patch"), diff, "utf8")

    /*  keep the final state of every added or modified project file (deleted ones
        no longer exist), as the diff shows new files only as "+"-prefixed lines  */
    for (const file of new Set(diffPaths(diff))) {
        const source = path.resolve(sandbox.project, file)
        if (!source.startsWith(sandbox.project + path.sep) || !fs.statSync(source, { throwIfNoEntry: false })?.isFile())
            continue
        const target = path.join(transcript.dir, "files", file)
        await fs.promises.mkdir(path.dirname(target), { recursive: true })
        await fs.promises.copyFile(source, target)
    }
    const store = path.join(sandbox.project, ".ase", "task")
    if (fs.existsSync(store))
        await fs.promises.cp(store, path.join(transcript.dir, "taskstore"), { recursive: true })

    /*  keep the complete output of the "suite" oracle in its own log file only (removed
        in place, so it neither lands in "result.json" nor in "summary.json")  */
    for (const oracle of oracles)
        if (oracle.log !== undefined) {
            await fs.promises.writeFile(path.join(transcript.dir, `${oracle.kind}.log`), oracle.log, "utf8")
            delete oracle.log
        }
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
        oracles,
        ...(caze.staged ? { stages } : {})
    }, null, 4), "utf8")
}
