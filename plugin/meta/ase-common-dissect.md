
Dissect Skill Common Steps
==========================

<define name="dissect-derive">

*Dissect* <content/> into *cohesive parts* by strictly honoring the
following ruleset:

1.  *Separate domain-wise and logically*: every part *MUST* be a
    *self-contained* unit of work with a *single*, coherent purpose (one
    domain, one concern, one logical change), so it can be implemented,
    reviewed, and committed entirely *on its own*. A *technical* split
    -- one part per file, per directory, per file type, or per technical
    layer -- is usually *not* the obvious and intended one: files are
    merely *where* the change lands, while a part is defined by *what*
    it achieves. Cut along the *semantics* first, and let a file-wise
    boundary result only when it *coincides* with a domain boundary.

2.  *Bound the part count*: derive at least *2* and at most
    *<getopt-option-max-parts/>* parts. Prefer *fewer* and *larger*
    cohesive parts over *many* and *tiny* ones.

3.  *Assign totally and disjointly*: *every* input element of the epic
    *MUST* be assigned to *exactly one* part -- no input element is
    dropped, and no input element occurs in two parts. An input element
    which itself spans *multiple* domains or concerns *MAY* be *split*
    into two or more *sub-elements*, which are then assigned like
    ordinary input elements, provided the sub-elements *together* cover
    the original element *completely*, *never* overlap, and each one
    stays *self-contained* in the input form the calling skill defines.
    Split *only* when rule 1 forces it: an input element whose content
    fits a *single* part stays *unsplit*.

4.  *Keep mutually dependent elements together*: input elements which
    only make sense *together* -- they reference each other, one is the
    precondition of the other, or splitting them would leave a part
    broken -- *MUST* land in the *same* part.

5.  *Never invent*: parts are formed *exclusively* from the input
    elements of the epic. Do *not* add scope, do *not* re-interpret the
    input elements, and do *not* re-word them beyond what a part-local
    summary requires.

6.  *Slug and identify every part*: per part derive a <feature-slug/>
    from its scope, matching the regexp `^[a-z][a-z0-9-]{0,23}$` and
    *unique* across all parts, and then set
    <part-id><arg3/>-<feature-slug/></part-id>, where <arg3/> is the
    *id prefix* the calling skill passed in.

7.  *Order for implementation*: order the parts so that a part *never*
    depends on a later one, and number them consecutively as <part-no/>,
    starting at `1`.

8.  *Honor the dissection hint*:
    <if condition="<arg2/> is not empty">
    Set <hint><arg2/></hint>. The user explicitly stated *how* the epic
    should be split -- e.g. which input elements belong together, along
    which axis to cut, or how many parts to aim at -- so you *MUST*
    follow this <hint/> as closely as possible and let it *override* the
    default grouping of rule 1. It *MUST NOT* override the rules 2-7,
    though: the part count stays bounded, the assignment stays total and
    disjoint, mutually dependent elements stay together, nothing is
    invented, every part stays uniquely slugged, and the order stays
    dependency-free. If the <hint/> conflicts with one of these rules,
    honor the rule and follow the <hint/> only as far as the rule
    permits.
    </if>
    <else>
    No dissection hint was given, so the grouping follows the rules 1-7
    alone. Do not output anything.
    </else>

Per part, additionally derive an *ultra brief* <scope/> (*what* the part
covers) and an *ultra brief* <rationale/> (*why* exactly these input
elements form *one* cohesive part). Store the resulting parts in
<parts/> and their number in <n/>.

<if condition="fewer than 2 cohesive parts exist">
The epic is *not* dissectable, because it carries a *single* cohesive
purpose (or too few input elements) and splitting it would only produce
artificial fragments. Only output the following <template/> and then
immediately *STOP* processing the entire current skill:

<template>
⧉ **ASE**: ✪ skill: **<arg1/>**, ▶ status: **epic not dissectable**
</template>
</if>

</define>

<define name="dissect-report">

Report the derived <parts/> with the following <template/>, emitting
*one* table row per part in <parts/>, in their derived order. Keep
<scope/> and <rationale/> each to *one* ultra brief sentence, align all
column edges of the table, and do *not* output any further explanation.

Output this <template/> as *plain reply text* (*NEVER* through a tool
call, like a `printf` or `echo` via `Bash`, as a tool result is *not*
shown to the user), and output it *before* any tool call of the next
step, so the report is visible ahead of the actions it announces:

<template>
<ase-tpl-head title="DISSECTION" subtitle="<arg1/>"/>

| Part            | Id           | Scope    | Rationale    |
| --------------- | ------------ | -------- | ------------ |
| **P<part-no/>** | `<part-id/>` | <scope/> | <rationale/> |
| [...]           | [...]        | [...]    | [...]        |

<ase-tpl-foot title="DISSECTION" subtitle="<arg1/>"/>
</template>

</define>
