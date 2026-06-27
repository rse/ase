/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

/*  built-in dependencies  */
const fs            = require("node:fs")
const path          = require("node:path")
const childProcess  = require("node:child_process")

/*  execute a command  */
const run = (cmd, args, opts) => {
    const result = childProcess.spawnSync(cmd, args, {
        stdio: "inherit",
        shell: process.platform === "win32",
        ...opts
    })
    if (result.error)
        throw result.error
    if (result.status !== 0)
        process.exit(result.status ?? 1)
}

/*  determine tool directory  */
const tooldir = path.join(__dirname, "..", "tool")

/*  ensure that "npm install" was run  */
const nm    = path.join(tooldir, "node_modules")
const stat1 = fs.statSync(nm, { throwIfNoEntry: false })
if (stat1 === undefined)
    run("npm", [ "install" ], { cwd: tooldir })

/*  ensure that "npm start build" was run  */
const asejs = path.join(tooldir, "dst", "ase.js")
const stat2 = fs.statSync(asejs, { throwIfNoEntry: false })
if (stat2 === undefined)
    run("npm", [ "start", "build" ], { cwd: tooldir })

/*  pass-through execution to real "ase" CLI  */
run(process.execPath, [ asejs, ...process.argv.slice(2) ], {
    env: { ...process.env, ASE_SETUP_DEV: "1" }
})
process.exit(0)

