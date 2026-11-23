/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import fs                     from "node:fs"
import path                   from "node:path"
import crypto                 from "node:crypto"
import { spawn }              from "node:child_process"
import { fileURLToPath }      from "node:url"

import { ofetch }             from "ofetch"
import YAML                   from "yaml"
import writeFileAtomic        from "write-file-atomic"
import lockfile               from "proper-lockfile"

import type Log                         from "./ase-lib-log.js"
import { Config }                       from "./ase-config-core.js"
import { configSchema }                 from "./ase-config-schema.js"
import type { TokenCounts }             from "./ase-config-schema.js"
import { parseScope, userStateDir }     from "./ase-config-scope.js"

/*  the loopback host of the OTLP ingress and of the project services  */
export const HOST = "127.0.0.1"

/*  the default port of the OTLP ingress, and the timeout (in ms) of the detaching of a
    session by the session end hook (as Claude Code kills this hook after 1.5 seconds already)  */
const PORT_DFLT = 44318
const DETACH_MS = 500

/*  ==== telemetry configuration ====  */

/*  the id of the current user, the "oneself" of the task assignments  */
export const userId = (): string =>
    process.env.USER ?? process.env.LOGNAME ?? "unknown"

/*  whether the AI usage accounting is enabled as a whole ("telemetry.enabled", opt-in), i.e., the
    OTLP ingress, the usage windows of the task assignments, and the bookings of the
    "ase agent" jobs  */
export const telemetryEnabled = (log: Log): boolean => {
    const cfg = new Config("config", configSchema, log)
    cfg.read()
    return String(cfg.get("telemetry.enabled") ?? "false") === "true"
}

/*  whether the AI usage accounting implicitly accounts the active task of a session while
    the task is unassigned ("telemetry.implicit", opt-out), i.e., without the session
    explicitly assigning it to oneself  */
export const telemetryImplicit = (log: Log): boolean => {
    const cfg = new Config("config", configSchema, log)
    cfg.read()
    return String(cfg.get("telemetry.implicit") ?? "true") === "true"
}

/*  the OTLP ingress of the user: its base URL and its bearer token, where with <create>
    a missing token is generated and persisted on the user configuration scope
    (and without <create> a missing token is reported as empty)  */
export const telemetryEndpoint = (log: Log, create: boolean): { url: string, token: string } => {
    const cfg = new Config("config", configSchema, log)
    cfg.read()
    const port = Number(cfg.get("telemetry.service.port") ?? PORT_DFLT)
    let token  = String(cfg.get("telemetry.service.token") ?? "")
    if (token === "" && create) {
        token = crypto.randomBytes(24).toString("hex")
        const user = new Config("config", configSchema, log, parseScope("user"))
        user.lock(() => {
            user.read()
            user.set("telemetry.service.token", token)
            user.write()
        })
    }
    return { url: `http://${HOST}:${port}`, token }
}

/*  ==== telemetry state ====  */

/*  the accumulated, not yet booked usage of a window: AI request time, human time (the
    whole real time of the window, as the engineer costs money even while waiting for the
    AI), and real (wall-clock) time (in ms), the token counts, and the AI and human costs
    (in USD, the human costs being in addition to the AI costs)  */
export type Usage = TokenCounts & { aiMs: number, hrMs: number, realMs: number, costAI: number, costHR: number }

/*  a usage window of a task: the task id, the assignee being "oneself", its opening and
    closing time (null while open), the time up to which its real time is accounted, the
    time of its last activity (its opening, a session attaching, or a usage record), its
    attached sessions (each with its attachment interval, "until" being null while
    attached, and whether it is attached only implicitly, i.e., just as long as the
    unassigned task stays the active task of the session), its not yet booked usage, its
    time of the last booking, the number of records it received, and the time its task
    was first found vanished on a booking (if not found since then)  */
export type UsageWindow = {
    task: string, self: string, opened: number, closed: number | null, realFrom: number, active: number,
    attach: { session: string, from: number, until: number | null, implicit?: boolean }[],
    unbooked: Usage, booked: number, records: number, missing?: number
}

/*  the persistent journal of the usage windows of a project, plus the recently counted
    record keys (de-duplicating re-sent batches)  */
export type UsageJournal = { windows: UsageWindow[], seen: string[] }

/*  the per-user session registry entry: the root directory and id of the project
    whose service owns the usage window the session is attached to, and the time
    the session ended (if its end could not be reported to this service)  */
export type SessionEntry = { root: string, project: string, ended?: number }

/*  the per-user telemetry state, shared by the services of all projects: the session
    registry, keyed by session, and the journals of the projects, keyed by project  */
export type TelemetryState = { session?: Record<string, SessionEntry>, booked?: Record<string, UsageJournal> }

/*  the per-user telemetry state file, shared by the services of all projects, holding
    the session registry under its "session" field and the journals of the usage windows
    under its "booked" field  */
export const stateFile = (): string =>
    path.join(userStateDir(), "telemetry.json")

/*  read the telemetry state file (an empty or missing file being an empty state)  */
export const readState = (file = stateFile()): TelemetryState => {
    const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : ""
    return text.trim() !== "" ? JSON.parse(text) as TelemetryState : {}
}

/*  the session registry entry of a session (or undefined if not registered)  */
export const sessionEntry = (session: string): SessionEntry | undefined =>
    readState().session?.[session]

/*  ==== project services ====  */

/*  send a request to the service of the project of a root directory
    (whose port and bearer token are persisted in its ".ase/service.yaml")  */
export const request = async (root: string, endpoint: string, body: Record<string, unknown>, timeout = 30 * 1000): Promise<unknown> => {
    const file  = path.join(root, ".ase", "service.yaml")
    const info  = YAML.parse(fs.readFileSync(file, "utf8")) as { port?: unknown, token?: unknown } | null
    const port  = Number(info?.port)
    const token = typeof info?.token === "string" ? info.token : null
    if (!Number.isInteger(port))
        throw new Error(`no service port in "${file}"`)
    return ofetch(`http://${HOST}:${port}${endpoint}`, {
        method:  "POST",
        headers: token !== null ? { Authorization: `Bearer ${token}` } : {},
        body,
        timeout
    })
}

/*  detach a session from its usage window through the owning project service (used by the
    session end hook, within its tight time limit), if the session is registered at all: for
    a service which is not reachable in time (e.g. as it crashed or got stopped), the session
    end is noted in the session registry instead, and the service is started in the
    background (without awaiting it), which then detaches the session as of its noted end,
    as otherwise the window stays open until it is closed for inactivity  */
export const detachRemote = async (session: string): Promise<void> => {
    const entry = sessionEntry(session)
    if (entry === undefined)
        return
    await request(entry.root, "/usage/detach", { session }, DETACH_MS).catch(async () => {
        const file    = stateFile()
        const release = await lockfile.lock(file, {
            retries: { retries: 5, minTimeout: 20, maxTimeout: 100 }
        })
        let root: string
        try {
            const state = readState(file)
            const noted = state.session?.[session]
            if (noted === undefined)
                return
            noted.ended = Date.now()
            root = noted.root
            writeFileAtomic.sync(file, JSON.stringify(state, null, 4) + "\n")
        }
        finally {
            await release()
        }
        const cli = fileURLToPath(new URL("./ase.js", import.meta.url))
        spawn(process.execPath, [ cli, "service", "start" ], { cwd: root, detached: true, stdio: "ignore" }).unref()
    })
}

/*  report the rename of a task to the service of the project of a root directory (used
    by every rename through "Task.rename"), if a service of the project runs at all  */
export const renameRemote = async (root: string, oldId: string, newId: string): Promise<void> => {
    if (!fs.existsSync(path.join(root, ".ase", "service.yaml")))
        return
    await request(root, "/usage/rename", { old: oldId, new: newId })
}

