/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import fs     from "node:fs"
import json   from "json-asty"
import StdVer from "stdver"

/*  determine version bumping  */
const bump = process.argv[2] ?? "R"
console.log(`++ bumped version part: ${bump}`)

/*  find old version  */
console.log(`++ read file: "package.json"`)
const ast = json.parse(fs.readFileSync("package.json", "utf8"))
const node = ast.query(`./ object / member [ / string [ @value == "version" ] ] / string [ pos() == 2 ]`)[0]
let version = node.get("value")
console.log(`++ old version: ${version}`)

/*  determine new version  */
const stdver = new StdVer()
version = stdver.modify(version, { bump })
console.log(`++ new version: ${version}`)

/*  update configuration files  */
for (const file of [
    "package.json",
    "tool/package.json",
    "plugin/package.json",
    "plugin/.claude-plugin/plugin.json",
    "plugin/.github/plugin/plugin.json",
    "plugin/.codex-plugin/plugin.json",
    "pages/package.json"
] as const) {
    console.log(`++ update file: "${file}"`)
    const ast = json.parse(fs.readFileSync(file, "utf8"))
    const node = ast.query(`./ object / member [ / string [ @value == "version" ] ] / string [ pos() == 2 ]`)[0]
    node.set("value", version)
    node.set("body", `"${version}"`)
    fs.writeFileSync(file, json.unparse(ast), "utf8")
}

