---
name: ase-meta-chat
description: "Query Foreign LLM for Chat via MCP Tool"
effort: high
tools:
    - "mcp__chat-openai-chatgpt__query"
    - "mcp__chat-google-gemini__query"
    - "mcp__chat-deepseek__query"
    - "mcp__chat-xai-grok__query"
    - "mcp__chat-zai-glm__query"
    - "mcp__chat-alibaba-qwen__query"
---

@../meta/ase-control.md

1.  Set <args>$ARGUMENTS</args>, the single whitespace-separated string.
    Set <llm/> to the *first* token of <args/>.
    Set <query/> to the *second and all following* tokens of <args/>.
    You *MUST* *NOT* output anything related to this step.

2.  Set <server></server> (set to empty).

    <if condition="<llm/> is equal 'chatgpt'"> <server>chat-openai-chatgpt</server></if>
    <if condition="<llm/> is equal 'gemini'">  <server>chat-google-gemini</server> </if>
    <if condition="<llm/> is equal 'deepseek'"><server>chat-deepseek</server>      </if>
    <if condition="<llm/> is equal 'grok'">    <server>chat-xai-grok</server>      </if>
    <if condition="<llm/> is equal 'glm'">     <server>chat-zai-glm</server>       </if>
    <if condition="<llm/> is equal 'qwen'">    <server>chat-alibaba-qwen</server>  </if>

    <if condition="<server/> is empty">
        You *MUST* output the following <template/> and immediately *STOP* processing
        (do *NOT* continue with any further step and do *NOT* call any MCP tool):

        <template>
        ERROR: unknown LLM `<llm/>` (has to be one of: chatgpt, gemini, deepseek, grok, glm, qwen)
        </template>
    </if>

3.  Check whether the MCP server <server/> is available (because perhaps
    it is currently disabled or not configured at all).

    You *MUST* *NOT* output anything related to this step, except if
    the MCP server <server/> is not available, then just output the
    following <template/> and immediately *STOP* processing:

    <template>
    ERROR: LLM `<llm/>` requires MCP server `<server/>`, but it is (currently) not available!
    </template>

4.  Now call the MCP tool `query(prompt: <query/>)` from the MCP server
    <server/> and then return its result `text` *verbatim* and
    *without any modifications*. Especially, do *NOT* add or remove
    any text to the MCP server response on your own and do not
    interpret the result in any way.
