
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
    <expand name="<define-name/>" [arg1="<expand-arg1/>" [arg2="<expand-arg2/>" [...]]]>[<expand-content/>]</expand>:

    This specifies the *expansion* of previous <define/>. This
    construct is expanded to the <define-body/> of <define/> with
    `<args/>` substituted with `<expand-arg1/> <expand-arg2/> [...]`,
    `<arg1/>` substituted with <expand-arg1/>, `<arg2/>` substituted
    with <expand-arg2/>, etc, and `<content/>` substituted with
    <expand-content/>. Do not output anything else.

-   *IMPORTANT*: You *MUST* honor the following control flow construct:
    <flow><flow-body/></flow>:

    This specifies a *sequential flow* of <step/>s, which have
    to be followed/executed in exactly the given order.
    This construct is expanded to its <flow-body/>.
    Do not output anything else.

-   *IMPORTANT*: You *MUST* honor the following control flow construct:
    <step id="<id/>" [condition="<step-condition/>"]><step-body/></step>:

    This specifies a distinct *single step* in a <flow/>.
    This construct is expanded to its <step-body/>.
    The optional `condition` attribute *enables* the step only if
    <step-condition/> is met: if <step-condition/> is met, this construct
    is expanded to its <step-body/>; if <step-condition/> is *not* met,
    the entire step is silently *skipped* and this construct is expanded
    to the empty string. When the `condition` attribute is *absent*, the
    step is *always* enabled. Do not output anything else.

-   *IMPORTANT*: You *MUST* honor the following control flow construct:
    <if condition="<if-condition/>"><if-body/></if>:

    This specifies a simple condition which is expanded to <if-body/>
    if <if-condition/> is met, or to empty string if <if-condition/> is
    *not* met. It can be optionally followed by one or more <elseif/>
    constructs and/or one final <else/> construct. Do not output anything else.

-   *IMPORTANT*: You *MUST* honor the following control flow construct:
    <elseif condition="<elseif-condition/>"><elseif-body/></elseif>:

    This specifies an *alternative condition* and has to directly
    follow an <if/> or another <elseif/> construct. It is expanded
    to <elseif-body/> if the conditions of all preceding <if/> and
    <elseif/> constructs of the chain were *not* met and its own
    <elseif-condition/> is met, or to the empty string otherwise.
    Do not output anything else.

-   *IMPORTANT*: You *MUST* honor the following control flow construct:
    <else><else-body/></else>:

    This specifies the *fallback alternative* and has to directly
    follow an <if/> or <elseif/> construct. It is expanded to
    <else-body/> if the conditions of all preceding <if/> and
    <elseif/> constructs of the chain were *not* met, or to the empty
    string otherwise. Do not output anything else.

-   *IMPORTANT*: You *MUST* honor the following control flow construct:
    <while condition="<while-condition/>"><while-body/></while>:

    This specifies a <while-body/> which is *repeated* as long as
    <while-condition/> is met. This construct is expanded to the
    repetition of <while-body/>. A <break/> in <while-body/> can stop
    the repetition early. Do not output anything else.

-   *IMPORTANT*: You *MUST* honor the following control flow construct:
    <for items="<for-item/> [...]"><for-body/></for>:

    This specifies a <for-body/> which is *repeated* for all
    <for-item/>s and where `<item/>` is expanded with the current
    <for-item/> in <for-body/>. This construct is expanded to the
    repetition of <for-body/>. A <break/> in <for-body/> can stop the
    repetition early. Do not output anything else.

-   *IMPORTANT*: You *MUST* honor the following control flow construct:
    <break/>:

    This specifies an *early termination* of the innermost enclosing
    <while/> or <for/> repetition: when reached, the current repetition
    is finished and no further repetitions are performed. This construct
    is expanded into nothing. Do not output anything else.

