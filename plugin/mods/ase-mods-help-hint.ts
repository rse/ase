/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

/*  Claude Code function hooks module ("mod", EARLY ACCESS):
    Hint band, showing for a skill command (bare or with its options and
    arguments already typed) the entire argument hint of the skill, wrapped
    over multiple lines, in the band above the prompt (instead of the one-line
    and hence usually truncated argument hint of the engine), together with
    the hint on the manual band and the synopsis form, while the prompt starts
    with the skill command followed by a blank (so the typeahead of the engine
    is closed), until the prompt is submitted.  */

import type { Elements, RenderElement } from "claude-code"
import { type Engine, type Char, type BandRender, type View, COMMAND,
    wrap, uniform, layout, panel } from "./ase-mods-common"

/*  the skill command (followed by a blank) at the start of the prompt, the
    argument hint in the frontmatter of a skill, its groups (the bracketed
    resp. parenthesized options and arguments, with one level of nesting, and
    the other words), the non-breaking space keeping a group on a single line,
    the colors of its syntax characters and of its references, the indentation
    of the continuation lines, and the title placed into the top edge of the band  */
const SKILL  = /^\/(?:ase:)?(ase-[a-z0-9]+-[a-z0-9]+)(?=\s)/
const HINT   = /^argument-hint:\s*"(.*)"\s*$/m
const GROUP  = /\[(?:[^[\]]|\[[^\]]*\])*\]|\((?:[^()]|\([^)]*\))*\)|\S+/g
const NBSP   = String.fromCodePoint(0xA0)
const SYNTAX = "gray"
const REFER  = "red"
const INDENT = 2
const TITLE  = "[ ⧉ ASE: Show Skill Synopsis ]"

/*  a hint band: the scroll state of its frame, the skill command as typed,
    the argument hint of its skill, and the lines with the columns they were
    wrapped to  */
type Hint = View & {
    command: string,
    hint:    string,
    lines:   Char[][],
    columns: number
}

/*  convert an argument hint into styled characters: the syntax characters
    of its optional groups, plain groups, and alternatives in grey and its "<...>" references in red  */
const tint = (text: string): Char[] => {
    const chars: Char[] = []
    let reference = false
    for (const ch of text) {
        if (ch === "<")
            reference = true
        chars.push({ ch, bold: false, color: reference ? REFER : "[()|]".includes(ch) ? SYNTAX : undefined })
        if (ch === ">")
            reference = false
    }
    return chars
}

/*  the hint band: its state and its operations  */
export const modHelpHint = () => {
    /*  the argument hints of the skills (loaded on first use, undefined
        for an unknown skill), the currently shown band, and the generation
        of the latest tracking resp. closing (discarding any older tracking)  */
    const hints = new Map<string, string | undefined>()
    let shown: Hint | undefined
    let generation = 0

    /*  close the hint band  */
    const reset = () => {
        generation++
        shown = undefined
    }

    /*  determine the argument hint of a skill (loaded on first use)  */
    const synopsis = async (skill: string, engine: Pick<Engine, "read">): Promise<string | undefined> => {
        if (!hints.has(skill))
            hints.set(skill, await engine.read(`skills/${skill}/SKILL.md`)
                .then((text) => HINT.exec(text)?.[1]).catch(() => undefined))
        return hints.get(skill)
    }

    /*  determine the lines of the hint band, wrapped to the given columns: the
        skill command after the prompt marker and in the prompt color, followed by the tinted groups of the
        argument hint, each kept on a single line (if it fits)  */
    const wrapped = (current: Hint, columns: number): Char[][] => {
        if (current.columns !== columns) {
            const groups = (current.hint.match(GROUP) ?? []).map((group) =>
                group.length <= columns - INDENT ? group.replaceAll(" ", NBSP) : group)
            current.lines   = wrap([ ...uniform("❯ ", false, undefined), ...uniform(current.command, false, COMMAND),
                ...tint(` ${groups.join(" ")}`) ], columns, INDENT)
            current.columns = columns
        }
        return current.lines
    }

    /*  track the prompt and show the hint band while the prompt starts with the
        command of a skill with an argument hint and a blank, else close it
        (and tell whether the band changed)  */
    const track = async (text: string, engine: Pick<Engine, "read">): Promise<boolean> => {
        const prior   = shown
        const current = ++generation
        const command = SKILL.exec(text)
        if (command === null)
            shown = undefined
        else if (shown?.command !== command[0]) {
            const hint = await synopsis(command[1]!, engine)
            if (current !== generation)
                return false
            shown = hint !== undefined ? { command: command[0], hint, lines: [], columns: 0,
                top: 0, scroll: 0, page: 1, split: 0 } : undefined
        }
        return shown !== prior
    }

    /*  draw the argument hint into the band above the prompt (terminal only),
        with the band exactly as tall as the hint (as it always fits, without
        a scroll position), yielding to a survey  */
    const render = (e: BandRender, ui: Elements["terminal"]): RenderElement | undefined => {
        if (shown === undefined || e.props.hasSurvey)
            return undefined
        const geometry = layout(e, 0)
        const lines    = wrapped(shown, geometry.span - 3)
        return panel(ui, { ...geometry, body: lines.length, overflow: false }, shown, {
            title: TITLE,
            hints: "//: Show Skill Manpage · !!: Compose Skill Command · (keep typing the command)",
            lines,
            fit:   true
        })
    }

    return { reset, synopsis, track, render }
}

