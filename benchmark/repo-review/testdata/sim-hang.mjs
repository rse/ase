/*
**  ASE review benchmark -- stand-in for a hanging claude process (abort-time dry run, SCN-025):
**  starts a grandchild, records its PID, and never finishes
*/

import fs        from "node:fs"
import { spawn } from "node:child_process"

const grandchild = spawn(process.execPath, [ "-e", "setInterval(() => {}, 1000)" ], { stdio: "ignore" })
fs.writeFileSync(process.argv[2], String(grandchild.pid))
process.stdout.write(JSON.stringify({ type: "system", subtype: "init", model: "claude-sonnet-5-5",
    plugins: [ { name: "ase" } ], mcp_servers: [ { name: "ase", status: "connected" } ] }) + "\n")
setInterval(() => {}, 1000)
