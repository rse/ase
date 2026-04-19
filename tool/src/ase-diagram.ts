/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>, Matthias Brusdeylins <matthias@brusdeylins.info>
**  Licensed under GPL 3.0 <https://spdx.org/licenses/GPL-3.0-only>
*/

import fs                     from "node:fs"

import { Command }            from "commander"
import { renderMermaidASCII } from "beautiful-mermaid"

import type Log               from "./ase-log.js"

interface DiagramOpts {
    ascii?: boolean
    input?: string
    padX?:  string
    padY?:  string
}

/*  read stdin into a single string  */
const readStdin = async (): Promise<string> => {
    const chunks: Buffer[] = []
    for await (const chunk of process.stdin)
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk)
    return Buffer.concat(chunks).toString("utf8")
}

/*  command-line handling  */
export default class DiagramCommand {
    constructor (private log: Log) {}

    /*  register commands  */
    register (program: Command): void {
        program
            .command("diagram")
            .description("Render Mermaid source (stdin or --input) to aligned Unicode/ASCII diagram")
            .option("-a, --ascii",        "emit plain ASCII (+-|) instead of Unicode box-drawing", false)
            .option("-i, --input <file>", "read Mermaid source from file instead of stdin")
            .option("-x, --pad-x <n>",    "horizontal spacing between nodes", "5")
            .option("-y, --pad-y <n>",    "vertical spacing between nodes", "5")
            .action(async (opts: DiagramOpts) => {
                /*  load Mermaid source  */
                let src: string
                if (opts.input !== undefined)
                    src = fs.readFileSync(opts.input, "utf8")
                else
                    src = await readStdin()
                if (src.trim() === "") {
                    this.log.write("error", "diagram: empty Mermaid source")
                    process.exit(1)
                }

                /*  parse spacing options  */
                const paddingX = Number.parseInt(opts.padX ?? "5", 10)
                const paddingY = Number.parseInt(opts.padY ?? "5", 10)
                if (!Number.isFinite(paddingX) || !Number.isFinite(paddingY)) {
                    this.log.write("error", "diagram: --pad-x and --pad-y must be integers")
                    process.exit(1)
                }

                /*  render to ASCII  */
                try {
                    const out = renderMermaidASCII(src, {
                        useAscii:  opts.ascii ?? false,
                        colorMode: "none",
                        paddingX,
                        paddingY
                    })
                    process.stdout.write(out)
                    if (!out.endsWith("\n"))
                        process.stdout.write("\n")
                }
                catch (err: unknown) {
                    const message = err instanceof Error ? err.message : String(err)
                    this.log.write("error", `diagram: render failed: ${message}`)
                    process.exit(1)
                }
            })
    }
}
