/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import crypto                       from "node:crypto"
import fs                           from "node:fs"
import os                           from "node:os"
import path                         from "node:path"

import lockfile                     from "proper-lockfile"

import type Log                     from "./ase-lib-log.js"
import { Task }                     from "./ase-task.js"
import { userStateDir }             from "./ase-config-scope.js"
import { pidAlive, pidStart }       from "./ase-agent-runtime-exec.js"

/*  the duration after which the run lock of a terminated agent process counts as stale  */
const runStale = 30 * 1000

/*  the identity of the per-user state directory on this host, which holds the run locks,
    so only the runs of the same user (and home directory) on the same host are recovered  */
export const runOwner = crypto.createHash("sha1")
    .update(`${os.hostname()}\n${userStateDir()}`).digest("hex").slice(0, 12)

/*  a claim of a task recorded for a run: the name and the tag of the claiming agent,
    the previous assignee of the task, and its previous status (absent in the records
    of older runs and for a task processed unclaimed)  */
export type RunClaim = { name: string, tag: string, assignee: string, status?: string }

/*  the record of a run: its process id, the start time and host of the process, and its claims  */
type RunRecord = { pid: number, start: string, host: string, claims: Record<string, RunClaim> }

/*  the run of an agent process of a kind, guarded by a run lock in the per-user state
    directory (hence per host and user), below a sub-directory per task store (as the
    recorded task ids are unique per task store only, so no run of another project is
    ever recovered against the wrong tasks), and recording the process id and the claims
    of the tasks processed by it, so the agents of the same kind started later for the
    same task store can recover the tasks left behind by the terminated runs (whose process
    is no longer alive, where the recorded start time of the process guards against a process
    id reused meanwhile by another process, resp. whose run lock is gone or stale, if the
    process is unverifiable)  */
export class AgentRun {
    readonly id = crypto.randomUUID()
    private unlock: (() => Promise<void>) | null = null
    private claims = new Map<string, RunClaim>()
    private seized = new Map<string, () => Promise<void>>()
    private start  = ""
    private _dir   = ""

    constructor (private log: Log, private kind: string) {}

    /*  the directory of the runs of the agent kind for the task store, and the files of a run  */
    private get dir (): string {
        if (this._dir === "")
            this._dir = path.join(userStateDir(), `agent-${this.kind}`,
                crypto.createHash("sha1").update(Task.storeKey(this.log)).digest("hex").slice(0, 12))
        return this._dir
    }
    private file (run: string, ext = ""): string {
        return path.join(this.dir, `${run}${ext}`)
    }

    /*  the record (process id, its start time, its host, and claims) of a run  */
    private record (run: string): RunRecord {
        try {
            const data   = JSON.parse(fs.readFileSync(this.file(run, ".json"), "utf8")) as { pid?: unknown, start?: unknown, host?: unknown, claims?: unknown }
            const claims = data.claims !== null && typeof data.claims === "object" && !Array.isArray(data.claims) ?
                data.claims as Record<string, RunClaim> : {}
            return { pid: Number(data.pid ?? 0), start: String(data.start ?? ""), host: String(data.host ?? ""), claims }
        }
        catch (_err) {
            return { pid: 0, start: "", host: "", claims: {} }
        }
    }

    /*  save the record of a run (atomically)  */
    private store (run: string, record: RunRecord): void {
        const file = this.file(run, ".json")
        fs.writeFileSync(`${file}.tmp`, JSON.stringify(record))
        fs.renameSync(`${file}.tmp`, file)
    }
    private save (): void {
        this.store(this.id, { pid: process.pid, start: this.start, host: os.hostname(), claims: Object.fromEntries(this.claims) })
    }

    /*  acquire the run lock (refreshed periodically, where a compromised one, e.g. one
        removed as stale while this process was suspended, is reported instead of thrown)  */
    async acquire (): Promise<void> {
        fs.mkdirSync(this.dir, { recursive: true })
        this.start  = await pidStart(process.pid)
        this.unlock = await lockfile.lock(this.file(this.id), {
            realpath: false, stale: runStale, update: runStale / 3,
            onCompromised: (err: Error) => {
                this.log.write("warning", `agent: run lock of ${this.kind} compromised: ${err.message}`)
            }
        })
        this.save()
    }

    /*  release the run lock (and the run locks of the terminated runs still seized), and remove
        the record of this run, unless it still records claims (to be recovered by a later run)  */
    async release (): Promise<void> {
        for (const run of [ ...this.seized.keys() ])
            await this.free(run)
        if (this.unlock === null)
            return
        await this.unlock().catch(() => {})
        this.unlock = null
        if (this.claims.size === 0)
            fs.rmSync(this.file(this.id, ".json"), { force: true })
    }

    /*  whether a run is alive: this run, or a run whose process (by its given process id of
        this host, or its recorded one if recorded on this host) is provably alive (by its
        recorded start time, so a reused process id does not count), where a provably dead one
        is never alive, and else (an unverifiable process) its still held run lock decides  */
    async alive (run: string, pid = 0): Promise<boolean> {
        if (run === "")
            return false
        else if (run === this.id)
            return true
        const record = this.record(run)
        const id     = pid > 0 ? pid : record.pid
        const start  = id === record.pid ? record.start : ""
        if (id > 0 && (pid > 0 || record.host === os.hostname())) {
            if (!pidAlive(id))
                return false
            const now = start !== "" ? await pidStart(id) : ""
            if (start !== "" && now !== "")
                return now === start
        }
        return lockfile.check(this.file(run), { realpath: false, stale: runStale }).catch(() => false)
    }

    /*  the runs of the agent kind for the task store (by their run lock or record)  */
    private runs (): string[] {
        return [ ...new Set(fs.readdirSync(this.dir)
            .filter((entry) => /\.(?:lock|json)$/.test(entry))
            .map((entry) => entry.replace(/\.(?:lock|json)$/, ""))) ]
    }

    /*  the terminated runs of the agent kind for the task store  */
    async dead (): Promise<string[]> {
        const dead: string[] = []
        for (const run of this.runs())
            if (!(await this.alive(run)))
                dead.push(run)
        return dead
    }

    /*  seize a terminated run for its recovery, by its own seize lock (as its run lock might
        still be fresh), so the agents started concurrently never recover the same run, returning
        its claims recorded at that time (as a concurrent recovery might have reduced them
        meanwhile), or null if the run is seized by another agent  */
    async seize (run: string): Promise<Record<string, RunClaim> | null> {
        if (this.seized.has(run))
            return this.record(run).claims
        try {
            const unlock = await lockfile.lock(this.file(run), {
                realpath: false, lockfilePath: this.file(run, ".seize"),
                stale: runStale, update: runStale / 3, onCompromised: () => {}
            })
            this.seized.set(run, unlock)
        }
        catch (_err) {
            return null
        }
        return this.record(run).claims
    }

    /*  release the run lock of a seized terminated run, without removing its record  */
    async free (run: string): Promise<void> {
        const unlock = this.seized.get(run)
        if (unlock === undefined)
            return
        this.seized.delete(run)
        await unlock().catch(() => {})
    }

    /*  forget a recovered claim of a seized terminated run (so it is never recovered again,
        even if the recovery of another claim of the run fails and is retried by a later run)  */
    forget (run: string, id: string): void {
        const record = this.record(run)
        if (record.pid === 0 || !Object.hasOwn(record.claims, id))
            return
        record.claims = Object.fromEntries(Object.entries(record.claims).filter(([ key ]) => key !== id))
        this.store(run, record)
    }

    /*  whether a terminated run still records claims, i.e., tasks left to be recovered
        by an agent recording claims (like a phase agent sharing the run namespace)  */
    recoverable (run: string): boolean {
        return Object.keys(this.record(run).claims).length > 0
    }

    /*  whether a task is claimed by this run or by another run whose process is still
        alive (independent of its run lock), i.e., by an agent still processing it  */
    async claimed (id: string): Promise<boolean> {
        if (this.claims.has(id))
            return true
        for (const run of this.runs()) {
            const record = this.record(run)
            if (run !== this.id && Object.hasOwn(record.claims, id) && pidAlive(record.pid)
                && (record.start === "" || await pidStart(record.pid) === record.start))
                return true
        }
        return false
    }

    /*  remove the record, the run lock, and the seize lock of a (seized) terminated run  */
    async purge (run: string): Promise<void> {
        fs.rmSync(this.file(run, ".json"), { force: true })
        fs.rmSync(this.file(run, ".lock"), { recursive: true, force: true })
        if (this.seized.has(run))
            await this.free(run)
        else
            fs.rmSync(this.file(run, ".seize"), { recursive: true, force: true })
    }

    /*  record resp. forget the claim of a task by this run  */
    claim (id: string, claim: RunClaim): void {
        this.claims.set(id, claim)
        this.save()
    }
    unclaim (id: string): void {
        if (this.claims.delete(id))
            this.save()
    }
}

