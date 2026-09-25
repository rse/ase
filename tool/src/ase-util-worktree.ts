/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import path              from "node:path"
import fs                from "node:fs"

import { Command }       from "commander"
import { execaSync }     from "execa"
import { z }             from "zod"

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"

import { writeStdout }   from "./ase-lib-stdio.js"

/*  the repository-root-relative path components of the base directory
    which holds all ASE-managed Git worktrees  */
const baseComponents = [ ".ase", "worktree" ]

/*  reusable functionality: safe resolution of the ASE worktree
    directories under <repo-root>/.ase/worktree/<id>  */
export class Worktree {
    /*  validate a worktree id to keep it safe both as a single path
        component and as the Git branch name derived from it  */
    static validateId (id: string): void {
        if (typeof id !== "string" || id.length === 0)
            throw new Error("worktree: id must be a non-empty string")
        if (!/^[A-Za-z0-9_-]+$/.test(id))
            throw new Error("worktree: id must match [A-Za-z0-9_-]+")
    }

    /*  determine the fully resolved top-level directory of the Git
        working tree, as a Git worktree can only be created from
        inside one  */
    static repoRoot (): string {
        let top = ""
        try {
            top = execaSync("git", [ "rev-parse", "--show-toplevel" ], { stderr: "ignore" }).stdout.trim()
        }
        catch {
            /*  not inside a Git working tree  */
        }
        if (top === "")
            throw new Error("worktree: not inside a Git working tree -- cannot create a worktree")
        return fs.realpathSync(top)
    }

    /*  assert that an already existing path is a real, non-aliased
        directory: "git worktree add" silently follows a symlinked path
        component, so a repository carrying a committed ".ase" or
        ".ase/worktree" symlink would make it write outside the
        repository entirely  */
    private static assertRealDir (dir: string): void {
        let st: fs.Stats
        try {
            st = fs.lstatSync(dir)
        }
        catch {
            /*  a not yet existing path component is created later on  */
            return
        }
        if (st.isSymbolicLink())
            throw new Error(`worktree: "${dir}" is a symbolic link -- ` +
                "refusing to create a worktree through it")
        if (!st.isDirectory())
            throw new Error(`worktree: "${dir}" exists but is not a directory`)
        const real = fs.realpathSync(dir)
        if (real !== dir)
            throw new Error(`worktree: "${dir}" resolves to "${real}" -- ` +
                "refusing to create a worktree through an aliased path")
    }

    /*  resolve the base directory holding all ASE worktrees, asserting
        that every path component below the repository root is a real
        directory; the base directory is created on demand only  */
    static baseDir (create = false): string {
        let dir = Worktree.repoRoot()
        for (const component of baseComponents) {
            dir = path.join(dir, component)
            Worktree.assertRealDir(dir)
        }
        if (create) {
            fs.mkdirSync(dir, { recursive: true })
            Worktree.assertRealDir(dir)
        }
        return dir
    }

    /*  resolve the worktree directory of a single id; the leaf itself is
        created by "git worktree add" and hence only has to be free of an
        aliasing entry left behind by an earlier run  */
    static dir (id: string, create = false): string {
        Worktree.validateId(id)
        const dir = path.join(Worktree.baseDir(create), id)
        Worktree.assertRealDir(dir)
        return dir
    }
}

/*  CLI command "ase worktree"  */
export default class WorktreeCommand {
    /*  register commands  */
    register (program: Command): void {
        /*  register CLI top-level command "ase worktree"  */
        const worktree = program
            .command("worktree")
            .description("Safely resolve the ASE worktree directories under <repo-root>/.ase/worktree")
            .action(() => {
                worktree.outputHelp()
                process.exit(1)
            })

        /*  register CLI sub-command "ase worktree base"  */
        worktree
            .command("base")
            .description("Print the validated base directory holding all ASE worktrees")
            .option("-c, --create", "create the base directory if it does not exist yet")
            .action(async (opts: { create?: boolean }) => {
                await writeStdout(`${Worktree.baseDir(opts.create ?? false)}\n`)
            })

        /*  register CLI sub-command "ase worktree path"  */
        worktree
            .command("path")
            .description("Print the validated worktree directory of a single <id>")
            .argument("<id>", "Worktree identifier")
            .option("-c, --create", "create the base directory if it does not exist yet")
            .action(async (id: string, opts: { create?: boolean }) => {
                await writeStdout(`${Worktree.dir(id, opts.create ?? false)}\n`)
            })
    }
}

/*  render a caught error as an MCP tool error result  */
const mcpToolError = (err: unknown) => ({
    isError: true,
    content: [ { type: "text" as const, text: `ERROR: ${err instanceof Error ? err.message : String(err)}` } ]
})

/*  MCP registration entry point for worktree tools  */
export class WorktreeMCP {
    register (mcp: McpServer): void {
        mcp.registerTool("ase_worktree_path", {
            title: "ASE worktree path",
            description:
                "Resolve the absolute, validated directory of an ASE-managed Git worktree. " +
                "Returns `<repo-root>/.ase/worktree/<id>` as `text` if `id` is given, and the " +
                "base directory `<repo-root>/.ase/worktree` otherwise. " +
                "You MUST call this to obtain the directory of every worktree instead of " +
                "assembling the path yourself: it rejects a path leading through a symbolic " +
                "link, through a non-directory, or out of the repository, which `git worktree " +
                "add` would otherwise silently follow and thereby write outside the repository. " +
                "Set `create` to `true` to also create the base directory. " +
                "Fails with an error if the path is unsafe or the current directory is not a " +
                "Git working tree; in that case you MUST NOT create the worktree at all.",
            inputSchema: {
                id: z.string().optional()
                    .describe("worktree identifier (allowed characters: A-Z, a-z, 0-9, '_', '-'); " +
                        "if omitted, the base directory holding all ASE worktrees is returned"),
                create: z.boolean().optional()
                    .describe("if true, create the base directory if it does not exist yet (default: false)")
            }
        }, async (args) => {
            try {
                const create = args.create ?? false
                const text   = args.id !== undefined ?
                    Worktree.dir(args.id, create) :
                    Worktree.baseDir(create)
                return {
                    content: [ { type: "text", text } ]
                }
            }
            catch (err: unknown) {
                return mcpToolError(err)
            }
        })
    }
}
