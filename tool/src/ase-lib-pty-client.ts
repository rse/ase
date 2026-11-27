/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import { StringDecoder }         from "node:string_decoder"

import { WebSocket }             from "ws"

/*  the key detaching a client terminal (Alt+X, as the agent tools do not bind it), in the forms a
    terminal sends it in raw mode: ESC and "x" (with Alt sending ESC), a key press of the kitty
    keyboard protocol, which the program may have enabled in the terminal (the code of "x" with
    the modifier Alt, also with Caps Lock or Num Lock, and optional alternate keys and text), and
    the character Option+X types on macOS where Option is no Alt (in most Latin layouts, like US,
    British, German, Swiss, French, Spanish, Dutch, and Swedish), each only as an input chunk of
    its own (so a paste or a longer input containing it never detaches)  */
/*  eslint-disable-next-line no-control-regex  */
const DETACH = /^(?:\x1bx|\x1b\[120(?::\d*)*;(?:3|67|131|195)(?::1)?(?:;[\d:]*)?u|\u2248)$/

/*  the terminal modes a program may have set (mouse reporting, bracketed paste, focus events,
    kitty keyboard protocol, colors, hidden cursor, and the alternate screen), reset on leaving  */
const RESET = "\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l\x1b[?2004l\x1b[?1004l\x1b[<u\x1b[0m\x1b[?25h\x1b[?1049l"

/*  attach the terminal of this process to a session through the WebSocket <url> (with the
    request <headers>), passing the bytes through in both directions (and the size of the terminal
    to it), until the user detaches (resolving null) or the program ends (resolving its exit code),
    where the area <label> prefixes the errors of a failed start or a lost connection  */
export const ptyAttach = (url: string, headers: Record<string, string>, label: string): Promise<number | null> =>
    new Promise((resolve, reject) => {
        const ws      = new WebSocket(url, { headers })
        const decoder = new StringDecoder("utf8")
        let   settled = false
        const send = (msg: object) => {
            if (ws.readyState === WebSocket.OPEN)
                ws.send(JSON.stringify(msg))
        }
        const size = () => {
            send({ type: "resize", cols: process.stdout.columns, rows: process.stdout.rows })
        }

        /*  restore the terminal and settle  */
        const finish = (result: number | null | Error) => {
            if (settled)
                return
            settled = true
            process.stdin.off("data", input)
            process.stdout.off("resize", size)
            if (process.stdin.isTTY)
                process.stdin.setRawMode(false)
            process.stdin.pause()
            process.stdout.write(RESET + "\r\n")
            ws.close()
            if (result instanceof Error)
                reject(result)
            else
                resolve(result)
        }

        /*  pass the input on, except the detach key  */
        const input = (chunk: Buffer) => {
            const data = decoder.write(chunk)
            if (DETACH.test(data))
                finish(null)
            else
                send({ type: "input", data })
        }
        ws.on("open", () => {
            process.stdout.write("\x1b[2J\x1b[H")
            process.stdin.setRawMode(true)
            process.stdin.resume()
            process.stdin.on("data", input)
            process.stdout.on("resize", size)
            size()
        })
        ws.on("message", (raw: Buffer, binary: boolean) => {
            if (binary) {
                process.stdout.write(raw)
                return
            }
            let msg = null as { type?: unknown, code?: unknown, message?: unknown } | null
            try {
                msg = JSON.parse(raw.toString("utf8"))
            }
            catch {
                /*  ignore a malformed message  */
            }
            if (msg?.type === "error")
                finish(new Error(`${label}: ${String(msg.message)}`))
            else if (msg?.type === "exit")
                finish(typeof msg.code === "number" ? msg.code : 1)
        })
        ws.on("unexpected-response", (_req, res) => {
            /*  report the error text of the refusal (without the repeated area), else its status  */
            let body = ""
            res.on("data", (chunk: Buffer) => { body += chunk.toString("utf8") })
            res.on("end", () => {
                let error = `HTTP status ${res.statusCode}`
                try {
                    const parsed = JSON.parse(body) as { error?: unknown }
                    if (typeof parsed.error === "string")
                        error = parsed.error.startsWith(`${label}: `) ? parsed.error.slice(label.length + 2) : parsed.error
                }
                catch {
                    /*  no error text, keeping the status  */
                }
                finish(new Error(`${label}: attaching refused: ${error}`))
            })
        })
        ws.on("close", () => {
            finish(new Error(`${label}: connection lost`))
        })
        ws.on("error", (err) => {
            finish(new Error(`${label}: connection failed: ${err.message}`))
        })
    })

