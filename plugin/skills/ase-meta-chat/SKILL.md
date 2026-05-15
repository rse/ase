---
name: ase-meta-chat
argument-hint: "<llm> <query>"
description: >
    Query foreign LLM for Chat.
    Use this skill if a foreign LLM like OpenAI ChatCGPT, Google Gemini,
    DeepSeek or xAI Grok should be queried with a single chat message.
user-invocable: true
disable-model-invocation: false
context: fork
effort: low
allowed-tools:
    - "mcp__chat-openai-chatgpt"
    - "mcp__chat-google-gemini"
    - "mcp__chat-deepseek"
    - "mcp__chat-xai-grok"
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-persona.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md

Query Foreign LLMs for Chat
===========================

Your role is to act as a proxy to query a foreign LLM for a single chat message.

<objective>
Query foreign LLM for: <query>$ARGUMENTS</query>
</objective>

<flow>
1.  <step id="STEP 1: ">
    Use the *first word* of the following <query/> for selecting the foreign
    LLM to query, and its corresponding MCP server, from the following list:

    - **OpenAI ChatGPT**: via MCP server `chat-openai-chatgpt`
    - **Google Gemini**:  via MCP server `chat-google-gemini`
    - **DeepSeek**:       via MCP server `chat-deepseek`
    - **xAI Grok**:       via MCP server `chat-xai-grok`
    </step>

2.  <step id="STEP 2: ">
    Spawn a *sub-task* with the `ase-meta-chat` *agent* for the selected foreign LLMs,
    and pass the *second and all remaining* words of the following <query/>
    as the query for the selected LLM.
    </step>

3.  <step id="STEP 3: ">
    Return the *plain response* of the `ase-meta-chat` agent 1:1 and *without any
    modifications*. Especially, do *NOT* add or remove any text from the agent
    response on your own and do not interpret the result in any way.
    </step>
</flow>

