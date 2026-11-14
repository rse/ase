
Approach Skill Common Steps
===========================

<define name="approach-select">

Perform the *approach round* -- a special grilling round whose questions
target *exclusively* the overall *<arg1/> approach* -- where <arg2/> is
the skill chrome of the status lines, <arg3/> is `true` if the answers
are chosen automatically on request (like via `--grill-auto`), or
`false` otherwise, <arg4/> is the list of *literal aspects*, and <arg5/>
is the source of the grounded answer alternatives. It requires the
preceding expansion of the `grill-understanding` definition (see
`ase-common-grill.md`) and the <round-id/> set by the caller. It sets
<approach-result/> to `DONE` (approach decided), `SKIP` (all grilling
skipped), or `STOP` (skill stopped), and <chosen-approach/> to the
decided approach. Do not output anything, except for the templates
below.

1.  Set <approach-label><arg1/></approach-label>,
    <approach-status><arg2/></approach-status>,
    <approach-aspects><arg4/></approach-aspects>, and
    <approach-source><arg5/></approach-source>, so all stay available
    inside the nested expansions below, which bind their own arguments.
    Set <chosen-approach></chosen-approach> (empty) and
    <approach-result>DONE</approach-result>. Set
    <approach-auto>true</approach-auto> if <arg3/> is `true`,
    <ase-project-boxing/> is equal `black`, or <ase-headless/> is equal
    `true`, else set <approach-auto>false</approach-auto>. Set
    <approach-grill-label/> to <grill-label/> and set <grill-label/> to
    ` (approach)` if <approach-grill-label/> is empty, or to
    <approach-grill-label/> with its leading ` (` replaced by
    ` (approach, ` otherwise. Do not output anything.

2.  Determine and show the questions of the approach round:

    <expand name="grill-questions"
        arg1="MAY"
        arg2="<approach-status/>"
        arg3="<approach-aspects/>"
        arg4="<approach-source/>"
        arg5="">
        Override the *Focus Areas* to raise *exclusively* questions on
        the overall *<approach-label/> approach* -- its strategy, its shape, and
        its fundamental realization decisions -- and *no* questions on
        any other detail, which the regular grilling rounds or the
        implementation decide. Raise *one to four* questions: usually
        just *one*, and more only for *independent* approach decisions,
        but *always* at least one, as this round is *never* finished
        early. The answer alternatives of a question are the competing
        approaches for its decision, distinct in their strategy or
        trade-off, and the detail of every answer carries its pros and
        cons.
    </expand>

    Then restore <grill-label/> to <approach-grill-label/>. Do not
    output anything.

3.  <if condition="<approach-auto/> is equal `true`">
    Answer the questions without any dialog:

    <expand name="grill-auto" arg1="<approach-status/>"></expand>
    </if>
    <else>
    In the following, you *MUST* *NOT* use your built-in
    <user-dialog-tool/> tool! Instead, you *MUST* just show a custom
    dialog according to the expanded `custom-dialog` definition. You
    *MUST* closely follow this definition. Its only answer options are
    the two fixed ones, so the user normally answers all aspects in
    *one* free-text reply:

    <expand name="custom-dialog" arg1="--other">
        <round-id/>: What is your (combined) answer to all (or a subset) of the above questions? (keywords or `nX` short responses are sufficient)
        SKIP GRILLING: skip all remaining grilling and continue
        STOP SKILL: stop the entire skill immediately
    </expand>

    If <result/> is `STOP SKILL`, set <approach-result>STOP</approach-result>
    and *skip* sub-step 4. If <result/> is `SKIP GRILLING` or `CANCEL`, set
    <approach-result>SKIP</approach-result> and *skip* sub-step 4.
    Otherwise, strip any leading `OTHER: ` prefix from <result/>.
    </else>

4.  Treat <result/> as the combined free-text answers to all questions
    of the approach round:

    <expand name="grill-short-responses"></expand>

    Set <chosen-approach/> to the complete description of every decided
    approach: its summary, its details, and all realization decisions it
    implies. A question the answers leave open stays undecided. Do not
    output anything.

</define>

