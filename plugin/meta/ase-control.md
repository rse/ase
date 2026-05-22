
Control Flow Constructs
-----------------------

-   *IMPORTANT*: You *MUST* honor the following control flow construct:
    <define name="<define-name/>"><define-body/></define>:

    This specifies a *reusable definition* named <define-name/> and
    an <define-body/> which can contain arbitrary information with
    optional `<args/>` (or alternatively, individual `<arg1/>`,
    `<arg2/>`, etc) and optional `<content/>` references from
    subsequent <expand/> calls.
    This construct is expanded into nothing.
    Do not output anything.

-   *IMPORTANT*: You *MUST* honor the following control flow construct:
    <expand name="<define-name/>" [arg1="<expand-arg1/>" [arg2="<expand-arg2/>]" [...]]]><expand-content/></expand>:

    This specifies the *expansion* of previous <define/>.
    This construct is expanded into the <define-body/> of <define/>
    with `<args/>` substituted with `<expand-arg1/> <expand-arg2/>
    [...]`, `<arg1/>` substituted with <expand-arg1/>, and `<content/>`
    substituted with <expand-content/>.
    Do not output anything else.

-   *IMPORTANT*: You *MUST* honor the following control flow construct:
    <flow><flow-body/></flow>:

    This specifies a *sequential flow* of <step/>s, which have
    to be followed/executed in exactly the given order.
    This construct is expanded to its <flow-body/>.
    Do not output anything else.

-   *IMPORTANT*: You *MUST* honor the following control flow construct:
    <step id="<id/>"><step-body/></step>:

    This specifies a distinct *single step* in a <flow/>.
    This construct is expanded to its <step-body/>.
    Do not output anything else.

-   *IMPORTANT*: You *MUST* honor the following control flow construct:
    <if condition="<if-condition/>"><if-body/></if>:

    This specifies a simple condition which is expanded to <if-body/>
    if <if-condition/> is met, or to empty string if <if-condition/> is
    *not* met. Do not output anything else.

-   *IMPORTANT*: You *MUST* honor the following control flow construct:
    <while condition="<while-condition/>"><while-body/></while>:

    This specifies a <while-body/> which is *repeated* as long as
    <while-condition/> is met. This construct is expanded to the
    repetition of <while-body/>. Do not output anything else.

-   *IMPORTANT*: You *MUST* honor the following control flow construct:
    <for items="<for-item/> [...]"><for-body/></for>:

    This specifies a <for-body/> which is *repeated* for all
    <for-item/>s and where `<item/>` is expanded with the current
    <for-item/> in <for-body/>. This construct is expanded to the
    repetition of <for-body/>. A <break/> in <for-body/> can stop the
    repetition early. Do not output anything else.

