# Getting started

live-md-editor is a markdown editor where you never see the markdown. Headings look like
headings, checkboxes are real checkboxes, and the value you get back is a plain markdown string.

## Install

::: code-group

```bash [npm]
npm install live-md-editor
```

```bash [pnpm]
pnpm add live-md-editor
```

```bash [yarn]
yarn add live-md-editor
```

:::

## Quick start

```ts
import { createEditor } from 'live-md-editor'
import 'live-md-editor/style.css'

const editor = createEditor({
  element: document.querySelector('#editor')!,
  value: '# Hello\n\n- [ ] Try me',
  onChange: (markdown) => console.log(markdown),
})
```

That is the whole setup. Using React or Next.js? Jump to the [Next.js guide](./nextjs).

<LiveExample md="# Hello\n\n- [ ] Try me\n- [x] Click a box" />

## Typing shortcuts

| Type at the start of a line | Result                                 |
| --------------------------- | -------------------------------------- |
| `# ` to `###### `           | Heading 1 to 6                         |
| `- `, `* ` or `+ `          | Bullet list                            |
| `1. `                       | Numbered list                          |
| `[ ] ` or `- [ ] `          | Task item                              |
| `> `                        | Quote                                  |
| ` ``` ` then space or Enter | Code block (add a language: ` ```ts `) |
| `---`                       | Horizontal rule                        |

Inline: `**bold**`, `*italic*`, `~~strike~~` and `` `code` `` format as soon as you type the
closing marker.

## Keyboard

| Keys                    | Action                                                  |
| ----------------------- | ------------------------------------------------------- |
| Mod+B / Mod+I / Mod+E   | Bold / italic / inline code                             |
| Mod+Shift+X             | Strikethrough                                           |
| Mod+K                   | Emits `linkShortcut` so you can show your link UI       |
| Tab / Shift+Tab         | Indent / outdent list items, next / previous table cell |
| Enter                   | New list item; nothing inside a table cell              |
| Shift+Enter             | Line break; leaves a code block                         |
| Backspace at line start | Removes a checkbox, or turns a heading into text        |
| Mod+Z / Mod+Shift+Z     | Undo / redo                                             |

Mod is Cmd on Mac and Ctrl elsewhere.

## Options

| Option             | Type                 | Default  | Description                                                                  |
| ------------------ | -------------------- | -------- | ---------------------------------------------------------------------------- |
| `element`          | `HTMLElement`        | required | Where to mount the editor                                                    |
| `value`            | `string`             | `''`     | Initial markdown                                                             |
| `onChange`         | `(markdown) => void` |          | Called after every edit                                                      |
| `changeDelay`      | `number`             | `0`      | Milliseconds to wait before `onChange`. See [large documents](./performance) |
| `placeholder`      | `string`             |          | Shown while empty                                                            |
| `editable`         | `boolean`            | `true`   | `false` makes a read-only renderer                                           |
| `autofocus`        | `boolean`            | `false`  | Focus on mount                                                               |
| `ariaLabel`        | `string`             |          | Accessible name of the editing area                                          |
| `highlight`        | `Highlighter`        |          | Colour code blocks. See [code highlighting](./highlighting)                  |
| `copyButton`       | `boolean`            | `true`   | Copy button on code blocks                                                   |
| `extensions.radio` | `boolean`            | `false`  | Enable [radio lists](./radio)                                                |
| `classNames.root`  | `string`             |          | Extra class on the editing area                                              |

The full list of methods and events is in the [API reference](/api/). To render AI answers as
they stream, see [AI streaming](./ai).

## Saving

`onChange` gives you markdown after each edit, and `editor.getMarkdown()` returns it at any time.
Loading a new document with `editor.setMarkdown(md)` resets undo history and does not call
`onChange`.

Front matter (a `---` block at the top of the file) is kept exactly as it was and hidden while
editing.
