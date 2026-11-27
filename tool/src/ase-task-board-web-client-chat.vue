<!--
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
-->

<!--  the chat about a task: the terminal emulator attached to the chat kept running by the ASE
      service, which takes all keys while it has the focus, with a note on its start, end, or failure
      (a box over the emulator, as it is empty until the agent tool draws)  -->
<template>
    <div id="chat" @focusin="chatFocused = true" @focusout="chatFocused = false">
        <div ref="rootEl" class="cterm"></div>
        <div v-if="note !== null" class="cnote">{{ note }}</div>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue"
import { chatAttach, chatFocused } from "./ase-task-board-web-client-chat"

const props = defineProps<{ id: string }>()

/*  the element of the terminal emulator, the note, the detaching of the emulator, and
    whether the chat is hidden (resp. hidden before the emulator was attached)  */
const rootEl = ref<HTMLElement | null>(null)
const note   = ref<string | null>("starting agent tool…")
let   detach = null as (() => void) | null
let   hidden = false

onMounted(async () => {
    detach = await chatAttach(props.id, rootEl.value!, (text) => { note.value = text }, () => hidden)
})
onBeforeUnmount(() => {
    hidden = true
    chatFocused.value = false
    detach?.()
})
</script>
