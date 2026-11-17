---
name: ase-arch-discover
argument-hint: "[--help|-h] [--limit|-l=12] [--staleness|-s=18] [--small-scope|-S] <functionality>"
description: >
    Discover additional, third-party components (libraries/frameworks) for
    the technology stack to provide needed functionality.
user-invocable: true
disable-model-invocation: false
effort: high
allowed-tools:
    - "Bash(npm search --json *)"
    - "WebFetch"
    - "Skill"
    - "Agent"
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-control.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-dialog.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-getopt.md

<purpose name="ase-arch-discover">
Discover Components
</purpose>

<expand name="getopt"
    arg1="ase-arch-discover"
    arg2="--limit|-l=12 --staleness|-s=18 --small-scope|-S">
    $ARGUMENTS
</expand>

<objective>
*Discover* additional, *third-party components* (libraries/frameworks)
for the technology stack to *provide* the *needed functionality*
<request><getopt-arguments/></request>.
</objective>

<flow>
1.  <step id="STEP 1: Determine Functionality">
    1.  Derive the needed <functionality/> from the <request/>, but keep
        the functionality description very *brief* but still *precise*.

    2.  If <functionality/> is not clear, not precise, or not specific
        enough, let the *user interactively choose* the intended
        functionality.

        In the following, you *MUST* *NOT* use your built-in
        <user-dialog-tool/> tool! Instead, you *MUST* just show a
        custom dialog according to the expanded `custom-dialog`
        definition. You *MUST* closely follow this definition:

        <expand name="custom-dialog" arg1="--no-other">
            Functionality: Which functionality should the components provide?
            <answer-1/>: (grounded candidate functionality 1)
            <answer-2/>: (grounded candidate functionality 2)
            <answer-3/>: (grounded candidate functionality 3)
            <answer-4/>: (grounded candidate functionality 4)
        </expand>

        Then use the <result/> and its corresponding grounded candidate
        functionality to adjust <functionality/> accordingly.

    3.  Display the determined final functionality with just the following
        <template/>:

        <template>
        <ase-tpl-bullet-normal/> **FUNCTIONALITY**: <functionality/>
        </template>
    </step>

2.  <step id="STEP 2: Determine Technology Stack">
    1.  Determine the used technology stack:

        1.  If a file `package.json` is found in the top-level directory
            of the project and contains an entry `typescript` under `dependencies`
            or `devDependencies`, then <stack>TypeScript</stack>.

        2.  Else, if a file `package.json` is found in the top-level directory
            of the project, then <stack>JavaScript</stack>.

        3.  Else, if a file `build.gradle.kts` is found in the top-level directory and
            is applying `kotlin`, `org.jetbrains.kotlin.jvm`, `kotlin-android`,
            or `kotlin-multiplatform` plugins, then <stack>Kotlin</stack>.

        4.  Else, if a file `build.gradle` is found in the top-level directory and
            is applying `kotlin`, `org.jetbrains.kotlin.jvm`, `kotlin-android`,
            or `kotlin-multiplatform` plugins, then <stack>Kotlin</stack>.

        5.  Else, if a file `pom.xml` is found in the top-level directory and
            contains `kotlin-maven-plugin` or `kotlin-stdlib` dependencies, then
            <stack>Kotlin</stack>.

        6.  Else, if a file `build.sbt`, `build.mill`, `build.sc`, or `project.scala`
            is found in the top-level directory, or a file `build.gradle` or
            `build.gradle.kts` is found there and is applying the `scala` plugin,
            or a file `pom.xml` is found there and contains `scala-maven-plugin`,
            `scala-library`, or `scala3-library` dependencies, then
            <stack>Scala</stack>. Additionally, from the configured Scala version
            (e.g. `scalaVersion` of sbt), determine the Scala binary version
            <scala-binary/>, which is `3` for Scala 3.x, else the major and
            minor version (like `2.13`), and `3` if it cannot be determined.

        7.  Else, if a file `pom.xml`, `build.gradle`, or `build.gradle.kts` is found
            in the top-level directory of the project, then <stack>Java</stack>.

        8.  Else, if a file of the packaging tools `uv` (`uv.lock` or
            `pyproject.toml`) or `pip` (`requirements.txt`, `pylock.toml`,
            `setup.py`, `setup.cfg`, or `pyproject.toml`) is found in the
            top-level directory of the project, then <stack>Python</stack>.

        9.  Else, if a file `Cargo.toml` is found in the top-level directory
            of the project, then <stack>Rust</stack>.

        10. Else, if a file `go.mod` is found in the top-level directory
            of the project, then <stack>Go</stack>.

        11. Else, if a file `*.fsproj` is found in the top-level directory
            of the project, then <stack>F#</stack>.

        12. Else, if a file `*.csproj`, `*.vbproj`, `*.sln`, `*.slnx`,
            `Directory.Build.props`, or `Directory.Packages.props` is found
            in the top-level directory of the project, then <stack>C#</stack>.

        13. Else, use <stack>Unknown</stack>.

    2.  Display the determined final technology stack with just the
        following <template/>:

        <template>
        <ase-tpl-bullet-normal/> **TECHNOLOGY STACK**: <stack/>
        </template>
    </step>

3.  <step id="STEP 3: Discover Components">
    1.  If <stack/> is "Unknown", the technology stack could not be
        determined and no component discovery backend is available.
        Inform the user with just the following <template/> and then
        *STOP* the entire flow (do not perform any further steps):

        <template>
        <ase-tpl-bullet-normal/> **RESULT**: technology stack could not be determined -- component discovery is only supported for JavaScript, TypeScript, Java, Kotlin, Scala, Python, Rust, Go, C#, and F# projects.
        </template>

    2.  From <stack/> and <functionality/>, derive essential keywords
        <keyword-L/> (L=1-M), which allow you to search for suitable
        components.

    3.  Determine the *candidate pool size* <pool/> as twice the
        <getopt-option-limit/> (i.e. <pool/> = 2 &times;
        <getopt-option-limit/>). Each discovery source below may fetch up
        to <pool/> candidates so that the later ranking and trimming
        (which alone is governed by <getopt-option-limit/>) has a
        meaningful set to choose from.

        In the to-be-discovered candidate set of components <component-K/>
        (K=1-C, where C is the merged and deduplicated candidate count),
        remember the component name as <name-K/>, the
        official package name as <package-K/>, the latest version as
        <version-K/>, the stars as <stars-K/>, the created date as
        <created-K/>, the last updated date as <updated-K/>, the total
        number of downloads in the last month as <downloads-K/>.

    4.  If <stack/> is "JavaScript" or "TypeScript":

        1.  Based on the essential keywords <keyword-L/> (L=1-M),
            use the `ase-meta-search` skill in a sub-agent to *generally*
            discover an initial set of a maximum of <pool/> *NPM packages*
            <component-K/> and at least their real name <name-K/> and
            their unique package names <package-K/>.

        2.  Use the shell command `npm search --json --searchlimit <pool/>
            "<keyword-1/>" [...] "<keyword-M/>"` to *specifically*
            discover an additional set of a maximum of <pool/> *NPM packages*
            <component-K/> and at least their unique package names
            <package-K/>, based on the essential keywords <keyword-L/>
            (L=1-M). Merge the results into the already existing result
            set, but deduplicate entries.

    5.  If <stack/> is "Java" or "Kotlin":

        1.  Based on the essential keywords <keyword-L/> (L=1-M),
            use the `ase-meta-search` skill in a sub-agent to *generally*
            discover an initial set of a maximum of <pool/> *Maven packages*
            <component-K/> and at least their real name <name-K/> and
            their unique Maven coordinates <package-K/> of the form
            `groupId:artifactId`.

        2.  Fetch the URL `https://search.maven.org/solrsearch/select?q=<keyword-1/>+[...]+<keyword-M/>&rows=<pool/>&wt=json`
            with your built-in web fetch tool to *specifically* discover an additional set of a maximum
            of <pool/> *Maven packages* <component-K/> and at least their
            unique Maven coordinates <package-K/> (i.e. `<g/>:<a/>` from
            each result document's `g` and `a` fields), based on the
            essential keywords <keyword-L/> (L=1-M). Merge the results
            into the already existing result set, but deduplicate
            entries by Maven coordinate.

    6.  If <stack/> is "Scala":

        1.  Based on the essential keywords <keyword-L/> (L=1-M),
            use the `ase-meta-search` skill in a sub-agent to *generally*
            discover an initial set of a maximum of <pool/> *Maven packages*
            <component-K/> and at least their real name <name-K/> and
            their unique Maven coordinates <package-K/> of the form
            `groupId:artifactId_<scala-binary/>`, i.e. with the artifact
            cross-built for the Scala binary version <scala-binary/>.

        2.  Fetch the URL `https://index.scala-lang.org/api/search?q=<keyword-1/>+[...]+<keyword-M/>&target=JVM&scalaVersion=<scala-binary/>`
            with your built-in web fetch tool to *specifically* discover an
            additional set of a maximum of <pool/> *Scala projects* of the
            Scala package index *Scaladex*, based on the essential keywords
            <keyword-L/> (L=1-M). For each result item, pick from its
            `artifacts` the main artifact <artifact/> (the one named like its
            `repository`, or else the one with the suffix `-core`) and
            resolve its Maven `groupId` by fetching the URL
            `https://search.maven.org/solrsearch/select?q=a:%22<artifact/>_<scala-binary/>%22&rows=5&wt=json`
            with your built-in web fetch tool, preferring the result document
            whose `g` field corresponds to the `organization` of the item.
            Derive from it the Maven coordinate <package-K/>
            `<g/>:<artifact/>_<scala-binary/>`, and skip the item if no result
            document exists. Merge the results into the already existing
            result set, but deduplicate entries by Maven coordinate.

    7.  If <stack/> is "Python":

        1.  Based on the essential keywords <keyword-L/> (L=1-M),
            use the `ase-meta-search` skill in a sub-agent to *generally*
            discover an initial set of a maximum of <pool/> *PyPI packages*
            <component-K/> and at least their real name <name-K/> and
            their unique distribution names <package-K/> (as used by
            `pip install` resp. `uv add`).

        2.  As PyPI provides no search API (and neither `pip` nor `uv`
            can search), fetch the URL `https://api.github.com/search/repositories?q=<keyword-1/>+[...]+<keyword-M/>+language:python&sort=stars&per_page=<pool/>`
            with your built-in web fetch tool to *specifically* discover an additional set of a maximum of
            <pool/> *Python repositories*, based on the essential keywords
            <keyword-L/> (L=1-M), and derive from each result item (its
            `name`, `full_name`, and `description` fields) the PyPI
            distribution name <package-K/> of the component. Merge the
            results into the already existing result set, but deduplicate
            entries by their distribution name.

    8.  If <stack/> is "Rust":

        1.  Based on the essential keywords <keyword-L/> (L=1-M),
            use the `ase-meta-search` skill in a sub-agent to *generally*
            discover an initial set of a maximum of <pool/> *Rust crates*
            <component-K/> and at least their real name <name-K/> and
            their unique crate names <package-K/> (as used by `cargo add`).

        2.  Fetch the URL `https://crates.io/api/v1/crates?q=<keyword-1/>+[...]+<keyword-M/>&per_page=<pool/>&sort=relevance`
            with your built-in web fetch tool to *specifically* discover an
            additional set of a maximum of <pool/> *Rust crates*
            <component-K/> and at least their unique crate names
            <package-K/> (from the `name` field of each entry of `crates`),
            based on the essential keywords <keyword-L/> (L=1-M). Merge the
            results into the already existing result set, but deduplicate
            entries by crate name.

    9.  If <stack/> is "Go":

        1.  Based on the essential keywords <keyword-L/> (L=1-M),
            use the `ase-meta-search` skill in a sub-agent to *generally*
            discover an initial set of a maximum of <pool/> *Go modules*
            <component-K/> and at least their real name <name-K/> and
            their unique module paths <package-K/> (as used by `go get`,
            including a major version suffix like `/v2`).

        2.  Fetch the URL `https://pkg.go.dev/search?q=<keyword-1/>+[...]+<keyword-M/>&m=module&limit=<pool/>`
            with your built-in web fetch tool to *specifically* discover an
            additional set of a maximum of <pool/> *Go packages*, based on
            the essential keywords <keyword-L/> (L=1-M), and derive from each
            result (a package path) the module path <package-K/> of its
            module (usually the repository root, like `github.com/owner/repo`,
            plus a major version suffix like `/v2`, if part of the package path).
            Merge the results into the already existing result set, but
            deduplicate entries by module path.

    10. If <stack/> is "C#" or "F#":

        1.  Based on the essential keywords <keyword-L/> (L=1-M),
            use the `ase-meta-search` skill in a sub-agent to *generally*
            discover an initial set of a maximum of <pool/> *NuGet packages*
            <component-K/> and at least their real name <name-K/> and
            their unique package ids <package-K/> (as used by `dotnet add
            package`).

        2.  Fetch the URL `https://azuresearch-usnc.nuget.org/query?q=<keyword-1/>+[...]+<keyword-M/>&take=<pool/>&prerelease=false&semVerLevel=2.0.0`
            with your built-in web fetch tool to *specifically* discover an
            additional set of a maximum of <pool/> *NuGet packages*
            <component-K/> and at least their unique package ids
            <package-K/> (from the `id` field of each entry of `data`),
            based on the essential keywords <keyword-L/> (L=1-M). Merge the
            results into the already existing result set, but deduplicate
            entries by their case-insensitive package id.

    11. Call the `ase_component_info(stack: "<stack/>", components:
        [ "<package-1/>", ..., "<package-C/>" ], staleMonths:
        <getopt-option-staleness/>, smallScope: <getopt-option-small-scope/>)`
        tool of the `ase` MCP server *once* for the entire candidate set of
        discovered packages. When the <getopt-option-small-scope/> option is
        enabled, the ranking treats the <functionality/> as *small-scope*,
        i.e. narrow, self-contained, and low-effort enough that a
        *dependency-free/hand-rolled* implementation is a realistic
        alternative to pulling in a third-party component. The tool
        dispatches internally on <stack/>
        and fetches all metadata in maximum parallel and returns an array
        of objects `{ name, version, created, updated, repository, stars,
        downloads, deps, rank }`. For each component <component-K/>
        (K=1-C) read from its corresponding entry: <name-K/> from `name`
        (unless already known from the discovery above), <version-K/> from
        `version`, <updated-K/> from `updated`, <created-K/> from
        `created`, <repository-K/> from `repository`, <stars-K/> from
        `stars` (numeric or `N.A.`), <downloads-K/> from `downloads`
        (numeric or `N.A.`), <deps-K/> from `deps` (numeric or `N.A.`)
        and <rank-K/> from `rank` (numeric). The returned `rank` already
        reflects the staleness and small-scope dependency penalties.
        If <stack/> is "Python", "Rust", "Go", "C#", or "F#", drop every
        candidate with an empty `version`, as it is not published on PyPI,
        crates.io, the Go module proxy, resp. NuGet.

    12. Sort, in descending order, the discovered candidate components
        <component-K/> (K=1-C) by their `rank` field and trim the result
        list to just a maximum of <getopt-option-limit/> total components,
        which establishes the final retained set <component-K/> (K=1-N,
        where N is at most <getopt-option-limit/>). All subsequent steps
        operate solely on this retained set.

    13. For each component <component-K/> (K=1-N), research and then
        decide which *one* of *USP* (Unique Selling Point -- what makes
        it unique), *Crux* (what you should notice), or *Gotcha* (what
        you should not stumble over) is its single most distinguishing
        perspective, and remember this as an <info-K/> (K=1-N) formatted
        like `<type/>: <hint/>` where <type/> is one of `USP`, `Crux`,
        or `Gotcha` and <hint/> is a 1-6 word hint.

        *Staleness override*: determine the coarse age <age-K/> (like
        `2y`) of the last release from <updated-K/>. If <updated-K/> is
        known and its age exceeds *twice* <getopt-option-staleness/>
        months, *append* to <info-K/> the hint `Gotcha: stale/abandoned
        -- last release <age-K/> ago`; else if its age exceeds
        <getopt-option-staleness/> months, *append* to <info-K/> the
        hint `Gotcha: aging -- last release <age-K/> ago`. Do not output
        anything.
    </step>

4.  <step id="STEP 4: Report Components">
    1.  Display the determined, individual components as a Markdown
        *table* with just the following <template/> and do not output
        anything else:

        <template>
        <ase-tpl-bullet-normal/> **COMPONENT HINTS**:

        | ⚑ *Component* | ▣ *Package*    | ⚖ *Hint*  |
        | :------------ | :------------- | :-------- |
        | **<name-1/>** | `<package-1/>` | <info-1/> |
        [...]
        | **<name-N/>** | `<package-N/>` | <info-N/> |
        </template>

    2.  Display the discovered components as a Markdown *table*
        with just the following <template/>:

        <template>
        <ase-tpl-bullet-normal/> **COMPONENT RANKING**:

        | ⚑ *Component* | ▣ *Package*    | ❖ *Version*  | ↓ *Downloads*      | ⎈ *Stars*      | ⏲ *Updated*      | ☆ *Created*  | ⚭ *Dep.*   |
        | :------------ | :------------- | -----------: | -----------------: | -------------: | :--------------- | :----------- | ---------: |
        | **<name-1/>** | `<package-1/>` | <version-1/> | **<downloads-1/>** | **<stars-1/>** | **<updated-1/>** | <created-1/> | <deps-1/>  |
        [...]
        | **<name-N/>** | `<package-N/>` | <version-N/> | **<downloads-N/>** | **<stars-N/>** | **<updated-N/>** | <created-N/> | <deps-N/>  |
        </template>

    3.  Finally, give the closing hints by expanding the following
        (which, depending on the configured <ase-guidance-level/>, may
        each expand into nothing and hence emit no output at all):

        <ase-tpl-hint level="normal">
        To pick a single component from the ranking against weighted criteria, use `/ase-meta-evaluate`.
        </ase-tpl-hint>

        <ase-tpl-hint level="verbose">
        Use `/ase-arch-discover --limit` to widen the candidate set, `--staleness` to change the aging threshold, and `--small-scope` to prefer small, focused components.
        </ase-tpl-hint>
    </step>
</flow>

