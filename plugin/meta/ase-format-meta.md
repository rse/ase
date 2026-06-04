
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

    -   `Software` (`SOFT`), aka "Software Implementation Results (IMP)".

    -   `Documentation` (`DOCS`), aka "Software Documentation Results (DOC)".

    Each **Artifact Set** has a unique identifier <artifact-set-id/>,
    which is one of `SPEC`, `ARCH`, `SOFT`, or `DOCS`.

-   **Artifact**:

    At level 2, each **Artifact Set** is composed of many **Artifact**s.
    Each **Artifact** has a unique identifier <artifact-id/>, which is
    an upper-case, two-letter identifier (e.g. `CJ` for `Customer
    Journey`) derived from the **Artifact** name.

-   **Aspect**:

    At level 3, each **Artifact** is composed of many **Aspect**s.
    Each **Aspect** has a unique identifier <aspect-id/>, which is a
    unique "slug" of always 1-3 lower-cased words (concatenated with "-"
    characters and in total not longer than 30 characters). An example
    is `user-login`.
