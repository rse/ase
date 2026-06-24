
Artifact Meta Information
=========================

**ASE** knows about the following three levels of documentation:

-   **Artifact Set**:

    At the root, at level 1, there are the following known **Artifact Set**s:

    -   `Specification` (`SPEC`), aka "Software Requirements Specification
        (SRS)", "Product Requirements Document (PRD)", or just
        "Requirements".

    -   `Architecture` (`ARCH`), aka "Software Architecture Specification
        (SAS)", "Architecture Description", or "Architecture Decision
        Record (ADR)".

    -   `Source Code` (`CODE`), aka "Software Implementation Results (IMP)",
        "Code", or "Software".

    -   `Documentation` (`DOCS`), aka "Software Documentation Results (DOC)".

    -   `Tasks` (`TASK`), aka "Task Plans", "Issues", or "User Stories".

    Each **Artifact Set** has a unique identifier <artifact-set-id/>,
    which is one of `SPEC`, `ARCH`, `CODE`, `DOCS`, or `TASK`.

-   **Artifact**:

    At level 2, each **Artifact Set** is composed of many **Artifact**s.
    Each **Artifact** has an identifier <artifact-id/>, which is an
    upper-case, two-letter identifier (e.g. `CJ` for `Customer Journey`)
    derived from the **Artifact** name. The <artifact-id/> is unique
    only *within* its **Artifact Set**; the globally-unique handle of an
    **Artifact** is the qualified form <artifact-set-id/>-<artifact-id/>
    (e.g. `SPEC-DP` and `ARCH-DP` are distinct artifacts). All
    references to an **Artifact** *MUST* use this qualified form.

    Each **Artifact** also has a sequence number <artifact-no/>, which
    is the zero-padded, two-digit position of the **Artifact** (starting
    at `01`) within the ordered list of **Artifact**s of its **Artifact
    Set**. The <artifact-no/> is used only in the **Artifact**'s file
    name (for stable ordering) and is *not* part of the **Artifact**'s
    or its **Aspect**s' identifiers.

    Each **Artifact** *MUST* have an initial blank line and a trailing
    blank line. All its lines should be kept below 140 characters,
    whenever possible by line-breaking with newlines after about 120
    characters per line.

-   **Aspect**:

    At level 3, each **Artifact** is composed of many **Aspect**s.
    Each **Aspect** has a unique identifier <aspect-id/>, which is a
    unique "slug" of always 1-3 lower-cased words (concatenated with "-"
    characters and in total not longer than 30 characters). An example
    is `user-login`.

An **Artifact** *MAY* additionally declare an **Export** -- a derived,
ready-to-consume rendering of (part of) its content, materialized as a
*side-by-side* file next to the **Artifact** itself. An **Artifact**
without an `-   Export:` bullet is *not* exported.

An **Export** is declared by a single `-   Export:` bullet point in the
**Artifact**'s format definition (see `ase-format-spec.md` and
`ase-format-arch.md`), of the following format:

<format>

-   Export: `<export-name/>.<export-ext/>`
    <export-transform/>

</format>

with the following details:

-   <export-ext/> is the file-name extension (without the leading dot,
    e.g. `svg`, `md`) of the exported file, which also implies its
    target format.

-   <export-transform/> is a description of *how* the **Artifact**'s
    content is transformed into the exported file (e.g. "the entities,
    attributes, and relations rendered as a Mermaid `classDiagram` and
    converted to SVG").

The exported file is stored *side-by-side* with the **Artifact** under
the path:

`<basedir/>/<artifact-set-id/>-<artifact-no/>-<artifact-id/>-<artifact-slug/>-<export-name/>.<export-ext/>`

where <artifact-slug/> is the same slug used in the **Artifact**'s own
file name -- derived from the **Artifact** name by Pascal-casing each
word and joining the words with `-` characters (e.g. `Customer-Journey`)
-- as defined by the **Artifact Set**'s own format definition (see
`ase-format-spec.md` and `ase-format-arch.md`).
