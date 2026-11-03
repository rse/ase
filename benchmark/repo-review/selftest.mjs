#!/usr/bin/env node
/*
**  ASE review benchmark -- self-test of parser, assignment, metrics, and runner helpers
**  Expected values are computed by hand from the PRD rules, not derived from the code.
**  Usage: node selftest.mjs
*/

import fs   from "node:fs"
import os   from "node:os"
import path from "node:path"

import { SOLL_FILE, TESTDATA_DIR, stableStringify, readJson } from "./lib/common.mjs"
import { parseReview }                             from "./lib/parser.mjs"
import { assignFinding }                           from "./lib/zuordnung.mjs"
import { evaluateRun, aggregate, calibrate }       from "./lib/auswertung.mjs"
import { findLeak }                                from "./lib/leck.mjs"
import { seriesAllows, createRunDir, checkInit, claudeArgs, mcpConfig, checkContamination, childEnv, envSummary, transcriptFacts } from "./lib/runner.mjs"

let passed = 0, failed = 0
function check (name, cond, info = "") {
    if (cond) {
        passed++
        process.stdout.write(`ok   - ${name}\n`)
    }
    else {
        failed++
        process.stdout.write(`FAIL - ${name}${info ? ` (${info})` : ""}\n`)
    }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)

const soll = readJson(SOLL_FILE)
const row  = (sev, loc, text = "text") => `| **${sev}** | correctness | ${loc}: ${text} |`
const head = "◉ **REVIEW VERDICT**: **REJECT - DEMANDS CHANGES**\n\n| Severity | Dimension | Finding |\n| --- | --- | --- |\n"
const review = (rows) => head + rows.join("\n") + "\n"
const replayText = (file) => transcriptFacts(fs.readFileSync(path.join(TESTDATA_DIR, file), "utf8")
    .split("\n").filter(Boolean).map((l) => JSON.parse(l))).text

/*  SCN-011: parser format variants  */
{
    const p = parseReview(review([ row("HIGH", "▢ `src/cart.ts:30`") ]))
    check("Parser: Standardzeile mit ▢ und Backticks", p.status === "ok" && eq(p.findings[0].location, { file: "src/cart.ts", from: 30, to: 30 }))
    const q = parseReview(review([ row("MEDIUM", "src/cart.ts:30-31") ]))
    check("Parser: ohne ▢ und Backticks, Bereich :N-M", eq(q.findings[0].location, { file: "src/cart.ts", from: 30, to: 31 }))
    const r = parseReview(review([ "| **LOW** | correctness | ▢ `src/order.ts:83`: a \\| b in text |" ]))
    check("Parser: maskiertes \\| im Befundtext", r.findings.length === 1 && r.findings[0].text.includes("a | b") && r.findings[0].location.from === 83)
    const s = parseReview(review([ row("HIGH", "▢ `C:\\Temp\\ase-rr-x\\shop\\src\\api.ts:34`") ]))
    check("Parser: Windows-Pfad", s.findings[0].location.file === "C:/Temp/ase-rr-x/shop/src/api.ts" && s.findings[0].location.from === 34)
    const t = parseReview(review([ row("ACCEPTED", "▢ `src/notify.ts:7`") ]))
    check("Parser: Schwere ACCEPTED", t.findings[0].severity === "ACCEPTED")
    const u = parseReview(review([ "| **HIGH** | correctness | the change breaks the build |" ]))
    check("Parser: Befund ohne Fundstelle", u.status === "ok" && u.findings[0].location === null)
    const v = parseReview("◉ **REVIEW VERDICT**: **APPROVE**\n\n○ **NO FINDINGS**: the change is clean, nothing to flag.\n")
    check("Parser: NO FINDINGS ist auswertbar ohne Befunde", v.status === "ok" && v.findings.length === 0 && v.verdict === "APPROVE")
    const w = parseReview("◉ **REVIEW VERDICT**: **SKIPPED (boxing: black)**\n\n○ **NO FINDINGS**: the change was not reviewed, nothing to flag.\n")
    check("Parser: Urteil SKIPPED", w.status === "ok" && w.verdict === "SKIPPED (boxing: black)")
    const x = parseReview(review([ row("HIGH", "▢ `src/cart.ts:30`") ]).replace("REVIEW VERDICT", "RESULT"))
    check("Parser: fehlendes Urteil ist unauswertbar (Negativfall)", x.status === "unauswertbar")
    const y = parseReview("◉ **REVIEW VERDICT**: **APPROVE**\n\nlooks fine to me\n")
    check("Parser: Urteil ohne Tabelle und ohne NO FINDINGS ist unauswertbar (Negativfall)", y.status === "unauswertbar")
}

/*  SCN-016: unparseable output of the replay file  */
check("Parser: formatfremde Ausgabe aus testdata/unparseable.jsonl ist unauswertbar",
    parseReview(replayText("unparseable.jsonl")).status === "unauswertbar")

/*  SCN-012: assignment with tolerance 3  */
{
    const f = (file, from, to = from, severity = "HIGH") => ({ severity, location: { file, from, to } })
    check("Zuordnung: Abstand 3 trifft (B-01 bei 30-31, Fund bei 34)", assignFinding(f("src/cart.ts", 34), soll)?.id === "B-01")
    check("Zuordnung: Abstand 4 trifft nicht (Fund bei 35, Negativfall)", assignFinding(f("src/cart.ts", 35), soll) === null)
    check("Zuordnung: anderer Dateiname trifft nicht (Negativfall)", assignFinding(f("src/money.ts", 30), soll) === null)
    check("Zuordnung: Pfadsuffix trifft", assignFinding(f("C:/Temp/x/shop/src/cart.ts", 30), soll)?.id === "B-01")
    const two = { eintraege: [
        { id: "B-1", art: "befund", stufe: "mittel", fundstellen: [ { datei: "a.ts", zeilen: [ 10, 12 ] } ] },
        { id: "B-2", art: "befund", stufe: "mittel", fundstellen: [ { datei: "a.ts", zeilen: [ 16, 18 ] } ] }
    ] }
    check("Zuordnung: größere Überlappung gewinnt (Fund 15: B-1 1 Zeile, B-2 3 Zeilen)", assignFinding(f("a.ts", 15), two)?.id === "B-2")
    check("Zuordnung: Gleichstand entscheidet die kleinste ID (Fund 14)", assignFinding(f("a.ts", 14), two)?.id === "B-1")
    check("Zuordnung: Befund ohne Fundstelle bleibt offen", assignFinding({ severity: "HIGH", location: null }, soll) === null)
}

/*  SCN-014, SCN-017: metrics computed by hand
    run 1 (testdata/normal.jsonl): hits B-01, B-02 (obvious 2/2), B-03 (medium 1/3), B-06 (hidden 1/2),
           overall 4/7 = 0.5714; decoy K-04 1/4 = 0.25; unassignable 1 (inventory.ts); ACCEPTED 1; duplicate 1 (cart.ts:31)
    run 2: unparseable -> recall 0, not in false alarm rate
    run 3: NO FINDINGS -> recall 0, false alarm 0
    run 4: abgebrochen -> not evaluated
    means: overall (0.5714 + 0 + 0) / 3 = 0.1905, obvious 1/3 = 0.3333, false alarm (0.25 + 0) / 2 = 0.125  */
{
    const runs = [
        { name: "r1", status: "ok", model: "m", review: replayText("normal.jsonl"), cost: 0.4, duration: 1000 },
        { name: "r2", status: "unauswertbar", model: "m", review: replayText("unparseable.jsonl"), cost: 0.1, duration: 1000 },
        { name: "r3", status: "ok", model: "m", review: "◉ **REVIEW VERDICT**: **APPROVE**\n\n○ **NO FINDINGS**: the change is clean, nothing to flag.\n", cost: 0.2, duration: 1000 },
        { name: "r4", status: "abgebrochen", reason: "kosten", model: "m", review: null, cost: 5.03, duration: 1000 }
    ].map((r) => evaluateRun(r, soll))
    const r1 = runs[0]
    check("Kennzahlen Lauf 1: Treffer B-01, B-02, B-03, B-06", eq(r1.treffer, [ "B-01", "B-02", "B-03", "B-06" ]))
    check("Kennzahlen Lauf 1: Trefferquoten je Stufe", r1.recall.offensichtlich === 1 && r1.recall.mittel === 0.3333 && r1.recall.versteckt === 0.5 && r1.recall.gesamt === 0.5714)
    check("Kennzahlen Lauf 1: Köder K-04, Fehlalarmquote 0,25", eq(r1.koeder_gemeldet, [ "K-04" ]) && r1.fehlalarmquote === 0.25)
    check("Kennzahlen Lauf 1: 1 nicht zuordenbar, 1 ACCEPTED, 1 Duplikat", r1.nicht_zuordenbar === 1 && r1.accepted === 1 && r1.duplikate === 1)
    check("Kennzahlen Lauf 2: unauswertbar mit 0 Treffern, ohne Fehlalarmquote", runs[1].status === "unauswertbar" && runs[1].recall.gesamt === 0 && runs[1].fehlalarmquote === null)
    const t = { recall_overall_min: 0.6, recall_obvious_min: 0.8, decoy_false_alarm_max: 0.25 }
    const agg = aggregate(runs, t)
    check("Aggregation: 4 Läufe, 3 ausgewertet, 1 abgebrochen", agg.laeufe.gesamt === 4 && agg.laeufe.ausgewertet === 3 && agg.laeufe.abgebrochen === 1)
    check("Aggregation: Trefferquote gesamt Mittel 0,1905, Min 0, Max 0,5714", agg.recall.gesamt.mittel === 0.1905 && agg.recall.gesamt.min === 0 && agg.recall.gesamt.max === 0.5714)
    check("Aggregation: offensichtlich Mittel 0,3333", agg.recall.offensichtlich.mittel === 0.3333)
    check("Aggregation: Fehlalarmquote Mittel 0,125 über 2 Läufe", agg.fehlalarmquote.mittel === 0.125 && agg.fehlalarmquote.n === 2)
    check("Schwelle: nicht erreicht bei 0,6 / 0,8 / 0,25 (Negativfall)", agg.schwelle.urteil === "nicht erreicht")
    const agg2 = aggregate(runs, { recall_overall_min: 0.1, recall_obvious_min: 0.3, decoy_false_alarm_max: 0.2 })
    check("Schwelle: erreicht bei 0,1 / 0,3 / 0,2", agg2.schwelle.urteil === "Schwelle erreicht")
    const agg3 = aggregate(runs, { recall_overall_min: 0.1, recall_obvious_min: 0.3, decoy_false_alarm_max: 0.1 })
    check("Schwelle: Fehlalarmquote 0,125 über Grenze 0,1 (Negativfall)", agg3.schwelle.urteil === "nicht erreicht")

    /*  SCN-023: calibration  */
    const full = { ...r1, recall: { ...r1.recall, gesamt: 1 } }
    check("Kalibrierung: alle Läufe mit Trefferquote 1 ergeben \"zu leicht\" mit nächstem Schritt",
        calibrate([ full, full, full ]).aussage === "zu leicht" && calibrate([ full ]).naechster_schritt !== null)
    check("Kalibrierung: ein Lauf darunter ergibt \"angemessen\"", calibrate([ full, full, r1 ]).aussage === "angemessen")
}

/*  SCN-004 (part): leak terms  */
check("Leck: \"sollliste\" wird erkannt", findLeak("// see sollliste") === "sollliste")
check("Leck: Sollliste-ID wird erkannt", findLeak("Fix B-03 now") === "B-03")
check("Leck: \"debug\" ist kein Treffer für \"bug\" (Negativfall)", findLeak("debug output") === null)
check("Leck: \"falls through\" ist erlaubt", findLeak("/* falls through */") === null)

/*  SCN-005, SCN-008, SCN-010, SCN-026: runner helpers  */
check("Serienbudget: 26 + 5 > 30 verweigert", seriesAllows(26, 5, 30) === false)
check("Serienbudget: 25 + 5 = 30 erlaubt", seriesAllows(25, 5, 30) === true)
{
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ase-rr-selftest-"))
    createRunDir(tmp, "x")
    let threw = false
    try {
        createRunDir(tmp, "x")
    }
    catch (err) {
        threw = true
    }
    check("Ergebnisordner wird nie überschrieben", threw)
    fs.rmSync(tmp, { recursive: true, force: true })
}
check("Isolation: fremdes Plugin wird erkannt", checkInit({ plugins: [ { name: "ase" }, { name: "agdf", source: "agdf@market" } ], mcp_servers: [ { name: "ase" } ] }).length === 1)
check("Isolation: nur ASE ist in Ordnung", checkInit({ plugins: [ { name: "ase" } ], mcp_servers: [ { name: "ase" } ] }).length === 0)
check("Isolation: eingebaute CLI-Plugins (@builtin) sind zugelassen",
    checkInit({ plugins: [ { name: "ase" }, { name: "cc-plugin-telemetry", path: "builtin", source: "cc-plugin-telemetry@builtin" } ], mcp_servers: [ { name: "ase" } ] }).length === 0)
check("Isolation: fremder MCP-Server (Konto-Konnektor) wird erkannt (Negativfall)",
    eq(checkInit({ plugins: [ { name: "ase" } ], mcp_servers: [ { name: "ase" }, { name: "claude.ai Notion" } ] }), [ "fremder MCP-Server geladen: claude.ai Notion" ]))
{
    const args = claudeArgs({ model: "sonnet", budget: 5, mcpConfigFile: "x.json" })
    const i = args.indexOf("--mcp-config")
    check("Aufruf: --strict-mcp-config und --mcp-config mit Datei", args.includes("--strict-mcp-config") && args[i + 1] === "x.json")
    check("Aufruf: MCP-Werkzeuge mcp__ase__*", args.includes("mcp__ase__*") && !args.some((a) => a.includes("plugin_ase")))
    check("MCP-Konfiguration: genau der Server ase", eq(Object.keys(mcpConfig().mcpServers), [ "ase" ]) && mcpConfig().mcpServers.ase.args.at(-1) === "mcp")
}
check("Isolation: fehlender ASE-MCP-Server wird erkannt", checkInit({ plugins: [ { name: "ase" } ], mcp_servers: [] }).length === 1)
{
    const use = (input) => ({ type: "assistant", message: { content: [ { type: "tool_use", name: "Read", input } ] } })
    check("Kontamination: Zugriff auf die Sollliste wird erkannt", checkContamination([ use({ file_path: "../../solution/sollliste.json" }) ]).length > 0)
    check("Kontamination: relativer Pfad in der Kopie ist in Ordnung", checkContamination([ use({ file_path: "src/cart.ts" }) ]).length === 0)
}
{
    const base = { CLAUDECODE: "1", CLAUDE_CODE_SIMPLE: "1", ANTHROPIC_BASE_URL: "http://host", ANTHROPIC_API_KEY: "k", PATH: "/usr/bin", BENCH_TOKEN: "geheim-123" }
    const env  = childEnv({ base, platform: "linux", baseUrl: "https://example.invalid", authTokenEnv: "BENCH_TOKEN" })
    check("Kindumgebung: geerbte CLAUDE*- und ANTHROPIC_*-Variablen entfernt", env.CLAUDECODE === undefined && env.CLAUDE_CODE_SIMPLE === undefined && env.ANTHROPIC_API_KEY === undefined)
    check("Kindumgebung: Endpunkt und Token gesetzt", env.ANTHROPIC_BASE_URL === "https://example.invalid" && env.ANTHROPIC_AUTH_TOKEN === "geheim-123")
    check("Kindumgebung: Protokoll enthält nur Namen, kein Token", !JSON.stringify(envSummary(env)).includes("geheim"))
    check("Kindumgebung: tool/bin vorne im PATH", env.PATH.split(path.delimiter)[0].endsWith(path.join("tool", "bin")))
}

/*  SCN-013 (part): deterministic serialization  */
check("Serialisierung: Schlüsselreihenfolge ist stabil", stableStringify({ b: 1, a: { d: 2, c: 3 } }) === stableStringify({ a: { c: 3, d: 2 }, b: 1 }))

process.stdout.write(`\n${passed} bestanden, ${failed} fehlgeschlagen\n`)
process.exit(failed === 0 ? 0 : 1)
