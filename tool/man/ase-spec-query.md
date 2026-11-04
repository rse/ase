# ase-spec-query(1) -- Query the Project Specification

## SYNOPSIS

`ase spec query`
\[`-h`|`--help`\]
\[`-P`|`--param` *name*`=`*value*\] \[...\]
\[`-f`|`--format` *format*\]
\[`-o`|`--output` \[*format*`:`\]*file*\]
\[`-S`|`--schema`\]
*selector*

## DESCRIPTION

**ase spec query** loads the *SpecBook*-based specification Markdown
files below `project.artifact.spec.basedir` (see `ase-spec`(1)),
strictly validated like for `ase spec export` (see `ase-spec-export`(1)),
and queries its Abstract Syntax Tree (AST) with the XPath-like *ASTq*
*selector*, e.g., `// USE-CASE [ @STATUS == 'Done' ]`. The matched
nodes are written as a JSON, JSON5, YAML, or TOON array, their subtrees
included and the embedded file contents dropped.

The queried tree consists of:

- the root node of type `specification`,
- its children of type `artifact`, with the attributes `created`,
  `modified`, and `file`, and
- the objects below, typed by their kind (with whitespace dashed),
  with the attributes `kind`, `id`, `anchor`, `paren`, `name`,
  `primary`, `description`, `rationale`, `elaboration`, and one per
  property key.

The query function `refs()` yields the objects the references of the
current object resolve to, e.g., `// USE-CASE [ count(refs()) == 0 ]`.

The query fails on any lint diagnostic of `error` severity (see
`ase-spec-lint`(1)), while warnings are only logged, so a partial or
invalid specification is never queried.

The MCP tool `ase_specbook_query` provides the same to the skills.

## OPTIONS

- \[`-h`|`--help`\]:
  Show usage information and exit.

- \[`-P`|`--param` *name*`=`*value*\]:
  Substitute the value *value* for the parameter `{`*name*`}` of the
  *selector*. The option is repeatable, one per parameter.

- \[`-f`|`--format` *format*\]:
  The output format `json`, `json5`, `yaml`, or `toon` (default:
  inferred from the *file* of `--output` like for `ase spec export`,
  else `json`).

- \[`-o`|`--output` \[*format*`:`\]*file*\]:
  Write the result into *file*, or to standard output for `-`
  (default: `-`). A relative *file* is relative to the current working
  directory.

- \[`-S`|`--schema`\]:
  Query the effective schema configuration `project.artifact.spec.schema`
  itself, described as a *SpecBook* document of the bundled meta schema
  configuration, instead of the specification.

## EXIT STATUS

Exits with status `0` on success, and with status `1` on any lint
diagnostic of `error` severity, an invalid *selector* or parameter, an
unsupported output format, or an unwritable output file.

## EXAMPLES

```sh
# list all use cases as JSON
$ ase spec query "// USE-CASE"

# list the finished use cases as YAML
$ ase spec query -f yaml "// USE-CASE [ @STATUS == 'Done' ]"

# list the objects of a given kind into a TOON file
$ ase spec query -P kind=ROLE -o roles.toon "// * [ @kind == {kind} ]"

# list the artifacts of the schema configuration itself
$ ase spec query -S "/ artifact"
```

## SEE ALSO

`ase`(1), `ase-spec`(1), `ase-spec-lint`(1), `ase-spec-export`(1),
`ase-spec-preview`(1).

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>

