/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under GPL 3.0 <https://spdx.org/licenses/GPL-3.0-only>
*/

import pluginJs        from "@eslint/js"
import pluginTS        from "typescript-eslint"
import pluginStylistic from "@stylistic/eslint-plugin"
import pluginAstro     from "eslint-plugin-astro"
import globals         from "globals"
import parserTS        from "@typescript-eslint/parser"

/*  shared code-style rules, matching the conventions used across the ASE repository  */
const styleRules = {
    "curly":                                              "off",
    "dot-notation":                                       "off",
    "no-labels":                                          "off",
    "no-empty":                                           [ "error", { allowEmptyCatch: true } ],

    /*  indentation is left to the author: inside Astro components the
        frontmatter fence and template offsets make automatic indentation
        checking unreliable (it also fights inline <script> blocks)  */
    "@stylistic/indent":                                  "off",
    "@stylistic/linebreak-style":                         [ "error", "unix" ],
    "@stylistic/semi":                                    [ "error", "never" ],
    "@stylistic/operator-linebreak":                      [ "error", "after", { overrides: { "&&": "before", "||": "before", ":": "after" } } ],
    "@stylistic/brace-style":                             [ "error", "stroustrup", { allowSingleLine: true } ],
    "@stylistic/quotes":                                  [ "error", "double" ],

    "@stylistic/no-multi-spaces":                         "off",
    "@stylistic/no-multiple-empty-lines":                 "off",
    "@stylistic/key-spacing":                             "off",
    "@stylistic/object-property-newline":                 "off",
    "@stylistic/space-in-parens":                         "off",
    "@stylistic/array-bracket-spacing":                   "off",
    "@stylistic/multiline-ternary":                       "off",
    "@stylistic/quote-props":                             "off",

    "@typescript-eslint/no-empty-function":               "off",
    "@typescript-eslint/no-explicit-any":                 "off",
    "@typescript-eslint/no-unused-vars":                  "off",
    "@typescript-eslint/ban-ts-comment":                  "off",
    "@typescript-eslint/no-non-null-assertion":           "off",
    "@typescript-eslint/consistent-type-definitions":     "off",
    "@typescript-eslint/array-type":                      "off",
    "@typescript-eslint/consistent-indexed-object-style": "off"
}

export default [
    pluginJs.configs.recommended,
    ...pluginTS.configs.strict,
    ...pluginTS.configs.stylistic,
    ...pluginAstro.configs.recommended,
    {
        plugins: {
            "@stylistic": pluginStylistic
        }
    },

    /*  global ignores  */
    {
        ignores: [ "dst/", ".astro/", "node_modules/" ]
    },

    /*  plain TypeScript modules (src/data, etc.)  */
    {
        files: [ "src/**/*.ts" ],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType:  "module",
            parser: parserTS,
            globals: {
                ...globals.node,
                ...globals.browser
            }
        },
        rules: styleRules
    },

    /*  Astro single-file components (frontmatter + template scripts)  */
    {
        files: [ "src/**/*.astro" ],
        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.browser
            }
        },
        rules: styleRules
    }
]
