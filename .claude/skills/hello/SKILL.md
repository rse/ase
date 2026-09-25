---
name: hello
argument-hint: "[--help|-h] [--lang|-l=(en|de|fr|it)] [<subject>]"
description: >
    Show a nice greeting message with a timestamp.
    Use this when the user wants to greet or say hello,
    optionally to a certain subject <subject> and in a certain language <language>.
user-invocable: true
disable-model-invocation: false
allowed-tools:
    - "Bash(date *)"
    - "Bash(ase util meta *)"
---

!`ase util meta control skill getopt`

<purpose name="hello">
Show a Nice Greeting Message
</purpose>

<expand name="getopt"
    arg1="hello"
    arg2="--lang|-l=(en|de|fr|it)">
    $ARGUMENTS
</expand>

<flow>

1.  <step id="STEP 1: Determine Parameters">

    1.  Set <subject><getopt-arguments/></subject>
        Set <language><getopt-option-lang/></language>

    2.  <if condition="<subject/> is empty">
            Set <subject>World</subject>
        </if>

    3.  The current time <time/> is set by capturing the
        output of the `Bash` tool command `date '+%Y-%m-%d %H:%M:%S'`

    4.  The greeting format in Markdown is exactly:
        `[<time/>]: ☯ *Hello*, **<subject/>**, nice to meet you!`

    </step>

2.  <step id="STEP 2: Produce Output">

    1.  Create the greeting string, based on the greeting format
        and store the result in <greeting/>.

    2.  Translate the <greeting/> into the target language <language/>.

    3.  Output the greeting with the following <template/>.
        Do not output anything else.

        <template>
            <ase-tpl-boxed title="Hello">
                <greeting/>
            </ase-tpl-boxed>
        </template>

    </step>

</flow>

