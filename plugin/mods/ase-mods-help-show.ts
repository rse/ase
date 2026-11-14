/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

/*  Claude Code function hooks module ("mod", EARLY ACCESS):
    Manual band, toggling for a skill command (bare or with its options and
    arguments already typed), once suffixed with a blank and "//", the entire
    manual page of the skill in the band above the prompt (scrolled by the
    wheel), while the "//" is removed again from the prompt, so the command
    can be typed on, and the band also closes once the prompt no longer starts
    with the skill command, the synopsis form opens, or the prompt is
    submitted.  */

import type { Elements, PromptBox, RenderElement } from "claude-code"
import { type Engine, type Char, type BandRender, type BandScroll, type View,
    uniform, flow, layout, wheel, panel } from "./ase-mods-common"

/*  the trigger of a manual band inside the prompt (a skill command suffixed
    with a blank and "//", with its typed options and arguments, if any,
    separated by a blank from it), the skill command at the start of the prompt,
    the share of the terminal height taken by the band outside fullscreen, the
    indentation of the section bodies, and the title placed into the top edge
    of the band  */
const MANUAL  = /^\/(?:ase:)?(ase-[a-z0-9]+-[a-z0-9]+)(?:\s[^]*)?\s\/\/$/
const COMMAND = /^\/(?:ase:)?(ase-[a-z0-9]+-[a-z0-9]+)(?![\w-])/
const HEIGHT  = 0.5
const INDENT  = 2
const TITLE   = "[ ⧉ ASE: Show Skill Manpage ]"

/*  a manual band: the scroll state of its frame, the skill, its manual page,
    and the manual page lines with the columns they were wrapped to  */
type Manual = View & {
    skill:   string,
    manual:  string,
    lines:   Char[][],
    columns: number
}

/*  convert a manual page into lines of styled characters, hard-wrapped to the
    given columns: each section with its heading in bold and its body indented
    (with the lines of the SYNOPSIS kept apart, as in the manual page)  */
export const page = (manual: string, columns: number): Char[][] => {
    const lines: Char[][] = []
    for (const part of manual.split(/^(?=## {2})/m).filter((part) => part.startsWith("##  "))) {
        const [ head, ...body ] = part.split("\n")
        const name = head!.replace(/^## {2}/, "").trim()
        const text = name === "SYNOPSIS" ?
            body.filter((line) => line.trim() !== "").flatMap((line) => flow(line, columns - INDENT, true)) :
            flow(body.join("\n"), columns - INDENT, true)
        if (lines.length > 0)
            lines.push([])
        lines.push(uniform(name, true, undefined),
            ...text.map((line) => line.length > 0 ? [ ...uniform(" ".repeat(INDENT), false, undefined), ...line ] : line))
    }
    return lines
}

/*  the manual band: its state and its operations  */
export const modHelpShow = () => {
    /*  the manual pages of the skills (loaded on first use, undefined
        for a skill without a manual page) and the currently shown band  */
    const manuals = new Map<string, string | undefined>()
    let shown: Manual | undefined

    /*  determine whether the manual band is shown  */
    const active = () => shown !== undefined

    /*  close the manual band  */
    const reset = () => {
        shown = undefined
    }

    /*  determine the manual page lines of the manual band, wrapped to the given columns  */
    const wrapped = (current: Manual, columns: number): Char[][] => {
        if (current.columns !== columns) {
            current.lines   = page(current.manual, columns)
            current.columns = columns
        }
        return current.lines
    }

    /*  show the manual band of a skill with a manual page (loaded on first use),
        and tell whether it is shown  */
    const show = async (skill: string, engine: Pick<Engine, "read">): Promise<boolean> => {
        if (!manuals.has(skill))
            manuals.set(skill, await engine.read(`skills/${skill}/help.md`).catch(() => undefined))
        const manual = manuals.get(skill)
        if (manual === undefined)
            return false
        shown = { skill, manual, lines: [], columns: 0, top: 0, scroll: 0, page: 1, split: 0 }
        return true
    }

    /*  for a skill command with a manual page, once suffixed with the trigger,
        toggle its manual band (closing it, if already shown for the skill, else
        showing it) and remove the trigger from the prompt again  */
    const toggle = async (box: PromptBox, engine: Pick<Engine, "read">): Promise<PromptBox | undefined> => {
        const command = MANUAL.exec(box.text)
        if (command === null)
            return undefined
        if (shown?.skill === command[1])
            shown = undefined
        else if (!await show(command[1]!, engine))
            return undefined
        const text = box.text.slice(0, -2)
        return { text, cursor: text.length }
    }

    /*  track the prompt and close the manual band once the prompt no longer
        starts with its skill command  */
    const track = (text: string): void => {
        if (shown !== undefined && COMMAND.exec(text)?.[1] !== shown.skill)
            shown = undefined
    }

    /*  scroll the manual page in the band by the wheel
        (and tell whether the band took the scrolling)  */
    const scroll = (e: BandScroll): boolean => {
        if (shown === undefined)
            return false
        wheel(e, shown)
        return true
    }

    /*  draw the manual page into the band above the prompt (terminal only),
        yielding to a survey  */
    const render = (e: BandRender, ui: Elements["terminal"]): RenderElement | undefined => {
        if (shown === undefined || e.props.hasSurvey)
            return undefined
        const geometry = layout(e, 0, HEIGHT)
        return panel(ui, geometry, shown, {
            title: TITLE,
            hints: (geometry.overflow ? "wheel or CTRL+x + TAB + ↑/↓/PgUp/PgDn: scroll · " : "") +
                "//: close · !!: Compose Skill Command · (keep typing the command)",
            lines: wrapped(shown, geometry.span - 3)
        })
    }

    return { active, reset, toggle, track, scroll, render }
}
