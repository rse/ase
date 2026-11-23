/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import { typeParam }                from "./ase-task-request.js"

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
    value, a repeatable value, a flag, or a field of an entry of the ordered list of the
    follow-up prompts), the name of their argument, and their description  */
export type DefinitionOption = { key: string, kind: "value" | "list" | "flag" | "followup", arg: string, desc: string }
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
    opt("followup-skill",    "followup", "name",       "skill to invoke as a follow-up prompt after a successful prompt, " +
        "starting a new follow-up (repeatable)"),
    opt("followup-args",     "followup", "template",   "arguments of the skill of the current follow-up (default: none)"),
    opt("followup-text",     "followup", "template",   "prompt text to invoke as a follow-up prompt (instead of a skill), " +
        "starting a new follow-up (repeatable)"),
    opt("followup-file",     "followup", "file",       "file with the prompt text to invoke as a follow-up prompt " +
        "(instead of a skill), starting a new follow-up (repeatable)"),
    opt("followup-session",  "followup", "session",    "session of the agent tool of the current follow-up: \"fresh\", " +
        "or \"resume\" to resume the session of the preceding invocation (default: \"fresh\")"),
    opt("followup-when",     "followup", "template",   "condition of the current follow-up, " +
        "which is skipped if a condition renders to an empty string or \"false\" (repeatable)"),
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

/*  the name of a parameter, and the name of the environment variable carrying its value  */
export const paramNameRe = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/
export const paramEnv = (name: string): string =>
    `ASE_AGENT_PARAM_${name.toUpperCase().replace(/-/g, "_")}`

/*  the fields of a follow-up prompt (see "AgentFollowup"), where exactly one of the
    first three starts an entry of the ordered list of the follow-up prompts  */
export const followupStarts = [ "skill", "text", "file" ]
export const followupFields = [ ...followupStarts, "args", "session", "when" ]

/*  the names of the hooks of a definition (see "AgentHooks")  */
export const hookNames = [ "start", "order", "passes", "ready", "prepare", "prompt", "model", "verdict", "success", "settle", "finish", "stop" ]

/*  an attachment specification "[<mime-type>;]<kind>", and whether an attachment type matches it
    (by its "kind" parameter exactly, and, if given, by its MIME type)  */
export type AttachSpec = { mime: string, kind: string }
export const attachMatches = (spec: AttachSpec, type: string): boolean =>
    typeParam(type, "kind") === spec.kind
    && (spec.mime === "" || (type.split(";")[0] ?? "").trim().toLowerCase() === spec.mime)

