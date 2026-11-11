/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import fs                from "node:fs/promises"
import os                from "node:os"
import path              from "node:path"

import writeFileAtomic   from "write-file-atomic"
import { mkdirp }        from "mkdirp"
import JsonAsty          from "json-asty"
import type { AstNode }  from "json-asty"

import type Log          from "./ase-lib-log.js"
import { toolSpecs }     from "./ase-setup-common.js"
import type { Tool, Scope } from "./ase-setup-common.js"
import { telemetryEndpoint, telemetryEnabled } from "./ase-service-otel.js"

/*  settings file handling of "ase setup statusline", "ase setup telemetry", the output style, and the function hooks  */
export class SetupSettings {
    constructor (private log: Log) {}

    /*  the default "ase statusline" format lines used when the user does
        not override them with positional arguments to "activate"  */
    private readonly statuslineFormatDflt = [
        "<blue>%u</blue> <red>%p</red> <black>%T</black> %s",
        "%m %e %t",
        "%P %h %B %c"
    ]

    /*  resolve the tool settings file for a given installation scope  */
    private settingsFile (tool: Tool, scope: Scope): string {
        if (tool === "copilot") {
            const home = process.env.COPILOT_HOME ?? ""
            const base = home !== "" ? home : path.join(os.homedir(), ".copilot")
            return path.join(base, "settings.json")
        }
        else if (scope === "project")
            return path.join(process.cwd(), ".claude", "settings.json")
        else if (scope === "local")
            return path.join(process.cwd(), ".claude", "settings.local.json")
        else
            return path.join(os.homedir(), ".claude", "settings.json")
    }

    /*  reject the statusline operation for tools without a scriptable
        statusline mechanism (only the OpenAI Codex CLI lacks one)  */
    private requireStatuslineTool (tool: Tool): void {
        if (tool === "codex")
            throw new Error("statusline configuration is not supported for --tool codex " +
                `(the ${toolSpecs[tool].label} has no scriptable statusline mechanism)`)
    }

    /*  reject a non-default --scope for the GitHub Copilot CLI, which has a
        single per-user settings file and thus no scope concept  */
    private requireStatuslineScope (tool: Tool, scope: Scope): void {
        if (tool === "copilot" && scope !== "user")
            throw new Error("--scope is only supported for --tool claude " +
                `(the ${toolSpecs[tool].label} has a single per-user settings file)`)
    }

    /*  build the "ase statusline ..." command string from the activate
        options and the effective format lines  */
    private statuslineCommand (tool: Tool, opts: { width: number, margin: number, padding: number, icons: boolean, labels: boolean }, format: string[]): string {
        const parts = [ "ase", "statusline", "--tool", tool, "-w", String(opts.width), "-m", String(opts.margin),
            "-p", String(opts.padding) ]
        if (!opts.icons)
            parts.push("--no-icons")
        if (!opts.labels)
            parts.push("--no-labels")
        const lines = format.length > 0 ? format : this.statuslineFormatDflt
        for (const line of lines) {
            /*  Copilot CLI on Windows spawns via cmd.exe, where single
                quotes do not quote -- replace with double quotes  */
            if (process.platform === "win32" && tool === "copilot")
                parts.push(`"${line.replace(/"/g, "\\\"")}"`)
            else
                parts.push(`'${line.replace(/'/g, "'\\''")}'`)
        }
        return parts.join(" ")
    }

    /*  determine whether an existing "statusLine" value object is owned by us  */
    private statuslineIsOwned (member: AstNode): boolean {
        const obj = member.query("/ * [ pos() == 2 ]")[0]
        if (obj === undefined)
            return false
        for (const m of obj.query("/ member")) {
            const key = m.query("/ string [ pos() == 1 ]")[0]
            if (key !== undefined && key.get("value") === "command") {
                const val = m.query("/ string [ pos() == 2 ]")[0]
                const cmd = val !== undefined ? String(val.get("value") ?? "") : ""
                return cmd.startsWith("ase statusline")
            }
        }
        return false
    }

    /*  locate a top-level member node by key within the root object  */
    private settingsFindMember (root: AstNode, name: string): AstNode | undefined {
        for (const m of root.query("/ member")) {
            const key = m.query("/ string [ pos() == 1 ]")[0]
            if (key !== undefined && key.get("value") === name)
                return m
        }
        return undefined
    }

    /*  build the "statusLine" member subtree natively inside the target
        AST, reproducing the exact whitespace tokens json-asty emits for a
        canonically 4-space-indented settings.json (for Claude Code with a
        periodic refresh, as a native skill command raises no event-driven one)  */
    private statuslineBuildMember (root: AstNode, tool: Tool, command: string): AstNode {
        const member = (key: string, val: string | number, epilog?: string): AstNode => {
            const type = typeof val === "number" ? "number"    : "string"
            const body = typeof val === "number" ? String(val) : JSON.stringify(val)
            const k = root.create("string").set({ body: JSON.stringify(key), value: key, epilog: ": " })
            const v = root.create(type).set({ body, value: val })
            const m = root.create("member")
            if (epilog !== undefined)
                m.set({ epilog })
            return m.add(k, v)
        }
        const obj = root.create("object").set({ prolog: "{\n        ", epilog: "\n    }\n" })
        obj.add(
            member("type",    "command", ",\n        "),
            member("command", command,   ",\n        "),
            ...(tool === "claude" ? [
                member("padding",         0, ",\n        "),
                member("refreshInterval", 10)
            ] : [
                member("padding",         0)
            ])
        )
        const key = root.create("string").set({
            body:  JSON.stringify("statusLine"),
            value: "statusLine",
            epilog: ": "
        })
        return root.create("member").add(key, obj)
    }

    /*  normalize the previous-last member so a following ",\n    " comma reads cleanly  */
    private settingsMakeNonLast (member: AstNode): void {
        const val = member.query("/ * [ pos() == 2 ]")[0]
        if (val !== undefined) {
            const ep = val.get("epilog")
            if (typeof ep === "string" && ep.endsWith("\n"))
                val.set({ epilog: ep.replace(/\n$/, "") })
        }
        member.set({ epilog: ",\n    " })
    }

    /*  append a member to the root object, repairing the whitespace at
        the seam: a scalar value carries no pre-"}" newline of its own
        (a container value carries it in its own epilog already), so the
        root epilog has to supply it  */
    private settingsAddMember (root: AstNode, member: AstNode, scalar: boolean): void {
        const members = root.query("/ member")
        if (members.length === 0)
            root.set({ prolog: "{\n    " })
        else
            this.settingsMakeNonLast(members[members.length - 1]!)
        root.set({ epilog: scalar ? "\n}\n" : "}\n" })
        root.add(member)
    }

    /*  remove a member from the root object, repairing the whitespace at the seam  */
    private settingsRemoveMember (root: AstNode, target: AstNode): void {
        const members = root.query("/ member")
        const wasLast = members[members.length - 1] === target
        root.del(target)
        if (wasLast) {
            if (members.length > 1) {
                /*  promote the new last member: strip its comma epilog and
                    restore the pre-"}" newline into the root epilog when the
                    new-last value is a scalar (a container value carries the
                    newline in its own epilog already)  */
                const newLast = members[members.length - 2]!
                newLast.set({ epilog: undefined })
                const val = newLast.query("/ * [ pos() == 2 ]")[0]
                const ep  = val !== undefined ? val.get("epilog") : undefined
                root.set({ epilog: (typeof ep === "string" && ep.endsWith("\n")) ? "}\n" : "\n}\n" })
            }
            else
                root.set({ prolog: "{", epilog: "}\n" })
        }
    }

    /*  read a settings.json file into a JSON-ASTy AST  */
    private async settingsReadAst (file: string): Promise<AstNode> {
        let text = ""
        try {
            text = await fs.readFile(file, "utf8")
        }
        catch (err: unknown) {
            /*  missing file: start from an empty object  */
            if ((err as NodeJS.ErrnoException).code !== "ENOENT")
                throw err
        }
        if (text.trim() === "")
            text = "{}"
        return JsonAsty.parse(text)
    }

    /*  write a JSON-ASTy AST back to a settings.json file  */
    private async settingsWriteAst (file: string, root: AstNode): Promise<void> {
        await mkdirp(path.dirname(file))
        const text = JsonAsty.unparse(root)
        await writeFileAtomic(file, text, { encoding: "utf8" })
    }

    /*  handler for "ase setup statusline activate"  */
    async doStatuslineActivate (tool: Tool, scope: Scope,
        opts: { width: number, margin: number, padding: number, icons: boolean, labels: boolean }, format: string[]): Promise<number> {
        this.requireStatuslineTool(tool)
        this.requireStatuslineScope(tool, scope)
        const file    = this.settingsFile(tool, scope)
        const command = this.statuslineCommand(tool, opts, format)
        const root    = await this.settingsReadAst(file)

        const existing = this.settingsFindMember(root, "statusLine")
        if (existing !== undefined) {
            /*  preserve a foreign, hand-crafted statusLine: skip and warn  */
            if (!this.statuslineIsOwned(existing)) {
                this.log.write("warning", "setup: statusline: activate: a non-ASE \"statusLine\" " +
                    `is already present in ${file}: preserving it (skipped)`)
                return 0
            }
            /*  replace the value object in place, preserving its epilog  */
            const valNew = this.statuslineBuildMember(root, tool, command).query("/ object")[0]!
            const valOld = existing.query("/ * [ pos() == 2 ]")[0]!
            valNew.set({ epilog: valOld.get("epilog") })
            existing.del(valOld).add(valNew)
            this.log.write("info", `setup: statusline: activate: updating ASE "statusLine" in ${file}`)
        }
        else {
            /*  insert a fresh statusLine member  */
            this.settingsAddMember(root, this.statuslineBuildMember(root, tool, command), false)
            this.log.write("info", `setup: statusline: activate: adding ASE "statusLine" to ${file}`)
        }
        await this.settingsWriteAst(file, root)
        return 0
    }

    /*  handler for "ase setup statusline deactivate"  */
    async doStatuslineDeactivate (tool: Tool, scope: Scope): Promise<number> {
        this.requireStatuslineTool(tool)
        this.requireStatuslineScope(tool, scope)
        const file = this.settingsFile(tool, scope)

        /*  a missing settings file means nothing to remove  */
        try {
            await fs.access(file)
        }
        catch {
            this.log.write("info", `setup: statusline: deactivate: no settings file ${file} (skipped)`)
            return 0
        }

        /*  read file  */
        const root   = await this.settingsReadAst(file)
        const target = this.settingsFindMember(root, "statusLine")
        if (target === undefined) {
            this.log.write("info", `setup: statusline: deactivate: no "statusLine" in ${file} (skipped)`)
            return 0
        }

        /*  preserve a foreign, hand-crafted statusLine: skip and warn  */
        if (!this.statuslineIsOwned(target)) {
            this.log.write("warning", "setup: statusline: deactivate: a non-ASE \"statusLine\" " +
                `is present in ${file}: preserving it (skipped)`)
            return 0
        }

        /*  remove the member and repair the whitespace at the seam  */
        this.settingsRemoveMember(root, target)
        await this.settingsWriteAst(file, root)
        this.log.write("info", `setup: statusline: deactivate: removing ASE "statusLine" from ${file}`)
        return 0
    }

    /*  probe the ASE statusline registrations by inspecting the tool
        settings files of all applicable installation scopes  */
    async statuslineStatus (tool: Tool): Promise<{ file: string, scope: string, status: string }[]> {
        /*  the OpenAI Codex CLI has no scriptable statusline mechanism at all  */
        if (tool === "codex")
            return []
        const scopes: Scope[] = tool === "claude" ? [ "user", "project", "local" ] : [ "user" ]
        const entries: { file: string, scope: string, status: string }[] = []
        for (const scope of scopes) {
            const file = this.settingsFile(tool, scope)
            let root: AstNode
            try {
                root = await this.settingsReadAst(file)
            }
            catch {
                /*  an unparsable settings file carries no usable state  */
                continue
            }
            const member = this.settingsFindMember(root, "statusLine")
            if (member === undefined)
                continue
            entries.push({
                file:   this.fileDisplay(file),
                scope:  tool === "claude" ? scope : "(n/a)",
                status: this.statuslineIsOwned(member) ? "activated" : "foreign"
            })
        }
        return entries
    }

    /*  determine whether an existing "outputStyle" value is owned by us  */
    private outputStyleIsOwned (member: AstNode): boolean {
        const val = member.query("/ string [ pos() == 2 ]")[0]
        return val !== undefined && val.get("value") === "ase:ase-terse"
    }

    /*  build the "outputStyle" member subtree natively inside the target AST  */
    private outputStyleBuildMember (root: AstNode): AstNode {
        const key = root.create("string").set({ body: JSON.stringify("outputStyle"), value: "outputStyle", epilog: ": " })
        const val = root.create("string").set({ body: JSON.stringify("ase:ase-terse"), value: "ase:ase-terse" })
        return root.create("member").add(key, val)
    }

    /*  activate the plugin-shipped ASE output style by selecting it in
        the settings file of the scope (Anthropic Claude Code CLI only:
        the other tools have no output style concept, so the session-start
        hook injects the style into their session context instead)  */
    async outputStyleActivate (action: string, scope: Scope): Promise<void> {
        const file     = this.settingsFile("claude", scope)
        const root     = await this.settingsReadAst(file)
        const existing = this.settingsFindMember(root, "outputStyle")
        if (existing !== undefined) {
            /*  preserve a foreign, hand-selected outputStyle: skip and warn  */
            if (!this.outputStyleIsOwned(existing))
                this.log.write("warning", `setup: ${action}: a non-ASE "outputStyle" ` +
                    `is already selected in ${file}: preserving it (skipped)`)
            return
        }
        this.settingsAddMember(root, this.outputStyleBuildMember(root), true)
        await this.settingsWriteAst(file, root)
        this.log.write("info", `setup: ${action}: selecting ASE "outputStyle" in ${file}`)
    }

    /*  deactivate the plugin-shipped ASE output style by removing its
        selection from the settings file of the scope (Anthropic Claude Code CLI only)  */
    async outputStyleDeactivate (action: string, scope: Scope): Promise<void> {
        const file = this.settingsFile("claude", scope)

        /*  a missing settings file means nothing to remove  */
        try {
            await fs.access(file)
        }
        catch {
            return
        }
        const root   = await this.settingsReadAst(file)
        const target = this.settingsFindMember(root, "outputStyle")
        if (target === undefined)
            return

        /*  preserve a foreign, hand-selected outputStyle: skip and warn  */
        if (!this.outputStyleIsOwned(target)) {
            this.log.write("warning", `setup: ${action}: a non-ASE "outputStyle" ` +
                `is selected in ${file}: preserving it (skipped)`)
            return
        }
        this.settingsRemoveMember(root, target)
        await this.settingsWriteAst(file, root)
        this.log.write("info", `setup: ${action}: deselecting ASE "outputStyle" in ${file}`)
    }

    /*  probe the output style selections by inspecting the tool
        settings files of all installation scopes (Anthropic Claude Code CLI only)  */
    async outputStyleStatus (tool: Tool): Promise<{ file: string, scope: string, status: string }[]> {
        if (tool !== "claude")
            return []
        const scopes: Scope[] = [ "user", "project", "local" ]
        const entries: { file: string, scope: string, status: string }[] = []
        for (const scope of scopes) {
            const file = this.settingsFile(tool, scope)
            let root: AstNode
            try {
                root = await this.settingsReadAst(file)
            }
            catch {
                /*  an unparsable settings file carries no usable state  */
                continue
            }
            const member = this.settingsFindMember(root, "outputStyle")
            if (member === undefined)
                continue
            entries.push({
                file:   this.fileDisplay(file),
                scope,
                status: this.outputStyleIsOwned(member) ? "selected" : "foreign"
            })
        }
        return entries
    }

    /*  the environment variable enabling the function hooks of the plugin-shipped mods
        (Anthropic Claude Code CLI only, as the other tools have no function hooks concept)  */
    private readonly functionHooksVar = "CLAUDE_CODE_ENABLE_FUNCTION_HOOKS"

    /*  determine the value of the function hooks variable in an "env" object  */
    private functionHooksValue (env: AstNode): string | undefined {
        const val = this.settingsFindMember(env, this.functionHooksVar)?.query("/ * [ pos() == 2 ]")[0]
        return val !== undefined ? String(val.get("value") ?? "") : undefined
    }

    /*  enable the function hooks of the plugin-shipped mods by setting their
        variable in the "env" of the settings file of the scope  */
    async functionHooksActivate (action: string, scope: Scope): Promise<void> {
        const file = this.settingsFile("claude", scope)
        const root = await this.settingsReadAst(file)

        /*  reject a non-object "env" member  */
        let member = this.settingsFindMember(root, "env")
        let env    = member?.query("/ * [ pos() == 2 ]")[0]
        if (member !== undefined && (env === undefined || env.type() !== "object")) {
            this.log.write("warning", `setup: ${action}: a non-object "env" ` +
                `is present in ${file}: preserving it (skipped)`)
            return
        }

        /*  leave an ASE variable as is and preserve a foreign value: skip and warn  */
        const value = env !== undefined ? this.functionHooksValue(env) : undefined
        if (value !== undefined) {
            if (value !== "1")
                this.log.write("warning", `setup: ${action}: a non-ASE "${this.functionHooksVar}" ` +
                    `is already present in "env" of ${file}: preserving it (skipped)`)
            return
        }

        /*  insert a fresh (still empty) "env" member  */
        if (member === undefined || env === undefined) {
            env    = root.create("object").set({ prolog: "{", epilog: "}" })
            member = root.create("member").add(
                root.create("string").set({ body: JSON.stringify("env"), value: "env", epilog: ": " }), env)
            this.settingsAddMember(root, member, false)
        }

        /*  add the variable  */
        const key = root.create("string").set({
            body:   JSON.stringify(this.functionHooksVar),
            value:  this.functionHooksVar,
            epilog: ": "
        })
        const val = root.create("string").set({ body: JSON.stringify("1"), value: "1" })
        env.add(root.create("member").add(key, val))
        this.settingsNormalizeObject(env, 1, this.settingsTrailing(root, member))
        await this.settingsWriteAst(file, root)
        this.log.write("info", `setup: ${action}: enabling function hooks in "env" of ${file}`)
    }

    /*  disable the function hooks of the plugin-shipped mods by removing
        their variable from the "env" of the settings file of the scope  */
    async functionHooksDeactivate (action: string, scope: Scope): Promise<void> {
        const file = this.settingsFile("claude", scope)

        /*  a missing settings file means nothing to remove  */
        try {
            await fs.access(file)
        }
        catch {
            return
        }
        const root   = await this.settingsReadAst(file)
        const member = this.settingsFindMember(root, "env")
        const env    = member?.query("/ * [ pos() == 2 ]")[0]
        if (member === undefined || env === undefined || env.type() !== "object")
            return
        const target = this.settingsFindMember(env, this.functionHooksVar)
        if (target === undefined)
            return

        /*  preserve a foreign value: skip and warn  */
        if (this.functionHooksValue(env) !== "1") {
            this.log.write("warning", `setup: ${action}: a non-ASE "${this.functionHooksVar}" ` +
                `is present in "env" of ${file}: preserving it (skipped)`)
            return
        }

        /*  remove the variable and, if it became empty, the "env" member  */
        env.del(target)
        if (env.query("/ member").length === 0)
            this.settingsRemoveMember(root, member)
        else
            this.settingsNormalizeObject(env, 1, this.settingsTrailing(root, member))
        await this.settingsWriteAst(file, root)
        this.log.write("info", `setup: ${action}: disabling function hooks in "env" of ${file}`)
    }

    /*  probe the function hooks variables by inspecting the tool
        settings files of all installation scopes (Anthropic Claude Code CLI only)  */
    async functionHooksStatus (tool: Tool): Promise<{ file: string, scope: string, status: string }[]> {
        if (tool !== "claude")
            return []
        const scopes: Scope[] = [ "user", "project", "local" ]
        const entries: { file: string, scope: string, status: string }[] = []
        for (const scope of scopes) {
            const file = this.settingsFile(tool, scope)
            let root: AstNode
            try {
                root = await this.settingsReadAst(file)
            }
            catch {
                /*  an unparsable settings file carries no usable state  */
                continue
            }
            const env   = this.settingsFindMember(root, "env")?.query("/ * [ pos() == 2 ]")[0]
            const value = env !== undefined && env.type() === "object" ? this.functionHooksValue(env) : undefined
            if (value === undefined)
                continue
            entries.push({
                file:   this.fileDisplay(file),
                scope,
                status: value === "1" ? "enabled" : "foreign"
            })
        }
        return entries
    }

    /*  auto-detect the scope in which the ASE plugin is currently
        installed, so an omitted --scope targets the existing installation
        instead of blindly assuming the per-user scope; only the Anthropic
        Claude Code CLI has a scope concept, so every other tool resolves to
        "user"; the scopes are probed from the strongest ("local") down to
        the weakest ("user"), and a scope counts as a match when its
        settings file registers the plugin under "enabledPlugins" (the value
        may be true or false, since even a disabled plugin is registered in
        that scope)  */
    async detectPluginScope (tool: Tool): Promise<Scope> {
        if (tool !== "claude")
            return "user"
        const scopes: Scope[] = [ "local", "project", "user" ]
        for (const scope of scopes) {
            const file = this.settingsFile(tool, scope)

            /*  read and parse the settings file, skipping the scope on any
                read or parse error (a missing or malformed file simply
                cannot register the plugin)  */
            let settings: unknown
            try {
                const text = await fs.readFile(file, "utf8")
                settings = JSON.parse(text)
            }
            catch {
                continue
            }

            /*  a match is the presence of the "ase@ase" key under
                "enabledPlugins", regardless of its true/false value  */
            const plugins = (settings as { enabledPlugins?: Record<string, unknown> })?.enabledPlugins
            if (plugins !== undefined && plugins !== null && Object.hasOwn(plugins, "ase@ase")) {
                if (scope !== "user")
                    this.log.write("info", `setup: detected ASE plugin installation in scope "${scope}"`)
                return scope
            }
        }
        return "user"
    }

    /*  the marker lines delimiting the ASE-generated telemetry block
        in the OpenAI Codex CLI configuration and in the shell profiles  */
    private readonly telemetryMarkBegin = "# BEGIN ASE telemetry (generated)"
    private readonly telemetryMarkEnd   = "# END ASE telemetry (generated)"

    /*  the table headers of a (foreign) OpenAI Codex CLI telemetry configuration  */
    private readonly telemetryCodexHeader = /^\s*\[\s*otel\s*[.\]]/

    /*  the telemetry environment variables of the Anthropic Claude Code CLI  */
    private telemetryClaudeEnv (url: string, token: string): Record<string, string> {
        return {
            CLAUDE_CODE_ENABLE_TELEMETRY: "1",
            OTEL_LOGS_EXPORTER:           "otlp",
            OTEL_EXPORTER_OTLP_PROTOCOL:  "http/json",
            OTEL_EXPORTER_OTLP_ENDPOINT:  url,
            OTEL_EXPORTER_OTLP_HEADERS:   `Authorization=Bearer ${token}`,
            OTEL_LOGS_EXPORT_INTERVAL:    "5000"
        }
    }

    /*  determine the telemetry variables of the Anthropic Claude Code CLI present in an "env" object  */
    private telemetryClaudePresent (env: AstNode): string[] {
        return Object.keys(this.telemetryClaudeEnv("", ""))
            .filter((name) => this.settingsFindMember(env, name) !== undefined)
    }

    /*  the shell assignments of a (foreign) GitHub Copilot CLI telemetry configuration  */
    private readonly telemetryCopilotAssign = /^(?!\s*#).*\b(?:COPILOT_OTEL_ENABLED|OTEL_EXPORTER_OTLP_ENDPOINT)=/

    /*  the telemetry environment variables of the GitHub Copilot CLI, rendered
        as a shell function wrapping the "copilot" command, with the variables
        as single-quoted prefix assignments, so that they are passed to the
        GitHub Copilot CLI only and not exported to every other program
        (the "function" keyword prevents the expansion of an alias "copilot")  */
    private telemetryCopilotFunc (url: string, token: string): string[] {
        const env: Record<string, string> = {
            COPILOT_OTEL_ENABLED:        "true",
            COPILOT_OTEL_EXPORTER_TYPE:  "otlp-http",
            OTEL_EXPORTER_OTLP_ENDPOINT: url,
            OTEL_EXPORTER_OTLP_PROTOCOL: "http/json",
            OTEL_EXPORTER_OTLP_HEADERS:  `Authorization=Bearer ${token}`
        }
        return [
            "function copilot {",
            ...Object.entries(env).map(([ name, value ]) =>
                `    ${name}='${value.replace(/'/g, "'\\''")}' \\`),
            "    command copilot \"$@\"",
            "}"
        ]
    }

    /*  determine a foreign GitHub Copilot CLI telemetry configuration in the
        environment, i.e., an "OTEL_EXPORTER_OTLP_ENDPOINT" other than the URL of
        the ASE ingress (as the ASE configuration itself exports no variables)  */
    private telemetryCopilotForeignEnv (): string | undefined {
        const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? ""
        if (endpoint === "")
            return undefined
        const { url } = telemetryEndpoint(this.log, false)
        return endpoint !== url ? endpoint : undefined
    }

    /*  the telemetry configuration of the OpenAI Codex CLI  */
    private telemetryCodexConf (url: string, token: string): string[] {
        return [
            "[otel]",
            `exporter = { otlp-http = { endpoint = ${JSON.stringify(url + "/v1/logs")}, protocol = "json", ` +
                `headers = { "authorization" = ${JSON.stringify("Bearer " + token)} } } }`
        ]
    }

    /*  resolve the OpenAI Codex CLI configuration file  */
    private telemetryCodexFile (): string {
        const home = process.env.CODEX_HOME ?? ""
        const base = home !== "" ? home : path.join(os.homedir(), ".codex")
        return path.join(base, "config.toml")
    }

    /*  resolve the shell profile of the login shell of the user
        (undefined for shells other than "zsh" and "bash")  */
    private telemetryShellProfile (): string | undefined {
        const shell = path.basename(process.env.SHELL ?? "")
        if (shell === "zsh") {
            const zdotdir = process.env.ZDOTDIR ?? ""
            return path.join(zdotdir !== "" ? zdotdir : os.homedir(), ".zshrc")
        }
        else if (shell === "bash")
            return path.join(os.homedir(), ".bashrc")
        return undefined
    }

    /*  resolve all candidate shell profiles which can carry the
        ASE-generated telemetry block (for deactivation and status)  */
    private telemetryShellProfiles (): string[] {
        const files = [ path.join(os.homedir(), ".zshrc"), path.join(os.homedir(), ".bashrc") ]
        const file  = this.telemetryShellProfile()
        if (file !== undefined && !files.includes(file))
            files.unshift(file)
        return files
    }

    /*  abbreviate the home directory of a file path as "~"  */
    private fileDisplay (file: string): string {
        const home = os.homedir()
        return file.startsWith(home + path.sep) ? `~${file.slice(home.length)}` : file
    }

    /*  determine whether the telemetry variables of an "env" object point to the ASE ingress,
        i.e., whether its "OTEL_EXPORTER_OTLP_ENDPOINT" is the URL of the ASE ingress or its
        "OTEL_EXPORTER_OTLP_HEADERS" carries the bearer token of the ASE ingress (the latter
        still recognizing a configuration of a since changed "telemetry.service.port")  */
    private telemetryClaudeIsOwned (env: AstNode): boolean {
        const value = (name: string) => {
            const val = this.settingsFindMember(env, name)?.query("/ string [ pos() == 2 ]")[0]
            return val !== undefined ? String(val.get("value") ?? "") : undefined
        }
        const { url, token } = telemetryEndpoint(this.log, false)
        const ours = this.telemetryClaudeEnv(url, token)
        return value("OTEL_EXPORTER_OTLP_ENDPOINT") === ours.OTEL_EXPORTER_OTLP_ENDPOINT
            || (token !== "" && value("OTEL_EXPORTER_OTLP_HEADERS") === ours.OTEL_EXPORTER_OTLP_HEADERS)
    }

    /*  re-normalize the whitespace tokens of a nested object at nesting
        level "depth" to the canonical 4-space indentation, with "trailing"
        being the whitespace following its closing brace (a scalar last
        value leaves the pre-"}" newline to the object epilog, a container
        last value carries it in its own epilog)  */
    private settingsNormalizeObject (obj: AstNode, depth: number, trailing: string): void {
        const indent  = (level: number) => " ".repeat(4 * level)
        const members = obj.query("/ member")
        if (members.length === 0) {
            obj.set({ prolog: "{", epilog: `}${trailing}` })
            return
        }
        let scalar = true
        for (let i = 0; i < members.length; i++) {
            const last = i === members.length - 1
            members[i].set({ epilog: last ? undefined : `,\n${indent(depth + 1)}` })
            const val = members[i].query("/ * [ pos() == 2 ]")[0]
            if (val === undefined)
                continue
            const container = val.type() === "object" || val.type() === "array"
            if (container) {
                const ep = String(val.get("epilog") ?? "").replace(/\s+$/, "")
                val.set({ epilog: last ? `${ep}\n${indent(depth)}` : ep })
            }
            else
                val.set({ epilog: undefined })
            if (last)
                scalar = !container
        }
        obj.set({
            prolog: `{\n${indent(depth + 1)}`,
            epilog: `${scalar ? `\n${indent(depth)}` : ""}}${trailing}`
        })
    }

    /*  determine the whitespace following the closing brace of the value
        of a top-level member, depending on whether it is the last member  */
    private settingsTrailing (root: AstNode, member: AstNode): string {
        const members = root.query("/ member")
        return members[members.length - 1] === member ? "\n" : ""
    }

    /*  read a text file (undefined for a missing file)  */
    private async textRead (file: string): Promise<string | undefined> {
        try {
            return await fs.readFile(file, "utf8")
        }
        catch (err: unknown) {
            if ((err as NodeJS.ErrnoException).code === "ENOENT")
                return undefined
            throw err
        }
    }

    /*  split a text into the lines before, within, and after the
        ASE-generated marked block ("body" is undefined without a block)  */
    private markedBlockSplit (text: string): { head: string[], body: string[] | undefined, tail: string[] } {
        const lines = text === "" ? [] : text.replace(/\r?\n$/, "").split(/\r?\n/)
        const begin = lines.findIndex((line) => line.trim() === this.telemetryMarkBegin)
        if (begin < 0)
            return { head: lines, body: undefined, tail: [] }
        const end = lines.findIndex((line, i) => i > begin && line.trim() === this.telemetryMarkEnd)
        if (end < 0)
            throw new Error(`unterminated ASE-generated block (missing line "${this.telemetryMarkEnd}")`)
        return { head: lines.slice(0, begin), body: lines.slice(begin + 1, end), tail: lines.slice(end + 1) }
    }

    /*  maintain the ASE-generated marked block of a text file: with
        "content", replace an existing block in place or append a new
        one (separated by an empty line), without "content", remove the
        block together with one adjacent empty separator line; the
        optional "foreign" predicate, applied to the lines outside the
        block, vetoes the operation  */
    private async markedBlockUpdate (file: string, content?: string[],
        foreign?: (lines: string[]) => boolean): Promise<"missing" | "foreign" | "absent" | "added" | "updated" | "removed"> {
        const text = await this.textRead(file)
        if (text === undefined && content === undefined)
            return "missing"
        const { head, body, tail } = this.markedBlockSplit(text ?? "")
        if (foreign !== undefined && foreign([ ...head, ...tail ]))
            return "foreign"
        let lines: string[]
        let result: "added" | "updated" | "removed"
        if (content !== undefined) {
            const block = [ this.telemetryMarkBegin, ...content, this.telemetryMarkEnd ]
            if (body !== undefined) {
                lines  = [ ...head, ...block, ...tail ]
                result = "updated"
            }
            else {
                const sep = head.length > 0 && head[head.length - 1].trim() !== "" ? [ "" ] : []
                lines  = [ ...head, ...sep, ...block ]
                result = "added"
            }
        }
        else {
            if (body === undefined)
                return "absent"
            if (head.length > 0 && head[head.length - 1].trim() === "")
                head.pop()
            else if (tail.length > 0 && tail[0].trim() === "")
                tail.shift()
            lines  = [ ...head, ...tail ]
            result = "removed"
        }
        await mkdirp(path.dirname(file))
        await writeFileAtomic(file, lines.length > 0 ? lines.join("\n") + "\n" : "", { encoding: "utf8" })
        return result
    }

    /*  handler for "ase setup telemetry activate"  */
    async doTelemetryActivate (tool: Tool): Promise<number> {
        if (!telemetryEnabled(this.log))
            throw new Error("AI usage accounting is disabled -- enable it first with " +
                "\"ase config set telemetry.enabled true\" (on scope \"user\" or \"project\")")
        const { url, token } = telemetryEndpoint(this.log, true)
        if (tool === "claude")
            return this.telemetryActivateClaude(url, token)
        else if (tool === "codex")
            return this.telemetryActivateCodex(url, token)
        else
            return this.telemetryActivateCopilot(url, token)
    }

    /*  handler for "ase setup telemetry deactivate"  */
    async doTelemetryDeactivate (tool: Tool): Promise<number> {
        if (tool === "claude")
            return this.telemetryDeactivateClaude()
        else if (tool === "codex")
            return this.telemetryDeactivateBlock(this.telemetryCodexFile())
        else {
            for (const file of this.telemetryShellProfiles())
                await this.telemetryDeactivateBlock(file)
            return 0
        }
    }

    /*  activate the telemetry of the Anthropic Claude Code CLI through
        the "env" member of its user-level settings file  */
    private async telemetryActivateClaude (url: string, token: string): Promise<number> {
        const file = this.settingsFile("claude", "user")
        const root = await this.settingsReadAst(file)

        /*  reject a non-object "env" member  */
        let member = this.settingsFindMember(root, "env")
        let env    = member?.query("/ * [ pos() == 2 ]")[0]
        if (member !== undefined && (env === undefined || env.type() !== "object")) {
            this.log.write("warning", "setup: telemetry: activate: a non-object \"env\" " +
                `is present in ${file}: preserving it (skipped)`)
            return 0
        }

        /*  preserve a foreign, hand-crafted telemetry configuration (any of the variables
            not pointing to the ASE ingress), as deactivation removes all variables: skip and warn  */
        const present = env !== undefined ? this.telemetryClaudePresent(env) : []
        if (env !== undefined && present.length > 0 && !this.telemetryClaudeIsOwned(env)) {
            this.log.write("warning", "setup: telemetry: activate: a non-ASE telemetry configuration " +
                `(${present.map((name) => `"${name}"`).join(", ")}) is already present in ${file}: ` +
                "preserving it (skipped)")
            return 0
        }

        /*  insert a fresh (still empty) "env" member  */
        if (member === undefined || env === undefined) {
            env    = root.create("object").set({ prolog: "{", epilog: "}" })
            member = root.create("member").add(
                root.create("string").set({ body: JSON.stringify("env"), value: "env", epilog: ": " }), env)
            this.settingsAddMember(root, member, false)
        }

        /*  add missing and replace existing variables in place  */
        for (const [ name, value ] of Object.entries(this.telemetryClaudeEnv(url, token))) {
            const val      = root.create("string").set({ body: JSON.stringify(value), value })
            const existing = this.settingsFindMember(env, name)
            if (existing !== undefined) {
                const old = existing.query("/ * [ pos() == 2 ]")[0]
                if (old !== undefined)
                    existing.del(old)
                existing.add(val)
            }
            else {
                const key = root.create("string").set({ body: JSON.stringify(name), value: name, epilog: ": " })
                env.add(root.create("member").add(key, val))
            }
        }
        this.settingsNormalizeObject(env, 1, this.settingsTrailing(root, member))
        await this.settingsWriteAst(file, root)
        this.log.write("info", `setup: telemetry: activate: ${present.length > 0 ? "updating" : "adding"} ` +
            `ASE telemetry in "env" of ${file}`)
        return 0
    }

    /*  deactivate the telemetry of the Anthropic Claude Code CLI  */
    private async telemetryDeactivateClaude (): Promise<number> {
        const file = this.settingsFile("claude", "user")

        /*  a missing settings file means nothing to remove  */
        try {
            await fs.access(file)
        }
        catch {
            this.log.write("info", `setup: telemetry: deactivate: no settings file ${file} (skipped)`)
            return 0
        }

        /*  locate the ASE telemetry configuration  */
        const root    = await this.settingsReadAst(file)
        const member  = this.settingsFindMember(root, "env")
        const env     = member?.query("/ * [ pos() == 2 ]")[0]
        const present = env !== undefined && env.type() === "object" ? this.telemetryClaudePresent(env) : []
        if (member === undefined || env === undefined || present.length === 0) {
            this.log.write("info", `setup: telemetry: deactivate: no telemetry in "env" of ${file} (skipped)`)
            return 0
        }

        /*  preserve a foreign, hand-crafted telemetry configuration: skip and warn  */
        if (!this.telemetryClaudeIsOwned(env)) {
            this.log.write("warning", "setup: telemetry: deactivate: a non-ASE telemetry configuration " +
                `(${present.map((name) => `"${name}"`).join(", ")}) is present in ${file}: ` +
                "preserving it (skipped)")
            return 0
        }

        /*  remove the variables and, if it became empty, the "env" member  */
        for (const name of Object.keys(this.telemetryClaudeEnv("", ""))) {
            const target = this.settingsFindMember(env, name)
            if (target !== undefined)
                env.del(target)
        }
        if (env.query("/ member").length === 0)
            this.settingsRemoveMember(root, member)
        else
            this.settingsNormalizeObject(env, 1, this.settingsTrailing(root, member))
        await this.settingsWriteAst(file, root)
        this.log.write("info", `setup: telemetry: deactivate: removing ASE telemetry from "env" of ${file}`)
        return 0
    }

    /*  activate the telemetry of the OpenAI Codex CLI through the
        ASE-generated block in its configuration file  */
    private async telemetryActivateCodex (url: string, token: string): Promise<number> {
        const file   = this.telemetryCodexFile()
        const result = await this.markedBlockUpdate(file, this.telemetryCodexConf(url, token),
            (lines) => lines.some((line) => this.telemetryCodexHeader.test(line)))
        if (result === "foreign") {
            this.log.write("warning", "setup: telemetry: activate: a non-ASE \"[otel]\" configuration " +
                `is already present in ${file}: preserving it (skipped)`)
            return 0
        }
        this.log.write("info", `setup: telemetry: activate: ${result === "updated" ? "updating" : "adding"} ` +
            `ASE telemetry block in ${file}`)
        return 0
    }

    /*  activate the telemetry of the GitHub Copilot CLI through the
        ASE-generated block of a "copilot" shell function in the shell profile  */
    private async telemetryActivateCopilot (url: string, token: string): Promise<number> {
        const lines = this.telemetryCopilotFunc(url, token)
        const file  = this.telemetryShellProfile()
        if (file === undefined)
            throw new Error("telemetry configuration for --tool copilot supports only the shell profiles " +
                `of "zsh" and "bash" (current shell: "${process.env.SHELL ?? ""}"): ` +
                `please define the following shell function manually:\n${lines.join("\n")}`)

        /*  preserve a foreign, hand-crafted telemetry configuration: skip and warn  */
        const endpoint = this.telemetryCopilotForeignEnv()
        if (endpoint !== undefined) {
            this.log.write("warning", "setup: telemetry: activate: a non-ASE \"OTEL_EXPORTER_OTLP_ENDPOINT\" " +
                `("${endpoint}") is already present in the environment: preserving it (skipped)`)
            return 0
        }
        const result = await this.markedBlockUpdate(file, lines,
            (rest) => rest.some((line) => this.telemetryCopilotAssign.test(line)))
        if (result === "foreign") {
            this.log.write("warning", "setup: telemetry: activate: a non-ASE \"COPILOT_OTEL_ENABLED\" or " +
                `"OTEL_EXPORTER_OTLP_ENDPOINT" is already present in ${file}: preserving it (skipped)`)
            return 0
        }
        this.log.write("info", `setup: telemetry: activate: ${result === "updated" ? "updating" : "adding"} ` +
            `ASE telemetry block in ${file}`)
        this.log.write("info", "setup: telemetry: activate: a new shell session is required " +
            `for the "copilot" shell function of ${toolSpecs.copilot.label} to take effect`)
        return 0
    }

    /*  deactivate the telemetry of the OpenAI Codex CLI or GitHub Copilot
        CLI by removing the ASE-generated block from a file  */
    private async telemetryDeactivateBlock (file: string): Promise<number> {
        const result = await this.markedBlockUpdate(file)
        if (result === "missing")
            this.log.write("info", `setup: telemetry: deactivate: no file ${file} (skipped)`)
        else if (result === "absent")
            this.log.write("info", `setup: telemetry: deactivate: no ASE telemetry block in ${file} (skipped)`)
        else
            this.log.write("info", `setup: telemetry: deactivate: removing ASE telemetry block from ${file}`)
        return 0
    }

    /*  probe the ASE telemetry configurations of a tool  */
    async telemetryStatus (tool: Tool): Promise<{ file: string, scope: string, status: string }[]> {
        const entries: { file: string, scope: string, status: string }[] = []
        if (tool === "claude") {
            const file = this.settingsFile("claude", "user")
            let root: AstNode
            try {
                root = await this.settingsReadAst(file)
            }
            catch {
                /*  an unparsable settings file carries no usable state  */
                return entries
            }
            const env     = this.settingsFindMember(root, "env")?.query("/ * [ pos() == 2 ]")[0]
            const present = env !== undefined && env.type() === "object" ? this.telemetryClaudePresent(env) : []
            if (env !== undefined && present.length > 0)
                entries.push({
                    file:   this.fileDisplay(file),
                    scope:  "user",
                    status: this.telemetryClaudeIsOwned(env) ? "activated" : "foreign"
                })
        }
        else {
            const files = tool === "codex" ? [ this.telemetryCodexFile() ] : this.telemetryShellProfiles()
            for (const file of files) {
                let block: { head: string[], body: string[] | undefined, tail: string[] }
                try {
                    const text = await this.textRead(file)
                    if (text === undefined)
                        continue
                    block = this.markedBlockSplit(text)
                }
                catch {
                    /*  an unreadable file or malformed block carries no usable state  */
                    continue
                }
                const foreign = tool === "codex" ? this.telemetryCodexHeader : this.telemetryCopilotAssign
                let status = ""
                if (block.body !== undefined)
                    status = "activated"
                else if ([ ...block.head, ...block.tail ].some((line) => foreign.test(line)))
                    status = "foreign"
                if (status !== "")
                    entries.push({ file: this.fileDisplay(file), scope: "(n/a)", status })
            }
            if (tool === "copilot" && this.telemetryCopilotForeignEnv() !== undefined)
                entries.push({ file: "$OTEL_EXPORTER_OTLP_ENDPOINT", scope: "(n/a)", status: "foreign" })
        }
        return entries
    }

    /*  determine whether the ASE telemetry configuration of a tool is activated  */
    async telemetryActive (tool: Tool): Promise<boolean> {
        const entries = await this.telemetryStatus(tool)
        return entries.some((entry) => entry.status === "activated")
    }
}

