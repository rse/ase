/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under GPL 3.0 <https://spdx.org/licenses/GPL-3.0-only>
*/

/*  curated Unique-Selling-Point (USP) highlights

    Each entry pairs one USP (distilled from the project `README.md`) with one
    demo recording from the `ase-media` repository, which is published to
    GitHub Pages at https://rse.github.io/ase-media/ as `<video>.mp4` (with a
    `<video>.jpg` poster). Only the ~6 strongest USP+video pairs are surfaced
    here to keep the front page tight and punchy.

    The `index.astro` page alternates the USP/video column order per row, so
    the order below is also the visual top-to-bottom order on the page.  */

export type Highlights = {
    eyebrow: string  /*  short, signal-coloured eyebrow above the heading   */
    title:   string  /*  the headline of the USP                            */
    body:    string  /*  one- to two-sentence elaboration                   */
    skill:   string  /*  the ASE skill the USP showcases                    */
    video:   string  /*  the `ase-media` recording base name (without ext)  */
}

export const highlights: Highlights[] = [
    {
        eyebrow: "Alternative Approach Funnel",
        title:   "Craft features through a funnel of approaches",
        body:    "Plan-driven, but not too direct: ASE first proposes a funnel of alternative " +
                 "approaches, lets you pick one, and only then composes a structured task plan.",
        skill:   "/ase-code-craft",
        video:   "ase-code-craft"
    },
    {
        eyebrow: "Named & Persisted Plans",
        title:   "Implement against persisted, structured plans",
        body:    "Named, persisted, cross-session task plans in a strict, fixed format — then " +
                 "implemented as a complete, surgical change set you stay in control of.",
        skill:   "/ase-task-implement",
        video:   "ase-task-implement"
    },
    {
        eyebrow: "Package Discovery",
        title:   "Discover the right packages for your stack",
        body:    "Get methodical support in finding suitable libraries and frameworks to " +
                 "establish or extend your technology stack — grounded, not guessed.",
        skill:   "/ase-arch-discover",
        video:   "ase-arch-discover"
    },
    {
        eyebrow: "Logical Code Analysis",
        title:   "Analyze code for logic & control-flow defects",
        body:    "Scan source code for problems in its logic, semantics, and control flow, with " +
                 "evidence-grounded, line-cited findings instead of vague hand-waving.",
        skill:   "/ase-code-analyze",
        video:   "ase-code-analyze"
    },
    {
        eyebrow: "Multi-Criteria Decisions",
        title:   "Evaluate alternatives with a decision matrix",
        body:    "Compare options the rigorous way: a weighted multi-criteria decision matrix " +
                 "turns a fuzzy “which is best?” into a transparent, defensible verdict.",
        skill:   "/ase-meta-evaluate",
        video:   "ase-meta-evaluate"
    },
    {
        eyebrow: "Boosted Sessions",
        title:   "Tune the persona to cut tokens & cost",
        body:    "Switch communication style across four intensity levels — from eloquent " +
                 "writer down to terse caveman — to speed up sessions and reduce output tokens.",
        skill:   "/ase-meta-persona",
        video:   "ase-meta-persona"
    }
]

/*  base URL of the published `ase-media` recordings.  */
export const mediaBase = "https://rse.github.io/ase-media"

