#!/usr/bin/env bash
##
##  run_agent_test_local.sh -- run the "ase agent" end-to-end system tests
##  of all cases (via run_agent_test.sh, incl. its summary) against a locally
##  served model behind an Anthropic-compatible gateway (e.g. a LiteLLM
##  proxy), configured through an LLM gateway profile (same format as for
##  run_all_tests_local.sh)
##
##  Usage: ./run_agent_test_local.sh [<profile>] [agent test options, e.g. --dry-run, --case <name>]
##
##  The profile is taken from the first argument, else from $ASE_TEST_LLM,
##  else from "etc/llm-local.env". With ASE_TEST_JOBS=1 (as set by the sample
##  profile), the cases run one after the other instead of in parallel.
##

set -euo pipefail

#   operate from the directory of this script (the "test/" directory)
cd "$(dirname "$0")"

#   determine the LLM gateway profile
profile=""
if [[ $# -gt 0 && "$1" != -* ]]; then
    profile="$1"
    shift
elif [[ -n "${ASE_TEST_LLM:-}" ]]; then
    profile="$ASE_TEST_LLM"
elif [[ -f etc/llm-local.env ]]; then
    profile="etc/llm-local.env"
fi
if [[ -z "$profile" || ! -f "$profile" ]]; then
    echo "LLM gateway profile not found: ${profile:-(none)} -- see etc/llm-local.env.sample" >&2
    exit 2
fi

#   export the profile (variables already exported take precedence)
while IFS="=" read -r key value; do
    [[ -z "$key" || "$key" == \#* ]] && continue
    [[ -z "${!key+x}" ]] && export "$key=$value"
done < <(grep -E "^[A-Za-z_][A-Za-z0-9_]*=" "$profile")

#   the agent test forwards only ANTHROPIC_API_KEY, ANTHROPIC_BASE_URL,
#   ANTHROPIC_AUTH_TOKEN and ANTHROPIC_*MODEL into its sandbox; pin all
#   model aliases onto the local model so no unknown "claude-*" name leaks
export ANTHROPIC_MODEL="${ANTHROPIC_MODEL:-${ASE_TEST_MODEL:-default_model}}"
for tier in OPUS SONNET HAIKU; do
    var="ANTHROPIC_DEFAULT_${tier}_MODEL"
    [[ -z "${!var:-}" ]] && export "$var=$ANTHROPIC_MODEL"
done
unset ANTHROPIC_AUTH_TOKEN

echo "Running the \"ase agent\" system tests against the gateway $ANTHROPIC_BASE_URL (model \"$ANTHROPIC_MODEL\")"
if [[ "${ASE_TEST_JOBS:-}" == "1" ]]; then
    echo "one case after the other (ASE_TEST_JOBS=1)."
else
    echo "with the cases in parallel (set ASE_TEST_JOBS=1 to serialize them)."
fi
echo "Note: local runs can take VERY long, and the reported costs are meaningless."
ASE_AGENT_TEST_CONFIRM=0 exec ./run_agent_test.sh "$@"
