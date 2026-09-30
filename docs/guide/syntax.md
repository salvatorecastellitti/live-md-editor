# Supported syntax

live-md-editor supports [CommonMark](https://commonmark.org) and the
[GitHub Flavored Markdown](https://github.github.com/gfm/) extensions for tables, strikethrough
and task lists. Each example below is a live editor.

## Text

<LiveExample md="Plain text with *italic*, **bold**, ~~strikethrough~~ and `inline code`.\n\nA [link](https://example.com)." />

## Headings

<LiveExample md="# Heading 1\n## Heading 2\n### Heading 3" />

## Lists

<LiveExample md="- Bullet\n  - Nested bullet\n1. Numbered\n2. List\n\n- [x] Done\n- [ ] To do" />

## Quotes, code and rules

<LiveExample md="> A quote\n\n```ts\nconst answer = 42\n```\n\n---" />

## Tables

<LiveExample md="| Left | Center | Right |\n| :--- | :---: | ---: |\n| a | b | c |" />

## Images

```md
![Alt text](https://example.com/picture.png 'Optional title')
```

## Raw HTML

HTML in markdown is kept exactly as written but shown as text, never rendered. This keeps
content from untrusted sources safe.

<LiveExample md="<details>\n<summary>Kept as text</summary>\n</details>" />

## What is kept as-is

- **Front matter:** a `---` block at the very top is hidden while editing and written back
  unchanged.
- **Unknown syntax** such as footnotes or math stays in the text, so nothing is lost.

## How markdown is written back

The editor always writes the same style, so saving never creates noisy diffs:

| Element                   | Written as                  |
| ------------------------- | --------------------------- |
| Bullets                   | `-`                         |
| Emphasis                  | `*italic*`, `**bold**`      |
| Code blocks               | three backticks             |
| Headings                  | `#` style                   |
| Text that looks like HTML | escaped, for example `\<b>` |

The first save of a file written in another style converts it once. After that it stays the same.
