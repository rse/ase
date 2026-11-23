/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import fs                           from "node:fs"
import path                         from "node:path"

import * as TaskFormat              from "./ase-task-format.js"
import { requestsOf }               from "./ase-task-request.js"
import type { AgentHooks }          from "./ase-agent-definition-api.js"
import type { AgentPrompt }         from "./ase-agent-relay-core.js"
import { statePrevious }            from "./ase-agent-runtime-phase.js"
import {
    definitionTypes, definitionWorkdirs, definitionCriteria, definitionOptions,
    optionAttr, paramEnv, followupStarts, followupFields, attachMatches
}                                   from "./ase-agent-definition-schema.js"
import type {
    DefinitionType, DefinitionWorkdir, DefinitionCriterion, AttachSpec
}                                   from "./ase-agent-definition-schema.js"
import { parseTemplate }            from "./ase-agent-definition-template.js"
import type { Template }            from "./ase-agent-definition-template.js"
import { loadDefinition, overlayValues } from "./ase-agent-definition-loader.js"
import type { ParamDecl }           from "./ase-agent-definition-loader.js"

/*  a resolved follow-up prompt (see "AgentFollowup"): the skill (if any) and the parsed
    template of its arguments or of its prompt text, its session, and its conditions  */
export type ResolvedFollowup = { skill: string, template: Template, session: "fresh" | "resume", when: Template[] }

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
    followup: ResolvedFollowup[]
    prepare: string[]
    success: { criteria: DefinitionCriterion[], match: RegExp[] }
    verdict: { label: string, allow: string[] }
    attach:  { output: string, expect: AttachSpec | null, skip: AttachSpec | null, changeset: string }
    finish:  { commit: boolean, success: string, failure: string }
    params:  Record<string, string>
    hooks:   AgentHooks
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

/*  resolve the follow-up prompts of the processing type <type> from the ordered list
    of their fields <tokens> ("<field>=<value>", see "followupTokens", where only the
    field "when" can be given multiple times per follow-up), validated like the prompt
    (see "resolvePrompt"), with the declared parameters <params>  */
const resolveFollowups = (tokens: string[], type: DefinitionType, params: string[]): ResolvedFollowup[] => {
    const fail    = failOption
    const entries: { fields: Record<string, string>, when: string[] }[] = []
    for (const token of tokens) {
        const i     = token.indexOf("=")
        const field = i < 0 ? "" : token.slice(0, i)
        const value = token.slice(i + 1)
        const last  = entries[entries.length - 1]
        if (!followupFields.includes(field))
            fail("followup-skill", `invalid follow-up field "${token}"`)
        else if (followupStarts.includes(field))
            entries.push({ fields: { [field]: value }, when: [] })
        else if (last === undefined)
            fail(`followup-${field}`, "requires a preceding \"--followup-skill\", \"--followup-text\", or \"--followup-file\"")
        else if (field === "when")
            last.when.push(value)
        else if (Object.hasOwn(last.fields, field))
            fail(`followup-${field}`, "given twice for the same follow-up")
        else
            last.fields[field] = value
    }
    return entries.map(({ fields: entry, when: conds }) => {
        if (entry.args !== undefined && entry.skill === undefined)
            fail("followup-args", "allowed with \"--followup-skill\" only")
        if (entry.skill !== undefined && !/^(?:[A-Za-z0-9_.-]+:)?[A-Za-z0-9_.-]+$/.test(entry.skill))
            fail("followup-skill", `invalid skill name "${entry.skill}"`)
        const session = entry.session ?? "fresh"
        if (session !== "fresh" && session !== "resume")
            fail("followup-session", `invalid value "${session}" (expected "fresh" or "resume")`)
        let template: Template
        if (entry.skill !== undefined)
            template = parseTemplate(entry.args ?? "", "followup-args", type, params)
        else if (entry.text !== undefined)
            template = parseTemplate(entry.text, "followup-text", type, params)
        else {
            let text = ""
            try {
                text = fs.readFileSync(path.resolve(entry.file), "utf8")
            }
            catch (err: unknown) {
                fail("followup-file", `cannot read prompt file: ${err instanceof Error ? err.message : String(err)}`)
            }
            template = parseTemplate(text, "followup-file", type, params)
        }
        const when = conds.map((cond) => parseTemplate(cond, "followup-when", type, params))
        return { skill: entry.skill ?? "", template, session: session as ResolvedFollowup["session"], when }
    })
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

/*  resolve the model of the agent tool from its option value <value>: a plain model
    (for all tasks, as size "*"), or the models per "Effort:" size, where none means
    the default of the tool  */
const resolveModel = (value: string): ResolvedDefinition["model"] => {
    const spec = value.trim()
    const sizes: Record<string, string> = {}
    if (spec !== "" && !spec.includes("="))
        sizes["*"] = spec
    else if (spec !== "") {
        for (const pair of spec.split(",").map((item) => item.trim())) {
            const m = /^(XS|S|M|L|XL|\*)=(\S+)$/.exec(pair)
            if (m === null)
                failOption("model", `invalid pair "${pair}" (expected "<size>=<model>" with size "XS", "S", "M", "L", "XL", or "*")`)
            else if (Object.hasOwn(sizes, m[1]))
                failOption("model", `size "${m[1]}" given twice`)
            else
                sizes[m[1]] = m[2]
        }
    }
    return { spec, sizes }
}

/*  resolve the tag and the assignee of the agent named <name> of the processing type <type>
    through the option accessors <str>, <list>, <flag>, and <has>, validated against the
    incoming states <incoming>, the success state <success>, the target states per verdict
    <verdicts>, and whether the hook "ready" of the definition guards an untagged task <guards>  */
const resolveTag = (
    str:    (key: string, def?: string) => string,
    list:   (key: string) => string[],
    flag:   (key: string) => boolean,
    has:    (key: string) => boolean,
    name:   string,
    type:   DefinitionType,
    states: { incoming: string[], success: string, verdicts: Record<string, string> },
    guards: boolean
) => {
    const fail = failOption
    const { incoming, success, verdicts } = states
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
        && !has("attach-skip") && !guards && !unassignedFrom(flag("assign-required"), assignName, assignSuccess))
        fail("tag-success", "\"none\" would let the agent claim a task again, which returns into an incoming state " +
            "(unless guarded by \"--attach-skip\", by the hook \"ready\" of a definition declaring \"tag-success: none\" itself, " +
            "or by \"--assign-required\" with \"--assign-success\" handing the task over to somebody else)")
    for (const key of [ "tag-require", "tag-exclude" ])
        for (const tag of list(key))
            if (!/^[^\s,]+$/.test(tag))
                fail(key, `invalid tag "${tag}"`)
    return { assignName, requestName, tagName, tagSuccess, tagFailure, assignSuccess, assignFailure }
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
        if (value !== undefined && value !== false && option.kind !== "followup")
            given[option.key] = value as string | string[] | boolean
    }
    if (Array.isArray(opts.followup))
        given.followup = opts.followup as string[]
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

    /*  the model of the agent tool (see "resolveModel")  */
    const model = resolveModel(str("model"))

    /*  whether a verdict is determined (by "--verdict-label" or the hook "verdict")  */
    const verdicting = has("verdict-label") || loaded.hooks.verdict !== undefined

    /*  the states (see "resolveStates")  */
    const { incoming, activity, success, failure, phase, passed, verdicts, lifecycles } =
        resolveStates(str, list, has, type, unclaimed)

    /*  the tag and the assignee (see "resolveTag")  */
    const { assignName, requestName, tagName, tagSuccess, tagFailure, assignSuccess, assignFailure } =
        resolveTag(str, list, flag, has, name, type, { incoming, success, verdicts }, loaded.guards)

    /*  the parameters (see "resolveParams")  */
    const decls  = loaded.params
    const params = resolveParams(decls, list("params"))

    /*  the prompt (see "resolvePrompt")  */
    const { skill, template } = resolvePrompt(str, has, type, Object.keys(decls))

    /*  the follow-up prompts (see "resolveFollowups")  */
    const followups = resolveFollowups(list("followup"), type, Object.keys(decls))

    /*  the success criteria and the verdict (see "resolveSuccess")  */
    const { criteria, match, allow } = resolveSuccess(list, has, type, unclaimed, verdicting, verdicts)

    /*  the attachments (see "resolveAttach")  */
    const { expect: attachExpect, skip: attachSkip } = resolveAttach(str, has)
    for (const key of [ "prepare-run", "finish-success", "finish-failure" ])
        if ((has(key) && str(key, "-") === "") || list(key).some((cmd) => cmd.trim() === ""))
            fail(key, "empty shell command")

    /*  whether a request agent requires the prompts of its requests: by the placeholder
        "{prompt}" of its prompt template (or of the template of a follow-up prompt), or
        potentially by a hook receiving the job (and hence the prompt of the request), resp.
        uses them optionally by "{prompt}" used only within the conditional "{?prompt:...}"
        (or within the condition of a follow-up prompt), else ignores them  */
    const templates = [ template, ...followups.map((followup) => followup.template) ]
    const consumes: AgentPrompt = type === "request" && (templates.some((t) => t.required.has("prompt"))
        || ([ "prepare", "prompt", "model", "finish" ] as const).some((hook) => loaded.hooks[hook] !== undefined)) ? "required" :
        type === "request" && [ ...templates, ...followups.flatMap((followup) => followup.when) ]
            .some((t) => t.names.has("prompt")) ? "optional" : "ignored"

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
        followup: followups,
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

