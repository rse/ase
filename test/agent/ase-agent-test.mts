/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

/*  the end-to-end system test of "ase agent": in a fresh sandbox, the task
    fixture of a case is driven through the "enterprise" pipeline of the
    built-in agents (implementer, qualifier, integrator), and the program the
    agents produced is checked against the fixture test suite of the case
    (zero dependencies: run directly by Node >= 22.22 via type stripping)  */

import * as cp   from "node:child_process"
import * as fs   from "node:fs"
import * as os   from "node:os"
import * as path from "node:path"
import * as url  from "node:url"
import * as util from "node:util"

/*  the repository root (this module lives in "<repo>/test/agent/")  */
const here     = path.dirname(url.fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, "..", "..")
const aseBin   = path.join(repoRoot, "tool", "bin", "ase")

/*  the configuration of a case ("case.json"): the id of its task fixture, the program
    the agents have to produce, and how the agents run ("pipeline": one agent after the
    other in the foreground, "fleet": all agents together via "ase agent fleet")  */
interface CaseConfig { task: string, program: string, runner: "pipeline" | "fleet" }
let caseCfg: CaseConfig = { task: "", program: "", runner: "pipeline" }

/*  the pipeline of the agents, each with the status it has to leave the task in  */
const pipeline = [
    { kind: "implementer", args: [ "--params", "effort-wait=false" ], expect: "IMPLEMENTED" },
    { kind: "qualifier",   args: [ "--mode", "qualify" ],              expect: "QUALIFIED"   },
    { kind: "integrator",  args: [ "--mode", "squash" ],               expect: "INTEGRATED"  }
]

/*  an infrastructure failure (exit code 2), as opposed to a test failure (exit code 1)  */
class InfraError extends Error {}

/*  parse the command-line options  */
const { values: opts } = util.parseArgs({
    options: {
        "case":         { type: "string",  default: "wordcount-python" },
        "tool":         { type: "string",  default: process.env.ASE_TOOL ?? "claude" },
        "timeout":      { type: "string",  default: "30m" },
        "max-cost-usd": { type: "string",  default: "5" },
        "keep":         { type: "boolean", default: false },
        "keep-failed":  { type: "boolean", default: false },
        "dry-run":      { type: "boolean", default: false },
        "suite-only":   { type: "string" },
        "help":         { type: "boolean", default: false, short: "h" }
    }
})
if (opts.help) {
    process.stdout.write(
        "usage: node test/agent/ase-agent-test.mts [--case <name>] [--tool claude|copilot|codex]\n" +
        "       [--timeout <duration>] [--max-cost-usd <usd>] [--keep|--keep-failed] [--dry-run]\n" +
        "       [--suite-only <project-dir>]\n")
    process.exit(0)
}
const caseDir    = path.join(here, "cases", opts.case)
const maxCostUsd = Number(opts["max-cost-usd"])
const timeoutMatch = /^(\d+)([smh])$/.exec(opts.timeout)
const timeoutMs    = timeoutMatch !== null ?
    Number(timeoutMatch[1]) * ({ s: 1, m: 60, h: 3600 }[timeoutMatch[2]] ?? 1) * 1000 : 0

/*  the result of a process run  */
interface ExecResult { code: number, stdout: string, stderr: string, timedOut: boolean }

/*  run a process without a shell (except for the probing of Windows command shims),
    optionally feeding stdin and streaming each output line to a callback  */
const exec = (cmd: string, args: string[], options: {
    cwd?:      string,
    env?:      Record<string, string>,
    input?:    string,
    timeout?:  number,
    shell?:    boolean,
    onLine?:   (line: string, stream: "stdout" | "stderr") => void
} = {}): Promise<ExecResult> => new Promise((resolve) => {
    const child = cp.spawn(cmd, args, {
        cwd:   options.cwd,
        env:   options.env ?? process.env,
        shell: options.shell ?? false,
        stdio: [ "pipe", "pipe", "pipe" ],
        windowsHide: true
    })
    const out = { stdout: "", stderr: "" }
    const rest = { stdout: "", stderr: "" }
    const collect = (stream: "stdout" | "stderr") => (data: Buffer) => {
        const text = data.toString("utf8")
        out[stream] += text
        if (options.onLine !== undefined) {
            const parts = (rest[stream] + text).split(/\r?\n/)
            rest[stream] = parts.pop() ?? ""
            for (const line of parts)
                options.onLine(line, stream)
        }
    }
    child.stdin.on("error", () => {})  /*  ignore EPIPE: the child may exit without reading stdin  */
    child.stdout.on("data", collect("stdout"))
    child.stderr.on("data", collect("stderr"))
    let timedOut = false
    const timer = options.timeout !== undefined ? setTimeout(() => {
        timedOut = true
        child.kill("SIGTERM")
        setTimeout(() => child.kill("SIGKILL"), 30 * 1000).unref()
    }, options.timeout) : null
    child.on("error", (err) => {
        out.stderr += String(err)
    })
    child.on("close", (code) => {
        if (timer !== null)
            clearTimeout(timer)
        for (const stream of [ "stdout", "stderr" ] as const)
            if (rest[stream] !== "" && options.onLine !== undefined)
                options.onLine(rest[stream], stream)
        resolve({ code: code ?? -1, stdout: out.stdout, stderr: out.stderr, timedOut })
    })
    child.stdin.end(options.input ?? "")
})

/*  log a line to the console  */
const log = (msg: string) => { process.stdout.write(`ase-agent-test: ${msg}\n`) }

/*  find the first Python interpreter (>= 3.8) in the PATH  */
const findPython = async (): Promise<string[]> => {
    for (const candidate of [ [ "python3" ], [ "python" ], [ "py", "-3" ] ]) {
        const result = await exec(candidate[0], [ ...candidate.slice(1), "-c",
            "import sys; print(sys.version_info >= (3, 8))" ], { timeout: 10 * 1000 })
        if (result.code === 0 && result.stdout.trim() === "True")
            return candidate
    }
    throw new InfraError("no Python >= 3.8 found in $PATH (tried \"python3\", \"python\", and \"py -3\")")
}

/*  check the prerequisites of a run  */
const preflight = async (): Promise<string[]> => {
    const [ major, minor ] = process.versions.node.split(".").map(Number)
    if (major < 22 || (major === 22 && minor < 22))
        throw new InfraError(`Node >= 22.22 required, found ${process.versions.node}`)
    if (!fs.existsSync(path.join(caseDir, "task.md")) || !fs.existsSync(path.join(caseDir, "suite"))
        || !fs.existsSync(path.join(caseDir, "case.json")))
        throw new InfraError(`case "${opts.case}" not found or incomplete (needs "case.json", "task.md", and "suite/")`)
    let cfg: Partial<CaseConfig>
    try {
        cfg = JSON.parse(await fs.promises.readFile(path.join(caseDir, "case.json"), "utf8")) as Partial<CaseConfig>
    }
    catch (err) {
        throw new InfraError(`case "${opts.case}": invalid "case.json": ${err instanceof Error ? err.message : String(err)}`)
    }
    if (typeof cfg.task !== "string" || !/^[a-z][a-z0-9-]*$/.test(cfg.task)
        || typeof cfg.program !== "string" || cfg.program === ""
        || (cfg.runner !== "pipeline" && cfg.runner !== "fleet"))
        throw new InfraError(`case "${opts.case}": "case.json" needs "task" (id), "program" (file), ` +
            "and \"runner\" (\"pipeline\" or \"fleet\")")
    caseCfg = { task: cfg.task, program: cfg.program, runner: cfg.runner }
    if (!fs.existsSync(path.join(repoRoot, "tool", "dst", "ase.js")))
        throw new InfraError("ASE tool not built: run \"cd tool && npm start build\" first")
    if ((await exec("git", [ "--version" ], { timeout: 10 * 1000 })).code !== 0)
        throw new InfraError("\"git\" not found in $PATH")
    if (!/^(claude|copilot|codex)$/.test(opts.tool))
        throw new InfraError(`invalid --tool "${opts.tool}"`)
    const probe = await exec(opts.tool, [ "--version" ], { timeout: 30 * 1000, shell: process.platform === "win32" })
    if (probe.code !== 0)
        throw new InfraError(`agent tool "${opts.tool}" not found in $PATH`)
    if (timeoutMs <= 0)
        throw new InfraError(`invalid --timeout "${opts.timeout}" (expected e.g. "90s", "30m", or "1h")`)
    if (!Number.isFinite(maxCostUsd) || maxCostUsd <= 0)
        throw new InfraError(`invalid --max-cost-usd "${opts["max-cost-usd"]}"`)
    return findPython()
}

/*  the sandbox of a run: a private HOME and a private project directory  */
interface Sandbox { root: string, home: string, project: string, env: Record<string, string> }

/*  create the sandbox, with an environment mirroring the one of the skill test
    harness (see "test/src/ase-test-sandbox.ts"): the developer environment without
    agent tool, ASE, and credential state, plus exactly one agent tool credential  */
const sandboxCreate = async (): Promise<Sandbox> => {
    const root    = await fs.promises.mkdtemp(path.join(os.tmpdir(), "ase-agent-test-"))
    const home    = path.join(root, "home")
    const project = path.join(root, "project")
    await fs.promises.mkdir(path.join(home, ".claude"), { recursive: true })
    await fs.promises.mkdir(path.join(project, ".ase"), { recursive: true })
    const env: Record<string, string> = {}
    for (const [ key, value ] of Object.entries(process.env))
        if (value !== undefined && !/^(TMUX|COPILOT_|ASE_|CLAUDE|ANTHROPIC_|GITHUB_|GH_|AWS_|NPM_TOKEN$|NODE_AUTH_TOKEN$|OPENAI_|GOOGLE_|GEMINI_)/.test(key))
            env[key] = value
    env.HOME                  = home
    env.USERPROFILE           = home
    env.XDG_CONFIG_HOME       = path.join(home, ".config")
    env.XDG_STATE_HOME        = path.join(home, ".local", "state")
    env.PATH                  = `${path.join(repoRoot, "tool", "bin")}${path.delimiter}${process.env.PATH ?? ""}`
    env.NO_UPDATE_NOTIFIER    = "1"
    env.GIT_TERMINAL_PROMPT   = "0"
    env.ASE_SETUP_DEV_BASEDIR = repoRoot
    if (process.env.ANTHROPIC_API_KEY !== undefined)
        env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
    else if (process.env.CLAUDE_CODE_OAUTH_TOKEN !== undefined)
        env.CLAUDE_CODE_OAUTH_TOKEN = process.env.CLAUDE_CODE_OAUTH_TOKEN
    else if (opts.tool === "claude") {
        const file = path.join(os.homedir(), ".claude", ".credentials.json")
        if (!fs.existsSync(file))
            throw new InfraError("no agent tool credentials found: set ANTHROPIC_API_KEY or " +
                "CLAUDE_CODE_OAUTH_TOKEN, or login once so \"~/.claude/.credentials.json\" exists")
        await fs.promises.copyFile(file, path.join(home, ".claude", ".credentials.json"))
    }

    /*  pass through the credentials of the secondary agent tools, whose login
        state in the real HOME is not copied into the sandbox  */
    if (opts.tool !== "claude")
        for (const [ key, value ] of Object.entries(process.env))
            if (value !== undefined && /^(OPENAI_API_KEY|CODEX_API_KEY|COPILOT_GITHUB_TOKEN|GH_TOKEN|GITHUB_TOKEN)$/.test(key))
                env[key] = value
    for (const [ key, value ] of Object.entries(process.env))
        if (value !== undefined && /^(ANTHROPIC_BASE_URL|ANTHROPIC_AUTH_TOKEN|ANTHROPIC_(DEFAULT_[A-Z]+_)?MODEL)$/.test(key))
            env[key] = value

    /*  keep the account-level claude.ai cloud connectors out of the agent sessions  */
    await fs.promises.writeFile(path.join(home, ".claude", "settings.json"),
        JSON.stringify({ disableClaudeAiConnectors: true }), "utf8")
    return { root, home, project, env }
}

/*  run an "ase" resp. "git" command in the sandbox project, failing on a non-zero exit  */
const ase = (sb: Sandbox, args: string[], options: Parameters<typeof exec>[2] = {}) =>
    exec(process.execPath, [ aseBin, ...args ], { cwd: sb.project, env: sb.env, timeout: 5 * 60 * 1000, ...options })
const must = async (what: string, result: Promise<ExecResult>): Promise<string> => {
    const r = await result
    if (r.code !== 0)
        throw new InfraError(`${what} failed (exit ${r.code}): ${(r.stderr || r.stdout).trim().split("\n").slice(-5).join(" | ")}`)
    return r.stdout
}
const git = (sb: Sandbox, args: string[]) =>
    exec("git", args, { cwd: sb.project, env: sb.env, timeout: 60 * 1000 })

/*  the current status and tags of the task  */
const taskState = async (sb: Sandbox): Promise<{ status: string, tags: string }> => {
    const status = (await ase(sb, [ "task", "status", `${caseCfg.task}:` ])).stdout.trim()
    const plan   = (await ase(sb, [ "task", "load", caseCfg.task ])).stdout
    const tags   = /^Tags:\s*(.*)$/m.exec(plan)?.[1]?.trim() ?? ""
    return { status, tags }
}

/*  the outcome of one agent step  */
interface Step { agent: string, exit: number, timedOut: boolean, durationMs: number,
    costUsd: number, status: string, tags: string, expect: string, pass: boolean }

/*  the outcome of the test suite  */
interface Suite {
    expected: number, ran: number, passed: number, failures: number, errors: number, skipped: number,
    ok: boolean, exit: number, tests: { name: string, outcome: string }[]
}

/*  determine the number of tests of the suite, independent of the program under test  */
const suiteCount = async (python: string[]): Promise<number> => {
    const r = await exec(python[0], [ ...python.slice(1), "-c",
        "import sys, unittest; print(unittest.defaultTestLoader.discover(sys.argv[1]).countTestCases())",
        path.join(caseDir, "suite") ], {
        cwd: caseDir, env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } as Record<string, string>, timeout: 60 * 1000 })
    const count = Number(r.stdout.trim())
    if (r.code !== 0 || !Number.isInteger(count) || count <= 0)
        throw new InfraError(`test suite of case "${opts.case}" not loadable or empty: ${(r.stderr || r.stdout).trim()}`)
    return count
}

/*  run the test suite against the program in a project directory, where it passes
    only if every discovered test ran and passed (no failures, errors, or skips)  */
const suiteRun = async (python: string[], expected: number, project: string,
    env: Record<string, string>, logFile: string): Promise<Suite> => {
    const s = await exec(python[0], [ ...python.slice(1), "-m", "unittest", "discover",
        "-s", path.join(caseDir, "suite"), "-v" ], {
        cwd: project, env: { ...env, AGENT_TEST_PROJECT: project, PYTHONDONTWRITEBYTECODE: "1" }, timeout: 5 * 60 * 1000 })
    const text = (s.stdout + s.stderr).replace(/\r\n/g, "\n")
    await fs.promises.writeFile(logFile, text, "utf8")
    const tests = [ ...text.matchAll(/^(test\w*) \(.*?\)(?:\n.*?)? \.\.\. (ok|FAIL|ERROR|skipped|expected failure|unexpected success)\b/gm) ]
        .map((m) => ({ name: m[1], outcome: m[2] }))
    const ran      = Number(/^Ran (\d+) tests?/m.exec(text)?.[1] ?? 0)
    const failures = Number(/failures=(\d+)/.exec(text)?.[1] ?? 0)
    const errors   = Number(/errors=(\d+)/.exec(text)?.[1] ?? 0)
    const skipped  = Number(/skipped=(\d+)/.exec(text)?.[1] ?? 0)
    const passed   = tests.filter((test) => test.outcome === "ok").length
    const ok       = s.code === 0 && ran === expected && passed === expected
        && failures === 0 && errors === 0 && skipped === 0
    return { expected, ran, passed, failures, errors, skipped, ok, exit: s.code, tests }
}

/*  the one-line summary of a suite outcome, naming the tests which did not pass  */
const suiteDetail = (suite: Suite): string => {
    const bad = suite.tests.filter((test) => test.outcome !== "ok").map((test) => `${test.name} (${test.outcome})`)
    return `passed ${suite.passed}/${suite.expected}, ran ${suite.ran}, failures ${suite.failures}, ` +
        `errors ${suite.errors}, skipped ${suite.skipped}${bad.length > 0 ? `; not passed: ${bad.join(", ")}` : ""}`
}

/*  the overall result  */
interface Result {
    case: string, tool: string, verdict: "PASS" | "FAIL" | "ERROR", failure: string,
    steps: Step[], suite: Suite | null, checks: { name: string, pass: boolean, detail: string }[],
    costUsd: number, durationMs: number, results: string, sandbox: string
}

/*  sum the costs of the agent tool sessions of an agent output line, counting each
    session once, by its usage line (its "result:" line repeats the same cost)  */
const lineCost = (line: string): number => {
    let cost = 0
    for (const m of line.matchAll(/ usage: .*cost: \$(\d+(?:\.\d+)?)/g))
        cost += Number(m[1])
    return cost
}

/*  run the agents one after the other in the foreground, each until no work is left  */
const runPipeline = async (sb: Sandbox, result: Result, agentsLog: fs.WriteStream): Promise<void> => {
    for (const stage of pipeline) {
        log(`running agent "${stage.kind}"`)
        const t0 = Date.now()
        let costUsd = 0
        const r = await ase(sb, [ "agent", stage.kind, "start", "--foreground", "--one-shot",
            "--tool", opts.tool, "--timeout", opts.timeout, ...stage.args ], {
            timeout: timeoutMs + 5 * 60 * 1000,
            onLine: (line) => {
                const entry = `${stage.kind.padEnd(11)} | ${line}`
                agentsLog.write(`${entry}\n`)
                process.stdout.write(`  ${entry}\n`)
                costUsd += lineCost(line)
            }
        })
        const state = await taskState(sb)
        const step: Step = {
            agent: stage.kind, exit: r.code, timedOut: r.timedOut, durationMs: Date.now() - t0,
            costUsd, status: state.status, tags: state.tags, expect: stage.expect,
            pass: r.code === 0 && !r.timedOut && state.status === stage.expect && !/:failed\b/.test(state.tags)
        }
        result.steps.push(step)
        result.costUsd += costUsd
        log(`agent "${stage.kind}": exit ${r.code}${r.timedOut ? " (timed out)" : ""}, ` +
            `task ${state.status}${state.tags !== "" ? ` [${state.tags}]` : ""}, $${costUsd.toFixed(2)}`)
        if (!step.pass) {
            result.failure = `agent "${stage.kind}" left the task in ${state.status} ` +
                `(expected ${stage.expect})${r.code !== 0 ? `, exit ${r.code}` : ""}`
            break
        }
        if (result.costUsd > maxCostUsd) {
            result.failure = `cost ceiling of $${maxCostUsd} exceeded ($${result.costUsd.toFixed(2)})`
            break
        }
    }
}

/*  the fleet configuration: the agents of the pipeline, plus the agent relay owned by
    the fleet (per-user, i.e., isolated by the sandbox HOME, on a free port it allocates)  */
const fleetConfig = (): string => [
    "relay:",
    "default:",
    `    tool:     ${opts.tool}`,
    `    timeout:  ${opts.timeout}`,
    "    parallel: 1",
    "implementer:",
    "    params:",
    "        effort-wait: false",
    "qualifier:",
    "    mode:     qualify",
    "integrator:",
    "    mode:     squash",
    ""
].join("\n")

/*  the kinds of the agents present on the agent relay of the fleet (per its per-user
    "relay.yaml"), or null if it is not reachable (queried directly, as the host-local
    probe of "ase agent relay status" fails with undici 8 under Node 24)  */
const relayAgents = async (sb: Sandbox): Promise<string[] | null> => {
    const file = path.join(sb.env.XDG_CONFIG_HOME, "ase", "relay.yaml")
    if (!fs.existsSync(file))
        return null
    const text  = await fs.promises.readFile(file, "utf8")
    const value = (key: string) => new RegExp(`^${key}:\\s*["']?([^"'\\s]+)`, "m").exec(text)?.[1] ?? ""
    try {
        const r = await fetch(`http://${value("address") || "127.0.0.1"}:${value("port")}/projects/ase-agent-test/agents`,
            { headers: { Authorization: `Bearer ${value("token")}` }, signal: AbortSignal.timeout(5 * 1000) })
        if (r.status !== 200)
            return null
        const data = await r.json() as { agents?: { kind?: string }[] }
        return (data.agents ?? []).map((agent) => String(agent.kind ?? "?"))
    }
    catch {
        return null
    }
}

/*  the order of the "enterprise" statuses along the happy path (to detect that a status
    was passed, even if a poll missed it), and the statuses ending the happy path  */
const statusRank = [ "PLANNED", "IMPLEMENTING", "IMPLEMENTED", "QUALIFYING", "QUALIFIED", "INTEGRATING", "INTEGRATED" ]
const statusDead = /^(STALLED|DECLINED|DEFERRED|CANCELLED)$/

/*  run all agents together as a fleet in the background, following its log and the
    task until the task is integrated, failed, too expensive, or timed out, then stop it  */
const runFleet = async (sb: Sandbox, result: Result, agentsLog: fs.WriteStream): Promise<void> => {
    const t0      = Date.now()
    const members = [ "relay", ...pipeline.map((stage) => stage.kind) ]

    /*  start the fleet in the background and check it runs with all its members  */
    log("starting agent fleet")
    const start = await ase(sb, [ "agent", "fleet", "start" ], { timeout: 3 * 60 * 1000 })
    result.checks.push({ name: "fleet started", pass: start.code === 0,
        detail: `exit ${start.code}${start.code !== 0 ? `: ${(start.stderr || start.stdout).trim().split("\n").slice(-3).join(" | ")}` : ""}` })
    if (start.code !== 0) {
        result.failure = "fleet failed to start"
        return
    }
    const status  = await ase(sb, [ "agent", "fleet", "status" ])
    const missing = members.filter((name) => !new RegExp(`^\\s+${name} \\(.*\\): running`, "m").test(status.stdout))
    result.checks.push({ name: "fleet running with all members", pass: status.code === 0 && missing.length === 0,
        detail: missing.length > 0 ? `not running: ${missing.join(", ")}` : members.join(", ") })
    let present: string[] | null = null
    for (let i = 0; i < 15 && !pipeline.every((stage) => present?.includes(stage.kind)); i++) {
        if (i > 0)
            await new Promise((resolve) => setTimeout(resolve, 2 * 1000))
        present = await relayAgents(sb)
    }
    result.checks.push({ name: "agents present on the agent relay",
        pass: present !== null && pipeline.every((stage) => present?.includes(stage.kind)),
        detail: present === null ? "agent relay not reachable" : `present: ${present.join(", ") || "(none)"}` })

    /*  follow the shared fleet log (each line prefixed by the member name) and the task  */
    const logFile = path.join(sb.project, ".ase", "agent", "fleet.log")
    const costs   = new Map<string, number>()
    let offset    = 0
    let rest      = ""
    const drain   = async () => {
        if (!fs.existsSync(logFile))
            return
        const data = await fs.promises.readFile(logFile)
        if (data.length <= offset)
            return
        const parts = (rest + data.subarray(offset).toString("utf8")).split(/\r?\n/)
        offset = data.length
        rest   = parts.pop() ?? ""
        for (const line of parts) {
            agentsLog.write(`${line}\n`)
            process.stdout.write(`  ${line}\n`)
            const member = /^(\S+)\s*\| /.exec(line)?.[1] ?? "fleet"
            costs.set(member, (costs.get(member) ?? 0) + lineCost(line))
        }
    }
    const reached  = new Map<string, number>()
    const deadline = t0 + 3 * timeoutMs
    let last       = ""
    let state: { status: string, tags: string }
    for (;;) {
        await drain()
        state = await taskState(sb)
        if (`${state.status} ${state.tags}` !== last) {
            last = `${state.status} ${state.tags}`
            log(`task "${caseCfg.task}": ${state.status}${state.tags !== "" ? ` [${state.tags}]` : ""}`)
        }
        const rank = statusRank.indexOf(state.status)
        for (const stage of pipeline)
            if (!reached.has(stage.expect) && rank >= statusRank.indexOf(stage.expect))
                reached.set(stage.expect, Date.now() - t0)
        result.costUsd = [ ...costs.values() ].reduce((sum, cost) => sum + cost, 0)

        /*  the integrator settles its tags (and attachments) after the final status  */
        if (state.status === "INTEGRATED" && !/:active\b/.test(state.tags))
            break
        if (statusDead.test(state.status) || /:failed\b/.test(state.tags)) {
            result.failure = `task left the happy path: ${state.status}${state.tags !== "" ? ` [${state.tags}]` : ""}`
            break
        }
        if (result.costUsd > maxCostUsd) {
            result.failure = `cost ceiling of $${maxCostUsd} exceeded ($${result.costUsd.toFixed(2)})`
            break
        }
        if (Date.now() > deadline) {
            result.failure = `fleet timed out after ${((Date.now() - t0) / 60000).toFixed(1)}m in ${state.status}`
            break
        }
        await new Promise((resolve) => setTimeout(resolve, 5 * 1000))
    }

    /*  stop the fleet and check that it and its agent relay are gone  */
    log("stopping agent fleet")
    const stop = await ase(sb, [ "agent", "fleet", "stop" ], { timeout: 6 * 60 * 1000 })
    await drain()
    if (rest !== "") {
        agentsLog.write(`${rest}\n`)
        process.stdout.write(`  ${rest}\n`)
    }
    result.costUsd = [ ...costs.values() ].reduce((sum, cost) => sum + cost, 0)
    const after      = await ase(sb, [ "agent", "fleet", "status" ])
    const relayAfter = await relayAgents(sb)
    result.checks.push({ name: "fleet stopped with its agent relay",
        pass: stop.code === 0 && after.code !== 0 && relayAfter === null,
        detail: `stop exit ${stop.code}, fleet ${after.code !== 0 ? "gone" : "still running"}, ` +
            `relay ${relayAfter === null ? "gone" : "still running"}` })

    /*  one step per agent: whether (and after how long) the task passed its expected status  */
    for (const stage of pipeline) {
        const at = reached.get(stage.expect)
        result.steps.push({
            agent: stage.kind, exit: 0, timedOut: false, durationMs: at ?? Date.now() - t0,
            costUsd: costs.get(stage.kind) ?? 0, status: at !== undefined ? stage.expect : state.status,
            tags: at !== undefined ? "" : state.tags, expect: stage.expect, pass: at !== undefined
        })
    }
    log(`fleet: ${((Date.now() - t0) / 60000).toFixed(1)}m, $${result.costUsd.toFixed(2)}`)
}

/*  main procedure  */
const main = async (): Promise<number> => {
    const started    = Date.now()
    const stamp      = new Date().toISOString().replace(/[:.]/g, "-")
    const resultsDir = path.join(repoRoot, "test", "results", `agent-${stamp}-${opts.case}`)
    await fs.promises.mkdir(resultsDir, { recursive: true })
    const result: Result = {
        case: opts.case, tool: opts.tool, verdict: "ERROR", failure: "",
        steps: [], suite: null, checks: [], costUsd: 0, durationMs: 0, results: resultsDir, sandbox: ""
    }
    const agentsLog = fs.createWriteStream(path.join(resultsDir, "agents.log"))
    let sb: Sandbox | null = null
    try {
        /*  (1) preflight and sandbox  */
        const python   = await preflight()
        const expected = await suiteCount(python)
        log(`case "${opts.case}", tool "${opts.tool}", python "${python.join(" ")}", ${expected} suite tests`)

        /*  optionally only check an existing project directory against the suite
            (e.g. a sandbox kept from an earlier run), without any sandbox or agent  */
        if (opts["suite-only"] !== undefined) {
            result.suite = await suiteRun(python, expected, path.resolve(opts["suite-only"]),
                process.env as Record<string, string>, path.join(resultsDir, "suite.log"))
            result.checks.push({ name: "all suite tests passed", pass: result.suite.ok, detail: suiteDetail(result.suite) })
            result.verdict = result.suite.ok ? "PASS" : "FAIL"
            if (!result.suite.ok)
                result.failure = "test suite failed"
            return await finish(result, started, resultsDir)
        }
        sb = await sandboxCreate()
        result.sandbox = sb.root
        log(`sandbox: ${sb.root}`)

        /*  (2) install the plugin of the working copy into the sandbox HOME,
            as the agents spawn the plain agent tool CLI, which sees installed plugins only  */
        log("installing ASE plugin into sandbox HOME")
        await must("ase setup install", ase(sb, [ "setup", "install", "--dev", "--tool", opts.tool ]))

        /*  (3) bootstrap the project and feed the task fixture  */
        log("bootstrapping project")
        await must("git init",   git(sb, [ "init", "--initial-branch", "master" ]))
        await must("git config", git(sb, [ "config", "user.name",  "ASE Agent Test" ]))
        await must("git config", git(sb, [ "config", "user.email", "ase-agent-test@localhost" ]))

        /*  keep the task store out of Git (the agents update it constantly, which would else
            dirty the working copy), but not all of ".ase/", as the agents explicitly exclude
            ".ase" in Git pathspecs, which Git refuses for an ignored path  */
        await fs.promises.writeFile(path.join(sb.project, ".gitignore"), ".ase/task/\n", "utf8")
        await must("git add",    git(sb, [ "add", ".gitignore" ]))
        await must("git commit", git(sb, [ "commit", "--no-verify", "-m", "initial commit" ]))
        await must("ase task lifecycle", ase(sb, [ "task", "lifecycle", "enterprise" ]))
        await must("ase config set",     ase(sb, [ "config", "set", "project.id", "ase-agent-test" ]))

        /*  implement every task on its own branch, instead of the built-in default "worktree"
            (uncommitted in the working copy), so the test covers branches and ASE worktrees  */
        await must("ase config set",     ase(sb, [ "config", "set", "project.task.default.source",    "branch:master" ]))
        await must("ase config set",     ase(sb, [ "config", "set", "project.task.default.changeset", "branch:cs-{id}" ]))
        await must("ase config set",     ase(sb, [ "config", "set", "project.task.default.target",    "branch:master" ]))
        await must("ase task save",      ase(sb, [ "task", "save", "--create", caseCfg.task ],
            { input: await fs.promises.readFile(path.join(caseDir, "task.md"), "utf8") }))

        /*  configure the fleet (versioned, like intended for real projects)  */
        if (caseCfg.runner === "fleet")
            await fs.promises.writeFile(path.join(sb.project, ".ase", "fleet.yaml"), fleetConfig(), "utf8")

        /*  commit the ASE project files, as any untracked file in the working copy of
            "master" (e.g. ".ase/config.yaml") lets the merge of the integrator fail  */
        await must("git add",    git(sb, [ "add", "--all" ]))
        await must("git commit", git(sb, [ "commit", "--no-verify", "-m", "ASE project setup" ]))
        const untracked = (await git(sb, [ "status", "--porcelain" ])).stdout.trim()
        if (untracked !== "")
            throw new InfraError(`working copy not clean after project setup: ${untracked.split("\n").join("; ")}`)
        const initial = await taskState(sb)
        log(`task "${caseCfg.task}": ${initial.status}`)

        /*  (4) drive the task through the agents, one after the other resp. as a fleet
            (skipped on a dry-run, which only checks the setup without spending tokens)  */
        if (opts["dry-run"]) {
            log("dry-run: skipping the agents")
            result.failure = "dry-run"
        }
        else if (caseCfg.runner === "fleet")
            await runFleet(sb, result, agentsLog)
        else
            await runPipeline(sb, result, agentsLog)

        /*  (5) verify the result: integrated task, program on "master", clean working copy  */
        const final = await taskState(sb)
        result.checks.push({ name: "task integrated", pass: final.status === "INTEGRATED", detail: final.status })
        const tree = (await git(sb, [ "ls-tree", "--name-only", "master" ])).stdout.split("\n")
        result.checks.push({ name: `${caseCfg.program} on master`, pass: tree.includes(caseCfg.program),
            detail: tree.filter((name) => name !== "").join(", ") })
        const branch = (await git(sb, [ "rev-parse", "--abbrev-ref", "HEAD" ])).stdout.trim()
        const dirty  = (await git(sb, [ "status", "--porcelain" ])).stdout.trim()
        result.checks.push({ name: "working copy clean on master", pass: branch === "master" && dirty === "",
            detail: `branch ${branch}${dirty !== "" ? `, changes: ${dirty.split("\n").join("; ")}` : ""}` })

        /*  (6) run the fixture test suite against the program on "master"  */
        if (fs.existsSync(path.join(sb.project, caseCfg.program))) {
            log("running test suite")
            result.suite = await suiteRun(python, expected, sb.project, sb.env, path.join(resultsDir, "suite.log"))
            log(`test suite: ${suiteDetail(result.suite)}`)
        }
        result.checks.push({ name: "all suite tests passed", pass: result.suite?.ok ?? false,
            detail: result.suite === null ? `not run (no ${caseCfg.program})` : suiteDetail(result.suite) })

        /*  collect the final artifacts  */
        await fs.promises.writeFile(path.join(resultsDir, "task.md"),
            (await ase(sb, [ "task", "load", caseCfg.task ])).stdout, "utf8")
        await fs.promises.writeFile(path.join(resultsDir, "git.log"),
            (await git(sb, [ "log", "--all", "--graph", "--stat", "--format=%h %d %s" ])).stdout, "utf8")
        const program = path.join(sb.project, caseCfg.program)
        if (fs.existsSync(program))
            await fs.promises.copyFile(program, path.join(resultsDir, caseCfg.program))

        result.verdict = result.checks.every((check) => check.pass) ? "PASS" : "FAIL"
        if (opts["dry-run"])
            result.verdict = initial.status === "PLANNED" ? "PASS" : "FAIL"
        if (result.verdict === "FAIL" && result.failure === "")
            result.failure = result.checks.filter((check) => !check.pass).map((check) => check.name).join(", ") + " failed"
    }
    catch (err) {
        result.verdict = "ERROR"
        result.failure = err instanceof Error ? err.message : String(err)
        if (!(err instanceof InfraError))
            result.failure += ` (${err instanceof Error ? err.stack ?? "" : ""})`
    }
    finally {
        agentsLog.end()

        /*  (7) tear down the sandbox: stop a still running fleet (e.g. after an error)
            and the on-demand spawned ASE service, and keep the log of the fleet  */
        if (sb !== null) {
            if (caseCfg.runner === "fleet") {
                await ase(sb, [ "agent", "fleet", "stop" ], { timeout: 6 * 60 * 1000 })
                const fleetLog = path.join(sb.project, ".ase", "agent", "fleet.log")
                if (fs.existsSync(fleetLog))
                    await fs.promises.copyFile(fleetLog, path.join(resultsDir, "fleet.log"))
            }
            await ase(sb, [ "service", "stop" ], { timeout: 30 * 1000 })
            const keep = opts.keep || (opts["keep-failed"] && result.verdict !== "PASS")
            if (keep)
                log(`sandbox kept: ${sb.root}`)
            else {
                await fs.promises.rm(sb.root, { recursive: true, force: true })
                result.sandbox = ""
            }
        }
    }

    return finish(result, started, resultsDir)
}

/*  (8) report the result and map its verdict onto the exit code  */
const finish = async (result: Result, started: number, resultsDir: string): Promise<number> => {
    result.durationMs = Date.now() - started
    await fs.promises.writeFile(path.join(resultsDir, "result.json"), JSON.stringify(result, null, 4) + "\n", "utf8")
    await fs.promises.writeFile(path.join(resultsDir, "report.md"), report(result), "utf8")
    process.stdout.write("\n" + report(result))
    return result.verdict === "PASS" ? 0 : (result.verdict === "FAIL" ? 1 : 2)
}

/*  render the Markdown report of a result  */
const report = (r: Result): string => {
    const mins = (ms: number) => `${(ms / 60000).toFixed(1)}m`
    const rows = [
        "| Agent | Exit | Duration | Status after | Expected | Cost | Pass |",
        "|-------|------|----------|--------------|----------|------|------|",
        ...r.steps.map((s) => `| ${s.agent} | ${s.exit}${s.timedOut ? " (timeout)" : ""} | ${mins(s.durationMs)} | ` +
            `${s.status}${s.tags !== "" ? ` [${s.tags}]` : ""} | ${s.expect} | $${s.costUsd.toFixed(2)} | ${s.pass ? "yes" : "no"} |`)
    ]
    const checks = r.checks.map((c) => `-   ${c.pass ? "✓" : "✗"} ${c.name}: ${c.detail}`)
    const tests  = r.suite === null || r.suite.tests.length === 0 ? [] : [
        "## Test Suite",
        "",
        "| Test | Outcome |",
        "|------|---------|",
        ...r.suite.tests.map((t) => `| ${t.name} | ${t.outcome === "ok" ? "✓ ok" : `✗ ${t.outcome}`} |`),
        ""
    ]
    return [
        `# ase agent test: ${r.case}`,
        "",
        `**Verdict: ${r.verdict}**${r.failure !== "" ? ` -- ${r.failure}` : ""}`,
        "",
        `Tool \`${r.tool}\`, duration ${mins(r.durationMs)}, cost $${r.costUsd.toFixed(2)}`,
        "",
        "## Pipeline",
        "",
        ...(r.steps.length > 0 ? rows : [ "(no agent ran)" ]),
        "",
        "## Checks",
        "",
        ...(checks.length > 0 ? checks : [ "(no checks ran)" ]),
        "",
        ...tests,
        "## Artifacts",
        "",
        `-   results: \`${r.results}\` (\`agents.log\`, ${caseCfg.runner === "fleet" ? "`fleet.log`, " : ""}` +
            `\`suite.log\`, \`task.md\`, \`git.log\`, \`${caseCfg.program}\`, \`result.json\`)`,
        ...(r.sandbox !== "" ? [ `-   sandbox: \`${r.sandbox}\`` ] : []),
        ""
    ].join("\n")
}

process.exit(await main())
