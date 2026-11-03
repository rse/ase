/*
**  ASE review benchmark -- assignment of findings to the expected-results list (SDD-010)
**  Approach modelled after the MERIT effectiveness test (tests/effectiveness/lib/zuordnung.js):
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
export function assignFinding (finding, soll, tolerance = TOLERANCE) {
    if (finding.location === null)
        return null
    const { file, from, to } = finding.location
    const candidates = []
    for (const e of soll.eintraege) {
        let best = null
        for (const f of e.fundstellen) {
            if (!sameFile(file, f.datei))
                continue
            const [ a, b ]  = f.zeilen
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
export function assignAll (findings, soll, tolerance = TOLERANCE) {
    return findings.map((f) => ({ ...f, assigned: assignFinding(f, soll, tolerance) }))
}
