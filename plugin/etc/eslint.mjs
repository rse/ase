/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under GPL 3.0 <https://spdx.org/licenses/GPL-3.0-only>
*/

import { defineConfig } from "eslint/config"
import markdown         from "@eslint/markdown"
import md               from "eslint-markdown"

export default defineConfig([
    // markdown.configs.recommended,
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

