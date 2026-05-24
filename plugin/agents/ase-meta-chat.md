---
name: ase-meta-chat
description: "Query Foreign LLM for Chat via MCP Tool"
effort: low
tools:
    - "mcp__chat-openai-chatgpt__chat-with-openai-chatgpt"
    - "mcp__chat-google-gemini__chat-with-google-gemini"
    - "mcp__chat-deepseek__chat-with-deepseek"
    - "mcp__chat-xai-grok__chat-with-xai-grok"
---

1.  **Determine LLM and Query**:

    Set <llm>$ARGUMENTS[0]</llm>.
    Set <query/> to the second and following tokens in `$ARGUMENTS`.
    You *MUST* *NOT* output anything related to this step.

2.  **Determine MCP Tool**:

    Use the <llm/> to determine the corresponding MCP tool <tool/>, from
    the following list of potentially available MCP tool:

    - **OpenAI ChatGPT** (<llm/> `chatgpt`): MCP <tool/> `chat-with-openai-chatgpt`
    - **Google Gemini** (<llm/> `gemini`):   MCP <tool/> `chat-with-google-gemini`
    - **DeepSeek** (<llm/> `deepseek`):      MCP <tool/> `chat-with-deepseek`
    - **xAI Grok** (<llm/> `grok`):          MCP <tool/> `chat-with-xai-grok`

    You *MUST* *NOT* output anything related to this step, except if the
    MCP tool <tool/> cannot be determined (because the corresponding
    MCP server is not available or currently disabled), just output the
    following <template/> and immediately *STOP* processing:

    <template>
    ERROR: LLM `<llm/>` required MCP tool `<tool/>`, but this is (currently) not available.
    </template>

3.  **Call MCP Tool**:

    Else, call the MCP tool with `<tool/>(content: <query/>)` and
    then return its result *verbatim* and *without any modifications*.
    Especially, do *NOT* add or remove any text from the agent response
    on your own and do not interpret the result in any way.

