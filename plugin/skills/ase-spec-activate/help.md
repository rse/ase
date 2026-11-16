
##  NAME

`ase-spec-activate` - Activate Specification Know-How

##  SYNOPSIS

`ase-spec-activate`
    [`--help`|`-h`]
    [*query*]

##  DESCRIPTION

The `ase-spec-activate` skill activates the know-how about the
*SpecBook*-based specification (`SPEC`) of the project in the current
session: it loads the *SpecBook* format contract, reads the *SpecBook*
schema configuration of the project (the schema files configured via
`project.artifact.spec.schema`, where the entry `std` -- also the default
-- names the standard schema bundled with *ASE*), and resolves the list
of `SPEC` artifacts in the configured specification base directory. The
activation is reported in a `SPEC ACTIVATED` box, listing the schema
files (each marked `standard` or `custom`) and the base directory with
the number of resolved artifacts.

Once activated, the specification can be worked with *ad-hoc* in plain
conversation for the remainder of the session: reading, querying, and
explaining its content (with `[[xxx]]` references resolved across
artifacts and every answer grounded in artifact file and object id), and
applying small changes to it (kept conformant to the format contract and
the schema, with refreshed `Modified:` timestamps and *SpecBook* linting
afterwards). Ad-hoc changes stay strictly restricted to the `SPEC`
artifacts; substantial changes are deferred to `ase-spec-edit`.

The skill is both user-callable and model-callable: the model invokes it
*automatically* whenever the user wants to work with the specification
files without invoking a dedicated specification skill. It works in
tandem with `ase-spec-edit`, `ase-sync-import`, and `ase-sync-reconcile`,
which include the format contract themselves and hence activate the
know-how implicitly, and with `ase-sync-export`, which needs no know-how
at all -- their own procedures take precedence whenever they run.

##  ARGUMENTS

-   *query*:
    Optional question about, or small ad-hoc change to, the
    specification, served directly after the activation. When omitted,
    the skill only activates the know-how. This argument mainly serves
    the automatic invocation by the agent harness: the user's request
    which triggered the activation is passed through as the *query*,
    so activation and answer happen in one skill run under the skill's
    rules instead of in the plain conversation afterwards.

##  SCENARIOS

-   You want to ask what the specification says about a topic
-   You want to look up, check, or explain specification content in plain conversation
-   You want a small ad-hoc change applied to the specification
-   You want the SpecBook know-how loaded before working with the specification files

##  EXAMPLES

Activate the specification know-how only:

```text
❯ /ase-spec-activate
```

Activate and directly answer a question about the specification:

```text
❯ /ase-spec-activate which personas does the specification define?
```

##  SEE ALSO

[`ase-spec-edit`](../ase-spec-edit/help.md), [`ase-sync-import`](../ase-sync-import/help.md), [`ase-sync-reconcile`](../ase-sync-reconcile/help.md),
[`ase-sync-export`](../ase-sync-export/help.md).
