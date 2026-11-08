/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import { parentPort }                        from "node:worker_threads"

import { Rasterize }                         from "./ase-util-rasterize.js"
import type { RasterizeJob, RasterizeReply } from "./ase-util-rasterize.js"

/*  worker thread entry point of "Rasterize.renderIsolated": rasterize the SVG
    documents of the jobs off the event loop of the service, one after the
    other, keeping resvg and the fonts loaded across the jobs, and post the
    replies (without the RGBA pixels) back  */
const post = (reply: RasterizeReply) => {
    parentPort?.postMessage(reply)
}
parentPort?.on("message", (job: RasterizeJob) => {
    Rasterize.render(job.svg, job.opts).then((image) => {
        const cells = image.cells !== undefined ? { cells: image.cells } : {}
        post({ id: job.id, png: image.png, width: image.width, height: image.height, ...cells })
    }, (err: unknown) => {
        post({ id: job.id, error: err instanceof Error ? err.message : String(err) })
    })
})

