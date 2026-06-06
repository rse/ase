
##  NAME

`ase-meta-steelman` - Build the "Steelman" Argument

##  SYNOPSIS

`ase-meta-steelman`
    [`--help`|`-h`]
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

The skill iterates until it has found at least ten pro-theses
(supporting arguments) each ranked at least 7 on a 0 (weak) to 10
(strong) Likert scale, reports the top ten sorted from strongest to
weakest, and finally consolidates them (*Thesis* + *Pro-Theses* →
*Fortification*) to derive a single-sentence *FORTIFICATION* that
consolidates everything genuinely strengthening the thesis while
honestly bounding where it holds.

The intent is constructive: building the best honest case for the
thesis to arrive at a better final decision, not overselling or merely
cheerleading.

##  ARGUMENTS

*thesis*:
    The statement, claim, or position to be charitably strengthened.
    It may be technical, factual, or opinion-based; the skill defends
    its strongest ("steelman") interpretation.

##  EXAMPLES

Strengthen a technology-choice claim:

```text
❯ /ase-meta-steelman HAPI is the best REST framework
```

Build the case for a design decision:

```text
❯ /ase-meta-steelman We should rewrite the service in Rust.
```

##  SEE ALSO

`ase-meta-diaboli`, `ase-meta-why`, `ase-meta-evaluate`,
`ase-meta-quorum`.
