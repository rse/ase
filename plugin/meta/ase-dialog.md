
User Dialog
===========

<user-dialog-tool>unknown</user-dialog-tool>
<if condition="<ase-agent-tool/> is 'claude'">
    <user-dialog-tool>AskUserQuestion</user-dialog-tool>
</if>
<if condition="<ase-agent-tool/> is 'copilot'">
    <user-dialog-tool>ask_user</user-dialog-tool>
</if>

<define name="user-dialog">

Let the *user interactively choose* an answer.

1.  Take the following question specification:

    <spec>
        <content/>
    </spec>

    The first line of <spec/> (separated by newlines) is of the format:
    `<question-label/>: <question-description/>`

    The second and following lines of <spec/> (separated by newlines) are of the format:
    `<label/>: <description/>`

    The first line provides the question label and the question
    description. The second and following lines each provide an
    answer label and an answer description.

    Do not output anything in this step!

2.  Dispatch according to the agent tool:

    -   <if condition="<ase-agent-tool/> is 'claude'">

        1.  Start with <config></config> (set config to empty).
            Do not output anything in this step!

            Start with <n>0</n> (set entry count to zero).
            <for items="2 3 4 5">
                Take from <spec/> the line number <item/>.
                If this line does not exist, <break/>.
                If this line exists, parse it according to the format `<label/>: <description/>`.
                If <config/> is not empty, set <config><config/>, </config> (append comma).
                Set <config><config/>{ label: "<label/>",
                description: "<description/>" }</config> (append a config entry).
                Set <n/> to <n/> + 1 (increment entry count).
            </for>

            If <n/> is less than 2:
            Set <result>ERROR: user-dialog requires 2-4 answer lines, got <n/></result>
            and *SKIP* the following step 2.2 (do not call `AskUserQuestion`)
            and continue with step 2.3 dispatch.

        2.  Call the `AskUserQuestion` tool of the agent harness with:

            `AskUserQuestion({
                questions: [
                    {
                        header:      "<question-label/>",
                        question:    "<question-description/>",
                        multiSelect: false,
                        options: [
                            <config/>
                        ]
                    }
                ]
            })`

        3.  Check the tool result and dispatch accordingly:

            -   If the tool result contains `user doesn't want to proceed`,
                `tool use was rejected`, or `user declined to answer
                questions`, or the result clearly indicates that the
                dialog was cancelled, rejected or skipped, set
                <result>CANCEL</result>.

            -   Otherwise, extract the selected <answer/> from the
                tool result `"<question-description/>"="<answer/>"`.
                Set <result><answer/></result>.
                If <result/> is then NOT one
                of the "label" values from <config/>, set
                <result>OTHER: <result/></result>
                (prefix result with "OTHER").

            Do not output anything in this step!
        </if>

    -   <if condition="<ase-agent-tool/> is 'copilot'">

        1.  Start with <config></config> (set config to empty).
            Do not output anything in this step!

            Start with <n>0</n> (set entry count to zero).
            <for items="2 3 4 5">
                Take from <spec/> the line number <item/>.
                If this line does not exist, <break/>.
                If this line exists, parse it according to the format `<label/>: <description/>`.
                If <config/> is not empty, set <config><config/>, </config> (append comma).
                Set <config><config/>"<label/>: <description/>"</config> (append a config entry).
                Set <n/> to <n/> + 1 (increment entry count).
            </for>

            If <n/> is less than 2:
            Set <result>ERROR: user-dialog requires 2-4 answer lines, got <n/></result>
            and *SKIP* the following step 2.2 (do not call `ask_user`)
            and continue with step 2.3 dispatch.

        2.  Call the `ask_user` tool of the agent harness with:

            `ask_user({
                question: "<question-label/>: <question-description/>",
                allow_freeform: true,
                choices: [
                    <config/>
                ]
            })`

        3.  Check the tool result and dispatch accordingly:

            -   If the tool result contains `User skipped question`
                or the result clearly indicates that the
                dialog was cancelled, rejected or skipped, set
                <result>CANCEL</result>.

            -   Otherwise, extract the selected answer from the tool result
                set <result/> accordingly. If <result/> is of the
                expected format `<label/>: <description/>`, set
                <result><label/></result> (set result to label). Else,
                if <result/> is NOT of the expected format `<label/>:
                <description/>`, set <result>OTHER: <result/></result>
                (prefix result with "OTHER").

            Do not output anything in this step!

        </if>

</define>

<define name="custom-dialog">

In the following, you *MUST* *NOT* use the <user-dialog-tool/> tool!
Instead, you *MUST* just show a custom output, let the user enter input,
and then you set the result accordingly. For this, closely follow the
following procedure:

1.  Take the following question specification:

    <spec>
        <content/>
    </spec>

    The first line of <spec/> (separated by newlines) is of the format:
    `<question-label/>: <question-description/>`

    The second and following lines of <spec/> (separated by newlines) are of the format:
    `<label/>: <description/>`

    The first line provides the question label and the question
    description. The second and following lines each provide an
    answer label and an answer description.

    Do not output anything in this step!

2.  Dispatch according to the agent tool:

    1.  You *MUST* not output anything in this step.

        Set <text></text> (set to empty).
        Set <keys></keys> (set to empty).
        Set <n>1</n> (set entry count to one).
        Set <width/> to the maximum length plus 3 of all <label/> strings in <spec/>.

        <for items="2 3 4 5 6 7 8 9">
            Take from <spec/> the line number <item/>.
            If this line does not exist, <break/>.
            If this line exists, parse it according to the format `<label/>: <description/>`.
            Set <label-key/> to <ase-tpl-key digit="<n/>"/>.
            Set <label-text/> to `<ase-tpl-pad width="<width/>" text="<label/>:"/>`.
            Append an entry to <text/>:

            <text>
            <text/>
            <ase-tpl-boxline><label-key/>  ▶  **<label-text/>** <description/></ase-tpl-boxline>
            </text>

            Set <n/> to <n/> + 1 (increment entry count).
            <if condition="<keys/> is empty">
                Set <keys><label-key/></keys>
            </if>
            <else>
                Set <keys><keys/>/<label-key/></keys>
            </else>
        </for>

        Set:

        <text>
        <ase-tpl-boxed title="DIALOG" subtitle="<question-label/>">

        <ase-tpl-boxline>**<question-description/>**</ase-tpl-boxline>

        <text/>

        Please choose *one* option by typing <keys/>/**CANCEL** or free-text instruction.

        </ase-tpl-boxed>
        </text>

        If <n/> is less than 3:
        Set <result>ERROR: user-dialog requires 2-8 answer lines, got less</result>
        and *SKIP* the following step 2 and continue with step 3 dispatch.

    2.  Output the following <template/>, end the current turn, wait for the
        user input, store the user input in <result/> and then continue with step 3:

        <template>
        <text/>
        </template>

    3.  Do not output anything in this step!
        Check the <result/> and dispatch accordingly:

        1.  If <result/> is `CANCEL`, `REJECT`, or otherwise indicates
            that the user doesn't want to proceed, or the user declined to
            answer the question, or that the dialog was cancelled, rejected
            or skipped, set <result>CANCEL</result>.

        2.  Otherwise, determine the selected <label/>
            by mapping the <result/> (usually containing one of the
            "key" or "label" strings) to one of the answer labels in
            <spec/>. Set <result><label/></result>.

        3.  If <result/> is then *NEITHER* one of the "key" *NOR*
            "label" values from <spec/>, set <result>OTHER:
            <result/></result> (prefix result with "OTHER").

</define>

