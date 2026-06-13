
<define name="getopt">

For parsing the command/skill options, perform the following seven steps
and then continue processing the remaining skill.

Do not output anything in the following steps. The entire purpose is to
set placeholders into the context as a side-effect.

1.  **Determine Parameters**:
    Set <getopt-skill><arg1/></getopt-skill>
    Set <getopt-spec>--help|-h <arg2/></getopt-spec>
    Set <getopt-args><content/></getopt-args>

2.  **Short-Circuit Processing**:
    You *MUST* decide here, via the following *mandatory* <if/> control
    construct, whether the options are parsed *locally* (no MCP call) or
    *remotely* (via the MCP call in steps 3-6). This is a *hard branch*,
    not an optional optimization: when the <if/> branch is taken, steps
    3-6 are *structurally unreachable* and you *MUST NOT* call the
    `ase_getopt` MCP tool under any circumstances.

    <if condition="<getopt-args/> does *NOT* match the regexp `(^|\s)-` (i.e. it does not start with an option)">
        Parse the options *locally*, without any MCP call:

        For each option token in <getopt-spec/> of the form
        `--<long/>[|-<short/>][=<default/>|=(<c1/>|<c2/>|...)[...]]`, set
        <getopt-option-<long/>/> to <default/> (for `=<default/>`
        form), or to the *single token* <c1/> (the first choice, both
        for the choice form `=(<c1/>|<c2>/|...)` and for the list form
        `=(<c1/>|<c2>/|...)...` -- an *unsupplied* list-option always
        defaults to the single token <c1/>, *not* to a whole list),
        or to `false` (for value-less options). Then set
        <getopt-arguments><getopt-args/></getopt-arguments>.

        Additionally, simulate <getopt-info/> as a comma-separated
        markdown rendering of the parsed options in the form `<longN/>:
        **<valueN/>**, [...]` (joined with `, `, with each value
        shell-quoted if value contains spaces or special characters, and
        excluding the `help` option and any *internal* option whose long
        name starts with `int-`).

        You then *MUST* silently *SKIP* the steps 3-6 below
        and proceed directly to step 7 to display the results.
    </if>

3.  **MCP Call**:
    Call the `ase_getopt(name: "<getopt-skill/>", spec:
    "<getopt-spec/>", args: "<getopt-args/>")` tool of the `ase`
    MCP server and set <text/> to the `text` output field of
    this tool call. The `spec` syntax for each option token is
    `--<long>[|-<short>][=<default>|=(<c1>|<c2>|...)[...]]`, where
    `=<default>` declares a value-taking option with a default,
    `=(<c1>|<c2>|...)` declares a value-taking option restricted to the
    listed fixed choices (the first choice acts as the default), and the
    trailing `...` (as in `=(<c1>|<c2>|...)...`) declares a value-taking
    option whose *supplied* value is a *comma-separated list* of choice
    tokens (when *unsupplied*, the option defaults to the *single
    token* `<c1>`, identical to the non-list choice form -- the list
    semantics apply only to an explicitly supplied value; only the
    *first* token of a supplied list is validated by the parser against
    the choice set -- subsequent tokens are *not* validated, and skills
    validate each remaining token themselves as they consume it).

4.  **Short-Circuit for Error**:
    If <text/> starts with `ERROR:`:
    Remove all `ERROR:` or `error:` prefixes from <text/>.
    Then only output the following <template/> and
    then immediately *STOP* processing the entire current skill:

    <template>
    ⧉ **ASE**: ✪ skill: **<getopt-skill/>**, ▶ ERROR: option parsing failed: **<text/>**
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
    Set <getopt-info/> to `<getopt-result/>.info`, but remove
    information about the `help` option.

7.  **Display Results**:
    Just output the following <template/>:

    <template>
    ⧉ **ASE**: ✪ skill: **<getopt-skill/>**, ▶ options: <getopt-info/>
    </template>

</define>

