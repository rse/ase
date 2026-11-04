/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import { ofetch }                       from "ofetch"
import { Agent, fetch as undiciFetch }  from "undici"

/*  the fetch for requests with a dispatcher of the npm "undici": its own fetch, as the
    built-in fetch of Node (its bundled, possibly older undici) rejects a foreign dispatcher  */
export const dispatchFetch = ofetch.create({}, { fetch: undiciFetch as unknown as typeof globalThis.fetch })

/*  create a dispatcher skipping the TLS certificate verification  */
export const insecureAgent = (): Agent =>
    new Agent({ connect: { rejectUnauthorized: false } })

