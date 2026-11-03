/*
**  ASE review benchmark -- report from result folders (SDD-011, SDD-012)
*/

import fs   from "node:fs"
import path from "node:path"

import { REPO_DIR, THRESH_FILE, git, readJson, sha256 } from "./common.mjs"
import { evaluateRun, aggregate, calibrate }                        from "./auswertung.mjs"

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
        status:   meta.status,
        reason:   meta.reason ?? null,
        model:    (meta.model?.requested ?? "unbekannt") + (meta.dry_run ? " (Trockenlauf)" : ""),
        reported: meta.model?.reported ?? [],
        cost:     meta.cost_usd ?? null,
        duration: meta.duration_ms ?? null,
        endpoint: meta.endpoint?.base_url ?? "default",
        ase:      meta.ase?.version ?? null,
        review
    }
}

/*  version of the threshold file: last commit and dirty flag (AC-009)  */
export function thresholdVersion () {
    const rel = path.relative(REPO_DIR, THRESH_FILE).replace(/\\/g, "/")
    let commit = null, dirty = true
    try {
        commit = git(REPO_DIR, [ "log", "-1", "--format=%H", "--", rel ]).trim() || null
        dirty  = git(REPO_DIR, [ "status", "--porcelain", "--", rel ]).trim() !== ""
    }
    catch (err) {
        commit = null
    }
    return { commit, geaendert: dirty }
}

/*  build the report data  */
export function buildReport (dirs, soll) {
    const thresholds = readJson(THRESH_FILE)
    const loaded     = dirs.map(loadRun)
    const evaluated  = loaded.map((r) => ({ ...evaluateRun(r, soll), reported: r.reported, endpoint: r.endpoint, ase: r.ase }))
    const models     = [ ...new Set(evaluated.map((r) => r.model)) ].sort()
    const perModel   = {}
    for (const m of models) {
        const runs = evaluated.filter((r) => r.model === m)
        perModel[m] = { ...aggregate(runs, thresholds), laeufe_einzeln: runs }
        const reported = runs.flatMap((r) => r.reported).join(" ")
        if (/opus/i.test(m) || /opus/i.test(reported))
            perModel[m].kalibrierung = calibrate(runs)
    }
    return {
        schema:     1,
        sollliste:  sha256(JSON.stringify(soll)),
        schwellen:  { werte: thresholds, datei: thresholdVersion() },
        modelle:    perModel
    }
}

/*  format a number for Markdown  */
const fmt = (x, digits = 2) => x === null || x === undefined ? "–" : Number(x).toFixed(digits)
const pct = (s) => s.mittel === null ? "–" : `${fmt(s.mittel)} (${fmt(s.min)}–${fmt(s.max)})`

/*  render the report as Markdown (derived only from the report data)  */
export function renderMarkdown (report) {
    const t   = report.schwellen.werte
    const out = []
    out.push("# Wirksamkeitstest ase-repo-review", "")
    out.push(`Sollliste: \`${report.sollliste}\``, "")
    out.push(`Schwellen: Trefferquote gesamt ≥ ${t.recall_overall_min}, offensichtlich ≥ ${t.recall_obvious_min}, `
        + `Köder-Fehlalarmquote ≤ ${t.decoy_false_alarm_max}; Datei-Version \`${report.schwellen.datei.commit ?? "nicht committet"}\``
        + (report.schwellen.datei.geaendert ? " (**Warnung: ungecommittete Änderungen**)" : ""), "")
    for (const [ model, m ] of Object.entries(report.modelle)) {
        out.push(`## Modell ${model}`, "")
        out.push(`Urteil: **${m.schwelle.urteil}**`, "")
        if (m.kalibrierung)
            out.push(`Kalibrierung: **${m.kalibrierung.aussage ?? "–"}**`
                + (m.kalibrierung.naechster_schritt ? ` -- nächster Schritt: ${m.kalibrierung.naechster_schritt}` : ""), "")
        out.push(`Läufe: ${m.laeufe.gesamt} gesamt, ${m.laeufe.ausgewertet} ausgewertet, ${m.laeufe.unauswertbar} unauswertbar, `
            + `${m.laeufe.abgebrochen} abgebrochen, ${m.laeufe.fehler} fehler`, "")
        out.push("| Kennzahl | Mittel (Min–Max) |", "|---|---|")
        out.push(`| Trefferquote gesamt | ${pct(m.recall.gesamt)} |`)
        out.push(`| Trefferquote offensichtlich | ${pct(m.recall.offensichtlich)} |`)
        out.push(`| Trefferquote mittel | ${pct(m.recall.mittel)} |`)
        out.push(`| Trefferquote versteckt | ${pct(m.recall.versteckt)} |`)
        out.push(`| Köder-Fehlalarmquote (n=${m.fehlalarmquote.n}) | ${pct(m.fehlalarmquote)} |`)
        out.push(`| nicht zuordenbare Befunde je Lauf | ${pct(m.nicht_zuordenbar)} |`)
        out.push(`| Dauer je Lauf (s) | ${m.dauer_ms.mittel === null ? "–" : fmt(m.dauer_ms.mittel / 1000, 0)} |`)
        out.push(`| Kosten gesamt (USD) | ${fmt(m.kosten_usd.summe)} |`, "")
        out.push("| Lauf | Status | Urteil des Skills | Treffer | Köder gemeldet | nicht zuordenbar | Dauer (s) | Kosten (USD) |",
            "|---|---|---|---|---|---|---|---|")
        for (const r of m.laeufe_einzeln) {
            const status = r.reason ? `${r.status} (${r.reason})` : r.status
            out.push(`| ${r.name} | ${status} | ${r.verdict ?? "–"} | ${(r.treffer ?? []).join(", ") || "–"} | `
                + `${(r.koeder_gemeldet ?? []).join(", ") || "–"} | ${r.nicht_zuordenbar ?? "–"} | `
                + `${r.duration === null ? "–" : fmt(r.duration / 1000, 0)} | ${fmt(r.cost)} |`)
        }
        if (m.laeufe_einzeln.some((r) => r.endpoint !== "default"))
            out.push("", "Hinweis: Läufe über einen anderen Endpunkt; Kostenangaben sind dort unzuverlässig.")
        out.push("")
    }
    return out.join("\n")
}
