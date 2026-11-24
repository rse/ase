# ase-util-cve(1) -- Gather the Information on a Vulnerability

## SYNOPSIS

`ase util cve`
\[`-h`|`--help`\]
\[`-f`|`--format` `md`|`yaml`|`json`\]
*cve-id*

## DESCRIPTION

**ase util cve** gathers all available information on a vulnerability,
given by its *cve-id*, from the following public sources, merges it into
one normalized record, and prints it to standard output:

- *CVE.org*:
  The CVE record of the assigning CNA and of the ADPs, especially the
  *CISA Vulnrichment* with its CVSS scores and SSVC decisions.

- *NIST NVD*:
  The NVD analysis status, CVSS scores, CWE weaknesses, and CPE
  platforms.

- *FIRST EPSS*:
  The probability of exploitation within the next 30 days and its
  percentile.

- *CISA KEV*:
  The entry of the *Known Exploited Vulnerabilities* catalog.

- *OSV.dev* and *GitHub Advisory Database*:
  The related advisories and the affected and patched package versions.

The record covers the state, dates, title, description, rejection
reason, CVSS scores (with their providers), SSVC decisions, EPSS score,
KEV entry, weaknesses, impacts, affected products, packages, and
platforms, solutions, workarounds, exploits, advisories, credits, and
references. A source which cannot be queried does not fail the
command, but is reported as a warning on standard error and in the
`warnings` of the record. A `REJECTED` *cve-id* results in a record
with its rejection reason. The *CISA KEV* catalog is cached for 6
hours. This backs the MCP tool `ase_cve`.

## OPTIONS

- \[`-h`|`--help`\]:
  Show usage information and exit.

- \[`-f`|`--format` `md`|`yaml`|`json`\]:
  Output format of the record: Markdown, YAML, or JSON (default: `md`).

## ARGUMENTS

- *cve-id*:
  The CVE id of the vulnerability, like `CVE-2021-44228` (case-insensitive).

## FILES

- `cve-kev.json`:
  The cached *CISA KEV* catalog, located in the *ASE* user state
  directory.

## EXIT STATUS

Exits with status `0` on success, and with status `1` if *cve-id* is
invalid, unknown, or still `RESERVED`, or if no source could be queried.

## EXAMPLES

```sh
# gather the information on a vulnerability as Markdown
$ ase util cve CVE-2021-44228

# gather the information on a vulnerability as JSON
$ ase util cve -f json CVE-2024-3094
```

## SEE ALSO

`ase`(1), `ase-util`(1).

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>
