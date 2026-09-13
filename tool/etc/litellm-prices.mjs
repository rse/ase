/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

/*  Regenerate the per-model token price snapshot in "src/ase-statusline-prices.ts"
    from LiteLLM's price database via "npm start prices-update". The snapshot is
    checked in, so that build and statusline work offline: it is the fallback of
    the prices downloaded at agent session start.  */

import fs   from "node:fs"
import path from "node:path"
import url  from "node:url"

import { LITELLM_SOURCE, reducePrices } from "../dst/ase-statusline-litellm.js"

const main = async () => {
    const res = await fetch(LITELLM_SOURCE)
    if (!res.ok)
        throw new Error(`fetching ${LITELLM_SOURCE} failed: ${res.status} ${res.statusText}`)
    const prices = reducePrices(await res.json())

    const ids   = Object.keys(prices)
    const lines = ids.map((id) => `    ${JSON.stringify(id)}: ${
        JSON.stringify(prices[id]).replace(/,/g, ", ").replace(/^\[/, "[ ").replace(/\]$/, " ]")}`)

    const out = `/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under GPL 3.0 <https://spdx.org/licenses/GPL-3.0-only>
*/

/*  GENERATED FILE -- do NOT edit manually.
    Regenerate with "npm start prices-update" (see etc/litellm-prices.mjs).
    Source: ${LITELLM_SOURCE}  */

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
