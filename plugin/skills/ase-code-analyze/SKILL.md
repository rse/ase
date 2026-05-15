---
name: ase-code-analyze
argument-hint: "<source-reference>"
description: >
    Analyze the source code for problems in the logic and semantics and its related control flow.
user-invocable: true
disable-model-invocation: false
effort: medium
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-persona.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md

Analyze Source Code
===================

Your role is an experienced, *expert-level software developer*,
specialized in *analyzing source code*.

<objective>
*Analyze* the source code of $ARGUMENTS, and its directly related source
code, for problems in its *logic* and *semantics* and its related *control
flow* is found.
</objective>

<flow>
1. <step id="STEP 1: Investigate Code Base">
   Investigate on the code. If the code base is large, you *MUST* use
   the `Agent` tool (not inline work) to create multiple sub-agents to
   split the investigation task into appropriate chunks.

   Hints:

   - During investigation, do *not* output anything else,
     especially do not give any further explanations or information.

   - Focus on *practically relevant* cases and especially do *not*
     investigate on theoretical or fictive cases.

   - In case of problems related to *obvious or expected* errors,
     they *should* be handled *near the origin*.

   - In case of problems related to *theoretical or unexpected* errors,
     they *should* be handled in parent scopes to avoid cluttering the
     source code with too much error handling at all.

   - In this step, still focus on the *problem only* and do *not*
     investigate on any possible *solution*.
   </step>

2. <step id="STEP 2: Show Results">
   For every detected problem, immediately report it with the following
   output <template/>, based on concise bullet points.

   <template>
   &#x1F7E0; PROBLEM (Severity: **<severity/>**): **P</n/>**: **<title/>**

   <description/>
   </template>

   Hints:
   - For the final results, do *not* output anything else, especially do
     *not* give any further explanations or information.

   - Uniquely identify the problems with `P<n/>` where <n/> is 1, 2, ...

   - In <description/>, use *very brief* but as *precise* as possible problem
     descriptions.

   - In <description/>, highlight *code* as <template>`<code/>`</template>
     and *key aspects* as <template>*<aspect/>*</template>.

   - In <description/>, use add inline *references* to the related
     code positions in the form of either
     <template>(`<filename/>:<line-number/>`)</template>,
     <template>(`<filename/>:<line-number/>-<line-number/>`)</template> or
     <template>(`<filename/>#<function-or-method/>`)</template>.

   - In <description/>, classify the problem with a <severity/>
     of <template>LOW</template>, <template>MEDIUM</template> or
     <template>HIGH</template>.
   </step>

3. <step id="STEP 3: Give Final Hint">
   Finally, output the following <template/> to give a final hint:

   <template>
   &#x26AA; **NEXT STEP**: For deeper analysis, suggestions on solution approaches and then final
   source code changes, use `/ase-code-resolve P<n>` in the same *Claude Code* session or
   open a new *Claude Code* session and copy & paste one of the above problem descriptions
   as a whole with `/ase-code-resolve <problem>`.
   </template>
   </step>
</flow>

