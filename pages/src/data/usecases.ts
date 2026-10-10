/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

/*  the use cases: one entry per "/usecases/<id>/" page, each walking a single
    running example through the ASE skills which carry it, step by step. The
    entries double as the metadata records of their page routes (`nav.ts` reads
    them), and `Section-Usecase.astro` renders them as a numbered two-column
    process.

    Every command is a real skill invocation: options and arguments follow the
    SYNOPSIS of the manual page of the very skill (`plugin/skills/<skill>/
    help.md`), and the "**...**" span marks the skill name, which the Terminal
    component turns into the link opening that manual page.  */

import type { AstroComponent } from "@lucide/astro"
import Search                  from "@lucide/astro/icons/search"
import Compass                 from "@lucide/astro/icons/compass"
import MessageSquare           from "@lucide/astro/icons/message-square"
import Users                   from "@lucide/astro/icons/users"
import Brain                   from "@lucide/astro/icons/brain"
import FileText                from "@lucide/astro/icons/file-text"
import Lightbulb               from "@lucide/astro/icons/lightbulb"
import Shield                  from "@lucide/astro/icons/shield"
import Swords                  from "@lucide/astro/icons/swords"
import Telescope               from "@lucide/astro/icons/telescope"
import BookOpen                from "@lucide/astro/icons/book-open"
import Baby                    from "@lucide/astro/icons/baby"
import PackageSearch           from "@lucide/astro/icons/package-search"
import Scissors                from "@lucide/astro/icons/scissors"
import Scale                   from "@lucide/astro/icons/scale"
import Hammer                  from "@lucide/astro/icons/hammer"
import Funnel                  from "@lucide/astro/icons/funnel"
import ListFilter              from "@lucide/astro/icons/list-filter"
import PlaneTakeoff            from "@lucide/astro/icons/plane-takeoff"
import RefreshCw               from "@lucide/astro/icons/refresh-cw"
import ScrollText              from "@lucide/astro/icons/scroll-text"
import Layers                  from "@lucide/astro/icons/layers"
import Sunrise                 from "@lucide/astro/icons/sunrise"
import Tag                     from "@lucide/astro/icons/tag"
import Siren                   from "@lucide/astro/icons/siren"
import Wrench                  from "@lucide/astro/icons/wrench"
import Bug                     from "@lucide/astro/icons/bug"
import Gauge                   from "@lucide/astro/icons/gauge"
import SpellCheck              from "@lucide/astro/icons/spell-check"
import Glasses                 from "@lucide/astro/icons/glasses"
import GitCommitHorizontal     from "@lucide/astro/icons/git-commit-horizontal"
import Quote                   from "@lucide/astro/icons/quote"
import PenTool                 from "@lucide/astro/icons/pen-tool"
import Sparkles                from "@lucide/astro/icons/sparkles"
import Workflow                from "@lucide/astro/icons/workflow"
import ClipboardCheck          from "@lucide/astro/icons/clipboard-check"
import Blocks                  from "@lucide/astro/icons/blocks"
import Recycle                 from "@lucide/astro/icons/recycle"
import GitCompare              from "@lucide/astro/icons/git-compare"
import NotebookPen             from "@lucide/astro/icons/notebook-pen"
import RotateCcw               from "@lucide/astro/icons/rotate-ccw"
import Shrink                  from "@lucide/astro/icons/shrink"
import Eye                     from "@lucide/astro/icons/eye"
import Split                   from "@lucide/astro/icons/split"
import Hash                    from "@lucide/astro/icons/hash"
import Trash                   from "@lucide/astro/icons/trash"

export interface UseCaseStep {
    icon:        AstroComponent  /*  the Lucide icon prefixing the step heading  */
    eyebrow:     string          /*  short, accent-colored label above it        */
    title:       string          /*  the headline of the step                    */
    body:        string          /*  what happens here (inline markup)           */
    commands:    string[]        /*  the skill invocations firing here           */
}

export interface UseCase {
    id:          string          /*  path component of the page route            */
    label:       string          /*  label shown in the pull-down menu           */
    title:       string          /*  browser title of the page                   */
    description: string          /*  meta description of the page                */
    abstract:    string          /*  the lead paragraph (inline markup)          */
    steps:       UseCaseStep[]   /*  the process, in the order it is walked      */
}

export const useCases: UseCase[] = [
    {
        id:          "exploration",
        label:       "Exploration",
        title:       "Use Case: Exploration",
        description: "How to explore an idea with ASE: diverge and converge on options, then stress-test " +
                     "the chosen thesis from both sides before any code is written.",
        abstract:    "Before *how* comes *what*. The running example here is a feature idea nobody has " +
                     "committed to yet — *an offline mode for the ASE CLI* — widened into options, " +
                     "narrowed to a shortlist, and then attacked from both sides.",
        steps: [
            {
                icon:     Brain,
                eyebrow:  "Sanity Check",
                title:    "Question the Premise",
                body:     "Before a single option is generated, the motivation behind the idea is " +
                          "traced to its root, which either confirms the need or dissolves it.",
                commands: [
                    "**/ase-meta-why** --width 2 " +
                    "Engineers lose their agent session when the network drops"
                ]
            },
            {
                icon:     Lightbulb,
                eyebrow:  "Diverge, Converge",
                title:    "Brainstorm the Options",
                body:     "With the need confirmed, ideas are generated broadly, clustered, and scored " +
                          "down to a shortlist with a recommended direction.",
                commands: [
                    "**/ase-meta-brainstorm** --max-clarify 0 --min-ideas 20 --max-shortlist 3 " +
                    "an offline mode for the ASE CLI"
                ]
            },
            {
                icon:     Shield,
                eyebrow:  "Best Case",
                title:    "Build the Steelman",
                body:     "The strongest possible case for the shortlisted direction is built, so the " +
                          "idea is judged at its best rather than at its sloppiest formulation.",
                commands: [
                    "**/ase-meta-steelman** --rounds 2 " +
                    "An offline mode should cache every MCP response locally"
                ]
            },
            {
                icon:     Swords,
                eyebrow:  "Worst Case",
                title:    "Play Devil's Advocate",
                body:     "The very same thesis is then relentlessly challenged, which surfaces the " +
                          "objections a reviewer would raise days later.",
                commands: [
                    "**/ase-meta-diaboli** --count 5 " +
                    "An offline mode should cache every MCP response locally"
                ]
            }
        ]
    },
    {
        id:          "research",
        label:       "Research",
        title:       "Use Case: Research",
        description: "How to research an open question with ASE: web search, conceptual neighborhood, " +
                     "foreign LLMs, a consensus answer, root causes, and a distilled result.",
        abstract:    "Every non-trivial decision starts with a question whose answer is not yet at hand. " +
                     "The running example here is one such question: *Which option-parsing library " +
                     "fits a TypeScript CLI?* — carried from the first web search to a distilled, " +
                     "citable result.",
        steps: [
            {
                icon:     Search,
                eyebrow:  "Cast the Net",
                title:    "Ask the Whole Web At Once",
                body:     "One query is dispatched to every search backend in parallel and the answers " +
                          "are consolidated, so no backend's blind spot decides the outcome.",
                commands: [
                    "**/ase-meta-search** --services=all " +
                    "option parsing libraries for TypeScript CLIs"
                ]
            },
            {
                icon:     Baby,
                eyebrow:  "Plain Language",
                title:    "Explain It Like I'm 5",
                body:     "The first results come back full of jargon, so the term at their center is " +
                          "re-told in child-friendly words — grounded in web facts to keep it true.",
                commands: [
                    "**/ase-meta-eli5** -g " +
                    "difference between Unix-style long and short options"
                ]
            },
            {
                icon:     Compass,
                eyebrow:  "Map the Terrain",
                title:    "Explore the Neighborhood",
                body:     "With the vocabulary clear, the topic is placed into its conceptual surroundings " +
                          "— parent, sibling, and child topics — so adjacent options surface before the search narrows.",
                commands: [
                    "**/ase-meta-proximity** --ground --loop " +
                    "command-line option parsing"
                ]
            },
            {
                icon:     MessageSquare,
                eyebrow:  "Second Opinion",
                title:    "Ask a Foreign Model",
                body:     "A single foreign LLM is queried directly, which is the cheapest way to " +
                          "check whether the picture so far is model-specific.",
                commands: [
                    "**/ase-meta-chat** gemini " +
                    "Which option parser do you recommend for a TypeScript CLI in 2026?"
                ]
            },
            {
                icon:     Users,
                eyebrow:  "Broad Consensus",
                title:    "Collect a Quorum",
                body:     "Several AIs answer the same question in parallel and their answers are " +
                          "synthesized into one consensus answer with a consensus rating.",
                commands: [
                    "**/ase-meta-quorum** --models chatgpt,gemini,grok " +
                    "Which option parsing library fits a TypeScript CLI best?"
                ]
            },
            {
                icon:     Brain,
                eyebrow:  "Get to the Root",
                title:    "Drill Down Five Whys",
                body:     "Where the research uncovers a symptom rather than a cause, the Five-Whys " +
                          "chain is walked until the actual root cause shows up.",
                commands: [
                    "**/ase-meta-why** --depth 5 --width 2 " +
                    "Our CLI option handling diverges between commands"
                ]
            },
            {
                icon:     ListFilter,
                eyebrow:  "Boil It Down",
                title:    "Distill the Findings",
                body:     "The notes accumulated so far are reduced to an importance-ranked list of key " +
                          "points, each with its rationale and a line-cited evidence snippet.",
                commands: [
                    "**/ase-docs-distill** --top 5 " +
                    "@docs/research-option-parsing.md"
                ]
            }
        ]
    },
    {
        id:          "discovery",
        label:       "Discovery",
        title:       "Use Case: Discovery",
        description: "How to make sense of an unfamiliar code base with ASE: project insight, an " +
                     "architecture review, code explanations, plain-language analogies, and a dissected change set.",
        abstract:    "Inheriting a code base means reading before writing. The running example here is " +
                     "*the hook subsystem of a repository you just cloned* — approached from the " +
                     "outside in, until its structure, its concepts, and its pending changes are clear.",
        steps: [
            {
                icon:     FileText,
                eyebrow:  "Read the Docs",
                title:    "Distill the Manual",
                body:     "The reading starts where the authors explained themselves: the documentation " +
                          "is compressed to its ranked key points, each backed by a line-cited snippet.",
                commands: [
                    "**/ase-docs-distill** --top 7 " +
                    "@docs/usage-tool.md"
                ]
            },
            {
                icon:     Baby,
                eyebrow:  "Plain Language",
                title:    "Explain It Like I'm 5",
                body:     "The concept behind the subsystem is re-told without jargon, which is the " +
                          "fastest way to notice that one has not actually understood it yet.",
                commands: [
                    "**/ase-meta-eli5** --ground " +
                    "agent tool hooks"
                ]
            },
            {
                icon:     Telescope,
                eyebrow:  "Bird's Eye",
                title:    "Take Project Insight",
                body:     "Only then is the code base surveyed as a whole, so the reading order that " +
                          "follows is driven by the actual structure instead of by file names.",
                commands: [
                    "**/ase-code-insight** src/"
                ]
            },
            {
                icon:     Blocks,
                eyebrow:  "Structure",
                title:    "Review the Architecture",
                body:     "The survey is deepened into an architecture review — package cohesion, " +
                          "inter-package coupling, a rendered diagram — whose PROBLEM and TRADEOFF " +
                          "findings tell which seams of the code base are load-bearing.",
                commands: [
                    "**/ase-arch-analyze** src/"
                ]
            },
            {
                icon:     BookOpen,
                eyebrow:  "Zoom In",
                title:    "Explain the Core File",
                body:     "The central module the survey pointed at is explained with its WHAT, WHY, " +
                          "analogy, diagram, cruxes, and gotchas — the parts a comment never carries.",
                commands: [
                    "**/ase-code-explain** src/ase-hook.ts"
                ]
            },
            {
                icon:     Scissors,
                eyebrow:  "Pending Work",
                title:    "Dissect the Change Set",
                body:     "The uncommitted changes found in the working copy are decomposed into " +
                          "cohesive parts — as a dry run, so nothing is materialized yet.",
                commands: [
                    "**/ase-repo-dissect** --dry --max-parts 4"
                ]
            },
            {
                icon:     PackageSearch,
                eyebrow:  "Make or Buy",
                title:    "Discover the Alternatives",
                body:     "With the code understood, third-party components are discovered and ranked " +
                          "for its hand-rolled parts, showing which of them could stop being maintained in-house.",
                commands: [
                    "**/ase-arch-discover** --limit 8 " +
                    "hook dispatching for CLI tools"
                ]
            }
        ]
    },
    {
        id:          "skeleton",
        label:       "Skeleton",
        title:       "Use Case: Skeleton",
        description: "How to establish the technology stack of a walking skeleton with ASE: discover " +
                     "components, decide defensibly, implement the skeleton, and reconcile the docs.",
        abstract:    "A walking skeleton is the thinnest end-to-end slice which actually runs. The " +
                     "running example here is *a TypeScript REST service exposing a single " +
                     "`GET /health` endpoint* — from picking its stack to a reviewed, documented " +
                     "first version.",
        steps: [
            {
                icon:     PackageSearch,
                eyebrow:  "Candidates",
                title:    "Discover the Components",
                body:     "Candidate frameworks are discovered and ranked by downloads, age, last " +
                          "update, and stars, instead of by the first search hit.",
                commands: [
                    "**/ase-arch-discover** --limit 10 --staleness 12 " +
                    "HTTP server framework for TypeScript"
                ]
            },
            {
                icon:     Scale,
                eyebrow:  "Decision",
                title:    "Evaluate the Finalists",
                body:     "The shortlist runs through a weighted multi-criteria matrix, which turns a " +
                          "gut feeling into a decision you can defend in a review.",
                commands: [
                    "**/ase-meta-evaluate** Hono vs Fastify vs Express " +
                    "for a TypeScript REST service, TypeScript support is important"
                ]
            },
            {
                icon:     Swords,
                eyebrow:  "Pressure Test",
                title:    "Ensure the Decision Holds",
                body:     "The winner looks great — so before it is baked into the skeleton, the " +
                          "decision is challenged once as Devil's Advocate and once as Steelman.",
                commands: [
                    "**/ase-meta-diaboli** --count 4 " +
                    "Fastify is the right framework for this REST service",
                    "**/ase-meta-steelman** --rounds 2 " +
                    "Fastify is the right framework for this REST service"
                ]
            },
            {
                icon:     Hammer,
                eyebrow:  "Plan",
                title:    "Craft the Skeleton Plan",
                body:     "The decision becomes a persisted task plan under its own task id, so the " +
                          "skeleton survives the end of the agent session.",
                commands: [
                    "**/ase-code-craft** skeleton: " +
                    "a minimal REST service exposing GET /health with the Fastify framework"
                ]
            },
            {
                icon:     Funnel,
                eyebrow:  "Pressure Test",
                title:    "Grill the Plan",
                body:     "The plan is interrogated round by round until no essential decision is left " +
                          "to chance during the implementation.",
                commands: [
                    "**/ase-task-grill** --rounds 2 " +
                    "skeleton"
                ]
            },
            {
                icon:     PlaneTakeoff,
                eyebrow:  "Realization",
                title:    "Draft, Then Apply",
                body:     "A draft creates the change set as an attachment of the plan first; only " +
                          "after its review is it applied to the code base.",
                commands: [
                    "**/ase-task-implement** --draft skeleton",
                    "**/ase-task-integrate** --draft skeleton"
                ]
            },
            {
                icon:     RefreshCw,
                eyebrow:  "Round-Trip",
                title:    "Reconcile the Documentation",
                body:     "The documentation is aligned to the code which now exists, so the skeleton " +
                          "does not start its life already out of sync.",
                commands: [
                    "**/ase-sync-reconcile** --target docs --source code " +
                    "the new service skeleton"
                ]
            }
        ]
    },
    {
        id:          "specification",
        label:       "Specification",
        title:       "Use Case: Specification",
        description: "How to drive a SpecBook-based specification with ASE: edit and grill it, import " +
                     "foreign sources, reconcile the code against it, and export it for review.",
        abstract:    "A specification is only worth its upkeep while it stays true. The running example " +
                     "here is *rate limiting for the REST API* — grounded in an external source, " +
                     "specified, validated, reconciled with the code, and exported for the reviewers.",
        steps: [
            {
                icon:     BookOpen,
                eyebrow:  "Orientation",
                title:    "Activate the Specification",
                body:     "The SpecBook know-how — format contract, schema, and artifact set — is " +
                          "activated first, so the existing specification can be queried in plain " +
                          "conversation before anything is changed.",
                commands: [
                    "**/ase-spec-activate** what does the specification say about rate limiting so far?"
                ]
            },
            {
                icon:     Layers,
                eyebrow:  "Foreign Input",
                title:    "Import the Source",
                body:     "External material — a standard, a ticket, a pasted mail — is ingested into " +
                          "the specification first, instead of being paraphrased by hand later.",
                commands: [
                    "**/ase-sync-import** --target spec @docs/rfc-6585-status-429.md"
                ]
            },
            {
                icon:     ScrollText,
                eyebrow:  "Draft",
                title:    "Edit the Specification",
                body:     "The requirement itself enters the SpecBook-based specification in one shot, " +
                          "with the intent grilled before anything is written.",
                commands: [
                    "**/ase-spec-edit** --grill --grill-rounds 2 add rate limiting to the REST API"
                ]
            },
            {
                icon:     ClipboardCheck,
                eyebrow:  "Validation",
                title:    "Verify and Loop",
                body:     "The edit runs again with validation and looping enabled, so the SpecBook " +
                          "schema violations are resolved rather than reported.",
                commands: [
                    "**/ase-spec-edit** --verify --loop rate limiting"
                ]
            },
            {
                icon:     RefreshCw,
                eyebrow:  "Forward Engineering",
                title:    "Reconcile Code to Spec",
                body:     "The code is aligned to the specification which now describes it — the " +
                          "forward direction of the round-trip.",
                commands: [
                    "**/ase-sync-reconcile** --target code --source spec rate limiting"
                ]
            },
            {
                icon:     FileText,
                eyebrow:  "Hand-Off",
                title:    "Export for Review",
                body:     "The specification is materialized into ready-to-consume renderings for the " +
                          "people who will never open the repository.",
                commands: [
                    "**/ase-sync-export** --output html,pdf"
                ]
            }
        ]
    },
    {
        id:          "planning",
        label:       "Planning",
        title:       "Use Case: Planning",
        description: "How to manage a persisted task plan with ASE: write, grill, reboot, and condense " +
                     "it, dissect the epic into sub-tasks, rename and switch them, implement, and clean up.",
        abstract:    "A plan which outlives the session is a plan you can manage. The running example " +
                     "here is *the `auth` epic — user authentication for the REST service* — walked " +
                     "through the whole Task Mode lifecycle, from the first draft to the deleted " +
                     "epic, with every task skill firing along the way.",
        steps: [
            {
                icon:     NotebookPen,
                eyebrow:  "Draft",
                title:    "Write the Plan",
                body:     "The request becomes a persisted task plan under its own task id, and is " +
                          "refined right away in the conversational loop — the plan is shown each " +
                          "round, and you decide whether to keep refining or to stop.",
                commands: [
                    "**/ase-task-edit** auth: add user authentication to the REST service with " +
                    "JWT access tokens, refresh tokens, and a login endpoint",
                    "**/ase-task-edit** --plan REFINE auth: store the refresh tokens hashed, never in plain text"
                ]
            },
            {
                icon:     Funnel,
                eyebrow:  "Pressure Test",
                title:    "Grill the Plan",
                body:     "The plan is interrogated round by round until every branch of the question " +
                          "tree is resolved — and the grilling exposes that the plan was silently " +
                          "assuming a single identity provider.",
                commands: [
                    "**/ase-task-grill** --rounds 3 auth"
                ]
            },
            {
                icon:     RotateCcw,
                eyebrow:  "Fresh Start",
                title:    "Reboot the Plan",
                body:     "Rather than patching the accreted contradictions, the plan is re-created " +
                          "from scratch out of its own WHAT and WHY, with the creation timestamp " +
                          "preserved — and handed straight back to the editor for the provider decision.",
                commands: [
                    "**/ase-task-reboot** --next EDIT auth"
                ]
            },
            {
                icon:     Shrink,
                eyebrow:  "Compression",
                title:    "Condense the Wording",
                body:     "Three rounds of refinement left the plan wordy, so its prose is compressed " +
                          "telegrapher-like while every heading, bullet label, path, and number stays " +
                          "exactly as it is.",
                commands: [
                    "**/ase-task-condense** auth"
                ]
            },
            {
                icon:     Eye,
                eyebrow:  "Inventory",
                title:    "List and View",
                body:     "The persisted plans are listed with their states and timestamps, and the " +
                          "epic is viewed in full, including its implementation draft.",
                commands: [
                    "**/ase-task-list** --verbose",
                    "**/ase-task-view** --full auth"
                ]
            },
            {
                icon:     Split,
                eyebrow:  "Epic",
                title:    "Dissect Into Sub-Tasks",
                body:     "The epic is too large for one commit, so it is dissected along its " +
                          "semantics into cohesive sub-task plans — previewed first, then materialized " +
                          "with a hint steering the cut.",
                commands: [
                    "**/ase-task-dissect** --dry --max-parts 3 auth",
                    "**/ase-task-dissect** --max-parts 3 auth: tokens first, then the login endpoint, then the docs"
                ]
            },
            {
                icon:     Hash,
                eyebrow:  "Bookkeeping",
                title:    "Rename and Switch",
                body:     "The derived sub-task ids are given the names the team will actually say, " +
                          "and the session is switched to the first of them, which the statusline " +
                          "reflects immediately.",
                commands: [
                    "**/ase-task-rename** auth-tokens tokens",
                    "**/ase-task-id** tokens"
                ]
            },
            {
                icon:     PlaneTakeoff,
                eyebrow:  "Realization",
                title:    "Draft, Then Apply",
                body:     "With `tokens` being the current task, the id can be left out: the draft " +
                          "creates the change set as an attachment, then it is applied to the " +
                          "code base.",
                commands: [
                    "**/ase-task-implement** --draft",
                    "**/ase-task-integrate** --draft"
                ]
            },
            {
                icon:     Trash,
                eyebrow:  "Cleanup",
                title:    "Delete the Consumed Epic",
                body:     "Once all sub-tasks are implemented, the epic itself has served its purpose " +
                          "and is deleted, so the task list shows only what is still open.",
                commands: [
                    "**/ase-task-delete** auth"
                ]
            }
        ]
    },
    {
        id:          "coding",
        label:       "Coding",
        title:       "Use Case: Coding",
        description: "How to craft a new feature with ASE: mint the name, plan it, grill the plan, " +
                     "draft its implementation, and implement it in an isolated Git worktree.",
        abstract:    "Feature work is where the operation modes pay off. The running example here is " +
                     "*a `--json` output mode for `ase task list`* — walked through the full Task Mode, " +
                     "with the one-shot Quick Mode shown as its alternative.",
        steps: [
            {
                icon:     Tag,
                eyebrow:  "Naming",
                title:    "Mint the Identifier",
                body:     "The flag and its variable get a derived, consistent name up front, which " +
                          "keeps the later diff free of naming debates.",
                commands: [
                    "**/ase-meta-mint** --type var --count 5 flag for machine-readable CLI output"
                ]
            },
            {
                icon:     Hammer,
                eyebrow:  "Plan",
                title:    "Craft the Feature Plan",
                body:     "The funnel proposes alternative approaches with explicit pros and cons, you " +
                          "pick one, and a persisted task plan under its own task id is composed for it.",
                commands: [
                    "**/ase-code-craft** json-output: add a --json output mode to `ase task list`"
                ]
            },
            {
                icon:     Funnel,
                eyebrow:  "Pressure Test",
                title:    "Grill Yourself on It",
                body:     "The plan is challenged round by round, so the agent implements the intent " +
                          "rather than the wording of the request.",
                commands: [
                    "**/ase-task-grill** --rounds 3 json-output"
                ]
            },
            {
                icon:     Sunrise,
                eyebrow:  "Next Morning",
                title:    "Resume Where You Stopped",
                body:     "The day ended before the implementation. The plan survived the session, so " +
                          "the next morning it is listed and reopened — your context is back in seconds.",
                commands: [
                    "**/ase-task-list** --verbose",
                    "**/ase-task-view** --full json-output"
                ]
            },
            {
                icon:     PlaneTakeoff,
                eyebrow:  "Dry Run",
                title:    "Draft, Then Adjust",
                body:     "The draft creates the change set and shows what would be touched; the " +
                          "plan is then given its final adjustments, before a single file is written.",
                commands: [
                    "**/ase-task-implement** --draft json-output",
                    "**/ase-task-edit** json-output: emit the JSON to stdout only, never to a file"
                ]
            },
            {
                icon:     Layers,
                eyebrow:  "Realization",
                title:    "Implement in a Worktree",
                body:     "The implementation runs isolated in its own Git worktree, so it never " +
                          "collides with whatever else is in flight on the branch.",
                commands: [
                    "**/ase-task-implement** --worktree json json-output"
                ]
            },
            {
                icon:     Sparkles,
                eyebrow:  "Quick Mode",
                title:    "Or Do It In One Shot",
                body:     "For a change this size, the fused one-shot variant does the very same work " +
                          "with grilling and verification, but without a persisted plan.",
                commands: [
                    "**/ase-code-edit** --mode craft --grill --verify --worktree json-output add a --json output mode to `ase task list`"
                ]
            }
        ]
    },
    {
        id:          "bugfixing",
        label:       "Bugfixing",
        title:       "Use Case: Bugfixing",
        description: "How to fix a defect with ASE: find the root cause, resolve it in quick mode or " +
                     "as a planned change, and verify the fix before it leaves the working copy.",
        abstract:    "A defect that jumps the queue still deserves a cause, not a patch. The running " +
                     "example here is *the statusline showing a stale task id after `ase task rename`* — " +
                     "from the first Why to the verified fix.",
        steps: [
            {
                icon:     Siren,
                eyebrow:  "Triage",
                title:    "Find the Real Cause",
                body:     "The reported symptom is drilled down along the Five-Whys chain, so the fix " +
                          "lands at the origin instead of at the place where it hurts.",
                commands: [
                    "**/ase-meta-why** --depth 5 --width 2 The statusline shows a stale task id after a rename"
                ]
            },
            {
                icon:     Wrench,
                eyebrow:  "Quick Mode",
                title:    "Resolve It Immediately",
                body:     "Bug-fixing follows its own tenets — no drive-by cleanups, minimum new flags, " +
                          "handling close to the origin — and in quick mode the whole funnel collapses " +
                          "into a single grounded pass, implemented right away and revertable wholesale.",
                commands: [
                    "**/ase-code-resolve** --quick the statusline keeps the old task id after `ase task rename`"
                ]
            },
            {
                icon:     ClipboardCheck,
                eyebrow:  "Verification",
                title:    "Or Fix and Verify In One",
                body:     "Where the fix has to prove itself, the fused editor resolves and verifies in " +
                          "a single call, looping until the verification actually passes.",
                commands: [
                    "**/ase-code-edit** --mode resolve --verify --loop stale task id in the statusline after a rename"
                ]
            },
            {
                icon:     Bug,
                eyebrow:  "Task Mode",
                title:    "Or Plan the Whole Fix",
                body:     "Where the defect touches more than one place, the very same call without " +
                          "`--quick` produces a persisted plan to grill and draft first.",
                commands: [
                    "**/ase-code-resolve** rename-bug: the statusline keeps the old task id after `ase task rename`",
                    "**/ase-task-implement** --draft rename-bug"
                ]
            }
        ]
    },
    {
        id:          "refactoring",
        label:       "Refactoring",
        title:       "Use Case: Refactoring",
        description: "How to refactor with ASE: find the structural problem, choose a refactoring " +
                     "approach, implement it behavior-preservingly, and check the diff — or do it in one shot.",
        abstract:    "Refactoring changes structure, never behavior. The running example here is " +
                     "*the option parsing duplicated across the CLI commands* — surfaced by an " +
                     "architecture review, consolidated under a plan, and verified to have changed " +
                     "nothing but the structure.",
        steps: [
            {
                icon:     Blocks,
                eyebrow:  "Structure",
                title:    "Review the Architecture",
                body:     "The code base is reviewed for package cohesion and inter-package coupling, " +
                          "which reports the duplication as a persisted PROBLEM finding with an id, " +
                          "next to an architecture diagram.",
                commands: [
                    "**/ase-arch-analyze** --prefix cli src/"
                ]
            },
            {
                icon:     Recycle,
                eyebrow:  "Plan",
                title:    "Choose the Refactoring Approach",
                body:     "Refactoring follows its own tenets — behavior preservation, Boy Scout Rule, " +
                          "DRY, SRP — so alternative approaches with pros and cons are proposed, you " +
                          "pick one, and a persisted task plan is composed for it.",
                commands: [
                    "**/ase-code-refactor** getopt: consolidate the option parsing " +
                    "of all CLI commands into src/ase-getopt.ts (finding cli-P1)"
                ]
            },
            {
                icon:     PlaneTakeoff,
                eyebrow:  "Realization",
                title:    "Draft, Then Implement",
                body:     "The draft shows every call site the consolidation touches; only then " +
                          "does the implementation run, isolated in its own Git worktree.",
                commands: [
                    "**/ase-task-implement** --draft getopt",
                    "**/ase-task-implement** --worktree consolidate getopt"
                ]
            },
            {
                icon:     GitCompare,
                eyebrow:  "Behavior Preservation",
                title:    "Check the Diff Stays Pure",
                body:     "The staged diff is retold as an intent-grouped narrative with a coherence " +
                          "check, which is where a behavior change smuggled into a refactoring shows up.",
                commands: [
                    "**/ase-repo-diff** --coherence --risk"
                ]
            },
            {
                icon:     Sparkles,
                eyebrow:  "Quick Mode",
                title:    "Or Refactor In One Shot",
                body:     "For a rename-sized refactoring, the plan ceremony is skipped and the change " +
                          "applied in place; for anything in between, the fused editor refactors, " +
                          "grills, and verifies in a single call.",
                commands: [
                    "**/ase-code-refactor** --direct rename parseArgs to parseOptions in src/ase-getopt.ts",
                    "**/ase-code-edit** --mode refactor --grill --verify --worktree option-table " +
                    "extract the shared option table of the CLI commands into src/ase-getopt.ts"
                ]
            }
        ]
    },
    {
        id:          "linting",
        label:       "Linting",
        title:       "Use Case: Linting",
        description: "How to raise the quality of a change with ASE: lint the code for smells, analyze " +
                     "it for logic, performance, and security defects, and proofread the documentation.",
        abstract:    "Quality gates work best before anyone else looks. The running example here is " +
                     "*the finished `--json` change set* — swept for code smells, logic, performance, " +
                     "security, and language defects, each reported with line-cited findings.",
        steps: [
            {
                icon:     Glasses,
                eyebrow:  "Code Quality",
                title:    "Lint for Smells",
                body:     "The code is checked for quality problems from MEDIUM severity upwards, with " +
                          "the safe findings applied automatically.",
                commands: [
                    "**/ase-code-lint** --severity=MEDIUM --auto src/"
                ]
            },
            {
                icon:     Brain,
                eyebrow:  "Logic",
                title:    "Analyze the Semantics",
                body:     "The changed modules are analyzed for logic and control-flow defects — the " +
                          "class of problem no formatter ever catches.",
                commands: [
                    "**/ase-code-analyze** --severity=MEDIUM src/ase-task.ts"
                ]
            },
            {
                icon:     Gauge,
                eyebrow:  "Performance, Security",
                title:    "Analyze the Other Axes",
                body:     "The same analyzer runs with its performance and security lenses, which " +
                          "report efficiency traps and attack surface separately.",
                commands: [
                    "**/ase-code-analyze** --performance --security --severity=HIGH src/"
                ]
            },
            {
                icon:     SpellCheck,
                eyebrow:  "Language",
                title:    "Proofread the Documentation",
                body:     "The documentation shipped with the change is checked for spelling, " +
                          "punctuation, and grammar defects, again with the safe fixes applied.",
                commands: [
                    "**/ase-docs-proofread** --auto docs/"
                ]
            }
        ]
    },
    {
        id:          "versioning",
        label:       "Versioning",
        title:       "Use Case: Versioning",
        description: "How to land a change set with ASE: summarize the diff, dissect it into atomic " +
                     "parts, review it, update the ChangeLog, and write the commit message.",
        abstract:    "The last mile decides what the history will look like in a year. The running " +
                     "example here is *the finished `--json` change set* — summarized, split into " +
                     "atomic parts, reviewed, and committed.",
        steps: [
            {
                icon:     FileText,
                eyebrow:  "Orientation",
                title:    "Summarize the Diff",
                body:     "The staged changes are retold as an intent-grouped narrative, together with " +
                          "a coherence check and a risk and blast-radius report.",
                commands: [
                    "**/ase-repo-diff** --coherence --risk --blast"
                ]
            },
            {
                icon:     Scissors,
                eyebrow:  "Atomicity",
                title:    "Dissect the Epic",
                body:     "A change set which grew into an epic is decomposed domain-wise into " +
                          "cohesive, separately committable parts.",
                commands: [
                    "**/ase-repo-dissect** --max-parts 3 split by CLI, service, and docs"
                ]
            },
            {
                icon:     Glasses,
                eyebrow:  "Quality Gate",
                title:    "Review Your Own Diff",
                body:     "Before anyone else sees the branch, the staged diff gets a human-reviewer " +
                          "style critique with an approve or reject verdict.",
                commands: [
                    "**/ase-repo-review** --severity=MEDIUM"
                ]
            },
            {
                icon:     Wrench,
                eyebrow:  "Post-Adjustment",
                title:    "Fix What the Review Found",
                body:     "Just when you thought you were done, the review flags a defect in your own " +
                          "changes, so it is fixed ad hoc — grilled and verified — and reviewed once more.",
                commands: [
                    "**/ase-code-edit** --mode resolve --grill --verify " +
                    "the JSON output omits tasks without a title",
                    "**/ase-repo-review** --severity=MEDIUM"
                ]
            },
            {
                icon:     ScrollText,
                eyebrow:  "Paperwork",
                title:    "Leave It Clean",
                body:     "The steps usually skipped: the ChangeLog entry is derived from the actual " +
                          "change set, and the documentation is reconciled against the code that just " +
                          "changed — so no paperwork debt is carried into tomorrow.",
                commands: [
                    "**/ase-repo-changelog**",
                    "**/ase-sync-reconcile** --source code --target docs the --json output mode"
                ]
            },
            {
                icon:     GitCommitHorizontal,
                eyebrow:  "Landing",
                title:    "Write the Commit Message",
                body:     "The commit message is determined from the staged changes themselves, in " +
                          "the conventional form the project already uses.",
                commands: [
                    "**/ase-repo-commit**"
                ]
            }
        ]
    },
    {
        id:          "writing",
        label:       "Writing",
        title:       "Use Case: Writing",
        description: "How to write a text with ASE: brainstorm the angle, stress-test the thesis, mint " +
                     "a title, season it with quotes, then refine, shorten, and proofread it.",
        abstract:    "Writing is engineering with words. The running example here is *the launch post " +
                     "for ASE* — outlined, challenged, named, quoted, tightened to a target length, " +
                     "and finally proofread.",
        steps: [
            {
                icon:     Lightbulb,
                eyebrow:  "Outline",
                title:    "Brainstorm the Angle",
                body:     "Possible angles are widened and then narrowed to a ranked shortlist, which " +
                          "becomes the outline of the post.",
                commands: [
                    "**/ase-meta-brainstorm** --min-ideas 15 --max-shortlist 3 angles for the ASE launch post"
                ]
            },
            {
                icon:     Swords,
                eyebrow:  "Both Sides",
                title:    "Stress-Test the Thesis",
                body:     "The central claim of the chosen angle is first strengthened and then " +
                          "relentlessly challenged, which keeps the post honest.",
                commands: [
                    "**/ase-meta-steelman** --rounds 2 Agentic AI Coding needs classic Software Engineering to scale",
                    "**/ase-meta-diaboli** --count 4 Agentic AI Coding needs classic Software Engineering to scale"
                ]
            },
            {
                icon:     Tag,
                eyebrow:  "Naming",
                title:    "Mint the Product Name",
                body:     "With the thesis settled, a handful of product name candidates are derived from it, " +
                          "so the product gets a catchy name.",
                commands: [
                    "**/ase-meta-mint** --type name --count 5 tool about agentic software engineering"
                ]
            },
            {
                icon:     Quote,
                eyebrow:  "Seasoning",
                title:    "Find Fitting Quotes",
                body:     "Quotes on the topic are collected and sorted into their 2x2 matrix, grounded " +
                          "in web facts so the attributions hold.",
                commands: [
                    "**/ase-meta-quotes** --ground --count 3 software engineering, automation"
                ]
            },
            {
                icon:     Scissors,
                eyebrow:  "Length",
                title:    "Shorten to Target",
                body:     "The whole text is cut down to its target length in stages — tightened first, " +
                          "then stripped of low-value content, then compressed — each stage entered only while needed.",
                commands: [
                    "**/ase-docs-shorten** --words 800 @docs/blog-launch.md"
                ]
            },
            {
                icon:     PenTool,
                eyebrow:  "Polish",
                title:    "Refine the Wording",
                body:     "The remaining text gets its sentence structure and style tightened, while " +
                          "content, numbers, and technical terms stay exactly as they are.",
                commands: [
                    "**/ase-docs-refine** --auto @docs/blog-launch.md"
                ]
            },
            {
                icon:     SpellCheck,
                eyebrow:  "Final Gate",
                title:    "Proofread It",
                body:     "The last pass catches spelling, capitalization, punctuation, and grammar " +
                          "defects before the post leaves the repository.",
                commands: [
                    "**/ase-docs-proofread** --auto @docs/blog-launch.md"
                ]
            }
        ]
    },
    {
        id:          "automation",
        label:       "Automation",
        title:       "Use Case: Automation",
        description: "How to automate a recurring procedure with ASE: generate your own workflow skill " +
                     "which orchestrates the existing skills, then dry-run and use it.",
        abstract:    "Anything done three times deserves a skill of its own. The running example here " +
                     "is *a quality gate run before every pull request* — turned from a checklist in " +
                     "your head into a generated ASE workflow skill.",
        steps: [
            {
                icon:     Compass,
                eyebrow:  "Orientation",
                title:    "Find the Skills to Chain",
                body:     "The intent is matched against the accumulated help of all skills, which " +
                          "yields the concrete commands the workflow will orchestrate.",
                commands: [
                    "**/ase-help-intent** check code, docs and diff quality before a pull request"
                ]
            },
            {
                icon:     BookOpen,
                eyebrow:  "Manual",
                title:    "Read the Manual Pages",
                body:     "Before the candidates are chained, their manual pages are opened — by full " +
                          "name or by any abbreviation — so the options the workflow will pass are " +
                          "taken from the SYNOPSIS instead of from memory.",
                commands: [
                    "**/ase-help-skill** ase-code-lint"
                ]
            },
            {
                icon:     Workflow,
                eyebrow:  "Generation",
                title:    "Generate the Workflow Skill",
                body:     "A new skill is generated in the style of the ASE skills, orchestrating the " +
                          "chosen steps — installed locally for this project only.",
                commands: [
                    "**/ase-meta-workflow** --scope local ase-flow-quality-gate lint and analyze the code, proofread the docs, then review the staged diff"
                ]
            },
            {
                icon:     ClipboardCheck,
                eyebrow:  "Dry Run",
                title:    "Try It Out",
                body:     "The generated skill is invoked like any other one, so its behavior can be " +
                          "checked on a real working copy before it becomes routine.",
                commands: [
                    "**/ase-flow-quality-gate**"
                ]
            },
            {
                icon:     RefreshCw,
                eyebrow:  "Evolution",
                title:    "Regenerate on Change",
                body:     "When the procedure changes, the skill is regenerated over its predecessor " +
                          "instead of being patched by hand.",
                commands: [
                    "**/ase-meta-workflow** --scope local --force ase-flow-quality-gate additionally run the ChangeLog update at the end"
                ]
            }
        ]
    }
]
