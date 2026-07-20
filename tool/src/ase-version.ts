/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import updateNotifier from "update-notifier"

import pkg            from "../package.json" with { type: "json" }

/*  determination of current and available ASE versions  */
export default class Version {
    /*  return current ASE version  */
    static current (): string {
        return pkg.version
    }

    /*  return latest ASE version known from the NPM registry
        (cached background check, falling back to the current version)  */
    static async latest (): Promise<string> {
        const notifier = updateNotifier({
            pkg,
            updateCheckInterval: 1000 * 60 * 60
        })
        return notifier.update?.latest ?? Version.current()
    }
}
