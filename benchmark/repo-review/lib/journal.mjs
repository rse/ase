/*
**  ASE review benchmark -- measurement log: one generated section per measurement series,
**  appended to MEASUREMENTS.md and never rewritten (design rationale: DESIGN.md)
*/

import fs   from "node:fs"
import path from "node:path"

import { BENCH_DIR, REPO_DIR, git, readJson, sha256, compareIds } from "./common.mjs"
import { TIERS }       from "./expected.mjs"
import { parseReview } from "./parser.mjs"
import { assignAll }   from "./matching.mjs"

const OVERVIEW_END = "<!-- overview:end -->"
const TEXT_MAX     = 220

const HEADER = [
    "# Measurements of the `ase-repo-review` effectiveness test",
    "",
    "This file is a log. Each measurement series is appended by",
    "`node benchmark/repo-review/compare.mjs --journal MEASUREMENTS.md --title \"...\" <result folders>`",
    "with the values computed at that time. Existing entries are never rewritten:",
    "corrections and re-scorings are added as dated notes or as new entries. The",
    "manual reading of a series is written by hand below its generated part. The",
    "series title and the configuration table of an entry name the test case.",
    "",
    "## Overview",
    "",
    "All automated figures are location-matched: a finding counts only if it names the",
    "file and lines recorded in the expected-results list (see the README, \"Scoring and",
    "limitations\"). Values are means over the evaluated runs of a configuration.",
    "",
    "<!-- overview:start -->",
    "| Series | Configuration | Endpoint | Runs evaluated | Recall overall | Recall obvious | Decoy match rate | Unassignable per run | Pilot thresholds | Cost (USD) | Manual reading |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
    OVERVIEW_END,
    ""
]

/*  identifier of a series: digest over the case, the names of its result folders and the
    scorer commit, so a re-scoring with a changed scorer becomes a new entry  */
export function seriesId (dirs, scorerCommit, caseName) {
    return sha256(caseName + "\n" + dirs.map((d) => path.basename(d)).sort().join("\n") + "\n" + scorerCommit).slice(0, 19)
}

/*  version of the scoring code: last commit and dirty flag of the files that decide a score of the case  */
export function scorerVersion (c) {
    const rel = (p) => path.relative(REPO_DIR, p).replace(/\\/g, "/")
    const paths = [ path.join(BENCH_DIR, "lib"), path.join(BENCH_DIR, "compare.mjs"), c.expectedFile, c.thresholdFile ].map(rel)
    try {
        const commit = git(REPO_DIR, [ "log", "-1", "--format=%H", "--", ...paths ]).trim() || null
        const dirty  = git(REPO_DIR, [ "status", "--porcelain", "--", ...paths ]).trim() !== ""
        return { commit, modified: dirty }
    }
    catch (err) {
        return { commit: null, modified: true }
    }
}

/*  formatting helpers  */
const fmt   = (x, digits = 2) => x === null || x === undefined ? "–" : Number(x).toFixed(digits)
const rate  = (s) => s.mean === null ? "–" : `${fmt(s.mean)} (${fmt(s.min)}–${fmt(s.max)})`
const short = (h) => h ? h.replace(/^sha256:/, "").slice(0, 12) : "–"
const uniq  = (values) => [ ...new Set(values.filter((v) => v !== null && v !== undefined)) ]
const loc   = (l) => l ? `${l.file}:${l.from}${l.to !== l.from ? `-${l.to}` : ""}` : "no location"
const clip  = (t) => {
    /*  drop the checkbox and the location the text starts with, both are shown separately  */
    const s = t.replace(/\s+/g, " ").trim().replace(/^[`▢\s]*[^\s`:]+:\d[\d,\-– ]*`?\s*:?\s*/, "")
    return s.length > TEXT_MAX ? s.slice(0, TEXT_MAX - 1) + "…" : s
}

/*  metadata of one result folder  */
function runMeta (dir) {
    const m    = readJson(path.join(dir, "run.json"))
    const args = m.invocation?.args ?? []
    const p    = args.indexOf("-p")
    return {
        started:   m.started_at ?? null,
        requested: m.model?.requested ?? "unknown",
        reported:  m.model?.reported ?? [],
        endpoint:  m.endpoint?.base_url ?? "default",
        ase:       m.ase ? `${m.ase.version}, commit ${(m.ase.commit ?? "").slice(0, 8)}`
            + (m.ase.working_copy_modified ? " (modified)" : " (unmodified)") : null,
        cli:       m.cli_version ?? null,
        fixture:   m.fixture_digest ?? null,
        expected:  m.expected_digest ?? null,
        prompt:    p >= 0 ? args[p + 1] : null,
        dryRun:    m.dry_run === true
    }
}

/*  configuration label of a model group: reported model ids, else the requested name  */
function configLabel (runs) {
    const ids = uniq(runs.flatMap((r) => r.meta.reported))
    return ids.length > 0 ? ids.join(", ") : runs[0].meta.requested
}

/*  findings of a run that match no expected entry  */
function unassignableOf (review, expected) {
    const parsed = parseReview(review)
    if (parsed.status !== "ok")
        return []
    return assignAll(parsed.findings, expected)
        .filter((f) => f.severity !== "ACCEPTED" && f.assigned === null)
}

/*  render the generated section of one series  */
export function renderSection ({ title, dirs, report, expected, c }) {
    const scorer = scorerVersion(c)
    const id     = seriesId(dirs, scorer.commit, c.name)
    const runs   = dirs.map((d, i) => {
        const meta   = runMeta(d)
        const detail = Object.values(report.models).flatMap((m) => m.run_details)
            .find((r) => r.name === path.basename(d))
        const review = fs.existsSync(path.join(d, "review.md")) ? fs.readFileSync(path.join(d, "review.md"), "utf8") : null
        return { label: `R${i + 1}`, dir: d, meta, detail, review }
    })
    const groups = Object.keys(report.models).map((model) => ({
        model, m: report.models[model], runs: runs.filter((r) => r.detail.model === model)
    }))
    const starts  = runs.map((r) => r.meta.started).filter(Boolean).sort()
    const folders = uniq(runs.map((r) => path.relative(BENCH_DIR, path.dirname(r.dir)).replace(/\\/g, "/")))
    const t       = report.thresholds.values
    const out     = []

    out.push(`## ${title}`, "", `<!-- series ${id} -->`, "")
    out.push(`Generated by \`compare.mjs\` from ${runs.length} result folders in `
        + folders.map((f) => `\`${f}\``).join(", ") + ".", "")

    out.push("### Configuration", "", "| Item | Value |", "|---|---|")
    out.push(`| Case | ${c.name} |`)
    out.push(`| Runs started (UTC) | ${starts.length ? `${starts[0]} to ${starts[starts.length - 1]}` : "–"} |`)
    out.push(`| Invocation | ${uniq(runs.map((r) => r.meta.prompt)).map((s) => `\`${s}\``).join(", ") || "–"} |`)
    out.push(`| Models (requested → reported) | ${groups.map((g) => `${g.runs[0].meta.requested} → ${configLabel(g.runs)}`).join("; ")} |`)
    out.push(`| Endpoint | ${uniq(runs.map((r) => r.meta.endpoint)).join(", ")} |`)
    out.push(`| ASE | ${uniq(runs.map((r) => r.meta.ase)).join("; ") || "–"} |`)
    out.push(`| Claude Code CLI | ${uniq(runs.map((r) => r.meta.cli)).join("; ") || "–"} |`)
    out.push(`| Test case | fixture \`${uniq(runs.map((r) => short(r.meta.fixture))).join("`, `")}\` |`)
    out.push(`| Expected-results list | at run time \`${uniq(runs.map((r) => short(r.meta.expected))).join("`, `")}\`; `
        + `used for scoring \`${short(report.expected)}\` |`)
    out.push(`| Pilot thresholds | overall recall ≥ ${t.recall_overall_min}, obvious ≥ ${t.recall_obvious_min}, `
        + `decoy match rate ≤ ${t.decoy_false_alarm_max}`
        + (t.recall_adequate_min !== undefined ? `, recall with adequate severity ≥ ${t.recall_adequate_min}` : "")
        + `; file version \`${(report.thresholds.file.commit ?? "not committed").slice(0, 8)}\``
        + `${report.thresholds.file.modified ? " (uncommitted changes)" : ""} |`)
    out.push(`| Scorer | benchmark code at \`${(scorer.commit ?? "not committed").slice(0, 8)}\``
        + `${scorer.modified ? " with uncommitted changes" : ""} |`, "")

    out.push("### Automated results (location-matched)", "")
    out.push("Mean (minimum–maximum) over the evaluated runs.", "")
    /*  the severity column exists only for cases whose list records a minimum severity  */
    const adequate = groups.some((g) => g.m.recall.adequate !== undefined)
    out.push("| Configuration | Runs evaluated / total | Recall overall | Recall obvious | Recall medium | Recall hidden "
        + (adequate ? "| Recall adequate severity " : "")
        + "| Decoy match rate | Unassignable per run | Pilot thresholds | Ceiling-effect check | Duration per run (s) | Cost (USD) |",
        `|---|---|---|---|---|---|${adequate ? "---|" : ""}---|---|---|---|---|---|`)
    for (const g of groups) {
        const m = g.m
        out.push(`| ${configLabel(g.runs)} | ${m.runs.evaluated} / ${m.runs.total} | ${rate(m.recall.overall)} | `
            + `${rate(m.recall.obvious)} | ${rate(m.recall.medium)} | ${rate(m.recall.hidden)} | `
            + (adequate ? `${m.recall.adequate ? rate(m.recall.adequate) : "–"} | ` : "")
            + `${rate(m.false_alarm_rate)} | `
            + `${rate(m.unassignable)} | ${m.threshold.verdict.replace("threshold ", "")} | ${m.calibration?.statement ?? "–"} | `
            + `${m.duration_ms.mean === null ? "–" : fmt(m.duration_ms.mean / 1000, 0)} | ${fmt(m.cost_usd.sum)} |`)
    }
    out.push("")

    out.push("### Runs", "", "| Run | Result folder | Configuration | Status | Skill verdict | Findings | Duration (s) | Cost (USD) |",
        "|---|---|---|---|---|---|---|---|")
    for (const r of runs) {
        const d = r.detail
        out.push(`| ${r.label} | \`${path.basename(r.dir)}\` | ${configLabel([ r ])} | ${d.reason ? `${d.status} (${d.reason})` : d.status} | `
            + `${d.verdict ?? "–"} | ${d.findings_reported ?? "–"} | ${d.duration === null ? "–" : fmt(d.duration / 1000, 0)} | ${fmt(d.cost)} |`)
    }
    out.push("")

    const matrix = (kind, heading, legend, field) => {
        const entries = expected.entries.filter((e) => e.kind === kind)
            .sort((a, b) => kind === "finding" ? TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier) || compareIds(a.id, b.id) : compareIds(a.id, b.id))
        out.push(`### ${heading}`, "", legend, "")
        out.push(`| ${kind === "finding" ? "Defect | Tier" : "Decoy"} | ${runs.map((r) => r.label).join(" | ")} |`,
            `|---${kind === "finding" ? "|---" : ""}|${runs.map(() => "---").join("|")}|`)
        for (const e of entries) {
            const cells = runs.map((r) => {
                const d = r.detail
                if (d.recall === undefined)
                    return "n/a"
                if (!(d[field] ?? []).includes(e.id))
                    return "–"
                /*  a hit below the minimum severity of the entry is shown in parentheses  */
                return d.hits_adequate !== undefined && field === "hits" && !d.hits_adequate.includes(e.id) ? "(✓)" : "✓"
            })
            out.push(`| ${e.id} ${e.title}${kind === "finding" ? ` | ${e.tier}` : ""} | ${cells.join(" | ")} |`)
        }
        out.push("")
    }
    matrix("finding", "Seeded defects per run", adequate
        ? "✓ = a finding at a matching location with at least the minimum severity, (✓) = matched but reported below the minimum severity, – = none, n/a = run not evaluated."
        : "✓ = a finding at a matching location, – = none, n/a = run not evaluated.", "hits")
    matrix("decoy", "Decoys per run", "✓ = a finding at the decoy's location (whatever it says), – = none.", "decoys_reported")

    out.push("### Unassignable findings", "")
    out.push("Findings that match neither a defect nor a decoy; not classified automatically.", "")
    let any = false
    for (const r of runs) {
        for (const f of unassignableOf(r.review, expected)) {
            /*  show the location as written in the review, which may list several ranges  */
            const raw = /^[`▢\s]*([^\s`:]+:\d[\d,\-–]*)/.exec(f.text.trim())?.[1]
            out.push(`- ${r.label}, ${f.severity}, \`${raw ?? loc(f.location)}\`: ${clip(f.text)}`)
            any = true
        }
    }
    if (!any)
        out.push("None.")
    out.push("")

    out.push("### Manual reading", "")
    out.push("_Not recorded yet. Write it here by hand; do not change the generated parts above._", "")

    const rows = groups.map((g) => `| ${title.replace(/\|/g, "\\|")} | ${configLabel(g.runs)} | ${uniq(g.runs.map((r) => r.meta.endpoint)).join(", ")} | `
        + `${g.m.runs.evaluated} / ${g.m.runs.total} | ${fmt(g.m.recall.overall.mean)} | ${fmt(g.m.recall.obvious.mean)} | `
        + `${fmt(g.m.false_alarm_rate.mean)} | ${fmt(g.m.unassignable.mean, 1)} | ${g.m.threshold.verdict.replace("threshold ", "")} | `
        + `${fmt(g.m.cost_usd.sum)} | not yet |`)
    return { id, section: out.join("\n"), rows, dryRun: runs.some((r) => r.meta.dryRun), scorerModified: scorer.modified }
}

/*  append a series to the log; existing content is never changed except for new overview rows  */
export function appendJournal (file, { id, section, rows }) {
    let text = fs.existsSync(file) ? fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n") : HEADER.join("\n")
    if (text.includes(`<!-- series ${id} -->`))
        throw new Error(`this series (${id}) is already in ${file}`)
    const end = text.indexOf(OVERVIEW_END)
    if (end < 0)
        throw new Error(`${file} has no overview table (marker "${OVERVIEW_END}" is missing)`)
    text = text.slice(0, end) + rows.map((r) => r + "\n").join("") + text.slice(end)
    text = text.replace(/\n*$/, "\n\n") + section.replace(/\n*$/, "\n")
    fs.writeFileSync(file, text)
}
