/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import os                        from "node:os"
import type { IncomingMessage }  from "node:http"
import type { Duplex }           from "node:stream"

import { execa }                 from "execa"
import type { ResultPromise }    from "execa"
import which                     from "which"
import { WebSocket, WebSocketServer } from "ws"

import type Log                  from "./ase-lib-log.js"

/*  the shared pseudo-terminal sessions, each running a program in a pseudo-terminal of the
    companion program "pty-to-stdio" (as it keeps the native code of a pseudo-terminal out of this
    package), keyed by an opaque string, kept running while detached until they are idle, and
    shared by all clients attached to them over a (by the caller already authenticated)
    WebSocket, where a binary frame to a client is output of the program (all of it replayed on
    attaching), a text frame to a client is { type: "exit", code } resp. { type: "error", message },
    and a text frame from a client is { type: "input", data } resp. { type: "resize", cols, rows },
    and where the terminal of a session has the smallest size of all its clients (as in tmux)  */

/*  the limits of the sessions: the replayed output (the screen plus a long scrollback, as the data
    of an inline image is sent only once), the not yet sent data of a client (a full replay plus a
    margin, beyond which it cannot keep up), the size of a message of a client (a pasted text, as
    the companion takes frames up to 1 MiB), the running sessions, the clients of a session, and
    the terminal size  */
const HISTORY_MAX  = 4 * 1024 * 1024
const BUFFER_MAX   = 8 * 1024 * 1024
const PAYLOAD_MAX  = 1024 * 1024
const SESSIONS_MAX = 16
const CLIENTS_MAX  = 8
export const SIZE_MAX = 1000

/*  the smallest size of a client that counts (a hidden or detaching emulator reports a tiny one,
    which the program would redraw its screen for), and the delay of the second step of a forced
    redraw of the program  */
const SIZE_MIN_COLS = 20
const SIZE_MIN_ROWS = 5
const REDRAW_MS     = 100

/*  the interval of the keepalive pings of the clients, the time without a client after which a
    session ends, and the length of the error output of the companion kept for a failed start  */
const PING_MS   = 15 * 1000
const IDLE_MS   = 30 * 60 * 1000
const ERROR_MAX = 1024

/*  the longest a started session waits for a client to tell its terminal before its program starts  */
const START_MS  = 5 * 1000

/*  the companion program: its version fetched on demand (unless one is found in $PATH)  */
const COMPANION         = "pty-to-stdio"
const COMPANION_VERSION = "0.9.0"

/*  the start of a session: the program with its arguments, working directory, environment, and
    initial terminal size, and the handler of its end by itself, receiving its exit code and
    whether the program wrote any output at all (as without, the companion failed to start it)  */
export type PtySpec = {
    file: string
    args: string[]
    cwd:  string
    env:  Record<string, string>
    cols: number
    rows: number
    exit: (code: number, output: boolean) => void
}

/*  a session: its process (null before the start and after the end), its start waiting for a
    client (see "start"), its exit code, its replayed output, its clients with their sizes (null
    until told), its size, and its idle timer  */
type Pending = { spec: PtySpec, companion: string[], timer: ReturnType<typeof setTimeout> }
type Size    = { cols: number, rows: number }
type Session = {
    child:   ResultPromise | null
    pending: Pending | null
    exited:  number | null
    history: Buffer[]
    size:    number
    clients: Map<WebSocket, Size | null>
    cols:    number
    rows:    number
    idle:    ReturnType<typeof setTimeout> | null
}

/*  a terminal dimension of a client, if valid  */
export const ptyDimension = (value: unknown): number | null =>
    typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= SIZE_MAX ? value : null

/*  a frame of the input of the companion: its type, the payload length, and the payload  */
const frame = (type: "i" | "r", payload: Buffer): Buffer => {
    const head = Buffer.alloc(5)
    head.writeUInt8(type.charCodeAt(0), 0)
    head.writeUInt32BE(payload.length, 1)
    return Buffer.concat([ head, payload ])
}

/*  the host of the sessions, with the area <label> of its log lines and errors  */
export class PtyHost {
    private sessions   = new Map<string, Session>()
    private wss        = new WebSocketServer({ noServer: true, maxPayload: PAYLOAD_MAX })
    private unanswered = new WeakSet<WebSocket>()
    private timer:      ReturnType<typeof setInterval>

    constructor (private log: Log, private label: string) {
        this.timer = setInterval(() => { this.keepalive() }, PING_MS)
        this.timer.unref()
    }

    /*  whether any session runs or has a client  */
    active (): boolean {
        return [ ...this.sessions.values() ].some((s) => s.child !== null || s.pending !== null || s.clients.size > 0)
    }

    /*  whether a session runs, and whether no further session may start  */
    running (key: string): boolean {
        const s = this.sessions.get(key)
        return s !== undefined && (s.child !== null || s.pending !== null)
    }
    full (): boolean {
        return [ ...this.sessions.values() ].filter((s) => s.child !== null || s.pending !== null).length >= SESSIONS_MAX
    }

    /*  start a session, unless it runs already, where an ended session is cleared on its clients,
        and where its program starts once a client tells the size of its terminal (so the program
        asks that terminal its questions, e.g. whether it shows images, and starts at its size),
        resp. at once for an attached client, and at the latest after a short wait  */
    async start (key: string, spec: PtySpec): Promise<void> {
        const companion = await which(COMPANION).then((file) => [ file ])
            .catch(() => [ "npx", "-y", `${COMPANION}@${COMPANION_VERSION}` ])
        let s = this.sessions.get(key)
        if (s !== undefined && (s.child !== null || s.pending !== null))
            return
        if (this.full())
            throw new Error(`${this.label}: too many running sessions (maximum: ${SESSIONS_MAX})`)
        if (s === undefined) {
            s = {
                child:   null,
                pending: null,
                exited:  null,
                history: [],
                size:    0,
                clients: new Map(),
                cols:    spec.cols,
                rows:    spec.rows,
                idle:    null
            }
            this.sessions.set(key, s)
        }
        else if (s.exited !== null)
            this.send(s, Buffer.from("\x1bc"))
        const session = s
        session.exited  = null
        session.history = []
        session.size    = 0
        this.fit(session, false)
        if (session.clients.size > 0)
            this.spawn(key, session, spec, companion)
        else {
            session.pending = { spec, companion, timer: setTimeout(() => { this.launch(key, session) }, START_MS) }
            this.idle(key, session)
        }
    }

    /*  start the waiting program of a session, at its size  */
    private launch (key: string, s: Session): void {
        const pending = s.pending
        if (pending === null)
            return
        clearTimeout(pending.timer)
        s.pending = null
        this.spawn(key, s, pending.spec, pending.companion)
    }

    /*  run the program of a session, where the companion runs in a neutral directory (so a
        launcher like "npx" picks up nothing of the project) and starts the program in its
        working directory  */
    private spawn (key: string, session: Session, spec: PtySpec, companion: string[]): void {
        /*  run the program in the companion, without collecting its output  */
        const [ file, ...args ] = companion
        const child = execa(file, [ ...args, "--cols", String(session.cols), "--rows", String(session.rows),
            "--cwd", spec.cwd, "--", spec.file, ...spec.args ], {
            cwd: os.homedir(), env: spec.env, extendEnv: false, stdin: "pipe", buffer: false, reject: false
        })
        session.child = child
        this.idle(key, session)
        let errors = ""
        child.stdout.on("data", (data: Buffer) => {
            session.history.push(data)
            session.size += data.length
            while (session.size > HISTORY_MAX && session.history.length > 1)
                session.size -= session.history.shift()!.length
            this.send(session, data)
        })
        child.stderr.on("data", (data: Buffer) => {
            errors = (errors + data.toString("utf8")).slice(-ERROR_MAX)
        })
        child.stdin.on("error", () => { /*  ignored, as the end is reported by the result  */ })

        /*  report the end by itself, where an end without any output is a failed start  */
        child.then((result) => {
            if (session.child !== child)
                return
            const code = result.exitCode ?? 128 + (result.signal !== undefined ? os.constants.signals[result.signal] : 0)
            session.child  = null
            session.exited = code
            const output = session.size > 0
            if (code !== 0 && !output) {
                const message = `starting "${spec.file}" failed: ${errors.trim() || result.message}`
                this.log.write("warning", `${this.label}: ${message}`)
                this.send(session, JSON.stringify({ type: "error", message }))
            }
            this.log.write("info", `${this.label}: "${key}" ended (exit code ${code})`)
            this.send(session, JSON.stringify({ type: "exit", code }))
            spec.exit(code, output)
            this.idle(key, session)
        }).catch(() => { /*  not rejecting, as "reject" is off  */ })
        this.log.write("info", `${this.label}: "${key}" started (pid ${child.pid ?? "none"})`)
    }

    /*  attach a client by its (by the caller already authenticated) WebSocket handshake to a
        started session, replaying its entire output, resp. reject it with an HTTP status  */
    upgrade (req: IncomingMessage, socket: Duplex, head: Buffer, key: string,
        reject: (status: number, message: string) => void): void {
        const s = this.sessions.get(key)
        if (s === undefined) {
            reject(404, `${this.label}: no session "${key}" (start it first)`)
            return
        }
        if (s.clients.size >= CLIENTS_MAX) {
            reject(429, `${this.label}: too many clients of session "${key}" (maximum: ${CLIENTS_MAX})`)
            return
        }
        this.wss.handleUpgrade(req, socket, head, (ws) => {
            s.clients.set(ws, null)
            this.idle(key, s)
            if (s.history.length > 0)
                ws.send(Buffer.concat(s.history), { binary: true })
            if (s.exited !== null)
                ws.send(JSON.stringify({ type: "exit", code: s.exited }))
            ws.on("message", (raw: Buffer, binary: boolean) => {
                let msg = null as { type?: unknown, data?: unknown, cols?: unknown, rows?: unknown } | null
                try {
                    msg = binary ? null : JSON.parse(raw.toString("utf8"))
                }
                catch {
                    /*  ignore a malformed message  */
                }
                const cols = ptyDimension(msg?.cols)
                const rows = ptyDimension(msg?.rows)
                if (msg?.type === "input" && typeof msg.data === "string")
                    s.child?.stdin?.write(frame("i", Buffer.from(msg.data, "utf8")))
                else if (msg?.type === "resize" && cols !== null && rows !== null) {
                    /*  a tiny size counts as none, and the first size of a client redraws the
                        program, as its replayed output may end in a screen of another size  */
                    const first = s.clients.get(ws) === null
                    const size  = cols >= SIZE_MIN_COLS && rows >= SIZE_MIN_ROWS ? { cols, rows } : null
                    s.clients.set(ws, size)
                    if (s.pending === null)
                        this.fit(s, true, first && size !== null)
                    else if (size !== null) {
                        this.fit(s, false)
                        this.launch(key, s)
                    }
                }
            })
            ws.on("pong", () => {
                this.unanswered.delete(ws)
            })
            ws.on("close", () => {
                s.clients.delete(ws)
                this.fit(s, true)
                this.idle(key, s)
            })
            ws.on("error", (err) => {
                this.log.write("debug", `${this.label}: WebSocket error on "${key}": ${err.message}`)
            })
        })
    }

    /*  end all sessions and close all clients (on stopping the hosting server)  */
    stop (): void {
        clearInterval(this.timer)
        for (const [ key, s ] of this.sessions) {
            for (const ws of s.clients.keys())
                ws.close(1001, "server shutting down")
            this.end(key, s)
        }
        this.wss.close()
    }

    /*  send output resp. a message to all clients of a session, terminating those which
        cannot keep up (as a skipped output would corrupt their screen)  */
    private send (s: Session, data: Buffer | string): void {
        for (const ws of s.clients.keys()) {
            if (ws.readyState !== WebSocket.OPEN)
                continue
            if (ws.bufferedAmount > BUFFER_MAX)
                ws.terminate()
            else
                ws.send(data, { binary: typeof data !== "string" })
        }
    }

    /*  size the terminal of a session to the smallest size of its clients, resizing the
        running program on a change (if requested), resp. (with <redraw>) without a change by a
        resize to one row less and back, as the program redraws its screen on a change only  */
    private fit (s: Session, resize: boolean, redraw = false): void {
        const sizes = [ ...s.clients.values() ].filter((size) => size !== null)
        if (sizes.length === 0)
            return
        const cols = Math.min(...sizes.map((size) => size.cols))
        const rows = Math.min(...sizes.map((size) => size.rows))
        if (cols === s.cols && rows === s.rows) {
            if (resize && redraw && s.child !== null) {
                this.resize(s, cols, Math.max(1, rows - 1))
                setTimeout(() => {
                    if (s.cols === cols && s.rows === rows)
                        this.resize(s, cols, rows)
                }, REDRAW_MS)
            }
            return
        }
        s.cols = cols
        s.rows = rows
        if (resize)
            this.resize(s, cols, rows)
    }

    /*  resize the running program of a session  */
    private resize (s: Session, cols: number, rows: number): void {
        const payload = Buffer.alloc(4)
        payload.writeUInt16BE(cols, 0)
        payload.writeUInt16BE(rows, 2)
        s.child?.stdin?.write(frame("r", payload))
    }

    /*  end a session after the idle time, while no client is attached  */
    private idle (key: string, s: Session): void {
        if (s.idle !== null)
            clearTimeout(s.idle)
        s.idle = s.clients.size > 0 ? null : setTimeout(() => {
            this.log.write("info", `${this.label}: "${key}" idle`)
            this.end(key, s)
        }, IDLE_MS)
    }

    /*  end and forget a session, where closing the input of the companion hangs up the program,
        and where the end is no end by itself, so it is not reported (as it keeps the session
        of the program, e.g. of an agent tool, resumable)  */
    private end (key: string, s: Session): void {
        if (s.idle !== null)
            clearTimeout(s.idle)
        s.idle = null
        if (s.pending !== null)
            clearTimeout(s.pending.timer)
        s.pending = null
        const child = s.child
        s.child = null
        child?.stdin?.end()
        if (child !== null)
            this.log.write("info", `${this.label}: "${key}" ended by the host`)
        this.sessions.delete(key)
    }

    /*  ping all clients, terminating those which have not answered the previous ping  */
    private keepalive (): void {
        for (const s of this.sessions.values())
            for (const ws of s.clients.keys()) {
                if (this.unanswered.has(ws)) {
                    ws.terminate()
                    continue
                }
                this.unanswered.add(ws)
                ws.ping()
            }
    }
}

