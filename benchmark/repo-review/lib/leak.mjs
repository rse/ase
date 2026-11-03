/*
**  ASE review benchmark -- leak check of a throw-away copy (SDD-004)
*/

import fs   from "node:fs"
import path from "node:path"

import { git, listFiles } from "./common.mjs"
import { expectedFiles }  from "./copy.mjs"

/*  terms which must not appear in file names, contents, or commit messages; the German
    terms are search data for German-language hints in the fixture (AC-015 exception)  */
export const DENY_TERMS = [
    "sollliste", "köder", "koeder", "decoy", "bait", "befund",
    "bug", "todo", "fixme", "xxx", "hack", "intentional", "absichtlich"
]
const DENY_RE = new RegExp(`(?<![\\p{L}\\p{N}_])(${DENY_TERMS.join("|")})(?:s|e|en|es)?(?![\\p{L}\\p{N}_])`, "iu")
const ID_RE   = /\b[BK]-\d+\b/

/*  check a single text and return the offending term (or null)  */
export function findLeak (text) {
    const m1 = DENY_RE.exec(text)
    if (m1)
        return m1[1]
    const m2 = ID_RE.exec(text)
    if (m2)
        return m2[0]
    return null
}

/*  check a copy and return a list of problems (empty if clean)  */
export function checkCopy (dir) {
    const problems = []
    const actual   = listFiles(dir)
    const expected = expectedFiles()
    for (const file of actual)
        if (!expected.includes(file))
            problems.push(`unexpected file: ${file}`)
    for (const file of expected)
        if (!actual.includes(file))
            problems.push(`missing file: ${file}`)
    for (const file of actual) {
        const inName = findLeak(file)
        if (inName)
            problems.push(`file name ${file} contains "${inName}"`)
        const lines = fs.readFileSync(path.join(dir, file), "utf8").split(/\r?\n/)
        lines.forEach((line, i) => {
            const hit = findLeak(line)
            if (hit)
                problems.push(`${file}:${i + 1} contains "${hit}"`)
        })
    }
    const log = git(dir, [ "log", "--format=%an%n%ae%n%B" ])
    const hit = findLeak(log)
    if (hit)
        problems.push(`commit history contains "${hit}"`)
    return problems
}
