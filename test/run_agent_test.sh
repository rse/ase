#!/usr/bin/env bash
##
##  run_agent_test.sh -- run the "ase agent" end-to-end system test
##  (agent/ase-agent-test.mts) against the Anthropic API, after an
##  explicit confirmation, as every real run burns real AI tokens
##
##  Usage: ./run_agent_test.sh [agent test options, e.g. --keep-failed --tool codex]
##

set -euo pipefail

#   operate from the directory of this script (the "test/" directory)
cd "$(dirname "$0")"

#   runs without any agent spend no tokens, so need no confirmation
for arg in "$@"; do
    case "$arg" in
        --dry-run | --suite-only | --suite-only=* | -h | --help )
            exec node agent/ase-agent-test.mts "$@"
            ;;
    esac
done

#   warn about the costs and ask for confirmation
cat <<'EOF'
This runs the "ase agent" end-to-end system test.

WARNING: the real implementer, qualifier, and integrator agents run
against the Anthropic API (or the configured gateway), which consumes
actual tokens and costs actual money (roughly $1.60 for the case
"wordcount-python", capped at $5 by default via --max-cost-usd).
A run takes about 5 minutes (at most 30 minutes per agent, see --timeout).

EOF
read -r -p "Run the agent test now? [y/N] " answer
if [[ "$answer" != "y" && "$answer" != "Y" ]]; then
    echo "aborted -- no test was run"
    exit 0
fi

#   run the test, passing through any additional test options
exec node agent/ase-agent-test.mts "$@"
