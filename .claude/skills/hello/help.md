
##  NAME

`hello` - Show a Nice Greeting Message

##  SYNOPSIS

`hello`
    [`--help`|`-h`]
    [`--lang`|`-l` *language*]
    [*subject*]

##  DESCRIPTION

The `hello` skill shows a *nice greeting message* with a *timestamp*. It
greets a given *subject* (default: `World`) and optionally renders the
greeting in a selectable *language*. The output is a single Markdown
line of the form `[<time>]: *Hello*, **<subject>**, nice to meet you!`,
translated into the requested language.

##  OPTIONS

`--lang`|`-l` *language*:
    Render the greeting in the target *language*, which can be either
    `en` (English, default), `de` (German), `fr` (French), or `it`
    (Italian).

##  ARGUMENTS

*subject*:
    Greet the given *subject* (default: `World`).

##  EXAMPLES

Greet the default subject:

```text
❯ /hello
```

Greet a specific subject:

```text
❯ /hello Ralf
```

Greet a specific subject in German:

```text
❯ /hello --lang de Ralf
```
