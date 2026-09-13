/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under GPL 3.0 <https://spdx.org/licenses/GPL-3.0-only>
*/

import type { Price } from "./ase-statusline-prices.js"

/*  canonical upstream price database (the same source ccusage and codeburn use)  */
export const LITELLM_SOURCE = "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json"

/*  LiteLLM providers whose models can show up in the session logs of the
    supported agent tools (Anthropic Claude Code, OpenAI Codex CLI, and
    GitHub Copilot CLI, which brokers models of several vendors)  */
const PROVIDERS = new Set([ "anthropic", "openai", "gemini", "xai", "deepseek", "mistral" ])

/*  LiteLLM modes that bill input/output tokens of a conversation  */
const MODES = new Set([ "chat", "responses" ])

/*  reduce the LiteLLM price database to the token prices of the relevant
    models, keyed by their bare model id and sorted by it: LiteLLM prefixes
    most non-OpenAI models with their provider ("gemini/gemini-2.5-pro"),
    while the agent tools log the bare id. An already bare entry always wins
    over a prefixed one, so that the canonical price is never shadowed.  */
export const reducePrices = (db: unknown): Record<string, Price> => {
    const prices = new Map<string, Price>()
    if (typeof db !== "object" || db === null)
        return {}
    for (const [ id, spec ] of Object.entries<any>(db)) {
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
    const result: Record<string, Price> = {}
    for (const id of [ ...prices.keys() ].sort())
        result[id] = prices.get(id)!
    return result
}
