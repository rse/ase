/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

/*  the task plan editor of the browser client of the web board (based on CodeMirror)  */
import { ref, nextTick }                                                           from "vue"
import { EditorView, keymap, drawSelection, ViewPlugin, Decoration, WidgetType }   from "@codemirror/view"
import { EditorState }                                                             from "@codemirror/state"
import { defaultKeymap, history, historyKeymap, indentWithTab }                    from "@codemirror/commands"
import { HighlightStyle, syntaxHighlighting }                                      from "@codemirror/language"
import { markdown }                                                                from "@codemirror/lang-markdown"
import { tags }                                                                    from "@lezer/highlight"
import { vim, Vim, getCM }                                                         from "@replit/codemirror-vim"
import { emacs, EmacsHandler }                                                     from "@replit/codemirror-emacs"
import {
    type Keymap,
    api, board, task, editing, notice, actionError, sel, tab, tabDocs,
    openTask, reopenTask, closeTask, onCloseTask, selectTab
} from "./ase-task-board-web-client-model"

/*  the element of the task plan editor (rendered by the task dialog), and its CodeMirror instance  */
export const editorEl = ref<HTMLElement | null>(null)
let editor = null as EditorView | null

/*  the block cursor of the task plan editor: the character under the cursor
    (or a space at the end of a line) rendered as a filled block, except in the
    normal and visual modes of the Vim key bindings, which draw their own block cursor  */
class BlockCursorEnd extends WidgetType {
    toDOM () {
        const span = document.createElement("span")
        span.className   = "cm-block-cursor"
        span.textContent = " "
        return span
    }
}
const blockCursor = ViewPlugin.fromClass(class {
    decorations = Decoration.none
    constructor (view: EditorView) {
        this.decorations = this.build(view)
    }
    update (update: { view: EditorView }) {
        this.decorations = this.build(update.view)
    }
    build (view: EditorView) {
        const vimState = getCM(view)?.state.vim as { insertMode?: boolean } | undefined
        if (vimState !== undefined && vimState.insertMode !== true)
            return Decoration.none
        const head = view.state.selection.main.head
        const line = view.state.doc.lineAt(head)
        if (head >= line.to)
            return Decoration.set([ Decoration.widget({ widget: new BlockCursorEnd(), side: 1 }).range(head) ])
        const char = String.fromCodePoint(line.text.codePointAt(head - line.from)!)
        return Decoration.set([ Decoration.mark({ class: "cm-block-cursor" }).range(head, head + char.length) ])
    }
}, { decorations: (plugin) => plugin.decorations })

/*  the syntax highlighting of the task plan editor, on the colors of the board  */
const editorHighlight = HighlightStyle.define([
    { tag: tags.heading,  color: "var(--c-accent)", fontWeight: "bold" },
    { tag: [ tags.monospace, tags.link, tags.url ], color: "var(--c-accent)" },
    { tag: [ tags.processingInstruction, tags.contentSeparator, tags.labelName, tags.comment ], color: "var(--c-mute)" },
    { tag: tags.quote,    color: "var(--c-text-soft)" },
    { tag: tags.emphasis, fontStyle: "italic" },
    { tag: tags.strong,   fontWeight: "bold" }
])

/*  the drafts of task plans which failed to save, kept per project and task
    in the browser (silently skipped if the browser storage is unavailable)  */
const draftKey = (id: string) => `ase-task-board:draft:${board.value?.project ?? ""}:${id}`
const draftGet = (id: string): string | null => {
    try {
        return localStorage.getItem(draftKey(id))
    }
    catch (_err: unknown) {
        return null
    }
}
const draftSet = (id: string, text: string | null) => {
    try {
        if (text === null)
            localStorage.removeItem(draftKey(id))
        else
            localStorage.setItem(draftKey(id), text)
    }
    catch (_err: unknown) {
        /*  no browser storage available  */
    }
}

/*  start editing the plan of the task of the dialog (on its task plan tab),
    offering to restore a draft of it which failed to save earlier, where an editor
    entered directly from the board also closes the dialog when left  */
export const startEdit = async (direct = false) => {
    if (task.value === null || editing.value !== null)
        return
    const id  = task.value.id
    const src = await api<{ text: string, base: string, keymap: Keymap }>(`/task-board/api/task/${encodeURIComponent(id)}/source`)
    if (task.value?.id !== id || editing.value !== null)
        return
    if (src.error !== undefined) {
        notice.value = { kind: "error", message: src.error }
        return
    }
    await selectTab(0)
    await openEditor(id, src.text, src.base, src.keymap, direct)
}

/*  start creating a new task in the task plan editor of a task dialog of its own,
    on its pre-filled text (with the empty id marking the creation)  */
export const startNew = async () => {
    if (task.value !== null || editing.value !== null)
        return
    const src = await api<{ text: string, keymap: Keymap }>("/task-board/api/new")
    if (task.value !== null || editing.value !== null)
        return
    if (src.error !== undefined) {
        actionError.value = src.error
        return
    }
    actionError.value = null
    tab.value     = 0
    tabDocs.value = {}
    task.value    = { id: "new", title: "New Task", tone: "idle", status: "", group: "", epic: "", doc: "", plan: { keys: [], body: "" }, tabs: [ "0 ▶ plan" ], pred: [], succ: [] }
    await openEditor("", src.text, "", src.keymap, true)
}

/*  open the task plan editor on a text, offering to restore a draft of it which failed to save earlier  */
const openEditor = async (id: string, text: string, base: string, keys: Keymap, direct: boolean) => {
    const draft   = draftGet(id)
    editing.value = { id, orig: text, base, keymap: keys, dirty: false, direct }
    notice.value  = draft !== null && draft !== text ? { kind: "draft", draft } : null
    await nextTick()
    editor = new EditorView({
        parent: editorEl.value!,
        state:  EditorState.create({
            doc: text,
            extensions: [
                /*  the optional Vim or Emacs key bindings, taking precedence over all others  */
                ...(keys === "vim" ? [ vim({ status: true }) ] : keys === "emacs" ? [ emacs() ] : []),
                history(), drawSelection(), EditorView.lineWrapping,
                keymap.of([ ...defaultKeymap, ...historyKeymap, indentWithTab ]),
                markdown(), syntaxHighlighting(editorHighlight), blockCursor,
                EditorView.updateListener.of((update) => {
                    if (update.docChanged && editing.value !== null)
                        editing.value.dirty = update.state.doc.toString() !== editing.value.orig
                })
            ]
        })
    })
    editor.focus()
}

/*  save the edited task plan, conditionally on the plan it is based on (or on the
    current plan to overwrite a conflicting change), and keep a draft if this fails  */
export const saveEdit = async (base?: string) => {
    const e = editing.value
    if (e === null || editor === null)
        return
    const text = editor.state.doc.toString()
    if (e.id === "") {
        await saveNew(e, text)
        return
    }
    const res  = await api<{ ok: boolean, id: string }>(`/task-board/api/task/${encodeURIComponent(e.id)}/source`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, base: base ?? e.base })
    })
    if (editing.value !== e)
        return
    if (res.error === undefined) {
        draftSet(e.id, null)
        stopEdit()
        if (res.id === e.id) {
            if (!e.direct)
                openTask(e.id)
        }
        else {
            /*  a renamed task is re-opened under its new id with the next board reload  */
            closeTask()
            reopenTask(e.direct ? null : res.id)
            sel.value = { ...sel.value, id: res.id }
        }
        return
    }
    draftSet(e.id, text)
    const conflict = res as { error: string, base?: string | null }
    notice.value = conflict.base !== undefined ?
        { kind: "conflict", message: conflict.error, base: conflict.base } :
        { kind: "error", message: `${conflict.error} (draft kept)` }
}

/*  save a new task under the id of the "Id:" key of its frontmatter (refused
    for an existing id), where an unchanged text creates no task, and keep a draft if this fails  */
const saveNew = async (e: NonNullable<typeof editing.value>, text: string) => {
    if (!e.dirty) {
        stopEdit()
        return
    }
    const fm = /^---\r?\n([\s\S]*?\r?\n)---\r?\n/.exec(text)
    const id = /^Id:[ \t]*(.*)$/m.exec(fm?.[1] ?? "")?.[1].trim() ?? ""
    const res = id === "" ? { error: "no task id in the \"Id:\" line" } :
        await api<{ ok: boolean }>(`/task-board/api/task/${encodeURIComponent(id)}/source`, {
            method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text })
        })
    if (editing.value !== e)
        return
    if (res.error === undefined) {
        draftSet("", null)
        stopEdit()
        sel.value = { ...sel.value, id }
        return
    }
    draftSet("", text)
    notice.value = { kind: "error", message: `${res.error} (draft kept)` }
}

/*  restore or drop the draft of the edited task plan  */
export const restoreDraft = () => {
    if (notice.value?.kind === "draft" && editor !== null)
        editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: notice.value.draft } })
    notice.value = null
    editor?.focus()
}
export const dropDraft = () => {
    if (editing.value !== null)
        draftSet(editing.value.id, null)
    notice.value = null
    editor?.focus()
}

/*  leave the editor, or the dialog (and with it the editor), after
    a confirmation if the edited task plan was changed  */
export const leaveEdit = (close: boolean) => {
    if (editing.value?.dirty === true)
        notice.value = { kind: "discard", close }
    else if (close)
        closeTask()
    else
        stopEdit()
}

/*  the save and cancel commands of the Vim key bindings (":w", ":wq", and ":x" save,
    ":q" cancels, ":q!" discards) and the Emacs key bindings ("C-x C-s" saves, "C-x C-c" cancels)  */
Vim.defineEx("write", "w", () => { saveEdit() })
Vim.defineEx("wq",    "wq", () => { saveEdit() })
Vim.defineEx("xit",   "x", () => { saveEdit() })
Vim.defineEx("quit",  "q", (_cm, params) => {
    if (params.argString?.trimStart().startsWith("!"))
        stopEdit()
    else
        leaveEdit(false)
})
EmacsHandler.bindKey("C-x C-s", () => {
    saveEdit()
    return true
})
EmacsHandler.bindKey("C-x C-c", () => {
    leaveEdit(false)
    return true
})

/*  stop editing the task plan, destroying its editor and dropping its notice  */
export const stopEdit = () => {
    const direct = editing.value?.direct === true
    editor?.destroy()
    editor        = null
    editing.value = null
    notice.value  = null

    /*  a new task, or a task edited directly from the board, has no task view to return to  */
    if (direct)
        closeTask()
}

/*  closing the task dialog also stops editing its task plan  */
onCloseTask(stopEdit)

/*  in the task plan editor, Ctrl/Cmd+S saves (only Cmd+S under the Emacs key bindings,
    where Ctrl+S searches) and, under the default key bindings, ESC cancels (or dismisses
    the discard confirmation), while all other keys belong to the editor  */
export const onEditorKey = (ev: KeyboardEvent, keymap: Keymap) => {
    const mod = keymap === "emacs" ? ev.metaKey : ev.ctrlKey || ev.metaKey
    if (mod && !ev.altKey && ev.key.toLowerCase() === "s") {
        ev.preventDefault()
        saveEdit()
    }
    else if (ev.key === "Escape" && keymap === "default") {
        if (notice.value?.kind === "discard") {
            notice.value = null
            editor?.focus()
        }
        else
            leaveEdit(false)
    }
}

