/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

/*  shared skill catalog: the single source of truth for the grouping and
    ordering of all ASE skills. Both the catalog grid in `Section-Usage.astro`
    and the sidebar in `Modal-Help.astro` iterate this list, so the two stay
    perfectly in sync (DRY). The order and grouping mirror the original,
    hand-written catalog grid one-to-one.  */

export interface SkillGroup {
    label:  string
    skills: string[]
}

export const skillGroups: SkillGroup[] = [
    {
        label: "Standalone Mode 1/2",
        skills: [
            "ase-meta-persona",
            "ase-meta-why",
            "ase-meta-eli5",
            "ase-meta-proximity",
            "ase-meta-evaluate",
            "ase-meta-diaboli",
            "ase-meta-steelman",
            "ase-meta-quorum",
            "ase-meta-chat",
            "ase-meta-search",
            "ase-meta-brainstorm",
            "ase-meta-compat"
        ]
    },
    {
        label: "Standalone Mode 2/2",
        skills: [
            "ase-arch-discover",
            "ase-code-insight",
            "ase-code-explain",
            "ase-code-lint",
            "ase-docs-distill",
            "ase-docs-proofread",
            "ase-meta-review",
            "ase-meta-diff",
            "ase-meta-changelog",
            "ase-meta-commit"
        ]
    },
    {
        label: "Task Mode",
        skills: [
            "ase-task-id",
            "ase-task-edit",
            "ase-task-grill",
            "ase-task-reboot",
            "ase-task-preflight",
            "ase-task-implement",
            "ase-task-view",
            "ase-task-list",
            "ase-task-rename",
            "ase-task-condense",
            "ase-task-delete"
        ]
    },
    {
        label: "Funnel Mode",
        skills: [
            "ase-arch-analyze",
            "ase-code-analyze",
            "ase-code-craft",
            "ase-code-refactor",
            "ase-code-resolve"
        ]
    },
    {
        label: "Sync Mode",
        skills: [
            "ase-sync-reconcile",
            "ase-sync-import",
            "ase-sync-export"
        ]
    }
]
