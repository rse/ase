/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

/*  shared skill catalog: the single source of truth for the grouping and
    ordering of all ASE skills. Both the catalog grid in `Section-Usage.astro`
    (which arranges the groups into its own column layout) and the sidebar in
    `Modal-Help.astro` are driven by the prefix groups derived from this
    list, so the two stay in sync (DRY).  */

export interface SkillGroup {
    label:  string
    skills: string[]
}

export const skillGroups: SkillGroup[] = [
    {
        label: "Standalone Mode 1/3",
        skills: [
            "ase-help-skill",
            "ase-help-intent",
            "ase-meta-config",
            "ase-meta-why",
            "ase-meta-eli5",
            "ase-meta-proximity",
            "ase-meta-quotes",
            "ase-meta-evaluate",
            "ase-meta-diaboli",
            "ase-meta-steelman",
            "ase-meta-quorum",
            "ase-meta-chat",
            "ase-meta-search",
            "ase-meta-brainstorm"
        ]
    },
    {
        label: "Standalone Mode 2/3",
        skills: [
            "ase-meta-compat",
            "ase-meta-mint",
            "ase-meta-workflow",
            "ase-arch-analyze",
            "ase-arch-discover",
            "ase-code-analyze",
            "ase-code-insight",
            "ase-code-explain",
            "ase-code-lint",
            "ase-spec-lint",
            "ase-docs-shorten",
            "ase-docs-refine",
            "ase-docs-proofread",
            "ase-docs-distill"
        ]
    },
    {
        label: "Standalone Mode 3/3",
        skills: [
            "ase-repo-review",
            "ase-repo-diff",
            "ase-repo-changelog",
            "ase-repo-commit",
            "ase-repo-dissect",
            "ase-repo-merge",
            "ase-repo-resolve"
        ]
    },
    {
        label: "Task Mode",
        skills: [
            "ase-task-id",
            "ase-task-edit",
            "ase-task-grill",
            "ase-task-research",
            "ase-task-estimate",
            "ase-task-reboot",
            "ase-task-implement",
            "ase-task-integrate",
            "ase-task-prove",
            "ase-task-view",
            "ase-task-list",
            "ase-task-status",
            "ase-task-assign",
            "ase-task-rename",
            "ase-task-condense",
            "ase-task-dissect",
            "ase-task-delete"
        ]
    },
    {
        label: "Direct Mode",
        skills: [
            "ase-code-edit",
            "ase-spec-edit",
            "ase-spec-activate"
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

/*  the alternative grouping of the same skills by their "ase-<group>-xxx"
    name prefix (ignoring the modes above) for the catalog grid of
    `Section-Usage.astro` and the sidebar and pane of `Modal-Help.astro`,
    keeping the skill order of the mode groups within
    each prefix group, where any skill of a prefix not explicitly listed
    here forms an own group at the end, so it never silently drops out of
    the manual page browser. The large "meta" and "task" prefix groups are
    further split into explicitly listed sub-groups, where any skill not
    listed in them is caught by a trailing plain "META" resp. "TASK" group. The leading skills
    are moved to the top of their prefix group. The resulting groups are copied into
    "skillGroups" of "tool/src/ase-man-catalog.ts" (the manual page browser of "ase man"),
    so keep both in sync.  */
const prefixOf  = (id: string): string => id.split("-")[1] ?? ""
const prefixes  = [ "help", "meta", "arch", "docs", "spec", "code", "repo", "sync", "task" ]
const leading   = [ "ase-code-edit" ]
const allSkills = skillGroups.flatMap((group) => group.skills)
    .sort((a, b) => Number(leading.includes(b)) - Number(leading.includes(a)))
for (const id of allSkills)
    if (!prefixes.includes(prefixOf(id)))
        prefixes.push(prefixOf(id))
const subGroups: Record<string, SkillGroup[]> = {
    meta: [
        { label: "META: CONFIG",   skills: [ "ase-meta-config", "ase-meta-compat" ] },
        { label: "META: EXPLAIN",  skills: [ "ase-meta-why", "ase-meta-eli5" ] },
        { label: "META: JUDGE",    skills: [ "ase-meta-evaluate", "ase-meta-diaboli", "ase-meta-steelman" ] },
        { label: "META: RESEARCH", skills: [ "ase-meta-brainstorm", "ase-meta-search", "ase-meta-quorum",
            "ase-meta-proximity", "ase-meta-chat", "ase-meta-quotes" ] },
        { label: "META: GENERATE", skills: [ "ase-meta-mint", "ase-meta-workflow" ] }
    ],
    task: [
        { label: "TASK: MANAGE",   skills: [ "ase-task-list", "ase-task-rename", "ase-task-delete" ] },
        { label: "TASK: HANDLE",   skills: [ "ase-task-id", "ase-task-status", "ase-task-assign" ] },
        { label: "TASK: EDIT",     skills: [ "ase-task-edit", "ase-task-view", "ase-task-grill", "ase-task-research",
            "ase-task-estimate", "ase-task-reboot", "ase-task-condense", "ase-task-dissect" ] },
        { label: "TASK: EXECUTE",  skills: [ "ase-task-implement", "ase-task-integrate" ] }
    ]
}
export const skillPrefixGroups: SkillGroup[] = prefixes.flatMap((prefix) => {
    const skills = allSkills.filter((id) => prefixOf(id) === prefix)
    const subs   = (subGroups[prefix] ?? []).map((group) => ({
        label:  group.label,
        skills: group.skills.filter((id) => skills.includes(id))
    }))
    const listed = new Set(subs.flatMap((group) => group.skills))
    return subs.concat([ { label: prefix.toUpperCase(), skills: skills.filter((id) => !listed.has(id)) } ])
        .filter((group) => group.skills.length > 0)
})

