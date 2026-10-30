/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import * as fs   from "node:fs"
import * as os   from "node:os"
import * as path from "node:path"

import { execa } from "execa"

import type { TestCase, OracleSpec } from "./ase-test-case.js"
import type { Sandbox }              from "./ase-test-sandbox.js"
import type { SessionResult }        from "./ase-test-session.js"
import { judgeRubric, judgeSimilar } from "./ase-test-judge.js"

/*  the verdict of one oracle  */
export type OracleResult = { kind: string, pass: boolean, detail: string }

/*  whether a skill reported an error in its output lines, as the skills report
    their errors as "▶ ERROR: ..." while the agent tool still exits successfully
    (see "skillErrored" of "tool/src/ase-agent-runtime-tool.ts")  */
export const skillErrored = (output: string[]): boolean =>
    output.some((line) => /(?:^|▶ )ERROR:/.test(line.trim()))

/*  the last verdict word following the label <label> in the output lines of a
    skill (see "verdictOf" of "tool/src/ase-agent-runtime-tool.ts")  */
export const verdictOf = (output: string[], label: string): string => {
    const re = new RegExp(`${label}\\W*([A-Z]+)`)
    let verdict = ""
    for (const line of output) {
        const m = re.exec(line)
        if (m !== null)
            verdict = m[1]
    }
    return verdict
}

/*  run a Git command in the sandbox project  */
const git = async (sandbox: Sandbox, args: string[], env: Record<string, string> = {}) =>
    execa("git", args, {
        cwd: sandbox.project, env: { ...sandbox.env, ...env }, extendEnv: false,
        stdin: "ignore", timeout: 60 * 1000
    })

/*  the text-only unified diff of the change set of the sandbox project against the
    fixture commit, including untracked files, captured through a temporary index so
    the real index stays untouched (see "gitChangesetDiff" of
    "tool/src/ase-agent-runtime-exec.ts")  */
export const changesetDiff = async (sandbox: Sandbox): Promise<string> => {
    if (sandbox.baseRef === "")
        return ""
    const args  = [ "--no-color", "--no-ext-diff" ]
    const paths = [ "--", ".", ":(exclude).ase" ]
    const { stdout: index } = await git(sandbox, [ "rev-parse", "--path-format=absolute", "--git-path", "index" ])
    const temp = await fs.promises.mkdtemp(path.join(os.tmpdir(), "ase-test-index-"))
    try {
        const env = { GIT_INDEX_FILE: path.join(temp, "index") }
        await fs.promises.copyFile(index.trim(), env.GIT_INDEX_FILE).catch((err: unknown) => {
            if ((err as NodeJS.ErrnoException).code !== "ENOENT")
                throw err
        })
        await git(sandbox, [ "add", "--all", ...paths ], env)
        const { stdout: diff } = await git(sandbox, [ "diff", "--cached", ...args, sandbox.baseRef, ...paths ], env)
        return diff !== "" && !diff.endsWith("\n") ? `${diff}\n` : diff
    }
    finally {
        await fs.promises.rm(temp, { recursive: true, force: true })
    }
}

/*  the file paths touched by a unified diff  */
const diffPaths = (diff: string): string[] => {
    const paths: string[] = []
    for (const m of diff.matchAll(/^diff --git a\/(.+?) b\/(.+)$/gm)) {
        paths.push(m[1])
        if (m[2] !== m[1])
            paths.push(m[2])
    }
    return paths
}

/*  the frontmatter and body of a task plan file of the file task store  */
const taskFile = (sandbox: Sandbox, id: string): { front: Record<string, string>, body: string } | null => {
    const file = path.join(sandbox.project, ".ase", "task", `TASK-${id}.md`)
    if (!fs.existsSync(file))
        return null
    const text  = fs.readFileSync(file, "utf8")
    const m     = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text)
    const front: Record<string, string> = {}
    for (const line of (m?.[1] ?? "").split("\n")) {
        const kv = /^([A-Za-z]+):[ \t]*(.*)$/.exec(line)
        if (kv !== null)
            front[kv[1]] = kv[2].trim()
    }
    return { front, body: m?.[2] ?? text }
}

/*  the target text of a "regex" or "textMetric" oracle  */
const targetText = (spec: { in?: string, file?: string }, caze: TestCase,
    sandbox: Sandbox, result: SessionResult): string => {
    const target = spec.in ?? "lastMessage"
    if (target === "lastMessage")
        return result.lastText
    else if (target === "output")
        return result.output.join("\n")
    else if (target === "transcript")
        return result.dialog.map((entry) => `${entry.role}: ${entry.text}`).join("\n")
    else {
        if (spec.file === undefined)
            throw new Error(`case "${caze.name}": oracle target "file" requires the "file" key`)
        const file = path.resolve(sandbox.project, spec.file)
        return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : ""
    }
}

/*  evaluate all oracles of a test case against the outcome of one run  */
export const oraclesRun = async (caze: TestCase, sandbox: Sandbox,
    result: SessionResult, diff: string): Promise<OracleResult[]> => {
    const results: OracleResult[] = []
    const asList  = (value: string | string[] | undefined): string[] =>
        value === undefined ? [] : (Array.isArray(value) ? value : [ value ])
    for (const oracle of caze.oracles) {
        if ("notErrored" in oracle) {
            const errored = result.errored || skillErrored(result.output)
            results.push({
                kind: "notErrored", pass: !errored,
                detail: errored ? (result.failure !== "" ? result.failure : "skill reported \"▶ ERROR:\"") : "no error"
            })
        }
        else if ("verdict" in oracle) {
            const verdict = verdictOf(result.output, oracle.verdict.label)
            results.push({
                kind: "verdict", pass: verdict === oracle.verdict.expect,
                detail: `expected "${oracle.verdict.expect}", got "${verdict}"`
            })
        }
        else if ("regex" in oracle) {
            const text    = targetText(oracle.regex, caze, sandbox, result)
            const flags   = oracle.regex.flags ?? "m"
            const missing = asList(oracle.regex.match).filter((re) => !new RegExp(re, flags).test(text))
            const illegal = asList(oracle.regex.not).filter((re) => new RegExp(re, flags).test(text))
            results.push({
                kind: "regex", pass: missing.length === 0 && illegal.length === 0,
                detail: [
                    ...missing.map((re) => `missing match: ${re}`),
                    ...illegal.map((re) => `forbidden match: ${re}`)
                ].join(", ") || "all patterns satisfied"
            })
        }
        else if ("fileExists" in oracle) {
            const missing = asList(oracle.fileExists)
                .filter((file) => !fs.existsSync(path.resolve(sandbox.project, file)))
            results.push({
                kind: "fileExists", pass: missing.length === 0,
                detail: missing.length > 0 ? `missing: ${missing.join(", ")}` : "all files exist"
            })
        }
        else if ("gitDiff" in oracle) {
            const spec    = oracle.gitDiff
            const touched = diffPaths(diff)
            const faults: string[] = []
            if (spec.empty === true  && diff !== "")
                faults.push("diff is not empty")
            if (spec.empty === false && diff === "")
                faults.push("diff is empty")
            for (const file of spec.changed ?? [])
                if (!touched.includes(file))
                    faults.push(`unchanged: ${file}`)
            for (const file of spec.unchanged ?? [])
                if (touched.includes(file))
                    faults.push(`changed: ${file}`)
            for (const re of spec.mustMatch ?? [])
                if (!new RegExp(re, "m").test(diff))
                    faults.push(`missing match: ${re}`)
            for (const re of spec.mustNotMatch ?? [])
                if (new RegExp(re, "m").test(diff))
                    faults.push(`forbidden match: ${re}`)
            results.push({
                kind: "gitDiff", pass: faults.length === 0,
                detail: faults.join(", ") || `diff touches [ ${touched.join(", ")} ]`
            })
        }
        else if ("taskStore" in oracle) {
            const spec   = oracle.taskStore
            const store  = path.join(sandbox.project, ".ase", "task")
            const faults: string[] = []
            if (spec.count !== undefined) {
                const count = fs.existsSync(store) ?
                    fs.readdirSync(store).filter((file) => /^TASK-.+\.md$/.test(file)).length : 0
                if (count !== spec.count)
                    faults.push(`expected ${spec.count} tasks, found ${count}`)
            }
            if (spec.id !== undefined) {
                const task = taskFile(sandbox, spec.id)
                if ((spec.exists ?? true) !== (task !== null))
                    faults.push(task === null ? `task "${spec.id}" missing` : `task "${spec.id}" exists`)
                if (task !== null) {
                    if (spec.status !== undefined && task.front.Status !== spec.status)
                        faults.push(`expected status "${spec.status}", got "${task.front.Status ?? ""}"`)
                    if (spec.titleMatch !== undefined) {
                        const title = /^#\s+TASK:\s*(.*)$/m.exec(task.body)?.[1] ?? ""
                        if (!new RegExp(spec.titleMatch, "i").test(title))
                            faults.push(`title "${title}" does not match "${spec.titleMatch}"`)
                    }
                    if (spec.bodyMatch !== undefined && !new RegExp(spec.bodyMatch, "im").test(task.body))
                        faults.push(`body does not match "${spec.bodyMatch}"`)
                }
            }
            results.push({
                kind: "taskStore", pass: faults.length === 0,
                detail: faults.join(", ") || "task store as expected"
            })
        }
        else if ("textMetric" in oracle) {
            const spec  = oracle.textMetric
            const text  = targetText(spec, caze, sandbox, result)
            const chars = text.length
            const words = text.trim() === "" ? 0 : text.trim().split(/\s+/).length
            const faults: string[] = []
            if (spec.minChars !== undefined && chars < spec.minChars) faults.push(`chars ${chars} < ${spec.minChars}`)
            if (spec.maxChars !== undefined && chars > spec.maxChars) faults.push(`chars ${chars} > ${spec.maxChars}`)
            if (spec.minWords !== undefined && words < spec.minWords) faults.push(`words ${words} < ${spec.minWords}`)
            if (spec.maxWords !== undefined && words > spec.maxWords) faults.push(`words ${words} > ${spec.maxWords}`)
            results.push({
                kind: "textMetric", pass: faults.length === 0,
                detail: faults.join(", ") || `chars: ${chars}, words: ${words}`
            })
        }
        else if ("rubric" in oracle)
            results.push(await judgeRubric(sandbox, result, oracle.rubric))
        else if ("similar" in oracle) {
            const spec = oracle.similar
            if ((spec.in ?? "lastMessage") === "taskBody") {
                const task = taskFile(sandbox, spec.id!)
                if (task === null) {
                    results.push({ kind: "similar", pass: false, detail: `task "${spec.id}" missing` })
                    continue
                }
                results.push(await judgeSimilar(sandbox,
                    fs.readFileSync(spec.expected, "utf8"), task.body, spec))
            }
            else
                results.push(await judgeSimilar(sandbox,
                    fs.readFileSync(spec.expected, "utf8"), targetText(spec, caze, sandbox, result), spec))
        }
    }
    return results
}
