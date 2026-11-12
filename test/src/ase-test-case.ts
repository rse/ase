/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import * as fs   from "node:fs"
import * as path from "node:path"

import { z }     from "zod"
import YAML      from "yaml"

import { scriptLoad }  from "./ase-test-simulator.js"
import type { Script } from "./ase-test-simulator.js"

/*  the oracle specifications: each oracle is an object with exactly one key
    naming the oracle kind, mirroring the evaluation criteria of the agent
    engine (see "tool/src/ase-agent-runtime-engine.ts", "DefinedCore.evaluate"),
    where all oracle defaults live here only (the parsed specs are complete)  */
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
            in:           z.enum([ "lastMessage", "output", "dialog", "file" ]).default("lastMessage"),
            file:         z.string().optional(),
            flags:        z.string().default("m"),
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
            in:           z.enum([ "lastMessage", "output", "file" ]).default("lastMessage"),
            file:         z.string().optional(),
            minChars:     z.number().int().optional(),
            maxChars:     z.number().int().optional(),
            minWords:     z.number().int().optional(),
            maxWords:     z.number().int().optional()
        })
    }),

    /*  a behavioral comparison: a command run in the sandbox project must produce
        the same stdout as a case-local reference command (the "oracle code", run
        in the case directory) for every stdin vector  */
    z.strictObject({
        exec: z.strictObject({
            command:      z.string(),
            reference:    z.string(),
            stdin:        z.array(z.string()).min(1),
            timeoutSec:   z.number().int().min(1).default(10)
        })
    }),

    /*  a hidden Python unit-test suite: the case-local directory is copied into
        the sandbox project only after the last stage and run there, where it
        passes only if every discovered test ran and passed  */
    z.strictObject({
        suite: z.strictObject({
            dir:          z.string(),
            timeoutSec:   z.number().int().min(1).default(120)
        })
    }),

    /*  an LLM judge scoring the run output against a rubric (majority of votes)  */
    z.strictObject({
        rubric: z.strictObject({
            file:         z.string(),
            threshold:    z.number().min(0).max(1).default(0.7),
            votes:        z.number().int().min(1).default(3)
        })
    }),

    /*  an LLM judge scoring the semantic similarity of a target text against
        the golden expected output of a file (majority of votes)  */
    z.strictObject({
        similar: z.strictObject({
            expected:     z.string(),
            in:           z.enum([ "lastMessage", "output", "dialog", "taskBody" ]).default("lastMessage"),
            id:           z.string().optional(),
            threshold:    z.number().min(0).max(1).default(0.7),
            votes:        z.number().int().min(1).default(3)
        })
    })
])
export type OracleSpec = z.infer<typeof oracleSchema>

/*  the schema of the interactive turns of a session  */
const turnsSchema = z.strictObject({
    simulator:  z.enum([ "scripted", "llm" ]),
    script:     z.string().optional(),
    persona:    z.string().optional(),
    model:      z.string().optional(),
    maxTurns:   z.number().int().min(1).optional()
})

/*  the schema of one stage of a staged case: a session of its own in the shared
    sandbox, with its own limits and its diagnostic (never verdict-deciding) oracles  */
const stageSchema = z.strictObject({
    skill:      z.string(),
    args:       z.string().optional(),
    timeoutSec: z.number().int().min(1).optional(),
    budget:     z.strictObject({
        maxUsd:     z.number().positive()
    }).optional(),
    turns:      turnsSchema.optional(),
    oracles:    z.array(oracleSchema).optional()
})

/*  the schema of a "case.yaml" file (unknown keys are errors)  */
const caseSchema = z.strictObject({
    skill:      z.string().optional(),
    args:       z.string().optional(),
    promptFile: z.string().optional(),
    stages:     z.array(stageSchema).min(1).optional(),
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
    turns:      turnsSchema.optional(),
    oracles:    z.array(oracleSchema).min(1)
})

/*  the loaded and normalized interactive turns of a session  */
export type Turns = {
    simulator:  "scripted" | "llm"
    script:     string
    scriptData: Script | null
    persona:    string
    model:      string
    maxTurns:   number
}

/*  one loaded and normalized stage: a single session in the shared sandbox,
    with its diagnostic oracles (a single-skill case is one stage without any)  */
export type Stage = {
    skill:      string
    args:       string
    prompt:     string
    timeoutSec: number
    maxUsd:     number
    turns:      Turns | null
    oracles:    OracleSpec[]
}

/*  a loaded and normalized test case, where a staged case carries the sum of
    the limits of its stages and the skill names of its stages joined by " > "  */
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
    turns:      Turns | null
    oracles:    OracleSpec[]
    staged:     boolean
    stages:     Stage[]
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

    /*  exactly one of the three inputs: a skill, a prompt file, or a list of stages,
        where the limits and turns of a staged case belong to its stages  */
    if ([ spec.skill, spec.promptFile, spec.stages ].filter((input) => input !== undefined).length !== 1)
        throw new Error(`case "${name}": exactly one of "skill", "promptFile", or "stages" is required`)
    if (spec.stages !== undefined
        && (spec.turns !== undefined || spec.timeoutSec !== undefined || spec.budget !== undefined))
        throw new Error(`case "${name}": "turns", "timeoutSec", and "budget" belong to the stages of a staged case`)
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

    /*  load the interactive turns of the case resp. of one of its stages  */
    const turnsLoad = (turns: z.infer<typeof turnsSchema> | undefined, where: string): Turns | null => {
        if (turns === undefined)
            return null
        if (turns.simulator === "scripted" && turns.script === undefined)
            throw new Error(`case "${name}": scripted simulator${where} requires "script"`)
        return {
            simulator:  turns.simulator,
            script:     turns.script  !== undefined ? resolve(turns.script,  "script")  : "",
            scriptData: turns.script  !== undefined ? scriptLoad(resolve(turns.script, "script"), name) : null,
            persona:    turns.persona !== undefined ? resolve(turns.persona, "persona") : "",
            model:      process.env.ASE_TEST_FORCE_MODEL ?? turns.model ?? "",
            maxTurns:   turns.maxTurns ?? 16
        }
    }

    /*  resolve the file references of one oracle  */
    const oracleResolve = (oracle: OracleSpec): OracleSpec => {
        if ("rubric" in oracle)
            return { rubric: { ...oracle.rubric, file: resolve(oracle.rubric.file, "rubric") } }
        else if ("similar" in oracle) {
            if (oracle.similar.in === "taskBody" && oracle.similar.id === undefined)
                throw new Error(`case "${name}": similar oracle target "taskBody" requires the "id" key`)
            return { similar: { ...oracle.similar, expected: resolve(oracle.similar.expected, "expected") } }
        }
        else if ("suite" in oracle) {
            const suite = resolve(oracle.suite.dir, "suite")
            if (!fs.statSync(suite).isDirectory())
                throw new Error(`case "${name}": suite "${oracle.suite.dir}" is no directory`)
            return { suite: { ...oracle.suite, dir: suite } }
        }
        return oracle
    }

    /*  load the stages of a staged case, whose arguments may only reference the
        last message of an earlier stage, and whose diagnostic oracles must never
        expose the hidden suite before the last stage has finished  */
    const stages: Stage[] = (spec.stages ?? []).map((stage, index) => {
        const where = ` of stage ${index + 1}`
        for (const m of (stage.args ?? "").matchAll(/\{\{(.*?)\}\}/g)) {
            const ref = /^stage(\d+)\.lastMessage$/.exec(m[1])
            if (ref === null || Number(ref[1]) < 1 || Number(ref[1]) > index)
                throw new Error(`case "${name}": invalid placeholder "${m[0]}"${where} ` +
                    "(only \"{{stage<N>.lastMessage}}\" of an earlier stage is supported)")
        }
        if ((stage.oracles ?? []).some((oracle) => "suite" in oracle))
            throw new Error(`case "${name}": "suite" oracle${where} is allowed at the top-level only`)
        return {
            skill:      stage.skill,
            args:       stage.args ?? "",
            prompt:     "",
            timeoutSec: stage.timeoutSec ?? 300,
            maxUsd:     stage.budget?.maxUsd ?? 2.0,
            turns:      turnsLoad(stage.turns, where),
            oracles:    (stage.oracles ?? []).map(oracleResolve)
        }
    })
    const staged = spec.stages !== undefined
    const result: TestCase = {
        name,
        dir,
        skill:      staged ? stages.map((stage) => stage.skill).join(" > ") : (spec.skill ?? ""),
        args:       spec.args ?? "",
        prompt:     spec.promptFile !== undefined ?
            fs.readFileSync(resolve(spec.promptFile, "prompt"), "utf8").trim() : "",
        runs,
        minPass:    spec.minPass ?? runs,
        timeoutSec: staged ? stages.reduce((sum, stage) => sum + stage.timeoutSec, 0) : (spec.timeoutSec ?? 300),
        maxUsd:     staged ? stages.reduce((sum, stage) => sum + stage.maxUsd, 0) : (spec.budget?.maxUsd ?? 2.0),
        fixture: {
            git:        spec.fixture?.git ?? false,
            lifecycle:  spec.fixture?.lifecycle ?? "solo",
            config:     spec.fixture?.config ?? null,
            tasks:      (spec.fixture?.tasks ?? []).map((task) => resolve(task, "task")),
            files:      spec.fixture?.files !== undefined ? resolve(spec.fixture.files, "files") : ""
        },
        turns:      turnsLoad(spec.turns, ""),
        oracles:    spec.oracles.map(oracleResolve),
        staged,
        stages
    }

    /*  a single-skill case is the degenerate one-stage case without diagnostic oracles  */
    if (!staged)
        result.stages = [ {
            skill:      result.skill,
            args:       result.args,
            prompt:     result.prompt,
            timeoutSec: result.timeoutSec,
            maxUsd:     result.maxUsd,
            turns:      result.turns,
            oracles:    []
        } ]
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
    for (const oracle of [ ...caze.oracles, ...caze.stages.flatMap((stage) => stage.oracles) ]) {
        if ("regex" in oracle)
            check([ ...asList(oracle.regex.match), ...asList(oracle.regex.not) ],
                oracle.regex.flags, "regex oracle")
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
