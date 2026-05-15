---
name: ase-meta-quorum
argument-hint: "<question>"
description: >
    Query Multiple AIs for Quorum Answer.
user-invocable: true
disable-model-invocation: false
effort: medium
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-persona.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md

Query Multiple AIs for Quorum Answer
====================================

Your role is an *expert-level assistant*.

<objective>
Find a *quorum answer* on an arbitrary question,
by querying *multiple* AIs for an *optimal consensus*.
</objective>

<flow>
1.  <step id="STEP 1: Determine Own Answer">
    Determine your own answer.
    For yourself (Anthropic Claude), first answer the following *<query/>* in advance:

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
    For each of the following foreign AIs and their potentially
    available, given, corresponding MCP servers, use a *sub-task* and
    the `ase-meta-llm` *agent* to perform the above same *<query/>* zero
    or more times and in *parallel* again:

    - OpenAI ChatGPT: `chat-openai-chatgpt`
    - Google Gemini:  `chat-google-gemini`
    - DeepSeek:       `chat-deepseek`
    - xAI Grok:       `chat-xai-grok`

    Silently skip those AIs where the corresponding MCP server is not available.
    </step>

4.  <step id="STEP 4: Summarize Responses">
    Summarize all responses, of both yourself and all available MCP servers,
    with just 1 to 7 corresponding bullet points and with short sentences.
    </step>

5.  <step id="STEP 5: Determine Consensus Rating">
    Determine, on a Likert scale of 0..<n/>, the amount of the overall
    consensus <c/> of all the responses. The <n/> is 1 plus the number of
    available AIs above. If all responses disagree, the consensus <c/> is zero.
    If all responses agree, <c/> is <n/>.

    If not all AIs agree, determine a <disagreement/> information, formatted
    as `(disagreement: <ai/>, <ai/>, [...])` where <ai/> is the name of
    an AI which disagreed from the consensus.
    </step>

6.  <step id="STEP 6: Show Results">
    Finally show the summary, the consensus and the complete and unmodified responses
    of yourself and each of the MCP servers, based on the following output <template/>:

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

