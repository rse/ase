/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import * as fs   from "node:fs"
import * as os   from "node:os"
import * as path from "node:path"
import * as url  from "node:url"

import { execa } from "execa"
import YAML      from "yaml"

import type { TestCase } from "./ase-test-case.js"

/*  the repository root (this module lives in "<repo>/test/src/")  */
export const repoRoot = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..", "..")

/*  a fully isolated per-run sandbox: a private HOME (XDG directories,
    Claude settings, and credentials) plus a private project directory
    (with its own ".ase/" state, task store, and service port)  */
export type Sandbox = {
    root:    string
    home:    string
    project: string
    env:     Record<string, string>
    baseRef: string
}

/*  run a Git command in the sandbox project  */
const git = async (sandbox: Pick<Sandbox, "project" | "env">, args: string[]) =>
    execa("git", args, { cwd: sandbox.project, env: sandbox.env, extendEnv: false, stdin: "ignore", timeout: 60 * 1000 })

/*  ensure the agent tool can authenticate inside the sandboxed HOME: an API key or
    OAuth token environment variable is passed through, else the OAuth credentials
    file of the real HOME is copied into the sandboxed one  */
const credentials = (home: string, env: Record<string, string>): void => {
    if (process.env.ANTHROPIC_API_KEY !== undefined)
        env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
    else if (process.env.CLAUDE_CODE_OAUTH_TOKEN !== undefined)
        env.CLAUDE_CODE_OAUTH_TOKEN = process.env.CLAUDE_CODE_OAUTH_TOKEN
    else {
        const file = path.join(os.homedir(), ".claude", ".credentials.json")
        if (!fs.existsSync(file))
            throw new Error("no agent tool credentials found: set ANTHROPIC_API_KEY or " +
                "CLAUDE_CODE_OAUTH_TOKEN, or login once so \"~/.claude/.credentials.json\" exists")
        fs.copyFileSync(file, path.join(home, ".claude", ".credentials.json"))
    }
}

/*  create the sandbox of a single test run and materialize the fixture of the case:
    the optional Git repository, the ASE project configuration, the seeded task store,
    and the fixture file tree, with the final fixture commit serving as the baseline
    of the Git changeset diff oracle  */
export const sandboxCreate = async (caze: TestCase, run: number): Promise<Sandbox> => {
    const slug    = caze.name.replace(/[^a-zA-Z0-9]+/g, "-")
    const root    = await fs.promises.mkdtemp(path.join(os.tmpdir(), `ase-test-${slug}-r${run}-`))
    const home    = path.join(root, "home")
    const project = path.join(root, "project")
    await fs.promises.mkdir(path.join(home, ".claude"),  { recursive: true })
    await fs.promises.mkdir(path.join(project, ".ase"),  { recursive: true })

    /*  the sandboxed environment: a controlled HOME and XDG directories, the built
        "ase" CLI on the PATH (required by the MCP server of the plugin), and no
        inherited agent tool, ASE, tmux, or Copilot state  */
    const env: Record<string, string> = {}
    for (const [ key, value ] of Object.entries(process.env))
        if (value !== undefined && !/^(TMUX|COPILOT_|ASE_|CLAUDE|ANTHROPIC_)/.test(key))
            env[key] = value
    env.HOME               = home
    env.XDG_CONFIG_HOME    = path.join(home, ".config")
    env.XDG_STATE_HOME     = path.join(home, ".local", "state")
    env.PATH               = `${path.join(repoRoot, "tool", "bin")}${path.delimiter}${process.env.PATH ?? ""}`
    env.NO_UPDATE_NOTIFIER = "1"
    env.ASE_HEADLESS       = "true"
    env.GIT_TERMINAL_PROMPT = "0"
    credentials(home, env)

    /*  keep the account-level claude.ai cloud connectors out of the session  */
    await fs.promises.writeFile(path.join(home, ".claude", "settings.json"),
        JSON.stringify({ disableClaudeAiConnectors: true }), "utf8")

    /*  materialize the fixture  */
    const sandbox: Sandbox = { root, home, project, env, baseRef: "" }
    if (caze.fixture.files !== "")
        await fs.promises.cp(caze.fixture.files, project, { recursive: true })
    if (caze.fixture.config !== null)
        await fs.promises.writeFile(path.join(project, ".ase", "config.yaml"),
            YAML.stringify(caze.fixture.config), "utf8")
    if (caze.fixture.tasks.length > 0) {
        const store = path.join(project, ".ase", "task")
        await fs.promises.mkdir(store, { recursive: true })
        await fs.promises.writeFile(path.join(store, "PROJECT.yaml"),
            YAML.stringify({ id: "project", lifecycle: caze.fixture.lifecycle, idscheme: "slug" }), "utf8")
        for (const task of caze.fixture.tasks)
            await fs.promises.copyFile(task, path.join(store, path.basename(task)))
    }
    if (caze.fixture.git) {
        await git(sandbox, [ "init", "--initial-branch", "master" ])
        await git(sandbox, [ "config", "user.name",  "ASE Test" ])
        await git(sandbox, [ "config", "user.email", "ase-test@localhost" ])
        await git(sandbox, [ "add", "--all" ])
        await git(sandbox, [ "commit", "--allow-empty", "--no-verify", "-m", "fixture" ])
        const { stdout } = await git(sandbox, [ "rev-parse", "HEAD" ])
        sandbox.baseRef = stdout.trim()
    }
    return sandbox
}

/*  tear down a sandbox: stop the on-demand spawned ASE service of the project
    (it would linger for its 30 minute idle timeout otherwise) and remove the
    sandbox directory (unless it has to be kept for inspection)  */
export const sandboxTeardown = async (sandbox: Sandbox, keep: boolean): Promise<void> => {
    await execa("ase", [ "service", "stop" ], {
        cwd: sandbox.project, env: sandbox.env, extendEnv: false,
        stdin: "ignore", timeout: 30 * 1000, reject: false
    })
    if (!keep)
        await fs.promises.rm(sandbox.root, { recursive: true, force: true })
}
