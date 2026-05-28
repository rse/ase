---
name: ase-code-analyze
argument-hint: "[--help|-h] <source-reference>"
description: >
    Analyze the source code for problems in the logic and semantics and its related control flow.
user-invocable: true
disable-model-invocation: false
effort: high
allowed-tools:
    - "Agent"
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-control.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md

<skill name="ase-code-analyze">
Analyze Source Code
</skill>

<objective>
*Analyze* the source code of $ARGUMENTS, and its directly related source
code, for problems in its *logic* and *semantics* and its related
*control flow*.
</objective>

<flow>

1.  <step id="STEP 1: Investigate Code Base">
    In this STEP 1, investigate on the code. If the code base is large,
    you *MUST* use the `Agent` tool (not inline work) to create multiple
    sub-agents to split the investigation task into appropriate chunks.

    Tenets:

    -   **Quiet Operation**:
        During investigation in this STEP 1, do *not* output anything else,
        especially do not give any further explanations or information.

    -   **Practical Relevance Only**:
        Focus on *practically relevant* cases and especially do *not*
        investigate theoretical or fictive cases.

    -   **Problem Focus Only**:
        Still focus on the *problem only* and do *not* already
        investigate any possible *solution*.
    </step>

2.  <step id="STEP 2: Show Results">
    In this STEP 2, for every detected problem, immediately report it
    with the following output <template/>, based on concise bullet
    points.

    <template>
    &#x1F7E0; PROBLEM (Severity: **<severity/>**): **P<n/>**: **<title/>**

    <description/>
    </template>

    Hints:

    -   For the final results, do *not* output anything else, especially do
        *not* give any further explanations or information.

    -   Uniquely identify the problems with `P<n/>` where <n/> is 1, 2, ...

    -   In <description/>, use *ultra brief* but still as *precise* as
        possible problem descriptions.

    -   In <description/>, highlight *code* as <template>`<code/>`</template>
        and *key aspects* as <template>*<aspect/>*</template>.

    -   In <description/>, add inline *references* to the related
        code positions in the form of either
        <template>(`<filename/>:<line-number/>`)</template>,
        <template>(`<filename/>:<line-number/>-<line-number/>`)</template> or
        <template>(`<filename/>#<function-or-method/>`)</template>.

    -   In <description/>, classify the problem with a <severity/>
        of <template>LOW</template>, <template>MEDIUM</template> or
        <template>HIGH</template>.

    -   *Additionally*, persist all reported problems in a *single*
        `ase_kv_batch` call to the `ase` MCP server with `transactional`
        set to `true`. The `commands` parameter array of this call
        starts with one `{ command: "clear" }` entry, followed by one
        `{ command: "set", key: "ase-issue-P<n/>", val: "<title/>:
        <description/>" }` entry per reported problem.
    </step>

3.  <step id="STEP 3: Give Final Hint">
    Finally, in this STEP 3, output the following <template/> to give a
    final hint:

    <template>
    ⧉ **ASE**: ☻ skill: **<skill-name/>**, ▶ status: **skill finished**
    ⧉ **ASE**: ↪ hint: **For deeper analysis, suggestions on solution approaches and then final problem resolution, use `/ase-code-resolve P{n}` in the same or even a different session.**
    </template>
    </step>

</flow>

