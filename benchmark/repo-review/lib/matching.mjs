/*
**  ASE review benchmark -- assignment of findings to the expected-results list (design rationale: DESIGN.md)
**  Approach modelled after the MERIT effectiveness test (tests/effectiveness/, matching module):
**  file name plus line overlap with a fixed tolerance; re-implemented, not copied.
*/

import { compareIds } from "./common.mjs"

export const TOLERANCE = 3

/*  whether a finding file refers to an expected file (suffix match on path segments)  */
export function sameFile (findingFile, expectedFile) {
    const a = findingFile.toLowerCase()
    const b = expectedFile.toLowerCase()
    return a === b || a.endsWith("/" + b)
}

/*  assign one finding; returns { id, overlap, distance } or null  */
export function assignFinding (finding, expected, tolerance = TOLERANCE) {
    if (finding.location === null)
        return null
    const { file, from, to } = finding.location
    const candidates = []
    for (const e of expected.entries) {
        let best = null
        for (const f of e.locations) {
            if (!sameFile(file, f.file))
                continue
            const [ a, b ]  = f.lines
            const overlap   = Math.min(to + tolerance, b) - Math.max(from - tolerance, a) + 1
            if (overlap <= 0)
                continue
            const distance  = Math.max(0, a - to, from - b)
            if (best === null || overlap > best.overlap || (overlap === best.overlap && distance < best.distance))
                best = { id: e.id, overlap, distance }
        }
        if (best !== null)
            candidates.push(best)
    }
    if (candidates.length === 0)
        return null
    candidates.sort((x, y) => y.overlap - x.overlap || x.distance - y.distance || compareIds(x.id, y.id))
    return candidates[0]
}

/*  assign all findings of a run  */
export function assignAll (findings, expected, tolerance = TOLERANCE) {
    return findings.map((f) => ({ ...f, assigned: assignFinding(f, expected, tolerance) }))
}
