# live-md-editor: Design Spec

Date: 2026-09-30
Status: Approved 2026-09-30; amended after prototyping (see section 15)

## 1. Goal

An open-source, lightweight, framework-agnostic WYSIWYG markdown editor.
Users never see markdown syntax (`###`, `**`, `- [ ]`) while editing: they see
and edit the formatted result directly (real headings, bold text, clickable
checkboxes). Input and output are plain markdown strings.

### Success criteria

- Drop-in usage in a Next.js app with one install, one import, one component.
- Usable from any framework (Vue, Svelte, Angular) or plain HTML via a vanilla API.
- Markdown round-trips losslessly for every supported feature: parsing then
  serializing returns the same markdown.
- Small bundle (core under 110 KB gzipped, see 5.3), enforced in CI. Smooth typing on a
  10,000-line document.
- Documentation and project hygiene good enough for public open-source release
  on day one.

### Decisions already made

| Decision | Choice | Reason |
|---|---|---|
| Editing engine | ProseMirror + own markdown layer | Most battle-tested on mobile and IME; strict document model maps cleanly to markdown; no framework dependency |
| UI scope | Headless + default theme | No built-in toolbar; commands API lets each user build their own UI. Lightest option |
| Framework support | Vanilla core + React wrapper | Next.js is the primary consumer; core stays usable anywhere |
| Expo / React Native | Deferred to a later separate package | Core API is designed so a WebView or DOM-component wrapper can be added without changes |
| Radio buttons | Opt-in custom syntax | Not part of any markdown spec |

## 2. Package shape

One npm package, `live-md-editor` (name confirmed available on npm on 2026-09-30),
with subpath exports:

```
live-md-editor            framework-agnostic core (TypeScript, no framework deps)
live-md-editor/react      <LiveMarkdownEditor/> wrapper (react is an optional peer dependency)
live-md-editor/style.css  default theme, fully driven by CSS variables
```

Builds: ESM + CJS, bundled `.d.ts` types, `sideEffects: ["*.css"]`.
React code never appears in the core bundle.

## 3. Public API

### 3.1 Core

```ts
import { createEditor } from 'live-md-editor'

const editor = createEditor({
  element: HTMLElement,            // required: where to mount
  value?: string,                  // initial markdown, default ''
  onChange?: (markdown: string) => void,  // fires only on content change
  changeDelay?: number,            // ms to wait after the last edit before onChange; default 0
  placeholder?: string,
  editable?: boolean,              // default true; false = read-only renderer
  autofocus?: boolean,
  ariaLabel?: string,
  extensions?: { radio?: boolean },     // opt-in syntax, default all false
  classNames?: { root?: string },
})

editor.view                                  // underlying ProseMirror view, for advanced use

editor.getMarkdown(): string
editor.setMarkdown(markdown: string): void   // replaces content, keeps history clean
editor.setEditable(editable: boolean): void
editor.isEditable(): boolean
editor.focus(): void
editor.isActive(name: ActiveName, attrs?: object): boolean
editor.on(event: 'change' | 'selectionChange' | 'focus' | 'blur' | 'linkShortcut', fn): () => void  // returns unsubscribe
editor.destroy(): void

editor.commands.toggleBold()
editor.commands.toggleItalic()
editor.commands.toggleStrike()
editor.commands.toggleCode()
editor.commands.setLink(href: string) / unsetLink()
editor.commands.setHeading(level: 1..6) / setParagraph()
editor.commands.toggleBulletList() / toggleOrderedList() / toggleTaskList() / toggleRadioList()
editor.commands.toggleBlockquote()
editor.commands.setCodeBlock(language?: string)
editor.commands.insertHorizontalRule()
editor.commands.insertTable(rows: number, cols: number)
editor.commands.addRowAfter() / addColumnAfter() / deleteRow() / deleteColumn() / deleteTable()
editor.commands.insertImage(src: string, alt?: string)
editor.commands.undo() / redo()
```

Every command returns `boolean` (whether it applied), which makes
`disabled` states on toolbar buttons trivial.

### 3.2 React

```tsx
'use client'
import { LiveMarkdownEditor, type LiveMarkdownEditorHandle } from 'live-md-editor/react'
import 'live-md-editor/style.css'

<LiveMarkdownEditor
  value={md}                 // controlled, or use defaultValue for uncontrolled
  onChange={setMd}
  placeholder="Write..."
  editable
  ref={ref}                  // ref.current exposes the core editor instance
/>
```

Controlled mode rule: when `value` changes, the document is only rebuilt if
`value` is neither the last markdown the editor reported through `onChange` nor
equal to `editor.getMarkdown()`. This prevents cursor jumps while typing, and
stops a late echo of an old value (possible with `changeDelay`) from wiping newer text.

SSR safety: importing the package on the server does not touch `window` or
`document`. The editor mounts in `useEffect`, and the server renders an empty
container with the same class so layout does not shift.

### 3.3 Consumer usage examples (go in README and docs)

- Next.js: client component as above.
- Plain HTML: `import { createEditor } from 'https://esm.sh/live-md-editor'`.
- Vue / Svelte / Angular: call `createEditor` in the mount hook and `destroy` in the unmount hook.

## 4. Markdown scope

Supported (CommonMark + GFM):

- Headings 1 to 6
- Paragraphs, hard breaks
- Bold, italic, strikethrough, inline code
- Links, images (rendered inline from URL)
- Bullet, ordered and task lists (`- [ ]`, `- [x]`), nested
- Blockquotes
- Fenced code blocks with language attribute (no syntax highlighting in v1)
- Horizontal rules
- GFM tables (with column alignment)

Opt-in extension:

- Radio lists: `- ( ) option` and `- (x) option`. Consecutive radio items form
  one group; selecting one clears the others in that group.

Raw HTML: preserved verbatim on serialize, displayed as inert text, never
rendered as DOM.

Front matter: a leading `---` YAML block is kept verbatim (hidden in the editor)
and written back unchanged.

Plain text that looks like HTML (`<b>`) or an entity (`&amp;`) is backslash
escaped on save so it stays text. Link and image URLs have spaces encoded as
`%20` and parentheses escaped so they survive a save.

Serializer output is canonical and stable: bullets use `-`, emphasis uses `*`,
strong uses `**`, code fences use three backticks. Round-trip tests assert
`serialize(parse(md)) === md` for canonical input; non-canonical input is normalized
once and then stays stable.

## 5. Architecture

### 5.1 Data flow

```
markdown ──parse──▶ ProseMirror doc ──render──▶ editable formatted DOM
    ▲                        │ typing, clicks, shortcuts, paste
    └──── serialize ◀────────┘ → onChange(markdown)
```

The ProseMirror document is the source of truth during editing. Markdown is
serialized only on content-changing transactions (`tr.docChanged`) and on
`getMarkdown()`.

### 5.2 Modules

| File | Responsibility |
|---|---|
| `src/url.ts` | URL allowlist (`http:`, `https:`, `mailto:`, relative) |
| `src/schema.ts` | Nodes and marks for every supported feature (typed node and mark names) |
| `src/markdown/checkItems.ts` | markdown-it plugin for `[ ]`/`[x]` and `( )`/`(x)` list item markers |
| `src/markdown/parser.ts` | Markdown (+ front matter) to doc via `markdown-it` through `prosemirror-markdown` |
| `src/markdown/serializer.ts` | Doc to canonical markdown |
| `src/commands/checkItem.ts` | Toggle a task item; select a radio item and clear its group |
| `src/views/listItem.ts` | List item node view: real `<input>` for task and radio items |
| `src/plugins/inputRules.ts` | Live shortcuts: `# ` to `###### `, `> `, `- `, `1. `, `[ ] `, `( ) `, triple backtick, `---`, `**x**`, `*x*`, `_x_`, `~~x~~`, `` `x` `` |
| `src/plugins/keymap.ts` | Mod-B/I/E, Mod-Shift-X (strike), Mod-K (emits `linkShortcut`), Enter/Backspace/Tab/Shift-Tab, undo/redo |
| `src/plugins/placeholder.ts` | Placeholder decoration when empty |
| `src/plugins/links.ts` | Mod-click opens link in new tab (`noopener,noreferrer`) |
| `src/commands/index.ts` | Public command set and `isActive` |
| `src/editor.ts` | `createEditor`, events, change batching, paste of markdown text, lifecycle |
| `src/index.ts` | Public exports only |
| `src/react/index.tsx` | React wrapper |
| `src/style.css` | Default theme |
| `shims/entities.ts`, `shims/linkify-it.ts` | Build-time replacements that cut about 30 KB gzipped (see 5.3) |

The code block language label is drawn by CSS from a `data-language` attribute,
so it needs no node view.

Each module has one job and is tested on its own.

### 5.3 Dependencies

Runtime: `prosemirror-model`, `prosemirror-state`, `prosemirror-view`,
`prosemirror-transform`, `prosemirror-commands`, `prosemirror-keymap`,
`prosemirror-history`, `prosemirror-inputrules`, `prosemirror-schema-list`,
`prosemirror-tables`, `prosemirror-gapcursor`, `prosemirror-dropcursor`.

Bundled into our dist (not runtime dependencies): `markdown-it` 14 and
`prosemirror-markdown`, built with two shims: markdown-it's 75 KB `entities`
table is replaced by the browser's own entity decoding, and the unused
`linkify-it` is replaced by a stub.

Peer (optional): `react >= 18`, `react-dom >= 18`.

Measured on the prototype: 139 KB gzipped as-is, 108.7 KB with the shims
(ProseMirror itself is about 70 KB of that; tables about 10 KB). The original
90 KB target is not reachable without dropping features, so the budget is
**core under 110 KB gzipped including dependencies**, enforced by `size-limit` in CI.

## 6. Behaviour

- Checkbox and radio clicks update the document through a transaction, so
  they are undoable and trigger `onChange`.
- Links render as `<a>`; plain click places the cursor, Mod-click opens.
- Paste: markdown-looking plain text becomes formatted content; HTML from other
  sites or Google Docs is reduced to supported nodes and marks.
- `editable: false` hides the caret, and checkboxes become non-interactive.
- `setMarkdown` does not add an undo step.
- Enter in a list item makes a new unchecked item. Backspace at the start of a
  task or radio item removes its box first; at the start of a heading or code
  block it turns the block into a paragraph.
- Tab and Shift-Tab indent and outdent list items (keeping check state) and move
  between table cells; Tab in the last cell adds a row. Enter does nothing
  inside a table cell (markdown cells are one line).
- Mod-K has no built-in UI (the library is headless); it emits `linkShortcut`.
- With `changeDelay`, pending changes are flushed on blur and on `destroy`.

## 7. Security

- No `innerHTML` with user content.
- Raw HTML is shown as text.
- Link `href` and image `src` pass the URL allowlist; anything else is dropped
  (the text is kept, the link is not).
- `SECURITY.md` describes private vulnerability reporting through GitHub.

## 8. Accessibility

- Root: `role="textbox"`, `aria-multiline="true"`, optional `aria-label` option.
- Task and radio items use real inputs with accessible labels.
- Visible focus styles; the default theme meets WCAG AA contrast.
- Dark mode via `prefers-color-scheme` and an opt-in `data-theme` attribute.

## 9. Theming

All visual values are CSS custom properties on `.lme` (font, sizes, colors,
spacing, radius, accent, code background, table border). The docs list every
variable. No `!important` in the default theme, so overrides are easy.

## 10. Testing

- **Round-trip suite:** one fixture per feature, plus a corpus of real-world
  markdown documents; asserts stable serialization.
- **Unit tests** (Vitest + jsdom): schema, parser, serializer, input rules,
  commands, `isActive`, radio grouping, URL allowlist, controlled React behaviour.
- **Browser tests** (Playwright on Chromium, Firefox, WebKit): typing
  shortcuts, checkbox clicks, paste, undo/redo, mobile viewport.
- **Performance check:** 10,000-line document, measured keystroke latency with
  `changeDelay` set. Measured on the prototype: serializing 10,000 lines takes about
  23 ms, which is why `changeDelay` exists.
- CI on every pull request: typecheck, lint, unit, browser tests, size-limit.

## 11. Documentation

- **README:** 30-second quickstart, demo GIF, install, Next.js / React / vanilla
  examples, bundle size badge, links to docs.
- **Docs site** (VitePress on GitHub Pages):
  - Getting started
  - Framework guides: Next.js, React, Vue, Svelte, plain HTML
  - API reference generated from TSDoc (TypeDoc)
  - Supported syntax page, each feature shown live
  - Theming page listing every CSS variable
  - Radio extension page
  - Live playground: editor next to its raw markdown output
- TSDoc on every public export.

## 12. Open-source hygiene

- MIT license.
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` (Contributor Covenant), `SECURITY.md`.
- Issue templates (bug, feature) and PR template.
- Changesets for versioning and CHANGELOG.
- GitHub Actions: CI workflow, release workflow publishing to npm with provenance,
  docs deploy workflow.
- `examples/nextjs` and `examples/vanilla`, runnable.

## 13. Tooling

- pnpm, TypeScript strict, tsup for builds, Vitest, Playwright, ESLint + Prettier,
  size-limit, publint and `@arethetypeswrong/cli` to validate package exports.

## 14. Out of scope for v1 (roadmap)

- Expo / React Native package
- Image upload hooks
- Real-time collaboration
- Slash menu and optional toolbar package
- Syntax highlighting in code blocks
- Math, footnotes, mermaid diagrams

## 15. Amendments after prototyping (2026-09-30)

A throwaway prototype (72 passing tests) validated the design and changed these points:

1. Size target raised from 90 KB to 110 KB gzipped, with two build shims (5.3).
2. New option `changeDelay` for large documents (3.1, 6).
3. New option `ariaLabel`, new event `linkShortcut`, new `isEditable()`, public `view`,
   and table row/column commands (3.1).
4. Front matter preserved; HTML lookalike text escaped; URLs with spaces encoded (4).
5. Code block language label via CSS instead of a node view (5.2).
