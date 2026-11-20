
##  NAME

`ase-meta-steelman` - Build the "Steelman" Argument

##  SYNOPSIS

`ase-meta-steelman`
    [`--help`|`-h`]
    [`--count`|`-c` *count*]
    [`--rounds`|`-r` *rounds*]
    [`--ground`|`-G`]
    *thesis*

##  DESCRIPTION

The `ase-meta-steelman` skill builds the strongest possible case
*for* a supplied *thesis* - the constructive mirror of its adversarial
counterpart `ase-meta-diaboli`. It applies a disciplined set of
constructive-thinking tenets - charitable interpretation, strengthening
the fundamentals, surfacing the enabling assumptions, supplying
proportional evidence, seeking confirming cases, *Reductio Ad Bonum*,
surfacing the upside, and pre-parade thinking - while crediting the
claim rather than the proponent's authority and conceding where the
thesis genuinely falls short.

The skill iterates until it has found at least *count* pro-theses
(supporting arguments) each ranked at least 7 on a 0 (weak) to 10
(strong) Likert scale (or until it has checked *count* x 5 candidates,
then surfacing the highest-ranked ones regardless), reports the top
*count* sorted from strongest to weakest, and finally consolidates them (*Thesis* + *Pro-Theses* →
*Fortification*) to derive a single-sentence *FORTIFICATION* that
consolidates everything genuinely strengthening the thesis while
honestly bounding where it holds.

The `--rounds`/`-r` *rounds* option turns the single defense pass into an
*iterative chain* of *rounds* rounds (default *1*): each round's
*FORTIFICATION* becomes the *thesis* of the next round, so the position
is progressively re-fortified and sharpened. A `0`, negative, or
non-numeric value falls back to the default *1*; with a single round the
output is identical to running without the option.

The `--count`/`-c` *count* option sets the minimum number of strong
pro-theses to surface (default *10*), raising or lowering the floor of
supporting arguments hunted for, sorted, and reported in each defense
pass. A `0`, negative, or non-numeric value falls back to the default
*10*.

By default, the pro-theses are derived from model knowledge only. With
the `--ground`/`-G` option, the skill first gathers facts on the
*thesis* from the project artifacts and the Internet/Web, prefers
pro-theses backed by them, and tags every pro-thesis with its evidence
or as unverified.

The intent is constructive: building the best honest case for the
thesis to arrive at a better final decision, not overselling or merely
cheerleading.

##  OPTIONS

-   `--count`|`-c` *count*:
    Surface at least *count* strong pro-theses (default *10*) per defense
    pass before sorting and reporting the top *count* and deriving the
    *FORTIFICATION*. An invalid or non-positive *count* reverts to the
    default *10*.

-   `--rounds`|`-r` *rounds*:
    Run *rounds* iterative defense rounds (default *1*), feeding each
    round's *FORTIFICATION* in as the next round's *thesis*. An invalid
    or non-positive *rounds* reverts to the default *1*.

-   `--ground`|`-G`:
    Ground the defense in facts instead of the world knowledge of the
    model alone: once before the first round, the requirements and the
    realization of the project (its specification, documentation, code,
    and infrastructure files) are scanned for the facts relevant to the
    *thesis*, and the Internet/Web is searched for them. These facts
    serve all rounds: pro-theses backed by them are preferred,
    contradicted ones are discarded, and every pro-thesis is tagged with
    its evidence (file path or source URL) or as `[unverified]`. If no
    usable facts are found, a warning is shown and the defense falls
    back to model knowledge.

##  ARGUMENTS

-   *thesis*:
    The statement, claim, or position to be charitably strengthened.
    It may be technical, factual, or opinion-based; the skill defends
    its strongest ("steelman") interpretation.

##  SCENARIOS

-   You want the strongest possible case built for a thesis
-   You want supporting arguments ranked plus a fortification
-   You want a charitable defense before pitching a decision
-   You want supporting arguments backed by evidence from the project and the Web

##  EXAMPLES

Strengthen a technology-choice claim:

```text
❯ /ase-meta-steelman HAPI is the best REST framework
```

Build the case for a design decision:

```text
❯ /ase-meta-steelman We should rewrite the service in Rust.
```

Strengthen across five iterative rounds:

```text
❯ /ase-meta-steelman --rounds 5 We should rewrite the service in Rust.
```

Build the case with evidence from the project artifacts and the
Internet/Web:

```text
❯ /ase-meta-steelman --ground Our task store scales to thousands of tasks.
```

##  SEE ALSO

[`ase-meta-diaboli`](../ase-meta-diaboli/help.md), [`ase-meta-why`](../ase-meta-why/help.md), [`ase-meta-evaluate`](../ase-meta-evaluate/help.md),
[`ase-meta-quorum`](../ase-meta-quorum/help.md).
