/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import type { DefinitionType }      from "./ase-agent-definition-schema.js"

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

