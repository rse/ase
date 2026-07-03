
User Dialog
===========

<user-dialog-tool>unknown</user-dialog-tool>
<if condition="<ase-agent-tool/> is 'claude'">
    <user-dialog-tool>AskUserQuestion</user-dialog-tool>
</if>
<if condition="<ase-agent-tool/> is 'copilot'">
    <user-dialog-tool>ask_user</user-dialog-tool>
</if>
<if condition="<ase-agent-tool/> is 'codex'">
    <user-dialog-tool>none</user-dialog-tool>
</if>

<define name="custom-dialog">

In the following, you *MUST* *NOT* use the <user-dialog-tool/> tool!
Instead, you *MUST* just show a custom output, let the user enter input,
and then you set the result accordingly. For this, closely follow the
following procedure:

1.  Take the following question specification:
    <spec><content/></spec>

    Take the following options:
    <opts><arg1/></opts>

    The first line of <spec/> (separated by newlines) is of the format:
    `<question-label/>: <question-description/>`

    The second and following lines of <spec/> (separated by newlines) are of the format:
    `<label/>: <description/>`

    The first line provides the question label and the question
    description. The second and following lines each provide an
    answer label and an answer description.

    Do not output anything in this step!

2.  Render the custom dialog, collect the user input, and dispatch on the result:

    1.  You *MUST* not output anything in this step.

        Set <text></text> (set to empty).
        Set <keys></keys> (set to empty).
        Set <n>0</n> (set entry count to zero).
        Set <width/> to the maximum length plus 3 of the <label/> strings in the
        contiguous answer lines of <spec/> starting at line 2 (the answer labels only,
        excluding the question label on line 1, and stopping at the first missing line --
        the same lines the entry loop below renders).

        <for items="2 3 4 5 6 7 8 9">
            Take from <spec/> the line number <item/>.
            If this line does not exist, <break/>.
            If this line exists, parse it according to the format `<label/>: <description/>`.
            Set <n/> to <n/> + 1 (increment entry count).
            Set <label-key/> to `<ase-tpl-key digit="<n/>"/>`.
            Set <label-text/> to `<ase-tpl-pad width="<width/>" text="<label/>:"/>`.
            Append an entry to <text/>:

            <text>
            <text/>
            <ase-tpl-boxline><label-key/>  ▶  **<label-text/>** <description/></ase-tpl-boxline>
            </text>

            <if condition="<keys/> is empty">
                Set <keys><label-key/></keys>
            </if>
            <else>
                Set <keys><keys/>/<label-key/></keys>
            </else>
        </for>

        <if condition="<keys/> is empty">
            Set <keys>**CANCEL**</keys>.
        </if>
        <else>
            Set <keys><keys/>/**CANCEL**</keys>.
        </else>

        <if condition="<opts/> contains `--other`">
            Set <hint>Please choose *one* option by typing <keys/>, or other free-text instruction.</hint>.
        </if>
        <else>
            Set <hint>Please choose *one* option by typing <keys/>.</hint>.
        </else>

        Set:

        <text>
        <ase-tpl-boxed title="DIALOG" subtitle="<question-label/>">

        <ase-tpl-boxline>**<question-description/>**</ase-tpl-boxline>

        <text/>

        <hint/>

        </ase-tpl-boxed>
        </text>

        If <n/> is less than 2:
        Set <result>ERROR: custom-dialog requires 2-8 answer lines, got <n/></result>
        and *SKIP* the following step 2.2 and continue with step 2.3 dispatch.

    2.  Output the following <template/>, end the current turn, wait for the
        user input, store the user input in <result/> and then continue with
        step 2.3 below:

        <template>
        <text/>
        </template>

    3.  Do not output anything in this step!
        Check the <result/> and dispatch accordingly:

        1.  If <result/> already starts with `ERROR:` (potentially set by
            the guard in step 2.1 above), keep <result/> unchanged and
            *SKIP* all remaining steps 2.3.2 - 2.3.4 of this dispatch.

        2.  If <result/> is `cancel`, `CANCEL`, `reject`, `REJECT`, or
            otherwise indicates that the user doesn't want to proceed,
            or the user declined to answer the question, or that
            the dialog was cancelled, rejected or skipped, set
            <result>CANCEL</result>.

        3.  Otherwise, determine the selected <label/>
            by mapping the <result/> (usually containing one of the
            "key" or "label" strings) to one of the answer labels in
            <spec/>. Set <result><label/></result>.

        4.  If <result/> is then *NEITHER* one of the "key"
            *NOR* "label" values from <spec/>:
            <if condition="<opts/> contains `--other`">
                Set <result>OTHER: <result/></result>
                (prefix result with `OTHER: `).
            </if>
            <else>
                Output the following <template/> and then *START OVER*
                by *GOING* to step 2.2.2 above, reusing the already-built
                <text/> from step 2.2.1 unchanged (do *NOT* re-enter step 2.2.1
                and do *NOT* rebuild <text/>, <keys/>, <n/>, or <width/>).

                <template>
                ⧉ **ASE**: ERROR: **Invalid option selected!**
                </template>
            </else>

</define>

