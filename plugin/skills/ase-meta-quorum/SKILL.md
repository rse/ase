---
name: ase-meta-quorum
argument-hint: "<question>"
description: >
    Query Multiple AIs for Quorum Answer.
user-invocable: true
disable-model-invocation: false
effort: medium
allowed-tools:
    - "Agent"
    - "TaskCreate"
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-control.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md

Query Multiple AIs for Quorum Answer
====================================

<skill name="ase-meta-quorum">
Query Multiple AIs for Quorum Answer
</skill>

<role>
Your role is an *expert-level assistant*.
</role>

<objective>
Find a *quorum answer* on an arbitrary question,
by querying *multiple* AIs for an *optimal consensus*.
</objective>

<flow>

1.  <step id="STEP 1: Determine Own Answer">

    Determine your own answer.
    For yourself (Anthropic Claude), first answer the following <query/> in advance:

    <query>
    $ARGUMENTS.
    Please respond with facts and very concise and brief only,
    usually with just 1 to 7 corresponding bullet points and with short sentences.
    Optionally, mention potential cruxes which should be noticed.
    Beside bullet points, do not provide any additional explanations.
    Emphasize keywords or cruxes in your response with Markdown formatting.
    Format code parts with Markdown formatting.
    </query>
    </step>

2.  <step id="STEP 2: Preview Own Answer">

    Show your own answer as a sneak preview.
    For this, use the following output <template/>:

    <template>
    **Anthropic Claude** (sneak preview in advance):
    - [...]
    - [...]
    </template>

    </step>

3.  <step id="STEP 3: Query Foreign AIs">

    <define name="agent">
    Call the `Agent` tool:

    ```text
        Agent(
            name:          "ase:ase-meta-chat",
            description:   "Query Foreign LLM for Chat",
            subagent_type: "ase:ase-meta-chat",
            prompt:        "<content/> <query/>"
        )
    ```
    </define>

    <expand name="agent">chatgpt</expand>
    <expand name="agent">gemini</expand>
    <expand name="agent">deepseek</expand>
    <expand name="agent">grok</expand>

    </step>

4.  <step id="STEP 4: Summarize Responses">

    Summarize all responses, of both yourself and all agents (which
    returned not a response with an `ERROR`), with just 1 to 7
    corresponding bullet points and with short sentences. Agents which
    returned a response with an `ERROR` are silently skipped as they
    would be not available.

    </step>

5.  <step id="STEP 5: Determine Consensus Rating">

    Determine, on a Likert scale of 0..<n/>, the amount of the overall
    consensus <c/> of all the responses. The <n/> is the *total number of
    responders* (yourself plus all available foreign AIs above).
    If all responses disagree, the consensus <c/> is zero.
    If all responses agree, <c/> is <n/>.

    If not all AIs agree, determine <disagreement/> information,
    formatted as `(disagreement: <ai/>, <ai/>, [...])` where <ai/> is a
    name of an AI which disagreed with the consensus. Else, if all AIs
    agree, set <disagreement></disagreement>.

    </step>

6.  <step id="STEP 6: Show Results">

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
    </template>

    In this output, remove the sections of those AIs which were not available.

    </step>

</flow>

