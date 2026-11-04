/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import path                              from "node:path"
import fs                                from "node:fs"
import { fileURLToPath }                 from "node:url"
import { spawn }                         from "node:child_process"
import type { ChildProcess }             from "node:child_process"

import type { Command }                  from "commander"
import YAML, { isScalar }                from "yaml"
import textframe                         from "textframe"
import chalk                             from "chalk"

import type Log                          from "./ase-lib-log.js"
import type { LogLevel }                 from "./ase-lib-log.js"
import { writeStdout }                   from "./ase-lib-stdio.js"
import { DaemonCommand }                 from "./ase-lib-daemon-cli.js"
import { DEFAULT_ADDRESS, connectHost, isLocal } from "./ase-lib-server-cli.js"
import { isLoopback }                    from "./ase-lib-server-bind.js"
import { Config }                        from "./ase-config-core.js"
import { configSchema }                  from "./ase-config-schema.js"
import { parseScope }                    from "./ase-config-scope.js"
import { parseRelayURL, redactURL }      from "./ase-agent-relay-client.js"
import { pidAlive, pidStart }            from "./ase-agent-runtime-exec.js"
import { relaySchema, relayTls }         from "./ase-agent-relay-server-cli.js"
import { flattenDefinition }             from "./ase-agent-definition-core.js"
import type { ResolvedDefinition }       from "./ase-agent-definition-core.js"
import type { DefinedAgent }             from "./ase-agent-runtime-engine.js"
import { processDir, readState, writeState, stateAlive, validateName, agentDefaults } from "./ase-agent-process.js"
import type { ProcessState }             from "./ase-agent-process.js"

/*  the minimum and maximum delay of restarting an exited member (doubled on each restart
    in a row), the run duration after which a member counts as stable again (resetting its
    delay), and the maximum durations of the startup of the agent relay and of the agents  */
const RESTART_MIN_MS   = 1000
const RESTART_MAX_MS   = 5 * 60 * 1000
const STABLE_MS        = 10 * 60 * 1000
const RELAY_STARTUP_MS = 10 * 1000
const AGENT_STARTUP_MS = 30 * 1000

/*  the environment variable marking the detached fleet process  */
const SERVE_ENV = "ASE_AGENT_FLEET_SERVE"

/*  the colors of the names of the fleet and its members prefixing their lines
    in the shared log: bold red for the fleet, red for the relay, and blue for all agents  */
const tint = (name: string): string =>
    name === "fleet" ? chalk.red.bold(name) : name === "relay" ? chalk.red(name) : chalk.blue(name)

/*  the prefix of a line in the log of a fleet: the name of the fleet ("fleet") or of
    its member, padded to the width of the longest name, followed by a separator  */
const logPrefix = (name: string, width: number, colored: boolean): string =>
    `${colored ? tint(name) : name}${" ".repeat(Math.max(width - name.length, 0))} | `
const logPrefixRe = /^([A-Za-z0-9][A-Za-z0-9_-]*)( *\| )/
const logLevelRe  = /^([^|]*\| [^:]+: \[[^\]]+\]: )\[(ERROR|WARNING|INFO|DEBUG)\]/

/*  the options of the section "fleet" (those of "ase agent fleet start"), of the section
    "relay" (those of "ase agent relay start"), and of the section "default" (shared by all
    agents, and applied to an agent only if it supports them)  */
const fleetKeys   = [ "foreground" ]
const relayKeys   = [ "address", "port", "token", "cors", "tls-cert", "tls-key" ]
const defaultKeys = [ "tool", "model", "parallel", "timeout", "repo", "tempdir", "agent-relay" ]

/*  the options not allowed in the section of an agent, as the fleet decides on them  */
const deniedKeys = [ "name", "one-shot", "foreground", "help" ]

/*  the state of the planned tasks per task lifecycle model, as estimated by the estimator  */
const initPlanned: Record<string, string> = { solo: "OPEN", team: "PLANNING", enterprise: "PLANNED" }

/*  the initial configuration of a fleet (see "ase agent fleet init") for a task lifecycle
    model: the agent relay, the edit request agent, and the effort estimation agent for all
    models, plus the four phase agents for "enterprise" resp. an ad-hoc implementation agent
    for "team" (as the built-in phase agents support "enterprise" only), while "solo" has no
    activity states and hence no phase agents at all  */
const initConfig = (tool: string, lifecycle: string): string => [
    textframe`
    ##
    ##  ASE Agent Fleet Configuration
    ##  (for the "${lifecycle}" task lifecycle model)
    ##

    #   the agent relay, passing the live presence of the agents to the task boards
    #   (the options not given fall back to the configured "project.relay.url",
    #   "project.relay.crt", and "project.relay.key")
    relay:
        #address:       <addr>          # address to bind to
        #port:          <port>          # port to bind to
        #token:         <token>         # bearer token to expect
        #tls-cert:      <file>          # PEM certificate (chain) to serve HTTPS with
        #tls-key:       <file>          # PEM private key to serve HTTPS with

    #   the default options of all agents
    #   (each applied only to the agents supporting it, where an empty value omits it)
    default:
        tool:           ${tool.padEnd(16)}# agent tool ("claude", "copilot", or "codex")
        #model:         <model>         # model of the agent tool (or "<size>=<model>" pairs per "Effort:" size)
        parallel:       1               # maximum number of tasks processed in parallel
        timeout:        60m             # maximum duration of processing a task (<number><unit> with unit "s", "m", or "h")
        #repo:          <url>           # Git repository to clone temporarily for the tasks without "worktree"
        #tempdir:       <dir>           # directory for the temporary files like the clone of "repo"

    #   the editing request agent: processing the editing requests of the task boards
    editor:
        parallel:       1               # maximum number of tasks processed in parallel

    #   the effort estimation agent: estimating the effort of the unestimated tasks
    #   (${initPlanned[lifecycle]}, unclaimed), intended for their final estimation
    estimator:
        mode:           phase           # "phase" (unestimated planned tasks) or "request" (on request)
        parallel:       1               # maximum number of tasks processed in parallel

    #   the effort estimation request agent: (re-)estimating the effort of the tasks in any unfinished
    #   status on request (attached via "ase task request <id> estimate <prompt>"), intended for dry-runs
    #estimator-request:
    #    kind:           estimator       # agent kind
    #    mode:           request         # "phase" (unestimated planned tasks) or "request" (on request)
    #    parallel:       1               # maximum number of tasks processed in parallel

    #   the research request agent: researching a topic (or the plan itself) for the tasks in any
    #   unfinished status on request (attached via "ase task request <id> research [<topic>]"),
    #   intended for topic-driven research
    #researcher-request:
    #    kind:           researcher      # agent kind
    #    mode:           request         # "phase" (assigned tasks) or "request" (on request)
    #    parallel:       1               # maximum number of tasks processed in parallel
    `,
    lifecycle === "solo" ? textframe`
    #   no phase agents, as the "solo" task lifecycle model has no activity states: its tasks
    #   (OPEN > CLOSED) are driven interactively, while the agents above only assist on them
    ` : "",
    lifecycle === "team" ? textframe`
    #   the implementation phase agent (PLANNING > IMPLEMENTING > IMPLEMENTED), as an ad-hoc agent
    #   (as the built-in "implementer" supports the "enterprise" task lifecycle model only),
    #   claiming only the tasks explicitly assigned to "developer" (as the other ones in
    #   PLANNING are still planned), and stalling a task on failure (STALLED)
    developer:
        kind:           adhoc           # agent kind
        type:           phase           # processing type ("phase" or "request")
        lifecycle:      team            # supported task lifecycle model
        workdir:        changeset       # implement in the changeset of the task
        parallel:       1               # maximum number of tasks processed in parallel
        state:
            incoming:   PLANNING        # state of the tasks to claim
            activity:   IMPLEMENTING    # state during the processing
            success:    IMPLEMENTED     # state on success
            failure:    STALLED         # state on failure
        assign:
            required:   true            # claim only the tasks assigned to "developer"
        prompt:
            skill:      ase-task-implement
            args:       "--next DONE{?changeset-type=branch: --changeset worktree}{?changeset-worktree: --worktree {changeset-worktree}} {id}"
        success:
            criterion:  [ status ]      # success only on the move into IMPLEMENTED by the skill
        attach:
            changeset:  changeset       # kind of the attachment storing the change set snapshot
        finish:
            commit:     true            # commit and publish the work on a "branch:" changeset
    ` : "",
    lifecycle === "enterprise" ? textframe`
    #   the planning phase agents, each processing only the tasks explicitly assigned to it
    #   (DRAFTED > PLANNING > DRAFTED, unassigned afterwards)
    rebooter:                           # re-create the plan from scratch
        parallel:       1               # maximum number of tasks processed in parallel
    condenser:                          # compress the wording of the plan
        parallel:       1               # maximum number of tasks processed in parallel
    researcher:                         # research and ground the plan content
        mode:           phase           # "phase" (assigned tasks) or "request" (on request)
        parallel:       1               # maximum number of tasks processed in parallel

    #   the implementation phase agent (PLANNED > IMPLEMENTING > IMPLEMENTED)
    implementer:
        mode:           implement       # "implement" (into changeset) or "draft" (into attachment)
        parallel:       2               # maximum number of tasks processed in parallel
        #params:        { effort-wait: false }  # do not wait for the effort estimation (without "estimator")

    #   the qualification phase agent (IMPLEMENTED > QUALIFYING > IMPLEMENTED)
    qualifier:
        mode:           judge           # "judge" (verdict tag only) or "qualify" (also decide status)
        parallel:       2               # maximum number of tasks processed in parallel

    #   the integration phase agent (QUALIFIED > INTEGRATING > INTEGRATED)
    integrator:
        mode:           squash          # Git integration operation ("merge", "rebase", or "squash")
    ` : "",
    textframe`
    #   an agent of a definition file ".ase/agents/<kind>.{yaml,ts,js}" of the project (or of
    #   the user) is configured by a section named after its kind (or with "kind: <kind>"),
    #   while an ad-hoc agent is entirely configured by its section (see "ase agent adhoc start"),
    #   e.g. one processing the requests "lint" (attached via "ase task request <id> lint <prompt>")
    #lint:
    #    kind:           adhoc           # agent kind
    #    type:           request         # processing type ("phase" or "request")
    #    #definition:    <file>          # YAML, TypeScript, or JavaScript definition file (relative to this file)
    #    #params:        { <name>: <value> } # values of the parameters declared by the definition
    #    prompt:
    #        text:       "Lint the source code of task {id} with focus on: {prompt}"
    #    success:
    #        criterion:  [ exit, clean ] # success criteria ("exit", "clean", "changed", ...)
    #    attach:
    #        output:     lint-report     # kind of the attachment storing the output
    `
].filter((block) => block !== "").join("\n")

/*  the agent relay of a fleet: its "ase agent relay start" options, the token to pass to
    it through the environment (or null to leave its resolution to the agent relay), and
    whether the agents skip the verification of its certificate  */
type FleetRelay = {
    args:     string[]
    token:    string | null
    insecure: boolean
}

/*  the validated configuration of a fleet: whether it runs in the foreground, its
    agent relay (or null without one), and the names, kinds, and options of its agents  */
type FleetPlan = {
    foreground: boolean
    relay:      FleetRelay | null
    agents:     { name: string, kind: string, args: string[] }[]
}

/*  a member of a running fleet: its name, its kind ("relay" for the agent relay), its
    command-line arguments, its additional environment variables, its process (while
    running) and the start time of the process (once known, else empty), the time of its
    last start, its current restart delay, its number of restarts, its pending restart
    (while awaiting it), and whether its process was already asked to terminate  */
type FleetMember = {
    name:      string
    kind:      string
    args:      string[]
    env:       Record<string, string>
    child:     ChildProcess | null
    start:     string
    since:     number
    delay:     number
    restarts:  number
    timer:     ReturnType<typeof setTimeout> | undefined
    signalled: boolean
}

/*  the process state of a running fleet: its configuration file, whether all its members
    completed their initial startup, and the kind, process id (null while awaiting its
    restart), start time of its process (once known, else empty), and number of restarts
    of each member  */
type FleetState = ProcessState & {
    config:  string
    ready:   boolean
    members: Record<string, { kind: string, pid: number | null, start?: string, restarts: number }>
}

/*  a configuration section of options  */
type Section = Record<string, unknown>
const isSection = (value: unknown): value is Section =>
    value !== null && typeof value === "object" && !Array.isArray(value)

/*  whether an option is given in a configuration section (where "false" or an empty value omits it)  */
const given = (values: Section, key: string): boolean =>
    values[key] !== undefined && values[key] !== null && values[key] !== false

/*  the command-line arguments of the options of a configuration section, given by
    their long option names, where "true" enables a flag, "false" or an empty value
    omits an option, a list of values repeats an option, and the map "params" repeats
    the option "--params <name>=<value>" per parameter  */
const sectionArgs = (section: string, values: Section): string[] =>
    Object.entries(values).flatMap(([ key, value ]) => {
        if (!/^[a-z][a-z0-9-]*$/.test(key))
            throw new Error(`fleet: section "${section}": invalid option name "${key}"`)
        if (value === false || value === null)
            return []
        if (value === true)
            return [ `--${key}` ]
        if (key === "params" && isSection(value))
            return Object.entries(value).flatMap(([ name, item ]) => {
                if (item === null || item === undefined)
                    return []
                if (typeof item !== "string" && typeof item !== "number" && typeof item !== "boolean")
                    throw new Error(`fleet: section "${section}": invalid value of parameter "${name}"`)
                return [ `--${key}`, `${name}=${String(item)}` ]
            })
        return (Array.isArray(value) ? value : [ value ]).flatMap((item: unknown) => {
            if (typeof item !== "string" && typeof item !== "number")
                throw new Error(`fleet: section "${section}": invalid value of option "${key}"`)
            return [ `--${key}`, String(item) ]
        })
    })

/*  CLI command group "ase agent fleet", managing a fleet of agents (and optionally the
    agent relay they report to) of a configuration file through a supervising process,
    which runs each member as its own child process and restarts it whenever it exits  */
export default class AgentFleetCommand extends DaemonCommand {
    protected readonly label       = "fleet"
    protected readonly words       = "agent fleet"
    protected readonly description = "Manage a fleet of agents (and of the agent relay they report to), " +
        "running each in its own process and restarting it whenever it exits"

    constructor (log: Log, private kinds: Map<string, () => DefinedAgent>) {
        super(log)
    }

    /*  the agent relay of a fleet by the options <values> of its section "relay"
        (completed in place by the configured agent relay)  */
    private relayPlan (values: Section): FleetRelay {
        /*  read the configured agent relay URL and token  */
        const cfg = new Config("config", configSchema, this.log)
        cfg.read()
        const scoped = (key: string): string | null => {
            const entry = cfg.getScoped(key)
            return entry !== undefined ? String(isScalar(entry.value) ? entry.value.value : entry.value) : null
        }

        /*  let the options "address", "port", and "token" not given fall back to those of
            the configured "project.relay.url" (if it addresses this host), so the agent
            relay serves exactly the URL the task boards follow (where a deviating option
            is warned about), and let it decide on HTTP or HTTPS  */
        let token: string | null = null
        let insecure = false
        let secure: boolean | null = null
        const configured = scoped("project.relay.url")
        if (configured !== null) {
            const label = redactURL(configured)
            const spec  = parseRelayURL(configured)
            const host  = spec.url.hostname.replace(/^\[|\]$/g, "")
            if (!isLocal(host))
                this.log.write("warning", `fleet: configured "project.relay.url" "${label}" ` +
                    "addresses no local address -- not adopted by the agent relay of the fleet " +
                    "(the task boards following it will not see the agents of the fleet)")
            else {
                const deviates = (key: string) =>
                    this.log.write("warning", `fleet: section "relay": option "${key}" deviates ` +
                        `from the configured "project.relay.url" "${label}" ` +
                        "(the task boards following it will not see the agents of the fleet)")
                if (!given(values, "address"))
                    values.address = host
                else if (![ host, "0.0.0.0", "::" ].includes(String(values.address)))
                    deviates("address")
                if (!given(values, "port"))
                    values.port = spec.url.port
                else if (String(values.port) !== spec.url.port)
                    deviates("port")
                if (!given(values, "token")) {
                    const env = process.env.ASE_AGENT_RELAY_TOKEN
                    token = spec.embedded ?? (env !== undefined && env !== "" ? env : scoped("project.relay.token"))
                }
                if (!spec.secure && given(values, "tls-cert"))
                    deviates("tls-cert")
                insecure = spec.insecure
                secure   = spec.secure
            }
        }

        /*  let the options "tls-cert" and "tls-key" not given fall back to the configured
            "project.relay.crt" and "project.relay.key" (as the agent relay itself would),
            where an adopted "project.relay.url" selecting HTTPS requires both  */
        const tls = relayTls(cfg)
        if (!given(values, "tls-cert") && tls.cert !== null)
            values["tls-cert"] = tls.cert
        if (!given(values, "tls-key") && tls.key !== null)
            values["tls-key"] = tls.key
        if (secure === true && (!given(values, "tls-cert") || !given(values, "tls-key")))
            throw new Error("fleet: configured \"project.relay.url\" selects HTTPS, but no TLS certificate and key " +
                "(set the options \"tls-cert\" and \"tls-key\" of the section \"relay\", " +
                "or \"project.relay.crt\" and \"project.relay.key\")")
        return { args: sectionArgs("relay", values), token, insecure }
    }

    /*  load and validate the configuration file (or the configuration <text> of it), where the
        options of each agent are validated by parsing them with the "start" command of a fresh agent  */
    private async load (file: string, text?: string): Promise<FleetPlan> {
        let data: unknown
        try {
            data = YAML.parse(text ?? fs.readFileSync(file, "utf8"))
        }
        catch (err: unknown) {
            throw new Error(`fleet: cannot read configuration "${file}": ` +
                `${err instanceof Error ? err.message : String(err)}`, { cause: err })
        }
        if (!isSection(data))
            throw new Error(`fleet: configuration "${file}" carries no sections`)
        const section = (name: string, keys?: string[]): Section => {
            const value = data[name]
            if (value === null || value === undefined)
                return {}
            if (!isSection(value))
                throw new Error(`fleet: section "${name}" carries no options`)
            for (const key of Object.keys(value))
                if (keys !== undefined && !keys.includes(key))
                    throw new Error(`fleet: section "${name}": unsupported option "${key}" ` +
                        `(expected ${keys.map((k) => `"${k}"`).join(", ")})`)
            return value
        }

        /*  the options of the fleet itself  */
        const fleet = section("fleet", fleetKeys)
        const foreground = fleet.foreground ?? false
        if (typeof foreground !== "boolean")
            throw new Error("fleet: section \"fleet\": invalid value of option \"foreground\" (expected a boolean)")

        /*  the default options of the agents  */
        const defaults = section("default", defaultKeys)

        /*  the options of the agent relay  */
        let relay: FleetRelay | null = null
        if (Object.hasOwn(data, "relay")) {
            const values = { ...section("relay", relayKeys) }
            if (given(defaults, "agent-relay"))
                throw new Error("fleet: section \"default\": option \"agent-relay\" not allowed with the section \"relay\"")

            relay = this.relayPlan(values)
        }

        /*  the agents, named by their sections  */
        const kinds  = [ ...this.kinds.keys() ]
        const agents: FleetPlan["agents"] = []
        const serial = new Map<string, string>()
        for (const name of Object.keys(data)) {
            if (name === "fleet" || name === "relay" || name === "default")
                continue
            const { kind = name, ...options } = section(name)
            if (typeof kind !== "string" || !this.kinds.has(kind))
                throw new Error(`fleet: section "${name}": unknown agent kind "${String(kind)}" ` +
                    `(expected ${kinds.map((k) => `"${k}"`).join(", ")})`)
            validateName(name, kind, kinds)

            /*  the options of the definition of an agent can be nested by group, and the
                definition file of an ad-hoc agent (but not a built-in definition) is
                relative to the configuration file  */
            const values = flattenDefinition(options, `fleet: section "${name}"`)
            if (typeof values.definition === "string" && !values.definition.startsWith("builtin:"))
                values.definition = path.resolve(path.dirname(file), values.definition)
            for (const key of [ ...deniedKeys, ...(relay !== null ? [ "agent-relay" ] : []) ])
                if (given(values, key))
                    throw new Error(`fleet: section "${name}": option "${key}" not allowed in a fleet` +
                        (key === "agent-relay" ? " with the section \"relay\"" : ""))
            const agent  = this.kinds.get(kind)!()
            const cmd    = agent.command()
            const known  = new Set(cmd.options.map((option) => option.long))
            const shared = Object.fromEntries(Object.entries(defaults).filter(([ key ]) => known.has(`--${key}`)))
            const args   = [ ...sectionArgs("default", shared), ...sectionArgs(name, values),
                ...(name !== kind ? [ "--name", name ] : []) ]
            cmd.configureOutput({ writeOut: () => {}, writeErr: () => {} })
            try {
                cmd.parse(args, { from: "user" })
            }
            catch (err: unknown) {
                throw new Error(`fleet: section "${name}": ` +
                    `${(err instanceof Error ? err.message : String(err)).replace(/^error: /, "")}`, { cause: err })
            }
            agents.push({ name, kind, args })

            /*  the resolved definition of the agent, validating it  */
            let def: ResolvedDefinition
            try {
                def = await agent.definition(cmd.opts(), name)
            }
            catch (err: unknown) {
                throw new Error(`fleet: section "${name}": ` +
                    `${(err instanceof Error ? err.message : String(err)).replace(/^agent: /, "")}`, { cause: err })
            }

            /*  the tag of an agent processing tasks serially only  */
            const tag   = def.serial ? def.tag.name : ""
            const other = serial.get(tag)
            if (tag !== "" && other !== undefined)
                throw new Error(`fleet: sections "${other}" and "${name}" both process the tasks of tag "${tag}" serially only ` +
                    "-- cannot run both")
            if (tag !== "")
                serial.set(tag, name)
        }
        if (agents.length === 0)
            throw new Error(`fleet: configuration "${file}" defines no agents`)

        /*  an agent of a built-in kind processing tasks serially only cannot be run multiple
            times (even with different tags, e.g. as merging into the same target branches)  */
        for (const [ kind, create ] of this.kinds) {
            const count = agents.filter((agent) => agent.kind === kind).length
            if (count > 1 && create().serialOnly)
                throw new Error(`fleet: ${kind} processes tasks serially only -- cannot run ${count} agents of it`)
        }
        return { foreground, relay, agents }
    }

    /*  read the per-user configuration of the agent relay  */
    private relayConfig (): (key: string) => string {
        const cfg = new Config("relay", relaySchema, this.log, parseScope("user"))
        cfg.read()
        return (key: string): string => {
            const val = cfg.get(key)
            return val === undefined || val === null ? "" : String(isScalar(val) ? val.value : val)
        }
    }

    /*  the URL and the token of the agent relay run by the process <pid> (once it persisted its
        runtime facts), where the certificate verification is skipped on request (<insecure>) or
        on a loopback address (as a certificate rarely covers it), else null  */
    private relayUrl (pid: number, insecure: boolean): { url: string, token: string } | null {
        const scalar = this.relayConfig()
        if (scalar("pid") !== String(pid))
            return null
        const host = connectHost(scalar("address") || DEFAULT_ADDRESS)
        const tls  = scalar("tls.cert") !== ""
        const url  = `${tls ? "ases" : "ase"}://${host}:${scalar("port")}` +
            (tls && (insecure || isLoopback(host.replace(/^\[|\]$/g, ""))) ? "?insecure" : "")
        return { url, token: scalar("token") }
    }

    /*  supervise the fleet: start the agent relay (if any) and, reporting to it, all agents,
        each as its own child process, and restart each one exited with an exponential backoff,
        until a terminating signal arrives, which stops first all agents and then the relay  */
    private async supervise (file: string, plan: FleetPlan): Promise<number> {
        const stateFile = path.join(processDir(), "fleet.yaml")
        const entry     = fileURLToPath(new URL("./ase.js", import.meta.url))
        const start     = await pidStart(process.pid)
        const member    = (name: string, kind: string, args: string[], env: Record<string, string> = {}): FleetMember =>
            ({ name, kind, args, env, child: null, start: "", since: 0, delay: RESTART_MIN_MS, restarts: 0, timer: undefined, signalled: false })
        const members: FleetMember[] = [
            ...(plan.relay !== null ? [ member("relay", "relay", [ "agent", "relay", "start", "-f", ...plan.relay.args ],
                plan.relay.token !== null ? { ASE_AGENT_RELAY_TOKEN: plan.relay.token } : {}) ] : []),
            ...plan.agents.map((agent) => member(agent.name, agent.kind, [ "agent", agent.kind, "start", "-f", ...agent.args ]))
        ]
        let ready    = false
        let stopping = false

        /*  prefix each line in the shared log with the name of the fleet resp. of the member
            writing it (colored on a terminal only), where each member gets its prefix passed
            through the environment (as it writes into the shared log on its own)  */
        const width   = Math.max(...[ "fleet", ...members.map((m) => m.name) ].map((name) => name.length))
        const colored = process.stderr.isTTY === true
        this.log.prefix(logPrefix("fleet", width, colored))
        this.log.write("info", `${this.label}: starting (process ${process.pid}) with configuration "${file}"`)

        const save = () => {
            writeState(stateFile, {
                pid: process.pid, start, config: file, ready,
                members: Object.fromEntries(members.map((m) =>
                    [ m.name, { kind: m.kind, pid: m.child?.pid ?? null, start: m.start, restarts: m.restarts } ]))
            } satisfies FleetState)
        }

        /*  terminate the members in order: first all agents, then the agent relay (as the agents
            remove their presence from it on their termination), and finish once all are gone  */
        let finish = (_code: number) => {}
        const finished = new Promise<number>((resolve) => { finish = resolve })
        const proceed = () => {
            const agents  = members.filter((m) => m.kind !== "relay" && m.child !== null)
            const pending = agents.length > 0 ? agents : members.filter((m) => m.child !== null)
            for (const m of pending)
                if (!m.signalled) {
                    m.signalled = true
                    m.child!.kill("SIGTERM")
                }
            if (pending.length === 0) {
                fs.rmSync(stateFile, { force: true })
                this.log.write("info", `${this.label}: terminated`)
                finish(0)
            }
        }

        /*  stop the fleet on a terminating signal, where a repeated signal is forwarded
            to all remaining members (terminating the agents at once, see "ase agent")  */
        const shutdown = (signal: string) => {
            if (stopping) {
                this.log.write("warning", `${this.label}: interrupted again (received ${signal}) -- forwarding it to the members`)
                for (const m of members)
                    m.child?.kill("SIGTERM")
                return
            }
            stopping = true
            this.log.write("info", `${this.label}: interrupted (received ${signal})`)
            for (const m of members)
                clearTimeout(m.timer)
            proceed()
        }
        process.on("SIGTERM", () => shutdown("SIGTERM"))
        process.on("SIGINT",  () => shutdown("SIGINT"))
        process.on("SIGHUP",  () => shutdown("SIGHUP"))
        process.on("SIGQUIT", () => shutdown("SIGQUIT"))

        /*  schedule the restart of an exited member (with a delay doubled on each restart
            in a row up to its maximum, and reset once it ran stable)  */
        const restart = (m: FleetMember, reason: string) => {
            if (Date.now() - m.since >= STABLE_MS)
                m.delay = RESTART_MIN_MS
            this.log.write("warning", `${this.label}: ${m.name} ${reason} -- restarting it in ${m.delay / 1000}s`)
            m.timer = setTimeout(() => {
                m.restarts++
                this.log.write("info", `${this.label}: restarting ${m.name} (restart #${m.restarts})`)
                launch(m)
            }, m.delay)
            m.delay = Math.min(m.delay * 2, RESTART_MAX_MS)
        }

        /*  launch a member as a child process in its own process group (so an interrupt in
            the terminal reaches the fleet only, which terminates its members in order), sharing
            the output of the fleet, and, after the initial startup of all members, restart it
            whenever it exits, until the fleet is stopped (a member exiting during the initial
            startup of the others is restarted once the fleet is ready)  */
        const launch = (m: FleetMember): ChildProcess => {
            const child = spawn(process.execPath, [ entry, "-l", this.log.logLevel(), ...m.args ], {
                detached: true,
                stdio:    [ "ignore", "inherit", "inherit" ],
                env:      { ...process.env, ...m.env, ASE_LOG_PREFIX: logPrefix(m.name, width, colored) }
            })
            m.child     = child
            m.start     = ""
            m.since     = Date.now()
            m.timer     = undefined
            m.signalled = false
            pidStart(child.pid ?? 0).then((start) => {
                if (m.child === child) {
                    m.start = start
                    save()
                }
            }).catch(() => {})
            child.on("error", (err) =>
                this.log.write("error", `${this.label}: ${m.name} failed (${err.message})`))
            child.once("exit", (code, signal) => {
                m.child = null
                m.start = ""
                if (stopping) {
                    proceed()
                    return
                }
                if (ready)
                    restart(m, `exited (${signal ?? `code ${code}`})`)
                else
                    this.log.write("warning", `${this.label}: ${m.name} exited (${signal ?? `code ${code}`}) ` +
                        "during the startup of the fleet")
                save()
            })
            save()
            return child
        }

        /*  start the agent relay first (if any), as the agents report to it, and then all
            agents, awaiting the successful startup of each one, where the agents get the URL
            of the agent relay and, through the environment, its actual token (as they would
            otherwise resolve one on their own, potentially deviating from it)  */
        let failure: string | null = null
        let target:  { url: string, token: string } | null = null
        const relay = members.find((m) => m.kind === "relay")
        if (relay !== undefined) {
            const child = launch(relay)
            const fail  = await this.awaitChild(child,
                () => (target = this.relayUrl(child.pid!, plan.relay?.insecure ?? false)) !== null, RELAY_STARTUP_MS)
            if (fail !== null)
                failure = `relay ${fail}`
        }
        if (failure === null && !stopping) {
            const agents = members.filter((m) => m.kind !== "relay")
            const fails  = await Promise.all(agents.map((m) => {
                if (target !== null) {
                    m.args.push("--agent-relay", target.url)
                    if (target.token !== "")
                        m.env.ASE_AGENT_RELAY_TOKEN = target.token
                }
                const child = launch(m)
                const state = path.join(processDir(), `${m.name}.yaml`)
                return this.awaitChild(child, () => readState(state)?.pid === child.pid, AGENT_STARTUP_MS)
                    .then((fail) => fail !== null ? `${m.name} ${fail}` : null)
            }))
            failure = fails.find((fail) => fail !== null) ?? null
        }

        /*  on a failed startup stop all members again  */
        if (failure !== null && !stopping) {
            stopping = true
            proceed()
            await finished
            throw new Error(`${this.label}: ${failure}`)
        }
        if (!stopping) {
            ready = true
            for (const m of members)
                if (m.child === null && m.timer === undefined)
                    restart(m, "exited during the startup of the fleet")
            save()
            this.log.write("info", `${this.label}: started ${members.map((m) => m.name).join(", ")}`)
        }
        return finished
    }

    /*  stop the orphaned members of a fleet whose process is gone without stopping them (e.g.
        killed by SIGKILL, as the members run in their own process groups), in order: first all
        agents, then the agent relay, where a member counts as orphaned only if its own process
        state (resp. the per-user relay configuration) still records the process of the fleet
        state (and, if recorded, the process still has the start time recorded in the fleet state,
        so a process id reused meanwhile by an unrelated process does not count), and resolve
        to the names of the stopped members  */
    private async reap (state: FleetState): Promise<string[]> {
        const dir     = processDir()
        const members = Object.entries(state.members ?? {}).flatMap(([ name, m ]) =>
            m.pid !== null ? [ { name, kind: m.kind, pid: m.pid, start: m.start ?? "" } ] : [])
        const stopped: string[] = []
        await Promise.all(members.filter((m) => m.kind !== "relay").map(async (m) => {
            const file  = path.join(dir, `${m.name}.yaml`)
            const agent = readState(file)
            if (agent === null || agent.pid !== m.pid || !(await stateAlive(agent)))
                return
            this.log.write("info", `${this.label}: stopping orphaned ${m.name} (process ${m.pid})`)
            if (await this.terminate(m.pid, 5 * 60 * 1000))
                stopped.push(m.name)
            fs.rmSync(file, { force: true })
        }))
        const relay = members.find((m) => m.kind === "relay")
        if (relay !== undefined && Number(this.relayConfig()("pid")) === relay.pid
            && await stateAlive({ pid: relay.pid, start: relay.start })) {
            this.log.write("info", `${this.label}: stopping orphaned ${relay.name} (process ${relay.pid})`)
            if (await this.terminate(relay.pid, 5000))
                stopped.push(relay.name)
        }
        return stopped
    }

    /*  init flow: create the initial configuration file for a task lifecycle model (default:
        the configured one), validated like on start, where an already existing configuration
        file is overwritten only on request  */
    private async doInit (opts: { config?: string, tool?: string, lifecycle?: string, force?: boolean }): Promise<number> {
        const file = path.resolve(opts.config ?? path.join(path.dirname(processDir()), "fleet.yaml"))
        const tool = opts.tool ?? agentDefaults().tool
        if (![ "claude", "copilot", "codex" ].includes(tool))
            throw new Error(`${this.label}: invalid agent tool "${tool}" (expected "claude", "copilot", or "codex")`)
        let lifecycle = opts.lifecycle
        if (lifecycle === undefined) {
            const cfg = new Config("config", configSchema, this.log)
            cfg.read()
            const value = cfg.get("project.task.lifecycle")
            lifecycle = String((isScalar(value) ? value.value : value) ?? "") || "solo"
        }
        if (!Object.hasOwn(initPlanned, lifecycle))
            throw new Error(`${this.label}: invalid task lifecycle model "${lifecycle}" ` +
                "(expected \"solo\", \"team\", or \"enterprise\")")
        if (fs.existsSync(file) && !opts.force)
            throw new Error(`${this.label}: configuration "${file}" already exists (overwrite it with "--force")`)
        const text = initConfig(tool, lifecycle)
        await this.load(file, text)
        fs.mkdirSync(path.dirname(file), { recursive: true })
        fs.writeFileSync(file, text, "utf8")
        this.log.write("info", `${this.label}: created configuration "${file}" for task lifecycle model "${lifecycle}" ` +
            `(start the fleet with "ase agent fleet start${opts.config !== undefined ? ` -c ${opts.config}` : ""}")`)
        return 0
    }

    /*  start flow: validate the configuration and detach the fleet (or run it in the foreground or as the detached process)  */
    private async doStart (opts: { config?: string, foreground?: boolean }): Promise<number> {
        const dir       = processDir()
        const stateFile = path.join(dir, "fleet.yaml")
        const file      = path.resolve(opts.config ?? path.join(path.dirname(dir), "fleet.yaml"))
        const serve     = process.env[SERVE_ENV] === "1"
        Reflect.deleteProperty(process.env, SERVE_ENV)

        /*  validate the configuration, where the fleet runs in the foreground
            if requested either on the command line or in the configuration  */
        const plan       = await this.load(file)
        const foreground = opts.foreground === true || plan.foreground

        /*  idempotent start: an already running fleet is left alone  */
        const state = readState<FleetState>(stateFile)
        if (state !== null && await stateAlive(state)) {
            if (foreground || serve)
                throw new Error(`${this.label}: already running (pid ${state.pid}) (stop it first with "ase agent fleet stop")`)
            this.log.write("info", `${this.label}: already running (pid ${state.pid})`)
            return 0
        }

        /*  stop the orphaned members of a fleet gone without stopping them,
            as they would block the startup of the members of the same names  */
        if (state !== null) {
            await this.reap(state)
            fs.rmSync(stateFile, { force: true })
        }

        /*  the per-user agent relay is owned by the fleet and hence
            must not run already (e.g. started standalone or by another fleet)  */
        if (plan.relay !== null) {
            const pid = Number(this.relayConfig()("pid"))
            if (pidAlive(pid))
                throw new Error(`${this.label}: agent relay already running (pid ${pid}) ` +
                    "(stop it first with \"ase agent relay stop\", or remove the section \"relay\")")
        }

        /*  spawn the fleet detached, logging into its log file, and await the startup of all its members  */
        if (!foreground && !serve) {
            const logFile = path.join(dir, "fleet.log")
            const child   = this.spawnDetached([ "-l", this.log.logLevel(), "agent", "fleet", "start", "-c", file ],
                { [SERVE_ENV]: "1" }, logFile)
            await this.awaitDetached(child, logFile, () => {
                const s = readState<FleetState>(stateFile)
                return s !== null && s.pid === child.pid && s.ready
            }, RELAY_STARTUP_MS + AGENT_STARTUP_MS + 10 * 1000)
            this.log.write("info", `${this.label}: started (pid ${child.pid}), logging to "${logFile}"`)
            return 0
        }

        /*  run the fleet in this process  */
        return this.supervise(file, plan)
    }

    /*  status flow: report whether the fleet is running, and the state of its members  */
    private async doStatus (): Promise<number> {
        const state = readState<FleetState>(path.join(processDir(), "fleet.yaml"))
        if (state === null || !(await stateAlive(state))) {
            await writeStdout(`${this.label}: not running\n`)
            return 1
        }
        await writeStdout(`${this.label}: running (pid ${state.pid}, configuration "${state.config}")` +
            (state.ready ? "" : ", starting up") + "\n" +
            Object.entries(state.members ?? {}).map(([ name, m ]) =>
                `  ${name} (${m.kind}): ${m.pid !== null ? `running (pid ${m.pid})` : "awaiting its restart"}` +
                (m.restarts > 0 ? `, restarted ${m.restarts} times` : "") + "\n").join(""))
        return 0
    }

    /*  stop flow: terminate the fleet process and wait until it (and hence all its members) is gone,
        or, with the fleet process already gone, stop its orphaned members  */
    private async doStop (): Promise<number> {
        const stateFile = path.join(processDir(), "fleet.yaml")
        const state     = readState<FleetState>(stateFile)
        if (state === null || !(await stateAlive(state))) {
            const stopped = state !== null ? await this.reap(state) : []
            this.log.write("info", `${this.label}: not running` +
                (stopped.length > 0 ? ` (stopped its orphaned members ${stopped.join(", ")})` : ""))
            fs.rmSync(stateFile, { force: true })
            return 0
        }
        if (await this.terminate(state.pid, 5 * 60 * 1000))
            this.log.write("info", `${this.label}: stopped (process ${state.pid})`)
        else
            this.log.write("info", `${this.label}: not running (process ${state.pid} already gone)`)
        fs.rmSync(stateFile, { force: true })
        return 0
    }

    /*  register the CLI sub-command group and its commands
        "init", "start", "status", "log", and "stop" below the CLI command <parent>  */
    register (parent: Command): void {
        const group = this.group(parent)

        /*  register CLI sub-command "init"  */
        group
            .command("init")
            .description("Create the initial configuration file for a task lifecycle model, " +
                "with the agent relay, the edit request agent, and the effort estimation agent, " +
                "plus the four phase agents for \"enterprise\" resp. an ad-hoc implementation agent for \"team\"")
            .option("-c, --config <file>", "YAML configuration file to create (default: \".ase/fleet.yaml\")")
            .option("-t, --tool <tool>", "agent tool of all agents (\"claude\", \"copilot\", or \"codex\"; " +
                "default: $ASE_TOOL, else \"claude\")")
            .option("--lifecycle <model>", "task lifecycle model (\"solo\", \"team\", or \"enterprise\"; " +
                "default: configured \"project.task.lifecycle\")")
            .option("--force", "overwrite an already existing configuration file")
            .action(async (opts: { config?: string, tool?: string, lifecycle?: string, force?: boolean }) => {
                process.exitCode = await this.doInit(opts)
            })

        /*  register CLI sub-command "start"  */
        group
            .command("start")
            .description("Start the fleet of the configuration file in the background " +
                "(idempotent if already running) or in the foreground")
            .option("-c, --config <file>", "YAML configuration file with the optional section \"fleet\" " +
                "(options of the fleet itself), the optional section \"relay\" (options of \"ase agent relay start\"), " +
                "the optional section \"default\" (default options of all agents), " +
                "and one section per agent, named by the agent name, with the agent options and an optional " +
                "\"kind\" (default: the section name) (default: \".ase/fleet.yaml\")")
            .option("-f, --foreground", "run the fleet in the foreground, logging to the terminal, " +
                "until it is interrupted or stopped (default: option \"foreground\" of section \"fleet\")")
            .action(async (opts: { config?: string, foreground?: boolean }) => {
                process.exitCode = await this.doStart(opts)
            })

        /*  register CLI sub-command "status"  */
        group
            .command("status")
            .description("Report whether the fleet is running, and the state of its members")
            .action(async () => {
                process.exitCode = await this.doStatus()
            })

        /*  register CLI sub-command "log" (of the fleet and all its members,
            each line prefixed with their name, where the name and the level tag
            are colored on a terminal only)  */
        this.registerLog(group, () => path.join(processDir(), "fleet.log"), undefined,
            process.stdout.isTTY === true ?
                (line) => line
                    .replace(logLevelRe, (_match, head: string, level: string) =>
                        `${head}${this.log.tag(level.toLowerCase() as LogLevel, true)}`)
                    .replace(logPrefixRe, (_match, name: string, sep: string) => `${tint(name)}${sep}`) :
                undefined)

        /*  register CLI sub-command "stop"  */
        group
            .command("stop")
            .description("Stop the fleet with all its members")
            .action(async () => {
                process.exitCode = await this.doStop()
            })
    }
}

