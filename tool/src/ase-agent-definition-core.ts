/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import fs                           from "node:fs"
import path                         from "node:path"
import { pathToFileURL }            from "node:url"

import YAML                         from "yaml"

import type Log                     from "./ase-lib-log.js"
import { projectRoot, userConfigDir } from "./ase-config-scope.js"
import * as TaskFormat              from "./ase-task-format.js"
import { requestsOf, typeParam }    from "./ase-task-request.js"
import type { AgentDefinition, AgentHooks } from "./ase-agent-definition-api.js"
import type { AgentPrompt }         from "./ase-agent-relay-core.js"
import { statePrevious }            from "./ase-agent-runtime-phase.js"
import rebooter                     from "./ase-agent-definition-builtin/rebooter.js"
import condenser                    from "./ase-agent-definition-builtin/condenser.js"
import implementer                  from "./ase-agent-definition-builtin/implementer.js"
import qualifier                    from "./ase-agent-definition-builtin/qualifier.js"
import integrator                   from "./ase-agent-definition-builtin/integrator.js"
import editor                       from "./ase-agent-definition-builtin/editor.js"
import estimator                    from "./ase-agent-definition-builtin/estimator.js"
import researcher                   from "./ase-agent-definition-builtin/researcher.js"

/*  a built-in agent kind ("ase agent <kind>"): its name, its CLI description, its modes
    (selected by "--mode", each with its definition, in the format of the definition files),
    the description of "--mode" (only registered with multiple modes), and its default mode  */
export type AgentKind = {
    kind:        string
    description: string
    modes:       Record<string, AgentDefinition>
    modeDesc:    string
    mode:        string
}

/*  the built-in agent kinds  */
export const builtinKinds: AgentKind[] = [
    rebooter, condenser, implementer, qualifier, integrator, editor, estimator, researcher
]

/*  a definition agent kind ("ase agent <kind>"): its name (the base name of its
    definition file), its definition file, and the scope of the latter  */
export type DefinitionKind = {
    kind:  string
    file:  string
    scope: "project" | "user"
}

/*  the file name extensions of the definition files, by descending precedence  */
const definitionExts = [ ".yaml", ".yml", ".ts", ".mts", ".js", ".mjs", ".cjs" ]

/*  discover the definition agent kinds of the definition files "<kind>.<ext>" of the user
    ("<user-config-dir>/agents/") and of the project (".ase/agents/"), where a kind of the
    project shadows one of the user, and both shadow a built-in agent kind, while a file of
    an invalid or a <reserved> kind name is skipped with a warning (as are the further files
    of an already discovered kind name in the same directory)  */
export const discoverKinds = (log: Log, reserved: string[]): DefinitionKind[] => {
    const root  = projectRoot()
    const dirs  = [
        { scope: "user"    as const, dir: path.join(userConfigDir(), "agents") },
        ...(root !== null ? [ { scope: "project" as const, dir: path.join(root, ".ase", "agents") } ] : [])
    ]
    const kinds = new Map<string, DefinitionKind>()
    for (const { scope, dir } of dirs) {
        let entries: string[]
        try {
            entries = fs.readdirSync(dir)
        }
        catch (_err) {
            continue
        }
        const seen = new Set<string>()
        const rank = (entry: string) => definitionExts.indexOf(path.extname(entry).toLowerCase())
        for (const entry of entries.filter((e) => rank(e) >= 0).sort((a, b) => rank(a) - rank(b))) {
            const kind = path.basename(entry, path.extname(entry))
            const file = path.join(dir, entry)
            if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(kind) || kind.length > 64)
                log.write("warning", `agent: definition "${file}": skipped, as "${kind}" is no valid agent kind name ` +
                    "(expected up to 64 letters, digits, underscores, and dashes, starting with a letter or digit)")
            else if (reserved.includes(kind))
                log.write("warning", `agent: definition "${file}": skipped, as "${kind}" clashes with the command "ase agent ${kind}"`)
            else if (seen.has(kind))
                log.write("warning", `agent: definition "${file}": skipped, as "${kinds.get(kind)!.file}" ` +
                    `already defines the agent kind "${kind}"`)
            else {
                seen.add(kind)
                kinds.set(kind, { kind, file, scope })
            }
        }
    }
    return [ ...kinds.values() ]
}

/*  the processing types, the working directory kinds, and the success criteria of a definition  */
export const definitionTypes    = [ "phase", "request" ] as const
export const definitionWorkdirs = [ "project", "source", "changeset", "changeset-read", "target" ] as const
export const definitionCriteria = [ "exit", "clean", "changed", "verdict", "attachment", "status" ] as const
export type DefinitionType      = typeof definitionTypes[number]
export type DefinitionWorkdir   = typeof definitionWorkdirs[number]
export type DefinitionCriterion = typeof definitionCriteria[number]

/*  the groups of the options of a definition (their options named "<group>-<item>")  */
export const definitionGroups = [ "state", "tag", "assign", "request", "prompt", "prepare", "success", "verdict", "attach", "finish" ]

/*  the options of a definition: their long name (without "--"), their kind (a single
    value, a repeatable value, or a flag), the name of their argument, and their description  */
export type DefinitionOption = { key: string, kind: "value" | "list" | "flag", arg: string, desc: string }
const opt = (key: string, kind: DefinitionOption["kind"], arg: string, desc: string): DefinitionOption => ({ key, kind, arg, desc })
export const definitionOptions: DefinitionOption[] = [
    opt("definition",        "value", "file",          "YAML, TypeScript, or JavaScript file with the definition of the agent " +
        "(with the same keys as these options, flat or nested by group, plus hooks for TypeScript and JavaScript, " +
        "and optionally a base definition it extends as \"definition\", where the given options win), " +
        "or \"builtin:<kind>[-<mode>]\" for the definition of a built-in agent"),
    opt("title",             "value", "text",          "one-line title of the operation of the agent " +
        "(shown on the task boards, at most 80 characters)"),
    opt("description",       "value", "text",          "brief description of the operation of the agent " +
        "(shown on the task boards, about 3-6 lines, at most 600 characters)"),
    opt("type",              "value", "type",          "processing type: \"phase\" (claim tasks by their lifecycle status) or " +
        "\"request\" (process the attached prompt requests of tasks) (default: \"phase\")"),
    opt("workdir",           "value", "kind",          "working directory: \"project\", \"source\", \"changeset\", " +
        "\"changeset-read\", or \"target\" (default: \"project\")"),
    opt("lifecycle",         "list",  "model",         "supported task lifecycle model (repeatable) " +
        "(default: every model containing all given states, resp. all models with \"--unclaimed\")"),
    opt("serial",            "flag",  "",              "process the tasks serially only (ignoring \"--parallel\")"),
    opt("unclaimed",         "flag",  "",              "process the tasks of the incoming states (each adapted onto the " +
        "task lifecycle model) without claiming them, independent of their assignee and predecessors, " +
        "and without ever changing their status and assignee (for \"phase\" only)"),
    opt("model",             "value", "model",         "model of the agent tool: a model for all tasks, or comma-separated " +
        "\"<size>=<model>\" pairs per \"Effort:\" size (\"XS\", \"S\", \"M\", \"L\", \"XL\", or \"*\" for all other tasks) " +
        "(default: the default model of the agent tool)"),
    opt("params",            "list",  "name=value",    "value of a parameter declared by the definition (repeatable)"),
    opt("state-incoming",    "list",  "state",         "state of the tasks to claim (mandatory for \"phase\", " +
        "repeatable with \"--unclaimed\" or \"--state-activity\" only)"),
    opt("state-activity",    "value", "state",         "state of a task during its processing (default: incoming)"),
    opt("state-success",     "value", "state",         "target state on success, or \"previous\" for the incoming state " +
        "of the claim (default: incoming)"),
    opt("state-failure",     "value", "state",         "target state on failure, or \"previous\" for the incoming state " +
        "of the claim (default: incoming)"),
    opt("state-phase",       "value", "state",         "phase success state, into which the skill itself can move a task " +
        "(default: success, resp. activity for a \"previous\" success)"),
    opt("state-passed",      "value", "state",         "first state from which on a task has passed the phase " +
        "for its \"After:\" successors (default: phase)"),
    opt("state-verdict",     "list",  "verdict=state", "target state per verdict (repeatable)"),
    opt("tag-name",          "value", "tag",           "tag of the processed tasks (default: \"ase-agent-<name>\")"),
    opt("tag-success",       "value", "tag",           "tag on success: \"<tag-name>\", \"<tag-name>:<value>\", " +
        "or \"none\" (default: \"<tag-name>\")"),
    opt("tag-failure",       "value", "tag",           "tag on failure: \"<tag-name>\", \"<tag-name>:<value>\", " +
        "or \"none\" (default: \"<tag-name>\")"),
    opt("tag-require",       "list",  "tag",           "tag a claimable task has to carry (repeatable)"),
    opt("tag-exclude",       "list",  "tag",           "tag a claimable task must not carry (repeatable)"),
    opt("tag-retry",         "flag",  "",              "untag a failed task, so it is claimed again (shorthand for \"--tag-failure none\")"),
    opt("assign-name",       "value", "who",           "assignee under which the tasks are claimed and which names " +
        "the agent-owned worktrees (default: the agent name)"),
    opt("assign-required",   "flag",  "",              "claim only the tasks explicitly assigned to \"--assign-name\""),
    opt("assign-success",    "value", "who",           "assignee of a task after its successful processing: " +
        "a name, \"none\", or \"previous\" (default: \"none\" for \"phase\", \"previous\" for \"request\")"),
    opt("assign-failure",    "value", "who",           "assignee of a task after its failed processing: " +
        "a name, \"none\", or \"previous\" (default: \"none\" for \"phase\", \"previous\" for \"request\")"),
    opt("request-name",      "value", "name",          "name of the processed requests (default: the agent name)"),
    opt("request-done",      "value", "word",          "word naming a processed task in the log lines (default: \"processed\")"),
    opt("prompt-skill",      "value", "name",          "skill to invoke"),
    opt("prompt-args",       "value", "template",      "arguments of the skill " +
        "(default: \"{id}\" for \"phase\", \"{id}: {prompt}\" for \"request\")"),
    opt("prompt-text",       "value", "template",      "prompt text to invoke (instead of a skill)"),
    opt("prompt-file",       "value", "file",          "file with the prompt text to invoke (instead of a skill)"),
    opt("prepare-run",       "list",  "cmd",           "shell command to run before the prompt (repeatable)"),
    opt("success-criterion", "list",  "criterion",     "success criterion: \"exit\", \"clean\", \"changed\", " +
        "\"verdict\", \"attachment\", or \"status\" (repeatable) " +
        "(default: \"exit\" and \"clean\" for \"phase\", \"clean\" and \"changed\" for \"request\")"),
    opt("success-match",     "list",  "regex",         "regular expression an output line has to match (repeatable)"),
    opt("verdict-label",     "value", "label",         "label after which the verdict is given in the output"),
    opt("verdict-allow",     "list",  "verdict",       "accepted verdict (repeatable) " +
        "(default: the verdicts of \"--state-verdict\", else any)"),
    opt("attach-output",     "value", "kind",          "kind of the attachment storing the output lines of the prompt"),
    opt("attach-expect",     "value", "spec",          "attachment \"[<mime-type>;]<kind>\" to be created or changed " +
        "by the processing for the \"attachment\" success criterion"),
    opt("attach-skip",       "value", "spec",          "attachment \"[<mime-type>;]<kind>\" leaving a task unclaimed"),
    opt("attach-changeset",  "value", "kind",          "kind of the attachment \"text/x-diff;<kind>\" storing the change set " +
        "snapshot of the task (with \"--workdir changeset\" or \"target\" only)"),
    opt("finish-commit",     "flag",  "",              "commit the work onto a \"branch:\" changeset and publish it " +
        "(with \"--workdir changeset\" only)"),
    opt("finish-success",    "value", "cmd",           "shell command to run after a successful processing"),
    opt("finish-failure",    "value", "cmd",           "shell command to run after a failed processing")
]

/*  the camel-cased attribute name of an option (as by "commander")  */
export const optionAttr = (key: string): string =>
    key.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase())

/*  a node of a parsed template: literal text, a placeholder, or a conditional
    (on a non-empty placeholder, or on a placeholder equal to a value) with its body  */
type TemplateNode = { text: string } | { name: string } | { cond: string, equals: string | null, body: TemplateNode[] }

/*  a parsed template: its nodes, the names of all its placeholders, and the names of its
    placeholders used unconditionally (i.e., not only within a conditional on themselves)  */
export type Template = { nodes: TemplateNode[], names: Set<string>, required: Set<string> }

/*  the placeholders of the templates (besides "key:<Header>" and "param:<name>")  */
const placeholders = [
    "id", "title", "prompt", "source", "changeset", "target",
    "source-type", "source-name", "changeset-type", "changeset-name", "target-type", "target-name",
    "workdir", "source-dir", "changeset-worktree"
]

/*  the name of a parameter, and the name of the environment variable carrying its value  */
const paramNameRe = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/
export const paramEnv = (name: string): string =>
    `ASE_AGENT_PARAM_${name.toUpperCase().replace(/-/g, "_")}`

/*  parse a template of the option <option>: placeholders "{<name>}" (where "{prompt}" is
    known for "request" only, and "{param:<name>}" for the declared parameters <params> only),
    conditionals "{?<name>:<text>}" and "{?<name>=<value>:<text>}" (with placeholders, but
    without nested conditionals in <text>), and "{{" and "}}" for literal braces, keeping
    all other text verbatim  */
export const parseTemplate = (spec: string, option: string, type: DefinitionType, params: string[]): Template => {
    const fail = (msg: string): never => {
        throw new Error(`agent: option "--${option}": ${msg}`)
    }
    const names    = new Set<string>()
    const required = new Set<string>()
    const known = (name: string): string => {
        if (name.startsWith("param:")) {
            if (!params.includes(name.slice(6)))
                fail(`unknown placeholder "${name}" (no declared parameter "${name.slice(6)}")`)
        }
        else if (!/^key:[A-Za-z][A-Za-z0-9-]*$/.test(name) && !(placeholders.includes(name) && (name !== "prompt" || type === "request")))
            fail(`unknown placeholder "${name}"` + (name === "prompt" ? " (known for \"--type request\" only)" : ""))
        names.add(name)
        return name
    }
    /*  parse the nodes of the template or, from the position <open> of its opening
        brace on, of the body of a conditional on the non-empty placeholder <guard>
        (else empty), up to its closing brace  */
    let i = 0
    const parse = (open: number, guard = ""): TemplateNode[] => {
        const nodes: TemplateNode[] = []
        let text = ""
        const flush = () => {
            if (text !== "")
                nodes.push({ text })
            text = ""
        }
        while (i < spec.length) {
            if (spec.startsWith("{{", i) || spec.startsWith("}}", i)) {
                text += spec[i]
                i += 2
            }
            else if (spec[i] === "}") {
                if (open < 0)
                    fail(`unbalanced "}" at position ${i + 1} (use "}}" for a literal brace)`)
                i++
                flush()
                return nodes
            }
            else if (spec.startsWith("{?", i)) {
                if (open >= 0)
                    fail(`nested conditional at position ${i + 1}`)
                const m = /^\{\?(key:[A-Za-z][A-Za-z0-9-]*|param:[A-Za-z][A-Za-z0-9_-]*|[a-z][a-z-]*)(?:=([^:}]*))?:/.exec(spec.slice(i))
                if (m === null)
                    fail(`invalid conditional at position ${i + 1} (expected "{?<name>:<text>}" or "{?<name>=<value>:<text>}")`)
                const cond = known(m![1])
                const at   = i
                i += m![0].length
                flush()
                nodes.push({ cond, equals: m![2] ?? null, body: parse(at, m![2] === undefined ? cond : "") })
            }
            else if (spec[i] === "{") {
                const m = /^\{(key:[A-Za-z][A-Za-z0-9-]*|param:[A-Za-z][A-Za-z0-9_-]*|[a-z][a-z-]*)\}/.exec(spec.slice(i))
                if (m === null)
                    fail(`invalid placeholder at position ${i + 1} (use "{{" for a literal brace)`)
                flush()
                nodes.push({ name: known(m![1]) })
                if (m![1] !== guard)
                    required.add(m![1])
                i += m![0].length
            }
            else
                text += spec[i++]
        }
        if (open >= 0)
            fail(`unclosed conditional at position ${open + 1}`)
        flush()
        return nodes
    }
    return { nodes: parse(-1), names, required }
}

/*  render a parsed template with the values of its placeholders  */
export const renderTemplate = (template: Template, value: (name: string) => string): string => {
    const render = (nodes: TemplateNode[]): string => nodes.map((node) => {
        if ("text" in node)
            return node.text
        else if ("name" in node)
            return value(node.name)
        const val = value(node.cond)
        return (node.equals === null ? val !== "" : val === node.equals) ? render(node.body) : ""
    }).join("")
    return render(template.nodes)
}

/*  an attachment specification "[<mime-type>;]<kind>", and whether an attachment type matches it
    (by its "kind" parameter exactly, and, if given, by its MIME type)  */
export type AttachSpec = { mime: string, kind: string }
export const attachMatches = (spec: AttachSpec, type: string): boolean =>
    typeParam(type, "kind") === spec.kind
    && (spec.mime === "" || (type.split(";")[0] ?? "").trim().toLowerCase() === spec.mime)

/*  the resolved definition of an agent (with one or more incoming states for "phase" and
    none for "request", and with "statePrevious" as a success or failure state restoring
    the incoming state of the claim)  */
export type ResolvedDefinition = {
    name:        string
    title:       string
    description: string
    type:        DefinitionType
    workdir:     DefinitionWorkdir
    lifecycles:  string[]
    serial:      boolean
    unclaimed:   boolean
    model:       { spec: string, sizes: Record<string, string> }
    state: {
        incoming: string[], activity: string, success: string, failure: string,
        phase: string, passed: string, verdict: Record<string, string>
    }
    tag: {
        name: string, success: string | null | undefined, failure: string | null | undefined,
        require: string[], exclude: string[], guarded: boolean
    }
    assign:  { name: string, required: boolean, success: string, failure: string }
    request: { name: string, done: string, prompt: AgentPrompt }
    prompt:  { skill: string, template: Template }
    prepare: string[]
    success: { criteria: DefinitionCriterion[], match: RegExp[] }
    verdict: { label: string, allow: string[] }
    attach:  { output: string, expect: AttachSpec | null, skip: AttachSpec | null, changeset: string }
    finish:  { commit: boolean, success: string, failure: string }
    params:  Record<string, string>
    hooks:   AgentHooks
}

/*  flatten the nested option groups of a definition (e.g. "state: { incoming: PLANNED }"
    into "state-incoming: PLANNED"), where the map "params" is kept as-is, and where
    <where> names the definition in errors  */
export const flattenDefinition = (data: Record<string, unknown>, where: string): Record<string, unknown> => {
    const flat: Record<string, unknown> = {}
    const set = (key: string, value: unknown) => {
        if (Object.hasOwn(flat, key))
            throw new Error(`${where}: option "${key}" given twice (flat and nested)`)
        flat[key] = value
    }
    for (const [ key, value ] of Object.entries(data)) {
        if (key !== "params" && value !== null && typeof value === "object" && !Array.isArray(value)) {
            if (!definitionGroups.includes(key))
                throw new Error(`${where}: option "${key}" is no option group (expected one of ` +
                    `${definitionGroups.map((group) => `"${group}"`).join(", ")})`)
            for (const [ item, val ] of Object.entries(value as Record<string, unknown>))
                set(`${key}-${item}`, val)
        }
        else
            set(key, value)
    }
    return flat
}

/*  the names of the hooks of a definition (see "AgentHooks")  */
const hookNames = [ "start", "order", "passes", "ready", "prepare", "prompt", "model", "verdict", "success", "settle", "finish", "stop" ]

/*  a normalized parameter declaration of a definition (see "AgentParam"),
    with only the fields given by the definition (to extend those of its base)  */
type ParamDecl = { desc?: string, default?: string, required?: boolean, allow?: string[] }

/*  a loaded definition: its flattened and normalized option values (by long option name,
    where a false flag only unsets the flag of its base definition), its parameter
    declarations, its hooks, whether its hook "ready" guards an untagged task against
    being claimed again (as declared together with "tag-success: none" by the same
    definition, or inherited unreplaced from a base definition guarding so), and the
    specification of its base definition (if any)  */
type LoadedDefinition = {
    values: Record<string, string | string[] | boolean>
    params: Record<string, ParamDecl>
    hooks:  AgentHooks
    guards: boolean
    base?:  string
}

/*  normalize the parameter declarations <spec> of a definition (see "AgentParam"),
    where <where> names the definition in errors  */
const definitionParams = (spec: unknown, where: string): Record<string, ParamDecl> => {
    const params: Record<string, ParamDecl> = {}
    if (spec === undefined || spec === null)
        return params
    if (typeof spec !== "object" || Array.isArray(spec))
        throw new Error(`${where}: invalid parameters (expected an object of parameter declarations)`)
    const scalar = (val: unknown): val is string | number | boolean =>
        typeof val === "string" || typeof val === "number" || typeof val === "boolean"
    for (const [ name, decl ] of Object.entries(spec)) {
        const fail = (msg: string): never => {
            throw new Error(`${where}: parameter "${name}": ${msg}`)
        }
        if (!paramNameRe.test(name))
            fail("invalid name (expected up to 64 letters, digits, underscores, and dashes, starting with a letter)")
        if (scalar(decl)) {
            params[name] = { default: String(decl) }
            continue
        }
        if (decl === null || typeof decl !== "object" || Array.isArray(decl))
            fail("invalid declaration (expected its default value or an object of \"desc\", \"default\", \"required\", and \"allow\")")
        const param: ParamDecl = {}
        for (const [ key, val ] of Object.entries(decl as Record<string, unknown>)) {
            if (val === undefined || val === null)
                continue
            else if (key === "desc" && typeof val === "string")
                param.desc = val
            else if (key === "default" && scalar(val))
                param.default = String(val)
            else if (key === "required" && typeof val === "boolean")
                param.required = val
            else if (key === "allow" && (Array.isArray(val) ? val : [ val ]).every((item) => scalar(item)))
                param.allow = (Array.isArray(val) ? val : [ val ]).map((item) => String(item))
            else if ([ "desc", "default", "required", "allow" ].includes(key))
                fail(`invalid value of "${key}"`)
            else
                fail(`unknown field "${key}" (expected "desc", "default", "required", or "allow")`)
        }
        params[name] = param
    }
    return params
}

/*  normalize the (parsed or imported) data of a definition into its flattened option values,
    its parameter declarations, its hooks, and its base definition, where <where> names the
    definition in errors, and a relative "prompt-file" and a relative base definition file
    are resolved against the directory <dir> (if given)  */
const definitionValues = (data: unknown, where: string, dir: string): LoadedDefinition => {
    if (data === null || typeof data !== "object" || Array.isArray(data))
        throw new Error(`${where} carries no options`)
    const { hooks: spec, definition: base, params: decls, ...options } = data as Record<string, unknown>
    if (base !== undefined && base !== null && (typeof base !== "string" || base === ""))
        throw new Error(`${where}: invalid base definition (expected a file or "builtin:<kind>[-<mode>]")`)
    const params = definitionParams(decls, where)
    const hooks: AgentHooks = {}
    if (spec !== undefined && spec !== null) {
        if (typeof spec !== "object" || Array.isArray(spec))
            throw new Error(`${where}: invalid hooks (expected an object of functions)`)
        for (const [ name, fn ] of Object.entries(spec)) {
            if (!hookNames.includes(name))
                throw new Error(`${where}: unknown hook "${name}" ` +
                    `(expected ${hookNames.map((hook) => `"${hook}"`).join(", ")})`)
            if (typeof fn !== "function")
                throw new Error(`${where}: hook "${name}" is no function ` +
                    "(hooks require a TypeScript or JavaScript definition file)")
        }
        Object.assign(hooks, spec)
    }
    const values: Record<string, string | string[] | boolean> = {}
    for (const [ key, value ] of Object.entries(flattenDefinition(options, where))) {
        const option = definitionOptions.find((opt) => opt.key === key)
        if (option === undefined)
            throw new Error(`${where}: unknown option "${key}"`)
        const scalar = (val: unknown): string => {
            if (typeof val !== "string" && typeof val !== "number")
                throw new Error(`${where}: invalid value of option "${key}" (expected a string)`)
            return String(val)
        }
        if (value === null || value === undefined)
            continue
        else if (option.kind === "flag") {
            if (typeof value !== "boolean")
                throw new Error(`${where}: invalid value of option "${key}" (expected a boolean)`)
            values[key] = value
        }
        else if (option.kind === "list")
            values[key] = (Array.isArray(value) ? value : [ value ]).map(scalar)
        else
            values[key] = scalar(value)
    }
    if (typeof values["prompt-file"] === "string" && dir !== "")
        values["prompt-file"] = path.resolve(dir, values["prompt-file"])
    const guards = hooks.ready !== undefined && values["tag-success"] === "none"
    if (typeof base !== "string")
        return { values, params, hooks, guards }
    return { values, params, hooks, guards, base: base.startsWith("builtin:") || dir === "" ? base : path.resolve(dir, base) }
}

/*  the mutually exclusive alternatives of the options, which a given option replaces in the
    definition (instead of being merged with them)  */
const alternatives: Record<string, string[]> = {
    "prompt-skill": [ "prompt-text", "prompt-file" ],
    "prompt-text":  [ "prompt-skill", "prompt-args", "prompt-file" ],
    "prompt-file":  [ "prompt-skill", "prompt-args", "prompt-text" ],
    "tag-retry":    [ "tag-failure" ],
    "tag-failure":  [ "tag-retry" ]
}

/*  overlay the option values <upper> onto the option values <lower>, where an option of
    <upper> (except a false flag) also replaces its mutually exclusive alternatives of <lower>  */
const overlayValues = <T> (lower: Record<string, T>, upper: Record<string, T>): Record<string, T> => {
    const masked = new Set(Object.entries(upper)
        .filter(([ , value ]) => value !== false)
        .flatMap(([ key ]) => alternatives[key] ?? []))
    return { ...Object.fromEntries(Object.entries(lower).filter(([ key ]) => !masked.has(key))), ...upper }
}

/*  load the definition of "--definition": the definition of a built-in agent of the
    specification "builtin:<kind>[-<mode>]" (default: its default mode), else a YAML file
    (".yaml" or ".yml"), or a TypeScript (".ts" or ".mts", via the type stripping of
    Node.js) or JavaScript file (".js", ".mjs", or ".cjs"), whose default export is the
    definition or a (possibly asynchronous) function returning it, where a definition
    with a base definition (its key "definition") extends the latter: its options override
    those of the base definition (also replacing their mutually exclusive alternatives,
    and with a false flag unsetting the flag of the base definition), its parameter
    declarations extend those of the same name of the base definition field-wise, and its
    hooks replace those of the same name of the base definition, while <chain> carries the
    already loading definitions of a chain of base definitions (to detect a cycle)  */
const loadDefinition = async (spec: string, chain: string[] = []): Promise<LoadedDefinition> => {
    let loaded: LoadedDefinition
    let id:     string
    if (spec.startsWith("builtin:")) {
        const where = `agent: option "--definition": definition "${spec}"`
        const m     = /^builtin:([a-z]+)(?:-([a-z]+))?$/.exec(spec)
        const kind  = builtinKinds.find((k) => k.kind === m?.[1])
        const mode  = m?.[2] ?? kind?.mode ?? ""
        if (m === null || kind === undefined || !Object.hasOwn(kind.modes, mode))
            throw new Error(`${where}: unknown built-in definition (expected ` +
                builtinKinds.flatMap((k) => Object.keys(k.modes).map((n) => `"builtin:${k.kind}-${n}"`)).join(", ") + ")")
        id     = `builtin:${kind.kind}-${mode}`
        loaded = definitionValues(kind.modes[mode], where, "")
    }
    else {
        id     = path.resolve(spec)
        loaded = await loadDefinitionFile(id)
    }
    if (loaded.base !== undefined) {
        if (chain.includes(id))
            throw new Error(`agent: option "--definition": definition "${id}": cyclic base definitions ` +
                `(${[ ...chain.slice(chain.indexOf(id)), id ].map((def) => `"${def}"`).join(" > ")})`)
        const base = await loadDefinition(loaded.base, [ ...chain, id ])
        const params = { ...base.params }
        for (const [ name, param ] of Object.entries(loaded.params))
            params[name] = { ...params[name], ...param }
        loaded = {
            values: overlayValues(base.values, loaded.values),
            params,
            hooks:  { ...base.hooks, ...loaded.hooks },
            guards: loaded.guards || (base.guards && loaded.hooks.ready === undefined)
        }
    }
    if (chain.length === 0)
        loaded.values = Object.fromEntries(Object.entries(loaded.values).filter(([ , value ]) => value !== false))
    return loaded
}

/*  load the definition file <file>: a YAML, TypeScript, or JavaScript file (see "loadDefinition")  */
const loadDefinitionFile = async (file: string): Promise<LoadedDefinition> => {
    let data: unknown
    try {
        if (/\.ya?ml$/i.test(file))
            data = YAML.parse(fs.readFileSync(file, "utf8"))
        else if (/\.(?:[cm]?js|m?ts)$/i.test(file)) {
            if (/ts$/i.test(file) && !(process.features as { typescript?: unknown }).typescript)
                throw new Error("TypeScript requires the type stripping of Node.js (Node.js 22.18.0 or newer)")
            const mod = await import(pathToFileURL(file).href) as { default?: unknown }
            data = typeof mod.default === "function" ? await (mod.default as () => unknown)() : mod.default
            if (data === undefined)
                throw new Error("no default export")
        }
        else
            throw new Error("unknown file type (expected \".yaml\", \".yml\", \".ts\", \".mts\", " +
                "\".js\", \".mjs\", or \".cjs\")")
    }
    catch (err: unknown) {
        throw new Error(`agent: option "--definition": cannot read definition "${file}": ` +
            `${err instanceof Error ? err.message : String(err)}`, { cause: err })
    }
    return definitionValues(data, `agent: option "--definition": definition "${file}"`, path.dirname(file))
}

/*  whether a phase agent claiming only the tasks explicitly assigned to it (<required>, under
    the assignee <name>) hands a processed task over to the assignee specification <who> of
    somebody else, so an untagged task returning into an incoming state is guarded against
    being claimed again by its assignment  */
export const unassignedFrom = (required: boolean, name: string, who: string): boolean =>
    required && who !== "previous" && who !== name

/*  fail on the option "--<key>" with the message <msg>  */
const failOption = (key: string, msg: string): never => {
    throw new Error(`agent: option "--${key}": ${msg}`)
}

/*  resolve the values of the declared parameters <decls>: their given values <specs>
    ("<name>=<value>", where a later value of the same name wins), else their default
    values, else empty, validated against their declarations  */
const resolveParams = (decls: Record<string, ParamDecl>, specs: string[]): Record<string, string> => {
    const params: Record<string, string> = {}
    const envs   = new Map<string, string>()
    for (const [ name, decl ] of Object.entries(decls)) {
        const other = envs.get(paramEnv(name))
        if (other !== undefined)
            failOption("definition", `parameters "${other}" and "${name}" clash in their environment variable "${paramEnv(name)}"`)
        envs.set(paramEnv(name), name)
        params[name] = decl.default ?? ""
    }
    const declared = Object.keys(decls).map((name) => `"${name}"`).join(", ")
    for (const spec of specs) {
        const m = /^([^=]+)=(.*)$/s.exec(spec)
        if (m === null)
            failOption("params", `invalid value "${spec}" (expected "<name>=<value>")`)
        else if (!Object.hasOwn(decls, m[1]))
            failOption("params", `unknown parameter "${m[1]}" ` +
                (declared !== "" ? `(expected ${declared})` : "(the definition declares no parameters)"))
        params[m![1]] = m![2]
    }
    for (const [ name, decl ] of Object.entries(decls)) {
        const value = params[name]
        if (decl.required === true && value === "")
            failOption("params", `parameter "${name}" is required` + (decl.desc !== undefined ? ` (${decl.desc})` : ""))
        else if (decl.allow !== undefined && value !== "" && !decl.allow.includes(value))
            failOption("params", `invalid value "${value}" of parameter "${name}" ` +
                `(expected ${decl.allow.map((val) => `"${val}"`).join(", ")})`)
    }
    return params
}

/*  resolve the states of the processing type <type> through the option accessors <str>,
    <list>, and <has>, validated against the task lifecycle models, where the incoming
    states of an <unclaimed> agent are adapted onto the task lifecycle model of the project
    instead (so it supports every model, e.g. with "PLANNED" as "PLANNING" for "team" and
    as "OPEN" for "solo"), as it never changes the status of a task  */
const resolveStates = (
    str:       (key: string, def?: string) => string,
    list:      (key: string) => string[],
    has:       (key: string) => boolean,
    type:      DefinitionType,
    unclaimed: boolean
) => {
    const fail = failOption
    const verdicts: Record<string, string> = {}
    for (const spec of list("state-verdict")) {
        const m = /^([A-Z]+)=([A-Z]+)$/.exec(spec)
        if (m === null)
            fail("state-verdict", `invalid value "${spec}" (expected "<VERDICT>=<STATE>")`)
        verdicts[m![1]] = m![2]
    }
    const upper    = (key: string, def: string): string => str(key, def).toUpperCase()
    const incoming = [ ...new Set(list("state-incoming").map((state) => state.toUpperCase()).filter((state) => state !== "")) ]
    if (type === "phase" && incoming.length === 0)
        fail("state-incoming", "mandatory for \"--type phase\"")
    else if (incoming.length > 1 && !unclaimed && !has("state-activity"))
        fail("state-incoming", "multiple states allowed with \"--unclaimed\" or \"--state-activity\" only")
    const first    = incoming[0] ?? ""
    const activity = upper("state-activity", first)
    const success  = upper("state-success", first)
    const failure  = upper("state-failure", first)
    const phase    = upper("state-phase", success === statePrevious ? activity : success)
    const passed   = upper("state-passed", phase)

    /*  the states of the claim, where a "previous" success or failure state stands
        for all incoming states (as each one can be the incoming state of the claim)  */
    const targets   = (state: string): string[] => state === statePrevious ? incoming : [ state ]
    const claimKeys: [ string, string ][] = unclaimed ? [] : [
        [ "state-activity", activity ],
        ...targets(success).map((state): [ string, string ] => [ "state-success", state ]),
        ...targets(failure).map((state): [ string, string ] => [ "state-failure", state ]),
        [ "state-phase", phase ], [ "state-passed", passed ],
        ...Object.values(verdicts).map((state): [ string, string ] => [ "state-verdict", state ])
    ]
    const stateKeys: [ string, string ][] = type === "phase" ? [
        ...incoming.map((state): [ string, string ] => [ "state-incoming", state ]), ...claimKeys
    ] : []
    const models = Object.values(TaskFormat.taskLifecycles)
    for (const model of list("lifecycle"))
        if (!Object.hasOwn(TaskFormat.taskLifecycles, model))
            fail("lifecycle", `unknown task lifecycle model "${model}" ` +
                `(expected ${models.map((m) => `"${m.name}"`).join(", ")})`)
    for (const [ key, state ] of stateKeys)
        if (!models.some((model) => model.states.includes(state)))
            fail(key, `state "${state}" is not a state of any task lifecycle model`)
    const lifecycles = has("lifecycle") ? [ ...new Set(list("lifecycle")) ] :
        unclaimed ? models.map((model) => model.name) :
            models.filter((model) => stateKeys.every(([ , state ]) => model.states.includes(state))).map((model) => model.name)
    if (lifecycles.length === 0)
        fail("lifecycle", "no task lifecycle model contains all the given states")
    for (const model of lifecycles.map((name) => TaskFormat.taskLifecycles[name])) {
        if (unclaimed)
            continue
        for (const [ key, state ] of stateKeys)
            if (!model.states.includes(state))
                fail(key, `state "${state}" is not a state of the "${model.name}" task lifecycle model`)
        if (type !== "phase")
            continue
        const transitions: [ string, string, string ][] = [
            ...incoming.flatMap((state): [ string, string, string ][] => [
                [ "state-activity", state, activity ], [ "state-activity", activity, state ] ]),
            ...targets(success).map((state): [ string, string, string ] => [ "state-success", activity, state ]),
            ...targets(failure).map((state): [ string, string, string ] => [ "state-failure", activity, state ]),
            ...Object.values(verdicts).map((state): [ string, string, string ] => [ "state-verdict", activity, state ])
        ]
        for (const [ key, from, to ] of transitions) {
            const error = TaskFormat.checkStatus(model, from, to)
            if (error !== "")
                fail(key, error)
        }
    }
    return { incoming, activity, success, failure, phase, passed, verdicts, lifecycles }
}

/*  resolve the prompt of the processing type <type> through the option accessors <str>
    and <has>: the skill (if any) and the parsed template of its arguments, of the prompt
    text, or of the prompt file, with the declared parameters <params>  */
const resolvePrompt = (
    str:    (key: string, def?: string) => string,
    has:    (key: string) => boolean,
    type:   DefinitionType,
    params: string[]
): { skill: string, template: Template } => {
    const fail    = failOption
    const prompts = [ "prompt-skill", "prompt-text", "prompt-file" ].filter((key) => has(key))
    if (prompts.length !== 1)
        fail(prompts[1] ?? "prompt-skill", "exactly one of \"--prompt-skill\", \"--prompt-text\", or \"--prompt-file\" is required")
    if (has("prompt-args") && !has("prompt-skill"))
        fail("prompt-args", "allowed with \"--prompt-skill\" only")
    const skill = str("prompt-skill")
    if (has("prompt-skill") && !/^(?:[A-Za-z0-9_.-]+:)?[A-Za-z0-9_.-]+$/.test(skill))
        fail("prompt-skill", `invalid skill name "${skill}"`)
    let template: Template
    if (has("prompt-skill"))
        template = parseTemplate(str("prompt-args", type === "phase" ? "{id}" : "{id}: {prompt}"), "prompt-args", type, params)
    else if (has("prompt-text"))
        template = parseTemplate(str("prompt-text"), "prompt-text", type, params)
    else {
        let text = ""
        try {
            text = fs.readFileSync(path.resolve(str("prompt-file")), "utf8")
        }
        catch (err: unknown) {
            fail("prompt-file", `cannot read prompt file: ${err instanceof Error ? err.message : String(err)}`)
        }
        template = parseTemplate(text, "prompt-file", type, params)
    }
    return { skill, template }
}

/*  resolve the success criteria, the output line matches, and the accepted verdicts of the
    processing type <type> through the option accessors <list> and <has>, validated against
    the determination of a verdict <verdicting> and the target states per verdict <verdicts>  */
const resolveSuccess = (
    list:       (key: string) => string[],
    has:        (key: string) => boolean,
    type:       DefinitionType,
    unclaimed:  boolean,
    verdicting: boolean,
    verdicts:   Record<string, string>
) => {
    const fail     = failOption
    const criteria = has("success-criterion") ? [ ...new Set(list("success-criterion")) ] :
        (type === "phase" ? [ "exit", "clean" ] : [ "clean", "changed" ])
    for (const criterion of criteria) {
        if (!(definitionCriteria as readonly string[]).includes(criterion))
            fail("success-criterion", `invalid criterion "${criterion}" ` +
                `(expected ${definitionCriteria.map((c) => `"${c}"`).join(", ")})`)
        else if (criterion === "changed" && type !== "request")
            fail("success-criterion", "criterion \"changed\" is for \"--type request\" only")
        else if (criterion === "status" && type !== "phase")
            fail("success-criterion", "criterion \"status\" is for \"--type phase\" only")
        else if (criterion === "status" && unclaimed)
            fail("success-criterion", "criterion \"status\" is not for \"--unclaimed\" (as an unclaimed task has no phase success state)")
        else if (criterion === "verdict" && !verdicting)
            fail("success-criterion", "criterion \"verdict\" requires \"--verdict-label\" (or the hook \"verdict\")")
        else if (criterion === "attachment" && !has("attach-expect"))
            fail("success-criterion", "criterion \"attachment\" requires \"--attach-expect\"")
    }
    const match = list("success-match").map((spec) => {
        try {
            return new RegExp(spec)
        }
        catch (err: unknown) {
            return fail("success-match", `invalid regular expression "${spec}": ${err instanceof Error ? err.message : String(err)}`)
        }
    })
    if ((Object.keys(verdicts).length > 0 || has("verdict-allow")) && !verdicting)
        fail(Object.keys(verdicts).length > 0 ? "state-verdict" : "verdict-allow", "requires \"--verdict-label\" (or the hook \"verdict\")")
    const allow = has("verdict-allow") ? list("verdict-allow") : Object.keys(verdicts)
    for (const verdict of allow)
        if (!/^[A-Z]+$/.test(verdict))
            fail("verdict-allow", `invalid verdict "${verdict}" (expected an upper-case word)`)
    for (const verdict of Object.keys(verdicts))
        if (!allow.includes(verdict))
            fail("state-verdict", `verdict "${verdict}" is not accepted by "--verdict-allow"`)
    return { criteria: criteria as DefinitionCriterion[], match, allow }
}

/*  resolve the attachments through the option accessors <str> and <has>: the expected
    attachment and the attachment leaving a task unclaimed, validated together with the
    kinds of the output and change set attachments  */
const resolveAttach = (
    str: (key: string, def?: string) => string,
    has: (key: string) => boolean
): { expect: AttachSpec | null, skip: AttachSpec | null } => {
    const fail   = failOption
    const kindRe = /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/
    const attachSpec = (key: string): AttachSpec | null => {
        if (!has(key))
            return null
        const spec = str(key)
        const i    = spec.indexOf(";")
        const mime = i < 0 ? "" : spec.slice(0, i).trim().toLowerCase()
        const kind = i < 0 ? spec.trim() : spec.slice(i + 1).trim()
        if (!kindRe.test(kind) || (i >= 0 && !/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(mime)))
            fail(key, `invalid attachment "${spec}" (expected "[<mime-type>;]<kind>")`)
        return { mime, kind }
    }
    if (has("attach-output") && !kindRe.test(str("attach-output")))
        fail("attach-output", `invalid kind "${str("attach-output")}"`)
    else if (str("attach-output") === "agent")
        fail("attach-output", "kind \"agent\" is reserved for the processing log")
    if (has("attach-changeset") && !kindRe.test(str("attach-changeset")))
        fail("attach-changeset", `invalid kind "${str("attach-changeset")}"`)
    const expect = attachSpec("attach-expect")
    if (expect !== null && has("attach-output")
        && attachMatches(expect, `text/plain; kind="${str("attach-output")}"`))
        fail("attach-expect", `attachment "${str("attach-expect")}" is always met by the output attachment of "--attach-output"`)
    return { expect, skip: attachSpec("attach-skip") }
}

/*  resolve the definition of the agent named <name> from its (camel-cased) command-line
    options <opts>: the defaults, overridden by the definition of "--definition" (if any),
    overridden by the given options, validated against the task lifecycle models  */
export const resolveDefinition = async (opts: Record<string, unknown>, name: string): Promise<ResolvedDefinition> => {
    /*  merge the values of the definition and of the given options, where a given
        option also replaces its mutually exclusive alternatives of the definition  */
    const given: Record<string, string | string[] | boolean> = {}
    for (const option of definitionOptions) {
        const value = opts[optionAttr(option.key)]
        if (value !== undefined && value !== false)
            given[option.key] = value as string | string[] | boolean
    }
    const loaded = typeof given.definition === "string" ? await loadDefinition(given.definition) : { values: {}, params: {}, hooks: {}, guards: false }
    const values = overlayValues(loaded.values, given)
    const str    = (key: string, def = ""): string => typeof values[key] === "string" ? values[key] as string : def
    const list   = (key: string): string[] => Array.isArray(values[key]) ? values[key] as string[] : []
    const flag   = (key: string): boolean => values[key] === true
    const has    = (key: string): boolean => values[key] !== undefined
    const fail   = failOption
    const choice = <T extends string> (key: string, choices: readonly T[], def: T): T => {
        const value = str(key, def)
        if (!choices.includes(value as T))
            fail(key, `invalid value "${value}" (expected ${choices.map((c) => `"${c}"`).join(", ")})`)
        return value as T
    }

    /*  the title and the description of the operation, each with its whitespace collapsed
        (as the task boards wrap the description onto their width themselves)  */
    const prose = (key: string, max: number): string => {
        const text = str(key).replace(/\s+/g, " ").trim()
        if (text.length > max)
            fail(key, `too long text (${text.length} characters, expected at most ${max})`)
        return text
    }
    const title       = prose("title", 80)
    const description = prose("description", 600)

    /*  the processing type, the working directory, and the type-specific options  */
    const type    = choice("type", definitionTypes, "phase")
    const workdir = choice("workdir", definitionWorkdirs, "project")
    const phaseOnly = [ "unclaimed", "state-incoming", "state-activity", "state-success", "state-failure", "state-phase",
        "state-passed", "state-verdict", "tag-success", "tag-failure", "tag-retry", "assign-required", "attach-skip" ]
    const requestOnly = [ "request-name", "request-done" ]
    for (const key of type === "request" ? phaseOnly : requestOnly)
        if (has(key))
            fail(key, `not allowed with "--type ${type}" (for "--type ${type === "request" ? "phase" : "request"}" only)`)
    if (has("finish-commit") && workdir !== "changeset")
        fail("finish-commit", `not allowed with "--workdir ${workdir}" (for "--workdir changeset" only)`)
    if (has("attach-changeset") && workdir !== "changeset" && workdir !== "target")
        fail("attach-changeset", `not allowed with "--workdir ${workdir}" (for "--workdir changeset" or "target" only)`)
    if (loaded.hooks.passes !== undefined && type !== "phase")
        fail("definition", "hook \"passes\" is for \"--type phase\" only")

    /*  the unclaimed processing of a phase agent, which never changes the status or the
        assignee of a task, never waits for its predecessors, and never writes into the
        changeset or the target of a task (as another agent can claim the task meanwhile)  */
    const unclaimed = flag("unclaimed")
    if (unclaimed) {
        const claimedOnly = [ "state-activity", "state-success", "state-failure", "state-phase", "state-passed",
            "state-verdict", "assign-required", "assign-success", "assign-failure" ]
        for (const key of claimedOnly)
            if (has(key))
                fail(key, "not allowed with \"--unclaimed\" (as the status and the assignee of an unclaimed task are never changed)")
        if (workdir === "changeset" || workdir === "target")
            fail("workdir", `"${workdir}" not allowed with "--unclaimed" (as an unclaimed task can be claimed by another agent meanwhile)`)
        if (loaded.hooks.passes !== undefined)
            fail("definition", "hook \"passes\" is not for \"--unclaimed\" (as an unclaimed task never waits for its predecessors)")
    }

    /*  the model of the agent tool: a plain model (for all tasks, as size "*"),
        or the models per "Effort:" size, where none means the default of the tool  */
    const modelSpec = str("model").trim()
    const sizes: Record<string, string> = {}
    if (modelSpec !== "" && !modelSpec.includes("="))
        sizes["*"] = modelSpec
    else if (modelSpec !== "") {
        for (const pair of modelSpec.split(",").map((item) => item.trim())) {
            const m = /^(XS|S|M|L|XL|\*)=(\S+)$/.exec(pair)
            if (m === null)
                fail("model", `invalid pair "${pair}" (expected "<size>=<model>" with size "XS", "S", "M", "L", "XL", or "*")`)
            else if (Object.hasOwn(sizes, m[1]))
                fail("model", `size "${m[1]}" given twice`)
            else
                sizes[m[1]] = m[2]
        }
    }
    const model = { spec: modelSpec, sizes }

    /*  whether a verdict is determined (by "--verdict-label" or the hook "verdict")  */
    const verdicting = has("verdict-label") || loaded.hooks.verdict !== undefined

    /*  the states (see "resolveStates")  */
    const { incoming, activity, success, failure, phase, passed, verdicts, lifecycles } =
        resolveStates(str, list, has, type, unclaimed)

    /*  the tag and the assignee  */
    const assignName = str("assign-name", name)
    if (!/^[A-Za-z0-9][A-Za-z0-9_.@-]*$/.test(assignName))
        fail("assign-name", `invalid assignee "${assignName}"`)
    const requestName = str("request-name", name)
    let tagName = str("tag-name", "")
    if (type === "request") {
        let tag = ""
        try {
            tag = requestsOf(requestName).tag
        }
        catch (err: unknown) {
            fail(has("request-name") ? "request-name" : "name", err instanceof Error ? err.message : String(err))
        }
        if (tagName !== "" && tagName !== tag)
            fail("tag-name", `has to be "${tag}" for the requests "${requestName}" (as attached by "ase task request")`)
        tagName = tag
    }
    else if (tagName === "")
        tagName = `ase-agent-${name.toLowerCase()}`
    if (!/^ase-agent-[a-z0-9][a-z0-9_.-]*$/.test(tagName))
        fail("tag-name", `invalid tag "${tagName}" (expected "ase-agent-<word>" in lower-case, without ":")`)
    const tagValue = (key: string): string | null | undefined => {
        const spec = str(key, tagName)
        if (spec === "none")
            return null
        else if (spec === tagName)
            return undefined
        const m = /^([^:]+):([a-z0-9][a-z0-9_.-]*)$/.exec(spec)
        if (m === null || m[1] !== tagName)
            fail(key, `invalid tag "${spec}" (expected "${tagName}", "${tagName}:<value>" in lower-case, or "none", ` +
                "as a foreign tag would let the agent claim the task again)")
        if (m![2] === "active")
            fail(key, `invalid tag "${spec}" (the value "active" marks a claimed task)`)
        return m![2]
    }
    if (flag("tag-retry") && has("tag-failure"))
        fail("tag-retry", "not allowed together with \"--tag-failure\"")
    const assignee = (key: string, def: string): string => {
        const who = str(key, def)
        if (who !== "none" && who !== "previous" && !/^[A-Za-z0-9][A-Za-z0-9_.@-]*$/.test(who))
            fail(key, `invalid assignee "${who}" (expected a name, "none", or "previous")`)
        return who
    }
    const handover      = type === "phase" ? "none" : "previous"
    const assignSuccess = assignee("assign-success", handover)
    const assignFailure = assignee("assign-failure", handover)
    const tagSuccess = tagValue("tag-success")
    const tagFailure = flag("tag-retry") ? null : tagValue("tag-failure")
    const returning  = (state: string) => state === statePrevious || incoming.includes(state)
    if (tagSuccess === null && type === "phase" && (returning(success) || Object.values(verdicts).some(returning))
        && !has("attach-skip") && !loaded.guards && !unassignedFrom(flag("assign-required"), assignName, assignSuccess))
        fail("tag-success", "\"none\" would let the agent claim a task again, which returns into an incoming state " +
            "(unless guarded by \"--attach-skip\", by the hook \"ready\" of a definition declaring \"tag-success: none\" itself, " +
            "or by \"--assign-required\" with \"--assign-success\" handing the task over to somebody else)")
    for (const key of [ "tag-require", "tag-exclude" ])
        for (const tag of list(key))
            if (!/^[^\s,]+$/.test(tag))
                fail(key, `invalid tag "${tag}"`)

    /*  the parameters (see "resolveParams")  */
    const decls  = loaded.params
    const params = resolveParams(decls, list("params"))

    /*  the prompt (see "resolvePrompt")  */
    const { skill, template } = resolvePrompt(str, has, type, Object.keys(decls))

    /*  the success criteria and the verdict (see "resolveSuccess")  */
    const { criteria, match, allow } = resolveSuccess(list, has, type, unclaimed, verdicting, verdicts)

    /*  the attachments (see "resolveAttach")  */
    const { expect: attachExpect, skip: attachSkip } = resolveAttach(str, has)
    for (const key of [ "prepare-run", "finish-success", "finish-failure" ])
        if ((has(key) && str(key, "-") === "") || list(key).some((cmd) => cmd.trim() === ""))
            fail(key, "empty shell command")

    /*  whether a request agent requires the prompts of its requests: by the placeholder
        "{prompt}" of its prompt template, or potentially by a hook receiving the job (and
        hence the prompt of the request), resp. uses them optionally by "{prompt}" used only
        within the conditional "{?prompt:...}", else ignores them  */
    const consumes: AgentPrompt = type === "request" && (template.required.has("prompt")
        || ([ "prepare", "prompt", "model", "finish" ] as const).some((hook) => loaded.hooks[hook] !== undefined)) ? "required" :
        type === "request" && template.names.has("prompt") ? "optional" : "ignored"

    return {
        name, title, description, type, workdir, lifecycles, unclaimed, model,
        serial:  flag("serial"),
        state:   { incoming, activity, success, failure, phase, passed, verdict: verdicts },
        tag:     {
            name: tagName, success: tagSuccess, failure: tagFailure, require: list("tag-require"), exclude: list("tag-exclude"),
            guarded: loaded.guards
        },
        assign:  {
            name: assignName, required: flag("assign-required"),
            success: assignSuccess, failure: assignFailure
        },
        request: { name: requestName, done: str("request-done", "processed"), prompt: consumes },
        prompt:  { skill, template },
        prepare: list("prepare-run"),
        success: { criteria, match },
        verdict: { label: str("verdict-label"), allow },
        attach:  {
            output: str("attach-output"), expect: attachExpect, skip: attachSkip,
            changeset: str("attach-changeset")
        },
        finish:  { commit: flag("finish-commit"), success: str("finish-success"), failure: str("finish-failure") },
        params,
        hooks:   loaded.hooks
    }
}

