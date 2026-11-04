/*
**  ASE review benchmark -- throw-away copy of the fixture project of a case
*/

import fs   from "node:fs"
import os   from "node:os"
import path from "node:path"

import { git, listFiles, dirDigest } from "./common.mjs"

/*  fixed dates and neutral commit messages, so nothing hints at the expected results  */
const DATES = [ "2026-05-04T09:00:00Z", "2026-05-11T14:30:00Z" ]
const FIRST_MESSAGE = "Initial version"

/*  ASE project configuration of the copy  */
export function aseConfig (c) {
    return [
        "project:",
        `    id: ${c.project.id}`,
        `    name: ${c.project.name}`,
        `    boxing: ${c.project.boxing}`,
        ""
    ].join("\n")
}

/*  files expected in a copy (besides .git)  */
export function expectedFiles (c) {
    const files = new Set([ ".ase/config.yaml" ])
    for (const part of [ "base", "change" ])
        for (const file of listFiles(path.join(c.fixtureDir, part)))
            files.add(file)
    for (const file of deletedFiles(c))
        files.delete(file)
    return [ ...files ].sort()
}

/*  optional list of files the change deletes  */
function deletedFiles (c) {
    const file = path.join(c.fixtureDir, "change.delete")
    if (!fs.existsSync(file))
        return []
    return fs.readFileSync(file, "utf8").split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== "")
}

/*  digest of the fixture sources  */
export function fixtureDigest (c) {
    return dirDigest(c.fixtureDir)
}

/*  build the copy: base commit, then change commit  */
export function buildCopy (c, parent = os.tmpdir()) {
    const root = fs.mkdtempSync(path.join(parent, "ase-rr-"))
    const dir  = path.join(root, "shop")
    fs.mkdirSync(dir)
    const commit = (message, date) => git(dir, [ "commit", "-q", "-m", message ], {
        GIT_AUTHOR_DATE:    date,
        GIT_COMMITTER_DATE: date
    })
    git(dir, [ "init", "-q", "-b", "main" ])
    git(dir, [ "config", "core.autocrlf", "false" ])
    fs.cpSync(path.join(c.fixtureDir, "base"), dir, { recursive: true })
    fs.mkdirSync(path.join(dir, ".ase"), { recursive: true })
    fs.writeFileSync(path.join(dir, ".ase", "config.yaml"), aseConfig(c))
    git(dir, [ "add", "-A" ])
    commit(FIRST_MESSAGE, DATES[0])
    fs.cpSync(path.join(c.fixtureDir, "change"), dir, { recursive: true })
    for (const file of deletedFiles(c))
        fs.rmSync(path.join(dir, file), { force: true })
    git(dir, [ "add", "-A" ])
    commit(c.changeMessage, DATES[1])
    return { root, dir }
}

/*  remove a copy  */
export function removeCopy (copy) {
    fs.rmSync(copy.root, { recursive: true, force: true })
}
