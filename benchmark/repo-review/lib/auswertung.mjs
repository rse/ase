/*
**  ASE review benchmark -- metrics, aggregation, threshold and calibration (SDD-011)
**  Approach modelled after the MERIT effectiveness test (tests/effectiveness/lib/auswertung.js);
**  re-implemented, not copied.
*/

import { round4, compareIds } from "./common.mjs"
import { TIERS }              from "./sollliste.mjs"
import { parseReview }        from "./parser.mjs"
import { assignAll }          from "./zuordnung.mjs"

/*  evaluate a single run from its status and review text  */
export function evaluateRun (run, soll) {
    const out = {
        name:     run.name,
        status:   run.status,
        reason:   run.reason ?? null,
        model:    run.model,
        cost:     run.cost ?? null,
        duration: run.duration ?? null,
        verdict:  null
    }
    if (run.status !== "ok" && run.status !== "unauswertbar")
        return out
    const parsed = parseReview(run.review)
    out.status   = parsed.status
    out.verdict  = parsed.verdict
    const findings = parsed.status === "ok" ? assignAll(parsed.findings, soll) : []
    const bugs   = soll.eintraege.filter((e) => e.art === "befund")
    const decoys = soll.eintraege.filter((e) => e.art === "koeder")
    const hit    = new Map()
    let accepted = 0, unassignable = 0
    for (const f of findings) {
        if (f.severity === "ACCEPTED") {
            accepted++
            continue
        }
        if (f.assigned === null) {
            unassignable++
            continue
        }
        hit.set(f.assigned.id, (hit.get(f.assigned.id) ?? 0) + 1)
    }
    const hitBugs   = bugs.filter((e) => hit.has(e.id)).map((e) => e.id).sort(compareIds)
    const hitDecoys = decoys.filter((e) => hit.has(e.id)).map((e) => e.id).sort(compareIds)
    out.recall = {}
    for (const tier of TIERS) {
        const all = bugs.filter((e) => e.stufe === tier)
        out.recall[tier] = round4(all.filter((e) => hit.has(e.id)).length / all.length)
    }
    out.recall.gesamt   = round4(hitBugs.length / bugs.length)
    out.treffer         = hitBugs
    out.koeder_gemeldet = hitDecoys
    out.fehlalarmquote  = parsed.status === "ok" ? round4(hitDecoys.length / decoys.length) : null
    out.nicht_zuordenbar = unassignable
    out.accepted        = accepted
    out.duplikate       = [ ...hit.values() ].reduce((s, n) => s + (n - 1), 0)
    out.befunde_gemeldet = findings.length
    return out
}

/*  mean, minimum, maximum of the non-null values  */
export function stats (values) {
    const v = values.filter((x) => x !== null && x !== undefined)
    if (v.length === 0)
        return { mittel: null, min: null, max: null, n: 0 }
    return {
        mittel: round4(v.reduce((s, x) => s + x, 0) / v.length),
        min:    round4(Math.min(...v)),
        max:    round4(Math.max(...v)),
        n:      v.length
    }
}

/*  aggregate evaluated runs of one model, including threshold verdict  */
export function aggregate (runs, thresholds) {
    const evaluated = runs.filter((r) => r.status === "ok" || r.status === "unauswertbar")
    const count = (s) => runs.filter((r) => r.status === s).length
    const out = {
        laeufe: {
            gesamt:       runs.length,
            ausgewertet:  evaluated.length,
            ok:           count("ok"),
            unauswertbar: count("unauswertbar"),
            abgebrochen:  count("abgebrochen"),
            fehler:       count("fehler")
        },
        recall: {},
        fehlalarmquote:   stats(evaluated.map((r) => r.fehlalarmquote)),
        nicht_zuordenbar: stats(evaluated.filter((r) => r.status === "ok").map((r) => r.nicht_zuordenbar)),
        dauer_ms:         stats(runs.map((r) => r.duration)),
        kosten_usd: {
            summe: round4(runs.reduce((s, r) => s + (r.cost ?? 0), 0)),
            ...stats(runs.map((r) => r.cost))
        }
    }
    for (const key of [ ...TIERS, "gesamt" ])
        out.recall[key] = stats(evaluated.map((r) => r.recall[key]))
    out.schwelle = judge(out, thresholds)
    return out
}

/*  threshold verdict: all three criteria must hold  */
export function judge (agg, t) {
    const checks = {
        recall_gesamt:        { wert: agg.recall.gesamt.mittel,         grenze: t.recall_overall_min,     art: "min" },
        recall_offensichtlich: { wert: agg.recall.offensichtlich.mittel, grenze: t.recall_obvious_min,     art: "min" },
        fehlalarmquote:       { wert: agg.fehlalarmquote.mittel,        grenze: t.decoy_false_alarm_max, art: "max" }
    }
    let met = agg.laeufe.ausgewertet > 0
    for (const c of Object.values(checks)) {
        c.erfuellt = c.wert !== null && (c.art === "min" ? c.wert >= c.grenze : c.wert <= c.grenze)
        met = met && c.erfuellt
    }
    return { urteil: met ? "Schwelle erreicht" : "nicht erreicht", kriterien: checks }
}

/*  calibration statement from the runs of the strongest model (AC-011)  */
export function calibrate (runs) {
    const evaluated = runs.filter((r) => r.status === "ok" || r.status === "unauswertbar")
    if (evaluated.length === 0)
        return { aussage: null, naechster_schritt: null }
    const tooEasy = evaluated.every((r) => r.recall.gesamt === 1)
    return tooEasy
        ? { aussage: "zu leicht", naechster_schritt: "schwerere Fälle ergänzen, bevor Ergebnisse als Aussage über offene Modelle verwendet werden" }
        : { aussage: "angemessen", naechster_schritt: null }
}
