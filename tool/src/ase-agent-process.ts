/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import path                              from "node:path"
import fs                                from "node:fs"

import type { Command }                  from "commander"
import YAML                              from "yaml"
import lockfile                          from "proper-lockfile"

import type Log                          from "./ase-lib-log.js"
import { writeStdout }                   from "./ase-lib-stdio.js"
import { DaemonCommand }                 from "./ase-lib-daemon-cli.js"
import { projectRoot, ensureAseGitignore } from "./ase-config-scope.js"
import { pidAlive, pidStart }            from "./ase-agent-runtime-exec.js"
import type { Agent, AgentOpts }         from "./ase-agent-runtime.js"
import { relaySpec, AgentRelayClient }   from "./ase-agent-relay-client.js"

/*  the process state of a running agent (or fleet) process: its process id and its start
    time (identifying the process beyond its process id, as the latter is reused)  */
export type ProcessState = { pid: number, start: string }

/*  the process state of a running agent process, additionally recording the kind of the
    agent (as the process files are named by the agent name, which agents of different
    kinds can share)  */
type AgentState = ProcessState & { kind: string }

/*  the duration after which the start lock of an agent counts as stale  */
const startStale = 10 * 1000

/*  the directory of the process files of the agents (and of their fleet) of the project  */
export const processDir = (): string => {
    const root = projectRoot()
    if (root === null)
        throw new Error("agent: no project context " +
            "(a Git repository or a \".ase\" directory at or above the current directory)")
    ensureAseGitignore(path.join(root, ".ase"))
    return path.join(root, ".ase", "agent")
}

/*  read a process state file (or null if missing or invalid)  */
export const readState = <T extends ProcessState> (file: string): T | null => {
    try {
        const data = YAML.parse(fs.readFileSync(file, "utf8")) as T | null
        return data !== null && typeof data === "object" && typeof data.pid === "number" ? data : null
    }
    catch (_err) {
        return null
    }
}

/*  write a process state file (atomically)  */
export const writeState = (file: string, state: ProcessState & Record<string, unknown>): void => {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(`${file}.tmp`, YAML.stringify(state))
    fs.renameSync(`${file}.tmp`, file)
}

/*  whether the process recorded in a process state is still alive  */
export const stateAlive = async (state: ProcessState | null): Promise<boolean> =>
    state !== null && pidAlive(state.pid) && (state.start === "" || await pidStart(state.pid) === state.start)

/*  validate the name of an agent of a kind, which must neither be the name of another
    agent kind nor of another "ase agent" command, as it names its process files  */
export const validateName = (name: string, kind: string, kinds: string[]): void => {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(name) || name.length > 64)
        throw new Error(`agent: invalid agent name "${name}" ` +
            "(expected up to 64 letters, digits, underscores, and dashes, starting with a letter or digit)")
    if (name !== kind && [ ...kinds, "relay", "fleet" ].includes(name))
        throw new Error(`agent: agent name "${name}" clashes with the command "ase agent ${name}"`)
}

/*  the defaults of the options shared by all agents (where the one of "--tool"
    is derived from the ASE_TOOL environment variable, validated lazily in "setup")  */
export const agentDefaults = (): AgentOpts => {
    const envTool = process.env.ASE_TOOL ?? ""
    return { tool: envTool !== "" ? envTool : "claude", parallel: "1", timeout: "60m", budget: "20", oneShot: false }
}

/*  the command-line arguments of the explicitly given options of a command (except "--foreground"),
    where a repeatable option is repeated per value, and where the fields of the follow-up prompts
    ("--followup-<field>") are given in their original order (of their collected list "followup")  */
const givenArgs = (cmd: Command): string[] => [
    ...cmd.options.flatMap((option) => {
        const key = option.attributeName()
        if (option.long === undefined || option.long === "--foreground" || option.long.startsWith("--followup-")
            || cmd.getOptionValueSource(key) !== "cli")
            return []
        const value = cmd.getOptionValue(key) as string | string[] | boolean
        return value === true ? [ option.long ] :
            (Array.isArray(value) ? value : [ value ]).flatMap((item) => [ option.long!, String(item) ])
    }),
    ...((cmd.getOptionValue("followup") ?? []) as string[]).flatMap((token) => {
        const i = token.indexOf("=")
        return [ `--followup-${token.slice(0, i)}`, token.slice(i + 1) ]
    })
]

/*  CLI command group "ase agent <kind>", managing a single agent of a kind
    (named by "--name") in the background or in the foreground  */
export default class AgentProcessCommand extends DaemonCommand {
    protected readonly label:       string
    protected readonly words:       string
    protected readonly description: string

    constructor (log: Log, private agent: Agent, private kinds: ReadonlyMap<string, unknown>) {
        super(log)
        this.label       = `agent ${agent.kind}`
        this.words       = `agent ${agent.kind}`
        this.description = agent.command().description()
    }

    /*  the process state file and the log file of an agent of the project  */
    private file (name: string, ext: "yaml" | "log"): string {
        return path.join(processDir(), `${name}.${ext}`)
    }

    /*  start flow: detach the agent (or run it in the foreground or as the detached process)  */
    private async doStart (start: Command, opts: AgentOpts & { foreground?: boolean }): Promise<number> {
        const kind  = this.agent.kind
        const name  = opts.name ?? kind
        validateName(name, kind, [ ...this.kinds.keys() ])
        const file  = this.file(name, "yaml")
        const serve = process.env.ASE_AGENT_SERVE === "1"
        delete process.env.ASE_AGENT_SERVE

        /*  idempotent start: an already running agent is left alone
            (unless the name is taken by a running agent of another kind)  */
        const state = readState<AgentState>(file)
        if (state !== null && await stateAlive(state)) {
            if (state.kind !== kind)
                throw new Error(`agent ${name}: name already taken by a running ${state.kind} agent (pid ${state.pid})`)
            if (opts.foreground || serve)
                throw new Error(`agent ${name}: already running (pid ${state.pid}) ` +
                    `(stop it first with "ase agent ${kind} stop -n ${name}")`)
            this.log.write("info", `agent ${name}: already running (pid ${state.pid})`)
            return 0
        }

        /*  spawn the agent detached (after validating its options), logging into
            its log file, and await its successful setup  */
        if (!opts.foreground && !serve) {
            await this.agent.validate(opts)
            const logFile = this.file(name, "log")
            const child   = this.spawnDetached([ "-l", this.log.logLevel(), "agent", kind, "start", ...givenArgs(start) ],
                { ASE_AGENT_SERVE: "1" }, logFile)
            await this.awaitDetached(child, logFile, () => readState(file)?.pid === child.pid, 30 * 1000)
            this.log.write("info", `agent ${name}: started (pid ${child.pid}), logging to "${logFile}"`)
            return 0
        }

        /*  run the agent in this process (with the client of the agent relay, if any),
            recording its process state from its successful setup until its termination,
            where the start lock (held from re-checking the process state until recording
            it) ensures that of concurrently started agents of the same name only one runs  */
        fs.mkdirSync(path.dirname(file), { recursive: true })
        const unlock = await lockfile.lock(file, {
            realpath: false, stale: startStale, update: startStale / 5,
            onCompromised: (err: Error) => {
                this.log.write("warning", `agent ${name}: start lock compromised: ${err.message}`)
            }
        }).catch((err: unknown) => {
            throw (err as NodeJS.ErrnoException).code === "ELOCKED" ?
                new Error(`agent ${name}: already being started concurrently`) : err
        })
        try {
            const other = readState<AgentState>(file)
            if (other !== null && await stateAlive(other))
                throw new Error(`agent ${name}: already running (pid ${other.pid})`)
            const spec  = relaySpec(this.log, opts.agentRelay)
            const relay = spec !== null ? new AgentRelayClient(this.log, spec) : null
            await this.agent.setup(agentDefaults(), opts, relay)
            writeState(file, { kind, pid: process.pid, start: await pidStart(process.pid) })
        }
        finally {
            await unlock()
        }
        try {
            await this.agent.run()
        }
        finally {
            if (readState(file)?.pid === process.pid)
                fs.rmSync(file, { force: true })
        }
        return 0
    }

    /*  status flow: report whether the agent is running  */
    private async doStatus (name: string): Promise<number> {
        validateName(name, this.agent.kind, [ ...this.kinds.keys() ])
        const state = readState<AgentState>(this.file(name, "yaml"))
        if (state === null || !(await stateAlive(state))) {
            await writeStdout(`agent ${name}: not running\n`)
            return 1
        }
        if (state.kind !== this.agent.kind) {
            await writeStdout(`agent ${name}: not running (name taken by a running ${state.kind} agent, pid ${state.pid})\n`)
            return 1
        }
        await writeStdout(`agent ${name}: running (pid ${state.pid})\n`)
        return 0
    }

    /*  stop flow: terminate the agent process and wait until it is gone
        (where the agent awaits its aborted processings and their cleanups)  */
    private async doStop (name: string): Promise<number> {
        validateName(name, this.agent.kind, [ ...this.kinds.keys() ])
        const file  = this.file(name, "yaml")
        const state = readState<AgentState>(file)
        if (state === null || !(await stateAlive(state))) {
            this.log.write("info", `agent ${name}: not running`)
            fs.rmSync(file, { force: true })
            return 0
        }
        if (state.kind !== this.agent.kind) {
            this.log.write("info", `agent ${name}: not running (name taken by a running ${state.kind} agent, pid ${state.pid})`)
            return 0
        }
        if (await this.terminate(state.pid, 5 * 60 * 1000))
            this.log.write("info", `agent ${name}: stopped (process ${state.pid})`)
        else
            this.log.write("info", `agent ${name}: not running (process ${state.pid} already gone)`)
        fs.rmSync(file, { force: true })
        return 0
    }

    /*  register the CLI sub-command group and its commands
        "start", "status", "log", "stop", and "restart" below the CLI command <parent>  */
    register (parent: Command): void {
        const kind  = this.agent.kind
        const group = this.group(parent)

        /*  register CLI sub-command "start" (with the options of the agent)  */
        const start = this.agent.command()
        start
            .description(`Start the ${kind} agent in the background (idempotent if already running) or in the foreground`)
            .option("-f, --foreground", "run the agent in the foreground, logging to the terminal, " +
                "until it is interrupted or stopped")
            .action(async (opts: AgentOpts & { foreground?: boolean }) => {
                process.exitCode = await this.doStart(start, opts)
            })
        group.addCommand(start)

        /*  register CLI sub-command "status"  */
        group
            .command("status")
            .description(`Report whether the ${kind} agent is running`)
            .option("-n, --name <name>", `name of the agent (default: "${kind}")`)
            .action(async (opts: { name?: string }) => {
                process.exitCode = await this.doStatus(opts.name ?? kind)
            })

        /*  register CLI sub-command "log" (with the name option in its long form only,
            as the short form "-n" is the one of the number of lines, like in "tail")  */
        this.registerLog(group, (opts: { name?: string }) => {
            const name = opts.name ?? kind
            validateName(name, kind, [ ...this.kinds.keys() ])
            return this.file(name, "log")
        }, (cmd) => {
            cmd.option("--name <name>", `name of the agent (default: "${kind}")`)
        })

        /*  register CLI sub-command "stop"  */
        group
            .command("stop")
            .description(`Stop the ${kind} agent`)
            .option("-n, --name <name>", `name of the agent (default: "${kind}")`)
            .action(async (opts: { name?: string }) => {
                process.exitCode = await this.doStop(opts.name ?? kind)
            })

        /*  register CLI sub-command "restart" (with the options of "start", whose
            option definitions can be shared, as their values are kept per command)  */
        const restart = group
            .command("restart")
            .description(`Restart the ${kind} agent by stopping it and starting it again`)
        for (const option of start.options)
            restart.addOption(option)
        restart.action(async (opts: AgentOpts & { foreground?: boolean }) => {
            const code = await this.doStop(opts.name ?? kind)
            process.exitCode = code !== 0 ? code : await this.doStart(restart, opts)
        })
    }
}

