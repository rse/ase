/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import path                 from "node:path"
import fs                   from "node:fs"
import { fileURLToPath }    from "node:url"

import { Command }          from "commander"

import type Log             from "./ase-log.js"
import { writeStdout }      from "./ase-stdout.js"

/*  reusable functionality: resolve and read plugin "meta/" files  */
export class Meta {
    /*  determine the plugin "meta/" directory; the build process copies
        the sibling "plugin/" tree into the tool package (see the "copy
        plugin directory into package for bundling" build step), so a
        bundled "<pkgdir>/plugin/meta/" is always available right next to
        the compiled tool, independent of any environment variables  */
    static dir (): string {
        const pkgdir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
        return path.join(pkgdir, "plugin", "meta")
    }

    /*  resolve a single requested meta name to an absolute path within
        the "meta/" directory; the name is reduced to its basename to
        reject path traversal and absolute paths, then expanded into the
        canonical "ase-<name>.md" file name (the "ase-" prefix and ".md"
        extension are added when not already present)  */
    static resolve (name: string): string {
        let base = path.basename(name.replace(/\\/g, "/"))
        if (base === "" || base === "." || base === "..")
            throw new Error(`meta: invalid file name "${name}"`)
        if (path.extname(base) === "")
            base = `${base}.md`
        if (!base.startsWith("ase-"))
            base = `ase-${base}`
        return path.join(Meta.dir(), base)
    }

    /*  read the contents of a single requested meta file  */
    static read (name: string): string {
        const abs = Meta.resolve(name)
        try {
            return fs.readFileSync(abs, "utf8")
        }
        catch (_e) {
            throw new Error(`meta: failed to read file: ${abs}`)
        }
    }
}

/*  CLI command "ase meta"  */
export default class MetaCommand {
    constructor (private log: Log) {}

    /*  register command  */
    register (program: Command): void {
        program
            .command("meta")
            .description("Output the contents of one or more plugin meta files")
            .argument("<name...>", "meta file name(s) (\"ase-\" prefix and \".md\" extension optional)")
            .action(async (names: string[]) => {
                this.log.write("debug", `meta: reading ${names.length} file(s)`)
                for (const name of names)
                    await writeStdout(Meta.read(name))
            })
    }
}
