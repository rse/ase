/*
**  ASE review benchmark -- throw-away copy of the fixture project
*/

import fs   from "node:fs"
import os   from "node:os"
import path from "node:path"

import { FIXTURE_DIR, git, listFiles, dirDigest } from "./common.mjs"

/*  neutral commit messages and fixed dates, so nothing hints at the expected results  */
const COMMITS = [
    { message: "Initial version",       date: "2026-05-04T09:00:00Z" },
    { message: "Update order handling", date: "2026-05-11T14:30:00Z" }
]

/*  ASE project configuration of the copy  */
export const ASE_CONFIG = [
    "project:",
    "    id: shop",
    "    name: Shop",
    "    boxing: white",
    ""
].join("\n")

/*  files expected in a copy (besides .git)  */
export function expectedFiles () {
    const files = new Set([ ".ase/config.yaml" ])
    for (const part of [ "base", "change" ])
        for (const file of listFiles(path.join(FIXTURE_DIR, part)))
            files.add(file)
    for (const file of deletedFiles())
        files.delete(file)
    return [ ...files ].sort()
}

/*  optional list of files the change deletes  */
function deletedFiles () {
    const file = path.join(FIXTURE_DIR, "change.delete")
    if (!fs.existsSync(file))
        return []
    return fs.readFileSync(file, "utf8").split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== "")
}

/*  digest of the fixture sources  */
export function fixtureDigest () {
    return dirDigest(FIXTURE_DIR)
}

/*  build the copy: base commit, then change commit  */
export function buildCopy (parent = os.tmpdir()) {
    const root = fs.mkdtempSync(path.join(parent, "ase-rr-"))
    const dir  = path.join(root, "shop")
    fs.mkdirSync(dir)
    const commit = (c) => git(dir, [ "commit", "-q", "-m", c.message ], {
        GIT_AUTHOR_DATE:    c.date,
        GIT_COMMITTER_DATE: c.date
    })
    git(dir, [ "init", "-q", "-b", "main" ])
    git(dir, [ "config", "core.autocrlf", "false" ])
    fs.cpSync(path.join(FIXTURE_DIR, "base"), dir, { recursive: true })
    fs.mkdirSync(path.join(dir, ".ase"), { recursive: true })
    fs.writeFileSync(path.join(dir, ".ase", "config.yaml"), ASE_CONFIG)
    git(dir, [ "add", "-A" ])
    commit(COMMITS[0])
    fs.cpSync(path.join(FIXTURE_DIR, "change"), dir, { recursive: true })
    for (const file of deletedFiles())
        fs.rmSync(path.join(dir, file), { force: true })
    git(dir, [ "add", "-A" ])
    commit(COMMITS[1])
    return { root, dir }
}

/*  remove a copy  */
export function removeCopy (copy) {
    fs.rmSync(copy.root, { recursive: true, force: true })
}
