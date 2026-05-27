
<define name="getopt">

For parsing the command/skill options, perform the following seven steps
and then continue processing the remaining skill.

Do not output anything in the following steps. The entire purpose is to
set placeholders into the context as a side-effect.

1.  **Determine Parameters**:
    Set <getopt-skill><arg1/></getopt-skill>.
    Set <getopt-spec><arg2/></getopt-spec>.
    Set <getopt-opts><arg3/></getopt-opts>.
    Set <getopt-args><content/></getopt-args>.

2.  **Short-Circuit for Quick Processing**:
    If <getopt-opts/> contains `quick` *AND*
    <getopt-args/> does *NOT* match the regexp `^\s*-`:
    Set <getopt-arguments><getopt-args/></getopt-arguments> and
    then just silently *SKIP* the following steps 3-7!

3.  **MCP Call**:
    Call the `ase_getopt(name: "<getopt-skill/>", spec:
    "<getopt-spec/>", args: "<getopt-args/>"")` tool of the `ase`
    MCP server and set <text/> to the `text` output field of
    this tool call. The `spec` syntax for each option token is
    `--<long>[|-<short>][=<default>|=(<c1>|<c2>|...)]`, where
    `=<default>` declares a value-taking option with a default, and
    `=(<c1>|<c2>|...)` declares a value-taking option restricted to the
    listed fixed choices (the first choice acts as the default).

4.  **Short-Circuit for Error**:
    If <text/> starts with `ERROR:`:
    Remove all `ERROR:` or `error:` prefixes from <text/>.
    Then only output the following <template/> and
    then immediately *STOP* processing the entire current skill:

    <template>
    ⧉ **ASE**: ☻ skill: **<getopt-skill/>**, ▶ ERROR: option parsing failed: **<text/>**
    </template>

5.  **Parsing JSON Result**:
    The tool returned a single `text` content payload containing JSON.
    Parse this JSON in <text/> now into <getopt-result/> by recognizing
    the following shape:

    ```json
    {
        "opts": { "<long1/>": <value1/>, "<long2/>": <value2/>, ... },
        "argv": [ "<arg1/>", "<arg2/>", ... ],
        "args": "...",
        "info": "..."
    }
    ```

6.  **Materializing into Context**:
    For each *key* `<longN/>` in <getopt-result/>`.opts`:
    Set <getopt-option-<longN/>/> to the corresponding value
    `<getopt-result/>.opts[<longN/>]`.
    Set <getopt-arguments/> to the value of `<getopt-result/>.args`.
    Set <getopt-info/> to `<getopt-result/>.info`.

7.  **Display Results**:
    Just output the following <template/>:

    <template>
    ⧉ **ASE**: ☻ skill: **<getopt-skill/>**, ▶ options: <getopt-info/>
    </template>
</define>

