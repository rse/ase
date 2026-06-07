
##  NAME

`ase-meta-quorum` - Query Multiple AIs for Quorum Answer

##  SYNOPSIS

`ase-meta-quorum`
    [`--help`|`-h`]
    [`--models`|`-m` *model*[,...]]
    *question*

##  DESCRIPTION

The `ase-meta-quorum` skill finds a *quorum answer* on an arbitrary
question by querying *multiple* AIs (Anthropic Claude itself plus
OpenAI ChatGPT, Google Gemini, DeepSeek, xAI Grok, Z.AI GLM, and
Alibaba Qwen) for an *optimal consensus*.

The skill first previews its own answer, then dispatches the same
query to each available foreign LLM via the `ase:ase-meta-chat`
sub-agent, summarizes all responses, derives a *consensus rate* on
a Likert scale of `0..N` (where `N` is the number of available
responders), and reports the consensus answer alongside the
complete, unmodified individual responses.

##  OPTIONS

`--models`|`-m` *model*[,...]:
    Restrict the *foreign* LLMs that are queried to the given
    comma-separated list of *model* tokens. Recognized tokens are
    `all`, `chatgpt`, `gemini`, `deepseek`, `grok`, `glm`, and `qwen`,
    where `all` selects every model. The default is `all`. Models that
    are not selected (or not available) are *silently skipped*.
    Anthropic Claude (the skill itself) is *always* included,
    independent of this option.

##  ARGUMENTS

*question*:
    The question to ask all available AIs.

##  EXAMPLES

Ask the quorum a factual question:

```text
❯ /ase-meta-quorum What are the most common causes of memory leaks in Node.js?
```

Ask only a subset of the foreign models:

```text
❯ /ase-meta-quorum --models chatgpt,gemini,grok Which sorting algorithm is fastest in practice?
```

##  SEE ALSO

`ase-meta-chat`, `ase-meta-search`, `ase-meta-evaluate`.
