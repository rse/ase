/*
**  ASE review benchmark -- metrics, aggregation, threshold and calibration
**  Approach modelled after the MERIT effectiveness test (tests/effectiveness/, scoring module);
**  re-implemented, not copied.
*/

import { round4, compareIds } from "./common.mjs"
import { TIERS }              from "./expected.mjs"
import { parseReview }        from "./parser.mjs"
import { assignAll }          from "./matching.mjs"

/*  evaluate a single run from its status and review text  */
export function evaluateRun (run, expected) {
    const out = {
        name:     run.name,
        status:   run.status,
        reason:   run.reason ?? null,
        model:    run.model,
        cost:     run.cost ?? null,
        duration: run.duration ?? null,
        verdict:  null
    }
    if (run.status !== "ok" && run.status !== "unparseable")
        return out
    const parsed = parseReview(run.review)
    out.status   = parsed.status
    out.verdict  = parsed.verdict
    const findings = parsed.status === "ok" ? assignAll(parsed.findings, expected) : []
    const bugs   = expected.entries.filter((e) => e.kind === "finding")
    const decoys = expected.entries.filter((e) => e.kind === "decoy")
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
        const all = bugs.filter((e) => e.tier === tier)
        out.recall[tier] = round4(all.filter((e) => hit.has(e.id)).length / all.length)
    }
    out.recall.overall     = round4(hitBugs.length / bugs.length)
    out.hits               = hitBugs
    out.decoys_reported    = hitDecoys
    out.false_alarm_rate   = parsed.status === "ok" ? round4(hitDecoys.length / decoys.length) : null
    out.unassignable       = unassignable
    out.accepted           = accepted
    out.duplicates         = [ ...hit.values() ].reduce((s, n) => s + (n - 1), 0)
    out.findings_reported  = findings.length
    return out
}

/*  mean, minimum, maximum of the non-null values  */
export function stats (values) {
    const v = values.filter((x) => x !== null && x !== undefined)
    if (v.length === 0)
        return { mean: null, min: null, max: null, n: 0 }
    return {
        mean: round4(v.reduce((s, x) => s + x, 0) / v.length),
        min:  round4(Math.min(...v)),
        max:  round4(Math.max(...v)),
        n:    v.length
    }
}

/*  aggregate evaluated runs of one model, including threshold verdict  */
export function aggregate (runs, thresholds) {
    const evaluated = runs.filter((r) => r.status === "ok" || r.status === "unparseable")
    const count = (s) => runs.filter((r) => r.status === s).length
    const out = {
        runs: {
            total:       runs.length,
            evaluated:   evaluated.length,
            ok:          count("ok"),
            unparseable: count("unparseable"),
            aborted:     count("aborted"),
            error:       count("error")
        },
        recall: {},
        false_alarm_rate: stats(evaluated.map((r) => r.false_alarm_rate)),
        unassignable:     stats(evaluated.filter((r) => r.status === "ok").map((r) => r.unassignable)),
        duration_ms:      stats(runs.map((r) => r.duration)),
        cost_usd: {
            sum: round4(runs.reduce((s, r) => s + (r.cost ?? 0), 0)),
            ...stats(runs.map((r) => r.cost))
        }
    }
    for (const key of [ ...TIERS, "overall" ])
        out.recall[key] = stats(evaluated.map((r) => r.recall[key]))
    out.threshold = judge(out, thresholds)
    return out
}

/*  threshold verdict: all three criteria must hold  */
export function judge (agg, t) {
    const checks = {
        recall_overall:   { value: agg.recall.overall.mean,   limit: t.recall_overall_min,    kind: "min" },
        recall_obvious:   { value: agg.recall.obvious.mean,   limit: t.recall_obvious_min,    kind: "min" },
        false_alarm_rate: { value: agg.false_alarm_rate.mean, limit: t.decoy_false_alarm_max, kind: "max" }
    }
    let met = agg.runs.evaluated > 0
    for (const c of Object.values(checks)) {
        c.met = c.value !== null && (c.kind === "min" ? c.value >= c.limit : c.value <= c.limit)
        met = met && c.met
    }
    return { verdict: met ? "threshold met" : "threshold not met", criteria: checks }
}

/*  calibration statement from the runs of the strongest model  */
export function calibrate (runs) {
    const evaluated = runs.filter((r) => r.status === "ok" || r.status === "unparseable")
    if (evaluated.length === 0)
        return { statement: null, next_step: null }
    const tooEasy = evaluated.every((r) => r.recall.overall === 1)
    return tooEasy
        ? { statement: "too easy", next_step: "add harder cases before using results as a statement about open models" }
        : { statement: "adequate", next_step: null }
}
