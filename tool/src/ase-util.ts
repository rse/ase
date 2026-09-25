/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import { Command } from "commander"

/*  CLI command "ase util"  */
export default class UtilCommand {
    /*  register command  */
    register (program: Command): Command {
        /*  register CLI top-level command "ase util"  */
        const util = program
            .command("util")
            .description("Utility commands (meta, compat, diagram, worktree, mint, metric)")
            .action(() => {
                util.outputHelp()
                process.exit(1)
            })
        return util
    }
}

