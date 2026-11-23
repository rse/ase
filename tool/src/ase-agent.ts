/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import type { Command }                  from "commander"

import type Log                          from "./ase-lib-log.js"
import { builtinKinds, discoverKinds }   from "./ase-agent-definition-loader.js"
import AgentAdhoc, { AgentBuiltin, AgentOfDefinition } from "./ase-agent-runtime-engine.js"
import type { DefinedAgent }             from "./ase-agent-runtime-engine.js"
import AgentProcessCommand               from "./ase-agent-process.js"
import AgentRelayCommand                 from "./ase-agent-relay-server-cli.js"
import AgentFleetCommand                 from "./ase-agent-fleet.js"

/*  CLI command "ase agent"  */
export default class AgentCommand {
    constructor (private log: Log) {}

    /*  register command  */
    register (program: Command): void {
        /*  the available agent kinds, each with the creation of a fresh agent: the built-in
            kinds (each the agent of its declarative definitions), the ad-hoc kind, and the
            definition kinds of the user and the project (see below)  */
        const kinds = new Map<string, () => DefinedAgent>([
            ...builtinKinds.map((spec) => () => new AgentBuiltin(this.log, spec)),
            () => new AgentAdhoc(this.log)
        ].map((create) => [ create().kind, create ]))

        /*  register CLI top-level command "ase agent"  */
        const cmd = program
            .command("agent")
            .description("Autonomous agents driving the task lifecycle phases (implementer, qualifier, integrator), " +
                "rebooting, condensing, and grilling the plans of tasks (rebooter, condenser, griller), " +
                "processing the edit requests of tasks (editor), estimating the effort of tasks (estimator), " +
                "researching the plans and topics of tasks (researcher), " +
                "or of the definitions of the user or the project " +
                "(\".ase/agents/<kind>.{yaml,ts,js}\") or given ad-hoc (adhoc), " +
                "each running in its own process, individually or as a fleet, optionally reporting to the agent relay")
            .action(() => {
                cmd.outputHelp()
                process.exit(1)
            })

        /*  register CLI sub-command groups "ase agent <kind>" (of the built-in and
            the ad-hoc kinds), "ase agent relay", and "ase agent fleet"  */
        for (const create of kinds.values())
            new AgentProcessCommand(this.log, create(), kinds).register(cmd)
        new AgentRelayCommand(this.log).register(cmd)
        new AgentFleetCommand(this.log, kinds).register(cmd)

        /*  register CLI sub-command groups "ase agent <kind>" of the definition kinds of
            the user and the project on the dispatch of "ase agent" only, as their discovery
            scans the file system, where a definition kind replaces a built-in kind  */
        program.hook("preSubcommand", (_program, sub) => {
            if (sub !== cmd)
                return
            const commands = cmd.commands as Command[]
            for (const spec of discoverKinds(this.log, [ "adhoc", "relay", "fleet" ])) {
                const shadowed = commands.findIndex((command) => command.name() === spec.kind)
                const create   = () => new AgentOfDefinition(this.log, spec, shadowed >= 0)
                kinds.set(spec.kind, create)
                if (shadowed >= 0)
                    commands.splice(shadowed, 1)
                new AgentProcessCommand(this.log, create(), kinds).register(cmd)
                if (shadowed >= 0)
                    commands.splice(shadowed, 0, commands.pop()!)
            }
        })
    }
}

