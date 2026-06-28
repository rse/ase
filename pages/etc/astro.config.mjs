/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

import { defineConfig } from "astro/config"
import sitemap          from "@astrojs/sitemap"
import tailwindcss      from "@tailwindcss/vite"
import fs               from "node:fs"
import path             from "node:path"
import { fileURLToPath } from "node:url"
import { createRequire }  from "node:module"

/*  reduce a built `_astro/` filename to a short, stable, lower-case base with
    no Astro virtual-module markers or Vite content hash  */
function deHash (file) {
    const ext  = path.extname(file)
    let   base = file.slice(0, -ext.length)
    base = base.replace(/\.astro_astro_type_script.*$/, "")  /*  Astro component-script suffix  */
    base = base.replace(/@_@astro$/, "")                     /*  Astro virtual-module marker     */
    base = base.replace(/\.[A-Za-z0-9_-]{8,}$/, "")          /*  trailing Vite content hash      */
    return base.toLowerCase() + ext
}

/*  post-build integration: rename every hashed file under dst/_astro/ to its
    de-hashed name and rewrite all references to it across the emitted text
    files (HTML/CSS/JS/maps). Runs once, after Astro has finished writing the
    output, so it uniformly covers both the page CSS and the client islands
    (component scripts + their imported CSS) that Astro hashes itself.  */
function deHashAssets () {
    return {
        name: "de-hash-assets",
        hooks: {
            "astro:build:done": ({ dir }) => {
                const root      = new URL(dir).pathname
                const assetsDir = path.join(root, "_astro")
                if (!fs.existsSync(assetsDir)) return

                /*  build old->new map for every hashed asset (stylesheets,
                    scripts, source maps, fonts, images), skipping renames that
                    would collide. References are rewritten by bare filename, so
                    both "/_astro/<file>" links and bare url(<file>) refs inside
                    CSS are covered.  */
                const renames = {}
                const taken   = new Set(fs.readdirSync(assetsDir))
                for (const file of fs.readdirSync(assetsDir)) {
                    if (!/\.(css|js|map|woff2?|ttf|otf|eot|svg|png|jpe?g|webp|avif|gif)$/i.test(file)) continue
                    const next = deHash(file)
                    if (next === file || taken.has(next)) continue
                    renames[file] = next
                    taken.add(next)
                    fs.renameSync(path.join(assetsDir, file), path.join(assetsDir, next))
                }
                if (!Object.keys(renames).length) return

                /*  rewrite references across all emitted text files.  */
                const rewrite = (d) => {
                    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
                        const p = path.join(d, entry.name)
                        if (entry.isDirectory()) { rewrite(p); continue }
                        if (!/\.(html|css|js|map|xml)$/.test(entry.name)) continue
                        let text = fs.readFileSync(p, "utf8")
                        let changed = false
                        for (const [ from, to ] of Object.entries(renames))
                            if (text.includes(from)) { text = text.split(from).join(to); changed = true }
                        if (changed) fs.writeFileSync(p, text)
                    }
                }
                rewrite(root)
            }
        }
    }
}

/*  vendor the Plyr control-icon sprite into `public/assets/` at build time so
    the player loads it locally instead of from `cdn.plyr.io`. Resolving via the
    package keeps the sprite version-locked to the installed `plyr`; the copied
    file is git-ignored. Runs for both `astro dev` and `astro build`, since this
    config module is evaluated by both.  */
function vendorPlyrSprite () {
    const require = createRequire(import.meta.url)
    const distDir = path.dirname(require.resolve("plyr"))
    const src     = path.join(distDir, "plyr.svg")
    const dst     = fileURLToPath(new URL("../public/assets/plyr.svg", import.meta.url))
    fs.mkdirSync(path.dirname(dst), { recursive: true })
    fs.copyFileSync(src, dst)
}
vendorPlyrSprite()

export default defineConfig({
    output: "static",
    outDir: "dst",
    site:   process.env.SITE_URL ?? "https://ase.tools",
    build: {
        inlineStylesheets: "never"
    },
    integrations: [
        sitemap(),
        deHashAssets()
    ],
    vite: {
        plugins: [ tailwindcss() ]
    }
})

