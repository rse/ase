
##  NAME

`ase-meta-diaboli` - Play "Devil's Advocate" (latin: "Advocatus Diaboli")

##  SYNOPSIS

`ase-meta-diaboli`
    [`--help`|`-h`]
    [`--count`|`-c` *count*]
    *thesis*

##  DESCRIPTION

The `ase-meta-diaboli` skill plays *Devil's Advocate* (latin:
*Advocatus Diaboli*) by relentlessly challenging or criticising a
supplied *thesis*. It applies a disciplined set of critical-thinking
tenets - steelmanning, stress-testing fundamentals, surfacing implicit
assumptions, demanding proportional evidence, seeking disconfirming
cases, *Reductio Ad Absurdum*, exposing hidden costs, and pre-mortem
thinking - while targeting the claim rather than its proponent and
yielding where the argument genuinely holds.

The skill iterates until it has found at least *count* anti-theses
(counter-arguments) each ranked at least 7 on a 0 (weak) to 10
(strong) Likert scale, reports the top *count* sorted from strongest to
weakest, and finally applies *Hegelian dialectics* (*Thesis* +
*Antithesis* → *Synthesis*) to derive a single-sentence *SYNTHESIS*
that preserves what is true in both the thesis and its antitheses
while discarding what is false.

The `--count`/`-c` *count* option sets the minimum number of strong
anti-theses to surface (default *10*), raising or lowering the floor of
counter-arguments hunted for, sorted, and reported in the single
challenge pass. A `0`, negative, or non-numeric value falls back to the
default *10*.

The intent is constructive: stress-testing the thesis in good faith to
arrive at a better final decision, not obstructing or merely being
contrarian.

##  ARGUMENTS

`--count`, `-c` *count*:
    Surface at least *count* strong anti-theses (default *10*) before
    sorting and reporting the top *count* and deriving the *SYNTHESIS*. An
    invalid or non-positive *count* reverts to the default *10*.

*thesis*:
    The statement, claim, or position to be relentlessly challenged.
    It may be technical, factual, or opinion-based; the skill attacks
    its strongest ("steelman") interpretation.

##  EXAMPLES

Challenge a technology-choice claim:

```text
❯ /ase-meta-diaboli HAPI is the best REST framework
```

Stress-test a design decision:

```text
❯ /ase-meta-diaboli We should rewrite the service in Rust.
```

Surface at least fifteen anti-theses:

```text
❯ /ase-meta-diaboli --count 15 We should rewrite the service in Rust.
```

##  SEE ALSO

`ase-meta-why`, `ase-meta-evaluate`, `ase-meta-quorum`,
`ase-meta-persona`.

