/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import fs              from "node:fs"

import chalk           from "chalk"
import { DateTime }    from "luxon"

const levels = [
    { name: "error",   style: chalk.red.bold },
    { name: "warning", style: chalk.yellow.bold },
    { name: "info",    style: chalk.blue },
    { name: "debug",   style: chalk.green }
] as const

export type LogLevel = typeof levels[number]["name"]

export default class Log {
    private stream: fs.WriteStream | null = null
    private logLevelIdx = 0
    constructor (
        private _program:  string,
        private _logLevel: LogLevel,
        private _logFile:  string
    ) {}
    async init () {
        /*  log messages  */
        const idx = levels.findIndex((l) => l.name === this._logLevel)
        if (idx === -1)
            throw new RangeError(`invalid log level "${this._logLevel}" (expected one of: ${levels.map((l) => l.name).join(", ")})`)
        this.logLevelIdx = idx
        if (this._logFile !== "-")
            this.stream = fs.createWriteStream(this._logFile, { flags: "a", encoding: "utf8" })
    }
    logLevel (level: LogLevel) {
        const idx = levels.findIndex((l) => l.name === level)
        if (idx === -1)
            throw new RangeError(`invalid log level "${level}" (expected one of: ${levels.map((l) => l.name).join(", ")})`)
        this._logLevel   = level
        this.logLevelIdx = idx
    }
    logFile (file: string) {
        if (file === this._logFile)
            return
        this._logFile = file
        if (this.stream !== null) {
            this.stream.end()
            this.stream = null
        }
        if (file !== "-")
            this.stream = fs.createWriteStream(file, { flags: "a", encoding: "utf8" })
    }
    write (level: LogLevel, msg: string) {
        const idx = levels.findIndex((l) => l.name === level)
        if (idx !== -1 && idx <= this.logLevelIdx) {
            const timestamp = DateTime.now().toFormat("yyyy-LL-dd HH:mm:ss.SSS")
            let line = `${this._program}: [${timestamp}]: `
            if (this._logFile === "-" && process.stderr.isTTY)
                line += `${levels[idx].style("[" + levels[idx].name.toUpperCase() + "]")}`
            else
                line += `[${levels[idx].name.toUpperCase()}]`
            line += `: ${msg}\n`
            if (this._logFile === "-")
                process.stderr.write(line)
            else if (this.stream !== null)
                this.stream.write(line)
        }
    }
}

