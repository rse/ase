/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import { defineConfig } from "eslint/config"
import md               from "eslint-markdown"

export default defineConfig([
    md.configs.recommended,
    {
        files: [
            "meta/*.md",
            "skills/**/*.md"
        ],
        rules: {
            "md/no-double-space":     "off",
            "md/code-lang-shorthand": "off",
            "md/no-irregular-dash":   "off"
        }
    }
])

