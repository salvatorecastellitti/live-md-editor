# live-md-editor: Design Spec

Date: 2026-09-30
Status: Draft, awaiting review

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
- Small bundle, enforced in CI. Smooth typing on a 10,000-line document.
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
  placeholder?: string,
  editable?: boolean,              // default true; false = read-only renderer
  autofocus?: boolean,
  extensions?: { radio?: boolean },     // opt-in syntax, default all false
  classNames?: { root?: string },
})

editor.getMarkdown(): string
editor.setMarkdown(markdown: string): void   // replaces content, keeps history clean
editor.setEditable(editable: boolean): void
editor.focus(): void
editor.isActive(name: ActiveName, attrs?: object): boolean
editor.on(event: 'change' | 'selectionChange' | 'focus' | 'blur', fn): () => void  // returns unsubscribe
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

Controlled mode rule: when `value` changes from outside, the document is only
rebuilt if `value !== editor.getMarkdown()`. This prevents cursor jumps while typing.

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
| `src/schema.ts` | Nodes and marks for every supported feature |
| `src/markdown/parser.ts` | Markdown to doc via `markdown-it` (tables, strikethrough) + own task and radio rules, through `prosemirror-markdown` |
| `src/markdown/serializer.ts` | Doc to canonical markdown |
| `src/markdown/radio.ts`, `task.ts` | markdown-it plugins for list item markers |
| `src/inputRules.ts` | Live shortcuts: `# ` to `###### `, `> `, `- `, `1. `, `- [ ] `, `- ( ) `, triple backtick, `---`, `**x**`, `*x*`, `~~x~~`, `` `x` `` |
| `src/keymap.ts` | Mod-B/I/K/E, Mod-Shift-X (strike), Enter/Backspace/Tab/Shift-Tab in lists, Mod-Z / Mod-Shift-Z |
| `src/views/checkItem.ts` | Task and radio item node views with real `<input>` elements |
| `src/views/codeBlock.ts` | Code block with language label |
| `src/plugins/placeholder.ts` | Placeholder decoration when empty |
| `src/plugins/links.ts` | Mod-click opens link in new tab (`rel="noopener noreferrer"`) |
| `src/paste.ts` | Plain text that looks like markdown is parsed; HTML is reduced to the schema |
| `src/url.ts` | URL allowlist (`http:`, `https:`, `mailto:`, relative) |
| `src/commands.ts` | Public command set and `isActive` |
| `src/editor.ts` | `createEditor`, event emitter, lifecycle |
| `src/index.ts` | Public exports only |
| `src/react/index.tsx` | React wrapper |
| `src/style.css` | Default theme |

Each module has one job and is tested on its own.

### 5.3 Dependencies

Runtime: `prosemirror-model`, `prosemirror-state`, `prosemirror-view`,
`prosemirror-transform`, `prosemirror-commands`, `prosemirror-keymap`,
`prosemirror-history`, `prosemirror-inputrules`, `prosemirror-schema-list`,
`prosemirror-tables`, `prosemirror-markdown`, `markdown-it`.

Peer (optional): `react >= 18`, `react-dom >= 18`.

The size budget is set after the first build measures the real number, then
enforced by `size-limit` in CI. Target: core under 90 KB gzipped including
dependencies.

## 6. Behaviour

- Checkbox and radio clicks update the document through a transaction, so
  they are undoable and trigger `onChange`.
- Links render as `<a>`; plain click places the cursor, Mod-click opens.
- Paste: markdown-looking plain text becomes formatted content; HTML from other
  sites or Google Docs is reduced to supported nodes and marks.
- `editable: false` hides the caret, and checkboxes become non-interactive.
- `setMarkdown` does not add an undo step.

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
- **Performance check:** 10,000-line document, measured keystroke latency.
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
