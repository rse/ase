/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import * as v                    from "valibot"
import { foregroundColorNames }  from "chalk"

import type { ScopeTerm }        from "./ase-config-scope.js"
import { checkIdScheme, parseEffortScale, EFFORT_SCALE } from "./ase-task-format.js"

/*  classification taxonomy  */
export const projectClassification = {
    boxing:    [ "white", "grey", "black" ],
    lifecycle: [ "solo", "team", "enterprise" ]
} as const

/*  agent classification taxonomy  */
export const agentClassification = {
    persona:  [ "writer", "engineer", "journalist", "telegrapher", "caveman" ],
    guidance: [ "none", "minimal", "normal", "verbose" ],
    diagram:  [ "auto", "image", "text" ],
    theme:    [ "auto", "light", "dark" ]
} as const

/*  the default theme color tone of the diagrams  */
export const diagramToneDefault = "#336699"

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
        "agent.persona":   "engineer",
        "agent.guidance":  "normal",
        "agent.diagram.format": "auto",
        "agent.diagram.theme":  "auto",
        "agent.diagram.tone":   diagramToneDefault,
        "project.name":    "Example Project",
        "project.boxing":  "white",
        "project.users":   "",
        "project.task.lifecycle":         "solo",
        "project.task.idscheme":          "slug",
        "project.task.store.url":         "ase:./.ase/task",
        "project.task.default.source":    "worktree",
        "project.task.default.changeset": "worktree",
        "project.task.default.target":    "source",
        "project.task.effort.scale":      EFFORT_SCALE,
        "project.task.effort.factor":     "1",
        "project.task.effort.file":       "1",
        "project.task.effort.line":       "0.025",
        "project.task.effort.iteration":  "2.5",
        "project.artifact.spec.basedir":  "docs/specbook",
        "project.artifact.spec.files":    "**/*.{md,txt,svg,png,jpg}",
        "project.artifact.spec.schema":   "",
        "project.artifact.code.basedir":  "src",
        "project.artifact.code.files":    "** !**/etc/** !**/{.gitignore,.npmignore,package.json}",
        "project.artifact.docs.basedir":  "doc",
        "project.artifact.docs.files":    "** **/{README,LICENSE,CHANGELOG}.{md,txt} !{spec,arch}/**",
        "project.artifact.infr.basedir":  "",
        "project.artifact.infr.files":    "**/{.github,.claude*,etc}/** **/{AGENTS.md,{package,tsconfig*}.json,.{git,npm}ignore}",
        "board.tui.color.dim":            tuiColorDefaults.dim,
        "board.tui.color.normal":         tuiColorDefaults.normal,
        "board.tui.color.accent":         tuiColorDefaults.accent,
        "board.tui.color.signal":         tuiColorDefaults.signal,
        "board.web.color.dim":            webColorDefaults.dim,
        "board.web.color.normal":         webColorDefaults.normal,
        "board.web.color.accent":         webColorDefaults.accent,
        "board.web.color.signal":         webColorDefaults.signal,
        "board.web.editor.keymap":        "default",
        "board.web.theme":                "auto",
        "telemetry.enabled":              "false",
        "telemetry.implicit":             "true",
        "telemetry.prices.ai":            "*=4.00/20.00/0.20/5.00",
        "telemetry.prices.hr":            "*=110"
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
    "project.users":                  [ "user", "project" ],
    "project.task.store.url":         [ "user", "project" ],
    "project.task.store.token":       [ "user" ],
    "project.task.store.crt":         [ "user", "project" ],
    "project.task.store.key":         [ "user", "project" ],
    "project.task.lifecycle":         [ "user", "project" ],
    "project.task.idscheme":          [ "user", "project" ],
    "project.task.default.source":    [ "user", "project" ],
    "project.task.default.changeset": [ "user", "project" ],
    "project.task.default.target":    [ "user", "project" ],
    "project.task.effort.scale":      [ "user", "project" ],
    "project.task.effort.factor":     [ "user", "project" ],
    "project.task.effort.file":       [ "user", "project" ],
    "project.task.effort.line":       [ "user", "project" ],
    "project.task.effort.iteration":  [ "user", "project" ],
    "project.relay.url":              [ "user", "project" ],
    "project.relay.token":            [ "user" ],
    "project.relay.crt":              [ "user", "project" ],
    "project.relay.key":              [ "user", "project" ],
    "project.service.port":           [ "project" ],
    "project.artifact.spec.basedir":  [ "user", "project" ],
    "project.artifact.spec.files":    [ "user", "project" ],
    "project.artifact.spec.schema":   [ "user", "project" ],
    "project.artifact.code.basedir":  [ "user", "project" ],
    "project.artifact.code.files":    [ "user", "project" ],
    "project.artifact.docs.basedir":  [ "user", "project" ],
    "project.artifact.docs.files":    [ "user", "project" ],
    "project.artifact.infr.basedir":  [ "user", "project" ],
    "project.artifact.infr.files":    [ "user", "project" ],
    "board.tui.color.dim":            [ "user", "project" ],
    "board.tui.color.normal":         [ "user", "project" ],
    "board.tui.color.accent":         [ "user", "project" ],
    "board.tui.color.signal":         [ "user", "project" ],
    "board.web.color.dim":            [ "user", "project" ],
    "board.web.color.normal":         [ "user", "project" ],
    "board.web.color.accent":         [ "user", "project" ],
    "board.web.color.signal":         [ "user", "project" ],
    "board.web.editor.keymap":        [ "user", "project" ],
    "board.web.theme":                [ "user", "project" ],
    "telemetry.enabled":              [ "user", "project" ],
    "telemetry.implicit":             [ "user", "project" ],
    "telemetry.service.port":         [ "user" ],
    "telemetry.service.token":        [ "user" ],
    "telemetry.service.interval":     [ "user", "project" ],
    "telemetry.service.idle":         [ "user", "project" ],
    "telemetry.prices.ai":            [ "user" ],
    "telemetry.prices.hr":            [ "user", "project" ]
}

/*  default set of scope kinds writable for any unrestricted key  */
export const configWritableScopesDefault: ReadonlyArray<ScopeTerm["kind"]> =
    [ "user", "project", "task", "session" ]

/*  keys carrying secrets, whose values are masked in listings  */
export const configSecretKeys: ReadonlyArray<string> = [ "project.task.store.token", "project.relay.token", "telemetry.service.token" ]

/*  short descriptions of the configuration keys (shown by "ase config ui"),
    condensed from the CONFIGURATION KEYS section of the manual page ase-config(1)  */
export const configDescriptions: Record<string, string> = {
    "project.id":                     "The unique id of the project (default: the sanitized basename of the project root). " +
                                      "An explicit id is required for a remote task store and for the agent relay.",
    "project.name":                   "The full name of the project.",
    "project.boxing":                 "Whether the project artifacts are treated as a white box (fully transparent), grey box (partially), " +
                                      "or black box (not at all), which modulates the work depth and output visibility of the skills.",
    "project.users":                  "The comma-separated list of the known human assignees of the tasks, suggested by the task boards " +
                                      "and checked on assignments.",
    "project.task.lifecycle":         "The task lifecycle model: single-phase for a local solo developer, two-phase for a small team, " +
                                      "or four-phase for a gated enterprise pipeline.",
    "project.task.store.url":         "The URL of the task store: \"ase:<path>\" (local), \"ase[s]://<addr>:<port>[/<token>]\" (remote " +
                                      "task store server), or a GitHub, GitLab, or Gitea issue tracker.",
    "project.task.store.token":       "The bearer token of a remote task store, resp. the token of a GitHub, GitLab, or Gitea task store.",
    "project.task.store.crt":         "The PEM certificate (chain) file of the task store server, relative to the configuration file.",
    "project.task.store.key":         "The PEM private key file of the task store server, relative to the configuration file.",
    "project.task.idscheme":          "The task id scheme: \"slug[:<words>]\", \"seq[:<template>]\", or \"any\".",
    "project.task.default.source":    "The default of the \"Source:\" key of the task plans: \"worktree\" or \"branch:<name>\".",
    "project.task.default.changeset": "The default of the \"Changeset:\" key of the task plans: \"worktree\", \"branch:<name>\", " +
                                      "or \"attachment:<name>\".",
    "project.task.default.target":    "The default of the \"Target:\" key of the task plans: \"worktree\", \"branch:<name>\", or \"source\".",
    "project.task.effort.scale":      "The upper bounds of the effort size bands XS, S, M, and L, in strictly ascending human minutes, " +
                                      "while XL is open-ended.",
    "project.task.effort.factor":     "The human minutes per point of the attention score of the effort estimation.",
    "project.task.effort.file":       "The additional human minutes per touched file of the volume score of the effort estimation.",
    "project.task.effort.line":       "The additional human minutes per predicted changed line of the volume score of the effort estimation.",
    "project.task.effort.iteration":  "The multiplier (at least 1) of the estimated minutes of a task whose main deliverable is an " +
                                      "interactive or visual user interface.",
    "project.relay.url":              "The URL of the agent relay, as \"ase[s]://<addr>:<port>[/<token>]\".",
    "project.relay.token":            "The bearer token of the agent relay.",
    "project.relay.crt":              "The PEM certificate (chain) file of the agent relay server, relative to the configuration file.",
    "project.relay.key":              "The PEM private key file of the agent relay server, relative to the configuration file.",
    "project.service.port":           "The preferred port (1024-65535) of the per-project background service on 127.0.0.1, " +
                                      "falling back to a random port if unavailable.",
    "project.artifact.spec.basedir":  "The base directory of the specification files, relative to the project root.",
    "project.artifact.spec.files":    "The whitespace-separated glob specification of the specification files, relative to their base " +
                                      "directory, with \"!\" negating a glob.",
    "project.artifact.spec.schema":   "The whitespace-separated list of SpecBook schema configuration files (empty: the bundled " +
                                      "standard one \"std\").",
    "project.artifact.code.basedir":  "The base directory of the source code files, relative to the project root.",
    "project.artifact.code.files":    "The whitespace-separated glob specification of the source code files, relative to their base " +
                                      "directory, with \"!\" negating a glob.",
    "project.artifact.docs.basedir":  "The base directory of the documentation files, relative to the project root.",
    "project.artifact.docs.files":    "The whitespace-separated glob specification of the documentation files, relative to their base " +
                                      "directory, with \"!\" negating a glob.",
    "project.artifact.infr.basedir":  "The base directory of the infrastructure files, relative to the project root.",
    "project.artifact.infr.files":    "The whitespace-separated glob specification of the infrastructure files, relative to their base " +
                                      "directory, with \"!\" negating a glob.",
    "agent.persona":                  "The communication style of the AI agent.",
    "agent.guidance":                 "The amount of unsolicited help hints of the AI agent.",
    "agent.diagram.format":           "The rendering of the diagrams of the skills: as an inline image if the terminal supports it " +
                                      "(auto), always as an inline image, or always as text.",
    "agent.diagram.theme":            "The theme style of the diagram images: probed from the terminal background (auto), light, or dark.",
    "agent.diagram.tone":             "The theme color tone of the diagram images, as one or two colors \"#rgb\" or \"#rrggbb\".",
    "telemetry.enabled":              "Whether the AI usage accounting is enabled as a whole.",
    "telemetry.implicit":             "Whether the usage of an interactive session is also accounted onto its active task while the " +
                                      "task is unassigned.",
    "telemetry.service.port":         "The port (1024-65535) of the per-user OTLP ingress on 127.0.0.1.",
    "telemetry.service.token":        "The bearer token of the OTLP ingress, generated by \"ase setup telemetry activate\".",
    "telemetry.service.interval":     "The interval in minutes of the interim bookings of the open usage windows (0 disables).",
    "telemetry.service.idle":         "The idle time in minutes after which a usage window pauses (0 disables).",
    "telemetry.prices.ai":            "The price table \"<model>=<input>/<output>[/<cread>/<cwrite>] [...]\" in USD per million tokens, " +
                                      "with \"*\" for all other models.",
    "telemetry.prices.hr":            "The hourly rate table \"<user-id>=<usd-per-hour>[,...]\" of the human time, with \"*\" for all " +
                                      "other users.",
    "board.tui.color.dim":            "The color of the dim role of the terminal board: \"default\", a color name, \"#rrggbb\", " +
                                      "\"ansi256(<n>)\", or \"rgb(<r>,<g>,<b>)\".",
    "board.tui.color.normal":         "The color of the normal role of the terminal board: \"default\", a color name, \"#rrggbb\", " +
                                      "\"ansi256(<n>)\", or \"rgb(<r>,<g>,<b>)\".",
    "board.tui.color.accent":         "The color of the accent role of the terminal board: \"default\", a color name, \"#rrggbb\", " +
                                      "\"ansi256(<n>)\", or \"rgb(<r>,<g>,<b>)\".",
    "board.tui.color.signal":         "The color of the signal role of the terminal board: \"default\", a color name, \"#rrggbb\", " +
                                      "\"ansi256(<n>)\", or \"rgb(<r>,<g>,<b>)\".",
    "board.web.color.dim":            "The base color of the dim role of the web board: \"default\", a color name, \"#rgb\", or \"#rrggbb\".",
    "board.web.color.normal":         "The base color of the normal role of the web board: \"default\", a color name, \"#rgb\", or \"#rrggbb\".",
    "board.web.color.accent":         "The base color of the accent role of the web board: \"default\", a color name, \"#rgb\", or \"#rrggbb\".",
    "board.web.color.signal":         "The base color of the signal role of the web board: \"default\", a color name, \"#rgb\", or \"#rrggbb\".",
    "board.web.editor.keymap":        "The key bindings of the task plan editor of the web board.",
    "board.web.theme":                "The color theme of the web board, where \"auto\" follows the preference of the operating system " +
                                      "resp. browser."
}

/*  the token counts of the AI usage accounting: the tokens read from resp. written to
    the prompt cache, the (uncached) input tokens, and the output tokens  */
export type TokenCounts = { cread: number, cwrite: number, input: number, output: number }

/*  a price of the AI usage accounting (USD per million tokens of each token count)  */
export type TokenPrice = TokenCounts

/*  parse the per-model price table "<model>=<input>/<output>[/<cread>/<cwrite>][ ...]"
    of the AI usage accounting (USD per million input, output, cache read, and cache
    write tokens, where missing cache prices fall back to the input price), keyed by model  */
export const parsePrices = (spec: string): Map<string, TokenPrice> => {
    const prices = new Map<string, TokenPrice>()
    for (const entry of spec.split(/\s+/).filter((e) => e !== "")) {
        const m = /^([^=\s]+)=(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)(?:\/(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?))?$/.exec(entry)
        if (m === null)
            throw new Error(`invalid price entry "${entry}"`)
        prices.set(m[1], {
            input:  Number(m[2]),
            output: Number(m[3]),
            cread:  Number(m[4] ?? m[2]),
            cwrite: Number(m[5] ?? m[2])
        })
    }
    return prices
}

/*  the price of a model (or tool): its own one, else the one of "*", else none  */
export const modelPrice = (prices: Map<string, TokenPrice>, model: string): TokenPrice | undefined =>
    prices.get(model) ?? prices.get("*")

/*  the cost (in USD) of token counts at a price (zero without a price)  */
export const tokenCost = (price: TokenPrice | undefined, tokens: TokenCounts): number =>
    price === undefined ? 0 : (tokens.cread * price.cread + tokens.cwrite * price.cwrite +
        tokens.input * price.input + tokens.output * price.output) / 1e6

/*  check whether a specification is accepted by its parser  */
const parsable = (parse: (spec: string) => unknown, spec: string): boolean => {
    try {
        parse(spec)
        return true
    }
    catch {
        return false
    }
}

/*  parse the per-user hourly rate table "<user-id>=<usd-per-hour>[,...]" of the
    human time of the AI usage accounting, keyed by user id (with "*" for all others)  */
export const parseRates = (spec: string): Map<string, number> => {
    const rates = new Map<string, number>()
    for (const entry of spec.split(",").map((e) => e.trim()).filter((e) => e !== "")) {
        const m = /^([^=,\s]+)=(\d+(?:\.\d+)?)$/.exec(entry)
        if (m === null)
            throw new Error(`invalid hourly rate entry "${entry}"`)
        rates.set(m[1], Number(m[2]))
    }
    return rates
}

/*  the hourly rate (in USD) of a user: its own one, else the one of "*", else zero  */
export const userRate = (rates: Map<string, number>, user: string): number =>
    rates.get(user) ?? rates.get("*") ?? 0

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

/*  schema for a default value of the "Source", "Changeset", or "Target" task
    frontmatter key, restricted to the permitted forms "worktree", "source",
    "branch:<name>" (a safe Git branch name), and "attachment:<name>", where a
    <name> can carry the placeholder "{id}" of the task id (checked with a sample id)  */
const flowSchema = (forms: ReadonlyArray<string>) => v.optional(v.pipe(v.string(), v.check((value) => {
    const s    = value.replaceAll("{id}", "id")
    const i    = s.indexOf(":")
    const type = i < 0 ? s : s.slice(0, i)
    const name = i < 0 ? "" : s.slice(i + 1)
    if (!forms.includes(type))
        return false
    else if (type === "branch")
        return /^[A-Za-z0-9_][A-Za-z0-9_./-]*$/.test(name) && !/(?:\/|\.|\.lock)$/.test(name) && !/\.\.|\/\//.test(name)
    else if (type === "attachment")
        return /^[A-Za-z0-9_-]+$/.test(name)
    else
        return i < 0
}, `expected ${forms.map((form) => form === "branch" || form === "attachment" ? `"${form}:<name>"` : `"${form}"`).join(", ")}`)))

/*  schema for a positive number of human minutes of the effort estimation  */
const minutesSchema = v.optional(v.pipe(v.union([ v.number(), v.string() ]), v.check((s) =>
    /^\d+(?:\.\d+)?$/.test(String(s)) && Number(s) > 0, "expected a positive number of minutes")))

/*  schema for a multiplier of the effort estimation  */
const multiplierSchema = v.optional(v.pipe(v.union([ v.number(), v.string() ]), v.check((s) =>
    /^\d+(?:\.\d+)?$/.test(String(s)) && Number(s) >= 1, "expected a multiplier of at least 1")))

/*  schema for an unprivileged TCP port number  */
const portSchema = v.optional(v.pipe(v.union([ v.number(), v.string() ]), v.check((s) =>
    /^\d+$/.test(String(s)) && Number(s) >= 1024 && Number(s) <= 65535, "expected a port number (1024-65535)")))

/*  schema for ".ase/config.yaml"  */
export const configSchema = v.nullish(v.strictObject({
    project: v.optional(v.strictObject({
        id:      v.optional(v.pipe(v.string(), v.minLength(1))),
        name:    v.optional(v.pipe(v.string(), v.minLength(1))),
        boxing:  v.optional(v.picklist(projectClassification.boxing)),
        users:   v.optional(v.string()),
        task: v.optional(v.strictObject({
            lifecycle: v.optional(v.picklist(projectClassification.lifecycle)),
            store:     v.optional(v.strictObject({
                url:       v.optional(v.pipe(v.string(), v.minLength(1))),
                token:     v.optional(v.pipe(v.string(), v.minLength(1))),
                crt:       v.optional(v.pipe(v.string(), v.minLength(1))),
                key:       v.optional(v.pipe(v.string(), v.minLength(1)))
            })),
            idscheme:  v.optional(v.pipe(v.string(), v.check((s) => checkIdScheme(s) === "",
                "expected \"slug[:<words>]\", \"seq[:<template>]\", or \"any\""))),
            default:   v.optional(v.strictObject({
                source:    flowSchema([ "worktree", "branch" ]),
                changeset: flowSchema([ "worktree", "branch", "attachment" ]),
                target:    flowSchema([ "worktree", "branch", "source" ])
            })),
            effort:    v.optional(v.strictObject({
                scale:     v.optional(v.pipe(v.string(), v.check((s) => parsable(parseEffortScale, s),
                    "expected \"<xs>,<s>,<m>,<l>\" (strictly ascending upper band bounds in minutes)"))),
                factor:    minutesSchema,
                file:      minutesSchema,
                line:      minutesSchema,
                iteration: multiplierSchema
            }))
        })),
        relay: v.optional(v.strictObject({
            url:       v.optional(v.pipe(v.string(), v.minLength(1))),
            token:     v.optional(v.pipe(v.string(), v.minLength(1))),
            crt:       v.optional(v.pipe(v.string(), v.minLength(1))),
            key:       v.optional(v.pipe(v.string(), v.minLength(1)))
        })),
        service: v.optional(v.strictObject({
            port:      portSchema
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
        diagram:  v.optional(v.strictObject({
            format:   v.optional(v.picklist(agentClassification.diagram)),
            theme:    v.optional(v.picklist(agentClassification.theme)),
            tone:     v.optional(v.pipe(v.string(), v.check((s) => /^#(?:[0-9a-fA-F]{3}){1,2}(?:\s+#(?:[0-9a-fA-F]{3}){1,2})?$/.test(s.trim()),
                "expected \"#rgb\" or \"#rrggbb\", optionally followed by a second one")))
        }))
    })),
    telemetry: v.optional(v.strictObject({
        enabled:  v.optional(v.union([ v.boolean(), v.picklist([ "true", "false" ]) ])),
        implicit: v.optional(v.union([ v.boolean(), v.picklist([ "true", "false" ]) ])),
        service:  v.optional(v.strictObject({
            port:     portSchema,
            token:    v.optional(v.pipe(v.string(), v.minLength(1))),
            interval: v.optional(v.pipe(v.union([ v.number(), v.string() ]), v.check((s) =>
                /^\d+$/.test(String(s)), "expected a number of minutes (0 disables)"))),
            idle:     v.optional(v.pipe(v.union([ v.number(), v.string() ]), v.check((s) =>
                /^\d+$/.test(String(s)), "expected a number of minutes (0 disables)")))
        })),
        prices: v.optional(v.strictObject({
            ai: v.optional(v.pipe(v.string(), v.check((s) => parsable(parsePrices, s),
                "expected \"<model>=<input>/<output>[/<cread>/<cwrite>][ ...]\" (USD per million tokens, with \"*\" as the model of all others)"))),
            hr: v.optional(v.pipe(v.string(), v.check((s) => parsable(parseRates, s),
                "expected \"<user-id>=<usd-per-hour>[,...]\" (with \"*\" as the user id of all others)")))
        }))
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
            })),
            theme: v.optional(v.picklist([ "auto", "light", "dark" ]))
        }))
    }))
}))

/*  schema for the session-scoped internal "state.yaml", carrying the machine-local
    runtime state shared between the hooks, the MCP server, and the skills, which is
    intentionally not part of the user-facing configuration: "basedir" is the project
    directory, "task" is the id of the active
    task, "skill" is the id of the active edit-capable skill, and "headless"
    whether the session is a headless one of an agent  */
export const sessionStateSchema = v.nullish(v.strictObject({
    basedir:  v.optional(v.pipe(v.string(), v.minLength(1))),
    task:     v.optional(v.pipe(v.string(), v.minLength(1))),
    skill:    v.optional(v.pipe(v.string(), v.minLength(1))),
    headless: v.optional(v.picklist([ "true", "false" ]))
}))
