/*
**  Agentic Software Engineering (ASE)
**  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

/*  methodology provenance: the classic, well-known reasoning and engineering
    methods ASE bakes into its skills, each mapped onto the very skill that
    implements it. `Methodology-Strip.astro` renders this list as a strip of
    chips whose `data-help-id` opens the man-page of the mapped skill in the
    shared help modal, exactly like the skill catalog entries do.

    Each entry also carries the Lucide icon the chip shows in front of the
    method name. The icons are imported one by one from `@lucide/astro/icons/*`
    instead of the package barrel, so only the used ones are pulled through the
    bundler.  */

import type { AstroComponent } from "@lucide/astro"
import Pickaxe                 from "@lucide/astro/icons/pickaxe"
import Ban                     from "@lucide/astro/icons/ban"
import Shield                  from "@lucide/astro/icons/shield"
import Swords                  from "@lucide/astro/icons/swords"
import GitMerge                from "@lucide/astro/icons/git-merge"
import Scale                   from "@lucide/astro/icons/scale"
import Baby                    from "@lucide/astro/icons/baby"
import Feather                 from "@lucide/astro/icons/feather"
import Dice3                   from "@lucide/astro/icons/dice-3"
import Broom                   from "@lucide/astro/icons/broom"
import Waypoints               from "@lucide/astro/icons/waypoints"
import Scissors                from "@lucide/astro/icons/scissors"
import CircleQuestionMark      from "@lucide/astro/icons/circle-question-mark"
import FoldHorizontal          from "@lucide/astro/icons/fold-horizontal"
import Users                   from "@lucide/astro/icons/users"
import Presentation            from "@lucide/astro/icons/presentation"
import Pyramid                 from "@lucide/astro/icons/pyramid"
import Grid2x2                 from "@lucide/astro/icons/grid-2x2"
import ArrowUpDown             from "@lucide/astro/icons/arrow-up-down"
import Split                   from "@lucide/astro/icons/split"
import GitCommitHorizontal     from "@lucide/astro/icons/git-commit-horizontal"
import FlaskConical            from "@lucide/astro/icons/flask-conical"
import Gavel                   from "@lucide/astro/icons/gavel"
import RefreshCw               from "@lucide/astro/icons/refresh-cw"
import Bomb                    from "@lucide/astro/icons/bomb"
import ShoppingCart            from "@lucide/astro/icons/shopping-cart"
import Target                  from "@lucide/astro/icons/target"
import ScanSearch              from "@lucide/astro/icons/scan-search"
import TrendingUp              from "@lucide/astro/icons/trending-up"
import Flame                   from "@lucide/astro/icons/flame"
import NotebookPen             from "@lucide/astro/icons/notebook-pen"
import Tag                     from "@lucide/astro/icons/tag"

export type Method = {
    icon:  AstroComponent  /*  the Lucide icon prefixing the method name       */
    name:  string          /*  the classic method, under its established name  */
    note:  string          /*  what the method achieves, in a few words        */
    skill: string          /*  the ASE skill implementing the method           */
}

export const methods: Method[] = [
    { icon: Pickaxe,             name: "Five-Whys",                note: "drill down to root cause",  skill: "ase-meta-why"        },
    { icon: Ban,                 name: "YAGNI",                    note: "build for today only",      skill: "ase-code-craft"      },
    { icon: Shield,              name: "Steelman",                 note: "strengthen a thesis",       skill: "ase-meta-steelman"   },
    { icon: Swords,              name: "Devil's Advocate",         note: "challenge a thesis",        skill: "ase-meta-diaboli"    },
    { icon: GitMerge,            name: "Hegelian Dialectics",      note: "synthesize the opposites",  skill: "ase-meta-diaboli"    },
    { icon: Scale,               name: "Weighted Decision Matrix", note: "compare alternatives",      skill: "ase-meta-evaluate"   },
    { icon: Baby,                name: "ELI5",                     note: "explain it simply",         skill: "ase-meta-eli5"       },
    { icon: Feather,             name: "KISS",                     note: "keep design simple",        skill: "ase-code-craft"      },
    { icon: Dice3,               name: "Rule of Three",            note: "abstract on third repeat",  skill: "ase-code-refactor"   },
    { icon: Broom,               name: "Boy Scout Rule",           note: "leave code cleaner",        skill: "ase-code-refactor"   },
    { icon: Waypoints,           name: "Coupling & Cohesion",      note: "focused parts, thin wires", skill: "ase-arch-analyze"    },
    { icon: Scissors,            name: "Occam's Razor",            note: "smallest fix wins",         skill: "ase-code-resolve"    },
    { icon: CircleQuestionMark,  name: "Socratic Method",          note: "question until clear",      skill: "ase-task-grill"      },
    { icon: FoldHorizontal,      name: "Diverge-Converge",         note: "widen ideas, then narrow",  skill: "ase-meta-brainstorm" },
    { icon: Users,               name: "Delphi Method",            note: "consensus of many experts", skill: "ase-meta-quorum"     },
    { icon: Presentation,        name: "Feynman Technique",        note: "explain it by analogy",     skill: "ase-code-explain"    },
    { icon: Pyramid,             name: "Inverted Pyramid",         note: "most important first",      skill: "ase-docs-distill"    },
    { icon: Grid2x2,             name: "2x2 Matrix",               note: "sort along two dimensions", skill: "ase-meta-quotes"     },
    { icon: ArrowUpDown,         name: "Ladder of Abstraction",    note: "move up and down topics",   skill: "ase-meta-proximity"  },
    { icon: Split,               name: "Divide & Conquer",         note: "split an epic into parts",  skill: "ase-task-dissect"    },
    { icon: GitCommitHorizontal, name: "Atomic Commits",           note: "one purpose per commit",    skill: "ase-repo-dissect"    },
    { icon: FlaskConical,        name: "Dry Run",                  note: "rehearse before applying",  skill: "ase-task-implement"  },
    { icon: Gavel,               name: "Peer Review",              note: "judge diff before merge",   skill: "ase-repo-review"     },
    { icon: RefreshCw,           name: "Round-Trip Engineering",   note: "keep artifacts in sync",    skill: "ase-sync-reconcile"  },
    { icon: Bomb,                name: "Blast Radius",             note: "see what a change hits",    skill: "ase-repo-diff"       },
    { icon: ShoppingCart,        name: "Make-or-Buy",              note: "reuse or roll your own",    skill: "ase-arch-discover"   },
    { icon: Target,              name: "Single Responsibility",    note: "one reason to change",      skill: "ase-code-craft"      },
    { icon: ScanSearch,          name: "Code Smells",              note: "spot known bad patterns",   skill: "ase-code-lint"       },
    { icon: TrendingUp,          name: "Big-O Analysis",           note: "cost of an algorithm",      skill: "ase-code-analyze"    },
    { icon: Flame,               name: "Code Churn",               note: "find the busiest files",    skill: "ase-code-insight"    },
    { icon: NotebookPen,         name: "Decision Records",         note: "capture the why",           skill: "ase-sync-reconcile"  },
    { icon: Tag,                 name: "Conventional Changes",     note: "standard commit log entry", skill: "ase-repo-changelog"  }
]

