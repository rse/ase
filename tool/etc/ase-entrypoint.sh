#!/bin/bash
##
##  Agentic Software Engineering (ASE)
##  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
##  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
##

#   container entrypoint: ensure Claude Code CLI and ASE plugin
#   exist on a fresh home volume and then run the given command

set -eo pipefail

if [[ ! -x "$HOME/.local/bin/claude" ]]; then
    echo "++ installing Claude Code"
    curl -fsSL https://claude.ai/install.sh | bash
fi

if ! grep -qs '"ase@ase"' "$HOME/.claude/plugins/installed_plugins.json"; then
    echo "++ installing ASE into Claude Code"
    ase setup install
fi

exec "$@"

