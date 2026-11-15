/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

/*  the Unique-Selling-Point (USP) entries opening the "Highlights" page

    Each entry pairs one core USP of ASE with the commands showcasing it and
    with one or more screenshots of the result. The screenshots live as
    `public/assets/usp-*.png` and are laid out by `Widget-USP-Row.astro` in a grid of
    `cols` columns, so `cols: 2` with four screenshots yields a 2x2 matrix
    (filled row by row), while a `wide` screenshot spans a whole row
    on its own. A screenshot not yet present is rendered as a
    placeholder naming the expected file, so the section can go in before
    all of its screenshots are taken.

    Where the showcased skill has an icon elsewhere on the page -- in the
    methodology strip, the workflows, or the sneak previews -- the very same
    icon is reused, so one skill reads as one symbol throughout.  */

import type { AstroComponent } from "@lucide/astro"
import MessageCircleQuestion   from "@lucide/astro/icons/message-circle-question-mark"
import SquareKanban            from "@lucide/astro/icons/square-kanban"
import Bot                     from "@lucide/astro/icons/bot"
import BookCheck               from "@lucide/astro/icons/book-check"
import Microscope              from "@lucide/astro/icons/microscope"
import VenetianMask            from "@lucide/astro/icons/venetian-mask"

export type Shot = {
    src:   string   /*  the screenshot path below `public/`              */
    label: string   /*  the caption and alternative text of the shot     */
    wide?: boolean  /*  whether the shot spans all columns of the grid   */
}

export type USP = {
    id:       string          /*  the anchor id of the sub-section                 */
    icon:     AstroComponent  /*  the Lucide icon prefixing the headline           */
    eyebrow:  string          /*  short, signal-colored eyebrow above the heading  */
    title:    string          /*  the headline of the USP                          */
    body:     string[]        /*  the elaboration, one string per paragraph        */
    prefix:   string          /*  the title-bar prefix of the terminal box         */
    commands: string[]        /*  the showcased commands, in Terminal markup       */
    cols:     1 | 2           /*  the number of columns of the screenshot grid     */
    shots:    Shot[]          /*  the screenshots, filled row by row               */
}

export const usps: USP[] = [
    {
        id:       "usp-grilling",
        icon:     MessageCircleQuestion,
        eyebrow:  "Grilling Yourself",
        title:    "Get relentlessly grilled before the first line changes",
        body:     [
            "Let the agent interview <i>you</i> instead of guessing: round by round, it stress-tests " +
            "your query or task plan with prioritized <b>MUST</b>, <b>SHOULD</b>, and <b>MAY</b> " +
            "questions, each with recommended answers, until the decision tree is resolved and " +
            "the result really meets your intention. This way you have to perform fewer post-adjustments " +
            "to your code base, because the interpretation of the LLM is minimized."
        ],
        prefix:   "Claude Code",
        commands: [
            "**/ase-code-edit** **--grill** new \"ase hello\" CLI command which prints \"Hello World!\\n\" in red to the terminal"
        ],
        cols:     1,
        shots: [
            { src: "/assets/usp-grill.png", label: "Grilling a query with /ase-code-edit --grill" }
        ]
    },
    {
        id:       "usp-task-board",
        icon:     SquareKanban,
        eyebrow:  "SDD with User-Stories",
        title:    "Manage user-story tasks on a live task board",
        body:     [
            "Leverage a Spec-Driven Development (SDD) approach variant where you are using small, persisted user-story tasks, which " +
            "flow through the lanes of a task lifecycle model. Follow them live on the integrated task board, " +
            "identically rendered both in the terminal and in the browser, either as Kanban-style <b>lanes</b> or as the dependency " +
            "<b>graph</b> of the tasks. Additionally, get insights into your projects through the task <b>statistics</b> view, " +
            "which includes task state distribution, task progress, AI/HR usage tracking, efficiency metrics, and many more."
        ],
        prefix:   "Shell",
        commands: [
            "**ase task board** **--web**",
            "**ase task board**"
        ],
        cols:     2,
        shots: [
            { src: "/assets/usp-task-board-wui-1.png", label: "Web task board: lanes view"      },
            { src: "/assets/usp-task-board-tui-1.png", label: "Terminal task board: lanes view" },
            { src: "/assets/usp-task-board-wui-2.png", label: "Web task board: graph view"      },
            { src: "/assets/usp-task-board-tui-2.png", label: "Terminal task board: graph view" },
            { src: "/assets/usp-task-board-wui-3.png", label: "Web task board: stats view"      },
            { src: "/assets/usp-task-board-tui-3.png", label: "Terminal task board: stats view" }
        ]
    },
    {
        id:       "usp-agents",
        icon:     Bot,
        eyebrow:  "Autonomous Agents",
        title:    "Run an agentic development pipeline",
        body:     [
            "Let a fleet of autonomous agents drive the tasks of the <b>enterprise</b> lifecycle model headless " +
            "from the planned to the integrated state, each one running in its own process: the <b>implementer</b> " +
            "implements the planned tasks into their change sets, the <b>qualifier</b> reviews and judges them, " +
            "and the <b>integrator</b> lands them into their targets. Meanwhile, the <b>researcher</b>, <b>rebooter</b>, " +
            "<b>condenser</b>, <b>griller</b>, <b>estimator</b>, and <b>editor</b> agents support you in planning the tasks. " +
            "Supervise this agentic development pipeline live on the task board, through the agent <b>graph</b> " +
            "along the task lifecycle model and the agent <b>logs</b> of their operations."
        ],
        prefix:   "Shell",
        commands: [
            "**ase agent fleet init**",
            "**ase agent fleet start**",
            "**ase task board** **--web**",
            "**ase task board**"
        ],
        cols:     2,
        shots: [
            { src: "/assets/usp-task-board-wui-4.png", label: "Web task board: agent graph view"      },
            { src: "/assets/usp-task-board-tui-4.png", label: "Terminal task board: agent graph view" },
            { src: "/assets/usp-task-board-wui-5.png", label: "Web task board: agent logs view"       },
            { src: "/assets/usp-task-board-tui-5.png", label: "Terminal task board: agent logs view"  }
        ]
    },
    {
        id:       "usp-specbook",
        icon:     BookCheck,
        eyebrow:  "SDD with Specifications",
        title:    "Model a strictly structured specification in Markdown",
        body:     [
            "Leverage a Spec-Driven Development (SDD) approach variant where you use a large-scale, strictly structured, " +
            "coherent, and binding specification document, written as Markdown files and governed by a " +
            "typed <a href=\"https://specbook.tools/\">SpecBook</a> schema. Lint it, reconcile code and " +
            "documentation against it, and export it into a polished HTML rendering in both " +
            "light and dark theme, or into a paginated PDF document."
        ],
        prefix:   "Claude Code",
        commands: [
            "**/ase-spec-edit** **--grill** add a field \"fooBar\" to the entity Quux in the data model",
            "**/ase-sync-reconcile** **--source** SPEC **--target** CODE,DOCS data model",
            "**/ase-sync-export**"
        ],
        cols:     2,
        shots: [
            { src: "/assets/usp-specbook-1.png", label: "SpecBook schema: typed YAML configuration"           },
            { src: "/assets/usp-specbook-2.png", label: "SpecBook source: plain Markdown"                     },
            { src: "/assets/usp-specbook-3.png", label: "SpecBook export: HTML in light/dark theme", wide: true }
        ]
    },
    {
        id:       "usp-methodology",
        icon:     Microscope,
        eyebrow:  "Methodology Built-In",
        title:    "Decide grounded instead of guessed",
        body:     [
            "Every skill folds an established Software Engineering method into its workflow. " +
            "For instance, first discover candidate components by their real-world adoption " +
            "signals and a resulting ranking which optionally can take staleness and dependencies " +
            "into account. Second, settle your choice through a transparent, weighted " +
            "multi-criteria decision matrix where you can optionally control the particularly used criteria.",
            "Beyond that, trace root causes with the Five-Whys technique, stress-test a thesis as " +
            "Devil's Advocate or strengthen it as Steelman, and brainstorm by diverging, clustering, " +
            "and scoring ideas. Estimate efforts as T-shirt sizes calibrated against the actual time " +
            "of finished tasks, or let a quorum of foreign AIs cross-check an answer with a consensus " +
            "rating. This way, your decisions rest on traceable evidence and reproducible reasoning " +
            "instead of the gut feeling of a single prompt."
        ],
        prefix:   "Claude Code",
        commands: [
            "**/ase-arch-discover** command-line option and argument parsing library",
            "**/ase-meta-evaluate** Commander vs. Yargs vs. Optique"
        ],
        cols:     1,
        shots: [
            { src: "/assets/usp-grounding-1.png", label: "Component discovery with /ase-arch-discover" },
            { src: "/assets/usp-grounding-2.png", label: "Decision matrix with /ase-meta-evaluate"     }
        ]
    },
    {
        id:       "usp-personas",
        icon:     VenetianMask,
        eyebrow:  "Personas",
        title:    "Pick the communication style you want to read",
        body:     [
            "Switch the persona of the agent to trade eloquence for brevity: from the explaining " +
            "<b>writer</b>, through the factual <b>engineer</b> (default) and the brief " +
            "<b>telegrapher</b>, down to the terse <b>caveman</b> — same work, fewer output " +
            "tokens, and less reading time. Whatever the persona, technical terms, quoted errors, " +
            "and code blocks always stay exactly as they are, so brevity never costs precision. " +
            "And as the persona is a regular key of the layered configuration, set it once for " +
            "yourself, per project, per task, or just for the current session."
        ],
        prefix:   "Claude Code",
        commands: [
            "**/ase-meta-config** --scope user set agent.persona telegrapher"
        ],
        cols:     2,
        shots: [
            { src: "/assets/usp-persona-1.png", label: "Persona writer"      },
            { src: "/assets/usp-persona-2.png", label: "Persona engineer"    },
            { src: "/assets/usp-persona-3.png", label: "Persona telegrapher" },
            { src: "/assets/usp-persona-4.png", label: "Persona caveman"     }
        ]
    }
]

