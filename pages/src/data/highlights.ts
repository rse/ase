/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
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
        eyebrow: "Token and Time Optimization",
        title:   "Switch persona to cut down tokens and reading time",
        body:    "To reduce your overall output tokens and necessary reading time, " +
                 "switch the communication style of the LLM across five built-in intensity levels: " +
                 "from the decorative, eloquent, and explaining <b>writer</b>, " +
                 "the concise, factual, and accurate <b>engineer</b> (default), " +
                 "the layered, pyramid-structured <b>journalist</b>, " +
                 "through the brief, factual, and abbreviating <b>telegrapher</b>, " +
                 "down to the terse, rough, and stuttering <b>caveman</b>.",
        skill:   "/ase-meta-persona engineer",
        video:   "ase-meta-persona"
    },
    {
        eyebrow: "Parametrized Brainstorming",
        title:   "Diverge, cluster, and shortlist new ideas",
        body:    "Turn a fuzzy topic into a focused shortlist: first diverge into a " +
                 "broad set of ideas, then converge by clustering and scoring them, and finally " +
                 "distill a ranked shortlist with a recommended direction to pursue.",
        skill:   "/ase-meta-brainstorm --max-clarify=0 --min-ideas=20 clever and useful AI skills for software engineering",
        video:   "ase-meta-brainstorm"
    },
    {
        eyebrow: "Root-Cause Analysis",
        title:   "Trace root cause with Five-Whys method",
        body:    "Drill past symptoms to the real cause: the Five-Whys method iteratively asks " +
                 "\"why?\" to trace a problem or claim back to its root, optionally branching into " +
                 "multiple causal paths to widen the investigation.",
        skill:   "/ase-meta-why --width=2 is the Decibel (dB) unit a logarithmic one?",
        video:   "ase-meta-why"
    },
    {
        eyebrow: "Component Discovery",
        title:   "Discover the right components for your technology stack",
        body:    "Get methodical support in finding suitable libraries and frameworks to " +
                 "establish or extend your technology stack — grounded, not guessed, " +
                 "by taking into account the downloads per time, age of component, " +
                 "last update time, and GitHub stars.",
        skill:   "/ase-arch-discover command-line option and argument parsing library",
        video:   "ase-arch-discover"
    },
    {
        eyebrow: "Multi-Criteria Decisions",
        title:   "Evaluate alternatives with a multi-criteria decision matrix",
        body:    "Compare alternatives the rigorous way: a weighted multi-criteria decision matrix " +
                 "turns a fuzzy \"which is best?\" question into a transparent, defensible verdict.",
        skill:   "/ase-meta-evaluate Commander vs. Yargs vs. Optique, " +
                 "focus on popularity, features, ease of use, and TypeScript support",
        video:   "ase-meta-evaluate"
    },
    {
        eyebrow: "Play Advocatus Diaboli",
        title:   "Challenge your decision with an Advocatus Diaboli",
        body:    "Know the antitheses to your decision before others bring them up. " +
                 "Let the decision be challenged by a relentless Advocatus Diaboli " +
                 "and even get a resulting synthesis based on Dialectical Reasoning.",
        skill:   "/ase-meta-diaboli --count=10 We should migrate the ASE project from TypeScript to Rust",
        video:   "ase-meta-diaboli"
    },
    {
        eyebrow: "Play Steelman",
        title:   "Strengthen your decision with a Steelman",
        body:    "Further improve the strength of your decision before others challenge it. " +
                 "Let the decision be fortified by a helpful Steelman into a " +
                 "stronger position that consolidates everything that genuinely strengthens it " +
                 "while honestly bounding where it holds.",
        skill:   "/ase-meta-steelman --count=10 ASE is a useful Claude Code plugin",
        video:   "ase-meta-steelman"
    },
    {
        eyebrow: "Document Distillation",
        title:   "Distill a document down to its ranked key points",
        body:    "Cut a long document down to its essence: distill it into a flat, " +
                 "importance-ranked list of key points, each with a salience rank, a rationale, " +
                 "and a verbatim, line-cited evidence snippet.",
        skill:   "/ase-docs-distill --top=3 @plugin/meta/ase-format-spec.md",
        video:   "ase-docs-distill"
    },
    {
        eyebrow: "Document Proofreading",
        title:   "Analyze documents for spelling, punctuation, and grammar",
        body:    "Scan your documents for problems in spelling, punctuation, and grammar. " +
                 "Optionally, let the documents be automatically corrected.",
        skill:   "/ase-docs-proofread --auto @README.md",
        video:   "ase-docs-proofread"
    },
    {
        eyebrow: "Logical Code Analysis",
        title:   "Analyze code for logic and control-flow defects",
        body:    "Scan your source code for problems in its logic, semantics, and control flow, with " +
                 "evidence-grounded, line-cited findings instead of vague hand-waving.",
        skill:   "/ase-code-analyze --severity=MEDIUM @tool/src/",
        video:   "ase-code-analyze"
    },
    {
        eyebrow: "Alternative Approach Funnel",
        title:   "Craft through a funnel of approaches",
        body:    "Plan-driven, but not too direct and hence with enough preliminary consideration: " +
                 "<b>ASE</b> first proposes a \"funnel\" of crafting alternative approaches, " +
                 "lets you pick a suitable one, and only then composes a structured task plan.",
        skill:   "/ase-code-craft --next IMPLEMENT,DELETE hello: \"ase hello\" CLI command which " +
                 "prints a nice \"Hello World!\" in blue to the terminal",
        video:   "ase-code-craft"
    },
    {
        eyebrow: "Named and Persisted Plans",
        title:   "Implement against named, persisted, structured task plans",
        body:    "Use named, persisted, structured, and cross-session task plans in a strict, fixed format — then " +
                 "implement them as a complete, surgical change set you stay in control of.",
        skill:   "/ase-task-implement hello",
        video:   "ase-task-implement"
    },
    {
        eyebrow: "Automatic ChangeLog",
        title:   "Auto-generate ChangeLog entries from Git",
        body:    "Keep your <code>CHANGELOG.md</code> file current without the chore: derive concise, " +
                 "human-readable changelog entries straight from your Git history and " +
                 "fold them into the existing file under the right version and category.",
        skill:   "/ase-meta-changelog",
        video:   "ase-meta-changelog"
    }
]

/*  base URL of the published `ase-media` recordings.  */
export const mediaBase = "https://rse.github.io/ase-media"

