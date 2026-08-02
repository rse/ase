/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

/*  Regenerate the per-model token price snapshot in "src/ase-statusline-prices.ts"
    from LiteLLM's canonical price database. Run via "npm start prices-update".
    The snapshot is checked in on purpose, so that both the build and the
    statusline rendering stay entirely offline.  */

import fs   from "node:fs"
import path from "node:path"
import url  from "node:url"

/*  canonical upstream price database (the same source ccusage and codeburn use)  */
const SOURCE = "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json"

/*  LiteLLM providers whose models can show up in the session logs of the
    supported agent tools (Anthropic Claude Code, OpenAI Codex CLI, and
    GitHub Copilot CLI, which brokers models of several vendors)  */
const PROVIDERS = new Set([ "anthropic", "openai", "gemini", "xai", "deepseek", "mistral" ])

/*  LiteLLM modes that bill input/output tokens of a conversation  */
const MODES = new Set([ "chat", "responses" ])

const main = async () => {
    const res = await fetch(SOURCE)
    if (!res.ok)
        throw new Error(`fetching ${SOURCE} failed: ${res.status} ${res.statusText}`)
    const db = await res.json()

    /*  reduce the database to the token prices of the relevant models, keying
        them by their bare model id: LiteLLM prefixes most non-OpenAI models
        with their provider ("gemini/gemini-2.5-pro"), while the agent tools
        log the bare id. An already bare entry always wins over a prefixed
        one, so that the canonical price is never shadowed.  */
    const prices = new Map()
    for (const [ id, spec ] of Object.entries(db)) {
        if (typeof spec !== "object" || spec === null)
            continue
        if (!PROVIDERS.has(spec.litellm_provider) || !MODES.has(spec.mode))
            continue
        const input  = spec.input_cost_per_token
        const output = spec.output_cost_per_token
        if (typeof input !== "number" || typeof output !== "number")
            continue

        /*  cache-read defaults to the regular input price (a model without
            prompt caching never reports cached tokens anyway), while a
            missing cache-write price means writing is not billed at all  */
        const cacheRead   = typeof spec.cache_read_input_token_cost              === "number" ?
            spec.cache_read_input_token_cost : input
        const cacheWrite  = typeof spec.cache_creation_input_token_cost          === "number" ?
            spec.cache_creation_input_token_cost : 0
        const cacheWrite1 = typeof spec.cache_creation_input_token_cost_above_1hr === "number" ?
            spec.cache_creation_input_token_cost_above_1hr : cacheWrite

        const bare   = id.includes("/") ? id.slice(id.indexOf("/") + 1) : id
        const prefix = id.includes("/")
        if (prices.has(bare) && prefix)
            continue
        prices.set(bare, [ input, output, cacheRead, cacheWrite, cacheWrite1 ])
    }

    const ids   = [ ...prices.keys() ].sort()
    const lines = ids.map((id) => `    ${JSON.stringify(id)}: ${
        JSON.stringify(prices.get(id)).replace(/,/g, ", ").replace(/^\[/, "[ ").replace(/\]$/, " ]")}`)

    const out = `/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under GPL 3.0 <https://spdx.org/licenses/GPL-3.0-only>
*/

/*  GENERATED FILE -- do NOT edit manually.
    Regenerate with "npm start prices-update" (see etc/litellm-prices.mjs).
    Source: ${SOURCE}  */

/*  per-model token prices in USD per single token, as the tuple
    [ input, output, cache-read, cache-write (5m), cache-write (1h) ]  */
export type Price = readonly [ number, number, number, number, number ]

export const prices: Readonly<Record<string, Price>> = {
${lines.join(",\n")}
}
`
    const dir  = path.dirname(url.fileURLToPath(import.meta.url))
    const file = path.resolve(dir, "..", "src", "ase-statusline-prices.ts")
    fs.writeFileSync(file, out, "utf8")
    process.stdout.write(`ase: prices-update: wrote ${ids.length} model prices to ${file}\n`)
}

await main()
