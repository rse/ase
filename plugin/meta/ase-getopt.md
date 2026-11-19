
<define name="getopt">

For parsing the command/skill options, perform the following eight steps
and then continue processing the remaining skill.

Do not output anything in the following steps. The entire purpose is to
set placeholders into the context as a side-effect.

1.  **Determine Parameters**:
    Set <getopt-skill><arg1/></getopt-skill>
    Set <getopt-spec>--help|-h <arg2/></getopt-spec>
    Set <getopt-args><content/></getopt-args>
    Set <getopt-task-prefix><arg3/></getopt-task-prefix>
    Set <getopt-task></getopt-task> (empty)
    Set <getopt-task-only>false</getopt-task-only>

    The optional <arg3/> declares the splitting of a leading task id
    off the arguments: `colon` for a first token `<id>:`, and
    `colon-or-bare` for additionally a sole token `<id>`. If the `arg3`
    attribute is absent, <getopt-task-prefix/> is *empty* (never the
    literal text `<arg3/>`).

2.  **Short-Circuit Processing**:
    You *MUST* decide here, via the following *mandatory* <if/> control
    construct, whether the options are parsed *locally* (no MCP call) or
    *remotely* (via the MCP call in steps 3-7). This is a *hard branch*,
    not an optional optimization: when the <if/> branch is taken, steps
    3-7 are *structurally unreachable* and you *MUST NOT* call the
    `ase_getopt` MCP tool under any circumstances.

    In particular, a <getopt-args/> containing `-h` or `--help` always
    matches the regexp `(^|\s)-` below, so the <if/> branch is *never*
    taken for it: the manual page of the skill is served *only* by the
    `ase_getopt` MCP tool (see step 6).

    Conversely, whenever <getopt-task-prefix/> is *not* empty and
    <getopt-args/> is *not* empty, the <if/> branch is *never* taken,
    even if <getopt-args/> contains no option at all (like `foo: text`):
    a leading task id is split off *only* by the `ase_getopt` MCP tool,
    *never* by a local parsing or by you.

    <if condition="<getopt-args/> does *NOT* match the regexp `(^|\s)-` (i.e. it does not contain an option) *AND* <getopt-skill/> is *NOT* one of the space-separated skill names of <ase-getopt-tuned/> (i.e. it has no option aliases or option defaults) *AND* (<getopt-task-prefix/> is empty *OR* <getopt-args/> is empty) (i.e. no task id has to be split off)">
        Parse the options *locally*, without any MCP call (with empty
        <getopt-args/>, <getopt-task/> stays empty and
        <getopt-task-only/> stays `false`):

        For each option token in <getopt-spec/> of the form
        `--<long/>[|-<short/>][=<default/>|=(<c1/>|<c2/>|...)[...]]`, set
        <getopt-option-<long/>/> to <default/> (for `=<default/>`
        form), or to the *single token* <c1/> (the first choice, both
        for the choice form `=(<c1/>|<c2/>|...)` and for the list form
        `=(<c1/>|<c2/>|...)...` -- an *unsupplied* list-option always
        defaults to the single token <c1/>, *not* to a whole list),
        or to `false` (for value-less options). Then set
        <getopt-arguments><getopt-args/></getopt-arguments>.

        Additionally, simulate <getopt-info/> as a comma-separated
        markdown rendering of the parsed options in the form `<longN/>:
        **<valueN/>**, [...]` (joined with `, `, with each value
        shell-quoted if the value contains spaces or special characters, and
        excluding the `help` option and any *internal* option whose long
        name starts with `int-`).

        You then *MUST* silently *SKIP* the steps 3-7 below
        and proceed directly to step 8 to display the results.
    </if>
    <else>
        The steps 3-7 below are *mandatory*: you *MUST* call the
        `ase_getopt` MCP tool and *MUST* *NEVER* interpret, drop, or
        guess any option yourself -- in particular, an *unknown* option
        is rejected *only* by the `ERROR:` result of step 4.
    </else>

3.  **MCP Call**:
    If <getopt-task-prefix/> is empty, call the `ase_getopt(name:
    "<getopt-skill/>", spec: "<getopt-spec/>", args: "<getopt-args/>")`
    tool of the `ase` MCP server. Otherwise, you *MUST* call the
    `ase_getopt(name: "<getopt-skill/>", spec: "<getopt-spec/>", args:
    "<getopt-args/>", taskPrefix: "<getopt-task-prefix/>")` tool of the
    `ase` MCP server instead, so the tool (and *never* you) splits off a
    leading task id of the arguments. Then set <text/> to the `text`
    output field of this tool call. The `spec` syntax for each option token is
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
    The tool additionally accepts the negation `--no-<long>` of every
    option and applies the option aliases and option defaults configured
    for <getopt-skill/> (see `ase alias`).

    You *MUST* pass <getopt-args/> *exactly* as given by the user, i.e.,
    *never* add, drop, reorder, rename, or "fix" any option or argument,
    and *never* probe options by trial calls. You *MUST* call `ase_getopt`
    *exactly once* per skill invocation.

4.  **Short-Circuit for Error**:
    This step is the *sole* and *authoritative* handler for an
    `ERROR:`-prefixed `ase_getopt` response; the generic MCP-Tool-Calls
    error rule (see `ase-skill.md`) explicitly does *NOT* apply here, so
    only the <template/> below is emitted (never both).
    If <text/> starts with `ERROR:`:
    Remove all `ERROR:` or `error:` prefixes from <text/>.
    Then only output the following <template/> and
    then immediately *STOP* processing the entire current skill.
    An `ERROR:` result is *final*: you *MUST* *NEVER* call `ase_getopt`
    again with modified arguments (e.g., without the offending option)
    or work around the error in any other way, but report it as such
    and leave its correction to the user:

    <template>
    ⧉ **ASE**: ✪ skill: **<getopt-skill/>**, ▶ ERROR: option parsing failed: **<text/>**
    </template>

    Directly *after* this error <template/>, and *before* stopping, give
    the corrective hint by expanding the following (which, depending on
    the configured <ase-guidance-level/>, may expand into nothing and
    hence emit no output at all):

    <ase-tpl-hint level="verbose">
    Run `/<getopt-skill/> --help` for the accepted options and arguments of this skill.
    </ase-tpl-hint>

5.  **Parsing JSON Result**:
    The tool returned a single `text` content payload containing JSON.
    Parse this JSON in <text/> now into <getopt-result/> by recognizing
    the following shape:

    ```json
    {
        "opts": { "<long1/>": <value1/>, "<long2/>": <value2/>, ... },
        "argv": [ "<arg1/>", "<arg2/>", ... ],
        "args": "...",
        "info": "...",
        "task": "...",
        "taskOnly": false,
        "help": "..."
    }
    ```

    The fields `task` and `taskOnly` exist only with `taskPrefix`, and
    the field `help` exists only if `<getopt-result/>.opts.help` is `true`.

6.  **Short-Circuit for Help**:
    If `<getopt-result/>.opts.help` is `true`:
    If `<getopt-result/>.help` is *not* empty, output its content
    *verbatim* and *completely* as your *entire* reply (no option line,
    no file path, no summary, and no paraphrase), and then immediately
    *STOP* processing the entire current skill. Otherwise, only output
    the following <template/> and then immediately *STOP* processing
    the entire current skill:

    <template>
    ⧉ **ASE**: ✪ skill: **<getopt-skill/>**, ▶ ERROR: manual page not available
    </template>

    You *MUST* *NEVER* read the manual page from a file yourself, write
    it from memory, or describe a tool call in text instead of performing
    it.

7.  **Materializing into Context**:
    For each *key* `<longN/>` in <getopt-result/>`.opts`:
    Set <getopt-option-<longN/>/> to the corresponding value
    `<getopt-result/>.opts[<longN/>]`.
    Set <getopt-arguments/> to the value of `<getopt-result/>.args`.
    If `<getopt-result/>.task` exists, set <getopt-task/> to its value
    and <getopt-task-only/> to the value of `<getopt-result/>.taskOnly`
    (the task id prefix is then *no* longer part of <getopt-arguments/>).
    Set <getopt-info/> to `<getopt-result/>.info`, but remove
    information about the `help` option and any *internal* option
    whose long name starts with `int-`.

8.  **Display Results**:
    If <ase-guidance-level/> is equal to `normal` or `verbose`,
    output the following <template/>:

    <template>
    ⧉ **ASE**: ✪ skill: **<getopt-skill/>**, ▶ options: <getopt-info/>
    </template>

</define>

