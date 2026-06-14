
##  NAME

`ase-meta-compat` - Self-Test ASE Compatibility

##  SYNOPSIS

`ase-meta-compat`
    [`--help`|`-h`]

##  DESCRIPTION

The `ase-meta-compat` skill *self-tests* how faithfully the current LLM
(and its harness) executes the four *core interpreter primitives* that
every ASE skill silently relies on, and reports an overall *0%…100%
compatibility* rating. ASE skills are not run by a conventional
interpreter - they are interpreted by the *model itself*, which must honor
control-flow constructs, substitute XML placeholders, evaluate regex
conditions, and perform arithmetic. If a model cannot execute these
primitives reliably, *every* ASE skill silently misbehaves, so this skill
lets a user measure the fit *before* relying on ASE.

The skill is both the *test definition* and the *system under test*. It
probes four capability categories:

- *XML Placeholders*: the get (`<x/>`) and set (`<x>v</x>`) semantics,
  including the get-and-set composite, indexed names, and XML-entity
  rendering.

- *Control Flow*: the `<if>`/`<elseif>`/`<else>`, `<while>`/`<break>`,
  `<for>`, `<step condition=…>`, and `<expand>`/`<define>` constructs.

- *Regex Matching*: the patterns ASE genuinely uses (e.g. the getopt
  short-circuit `(^|\s)-`), plus anchoring, alternation, and captures.

- *Arithmetic*: counter increments, decision-matrix product-sums,
  percentage rounding, and bar-width computations.

Each *probe* embeds a construct with a *known expected result*; the model
executes it and honestly self-checks its actual result against the
expected one. Per-category pass-rates are combined into the overall rating
via the `ase_decision_matrix` MCP tool as a *weighted average*, with
*XML Placeholders* weighted `4.00` (the backbone of every skill),
*Control Flow* weighted `3.00`, *Regex Matching* weighted `2.00`, and
*Arithmetic* weighted `1.00`. The
result is a boxed per-category table (passes and percentage per category),
a final *OVERALL COMPATIBILITY* percentage, and a one-line *VERDICT*
(`✓ fully compatible` at `≥ 90%`, `⚠ partially compatible` at `60–89%`,
`✘ incompatible` below `60%`) that names any failed probes.

##  ARGUMENTS

The `ase-meta-compat` skill takes no arguments (besides `--help`|`-h`). It
always runs the most rigorous self-test, with 6 *probes per category*
(7 for *Regex Matching*), for 25 probes in total.

##  EXAMPLES

Run the compatibility self-test:

```text
❯ /ase-meta-compat
```

##  SEE ALSO

[`ase-meta-evaluate`](../ase-meta-evaluate/help.md), [`ase-meta-quorum`](../ase-meta-quorum/help.md), [`ase-meta-why`](../ase-meta-why/help.md).
