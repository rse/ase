/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import { ofetch }                               from "ofetch"

import type Log                                 from "./ase-lib-log.js"
import { ptyAttach }                            from "./ase-lib-pty-client.js"
import type { Tool }                            from "./ase-setup-common.js"
import { serviceEnsure, serviceAuth, SERVICE_HOST } from "./ase-service.js"
import { Task }                                 from "./ase-task.js"

/*  the time the ASE service may take to start a chat, and the size of a terminal
    which does not tell its own (the usual default of terminals)  */
const START_MS  = 30 * 1000
const COLS_INIT = 80
const ROWS_INIT = 24

/*  chat about the task <id> with the agent tool <tool>: let the ASE service run the chat (started
    at the size of this terminal, unless it runs already), and attach this terminal to it, until the
    user detaches (resolving null) or the agent tool ends (resolving its exit code)  */
export const runChat = async (log: Log, id: string, tool: Tool): Promise<number | null> => {
    Task.validateId(id)
    const { port, token } = await serviceEnsure(log, "chat")
    const url     = `${SERVICE_HOST}:${port}/task-chat/${encodeURIComponent(id)}`
    const headers = serviceAuth(token)
    const res     = await ofetch.raw<{ error?: string }>(`http://${url}`, {
        method: "POST", headers, body: {
            tool,
            cols: process.stdout.columns > 0 ? process.stdout.columns : COLS_INIT,
            rows: process.stdout.rows    > 0 ? process.stdout.rows    : ROWS_INIT
        },
        ignoreResponseError: true, timeout: START_MS
    }).catch((err: unknown) => {
        throw new Error(`chat: ASE service not reachable on port ${port}`, { cause: err })
    })
    if (res.status === 404)
        throw new Error("chat: ASE service runs older ASE code without task chats " +
            "(restart it with \"ase service stop\" once no agent session uses it)")
    if (res.status !== 200)
        throw new Error(res._data?.error ?? `chat: ASE service failed (HTTP status ${res.status})`)
    return ptyAttach(`ws://${url}/pty`, headers, "chat")
}

