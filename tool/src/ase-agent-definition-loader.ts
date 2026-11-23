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
import type { AgentDefinition, AgentHooks } from "./ase-agent-definition-api.js"
import {
    definitionGroups, definitionOptions, paramNameRe,
    followupStarts, followupFields, hookNames
}                                   from "./ase-agent-definition-schema.js"
import rebooter                     from "./ase-agent-definition-builtin/rebooter.js"
import condenser                    from "./ase-agent-definition-builtin/condenser.js"
import griller                      from "./ase-agent-definition-builtin/griller.js"
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
    rebooter, condenser, griller, implementer, qualifier, integrator, editor, estimator, researcher
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

/*  flatten the nested option groups of a definition (e.g. "state: { incoming: PLANNED }"
    into "state-incoming: PLANNED"), where the map "params" and the follow-up prompts
    "followup" are kept as-is, and where <where> names the definition in errors  */
export const flattenDefinition = (data: Record<string, unknown>, where: string): Record<string, unknown> => {
    const flat: Record<string, unknown> = {}
    const set = (key: string, value: unknown) => {
        if (Object.hasOwn(flat, key))
            throw new Error(`${where}: option "${key}" given twice (flat and nested)`)
        flat[key] = value
    }
    for (const [ key, value ] of Object.entries(data)) {
        if (key !== "params" && key !== "followup" && value !== null && typeof value === "object" && !Array.isArray(value)) {
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

/*  convert the follow-up prompts "followup" <value> of a definition (an object or a list
    of objects, see "AgentFollowup") into the ordered list of their fields "<field>=<value>"
    (as given by the options "--followup-<field>", each entry starting with its skill, text,
    or file, and with a list of conditions "when" given as one field per condition), where a
    relative file is resolved against the directory <dir> (if given), and where <where> names
    the definition in errors  */
export const followupTokens = (value: unknown, where: string, dir: string): string[] =>
    (Array.isArray(value) ? value : [ value ]).flatMap((entry: unknown, i) => {
        if (entry === null || typeof entry !== "object" || Array.isArray(entry))
            throw new Error(`${where}: invalid follow-up #${i + 1} (expected an object)`)
        const fields = Object.entries(entry as Record<string, unknown>)
            .flatMap(([ field, val ]) => field === "when" && Array.isArray(val) ?
                val.map((item: unknown): [ string, unknown ] => [ field, item ]) : [ [ field, val ] as [ string, unknown ] ])
            .filter(([ , val ]) => val !== null && val !== undefined)
        for (const [ field, val ] of fields) {
            if (!followupFields.includes(field))
                throw new Error(`${where}: follow-up #${i + 1}: unknown field "${field}" ` +
                    `(expected ${followupFields.map((f) => `"${f}"`).join(", ")})`)
            if (typeof val !== "string" && typeof val !== "number")
                throw new Error(`${where}: follow-up #${i + 1}: invalid value of field "${field}" (expected a string)`)
        }
        const starts = fields.filter(([ field ]) => followupStarts.includes(field))
        if (starts.length !== 1)
            throw new Error(`${where}: follow-up #${i + 1}: exactly one of the fields "skill", "text", or "file" is required`)
        return [ ...starts, ...fields.filter(([ field ]) => !followupStarts.includes(field)) ].map(([ field, val ]) =>
            `${field}=${field === "file" && dir !== "" ? path.resolve(dir, String(val)) : String(val)}`)
    })

/*  a normalized parameter declaration of a definition (see "AgentParam"),
    with only the fields given by the definition (to extend those of its base)  */
export type ParamDecl = { desc?: string, default?: string, required?: boolean, allow?: string[] }

/*  a loaded definition: its flattened and normalized option values (by long option name,
    where a false flag only unsets the flag of its base definition), its parameter
    declarations, its hooks, whether its hook "ready" guards an untagged task against
    being claimed again (as declared together with "tag-success: none" by the same
    definition, or inherited unreplaced from a base definition guarding so), and the
    specification of its base definition (if any)  */
export type LoadedDefinition = {
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
        if (key === "followup") {
            if (value !== null && value !== undefined)
                values.followup = followupTokens(value, where, dir)
            continue
        }
        const option = definitionOptions.find((opt) => opt.key === key)
        if (option === undefined)
            throw new Error(`${where}: unknown option "${key}"`)
        else if (option.kind === "followup")
            throw new Error(`${where}: option "${key}" is for the command line only ` +
                "(use the list \"followup\" of follow-up objects instead)")
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
export const overlayValues = <T> (lower: Record<string, T>, upper: Record<string, T>): Record<string, T> => {
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
export const loadDefinition = async (spec: string, chain: string[] = []): Promise<LoadedDefinition> => {
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

