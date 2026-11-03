#!/usr/bin/env node
/*
**  ASE review benchmark -- runner (AC-003 to AC-005, AC-008, AC-012, AC-013)
**  Usage: node run.mjs --help
*/

import fs   from "node:fs"
import path from "node:path"

import { REPO_DIR, RESULTS_DIR, TESTDATA_DIR, SOLL_FILE, THRESH_FILE, readJson, sha256, stableStringify } from "./lib/common.mjs"
import { buildCopy, removeCopy, fixtureDigest } from "./lib/kopie.mjs"
import { checkCopy }                            from "./lib/leck.mjs"
import { parseReview }                          from "./lib/parser.mjs"
import { thresholdVersion }                     from "./lib/bericht.mjs"
import {
    PROMPT, claudeArgs, childEnv, envSummary, claudeProgram, runChild, checkInit, checkContamination,
    transcriptFacts, cliVersion, aseInfo, userAseConfig, createRunDir, stamp, modelShort, seriesAllows, isAlive
} from "./lib/runner.mjs"

const HELP = `Aufruf: node run.mjs [Optionen]

  --model <modell>          Modell für claude -p (Standard: sonnet)
  --runs <n>                Zahl der Läufe (Standard: 1)
  --budget <usd>            Kostengrenze je Lauf (Standard: 5)
  --timeout-min <min>       Zeitgrenze je Lauf in Minuten (Standard: 20)
  --total-budget <usd>      Serienbudget aller Läufe dieses Aufrufs (Standard: 30)
  --prior-spent <usd>       bereits verbrauchte Kosten der Serie (Standard: 0)
  --confirm-paid            ausdrückliches Kennzeichen für bezahlte Läufe
  --base-url <url>          anderer API-Endpunkt (setzt ANTHROPIC_BASE_URL)
  --auth-token-env <VAR>    Name der Umgebungsvariable mit dem Token (setzt ANTHROPIC_AUTH_TOKEN)
  --out <ordner>            Ablage der Ergebnisordner (Standard: results/)
  --keep                    Wegwerfkopie nach dem Lauf behalten
  --dry-run                 Trockenlauf ohne Modellaufruf
  --replay <datei>          gestellte stream-json-Mitschrift für den Trockenlauf
                            (Standard: testdata/normal.jsonl)
  --simulate <fall>         Sonderfall im Trockenlauf: abort-cost, abort-time, unparseable, leak
  --help                    diese Hilfe
`

/*  parse the command line  */
function options (argv) {
    const o = {
        model: "sonnet", runs: 1, budget: 5, timeoutMin: 20, totalBudget: 30, priorSpent: 0,
        confirmPaid: false, baseUrl: null, authTokenEnv: null, out: RESULTS_DIR, keep: false,
        dryRun: false, replay: null, simulate: null
    }
    const num = (v, name) => {
        const n = Number(v)
        if (!Number.isFinite(n) || n < 0)
            throw new Error(`${name} braucht eine Zahl ≥ 0`)
        return n
    }
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]
        const v = () => {
            if (i + 1 >= argv.length)
                throw new Error(`${a} braucht einen Wert`)
            return argv[++i]
        }
        if      (a === "--model")          o.model        = v()
        else if (a === "--runs")           o.runs         = Math.max(1, Math.floor(num(v(), a)))
        else if (a === "--budget")         o.budget       = num(v(), a)
        else if (a === "--timeout-min")    o.timeoutMin   = num(v(), a)
        else if (a === "--total-budget")   o.totalBudget  = num(v(), a)
        else if (a === "--prior-spent")    o.priorSpent   = num(v(), a)
        else if (a === "--confirm-paid")   o.confirmPaid  = true
        else if (a === "--base-url")       o.baseUrl      = v()
        else if (a === "--auth-token-env") o.authTokenEnv = v()
        else if (a === "--out")            o.out          = path.resolve(v())
        else if (a === "--keep")           o.keep         = true
        else if (a === "--dry-run")        o.dryRun       = true
        else if (a === "--replay")         o.replay       = path.resolve(v())
        else if (a === "--simulate")       o.simulate     = v()
        else if (a === "--help")           o.help         = true
        else
            throw new Error(`unbekannte Option: ${a}`)
    }
    if (o.simulate !== null && ![ "abort-cost", "abort-time", "unparseable", "leak" ].includes(o.simulate))
        throw new Error(`unbekannter Sonderfall: ${o.simulate}`)
    if (!o.dryRun && (o.replay !== null || o.simulate !== null))
        throw new Error("--replay und --simulate nur mit --dry-run")
    return o
}

/*  preconditions before any model call (PRD section 4, SDD-013)  */
function preflight (o) {
    const problems = []
    try {
        const soll = readJson(SOLL_FILE)
        if (!Array.isArray(soll.eintraege))
            problems.push("Sollliste ungültig: node check.mjs ausführen")
    }
    catch (err) {
        problems.push(`Sollliste fehlt oder ist kein JSON (${SOLL_FILE})`)
    }
    let thresholds = null
    try {
        thresholds = readJson(THRESH_FILE)
    }
    catch (err) {
        problems.push(`Schwellendatei fehlt oder ist kein JSON (${THRESH_FILE})`)
    }
    if (o.dryRun)
        return problems
    if (!o.confirmPaid)
        problems.push("bezahlter Lauf ohne --confirm-paid: erst Kostenfreigabe einholen, dann mit --confirm-paid starten")
    const tv = thresholdVersion()
    if (thresholds !== null && (tv.commit === null || tv.geaendert))
        problems.push("thresholds.json ist nicht committet oder geändert: Schwellendatei vor dem Messlauf committen")
    if (!fs.existsSync(path.join(REPO_DIR, "tool", "dst", "ase.js")))
        problems.push("tool/ ist nicht gebaut: cd tool && npm start build")
    if (o.budget > 5 || o.totalBudget > 30)
        problems.push("Grenzen über den freigegebenen Werten (5 USD je Lauf, 30 USD gesamt)")
    if (o.timeoutMin > 20)
        problems.push("Zeitgrenze über 20 Minuten")
    return problems
}

/*  events for a dry run: replay file or synthesized special case  */
function dryEvents (o) {
    if (o.simulate === "abort-cost")
        return [
            { type: "system", subtype: "init", model: "claude-sonnet-5-5", plugins: [ { name: "ase" } ], mcp_servers: [ { name: "plugin:ase:ase", status: "connected" } ] },
            { type: "result", subtype: "error_max_budget_usd", is_error: true, total_cost_usd: 5.03, modelUsage: { "claude-sonnet-5-5": {} }, permission_denials: [] }
        ]
    const file = o.replay ?? path.join(TESTDATA_DIR, o.simulate === "unparseable" ? "unparseable.jsonl" : "normal.jsonl")
    return fs.readFileSync(file, "utf8").split(/\r?\n/).filter((l) => l.trim() !== "").map((l) => JSON.parse(l))
}

/*  one run  */
async function oneRun (o, nr, env, program, pre) {
    const started = new Date()
    const name    = `${stamp(started)}-${modelShort(o.model)}-${nr}${o.dryRun ? "-dry" : ""}`
    const dir     = createRunDir(o.out, name)
    const copy    = buildCopy()
    const meta    = {
        schema:          1,
        status:          null,
        reason:          null,
        details:         [],
        dry_run:         o.dryRun,
        simulate:        o.simulate,
        replay:          o.replay ? path.basename(o.replay) : (o.dryRun ? "normal.jsonl" : null),
        model:           { requested: o.model, reported: [] },
        endpoint:        { base_url: o.baseUrl ?? "default", token_gesetzt: Boolean(o.authTokenEnv) },
        child_env:       envSummary(env),
        cli_version:     o.dryRun ? null : cliVersion(program, pre),
        ase:             aseInfo(),
        user_ase_config: userAseConfig(),
        started_at:      started.toISOString(),
        duration_ms:     null,
        cost_usd:        null,
        budget_usd:      o.budget,
        timeout_min:     o.timeoutMin,
        permission_denials: null,
        invocation:      { program: o.dryRun ? "(Trockenlauf)" : program, args: [ ...pre, ...claudeArgs(o) ], prompt: PROMPT },
        fixture_digest:  fixtureDigest(),
        sollliste_digest: sha256(fs.readFileSync(SOLL_FILE)),
        copy_dir:        o.keep ? copy.dir : null
    }
    const finish = (review) => {
        meta.duration_ms = Date.now() - started.getTime()
        if (review !== null)
            fs.writeFileSync(path.join(dir, "review.md"), review)
        fs.writeFileSync(path.join(dir, "run.json"), stableStringify(meta))
        if (!o.keep)
            removeCopy(copy)
        return meta
    }

    /*  leak check before any model call (SDD-004)  */
    if (o.simulate === "leak") {
        fs.appendFileSync(path.join(copy.dir, "src", "api.ts"), "\n// see sollliste\n")
        fs.writeFileSync(path.join(copy.dir, "NOTES.md"), "B-03\n")
    }
    const leaks = checkCopy(copy.dir)
    if (leaks.length > 0) {
        meta.status  = "fehler"
        meta.reason  = "leck"
        meta.details = leaks
        fs.writeFileSync(path.join(dir, "transcript.jsonl"), "")
        fs.writeFileSync(path.join(dir, "stderr.txt"), "")
        return finish(null)
    }

    /*  model call or dry-run replay  */
    let events, stopped = null
    const timeoutMs = o.simulate === "abort-time" ? 3000 : o.timeoutMin * 60 * 1000
    if (o.dryRun && o.simulate !== "abort-time") {
        events = dryEvents(o)
        fs.writeFileSync(path.join(dir, "transcript.jsonl"), events.map((e) => JSON.stringify(e)).join("\n") + "\n")
        fs.writeFileSync(path.join(dir, "stderr.txt"), "")
        const init = events.find((e) => e.type === "system" && e.subtype === "init")
        const problems = init ? checkInit(init) : [ "kein init-Ereignis" ]
        if (problems.length > 0)
            stopped = { status: "fehler", reason: "isolation", details: problems }
    }
    else {
        const child = o.simulate === "abort-time"
            ? { program: process.execPath, args: [ path.join(TESTDATA_DIR, "sim-hang.mjs"), path.join(dir, "grandchild.pid") ] }
            : { program, args: [ ...pre, ...claudeArgs(o) ] }
        const res = await runChild({
            program: child.program, args: child.args, cwd: copy.dir, env, timeoutMs,
            transcriptFile: path.join(dir, "transcript.jsonl"),
            stderrFile:     path.join(dir, "stderr.txt"),
            onInit:         checkInit
        })
        events  = res.events
        stopped = res.stopped
        if (o.simulate === "abort-time") {
            const pidFile = path.join(dir, "grandchild.pid")
            const gpid    = fs.existsSync(pidFile) ? Number(fs.readFileSync(pidFile, "utf8")) : null
            await new Promise((r) => setTimeout(r, 500))
            meta.prozessbaum_beendet = { kind: !isAlive(res.pid), enkel: gpid === null ? null : !isAlive(gpid) }
        }
    }

    /*  facts, limits, contamination  */
    const facts = transcriptFacts(events)
    meta.model.reported      = facts.reported
    meta.cost_usd            = facts.cost
    meta.permission_denials  = facts.denials
    if (stopped !== null) {
        meta.status  = stopped.status
        meta.reason  = stopped.reason
        meta.details = stopped.details ?? []
        return finish(facts.text)
    }
    if (facts.result?.subtype === "error_max_budget_usd" || (facts.cost !== null && facts.cost > o.budget)) {
        meta.status = "abgebrochen"
        meta.reason = "kosten"
        return finish(facts.text)
    }
    const contamination = checkContamination(events)
    if (contamination.length > 0) {
        meta.status  = "fehler"
        meta.reason  = "kontamination"
        meta.details = contamination
        return finish(facts.text)
    }
    if (facts.result === null) {
        meta.status = "fehler"
        meta.reason = "kein Ergebnis"
        return finish(null)
    }
    meta.status = parseReview(facts.text).status
    return finish(facts.text)
}

/*  main  */
async function main () {
    let o
    try {
        o = options(process.argv.slice(2))
    }
    catch (err) {
        process.stderr.write(`${err.message}\n\n${HELP}`)
        return 2
    }
    if (o.help) {
        process.stdout.write(HELP)
        return 0
    }
    const problems = preflight(o)
    if (problems.length > 0) {
        process.stderr.write("Voraussetzungen nicht erfüllt, kein Modellaufruf:\n" + problems.map((p) => `  - ${p}\n`).join(""))
        return 1
    }
    let env
    try {
        env = childEnv({ baseUrl: o.baseUrl, authTokenEnv: o.authTokenEnv })
    }
    catch (err) {
        process.stderr.write(`${err.message}\n`)
        return 1
    }
    const { program, pre } = claudeProgram()
    fs.mkdirSync(o.out, { recursive: true })
    let spent = o.priorSpent
    for (let nr = 1; nr <= o.runs; nr++) {
        if (!o.dryRun && !seriesAllows(spent, o.budget, o.totalBudget)) {
            process.stderr.write(`Serienbudget erreicht: ${spent.toFixed(2)} USD verbraucht, `
                + `nächster Lauf könnte ${o.budget} USD kosten, Grenze ${o.totalBudget} USD. Kein weiterer Lauf.\n`)
            return 3
        }
        const meta = await oneRun(o, nr, env, program, pre)
        spent += meta.cost_usd ?? 0
        process.stdout.write(`Lauf ${nr}/${o.runs}: ${meta.status}${meta.reason ? ` (${meta.reason})` : ""}, `
            + `Kosten ${meta.cost_usd === null ? "–" : meta.cost_usd.toFixed(2)} USD, `
            + `Dauer ${Math.round(meta.duration_ms / 1000)} s\n`)
        for (const d of meta.details)
            process.stdout.write(`  - ${d}\n`)
    }
    return 0
}

process.exitCode = await main()
