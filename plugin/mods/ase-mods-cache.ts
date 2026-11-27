/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

/*  Claude Code function hooks module ("mod", EARLY ACCESS):
    Cache controller, watching the prompt cache of the own session: its state in
    a label of the footer, a SOFT auto-warm of a big idle cache by a few cheap
    forked pings, a HARD auto-warm on request for some hours, the escalation of
    a cooling resp. cold cache in a band above the prompt, and asking before a
    prompt is sent into a big cold cache (send, compact first, or cancel). It
    is configured by the ASE configuration "agent.cache.*", where the HARD
    auto-warm is operated by the command "/ase-mods-auto-warm".  */

import type {
    Elements, Frozen, ModelForkResult, ModelUsage, PromptSubmitInput,
    RenderElement, SessionMeasureInput, SessionUsage, Timer, TurnUsage
} from "claude-code"
import { layout, panel }   from "./ase-mods-common"
import type { BandRender } from "./ase-mods-common"

/*  the command and its argument hint  */
export const COMMAND = {
    name:         "ase-mods-auto-warm",
    description:  "ASE: start resp. stop the HARD auto-warm of the prompt cache",
    argumentHint: "[<hours>|off]",
    immediate:    true
} as const

/*  the engine services, bound by the hooking infrastructure for this module  */
export type Controller = {
    now:        () => Promise<number>,
    invalidate: () => void,
    ask:        (question: string, options: string[]) => Promise<string>,
    fork:       (prompt: string) => Promise<ModelForkResult>,
    config:     (scope: string) => Promise<Record<string, string>>,
    usage:      () => Promise<SessionUsage>,
    compact:    () => Promise<unknown>,
    every:      (ms: number, fn: () => void) => Timer
}

/*  the time unit, the short resp. long TTL of the prompt cache (reduce both for
    debugging), the interval of the heartbeat, and the warning lead of a cooling cache  */
const MIN       = 60 * 1000
const TTL_SHORT =  5 * MIN
const TTL_LONG  = 60 * MIN
const BEAT      = Math.min(30 * 1000, TTL_SHORT / 10)
const COOLING   = TTL_SHORT

/*  the least time left for a ping to reach the cache before it expires  */
const RESCUE    = 15 * 1000

/*  the title of the band above the prompt  */
const TITLE = "[ ⧉ ASE: Cache Escalation ]"

/*  the total input tokens of a request  */
const totalInput = (u: ModelUsage) =>
    u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens

/*  format tokens, minutes, and a clock time  */
const tokens = (n: number) =>
    n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`
        : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}k`
        : `${Math.round(n)}`
const minutes = (ms: number) => {
    const m = Math.max(0, Math.round(ms / MIN))
    return m <= 60 ? `${m}m` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}m`
}
const clock = (ts: number) => {
    const d = new Date(ts)
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

/*  the settings (from the ASE configuration "agent.cache.*"): the guard against
    cold sends, the least context of a big cache, the pings of a SOFT auto-warm,
    and the offered hours of a HARD auto-warm  */
type Settings = { guard: boolean, threshold: number, soft: number, hard: number[] }

/*  the default settings  */
const DEFAULTS: Frozen<Settings> = { guard: true, threshold: 150000, soft: 4, hard: [ 4, 8, 12, 16, 24 ] }

/*  parse the configured settings, keeping the default of an absent or invalid value  */
const configure = (cfg: Record<string, string>): Settings => {
    const settings: Settings = { ...DEFAULTS, hard: [ ...DEFAULTS.hard ] }
    const flag = (value: string | undefined, dflt: boolean) =>
        value === "true" ? true : value === "false" ? false : dflt
    settings.guard = flag(cfg["agent.cache.guard"], settings.guard)
    const threshold = /^(\d+(?:\.\d+)?)([kKmM]?)$/.exec(cfg["agent.cache.threshold"] ?? "")
    if (threshold !== null)
        settings.threshold = Math.round(Number(threshold[1]) *
            (/m/i.test(threshold[2]!) ? 1e6 : /k/i.test(threshold[2]!) ? 1e3 : 1))
    const soft = cfg["agent.cache.soft"] ?? ""
    if (/^\d+$/.test(soft))
        settings.soft = Number(soft)
    const hard = (cfg["agent.cache.hard"] ?? "").split(",").map((s) => s.trim())
    if (hard.length <= 9 && hard.every((s) =>
        /^\d+(?:\.\d+)?$/.test(s) && Number(s) >= 0.1 && Number(s) <= 24))
        settings.hard = hard.map(Number)
    return settings
}

/*  the cache controller: its state and its operations  */
export const modCacheControl = () => {
    let settings = configure({})

    /*  this session: its identity, its context, its detected TTL, its cold restarts
        (with their rewritten tokens), its turn state, its auto-warm (none, SOFT, or
        HARD until a time, with its pings), whether SOFT already ran while idle (with
        its pings), whether the band stays shown for a HARD auto-warm (until the
        next interaction), why a HARD auto-warm ended early, and whether a
        compaction left the next ping to write the cache of the compacted conversation  */
    const S = {
        id: "", activity: 0, ctx: 0,
        ttl: TTL_LONG, ttlSource: "default",
        colds: [] as { tokens: number }[],
        working: false, compacted: false, rebased: false,
        warm: "" as "" | "soft" | "hard", until: 0, pings: 0,
        softUsed: false, softPings: 0, held: false, ended: ""
    }

    /*  the time of the latest event, the heartbeat timer, whether the settings
        were loaded, and whether a ping is in flight  */
    let now = 0
    let ticker: Timer | undefined
    let loaded  = false
    let pinging = false

    /*  (re)load the settings, keeping the current ones while the service is unreachable  */
    const load = async (k: Controller) => {
        const cfg = await k.config(`session:${S.id}`).catch(() => undefined)
        if (cfg !== undefined && Object.keys(cfg).length > 0) {
            settings = configure(cfg)
            loaded   = true
        }
    }

    /*  the effective TTL, the lead of a ping before expiry, the summed cold
        restarts, and the time left until (or, negative, since) expiry  */
    const ttl    = () => S.ttl
    const margin = () => ttl() >= TTL_LONG ? TTL_LONG * 8 / 60 : TTL_SHORT * 90 / 300
    const coldTokens = () => S.colds.reduce((sum, c) => sum + c.tokens, 0)
    const left   = () => ttl() - (now - S.activity)
    const kind   = () => S.activity === 0 ? "unknown"
        : left() <= 0 ? "cold" : left() <= Math.min(COOLING, margin()) || spent() ? "cooling" : "warm"

    /*  whether a SOFT auto-warm sent all its pings (and the cache cools down until cold)  */
    const spent  = () => S.warm === "soft" && S.pings >= settings.soft

    /*  the Harvey ball of the TTL fraction left (empty for a cold cache)  */
    const ball = () => {
        const r = left() / ttl()
        return r <= 0 ? "○" : r < 0.25 ? "◔" : r < 0.5 ? "◑" : r < 0.75 ? "◕" : "●"
    }

    /*  whether a SOFT auto-warm of the idle cache starts before it expires  */
    const armed = () => S.warm === "" && !S.softUsed && settings.soft > 0 && S.ctx >= settings.threshold

    /*  the time left until the cache goes cold without further interaction: after
        the remaining pings of the auto-warm (each one step after the previous)  */
    const coldIn = () => {
        const step = ttl() - margin()
        const n = armed() ? settings.soft
            : S.warm === "soft" ? Math.max(0, settings.soft - S.pings)
            : S.warm === "hard" ? Math.max(0, Math.ceil((S.until - S.activity) / step) - 1) : 0
        return left() + n * step
    }

    /*  start resp. stop auto-warming the cache (telling why a HARD one ended early)  */
    const warmOn = (mode: "soft" | "hard", hours = 0) => {
        S.warm  = mode
        S.until = now + hours * 60 * MIN
        S.pings = 0
        S.held  = mode === "hard"
        S.ended = ""
        if (mode === "soft")
            S.softUsed = true
    }
    const warmOff = (reason = "") => {
        if (S.warm === "hard")
            S.ended = reason
        S.warm = ""
        S.held = false
    }

    /*  ping the cache shortly before it expires while it is auto-warmed (starting
        the SOFT auto-warm of a big cache once per idle period, and keeping a spent
        one until cold), and stop once the auto-warm ended or a ping wrote instead
        of read the cache (as then it was cold already)  */
    const keepWarm = async (k: Controller) => {
        if (S.working || S.activity === 0 || pinging)
            return
        if (left() <= 0)
            return warmOff("the cache expired before the next ping")
        if (S.warm === "hard" && now >= S.until)
            return warmOff()
        if (now - S.activity < ttl() - margin())
            return
        if (armed())
            warmOn("soft")
        else if (spent())
            return
        if (S.warm === "")
            return
        k.invalidate()

        /*  ping without overlapping a ping of the next beat, asking for haste
            in the prompt (instead of an "effort", which would cost the cache),
            and with the cache kept warm from its sending on  */
        pinging  = true
        const id = S.id
        const rebased = S.rebased
        const sent    = now
        const reply = await k.fork("ASE cache controller keep-alive ping. You have no tools. " +
            "Answer straight away without thinking it over. Reply with only: ok")
            .catch(() => undefined).finally(() => { pinging = false })
        if (reply === undefined)
            return warmOff("the ping failed")
        if (!reply.isAnswered)
            return warmOff(`the ping failed (${reply.reason})`)

        /*  drop the outcome of a ping overtaken by a new turn or session  */
        if (S.working || S.id !== id)
            return
        const u = reply.usage
        S.pings++
        if (S.warm === "soft")
            S.softPings++

        /*  stop on a ping which wrote the cache, unless a compaction changed the conversation  */
        S.rebased = false
        if (!rebased && u.cache_creation_input_tokens > 0.1 * Math.max(1, u.cache_read_input_tokens))
            return warmOff("the ping rewrote the already cold cache")
        now        = await k.now()
        S.activity = sent
    }

    /*  start the HARD auto-warm on request (telling whether the cache lives long
        enough for a ping, else the redrawn band tells it is too late), pinging
        at once when a ping is due  */
    const hardOn = async (hours: number, k: Controller) => {
        now = await k.now()
        k.invalidate()
        if (S.activity === 0 || left() < RESCUE)
            return false
        warmOn("hard", hours)
        k.invalidate()
        keepWarm(k).catch(() => {
            /*  ignore a failed ping, the next beat retries  */
        }).finally(() => { k.invalidate() })
        return true
    }

    /*  the periodic step: loading the settings (until the service answered),
        auto-warming, and redrawing  */
    const tick = async (k: Controller) => {
        if (!loaded)
            await load(k)
        now = await k.now()
        await keepWarm(k)
        k.invalidate()
    }

    /*  start with the session: load the settings (whose service may not yet be
        connected) and start the heartbeat (for a session a person sees only, as
        nobody acts on a headless one)  */
    const start = async (info: { id: string, interactive: boolean }, k: Controller) => {
        now  = await k.now()
        S.id = info.id
        await load(k)
        if (info.interactive && ticker === undefined) {
            ticker = k.every(BEAT, () => {
                tick(k).catch(() => {
                    /*  ignore a failed step, the next one retries  */
                })
            })
        }
    }

    /*  continue under a new session id after "/clear", a resume, or a fork,
        whose cache state is unknown  */
    const restart = (id: string) => {
        S.id       = id
        S.activity  = 0
        S.rebased   = false
        S.softUsed  = false
        S.softPings = 0
        S.ended     = ""
        warmOff()
    }

    /*  track a compaction of the main conversation: take over its new size, let
        the next ping write the cache of the compacted conversation without
        stopping, and stop a SOFT auto-warm of a cache no longer big  */
    const compacted = (tokensAfter: number | undefined) => {
        S.compacted = true
        S.rebased   = true
        if (tokensAfter !== undefined)
            S.ctx = tokensAfter
        if (S.warm === "soft" && S.ctx < settings.threshold)
            warmOff()
    }

    /*  end with the session: stop the heartbeat timer unless the process continues
        (after "/clear" or a resume, where no "session.start" follows to start it again)  */
    const end = (continues: boolean) => {
        if (!continues) {
            ticker?.cancel()
            ticker = undefined
        }
    }

    /*  track a main-loop turn starting, as a new interaction ending a SOFT
        auto-warm (re-arming it for the next idle period) and the band of a HARD one  */
    const turnStart = async (k: Controller) => {
        now         = await k.now()
        S.working   = true
        S.softUsed  = false
        S.softPings = 0
        S.held      = false
        S.ended     = ""
        if (S.warm === "soft")
            warmOff()
        k.invalidate()
    }

    /*  track a main-loop request: whether it read or rewrote the cache, with
        the TTL detected from the usage (or measured from the idle gap), and
        with the cache kept warm from its start on  */
    const step = (u: TurnUsage, startedAt: number, at: number) => {
        now = at
        const total   = totalInput(u)
        const written = u.cache_creation_input_tokens
        const gap     = S.activity > 0 ? startedAt - S.activity : 0

        /*  the cache writes per TTL (not reported by every engine version)  */
        const tiers = u as {
            ephemeral_1h_input_tokens?: number,
            ephemeral_5m_input_tokens?: number
        }
        if ((tiers.ephemeral_1h_input_tokens ?? 0) > 0) {
            S.ttl       = TTL_LONG
            S.ttlSource = "detected"
        }
        else if ((tiers.ephemeral_5m_input_tokens ?? 0) > 0) {
            S.ttl       = TTL_SHORT
            S.ttlSource = "detected"
        }
        if (S.compacted) {
            S.compacted = false
            S.rebased   = false
        }
        else if (S.activity > 0 && total > 30000 && written / total > 0.5) {
            if (S.ttlSource !== "detected" && gap > TTL_SHORT * 1.1 && gap < S.ttl) {
                S.ttl       = TTL_SHORT
                S.ttlSource = "measured"
            }
            S.colds.push({ tokens: written })
        }
        else if (S.activity > 0 && total > 30000 && gap > TTL_SHORT * 1.1
            && u.cache_read_input_tokens / total > 0.8 && S.ttlSource !== "detected") {
            S.ttl       = TTL_LONG
            S.ttlSource = "measured"
        }
        S.ctx      = total
        S.activity = startedAt
    }

    /*  take over the figures of the status line  */
    const figures = (u: Pick<SessionMeasureInput, "context">) => {
        if (u.context.tokens)
            S.ctx = u.context.tokens
    }

    /*  track a main-loop turn completing, reloading the settings (to follow changes)  */
    const complete = async (k: Controller) => {
        now = await k.now()
        S.working = false
        const usage = await k.usage().catch(() => undefined)
        if (usage !== undefined)
            figures(usage)
        await load(k)
        k.invalidate()
    }

    /*  guard a prompt sent by the person: ask before a big cold cache is
        rewritten (telling whether to send it)  */
    const guard = async (e: Frozen<PromptSubmitInput>, k: Controller): Promise<boolean> => {
        now = await k.now()
        const person  = e.origin.kind === "composer" || e.origin.kind === "bridge"
        const command = e.command !== undefined || e.text.trim().startsWith("/")
        if (!settings.guard || !person || command || S.activity === 0 || left() > 0
            || S.ctx < settings.threshold || e.turnId !== undefined)
            return true
        const answer = await k.ask(`The prompt cache went cold ${minutes(-left())} ago. ` +
            `Sending now rewrites ${tokens(S.ctx)} tokens of context. What should happen?`,
        [ "Send anyway", "Compact first, then send", "Cancel" ]).catch(() => "Send anyway")
        if (answer === "Compact first, then send") {
            await k.compact().catch(() => undefined)
            return true
        }
        return answer === "Send anyway"
    }

    /*  run the command (telling its output)  */
    const command = async (args: string, k: Controller): Promise<string> => {
        now = await k.now()
        const [ value = "", ...rest ] = args.trim().toLowerCase().split(/\s+/)
        const hours = value === "" || /^\d+(?:\.\d+)?$/.test(value)
        if (rest.length > 0 || !(value === "off" || hours))
            return `**ERROR**: invalid arguments \`${args.trim()}\` ` +
                `(usage: \`/${COMMAND.name} ${COMMAND.argumentHint}\`)`
        else if (value === "off" || (value === "" && S.warm === "hard"))
            warmOff()
        else if (!await hardOn(value === "" ? settings.hard[0] ?? 4
            : Math.min(24, Math.max(0.1, Number(value))), k))
            return "**ERROR**: no prompt cache warm long enough to auto-warm"
        k.invalidate()
        return S.warm === "hard" ? `HARD auto-warm of the prompt cache until ${clock(S.until)}`
            : "HARD auto-warm of the prompt cache stopped"
    }

    /*  draw the escalation of a cooling cache (without or after a spent SOFT
        auto-warm) resp. of a cold cache, or a held HARD auto-warm (stoppable), into
        the band above the prompt (terminal only), inside the self-drawn frame, on
        top of the drawing beneath, yielding to a survey and to a running turn
        (whose next request uses the cache anyway)  */
    const render = (e: BandRender, ui: Elements["terminal"], drawn: RenderElement | null,
        k: Controller): RenderElement | undefined => {
        const st   = kind()
        const hard = S.warm === "hard" && S.held && st !== "cold"
        if (e.props.hasSurvey || S.working
            || !(hard || st === "cold" || (st === "cooling" && (spent() || (S.warm === "" && !armed())))))
            return undefined
        const { Box, Text, Button } = ui
        const lines: RenderElement[] = []
        let hints = `/${COMMAND.name} ${COMMAND.argumentHint}: start custom HARD auto-warm`
        if (hard) {
            lines.push(Box({ flexDirection: "row", children: [
                Text({ children: "⛁ cache:" }),
                Text({ color: "ansi256(4)", bold: true,
                    children: ` ${ball()} warm ⏱ ${minutes(coldIn())} left` }),
                Text({ children: ` ▶ auto-warmed until ${clock(S.until)}` })
            ] }))
            lines.push(Box({ flexDirection: "row", columnGap: 1, children: [
                Text({ children: "⛁ cache: hard auto-warm:" }),
                Button({ key: "warm-stop", label: "STOP", plain: true,
                    children: Text({ bold: true, children: "STOP" }), onPress: () => {
                    warmOff()
                    k.invalidate()
                } })
            ] }))
            hints = `click/ctrl+x tab: stop HARD auto-warm · ${hints}`
        }
        else if (st === "cooling") {
            lines.push(Box({ flexDirection: "row", children: [
                Text({ children: "⛁ cache:" }),
                Text({ color: "ansi256(1)", bold: true,
                    children: ` ${ball()} cooling ⏱ ${minutes(left())} left` }),
                Text({ children: " ▶ next prompt: " }),
                Text({ color: "ansi256(1)", bold: true, children: `rewrites ${tokens(S.ctx)} tokens` })
            ] }))

            /*  offer the HARD auto-warm only while a ping still reaches the cache,
                even after the time of the drawing went stale for one beat  */
            if (left() >= RESCUE + BEAT) {
                lines.push(Box({ flexDirection: "row", columnGap: 1, children: [
                    Text({ children: "⛁ cache: hard auto-warm:" }),
                    ...settings.hard.flatMap((hours, i) => [
                        ...(i > 0 ? [ Text({ children: "|" }) ] : []),
                        Button({ key: `warm-${hours}`, label: `${hours}h`, plain: true,
                            children: Text({ bold: true, children: `${hours}h` }), onPress: () => {
                                hardOn(hours, k).catch(() => {
                                    /*  ignore a failed start, the band still offers it  */
                                })
                            } })
                    ])
                ] }))
                hints = `click/ctrl+x tab: start standard HARD auto-warm · ${hints}`
            }
            else
                lines.push(Text({ children: "⛁ cache: hard auto-warm: too late, " +
                    "as the cache expires before a ping could reach it" }))
            if (S.ended !== "")
                lines.push(Text({ children: `⛁ cache: hard auto-warm: ended early, as ${S.ended}` }))
        }
        else {
            /*  alarm in red only for a big cache, else just inform in blue  */
            const color = S.ctx >= settings.threshold ? "ansi256(1)" : "ansi256(4)"
            lines.push(Box({ flexDirection: "row", children: [
                Text({ children: "⛁ cache:" }),
                Text({ color, bold: true,
                    children: ` ${ball()} cold ⏱ ${minutes(-left())} ago` }),
                Text({ children: " ▶ next prompt: " }),
                Text({ color, bold: true, children: `rewrites ${tokens(S.ctx)} tokens` })
            ] }))
            lines.push(Text({ children: `⛁ cache: cold restarts so far: ${S.colds.length} ` +
                `(${tokens(coldTokens())} tokens rewritten)` }))
            if (S.ended !== "")
                lines.push(Text({ children: `⛁ cache: hard auto-warm: ended early, as ${S.ended}` }))
            if (S.softPings > 0)
                lines.push(Text({ children: `⛁ cache: soft auto-warm: already extended by ` +
                    `${S.softPings}/${settings.soft} pings` }))
            else if (S.ctx < settings.threshold)
                lines.push(Text({ children: `⛁ cache: soft auto-warm: skipped, as below ` +
                    `threshold of ${tokens(settings.threshold)} tokens` }))
        }
        const band = panel(ui, { ...layout(e, 0), body: lines.length, overflow: false },
            { top: 0, scroll: 0, page: 1, split: 0 },
            { title: TITLE, hints, rows: (i) => lines[i] })
        return drawn !== null ? Box({ flexDirection: "column", children: [ band, drawn ] }) : band
    }

    /*  the session mode label of the footer (also drawn by the desktop app)  */
    const footer = (): string[] | undefined => {
        const st = kind()
        if (st === "unknown")
            return undefined
        else if (st === "cold")
            return [ `⛁ cache: ${ball()} cold ⏱ ${minutes(-left())} ago` ]
        else if (S.warm === "hard")
            return [ `⛁ cache: ${ball()} warm ⏱ ${minutes(coldIn())} left`,
                `⛁ cache: hard auto-warm (until ${clock(S.until)})` ]
        else if (S.warm === "soft" || (st === "cooling" && armed()))
            return [ `⛁ cache: ${ball()} warm ⏱ ${minutes(coldIn())} left`,
                `⛁ cache: soft auto-warm ` +
                `${S.warm === "soft" ? `(${S.pings}/${settings.soft} pings)` : "(armed)"}` ]
        else
            return [ `⛁ cache: ${ball()} warm ⏱ ${minutes(left())} left` ]
    }

    return { start, restart, end, turnStart, step, figures, complete,
        compacted, guard, command, render, footer }
}

