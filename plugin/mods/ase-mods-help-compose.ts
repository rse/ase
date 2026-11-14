/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

/*  Claude Code function hooks module ("mod", EARLY ACCESS):
    Synopsis form, showing for a skill command (bare or with its options and
    arguments already typed, which prefill the form), once suffixed with
    "!!", the SYNOPSIS of its manual page as a form in a master/detail view
    in the band above the prompt, where LEFT/RIGHT steps through its options
    and arguments (and shows their descriptions, scrolled by "b"/"f"),
    SPACE toggles them, RETURN edits their values (with a drop-down box for
    fixed values), RETURN at the end (or "!!" outside a value) takes over
    the composed command into the prompt, and BACKSPACE cancels.  */

import type { Elements, Frozen, PromptBox, PromptEditInput, RenderElement } from "claude-code"
import { type Engine, type Text, type Key, type BandRender, type BandScroll, type View, PICKED, COMMAND,
    held, decode, section, wrap, uniform, flow, frame, paint, layout, wheel, panel } from "./ase-mods-common"

/*  the trigger of a synopsis form inside the prompt (a skill command suffixed
    with "!!", and with its typed options and arguments, if any, separated by
    a blank from it), the color of the drop-down box of a field with fixed
    values, the title placed into the top edge of the frame, and the name of
    the extra field with the typed words not recognized as of the synopsis  */
const SYNOPSIS = /^(\/(?:ase:)?(ase-[a-z0-9]+-[a-z0-9]+))(?:\s+(\S(?:[^]*\S)?)\s+|\s*)!!$/
const CHOICES  = "gray"
const TITLE    = "[ ⧉ ASE: Compose Skill Command ]"
const UNKNOWN  = "unrecognized"

/*  a field of a synopsis form: an option (a flag or with a value) or an argument,
    with its short option name, placeholder, fixed values, value suffix,
    description, and state  */
type Field = {
    kind:     "option" | "argument",
    name:     string,
    short:    string,
    label:    string,
    choices:  string[],
    list:     boolean,
    valued:   boolean,
    suffix:   string,
    required: boolean,
    help:     string,
    enabled:  boolean,
    value:    string
}

/*  a synopsis form: the scroll state of its band, the skill command, the prompt
    to restore on cancel (the command as typed), its fields, the focused field
    (the apply position after the last field), the state of an edited field,
    the focus and editing state shown (resetting the scrolling on change) of
    the detail view, and the last key outside a field, if a "!" or "/"  */
type Form = View & {
    command: string,
    typed:   string,
    fields:  Field[],
    pos:     number,
    edit:    boolean,
    buffer:  string,
    caret:   number,
    choice:  number,
    picked:  Set<string>,
    anchor:  string,
    pending: string
}

/*  extract the descriptions of the (usually bulleted) items of a manual page
    section, keyed by every match of a global pattern in the head line of each item  */
const descriptions = (text: string, key: RegExp): Map<string, string> => {
    const result = new Map<string, string>()
    for (const item of text.split(/^(?=(?:- {3})?[`*[])/m).filter((item) => /^(?:- {3})?[`*[]/.test(item))) {
        const [ head, ...body ] = item.split("\n")
        const help = `${head!.replace(/^- {3}/, "").replace(/:$/, "")}\n\n` +
            body.map((line) => line.replace(/^ {4}/, "")).join("\n").trim()
        for (const m of head!.matchAll(key))
            if (!result.has(m[1]!))
                result.set(m[1]!, help)
    }
    return result
}

/*  split an argument line of a synopsis into its top-level units  */
const units = (line: string): string[] => {
    const result: string[] = []
    let unit  = ""
    let depth = 0
    for (const ch of line) {
        if (ch === " " && depth === 0) {
            if (unit !== "")
                result.push(unit)
            unit = ""
        }
        else {
            depth += ch === "[" ? 1 : ch === "]" ? -1 : 0
            unit  += ch
        }
    }
    if (unit !== "")
        result.push(unit)
    return result
}

/*  parse the SYNOPSIS of a manual page into the fields of a synopsis form, where
    the fields of all synopsis variants are merged (those of further variants and
    of alternative groups as optional ones), the "--help" option is skipped, and
    an option with fixed values initially has its first value  */
const synopsis = (manual: string): Field[] => {
    const opthelp = descriptions(section(manual, "OPTIONS"), /`(--[\w-]+)`/g)
    const arghelp = descriptions(section(manual, "ARGUMENTS"), /\*([^*]+)\*/g)
    const result: Field[] = []
    let variants = 0
    for (const line of section(manual, "SYNOPSIS").split("\n").map((line) => line.trim())) {
        const heading = /^`ase-[a-z0-9]+-[a-z0-9]+`$/.test(line)
        variants += heading ? 1 : 0
        if (line === "" || heading)
            continue
        const group = /^\(.*\)$/.test(line)
        const parts = group ? line.slice(1, -1).split(" | ") : line.includes("`--") ? [ line ] : units(line)
        for (const part of parts) {
            const required = !group && variants <= 1 && !part.startsWith("[")
            const inner    = part.replace(/^\[(.*)\]$/, "$1")
            const long     = /`(--[\w-]+)/.exec(inner)?.[1]
            if (long !== undefined) {
                if (long === "--help" || result.some((field) => field.name === long))
                    continue
                const short   = /`(-\w)[`=]/.exec(inner)?.[1] ?? ""
                const rest    = inner.replace(/`-{1,2}[\w-]+(?:=[^`]*)?`/g, "").replace(/^[\s|]+/, "")
                const preset  = /`-{1,2}[\w-]+=([^`]+)`/.exec(inner)?.[1]
                const choices = [ ...rest.matchAll(/`([\w.-]+)`/g) ].map((m) => m[1]!)
                const label   = choices.length > 0 ? choices.join("|") :
                    (rest.replace(/[`*]/g, "").replace(/^[\s=]+/, "").trim() || (preset ?? ""))
                result.push({ kind: "option", name: long, short, label, choices, list: rest.includes("..."),
                    valued: label !== "", suffix: "", required, help: opthelp.get(long) ?? "",
                    enabled: required, value: choices[0] ?? "" })
            }
            else {
                const label = inner.replace(/[`*]/g, "")
                if (result.some((field) => field.name === label))
                    continue
                const names = [ ...new Set([ ...inner.matchAll(/\*([^*]+)\*/g) ].map((m) => m[1]!)) ]
                result.push({ kind: "argument", name: label, short: "", label, choices: [], list: inner.includes("..."),
                    valued: true, suffix: /^\*[^*]+\*`:`$/.test(inner) ? ":" : "", required,
                    help: names.flatMap((name) => arghelp.get(name) ?? []).join("\n\n"),
                    enabled: required, value: "" })
            }
        }
    }
    return result
}

/*  a word of a command line: its verbatim range and its unquoted text  */
type Word = { start: number, end: number, text: string }

/*  split a command line into its words (honoring double quotes with
    backslash escapes, single quotes, and backslash escapes)  */
const tokenize = (line: string): Word[] =>
    [ ...line.matchAll(/(?:"(?:\\[^]|[^"\\])*"?|'[^']*'?|\\[^]|[^\s"'\\])+/g) ].map((m) => ({
        start: m.index,
        end:   m.index + m[0].length,
        text:  m[0].replace(/"((?:\\[^]|[^"\\])*)"?|'([^']*)'?|\\([^])/g,
            (_: string, double: string | undefined, single: string | undefined, escaped: string | undefined) =>
                double !== undefined ? double.replace(/\\([^])/g, "$1") : single ?? escaped ?? "")
    }))

/*  prefill the fields of a synopsis form out of the typed options and arguments
    of its command, like the option parsing of the skills: the options up to the
    first non-option word (or "--", kept verbatim), by long name, unambiguous long
    name prefix, or short name, with their value after "=" or as the next word
    (fixed values case-insensitively), and the remaining words, starting with the
    first unrecognized option, if any, distributed over the argument fields (each
    taking a word, a field with a suffix only a word with it, and the last field
    the rest verbatim), resp., without any, kept in an extra field  */
const prefill = (fields: Field[], line: string): void => {
    const words   = tokenize(line)
    const options = fields.filter((field) => field.kind === "option")
    let i = 0
    for (; i < words.length; i++) {
        const word = words[i]!.text
        if (word === "--" || !word.startsWith("-") || word === "-")
            break
        const m = /^(--[\w-]+|-\w)(?:=([^]*))?$/.exec(word)
        if (m === null)
            break
        const name    = m[1]!
        const matches = name.startsWith("--") ? options.filter((field) => field.name.startsWith(name)) : []
        const field   = options.find((field) => field.name === name || field.short === name) ??
            (matches.length === 1 ? matches[0] : undefined)
        if (field === undefined)
            break
        const next = field.valued && m[2] === undefined
        let value  = m[2] ?? (next ? words[i + 1]?.text : undefined)
        if (field.valued !== (value !== undefined))
            break
        if (value !== undefined && field.choices.length > 0) {
            const values = (field.list ? value.split(",") : [ value ]).map((value) =>
                field.choices.find((choice) => choice.toLowerCase() === value.toLowerCase()))
            if (values.some((value) => value === undefined))
                break
            value = values.join(",")
        }
        i += next ? 1 : 0
        field.enabled = true
        field.value   = value ?? ""
    }
    const rest   = i < words.length ? line.slice(words[i]!.start) : ""
    const params = fields.filter((field) => field.kind === "argument")
    if (rest !== "" && params.length === 0) {
        fields.push({ kind: "argument", name: UNKNOWN, short: "", label: UNKNOWN, choices: [], list: false,
            valued: true, suffix: "", required: false, enabled: true, value: rest,
            help: "Words not recognized as options or arguments of the skill, kept verbatim." })
        return
    }
    const items = tokenize(rest)
    let k = 0
    for (const [ j, field ] of params.entries()) {
        const item = items[k]
        if (item === undefined)
            break
        if (j === params.length - 1)
            field.value = rest.slice(item.start)
        else if (item.text.endsWith(field.suffix)) {
            field.value = rest.slice(item.start, item.end)
            k++
        }
        else
            continue
        field.enabled = true
    }
}

/*  compose the command of a synopsis form out of its enabled fields
    (double-quoting option values with whitespace or quotes, and omitting
    valued options without a value yet)  */
const compose = (form: Form): string => {
    const words = [ form.command ]
    for (const field of form.fields.filter((field) => field.enabled)) {
        const value = field.value !== "" && !field.value.endsWith(field.suffix) ? field.value + field.suffix : field.value
        if (field.kind === "option" && (!field.valued || value !== ""))
            words.push(value === "" ? field.name : `${field.name} ` +
                (/[\s"'\\]/.test(value) ? `"${value.replace(/(["\\])/g, "\\$1")}"` : value))
        else if (value !== "")
            words.push(value)
    }
    return words.join(" ")
}

/*  determine whether a field can be toggled: always, except for enabling
    a field with a free-text value which has not received a value yet  */
const togglable = (field: Field): boolean =>
    field.enabled || !field.valued || field.choices.length > 0 || field.value !== ""

/*  operate a synopsis form by a key: outside a field, step through the fields
    (LEFT/RIGHT), toggle the focused one (SPACE, if togglable), enter its editing
    (RETURN, except for a flag), apply the form (RETURN at the end), or cancel the
    form (BACKSPACE); inside a field, choose a fixed value (LEFT/RIGHT/UP/DOWN or
    its initial letter) and pick it for a list (SPACE), resp. edit the text,
    and leave the field with (RETURN) or, for fixed values, without (BACKSPACE)
    taking over the value  */
const operate = (form: Form, key: Key): "apply" | "cancel" | undefined => {
    const field = form.fields[form.pos]
    if (key.name === "return") {
        if (field === undefined)
            return "apply"
        if (form.edit) {
            field.value = field.choices.length === 0 ? form.buffer.trim() :
                field.list && form.picked.size > 0 ? field.choices.filter((choice) => form.picked.has(choice)).join(",") :
                field.choices[form.choice]!
            field.enabled = field.required || field.value !== ""
            form.edit     = false
        }
        else if (field.valued) {
            form.edit   = true
            form.buffer = field.value
            form.caret  = field.value.length
            form.choice = Math.max(0, field.choices.indexOf(field.value))
            form.picked = new Set(field.value.split(",").filter((value) => field.choices.includes(value)))
        }
    }
    else if (!form.edit || field === undefined) {
        if (key.step !== 0)
            form.pos = Math.max(0, Math.min(form.fields.length, form.pos + key.step))
        else if (key.text === " " && field !== undefined) {
            if (togglable(field))
                field.enabled = !field.enabled
        }
        else if (key.erase < 0)
            return "cancel"
    }
    else if (field.choices.length > 0) {
        const n = field.choices.length
        if (key.step !== 0 || key.name === "up" || key.name === "down")
            form.choice = (form.choice + n + (key.step < 0 || key.name === "up" ? -1 : 1)) % n
        else if (key.text === " " && field.list) {
            const choice = field.choices[form.choice]!
            if (!form.picked.delete(choice))
                form.picked.add(choice)
        }
        else if (key.erase < 0)
            form.edit = false
        else if (key.text.length === 1) {
            const k = field.choices.findIndex((choice) => choice.toLowerCase().startsWith(key.text.toLowerCase()))
            if (k !== -1)
                form.choice = k
        }
    }
    else {
        const { buffer, caret } = form
        if (key.step !== 0)
            form.caret = Math.max(0, Math.min(buffer.length, caret + key.step))
        else if (key.erase < 0 && caret > 0) {
            form.buffer = buffer.slice(0, caret - 1) + buffer.slice(caret)
            form.caret  = caret - 1
        }
        else if (key.erase > 0)
            form.buffer = buffer.slice(0, caret) + buffer.slice(caret + 1)
        else if (key.text !== "") {
            const text  = key.text.replace(/\s+/g, " ")
            form.buffer = buffer.slice(0, caret) + text + buffer.slice(caret)
            form.caret  = caret + text.length
        }
    }
    return undefined
}

/*  draw the underlined input box of a field: its text with the (inverted)
    caret while being edited, its chosen fixed value(s) while being chosen,
    its value, or its italic placeholder (in the color of the field, i.e.,
    grey while disabled, bold while enabled, and red while focused)  */
const input = (Text: Text, form: Form, field: Field,
    look: { color?: string, dimColor: boolean, bold: boolean }, focus: boolean): RenderElement => {
    const { buffer, caret, choice, picked } = form
    const editing = focus && form.edit
    if (editing && field.choices.length === 0)
        return Text({ children: [
            [ buffer.slice(0, caret), false ] as const,
            [ buffer[caret] ?? " ", true ] as const,
            [ buffer.slice(caret + 1), false ] as const
        ].filter(([ text ]) => text !== "").map(([ text, inverse ]) =>
            Text({ bold: look.bold, inverse, underline: true, children: text })) })
    const value = !editing ? field.value :
        field.list && picked.size > 0 ? field.choices.filter((choice) => picked.has(choice)).join(",") :
        field.choices[choice]!
    return value !== "" ?
        Text({ ...look, underline: true, children: value }) :
        Text({ ...look, underline: true, italic: true, children: field.label })
}

/*  draw a field of a synopsis form, as in the prompt: grey while disabled,
    bold while enabled, and red (and marked by "▶") while focused, with options by their name
    and, if valued, their input box, marked in front as a drop-down box (for
    fixed values) resp. as a text field (for free-text values)  */
const draw = (Text: Text, form: Form, field: Field, i: number): RenderElement => {
    const focus = form.pos === i
    const look  = { color: focus ? PICKED : undefined, dimColor: !field.enabled && !focus, bold: field.enabled }
    const children: RenderElement[] = [ Text({ color: look.color, children: focus ? "▶ " : "  " }) ]
    if (field.kind === "option")
        children.push(Text({ ...look, children: field.name }))
    if (field.kind === "option" && field.valued)
        children.push(Text({ children: " " }))
    if (field.valued)
        children.push(Text({ color: look.color, dimColor: look.dimColor, children: field.choices.length > 0 ? "▾ " : "✎ " }),
            input(Text, form, field, look, focus))
    return Text({ wrap: "truncate-end", children })
}

/*  determine the key hints below the frame of a synopsis form (with the scroll
    keys only while its detail view is scrollable, and the wheel only where the
    band receives it)  */
const hints = (form: Form, scrollable: boolean, wheel: boolean): string => {
    const focused = form.fields[form.pos]
    if (focused === undefined || !form.edit)
        return `←/→${wheel ? "/wheel" : ""}: select` +
            (focused?.valued === true ? " · ⏎: edit value" : "") +
            ` · ⌫: cancel+close · ${focused === undefined ? "⏎/!!" : "!!"}: apply+close` +
            " · //: Show Skill Manpage" +
            (focused !== undefined && togglable(focused) ?
                ` · SPACE: ${focused.enabled ? "deactivate" : "activate"}` : "") +
            (scrollable ? ` · b/f${wheel ? "/wheel" : ""}: scroll bwd/fwd` : "")
    return (focused.choices.length > 0 ? `⌫: abort · ⏎: accept · ←/→: choose${focused.list ? " · SPACE: pick" : ""}` :
        "⏎: accept · ←/→: move · type the value") + (wheel && scrollable ? " · wheel: scroll" : "")
}

/*  the synopsis form: its state and its operations  */
export const modHelpCompose = () => {
    /*  the synopsis fields of the skills (loaded on first use, undefined
        for a skill without a manual page) and the currently shown form  */
    const synopses = new Map<string, Field[] | undefined>()
    let form: Form | undefined

    /*  determine whether the synopsis form is shown  */
    const active = () => form !== undefined

    /*  close the synopsis form  */
    const reset = () => {
        form = undefined
    }

    /*  close the synopsis form (as on a failure) and determine the prompt to
        restore (the command as typed), if the form was shown  */
    const cancel = (): string | undefined => {
        const typed = form?.typed
        reset()
        return typed
    }

    /*  hold the prompt with the composed command while the synopsis form is shown  */
    const hold = (current: Form): PromptBox => held(compose(current))

    /*  while the synopsis form is shown, every edit is a key of the form, where
        outside a field "b"/"f" scroll the detail view of the form by a page, "!!"
        (two "!" in a row) applies the form (as RETURN at its end does), and "//"
        (two "/" in a row) closes the form with the composed command suffixed
        with the trigger of the manual band (to switch over to it)  */
    const edit = (e: Frozen<PromptEditInput>): PromptBox => {
        const current   = form!
        const key       = decode(e)
        const pending   = current.pending
        const repeat    = current.edit ? "" :
            /^([!/])\1$/.exec(key.text)?.[1] ?? (pending !== "" && key.text === pending ? pending : "")
        current.pending = !current.edit && repeat === "" && /^[!/]$/.test(key.text) ? key.text : ""
        if (current.pending !== "")
            return hold(current)
        if (!current.edit && (key.text === "b" || key.text === "f")) {
            current.scroll = Math.max(0, current.scroll + (key.text === "b" ? -1 : 1) * current.page)
            return hold(current)
        }
        if (repeat === "/") {
            form = undefined
            const text = `${compose(current)} //`
            return { text, cursor: text.length }
        }
        const result = repeat === "!" ? "apply" : operate(current, key)
        if (result !== undefined) {
            form = undefined
            const text = result === "apply" ? `${compose(current)} ` : current.typed
            return { text, cursor: text.length }
        }
        return hold(current)
    }

    /*  for a skill command with a manual page, once suffixed with the trigger,
        show its synopsis form, prefilled with the typed options and arguments
        (and hold the prompt)  */
    const open = async (box: PromptBox, engine: Pick<Engine, "read">): Promise<PromptBox | undefined> => {
        const command = SYNOPSIS.exec(box.text)
        if (command === null)
            return undefined
        const skill = command[2]!
        if (!synopses.has(skill)) {
            const manual = await engine.read(`skills/${skill}/help.md`).catch(() => undefined)
            synopses.set(skill, manual !== undefined ? synopsis(manual) : undefined)
        }
        const fields = synopses.get(skill)
        if (fields === undefined)
            return undefined
        const args   = command[3] ?? ""
        const filled = fields.map((field) => ({ ...field }))
        prefill(filled, args)
        form = { command: command[1]!, typed: `${command[1]!} ${args !== "" ? `${args} ` : ""}`, fields: filled,
            pos: 0, edit: false, buffer: "", caret: 0, choice: 0, picked: new Set(),
            top: 0, scroll: 0, page: 1, anchor: "", split: 0, pending: "" }
        return hold(form)
    }

    /*  operate the synopsis form by the wheel: over the master view step its
        focused field, over the detail view scroll it, resp. scroll it by a page
        with the scroll keys (PAGEUP/PAGEDOWN) while the band is focused
        (and tell whether the form took the scrolling)  */
    const scroll = (e: BandScroll): boolean => {
        if (form === undefined)
            return false
        const current = form
        wheel(e, current, current.edit ? undefined : (by) =>
            operate(current, { name: "", text: "", step: by, erase: 0 }))
        return true
    }

    /*  operate the synopsis form by RETURN at the prompt (closing the form
        once applied or cancelled) and determine the prompt to refill (the held
        prompt while the form stays shown, but without its space after the
        cursor, else with a single trailing space only, as the refill places
        the cursor at its end)  */
    const submit = (): string => {
        const current = form!
        const result  = operate(current, { name: "return", text: "", step: 0, erase: 0 })
        if (result !== undefined)
            form = undefined
        return form !== undefined ? hold(current).text.trimEnd() : `${compose(current)} `
    }

    /*  draw the synopsis form into the band above the prompt (terminal only)  */
    const render = (e: BandRender, ui: Elements["terminal"]): RenderElement | undefined => {
        /*  yield to a survey and draw nothing without a synopsis form  */
        if (form === undefined || e.props.hasSurvey)
            return undefined
        const current = form
        const focused = current.fields[current.pos]
        const editing = focused !== undefined && current.edit

        /*  determine the geometry of the band (with master and detail view of equal widths)  */
        const { Text } = ui
        const geometry = layout(e, 0.5)
        const { body, detail } = geometry

        /*  determine the lines of the master view (the command after the prompt
            marker, colored as in the prompt, and indented below it each field on
            its own line and the apply position), with the drop-down box of a field
            with fixed values while being chosen directly below the field (aligned
            with its input box), and the line of the focused field  */
        const entries: RenderElement[] = [
            Text({ wrap: "truncate-end", children: [ "❯ ",
                Text({ color: COMMAND, children: current.command }) ] }),
            ...current.fields.map((field, i) => draw(Text, current, field, i)),
            Text({ bold: true, color: focused === undefined ? PICKED : undefined,
                children: focused === undefined ? "▶ ⏎" : "  ⏎" })
        ]
        const row = current.pos + 1
        let popup = 0
        if (editing && focused.choices.length > 0) {
            const items = focused.choices.map((choice) =>
                focused.list ? `${current.picked.has(choice) ? "☑" : "☐"} ${choice}` : choice)
            const indent = 2 + (focused.kind === "option" ? focused.name.length + 1 : 0) + 2
            const box    = frame(items.map((item, k) => uniform(item, false, k === current.choice ? PICKED : undefined)),
                Math.max(...items.map((item) => item.length)) + 4, CHOICES)
            popup = box.length
            entries.splice(row + 1, 0, ...box.map((line) =>
                Text({ wrap: "truncate-end", children: [ " ".repeat(indent), ...paint(Text, line) ] })))
        }

        /*  determine the lines of the detail view: the description of the focused
            field (resp. the hint of the apply position, dimmed as the key hints)  */
        const lines = focused === undefined ?
            wrap(uniform("Take over the composed command into the prompt.", false, undefined), detail, 0) :
            flow(focused.help !== "" ? focused.help : `*${focused.label}*`, detail)

        /*  reset the scroll position of the detail view once the focused field or its
            editing changes, and keep the focused field and, if possible, its drop-down
            box in the master view  */
        const anchor = `${current.pos}/${current.edit}`
        if (current.anchor !== anchor) {
            current.anchor = anchor
            current.scroll = 0
        }
        current.top = Math.max(0, Math.min(row,
            Math.max(Math.min(current.top, row), row + popup - body + 1)))

        /*  draw both views (the master view with the synopsis, and the detail
            view), and the key hints  */
        return panel(ui, geometry, current, {
            title: TITLE,
            hints: hints(current, lines.length > body, geometry.overflow),
            rows:  (i) => entries[current.top + i],
            lines,
            dim:   focused === undefined
        })
    }

    return { active, reset, cancel, edit, open, scroll, submit, render }
}

