##  NAME

`ase-code-triage` - Triage Vulnerability Exposure

##  SYNOPSIS

`ase-code-triage`
    [`--help`|`-h`]
    [`--why`|`-w`]
    *cve-id*|*vulnerability-hint*

##  DESCRIPTION

The `ase-code-triage` skill *triages* whether the project of the
current repository is *affected* by a vulnerability and reports the
result as a *triage verdict*: `AFFECTED`, `NOT-AFFECTED`, or
`INCONCLUSIVE`, shown in a box together with the vulnerability and the
basis of the verdict.

The vulnerability is given either by its CVE id or by a free-text
security or vulnerability description. A description is first matched
to a CVE id: either it literally contains exactly one CVE id, or a
search of the Internet/Web via the `ase-meta-search` skill yields one
single, unambiguously matching CVE id. Otherwise, the vulnerability is
triaged by the description and the facts found on the Internet/Web.

For a CVE id, the status the project has *published* for itself in its
local VEX documents decides first: a published `AFFECTED` results in
`AFFECTED`, and a published `NOT-AFFECTED` or `FIXED` results in
`NOT-AFFECTED`. A published `UNDER-INVESTIGATION`, or no published
status at all, continues the triage with the information on the CVE
id, gathered from CVE.org, NVD, EPSS, CISA KEV, OSV.dev, and the GitHub
Advisory Database.

The triage then inspects the project for the affected components and
their usage. The project is `AFFECTED` only if a vulnerable version of
an affected component is present *and* its vulnerable functionality is
used and reachable. It is `NOT-AFFECTED` if no affected component is
present, only fixed versions are present, or no usage of the vulnerable
functionality is found. Runtime, development, and build-time
dependencies count alike. It is `INCONCLUSIVE` if the affected
components or their present versions cannot be determined.

An unknown, `RESERVED`, or `REJECTED` CVE id, or a description on which
the Internet/Web yields no usable facts, results in an error and the
verdict `INCONCLUSIVE`. The skill never modifies the project.

##  OPTIONS

-   `--why`|`-w`:
    Additionally give a brief *reason* for the verdict: a VEX-style
    justification label (like `vulnerable_code_not_in_execute_path`),
    followed by one or two sentences citing the decisive evidence.

##  ARGUMENTS

-   *cve-id*:
    The CVE id of the vulnerability, like `CVE-2021-44228`
    (case-insensitive).

-   *vulnerability-hint*:
    A free-text description of the security vulnerability, like
    `remote code execution via JNDI lookups in Log4j`.

##  SCENARIOS

-   You want to know whether your project is affected by a just published CVE
-   You heard of a vulnerability without a CVE id and want to know whether it concerns your project
-   You want a vulnerability report of a scanner confirmed or dismissed with a reason

##  EXAMPLES

Triage a vulnerability given by its CVE id:

```text
❯ /ase-code-triage CVE-2021-44228
```

Triage a vulnerability given by a description, with a reason:

```text
❯ /ase-code-triage --why prototype pollution in lodash merge
```

##  SEE ALSO

[`ase-code-analyze`](../ase-code-analyze/help.md), [`ase-code-lint`](../ase-code-lint/help.md), [`ase-meta-search`](../ase-meta-search/help.md), [`ase-repo-review`](../ase-repo-review/help.md).
