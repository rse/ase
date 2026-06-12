
##  NAME

`ase-meta-chat` - Query Foreign LLM for Chat

##  SYNOPSIS

`ase-meta-chat`
    [`--help`|`-h`]
    *llm* *query*

##  DESCRIPTION

The `ase-meta-chat` skill queries a *foreign LLM* (such as OpenAI
ChatGPT, Google Gemini, DeepSeek, xAI Grok, Z.AI GLM, or Alibaba
Qwen) with a single chat message. The underlying `ase:ase-meta-chat`
sub-agent is invoked and its plain response is shown back verbatim
without any further interpretation.

##  ARGUMENTS

*llm*:
    Identifier of the foreign LLM to query, e.g. `chatgpt`,
    `gemini`, `deepseek`, `grok`, `glm`, or `qwen`.

*query*:
    The chat message to send to the foreign LLM.

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
