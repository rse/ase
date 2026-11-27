/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import fs                    from "node:fs"
import os                    from "node:os"
import path                  from "node:path"
import crypto                from "node:crypto"

import { execa }             from "execa"
import which                 from "which"
import lockfile              from "proper-lockfile"
import writeFileAtomic       from "write-file-atomic"
import YAML                  from "yaml"
import * as v                from "valibot"

import { userStateDir }      from "./ase-config-scope.js"
import { Task }              from "./ase-task.js"
import { toolSpecs }         from "./ase-setup-common.js"
import type { Tool }         from "./ase-setup-common.js"

/*  the per-tool interactive invocation of the agent tool in the session <session>, which is
    created under this id resp. (with <resume>) resumed, where the chat requires an agent tool
    letting the caller choose the id of a new session (null for the tools not supported yet)  */
const chatArgs: Record<Tool, ((session: string, resume: boolean) => string[]) | null> = {
    "claude":  (session, resume) => [ resume ? "--resume" : "--session-id", session ],
    "copilot": null,
    "codex":   null
}

/*  the sessions of the chats of the tasks of the current project (task id to session id),
    persisted in "chat/<project-id>.yaml" of the per-user state directory  */
const sessionsSchema = v.record(v.string(), v.string())
type Sessions = v.InferOutput<typeof sessionsSchema>

/*  update the sessions under a cross-process lock (as the chats of several tasks can start
    and end at once), failing on a corrupt state file instead of dropping all sessions  */
const sessions = async (fn: (known: Sessions) => void): Promise<Sessions> => {
    const file = path.join(userStateDir(), "chat", `${Task.projectIdOf(Task.projectRoot())}.yaml`)
    fs.mkdirSync(path.dirname(file), { recursive: true })

    /*  ensure the lockable file exists without truncating a concurrently written one  */
    fs.appendFileSync(file, "", "utf8")
    const release = await lockfile.lock(file, {
        retries: { retries: 50, minTimeout: 20, maxTimeout: 200 }
    })
    try {
        const before = fs.readFileSync(file, "utf8")
        let   known: Sessions
        try {
            known = v.parse(sessionsSchema, YAML.parse(before) ?? {})
        }
        catch (err: unknown) {
            throw new Error(`chat: invalid state file "${file}" (remove it to start new sessions for all tasks)`,
                { cause: err })
        }
        fn(known)
        const after = YAML.stringify(known)
        if (after !== before)
            writeFileAtomic.sync(file, after, { encoding: "utf8" })
        return known
    }
    finally {
        await release()
    }
}

/*  whether Claude Code saved the transcript of the session <session> (below the directory of any
    project of its configuration directory), as it does only with the first prompt, so a session
    without one cannot be resumed, but only created again under its id  */
const claudeSaved = (session: string): boolean => {
    const dir = path.join(process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), ".claude"), "projects")
    try {
        return fs.readdirSync(dir).some((project) => fs.existsSync(path.join(dir, project, `${session}.jsonl`)))
    }
    catch {
        return false
    }
}

/*  the variables of the environment not passed to the agent tool of a chat, as they belong to an
    agent tool session the chat was started from (e.g. through its shell, or through the ASE
    service started by its "ase mcp"): a copy of the keys of "writeEnvFile" of "ase hook
    session-start", so keep both in sync, the "ASE_SERVICE_*" ones of the ASE service, and the
    session markers Claude sets for its child processes and MCP servers plus the messaging channel
    of the session (as of Claude 2.1.332), with which a chat would run as a child session, which
    saves no transcript, and with the identity and messages of the starting session  */
const ENV_DROP = [
    "ASE_VERSION", "ASE_PLUGIN_ROOT", "ASE_USER_ID", "ASE_PROJECT_ID", "ASE_PROJECT_BOXING",
    "ASE_PROJECT_TASK_LIFECYCLE", "ASE_PROJECT_TASK_DEFAULT_SOURCE", "ASE_PROJECT_TASK_DEFAULT_CHANGESET",
    "ASE_PROJECT_TASK_DEFAULT_TARGET", "ASE_SPEC_BASEDIR", "ASE_SPEC_SCHEMA", "ASE_TASK_ID",
    "ASE_SESSION_ID", "ASE_HEADLESS", "ASE_AGENT_TOOL",
    "CLAUDECODE", "CLAUDE_CODE_SESSION_ID", "CLAUDE_CODE_CHILD_SESSION", "CLAUDE_CODE_SESSION_ATTENDED",
    "CLAUDE_CODE_CHILD_NOTES_DIR", "CLAUDE_CODE_STARTER_MAY_HOLD_CONNECTOR_FILE",
    "CLAUDE_CODE_LAUNCHED_BY_SESSION_IDS", "CLAUDE_CODE_CHROME_MCP_ORG_DENIED", "CLAUDE_CODE_ENTRYPOINT",
    "CLAUDE_CODE_SSE_PORT", "CLAUDE_CODE_MESSAGING_SOCKET", "CLAUDE_CODE_MESSAGING_TOKEN",
    "CLAUDE_PID", "CLAUDE_EFFORT", "CLAUDE_PROJECT_DIR", "CLAUDE_JOB_DIR",
    "CLAUDE_ENV_FILE", "CLAUDE_PLUGIN_ROOT", "CLAUDE_PLUGIN_DATA", "AI_AGENT", "TRACEPARENT"
]

/*  the environment of the agent tool of the chat about the task <id>: the own one without the
    variables above, with the task as the active task of its session (see "ase hook session-start")  */
export const chatEnv = (id: string): Record<string, string> => {
    const env = {} as Record<string, string>
    for (const [ key, value ] of Object.entries(process.env))
        if (value !== undefined && !ENV_DROP.includes(key) && !key.startsWith("ASE_SERVICE_"))
            env[key] = value
    return { ...env, ASE_TASK_ID: id }
}

/*  chat about the task <id> with the agent tool <tool> in the foreground, with the task as the
    active task of its session (see "chatEnv"), resuming the session of the task,
    else creating it, and return the exit code of the agent tool, where a session the agent tool
    failed with by itself is forgotten (but not one of an agent tool ended by a signal), so the
    next chat about the task starts a new session instead of failing again  */
export const runChat = async (id: string, tool: Tool): Promise<number> => {
    Task.validateId(id)
    const args = chatArgs[tool]
    if (args === null)
        throw new Error(`chat: agent tool "${tool}" is unsupported`)
    const cli = toolSpecs[tool].cli
    await which(cli).catch(() => {
        throw new Error(`chat: requires "${cli}", which was not found in $PATH`)
    })
    let   resume  = true
    const state   = await sessions((known) => {
        if (known[id] === undefined) {
            known[id] = crypto.randomUUID()
            resume    = false
        }
    })
    const session = state[id]
    if (resume && tool === "claude" && !claudeSaved(session))
        resume = false

    /*  run the agent tool in the project root, as it keeps its sessions per directory  */
    const result = await execa(cli, args(session, resume),
        { cwd: Task.projectRoot(), env: chatEnv(id), extendEnv: false, stdio: "inherit", reject: false })
    if (result.exitCode === undefined)
        return 1
    if (result.exitCode !== 0)
        await sessions((known) => {
            if (known[id] === session)
                Reflect.deleteProperty(known, id)
        })
    return result.exitCode
}

