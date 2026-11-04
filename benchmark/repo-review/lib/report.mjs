/*
**  ASE review benchmark -- report from result folders
*/

import fs   from "node:fs"
import path from "node:path"

import { REPO_DIR, DEFAULT_CASE, git, readJson, sha256 } from "./common.mjs"
import { evaluateRun, aggregate, calibrate }             from "./scoring.mjs"

/*  collect completed result folders below the given paths (run.json is the completion mark)  */
export function collectRunDirs (paths) {
    const dirs = new Set()
    for (const p of paths) {
        const abs = path.resolve(p)
        if (fs.existsSync(path.join(abs, "run.json")))
            dirs.add(abs)
        else if (fs.existsSync(abs) && fs.statSync(abs).isDirectory())
            for (const entry of fs.readdirSync(abs, { withFileTypes: true }))
                if (entry.isDirectory() && fs.existsSync(path.join(abs, entry.name, "run.json")))
                    dirs.add(path.join(abs, entry.name))
    }
    const cmp = (x, y) => x < y ? -1 : x > y ? 1 : 0
    return [ ...dirs ].sort((a, b) => cmp(path.basename(a), path.basename(b)) || cmp(a, b))
}

/*  load one result folder  */
export function loadRun (dir) {
    const meta   = readJson(path.join(dir, "run.json"))
    const review = fs.existsSync(path.join(dir, "review.md")) ? fs.readFileSync(path.join(dir, "review.md"), "utf8") : null
    return {
        name:     path.basename(dir),
        /*  protocols without the case field (the test runs under testdata/runs) count as the default case  */
        case:     meta.case ?? DEFAULT_CASE,
        status:   meta.status,
        reason:   meta.reason ?? null,
        model:    (meta.model?.requested ?? "unknown") + (meta.dry_run ? " (dry run)" : ""),
        reported: meta.model?.reported ?? [],
        cost:     meta.cost_usd ?? null,
        duration: meta.duration_ms ?? null,
        endpoint: meta.endpoint?.base_url ?? "default",
        ase:      meta.ase?.version ?? null,
        review
    }
}

/*  version of the threshold file of a case: last commit and dirty flag  */
export function thresholdVersion (c) {
    const rel = path.relative(REPO_DIR, c.thresholdFile).replace(/\\/g, "/")
    let commit = null, dirty = true
    try {
        commit = git(REPO_DIR, [ "log", "-1", "--format=%H", "--", rel ]).trim() || null
        dirty  = git(REPO_DIR, [ "status", "--porcelain", "--", rel ]).trim() !== ""
    }
    catch (err) {
        commit = null
    }
    return { commit, modified: dirty }
}

/*  build the report data of a case  */
export function buildReport (dirs, expected, c) {
    const thresholds = readJson(c.thresholdFile)
    const loaded     = dirs.map(loadRun)
    const evaluated  = loaded.map((r) => ({ ...evaluateRun(r, expected), reported: r.reported, endpoint: r.endpoint, ase: r.ase }))
    const models     = [ ...new Set(evaluated.map((r) => r.model)) ].sort()
    const perModel   = {}
    for (const m of models) {
        const runs = evaluated.filter((r) => r.model === m)
        perModel[m] = { ...aggregate(runs, thresholds), run_details: runs }
        const reported = runs.flatMap((r) => r.reported).join(" ")
        if (/opus/i.test(m) || /opus/i.test(reported))
            perModel[m].calibration = calibrate(runs)
    }
    return {
        schema:     2,
        expected:   sha256(JSON.stringify(expected)),
        thresholds: { values: thresholds, file: thresholdVersion(c) },
        models:     perModel
    }
}

/*  format a number for Markdown  */
const fmt  = (x, digits = 2) => x === null || x === undefined ? "–" : Number(x).toFixed(digits)
const rate = (s) => s.mean === null ? "–" : `${fmt(s.mean)} (${fmt(s.min)}–${fmt(s.max)})`

/*  render the report as Markdown (derived only from the report data)  */
export function renderMarkdown (report) {
    const t   = report.thresholds.values
    const out = []
    out.push("# Effectiveness test ase-repo-review", "")
    out.push(`Expected-results list: \`${report.expected}\``, "")
    out.push(`Thresholds: overall recall ≥ ${t.recall_overall_min}, obvious ≥ ${t.recall_obvious_min}, `
        + `decoy false-alarm rate ≤ ${t.decoy_false_alarm_max}`
        + (t.recall_adequate_min !== undefined ? `, recall with adequate severity ≥ ${t.recall_adequate_min}` : "")
        + `; file version \`${report.thresholds.file.commit ?? "not committed"}\``
        + (report.thresholds.file.modified ? " (**warning: uncommitted changes**)" : ""), "")
    for (const [ model, m ] of Object.entries(report.models)) {
        out.push(`## Model ${model}`, "")
        out.push(`Verdict: **${m.threshold.verdict}**`, "")
        if (m.calibration)
            out.push(`Calibration: **${m.calibration.statement ?? "–"}**`
                + (m.calibration.next_step ? ` -- next step: ${m.calibration.next_step}` : ""), "")
        out.push(`Runs: ${m.runs.total} total, ${m.runs.evaluated} evaluated, ${m.runs.unparseable} unparseable, `
            + `${m.runs.aborted} aborted, ${m.runs.error} error`, "")
        out.push("| Metric | Mean (min–max) |", "|---|---|")
        out.push(`| Recall overall | ${rate(m.recall.overall)} |`)
        out.push(`| Recall obvious | ${rate(m.recall.obvious)} |`)
        out.push(`| Recall medium | ${rate(m.recall.medium)} |`)
        out.push(`| Recall hidden | ${rate(m.recall.hidden)} |`)
        /*  the severity figures exist only for cases whose list records a minimum severity  */
        const adequate = m.recall.adequate !== undefined
        if (adequate)
            out.push(`| Recall with adequate severity | ${rate(m.recall.adequate)} |`)
        out.push(`| Decoy false-alarm rate (n=${m.false_alarm_rate.n}) | ${rate(m.false_alarm_rate)} |`)
        out.push(`| Unassignable findings per run | ${rate(m.unassignable)} |`)
        out.push(`| Duration per run (s) | ${m.duration_ms.mean === null ? "–" : fmt(m.duration_ms.mean / 1000, 0)} |`)
        out.push(`| Total cost (USD) | ${fmt(m.cost_usd.sum)} |`, "")
        out.push(`| Run | Status | Skill verdict | Hits |${adequate ? " Adequate severity |" : ""} Decoys reported | Unassignable | Duration (s) | Cost (USD) |`,
            `|---|---|---|---|${adequate ? "---|" : ""}---|---|---|---|`)
        for (const r of m.run_details) {
            const status = r.reason ? `${r.status} (${r.reason})` : r.status
            out.push(`| ${r.name} | ${status} | ${r.verdict ?? "–"} | ${(r.hits ?? []).join(", ") || "–"} | `
                + (adequate ? `${(r.hits_adequate ?? []).join(", ") || "–"} | ` : "")
                + `${(r.decoys_reported ?? []).join(", ") || "–"} | ${r.unassignable ?? "–"} | `
                + `${r.duration === null ? "–" : fmt(r.duration / 1000, 0)} | ${fmt(r.cost)} |`)
        }
        if (m.run_details.some((r) => r.endpoint !== "default"))
            out.push("", "Note: runs against another endpoint; cost figures are unreliable there.")
        out.push("")
    }
    return out.join("\n")
}
