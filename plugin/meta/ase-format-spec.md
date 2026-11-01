
@./ase-format-specbook.md

SpecBook Project Instantiation
==============================

-   The **SpecBook SCHEMA Model** of this project depends on the value
    of the <ase-spec-schema/> placeholder (holding the
    `project.artifact.spec.schema` configuration value), which is a
    *whitespace-separated list* of schema entries, merged in the given
    order into *one* **SpecBook SCHEMA Model**:

    -   If <ase-spec-schema/> is *empty*:

        Then the list is treated as the single entry `std`.

    -   For each entry `std` in the list:

        The entry names the standard YAML schema configuration bundled
        with **ASE** in the file `meta/ase-format-specbook.yaml`
        (relative to the plugin root).

    -   For each entry `meta`, `pm`, or `npm:...`, `github:...`,
        `http://...`, or `https://...` in the list:

        The entry names a YAML schema configuration bundled with or
        fetched by **SpecBook** itself (the meta, the project
        management, or a remote one), which has no file to read.
        Instead, obtain the *effective* (merged) schema configuration
        once via the `ase_specbook_query(schema: true, selector: "/
        artifact", format: "yaml")` tool of the `ase` MCP server, which
        describes it as a **SpecBook** document.

    -   For each *other* entry in the list:

        The entry names a custom YAML schema configuration file (or
        glob pattern of files) of the project (relative to the project
        root).

    You *MUST* read all resulting schema configuration files via the
    `Read` tool before working on the specification of the **SpecBook
    SPEC Model**.

-   The **SpecBook SPEC Model** of this project is the set of specification
    Markdown files below the directory <ase-spec-basedir/> (relative
    to the project root, recursively, where every `.md` file is a
    specification file, whatever its name), whose files are resolved
    via the `ase_artifact_list(kind: [ "spec" ])` tool of the `ase` MCP
    server.

-   The **SpecBook SPEC Model** of this project can be queried
    *structurally* via the `ase_specbook_query(selector: "<selector/>")`
    tool of the `ase` MCP server, with an XPath-like *ASTq* selector
    like `// USE-CASE [ @STATUS == 'Done' ]` (object nodes typed by
    their kind with whitespace dashed, attributes `id`, `name`,
    `description`, `rationale`, and one per property key, and the
    function `refs()` yielding the objects referenced by an object).
    Prefer it over reading many artifact files when a question spans
    objects of entire kinds, property values, or reference relations.
