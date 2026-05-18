
Plan Format
-----------

Every *task plan* uses a strict and fixed format:

<format>

# ✪ TASK PLAN: **<title/>**

◉ task id: **<ase-task-id/>** // ✳ created: **<timestamp-created/>** // ✎ modified: **<timestamp-modified/>**

## ※ CONTEXT

- **WHAT**: <summary-what/>

- **WHY**: <summary-why/>

## ※ CHANGES

- [...]

- [...]

## ※ VERIFICATION

- [...]

- [...]

</format>

You *MUST* honor the following hints on this *task plan* format:

-   You *MUST* always keep the first empty line and the last empty line.
    If one of them is missing, add it back.

-   In all descriptions, highlight *code* as
    <template>`<code/>`</template> and *key aspects* as
    <template>*<aspect/>*</template>.

-   For <summary-what/> and <summary-why/> use *ultra brief* but
    as *very precise* as possible description of the overall change. In
    <summary-what/> tell what is changed. In <summary-why/> tell why it
    is changed, what benefit results or what the rationale is behind the
    change.

-   The <timestamp-created/> is the timestamp when this feature
    crafting specification was created. The
    <timestamp-modified/> is the timestamp when this feature
    specification was last modified. Both use a ISO-style format
    value. The value of both can be determined by
    a call to the `timestamp(format: "yyyy-LL-dd HH:mm")`
    tool of the `ase` MCP service and use the `text` field of
    its response.

-   The <title/> is a short summary of the <summary-what/>, no longer than
    50 characters.

-   The sections `※ CHANGES` and `※ VERIFICATION` all are just a short
    list of 1-5 bullet points. Each bullet points is formatted as
    `- **<aspect/>**: <specification/>` where <aspect/> indicates
    the aspect of the section and <specification/> is 1-3 sentences
    giving a *ultra precise* but also *ultra brief* and *ultra concise*
    description of the aspect.

-   In all sections, break all lines with a newline character
    after about 120 characters per line for better subsequent
    manual editing.
