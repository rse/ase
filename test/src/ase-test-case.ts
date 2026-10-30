/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import * as fs   from "node:fs"
import * as path from "node:path"

import { z }     from "zod"
import YAML      from "yaml"

/*  the oracle specifications: each oracle is an object with exactly one key
    naming the oracle kind, mirroring the evaluation criteria of the agent
    engine (see "tool/src/ase-agent-runtime-engine.ts", "DefinedCore.evaluate")  */
const oracleSchema = z.union([

    /*  the skill reported no "▶ ERROR:" line (see "skillErrored" of
        "tool/src/ase-agent-runtime-tool.ts") and the session itself succeeded  */
    z.strictObject({ notErrored: z.literal(true) }),

    /*  the last verdict word following a label matches (see "verdictOf")  */
    z.strictObject({
        verdict: z.strictObject({
            label:        z.string(),
            expect:       z.string()
        })
    }),

    /*  regular expressions which must (not) match a target text  */
    z.strictObject({
        regex: z.strictObject({
            in:           z.enum([ "lastMessage", "output", "transcript", "file" ]).optional(),
            file:         z.string().optional(),
            flags:        z.string().optional(),
            match:        z.union([ z.string(), z.array(z.string()) ]).optional(),
            not:          z.union([ z.string(), z.array(z.string()) ]).optional()
        })
    }),

    /*  files which must exist in the sandbox project after the run  */
    z.strictObject({ fileExists: z.union([ z.string(), z.array(z.string()) ]) }),

    /*  the Git changeset diff of the run (against the fixture commit)  */
    z.strictObject({
        gitDiff: z.strictObject({
            empty:        z.boolean().optional(),
            changed:      z.array(z.string()).optional(),
            unchanged:    z.array(z.string()).optional(),
            mustMatch:    z.array(z.string()).optional(),
            mustNotMatch: z.array(z.string()).optional()
        })
    }),

    /*  the state of the file task store (".ase/task/") after the run  */
    z.strictObject({
        taskStore: z.strictObject({
            id:           z.string().optional(),
            exists:       z.boolean().optional(),
            status:       z.string().optional(),
            titleMatch:   z.string().optional(),
            bodyMatch:    z.string().optional(),
            count:        z.number().int().optional()
        })
    }),

    /*  length metrics of a target text  */
    z.strictObject({
        textMetric: z.strictObject({
            in:           z.enum([ "lastMessage", "output", "file" ]).optional(),
            file:         z.string().optional(),
            minChars:     z.number().int().optional(),
            maxChars:     z.number().int().optional(),
            minWords:     z.number().int().optional(),
            maxWords:     z.number().int().optional()
        })
    }),

    /*  an LLM judge scoring the run output against a rubric (majority of votes)  */
    z.strictObject({
        rubric: z.strictObject({
            file:         z.string(),
            threshold:    z.number().min(0).max(1).optional(),
            votes:        z.number().int().min(1).optional()
        })
    }),

    /*  an LLM judge scoring the semantic similarity of a target text against
        the golden expected output of a file (majority of votes)  */
    z.strictObject({
        similar: z.strictObject({
            expected:     z.string(),
            in:           z.enum([ "lastMessage", "output", "transcript", "taskBody" ]).optional(),
            id:           z.string().optional(),
            threshold:    z.number().min(0).max(1).optional(),
            votes:        z.number().int().min(1).optional()
        })
    })
])
export type OracleSpec = z.infer<typeof oracleSchema>

/*  the schema of a "case.yaml" file (unknown keys are errors)  */
const caseSchema = z.strictObject({
    skill:      z.string().optional(),
    args:       z.string().optional(),
    prompt:     z.string().optional(),
    runs:       z.number().int().min(1).optional(),
    minPass:    z.number().int().min(1).optional(),
    timeoutSec: z.number().int().min(1).optional(),
    budget:     z.strictObject({
        maxUsd:     z.number().positive()
    }).optional(),
    fixture:    z.strictObject({
        git:        z.boolean().optional(),
        lifecycle:  z.string().optional(),
        config:     z.record(z.string(), z.unknown()).optional(),
        tasks:      z.array(z.string()).optional(),
        files:      z.string().optional()
    }).optional(),
    turns:      z.strictObject({
        simulator:  z.enum([ "scripted", "llm" ]),
        script:     z.string().optional(),
        persona:    z.string().optional(),
        model:      z.string().optional(),
        maxTurns:   z.number().int().min(1).optional()
    }).optional(),
    oracles:    z.array(oracleSchema).min(1)
})

/*  a loaded and normalized test case  */
export type TestCase = {
    name:       string
    dir:        string
    skill:      string
    args:       string
    prompt:     string
    runs:       number
    minPass:    number
    timeoutSec: number
    maxUsd:     number
    fixture: {
        git:        boolean
        lifecycle:  string
        config:     Record<string, unknown> | null
        tasks:      string[]
        files:      string
    }
    turns: {
        simulator:  "scripted" | "llm"
        script:     string
        persona:    string
        model:      string
        maxTurns:   number
    } | null
    oracles:    OracleSpec[]
}

/*  load and normalize one "case.yaml" file, resolving the relative file
    references against the case directory and checking their existence  */
export const caseLoad = (casesDir: string, file: string): TestCase => {
    const dir  = path.dirname(file)
    const name = path.relative(casesDir, dir).split(path.sep).join("/")
    const raw  = caseSchema.safeParse(YAML.parse(fs.readFileSync(file, "utf8")))
    if (!raw.success)
        throw new Error(`case "${name}": invalid "case.yaml": ${z.prettifyError(raw.error)}`)
    const spec = raw.data
    if ((spec.skill === undefined) === (spec.prompt === undefined))
        throw new Error(`case "${name}": exactly one of "skill" or "prompt" is required`)
    const resolve = (ref: string, kind: string): string => {
        const resolved = path.resolve(dir, ref)
        if (!resolved.startsWith(dir + path.sep))
            throw new Error(`case "${name}": ${kind} reference "${ref}" escapes the case directory`)
        if (!fs.existsSync(resolved))
            throw new Error(`case "${name}": ${kind} file "${ref}" not found`)
        return resolved
    }
    const runs = spec.runs ?? 1
    if ((spec.minPass ?? 1) > runs)
        throw new Error(`case "${name}": "minPass" exceeds "runs"`)
    if (spec.turns?.simulator === "scripted" && spec.turns.script === undefined)
        throw new Error(`case "${name}": scripted simulator requires "script"`)
    const result: TestCase = {
        name,
        dir,
        skill:      spec.skill ?? "",
        args:       spec.args ?? "",
        prompt:     spec.prompt !== undefined ? fs.readFileSync(resolve(spec.prompt, "prompt"), "utf8").trim() : "",
        runs,
        minPass:    spec.minPass ?? runs,
        timeoutSec: spec.timeoutSec ?? 300,
        maxUsd:     spec.budget?.maxUsd ?? 2.0,
        fixture: {
            git:        spec.fixture?.git ?? false,
            lifecycle:  spec.fixture?.lifecycle ?? "solo",
            config:     spec.fixture?.config ?? null,
            tasks:      (spec.fixture?.tasks ?? []).map((task) => resolve(task, "task")),
            files:      spec.fixture?.files !== undefined ? resolve(spec.fixture.files, "files") : ""
        },
        turns: spec.turns !== undefined ? {
            simulator:  spec.turns.simulator,
            script:     spec.turns.script  !== undefined ? resolve(spec.turns.script,  "script")  : "",
            persona:    spec.turns.persona !== undefined ? resolve(spec.turns.persona, "persona") : "",
            model:      spec.turns.model ?? "",
            maxTurns:   spec.turns.maxTurns ?? 16
        } : null,
        oracles: spec.oracles.map((oracle) => {
            if ("rubric" in oracle)
                return { rubric: { ...oracle.rubric, file: resolve(oracle.rubric.file, "rubric") } }
            else if ("similar" in oracle) {
                if ((oracle.similar.in ?? "lastMessage") === "taskBody" && oracle.similar.id === undefined)
                    throw new Error(`case "${name}": similar oracle target "taskBody" requires the "id" key`)
                return { similar: { ...oracle.similar, expected: resolve(oracle.similar.expected, "expected") } }
            }
            return oracle
        })
    }
    caseCheckRes(result)
    return result
}

/*  reject invalid regular expressions of the oracles already at load time
    (a JavaScript regex, so inline flags like "(?i)" are not supported),
    as an evaluation throwing only after the expensive session wastes a run  */
const caseCheckRes = (caze: TestCase): void => {
    const check = (res: (string | undefined)[], flags: string, kind: string) => {
        for (const re of res)
            if (re !== undefined) {
                try {
                    RegExp(re, flags)
                }
                catch (err) {
                    throw new Error(`case "${caze.name}": invalid ${kind} regular expression ` +
                        `"${re}": ${err instanceof Error ? err.message : String(err)}`, { cause: err })
                }
            }
    }
    const asList = (value: string | string[] | undefined): (string | undefined)[] =>
        value === undefined ? [] : (Array.isArray(value) ? value : [ value ])
    for (const oracle of caze.oracles) {
        if ("regex" in oracle)
            check([ ...asList(oracle.regex.match), ...asList(oracle.regex.not) ],
                oracle.regex.flags ?? "m", "regex oracle")
        else if ("gitDiff" in oracle)
            check([ ...(oracle.gitDiff.mustMatch ?? []), ...(oracle.gitDiff.mustNotMatch ?? []) ],
                "m", "gitDiff oracle")
        else if ("taskStore" in oracle) {
            check([ oracle.taskStore.titleMatch ], "i",  "taskStore title")
            check([ oracle.taskStore.bodyMatch ],  "im", "taskStore body")
        }
    }
}

/*  discover all test cases below the cases directory, sorted by name  */
export const caseDiscover = (casesDir: string): TestCase[] => {
    const files: string[] = []
    const walk = (dir: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.isDirectory())
                walk(path.join(dir, entry.name))
            else if (entry.name === "case.yaml")
                files.push(path.join(dir, entry.name))
        }
    }
    if (fs.existsSync(casesDir))
        walk(casesDir)
    return files.sort().map((file) => caseLoad(casesDir, file))
}
