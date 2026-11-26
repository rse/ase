/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import { ref, watch }             from "vue"
import type { GhosttyTheme, ResttyFontInput, Restty, PtyTransport } from "restty"

import { api, openTask, task }    from "./ase-task-board-web-client-model"

/*  the task whose task dialog shows the chat about it (as opening another task must not start
    its chat), cleared on closing the task dialog (as opening it again must not start the chat
    either), and whether the chat has the focus (and hence all keys)  */
export const chatTask    = ref<string | null>(null)
export const chatFocused = ref(false)
watch(task, (shown) => {
    if (shown === null)
        chatTask.value = null
})

/*  show the chat about a task in its task dialog (opening it), resp. hide it again  */
export const toggleChat = (id: string): void => {
    if (task.value?.id === id && chatTask.value === id)
        chatTask.value = null
    else {
        chatTask.value = id
        if (task.value?.id !== id)
            openTask(id)
    }
}

/*  the terminal size a chat starts with, until the emulator tells its own  */
const COLS_INIT = 80
const ROWS_INIT = 24

/*  the fonts of the terminal emulator, which takes TrueType fonts only: the code font of the
    board, followed by the fallbacks for the symbols, mathematical symbols, arrows, and emojis
    the agent tool draws (which the code font lacks)  */
const fonts: ResttyFontInput[] = [
    { url: "/task-chat/font/DejaVuSansMono.ttf",              name: "DejaVu Sans Mono",     weight: 400 },
    { url: "/task-chat/font/DejaVuSansMono-Bold.ttf",         name: "DejaVu Sans Mono Bold", weight: 700 },
    { url: "/task-chat/font/NotoSansSymbols_400Regular.ttf",  name: "Noto Sans Symbols",    weight: 400 },
    { url: "/task-chat/font/NotoSansSymbols2_400Regular.ttf", name: "Noto Sans Symbols 2",  weight: 400 },
    { url: "/task-chat/font/NotoSansMath_400Regular.ttf",     name: "Noto Sans Math",       weight: 400 },
    { url: "/task-chat/font/NotoSansMono_400Regular.ttf",     name: "Noto Sans Mono",       weight: 400 },
    { url: "/task-chat/font/NotoEmoji_400Regular.ttf",        name: "Noto Emoji",           weight: 400 }
]

/*  the delay of the answer of the emulator to the device attributes query (see "chatAttach")  */
const DA1_DELAY_MS = 50

/*  the RGB color of an index from 16 to 255 of the xterm palette (its color cube and grey ramp)  */
const xterm = (i: number): { r: number, g: number, b: number } => {
    if (i >= 232)
        return { r: 8 + (i - 232) * 10, g: 8 + (i - 232) * 10, b: 8 + (i - 232) * 10 }
    const level = (n: number): number => n === 0 ? 0 : 55 + n * 40
    return { r: level(Math.floor((i - 16) / 36)), g: level(Math.floor((i - 16) / 6) % 6), b: level((i - 16) % 6) }
}

/*  the RGB components of a color of the board, resolved by the browser from its CSS variable  */
const color = (name: string): { r: number, g: number, b: number } => {
    const probe = document.createElement("span")
    probe.style.color = `var(${name})`
    document.body.appendChild(probe)
    const value = getComputedStyle(probe).color
    probe.remove()
    const n     = (value.match(/[\d.]+/g) ?? [ "0", "0", "0" ]).map(Number)
    const scale = value.startsWith("color(") ? 255 : 1
    return { r: Math.round(n[0] * scale), g: Math.round(n[1] * scale), b: Math.round(n[2] * scale) }
}

/*  the colors of the terminal: the 16 ANSI colors of a built-in palette of the emulator for a dark
    resp. light background, the other colors of the palette mapped onto the ones of the board, the
    text, cursor, and selection colors of the board, and as background the paper of the board in
    its light theme and black in its dark one (resp. the default colors without a palette)  */
const chatTheme = (emulator: typeof import("restty")): GhosttyTheme | undefined => {
    const paper = color("--c-paper")
    const dark  = 0.2126 * paper.r + 0.7152 * paper.g + 0.0722 * paper.b < 128
    const base  = emulator.getBuiltinTheme(dark ? "GitHub Dark Default" : "GitHub Light Default")
    if (base === null)
        return undefined
    const ground = dark ? { r: 0, g: 0, b: 0 } : paper

    /*  the agent tool draws in its dark color theme (as started for the web board, see "chatSpec")
        as if on black: each of the colors 16 to 255 becomes the color of the board of its kind (the
        strong text for the greys, the signal color for the warm hues, the accent color for the cool
        ones), blended into the background by its brightness (with the middle tones lifted, as the
        span of the board's colors is narrower than black to white), so its fades toward black fade
        toward the background  */
    const kinds   = { grey: color("--c-text-strong"), warm: color("--c-signal"), cool: color("--c-accent") }
    const palette = [ ...base.colors.palette ]
    for (let i = 16; i < 256; i++) {
        const c   = xterm(i)
        const max = Math.max(c.r, c.g, c.b)
        const min = Math.min(c.r, c.g, c.b)
        let kind: keyof typeof kinds = "grey"
        if (max > 0 && (max - min) / max >= 0.15) {
            const d   = max - min
            const hue = max === c.r ? (60 * (c.g - c.b) / d + 360) % 360 : max === c.g ? 60 * (c.b - c.r) / d + 120 : 60 * (c.r - c.g) / d + 240
            kind = hue < 75 || hue >= 285 ? "warm" : "cool"
        }
        const share = (max / 255) ** 0.8
        const to    = kinds[kind]
        palette[i] = {
            r: Math.round(to.r * share + ground.r * (1 - share)),
            g: Math.round(to.g * share + ground.g * (1 - share)),
            b: Math.round(to.b * share + ground.b * (1 - share))
        }
    }
    return {
        ...base,
        colors: {
            ...base.colors,
            palette,
            background:          ground,
            foreground:          color("--c-text"),
            cursor:              color("--c-signal"),
            selectionBackground: color("--c-accent-fill")
        }
    }
}

/*  let the emulator render with at least two device pixels per CSS pixel (by a floor on the
    ratio of the board's window, which nothing else of the board reads): it draws its glyphs
    itself, without the subpixel smoothing of the browser, and reads the ratio at its start only,
    so on a screen of a lower ratio, and after moving the window there, its glyphs get coarse,
    while the browser scales the denser canvas down smoothly  */
let supersampled = false
const supersample = (): void => {
    if (supersampled)
        return
    supersampled = true
    const own   = Object.getOwnPropertyDescriptor(window, "devicePixelRatio")
    const proto = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(window) as object, "devicePixelRatio")
    const read  = (own ?? proto)?.get?.bind(window)
    if (read !== undefined)
        Object.defineProperty(window, "devicePixelRatio", { configurable: true, get: () => Math.max(2, read() as number) })
}

/*  attach the terminal emulator in the element <root> to the chat about the task <id>, started by
    the ASE service unless it runs already (as an ended one starts again when shown again),
    reporting its starting, its end, and its failures by <note>, following the color theme of the
    board, and return the detaching of it (on hiding the chat), where a chat hidden meanwhile
    (<hidden>) is not attached at all  */
export const chatAttach = async (id: string, root: HTMLElement,
    note: (text: string | null) => void, hidden: () => boolean): Promise<() => void> => {
    const [ state, emulator ] = await Promise.all([
        api<{ url: string }>(`/task-chat/${encodeURIComponent(id)}`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ cols: COLS_INIT, rows: ROWS_INIT, palette: true })
        }, true),
        import("restty").catch((err: unknown) => err instanceof Error ? err : new Error(String(err)))
    ])
    if (hidden())
        return () => {}
    if (state.error !== undefined || emulator instanceof Error) {
        note(`starting the chat failed: ${state.error ?? (emulator as Error).message}`)
        return () => {}
    }

    /*  report the end and the failure of the agent tool, which only the WebSocket tells
        (as the emulator shows neither), by wrapping the callbacks of its transport, and set
        the answers of the emulator right (see below)  */
    const transport = emulator.createWebSocketPtyTransport()
    const reporting: PtyTransport = {
        ...transport,
        connect: (options) => transport.connect({
            ...options,
            callbacks: {
                ...options.callbacks,
                onExit: (code) => {
                    options.callbacks.onExit?.(code)

                    /*  a regular end (like "/exit") hides the chat, a failed one stays with its note  */
                    if (code === 0 && chatTask.value === id)
                        chatTask.value = null
                    else
                        note(`agent tool ended (exit code ${code}, show the chat again to restart it)`)
                },
                onError: (message) => {
                    options.callbacks.onError?.(message)
                    note(message)
                }
            }
        }),

        /*  the answers of the emulator to the queries of the program, set right for Claude: the
            emulator answers the device attributes query (DA1, which Claude sends after its other
            queries as their end) before the queries sent ahead of it, so that answer goes out a
            moment later, and it names itself "libghostty" (resp. its core) where Claude only
            knows "ghostty" for the terminal images it renders  */
        sendInput: (data) => {
            if (data.startsWith("\x1b[?") && data.endsWith("c") && /^[\d;]*$/.test(data.slice(3, -1))) {
                setTimeout(() => { transport.sendInput(data) }, DA1_DELAY_MS)
                return true
            }
            return transport.sendInput(data.replace("\x1bP>|libghostty", "\x1bP>|ghostty"))
        }
    }
    supersample()

    /*  the margins of the chat around the emulator in the background of the terminal  */
    const surround = (theme: GhosttyTheme | undefined): void => {
        const bg = theme?.colors.background
        if (root.parentElement !== null)
            root.parentElement.style.background = bg !== undefined ? `rgb(${bg.r}, ${bg.g}, ${bg.b})` : ""
    }
    const theme = chatTheme(emulator)
    surround(theme)
    const restty: Restty = new emulator.Restty({
        root,
        terminal: {
            fonts, ligatures: false, theme,
            fontHinting: true, fontHintTarget: "light", alphaBlending: "linear-corrected"
        },
        services: {
            ptyTransport:       reporting,
            beforeRenderOutput: () => { note(null) }
        }
    })
    restty.connectPty(`${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}${state.url}`)
    restty.focus()

    /*  follow the color theme of the board, which is cycled by the board, resp. changed by the
        system for the theme "auto", by observing both, as the board passes it on to the
        documents it renders only  */
    const recolor = () => {
        const theme = chatTheme(emulator)
        surround(theme)
        if (theme !== undefined)
            restty.applyTheme(theme, "board")
    }
    const watcher = new MutationObserver(recolor)
    const scheme  = window.matchMedia("(prefers-color-scheme: dark)")
    watcher.observe(document.documentElement, { attributes: true, attributeFilter: [ "data-theme" ] })
    scheme.addEventListener("change", recolor)
    return () => {
        watcher.disconnect()
        scheme.removeEventListener("change", recolor)
        restty.destroy()
    }
}

