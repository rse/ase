
##  NAME

`ase-meta-chat` - Query Foreign LLM for Chat

##  SYNOPSIS

`ase-meta-chat`
    [`--help`|`-h`]
    *llm* *query*

##  DESCRIPTION

The `ase-meta-chat` skill queries a *foreign LLM* (such as OpenAI
ChatGPT, Google Gemini, DeepSeek, xAI Grok, Z.AI GLM, Alibaba Qwen,
Anthropic Claude, OpenAI Codex, or GitHub Copilot) with a single chat
message. The underlying `ase:ase-meta-chat`
sub-agent is invoked and its plain response is shown back verbatim
without any further interpretation.

##  ARGUMENTS

-   *llm*:
    Identifier of the foreign LLM to query; one of `chatgpt`,
    `gemini`, `deepseek`, `grok`, `glm`, `qwen`, `claude`, `codex`,
    or `copilot`.

-   *query*:
    The chat message to send to the foreign LLM.

##  SCENARIOS

-   You want a single question answered by one specific foreign LLM
-   You want an answer from ChatGPT, Gemini, DeepSeek, Grok, GLM, or Qwen
-   You want a second opinion from exactly one other model, verbatim

##  EXAMPLES

Ask ChatGPT a quick question:

```text
❯ /ase-meta-chat chatgpt What is the best way to handle UTF-8 BOMs in JSON?
```

Ask Gemini for a brief comparison:

```text
❯ /ase-meta-chat gemini Compare gRPC and REST in one paragraph.
```

##  SEE ALSO

[`ase-meta-quorum`](../ase-meta-quorum/help.md), [`ase-meta-search`](../ase-meta-search/help.md).
