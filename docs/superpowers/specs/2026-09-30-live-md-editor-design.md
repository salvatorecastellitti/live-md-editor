# live-md-editor: Design Spec

Date: 2026-09-30
Status: Approved 2026-09-30; amended after prototyping (see section 15)

## 1. Goal

An open-source, lightweight, framework-agnostic WYSIWYG markdown editor, built to be
AI friendly: most AI models answer in markdown, and the editor renders those answers live,
formatted, while they stream.
Users never see markdown syntax (`###`, `**`, `- [ ]`) while editing: they see
and edit the formatted result directly (real headings, bold text, clickable
checkboxes). Input and output are plain markdown strings.

### Success criteria

- Drop-in usage in a Next.js app with one install, one import, one component.
- Usable from any framework (Vue, Svelte, Angular) or plain HTML via a vanilla API.
- Markdown round-trips losslessly for every supported feature: parsing then
  serializing returns the same markdown.
- Small bundle (core under 115 KB gzipped, see 5.3), enforced in CI. Smooth typing on a
  10,000-line document.
- AI answers stream in formatted, with no raw syntax visible at any moment, and end exactly
  equal to parsing the finished text (section 16).
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
live-md-editor/highlight  syntax highlighting add-on (highlight.js through lowlight, languages on demand)
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
  highlight?: Highlighter,         // colours code blocks (section 17)
  copyButton?: boolean,            // copy button on code blocks, default true
  classNames?: { root?: string },
})

editor.view                                  // underlying ProseMirror view, for advanced use

editor.getMarkdown(): string
editor.setMarkdown(markdown: string): void   // replaces content, keeps history clean
editor.setEditable(editable: boolean): void
editor.isEditable(): boolean
editor.focus(): void
editor.isActive(name: ActiveName, attrs?: object): boolean
editor.on(event: 'change' | 'selectionChange' | 'focus' | 'blur' | 'linkShortcut' | 'streamStart' | 'streamEnd', fn): () => void
editor.stream(options?: StreamOptions): StreamWriter              // section 16
editor.streamFrom(source: TextSource, options?): Promise<string>  // section 16
editor.isStreaming(): boolean
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
  streaming={false}          // true while `value` is still arriving (section 16)
  ref={ref}                  // ref.current exposes the core editor instance
/>
```

To render something from the editor (a toolbar showing active formats), pass a state
setter as `ref`: a `useRef` does not re-render the parent when the editor mounts.

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
| `src/clipboard.ts` | Pasted text read as markdown; `markdownSlice` paste rule shared with streaming |
| `src/stream/heal.ts` | `healMarkdown`: renders unfinished markdown as it will look once complete |
| `src/stream/stable.ts` | Finds the start of the text whose blocks can no longer change |
| `src/stream/stream.ts` | Streaming engine: frame batching, frozen blocks, caret, one-step undo |
| `src/plugins/codeBlocks.ts` | Keeps per-code-block decorations, rebuilding only touched blocks |
| `src/plugins/highlight.ts` | `Highlighter` type and the plugin that applies its tokens |
| `src/plugins/codeCopy.ts` | Copy button widget on every code block |
| `src/highlight/index.ts` | The `live-md-editor/highlight` add-on |
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

Runtime dependencies of the highlight add-on only: `lowlight` 3 and `highlight.js` 11
(importing the core never loads them).

Bundled into our dist (not runtime dependencies): `markdown-it` 14 and
`prosemirror-markdown`, built with two shims: markdown-it's 75 KB `entities`
table is replaced by the browser's own entity decoding, and the unused
`linkify-it` is replaced by a stub.

Peer (optional): `react >= 18`, `react-dom >= 18`.

Measured on the prototype: 139 KB gzipped as-is, 108.7 KB with the shims
(ProseMirror itself is about 70 KB of that; tables about 10 KB). The original
90 KB target is not reachable without dropping features. Streaming, markdown repair,
highlighting hooks and the copy button then added about 3.6 KB, so the budget is
**core under 115 KB gzipped including dependencies** (measured 110.1 KB), the highlight
add-on under 15 KB for its first load (measured 9.6 KB; each language is a separate 1 to 5 KB
file), and style.css under 3.5 KB, all enforced by `size-limit` in CI.

## 6. Behaviour

- Checkbox and radio clicks update the document through a transaction, so
  they are undoable and trigger `onChange`.
- Links render as `<a>`; plain click places the cursor, Mod-click opens.
- Paste: markdown-looking plain text becomes formatted content; HTML from other
  sites or Google Docs is reduced to supported nodes and marks. A paragraph at either edge of
  pasted text merges into the text around the cursor, while headings, lists, code blocks and
  tables stay whole blocks. Text copied from VS Code (which also offers styled HTML) is read
  as markdown.
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
- Math (LaTeX) add-on, footnotes, mermaid diagrams

## 15. Amendments after prototyping (2026-09-30)

A throwaway prototype (72 passing tests) validated the design and changed these points:

1. Size target raised from 90 KB to 110 KB gzipped, with two build shims (5.3).
2. New option `changeDelay` for large documents (3.1, 6).
3. New option `ariaLabel`, new event `linkShortcut`, new `isEditable()`, public `view`,
   and table row/column commands (3.1).
4. Front matter preserved; HTML lookalike text escaped; URLs with spaces encoded (4).
5. Code block language label via CSS instead of a node view (5.2).
6. Added after the AI-friendly request: sections 16 and 17; core budget raised to 115 KB;
   paste keeps headings and other non-paragraph blocks whole; VS Code clipboard read as
   markdown; React `streaming` prop and the state-setter `ref` pattern.

## 16. AI streaming

Goal: show AI answers formatted while they stream (mode 1), and let an AI write into the
user's document at the cursor (mode 2), with one engine.

API (core):

```ts
const writer = editor.stream({ at: 'end' | 'cursor', autoScroll?: boolean })
writer.write(chunk); writer.flush(); writer.end(); writer.abort(); writer.done
await editor.streamFrom(source /* fetch body, ReadableStream, async iterable of string or bytes */,
  { at, autoScroll, signal })
```

Behaviour:

- `at: 'end'` (default) appends to the document (replacing a single empty paragraph).
  `at: 'cursor'` replaces the selection; each frame re-inserts the text with the paste rule
  of section 6, so the result never jumps when the stream ends.
- While streaming: read-only, root class `lme-streaming` and `aria-busy="true"`, a caret
  widget where text arrives. Auto-scroll (default on for `'end'`) keeps the caret in view
  unless the user scrolled away.
- Unfinished markdown is repaired for display by `healMarkdown` (exported): unclosed code
  fences closed; unclosed emphasis, strikethrough and inline code closed, or hidden if nothing
  follows them yet; half-written links show their label, half-written images and HTML tags are
  hidden; a table header waits for its delimiter row.
- Chunks are buffered and rendered at most once per animation frame. In `'end'` mode, blocks
  followed by a blank line and a fresh block start are frozen; only the tail is re-parsed.
- `end()` parses the exact final text (no repair); `abort()` keeps what arrived, repaired. Both
  make the stream one undo step (restore without history, then one recorded insertion).
- `onChange` is not called during streaming and fires once at the end. Events `streamStart`
  and `streamEnd(markdown)`. `setMarkdown`, `destroy` or a new stream end a running stream.
- `streamFrom` decodes bytes as UTF-8 (characters split across chunks included), stops on the
  abort signal keeping what arrived, and on a source error keeps what arrived and rethrows.

React: `streaming` prop. While true, a `value` that extends the previous one is written as a
chunk; a `value` that does not restarts the stream; turning false ends it. This matches how AI
SDKs expose a growing message and a streaming status.

Docs include a Next.js route handler streaming Claude with `@anthropic-ai/sdk`
(`claude-opus-5-5`, `fallbacks: "default"` so a declined request continues on a fallback model
in the same stream), and the Next.js example has an AI page with a simulated answer that needs
no API key plus an "AI: continue" button that streams at the cursor.

Tests: repair cases plus every cut point of a realistic answer showing no raw syntax; streaming
in chunks of 1 to 5000 characters ending identical to a one-shot parse, never showing raw syntax;
undo, abort, events, byte decoding, abort signal, source errors; browser tests for rendering,
caret and auto-scroll; a performance test streaming a 2,000-line answer (measured 0.4 ms median
per frame, flat as the answer grows).

## 17. Code highlighting and copy button

- Core option `highlight?: Highlighter` where
  `Highlighter = (code, language) => HighlightToken[] | null | Promise<...>` and
  `HighlightToken = { from, to, className }` (offsets into the code). Tokens become inline
  decorations; results are cached (200 entries); async results trigger one refresh; failures
  leave the code plain. Only blocks with a language are highlighted; only changed blocks are
  re-highlighted.
- Add-on `live-md-editor/highlight` exports `highlight` (about 30 languages with common
  aliases, each loaded with a dynamic import on first use) and
  `registerLanguage(name, grammar, aliases)`.
- Theme maps highlight.js classes to `--lme-code-*` variables with light and dark values.
- Copy button: widget in the top-right corner of every code block (default on,
  `copyButton: false` to disable), visible on hover, keyboard focus and touch screens, labelled
  "Copy code" then "Copied" for 1.5 s, copies the code text (Clipboard API with a textarea
  fallback), works in read-only mode, never part of the document or the markdown.
- Docs: a highlighting guide including a recipe for plugging in Shiki or any highlighter.
