/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

export type Comparison = {
    topic:    string  /*  the recurring Software Engineering work-step        */
    manually: string  /*  how it is done fully by hand, without any AI        */
    native:   string  /*  how it is done with a bare Agentic AI Coding tool   */
    ase:      string  /*  how it is done with the same tool boosted by ASE    */
}

export const comparison: Comparison[] = [
    {
        topic:    "Researching<br/>Topic",
        manually: "Hop between **Google**, **Wikipedia**, and **ChatGPT**, " +
                  "stitching the answers together yourself.",
        native:   "Fire the agent's `WebSearch` tool or lean on the LLM's " +
                  "**world knowledge** for a single take.",
        ase:      "Run `/ase-meta-search` or `/ase-meta-quorum` to poll **multiple** " +
                  "engines and AI services at once, auto-distilled into one consensus answer."
    },
    {
        topic:    "Finding<br/>Components",
        manually: "Search the Web, tally NPM downloads and GitHub stars by hand, " +
                  "then go with your gut.",
        native:   "Let the agent search, gather, and guess through " +
                  "an ad-hoc consolidation prompt.",
        ase:      "Run `/ase-arch-discover` to discover, rank, and report candidates " +
                  "via a strict, multi-criteria process."
    },
    {
        topic:    "Evaluating<br/>Alternatives",
        manually: "Open a dozen tabs, skim READMEs, and settle " +
                  "\"which is best?\" on gut and recency bias.",
        native:   "Ask the agent and get a confident single-shot pick " +
                  "with no defensible reasoning.",
        ase:      "Run `/ase-meta-evaluate` for a weighted decision matrix, plus " +
                  "`/ase-meta-steelman`, turning a fuzzy question into a defensible verdict."
    },
    {
        topic:    "Analyzing<br/>Problems",
        manually: "Browse the code and bisect with `console.log` " +
                  "until the bug surfaces.",
        native:   "Hand the agent your error messages and let it " +
                  "ad-hoc hunt down and patch the bug.",
        ase:      "Run `/ase-code-resolve` to investigate, decide an approach, " +
                  "plan a task, and resolve it end-to-end."
    },
    {
        topic:    "Crafting<br/>Code",
        manually: "Hand-edit every aspect of the new feature " +
                  "and hope it's right first time.",
        native:   "Tell the agent to \"craft this\" and get a plausible but " +
                  "unbounded change set to review after the fact.",
        ase:      "Run `/ase-code-craft` for a funnel- and plan-driven build, " +
                  "where the agent grills you to kill underspecified corners."
    },
    {
        topic:    "Refactoring<br/>Code",
        manually: "Hand-edit each call site, hope the tests catch the rest, " +
                  "and hold the whole blast radius in your head.",
        native:   "Tell the agent to \"refactor this\" and get a plausible but " +
                  "unbounded change set to review after the fact.",
        ase:      "Run `/ase-code-refactor` for a surgical, scoped change set, " +
                  "guided by refactoring tenets and an optional preflight you approve first."
    },
    {
        topic:    "Spec-Driven<br/>Development",
        manually: "**Up-front** write a **monolithic** spec in Word, then **manually** " +
                  "derive and implement User-Stories from the Backlog.",
        native:   "**Iteratively** write a **modular** spec in **ad-hoc** Markdown, " +
                  "**manually** derive Plans, and let Claude Code implement them.",
        ase:      "**Iteratively** write a modular spec in **strict**, **pre-defined** Markdown, " +
                  "then regularly run `/ase-sync-reconcile` to keep code and spec aligned."
    }
]

