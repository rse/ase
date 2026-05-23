/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under GPL 3.0 <https://spdx.org/licenses/GPL-3.0-only>
*/

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z }              from "zod"

/*  reusable functionality: in-memory key/value store living inside the
    "ase service" process; per-project (one service per project) and
    not persisted; intended for sharing information between skills
    across multiple Claude Code instances connected to the same service  */
export class KV {
    /*  the actual in-memory store  */
    private static store = new Map<string, unknown>()

    /*  maximum allowed key length, to keep memory bounded  */
    private static readonly KEY_MAX_LEN = 1024

    /*  validate the key to keep it non-empty and bounded in length  */
    static validateKey (key: string): void {
        if (typeof key !== "string" || key.length === 0)
            throw new Error("kv: key must be a non-empty string")
        if (key.trim().length === 0)
            throw new Error("kv: key must not consist solely of whitespace")
        /* eslint-disable-next-line no-control-regex */
        if (/[\x00-\x1F\x7F]/.test(key))
            throw new Error("kv: key must not contain control characters")
        if (key.length > KV.KEY_MAX_LEN)
            throw new Error(`kv: key must be no longer than ${KV.KEY_MAX_LEN} characters`)
    }

    /*  test whether a value is stored under the given key  */
    static has (key: string): boolean {
        KV.validateKey(key)
        return KV.store.has(key)
    }

    /*  get a value by key; returns undefined if no value is stored  */
    static get (key: string): unknown {
        KV.validateKey(key)
        return KV.store.get(key)
    }

    /*  set a value under the given key; overwrites any existing value  */
    static set (key: string, val: unknown): void {
        KV.validateKey(key)
        KV.store.set(key, structuredClone(val))
    }

    /*  delete a value by key; returns true if a value existed  */
    static delete (key: string): boolean {
        KV.validateKey(key)
        return KV.store.delete(key)
    }

    /*  clear all keys; returns the number of keys removed  */
    static clear (): number {
        const n = KV.store.size
        KV.store.clear()
        return n
    }

    /*  snapshot the entire store into a fresh map (for transactional batch)  */
    static snapshot (): Map<string, unknown> {
        return new Map(KV.store)
    }

    /*  restore the store from a previously taken snapshot  */
    static restore (snap: Map<string, unknown>): void {
        KV.store.clear()
        for (const [ k, v ] of snap)
            KV.store.set(k, v)
    }
}

/*  MCP registration entry point for in-memory key/value tools  */
export class KVMCP {
    register (mcp: McpServer): void {
        /*  key/value get  */
        mcp.registerTool("kv_get", {
            title: "ASE key/value get",
            description:
                "Get a value from the in-memory key/value store by `key`. " +
                "Returns the value as JSON-encoded `text`; returns an empty string if no value is stored.",
            inputSchema: {
                key: z.string()
                    .describe("key identifier (non-empty, no whitespace-only, no control characters, up to 1024 characters)")
            }
        }, async (args) => {
            try {
                if (!KV.has(args.key))
                    return { content: [ { type: "text", text: "" } ] }
                const val  = KV.get(args.key)
                const text = val === undefined ? "" : JSON.stringify(val)
                return { content: [ { type: "text", text } ] }
            }
            catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err)
                return { isError: true, content: [ { type: "text", text: `kv_get: ERROR: ${message}` } ] }
            }
        })

        /*  key/value set  */
        mcp.registerTool("kv_set", {
            title: "ASE key/value set",
            description:
                "Store a `val` under the given `key` in the in-memory key/value store. " +
                "Overwrites any existing value for the same `key`. " +
                "The value can be any JSON-compatible type (string, number, boolean, null, array, object).",
            inputSchema: {
                key: z.string()
                    .describe("key identifier (non-empty, no whitespace-only, no control characters, up to 1024 characters)"),
                val: z.union([ z.string(), z.number(), z.boolean(), z.null(), z.array(z.any()), z.record(z.string(), z.any()) ])
                    .describe("arbitrary JSON-compatible value to store under `key`")
            }
        }, async (args) => {
            try {
                KV.set(args.key, args.val)
                return { content: [ { type: "text", text: `kv_set: OK: stored key "${args.key}"` } ] }
            }
            catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err)
                return { isError: true, content: [ { type: "text", text: `kv_set: ERROR: ${message}` } ] }
            }
        })

        /*  key/value clear  */
        mcp.registerTool("kv_clear", {
            title: "ASE key/value clear",
            description:
                "Remove all keys from the in-memory key/value store. " +
                "Returns a status `text` indicating how many keys were removed.",
            inputSchema: {}
        }, async () => {
            try {
                const n = KV.clear()
                return { content: [ { type: "text", text: `kv_clear: OK: removed ${n} key(s)` } ] }
            }
            catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err)
                return { isError: true, content: [ { type: "text", text: `kv_clear: ERROR: ${message}` } ] }
            }
        })

        /*  key/value delete  */
        mcp.registerTool("kv_delete", {
            title: "ASE key/value delete",
            description:
                "Delete a value from the in-memory key/value store by `key`. " +
                "Returns a status `text` indicating whether a value existed and was removed.",
            inputSchema: {
                key: z.string()
                    .describe("key identifier (non-empty, no whitespace-only, no control characters, up to 1024 characters)")
            }
        }, async (args) => {
            try {
                const removed = KV.delete(args.key)
                const msg = removed ?
                    `kv_delete: OK: removed key "${args.key}"` :
                    `kv_delete: WARNING: no key "${args.key}" to remove`
                return { content: [ { type: "text", text: msg } ] }
            }
            catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err)
                return { isError: true, content: [ { type: "text", text: `kv_delete: ERROR: ${message}` } ] }
            }
        })

        /*  key/value batch  */
        mcp.registerTool("kv_batch", {
            title: "ASE key/value batch",
            description:
                "Execute an array of in-memory key/value `commands` in a single MCP call. " +
                "Each entry is an object `{ command: \"clear\"|\"set\"|\"get\"|\"delete\", key?, val? }` " +
                "and is dispatched to the corresponding single-op tool. " +
                "If `transactional` is true, the store is snapshotted up-front and rolled back on the " +
                "first per-command error (remaining commands are skipped); otherwise per-command errors " +
                "are recorded and execution continues. " +
                "Returns a single `text` payload containing a JSON array of per-command result strings " +
                "in the same format emitted by `kv_clear`/`kv_set`/`kv_get`/`kv_delete`. " +
                "On transactional rollback, prior per-command result strings are rewritten to " +
                "`kv_<cmd>: ROLLED-BACK` to truthfully reflect the post-rollback state, and the " +
                "final entry remains `kv_batch: ERROR: <message>`.",
            inputSchema: {
                commands: z.array(z.object({
                    command: z.enum([ "clear", "set", "get", "delete" ])
                        .describe("the KV sub-command to execute"),
                    key: z.string().optional()
                        .describe("key identifier (required for `set`/`get`/`delete`)"),
                    val: z.union([ z.string(), z.number(), z.boolean(), z.null(), z.array(z.any()), z.record(z.string(), z.any()) ]).optional()
                        .describe("value to store (required for `set`)")
                }))
                    .describe("ordered list of KV commands to execute"),
                transactional: z.boolean().optional()
                    .describe("if true, snapshot the store and roll back on first error")
            }
        }, async (args) => {
            const results: string[] = []
            const tx       = args.transactional === true
            const snapshot = tx ? KV.snapshot() : null
            for (const c of args.commands) {
                try {
                    if (c.command === "clear") {
                        const n = KV.clear()
                        results.push(`kv_clear: OK: removed ${n} key(s)`)
                    }
                    else if (c.command === "set") {
                        if (c.key === undefined)
                            throw new Error("kv_set: missing `key`")
                        if (c.val === undefined)
                            throw new Error("kv_set: missing `val`")
                        KV.set(c.key, c.val)
                        results.push(`kv_set: OK: stored key "${c.key}"`)
                    }
                    else if (c.command === "get") {
                        if (c.key === undefined)
                            throw new Error("kv_get: missing `key`")
                        if (!KV.has(c.key))
                            results.push("")
                        else {
                            const val = KV.get(c.key)
                            results.push(val === undefined ? "" : JSON.stringify(val))
                        }
                    }
                    else if (c.command === "delete") {
                        if (c.key === undefined)
                            throw new Error("kv_delete: missing `key`")
                        const removed = KV.delete(c.key)
                        results.push(removed ?
                            `kv_delete: OK: removed key "${c.key}"` :
                            `kv_delete: WARNING: no key "${c.key}" to remove`)
                    }
                }
                catch (err: unknown) {
                    const message = err instanceof Error ? err.message : String(err)
                    if (tx) {
                        if (snapshot !== null)
                            KV.restore(snapshot)
                        results.push(`kv_batch: ERROR: ${message}`)
                        return { isError: true, content: [ { type: "text", text: JSON.stringify(results) } ] }
                    }
                    results.push(`kv_${c.command}: ERROR: ${message}`)
                }
            }
            return { content: [ { type: "text", text: JSON.stringify(results) } ] }
        })
    }
}
