#!/usr/bin/env bash
##
##  run_all_tests.sh -- run all cases of the ASE skill test harness,
##  after an explicit confirmation, as every run burns real AI tokens
##
##  Usage: ./run_all_tests.sh [--force-model <model>] [harness options, e.g. --jobs=6 -K]
##
##  With "--force-model <model>", all models (session, sub-agent aliases,
##  judge, and simulator, even per-case "turns.model") are forced to <model>.
##

set -euo pipefail

#   operate from the directory of this script (the "test/" directory)
cd "$(dirname "$0")"

#   take option "--force-model" out of the passed-through harness options
forceModel=""
args=()
while [[ $# -gt 0 ]]; do
    case "$1" in
        --force-model )   forceModel="${2:?--force-model needs a model name}"; shift 2; continue ;;
        --force-model=* ) forceModel="${1#--force-model=}"; shift; continue ;;
    esac
    args+=("$1")
    shift
done
set -- ${args[@]+"${args[@]}"}

#   force all models onto the given one
if [[ -n "$forceModel" ]]; then
    for var in ASE_TEST_FORCE_MODEL ASE_TEST_MODEL ASE_TEST_JUDGE_MODEL ASE_TEST_SIM_MODEL \
        ANTHROPIC_MODEL ANTHROPIC_DEFAULT_OPUS_MODEL ANTHROPIC_DEFAULT_SONNET_MODEL ANTHROPIC_DEFAULT_HAIKU_MODEL; do
        export "$var=$forceModel"
    done
    echo "forcing all models to: $forceModel"
fi

#   warn about the costs and ask for confirmation
cat <<'EOF'
This runs ALL test cases of the ASE skill test harness.

WARNING: every case runs real agent sessions against the Anthropic API
(or the configured gateway), which consumes actual tokens and costs
actual money (roughly $8 for the full suite, capped at $20 by default
via --max-cost-usd).

EOF
read -r -p "Run all tests now? [y/N] " answer
if [[ "$answer" != "y" && "$answer" != "Y" ]]; then
    echo "aborted -- no tests were run"
    exit 0
fi

#   run all cases, passing through any additional harness options
exec node --import tsx src/ase-test.ts "$@"
