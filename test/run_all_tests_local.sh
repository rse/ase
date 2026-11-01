#!/usr/bin/env bash
##
##  run_all_tests_local.sh -- run all cases of the ASE skill test harness
##  against a locally served model behind an Anthropic-compatible gateway
##  (e.g. a LiteLLM proxy), configured through an LLM gateway profile
##
##  Usage: ./run_all_tests_local.sh [<profile>] [harness options, e.g. -K]
##
##  The profile is taken from the first argument, else from $ASE_TEST_LLM,
##  else from "etc/llm-local.env"; without any of them, it is asked for.
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

#   without a profile, show the sample and ask for one
if [[ -z "$profile" ]]; then
    echo "No local LLM gateway profile provided. Example profile (etc/llm-local.env.sample):"
    echo ""
    cat etc/llm-local.env.sample
    echo ""
    echo "Copy it to e.g. \"etc/llm-local.env\" (git-ignored) and adjust it."
    read -r -p "Path to the LLM gateway profile (empty to abort): " profile
    if [[ -z "$profile" ]]; then
        echo "aborted -- no tests were run"
        exit 1
    fi
fi
if [[ ! -f "$profile" ]]; then
    echo "LLM gateway profile not found: $profile" >&2
    exit 2
fi

#   run all cases against the gateway, passing through any additional harness options
echo "Running ALL test cases against the gateway of profile \"$profile\"."
echo ""
echo "WARNING: local runs can take VERY long (more than an hour for the full suite),"
echo "as a locally served model generates far slower than the Anthropic API and the"
echo "runs are usually serialized (ASE_TEST_JOBS=1)."
echo ""
echo "Note: the judges and simulators run there, too, and the reported costs are meaningless."
exec node --import tsx src/ase-test.ts --llm="$profile" "$@"
