/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

/*  Claude Code function hooks module ("mod", EARLY ACCESS):
    Manpage browser, showing for a prompt of just "//", or of a free text
    suffixed with a blank and "//", the manual pages of all ASE skills in a
    master/detail view in the band above the prompt, filtered by a filter
    field (initially the free text) with a fuzzy search (like "ase man"),
    where typed text edits the filter, LEFT/RIGHT (or the wheel over the
    skills) selects a skill, UP/DOWN (or the wheel over the manual page)
    scroll its manual page (with the matches of the filter marked), RETURN
    takes over its command into the prompt, SPACE takes it over into the
    synopsis form, "!!" switches over to the intent help for the filter,
    and "//" leaves the filter in the prompt (which mirrors the filter while
    the browser is shown).  */

import type { Elements, Frozen, PromptBox, PromptEditInput, RenderElement } from "claude-code"
import { type Engine, type Char, type BandRender, type BandScroll, type View, PICKED,
    held, decode, uniform, wrap, layout, wheel, panel } from "./ase-mods-common"
import { page } from "./ase-mods-help-show"

/*  the trigger of a manpage browser inside the prompt (just "//", or a free text
    suffixed with a blank and "//"), the skill directories (relative to the plugin
    directory), the title placed into the top edge of the frame, and the share of
    the band columns taken by the master view  */
const BROWSE = /^(?:([^]*\S)\s+)?\/\/$/
const SKILLS = "skills"
const TITLE  = "[ ⧉ ASE: Browse Skill Manpages ]"
const MASTER = 0.3

/*  the manual page of a skill: its name, its Markdown source, and the lower-cased
    Markdown source and its words (for searching)  */
type Doc = { skill: string, manual: string, text: string, words: Set<string> }

/*  a manpage browser: the scroll state of its band, the filter, the selected
    manual page (by its index into the matching ones), the last key, if a "/"
    or "!", and the selection and filter shown (resetting the scrolling on
    change) of the detail view  */
type Browse = View & {
    filter:  string,
    select:  number,
    pending: string,
    anchor:  string
}

/*  the minimum length of a word for its fuzzy matching, the Levenshtein edit
    distance, and the Sorensen-Dice bigram similarity coefficient of two words
    (copies of "fuzzyMin", "levenshtein", and "diceCoefficient" of
    "tool/src/ase-task-board-filter.ts", so keep them in sync)  */
const fuzzyMin = 4
const levenshtein = (a: string, b: string): number => {
    let prev = [] as number[]
    let curr = [] as number[]
    for (let j = 0; j <= b.length; j++)
        prev[j] = j
    for (let i = 1; i <= a.length; i++) {
        curr[0] = i
        for (let j = 1; j <= b.length; j++)
            curr[j] = Math.min(prev[j]! + 1, curr[j - 1]! + 1,
                prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1))
        const swap = prev
        prev = curr
        curr = swap
    }
    return prev[b.length]!
}
const diceCoefficient = (a: string, b: string): number => {
    if (a === b)
        return 1
    if (a.length < 2 || b.length < 2)
        return 0
    const bigrams = new Map<string, number>()
    for (let i = 0; i < a.length - 1; i++) {
        const bigram = a.substring(i, i + 2)
        bigrams.set(bigram, (bigrams.get(bigram) ?? 0) + 1)
    }
    let hits = 0
    for (let i = 0; i < b.length - 1; i++) {
        const bigram = b.substring(i, i + 2)
        const count  = bigrams.get(bigram) ?? 0
        if (count > 0) {
            bigrams.set(bigram, count - 1)
            hits++
        }
    }
    return (2 * hits) / (a.length + b.length - 2)
}

/*  escape a string for its literal use within a regular expression  */
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/*  the regular expression of the matches of a search in a page: the keywords as
    plain substrings, plus the fuzzy variants of the page as whole words, with the
    longest alternative first, so a variant is never cut short by a keyword nested
    inside it (a copy of "matchRE" of "tool/src/ase-man-catalog.ts", so keep it in sync)  */
const matchRE = (keywords: string[], variants: string[]): RegExp => {
    const alts = keywords.map((k) => ({ len: k.length, src: escape(k) }))
        .concat(variants.map((w) => ({ len: w.length, src: "(?<![a-z0-9])" + escape(w) + "(?![a-z0-9])" })))
    alts.sort((a, b) => b.len - a.len)
    return new RegExp(alts.map((a) => a.src).join("|"), "gi")
}

/*  search all pages for a query (like "ase man"): all whitespace-separated keywords
    have to occur in a page (AND logic), in up to two passes, the keywords as literal
    substrings first and, only if this matches no page at all, as fuzzy variants of
    their words; the result maps the skills of the matching pages onto the regular
    expressions of their matches, or is null for a query without any keywords (a copy
    of "searchPages" of "tool/src/ase-man-catalog.ts", so keep it in sync)  */
const search = (docs: Doc[], vocab: Set<string>, query: string): Map<string, RegExp> | null => {
    const keywords = query.toLowerCase().split(/\s+/).filter((word) => word !== "")
    if (keywords.length === 0)
        return null
    const hits = new Map<string, RegExp>()
    for (const doc of docs)
        if (keywords.every((k) => doc.text.includes(k)))
            hits.set(doc.skill, matchRE(keywords, []))
    if (hits.size > 0)
        return hits

    /*  the fuzzy-equivalent vocabulary words of a keyword, cached per keyword  */
    const fuzzy = new Map<string, string[]>()
    const fuzzyWords = (word: string): string[] => {
        let result = fuzzy.get(word)
        if (result === undefined) {
            result = word.length < fuzzyMin ? [] : [ ...vocab ].filter((given) =>
                Math.abs(word.length - given.length) <= 1
                && (diceCoefficient(word, given) >= 0.50 || levenshtein(word, given) <= 2))
            fuzzy.set(word, result)
        }
        return result
    }

    /*  the regular expression of the fuzzy variants of a compound keyword (like
        "ase-task-edit"), with each of its words literally or fuzzily replaced
        and its separators kept, cached per keyword (null for a single word)  */
    const compound = new Map<string, RegExp | null>()
    const compoundRE = (keyword: string): RegExp | null => {
        let result = compound.get(keyword)
        if (result === undefined) {
            const parts = keyword.split(/([^a-z0-9]+)/)
            result = parts.length < 2 ? null : new RegExp("(?<![a-z0-9])" + parts.map((part, i) =>
                i % 2 === 1 ? escape(part) : part === "" ? "" :
                    "(?:" + [ part, ...fuzzyWords(part) ].map(escape).join("|") + ")").join("") + "(?![a-z0-9])", "g")
            compound.set(keyword, result)
        }
        return result
    }
    for (const doc of docs) {
        const variants = [] as string[]
        const hit = keywords.every((k) => {
            if (doc.text.includes(k))
                return true
            const re   = compoundRE(k)
            const near = re !== null ? [ ...new Set([ ...doc.text.matchAll(re) ].map((m) => m[0])) ] :
                fuzzyWords(k).filter((w) => doc.words.has(w))
            variants.push(...near)
            return near.length > 0
        })
        if (hit)
            hits.set(doc.skill, matchRE(keywords, variants))
    }
    return hits
}

/*  mark the matches of a (global) regular expression within a line of styled
    characters (in bold and the color of a picked item)  */
const mark = (line: Char[], re: RegExp): Char[] => {
    const text = line.map((char) => char.ch).join("")
    const hits = new Set<number>()
    for (const m of text.matchAll(re))
        for (let i = m.index; i < m.index + m[0].length; i++)
            hits.add(i)
    if (hits.size === 0)
        return line
    let pos = 0
    return line.map((char) => {
        const hit = hits.has(pos)
        pos += char.ch.length
        return hit ? { ...char, bold: true, color: PICKED } : char
    })
}

/*  the manpage browser: its state and its operations  */
export const modHelpBrowse = () => {
    /*  the manual pages of all skills and their vocabulary (loaded on first use),
        and the currently shown browser  */
    let docs:  Doc[] | undefined
    let vocab: Set<string> = new Set()
    let browse: Browse | undefined

    /*  determine whether the manpage browser is shown  */
    const active = () => browse !== undefined

    /*  close the manpage browser  */
    const reset = () => {
        browse = undefined
    }

    /*  determine the prompt to leave on closing the manpage browser: its filter
        (with a single trailing blank to type on), if any  */
    const leave = (current: Browse): string =>
        current.filter.trim() !== "" ? `${current.filter.trimEnd()} ` : ""

    /*  close the manpage browser (as on a failure) and determine the prompt to
        restore (the filter), if it was shown  */
    const cancel = (): string | undefined => {
        const text = browse !== undefined ? leave(browse) : undefined
        reset()
        return text
    }

    /*  determine the matching manual pages of the filter (all of them for an empty
        filter), with the regular expressions of their matches, cached per filter
        (and manual pages)  */
    let cache: { filter: string, docs: Doc[] | undefined, list: { doc: Doc, re: RegExp | undefined }[] } | undefined
    const matching = (current: Browse): { doc: Doc, re: RegExp | undefined }[] => {
        if (cache?.filter !== current.filter || cache.docs !== docs) {
            const hits = search(docs ?? [], vocab, current.filter)
            cache = { filter: current.filter, docs, list: (docs ?? []).filter((doc) => hits === null || hits.has(doc.skill))
                .map((doc) => ({ doc, re: hits?.get(doc.skill) })) }
        }
        return cache.list
    }

    /*  hold the prompt as the current filter while the browser is shown  */
    const hold = (current: Browse): PromptBox => held(current.filter.trimEnd())

    /*  take over the command of the selected manual page into the prompt (closing
        the browser), if any page matches, optionally suffixed with a trigger (to
        switch over to its band), and determine the prompt to show  */
    const take = (current: Browse, trigger = ""): PromptBox => {
        const doc = matching(current)[current.select]?.doc
        if (doc === undefined)
            return hold(current)
        reset()
        const text = `/${doc.skill} ${trigger}`
        return { text, cursor: text.length }
    }

    /*  while the manpage browser is shown, every edit is a key of the browser:
        LEFT/RIGHT select a manual page, UP/DOWN scroll it by a line, RETURN takes
        over the command of the selected page, SPACE takes it over suffixed with
        the trigger of the synopsis form, "//" (two "/" in a row) closes the
        browser and leaves the filter in the prompt, "!!" (two "!" in a row, for
        a non-empty filter) closes the browser with the filter suffixed with the
        trigger of the intent help (both to switch over to the other band), a
        deletion (like BACKSPACE) deletes the last character of the filter, and
        any other typed text is appended to the filter  */
    const edit = (e: Frozen<PromptEditInput>): PromptBox => {
        const current   = browse!
        const key       = decode(e)
        const pending   = current.pending
        current.pending = (key.text === "/" || (key.text === "!" && current.filter.trim() !== "")) &&
            key.text !== pending ? key.text : ""
        if (current.pending !== "") {
            if (pending !== "") {
                current.filter += pending
                current.select = 0
            }
            return hold(current)
        }
        if (key.text === "//" || (key.text === "/" && pending === "/")) {
            reset()
            const text = leave(current)
            return { text, cursor: text.length }
        }
        if (current.filter.trim() !== "" && (key.text === "!!" || (key.text === "!" && pending === "!"))) {
            reset()
            const text = `${current.filter.trim()} !!`
            return { text, cursor: text.length }
        }
        current.filter += pending
        if (key.name === "return")
            return take(current)
        if (key.text === " ")
            return take(current, "!!")
        if (key.name === "up" || key.name === "down")
            current.scroll = Math.max(0, current.scroll + (key.name === "up" ? -1 : 1))
        else if (key.step !== 0) {
            current.select = Math.max(0, Math.min(matching(current).length - 1, current.select + key.step))
            current.scroll = 0
        }
        else if (key.erase < 0)
            current.filter = current.filter.slice(0, -1)
        else if (key.text !== "")
            current.filter += key.text.replace(/\s+/g, " ")
        if (pending !== "" || key.erase < 0 || key.text !== "")
            current.select = 0
        return hold(current)
    }

    /*  for a prompt of just the trigger, or of a free text suffixed with it, show
        the manpage browser with the free text as its filter (and hold the prompt)  */
    const open = async (box: PromptBox, engine: Pick<Engine, "read" | "dirs">): Promise<PromptBox | undefined> => {
        const m = BROWSE.exec(box.text)
        if (m === null)
            return undefined
        if (docs === undefined) {
            const skills = (await engine.dirs(SKILLS)).filter((name) => /^ase-[a-z0-9]+-[a-z0-9]+$/.test(name)).sort()
            const loaded = await Promise.all(skills.map(async (skill) => {
                const manual = await engine.read(`${SKILLS}/${skill}/help.md`).catch(() => undefined)
                if (manual === undefined)
                    return []
                const text = manual.toLowerCase()
                return [ { skill, manual, text, words: new Set(text.split(/[^a-z0-9]+/).filter((w) => w !== "")) } ]
            }))
            docs  = loaded.flat()
            vocab = new Set(docs.flatMap((doc) => [ ...doc.words ]))
        }
        browse = { filter: m[1] ?? "", select: 0, pending: "", anchor: "",
            top: 0, scroll: 0, page: 1, split: 0 }
        return hold(browse)
    }

    /*  operate the manpage browser by the wheel: over the master view select a
        manual page, over the detail view scroll it, resp. scroll it by a page with
        the scroll keys (PAGEUP/PAGEDOWN) while the band is focused (and tell
        whether the browser took the scrolling)  */
    const scroll = (e: BandScroll): boolean => {
        if (browse === undefined)
            return false
        const current = browse
        wheel(e, current, (by) => {
            const select = Math.max(0, Math.min(matching(current).length - 1, current.select + by))
            if (select !== current.select) {
                current.select = select
                current.scroll = 0
            }
        })
        return true
    }

    /*  operate the manpage browser by RETURN at the prompt and determine the
        prompt to refill (the held prompt while the browser stays shown, but
        without its space after the cursor, else the taken over command)  */
    const submit = (): string => {
        const box = take(browse!)
        return browse !== undefined ? box.text.trimEnd() : box.text
    }

    /*  draw the manpage browser into the band above the prompt (terminal only)  */
    const render = (e: BandRender, ui: Elements["terminal"]): RenderElement | undefined => {
        /*  yield to a survey and draw nothing without a browser  */
        if (browse === undefined || e.props.hasSurvey)
            return undefined
        const current = browse
        const { Text } = ui

        /*  determine the geometry of the band and the matching manual pages
            (with the selection clamped onto them)  */
        const geometry = layout(e, MASTER)
        const { body, detail } = geometry
        const list = matching(current)
        current.select = Math.max(0, Math.min(list.length - 1, current.select))
        const selected = list[current.select]

        /*  determine the lines of the detail view: the manual page of the selected
            skill with the matches of the filter marked  */
        const lines = selected === undefined ?
            wrap(uniform("No manual page matches the filter.", false, undefined), detail, 0) :
            page(selected.doc.manual, detail).map((line) => selected.re !== undefined ? mark(line, selected.re) : line)

        /*  reset the scroll position of the detail view once the selection or the
            filter changes, and keep the selected manual page in the master view
            (below the filter field and its horizontal line)  */
        const anchor = `${current.select}/${current.filter}`
        if (current.anchor !== anchor) {
            current.anchor = anchor
            current.scroll = 0
        }
        const rows = Math.max(1, body - 2)
        current.top = Math.max(0, Math.min(current.select, Math.max(current.top, current.select - rows + 1)))

        /*  determine the lines of the master view: the filter field (with its caret,
            resp. its placeholder), a horizontal line (joining the borders), and the
            matching manual pages (the selected one in red)  */
        const field = Text({ wrap: "truncate-start", children: [ "❯ ",
            ...(current.filter !== "" ? [ Text({ bold: true, children: current.filter }) ] : []),
            Text({ inverse: true, children: " " }),
            ...(current.filter === "" ? [ Text({ dimColor: true, italic: true, children: " filter…" }) ] : []) ] })
        const entry = (k: number) => {
            const item = list[k]
            if (item === undefined)
                return undefined
            const picked = k === current.select
            return Text({ wrap: "truncate-end", bold: picked, color: picked ? PICKED : undefined,
                children: `${picked ? "▶" : " "} ${item.doc.skill}` })
        }

        /*  draw both views (with the count of the matching manual pages in the
            bottom edge) and the key hints  */
        const wheeled = geometry.overflow ? "/wheel" : ""
        return panel(ui, geometry, current, {
            title:  TITLE,
            status: `[ ${list.length}/${docs?.length ?? 0} manpages ]`,
            hints:  `←/→${wheeled}: select · ` +
                `${geometry.overflow ? "wheel or CTRL+x + TAB + ↑/↓/PgUp/PgDn" : "↑/↓"}: scroll · ` +
                "//: cancel+close · ⏎: apply+close · SPACE: compose" +
                (current.filter.trim() !== "" ? " · !!: Find Skill Command" : "") + " · (type for filtering)",
            rows:   (i) => i === 0 ? field : entry(current.top + i - 2),
            rule:   (i) => i === 1,
            lines
        })
    }

    return { active, reset, cancel, edit, open, scroll, submit, render }
}
