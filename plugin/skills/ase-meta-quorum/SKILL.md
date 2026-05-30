---
name: ase-meta-quorum
argument-hint: "[--help|-h] <question>"
description: >
    Query Multiple AIs for Quorum Answer.
user-invocable: true
disable-model-invocation: false
effort: high
allowed-tools:
    - "Agent"
    - "TaskCreate"
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-control.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md

<skill name="ase-meta-quorum">
Query Multiple AIs for Quorum Answer
</skill>

<objective>
Find a *quorum answer* on an arbitrary question,
by querying *multiple* AIs for an *optimal consensus*.
</objective>

<flow>

1.  <step id="STEP 1: Preview Own Answer">

    Prepare the LLM query by setting <query/> to the following <template/>:

    <template>
    $ARGUMENTS.
    Please respond with facts and very concise and brief only,
    usually with just 1 to 7 corresponding bullet points and with short sentences.
    Optionally, mention potential cruxes which should be noticed.
    Beside bullet points, do not provide any additional explanations.
    Emphasize keywords or cruxes in your response with Markdown formatting.
    Format code parts with Markdown formatting.
    </template>

    For yourself (Anthropic Claude), first answer this <query/> in
    advance yourself by showing your own answer to the query as a sneak
    preview. For this, output the following <template/>:

    <template>
    **Anthropic Claude** (sneak preview in advance):
    - [...]
    - [...]
    </template>

    </step>

2.  <step id="STEP 2: Query Foreign AIs">

    <define name="agent">
    Call the `Agent` tool:

    ```text
        Agent(
            name:          "ase:ase-meta-chat",
            description:   "Query Foreign LLM: <arg1/>",
            subagent_type: "ase:ase-meta-chat",
            prompt:        "<arg2/> <query/>"
        )
    ```

    </define>

    <expand name="agent" arg1="OpenAI ChatGPT" arg2="chatgpt"></expand>
    <expand name="agent" arg1="Google Gemini"  arg2="gemini"></expand>
    <expand name="agent" arg1="DeepSeek"       arg2="deepseek"></expand>
    <expand name="agent" arg1="xAI Grok"       arg2="grok"></expand>
    <expand name="agent" arg1="Z.AI GLM"       arg2="glm"></expand>
    <expand name="agent" arg1="Alibaba Qwen"   arg2="qwen"></expand>

    You *MUST* *NOT* output anything in this step.

    </step>

3.  <step id="STEP 3: Summarize Responses">

    Agents which returned a response with an `ERROR:` prefix are
    silently skipped and are treated as not available.

    Summarize all responses, of both yourself and all available agents
    with just 1 to 7 corresponding bullet points and with short
    sentences.

    You *MUST* *NOT* output anything in this step.

    </step>

4.  <step id="STEP 4: Determine Consensus Rating">

    Determine, on a Likert scale of 0..<n/>, the amount of the overall
    consensus <c/> of all the responses. The <n/> is the *total number of
    responders* (yourself plus all available foreign AIs above).
    If all responses disagree, the consensus <c/> is zero.
    If all responses agree, <c/> is <n/>.

    If not all AIs agree, determine <disagreement/> information,
    formatted as `(disagreement: <ai/>, <ai/>, [...])` where <ai/> is a
    name of an AI which disagreed with the consensus. Else, if all AIs
    agree, set <disagreement></disagreement>.

    You *MUST* *NOT* output anything in this step.

    </step>

5.  <step id="STEP 5: Show Results">

    Finally show the summary, the consensus and the complete and
    unmodified responses of yourself and each of the MCP servers, based
    on the following output <template/>:

    <template>
    **QUESTION**:
    $ARGUMENTS

    &#x25CF; **CONSENSUS ANSWER**:
    - [...]
    - [...]

    **CONSENSUS RATE**: **<c/>/<n/>** <disagreement/>

    &#x25CB; **Anthropic Claude**:
    - [...]
    - [...]

    &#x25CB; **OpenAI ChatGPT**:
    - [...]
    - [...]

    &#x25CB; **Google Gemini**:
    - [...]
    - [...]

    &#x25CB; **DeepSeek**:
    - [...]
    - [...]

    &#x25CB; **xAI Grok**:
    - [...]
    - [...]

    &#x25CB; **Z.AI GLM**:
    - [...]
    - [...]

    &#x25CB; **Alibaba Qwen**:
    - [...]
    - [...]
    </template>

    In this output, remove the sections of those AIs which were not available.
    You *MUST* *NOT* output any further explanations yourself.

    </step>

</flow>

