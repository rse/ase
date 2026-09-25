/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import getStdin from "get-stdin"

/*  read the entire stdin payload as a UTF-8 string, treating an
    interactive terminal as empty input so callers never block on a
    user which is not going to type anything  */
export const readStdin = (): Promise<string> => {
    return getStdin()
}

/*  write a string to stdout, awaiting the write callback which only
    fires once the data has been flushed to the underlying pipe, so a
    subsequent "process.exit" cannot truncate the output  */
export const writeStdout = (text: string | Buffer): Promise<void> => {
    return new Promise<void>((resolve, reject) => {
        process.stdout.write(text, (err) => {
            if (err)
                reject(err)
            else
                resolve()
        })
    })
}

