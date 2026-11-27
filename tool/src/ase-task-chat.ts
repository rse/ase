/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import { Command }      from "commander"

import type Log         from "./ase-lib-log.js"
import { parseTool }    from "./ase-setup-common.js"
import { runChat }      from "./ase-task-chat-core.js"

/*  CLI sub-command "ase task chat"  */
export default class TaskChatCommand {
    constructor (private log: Log) {}

    /*  register CLI sub-command "ase task chat"  */
    register (task: Command): void {
        /*  default for --tool derived from ASE_TOOL environment variable
            (validated lazily by "parseTool" in the action, so an invalid
            value cannot break unrelated "ase" commands at startup)  */
        const envTool  = process.env.ASE_TOOL ?? ""
        const toolDflt = envTool !== "" ? envTool : "claude"

        task
            .command("chat")
            .description("Chat with the agent tool about a task, resuming the session of the task; " +
                "<id> defaults to $ASE_TASK_ID")
            .option("-t, --tool <tool>",
                "agent tool to chat with (\"claude\"; \"copilot\" and \"codex\" are unsupported)", toolDflt)
            .argument("[<id>]", "Task identifier")
            .action(async (arg: string | undefined, opts: { tool: string }) => {
                const tool = parseTool(opts.tool)
                if (!process.stdin.isTTY || !process.stdout.isTTY)
                    throw new Error("chat: requires a terminal on standard input and output")
                const id   = arg ?? process.env.ASE_TASK_ID ?? "default"
                const code = await runChat(id, tool)
                if (code !== 0) {
                    this.log.write("warning", `chat: agent tool ended with exit code ${code}`)
                    process.exitCode = code
                }
            })
    }
}

