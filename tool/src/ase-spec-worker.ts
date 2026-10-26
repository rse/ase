/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import { parentPort, workerData } from "node:worker_threads"

import Log                        from "./ase-lib-log.js"
import type { LogLevel }          from "./ase-lib-log.js"
import { Spec }                   from "./ase-spec.js"
import type { SpecJob, SpecReply } from "./ase-spec.js"

/*  worker thread entry point of "Spec.isolated": run one SpecBook job
    off the event loop of the service and post its replies back  */
const post = (reply: SpecReply) => {
    parentPort?.postMessage(reply)
}

/*  logger forwarding every message to the service, which alone owns
    the log and hence also applies the log level filtering  */
class ForwardLog extends Log {
    write (level: LogLevel, msg: string) {
        post({ type: "log", level, msg })
    }
}
const log = new ForwardLog("ase", "debug", "-")

/*  run the job  */
const job = workerData as SpecJob
const run = async (): Promise<SpecReply> => {
    if (job.op === "lint")
        return { type: "lint", diagnostics: await Spec.lint(log, job.markdown) }
    const notices = new Array<string>()
    const buffers = await Spec.export(log, job.formats, notices)
    return { type: "export", buffers, notices }
}
run().then(post, (err: unknown) => {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) })
})
