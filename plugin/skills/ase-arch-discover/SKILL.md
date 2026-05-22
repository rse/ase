---
name: ase-arch-discover
argument-hint: "<functionality>"
description: >
    Discover additional, third-party components (libraries/frameworks) for
    the technology stack to provide needed functionality.
user-invocable: true
disable-model-invocation: false
effort: medium
allowed-tools:
    - "Bash(npm search --json *)"
    - "Bash(npm view --json *)"
    - "Skill"
    - "Agent"
    - "WebFetch"
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-control.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md

Discover Components
===================

<skill name="ase-arch-discover">
Discover Components
</skill>

Your role is an experienced, *expert-level software architect*,
specialized in *finding components* (libraries/frameworks) for the technology stack.

<objective>
*Discover* additional, *third-party components* (libraries/frameworks)
for the technology stack to *provide* the *needed functionality*
<request>$ARGUMENTS</request>.
</objective>

<flow>
1.  <step id="STEP 1: Determine Functionality">
    -   Derive the needed <functionality/> from the <request/>, but keep
        the functionality description very *brief* but still *precise*.

    -   If <functionality/> is not clear or not precise enough, raise
        questions to the user with the help of an interactive user dialog tool.

    -   Display the determined final functionality with just the following
        <template/>:

        <template>
        &#x1F535; **FUNCTIONALITY**: <functionality/>
        </template>
    </step>

2.  <step id="STEP 2: Determine Technology Stack">
    -   Determine the used technology stack:

        -   If a file `package.json` is found in the top-level directory
            of the project and contains an entry `typescript` under `dependencies`
            or `devDependencies`, then <stack>TypeScript</stack>.

        -   Else, if a file `package.json` is found in the top-level directory
            of the project, then <stack>JavaScript</stack>.

        -   Else, if a file `build.gradle.kts` or `settings.gradle.kts`
            is found in the top-level directory, then <stack>Kotlin</stack>.

        -   Else, if a file `build.gradle` is found in the top-level directory and
            is applying `kotlin`, `org.jetbrains.kotlin.jvm`, `kotlin-android`,
            or `kotlin-multiplatform` plugins, then <stack>Kotlin</stack>.

        -   Else, if a file `pom.xml` is found in the top-level directory and
            contains `kotlin-maven-plugin` or `kotlin-stdlib` dependencies, then
            <stack>Kotlin</stack>.

        -   Else, if a file `pom.xml` or `build.gradle` is found in the top-level directory
            of the project, then <stack>Java</stack>.

        -   Else, use <stack>Unknown</stack>.

    -   Display the determined final technology stack with just the
        following <template/>:

        <template>
        &#x1F535; **TECHNOLOGY STACK**: <stack/>
        </template>
    </step>

3.  <step id="STEP 3: Discover Components">
    -   From <stack/> and <functionality/>, derive essential keywords
        <keyword-L/> (L=1-M), which allow you to search for suitable
        components.

    -   In the to be discovered result set of components <component-K/>
        (K=1-N), remember the component name as <name-K/>, the
        official package name as <package-K/>, the latest version as
        <version-K/>, the stars as <stars-K/>, the created date as
        <created-K/>, the last updated date as <updated-K/>, the total
        number of downloads in the last month is <downloads-K/>.

    -   If <stack/> is "JavaScript" or "TypeScript":

        -   Based on the essential keywords <keyword-L/> (L=1-M),
            use the `ase-meta-search` skill in a subagent to *generally*
            discover an initial set of a maximum of 12 *NPM packages*
            <component-K/> and at least their real name <name-K/> and
            their unique package names <package-K/>.

        -   Use the shell command `npm search --json --searchlimit 12
            "<keyword-1/>" [...] "<keyword-M/>"` to *specifically*
            discover an additional set of a maximum of 12 *NPM packages*
            <component-K/> and at least their unique package names
            <package-K/>, based on the essential keywords <keyword-L/>
            (L=1-M). Merge the results into the already existing result
            set, but deduplicate entries.

        -   For each discovered *NPM package* <component-K/> (K=1-N),
            use the shell command `npm view --json "<package-K/>"
            version time repository.url` to discover
            its version <version-K/>, the publish time of that
            version <updated-K/> (read from `time[<version-K/>]`),
            its time created <created-K/> (read from `time.created`),
            and its repository URL <repository-K/>.

        -   If the <repository-K/> regexp-matches
            `.+?//github\.com/([^/]+/[^/.]+).*` use the `WebFetch` tool
            to fetch the URL `https://api.github.com/repos/$1` (`$1`
            is the value matched by the first capturing parenthesis
            in the regexp) and extract <stars-K/> from its JSON
            `stargazers_count` field, else set <stars-K/> to `N.A.`.

        -   For each discovered *NPM package* <component-K/>
            (K=1-N), use the `WebFetch` tool on the URL
            `https://api.npmjs.org/downloads/point/last-month/<package-K/>`
            to extract the <downloads-K/> from the `downloads` field.

    -   If <stack/> is "Java" or "Kotlin":

        -   Based on the essential keywords <keyword-L/> (L=1-M),
            use the `ase-meta-search` skill in a subagent to *generally*
            discover an initial set of a maximum of 12 *Java packages*
            <component-K/> and at least their real name <name-K/> and
            their unique package names <package-K/>.
    </step>

4.  <step id="STEP 4: Report Components">
    -   Sort, in descending order, the discovered components
        <component-K/> (K=1-N) first by their <downloads-K/> and second
        by their <stars-K/> and trim the result list to just a maximum
        of 12 total components.

    -   Display the discovered components as a Markdown *table*
        with just the following <template/>:

        <template>
        &#x1F535; **COMPONENTS**:

        | *Component*   | *Package*      | *Version*    | *Downloads*        | *Stars*        | *Updated*        | *Created*    |
        | :------------ | :------------- | -----------: | -----------------: | -------------: | :--------------- | :----------- |
        | **<name-1/>** | `<package-1/>` | <version-1/> | **<downloads-1/>** | **<stars-1/>** | **<updated-1/>** | <created-1/> |
        [...]
        | **<name-N/>** | `<package-N/>` | <version-N/> | **<downloads-N/>** | **<stars-N/>** | **<updated-N/>** | <created-N/> |
        </template>
    </step>
</flow>

