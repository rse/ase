/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under GPL 3.0 <https://spdx.org/licenses/GPL-3.0-only>
*/

import updateNotifier from "update-notifier"

import pkg            from "../package.json" with { type: "json" }

/*  determination of current and available ASE versions  */
export default class Version {
    /*  return current ASE version  */
    static current (): string {
        return pkg.version
    }

    /*  return latest ASE version available on the NPM registry  */
    static async latest (): Promise<string> {
        const notifier = updateNotifier({
            pkg,
            updateCheckInterval: 1000 * 60 * 60
        })
        return notifier.update?.latest ?? Version.current()
    }
}
