/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z }              from "zod"

/*  the reusable functionality  */
export class Markdown {
    /*  prepare Markdown for improved rendering by rewriting
        unordered bullet paragraphs -- replacing the "-"/"*" bullet marker with
        "◯" and splitting multi-line inline code spans into per-line single-line
        spans (so each physical line carries its own closed backtick span).
        Fenced code blocks (``` / ~~~) are detected line-wise and passed
        through entirely verbatim, so neither the inline-span splitting nor the
        bullet-marker rewriting ever touches their contents.  */
    static prepare (text: string): string {
        if (typeof text !== "string")
            throw new Error("markdown: text must be a string")

        /*  segment the input line-wise into alternating non-fenced and
            fenced regions: a fenced code block opens with a line whose first
            non-whitespace content is a run of 3+ backticks or tildes and
            closes with a matching-or-longer run of the same marker; fenced
            regions are emitted verbatim while only non-fenced regions are
            handed to the rewriting passes below  */
        const lines  = text.split("\n")
        let result   = ""
        let buf      = ""
        let inFence  = false
        let fenceCh  = ""
        let fenceLen = 0
        const flush  = () => {
            if (buf !== "") {
                result += Markdown.rewrite(buf)
                buf = ""
            }
        }
        for (let li = 0; li < lines.length; li++) {
            const line = lines[li]
            const nl   = li < lines.length - 1 ? "\n" : ""
            const m    = line.match(/^\s*(`{3,}|~{3,})/)
            if (!inFence && m) {
                /*  a fence-opening line: flush the pending non-fenced buffer,
                    enter fenced mode, and emit the opener verbatim  */
                flush()
                inFence  = true
                fenceCh  = m[1]![0]!
                fenceLen = m[1]!.length
                result += line + nl
            }
            else if (inFence) {
                /*  inside a fenced block: emit verbatim and, on a matching
                    closing fence line, leave fenced mode  */
                result += line + nl
                const c = line.match(/^\s*(`{3,}|~{3,})\s*$/)
                if (c && c[1]![0] === fenceCh && c[1]!.length >= fenceLen)
                    inFence = false
            }
            else
                /*  a regular non-fenced line: accumulate for the passes  */
                buf += line + nl
        }
        flush()
        return result
    }

    /*  measure the length of the backtick run starting at offset pos  */
    private static runLength (text: string, pos: number): number {
        let n = 0
        while (pos + n < text.length && text[pos + n] === "`")
            n++
        return n
    }

    /*  PASS 1 of rewrite(): rewrite inline code spans that carry
        backslash-escaped backticks (`\``) into CommonMark-correct spans  */
    private static rewriteEscapedSpans (text: string): string {
        let pre = ""
        let j   = 0
        while (j < text.length) {
            const ch = text[j]
            if (ch !== "`") {
                /*  literal backslash-escaped backtick *outside* any span
                    is left verbatim for later scanning  */
                pre += ch
                j++
                continue
            }

            /*  measure the full opening backtick run: a code-span
                delimiter is a *run* of backticks and a span opened by a
                run of N backticks is closed only by a run of exactly N
                backticks, so the opening-run length determines what we
                scan for as the closing delimiter  */
            const open = Markdown.runLength(text, j)

            /*  scan the opening backtick-run span, capturing its raw
                inner content up to the matching unescaped closing run of
                exactly `open` backticks  */
            let inner    = ""
            let k        = j + open
            let closed   = false
            let escaped  = false
            while (k < text.length) {
                const c = text[k]
                if (c === "\\" && k + 1 < text.length && text[k + 1] === "`") {
                    inner += "\\`"
                    escaped = true
                    k += 2
                    continue
                }
                if (c === "`") {
                    /*  measure this backtick run and treat it as the
                        closing delimiter only if it matches the opening
                        run length exactly; a shorter or longer run is
                        literal content of the span  */
                    const runLen = Markdown.runLength(text, k)
                    if (runLen === open) {
                        closed = true
                        break
                    }
                    inner += "`".repeat(runLen)
                    k += runLen
                    continue
                }
                if (c === "\n" && /^[ \t]*\r?(?:\n|$)/.test(text.slice(k + 1)))
                    /*  a code span never crosses a paragraph break  */
                    break
                inner += c
                k++
            }
            if (!closed || !escaped) {
                /*  not an escaped-backtick span: emit the opening run
                    verbatim and continue scanning from just after it  */
                pre += "`".repeat(open)
                j += open
                continue
            }

            /*  un-escape inner `\`` into literal backticks, then choose a
                fence longer than the longest internal backtick run  */
            const content = inner.replace(/\\`/g, "`")
            let maxRun = 0
            let run    = 0
            for (const c of content) {
                if (c === "`") {
                    run++
                    if (run > maxRun)
                        maxRun = run
                }
                else
                    run = 0
            }
            const fence = "`".repeat(maxRun + 1)
            const pad   = (content.startsWith("`") || content.endsWith("`")) ? " " : ""
            pre += `${fence}${pad}${content}${pad}${fence}`
            j = k + open
        }
        return pre
    }

    /*  PASS 2 of rewrite(): split multi-line inline code spans by scanning
        the entire text character-by-character while tracking whether we
        are currently inside an active backtick (U+0060) span; on
        every "<newline><whitespaces>" sequence encountered while
        inside a span, close the span before the break and re-open
        it after the indentation, so each physical line becomes its
        own single-line span  */
    private static splitMultiLineSpans (text: string): string {
        let out   = ""
        let fence = 0
        let i     = 0
        while (i < text.length) {
            const ch = text[i]
            if (ch === "`") {
                /*  measure the full backtick run (a code-span delimiter is a
                    *run* of backticks; a span opened by N backticks is closed
                    only by a run of exactly N backticks)  */
                const n = Markdown.runLength(text, i)
                i += n
                if (fence === 0) {
                    /*  open a span of fence width n, but only if a matching
                        closing run of exactly n backticks exists ahead (an
                        unmatched run is literal text per CommonMark and must
                        not trigger the line-splitting below)  */
                    let p      = i
                    let closes = false
                    while (p < text.length && !closes) {
                        if (text[p] === "`") {
                            const r = Markdown.runLength(text, p)
                            if (r === n)
                                closes = true
                            p += r
                        }
                        else if (text[p] === "\n" && /^[ \t]*\r?(?:\n|$)/.test(text.slice(p + 1)))
                            /*  a code span never crosses a paragraph break  */
                            break
                        else
                            p++
                    }
                    if (closes)
                        fence = n
                }
                else if (n === fence)
                    /*  close the active span  */
                    fence = 0
                out += "`".repeat(n)
                continue
            }
            if (fence > 0 && (ch === "\r" || ch === "\n")) {
                /*  consume optional CR followed by mandatory LF  */
                let nl = ""
                if (ch === "\r" && i + 1 < text.length && text[i + 1] === "\n") {
                    nl = "\r\n"
                    i += 2
                }
                else if (ch === "\n") {
                    nl = "\n"
                    i++
                }
                else {
                    /*  bare CR: not a recognized newline, pass through  */
                    out += ch
                    i++
                    continue
                }

                /*  consume the following run of SPACE/TAB whitespace  */
                let ws = ""
                while (i < text.length && (text[i] === " " || text[i] === "\t")) {
                    ws += text[i]
                    i++
                }

                /*  close span before the break, re-open after indentation,
                    preserving the active fence width on both sides and padding
                    with a space wherever an inserted delimiter run would merge
                    with an adjacent literal backtick of the span content  */
                const bars = "`".repeat(fence)
                const padC = out.endsWith("`") ? " " : ""
                const padO = (i < text.length && text[i] === "`") ? " " : ""
                out += `${padC}${bars}${nl}${ws}${bars}${padO}`
                continue
            }
            out += ch
            i++
        }
        return out
    }

    /*  apply the inline-span and bullet-marker rewriting passes to a chunk of
        non-fenced Markdown text (see prepare() for fenced-block handling)  */
    private static rewrite (text: string): string {
        /*  PASS 1: rewrite escaped-backtick inline code spans  */
        text = Markdown.rewriteEscapedSpans(text)

        /*  PASS 2: split multi-line inline code spans into per-line spans  */
        const out = Markdown.splitMultiLineSpans(text)

        /*  PASS 3: replace the leading "-"/"*" marker of every unordered
            bullet paragraph with "◯", preserving the leading indentation
            and the following whitespace; operate line-by-line so only the
            actual list markers (at a line start) are affected  */
        return out
            .split("\n")
            .map((line) => line.replace(/^(\s*)[-*]([ \t]+)/, "$1◯$2"))
            .join("\n")
    }
}

/*  MCP registration entry point  */
export class MarkdownMCP {
    register (mcp: McpServer): void {
        mcp.registerTool("ase_markdown_prepare", {
            title: "ASE markdown prepare",
            description:
                "Prepare Markdown `text` for improved rendering by rewriting " +
                "unordered bullet paragraphs: replace the `-`/`*` bullet markers with `◯` " +
                "and split multi-line inline code spans into per-line single-line spans. " +
                "Single-backtick spans containing backslash-escaped backticks are rewritten " +
                "into CommonMark-correct spans with a widened backtick fence and literal inner " +
                "backticks. Returns the prepared Markdown as `text`.",
            inputSchema: {
                text: z.string()
                    .describe("Markdown text to prepare for improved rendering")
            }
        }, async (args) => {
            try {
                const text = Markdown.prepare(args.text)
                return {
                    content: [ { type: "text", text } ]
                }
            }
            catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err)
                return {
                    isError: true,
                    content: [ { type: "text", text: `ERROR: ${message}` } ]
                }
            }
        })
    }
}
