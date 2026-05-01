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
    - "Bash(npm search *)"
    - "Bash(npm view *)"
    - "Skill(ase-meta-search)"
    - "Agent(ase-meta-search)"
    - "WebFetch"
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md

Discover Components
===================

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
        questions to the user with the help of the `AskUserQuestion` tool.

    -   Display the determined final functionality with just the following
        <template/>:

        <template>
        &#x1F535; **FUNCTIONALITY**: <functionality/>
        </template>
    </step>

2.  <step id="STEP 2: Determine Technology Stack">
    -   Determine the used technology stack.

    -   If a file `package.json` is found in the top-level directory
        of the project, then <stack>JavaScript</stack>.

    -   If a file `package.json` is found in the top-level directory
        of the project and contains an entry `typescript` under `dependencies`
        or `devDependencies`, then <stack>TypeScript</stack>.

    -   If a file `pom.xml` or `build.gradle` is found in the top-level directory
        of the project, then <stack>Java</stack>.

    -   If a file `build.gradle.kts` or `settings.gradle.kts`
        is found in the top-level directory, then <stack>Kotlin</stack>.

    -   If a file `pom.xml` is found in the top-level directory and
        contains `kotlin-maven-plugin` or `kotlin-stdlib` dependencies, then
        <stack>Kotlin</stack>.

    -   If a file `build.gradle` is found in the top-level directory and
        is applying `kotlin`, `org.jetbrains.kotlin.jvm`, `kotlin-android`,
        or `kotlin-multiplatform` plugins, then <stack>Kotlin</stack>.

    -   If <stack/> could not be determined, then <stack>Unknown</stack>.

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

    -   In to be discovered result set of components <component-K/>
        (K=1-N), remember the component name as <name-K/>, the
        official package name as <package-K/>, the latest version as
        <version-K/>, the stars as <stars-K/>, the created date as
        <created-K/>, the last updated date as <updated-K/>, the total
        number of downloads in the last month <downloads-K/>.

    -   If <stack/> is "JavaScript" or "TypeScript":

        -   Use the `ase-meta-search` skill in a subagent to discover
            *generally* *NPM packages* <component-K/> (K=1-N) based on
            the essential keywords <keyword-L/> (L=1-M). For each found
            package <component-K/> (K=1-N), use the shell command
            `npm view --json "<package-K/>" version time.modified
            time.created)` to discover its version <version-K/>,
            its time modified <updated-K/>, and its time created
            <created-K>.

        -   Use the shell command `npm search --searchlimit 20 --json
            "<keyword-1/>" [...] "<keyword-M/>"` to specifically
            discover *NPM packages* <package-K/> (K=1-N) and their
            <version-K/> -- based on the essential keywords <keyword-L/>
            (L=1-M). Merge the results into the already existing
            result set, but deduplicate entries.

        -   For each discovered *NPM package* <package-K/>, use the
            `WebFetch` tool on the URL `https://npmtrends.com/<package-K/>`
            to fetch information from the `Stats` table on the page
            by extracting the <stars-K/> from the `Stars` column,
            <created-K/> from the `Created` column, and <updated-K/>
            from the `Updated` column.

        -   For each discovered *NPM package* <package-K/>, use the
            `WebFetch` tool on the URL
            `https://api.npmjs.org/downloads/point/last-month/<package-K/>`
            to extract the <downloads-K/> from the `downloads`
            field.
    </step>

4.  <step id="STEP 4: Report Components">
    -   Sort, in descending order, the discovered components
        <component-K/> (K=1-N) by their <stars-K/>, then <downloads-K/>,
        and then <updated-K/> information.

    -   Display the discovered components as a Markdown *table*
        with just the following <template/>:

        <template>
        &#x1F535; **COMPONENTS**:

        | *Component*   | *Package*      | *Version*    | *Stars*        | *Downloads*        | *Updated*        | *Created*    |
        | :------------ | :------------- | :------------| :------------- | :----------------- | :--------------- | :----------- |
        | **<name-1/>** | `<package-1/>` | <version-1/> | **<stars-1/>** | **<downloads-1/>** | **<updated-1/>** | <created-1/> |
        [...]
        | **<name-N/>** | `<package-N/>` | <version-N/> | **<stars-N/>** | **<downloads-N/>** | **<updated-N/>** | <created-N/> |
        </template>
    </step>
</flow>

