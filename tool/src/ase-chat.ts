/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import os                        from "node:os"
import path                      from "node:path"
import fs                        from "node:fs/promises"

import { Command, InvalidArgumentError } from "commander"
import { execa }                 from "execa"
import { z }                     from "zod"

import { McpServer }             from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport }  from "@modelcontextprotocol/sdk/server/stdio.js"

import type Log                  from "./ase-log.js"
import pkg                       from "../package.json" with { type: "json" }

/*  internal command options type  */
interface ChatOpts {
    service:  string
    mcpTool:  string
    model?:   string
    timeout:  number
}

/*  the minimal set of parent environment variables passed through to the
    child OpenAI Codex CLI: its executable search path ("PATH"), the home
    directory that roots its "$CODEX_HOME" authentication store (the CLI's
    own login lives in "~/.codex/auth.json"), an explicit
    "$CODEX_HOME"/"$XDG_CONFIG_HOME" override should the user relocate that
    store, the terminal type, and the standard HTTP(S) proxy variables (so
    the CLI can still reach the network from behind a corporate proxy,
    which the "extendEnv: false" isolation would otherwise cut off); every
    other variable in the parent environment is deliberately withheld  */
const codexEnvAllowlist = [
    "PATH", "HOME", "CODEX_HOME", "XDG_CONFIG_HOME", "TERM",
    "HTTP_PROXY",  "HTTPS_PROXY",  "NO_PROXY",  "ALL_PROXY",
    "http_proxy",  "https_proxy",  "no_proxy",  "all_proxy"
]

/*  custom argument parser for Commander: positive integer  */
const parseInteger = (name: string) => (value: string): number => {
    const n = Number.parseInt(value, 10)
    if (!Number.isFinite(n) || n <= 0)
        throw new InvalidArgumentError(`${name} must be a positive integer`)
    return n
}

/*  CLI command "ase chat"  */
export default class ChatCommand {
    constructor (private log: Log) {}

    /*  query the OpenAI Codex CLI in a strictly read-only, non-interactive
        fashion and return its final answer. The CLI is rooted in a
        throw-away temporary working directory, reads its prompt from
        stdin, runs with a minimized environment, and is bounded by a hard
        timeout and the caller's cancellation signal; its final agent
        message is captured from a dedicated output file rather than the
        noisy event transcript on stdout.

        Security note: the bridge switches off every built-in tool surface
        it can via feature flags -- the shell/command tool
        ("features.shell_tool=false"), web search ("web_search=disabled"),
        image generation ("features.image_generation=false"), and the
        hosted "apps" MCP with its connector tools ("features.apps=false")
        -- additionally requests multi-agent spawning off
        ("features.multi_agent=false" and "features.multi_agent_v2=false"),
        ignores the user-level config and execpolicy rules, and runs under
        a read-only sandbox in a throw-away temp cwd. This is defense in
        depth, not a sealed box. Several channels stay outside these
        switches: the built-in "view_image" reader has NO feature switch at
        0.144, so a prompt-injected query could still make the model read a
        locally readable file (as an image); the model catalog's
        "model_info.multi_agent_version" takes precedence over the
        multi-agent feature flags, so a model pinned to a multi-agent
        version re-enables the spawn tools despite the flags above; and
        system- or cloud-level Codex configuration stays beyond the
        bridge's control. Treat this provider exactly like a locally
        launched "codex" -- which is precisely why activating the server is
        an explicit, deliberate consent.  */
    private async queryCodex (opts: ChatOpts, prompt: string, signal?: AbortSignal): Promise<string> {
        /*  create a throw-away working directory so the CLI cannot write
            anything relevant in the current project  */
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ase-chat-"))
        const out = path.join(dir, "answer.txt")
        try {
            /*  assemble the strictly read-only, non-interactive invocation
                (flags verified against "codex help exec", OpenAI Codex CLI
                0.144): skip the Git-repository requirement (the cwd is a
                bare temp directory), confine the sandbox to read-only,
                disable ANSI coloring, avoid persisting a session, root the
                agent in the temp directory, and capture just the final
                agent message in the output file. Crucially, neither the
                user's "~/.codex/config.toml" (--ignore-user-config) nor
                any execpolicy ".rules" files (--ignore-rules) are loaded:
                this keeps the query reproducible and, above all, prevents
                the child Codex from re-entering ASE through the very
                "chat-openai-codex" MCP server this bridge registers in
                that config (which would recurse indefinitely) or from
                inheriting unrelated global MCP tools; authentication still
                resolves from "$CODEX_HOME". Finally, the built-in tool
                surfaces are switched off as far as feature flags allow ("-c
                features.shell_tool=false" for the shell/command tool, "-c
                web_search=disabled" for web search, "-c
                features.image_generation=false", and the hosted apps MCP
                via "-c features.apps=false"); multi-agent spawning is
                additionally requested off via "-c features.multi_agent=false"
                and "-c features.multi_agent_v2=false" (both generations --
                v2 is a separate, prioritized key), though this is
                best-effort only, since a model whose catalog
                "model_info.multi_agent_version" pins a generation overrides
                these flags. The switch-less "view_image" reader also
                remains -- see the security note above for the full
                residual-channel list  */
            const args = [
                "exec",
                "--skip-git-repo-check",
                "--sandbox",             "read-only",
                "--color",               "never",
                "--ephemeral",
                "--ignore-user-config",
                "--ignore-rules",
                "-c",                    "features.shell_tool=false",
                "-c",                    "web_search=disabled",
                "-c",                    "features.image_generation=false",
                "-c",                    "features.multi_agent=false",
                "-c",                    "features.multi_agent_v2=false",
                "-c",                    "features.apps=false",
                "-C",                    dir,
                "-o",                    out
            ]
            if (opts.model !== undefined)
                args.push("--model", opts.model)

            /*  pass the prompt on stdin ("-") instead of as an argv
                argument, so an arbitrarily long prompt neither overflows
                the argument list (E2BIG) nor becomes visible in the
                process table  */
            args.push("-")

            /*  build a minimized child environment from the explicit
                allowlist (never the inherited parent environment) and
                force headless mode so that -- when the child Codex has the
                ASE plugin installed -- the ASE SessionStart hook
                suppresses its banner instead of leaking it into the
                captured final agent message  */
            const env: Record<string, string> = { ASE_HEADLESS: "true" }
            for (const key of codexEnvAllowlist)
                if (process.env[key] !== undefined)
                    env[key] = process.env[key]!

            /*  run the CLI with the minimized environment, the prompt piped
                on stdin, a hard timeout, and the caller's cancellation
                signal wired through, never throwing on a non-zero exit so
                we can surface a clean MCP error  */
            const result = await execa("codex", args, {
                cwd:          dir,
                env,
                extendEnv:    false,
                input:        prompt,
                timeout:      opts.timeout,
                cancelSignal: signal,
                reject:       false
            })
            if (result.failed) {
                if (result.timedOut)
                    throw new Error(`OpenAI Codex CLI timed out after ${opts.timeout}ms`)
                if (result.isCanceled)
                    throw new Error("OpenAI Codex CLI query was canceled")
                throw new Error("OpenAI Codex CLI failed" +
                    (typeof result.exitCode === "number" ? ` (exit code: ${result.exitCode})` : "") +
                    (result.stderr.trim() !== "" ? `: ${result.stderr.trim()}` : ""))
            }

            /*  read the captured final agent message, falling back to
                stdout should the CLI have written no output file  */
            let answer = ""
            try {
                answer = (await fs.readFile(out, "utf8")).trim()
            }
            catch (_e) {
                answer = result.stdout.trim()
            }
            if (answer === "")
                throw new Error("OpenAI Codex CLI returned an empty answer")
            return answer
        }
        finally {
            /*  best-effort cleanup of the throw-away working directory,
                surfacing (but not propagating) a removal failure on stderr  */
            await fs.rm(dir, { recursive: true, force: true }).catch((err: unknown) => {
                const message = err instanceof Error ? err.message : String(err)
                process.stderr.write(`ase chat: failed to remove temporary directory ${dir}: ${message}\n`)
            })
        }
    }

    /*  run the stdio MCP server exposing a single "query" tool that bridges
        to the OpenAI Codex CLI (lives for the entire process lifetime)  */
    private async runBridge (opts: ChatOpts): Promise<void> {
        /*  create the MCP server, mirroring the "query(prompt)" signature
            of the "mcp-to-openai" gateway so the ASE skills and agents can
            address this CLI-backed server exactly like the API-metered ones  */
        const mcp = new McpServer({ name: opts.service, version: pkg.version })
        mcp.registerTool(opts.mcpTool, {
            title:       `${opts.service} query`,
            description:
                "Query OpenAI GPT through the OpenAI Codex CLI (`codex`), used here purely " +
                "in a read-only, ephemeral query mode as a chat-completion substitute, " +
                "authenticating via the CLI's own configured credentials " +
                "(typically a ChatGPT subscription). " +
                "Pass the chat message as `prompt`. " +
                "Returns the model's answer as `text`.",
            inputSchema: {
                prompt: z.string()
                    .describe("the chat message to send to the foreign LLM")
            }
        }, async (args, extra) => {
            try {
                const answer = await this.queryCodex(opts, args.prompt, extra.signal)
                return {
                    content: [ { type: "text", text: answer } ]
                }
            }
            catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err)
                this.log.write("error", `chat: ${message}`)
                /*  prefix the error text with "ERROR: " so the
                    "ase-meta-chat" agent and the "ase-meta-quorum" skill
                    recognize it as an unavailable-model marker and skip it  */
                return {
                    isError: true,
                    content: [ { type: "text", text: `ERROR: chat: query failed: ${message}` } ]
                }
            }
        })

        /*  connect the server to the stdio transport and keep the process
            alive until the host closes the stdio connection, then shut the
            server down cleanly (mirrors the "ase mcp" bridge lifecycle)  */
        const transport = new StdioServerTransport()
        await mcp.connect(transport)
        await new Promise<void>((resolve) => {
            const done = () => resolve()
            process.stdin.once("end",   done)
            process.stdin.once("close", done)
        })
        await mcp.close()
    }

    /*  register commands  */
    register (program: Command): void {
        program
            .command("chat")
            .description("Bridge a stdio MCP \"query\" tool to the OpenAI Codex CLI")
            .requiredOption("-s, --service <name>",
                "MCP server identity name reported to the host tool")
            .option("-t, --mcp-tool <name>",
                "name of the exposed MCP tool", "query")
            .option("-m, --model <model>",
                "OpenAI Codex model to select (defaults to the CLI's own default)")
            .option("--timeout <ms>",
                "hard timeout for a single CLI query, in milliseconds",
                parseInteger("--timeout"), 300000)
            .action(async (opts: ChatOpts) => {
                await this.runBridge(opts)
                process.exit(0)
            })
    }
}
