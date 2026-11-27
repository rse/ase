/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import path              from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig }  from "vite"
import VuePlugin         from "@vitejs/plugin-vue"

/*  the base directory of the tool package  */
const basedir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

/*  build the browser client of the web board (Vue, Stylus) into
    "dst/ase-task-board-web-client.{html,js,css}", and the lazily loaded chunk of the
    terminal emulator of the task chat, served under "/task-board/"  */
export default defineConfig({
    root:      path.join(basedir, "src"),
    base:      "/task-board/",
    logLevel:  "warn",
    plugins:   [ VuePlugin() ],
    build: {
        outDir:        path.join(basedir, "dst"),
        emptyOutDir:   false,
        assetsDir:     "",
        sourcemap:     false,

        /*  inline the fonts as data: URIs, as the service serves the built client files only  */
        assetsInlineLimit: (file: string) => file.endsWith(".woff2") ? true : undefined,
        target:        "esnext",
        cssTarget:     "esnext",
        chunkSizeWarningLimit: 1000,
        rollupOptions: {
            input: path.join(basedir, "src", "ase-task-board-web-client.html"),
            output: {
                entryFileNames: "ase-task-board-web-client.js",
                chunkFileNames: "ase-task-board-web-client-[name].js",
                assetFileNames: "ase-task-board-web-client.[ext]"
            }
        }
    }
})

