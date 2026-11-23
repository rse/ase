/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import fs                           from "node:fs"
import os                           from "node:os"
import path                         from "node:path"
import readline                     from "node:readline"

import { Command }                  from "commander"
import { execa }                    from "execa"
import { DateTime }                 from "luxon"
import which                        from "which"

import type Log                     from "./ase-lib-log.js"
import { Task }                     from "./ase-task.js"
import * as TaskFormat              from "./ase-task-format.js"
import { Config }                   from "./ase-config-core.js"
import { configSchema, parsePrices, modelPrice, tokenCost } from "./ase-config-schema.js"
import type { TokenCounts }         from "./ase-config-schema.js"
import { writeStdout }              from "./ase-lib-stdio.js"
import type { Tool }                from "./ase-setup-common.js"
import { parseTool, toolSpecs }     from "./ase-setup-common.js"
import { AgentPresenceReporter }    from "./ase-agent-relay-client.js"
import type { AgentRelayClient }    from "./ase-agent-relay-client.js"
import type { AgentUsage, AgentFlow, AgentPrompt } from "./ase-agent-relay-core.js"
import { telemetryEnabled }         from "./ase-service-otel-common.js"
import { toolArgs, toolEntries, skillPrompt, budgetCredits } from "./ase-agent-runtime-tool.js"
import type { ToolCosts }           from "./ase-agent-runtime-tool.js"
import { withinJobTimeout, gitInside } from "./ase-agent-runtime-exec.js"
import { AgentRun }                 from "./ase-agent-runtime-claim.js"
import type {
    AgentOpts, AgentTask, AgentItem, AgentSelection, LineLevel, AgentLog, AgentJob, AgentWork
}                                   from "./ase-agent-runtime-task.js"
import { AgentWorkspace }           from "./ase-agent-runtime-workspace.js"

/*  parse a duration "<number><unit>" with unit s, m, or h into milliseconds  */
const parseDuration = (spec: string): number => {
    const m    = /^(\d+)([smh])$/.exec(spec)
    const unit = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000 }
    const ms   = m !== null ? Number.parseInt(m[1], 10) * unit[m[2] as keyof typeof unit] : 0
    if (ms < 1 || ms > 2 ** 31 - 1)
        throw new Error(`agent: invalid duration "${spec}" (expected <number><unit> with unit s, m, or h, up to about 24 days)`)
    return ms
}

/*  parse a budget "<number>" in USD for the agent tool <tool> ("none" or zero for no cost cap),
    where Copilot requires at least 30 of its AI credits of $0.01 each  */
const parseBudget = (spec: string, tool: Tool): string => {
    if (!/^(none|\d+(\.\d+)?)$/.test(spec))
        throw new Error(`agent: invalid budget "${spec}" (expected a non-negative number of USD or "none")`)
    else if (spec === "none" || Number.parseFloat(spec) === 0)
        return ""
    else if (tool === "copilot" && budgetCredits(spec) < 30)
        throw new Error(`agent: budget "${spec}" too small for agent tool "copilot" (expected at least 0.30 USD)`)
    return spec
}

/*  the agents of this process currently processing tasks, and the wake-ups of the
    dispatchers of all running agents of this process, so in one-shot mode an agent
    terminates only once all agents of this process are idle (as a task processed by
    one agent can become dispatchable to another one, e.g. an implemented task to the qualifier)  */
const busyAgents = new Set<Agent>()
const wakeAgents = new Set<() => void>()

/*  the state of a running agent: its worker slots (slot number to task id), their jobs,
    its abort, its waiting tasks (with the reason), its noticed tasks (with the notice),
    whether it is dispatching, and the wake-up of its dispatcher  */
type RunState = {
    slots:       Map<number, string>
    running:     Set<Promise<void>>
    abort:       AbortController
    waiting:     Map<string, string>
    notices:     Map<string, string>
    dispatching: boolean
    notify:      () => void
}

/*  the generic agent: it observes the tasks, selects the dispatchable ones (see
    "select"), claims each one (see "claim") into a free worker slot, processes it
    via an ASE skill of the headless agent tool (see "prepare"), and finally settles
    it (see "settle"), where the concrete agent decides on all of these steps  */
export abstract class Agent {
    constructor (protected log: Log) {}

    /*  the kind of the agent ("ase agent <kind>") and its CLI description  */
    abstract readonly kind:                  string
    protected abstract readonly description: string

    /*  the name of the agent ("--name", default: its kind), distinguishing
        multiple agents of the same kind in the log lines (also of the shared
        processing log attachment "agent"), and the temporary directories  */
    private _name = ""
    get name (): string {
        return this._name !== "" ? this._name : this.kind
    }

    /*  the role of the agent in the recovery descriptions (default: its kind), and the namespace
        of its runs (default: its kind, see "AgentRun"), which a configured agent can override  */
    protected get role (): string {
        return this.kind
    }
    protected get runKind (): string {
        return this.kind
    }

    /*  the name of the requests processed by the agent, as announced in its presence (default: none)  */
    protected presenceRequest = ""

    /*  whether the prompts of the requests processed by the agent are required, optional, or
        ignored (else they may be requested with an empty prompt), as announced in its presence  */
    protected presencePrompt: AgentPrompt = "required"

    /*  the lifecycle states the agent operates on, as announced in its presence (default: none)  */
    protected presenceStates: AgentFlow | undefined = undefined

    /*  the title and the description of the operation of the agent, as announced in its presence (default: none)  */
    protected presenceTitle = ""
    protected presenceDesc  = ""

    /*  the configured model of the agent tool, as shown in the start log line (default: none)  */
    protected modelSpec = ""

    /*  whether tasks are processed serially only (clamping "--parallel" to 1, and
        refusing multiple agents of the kind in a fleet, see "ase agent fleet")  */
    protected readonly serial: boolean = false
    get serialOnly (): boolean {
        return this.serial
    }

    /*  whether tasks are processed in Git worktrees (requiring "git" in $PATH)  */
    protected readonly worktree: boolean = false

    /*  the task lifecycle models the agent supports  */
    protected readonly lifecycles: string[] = [ "enterprise" ]

    /*  the mode of operation of the agent (e.g. by its option "--mode", else empty)  */
    protected mode = ""

    /*  the per-agent CLI command and the effective configuration of the agent  */
    private cmd:         Command | null                  = null
    private tool:        Tool                            = "claude"
    private parallel                                     = 1
    private timeoutSpec                                  = ""
    private timeout                                      = 0
    private budget                                       = ""
    private oneShot                                      = false
    protected lifecycle: TaskFormat.TaskLifecycle | null = null

    /*  the Git workspace of the agent (see "AgentWorkspace"), created by "setup"  */
    private _workspace:  AgentWorkspace | null           = null
    private get workspace (): AgentWorkspace {
        if (this._workspace === null)
            throw new Error(`agent: ${this.name}: workspace accessed before setup`)
        return this._workspace
    }

    /*  the client of the agent relay (if any) and the presence of the running agent announced to it  */
    private relay:       AgentRelayClient | null         = null
    private presence:    AgentPresenceReporter | null    = null

    /*  per processed task id: the remainders of its AI request time and its real time (in
        milliseconds) not yet booked onto it, as the bookings carry whole minutes only  */
    private unbooked                                     = new Map<string, { aiMs: number, realMs: number }>()

    /*  per processed task id: the reason it was last deferred for  */
    private deferred                                     = new Map<string, string>()

    /*  the run of the agent process (see "AgentRun")  */
    private _run:        AgentRun | null                 = null
    protected get runLock (): AgentRun {
        if (this._run === null)
            this._run = new AgentRun(this.log, this.runKind)
        return this._run
    }

    /*  register additional CLI options and initialize the agent from them,
        and release the resources of the initialization after the run of the agent  */
    protected options (_cmd: Command): void {}
    protected async init (_opts: AgentOpts): Promise<void> {}
    protected async teardown (): Promise<void> {}

    /*  the interruption of the run of the agent (never aborted before its run)  */
    protected interruption: AbortSignal = new AbortController().signal

    /*  the prioritization of the dispatchable tasks <tasks> (in natural id order) on each
        dispatching: the tasks in the order to claim them, where an omitted task is not
        claimed this time (by default, the natural id order)  */
    protected async order (tasks: AgentTask[]): Promise<AgentTask[]> {
        return tasks
    }

    /*  recover the tasks left behind by terminated runs of agents of its kind (see
        "AgentRun"), at the start of the run, and decide whether the run lock has to be
        retained after the run (until the exit of the process, e.g. while still
        processing results are not finalized, so no other agent recovers them meanwhile)  */
    protected async recover (): Promise<void> {}
    protected retainRun (): boolean {
        return this.unsettled.size > 0
    }

    /*  the finalizations of processed tasks which failed even after their retries (e.g. on
        repeated concurrent changes of the task, or on a transient failure of the task store),
        per task id, retried in the background with a growing delay (and a last time at the
        end of the run), so no task stays claimed by a live agent until another agent recovers
        it, where a finalization resolves to whether it is done (and throws on a failure)  */
    protected readonly unsettled = new Map<string, () => Promise<boolean>>()
    private unsettledRetry: Promise<void> | null              = null
    private unsettledTimer: ReturnType<typeof setTimeout> | undefined
    private unsettledRound                                    = 0

    /*  remember a failed finalization of a task for its retrying  */
    protected unsettle (id: string, finish: () => Promise<boolean>): void {
        this.unsettled.set(id, finish)
        this.scheduleUnsettled()
    }

    /*  schedule the next retry round of the failed finalizations (if any)  */
    private scheduleUnsettled (): void {
        if (this.unsettledTimer !== undefined || this.unsettled.size === 0)
            return
        this.unsettledRound++
        this.unsettledTimer = setTimeout(() => {
            this.retryUnsettled().finally(() => {
                this.unsettledTimer = undefined
                this.scheduleUnsettled()
            })
        }, Math.min(this.unsettledRound, 30) * 1000)
        this.unsettledTimer.unref()
    }

    /*  retry all failed finalizations once (never concurrently to itself)  */
    private async retryUnsettled (): Promise<void> {
        if (this.unsettledRetry !== null)
            return this.unsettledRetry
        this.unsettledRetry = (async () => {
            for (const [ id, finish ] of [ ...this.unsettled ])
                if (await finish().catch(() => false))
                    this.unsettled.delete(id)
            if (this.unsettled.size === 0)
                this.unsettledRound = 0
        })().finally(() => {
            this.unsettledRetry = null
        })
        return this.unsettledRetry
    }

    /*  prepare the skill invocation for a claimed task, logging into its processing
        log <log> (throws on failure)  */
    protected abstract prepare (task: AgentTask, parallel: boolean, log: AgentLog): Promise<AgentJob>

    /*  whether a dispatchable task (e.g. one without a result of a previous
        processing) is to be claimed, checked right before its claim  */
    protected async ready (_task: AgentTask): Promise<boolean> {
        return true
    }

    /*  the wake-up of the dispatcher of the running agent (if running), and its delayed
        triggering, e.g. once a task held off by the agent becomes dispatchable again  */
    private wakeup: (() => void) | null = null
    protected redispatch (delay: number): void {
        const timer = setTimeout(() => {
            this.wakeup?.()
        }, delay)
        timer.unref()
    }

    /*  whether tasks are processed in parallel to others by multiple worker slots of the agent  */
    protected get parallelized (): boolean {
        return this.parallel > 1
    }

    /*  defer a dispatchable task (instead of claiming it, see "ready"), reporting
        the reason once per change of it, until the next dispatching  */
    protected async defer (task: AgentTask, reason: string): Promise<boolean> {
        if (this.deferred.get(task.id) !== reason) {
            this.deferred.set(task.id, reason)
            await this.write("info", this.name, `task "${task.id}" waits for ${reason}`)
        }
        return false
    }

    /*  whether a task is ready for the access of the working directory kind <workdir>
        ("project", "source", "changeset", "changeset-read", or "target"), see "AgentWorkspace.ready"  */
    protected async workdirReady (task: AgentTask, workdir: string): Promise<boolean> {
        return this.workspace.ready(task, workdir)
    }

    /*  the work of a job in the working directory kind <workdir>, see "AgentWorkspace.job"  */
    protected async workdirJob (task: AgentTask, workdir: string, suffix: string, parallel: boolean,
        options: { checkout: boolean, commit: boolean, snapshot: string }): Promise<AgentWork> {
        return this.workspace.job(task, workdir, suffix, parallel, options)
    }

    /*  write a processing log line in the style of the regular logger to stdout (each
        line of a multi-line message as a full log line, with the line prefix of the logger,
        e.g. of an agent fleet member, and with the level tag styled on a terminal only),
        optionally collecting it for the processing log attachment of a task,
        and record it (of the task, or of the agent itself) in the presence of the agent  */
    protected async write (level: LineLevel, prefix: string, msg: string, lines?: string[], task = ""): Promise<void> {
        const timestamp = DateTime.now().toFormat("yyyy-LL-dd HH:mm:ss.SSS")
        lines?.push(`ase: [${timestamp}]: [${level.toUpperCase()}]: ${prefix}: ${msg}`)
        this.presence?.line(level, task, msg)
        const head = `${this.log.prefix()}ase: [${timestamp}]: ${this.log.tag(level, process.stdout.isTTY)}: ${prefix}: `
        await writeStdout(msg.split("\n").map((l) => `${head}${l}\n`).join(""))
    }

    /*  select the dispatchable tasks among all listed tasks <items> (except the
        <busy> ones already processed in a worker slot), the tasks waiting (with the reason),
        and the tasks with a notice (with the notice)  */
    protected abstract select (items: AgentItem[], busy: Set<string>): AgentSelection

    /*  claim a selected task, returning the description of the claim (for the processing
        log), or null if the task was silently skipped (throws if the task was not claimed)  */
    protected abstract claim (task: AgentTask): Promise<string | null>

    /*  settle a processed task after the skill invocation (successful by <ok>,
        with the job finished by <finished>, or interrupted by <aborted>)  */
    protected abstract settle (task: AgentTask, ok: boolean, finished: boolean, aborted: boolean,
        output: string[], log: AgentLog): Promise<void>

    /*  the description of the observed tasks (for the start log line)  */
    protected abstract observing (): string

    /*  run the skill command or raw prompt <call> of a prepared job via the headless agent
        tool (resuming the session <call.resume>, if not empty), logging its decoded JSONL
        events in real-time and collecting its agent message text lines as the <output> (without
        buffering them, as the output of the agent tool can be huge), where the quiet entries are
        only echoed (i.e., not kept in the processing log attachment of the task), and return its
        success and the id of its session (empty if not reported)  */
    private async invoke (taskId: string, job: AgentJob, call: { cmd?: string, prompt?: string, resume: string },
        abort: AbortSignal, log: AgentLog, echo: AgentLog, output: string[]): Promise<{ ok: boolean, session: string }> {
        const { tool, timeout, timeoutSpec, budget } = this
        const { cwd } = job
        const cli   = toolSpecs[tool].cli
        const cmd   = call.cmd ?? ""
        const i     = cmd.indexOf(" ")
        const model = job.model ?? ""
        const args  = toolArgs[tool](call.prompt ?? skillPrompt(tool, i < 0 ? cmd : cmd.slice(0, i), i < 0 ? "" : cmd.slice(i + 1)),
            [ ...new Set(job.dirs ?? []) ].filter((dir) => dir !== cwd).flatMap((dir) => [ "--add-dir", dir ]), model, budget, call.resume)
        await log("info", `running: ${cli} ${args.map((arg) => arg.includes(" ") ? `"${arg}"` : arg).join(" ")}`)
        const started = Date.now()
        const costs: ToolCosts = { costToken: null, costUSD: null, cread: 0, cwrite: 0, input: 0, apiMs: null }
        const session = { id: "" }
        const subprocess = execa(cli, args, {
            cwd,
            env:                 { ASE_HEADLESS: "true" },
            stdin:               "ignore",
            all:                 true,
            buffer:              false,
            reject:              false,
            timeout,
            cancelSignal:        abort,
            forceKillAfterDelay: 10 * 1000
        })
        for await (const line of readline.createInterface({ input: subprocess.all })) {
            for (const entry of toolEntries(tool, line, costs, session)) {
                if (entry.text === true)
                    output.push(entry.msg)
                await (entry.quiet === true ? echo : log)(entry.level, `${cli}: ${entry.msg}`)
            }
        }
        const result = await subprocess

        /*  report the termination of the agent tool  */
        if (abort.aborted)
            await log("warning", `${cli} aborted by interrupt`)
        else if (result.timedOut)
            await log("warning", `${cli} timed out after ${timeoutSpec}`)
        else if (result.exitCode === undefined)
            await log("warning", `${cli} failed: ${result.shortMessage}`)
        else
            await log(result.exitCode === 0 ? "info" : "warning", `${cli} finished with exit code ${result.exitCode}`)

        /*  report the usage of the agent tool, with its wall time measured locally  */
        const walltimeMs = Date.now() - started
        const usage: AgentUsage = { walltimeSec: Math.round(walltimeMs / 1000), costToken: costs.costToken, costUSD: costs.costUSD }
        await log("info", `${cli} usage: walltime: ${usage.walltimeSec}s, ` +
            `tokens: ${usage.costToken ?? "n/a"}, ` +
            `cost: ${usage.costUSD !== null ? `$${usage.costUSD.toFixed(2)}` : "n/a"}`)
        this.presence?.used(usage)

        /*  book the usage onto the task, if the AI usage accounting is enabled ("telemetry.enabled"),
            (the AI request time falling back to the wall time and an unreported cost to the price
            table entry of the given model, else of the tool), without any human time and costs,
            as the headless agent tool runs unattended; the times are booked in rounded minutes,
            with the (signed) rounding remainder carried over to the next booking onto the task,
            where a failed booking is only reported  */
        const ok = !abort.aborted && !result.timedOut && result.exitCode === 0
        try {
            if (!telemetryEnabled(this.log))
                return { ok, session: session.id }
            const tokens: TokenCounts = { cread: costs.cread, cwrite: costs.cwrite, input: costs.input, output: costs.costToken ?? 0 }
            let cost = costs.costUSD
            if (cost === null) {
                const cfg = new Config("config", configSchema, this.log)
                cfg.read()
                const prices = parsePrices(String(cfg.get("telemetry.prices.ai") ?? ""))
                cost = tokenCost(modelPrice(prices, model !== "" && prices.has(model) ? model : tool), tokens)
            }
            const carry    = this.unbooked.get(taskId) ?? { aiMs: 0, realMs: 0 }
            const aiMs     = carry.aiMs   + (costs.apiMs ?? walltimeMs)
            const realMs   = carry.realMs + walltimeMs
            const timeAI   = Math.max(0, Math.round(aiMs   / (60 * 1000)))
            const timeReal = Math.max(0, Math.round(realMs / (60 * 1000)))
            this.unbooked.set(taskId, { aiMs: aiMs - timeAI * 60 * 1000, realMs: realMs - timeReal * 60 * 1000 })
            await Task.addUsage(this.log, taskId, {
                "time.ai":      timeAI,
                "time.real":    timeReal,
                "token.cread":  tokens.cread,
                "token.cwrite": tokens.cwrite,
                "token.input":  tokens.input,
                "token.output": tokens.output,
                "cost.ai":      Number(cost.toFixed(4))
            })
        }
        catch (err: unknown) {
            await log("warning", `usage not booked onto task: ${err instanceof Error ? err.message : String(err)}`)
        }
        return { ok, session: session.id }
    }

    /*  process a claimed task via the skill of the headless agent tool in a worker slot
        and afterwards settle it; finally the processing log is appended to the
        attachment of the task  */
    private async handle (task: AgentTask, claimed: string, slot: number, abort: AbortSignal): Promise<void> {
        const lines: string[] = []
        const prefix = `${this.name}[${slot}]: ${task.id}`
        const log    = (level: LineLevel, msg: string) => this.write(level, prefix, msg, lines, task.id)
        const echo   = (level: LineLevel, msg: string) => this.write(level, prefix, msg, undefined, task.id)

        /*  a timed out preparing, which keeps running, releases the resources it still
            creates (e.g. worktrees) and the resources of the task only once it ended  */
        let late: Promise<void> | null = null
        try {
            await log("info", claimed)

            /*  prepare the job and run its skill via the headless agent tool  */
            const output: string[] = []
            let ok = false
            let job: AgentJob | null = null
            try {
                job = await withinJobTimeout("preparing the job", () => this.prepare(task, this.parallelized, log), (pending) => {
                    late = pending
                        .then((orphan) => orphan.cleanup?.(log))
                        .catch(() => {})
                })
                let last = await this.invoke(task.id, job, { cmd: job.cmd, prompt: job.prompt, resume: "" }, abort, log, echo, output)

                /*  run the follow-up invocations, each only after the success of its predecessor,
                    where a resumed one falls back to a fresh session if its predecessor reported none  */
                const followups = job.followup ?? []
                for (let n = 0; last.ok && n < followups.length; n++) {
                    const { cmd, prompt, resume } = followups[n]
                    if (resume && last.session === "")
                        await log("warning", `follow-up #${n + 1}: no session of the preceding invocation to resume -- using a fresh session`)
                    await log("info", `follow-up #${n + 1}: running in ${resume && last.session !== "" ? `resumed session ${last.session}` : "fresh session"}`)
                    last = await this.invoke(task.id, job, { cmd, prompt, resume: resume ? last.session : "" }, abort, log, echo, output)
                    if (!last.ok)
                        await log("warning", `follow-up #${n + 1}: failed`)
                }
                ok = last.ok
            }
            catch (err: unknown) {
                await log("error", err instanceof Error ? err.message : String(err))
            }

            /*  finish the job independent of the success of the skill,
                where a failure overrides even a success of the skill  */
            let finished = true
            const finish = job?.finish
            if (finish !== undefined) {
                try {
                    await withinJobTimeout("finishing the job", () => finish(log, { ok, output }))
                }
                catch (err: unknown) {
                    await log("error", err instanceof Error ? err.message : String(err))
                    ok       = false
                    finished = false
                }
            }

            /*  clean up the job in any case (a failure is reported only)  */
            const cleanup = job?.cleanup
            if (cleanup !== undefined) {
                try {
                    await withinJobTimeout("cleaning up the job", () => cleanup(log))
                }
                catch (err: unknown) {
                    await log("warning", err instanceof Error ? err.message : String(err))
                }
            }

            /*  settle the task by the results of the skill invocation and the job  */
            await this.settle(task, ok, finished, abort.aborted, output, log)
        }
        catch (err: unknown) {
            await log("error", err instanceof Error ? err.message : String(err))
        }
        finally {
            /*  release the resources of the task (after a timed out preparing ended)  */
            const pending = late as Promise<void> | null
            if (pending !== null)
                pending.finally(() => this.workspace.unbind(task.id)).catch(() => {})
            else
                await this.workspace.unbind(task.id)
        }

        /*  append the processing log to the attachment of the task  */
        const now = DateTime.now().toFormat("yyyy-LL-dd HH:mm")
        try {
            const attached = await Task.attach(this.log, task.id, {
                Type: "text/plain; charset=utf-8; kind=\"agent\"",
                Created: now, Modified: now, Data: `${lines.join("\n")}\n`
            }, true)
            if (attached)
                await this.write("info", prefix, "processing log attached to task", undefined, task.id)
            else
                await this.write("warning", prefix, "task vanished -- processing log not attached", undefined, task.id)
        }
        catch (err: unknown) {
            await this.write("error", prefix, `processing log not attached: ${err instanceof Error ? err.message : String(err)}`, undefined, task.id)
        }
    }

    /*  the per-agent CLI command "start", parsing the options of the agent, where the
        options shared by all agents carry no defaults, as they fall back to those
        given to "setup" (see "ase agent <kind> start" and "ase agent fleet start")  */
    command (): Command {
        if (this.cmd === null) {
            this.cmd = new Command("start")
                .description(this.description)
                .exitOverride()
                .option("-n, --name <name>",        "name of the agent in its log lines, " +
                    `the "Assignee:" of its tasks, and its process files (default: "${this.kind}")`)
                .option("-t, --tool <tool>",        "agent tool (\"claude\", \"copilot\", or \"codex\"; " +
                    "default: $ASE_TOOL, else \"claude\")")
                .option("-p, --parallel <num>",     "maximum number of tasks processed in parallel (default: 1)")
                .option("-T, --timeout <duration>", "maximum duration of processing a task " +
                    "as <number><unit> with unit s, m, or h (default: 60m)")
                .option("-B, --budget <usd>",       "maximum costs of processing a task in USD, as a soft cap " +
                    "(\"none\" or 0 for no cap; default: 20, unsupported by agent tool \"codex\")")
                .option("-o, --one-shot",           "terminate once all dispatchable incoming tasks are processed")
                .option("--agent-relay <url>",      "agent relay to pass the live presence of the agent to, " +
                    "as \"ase[s]://<addr>:<port>[/<token>]\" (default: the configured \"project.relay.url\", else none)")
                .option("-C, --cwd <dir>",          "working copy to run the agent tool in, while the agent itself " +
                    "keeps its project context (default: the project root the agent is started in)")
            if (this.worktree)
                this.cmd
                    .option("-r, --repo <url>",    "Git repository to clone temporarily for the tasks " +
                        "without \"worktree\" values (default: the Git working copy the agent is started in)")
                    .option("-d, --tempdir <dir>", "directory for the temporary files like the clone of \"--repo\", " +
                        "with \"%p\" expanded to the process id and \"%h\" to a hash value (default: a fresh, private one)")
            this.options(this.cmd)
        }
        return this.cmd
    }

    /*  validate the own options of the agent ahead of its setup (e.g. before detaching it),
        throwing on an invalid one  */
    async validate (_own: Partial<AgentOpts>): Promise<void> {}

    /*  configure the agent from the default options, overridden by its own options,
        validate its configuration, and initialize it, where <relay> is the client
        of the agent relay to announce the presence of the agent to (if any)  */
    async setup (global: AgentOpts, own: Partial<AgentOpts>, relay: AgentRelayClient | null = null): Promise<void> {
        const opts = {
            ...global,
            ...Object.fromEntries(Object.entries(own).filter((entry) => entry[1] !== undefined))
        } as AgentOpts
        this._name = opts.name ?? ""
        if (this._name !== "" && !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(this._name))
            throw new Error(`agent: invalid name "${this._name}" (expected up to 64 letters, digits, "_", ".", or "-")`)
        this.relay = relay
        this.tool = parseTool(opts.tool)
        for (const cli of [ toolSpecs[this.tool].cli, ...(this.worktree ? [ "git" ] : []) ])
            await which(cli).catch(() => {
                throw new Error(`agent: ${this.name} requires "${cli}", which was not found in $PATH`)
            })

        /*  the agent tool runs in the working copy of "--cwd" (or its Git top-level), where
            the skills resolve their project context from it and hence can only reach a task
            store not located inside the project the agent is started in  */
        let root = Task.projectRoot()
        if (opts.cwd !== undefined) {
            const dir = path.resolve(opts.cwd)
            if (!(await fs.promises.stat(dir).catch(() => null))?.isDirectory())
                throw new Error(`agent: ${this.name}: "--cwd" directory "${dir}" not found`)
            else if (Task.isLocal(this.log))
                throw new Error(`agent: ${this.name} with "--cwd" requires a non-local task store ` +
                    "(project uses a local \"ase:<path>\" one)")
            const top = await execa("git", [ "rev-parse", "--show-toplevel" ], { cwd: dir, reject: false })
            root = top.exitCode === 0 && top.stdout.trim() !== "" ? top.stdout.trim() : dir
        }
        let repo    = ""
        let tempdir = ""
        if (this.worktree) {
            /*  the "worktree" values of the change set flow keys refer to the Git working
                copy of the agent, which hence is mandatory without "--repo", while with
                "--repo" the skills run inside its temporary clone and hence can only
                reach a task store not located inside the working copy  */
            repo    = opts.repo ?? ""
            tempdir = opts.tempdir ?? ""
            if (repo !== "" && opts.cwd !== undefined)
                throw new Error(`agent: ${this.name}: "--cwd" and "--repo" are mutually exclusive`)
            else if (repo === "" && !(await gitInside(root)))
                throw new Error(`agent: ${this.name} has to be started inside a Git working copy ` +
                    "(or be given \"--cwd\" with one, or \"--repo\")")
            else if (repo !== "" && Task.isLocal(this.log))
                throw new Error(`agent: ${this.name} with "--repo" requires a non-local task store ` +
                    "(project uses a local \"ase:<path>\" one)")
        }
        if (!/^\d+$/.test(opts.parallel) || Number.parseInt(opts.parallel, 10) < 1)
            throw new Error(`agent: invalid number of parallel workers "${opts.parallel}" (expected a positive integer)`)
        this.parallel = Number.parseInt(opts.parallel, 10)
        if (this.serial && this.parallel > 1) {
            if (own.parallel !== undefined)
                await this.write("warning", this.name, `processing tasks serially only -- ignoring "--parallel ${opts.parallel}"`)
            this.parallel = 1
        }
        this.timeoutSpec = opts.timeout
        this.timeout     = parseDuration(opts.timeout)
        if (this.tool === "codex" && own.budget !== undefined)
            throw new Error(`agent: ${this.name}: "--budget" is unsupported by agent tool "codex" (which has no cost cap)`)
        this.budget      = this.tool !== "codex" ? parseBudget(opts.budget, this.tool) : ""
        this.oneShot     = opts.oneShot
        this.lifecycle   = await Task.lifecycle(this.log)
        if (!this.lifecycles.includes(this.lifecycle.name))
            throw new Error(`agent: ${this.name} requires the ` +
                `${this.lifecycles.map((name) => `"${name}"`).join(" or ")} task lifecycle model ` +
                `(project uses "${this.lifecycle.name}")`)
        this._workspace = new AgentWorkspace(this.log, {
            name:         this.name,
            parallelized: this.parallelized,
            defer:        (task, reason) => this.defer(task, reason),
            write:        (level, msg) => this.write(level, this.name, msg)
        }, root, repo, tempdir)
        await this.init(opts)
    }

    /*  claim all dispatchable tasks in natural id order (as reordered by "order") into free worker slots,
        reporting the waiting and the noticed tasks once per change of their reason resp. notice  */
    private async dispatch (state: RunState): Promise<void> {
        const { slots, running, abort, notify } = state
        const { items } = await Task.listHeaders(this.log)
        const selected  = this.select(items, new Set(slots.values()))
        const tasks     = selected.tasks
        const notices   = selected.notices ?? new Map<string, string>()
        for (const [ id, notice ] of notices)
            if (state.notices.get(id) !== notice)
                await this.write("warning", this.name, `task "${id}" ${notice}`)
        state.notices = notices
        for (const [ id, reason ] of selected.waiting)
            if (state.waiting.get(id) !== reason)
                await this.write("info", this.name, `task "${id}" waits for ${reason}`)
        state.waiting = selected.waiting
        tasks.sort((a, b) => TaskFormat.compareIds(a.id, b.id))
        for (const task of await this.order(tasks)) {
            if (slots.size >= this.parallel || abort.signal.aborted)
                break
            let claimed: string | null = null
            try {
                /*  a task not ready for the agent (e.g. one already carrying the result of
                    a previous processing, or one deferred) is skipped, where the resources
                    held for a task not claimed (e.g. its working copy) are released again  */
                if (await this.ready(task))
                    claimed = await this.claim(task)
            }
            catch (err: unknown) {
                await this.write("warning", this.name, `task "${task.id}" not claimed: ${err instanceof Error ? err.message : String(err)}`)
            }
            if (claimed === null) {
                this.workspace.unhold(task.id)
                continue
            }
            this.deferred.delete(task.id)
            let slot = 1
            while (slots.has(slot))
                slot++
            slots.set(slot, task.id)
            busyAgents.add(this)
            this.presence?.busy([ ...slots.values() ])

            /*  a task is processed in parallel to others also by the peer agents of its kind,
                where an agent becoming idle wakes up all agents of this process, as its
                processed task can have become dispatchable to another one  */
            const job: Promise<void> = this.handle(task, claimed, slot, abort.signal)
                .finally(() => {
                    slots.delete(slot)
                    this.presence?.busy([ ...slots.values() ])
                    running.delete(job)
                    notify()
                    if (slots.size === 0) {
                        if (!state.dispatching)
                            busyAgents.delete(this)
                        for (const wakeAgent of wakeAgents)
                            wakeAgent()
                    }
                })
            running.add(job)
        }
    }

    /*  observe the tasks and dispatch each selected one (see "select"), after
        claiming it (see "claim"), to a free worker slot, until interrupted (or,
        in one-shot mode, until no task is dispatchable and no task is processed anymore)  */
    async run (): Promise<void> {
        const { tool, parallel } = this

        /*  the worker slots (slot number to task id), their jobs, and the wake-up
            of the dispatcher on task store changes, freed slots, and interrupts  */
        const slots   = new Map<number, string>()
        const running = new Set<Promise<void>>()
        const abort   = new AbortController()
        let dirty     = true
        let wake      = () => {}
        const notify  = () => {
            dirty = true
            wake()
        }
        this.interruption = abort.signal
        const interrupt = (signal: NodeJS.Signals) => {
            if (abort.signal.aborted)
                return
            abort.abort()
            const write = running.size > 0 ?
                this.write("warning", this.name, `interrupted (received ${signal}) -- aborting ${running.size} running processing(s)`) :
                this.write("info", this.name, `interrupted (received ${signal})`)
            write.catch(() => {})
            notify()
        }

        /*  a repeated terminating signal terminates the process at once (instead of
            awaiting the aborted processings and their cleanups, which can take minutes),
            leaving the claimed tasks to the recovery by a later run of an agent of its kind  */
        const signalled = (signal: NodeJS.Signals) => {
            if (abort.signal.aborted) {
                this.log.write("warning", `agent: ${this.name}: interrupted again (received ${signal}) -- terminating immediately`)
                process.exit(128 + (os.constants.signals[signal] ?? 0))
            }
            interrupt(signal)
        }

        /*  the state of the run shared with its dispatching  */
        const state: RunState = { slots, running, abort, waiting: new Map(), notices: new Map(), dispatching: false, notify }

        /*  dispatch on every change until interrupted (or, in one-shot mode, until a
            dispatching leaves all worker slots free while all agents of this process
            are idle), then await the aborted jobs, where the interrupt is triggered by
            all terminating signals which can be caught, so no claimed task keeps its "active" tag  */
        process.on("SIGINT",  signalled)
        process.on("SIGTERM", signalled)
        process.on("SIGHUP",  signalled)
        process.on("SIGQUIT", signalled)
        wakeAgents.add(notify)
        this.wakeup = notify
        const unsubscribe = Task.subscribe(this.log, notify)

        /*  announce the presence of the agent to the agent relay (if any) while it runs  */
        if (this.relay !== null) {
            this.presence = new AgentPresenceReporter(this.log, this.relay, this.kind, this.name, this.mode, this.presenceRequest,
                this.presencePrompt, this.presenceStates, this.presenceTitle, this.presenceDesc)
            this.presence.start()
        }

        /*  a failed dispatching (e.g. on a transient failure of the task store) is retried
            after a growing delay, but in one-shot mode only a limited number of times in a row,
            after which the agent fails (instead of terminating as if no task were dispatchable)  */
        const retries = 3
        let failures  = 0
        let retry: ReturnType<typeof setTimeout> | undefined

        /*  an agent counts as busy for the termination of the peer agents of this process in
            one-shot mode not only while processing tasks, but also while starting up and while
            dispatching (where it might still claim a task), and an agent becoming idle after a
            dispatching wakes up all other agents of this process waiting for it to re-check
            their termination (but not itself, as it re-checks it right away)  */
        busyAgents.add(this)
        const dispatched = (): boolean => {
            state.dispatching = false
            if (slots.size > 0)
                return false
            if (busyAgents.delete(this) && this.oneShot)
                for (const wakeAgent of wakeAgents)
                    if (wakeAgent !== notify)
                        wakeAgent()
            return this.oneShot && busyAgents.size === 0
        }
        try {
            /*  acquire the run lock of the agent and recover the tasks
                left behind by terminated runs of agents of its kind  */
            await this.runLock.acquire()
            await this.recover().catch((err: unknown) =>
                this.write("warning", this.name, `recovery failed: ${err instanceof Error ? err.message : String(err)}`))

            /*  open the workspace (cloning the repository of "--repo" temporarily)  */
            await this.workspace.open()

            await this.write("info", this.name, `observing ${this.observing()} ` +
                `(tool: ${tool}${this.modelSpec !== "" ? `, model: ${this.modelSpec}` : ""}, parallel: ${parallel}, timeout: ${this.timeoutSpec}, ` +
                `budget: ${this.budget !== "" ? `$${this.budget}` : "none"}${this.oneShot ? ", one-shot" : ""})`)
            let finished = false
            let failure: unknown = null
            while (!abort.signal.aborted && !finished) {
                if (dirty && slots.size < parallel) {
                    dirty             = false
                    state.dispatching = true
                    busyAgents.add(this)
                    try {
                        await this.dispatch(state)
                        failures = 0
                        finished = dispatched()
                    }
                    catch (err: unknown) {
                        dispatched()
                        failures++
                        await this.write("error", this.name, `dispatching failed (${failures}. time): ` +
                            `${err instanceof Error ? err.message : String(err)}`)
                        if (this.oneShot && failures >= retries) {
                            failure = err
                            break
                        }
                        clearTimeout(retry)
                        retry = setTimeout(notify, Math.min(failures, 30) * 1000)
                    }
                }
                else
                    await new Promise<void>((resolve) => { wake = resolve })
            }
            await Promise.all(running)
            if (failure !== null)
                throw new Error(`agent: ${this.name}: dispatching failed ${failures} times in a row -- giving up ` +
                    `(${failure instanceof Error ? failure.message : String(failure)})`)
            await this.write("info", this.name, finished ? "no more dispatchable tasks -- terminated" : "terminated")
        }
        finally {
            clearTimeout(retry)
            unsubscribe()
            await this.presence?.stop()
            this.presence = null
            process.off("SIGINT",  signalled)
            process.off("SIGTERM", signalled)
            process.off("SIGHUP",  signalled)
            process.off("SIGQUIT", signalled)

            /*  let the agents of this process waiting for this one re-check their termination  */
            this.wakeup = null
            wakeAgents.delete(notify)
            busyAgents.delete(this)
            for (const wakeAgent of wakeAgents)
                wakeAgent()

            /*  retry the failed finalizations a last time (those still failing are
                recovered by a later run, as the run lock is retained for them)  */
            if (this.unsettled.size > 0)
                await this.retryUnsettled()

            /*  close the workspace (removing its temporary directory, if any)  */
            await this.workspace.close().catch((err: unknown) =>
                this.write("warning", this.name, `temporary directory not removed: ${err instanceof Error ? err.message : String(err)}`))
            await this.teardown()
            if (!this.retainRun())
                await this.runLock.release()
        }
    }
}

