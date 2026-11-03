/*
**  ASE review benchmark -- rule-based parser of the ase-repo-review output
**  Format source: plugin/skills/ase-repo-review/SKILL.md, STEP 3
*/

export const SEVERITIES = [ "HIGH", "MEDIUM", "LOW", "ACCEPTED" ]

const VERDICT_RE  = /\*\*REVIEW VERDICT\*\*\s*:\s*\*\*([^*\n]+?)\*\*/
const NOFIND_RE   = /\*\*NO FINDINGS\*\*/
const HIDDEN_RE   = /\*\*HIDDEN FINDINGS\*\*\s*:\s*(\d+)/
const SEVCELL_RE  = /^\*{0,2}(HIGH|MEDIUM|LOW|ACCEPTED)\*{0,2}$/i
const LOCATION_RE = /(?:▢\s*)?`?((?:[A-Za-z]:)?[^\s`:|*]*[^\s`:|*./][^\s`:|*]*\.[A-Za-z0-9]+):(\d+)(?:\s*[-–]\s*(\d+))?`?/

/*  split a Markdown table row at unescaped pipes  */
function splitRow (line) {
    const cells = []
    let   cell  = ""
    for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === "\\" && line[i + 1] === "|") {
            cell += "|"
            i++
        }
        else if (ch === "|") {
            cells.push(cell)
            cell = ""
        }
        else
            cell += ch
    }
    cells.push(cell)
    if (cells.length > 0 && cells[0].trim() === "")
        cells.shift()
    if (cells.length > 0 && cells[cells.length - 1].trim() === "")
        cells.pop()
    return cells.map((c) => c.trim())
}

/*  normalize a file path to POSIX form without leading "./"  */
export function normalizePath (p) {
    return p.replace(/\\/g, "/").replace(/^\.\//, "")
}

/*  parse a location from the finding cell  */
export function parseLocation (text) {
    const m = LOCATION_RE.exec(text)
    if (!m)
        return null
    const from = Number(m[2])
    const to   = m[3] !== undefined ? Number(m[3]) : from
    return { file: normalizePath(m[1]), from: Math.min(from, to), to: Math.max(from, to) }
}

/*  parse the review text  */
export function parseReview (text) {
    const result = { status: "unparseable", verdict: null, findings: [], noFindings: false, hidden: 0 }
    if (typeof text !== "string")
        return result
    const v = VERDICT_RE.exec(text)
    if (v)
        result.verdict = v[1].trim()
    result.noFindings = NOFIND_RE.test(text)
    const h = HIDDEN_RE.exec(text)
    if (h)
        result.hidden = Number(h[1])
    for (const line of text.split(/\r?\n/)) {
        if (!/^\s*\|/.test(line))
            continue
        const cells = splitRow(line.trim())
        if (cells.length < 3)
            continue
        const sev = SEVCELL_RE.exec(cells[0])
        if (!sev)
            continue
        const finding = cells.slice(2).join(" | ")
        result.findings.push({
            severity:  sev[1].toUpperCase(),
            dimension: cells[1],
            location:  parseLocation(finding),
            text:      finding
        })
    }
    if (result.verdict !== null && (result.findings.length > 0 || result.noFindings))
        result.status = "ok"
    return result
}
