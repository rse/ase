/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import { test }                  from "node:test"
import assert                    from "node:assert/strict"
import { PassThrough }           from "node:stream"
import { setTimeout as sleep }   from "node:timers/promises"
import React                     from "react"
import { render, Text, useInput } from "ink"

import { useMouseReports }       from "../dst/ase-task-board-tui.js"

/*  render a probe component, which records the mouse presses received through
    "useMouseReports" and the input received through "useInput" of Ink, feed the
    given chunks into its (fake terminal) stdin, and return both recordings  */
const feed = async (chunks) => {
    const stdin  = Object.assign(new PassThrough(), { isTTY: true, setRawMode: () => stdin, ref: () => {}, unref: () => {} })
    const stdout = Object.assign(new PassThrough(), { isTTY: true, columns: 80, rows: 24 })
    const presses = []
    const inputs  = []
    const Probe = () => {
        useMouseReports((button, col, row) => { presses.push([ button, col, row ]) })
        useInput((input) => { inputs.push(input) })
        return React.createElement(Text, null, "probe")
    }
    const app = render(React.createElement(Probe), { stdin, stdout, patchConsole: false, exitOnCtrlC: false })
    await sleep(50)
    for (const chunk of chunks) {
        stdin.write(chunk)
        await sleep(30)
    }
    await sleep(50)
    app.unmount()
    return { presses, inputs }
}

test("a mouse press reaches the board with its 0-based column and row", async () => {
    const { presses } = await feed([ "\x1b[<0;130;35M" ])
    assert.deepEqual(presses, [ [ 0, 129, 34 ] ])
})

test("a mouse release is ignored", async () => {
    const { presses } = await feed([ "\x1b[<0;130;35m" ])
    assert.deepEqual(presses, [])
})

test("mouse wheel reports in one chunk are all passed", async () => {
    const { presses } = await feed([ "\x1b[<65;10;5M\x1b[<64;10;5M" ])
    assert.deepEqual(presses, [ [ 65, 9, 4 ], [ 64, 9, 4 ] ])
})

test("a mouse report split across two chunks is completed", async () => {
    const { presses } = await feed([ "\x1b[<0;5", ";7M" ])
    assert.deepEqual(presses, [ [ 0, 4, 6 ] ])
})

test("the keys still reach useInput, the mouse reports never do", async () => {
    const { presses, inputs } = await feed([ "a", "\x1b[<0;2;3M", "b" ])
    assert.deepEqual(presses, [ [ 0, 1, 2 ] ])
    assert.deepEqual(inputs, [ "a", "b" ])
})
