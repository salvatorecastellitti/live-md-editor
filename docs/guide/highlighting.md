# Code highlighting

AI answers are full of code. Colour it with the highlighting add-on:

```ts
import { createEditor } from 'live-md-editor'
import { highlight } from 'live-md-editor/highlight'

createEditor({ element, highlight })
```

```tsx
<LiveMarkdownEditor highlight={highlight} />
```

- It is built on [highlight.js](https://highlightjs.org) (through lowlight) and knows about 30
  common languages plus their usual aliases (`ts`, `py`, `sh`, `yml`...).
- **Languages load on demand.** The add-on itself is about 10 KB gzipped; each language is a
  separate small file (1 to 5 KB) fetched the first time a code block uses it.
- Only code blocks with a language are coloured. Detecting the language automatically would be
  slow and often wrong.
- Colours are decorations: the text stays plain, so editing, copying and the markdown output are
  unaffected. While an answer streams in, its code block is re-coloured as it grows.

## Other languages

```ts
import haskell from 'highlight.js/lib/languages/haskell'
import { registerLanguage } from 'live-md-editor/highlight'

registerLanguage('haskell', haskell, ['hs'])
```

## Colours

The default theme maps highlight.js classes to CSS variables, with light and dark values:
`--lme-code-keyword`, `--lme-code-string`, `--lme-code-comment`, `--lme-code-number`,
`--lme-code-function`, `--lme-code-type`, `--lme-code-property`, `--lme-code-tag`,
`--lme-code-inserted`, `--lme-code-deleted`. See [Theming](./theming).

## Using Shiki or another highlighter

`highlight` accepts any function that returns token ranges for a code block, or a promise of
them:

```ts
import type { Highlighter } from 'live-md-editor'

const myHighlighter: Highlighter = async (code, language) => {
  const tokens = await tokenize(code, language) // your highlighter
  return tokens.map((token) => ({ from: token.start, to: token.end, className: `tok-${token.kind}` }))
}
```

Return `null` to leave a block plain. Results are cached per code and language.

## Copy button

Every code block gets a copy button in its corner (it shows on hover or keyboard focus, and is
always visible on touch screens). It copies the code as plain text and also works in read-only
mode. Turn it off with `copyButton: false`.
