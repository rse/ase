/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import { Option, type Command }     from "commander"

import type Log                     from "./ase-lib-log.js"
import type {
    AgentOpts, AgentJob, AgentSelection
}                                   from "./ase-agent-runtime-task.js"
import { Agent }                    from "./ase-agent-runtime.js"
import type { Identity }            from "./ase-agent-runtime-defined.js"
import { DefinedPhaseAgent, DefinedRequestAgent } from "./ase-agent-runtime-delegate.js"
import type { AgentRelayClient }    from "./ase-agent-relay-client.js"
import { definitionOptions }        from "./ase-agent-definition-schema.js"
import type { AgentKind, DefinitionKind } from "./ase-agent-definition-loader.js"
import { resolveDefinition }        from "./ase-agent-definition-core.js"
import type { ResolvedDefinition }  from "./ase-agent-definition-core.js"

/*  a follow-up option ("--followup-<field>"), whose values of all fields are collected into the
    single option value "followup" of the parsing command (so it can be shared by commands)  */
class FollowupOption extends Option {
    attributeName (): string {
        return "followup"
    }
}

/*  the agent of a definition: a facade to the phase or request agent of its definition,
    created on its setup (as the definition decides on the type of the agent), where
    the concrete facade resolves the definition and the identity of the agent  */
export abstract class DefinedAgent extends Agent {
    /*  the delegate agent of the definition (once set up)  */
    private delegate: Agent | null = null

    get name (): string {
        return this.delegate?.name ?? this.kind
    }
    get serialOnly (): boolean {
        return this.delegate?.serialOnly ?? this.serial
    }

    /*  resolve the definition and the identity of the agent of the given options  */
    protected abstract resolve (own: Partial<AgentOpts>, name: string): Promise<{ def: ResolvedDefinition, identity: Identity }>

    /*  register the options of the definitions (as flat long options), where the option
        "--definition" is registered only for an agent without a definition of its own, and
        where the fields of the follow-up prompts ("--followup-<field>") are collected in
        their given order into the single list "followup" (see "followupTokens")  */
    protected registerDefinitionOptions (cmd: Command, definition: boolean): void {
        for (const option of definitionOptions) {
            if (option.key === "definition" && !definition)
                continue
            const flags = (option.key === "definition" ? "-D, " : option.key === "model" ? "-M, " : "") + `--${option.key}` +
                (option.kind !== "flag" ? ` <${option.arg}>` : "")
            if (option.kind === "list")
                cmd.option(flags, option.desc, (value: string, prev?: string[]) => [ ...(prev ?? []), value ])
            else if (option.kind === "followup") {
                const field = option.key.replace(/^followup-/, "")
                cmd.addOption(new FollowupOption(flags, option.desc)
                    .argParser((value: string, prev?: string[]) => [ ...(prev ?? []), `${field}=${value}` ]))
            }
            else
                cmd.option(flags, option.desc)
        }
    }

    /*  the identity of an agent of a configured definition: its runs namespaced by its tag
        (so agents of different tags never affect each other), and announced with its
        assignee as its mode  */
    protected configured (def: ResolvedDefinition): Identity {
        const who = def.assign.name
        return { kind: this.kind, mode: who, runKind: def.tag.name.replace(/^ase-agent-/, "tag-"), role: who, suffix: who }
    }

    /*  the resolved definition of the agent named <name> of the given options  */
    async definition (own: Partial<AgentOpts>, name: string): Promise<ResolvedDefinition> {
        return (await this.resolve(own, name)).def
    }

    /*  validate the definition of the given options  */
    async validate (own: Partial<AgentOpts>): Promise<void> {
        await this.resolve(own, own.name ?? this.kind)
    }

    /*  set up the delegate agent of the definition of the given options  */
    async setup (global: AgentOpts, own: Partial<AgentOpts>, relay: AgentRelayClient | null = null): Promise<void> {
        const { def, identity } = await this.resolve(own, own.name ?? global.name ?? this.kind)
        const delegate = def.type === "phase" ?
            new DefinedPhaseAgent(this.log, def, identity) :
            new DefinedRequestAgent(this.log, def, identity)
        await delegate.setup(global, own, relay)
        this.delegate = delegate
    }

    /*  run the delegate agent  */
    async run (): Promise<void> {
        if (this.delegate === null)
            throw new Error(`agent: ${this.kind} agent not set up`)
        await this.delegate.run()
    }

    /*  the processing is done by the delegate agent only  */
    private unsupported (): never {
        throw new Error(`agent: ${this.kind} agent processes tasks through its delegate only`)
    }
    protected prepare (): Promise<AgentJob> {
        return this.unsupported()
    }
    protected select (): AgentSelection {
        return this.unsupported()
    }
    protected claim (): Promise<string | null> {
        return this.unsupported()
    }
    protected settle (): Promise<void> {
        return this.unsupported()
    }
    protected observing (): string {
        return this.unsupported()
    }
}

/*  agent "ase agent <kind>" of a built-in kind: the agent of the definition of the mode of
    "--mode" (if the kind has multiple modes), overridden by the given options, with the
    identity of the kind (its runs, its presence, and its agent-owned worktrees named after
    the kind, as its tags are)  */
export class AgentBuiltin extends DefinedAgent {
    readonly kind:                  string
    protected readonly description: string

    /*  the "--repo" and "--tempdir" options are registered only if any mode
        processes tasks in Git worktrees, and the tasks are processed serially
        only if all modes do so (see "serialOnly", e.g. for a fleet)  */
    protected readonly worktree:    boolean
    protected readonly serial:      boolean

    constructor (log: Log, private spec: AgentKind) {
        super(log)
        const modes      = Object.values(spec.modes)
        this.kind        = spec.kind
        this.description = spec.description
        this.worktree    = modes.some((mode) => (mode.workdir ?? "project") !== "project")
        this.serial      = modes.every((mode) => mode.serial === true)
    }

    /*  register the option "--mode" (with multiple modes only) and the options of the definitions  */
    protected options (cmd: Command): void {
        if (Object.keys(this.spec.modes).length > 1)
            cmd.option("-m, --mode <mode>", this.spec.modeDesc, this.spec.mode)
        this.registerDefinitionOptions(cmd, false)
    }

    /*  resolve the definition of the mode of "--mode", overridden by the given options  */
    protected async resolve (own: Partial<AgentOpts>, name: string): Promise<{ def: ResolvedDefinition, identity: Identity }> {
        const { kind, modes } = this.spec
        const mode = (own as { mode?: string }).mode ?? this.spec.mode
        if (!Object.hasOwn(modes, mode))
            throw new Error(`agent: ${name}: invalid mode "${mode}" ` +
                `(expected ${Object.keys(modes).map((m) => `"${m}"`).join(", ").replace(/, ([^,]+)$/, " or $1")})`)
        const def = await resolveDefinition({ ...own, definition: `builtin:${kind}-${mode}` }, name)
        return { def, identity: { kind, mode, runKind: kind, role: kind, suffix: kind } }
    }
}

/*  agent "ase agent <kind>" of a definition kind: the agent of the definition file of the
    user or the project (see "discoverKinds"), overridden by the given options, with the
    identity of its definition  */
export class AgentOfDefinition extends DefinedAgent {
    readonly kind:                  string
    protected readonly description: string

    /*  the "--repo" and "--tempdir" options are registered (but ignored with "--workdir project"),
        as the definition is not loaded before the start of the agent  */
    protected readonly worktree = true

    constructor (log: Log, private spec: DefinitionKind, shadows: boolean) {
        super(log)
        this.kind        = spec.kind
        this.description = `Run the agent of the ${spec.scope} definition "${spec.file}"` +
            (shadows ? ` (shadowing the built-in "${spec.kind}" agent)` : "") +
            ", overridden by the given options of the definition"
    }

    /*  register the options of the definitions  */
    protected options (cmd: Command): void {
        this.registerDefinitionOptions(cmd, false)
    }

    /*  resolve the definition of the definition file, overridden by the given options  */
    protected async resolve (own: Partial<AgentOpts>, name: string): Promise<{ def: ResolvedDefinition, identity: Identity }> {
        const def = await resolveDefinition({ ...own, definition: this.spec.file }, name)
        return { def, identity: this.configured(def) }
    }
}

/*  agent "ase agent adhoc": the agent of a definition given entirely by its options
    (optionally based on the definition of "--definition"), with the identity of its definition  */
export default class AgentAdhoc extends DefinedAgent {
    readonly kind = "adhoc"

    protected readonly description =
        "Run an ad-hoc agent, whose entire behavior is given by its options instead of a definition " +
        "file of its own: with \"--type phase\", claim every task in a \"--state-incoming\" status, " +
        "process it via the headless agent tool with a skill or a prompt text, tag it, and move it " +
        "into the state of its success or failure, or back into its previous one (or, with \"--unclaimed\", process it without " +
        "claiming it and just tag it), or, with \"--type request\", process the prompt " +
        "requests of \"--request-name\" attached to tasks in any status (see \"ase task request\"), " +
        "logging to stdout and to the \"agent\" attachment of the task"

    /*  the "--repo" and "--tempdir" options are registered (but ignored with "--workdir project")  */
    protected readonly worktree = true

    /*  register the options of the definitions (including "--definition")  */
    protected options (cmd: Command): void {
        this.registerDefinitionOptions(cmd, true)
    }

    /*  resolve the definition of the given options  */
    protected async resolve (own: Partial<AgentOpts>, name: string): Promise<{ def: ResolvedDefinition, identity: Identity }> {
        const def = await resolveDefinition(own as Record<string, unknown>, name)
        return { def, identity: this.configured(def) }
    }
}

