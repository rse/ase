/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under GPL 3.0 <https://spdx.org/licenses/GPL-3.0-only>
*/

/*  central site configuration for the ASE website.
    Mirrors the spirit of Astro Rocket's `site.config.ts`, trimmed to the
    handful of values a single static landing page actually needs.  */
export const site = {
    name:        "ASE",
    title:       "Agentic Software Engineering (ASE)",
    tagline:     "Agentic Software Engineering",
    description: "The opinionated companion tooling of Dr. Ralf S. Engelschall for combining " +
                 "Agentic AI Coding with Software Engineering in tools like Claude Code.",
    url:         "https://ase.tools",
    author:      "Dr. Ralf S. Engelschall",
    email:       "rse@engelschall.com",
    repo:        "https://github.com/rse/ase",

    /*  steel-blue signal color, used for the browser toolbar tint on mobile.
        Kept in sync with the `--brand-*` scale in `styles/theme.css`.  */
    themeColor:  "#336699"
} as const

