#!/usr/bin/env bash
##
##  run_agent_test.sh -- run the "ase agent" end-to-end system tests
##  (agent/ase-agent-test.mts) of all cases in parallel against the
##  Anthropic API, after an explicit confirmation, as every real run
##  burns real AI tokens
##
##  Usage: ./run_agent_test.sh [agent test options, e.g. --keep-failed --tool codex]
##
##  With "--case <name>", only this single case runs.
##
##  Environment:
##  -   ASE_TEST_JOBS=1:          run the cases one after the other instead of
##                                in parallel (e.g. for a single local model)
##  -   ASE_AGENT_TEST_CONFIRM=0: skip the cost confirmation (e.g. for a local
##                                model, see run_agent_test_local.sh)
##

set -euo pipefail

#   operate from the directory of this script (the "test/" directory)
cd "$(dirname "$0")"

#   the cases run in parallel: the sequential agent pipeline and the agent fleet
cases=(wordcount-python fibonacci-fleet)

#   a single case given explicitly ("--case") runs only this case (the option is
#   taken out of the passed-through options), while an option not suited for
#   all cases ("--suite-only", "--help") runs one plain test without a summary
single=0
nocost=0
caseGiven=0
args=()
while [[ $# -gt 0 ]]; do
    case "$1" in
        --case )            cases=("${2:?--case needs a case name}"); caseGiven=1; shift 2; continue ;;
        --case=* )          cases=("${1#--case=}"); caseGiven=1; shift; continue ;;
        --suite-only | --suite-only=* | -h | --help ) single=1 ;;
    esac
    case "$1" in
        --dry-run | --suite-only | --suite-only=* | -h | --help ) nocost=1 ;;
    esac
    args+=("$1")
    shift
done
set -- ${args[@]+"${args[@]}"}

#   warn about the costs and ask for confirmation
#   (runs without any agent spend no tokens, so need no confirmation)
if [[ $nocost -eq 0 && "${ASE_AGENT_TEST_CONFIRM:-1}" != "0" ]]; then
    cat <<'EOF'
This runs the "ase agent" end-to-end system tests.

WARNING: the real implementer, qualifier, and integrator agents run
against the Anthropic API (or the configured gateway), which consumes
actual tokens and costs actual money: roughly $1.60 per case, each case
capped at $5 by default via --max-cost-usd. Without --case, both cases
"wordcount-python" (sequential agents) and "fibonacci-fleet" (agent
fleet) run in parallel, i.e., roughly $3.20 in total.
A run takes about 5-10 minutes (at most 30 minutes per agent, see --timeout).

EOF
    read -r -p "Run the agent test now? [y/N] " answer
    if [[ "$answer" != "y" && "$answer" != "Y" ]]; then
        echo "aborted -- no test was run"
        exit 0
    fi
fi

#   run a single plain test, passing through all test options
if [[ $single -eq 1 ]]; then
    [[ $caseGiven -eq 1 ]] && set -- --case "${cases[0]}" "$@"
    exec node agent/ase-agent-test.mts "$@"
fi

#   run the tests of all cases in parallel (resp. one after the other with
#   ASE_TEST_JOBS=1), each with its output prefixed by its case name, and
#   captured for the summary
set -o pipefail
logdir=$(mktemp -d "${TMPDIR:-/tmp}/run-agent-test-XXXXXX")
trap 'rm -rf "$logdir"' EXIT
serial=0
[[ "${ASE_TEST_JOBS:-}" == "1" ]] && serial=1
rcs=()
for c in "${cases[@]}"; do
    node agent/ase-agent-test.mts --case "$c" "$@" 2>&1 | tee "$logdir/$c.log" | sed -u "s/^/[$c] /" &
    if [[ $serial -eq 1 ]]; then
        rc=0
        wait $! || rc=$?
        rcs+=("$rc")
    else
        rcs+=("pid:$!")
    fi
done

#   await all tests, collecting per case its name, exit code, captured log,
#   and its result file (as named by the "results:" line of its report)
worst=0
summary=()
for i in "${!cases[@]}"; do
    rc="${rcs[$i]}"
    if [[ "$rc" == pid:* ]]; then
        pid="${rc#pid:}"
        rc=0
        wait "$pid" || rc=$?
    fi
    [[ $rc -gt $worst ]] && worst=$rc
    log="$logdir/${cases[$i]}.log"
    dir=$(grep -o 'results: `[^`]*`' "$log" | tail -1 | sed 's/^results: `//; s/`$//' || true)
    summary+=("${cases[$i]}" "$rc" "$log" "${dir:+$dir/result.json}")
done

#   output the summary of all tests
node - "${summary[@]}" <<'EOF'
const fs   = require("node:fs")
const path = require("node:path")
const argv = process.argv.slice(2)
const rows = []
for (let i = 0; i < argv.length; i += 4) {
    const [ name, rc, log, file ] = argv.slice(i, i + 4)
    let r = null
    try { r = file !== "" ? JSON.parse(fs.readFileSync(file, "utf8")) : null } catch { r = null }
    rows.push({ name, rc: Number(rc), log, r })
}
const pad   = (s, n) => String(s).padEnd(n)
const width = Math.max(4, ...rows.map((row) => row.name.length)) + 2
const out   = []
out.push("", "=".repeat(30) + " ase agent test summary " + "=".repeat(30))
out.push(pad("CASE", width) + pad("VERDICT", 17) + pad("DURATION", 10) + pad("COST", 8) + pad("SUITE", 8) + "FAILURE")
let total = 0
const count = { PASS: 0, FAIL: 0, ERROR: 0 }
for (const { name, rc, log, r } of rows) {
    const verdict = r !== null ? r.verdict : "ERROR"
    count[verdict] = (count[verdict] ?? 0) + 1
    if (r === null) {
        out.push(pad(name, width) + pad("ERROR", 17) + pad("-", 10) + pad("-", 8) + pad("-", 8) + `exit ${rc}, no result.json`)
        let tail = []
        try { tail = fs.readFileSync(log, "utf8").trimEnd().split("\n").slice(-3) } catch {}
        for (const line of tail)
            out.push(`  | ${line}`)
        continue
    }
    total += r.costUsd
    const dry   = r.failure === "dry-run"
    const suite = r.suite !== null ? `${r.suite.passed}/${r.suite.expected}` : "-"
    out.push(pad(name, width) + pad(verdict + (dry ? " (dry-run)" : ""), 17) +
        pad(`${(r.durationMs / 60000).toFixed(1)}m`, 10) + pad(`$${r.costUsd.toFixed(2)}`, 8) +
        pad(suite, 8) + (dry || r.failure === "" ? "-" : r.failure.split("\n")[0]))
    if (verdict !== "PASS") {
        for (const check of r.checks.filter((check) => !check.pass))
            out.push(`  ✗ ${check.name}: ${check.detail}`)
        out.push(`  report: ${path.relative(process.cwd(), path.join(r.results, "report.md"))}`)
    }
}
out.push("-".repeat(84))
out.push(`${count.PASS} passed, ${count.FAIL} failed, ${count.ERROR} errors -- total $${total.toFixed(2)}`, "")
process.stdout.write(out.join("\n"))
EOF
exit $worst
