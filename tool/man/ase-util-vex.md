# ase-util-vex(1) -- Determine the Published VEX Status of the Project

## SYNOPSIS

`ase util vex`
\[`-h`|`--help`\]
\[`-f`|`--format` `md`|`yaml`|`json`\]
*cve-id*

## DESCRIPTION

**ase util vex** determines the status the current project has
published for itself on a vulnerability, given by its *cve-id*, from
the *Vulnerability Exploitability eXchange* (VEX) documents of the
project, and prints it as a record to standard output. Only local files
are read; no network service is contacted.

The VEX documents are the files below the project root (honoring the
Git exclude rules) named `*.vex.json`, `*.openvex.json`, `*.cdx.json`,
`bom.json`, `*.csaf.json`, `*.spdx.json`, `*.spdx3.json`, or `*.jsonld`,
plus all `*.json` files below a directory named `.vex`, `vex`,
`.openvex`, `openvex`, or `csaf`. Their format is detected from their
content: *CSAF* 2.0/2.1, *CycloneDX*, *OpenVEX*, or *SPDX* 3.

A statement of a document concerns the project only if its product is
the *npm* package of the `package.json` file (`pkg:npm/`*name*) or the
*GitHub* repository of the Git remote `origin` (`pkg:github/`*owner*`/`*repo*)
of the project, ignoring the version, and if a version or version range
of the product covers the current version of the `package.json` file.
Of all such statements, the newest one decides, and among equally
recent ones the worst case (`AFFECTED` before `UNDER INVESTIGATION`
before `FIXED` before `NOT AFFECTED`).

The statuses of the formats are mapped onto the following verdicts:

- `NOT AFFECTED`:
  *OpenVEX* `not_affected`, *CycloneDX* `not_affected` and
  `false_positive`, *CSAF* `known_not_affected`, *SPDX* `doesNotAffect`.

- `AFFECTED`:
  *OpenVEX* `affected`, *CycloneDX* `exploitable`, *CSAF*
  `known_affected`, `first_affected`, and `last_affected`, *SPDX*
  `affects`.

- `FIXED`:
  *OpenVEX* `fixed`, *CycloneDX* `resolved` and `resolved_with_pedigree`,
  *CSAF* `fixed` and `first_fixed`, *SPDX* `fixedIn`.

- `UNDER INVESTIGATION`:
  *OpenVEX* `under_investigation`, *CycloneDX* `in_triage`, *CSAF*
  `under_investigation`, *SPDX* `underInvestigationFor`.

- `UNKNOWN`:
  *CSAF* `unknown`, or no statement on the project at all.

The record covers the verdict, the identities and version of the
project, all statements concerning the project (decisive one first,
with their status, product, justification or action, timestamp, and
document), all found VEX documents, and warnings, e.g. on unparsable
documents. This backs the MCP tool `ase_vex`.

## OPTIONS

- \[`-h`|`--help`\]:
  Show usage information and exit.

- \[`-f`|`--format` `md`|`yaml`|`json`\]:
  Output format of the record: Markdown, YAML, or JSON (default: `md`).

## ARGUMENTS

- *cve-id*:
  The CVE id of the vulnerability, like `CVE-2021-44228` (case-insensitive).

## EXIT STATUS

Exits with status `0` on success, for every verdict including
`UNKNOWN`, and with status `1` if *cve-id* is invalid.

## EXAMPLES

```sh
# determine the published VEX status of the project as Markdown
$ ase util vex CVE-2021-44228

# determine the published VEX status of the project as JSON
$ ase util vex -f json CVE-2024-3094
```

## SEE ALSO

`ase`(1), `ase-util`(1), `ase-util-cve`(1).

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>
