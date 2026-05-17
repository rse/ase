

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

    Each line of <spec/> (separated by newlines) is of the format:

    `<label/>: <description/>`.

    The first line provides the question label and the question
    description. The second and following lines each provide an
    answer label and an answer description.

    Do not output anything in this step!

2.  Dispatch according to the agent tool:

    -   <if condition="<ase-agent-tool/> is 'claude'">

        1.  Start with <config></config> (set config to empty).
            Do not output anything in this step!

            <for items="2 3 4 5">
                Take from <config/> the line number <item/>.
                If this line does not exist, <break/>.
                If this line exists, parse it according to the format `<label/>: <description/>`.
                If <config/> is not empty, set <config><config/>, </config> (append comma).
                Set <config><config/>{ label: "<label/>",
                description: "<description/>" }</config> (append a config entry).
            </for>

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
                dialog was cancelled, rejected or skipped, set set
                <result>CANCEL</result>.

            -   Otherwise, extract the selected <answer/> from the
                tool result `"<question-description/>"="<answer/>".
                Set <result><answer/></result>.
                If <result/> is then NOT one
                the "label" values from <config/>, set
                <result>OTHER: <result/></result>
                (prefix result with "OTHER").

            Do not output anything in this step!
        </if>

    -   <if condition="<ase-agent-tool/> is 'copilot'">

        1.  Start with <config></config> (set config to empty).
            Do not output anything in this step!

            <for items="2 3 4 5">
                Take from <config/> the line number <item/>.
                If this line does not exist, <break/>.
                If this line exists, parse it according to the format `<label/>: <description/>`.
                If <config/> is not empty, set <config><config/>, </config> (append comma).
                Set <config><config/>"<label/>: <description/>"</config> (append a config entry).
            </for>

        2.  Call the `AskUserQuestion` tool of the agent harness with:

            `ask_user({
                question: "<question-label>: <question-description/>",
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
