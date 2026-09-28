/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import * as v                    from "valibot"
import { foregroundColorNames }  from "chalk"

import type { ScopeTerm }        from "./ase-config-scope.js"
import { checkIdScheme }         from "./ase-task-format.js"

/*  classification taxonomy  */
export const projectClassification = {
    boxing:    [ "white", "grey", "black" ],
    lifecycle: [ "solo", "team", "enterprise" ]
} as const

/*  agent classification taxonomy  */
export const agentClassification = {
    persona:  [ "writer", "engineer", "journalist", "telegrapher", "caveman" ],
    guidance: [ "none", "minimal", "normal", "verbose" ]
} as const

/*  the default colors of the four color roles of the terminal board
    ("default" is the foreground color of the terminal)  */
export const tuiColorDefaults = {
    dim:     "grey",
    normal:  "default",
    accent:  "blue",
    signal:  "red"
} as const

/*  the default base colors of the four color roles of the web board  */
export const webColorDefaults = {
    dim:     "grey",
    normal:  "black",
    accent:  "blue",
    signal:  "orange"
} as const

/*  classification presets  */
export const projectClassificationPresets: Record<string, Record<string, string>> = {
    vibe: {
        "agent.persona":   "writer",
        "project.name":    "Example Project",
        "project.boxing":  "black"
    },
    pro: {
        "agent.persona":   "engineer",
        "project.name":    "Example Project",
        "project.boxing":  "white"
    },
    default: {
        "agent.task":      "default",
        "agent.persona":   "engineer",
        "agent.guidance":  "normal",
        "project.name":    "Example Project",
        "project.boxing":  "white",
        "project.task.lifecycle":        "solo",
        "project.task.idscheme":         "slug",
        "project.task.store":            "ase:./.ase/task",
        "project.artifact.spec.basedir": "docs/specbook",
        "project.artifact.spec.files":   "*.{md,txt,svg,png,jpg}",
        "project.artifact.spec.schema":  "",
        "project.artifact.code.basedir": "src",
        "project.artifact.code.files":   "** !**/etc/** !**/{.gitignore,.npmignore,package.json}",
        "project.artifact.docs.basedir": "doc",
        "project.artifact.docs.files":   "** **/{README,LICENSE,CHANGELOG}.{md,txt} !{spec,arch}/**",
        "project.artifact.infr.basedir": "",
        "project.artifact.infr.files":   "**/{.github,.claude*,etc}/** **/{AGENTS.md,{package,tsconfig*}.json,.{git,npm}ignore}",
        "board.tui.color.dim":           tuiColorDefaults.dim,
        "board.tui.color.normal":        tuiColorDefaults.normal,
        "board.tui.color.accent":        tuiColorDefaults.accent,
        "board.tui.color.signal":        tuiColorDefaults.signal,
        "board.web.color.dim":           webColorDefaults.dim,
        "board.web.color.normal":        webColorDefaults.normal,
        "board.web.color.accent":        webColorDefaults.accent,
        "board.web.color.signal":        webColorDefaults.signal,
        "board.web.editor.keymap":       "default"
    },
    industry: {
        "agent.persona":   "engineer",
        "project.name":    "Example Project",
        "project.boxing":  "grey"
    }
}

/*  hard-coded map: which scope kinds each variable may be SET on
    (reads always cascade through the full chain; this restricts writes only);
    keys absent from this map default to all non-"default" scope kinds  */
export const configWritableScopes: Record<string, ReadonlyArray<ScopeTerm["kind"]>> = {
    "agent.task":                    [ "session" ],
    "agent.skill":                   [ "session" ],
    "project.basedir":               [ "session" ],
    "project.task.store":            [ "user", "project" ],
    "project.task.token":            [ "user" ],
    "project.task.lifecycle":        [ "user", "project" ],
    "project.task.idscheme":         [ "user", "project" ],
    "project.artifact.spec.basedir": [ "user", "project" ],
    "project.artifact.spec.files":   [ "user", "project" ],
    "project.artifact.spec.schema":  [ "user", "project" ],
    "project.artifact.code.basedir": [ "user", "project" ],
    "project.artifact.code.files":   [ "user", "project" ],
    "project.artifact.docs.basedir": [ "user", "project" ],
    "project.artifact.docs.files":   [ "user", "project" ],
    "project.artifact.infr.basedir": [ "user", "project" ],
    "project.artifact.infr.files":   [ "user", "project" ],
    "board.tui.color.dim":           [ "user", "project" ],
    "board.tui.color.normal":        [ "user", "project" ],
    "board.tui.color.accent":        [ "user", "project" ],
    "board.tui.color.signal":        [ "user", "project" ],
    "board.web.color.dim":           [ "user", "project" ],
    "board.web.color.normal":        [ "user", "project" ],
    "board.web.color.accent":        [ "user", "project" ],
    "board.web.color.signal":        [ "user", "project" ],
    "board.web.editor.keymap":       [ "user", "project" ]
}

/*  default set of scope kinds writable for any unrestricted key  */
export const configWritableScopesDefault: ReadonlyArray<ScopeTerm["kind"]> =
    [ "user", "project", "task", "session" ]

/*  keys carrying secrets, whose values are masked in listings  */
export const configSecretKeys: ReadonlyArray<string> = [ "project.task.token" ]

/*  schema for a single artifact kind's "basedir"/"files" specification  */
const artifactSchema = v.optional(v.strictObject({
    basedir: v.optional(v.string()),
    files:   v.optional(v.string())
}))

/*  schema for the "spec" artifact kind, additionally carrying the
    whitespace-separated list of SpecBook YAML "schema" configuration
    files, with "std" naming the bundled standard one (empty: "std")  */
const artifactSpecSchema = v.optional(v.strictObject({
    basedir: v.optional(v.string()),
    files:   v.optional(v.string()),
    schema:  v.optional(v.string())
}))

/*  schema for a terminal color: "default" (the foreground color of the
    terminal), a color name, "#rgb", "#rrggbb", "ansi256(<n>)", or "rgb(<r>,<g>,<b>)"  */
const colorSchema = v.optional(v.pipe(v.string(), v.check((s) =>
    s === "default"
    || (foregroundColorNames as readonly string[]).includes(s)
    || /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s)
    || /^ansi256\(\s?\d+\s?\)$/.test(s)
    || /^rgb\(\s?\d+,\s?\d+,\s?\d+\s?\)$/.test(s),
"expected \"default\", a color name, \"#rrggbb\", \"ansi256(<n>)\", or \"rgb(<r>,<g>,<b>)\"")))

/*  the color names accepted for the web board, mapped onto pleasant base colors  */
export const webColorNames: Record<string, string> = {
    black:   "#1a1a1a",
    grey:    "#999999",
    gray:    "#999999",
    brown:   "#8a5a3c",
    red:     "#b03a30",
    orange:  "#b06820",
    yellow:  "#b09020",
    green:   "#3d8a3d",
    teal:    "#2a8a7a",
    cyan:    "#2a8aa0",
    blue:    "#336699",
    purple:  "#6a4a99",
    magenta: "#993d80"
}

/*  schema for a web color: "default" (the default base color of the role),
    a color name, "#rgb", or "#rrggbb"  */
const webColorSchema = v.optional(v.pipe(v.string(), v.check((s) =>
    s === "default"
    || Object.hasOwn(webColorNames, s)
    || /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s),
`expected "default", a color name (${Object.keys(webColorNames).join(", ")}), "#rgb", or "#rrggbb"`)))

/*  schema for ".ase/config.yaml"  */
export const configSchema = v.nullish(v.strictObject({
    project: v.optional(v.strictObject({
        id:      v.optional(v.pipe(v.string(), v.minLength(1))),
        name:    v.optional(v.pipe(v.string(), v.minLength(1))),
        basedir: v.optional(v.pipe(v.string(), v.minLength(1))),
        boxing:  v.optional(v.picklist(projectClassification.boxing)),
        task: v.optional(v.strictObject({
            lifecycle: v.optional(v.picklist(projectClassification.lifecycle)),
            store:     v.optional(v.pipe(v.string(), v.minLength(1))),
            token:     v.optional(v.pipe(v.string(), v.minLength(1))),
            idscheme:  v.optional(v.pipe(v.string(), v.check((s) => checkIdScheme(s) === "",
                "expected \"slug[:<words>]\", \"seq[:<template>]\", or \"any\"")))
        })),
        artifact: v.optional(v.strictObject({
            spec: artifactSpecSchema,
            code: artifactSchema,
            docs: artifactSchema,
            infr: artifactSchema
        }))
    })),
    agent: v.optional(v.strictObject({
        persona:  v.optional(v.picklist(agentClassification.persona)),
        guidance: v.optional(v.picklist(agentClassification.guidance)),
        task:     v.optional(v.pipe(v.string(), v.minLength(1))),
        skill:    v.optional(v.pipe(v.string(), v.minLength(1)))
    })),
    board: v.optional(v.strictObject({
        tui: v.optional(v.strictObject({
            color: v.optional(v.strictObject({
                dim:    colorSchema,
                normal: colorSchema,
                accent: colorSchema,
                signal: colorSchema
            }))
        })),
        web: v.optional(v.strictObject({
            color: v.optional(v.strictObject({
                dim:    webColorSchema,
                normal: webColorSchema,
                accent: webColorSchema,
                signal: webColorSchema
            })),
            editor: v.optional(v.strictObject({
                keymap: v.optional(v.picklist([ "default", "vim", "emacs" ]))
            }))
        }))
    }))
}))
