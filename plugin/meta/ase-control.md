
Control Flow Constructs
-----------------------

-   *IMPORTANT*: You *MUST* honor the following control flow construct:
    <define name="<define-name/>"><define-body/></define>:

    This specifies a *reusable definition* named <define-name/> and
    a <define-body/> which can contain arbitrary information with
    optional `<args/>` (or alternatively, individual `<arg1/>`,
    `<arg2/>`, etc.) and optional `<content/>` references from
    subsequent <expand/> calls.
    This construct is expanded into nothing.
    Do not output anything.

-   *IMPORTANT*: You *MUST* honor the following control flow construct:
    <expand name="<define-name/>" [arg1="<expand-arg1/>" [arg2="<expand-arg2/>" [...]]]>[<expand-content/>]</expand>:

    This specifies the *expansion* of previous <define/>. This
    construct is expanded to the <define-body/> of <define/> with
    `<args/>` substituted with `<expand-arg1/> <expand-arg2/> [...]`,
    `<arg1/>` substituted with <expand-arg1/>, `<arg2/>` substituted
    with <expand-arg2/>, etc., and `<content/>` substituted with
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
    if <if-condition/> is met, or to the empty string if <if-condition/> is
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
    is expanded into nothing. Do not output anything.

-   *IMPORTANT*: You *MUST* honor the following control flow construct:
    <sleep duration="<sleep-duration/>"/>:

    This specifies a single *wait* of <sleep-duration/> seconds
    (fractional values like `1.5` are allowed).

    The wait is performed with the `ase_sleep(duration:
    <chunk-duration/>)` tool of the `ase` MCP server, which returns once
    <chunk-duration/> has elapsed. To stay safely inside the tool's own
    duration limit, <chunk-duration/> is *never* above `60`: a
    <sleep-duration/> above `60` is therefore *split* into consecutive
    calls -- as many `60` second calls as fit, followed by one final
    call carrying the remaining seconds -- so the calls sum up to
    exactly <sleep-duration/>.

    This construct is expanded into nothing. Do not output anything.

-   *IMPORTANT*: You *MUST* honor the following control flow construct:
    <await condition="<await-condition/>" [interval="<await-interval/>"]><await-body/></await>:

    This specifies an <await-body/> whose execution *waits* until
    <await-condition/> is met: if <await-condition/> is met, the
    <await-body/> is executed once and the construct is finished. If
    <await-condition/> is *not* met, wait for <await-interval/> seconds
    (default: `60`) and then *start over* by re-evaluating
    <await-condition/>.

    A single wait is performed with the `ase_sleep(duration:
    <chunk-duration/>)` tool of the `ase` MCP server. To stay safely
    inside the tool's own duration limit, <chunk-duration/> is *never*
    above `60`: an <await-interval/> above `60` is therefore *split* into
    consecutive calls -- as many `60` second calls as fit, followed by
    one final call carrying the remaining seconds -- so the calls sum up
    to exactly <await-interval/>. You *MUST* *NOT* re-evaluate
    <await-condition/> between the calls of one such wait.

    This construct is expanded to its <await-body/>. Do not output
    anything else.

-   *IMPORTANT*: You *MUST* honor the following control flow construct:
    <agent <attr/>="<value/>" [...]><agent-body/></agent>:

    This specifies the *invocation* of a *sub-agent* through the
    `Agent` tool. Every XML attribute is passed *verbatim* as the
    identically named parameter of the `Agent` tool (e.g. `description`,
    `subagent_type`, `run_in_background`, `isolation`, `model`), and
    <agent-body/> is passed as its `prompt` parameter.

    The *sole exception* is the *reserved* attribute `result="<var/>"`,
    which is *not* passed on but instead *binds* the result returned
    by the sub-agent to the placeholder `<<var/>/>`. This construct is
    expanded to the result returned by the sub-agent if `result` is
    *absent*, or into nothing if `result` is *present*. Do not output
    anything else.

-   *IMPORTANT*: For *Sub-Agent Delegation*: the <agent/> construct and
    every `Agent` tool invocation prescribed by an ASE skill, agent, or
    meta file specify a *sub-agent dispatch*, not a particular
    mechanism. If the user's instructions designate a dedicated skill
    for delegating work to sub-agents *and* this skill is installed, you
    *MUST* route every such dispatch through it instead: hand over the
    `prompt` plus, for `subagent_type: "ase:<name>"`, the instructions
    of the plugin's sub-agent definition `agents/<name>.md`, preserve
    the requested `model`, parallelism, and isolation, and treat the
    final result of the delegate exactly like the result of the `Agent`
    tool. Otherwise, use the `Agent` tool as prescribed.

-   *IMPORTANT*: You *MUST* honor the following control flow construct:
    <agent-consolidation [group=<agent-group/>]/>:

    This specifies the merging of all the Git WorkTrees created by the
    <agent/> calls which either are identified with the unique group
    <agent-group/> or occur in the last <parallel/> section
    of the context. After merging a single Git WorkTree, remove the Git
    WorkTree.

-   *IMPORTANT*: You *MUST* honor the following control flow construct:
    <skill name="<id/>" [args="<args/>"] [result="<var/>"]/>:

    This specifies the *invocation* of another *skill* through the
    `Skill` tool, with its `skill` parameter set to <id/> and its `args`
    parameter set to <args/> (or to the empty string if the `args`
    attribute is absent).

    The *reserved* attribute `result="<var/>"` *binds* the result
    returned by the skill to the placeholder `<<var/>/>`, exactly
    as for <agent/>. This construct is *always* *self-closing*: a
    *body-bearing* `<skill>` element is *never* an invocation. This
    construct is expanded to the result returned by the skill if
    `result` is *absent*, or into nothing if `result` is *present*. Do
    not output anything else.

-   *IMPORTANT*: You *MUST* honor the following control flow construct:
    <parallel><parallel-body/></parallel>:

    This specifies a <parallel-body/> whose <agent/> and <skill/>
    invocations are *all* dispatched *concurrently*: you *MUST* emit
    them *in one single message* instead of one per turn, and this
    construct is finished only once *all* of them have returned. If two
    or more of these invocations bind the *same* `result` name, the
    corresponding placeholder carries an *array* of their results, in
    the order of their occurrence in <parallel-body/>. This construct is
    expanded to its <parallel-body/>. Do not output anything else.

