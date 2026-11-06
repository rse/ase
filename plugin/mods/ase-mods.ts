/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

/*  Claude Code function hooks module ("mod", EARLY ACCESS):
    Hooking infrastructure, registering the function hooks and dispatching
    them into the grill table ("ase-mods-task-grill.ts"), the decision matrix
    ("ase-mods-meta-evaluate.ts"), the intent help ("ase-mods-help-find.ts"),
    the synopsis form ("ase-mods-help-compose.ts"),
    the manual band ("ase-mods-help-show.ts"), the manpage browser
    ("ase-mods-help-browse.ts"), the hint band ("ase-mods-help-hint.ts"),
    and the task band ("ase-mods-task-edit.ts").
    As the engine loads only a module spelling "on", "$", and "next" literally,
    this is the only module touching the engine, and it binds the engine
    services needed by the other modules as plain functions.  */

import type { Register, PromptBox, Timer } from "claude-code"
import { type Band, TRIGGER } from "./ase-mods-common.ts"
import { modGrill }           from "./ase-mods-task-grill.ts"
import { modEvaluate }        from "./ase-mods-meta-evaluate.ts"
import { modHelpFind }        from "./ase-mods-help-find.ts"
import { modHelpCompose }     from "./ase-mods-help-compose.ts"
import { modHelpShow }        from "./ase-mods-help-show.ts"
import { modHelpBrowse }      from "./ase-mods-help-browse.ts"
import { modHelpHint }        from "./ase-mods-help-hint.ts"
import { modTaskEdit, TOOL }  from "./ase-mods-task-edit.ts"

/*  function hook registration entry point  */
export const register: Register = (on, options) => {
    /*  allow the rendering to be disabled without disabling the plugin  */
    if (options.enabled === false)
        return

    /*  the grill table, the decision matrix, the intent help, the synopsis form,
        the manual band, the manpage browser, the hint band, and the task band  */
    const grill    = modGrill()
    const evaluate = modEvaluate()
    const intent   = modHelpFind()
    const skill    = modHelpCompose()
    const manual   = modHelpShow()
    const browse   = modHelpBrowse()
    const hint     = modHelpHint()
    const task     = modTaskEdit()

    /*  provide the tool of the task band where a person sees the band only, so
        its absence tells "ase-task-edit --interactive" that no band exists  */
    on("session.start", async ($, e, next) => {
        if (e.isInteractive && e.surface === "terminal")
            await $.tool.register(TOOL)
        return next(e)
    })

    /*  serve the tool of the task band, which needs no permission, as it just
        shows a task, and whose loading of the task is as harmless  */
    on("tool.check", { tool: "mcp__ase__ase_task_band" }, () => ({ decision: "allow" }))
    on("tool.call", { tool: "mcp__ase__ase_task_band" }, async ($, e) => ({
        result: await task.open(String(e.id), String(e.sections ?? ""), {
            invalidate: () => $.ui.invalidate("ui.render"),
            every:      (ms, fn) => $.clock.every(ms, fn),
            load:       async (id) => (await $.tool.call({ tool: "mcp__plugin_ase_ase__ase_task_load",
                id, variant: "source", tag: true })).text ?? ""
        })
    }))

    /*  the bands above the prompt (the synopsis form, the intent band, and the
        manpage browser, opened in this order), the shown one (as at most one is
        shown at a time), and closing all of them resp. the shown one on a failure
        (determining the prompt to restore)  */
    const bands: Band[] = [ skill, intent, browse ]
    const shown         = () => bands.find((band) => band.active())
    const reset         = () => bands.forEach((band) => band.reset())
    const cancel        = () => shown()?.cancel()

    /*  the generation of the latest submission (ending any older refilling of the prompt)  */
    let submissions = 0

    /*  the partial slash command inside the prompt, and the poller of the prompt
        for the hint band while one is typed (as a completion of the typeahead
        raises no edit)  */
    const partial = /^\/\S*$/
    let poller: Timer | undefined

    /*  handle the still unsubmitted prompt of the user: while the intent band,
        the synopsis form, or the manpage browser is shown, every edit is a key of
        it, else act on the typed trigger suffix at the end of the prompt only
        (toggling the manual band for a skill command with "//", resp. showing the
        synopsis form for a skill command with a manual page with "!!", else arming
        the matching of the prompt as an intent with "!!", resp. showing the manpage
        browser for any other prompt with "//"), close the manual band once the
        prompt left its skill command or another band opened, track the skill
        command of the hint band, and track the picks of the grill table inside
        the edited prompt while no band is shown  */
    on("prompt.edit", async ($, e, next) => {
        const band  = shown()
        const paged = manual.active()
        const read  = (file: string) => $.fs.read(`${$.plugin.root}/${file}`)
        const dirs  = async (dir: string) => (await $.fs.list(`${$.plugin.root}/${dir}`))
            .filter((entry) => entry.kind === "dir" || entry.isLink).map((entry) => entry.name)
        const open  = async (box: PromptBox) =>
            await manual.toggle(box, { read }) ?? await skill.open(box, { read }) ?? intent.open(box, {
                read,
                invalidate: () => $.ui.invalidate("ui.render"),
                fork:       (prompt) => $.model.fork({ prompt }),
                complete:   (request) => $.model.complete(request),
                sleep:      (ms) => $.clock.sleep(ms)
            }) ?? await browse.open(box, { read, dirs }) ?? box
        let box: PromptBox
        if (band !== undefined) {
            const result = band.edit(e)
            box = typeof result !== "string" ? result :
                await next({ ...e, text: result, cursor: result.length, start: result.length, end: result.length })

            /*  switch over from a closed band to another one by the trigger it left in the prompt  */
            if (shown() === undefined && TRIGGER.test(box.text))
                box = await open(box)
        }
        else {
            box = await next(e)
            if (/[!/]$/.test(e.inputText) && box.cursor === box.text.length && TRIGGER.test(box.text))
                box = await open(box)
        }
        manual.track(box.text)
        if (shown() !== undefined)
            manual.reset()
        const hinted = await hint.track(box.text, { read })
        if (poller === undefined && partial.test(box.text)) {
            const stop  = () => {
                timer.cancel()
                poller = undefined
            }
            const timer = $.clock.every(100, () => {
                $.prompt.read().then(async ({ text }) => {
                    if (!partial.test(text))
                        stop()
                    if (shown() === undefined && await hint.track(text, { read }))
                        $.ui.invalidate("ui.render")
                }).catch(stop)
            })
            poller = timer
        }
        if (shown() !== undefined || grill.track(box.text) || band !== undefined || paged || manual.active() || hinted)
            $.ui.invalidate("ui.render")
        return box
    }).catch(($, e, next) => {
        /*  close a failed intent band resp. synopsis form and restore the prompt
            resp. the command as typed (instead of the held prompt), else let the
            edit pass  */
        const text = cancel()
        $.ui.invalidate("ui.render")
        return text !== undefined ? { text, cursor: text.length } : next(e)
    })

    /*  operate the synopsis form resp. the intent band, else scroll the manual
        page, else the task, in the band, by the wheel, and never let the engine
        move the window over our (overflowing) band, even while it takes no scrolling  */
    on("ui.scroll", { component: "AbovePrompt" }, ($, e, next) => {
        if (!bands.some((band) => band.scroll(e)) && !manual.scroll(e) && !task.scroll(e))
            return shown() === undefined && !manual.active() ? next(e) : {}
        $.ui.invalidate("ui.render")
        return {}
    }).catch(($, e, next) =>
        /*  let a failed scrolling of the synopsis form, the intent band, resp. the manual page pass  */
        next(e))

    /*  operate the intent band and the synopsis form by RETURN, resp. freeze the
        picks in the latest table and close the intent band and the synopsis form
        once the prompt is submitted  */
    on("prompt.submit", ($, e, next) => {
        /*  while the intent band or the synopsis form is shown, RETURN at the prompt
            (which usually arrives as an edit of the held prompt instead, so this is
            the fallback only) is a key of it, entering nothing and refilling the
            prompt (immediately, and again whenever the submission cleared it or
            restored the submitted prompt, as a duplicate of or next to the refilled
            one, within a grace period)  */
        const band = shown()
        if (band !== undefined && e.origin.kind === "composer") {
            const text = band.submit()
            const generation = ++submissions
            $.ui.invalidate("ui.render")
            const fill = async () => {
                const box = await $.prompt.fill({ text })
                if (shown() === undefined) {
                    grill.refresh(box.text)
                    $.ui.invalidate("ui.render")
                }
            }
            const refill = async () => {
                await fill()
                const prompt    = text.trim()
                const submitted = e.text.trim()
                for (const ms of [ 25, 50, 100, 200, 400 ]) {
                    await $.clock.sleep(ms)
                    const box = (await $.prompt.read()).text
                    if (generation !== submissions)
                        return
                    if (box === "" || box.indexOf(prompt) !== box.lastIndexOf(prompt)
                        || (submitted !== prompt && box.includes(submitted)))
                        await fill()
                }
            }
            refill().catch(() => {
                /*  ignore a prompt which is no longer accessible  */
            })
            return { text: e.text }
        }

        /*  let any other submission (like a task notification) pass while the
            intent band or the synopsis form is shown, as it leaves the held
            prompt in place  */
        if (band !== undefined)
            return next(e)

        submissions++
        grill.submit(e.text)
        reset()
        manual.reset()
        hint.reset()
        task.submit(e.text)
        $.ui.invalidate("ui.render")
        return next(e)
    }).catch(($, e, next) =>
        /*  never let a failed RETURN of the intent band or synopsis form enter the prompt  */
        next.called || shown() === undefined ? next(e) :
            { drop: "intent band or synopsis form failed" })

    /*  redraw the replies which contain a grilling table or a decision matrix
        (terminal only), where the chain beneath runs, although its drawing is
        replaced by us (but this at least silences a warning in the debug output
        of Claude Code)  */
    on("ui.render", { component: "AssistantMessage", surface: "terminal" }, async ($, e, next) => {
        const drawn      = await next(e)
        const ui         = $.ui.resolve(e)
        const invalidate = () => $.ui.invalidate("ui.render")
        return grill.render(e, ui, {
            invalidate,
            prompt:     () => $.prompt.read(),
            fill:       (text) => $.prompt.fill({ text })
        }) ?? evaluate.render(e, ui, { invalidate }) ?? drawn
    })

    /*  draw the intent band resp. the synopsis form, else the manual page, else
        the task, else the argument hint, into the band above the prompt (terminal only)  */
    on("ui.render", { component: "AbovePrompt", surface: "terminal" }, async ($, e, next) => {
        const drawn = await next(e)
        const ui    = $.ui.resolve(e)
        return shown()?.render(e, ui) ?? manual.render(e, ui) ?? task.render(e, ui) ?? hint.render(e, ui) ?? drawn
    }).catch(($, e, next) => {
        /*  close a failed intent band resp. synopsis form, restore the prompt
            resp. the command as typed (instead of the held prompt), resp. close
            a failed manual band, task band, and hint band, and keep the drawing beneath  */
        const text = cancel()
        if (text === undefined) {
            manual.reset()
            task.reset()
            hint.reset()
        }
        if (text !== undefined)
            $.prompt.fill({ text }).catch(() => {
                /*  ignore a prompt which is no longer accessible  */
            })
        return next(e)
    })

    /*  drop the one-line (and hence usually truncated) argument hint of the
        skills from the typeahead and "/help", as the hint band shows it entirely  */
    on("command.describe", async ($, e, next) => {
        const result  = await next(e)
        const command = /^(?:ase:)?(ase-[a-z0-9]+-[a-z0-9]+)$/.exec(e.command)
        const read    = (file: string) => $.fs.read(`${$.plugin.root}/${file}`)
        if (command === null || await hint.synopsis(command[1]!, { read }) === undefined)
            return result
        return { description: result.description, isHidden: result.isHidden }
    })
}

