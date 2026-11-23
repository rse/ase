/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import fs                 from "node:fs"
import path               from "node:path"
import { createHash }     from "node:crypto"
import { execa }          from "execa"
import { z }              from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"

/*  a hunk of a file section of a diff: its old range, its header tail, and its body lines (by 1-based line number)  */
type Hunk    = { oldStart: number, oldCount: number, tail: string, body: number[] }
type Section = { lines: number[], header: number[], hunks: Hunk[], deleted: boolean }

/*  the line-based staging of the partially selected changes of a Git working copy:
    the diff is always produced by Git itself and the patch is always derived from its
    raw bytes, so no whitespace, encoding, or end-of-line detail can ever get lost  */
export class Stage {
    /*  determine the binary-safe diff of the working copy against the index for some files  */
    static async diff (dir: string, files: string[]): Promise<Buffer> {
        if (!path.isAbsolute(dir) || !fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory())
            throw new Error(`invalid repository directory: ${dir}`)
        if (files.length === 0)
            throw new Error("no files given")
        const result = await execa("git", [ "-c", "core.quotepath=off", "diff",
            "--no-color", "--no-ext-diff", "--no-renames", "--src-prefix=a/", "--dst-prefix=b/", "--binary",
            "--", ...files ], { cwd: dir, encoding: "buffer", stripFinalNewline: false })
        return Buffer.from(result.stdout)
    }

    /*  determine the digest identifying a diff  */
    static digest (diff: Buffer): string {
        return createHash("sha256").update(diff).digest("hex").slice(0, 16)
    }

    /*  split a diff into its raw lines (without their terminating newline)  */
    static lines (diff: Buffer): Buffer[] {
        const lines = [] as Buffer[]
        let start = 0
        for (let i = diff.indexOf(0x0a); i >= 0; i = diff.indexOf(0x0a, start)) {
            lines.push(diff.subarray(start, i))
            start = i + 1
        }
        if (start < diff.length)
            lines.push(diff.subarray(start))
        return lines
    }

    /*  render a diff with the 1-based numbers of its lines  */
    static numbered (diff: Buffer): string {
        return Stage.lines(diff).map((line, i) => `${i + 1}:${line.toString("utf8")}`).join("\n")
    }

    /*  parse the lines of a diff into its file sections and hunks  */
    static parse (lines: Buffer[]): Section[] {
        const sections = [] as Section[]
        let section: Section | null = null
        let hunk:    Hunk    | null = null
        for (let n = 1; n <= lines.length; n++) {
            const line = lines[n - 1].toString("latin1")
            if (line.startsWith("diff --git ")) {
                section = { lines: [ n ], header: [ n ], hunks: [], deleted: false }
                hunk    = null
                sections.push(section)
                continue
            }
            if (section === null)
                throw new Error(`unexpected diff line ${n} outside of a file section`)
            section.lines.push(n)
            const m = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/)
            if (m !== null) {
                hunk = {
                    oldStart: parseInt(m[1], 10),
                    oldCount: m[2] !== undefined ? parseInt(m[2], 10) : 1,
                    tail:     m[5],
                    body:     []
                }
                section.hunks.push(hunk)
            }
            else if (hunk !== null && /^[ +\-\\]/.test(line))
                hunk.body.push(n)
            else if (hunk === null) {
                section.header.push(n)
                if (line.startsWith("deleted file mode "))
                    section.deleted = true
            }
            else
                throw new Error(`unexpected diff line ${n} within a hunk`)
        }
        return sections
    }

    /*  parse the line selection ranges ("<n>" or "<n>-<m>") into a set of line numbers  */
    static selection (ranges: string[], max: number): Set<number> {
        const selected = new Set<number>()
        for (const range of ranges) {
            const m = range.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/)
            if (m === null)
                throw new Error(`invalid line range: "${range}"`)
            const from = parseInt(m[1], 10)
            const to   = m[2] !== undefined ? parseInt(m[2], 10) : from
            if (from < 1 || to < from || to > max)
                throw new Error(`line range out of bounds: "${range}"`)
            for (let n = from; n <= to; n++)
                selected.add(n)
        }
        return selected
    }

    /*  derive the patch of the selected lines, exactly like the edited hunks of "git add -p":
        unselected hunks are dropped, unselected "-" lines become context lines, unselected "+"
        lines are dropped (with their "\ No newline" marker), and the hunk headers are recounted  */
    static patch (lines: Buffer[], chosen: Set<number>): { patch: Buffer, files: number, changes: number } {
        const sections = Stage.parse(lines)
        const out      = [] as Buffer[]
        let files      = 0
        let changes    = 0

        /*  narrow the selection to the change lines of the hunks (a range may span context lines)  */
        const isChange = (n: number) => lines[n - 1][0] === 0x2b || lines[n - 1][0] === 0x2d
        const selected = new Set<number>()
        for (const section of sections) {
            if (section.hunks.length === 0)
                section.lines.filter((n) => chosen.has(n)).forEach((n) => selected.add(n))
            else
                for (const hunk of section.hunks)
                    hunk.body.filter((n) => chosen.has(n) && isChange(n)).forEach((n) => selected.add(n))
        }
        for (const section of sections) {
            if (!section.lines.some((n) => selected.has(n)))
                continue

            /*  a section without hunks (binary or mode-only) is staged entirely  */
            if (section.hunks.length === 0) {
                out.push(...section.lines.map((n) => lines[n - 1]))
                files++
                continue
            }
            if (section.deleted && section.hunks.some((h) => h.body.some((n) => isChange(n) && !selected.has(n))))
                throw new Error(`file deletion of diff line ${section.header[0]} can only be staged entirely`)
            out.push(...section.header.map((n) => lines[n - 1]))
            files++
            let offset = 0
            for (const hunk of section.hunks) {
                if (!hunk.body.some((n) => selected.has(n)))
                    continue
                const body = [] as Buffer[]
                let newCount = 0
                let dropped  = false
                for (const n of hunk.body) {
                    const line = lines[n - 1]
                    const mark = String.fromCharCode(line[0])
                    if (mark === "\\") {
                        if (!dropped)
                            body.push(line)
                        continue
                    }
                    dropped = false
                    if (mark === " ") {
                        body.push(line)
                        newCount++
                    }
                    else if (mark === "-") {
                        if (selected.has(n))
                            changes++
                        else {
                            body.push(Buffer.concat([ Buffer.from(" "), line.subarray(1) ]))
                            newCount++
                            continue
                        }
                        body.push(line)
                    }
                    else if (selected.has(n)) {
                        body.push(line)
                        newCount++
                        changes++
                    }
                    else
                        dropped = true
                }

                /*  recount the hunk header, where a start refers to the line before for a zero count  */
                const first    = (hunk.oldCount === 0 ? hunk.oldStart + 1 : hunk.oldStart) + offset
                const newStart = newCount === 0 ? first - 1 : first
                offset += newCount - hunk.oldCount
                out.push(Buffer.from(`@@ -${hunk.oldStart},${hunk.oldCount} +${newStart},${newCount} @@${hunk.tail}`, "latin1"))
                out.push(...body)
            }
        }
        return { patch: Buffer.concat(out.map((line) => Buffer.concat([ line, Buffer.from("\n") ]))), files, changes }
    }

    /*  stage the selected lines of the diff into the index only  */
    static async select (dir: string, files: string[], digest: string, ranges: string[]): Promise<string> {
        const diff = await Stage.diff(dir, files)
        if (Stage.digest(diff) !== digest)
            throw new Error("diff changed since it was determined -- determine it again")
        const lines    = Stage.lines(diff)
        const selected = Stage.selection(ranges, lines.length)
        const result   = Stage.patch(lines, selected)
        if (result.files === 0)
            throw new Error("no lines selected")
        const apply = await execa("git", [ "apply", "--cached", "--whitespace=nowarn", "-" ],
            { cwd: dir, input: result.patch, reject: false })
        if (apply.exitCode !== 0)
            throw new Error(`git apply failed: ${String(apply.stderr).trim()}`)
        return `staged: ${result.changes} changed lines of ${result.files} files`
    }
}

/*  render a caught error as an MCP tool error result  */
const mcpToolError = (err: unknown) => ({
    isError: true,
    content: [ { type: "text" as const, text: `ERROR: ${err instanceof Error ? err.message : String(err)}` } ]
})

/*  MCP registration entry point for the line-based staging tools  */
export class StageMCP {
    register (mcp: McpServer): void {
        const dir   = z.string().describe("absolute path of the root directory of the Git working copy")
        const files = z.array(z.string()).min(1).describe("paths of the files, relative to `dir`")
        mcp.registerTool("ase_stage_diff", {
            title: "ASE stage diff",
            description:
                "Determine the diff of the Git working copy `dir` against its index for the `files`, " +
                "with each line prefixed by its 1-based line number and a colon (`<n>:<line>`), " +
                "for selecting the lines to stage via `ase_stage_select`. " +
                "Returns `digest: <digest>` as the first line of `text`, followed by the numbered diff lines.",
            inputSchema: { dir, files }
        }, async (args) => {
            try {
                const diff = await Stage.diff(args.dir, args.files)
                const text = `digest: ${Stage.digest(diff)}\n${Stage.numbered(diff)}`
                return { content: [ { type: "text", text } ] }
            }
            catch (err: unknown) {
                return mcpToolError(err)
            }
        })
        mcp.registerTool("ase_stage_select", {
            title: "ASE stage select",
            description:
                "Stage only the selected `+` and `-` lines of the diff of `ase_stage_diff` for the same " +
                "`dir` and `files` into the index (the working copy stays untouched), exactly like the " +
                "edited hunks of `git add -p`: unselected `-` lines become context lines and unselected " +
                "`+` lines are dropped, while selected header and context lines are ignored. A selected " +
                "line of a file without hunks (binary or mode-only) stages it entirely. Fails without " +
                "staging anything if the diff changed since its `digest` was determined, no change line " +
                "is selected, or `git apply` fails. " +
                "Returns the number of staged lines and files as `text`.",
            inputSchema: {
                dir,
                files,
                digest: z.string().describe("digest of the diff, as returned by `ase_stage_diff`"),
                lines:  z.array(z.string()).min(1)
                    .describe("line numbers of the diff to stage, each as `<n>` or as a range `<n>-<m>`")
            }
        }, async (args) => {
            try {
                const text = await Stage.select(args.dir, args.files, args.digest, args.lines)
                return { content: [ { type: "text", text } ] }
            }
            catch (err: unknown) {
                return mcpToolError(err)
            }
        })
    }
}
