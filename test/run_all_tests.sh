#!/usr/bin/env bash
##
##  run_all_tests.sh -- run all cases of the ASE skill test harness,
##  after an explicit confirmation, as every run burns real AI tokens
##
##  Usage: ./run_all_tests.sh [harness options, e.g. --jobs=6 -K]
##

set -euo pipefail

#   operate from the directory of this script (the "test/" directory)
cd "$(dirname "$0")"

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
