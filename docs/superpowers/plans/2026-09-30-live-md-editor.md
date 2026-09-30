# live-md-editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and publish-ready `live-md-editor`: a framework-agnostic WYSIWYG markdown editor (vanilla core + React wrapper) with full GFM, task and radio lists, a default theme, tests, docs site, examples and release automation.

**Architecture:** ProseMirror is the editing engine. A typed schema maps every GFM construct to a node or mark; markdown-it (through prosemirror-markdown) parses markdown into that schema and a custom serializer writes canonical markdown back. Plugins add typing shortcuts, key bindings, a placeholder and link clicks; `createEditor()` wires them into one small public API, and `live-md-editor/react` wraps it.

**Tech Stack:** TypeScript 5.9 (strict), ProseMirror, markdown-it 14, prosemirror-markdown, tsup, Vitest 3 + jsdom, Playwright, React 19, VitePress + TypeDoc, Changesets, pnpm 10, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-30-live-md-editor-design.md` (read it before starting; section 15 lists amendments made after prototyping).

**Provenance:** Every source and test file in this plan was run in a throwaway prototype before the plan was written: 153 unit tests, 22 browser tests (Chromium, WebKit, mobile, performance), strict typecheck, ESLint, Prettier, the package build, size-limit, publint, attw, the docs build and a production Next.js build all passed. If a step's result differs from the "Expected" line, stop and investigate before changing the code: it means something in the environment differs.

## Global Constraints

- Package name `live-md-editor`; entry points `live-md-editor`, `live-md-editor/react`, `live-md-editor/style.css`.
- Repository `https://github.com/salvatorecastellitti/live-md-editor`; docs at `https://salvatorecastellitti.github.io/live-md-editor/`.
- Node 22 for development and CI; the published package declares `"engines": { "node": ">=18" }`.
- pnpm 10 (`packageManager: pnpm@10.33.3`). Use `pnpm`, never `npm install`, in this repo.
- TypeScript `~5.9.3` exactly (TS 6+/7 break tsup DTS, TypeDoc and typescript-eslint peer ranges).
- Core bundle: under 110 KB gzipped including dependencies (enforced by size-limit). style.css under 3 KB gzipped.
- Runtime dependencies are only `prosemirror-*` packages. `markdown-it` and `prosemirror-markdown` are devDependencies because tsup bundles them with the shims in `shims/`.
- React is an optional peer dependency (`>=18`). Core code never imports React.
- No `innerHTML` with user content. Links and images only allow `http:`, `https:`, `mailto:` and relative URLs (`isSafeUrl`).
- Writing rule for everything you write (code comments, docs, commit messages, UI text): never use an em dash or an en dash, and never use `--` as a stand-in for one. Use a colon, comma, parentheses or a full stop.
- Every commit message ends with the trailer line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (pass it as a second `-m`, as the commit steps show).
- Formatting: Prettier with `semi: false`, `singleQuote: true`, `printWidth: 110`, `trailingComma: all`.

## Review Focus

Inputs the spec implies but does not spell out, most likely to bite a real user first. Each has a test in the owning task.

1. **Front matter at the top of a loaded `.md` file** must survive a save unchanged (it would otherwise parse as a rule plus a heading). Tests: Task 4 `stores front matter on the document`, Task 5 round trip `frontmatter`, Task 11 `keeps front matter through edits`.
2. **HTML pasted from web pages or Google Docs** must be reduced to what markdown can hold, with `javascript:` links and scripts dropped. Tests: Task 3 `drops unsafe links and images from pasted HTML`, Task 11 `reduces pasted HTML...` and `pastes GitHub task list HTML`.
3. **Link and image URLs with spaces or parentheses** must survive save and reload. Tests: Task 5 round trip `urlWithSpace`.
4. **Tab / Shift-Tab on a checked task item** must keep the checkbox and its state. Test: Task 8 `Tab and Shift-Tab indent list items and keep their check state`.
5. **Plain text that looks like HTML or an entity** (`<b>`, `&amp;`) must stay text after a save, and an empty or whitespace-only document must save as `""`. Tests: Task 5 `htmlLookalikes`, normalisation `'&copy; &lt;b&gt;'`, `''` and `'   \n\n  '`.

## File Structure

```
live-md-editor/
  package.json, pnpm-workspace.yaml, tsconfig.json, tsup.config.ts, vitest.config.ts,
  playwright.config.ts, eslint.config.js, .prettierrc.json, .prettierignore, .gitignore,
  .size-limit.json, typedoc.json, LICENSE, README.md, CONTRIBUTING.md,
  CODE_OF_CONDUCT.md, SECURITY.md
  src/
    index.ts                 public exports only
    url.ts                   isSafeUrl: the URL allowlist
    schema.ts                every node and mark (typed names)
    markdown/checkItems.ts   markdown-it plugin: [ ] / [x] / ( ) / (x) list markers
    markdown/parser.ts       markdown (+ front matter) to document
    markdown/serializer.ts   document to canonical markdown
    commands/checkItem.ts    toggle a task, select a radio in its group
    commands/index.ts        public commands and isActive
    views/listItem.ts        list item node view with a real <input>
    plugins/inputRules.ts    typing shortcuts
    plugins/keymap.ts        key bindings
    plugins/placeholder.ts   placeholder decoration
    plugins/links.ts         Mod-click opens links
    clipboard.ts             pasted plain text is read as markdown
    editor.ts                createEditor: wiring, events, change batching, lifecycle
    react/index.tsx          <LiveMarkdownEditor/>
    style.css                default theme
  shims/entities.ts, shims/linkify-it.ts   build-time replacements (about 30 KB gzipped saved)
  test/                      Vitest unit tests (jsdom), one file per module, plus helpers and fixtures
  e2e/                       Playwright tests and the test page they drive (e2e/fixture)
  examples/nextjs, examples/vanilla        runnable examples (pnpm workspace packages)
  docs/                      VitePress site (guide, generated API, playground)
  scripts/record-demo.ts     records docs/public/demo.gif
  .github/                   CI, release, docs deploy, issue and PR templates
  .changeset/                Changesets config
```

---

### Task 1: Project scaffold and tooling

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.json`, `vitest.config.ts`, `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `.gitignore`, `LICENSE`
- Create: `test/setup.ts`
- Test: `test/setup.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `pnpm test` (Vitest, jsdom, `test/setup.ts` loaded first), `pnpm typecheck`, `pnpm lint`. The alias `live-md-editor` resolves to `src/index.ts` in Vitest and TypeScript, so the React wrapper can import the core by its package name.

- [ ] **Step 1: Check the environment**

Run: `node -v && pnpm -v && git status --short | head -5`
Expected: Node `v22.x` or newer, pnpm `10.x`, and a git repository (the spec is already committed). If pnpm is missing: `corepack enable pnpm`.

- [ ] **Step 2: Create `package.json`**

Scripts for tools installed in later tasks are included now so this file is written once. Dependencies are added by `pnpm add` commands in each task.

```json
{
  "name": "live-md-editor",
  "version": "0.0.0",
  "description": "Lightweight WYSIWYG markdown editor for any framework: edit formatted text, get plain markdown back.",
  "keywords": ["markdown", "editor", "wysiwyg", "prosemirror", "gfm", "task-list", "react", "nextjs"],
  "homepage": "https://salvatorecastellitti.github.io/live-md-editor/",
  "bugs": "https://github.com/salvatorecastellitti/live-md-editor/issues",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/salvatorecastellitti/live-md-editor.git"
  },
  "license": "MIT",
  "author": "Salvatore Castellitti",
  "type": "module",
  "sideEffects": ["*.css"],
  "exports": {
    ".": {
      "import": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
      "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" }
    },
    "./react": {
      "import": { "types": "./dist/react.d.ts", "default": "./dist/react.js" },
      "require": { "types": "./dist/react.d.cts", "default": "./dist/react.cjs" }
    },
    "./style.css": "./dist/style.css",
    "./package.json": "./package.json"
  },
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "engines": { "node": ">=18" },
  "packageManager": "pnpm@10.33.3",
  "scripts": {
    "dev": "vite e2e/fixture --port 4173",
    "build": "tsup && cp src/style.css dist/style.css",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test --project=chromium --project=firefox --project=webkit --project=mobile",
    "test:perf": "playwright test --project=perf",
    "typecheck": "tsc",
    "lint": "eslint . && prettier --check .",
    "format": "prettier --write . && eslint --fix .",
    "size": "size-limit",
    "check:package": "publint --strict && attw --pack . --profile node16 --exclude-entrypoints style.css",
    "check": "pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm size && pnpm check:package",
    "demo": "tsx scripts/record-demo.ts",
    "docs:dev": "typedoc && vitepress dev docs",
    "docs:build": "typedoc && vitepress build docs",
    "docs:preview": "vitepress preview docs",
    "changeset": "changeset",
    "release": "pnpm build && changeset publish"
  },
  "peerDependencies": {
    "react": ">=18",
    "react-dom": ">=18"
  },
  "peerDependenciesMeta": {
    "react": { "optional": true },
    "react-dom": { "optional": true }
  }
}
```

- [ ] **Step 3: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - examples/*
onlyBuiltDependencies:
  - esbuild
```

- [ ] **Step 4: Install the base tooling**

Run:
```bash
pnpm add -D typescript@~5.9.3 vitest@^3.2.7 jsdom@^27.0.1 vite@^5.4.21 @types/node@^22.20.4 \
  eslint@^10.11.0 @eslint/js@^10.0.0 typescript-eslint@^8.71.0 eslint-plugin-react-hooks@^7.1.1 \
  globals@^17.12.0 prettier@^3.9.9
```
Expected: installs without peer dependency errors.

- [ ] **Step 5: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node", "vite/client"],
    "jsx": "react-jsx",
    "paths": {
      "live-md-editor": ["./src/index.ts"]
    }
  },
  "include": ["src", "test", "e2e", "shims", "*.config.ts"]
}
```

- [ ] **Step 6: Create `vitest.config.ts`**

(Task 4 adds two aliases for the build shims.)

```ts
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const path = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      'live-md-editor': path('./src/index.ts'),
    },
  },
  esbuild: { jsx: 'automatic' },
  test: { environment: 'jsdom', include: ['test/**/*.test.{ts,tsx}'], setupFiles: ['test/setup.ts'] },
})
```

- [ ] **Step 7: Create lint and format config**

`eslint.config.js`:

```js
import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'dist',
      'coverage',
      'playwright-report',
      'test-results',
      'docs/.vitepress/cache',
      'docs/.vitepress/dist',
      'docs/api',
      'examples/*/.next',
      'examples/*/dist',
      'examples/*/next-env.d.ts',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    files: ['src/react/**/*.tsx', 'examples/**/*.tsx'],
    extends: [reactHooks.configs.flat['recommended-latest']],
  },
)
```

`.prettierrc.json`:

```json
{
  "semi": false,
  "singleQuote": true,
  "printWidth": 110,
  "trailingComma": "all"
}
```

`.prettierignore`:

```
dist
coverage
pnpm-lock.yaml
playwright-report
test-results
docs/superpowers
docs/public
docs/.vitepress/cache
docs/.vitepress/dist
docs/api
examples/*/.next
examples/*/dist
examples/*/next-env.d.ts
CHANGELOG.md
```

`.gitignore`:

```
node_modules
dist
coverage
playwright-report
test-results
*.tsbuildinfo
.DS_Store
docs/.vitepress/cache
docs/.vitepress/dist
docs/api
examples/*/.next
examples/*/dist
examples/*/next-env.d.ts
```

- [ ] **Step 8: Create `LICENSE`**

```
MIT License

Copyright (c) 2026 Salvatore Castellitti

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 9: Write the failing test**

`test/setup.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

describe('test environment', () => {
  it('runs in jsdom with the layout shims ProseMirror needs', () => {
    expect(document.createRange().getClientRects()).toHaveLength(0)
    expect(document.body.getBoundingClientRect().width).toBe(0)
    expect(typeof ClipboardEvent).toBe('function')
  })
})
```

- [ ] **Step 10: Run it to verify it fails**

Run: `pnpm test`
Expected: FAIL. `test/setup.ts` does not exist yet, so Vitest reports it cannot load the setup file.

- [ ] **Step 11: Create `test/setup.ts`**

```ts
// jsdom has no layout engine. ProseMirror measures the selection to scroll
// it into view, so give it empty rects to measure.
const emptyRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList
const emptyRect = () =>
  ({ x: 0, y: 0, top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0, toJSON: () => ({}) }) as DOMRect
if (typeof document !== 'undefined') {
  for (const proto of [Element.prototype, Range.prototype, Text.prototype as unknown as Element]) {
    proto.getClientRects ??= emptyRects
    proto.getBoundingClientRect ??= emptyRect
  }
  document.elementFromPoint ??= () => null
}

// jsdom has no ClipboardEvent; ProseMirror's pasteHTML/pasteText create one.
if (typeof window !== 'undefined' && !('ClipboardEvent' in window)) {
  class ClipboardEventShim extends Event {
    readonly clipboardData: DataTransfer | null = null
  }
  Object.assign(window, { ClipboardEvent: ClipboardEventShim })
}
```

- [ ] **Step 12: Run the test and the checks**

`pnpm add` writes `package.json` in its own layout, so format once first.

Run: `pnpm format && pnpm test && pnpm typecheck && pnpm lint`
Expected: 1 test passes; typecheck, ESLint and Prettier report no problems.

- [ ] **Step 13: Commit**

```bash
git add package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json vitest.config.ts eslint.config.js \
  .prettierrc.json .prettierignore .gitignore LICENSE test/setup.ts test/setup.test.ts
git commit -m "chore: scaffold project tooling" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: URL allowlist

**Files:**
- Create: `src/url.ts`
- Test: `test/url.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `isSafeUrl(url: string): boolean` (true for `http:`, `https:`, `mailto:` and relative URLs; strips ASCII control characters and spaces before reading the scheme, the same way browsers do).

- [ ] **Step 1: Write the failing test**

`test/url.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { isSafeUrl } from '../src/url'

describe('isSafeUrl', () => {
  it.each([
    'https://example.com',
    'http://example.com/a?b=c#d',
    'HTTPS://EXAMPLE.COM',
    'mailto:someone@example.com',
    '/relative/path',
    './file.md',
    '#heading',
    '//cdn.example.com/a.png',
    'image.png',
    'java%09script:alert(1)',
  ])('allows %s', (url) => {
    expect(isSafeUrl(url)).toBe(true)
  })

  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    ' javascript:alert(1)',
    'java\tscript:alert(1)',
    'java\nscript:alert(1)',
    '\u0000javascript:alert(1)',
    'vbscript:msgbox(1)',
    'data:text/html,<script>alert(1)</script>',
    'data:image/png;base64,AAAA',
    'file:///etc/passwd',
  ])('blocks %j', (url) => {
    expect(isSafeUrl(url)).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test test/url.test.ts`
Expected: FAIL with `Failed to resolve import "../src/url"`.

- [ ] **Step 3: Implement `src/url.ts`**

```ts
const ALLOWED_PROTOCOLS = new Set(['http', 'https', 'mailto'])
// Browsers ignore ASCII control characters and whitespace inside URLs,
// so "java\tscript:" still runs. Strip them before reading the scheme.
// eslint-disable-next-line no-control-regex
const IGNORED_CHARS = /[\u0000- \u007f]/g
const SCHEME = /^([a-z][a-z0-9+.-]*):/i

/**
 * Returns true when `url` is safe to put in an `href` or `src`:
 * `http:`, `https:`, `mailto:` or a relative URL.
 */
export function isSafeUrl(url: string): boolean {
  const compact = url.replace(IGNORED_CHARS, '')
  const match = SCHEME.exec(compact)
  if (!match) return true
  return ALLOWED_PROTOCOLS.has(match[1]!.toLowerCase())
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test test/url.test.ts`
Expected: 20 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/url.ts test/url.test.ts
git commit -m "feat: add URL allowlist" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Document schema

**Files:**
- Create: `src/schema.ts`
- Test: `test/schema.test.ts`

**Interfaces:**
- Consumes: `isSafeUrl` (Task 2).
- Produces:
  - `schema: Schema<NodeName, MarkName>`. Nodes: `doc` (attr `frontmatter: string | null`), `paragraph`, `heading` (`level`), `blockquote`, `horizontal_rule`, `code_block` (`language`), `html_block`, `bullet_list` (`tight`), `ordered_list` (`order`, `tight`), `list_item` (`check: CheckKind`, `checked: boolean`), `text`, `image` (`src`, `alt`, `title`), `hard_break`, `html_inline` (`html`), `table`, `table_row`, `table_header`, `table_cell` (cells have `align`). Marks, in this order: `em`, `strong`, `strike`, `link` (`href`, `title`), `code`. `schema.nodes.x` is typed as `NodeType` (never undefined).
  - `type CheckKind = 'task' | 'radio' | null`
  - `type CellAlign = 'left' | 'center' | 'right' | null`

- [ ] **Step 1: Install ProseMirror model and tables**

Run: `pnpm add prosemirror-model@^1.25.12 prosemirror-tables@^1.8.5`

- [ ] **Step 2: Write the failing test**

`test/schema.test.ts`:

```ts
import { DOMParser, DOMSerializer } from 'prosemirror-model'
import { describe, expect, it } from 'vitest'
import { schema } from '../src/schema'

const parseHTML = (html: string) => {
  const element = document.createElement('div')
  element.innerHTML = html
  return DOMParser.fromSchema(schema).parse(element)
}

describe('schema', () => {
  it('has every node and mark the markdown layer needs', () => {
    expect(Object.keys(schema.nodes).sort()).toEqual(
      [
        'blockquote',
        'bullet_list',
        'code_block',
        'doc',
        'hard_break',
        'heading',
        'horizontal_rule',
        'html_block',
        'html_inline',
        'image',
        'list_item',
        'ordered_list',
        'paragraph',
        'table',
        'table_cell',
        'table_header',
        'table_row',
        'text',
      ].sort(),
    )
    expect(Object.keys(schema.marks)).toEqual(['em', 'strong', 'strike', 'link', 'code'])
  })

  it('reads GitHub task list HTML as task items', () => {
    const doc = parseHTML('<ul><li><input type="checkbox" checked> done</li><li>plain</li></ul>')
    const list = doc.firstChild!
    expect(list.child(0).attrs).toEqual({ check: 'task', checked: true })
    expect(list.child(1).attrs).toEqual({ check: null, checked: false })
  })

  it('drops unsafe links and images from pasted HTML', () => {
    const doc = parseHTML('<p><a href="javascript:alert(1)">x</a><img src="javascript:alert(1)"></p>')
    expect(doc.firstChild!.childCount).toBe(1)
    expect(doc.firstChild!.firstChild!.marks).toHaveLength(0)
  })

  it('never renders an unsafe href even if one gets into the document', () => {
    const link = schema.marks.link.create({ href: 'javascript:alert(1)' })
    const doc = schema.node('doc', null, [schema.node('paragraph', null, [schema.text('x', [link])])])
    const dom = DOMSerializer.fromSchema(schema).serializeFragment(doc.content)
    expect(dom.querySelector('a')!.hasAttribute('href')).toBe(false)
  })

  it('shows code block language as a data attribute', () => {
    const doc = schema.node('doc', null, [schema.node('code_block', { language: 'ts' }, [schema.text('x')])])
    const dom = DOMSerializer.fromSchema(schema).serializeFragment(doc.content)
    expect(dom.querySelector('pre')!.dataset.language).toBe('ts')
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm test test/schema.test.ts`
Expected: FAIL with `Failed to resolve import "../src/schema"`.

- [ ] **Step 4: Implement `src/schema.ts`**

```ts
import { Schema, type DOMOutputSpec, type NodeSpec, type MarkSpec } from 'prosemirror-model'
import { tableNodes } from 'prosemirror-tables'
import { isSafeUrl } from './url'

/** Marker shown in front of a list item: none, a checkbox or a radio. */
export type CheckKind = 'task' | 'radio' | null
export type CellAlign = 'left' | 'center' | 'right' | null

function readAlign(value: string | null | undefined): CellAlign {
  return value === 'left' || value === 'center' || value === 'right' ? value : null
}

const tables = tableNodes({
  tableGroup: 'block',
  cellContent: 'inline*',
  cellAttributes: {
    align: {
      default: null,
      getFromDOM: (dom) => readAlign(dom.style.textAlign),
      setDOMAttr: (value, attrs) => {
        if (value) attrs.style = `text-align: ${value as string}`
      },
    },
  },
})

type NodeName =
  | 'doc'
  | 'paragraph'
  | 'heading'
  | 'blockquote'
  | 'horizontal_rule'
  | 'code_block'
  | 'html_block'
  | 'bullet_list'
  | 'ordered_list'
  | 'list_item'
  | 'text'
  | 'image'
  | 'hard_break'
  | 'html_inline'
  | 'table'
  | 'table_row'
  | 'table_cell'
  | 'table_header'
type MarkName = 'em' | 'strong' | 'strike' | 'link' | 'code'

const nodes: Record<NodeName, NodeSpec> = {
  doc: {
    content: 'block+',
    // YAML front matter from the top of the file, kept verbatim and not shown.
    attrs: { frontmatter: { default: null } },
  },
  paragraph: {
    content: 'inline*',
    group: 'block',
    parseDOM: [{ tag: 'p' }],
    toDOM: (): DOMOutputSpec => ['p', 0],
  },
  heading: {
    attrs: { level: { default: 1, validate: 'number' } },
    content: 'inline*',
    group: 'block',
    defining: true,
    parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({ tag: `h${level}`, attrs: { level } })),
    toDOM: (node): DOMOutputSpec => [`h${node.attrs.level as number}`, 0],
  },
  blockquote: {
    content: 'block+',
    group: 'block',
    defining: true,
    parseDOM: [{ tag: 'blockquote' }],
    toDOM: (): DOMOutputSpec => ['blockquote', 0],
  },
  horizontal_rule: {
    group: 'block',
    parseDOM: [{ tag: 'hr' }],
    toDOM: (): DOMOutputSpec => ['hr'],
  },
  code_block: {
    attrs: { language: { default: '', validate: 'string' } },
    content: 'text*',
    marks: '',
    group: 'block',
    code: true,
    defining: true,
    parseDOM: [
      {
        tag: 'pre',
        preserveWhitespace: 'full',
        getAttrs: (dom) => ({
          language: /language-(\S+)/.exec(dom.querySelector('code')?.className ?? '')?.[1] ?? '',
        }),
      },
    ],
    toDOM: (node): DOMOutputSpec => {
      const language = node.attrs.language as string
      return language
        ? ['pre', { 'data-language': language }, ['code', { class: `language-${language}` }, 0]]
        : ['pre', ['code', 0]]
    },
  },
  html_block: {
    content: 'text*',
    marks: '',
    group: 'block',
    code: true,
    defining: true,
    toDOM: (): DOMOutputSpec => ['pre', { class: 'lme-html' }, 0],
  },
  bullet_list: {
    attrs: { tight: { default: true } },
    content: 'list_item+',
    group: 'block',
    parseDOM: [{ tag: 'ul' }],
    toDOM: (): DOMOutputSpec => ['ul', 0],
  },
  ordered_list: {
    attrs: { order: { default: 1, validate: 'number' }, tight: { default: true } },
    content: 'list_item+',
    group: 'block',
    parseDOM: [
      {
        tag: 'ol',
        getAttrs: (dom) => ({ order: dom.hasAttribute('start') ? Number(dom.getAttribute('start')) : 1 }),
      },
    ],
    toDOM: (node): DOMOutputSpec =>
      node.attrs.order === 1 ? ['ol', 0] : ['ol', { start: node.attrs.order as number }, 0],
  },
  list_item: {
    attrs: { check: { default: null }, checked: { default: false } },
    content: 'paragraph block*',
    defining: true,
    parseDOM: [
      {
        tag: 'li',
        getAttrs: (dom) => {
          const check = dom.getAttribute('data-check')
          if (check === 'task' || check === 'radio') {
            return { check, checked: dom.getAttribute('data-checked') === 'true' }
          }
          const input = dom.querySelector('input[type="checkbox"]')
          if (input && input.closest('li') === dom) {
            return { check: 'task', checked: (input as HTMLInputElement).checked }
          }
          return { check: null, checked: false }
        },
      },
    ],
    toDOM: (node): DOMOutputSpec =>
      node.attrs.check
        ? ['li', { 'data-check': node.attrs.check as string, 'data-checked': String(node.attrs.checked) }, 0]
        : ['li', 0],
  },
  text: { group: 'inline' },
  image: {
    inline: true,
    attrs: { src: { validate: 'string' }, alt: { default: null }, title: { default: null } },
    group: 'inline',
    draggable: true,
    parseDOM: [
      {
        tag: 'img[src]',
        getAttrs: (dom) => {
          const src = dom.getAttribute('src') ?? ''
          if (!isSafeUrl(src)) return false
          return { src, alt: dom.getAttribute('alt'), title: dom.getAttribute('title') }
        },
      },
    ],
    toDOM: (node): DOMOutputSpec => {
      const { src, alt, title } = node.attrs as { src: string; alt: string | null; title: string | null }
      return ['img', { src: isSafeUrl(src) ? src : '', alt, title }]
    },
  },
  hard_break: {
    inline: true,
    group: 'inline',
    selectable: false,
    parseDOM: [{ tag: 'br' }],
    toDOM: (): DOMOutputSpec => ['br'],
  },
  html_inline: {
    inline: true,
    atom: true,
    attrs: { html: { validate: 'string' } },
    group: 'inline',
    toDOM: (node): DOMOutputSpec => ['code', { class: 'lme-html-inline' }, node.attrs.html as string],
  },
  ...tables,
}

const marks: Record<MarkName, MarkSpec> = {
  em: {
    parseDOM: [{ tag: 'i' }, { tag: 'em' }, { style: 'font-style=italic' }],
    toDOM: (): DOMOutputSpec => ['em', 0],
  },
  strong: {
    parseDOM: [
      { tag: 'strong' },
      { tag: 'b', getAttrs: (dom) => dom.style.fontWeight !== 'normal' && null },
      { style: 'font-weight=400', clearMark: (mark) => mark.type.name === 'strong' },
      { style: 'font-weight', getAttrs: (value) => /^(bold(er)?|[5-9]\d{2,})$/.test(value) && null },
    ],
    toDOM: (): DOMOutputSpec => ['strong', 0],
  },
  strike: {
    parseDOM: [{ tag: 's' }, { tag: 'del' }, { tag: 'strike' }, { style: 'text-decoration=line-through' }],
    toDOM: (): DOMOutputSpec => ['s', 0],
  },
  link: {
    attrs: { href: { validate: 'string' }, title: { default: null } },
    inclusive: false,
    parseDOM: [
      {
        tag: 'a[href]',
        getAttrs: (dom) => {
          const href = dom.getAttribute('href') ?? ''
          if (!isSafeUrl(href)) return false
          return { href, title: dom.getAttribute('title') }
        },
      },
    ],
    toDOM: (mark): DOMOutputSpec => {
      const { href, title } = mark.attrs as { href: string; title: string | null }
      return ['a', { href: isSafeUrl(href) ? href : null, title, rel: 'noopener noreferrer nofollow' }, 0]
    },
  },
  code: {
    code: true,
    parseDOM: [{ tag: 'code' }],
    toDOM: (): DOMOutputSpec => ['code', 0],
  },
}

/** The document schema: every node and mark the editor understands. */
export const schema = new Schema<NodeName, MarkName>({ nodes, marks })
```

- [ ] **Step 5: Run it to verify it passes**

Run: `pnpm test test/schema.test.ts && pnpm typecheck`
Expected: 5 tests pass; no type errors.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/schema.ts test/schema.test.ts
git commit -m "feat: add document schema" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Markdown parser

**Files:**
- Create: `shims/entities.ts`, `shims/linkify-it.ts`
- Create: `src/markdown/checkItems.ts`, `src/markdown/parser.ts`
- Modify: `vitest.config.ts` (add two aliases)
- Test: `test/parser.test.ts`

**Interfaces:**
- Consumes: `schema`, `CellAlign` (Task 3), `isSafeUrl` (Task 2).
- Produces:
  - `createParser(options: { radio: boolean }): (markdown: string) => Node`. A leading `---` block becomes `doc.attrs.frontmatter` (string, possibly `''`); otherwise `frontmatter` is `null`.
  - `checkItems(md: MarkdownIt, options: { radio: boolean }): void` (markdown-it plugin; sets `token.meta = { check, checked }` on `list_item_open`).
  - The shims replace markdown-it's `entities` (75 KB table) with the browser's own decoding, and the unused `linkify-it` with a stub. Tests use them too, so tests run exactly what ships.

- [ ] **Step 1: Install markdown-it and prosemirror-markdown as devDependencies**

They are bundled into `dist` by tsup (Task 15), so they are not runtime dependencies.

Run: `pnpm add -D markdown-it@^14.3.2 @types/markdown-it@^14.2.0 prosemirror-markdown@^1.13.8`

- [ ] **Step 2: Write the failing test**

`test/parser.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createParser } from '../src/markdown/parser'

const parse = createParser({ radio: true })

describe('createParser', () => {
  it('parses headings, marks and links', () => {
    const doc = parse('## Title\n\n*a* **b** ~~c~~ `d` [e](https://x.com)')
    expect(doc.child(0).type.name).toBe('heading')
    expect(doc.child(0).attrs.level).toBe(2)
    const marks = doc.child(1).content.content.map((node) => node.marks.map((m) => m.type.name).join(','))
    expect(marks.filter(Boolean)).toEqual(['em', 'strong', 'strike', 'code', 'link'])
  })

  it('turns [ ] and [x] items into task items without the marker text', () => {
    const list = parse('- [ ] todo\n- [x] done\n- plain').firstChild!
    expect(list.child(0).attrs).toEqual({ check: 'task', checked: false })
    expect(list.child(1).attrs).toEqual({ check: 'task', checked: true })
    expect(list.child(2).attrs).toEqual({ check: null, checked: false })
    expect(list.child(0).textContent).toBe('todo')
  })

  it('reads radio items only when the radio extension is on', () => {
    expect(parse('- (x) a').firstChild!.firstChild!.attrs).toEqual({ check: 'radio', checked: true })
    const off = createParser({ radio: false })('- (x) a')
    expect(off.firstChild!.firstChild!.attrs.check).toBe(null)
    expect(off.firstChild!.firstChild!.textContent).toBe('(x) a')
  })

  it('reads table alignment', () => {
    const table = parse('| a | b |\n| :-: | --: |\n| 1 | 2 |').firstChild!
    expect(table.type.name).toBe('table')
    expect(table.child(0).child(0).type.name).toBe('table_header')
    expect(table.child(0).child(0).attrs.align).toBe('center')
    expect(table.child(1).child(1).attrs.align).toBe('right')
  })

  it('keeps raw HTML as inert text nodes', () => {
    const doc = parse('<script>alert(1)</script>\n\na <b>b</b>')
    expect(doc.child(0).type.name).toBe('html_block')
    expect(doc.child(0).textContent).toBe('<script>alert(1)</script>')
    expect(doc.child(1).child(1).type.name).toBe('html_inline')
  })

  it('does not create links for unsafe URLs', () => {
    let marks = 0
    parse('[x](javascript:alert(1)) ![y](vbscript:z)').descendants((node) => {
      marks += node.marks.length
      if (node.type.name === 'image') marks++
    })
    expect(marks).toBe(0)
  })

  it('decodes entities', () => {
    expect(parse('&copy; &amp; &#65;').textContent).toBe('© & A')
  })

  it('stores front matter on the document instead of parsing it', () => {
    const doc = parse('---\ntitle: Hi\n---\n\n# Body')
    expect(doc.attrs.frontmatter).toBe('title: Hi')
    expect(doc.childCount).toBe(1)
    expect(parse('# Body').attrs.frontmatter).toBe(null)
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm test test/parser.test.ts`
Expected: FAIL with `Failed to resolve import "../src/markdown/parser"`.

- [ ] **Step 4: Create the shims**

`shims/entities.ts`:

```ts
// markdown-it only passes single entity references such as "&amp;" here.
// The browser already knows every named entity, so let it decode them
// instead of shipping a 75 KB table. <textarea> content is never executed.
let textarea: HTMLTextAreaElement | undefined
export function decodeHTML(entity: string): string {
  textarea ??= document.createElement('textarea')
  textarea.innerHTML = entity
  return textarea.value
}
// markdown-it's entity rule has already required the trailing ";".
export const decodeHTMLStrict = decodeHTML
```

`shims/linkify-it.ts`:

```ts
// The editor never enables markdown-it's linkify option, so the real
// linkify-it is dead weight. This stub satisfies the constructor.
export default class LinkifyIt {
  test(): boolean {
    return false
  }
  match(): null {
    return null
  }
  matchAtStart(): null {
    return null
  }
  pretest(): boolean {
    return false
  }
}
```

- [ ] **Step 5: Point Vitest at the shims**

In `vitest.config.ts`, replace

```ts
    alias: {
      'live-md-editor': path('./src/index.ts'),
    },
```

with

```ts
    alias: {
      'live-md-editor': path('./src/index.ts'),
      entities: path('./shims/entities.ts'),
      'linkify-it': path('./shims/linkify-it.ts'),
    },
```

- [ ] **Step 6: Implement the check item plugin**

`src/markdown/checkItems.ts`:

```ts
import type MarkdownIt from 'markdown-it'

const TASK_MARKER = /^\[([ xX])\](?:\s+|$)/
const RADIO_MARKER = /^\(([ xX])\)(?:\s+|$)/

export interface CheckItemsOptions {
  /** Also recognise `( )` and `(x)` radio markers. */
  radio: boolean
}

/**
 * markdown-it plugin: turns `- [ ] text` (and `- ( ) text` when radio is on)
 * into list items carrying `meta.check` and `meta.checked`, and removes
 * the marker from the item text.
 */
export function checkItems(md: MarkdownIt, options: CheckItemsOptions): void {
  md.core.ruler.after('inline', 'lme_check_items', (state) => {
    const tokens = state.tokens
    for (let i = 0; i < tokens.length - 2; i++) {
      const item = tokens[i]!
      const paragraph = tokens[i + 1]!
      const inline = tokens[i + 2]!
      if (item.type !== 'list_item_open' || paragraph.type !== 'paragraph_open' || inline.type !== 'inline') {
        continue
      }
      let check: 'task' | 'radio' = 'task'
      let match = TASK_MARKER.exec(inline.content)
      if (!match && options.radio) {
        check = 'radio'
        match = RADIO_MARKER.exec(inline.content)
      }
      if (!match) continue
      const first = inline.children?.[0]
      if (!first || first.type !== 'text' || !first.content.startsWith(match[0])) continue
      first.content = first.content.slice(match[0].length)
      inline.content = inline.content.slice(match[0].length)
      item.meta = { check, checked: match[1] !== ' ' }
    }
    return false
  })
}
```

- [ ] **Step 7: Implement the parser**

`src/markdown/parser.ts`:

```ts
import MarkdownIt from 'markdown-it'
import type { Token } from 'markdown-it'
import { MarkdownParser } from 'prosemirror-markdown'
import type { Node } from 'prosemirror-model'
import { schema, type CellAlign } from '../schema'
import { isSafeUrl } from '../url'
import { checkItems } from './checkItems'

export interface ParserOptions {
  radio: boolean
}

// A leading `---` block (YAML front matter, used by most static site
// generators). Without this it would parse as a rule plus a heading.
const FRONT_MATTER = /^---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/

function listIsTight(tokens: readonly Token[], index: number): boolean {
  for (let i = index + 1; i < tokens.length; i++) {
    if (tokens[i]!.type !== 'list_item_open') return tokens[i]!.hidden
  }
  return false
}

function cellAttrs(token: Token): { align: CellAlign } {
  const match = /text-align:\s*(left|center|right)/.exec(token.attrGet('style') ?? '')
  return { align: (match?.[1] as CellAlign | undefined) ?? null }
}

/** Builds a markdown to ProseMirror document parser. */
export function createParser(options: ParserOptions): (markdown: string) => Node {
  const md = new MarkdownIt('commonmark', { html: true }).enable(['table', 'strikethrough'])
  md.validateLink = isSafeUrl
  md.use(checkItems, { radio: options.radio })

  const parser = new MarkdownParser(schema, md, {
    blockquote: { block: 'blockquote' },
    paragraph: { block: 'paragraph' },
    list_item: {
      block: 'list_item',
      getAttrs: (token) => ({
        check: (token.meta as { check?: string } | null)?.check ?? null,
        checked: (token.meta as { checked?: boolean } | null)?.checked ?? false,
      }),
    },
    bullet_list: {
      block: 'bullet_list',
      getAttrs: (_token, tokens, i) => ({ tight: listIsTight(tokens, i) }),
    },
    ordered_list: {
      block: 'ordered_list',
      getAttrs: (token, tokens, i) => ({
        order: Number(token.attrGet('start') ?? 1),
        tight: listIsTight(tokens, i),
      }),
    },
    heading: { block: 'heading', getAttrs: (token) => ({ level: Number(token.tag.slice(1)) }) },
    code_block: { block: 'code_block', noCloseToken: true },
    fence: {
      block: 'code_block',
      getAttrs: (token) => ({ language: token.info.trim().split(/\s+/)[0] ?? '' }),
      noCloseToken: true,
    },
    html_block: { block: 'html_block', noCloseToken: true },
    hr: { node: 'horizontal_rule' },
    image: {
      node: 'image',
      getAttrs: (token) => ({
        src: token.attrGet('src') ?? '',
        title: token.attrGet('title') || null,
        alt: token.content || null,
      }),
    },
    hardbreak: { node: 'hard_break' },
    html_inline: { node: 'html_inline', getAttrs: (token) => ({ html: token.content }) },
    table: { block: 'table' },
    thead: { ignore: true },
    tbody: { ignore: true },
    tr: { block: 'table_row' },
    th: { block: 'table_header', getAttrs: cellAttrs },
    td: { block: 'table_cell', getAttrs: cellAttrs },
    em: { mark: 'em' },
    strong: { mark: 'strong' },
    s: { mark: 'strike' },
    link: {
      mark: 'link',
      getAttrs: (token) => ({ href: token.attrGet('href') ?? '', title: token.attrGet('title') || null }),
    },
    code_inline: { mark: 'code', noCloseToken: true },
  })

  return (markdown) => {
    const match = FRONT_MATTER.exec(markdown)
    if (!match) return parser.parse(markdown)
    const doc = parser.parse(markdown.slice(match[0].length))
    return doc.type.create({ frontmatter: match[1] ?? '' }, doc.content)
  }
}
```

- [ ] **Step 8: Run it to verify it passes**

Run: `pnpm test test/parser.test.ts && pnpm typecheck`
Expected: 8 tests pass (including `decodes entities`, which goes through the shim); no type errors.

- [ ] **Step 9: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts shims src/markdown/checkItems.ts src/markdown/parser.ts test/parser.test.ts
git commit -m "feat: parse markdown into the document schema" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Markdown serializer and round-trip suite

**Files:**
- Create: `src/markdown/serializer.ts`
- Create: `test/fixtures/corpus.md`
- Test: `test/roundtrip.test.ts`

**Interfaces:**
- Consumes: `schema`, `CellAlign` (Task 3), `createParser` (Task 4).
- Produces: `serializeMarkdown(doc: Node): string`: canonical output (`-` bullets, `*em*`, `**strong**`, three-backtick fences, `#` headings, `---` rules), front matter written back first, text that looks like HTML or an entity backslash-escaped, URL spaces as `%20` and parentheses escaped.

- [ ] **Step 1: Write the corpus fixture**

A realistic document mixing everything, including non-canonical syntax the serializer must normalize without losing text. `test/fixtures/corpus.md`:

````markdown
---
title: Release notes
draft: false
---

Project Name
============

[![build](https://img.shields.io/badge/build-passing-green.svg)](https://example.com/ci)

A _small_ library for **parsing** things. See the [docs][docs] or <https://example.com>.

## Install

```bash
npm install project-name
```

## Usage

1. Import it:

   ```js
   import { thing } from 'project-name'
   ```

2. Call it with options:
   - `strict`: fail on unknown input
   - `loose`: accept anything

> **Note**
> Version 2 drops support for Node 16.

### Checklist

- [x] Write code
- [ ] Write docs
  - [ ] API reference
  - [x] Guides

| Option   |  Type   | Default |
| :------- | :-----: | ------: |
| `strict` | boolean | `false` |
| `depth`  | number  |       3 |

Some text with a footnote[^1], an HTML <kbd>Ctrl</kbd> key and an escaped \*star\*.

<details>
<summary>More</summary>

Hidden content.

</details>

---

Line one  
Line two with a hard break.

[docs]: https://example.com/docs 'Documentation'

[^1]: Footnotes are kept as text.
````

- [ ] **Step 2: Write the failing test**

`test/roundtrip.test.ts`:

`````ts
import { describe, expect, it } from 'vitest'
import { createParser } from '../src/markdown/parser'
import { serializeMarkdown } from '../src/markdown/serializer'
import corpus from './fixtures/corpus.md?raw'

const parse = createParser({ radio: true })
const roundTrip = (md: string) => serializeMarkdown(parse(md))

const canonical: Record<string, string> = {
  heading: '# One\n\n## Two\n\n###### Six',
  paragraphs: 'First paragraph\n\nSecond paragraph',
  marks: '*em* **strong** ~~strike~~ `code`',
  nestedMarks: '***both*** and **bold *inner***',
  link: '[site](https://example.com "Title")',
  autolink: '<https://example.com>',
  image: '![alt text](https://example.com/a.png "T")',
  bullets: '- one\n- two\n  - nested',
  ordered: '1. one\n2. two',
  orderedStart: '3. three\n4. four',
  looseList: '- one\n\n- two',
  tasks: '- [ ] todo\n- [x] done',
  orderedTasks: '1. [ ] a\n2. [x] b',
  radios: '- ( ) small\n- (x) large',
  mixed: '- plain\n- [x] task',
  blockquote: '> quoted\n>\n> - list',
  code: '```ts\nconst a = 1\n```',
  codeEmpty: '```\n```',
  codeWithFence: '````\n```\n````',
  hr: 'above\n\n---\n\nbelow',
  hardBreak: 'line\\\nnext',
  table: '| a | b | c |\n| :--- | :---: | ---: |\n| 1 | **2** | `3` |',
  tableNoAlign: '| a | b |\n| --- | --- |\n|  | x |',
  tablePipe: '| a |\n| --- |\n| x \\| y |',
  htmlBlock: '<div class="x">\n  hi\n</div>\n\nafter',
  htmlInline: 'a <kbd>Ctrl</kbd> b',
  escapes: '\\# not heading and \\*not em\\*',
  htmlLookalikes: '\\<b> is text, so is \\&amp; and a < b & c',
  nestedTask: '- [ ] parent\n  - [x] child',
  frontmatter: '---\ntitle: Hello\ntags: [a, b]\n---\n\n# Body',
  emptyFrontmatter: '---\n---\n\ntext',
  ruleIsNotFrontmatter: 'text\n\n---\n\nmore',
  urlWithSpace: '[a](https://x.com/a%20b_\\(c\\))',
}

describe('round trip', () => {
  for (const [name, md] of Object.entries(canonical)) {
    it(name, () => expect(roundTrip(md)).toBe(md))
  }
})

// Non-canonical input is rewritten once, then stays the same.
const normalised: Record<string, string> = {
  '* star\n* list': '- star\n- list',
  '__bold__ _em_': '**bold** *em*',
  '    indented code': '```\nindented code\n```',
  'soft\nbreak': 'soft break',
  '- [X] Upper': '- [x] Upper',
  'Setext\n======': '# Setext',
  '- [ ]   spaced': '- [ ] spaced',
  '[x](javascript:alert(1))': '\\[x\\](javascript:alert(1))',
  '&copy; &lt;b&gt;': '© \\<b>',
  '': '',
  '   \n\n  ': '',
}

describe('normalisation', () => {
  for (const [input, output] of Object.entries(normalised)) {
    it(JSON.stringify(input), () => {
      expect(roundTrip(input)).toBe(output)
      expect(roundTrip(output)).toBe(output)
    })
  }

  it('an empty task item stays a task item', () => {
    const once = roundTrip('- [ ]')
    expect(roundTrip(once)).toBe(once)
    expect(parse(once).firstChild!.firstChild!.attrs.check).toBe('task')
  })

  it('radio markers stay text when the extension is off', () => {
    const doc = createParser({ radio: false })('- (x) a')
    expect(serializeMarkdown(doc)).toBe('- (x) a')
  })
})

describe('real-world corpus', () => {
  it('is stable after one save and keeps all of its text', () => {
    const once = roundTrip(corpus)
    expect(roundTrip(once)).toBe(once)
    expect(parse(once).textContent).toBe(parse(corpus).textContent)
  })
})
`````

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm test test/roundtrip.test.ts`
Expected: FAIL with `Failed to resolve import "../src/markdown/serializer"`.

- [ ] **Step 4: Implement the serializer**

`src/markdown/serializer.ts`:

````ts
import { MarkdownSerializer, type MarkdownSerializerState } from 'prosemirror-markdown'
import type { Mark, Node } from 'prosemirror-model'
import { schema, type CellAlign } from '../schema'

// True while serializing the text of an autolink (`<https://...>`),
// whose contents must not be escaped. Serialization is synchronous,
// so a module flag is safe.
let inAutolink = false

function checkMarker(item: Node): string {
  const { check, checked } = item.attrs as { check: string | null; checked: boolean }
  if (check === 'task') return checked ? '[x] ' : '[ ] '
  if (check === 'radio') return checked ? '(x) ' : '( ) '
  return ''
}

function isPlainUrl(link: Mark, parent: Node, index: number): boolean {
  const href = link.attrs.href as string
  if (link.attrs.title || !/^\w+:[^\s<>]*$/.test(href)) return false
  const content = parent.child(index)
  if (!content.isText || content.text !== href || content.marks[content.marks.length - 1] !== link) {
    return false
  }
  return index === parent.childCount - 1 || !link.isInSet(parent.child(index + 1).marks)
}

function backticksFor(node: Node, side: number): string {
  const ticks = /`+/g
  let len = 0
  let match: RegExpExecArray | null
  if (node.isText) while ((match = ticks.exec(node.text!))) len = Math.max(len, match[0].length)
  let result = len > 0 && side > 0 ? ' `' : '`'
  for (let i = 0; i < len; i++) result += '`'
  if (len > 0 && side < 0) result += ' '
  return result
}

/** Makes a URL safe inside `(...)`: spaces break the link, parentheses must be escaped. */
function escapeUrl(url: string): string {
  return url.replace(/ /g, '%20').replace(/[()]/g, '\\$&')
}

function alignRule(align: CellAlign): string {
  if (align === 'left') return ':---'
  if (align === 'center') return ':---:'
  if (align === 'right') return '---:'
  return '---'
}

// Plain text that would otherwise re-parse as an HTML tag or an entity
// reference. Everything else markdown cares about is escaped by prosemirror-markdown.
const HTML_LOOKALIKE = /<(?=[a-zA-Z/!?])|&(?=#?[a-zA-Z0-9]+;)/g

const serializer: MarkdownSerializer = new MarkdownSerializer(
  {
    paragraph(state, node) {
      state.renderInline(node)
      state.closeBlock(node)
    },
    heading(state, node) {
      state.write(`${state.repeat('#', node.attrs.level as number)} `)
      state.renderInline(node, false)
      state.closeBlock(node)
    },
    blockquote(state, node) {
      state.wrapBlock('> ', null, node, () => state.renderContent(node))
    },
    horizontal_rule(state, node) {
      state.write('---')
      state.closeBlock(node)
    },
    code_block(state, node) {
      const runs = node.textContent.match(/`{3,}/gm)
      const fence = runs ? `${runs.sort().at(-1)!}\`` : '```'
      state.write(`${fence}${node.attrs.language as string}\n`)
      if (node.textContent) {
        state.text(node.textContent, false)
        state.write('\n')
      }
      state.write(fence)
      state.closeBlock(node)
    },
    html_block(state, node) {
      state.text(node.textContent, false)
      state.closeBlock(node)
    },
    bullet_list(state, node) {
      state.renderList(node, '  ', (i) => `- ${checkMarker(node.child(i))}`)
    },
    ordered_list(state, node) {
      const start = node.attrs.order as number
      const width = String(start + node.childCount - 1).length
      state.renderList(node, ' '.repeat(width + 2), (i) => `${start + i}. ${checkMarker(node.child(i))}`)
    },
    list_item(state, node) {
      state.renderContent(node)
    },
    table(state, node) {
      const aligns: CellAlign[] = []
      const rows: string[][] = []
      node.forEach((row, _offset, rowIndex) => {
        const cells: string[] = []
        row.forEach((cell, _cellOffset, cellIndex) => {
          if (rowIndex === 0) aligns[cellIndex] = cell.attrs.align as CellAlign
          // serialize() renders the children of the node it gets, so the
          // cell's inline content is wrapped in doc > paragraph.
          const doc = schema.topNodeType.create(null, schema.nodes.paragraph.create(null, cell.content))
          cells.push(
            serializer.serialize(doc).replace(/\\\n/g, ' ').replace(/\n/g, ' ').replace(/\|/g, '\\|'),
          )
        })
        rows.push(cells)
      })
      const lines = rows.map((cells) => `| ${cells.join(' | ')} |`)
      lines.splice(1, 0, `| ${aligns.map(alignRule).join(' | ')} |`)
      lines.forEach((line, i) => {
        if (i > 0) state.ensureNewLine()
        state.write(line)
      })
      state.closeBlock(node)
    },
    table_row() {},
    table_header() {},
    table_cell() {},
    image(state, node) {
      const { src, alt, title } = node.attrs as { src: string; alt: string | null; title: string | null }
      const titlePart = title ? ` "${title.replace(/"/g, '\\"')}"` : ''
      state.write(`![${state.esc(alt ?? '')}](${escapeUrl(src)}${titlePart})`)
    },
    hard_break(state, node, parent, index) {
      for (let i = index + 1; i < parent.childCount; i++) {
        if (parent.child(i).type !== node.type) {
          state.write('\\\n')
          return
        }
      }
    },
    html_inline(state, node) {
      state.write(node.attrs.html as string)
    },
    text(state, node) {
      state.text(node.text!, !inAutolink)
    },
  },
  {
    em: { open: '*', close: '*', mixable: true, expelEnclosingWhitespace: true },
    strong: { open: '**', close: '**', mixable: true, expelEnclosingWhitespace: true },
    strike: { open: '~~', close: '~~', mixable: true, expelEnclosingWhitespace: true },
    link: {
      open(_state, mark, parent, index) {
        inAutolink = isPlainUrl(mark, parent, index)
        return inAutolink ? '<' : '['
      },
      close(_state, mark) {
        const wasAutolink = inAutolink
        inAutolink = false
        if (wasAutolink) return '>'
        const { href, title } = mark.attrs as { href: string; title: string | null }
        const titlePart = title ? ` "${title.replace(/"/g, '\\"')}"` : ''
        return `](${escapeUrl(href)}${titlePart})`
      },
      mixable: true,
    },
    code: {
      open: (_state, _mark, parent, index) => backticksFor(parent.child(index), -1),
      close: (_state, _mark, parent, index) => backticksFor(parent.child(index - 1), 1),
      escape: false,
    },
  },
  { escapeExtraCharacters: HTML_LOOKALIKE },
)

/** Serializes a document to canonical markdown. */
export function serializeMarkdown(doc: Node): string {
  const body = serializer.serialize(doc, { tightLists: true })
  const frontmatter = doc.attrs.frontmatter as string | null
  if (frontmatter === null) return body
  const block = frontmatter ? `---\n${frontmatter}\n---` : '---\n---'
  return body ? `${block}\n\n${body}` : block
}

export type { MarkdownSerializerState }
````

- [ ] **Step 5: Run it to verify it passes**

Run: `pnpm test test/roundtrip.test.ts && pnpm typecheck`
Expected: 47 tests pass; no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/markdown/serializer.ts test/roundtrip.test.ts test/fixtures/corpus.md
git commit -m "feat: serialize documents to canonical markdown" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Task and radio items

**Files:**
- Create: `src/commands/checkItem.ts`, `src/views/listItem.ts`
- Create: `test/helpers.ts` (shared by Tasks 6 to 12)
- Test: `test/checkItems.test.ts`

**Interfaces:**
- Consumes: `createParser` (Task 4), `serializeMarkdown` (Task 5).
- Produces:
  - `toggleCheckItem(pos: number): Command`: `pos` is the position right before the `list_item`. Task: flips `checked`. Radio: checks it and unchecks the other radios in the same run of consecutive radio items; returns false if it was already checked, or if `pos` is not a check item (including out of range).
  - `class ListItemView implements NodeView`: `new ListItemView(node, view, getPos)`. Task/radio items render `<li class="lme-check-item" data-check data-checked><input class="lme-check-input"><div class="lme-check-content">`; plain items render a bare `<li>`. The input is disabled when the view is not editable and is labelled by the item text.
  - Test helpers: `mount()`, `createView(markdown, plugins?, { radio?, editable? })`, `markdownOf(view)`, `type(view, text)`, `press(view, key, { ctrl?, shift? })`, `cursorAfter(view, needle)`, `select(view, needle)`.

- [ ] **Step 1: Install the ProseMirror state, view and history packages**

Run: `pnpm add prosemirror-state@^1.4.4 prosemirror-view@^1.42.6 prosemirror-history@^1.5.1`

- [ ] **Step 2: Create the shared test helpers**

`test/helpers.ts`:

```ts
import { history } from 'prosemirror-history'
import { EditorState, TextSelection, type Plugin } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { createParser } from '../src/markdown/parser'
import { serializeMarkdown } from '../src/markdown/serializer'
import { ListItemView } from '../src/views/listItem'

/** A fresh element attached to the document, for mounting an editor. */
export function mount(): HTMLElement {
  document.body.innerHTML = ''
  const element = document.createElement('div')
  document.body.append(element)
  return element
}

/**
 * A bare ProseMirror view over `markdown` with undo history, the list item
 * node view and the given plugins. Lets each module be tested on its own.
 */
export function createView(
  markdown: string,
  plugins: Plugin[] = [],
  options: { radio?: boolean; editable?: boolean } = {},
): EditorView {
  const parse = createParser({ radio: options.radio ?? true })
  return new EditorView(mount(), {
    state: EditorState.create({ doc: parse(markdown), plugins: [...plugins, history()] }),
    editable: () => options.editable ?? true,
    nodeViews: { list_item: (node, view, getPos) => new ListItemView(node, view, getPos) },
  })
}

/** The view's document as markdown. */
export function markdownOf(view: EditorView): string {
  return serializeMarkdown(view.state.doc)
}

/** Types `text` one character at a time, running input rules like a real keyboard. */
export function type(view: EditorView, text: string): void {
  for (const char of text) {
    const { from, to } = view.state.selection
    const handled = view.someProp('handleTextInput', (f) =>
      f(view, from, to, char, () => view.state.tr.insertText(char, from, to)),
    )
    if (!handled) view.dispatch(view.state.tr.insertText(char, from, to))
  }
}

/** Sends a key through the view's keymaps. Returns whether a binding handled it. */
export function press(
  view: EditorView,
  key: string,
  mods: { ctrl?: boolean; shift?: boolean } = {},
): boolean {
  const event = new KeyboardEvent('keydown', {
    key,
    ctrlKey: mods.ctrl ?? false,
    shiftKey: mods.shift ?? false,
    bubbles: true,
    cancelable: true,
  })
  return !!view.someProp('handleKeyDown', (f) => f(view, event))
}

/** Puts the cursor right after the first occurrence of `needle` (use '' for the document start). */
export function cursorAfter(view: EditorView, needle: string): void {
  let target = -1
  view.state.doc.descendants((node, pos) => {
    if (target < 0 && node.isText && node.text!.includes(needle)) {
      target = pos + node.text!.indexOf(needle) + needle.length
    }
  })
  if (target < 0) throw new Error(`text not found: ${needle}`)
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, target)))
}

/** Selects the first occurrence of `needle`. */
export function select(view: EditorView, needle: string): void {
  cursorAfter(view, needle)
  const to = view.state.selection.from
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, to - needle.length, to)))
}
```

- [ ] **Step 3: Write the failing test**

`test/checkItems.test.ts`:

```ts
import { undo } from 'prosemirror-history'
import { describe, expect, it } from 'vitest'
import { toggleCheckItem } from '../src/commands/checkItem'
import { createView, markdownOf } from './helpers'

const inputs = (view: { dom: HTMLElement }) => [...view.dom.querySelectorAll<HTMLInputElement>('input')]

describe('task and radio items', () => {
  it('render a real checkbox in front of the text', () => {
    const view = createView('- [ ] a\n- [x] b\n- plain')
    const [first, second] = inputs(view)
    expect(inputs(view)).toHaveLength(2)
    expect(first!.type).toBe('checkbox')
    expect(first!.checked).toBe(false)
    expect(second!.checked).toBe(true)
    expect(view.dom.textContent).not.toContain('[')
  })

  it('clicking a checkbox toggles it and can be undone', () => {
    const view = createView('- [ ] a\n- [ ] b')
    inputs(view)[1]!.click()
    expect(markdownOf(view)).toBe('- [ ] a\n- [x] b')
    undo(view.state, view.dispatch)
    expect(markdownOf(view)).toBe('- [ ] a\n- [ ] b')
    expect(inputs(view)[1]!.checked).toBe(false)
  })

  it('selecting a radio clears the others in its group only', () => {
    const view = createView('- (x) a\n- ( ) b\n- [ ] task\n- (x) other group')
    inputs(view)[1]!.click()
    expect(markdownOf(view)).toBe('- ( ) a\n- (x) b\n- [ ] task\n- (x) other group')
    expect(inputs(view)[0]!.checked).toBe(false)
  })

  it('clicking a selected radio changes nothing', () => {
    const view = createView('- (x) a\n- ( ) b')
    expect(toggleCheckItem(0 + 1)(view.state)).toBe(false)
    inputs(view)[0]!.click()
    expect(markdownOf(view)).toBe('- (x) a\n- ( ) b')
    expect(inputs(view)[0]!.checked).toBe(true)
  })

  it('does nothing in read-only mode', () => {
    const view = createView('- [ ] a', [], { editable: false })
    const input = inputs(view)[0]!
    expect(input.disabled).toBe(true)
    input.click()
    expect(markdownOf(view)).toBe('- [ ] a')
    expect(input.checked).toBe(false)
  })

  it('labels each input with its item text', () => {
    const view = createView('- [ ] buy milk')
    const input = inputs(view)[0]!
    const label = document.getElementById(input.getAttribute('aria-labelledby')!)
    expect(label!.textContent).toBe('buy milk')
  })

  it('toggleCheckItem ignores positions that are not check items', () => {
    const view = createView('- plain')
    expect(toggleCheckItem(1)(view.state)).toBe(false)
    expect(toggleCheckItem(999)(view.state)).toBe(false)
  })
})
```

- [ ] **Step 4: Run it to verify it fails**

Run: `pnpm test test/checkItems.test.ts`
Expected: FAIL with `Failed to resolve import "../src/views/listItem"` (from `test/helpers.ts`).

- [ ] **Step 5: Implement the toggle command**

`src/commands/checkItem.ts`:

```ts
import type { Command } from 'prosemirror-state'
import type { Node } from 'prosemirror-model'

/**
 * Toggles the task or radio item at `pos` (the position right before the
 * list item). A radio item becomes checked and every other radio item in
 * the same run of consecutive radio items becomes unchecked.
 */
export function toggleCheckItem(pos: number): Command {
  return (state, dispatch) => {
    if (pos < 0 || pos >= state.doc.content.size) return false
    const item = state.doc.nodeAt(pos)
    if (!item || item.type.name !== 'list_item' || !item.attrs.check) return false
    const $pos = state.doc.resolve(pos)
    const tr = state.tr
    if (item.attrs.check === 'task') {
      tr.setNodeMarkup(pos, undefined, { ...item.attrs, checked: !item.attrs.checked })
    } else {
      if (item.attrs.checked) return false
      const list = $pos.parent
      const index = $pos.index()
      let start = index
      while (start > 0 && list.child(start - 1).attrs.check === 'radio') start--
      let end = index
      while (end < list.childCount - 1 && list.child(end + 1).attrs.check === 'radio') end++
      let childPos = $pos.start()
      list.forEach((child: Node, _offset, i) => {
        if (i >= start && i <= end) {
          const checked = i === index
          if (child.attrs.checked !== checked)
            tr.setNodeMarkup(childPos, undefined, { ...child.attrs, checked })
        }
        childPos += child.nodeSize
      })
    }
    dispatch?.(tr)
    return true
  }
}
```

- [ ] **Step 6: Implement the node view**

`src/views/listItem.ts`:

```ts
import type { Node } from 'prosemirror-model'
import type { EditorView, NodeView, ViewMutationRecord } from 'prosemirror-view'
import { toggleCheckItem } from '../commands/checkItem'

let nextId = 0

/**
 * Renders list items. Task and radio items get a real `<input>` in front
 * of their content; clicking it toggles the item through a transaction,
 * so the change is undoable and reaches `onChange`.
 */
export class ListItemView implements NodeView {
  dom: HTMLLIElement
  contentDOM: HTMLElement
  private input: HTMLInputElement | null = null

  constructor(
    private node: Node,
    private view: EditorView,
    private getPos: () => number | undefined,
  ) {
    this.dom = document.createElement('li')
    const check = node.attrs.check as 'task' | 'radio' | null
    if (!check) {
      this.contentDOM = this.dom
      return
    }
    const id = `lme-item-${++nextId}`
    this.dom.className = 'lme-check-item'
    this.dom.dataset.check = check
    const input = document.createElement('input')
    input.type = check === 'task' ? 'checkbox' : 'radio'
    input.className = 'lme-check-input'
    input.contentEditable = 'false'
    input.setAttribute('aria-labelledby', id)
    input.addEventListener('mousedown', (event) => event.preventDefault())
    input.addEventListener('change', () => this.toggle())
    this.input = input
    this.contentDOM = document.createElement('div')
    this.contentDOM.className = 'lme-check-content'
    this.contentDOM.id = id
    this.dom.append(input, this.contentDOM)
    this.sync()
  }

  private toggle(): void {
    const pos = this.getPos()
    if (pos === undefined || !this.view.editable) {
      this.sync()
      return
    }
    toggleCheckItem(pos)(this.view.state, this.view.dispatch)
    // A radio that was already on does not change the document, so put
    // the input back in line with the node.
    this.sync()
  }

  private sync(): void {
    if (!this.input) return
    const checked = this.node.attrs.checked as boolean
    this.input.checked = checked
    this.input.disabled = !this.view.editable
    this.dom.dataset.checked = String(checked)
  }

  update(node: Node): boolean {
    if (node.type !== this.node.type || node.attrs.check !== this.node.attrs.check) return false
    this.node = node
    this.sync()
    return true
  }

  stopEvent(event: Event): boolean {
    return event.target === this.input
  }

  ignoreMutation(mutation: ViewMutationRecord): boolean {
    return mutation.target === this.input || (mutation.type === 'attributes' && mutation.target === this.dom)
  }
}
```

- [ ] **Step 7: Run it to verify it passes**

Run: `pnpm test test/checkItems.test.ts && pnpm typecheck`
Expected: 7 tests pass; no type errors.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml src/commands/checkItem.ts src/views/listItem.ts test/helpers.ts test/checkItems.test.ts
git commit -m "feat: clickable task and radio items" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Typing shortcuts (input rules)

**Files:**
- Create: `src/plugins/inputRules.ts`
- Test: `test/inputRules.test.ts`

**Interfaces:**
- Consumes: `schema`, `CheckKind` (Task 3). Test helpers (Task 6).
- Produces: `markdownInputRules(options: { radio: boolean }): Plugin`. Block rules fire at the start of a textblock: `# ` to `###### `, `> `, `- `/`* `/`+ `, `N. `, `[ ] `/`[x] `/`[] `, `( ) `/`(x) ` (radio only), triple backtick + language + space, `---`/`***`/`___`. Mark rules: `**x**`, `__x__`, `*x*`, `_x_`, `~~x~~`, `` `x` ``; they never fire inside words, code blocks or code marks.

- [ ] **Step 1: Install input rules and transforms**

Run: `pnpm add prosemirror-inputrules@^1.5.1 prosemirror-transform@^1.12.2`

- [ ] **Step 2: Write the failing test**

`test/inputRules.test.ts`:

````ts
import { describe, expect, it } from 'vitest'
import { markdownInputRules } from '../src/plugins/inputRules'
import { createView, markdownOf, type } from './helpers'

const typed = (text: string, radio = false) => {
  const view = createView('', [markdownInputRules({ radio })], { radio })
  type(view, text)
  return view
}

describe('markdown input rules', () => {
  it.each([
    ['# Title', '# Title'],
    ['###### Six', '###### Six'],
    ['> quote', '> quote'],
    ['- item', '- item'],
    ['* item', '- item'],
    ['1. first', '1. first'],
    ['3. third', '3. third'],
    ['- [ ] task', '- [ ] task'],
    ['- [x] done', '- [x] done'],
    ['[ ] task', '- [ ] task'],
    ['[] task', '- [ ] task'],
    ['```ts code', '```ts\ncode\n```'],
    ['a **b** c', 'a **b** c'],
    ['a __b__ c', 'a **b** c'],
    ['a *b* c', 'a *b* c'],
    ['a _b_ c', 'a *b* c'],
    ['a ~~b~~ c', 'a ~~b~~ c'],
    ['a `b` c', 'a `b` c'],
  ])('%j becomes %j', (input, output) => {
    expect(markdownOf(typed(input))).toBe(output)
  })

  it('--- becomes a horizontal rule with a paragraph after it', () => {
    const view = typed('---after')
    expect(view.state.doc.child(0).type.name).toBe('horizontal_rule')
    expect(markdownOf(view)).toBe('---\n\nafter')
  })

  it('does not fire inside words or code', () => {
    expect(markdownOf(typed('snake_case_name'))).toBe('snake_case_name')
    expect(markdownOf(typed('2*3*4'))).toBe('2\\*3\\*4')
    expect(markdownOf(typed('```js **not bold**'))).toBe('```js\n**not bold**\n```')
  })

  it('radio items need the radio extension', () => {
    expect(markdownOf(typed('( ) a'))).toBe('( ) a')
    expect(markdownOf(typed('- ( ) a', true))).toBe('- ( ) a')
    expect(markdownOf(typed('(x) a', true))).toBe('- (x) a')
  })
})
````

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm test test/inputRules.test.ts`
Expected: FAIL with `Failed to resolve import "../src/plugins/inputRules"`.

- [ ] **Step 4: Implement the input rules**

`src/plugins/inputRules.ts`:

````ts
import { InputRule, inputRules, textblockTypeInputRule, wrappingInputRule } from 'prosemirror-inputrules'
import { Fragment, type MarkType } from 'prosemirror-model'
import { TextSelection, type Plugin } from 'prosemirror-state'
import { findWrapping } from 'prosemirror-transform'
import { schema, type CheckKind } from '../schema'

const { nodes, marks } = schema

/** `**text**` style rule: removes the delimiters and marks the text. */
function markRule(pattern: RegExp, type: MarkType): InputRule {
  return new InputRule(
    pattern,
    (state, match, start, end) => {
      const text = match[1]!
      const textStart = start + match[0].indexOf(text)
      const textEnd = textStart + text.length
      const tr = state.tr
      tr.delete(textEnd, end)
      tr.delete(start, textStart)
      tr.addMark(start, start + text.length, type.create())
      tr.removeStoredMark(type)
      return tr
    },
    { inCodeMark: false },
  )
}

/** `[ ] ` or `( ) ` at the start of a line makes a task or radio item. */
function checkItemRule(pattern: RegExp, check: Exclude<CheckKind, null>): InputRule {
  return new InputRule(
    pattern,
    (state, match, start, end) => {
      const checked = (match[1] ?? ' ').toLowerCase() === 'x'
      const $start = state.doc.resolve(start)
      if ($start.parent.type !== nodes.paragraph) return null
      const tr = state.tr.delete(start, end)
      const itemDepth = $start.depth - 1
      if (itemDepth > 0 && $start.node(itemDepth).type === nodes.list_item && $start.index(itemDepth) === 0) {
        tr.setNodeMarkup($start.before(itemDepth), undefined, { check, checked })
        return tr
      }
      const range = tr.doc.resolve(start).blockRange()
      const wrapping = range && findWrapping(range, nodes.bullet_list)
      if (!range || !wrapping) return null
      const [list, item] = wrapping
      if (!list || item?.type !== nodes.list_item) return null
      tr.wrap(range, [list, { type: nodes.list_item, attrs: { check, checked } }, ...wrapping.slice(2)])
      return tr
    },
    { inCodeMark: false },
  )
}

const horizontalRule = new InputRule(
  /^(?:---|___|\*\*\*)$/,
  (state, _match, start, end) => {
    const $start = state.doc.resolve(start)
    const paragraph = $start.parent
    if (paragraph.type !== nodes.paragraph || end !== $start.end()) return null
    const replacement = Fragment.from([nodes.horizontal_rule.create(), nodes.paragraph.create()])
    const container = $start.node(-1)
    if (!container.canReplace($start.index(-1), $start.indexAfter(-1), replacement)) return null
    const tr = state.tr.replaceWith($start.before(), $start.after(), replacement)
    return tr.setSelection(TextSelection.create(tr.doc, $start.before() + 2))
  },
  { inCodeMark: false },
)

export interface InputRuleOptions {
  radio: boolean
}

/** Live markdown shortcuts: typing the syntax turns into the formatted result. */
export function markdownInputRules(options: InputRuleOptions): Plugin {
  const rules = [
    textblockTypeInputRule(/^(#{1,6})\s$/, nodes.heading, (match) => ({ level: match[1]!.length })),
    wrappingInputRule(/^\s*>\s$/, nodes.blockquote),
    checkItemRule(/^\[([ xX]?)\]\s$/, 'task'),
    wrappingInputRule(/^\s*[-+*]\s$/, nodes.bullet_list),
    wrappingInputRule(
      /^(\d+)\.\s$/,
      nodes.ordered_list,
      (match) => ({ order: Number(match[1]) }),
      (match, node) => node.childCount + (node.attrs.order as number) === Number(match[1]),
    ),
    textblockTypeInputRule(/^```([\w-]*)\s$/, nodes.code_block, (match) => ({ language: match[1] ?? '' })),
    horizontalRule,
    markRule(/(?<![*\w])\*\*([^*\s](?:[^*]*[^*\s])?)\*\*$/, marks.strong),
    markRule(/(?<![_\w])__([^_\s](?:[^_]*[^_\s])?)__$/, marks.strong),
    markRule(/(?<![*\w])\*([^*\s](?:[^*]*[^*\s])?)\*$/, marks.em),
    markRule(/(?<![_\w])_([^_\s](?:[^_]*[^_\s])?)_$/, marks.em),
    markRule(/(?<![~\w])~~([^~\s](?:[^~]*[^~\s])?)~~$/, marks.strike),
    markRule(/(?<![`\w])`([^`]+)`$/, marks.code),
  ]
  if (options.radio) rules.splice(3, 0, checkItemRule(/^\(([ xX]?)\)\s$/, 'radio'))
  return inputRules({ rules })
}
````

- [ ] **Step 5: Run it to verify it passes**

Run: `pnpm test test/inputRules.test.ts && pnpm typecheck`
Expected: 21 tests pass; no type errors.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/plugins/inputRules.ts test/inputRules.test.ts
git commit -m "feat: markdown typing shortcuts" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Key bindings

**Files:**
- Create: `src/plugins/keymap.ts`
- Test: `test/keymap.test.ts`

**Interfaces:**
- Consumes: `schema` (Task 3). Test helpers (Task 6).
- Produces: `markdownKeymaps(options: { onLinkShortcut: () => void }): Plugin[]` (our bindings first, then ProseMirror's `baseKeymap`). Bindings: Mod-b/i/e, Mod-Shift-x, Mod-k (calls `onLinkShortcut`), Mod-z, Shift-Mod-z, Mod-y, Enter (ignored in tables; ```` ```lang ```` to code block; list split with the new item unchecked), Shift-Enter (leave code block, else hard break), Backspace at block start (remove checkbox, heading or code block formatting), Tab/Shift-Tab (table cells, adding a row after the last; list indent/outdent), Mod-]/Mod-[.

- [ ] **Step 1: Install commands, keymap and list helpers**

Run: `pnpm add prosemirror-commands@^1.7.2 prosemirror-keymap@^1.2.3 prosemirror-schema-list@^1.5.1`

- [ ] **Step 2: Write the failing test**

`test/keymap.test.ts`:

````ts
import { describe, expect, it, vi } from 'vitest'
import { markdownKeymaps } from '../src/plugins/keymap'
import { createView, cursorAfter, markdownOf, press, select, type } from './helpers'

const withKeys = (markdown: string, onLinkShortcut = () => {}) =>
  createView(markdown, markdownKeymaps({ onLinkShortcut }))

describe('keymap', () => {
  it('Mod-b / Mod-i / Mod-e / Mod-Shift-x toggle marks', () => {
    const view = withKeys('one two three four')
    select(view, 'one')
    press(view, 'b', { ctrl: true })
    select(view, 'two')
    press(view, 'i', { ctrl: true })
    select(view, 'three')
    press(view, 'e', { ctrl: true })
    select(view, 'four')
    press(view, 'x', { ctrl: true, shift: true })
    expect(markdownOf(view)).toBe('**one** *two* `three` ~~four~~')
  })

  it('Mod-k emits the link shortcut', () => {
    const onLink = vi.fn()
    const view = withKeys('x', onLink)
    expect(press(view, 'k', { ctrl: true })).toBe(true)
    expect(onLink).toHaveBeenCalledOnce()
  })

  it('Enter in a checked task starts an unchecked one', () => {
    const view = withKeys('- [x] a')
    cursorAfter(view, 'a')
    press(view, 'Enter')
    type(view, 'b')
    expect(markdownOf(view)).toBe('- [x] a\n- [ ] b')
  })

  it('Enter on an empty last item leaves the list', () => {
    const view = withKeys('- a')
    cursorAfter(view, 'a')
    press(view, 'Enter')
    press(view, 'Enter')
    type(view, 'b')
    expect(markdownOf(view)).toBe('- a\n\nb')
  })

  it('```lang then Enter makes a code block', () => {
    const view = withKeys('')
    type(view, '```ts')
    press(view, 'Enter')
    type(view, 'x')
    expect(markdownOf(view)).toBe('```ts\nx\n```')
  })

  it('Backspace at the start removes a checkbox, then a heading', () => {
    const view = withKeys('- [ ] a')
    cursorAfter(view, '')
    press(view, 'Backspace')
    expect(markdownOf(view)).toBe('- a')
    const heading = withKeys('## h')
    cursorAfter(heading, '')
    press(heading, 'Backspace')
    expect(markdownOf(heading)).toBe('h')
  })

  it('Tab and Shift-Tab indent list items and keep their check state', () => {
    const view = withKeys('- [ ] a\n- [x] b')
    cursorAfter(view, 'b')
    press(view, 'Tab')
    expect(markdownOf(view)).toBe('- [ ] a\n  - [x] b')
    press(view, 'Tab', { shift: true })
    expect(markdownOf(view)).toBe('- [ ] a\n- [x] b')
  })

  it('Tab walks table cells and adds a row at the end; Enter is ignored in cells', () => {
    const view = withKeys('| a | b |\n| --- | --- |\n| 1 | 2 |')
    cursorAfter(view, '2')
    press(view, 'Tab')
    type(view, 'new')
    expect(markdownOf(view)).toBe('| a | b |\n| --- | --- |\n| 1 | 2 |\n| new |  |')
    expect(press(view, 'Enter')).toBe(true)
    expect(markdownOf(view)).toBe('| a | b |\n| --- | --- |\n| 1 | 2 |\n| new |  |')
  })

  it('Shift-Enter inserts a hard break', () => {
    const view = withKeys('ab')
    cursorAfter(view, 'a')
    press(view, 'Enter', { shift: true })
    expect(markdownOf(view)).toBe('a\\\nb')
  })

  it('Mod-z and Mod-Shift-z undo and redo', () => {
    const view = withKeys('a')
    cursorAfter(view, 'a')
    type(view, 'b')
    expect(markdownOf(view)).toBe('ab')
    press(view, 'z', { ctrl: true })
    expect(markdownOf(view)).toBe('a')
    press(view, 'z', { ctrl: true, shift: true })
    expect(markdownOf(view)).toBe('ab')
  })
})
````

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm test test/keymap.test.ts`
Expected: FAIL with `Failed to resolve import "../src/plugins/keymap"`.

- [ ] **Step 4: Implement the keymap**

`src/plugins/keymap.ts`:

````ts
import { baseKeymap, chainCommands, exitCode, setBlockType, toggleMark } from 'prosemirror-commands'
import { redo, undo } from 'prosemirror-history'
import { keymap } from 'prosemirror-keymap'
import { liftListItem, sinkListItem, splitListItem } from 'prosemirror-schema-list'
import type { Command, Plugin } from 'prosemirror-state'
import { addRowAfter, goToNextCell, isInTable } from 'prosemirror-tables'
import { schema } from '../schema'

const { nodes, marks } = schema

/** Enter in a list item. The new item starts unchecked. */
const splitItem: Command = (state, dispatch) =>
  splitListItem(nodes.list_item)(
    state,
    dispatch &&
      ((tr) => {
        const $pos = tr.selection.$from
        for (let depth = $pos.depth; depth > 0; depth--) {
          const node = $pos.node(depth)
          if (node.type === nodes.list_item) {
            if (node.attrs.checked)
              tr.setNodeMarkup($pos.before(depth), undefined, { ...node.attrs, checked: false })
            break
          }
        }
        dispatch(tr)
      }),
  )

/**
 * Backspace at the very start of a block undoes its formatting first:
 * a task or radio item loses its box, a heading or code block becomes a paragraph.
 */
const unformatBlock: Command = (state, dispatch) => {
  const { $cursor } = state.selection as { $cursor?: import('prosemirror-model').ResolvedPos | null }
  if (!$cursor || $cursor.parentOffset > 0) return false
  const parent = $cursor.parent
  if (parent.type === nodes.heading || parent.type === nodes.code_block) {
    return setBlockType(nodes.paragraph)(state, dispatch)
  }
  const itemDepth = $cursor.depth - 1
  const item = itemDepth > 0 ? $cursor.node(itemDepth) : null
  if (item?.type === nodes.list_item && item.attrs.check && $cursor.index(itemDepth) === 0) {
    dispatch?.(state.tr.setNodeMarkup($cursor.before(itemDepth), undefined, { check: null, checked: false }))
    return true
  }
  return false
}

/** Typing ```lang then Enter turns the paragraph into a code block. */
const codeFenceOnEnter: Command = (state, dispatch) => {
  const { $cursor } = state.selection as { $cursor?: import('prosemirror-model').ResolvedPos | null }
  if (!$cursor || $cursor.parent.type !== nodes.paragraph) return false
  const match = /^```([\w-]*)$/.exec($cursor.parent.textContent)
  if (!match || $cursor.parentOffset !== $cursor.parent.content.size) return false
  if (!dispatch) return true
  const tr = state.tr.delete($cursor.start(), $cursor.end())
  tr.setBlockType($cursor.start(), $cursor.start(), nodes.code_block, { language: match[1] ?? '' })
  dispatch(tr)
  return true
}

/** Tab moves to the next table cell and adds a row after the last one. */
const nextCell: Command = (state, dispatch, view) => {
  if (!isInTable(state)) return false
  if (goToNextCell(1)(state, dispatch)) return true
  if (!dispatch || !view) return true
  addRowAfter(state, dispatch)
  goToNextCell(1)(view.state, view.dispatch)
  return true
}

/** Table cells hold one line in markdown, so Enter does nothing there. */
const ignoreInTable: Command = (state) => isInTable(state)

const hardBreak: Command = (state, dispatch) => {
  if (state.selection.$from.parent.type.spec.code || isInTable(state)) return false
  dispatch?.(state.tr.replaceSelectionWith(nodes.hard_break.create()).scrollIntoView())
  return true
}

export interface KeymapOptions {
  onLinkShortcut: () => void
}

/** Editor key bindings. `Mod` is Cmd on Apple platforms and Ctrl elsewhere. */
export function markdownKeymaps(options: KeymapOptions): Plugin[] {
  const bindings: Record<string, Command> = {
    'Mod-b': toggleMark(marks.strong),
    'Mod-i': toggleMark(marks.em),
    'Mod-Shift-x': toggleMark(marks.strike),
    'Mod-e': toggleMark(marks.code),
    'Mod-k': () => {
      options.onLinkShortcut()
      return true
    },
    'Mod-z': undo,
    'Shift-Mod-z': redo,
    'Mod-y': redo,
    Enter: chainCommands(ignoreInTable, codeFenceOnEnter, splitItem),
    'Shift-Enter': chainCommands(exitCode, hardBreak),
    Backspace: unformatBlock,
    Tab: chainCommands(nextCell, sinkListItem(nodes.list_item)),
    'Shift-Tab': chainCommands(
      (state, dispatch) => isInTable(state) && goToNextCell(-1)(state, dispatch),
      liftListItem(nodes.list_item),
    ),
    'Mod-]': sinkListItem(nodes.list_item),
    'Mod-[': liftListItem(nodes.list_item),
  }
  return [keymap(bindings), keymap(baseKeymap)]
}
````

- [ ] **Step 5: Run it to verify it passes**

Run: `pnpm test test/keymap.test.ts && pnpm typecheck`
Expected: 10 tests pass; no type errors.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/plugins/keymap.ts test/keymap.test.ts
git commit -m "feat: editor key bindings" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Public commands and isActive

**Files:**
- Create: `src/commands/index.ts`
- Test: `test/commands.test.ts`

**Interfaces:**
- Consumes: `schema`, `CheckKind` (Task 3), `isSafeUrl` (Task 2). Test helpers (Task 6).
- Produces:
  - `interface Commands` with `toggleBold`, `toggleItalic`, `toggleStrike`, `toggleCode`, `setLink(href)`, `unsetLink`, `setParagraph`, `setHeading(level: 1..6)`, `toggleBulletList`, `toggleOrderedList`, `toggleTaskList`, `toggleRadioList`, `toggleBlockquote`, `setCodeBlock(language?)`, `insertHorizontalRule`, `insertTable(rows, cols)`, `addRowAfter`, `addColumnAfter`, `deleteRow`, `deleteColumn`, `deleteTable`, `insertImage(src, alt?)`, `undo`, `redo`. Each returns `boolean` and focuses the view when it applied.
  - `createCommands(view: EditorView): Commands`
  - `type ActiveName = 'bold' | 'italic' | 'strike' | 'code' | 'link' | 'paragraph' | 'heading' | 'bulletList' | 'orderedList' | 'taskList' | 'radioList' | 'blockquote' | 'codeBlock' | 'table'`
  - `isActive(state: EditorState, name: ActiveName, attrs?: { level?: number }): boolean`
  - `markExtent($pos, type)`: the contiguous run of text with one mark around a position.

- [ ] **Step 1: Write the failing test**

`test/commands.test.ts`:

````ts
import { describe, expect, it } from 'vitest'
import { createCommands, isActive } from '../src/commands'
import { createView, cursorAfter, markdownOf, select, type } from './helpers'

const setup = (markdown: string) => {
  const view = createView(markdown)
  return {
    view,
    commands: createCommands(view),
    active: (name: Parameters<typeof isActive>[1], attrs?: { level?: number }) =>
      isActive(view.state, name, attrs),
  }
}

describe('commands', () => {
  it('toggle marks on a selection and report them as active', () => {
    const { view, commands, active } = setup('word')
    select(view, 'word')
    expect(commands.toggleBold()).toBe(true)
    expect(commands.toggleItalic()).toBe(true)
    expect(commands.toggleStrike()).toBe(true)
    expect(active('bold')).toBe(true)
    expect(active('italic')).toBe(true)
    expect(active('strike')).toBe(true)
    expect(active('code')).toBe(false)
    expect(markdownOf(view)).toBe('***~~word~~***')
    commands.toggleBold()
    expect(active('bold')).toBe(false)
  })

  it('switch block types', () => {
    const { view, commands, active } = setup('text')
    cursorAfter(view, 'te')
    expect(commands.setHeading(2)).toBe(true)
    expect(active('heading', { level: 2 })).toBe(true)
    expect(active('heading', { level: 1 })).toBe(false)
    expect(active('heading')).toBe(true)
    commands.setCodeBlock('ts')
    expect(active('codeBlock')).toBe(true)
    expect(markdownOf(view)).toBe('```ts\ntext\n```')
    commands.setParagraph()
    expect(active('paragraph')).toBe(true)
  })

  it('toggle and convert lists', () => {
    const { view, commands, active } = setup('text')
    cursorAfter(view, 'te')
    commands.toggleTaskList()
    expect(markdownOf(view)).toBe('- [ ] text')
    expect(active('taskList')).toBe(true)
    expect(active('bulletList')).toBe(false)
    commands.toggleRadioList()
    expect(markdownOf(view)).toBe('- ( ) text')
    expect(active('radioList')).toBe(true)
    commands.toggleOrderedList()
    expect(markdownOf(view)).toBe('1. text')
    expect(active('orderedList')).toBe(true)
    commands.toggleBulletList()
    expect(markdownOf(view)).toBe('- text')
    expect(active('bulletList')).toBe(true)
    commands.toggleBulletList()
    expect(markdownOf(view)).toBe('text')
  })

  it('toggle blockquote', () => {
    const { view, commands, active } = setup('text')
    cursorAfter(view, 'te')
    commands.toggleBlockquote()
    expect(markdownOf(view)).toBe('> text')
    expect(active('blockquote')).toBe(true)
    commands.toggleBlockquote()
    expect(markdownOf(view)).toBe('text')
  })

  it('set, update and remove links, refusing unsafe URLs', () => {
    const { view, commands, active } = setup('text')
    cursorAfter(view, 'te')
    expect(commands.setLink('javascript:alert(1)')).toBe(false)
    expect(commands.setLink('https://x.com')).toBe(true)
    expect(markdownOf(view)).toBe('te<https://x.com>xt')
    cursorAfter(view, 'https://x')
    expect(active('link')).toBe(true)
    commands.setLink('https://y.com')
    expect(markdownOf(view)).toBe('te[https://x.com](https://y.com)xt')
    expect(commands.unsetLink()).toBe(true)
    expect(markdownOf(view)).toBe('tehttps://x.comxt')
    select(view, 'xt')
    expect(commands.setLink('/docs')).toBe(true)
    expect(markdownOf(view)).toBe('tehttps://x.com[xt](/docs)')
  })

  it('insert rule, image and table, and edit tables', () => {
    const { view, commands } = setup('')
    expect(commands.insertImage('javascript:x')).toBe(false)
    expect(commands.insertImage('/a.png', 'A')).toBe(true)
    expect(markdownOf(view)).toBe('![A](/a.png)')
    commands.insertHorizontalRule()
    expect(markdownOf(view)).toBe('![A](/a.png)\n\n---')
    const table = setup('')
    expect(table.commands.insertTable(0, 2)).toBe(false)
    expect(table.commands.insertTable(2, 2)).toBe(true)
    expect(table.active('table')).toBe(true)
    type(table.view, 'h')
    table.commands.addColumnAfter()
    table.commands.addRowAfter()
    expect(markdownOf(table.view)).toBe('| h |  |  |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |')
    table.commands.deleteRow()
    table.commands.deleteColumn()
    expect(markdownOf(table.view)).toBe('|  |  |\n| --- | --- |\n|  |  |')
    table.commands.deleteTable()
    expect(table.active('table')).toBe(false)
  })

  it('undo and redo', () => {
    const { view, commands } = setup('a')
    cursorAfter(view, 'a')
    type(view, 'b')
    expect(commands.undo()).toBe(true)
    expect(markdownOf(view)).toBe('a')
    expect(commands.redo()).toBe(true)
    expect(markdownOf(view)).toBe('ab')
  })
})
````

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test test/commands.test.ts`
Expected: FAIL with `Failed to resolve import "../src/commands"`.

- [ ] **Step 3: Implement the commands**

`src/commands/index.ts`:

```ts
import { lift, setBlockType, toggleMark, wrapIn } from 'prosemirror-commands'
import { redo, undo } from 'prosemirror-history'
import type { Mark, MarkType, NodeType, ResolvedPos } from 'prosemirror-model'
import { liftListItem, wrapInList } from 'prosemirror-schema-list'
import { TextSelection, type Command, type EditorState } from 'prosemirror-state'
import { addColumnAfter, addRowAfter, deleteColumn, deleteRow, deleteTable } from 'prosemirror-tables'
import { liftTarget } from 'prosemirror-transform'
import type { EditorView } from 'prosemirror-view'
import { schema, type CheckKind } from '../schema'
import { isSafeUrl } from '../url'

const { nodes, marks } = schema

/** The contiguous run of text carrying the same `type` mark around `$pos`. */
export function markExtent(
  $pos: ResolvedPos,
  type: MarkType,
): { from: number; to: number; mark: Mark } | null {
  const offset = $pos.parentOffset
  let run: { from: number; to: number; mark: Mark } | null = null
  let pos = 0
  for (let i = 0; i < $pos.parent.childCount; i++) {
    const child = $pos.parent.child(i)
    const mark = type.isInSet(child.marks)
    const end = pos + child.nodeSize
    if (run && (!mark || !run.mark.eq(mark)) && run.from <= offset && offset <= run.to) break
    if (!mark) run = null
    else if (run && run.to === pos && run.mark.eq(mark)) run.to = end
    else run = { from: pos, to: end, mark }
    pos = end
  }
  if (!run || offset < run.from || offset > run.to) return null
  return { from: $pos.start() + run.from, to: $pos.start() + run.to, mark: run.mark }
}

function isList(type: NodeType): boolean {
  return type === nodes.bullet_list || type === nodes.ordered_list
}

/** Innermost list around the selection start, with the item holding it. */
function currentList(state: EditorState) {
  const { $from } = state.selection
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth)
    if (isList(node.type)) return { list: node, item: $from.node(depth + 1) }
  }
  return null
}

function toggleList(listType: NodeType, check: CheckKind): Command {
  return (state, dispatch) => {
    const { $from, $to } = state.selection
    const range = $from.blockRange($to, (node) => isList(node.type))
    if (range) {
      const list = range.parent
      let sameKind = list.type === listType
      for (let i = range.startIndex; i < range.endIndex; i++) {
        if (list.child(i).attrs.check !== check) sameKind = false
      }
      if (sameKind) return liftListItem(nodes.list_item)(state, dispatch)
      if (dispatch) {
        const tr = state.tr
        const listPos = $from.before(range.depth)
        const listAttrs =
          listType === nodes.ordered_list
            ? { order: 1, tight: list.attrs.tight }
            : { tight: list.attrs.tight }
        tr.setNodeMarkup(listPos, listType, listAttrs)
        let pos = range.start
        for (let i = range.startIndex; i < range.endIndex; i++) {
          const item = list.child(i)
          const checked = item.attrs.check === check ? item.attrs.checked : false
          tr.setNodeMarkup(pos, undefined, { check, checked })
          pos += item.nodeSize
        }
        dispatch(tr)
      }
      return true
    }
    return wrapInList(listType)(
      state,
      dispatch &&
        ((tr) => {
          if (check) {
            const $pos = tr.selection.$from
            for (let depth = $pos.depth; depth > 0; depth--) {
              const node = $pos.node(depth)
              if (!isList(node.type)) continue
              let pos = $pos.start(depth)
              node.forEach((item) => {
                tr.setNodeMarkup(pos, undefined, { check, checked: false })
                pos += item.nodeSize
              })
              break
            }
          }
          dispatch(tr)
        }),
    )
  }
}

const toggleBlockquote: Command = (state, dispatch) => {
  const { $from, $to } = state.selection
  const range = $from.blockRange($to, (node) => node.type === nodes.blockquote)
  if (range) {
    const target = liftTarget(range)
    if (target === null) return false
    dispatch?.(state.tr.lift(range, target).scrollIntoView())
    return true
  }
  return wrapIn(nodes.blockquote)(state, dispatch) || lift(state, dispatch)
}

function setLink(href: string): Command {
  return (state, dispatch) => {
    if (!isSafeUrl(href) || state.selection.$from.parent.type.spec.code) return false
    const type = marks.link
    const mark = type.create({ href })
    let { from, to } = state.selection
    if (state.selection.empty) {
      const extent = markExtent(state.selection.$from, type)
      if (!extent) {
        dispatch?.(state.tr.replaceSelectionWith(schema.text(href, [mark]), false).scrollIntoView())
        return true
      }
      ;({ from, to } = extent)
    }
    dispatch?.(state.tr.removeMark(from, to, type).addMark(from, to, mark))
    return true
  }
}

const unsetLink: Command = (state, dispatch) => {
  const type = marks.link
  let { from, to } = state.selection
  if (state.selection.empty) {
    const extent = markExtent(state.selection.$from, type)
    if (!extent) return false
    ;({ from, to } = extent)
  } else if (!state.doc.rangeHasMark(from, to, type)) {
    return false
  }
  dispatch?.(state.tr.removeMark(from, to, type))
  return true
}

function insertBlock(create: () => import('prosemirror-model').Node | null): Command {
  return (state, dispatch) => {
    const node = create()
    if (!node) return false
    const tr = state.tr.replaceSelectionWith(node)
    if (!tr.doc.eq(state.doc)) {
      dispatch?.(tr.scrollIntoView())
      return true
    }
    return false
  }
}

function createTable(rows: number, cols: number) {
  if (rows < 1 || cols < 1) return null
  const row = (cell: NodeType) =>
    nodes.table_row.create(
      null,
      Array.from({ length: cols }, () => cell.create()),
    )
  return nodes.table.create(null, [
    row(nodes.table_header),
    ...Array.from({ length: rows - 1 }, () => row(nodes.table_cell)),
  ])
}

/** Commands exposed on `editor.commands`. Each returns true when it applied. */
export interface Commands {
  /** Toggles bold on the selection, or for the next typed text. */
  toggleBold(): boolean
  /** Toggles italic. */
  toggleItalic(): boolean
  /** Toggles strikethrough. */
  toggleStrike(): boolean
  /** Toggles inline code. */
  toggleCode(): boolean
  /**
   * Links the selection to `href`. With an empty selection it updates the link under the
   * cursor, or inserts `href` as linked text. Returns false for unsafe URLs.
   */
  setLink(href: string): boolean
  /** Removes the link from the selection, or the whole link under the cursor. */
  unsetLink(): boolean
  /** Turns the current block into a paragraph. */
  setParagraph(): boolean
  /** Turns the current block into a heading. */
  setHeading(level: 1 | 2 | 3 | 4 | 5 | 6): boolean
  /** Wraps in a bullet list, converts another list kind to one, or unwraps it. */
  toggleBulletList(): boolean
  /** Wraps in a numbered list, converts another list kind to one, or unwraps it. */
  toggleOrderedList(): boolean
  /** Wraps in a task list (`- [ ]`), converts another list kind to one, or unwraps it. */
  toggleTaskList(): boolean
  /** Like `toggleTaskList`, with radio items (`- ( )`). Pair with `extensions.radio`. */
  toggleRadioList(): boolean
  /** Wraps the selection in a quote, or lifts it out of one. */
  toggleBlockquote(): boolean
  /** Turns the current block into a code block with an optional language. */
  setCodeBlock(language?: string): boolean
  /** Inserts a horizontal rule. */
  insertHorizontalRule(): boolean
  /** Inserts a table with a header row. Needs at least one row and one column. */
  insertTable(rows: number, cols: number): boolean
  /** Adds a table row below the selection. */
  addRowAfter(): boolean
  /** Adds a table column after the selection. */
  addColumnAfter(): boolean
  /** Deletes the selected table rows. */
  deleteRow(): boolean
  /** Deletes the selected table columns. */
  deleteColumn(): boolean
  /** Deletes the table around the selection. */
  deleteTable(): boolean
  /** Inserts an image. Returns false for unsafe URLs. */
  insertImage(src: string, alt?: string): boolean
  /** Undoes the last change. */
  undo(): boolean
  /** Redoes the last undone change. */
  redo(): boolean
}

/** Binds the command set to a view. Used by `createEditor`. */
export function createCommands(view: EditorView): Commands {
  const run = (command: Command): boolean => {
    const applied = command(view.state, view.dispatch, view)
    if (applied) view.focus()
    return applied
  }
  return {
    toggleBold: () => run(toggleMark(marks.strong)),
    toggleItalic: () => run(toggleMark(marks.em)),
    toggleStrike: () => run(toggleMark(marks.strike)),
    toggleCode: () => run(toggleMark(marks.code)),
    setLink: (href) => run(setLink(href)),
    unsetLink: () => run(unsetLink),
    setParagraph: () => run(setBlockType(nodes.paragraph)),
    setHeading: (level) => run(setBlockType(nodes.heading, { level })),
    toggleBulletList: () => run(toggleList(nodes.bullet_list, null)),
    toggleOrderedList: () => run(toggleList(nodes.ordered_list, null)),
    toggleTaskList: () => run(toggleList(nodes.bullet_list, 'task')),
    toggleRadioList: () => run(toggleList(nodes.bullet_list, 'radio')),
    toggleBlockquote: () => run(toggleBlockquote),
    setCodeBlock: (language = '') => run(setBlockType(nodes.code_block, { language })),
    insertHorizontalRule: () => run(insertBlock(() => nodes.horizontal_rule.create())),
    insertTable: (rows, cols) =>
      run((state, dispatch) => {
        const table = createTable(rows, cols)
        if (!table) return false
        if (dispatch) {
          const tr = state.tr.replaceSelectionWith(table)
          const $cell = tr.doc.resolve(tr.mapping.map(state.selection.from, -1))
          dispatch(tr.setSelection(TextSelection.near($cell)).scrollIntoView())
        }
        return true
      }),
    addRowAfter: () => run(addRowAfter),
    addColumnAfter: () => run(addColumnAfter),
    deleteRow: () => run(deleteRow),
    deleteColumn: () => run(deleteColumn),
    deleteTable: () => run(deleteTable),
    insertImage: (src, alt) =>
      run(isSafeUrl(src) ? insertBlock(() => nodes.image.create({ src, alt: alt ?? null })) : () => false),
    undo: () => run(undo),
    redo: () => run(redo),
  }
}

/** Names accepted by `editor.isActive()`. */
export type ActiveName =
  | 'bold'
  | 'italic'
  | 'strike'
  | 'code'
  | 'link'
  | 'paragraph'
  | 'heading'
  | 'bulletList'
  | 'orderedList'
  | 'taskList'
  | 'radioList'
  | 'blockquote'
  | 'codeBlock'
  | 'table'

const markNames: Partial<Record<ActiveName, 'strong' | 'em' | 'strike' | 'code' | 'link'>> = {
  bold: 'strong',
  italic: 'em',
  strike: 'strike',
  code: 'code',
  link: 'link',
}

function hasAncestor(state: EditorState, type: NodeType): boolean {
  const { $from } = state.selection
  for (let depth = $from.depth; depth > 0; depth--) if ($from.node(depth).type === type) return true
  return false
}

/** Whether a mark or block is active at the selection in `state`. */
export function isActive(state: EditorState, name: ActiveName, attrs: { level?: number } = {}): boolean {
  const markName = markNames[name]
  if (markName) {
    const type = marks[markName]
    const { from, to, empty, $from } = state.selection
    if (empty) return !!type.isInSet(state.storedMarks ?? $from.marks())
    return state.doc.rangeHasMark(from, to, type)
  }
  const { $from } = state.selection
  const list = currentList(state)
  switch (name) {
    case 'paragraph':
      return $from.parent.type === nodes.paragraph
    case 'heading':
      return (
        $from.parent.type === nodes.heading &&
        (attrs.level === undefined || $from.parent.attrs.level === attrs.level)
      )
    case 'codeBlock':
      return $from.parent.type === nodes.code_block
    case 'bulletList':
      return !!list && list.list.type === nodes.bullet_list && !list.item.attrs.check
    case 'orderedList':
      return list?.list.type === nodes.ordered_list
    case 'taskList':
      return list?.item.attrs.check === 'task'
    case 'radioList':
      return list?.item.attrs.check === 'radio'
    case 'blockquote':
      return hasAncestor(state, nodes.blockquote)
    case 'table':
      return hasAncestor(state, nodes.table)
    default:
      return false
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test test/commands.test.ts && pnpm typecheck`
Expected: 7 tests pass; no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/commands/index.ts test/commands.test.ts
git commit -m "feat: public commands and isActive" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Placeholder and link clicks

**Files:**
- Create: `src/plugins/placeholder.ts`, `src/plugins/links.ts`
- Test: `test/plugins.test.ts`

**Interfaces:**
- Consumes: `schema` (Task 3), `isSafeUrl` (Task 2). Test helpers (Task 6).
- Produces:
  - `placeholder(text: string): Plugin`: while the document is a single empty paragraph, that paragraph gets `class="lme-empty"` and `data-placeholder`.
  - `linkClicks(): Plugin`: Mod-click on a safe link calls `window.open(href, '_blank', 'noopener,noreferrer')`; a plain click is left to ProseMirror (it places the cursor).

- [ ] **Step 1: Write the failing test**

`test/plugins.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { linkClicks } from '../src/plugins/links'
import { placeholder } from '../src/plugins/placeholder'
import { createView, type } from './helpers'

describe('placeholder', () => {
  it('shows while the document is empty', () => {
    const view = createView('', [placeholder('Write here')])
    const empty = view.dom.querySelector('.lme-empty')
    expect(empty?.getAttribute('data-placeholder')).toBe('Write here')
    type(view, 'x')
    expect(view.dom.querySelector('.lme-empty')).toBeNull()
  })

  it('is not shown for an empty heading', () => {
    const view = createView('#', [placeholder('Write here')])
    expect(view.dom.querySelector('.lme-empty')).toBeNull()
  })
})

describe('link clicks', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const clickLink = (href: string, mods: MouseEventInit) => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const view = createView(`[link](${href})`, [linkClicks()])
    const event = new MouseEvent('click', mods)
    // Position 2 is inside the link text.
    const handled = view.someProp('handleClick', (f) => f(view, 2, event))
    return { handled: !!handled, open }
  }

  it('Mod-click opens the link in a new tab', () => {
    const { handled, open } = clickLink('https://x.com', { ctrlKey: true })
    expect(handled).toBe(true)
    expect(open).toHaveBeenCalledWith('https://x.com', '_blank', 'noopener,noreferrer')
  })

  it('a plain click only places the cursor', () => {
    const { handled, open } = clickLink('https://x.com', {})
    expect(handled).toBe(false)
    expect(open).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test test/plugins.test.ts`
Expected: FAIL with `Failed to resolve import "../src/plugins/links"`.

- [ ] **Step 3: Implement the placeholder**

`src/plugins/placeholder.ts`:

```ts
import { Plugin } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'

/** Shows `text` in the first paragraph while the document is empty. */
export function placeholder(text: string): Plugin {
  return new Plugin({
    props: {
      decorations(state) {
        const first = state.doc.firstChild
        const empty =
          state.doc.childCount === 1 && first?.type.name === 'paragraph' && first.content.size === 0
        if (!empty) return null
        return DecorationSet.create(state.doc, [
          Decoration.node(0, first.nodeSize, { class: 'lme-empty', 'data-placeholder': text }),
        ])
      },
    },
  })
}
```

- [ ] **Step 4: Implement link clicks**

`src/plugins/links.ts`:

```ts
import { Plugin } from 'prosemirror-state'
import { schema } from '../schema'
import { isSafeUrl } from '../url'

/** Cmd/Ctrl + click on a link opens it in a new tab. A plain click just places the cursor. */
export function linkClicks(): Plugin {
  return new Plugin({
    props: {
      handleClick(view, pos, event) {
        if (!(event.metaKey || event.ctrlKey)) return false
        const $pos = view.state.doc.resolve(pos)
        const link =
          schema.marks.link.isInSet($pos.marks()) ?? schema.marks.link.isInSet($pos.nodeAfter?.marks ?? [])
        const href = link?.attrs.href as string | undefined
        if (!href || !isSafeUrl(href)) return false
        window.open(href, '_blank', 'noopener,noreferrer')
        return true
      },
    },
  })
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `pnpm test test/plugins.test.ts && pnpm typecheck`
Expected: 4 tests pass; no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/plugins/placeholder.ts src/plugins/links.ts test/plugins.test.ts
git commit -m "feat: placeholder and link click plugins" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: createEditor and the public entry point

**Files:**
- Create: `src/clipboard.ts`, `src/editor.ts`, `src/index.ts`
- Test: `test/editor.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2 to 10.
- Produces (the public API, exported from `src/index.ts`):
  - `createEditor(options: EditorOptions): Editor`
  - `interface EditorOptions { element; value?; onChange?; changeDelay?; placeholder?; editable?; autofocus?; ariaLabel?; extensions?: { radio? }; classNames?: { root? } }`
  - `interface Editor { commands; view; getMarkdown(); setMarkdown(md); setEditable(b); isEditable(); focus(); isActive(name, attrs?); on(event, handler): () => void; destroy() }`
  - `interface EditorEvents { change(markdown); selectionChange(); focus(); blur(); linkShortcut() }`
  - Re-exports: types `Commands`, `ActiveName`; function `isSafeUrl`.
  - `createClipboardTextParser(parse)`: pasted plain text is parsed as markdown; a single-paragraph paste keeps its leading and trailing spaces.

- [ ] **Step 1: Install the cursor plugins**

Run: `pnpm add prosemirror-dropcursor@^1.8.4 prosemirror-gapcursor@^1.4.1`

- [ ] **Step 2: Write the failing test**

`test/editor.test.ts`:

````ts
import { describe, expect, it, vi } from 'vitest'
import { createEditor, type EditorOptions } from '../src'
import { cursorAfter, mount, press, select, type } from './helpers'

const make = (value = '', options: Partial<EditorOptions> = {}) =>
  createEditor({ element: mount(), value, ...options })

describe('createEditor', () => {
  it('renders formatted content without markdown syntax', () => {
    const editor = make('# Title\n\n**bold** and - [ ]')
    const dom = editor.view.dom
    expect(dom.querySelector('h1')!.textContent).toBe('Title')
    expect(dom.querySelector('strong')!.textContent).toBe('bold')
    expect(dom.textContent).not.toContain('#')
    expect(dom.textContent).not.toContain('**')
  })

  it('sets root attributes for styling and accessibility', () => {
    const editor = make('', { ariaLabel: 'Notes', classNames: { root: 'mine' } })
    const dom = editor.view.dom
    expect(dom.className).toContain('lme')
    expect(dom.className).toContain('mine')
    expect(dom.getAttribute('role')).toBe('textbox')
    expect(dom.getAttribute('aria-multiline')).toBe('true')
    expect(dom.getAttribute('aria-label')).toBe('Notes')
  })

  it('calls onChange for edits only, not for selection or setMarkdown', () => {
    const onChange = vi.fn()
    const editor = make('x', { onChange })
    cursorAfter(editor.view, 'x')
    editor.setMarkdown('y')
    expect(onChange).not.toHaveBeenCalled()
    cursorAfter(editor.view, 'y')
    type(editor.view, 'z')
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenLastCalledWith('yz')
  })

  it('setMarkdown clears undo history', () => {
    const editor = make('a')
    cursorAfter(editor.view, 'a')
    type(editor.view, 'b')
    editor.setMarkdown('new')
    expect(editor.commands.undo()).toBe(false)
    expect(editor.getMarkdown()).toBe('new')
  })

  it('changeDelay batches onChange and flushes on blur and destroy', () => {
    vi.useFakeTimers()
    try {
      const onChange = vi.fn()
      const editor = make('', { onChange, changeDelay: 200 })
      type(editor.view, 'abc')
      expect(onChange).not.toHaveBeenCalled()
      expect(editor.getMarkdown()).toBe('abc')
      vi.advanceTimersByTime(200)
      expect(onChange).toHaveBeenCalledTimes(1)
      expect(onChange).toHaveBeenLastCalledWith('abc')
      type(editor.view, 'd')
      editor.view.dom.dispatchEvent(new FocusEvent('blur'))
      expect(onChange).toHaveBeenLastCalledWith('abcd')
      type(editor.view, 'e')
      editor.destroy()
      expect(onChange).toHaveBeenLastCalledWith('abcde')
      expect(onChange).toHaveBeenCalledTimes(3)
    } finally {
      vi.useRealTimers()
    }
  })

  it('emits events and unsubscribes', () => {
    const editor = make('a')
    const change = vi.fn()
    const selection = vi.fn()
    const off = editor.on('change', change)
    editor.on('selectionChange', selection)
    cursorAfter(editor.view, 'a')
    expect(selection).toHaveBeenCalled()
    type(editor.view, 'b')
    expect(change).toHaveBeenLastCalledWith('ab')
    off()
    type(editor.view, 'c')
    expect(change).toHaveBeenCalledTimes(1)
  })

  it('switches between editable and read-only', () => {
    const editor = make('- [ ] a', { editable: false })
    const input = editor.view.dom.querySelector('input')!
    expect(editor.isEditable()).toBe(false)
    expect(editor.view.dom.getAttribute('contenteditable')).toBe('false')
    expect(input.disabled).toBe(true)
    editor.setEditable(true)
    expect(editor.view.dom.getAttribute('contenteditable')).toBe('true')
    expect(input.disabled).toBe(false)
  })

  it('wires input rules, keymaps, commands and isActive together', () => {
    const onLink = vi.fn()
    const editor = make('')
    editor.on('linkShortcut', onLink)
    type(editor.view, '## Hello')
    expect(editor.isActive('heading', { level: 2 })).toBe(true)
    select(editor.view, 'Hello')
    press(editor.view, 'b', { ctrl: true })
    press(editor.view, 'k', { ctrl: true })
    expect(onLink).toHaveBeenCalled()
    expect(editor.getMarkdown()).toBe('## **Hello**')
  })

  it('radio lists need extensions.radio', () => {
    expect(make('- (x) a').view.dom.querySelector('input')).toBeNull()
    const editor = make('- (x) a\n- ( ) b', { extensions: { radio: true } })
    editor.view.dom.querySelectorAll('input')[1]!.click()
    expect(editor.getMarkdown()).toBe('- ( ) a\n- (x) b')
  })

  it('pastes markdown text as formatted content', () => {
    const editor = make('start')
    cursorAfter(editor.view, 'start')
    editor.view.pasteText(' **bold** text')
    expect(editor.getMarkdown()).toBe('start **bold** text')
  })

  it('pastes multi-line markdown as blocks', () => {
    const editor = make('')
    editor.view.pasteText('# Title\n\n- [ ] task')
    expect(editor.getMarkdown()).toBe('# Title\n\n- [ ] task')
  })

  it('pastes into a code block as raw text', () => {
    const editor = make('```\ncode\n```')
    cursorAfter(editor.view, 'code')
    editor.view.pasteText(' **not bold**')
    expect(editor.getMarkdown()).toBe('```\ncode **not bold**\n```')
  })

  it('reduces pasted HTML to what markdown can hold, dropping unsafe links', () => {
    const editor = make('')
    editor.view.pasteHTML(
      '<p style="color:red"><span>Hi</span> <b>bold</b> <a href="javascript:alert(1)">bad</a> ' +
        '<a href="https://ok.com">ok</a><script>alert(1)</script></p><img src="data:image/png;base64,AAAA">',
    )
    expect(editor.getMarkdown()).toBe('Hi **bold** bad [ok](https://ok.com)')
  })

  it('pastes GitHub task list HTML as task items', () => {
    const editor = make('')
    editor.view.pasteHTML(
      '<ul><li><input type="checkbox" checked disabled> done</li><li><input type="checkbox"> todo</li></ul>',
    )
    expect(editor.getMarkdown()).toBe('- [x] done\n- [ ] todo')
  })

  it('keeps front matter through edits', () => {
    const editor = make('---\ntitle: T\n---\n\nbody')
    cursorAfter(editor.view, 'body')
    type(editor.view, '!')
    expect(editor.getMarkdown()).toBe('---\ntitle: T\n---\n\nbody!')
  })

  it('shows the placeholder only when given', () => {
    expect(make('').view.dom.querySelector('[data-placeholder]')).toBeNull()
    expect(
      make('', { placeholder: 'Write' }).view.dom.querySelector('[data-placeholder="Write"]'),
    ).not.toBeNull()
  })

  it('destroy removes its DOM and leaves the host element alone', () => {
    const element = mount()
    element.innerHTML = '<span>existing</span>'
    const editor = createEditor({ element })
    expect(element.children).toHaveLength(2)
    editor.destroy()
    expect(element.innerHTML).toBe('<span>existing</span>')
  })
})
````

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm test test/editor.test.ts`
Expected: FAIL with `Failed to resolve import "../src"`.

- [ ] **Step 4: Implement the clipboard text parser**

`src/clipboard.ts`:

```ts
import { Fragment, Slice, type Node } from 'prosemirror-model'
import { schema } from './schema'

/**
 * Pasted plain text is read as markdown, so pasting `**bold**` gives bold text.
 * Markdown trims the spaces around a paragraph; for a single-paragraph paste
 * they are put back, so pasting " word" after "a" gives "a word".
 */
export function createClipboardTextParser(parse: (markdown: string) => Node): (text: string) => Slice {
  return (text) => {
    if (!text.trim()) return text ? new Slice(Fragment.from(schema.text(text)), 0, 0) : Slice.empty
    const doc = parse(text)
    const first = doc.firstChild
    if (doc.childCount !== 1 || first?.type !== schema.nodes.paragraph) return Slice.maxOpen(doc.content)
    const leading = /^[ \t]*/.exec(text)![0]
    const trailing = /[ \t]*$/.exec(text)![0]
    let content = first.content
    if (leading) content = Fragment.from(schema.text(leading)).append(content)
    if (trailing) content = content.append(Fragment.from(schema.text(trailing)))
    return new Slice(content, 0, 0)
  }
}
```

- [ ] **Step 5: Implement createEditor**

Note: `columnResizing` from prosemirror-tables is deliberately not used; markdown cannot store column widths, so a resize would be lost on save.

`src/editor.ts`:

```ts
import { dropCursor } from 'prosemirror-dropcursor'
import { gapCursor } from 'prosemirror-gapcursor'
import { history } from 'prosemirror-history'
import { EditorState, type Plugin, type Transaction } from 'prosemirror-state'
import { tableEditing } from 'prosemirror-tables'
import { EditorView } from 'prosemirror-view'
import type { Node } from 'prosemirror-model'
import { createClipboardTextParser } from './clipboard'
import { createCommands, isActive, type ActiveName, type Commands } from './commands'
import { createParser } from './markdown/parser'
import { serializeMarkdown } from './markdown/serializer'
import { markdownInputRules } from './plugins/inputRules'
import { markdownKeymaps } from './plugins/keymap'
import { linkClicks } from './plugins/links'
import { placeholder } from './plugins/placeholder'
import { ListItemView } from './views/listItem'

/** Options for {@link createEditor}. */
export interface EditorOptions {
  /** Element the editor is mounted into. Its existing children are left alone. */
  element: HTMLElement
  /** Initial markdown. Defaults to an empty document. */
  value?: string
  /** Called with the new markdown after every content change. Not called by `setMarkdown`. */
  onChange?: (markdown: string) => void
  /**
   * Wait this many milliseconds after the last edit before calling `onChange`
   * and emitting `change`. Defaults to 0 (call right away). Set it to a few
   * hundred for very large documents. Pending changes are flushed on blur
   * and on `destroy`, and `getMarkdown()` is always up to date.
   */
  changeDelay?: number
  /** Text shown while the document is empty. */
  placeholder?: string
  /** When false, the editor is a read-only renderer. Defaults to true. */
  editable?: boolean
  /** Focus the editor once mounted. */
  autofocus?: boolean
  /** Accessible name of the editing area. */
  ariaLabel?: string
  /** Opt-in syntax that is not part of CommonMark or GFM. */
  extensions?: {
    /** `- ( )` / `- (x)` radio lists. Defaults to false. */
    radio?: boolean
  }
  /** Extra class names. */
  classNames?: {
    /** Added to the editable root, next to `lme`. */
    root?: string
  }
}

/** Events emitted by the editor. */
export interface EditorEvents {
  /** Content changed. Receives the new markdown. */
  change: (markdown: string) => void
  /** Selection moved or content changed. Useful to refresh toolbar state. */
  selectionChange: () => void
  focus: () => void
  blur: () => void
  /** Cmd/Ctrl + K was pressed. Open your link UI, then call `commands.setLink`. */
  linkShortcut: () => void
}

/** A mounted editor. Create one with {@link createEditor}. */
export interface Editor {
  /** Formatting and insertion commands. Each returns true when it applied. */
  readonly commands: Commands
  /** The underlying ProseMirror view, for advanced use. */
  readonly view: EditorView
  /** The current document as markdown. */
  getMarkdown(): string
  /** Replaces the whole document. Clears undo history and does not call `onChange`. */
  setMarkdown(markdown: string): void
  setEditable(editable: boolean): void
  isEditable(): boolean
  focus(): void
  /** Whether a mark or block is active at the selection, e.g. `isActive('heading', { level: 2 })`. */
  isActive(name: ActiveName, attrs?: { level?: number }): boolean
  /** Subscribes to an event and returns a function that unsubscribes. */
  on<E extends keyof EditorEvents>(event: E, handler: EditorEvents[E]): () => void
  /** Unmounts the editor and removes its DOM. */
  destroy(): void
}

/** Mounts a markdown editor into `options.element`. */
export function createEditor(options: EditorOptions): Editor {
  const radio = options.extensions?.radio ?? false
  const parse = createParser({ radio })
  const listeners = new Map<keyof EditorEvents, Set<(...args: never[]) => void>>()

  function emit<E extends keyof EditorEvents>(event: E, ...args: Parameters<EditorEvents[E]>): void {
    listeners.get(event)?.forEach((handler) => (handler as (...a: typeof args) => void)(...args))
  }

  const plugins: Plugin[] = [
    markdownInputRules({ radio }),
    ...markdownKeymaps({ onLinkShortcut: () => emit('linkShortcut') }),
    history(),
    dropCursor(),
    gapCursor(),
    tableEditing(),
    linkClicks(),
  ]
  if (options.placeholder) plugins.push(placeholder(options.placeholder))

  const createState = (markdown: string) => EditorState.create({ doc: parse(markdown), plugins })

  let cachedDoc: Node | null = null
  let cachedMarkdown = ''
  const getMarkdown = (): string => {
    if (view.state.doc !== cachedDoc) {
      cachedDoc = view.state.doc
      cachedMarkdown = serializeMarkdown(cachedDoc)
    }
    return cachedMarkdown
  }

  const changeDelay = options.changeDelay ?? 0
  let changeTimer: ReturnType<typeof setTimeout> | undefined
  const notifyChange = (): void => {
    changeTimer = undefined
    if (!options.onChange && !listeners.get('change')?.size) return
    const markdown = getMarkdown()
    options.onChange?.(markdown)
    emit('change', markdown)
  }
  const cancelChange = (): void => {
    clearTimeout(changeTimer)
    changeTimer = undefined
  }
  const flushChange = (): void => {
    if (changeTimer === undefined) return
    cancelChange()
    notifyChange()
  }

  let editable = options.editable ?? true
  const view: EditorView = new EditorView(options.element, {
    state: createState(options.value ?? ''),
    editable: () => editable,
    attributes: {
      class: ['lme', options.classNames?.root].filter(Boolean).join(' '),
      role: 'textbox',
      'aria-multiline': 'true',
      ...(options.ariaLabel ? { 'aria-label': options.ariaLabel } : {}),
    },
    nodeViews: {
      list_item: (node, nodeView, getPos) => new ListItemView(node, nodeView, getPos),
    },
    clipboardTextParser: createClipboardTextParser(parse),
    handleDOMEvents: {
      focus: () => {
        emit('focus')
        return false
      },
      blur: () => {
        flushChange()
        emit('blur')
        return false
      },
    },
    dispatchTransaction(tr: Transaction) {
      view.updateState(view.state.apply(tr))
      if (tr.docChanged) {
        if (changeDelay > 0) {
          cancelChange()
          changeTimer = setTimeout(notifyChange, changeDelay)
        } else {
          notifyChange()
        }
      }
      if (tr.docChanged || tr.selectionSet) emit('selectionChange')
    },
  })

  if (options.autofocus) view.focus()

  return {
    commands: createCommands(view),
    view,
    getMarkdown,
    setMarkdown(markdown) {
      cancelChange()
      view.updateState(createState(markdown))
      emit('selectionChange')
    },
    setEditable(value) {
      editable = value
      view.setProps({})
      view.dom.querySelectorAll<HTMLInputElement>('input.lme-check-input').forEach((input) => {
        input.disabled = !value
      })
    },
    isEditable: () => editable,
    focus: () => view.focus(),
    isActive: (name, attrs) => isActive(view.state, name, attrs),
    on(event, handler) {
      let set = listeners.get(event)
      if (!set) listeners.set(event, (set = new Set()))
      set.add(handler)
      return () => {
        set.delete(handler)
      }
    },
    destroy() {
      flushChange()
      view.destroy()
      listeners.clear()
    },
  }
}
```

- [ ] **Step 6: Create the public entry point**

`src/index.ts`:

```ts
/**
 * The framework-agnostic core. Mount an editor with {@link createEditor}.
 *
 * @module live-md-editor
 */
export { createEditor } from './editor'
export type { Editor, EditorEvents, EditorOptions } from './editor'
export type { ActiveName, Commands } from './commands'
export { isSafeUrl } from './url'
```

- [ ] **Step 7: Run the whole unit suite**

Run: `pnpm test && pnpm typecheck && pnpm exec eslint src test`
Expected: all tests pass (17 in `editor.test.ts`); no type or lint errors.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml src/clipboard.ts src/editor.ts src/index.ts test/editor.test.ts
git commit -m "feat: createEditor public API" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: React wrapper

**Files:**
- Create: `src/react/index.tsx`
- Test: `test/react.test.tsx`, `test/ssr.test.tsx`

**Interfaces:**
- Consumes: `createEditor`, `Editor`, `EditorOptions` from `live-md-editor` (resolved to `src/index.ts` by the alias).
- Produces: `LiveMarkdownEditor` (forwardRef; the ref receives `Editor | null`) with props `value`, `defaultValue`, `onChange`, `editable`, `className`, `style`, plus mount-only `placeholder`, `autofocus`, `ariaLabel`, `extensions`, `classNames`, `changeDelay`. Renders `<div class="lme-root ...">`. Controlled rule: a `value` equal to the last markdown the editor reported is ignored; otherwise it replaces the document if it differs from `getMarkdown()`.

- [ ] **Step 1: Install React for development**

Run: `pnpm add -D react@^19.3.0 react-dom@^19.3.0 @types/react@^19.3.0 @types/react-dom@^19.3.0 @testing-library/react@^16.3.3`

- [ ] **Step 2: Write the failing tests**

`test/react.test.tsx`:

```tsx
import { StrictMode, createRef, useState } from 'react'
import { act, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Editor } from 'live-md-editor'
import { LiveMarkdownEditor } from '../src/react'
import { type } from './helpers'

describe('LiveMarkdownEditor', () => {
  it('mounts once under StrictMode and exposes the editor', () => {
    const ref = createRef<Editor | null>()
    const { container } = render(
      <StrictMode>
        <LiveMarkdownEditor ref={ref} defaultValue="# Hi" />
      </StrictMode>,
    )
    expect(container.querySelectorAll('.lme')).toHaveLength(1)
    expect(ref.current!.getMarkdown()).toBe('# Hi')
  })
  it('controlled: typing calls onChange, external value replaces doc', () => {
    const ref = createRef<Editor | null>()
    const seen = vi.fn()
    function App() {
      const [md, setMd] = useState('a')
      return (
        <>
          <LiveMarkdownEditor
            ref={ref}
            value={md}
            onChange={(v) => {
              seen(v)
              setMd(v)
            }}
          />
          <button onClick={() => setMd('# reset')}>r</button>
        </>
      )
    }
    const { getByText, container } = render(<App />)
    const view = ref.current!.view
    act(() => {
      type(view, 'b')
    })
    expect(seen).toHaveBeenLastCalledWith('ba')
    act(() => {
      getByText('r').click()
    })
    expect(ref.current!.getMarkdown()).toBe('# reset')
    expect(container.querySelector('h1')!.textContent).toBe('reset')
  })
  it('a late echo of an old value does not wipe newer typing', () => {
    vi.useFakeTimers()
    try {
      const ref = createRef<Editor | null>()
      function App() {
        const [md, setMd] = useState('a')
        return <LiveMarkdownEditor ref={ref} value={md} onChange={setMd} changeDelay={100} />
      }
      render(<App />)
      act(() => {
        type(ref.current!.view, 'b')
      })
      // onChange('ba') fires, then the user types again before React
      // re-renders with value="ba". That stale value must be ignored.
      act(() => {
        vi.advanceTimersByTime(100)
        type(ref.current!.view, 'c')
      })
      expect(ref.current!.getMarkdown()).toBe('bca')
    } finally {
      vi.useRealTimers()
    }
  })
  it('a state setter used as ref receives the editor once mounted', () => {
    const seen: (Editor | null)[] = []
    render(<LiveMarkdownEditor ref={(editor) => void seen.push(editor)} defaultValue="x" />)
    expect(seen.at(-1)?.getMarkdown()).toBe('x')
  })

  it('editable prop toggles', () => {
    const ref = createRef<Editor | null>()
    const { rerender } = render(<LiveMarkdownEditor ref={ref} editable={false} />)
    expect(ref.current!.isEditable()).toBe(false)
    rerender(<LiveMarkdownEditor ref={ref} editable />)
    expect(ref.current!.isEditable()).toBe(true)
  })
})
```

`test/ssr.test.tsx` (runs in Node, without a DOM, like a Next.js server render):

```tsx
// @vitest-environment node
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

describe('server rendering', () => {
  it('imports and renders without a DOM', async () => {
    const core = await import('../src/index')
    const { LiveMarkdownEditor } = await import('../src/react')
    expect(typeof core.createEditor).toBe('function')
    expect(renderToString(<LiveMarkdownEditor defaultValue="# x" className="mine" />)).toBe(
      '<div class="lme-root mine"></div>',
    )
  })
})
```

- [ ] **Step 3: Run them to verify they fail**

Run: `pnpm test test/react.test.tsx test/ssr.test.tsx`
Expected: FAIL with `Failed to resolve import "../src/react"`.

- [ ] **Step 4: Implement the wrapper**

`src/react/index.tsx`:

```tsx
/**
 * React wrapper. Works in Next.js (it is a client component).
 *
 * @module live-md-editor/react
 */
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { createEditor, type Editor, type EditorOptions } from 'live-md-editor'

// useLayoutEffect does nothing on the server; useEffect keeps SSR quiet.
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

/** Props for {@link LiveMarkdownEditor}. */
export interface LiveMarkdownEditorProps extends Pick<
  EditorOptions,
  'placeholder' | 'autofocus' | 'ariaLabel' | 'extensions' | 'classNames' | 'changeDelay'
> {
  /** Controlled markdown value. Pair with `onChange`. */
  value?: string
  /** Initial markdown for uncontrolled use. Ignored when `value` is set. */
  defaultValue?: string
  /** Called with the new markdown after every edit. */
  onChange?: (markdown: string) => void
  /** Defaults to true. */
  editable?: boolean
  /** Class name of the wrapping `<div>`. */
  className?: string
  style?: CSSProperties
}

/**
 * React wrapper around {@link createEditor}. The ref exposes the core
 * {@link Editor} (null until mounted). `placeholder`, `extensions`,
 * `ariaLabel`, `classNames`, `changeDelay` and `autofocus` are read once, on mount.
 */
export const LiveMarkdownEditor = forwardRef<Editor | null, LiveMarkdownEditorProps>(
  function LiveMarkdownEditor(props, ref) {
    const { value, editable = true, className, style } = props
    const hostRef = useRef<HTMLDivElement>(null)
    const [editor, setEditor] = useState<Editor | null>(null)
    const latest = useRef(props)
    // The last markdown this editor reported. A `value` equal to it is just
    // the parent echoing our own change back (possibly late, with
    // changeDelay), so it must not replace the document.
    const reported = useRef<string | undefined>(undefined)
    useIsomorphicLayoutEffect(() => {
      latest.current = props
    })

    useImperativeHandle(ref, () => editor as Editor, [editor])

    useEffect(() => {
      const initial = latest.current
      const instance = createEditor({
        element: hostRef.current!,
        value: initial.value ?? initial.defaultValue ?? '',
        onChange: (markdown) => {
          reported.current = markdown
          latest.current.onChange?.(markdown)
        },
        changeDelay: initial.changeDelay,
        placeholder: initial.placeholder,
        editable: initial.editable ?? true,
        autofocus: initial.autofocus,
        ariaLabel: initial.ariaLabel,
        extensions: initial.extensions,
        classNames: initial.classNames,
      })
      setEditor(instance)
      return () => {
        instance.destroy()
        setEditor(null)
      }
    }, [])

    useEffect(() => {
      if (!editor || value === undefined || value === reported.current) return
      if (value !== editor.getMarkdown()) editor.setMarkdown(value)
      reported.current = value
    }, [editor, value])

    useEffect(() => {
      if (editor && editor.isEditable() !== editable) editor.setEditable(editable)
    }, [editor, editable])

    return <div ref={hostRef} className={['lme-root', className].filter(Boolean).join(' ')} style={style} />
  },
)

export type { Editor } from 'live-md-editor'
```

- [ ] **Step 5: Run them to verify they pass**

Run: `pnpm test test/react.test.tsx test/ssr.test.tsx && pnpm typecheck && pnpm exec eslint src`
Expected: 6 tests pass (the late-echo test also fails if you remove the `reported` guard: that is what it protects); no type or lint errors (the React hooks lint rules apply to this file).

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/react/index.tsx test/react.test.tsx test/ssr.test.tsx
git commit -m "feat: React wrapper" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Default theme and browser tests

**Files:**
- Create: `src/style.css`
- Create: `e2e/fixture/index.html`, `e2e/fixture/main.ts` (the page the browser tests drive; also `pnpm dev`)
- Create: `playwright.config.ts`
- Test: `e2e/editor.spec.ts`

**Interfaces:**
- Consumes: `createEditor` (Task 11).
- Produces: `src/style.css` with every rule at the specificity of one class (`.lme ...`): enough to beat CSS resets such as Tailwind's preflight, low enough that `.lme h1 { ... }` in user CSS wins. Variables `--lme-*` (listed in the docs, Task 17); dark mode via `prefers-color-scheme` and `data-theme` on an ancestor. The test page reads query parameters `value`, `radio`, `readonly`, `placeholder`, `lines`, `delay` and exposes `window.editor`.

- [ ] **Step 1: Install Playwright and its browsers**

Run:
```bash
pnpm add -D @playwright/test@1.63.0
pnpm exec playwright install --with-deps chromium firefox webkit
```
(On macOS, `--with-deps` is ignored and harmless.)

- [ ] **Step 2: Create the test page**

`e2e/fixture/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>live-md-editor test page</title>
    <style>
      body {
        margin: 0;
        padding: 16px;
        font-family: sans-serif;
      }
      #editor {
        max-width: 720px;
      }
      #markdown {
        white-space: pre-wrap;
        border-top: 1px solid #ccc;
        margin-top: 16px;
        padding-top: 8px;
      }
    </style>
  </head>
  <body>
    <div id="editor"></div>
    <pre id="markdown"></pre>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

`e2e/fixture/main.ts`:

````ts
// Test page for the Playwright suite. Query parameters:
//   value=<markdown>   initial content (default: empty)
//   radio=1            enable the radio extension
//   readonly=1         start read-only
//   placeholder=<text> placeholder text
//   lines=<n>          generate a document of about n lines (performance test)
//   delay=<ms>         changeDelay
import { createEditor, type Editor } from '../../src'
import '../../src/style.css'

declare global {
  interface Window {
    editor: Editor
  }
}

const params = new URLSearchParams(location.search)
const block =
  '## Section\n\nSome *text* with **bold** and a [link](https://x.com).\n\n' +
  '- [ ] task one\n- [x] task two\n\n```ts\nconst a = 1\n```\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n'

function generate(lines: number): string {
  let markdown = ''
  while (markdown.split('\n').length < lines) markdown += block
  return markdown
}

const output = document.getElementById('markdown')!
const lines = Number(params.get('lines') ?? 0)

window.editor = createEditor({
  element: document.getElementById('editor')!,
  value: lines ? generate(lines) : (params.get('value') ?? ''),
  placeholder: params.get('placeholder') ?? undefined,
  editable: params.get('readonly') !== '1',
  extensions: { radio: params.get('radio') === '1' },
  changeDelay: Number(params.get('delay') ?? 0),
  ariaLabel: 'Test editor',
  onChange: (markdown) => {
    output.textContent = markdown
  },
})
output.textContent = lines ? '' : window.editor.getMarkdown()
````

- [ ] **Step 3: Create `playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:4173' },
  webServer: {
    command: 'vite e2e/fixture --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: /perf/ },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, testIgnore: /perf/ },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, testIgnore: /perf/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testIgnore: /perf/ },
    { name: 'perf', use: { ...devices['Desktop Chrome'] }, testMatch: /perf\.spec\.ts/ },
  ],
})
```

- [ ] **Step 4: Write the browser tests**

`e2e/editor.spec.ts`:

````ts
import { expect, test, type Page } from '@playwright/test'

const editor = (page: Page) => page.getByRole('textbox', { name: 'Test editor' })
const markdown = (page: Page) => page.locator('#markdown')

async function open(page: Page, params: Record<string, string> = {}) {
  await page.goto(`/?${new URLSearchParams(params).toString()}`)
  await editor(page).click()
}

test('typing markdown shortcuts produces formatted blocks', async ({ page }) => {
  await open(page)
  await page.keyboard.type('## Heading')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Some **bold** text')
  await page.keyboard.press('Enter')
  await page.keyboard.type('- [ ] a task')
  await expect(editor(page).locator('h2')).toHaveText('Heading')
  await expect(editor(page).locator('strong')).toHaveText('bold')
  await expect(editor(page).locator('input[type=checkbox]')).toHaveCount(1)
  await expect(markdown(page)).toHaveText('## Heading\n\nSome **bold** text\n\n- [ ] a task')
})

test('clicking a checkbox updates the markdown, undo restores it', async ({ page }) => {
  await open(page, { value: '- [ ] one\n- [ ] two' })
  await editor(page).locator('input[type=checkbox]').nth(1).click()
  await expect(markdown(page)).toHaveText('- [ ] one\n- [x] two')
  await editor(page).click()
  await page.keyboard.press('ControlOrMeta+z')
  await expect(markdown(page)).toHaveText('- [ ] one\n- [ ] two')
})

test('radio items form an exclusive group', async ({ page }) => {
  await open(page, { value: '- (x) small\n- ( ) large', radio: '1' })
  await editor(page).locator('input[type=radio]').nth(1).click()
  await expect(markdown(page)).toHaveText('- ( ) small\n- (x) large')
})

test('keyboard shortcut makes selected text bold', async ({ page }) => {
  await open(page, { value: 'word' })
  await editor(page).locator('p').dblclick()
  await page.keyboard.press('ControlOrMeta+b')
  await expect(markdown(page)).toHaveText('**word**')
})

test('pasting markdown text inserts formatted content', async ({ page }) => {
  await open(page)
  await editor(page).evaluate((element) => {
    const data = new DataTransfer()
    data.setData('text/plain', '# Pasted\n\n- [x] done')
    element.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    )
  })
  await expect(editor(page).locator('h1')).toHaveText('Pasted')
  await expect(markdown(page)).toHaveText('# Pasted\n\n- [x] done')
})

test('read-only mode renders but does not edit', async ({ page }) => {
  await page.goto(`/?${new URLSearchParams({ value: '# Title\n\n- [ ] task', readonly: '1' })}`)
  await expect(editor(page)).toHaveAttribute('contenteditable', 'false')
  await expect(editor(page).locator('input[type=checkbox]')).toBeDisabled()
})

test('default theme styles headings, placeholder and code language', async ({ page }) => {
  await page.goto(`/?${new URLSearchParams({ placeholder: 'Write something' })}`)
  const before = await editor(page)
    .locator('p')
    .evaluate((p) => getComputedStyle(p, '::before').content)
  expect(before).toBe('"Write something"')
  await page.goto(`/?${new URLSearchParams({ value: '# Big\n\nsmall\n\n```ts\nx\n```' })}`)
  const size = (selector: string) =>
    editor(page)
      .locator(selector)
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
  expect(await size('h1')).toBeGreaterThan(await size('p'))
  const label = await editor(page)
    .locator('pre')
    .evaluate((pre) => getComputedStyle(pre, '::before').content)
  expect(label).toBe('"ts"')
})
````

- [ ] **Step 5: Run them to verify the theme test fails**

Create an empty `src/style.css` first so the test page loads: `touch src/style.css`.

Run: `pnpm exec playwright test --project=chromium`
Expected: 6 pass, 1 FAIL: `default theme styles headings, placeholder and code language` (no placeholder content, headings the same size as text).

- [ ] **Step 6: Write the theme**

`src/style.css`:

```css
/*
 * live-md-editor default theme.
 *
 * Every rule has the specificity of one class (.lme): enough to beat CSS
 * resets such as Tailwind's preflight, low enough that your own rules
 * (for example `.lme h1`) win without !important. Customise with the
 * --lme-* variables, for example:
 *
 *   .lme { --lme-accent: #7c3aed; --lme-font: 'Inter', sans-serif; }
 *
 * Dark mode follows prefers-color-scheme. Force a theme by setting
 * data-theme="light" or data-theme="dark" on any ancestor.
 */

.lme {
  --lme-font: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --lme-font-mono: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  --lme-font-size: 1rem;
  --lme-line-height: 1.65;
  --lme-text: #1f2328;
  --lme-muted: #59636e;
  --lme-placeholder: #6e7781;
  --lme-accent: #0969da;
  --lme-border: #d1d9e0;
  --lme-code-bg: #f6f8fa;
  --lme-quote-border: #d1d9e0;
  --lme-selected-cell: rgb(9 105 218 / 12%);
  --lme-radius: 6px;
  --lme-block-gap: 0.75em;
  --lme-done-decoration: none;
  color-scheme: light;
}

@media (prefers-color-scheme: dark) {
  .lme {
    --lme-text: #e6edf3;
    --lme-muted: #9198a1;
    --lme-placeholder: #7d8590;
    --lme-accent: #4493f8;
    --lme-border: #3d444d;
    --lme-code-bg: #151b23;
    --lme-quote-border: #3d444d;
    --lme-selected-cell: rgb(68 147 248 / 20%);
    color-scheme: dark;
  }
}

:where([data-theme='light']) .lme {
  --lme-text: #1f2328;
  --lme-muted: #59636e;
  --lme-placeholder: #6e7781;
  --lme-accent: #0969da;
  --lme-border: #d1d9e0;
  --lme-code-bg: #f6f8fa;
  --lme-quote-border: #d1d9e0;
  --lme-selected-cell: rgb(9 105 218 / 12%);
  color-scheme: light;
}

:where([data-theme='dark']) .lme {
  --lme-text: #e6edf3;
  --lme-muted: #9198a1;
  --lme-placeholder: #7d8590;
  --lme-accent: #4493f8;
  --lme-border: #3d444d;
  --lme-code-bg: #151b23;
  --lme-quote-border: #3d444d;
  --lme-selected-cell: rgb(68 147 248 / 20%);
  color-scheme: dark;
}

/* Editing surface. The first four rules are what ProseMirror needs to work. */
.lme {
  position: relative;
  white-space: pre-wrap;
  white-space: break-spaces;
  word-wrap: break-word;
  font-variant-ligatures: none;
  font-feature-settings: 'liga' 0;
  font-family: var(--lme-font);
  font-size: var(--lme-font-size);
  line-height: var(--lme-line-height);
  color: var(--lme-text);
  caret-color: var(--lme-accent);
  outline: none;
  min-height: 1lh;
}

.lme :where(p, ul, ol, blockquote, pre, table, hr, .lme-html) {
  margin-block: 0 var(--lme-block-gap);
}

.lme > :where(:last-child) {
  margin-block-end: 0;
}

.lme :where(h1, h2, h3, h4, h5, h6) {
  margin-block: 1.4em 0.5em;
  line-height: 1.25;
  font-weight: 650;
}

.lme > :where(h1, h2, h3, h4, h5, h6):first-child {
  margin-block-start: 0;
}

.lme :where(h1) {
  font-size: 2em;
}
.lme :where(h2) {
  font-size: 1.5em;
}
.lme :where(h3) {
  font-size: 1.25em;
}
.lme :where(h4) {
  font-size: 1em;
}
.lme :where(h5) {
  font-size: 0.875em;
}
.lme :where(h6) {
  font-size: 0.85em;
  color: var(--lme-muted);
}

.lme :where(a) {
  color: var(--lme-accent);
  text-decoration: underline;
  text-underline-offset: 0.15em;
}

.lme :where(code) {
  font-family: var(--lme-font-mono);
  font-size: 0.875em;
  background: var(--lme-code-bg);
  border-radius: calc(var(--lme-radius) / 2);
  padding: 0.15em 0.35em;
}

.lme :where(pre) {
  position: relative;
  white-space: pre-wrap;
  font-family: var(--lme-font-mono);
  font-size: 0.875em;
  line-height: 1.5;
  background: var(--lme-code-bg);
  border-radius: var(--lme-radius);
  padding: 0.9em 1em;
  overflow-x: auto;
}

.lme :where(pre code) {
  font-size: inherit;
  background: none;
  padding: 0;
}

.lme :where(pre[data-language])::before {
  content: attr(data-language);
  position: absolute;
  top: 0.4em;
  right: 0.7em;
  font-family: var(--lme-font);
  font-size: 0.75em;
  color: var(--lme-muted);
  pointer-events: none;
}

.lme :where(.lme-html, .lme-html-inline) {
  color: var(--lme-muted);
}

.lme :where(blockquote) {
  margin-inline: 0;
  padding-inline-start: 1em;
  border-inline-start: 0.25em solid var(--lme-quote-border);
  color: var(--lme-muted);
}

.lme :where(ul, ol) {
  padding-inline-start: 1.6em;
}

.lme :where(li) {
  position: relative;
}

.lme :where(li > p, .lme-check-content > p) {
  margin-block: 0;
}

.lme :where(li + li) {
  margin-block-start: 0.2em;
}

.lme :where(li.lme-check-item) {
  list-style: none;
  display: flex;
  align-items: baseline;
  gap: 0.5em;
  margin-inline-start: -1.4em;
}

.lme :where(.lme-check-input) {
  flex: none;
  width: 1em;
  height: 1em;
  margin: 0;
  accent-color: var(--lme-accent);
  cursor: pointer;
  transform: translateY(0.125em);
}

.lme :where(.lme-check-input:disabled) {
  cursor: default;
}

.lme :where(.lme-check-content) {
  flex: 1;
  min-width: 0;
}

.lme :where(li[data-check='task'][data-checked='true'] > .lme-check-content > p) {
  color: var(--lme-muted);
  text-decoration: var(--lme-done-decoration);
}

.lme :where(hr) {
  border: none;
  border-top: 1px solid var(--lme-border);
  margin-block: 1.5em;
}

.lme :where(img:not(.ProseMirror-separator)) {
  max-width: 100%;
  height: auto;
  border-radius: var(--lme-radius);
}

.lme :where(img.ProseMirror-separator) {
  display: inline;
  border: none;
  margin: 0;
}

.lme :where(.tableWrapper) {
  overflow-x: auto;
  margin-block: 0 var(--lme-block-gap);
}

.lme :where(table) {
  border-collapse: collapse;
  table-layout: fixed;
  width: 100%;
  overflow: hidden;
}

.lme :where(th, td) {
  position: relative;
  box-sizing: border-box;
  vertical-align: top;
  border: 1px solid var(--lme-border);
  padding: 0.4em 0.7em;
  text-align: start;
}

.lme :where(th) {
  font-weight: 650;
  background: var(--lme-code-bg);
}

.lme :where(.selectedCell)::after {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--lme-selected-cell);
  pointer-events: none;
}

/* Placeholder while the document is empty. */
.lme :where(.lme-empty)::before {
  content: attr(data-placeholder);
  float: left;
  height: 0;
  color: var(--lme-placeholder);
  pointer-events: none;
}

/* ProseMirror selection and cursor helpers. */
.lme :where(.ProseMirror-selectednode) {
  outline: 2px solid var(--lme-accent);
  outline-offset: 2px;
}

.lme :where(li.ProseMirror-selectednode) {
  outline: none;
}

.ProseMirror-hideselection *::selection {
  background: transparent;
}

.ProseMirror-hideselection {
  caret-color: transparent;
}

.lme :where([draggable][contenteditable='false']) {
  user-select: text;
}

.lme :where(.ProseMirror-gapcursor) {
  display: none;
  position: absolute;
  pointer-events: none;
}

.lme :where(.ProseMirror-gapcursor)::after {
  content: '';
  position: absolute;
  top: -2px;
  display: block;
  width: 20px;
  border-top: 1px solid var(--lme-text);
  animation: lme-cursor-blink 1.1s steps(2, start) infinite;
}

.lme.ProseMirror-focused :where(.ProseMirror-gapcursor) {
  display: block;
}

@keyframes lme-cursor-blink {
  to {
    visibility: hidden;
  }
}

@media (prefers-reduced-motion: reduce) {
  .lme :where(.ProseMirror-gapcursor)::after {
    animation: none;
  }
}

/* Keyboard focus ring on the editing area. */
.lme:focus-visible {
  outline: 2px solid var(--lme-accent);
  outline-offset: 4px;
  border-radius: 2px;
}
```

- [ ] **Step 7: Run all browser projects**

Run: `pnpm test:e2e`
Expected: 28 tests pass (7 each in chromium, firefox, webkit, mobile).

Known local issue: on very new macOS releases Playwright's Firefox build can fail to launch (`Failed to launch the browser process`, before any page loads). That is an environment problem, not a test failure; CI runs Firefox on Linux (Task 19). If it happens, run `pnpm exec playwright test --project=chromium --project=webkit --project=mobile` locally and note it in the task report.

- [ ] **Step 8: Look at it**

Run `pnpm dev`, open `http://localhost:4173/?value=%23%20Title%0A%0A-%20%5B%20%5D%20task%0A%0A%3E%20quote`, and check in light and dark mode (toggle the OS setting): a large heading, a checkbox aligned with its text, a quote bar. Stop the server.

- [ ] **Step 9: Commit**

```bash
git add package.json pnpm-lock.yaml src/style.css e2e/fixture e2e/editor.spec.ts playwright.config.ts
git commit -m "feat: default theme and browser tests" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Performance check

**Files:**
- Test: `e2e/perf.spec.ts`

**Interfaces:**
- Consumes: the test page (Task 13) with `?lines=10000&delay=300`.
- Produces: `pnpm test:perf`, which fails if the median keystroke on a 10,000-line document takes 16 ms (one frame) or more. Measured on the prototype: about 2 ms median, 2.7 ms p95.

- [ ] **Step 1: Write the test**

`e2e/perf.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

// Keystroke cost on a 10,000-line document. Each dispatch is one typed
// character: state update plus DOM update. With changeDelay set, markdown
// is not serialized per keystroke.
test('typing stays under one frame on a 10,000-line document', async ({ page }) => {
  await page.goto('/?lines=10000&delay=300')
  await page.waitForFunction(() => window.editor !== undefined)
  const timings = await page.evaluate(() => {
    const { view } = window.editor
    view.focus()
    const samples: number[] = []
    for (let i = 0; i < 60; i++) {
      const start = performance.now()
      view.dispatch(view.state.tr.insertText('x'))
      samples.push(performance.now() - start)
    }
    return samples.sort((a, b) => a - b)
  })
  const median = timings[Math.floor(timings.length / 2)]!
  const p95 = timings[Math.floor(timings.length * 0.95)]!
  console.log(`10k lines: median ${median.toFixed(2)} ms, p95 ${p95.toFixed(2)} ms per keystroke`)
  expect(median).toBeLessThan(16)
})
```

- [ ] **Step 2: Run it**

Run: `pnpm test:perf`
Expected: PASS, printing a line like `10k lines: median 2.00 ms, p95 2.70 ms per keystroke`.

- [ ] **Step 3: Prove it can fail**

Temporarily change `toBeLessThan(16)` to `toBeLessThan(0.01)`, run `pnpm test:perf`, confirm it FAILS, then revert the change.

- [ ] **Step 4: Commit**

```bash
git add e2e/perf.spec.ts
git commit -m "test: keystroke performance on a 10,000-line document" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Package build, size budget and export checks

**Files:**
- Create: `tsup.config.ts`, `.size-limit.json`

**Interfaces:**
- Consumes: `src/index.ts`, `src/react/index.tsx`, `src/style.css`, `shims/`.
- Produces: `dist/index.{js,cjs,d.ts,d.cts}`, `dist/react.{js,cjs,d.ts,d.cts}` (starting with `'use client';`, importing the core from `live-md-editor`, never bundling it), `dist/style.css`. `pnpm size`, `pnpm check:package`, `pnpm check`.

- [ ] **Step 1: Install build and check tools**

Run: `pnpm add -D tsup@^8.5.1 size-limit@^14.1.0 @size-limit/preset-small-lib@^14.1.0 publint@^0.3.24 @arethetypeswrong/cli@^0.18.5`

- [ ] **Step 2: Create `tsup.config.ts`**

```ts
import { defineConfig, type Options } from 'tsup'

const shared: Options = {
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  target: 'es2020',
}

export default defineConfig([
  {
    ...shared,
    entry: { index: 'src/index.ts' },
    clean: true,
    treeshake: true,
    // markdown-it and prosemirror-markdown are devDependencies, so tsup bundles
    // them. These aliases swap two of markdown-it's own dependencies for small
    // shims (see shims/), which removes about 30 KB gzipped.
    esbuildOptions(options) {
      options.alias = {
        entities: './shims/entities.ts',
        'linkify-it': './shims/linkify-it.ts',
      }
    },
  },
  {
    ...shared,
    entry: { react: 'src/react/index.tsx' },
    // The wrapper must use the same core instance as the app, never a copy.
    external: ['live-md-editor', 'react', 'react-dom'],
    // Next.js needs this directive to treat the component as client-only.
    // (Rollup tree shaking would strip it, so treeshake stays off here.)
    banner: { js: "'use client';" },
  },
])
```

- [ ] **Step 3: Create `.size-limit.json`**

```json
[
  {
    "name": "core: createEditor",
    "path": "dist/index.js",
    "import": "{ createEditor }",
    "limit": "110 kB",
    "gzip": true
  },
  {
    "name": "react: LiveMarkdownEditor (with core)",
    "path": "dist/react.js",
    "import": "{ LiveMarkdownEditor }",
    "ignore": ["react", "react-dom"],
    "limit": "112 kB",
    "gzip": true
  },
  {
    "name": "style.css",
    "path": "dist/style.css",
    "rolldown": false,
    "limit": "3 kB",
    "gzip": true
  }
]
```

- [ ] **Step 4: Build and inspect**

Run:
```bash
pnpm build
ls dist
head -c 120 dist/react.js; echo
grep -c "decode-data-html" dist/index.js || true
```
Expected: `dist` holds `index.js index.cjs index.d.ts index.d.cts react.js react.cjs react.d.ts react.d.cts style.css` (+ source maps); `dist/react.js` starts with `'use client';` then `import ... from 'live-md-editor'`; the grep prints `0` (the entity table is gone).

- [ ] **Step 5: Check size and exports**

Run: `pnpm size && pnpm check:package`
Expected: core about 106.5 kB gzipped (limit 110 kB), react about 106.8 kB (limit 112 kB), style.css about 2.2 kB (limit 3 kB); publint and attw report no problems.

- [ ] **Step 6: Run the full check**

Run: `pnpm check`
Expected: every step passes.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml tsup.config.ts .size-limit.json
git commit -m "build: package build with size budget and export checks" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Examples

**Files:**
- Create: `examples/nextjs/package.json`, `examples/nextjs/tsconfig.json`, `examples/nextjs/app/layout.tsx`, `examples/nextjs/app/globals.css`, `examples/nextjs/app/page.tsx`, `examples/nextjs/app/note-editor.tsx`
- Create: `examples/vanilla/package.json`, `examples/vanilla/index.html`, `examples/vanilla/main.js`

**Interfaces:**
- Consumes: the built package through `"live-md-editor": "workspace:*"` (run `pnpm build` first).
- Produces: two runnable apps. The Next.js one shows the recommended React pattern: a state setter as `ref` so a toolbar re-renders when the editor mounts.

- [ ] **Step 1: Create the Next.js example**

`examples/nextjs/package.json`:

```json
{
  "name": "example-nextjs",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "live-md-editor": "workspace:*",
    "next": "^16.3.8",
    "react": "^19.3.0",
    "react-dom": "^19.3.0"
  },
  "devDependencies": {
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0",
    "typescript": "~5.9.3"
  }
}
```

`examples/nextjs/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts", ".next/dev/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`examples/nextjs/app/layout.tsx`:

```tsx
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import 'live-md-editor/style.css'
import './globals.css'

export const metadata: Metadata = {
  title: 'live-md-editor in Next.js',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
```

`examples/nextjs/app/globals.css`:

```css
body {
  margin: 0;
  font-family: system-ui, sans-serif;
}

main {
  max-width: 760px;
  margin: 0 auto;
  padding: 32px 16px;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 16px;
}

.toolbar button {
  font: inherit;
  padding: 4px 10px;
  border: 1px solid #d1d9e0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.toolbar button[aria-pressed='true'] {
  background: #0969da;
  border-color: #0969da;
  color: white;
}

.editor {
  min-height: 240px;
  border: 1px solid #d1d9e0;
  border-radius: 8px;
  padding: 16px;
}

pre {
  white-space: pre-wrap;
  background: #f6f8fa;
  border-radius: 8px;
  padding: 16px;
}
```

`examples/nextjs/app/page.tsx`:

```tsx
import { NoteEditor } from './note-editor'

const initial = `# Meeting notes

Type **markdown** here: it turns into formatting as you go.

- [x] Try the toolbar
- [ ] Press Cmd/Ctrl + B on a selection
`

// A server component: it could just as well read the note from a database.
export default function Page() {
  return (
    <main>
      <h1>live-md-editor + Next.js</h1>
      <NoteEditor initial={initial} />
    </main>
  )
}
```

`examples/nextjs/app/note-editor.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import type { ActiveName, Editor } from 'live-md-editor'
import { LiveMarkdownEditor } from 'live-md-editor/react'

const buttons: { label: string; active: ActiveName; level?: number; run: (editor: Editor) => boolean }[] = [
  { label: 'Bold', active: 'bold', run: (editor) => editor.commands.toggleBold() },
  { label: 'Italic', active: 'italic', run: (editor) => editor.commands.toggleItalic() },
  { label: 'H2', active: 'heading', level: 2, run: (editor) => editor.commands.setHeading(2) },
  { label: 'List', active: 'bulletList', run: (editor) => editor.commands.toggleBulletList() },
  { label: 'Tasks', active: 'taskList', run: (editor) => editor.commands.toggleTaskList() },
  { label: 'Quote', active: 'blockquote', run: (editor) => editor.commands.toggleBlockquote() },
]

export function NoteEditor({ initial }: { initial: string }) {
  const [markdown, setMarkdown] = useState(initial)
  // Passing a state setter as the ref re-renders this component once the
  // editor has mounted (a useRef would not).
  const [editor, setEditor] = useState<Editor | null>(null)
  // Re-render the toolbar when the selection moves, so pressed states stay right.
  const [, setTick] = useState(0)

  useEffect(() => editor?.on('selectionChange', () => setTick((tick) => tick + 1)), [editor])

  return (
    <>
      <div className="toolbar" role="toolbar" aria-label="Formatting">
        {buttons.map((button) => (
          <button
            key={button.label}
            type="button"
            aria-pressed={editor?.isActive(button.active, { level: button.level }) ?? false}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => editor && button.run(editor)}
          >
            {button.label}
          </button>
        ))}
      </div>
      <LiveMarkdownEditor
        ref={setEditor}
        className="editor"
        value={markdown}
        onChange={setMarkdown}
        placeholder="Write something..."
        ariaLabel="Note"
      />
      <h2>Markdown</h2>
      <pre>{markdown}</pre>
    </>
  )
}
```

- [ ] **Step 2: Create the vanilla example**

`examples/vanilla/package.json`:

```json
{
  "name": "example-vanilla",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "live-md-editor": "workspace:*"
  },
  "devDependencies": {
    "vite": "^5.4.14"
  }
}
```

`examples/vanilla/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>live-md-editor without a framework</title>
    <style>
      body {
        margin: 0;
        font-family: system-ui, sans-serif;
      }
      main {
        max-width: 760px;
        margin: 0 auto;
        padding: 32px 16px;
      }
      #editor {
        min-height: 240px;
        border: 1px solid #d1d9e0;
        border-radius: 8px;
        padding: 16px;
      }
      #output {
        white-space: pre-wrap;
        background: #f6f8fa;
        border-radius: 8px;
        padding: 16px;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>live-md-editor, no framework</h1>
      <div id="editor"></div>
      <h2>Markdown (saved in this browser)</h2>
      <pre id="output"></pre>
    </main>
    <script type="module" src="./main.js"></script>
  </body>
</html>
```

`examples/vanilla/main.js`:

```js
import { createEditor } from 'live-md-editor'
import 'live-md-editor/style.css'

const output = document.getElementById('output')
const saved = localStorage.getItem('live-md-editor-note')

const editor = createEditor({
  element: document.getElementById('editor'),
  value: saved ?? '# Hello\n\nThis note is saved in your browser as you type.\n\n- [ ] Try a checkbox',
  placeholder: 'Write something...',
  ariaLabel: 'Note',
  changeDelay: 300,
  onChange: (markdown) => {
    localStorage.setItem('live-md-editor-note', markdown)
    output.textContent = markdown
  },
})

output.textContent = editor.getMarkdown()
```

- [ ] **Step 3: Install and build both**

Run:
```bash
pnpm install
pnpm build
pnpm --filter "./examples/*" build
```
Expected: the vanilla build prints its bundle (about 110 kB gzipped JS); the Next.js build ends with the route table showing `/` as static.

- [ ] **Step 4: Try the Next.js example in a browser**

Run: `pnpm --filter example-nextjs start` and open `http://localhost:3000`. Select a word, click **Bold**: the word turns bold and the button shows as pressed. Click at the end of the last task, press Enter, type: a new unchecked task appears and the markdown below updates. Stop the server.

- [ ] **Step 5: Lint**

Run: `pnpm lint`
Expected: no problems (examples are linted too, including the React hooks rules).

- [ ] **Step 6: Commit**

```bash
git add examples pnpm-lock.yaml
git commit -m "docs: add Next.js and vanilla examples" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Documentation site

**Files:**
- Create: `typedoc.json`
- Create: `docs/.vitepress/config.ts`, `docs/.vitepress/theme/index.ts`, `docs/.vitepress/theme/custom.css`, `docs/.vitepress/theme/LiveExample.vue`, `docs/.vitepress/theme/Playground.vue`
- Create: `docs/index.md`, `docs/playground.md`, `docs/guide/getting-started.md`, `docs/guide/syntax.md`, `docs/guide/nextjs.md`, `docs/guide/react.md`, `docs/guide/vue.md`, `docs/guide/svelte.md`, `docs/guide/vanilla.md`, `docs/guide/toolbar.md`, `docs/guide/theming.md`, `docs/guide/radio.md`, `docs/guide/performance.md`

**Interfaces:**
- Consumes: TSDoc comments in `src/index.ts`, `src/editor.ts`, `src/commands/index.ts`, `src/react/index.tsx` (the `@module` tags name the API pages).
- Produces: `pnpm docs:dev`, `pnpm docs:build` (output `docs/.vitepress/dist`, base path `/live-md-editor/`). `docs/api` is generated and git-ignored. `docs/superpowers` is excluded from the site.

- [ ] **Step 1: Install the docs tooling**

Run: `pnpm add -D vitepress@^1.6.4 typedoc@^0.28.20 typedoc-plugin-markdown@^4.13.1 typedoc-vitepress-theme@^1.1.4`

- [ ] **Step 2: Create `typedoc.json`**

```json
{
  "$schema": "https://typedoc.org/schema.json",
  "entryPoints": ["src/index.ts", "src/react/index.tsx"],
  "out": "docs/api",
  "plugin": ["typedoc-plugin-markdown", "typedoc-vitepress-theme"],
  "docsRoot": "docs",
  "readme": "none",
  "excludePrivate": true,
  "excludeInternal": true,
  "hideGenerator": true
}
```

- [ ] **Step 3: Create the site config and theme**

`docs/.vitepress/config.ts`:

```ts
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitepress'
import typedocSidebar from '../api/typedoc-sidebar.json'

const path = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  title: 'live-md-editor',
  description: 'A lightweight WYSIWYG markdown editor for any framework.',
  base: '/live-md-editor/',
  srcExclude: ['superpowers/**'],
  cleanUrls: true,
  lastUpdated: true,
  vite: {
    resolve: {
      alias: {
        'live-md-editor/style.css': path('../../src/style.css'),
        'live-md-editor': path('../../src/index.ts'),
        entities: path('../../shims/entities.ts'),
        'linkify-it': path('../../shims/linkify-it.ts'),
      },
    },
  },
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'API', link: '/api/' },
      { text: 'Playground', link: '/playground' },
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Introduction',
          items: [
            { text: 'Getting started', link: '/guide/getting-started' },
            { text: 'Supported syntax', link: '/guide/syntax' },
          ],
        },
        {
          text: 'Frameworks',
          items: [
            { text: 'Next.js', link: '/guide/nextjs' },
            { text: 'React', link: '/guide/react' },
            { text: 'Vue', link: '/guide/vue' },
            { text: 'Svelte', link: '/guide/svelte' },
            { text: 'Plain HTML', link: '/guide/vanilla' },
          ],
        },
        {
          text: 'Customising',
          items: [
            { text: 'Build a toolbar', link: '/guide/toolbar' },
            { text: 'Theming', link: '/guide/theming' },
            { text: 'Radio lists', link: '/guide/radio' },
            { text: 'Large documents', link: '/guide/performance' },
          ],
        },
      ],
      '/api/': [{ text: 'API reference', items: typedocSidebar }],
    },
    socialLinks: [{ icon: 'github', link: 'https://github.com/salvatorecastellitti/live-md-editor' }],
    search: { provider: 'local' },
    editLink: {
      pattern: 'https://github.com/salvatorecastellitti/live-md-editor/edit/main/docs/:path',
    },
    footer: { message: 'Released under the MIT License.' },
  },
})
```

`docs/.vitepress/theme/index.ts`:

```ts
import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import 'live-md-editor/style.css'
import './custom.css'
import LiveExample from './LiveExample.vue'
import Playground from './Playground.vue'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('LiveExample', LiveExample)
    app.component('Playground', Playground)
  },
} satisfies Theme
```

`docs/.vitepress/theme/custom.css`:

```css
/* Follow the VitePress color mode inside the demos. */
.dark .lme {
  --lme-text: #e6edf3;
  --lme-muted: #9198a1;
  --lme-placeholder: #7d8590;
  --lme-accent: #4493f8;
  --lme-border: #3d444d;
  --lme-code-bg: #151b23;
  --lme-quote-border: #3d444d;
  color-scheme: dark;
}

.lme-demo {
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  padding: 16px;
  margin: 16px 0;
}

/* VitePress styles every .vp-doc element; keep them away from the editor. */
.vp-doc .lme :where(h1, h2, h3, h4, h5, h6) {
  margin: 1.4em 0 0.5em;
  border-top: none;
  padding-top: 0;
  letter-spacing: normal;
}

.vp-doc .lme > :where(:first-child) {
  margin-top: 0;
}

.vp-doc .lme :where(p) {
  margin: 0 0 0.75em;
  line-height: inherit;
}

.vp-doc .lme :where(ul, ol) {
  margin: 0 0 0.75em;
}

.vp-doc .lme :where(li + li) {
  margin-top: 0.2em;
}
```

`docs/.vitepress/theme/LiveExample.vue` (live examples in the guide; `md` is one line with `\n` escapes, because VitePress would treat multi-line attribute text as markdown):

```vue
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { createEditor, type Editor } from 'live-md-editor'

// `md` is written on one line in the docs, with \n for line breaks.
const props = defineProps<{ md: string; radio?: boolean }>()
const source = props.md.replace(/\\n/g, '\n')
const host = ref<HTMLElement>()
const output = ref(source)
let editor: Editor | undefined

onMounted(() => {
  editor = createEditor({
    element: host.value!,
    value: source,
    extensions: { radio: props.radio },
    ariaLabel: 'Example editor',
    onChange: (markdown) => {
      output.value = markdown
    },
  })
})
onBeforeUnmount(() => editor?.destroy())
</script>

<template>
  <div class="lme-demo">
    <div ref="host" />
    <details>
      <summary>Markdown</summary>
      <pre><code>{{ output }}</code></pre>
    </details>
  </div>
</template>
```

`docs/.vitepress/theme/Playground.vue`:

```vue
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { createEditor, type Editor } from 'live-md-editor'

const initial = `# Welcome to live-md-editor

Type markdown and it turns into formatting as you go: try \`## \` at the start of a line,
or wrap a word in **double stars**.

- [x] Checkboxes are real and clickable
- [ ] Press Tab to indent, Shift+Tab to outdent

> Paste markdown from anywhere and it arrives formatted.

| Shortcut | Action |
| --- | --- |
| Ctrl/Cmd + B | Bold |
| Ctrl/Cmd + I | Italic |
`

const host = ref<HTMLElement>()
const markdown = ref(initial)
let editor: Editor | undefined

onMounted(() => {
  editor = createEditor({
    element: host.value!,
    value: initial,
    extensions: { radio: true },
    placeholder: 'Start writing...',
    ariaLabel: 'Playground editor',
    onChange: (value) => {
      markdown.value = value
    },
  })
})
onBeforeUnmount(() => editor?.destroy())

function load(event: Event) {
  const value = (event.target as HTMLTextAreaElement).value
  editor?.setMarkdown(value)
  markdown.value = value
}
</script>

<template>
  <div class="playground">
    <section class="lme-demo">
      <h2>Editor</h2>
      <div ref="host" />
    </section>
    <section class="lme-demo">
      <h2>Markdown</h2>
      <textarea :value="markdown" spellcheck="false" aria-label="Markdown source" @change="load" />
      <p class="hint">Edit the markdown here and click outside to load it into the editor.</p>
    </section>
  </div>
</template>

<style scoped>
.playground {
  display: grid;
  gap: 16px;
}
@media (min-width: 960px) {
  .playground {
    grid-template-columns: 1fr 1fr;
  }
}
h2 {
  margin: 0 0 12px;
  font-size: 14px;
  border: none;
  padding: 0;
}
textarea {
  width: 100%;
  min-height: 420px;
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  background: transparent;
  color: inherit;
  border: none;
  resize: vertical;
}
.hint {
  font-size: 12px;
  color: var(--vp-c-text-2);
}
</style>
```

- [ ] **Step 4: Write the pages**

`docs/index.md`:

```markdown
---
layout: home

hero:
  name: live-md-editor
  text: Edit markdown without seeing markdown
  tagline: A lightweight WYSIWYG editor that reads and writes plain markdown. Works with Next.js, React, Vue, Svelte or no framework at all.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Try the playground
      link: /playground

features:
  - title: Markdown in, markdown out
    details: The value is a plain markdown string. Save it anywhere. Saving never adds noise, so diffs stay clean.
  - title: Formatted while you type
    details: Type ## for a heading or - [ ] for a checkbox and the syntax disappears into formatting.
  - title: Every GFM feature
    details: Headings, emphasis, links, images, nested lists, task lists, quotes, code blocks, rules and tables.
  - title: Headless
    details: No toolbar to fight. A small command API lets you build your own in any framework.
  - title: Safe by default
    details: Raw HTML is shown as text, never run. Links are limited to http, https, mailto and relative URLs.
  - title: Built on ProseMirror
    details: The engine behind many production editors, with solid mobile keyboard and IME support.
---
```

`docs/playground.md`:

```markdown
---
layout: page
title: Playground
---

<Playground />
```

`docs/guide/getting-started.md`:

````markdown
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
| `extensions.radio` | `boolean`            | `false`  | Enable [radio lists](./radio)                                                |
| `classNames.root`  | `string`             |          | Extra class on the editing area                                              |

The full list of methods and events is in the [API reference](/api/).

## Saving

`onChange` gives you markdown after each edit, and `editor.getMarkdown()` returns it at any time.
Loading a new document with `editor.setMarkdown(md)` resets undo history and does not call
`onChange`.

Front matter (a `---` block at the top of the file) is kept exactly as it was and hidden while
editing.
````

`docs/guide/syntax.md`:

````markdown
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
````

`docs/guide/nextjs.md`:

````markdown
# Next.js

The React wrapper is a client component, so it works in the App Router and the Pages Router.

```bash
npm install live-md-editor
```

```tsx
// app/notes/note-editor.tsx
'use client'

import { useState } from 'react'
import { LiveMarkdownEditor } from 'live-md-editor/react'
import 'live-md-editor/style.css'

export function NoteEditor({ initial }: { initial: string }) {
  const [markdown, setMarkdown] = useState(initial)
  return <LiveMarkdownEditor value={markdown} onChange={setMarkdown} placeholder="Write..." />
}
```

Use it from a server component and pass the stored markdown in:

```tsx
// app/notes/[id]/page.tsx
import { NoteEditor } from '../note-editor'
import { getNote } from '@/lib/notes'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const note = await getNote(id)
  return <NoteEditor initial={note.markdown} />
}
```

## Server rendering

On the server the component renders an empty `<div class="lme-root">`. The editor mounts in the
browser. Importing the package on the server is safe: it does not touch `window` or `document`
until it mounts.

To avoid a layout jump while it mounts, give the wrapper a minimum height:

```tsx
<LiveMarkdownEditor style={{ minHeight: 200 }} value={markdown} onChange={setMarkdown} />
```

## Saving to the server

Pair `changeDelay` with a server action so you save once the user pauses, not on every key:

```tsx
'use client'

import { LiveMarkdownEditor } from 'live-md-editor/react'
import { saveNote } from './actions'

export function AutosaveEditor({ id, initial }: { id: string; initial: string }) {
  return (
    <LiveMarkdownEditor
      defaultValue={initial}
      changeDelay={800}
      onChange={(markdown) => saveNote(id, markdown)}
    />
  )
}
```

Pending changes are also flushed when the editor loses focus and when it unmounts.

A complete, runnable app is in
[`examples/nextjs`](https://github.com/salvatorecastellitti/live-md-editor/tree/main/examples/nextjs).
````

`docs/guide/react.md`:

````markdown
# React

```tsx
import { useRef, useState } from 'react'
import { LiveMarkdownEditor } from 'live-md-editor/react'
import type { Editor } from 'live-md-editor'
import 'live-md-editor/style.css'

export function App() {
  const [markdown, setMarkdown] = useState('# Hello')
  const editor = useRef<Editor | null>(null)

  return (
    <>
      <button onClick={() => editor.current?.commands.toggleBold()}>Bold</button>
      <LiveMarkdownEditor ref={editor} value={markdown} onChange={setMarkdown} />
    </>
  )
}
```

## Controlled and uncontrolled

- **Controlled:** pass `value` and `onChange`. Changing `value` from outside replaces the
  document. Values that the editor itself just reported are recognised and ignored, so typing is
  never interrupted.
- **Uncontrolled:** pass `defaultValue` and read the markdown in `onChange` or with
  `ref.current.getMarkdown()`.

## Props

| Prop                                                                               | Description                       |
| ---------------------------------------------------------------------------------- | --------------------------------- |
| `value` / `defaultValue`                                                           | Controlled or initial markdown    |
| `onChange`                                                                         | Called with the new markdown      |
| `editable`                                                                         | Can change at any time            |
| `className`, `style`                                                               | Applied to the wrapping `<div>`   |
| `placeholder`, `ariaLabel`, `extensions`, `classNames`, `changeDelay`, `autofocus` | Read once, when the editor mounts |

The `ref` gives you the core [`Editor`](/api/live-md-editor/interfaces/Editor) (or `null` before
it mounts), with `commands`, `isActive`, `getMarkdown`, `setMarkdown` and `on`.

## Reacting when the editor is ready

A `useRef` is fine for event handlers, but it does not re-render your component when the editor
mounts. To render something from the editor (for example a toolbar showing which formats are
active), pass a state setter as the ref:

```tsx
const [editor, setEditor] = useState<Editor | null>(null)
const [, refresh] = useState(0)

useEffect(() => editor?.on('selectionChange', () => refresh((n) => n + 1)), [editor])

return (
  <>
    <button aria-pressed={editor?.isActive('bold') ?? false} onClick={() => editor?.commands.toggleBold()}>
      Bold
    </button>
    <LiveMarkdownEditor ref={setEditor} defaultValue="Hello" />
  </>
)
```
````

`docs/guide/vue.md`:

````markdown
# Vue

```vue
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { createEditor, type Editor } from 'live-md-editor'
import 'live-md-editor/style.css'

const markdown = defineModel<string>({ default: '' })
const host = ref<HTMLElement>()
let editor: Editor | undefined

onMounted(() => {
  editor = createEditor({
    element: host.value!,
    value: markdown.value,
    onChange: (value) => {
      markdown.value = value
    },
  })
})

onBeforeUnmount(() => editor?.destroy())
</script>

<template>
  <div ref="host" />
</template>
```

Use it with `v-model`:

```vue
<MarkdownEditor v-model="note" />
```

In Nuxt, wrap it in `<ClientOnly>` so it only mounts in the browser.
````

`docs/guide/svelte.md`:

````markdown
# Svelte

```svelte
<script lang="ts">
  import { onMount } from 'svelte'
  import { createEditor } from 'live-md-editor'
  import 'live-md-editor/style.css'

  let { value = $bindable('') } = $props()
  let host: HTMLDivElement

  onMount(() => {
    const editor = createEditor({
      element: host,
      value,
      onChange: (markdown) => (value = markdown),
    })
    return () => editor.destroy()
  })
</script>

<div bind:this={host}></div>
```

Use it with `bind:value`:

```svelte
<MarkdownEditor bind:value={note} />
```

`onMount` never runs during server rendering, so this works in SvelteKit as is.
````

`docs/guide/vanilla.md`:

````markdown
# Plain HTML

No build step needed: load the module and the stylesheet from a CDN.

```html
<link rel="stylesheet" href="https://unpkg.com/live-md-editor/dist/style.css" />

<div id="editor"></div>

<script type="module">
  import { createEditor } from 'https://esm.sh/live-md-editor'

  const editor = createEditor({
    element: document.getElementById('editor'),
    value: '# Hello',
    onChange: (markdown) => localStorage.setItem('note', markdown),
  })
</script>
```

Pin a version in production, for example `https://esm.sh/live-md-editor@1`.

With a bundler (Vite, webpack, esbuild), install the package and import it as usual:

```ts
import { createEditor } from 'live-md-editor'
import 'live-md-editor/style.css'
```

To remove the editor, call `editor.destroy()`. It removes only what it added to the element.
````

`docs/guide/toolbar.md`:

````markdown
# Build a toolbar

The editor ships without a toolbar so it fits any design. Every button you need is one command
away, and `isActive` tells you which buttons to highlight.

```ts
const buttons = [
  { label: 'Bold', run: () => editor.commands.toggleBold(), active: () => editor.isActive('bold') },
  {
    label: 'H2',
    run: () => editor.commands.setHeading(2),
    active: () => editor.isActive('heading', { level: 2 }),
  },
  { label: 'Tasks', run: () => editor.commands.toggleTaskList(), active: () => editor.isActive('taskList') },
]

editor.on('selectionChange', () => {
  for (const button of buttons) button.element.setAttribute('aria-pressed', String(button.active()))
})
```

Commands return `true` when they applied, so you can also use them to disable buttons that
would do nothing. Commands focus the editor again after they run, so clicking a toolbar button
does not lose the cursor.

## Commands

| Command                                                                                                          | Notes                                                                   |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `toggleBold()`, `toggleItalic()`, `toggleStrike()`, `toggleCode()`                                               | Inline formatting                                                       |
| `setLink(href)`, `unsetLink()`                                                                                   | Refuses unsafe URLs; with no selection, edits the link under the cursor |
| `setParagraph()`, `setHeading(level)`                                                                            | Level 1 to 6                                                            |
| `toggleBulletList()`, `toggleOrderedList()`, `toggleTaskList()`, `toggleRadioList()`                             | Converts between list kinds                                             |
| `toggleBlockquote()`, `setCodeBlock(language?)`                                                                  |                                                                         |
| `insertHorizontalRule()`, `insertImage(src, alt?)`                                                               |                                                                         |
| `insertTable(rows, cols)`, `addRowAfter()`, `addColumnAfter()`, `deleteRow()`, `deleteColumn()`, `deleteTable()` | The first row is the header                                             |
| `undo()`, `redo()`                                                                                               |                                                                         |

## `isActive` names

`bold`, `italic`, `strike`, `code`, `link`, `paragraph`, `heading` (optionally with
`{ level }`), `bulletList`, `orderedList`, `taskList`, `radioList`, `blockquote`, `codeBlock`,
`table`.

## Links with Mod+K

The editor has no built-in link dialog. Listen for the shortcut and show your own:

```ts
editor.on('linkShortcut', async () => {
  const href = await myLinkDialog()
  if (href) editor.commands.setLink(href)
})
```
````

`docs/guide/theming.md`:

````markdown
# Theming

Import the default theme once:

```ts
import 'live-md-editor/style.css'
```

Every rule in it has the specificity of a single class (`.lme`). That is enough to beat CSS
resets such as Tailwind's preflight, and low enough that your own rules win without `!important`:
use a selector like `.lme h1`, or load your CSS after the theme. Most changes only need
variables:

```css
.lme {
  --lme-font: 'Inter', sans-serif;
  --lme-accent: #7c3aed;
  --lme-code-bg: #f4f4f5;
}
```

## Variables

| Variable                | Default (light)  | Used for                                       |
| ----------------------- | ---------------- | ---------------------------------------------- |
| `--lme-font`            | system UI font   | Text                                           |
| `--lme-font-mono`       | system monospace | Code                                           |
| `--lme-font-size`       | `1rem`           | Base size; headings scale from it              |
| `--lme-line-height`     | `1.65`           | Text                                           |
| `--lme-text`            | `#1f2328`        | Text color                                     |
| `--lme-muted`           | `#59636e`        | Quotes, finished tasks, labels                 |
| `--lme-placeholder`     | `#6e7781`        | Placeholder                                    |
| `--lme-accent`          | `#0969da`        | Links, checkboxes, caret, focus ring           |
| `--lme-border`          | `#d1d9e0`        | Tables, rules                                  |
| `--lme-code-bg`         | `#f6f8fa`        | Code and table headers                         |
| `--lme-quote-border`    | `#d1d9e0`        | Quote bar                                      |
| `--lme-selected-cell`   | accent at 12%    | Selected table cells                           |
| `--lme-radius`          | `6px`            | Code blocks, images                            |
| `--lme-block-gap`       | `0.75em`         | Space between blocks                           |
| `--lme-done-decoration` | `none`           | Set to `line-through` to strike finished tasks |

## Dark mode

The theme follows the system setting (`prefers-color-scheme`). To force a mode, set
`data-theme="light"` or `data-theme="dark"` on any ancestor, for example `<html>`.

## Class names

| Class                           | Element                                           |
| ------------------------------- | ------------------------------------------------- |
| `.lme`                          | The editing area                                  |
| `.lme-root`                     | The React wrapper `<div>`                         |
| `.lme-check-item`               | A task or radio list item                         |
| `.lme-check-input`              | Its checkbox or radio                             |
| `.lme-check-content`            | Its text                                          |
| `.lme-empty`                    | The empty first paragraph showing the placeholder |
| `.lme-html`, `.lme-html-inline` | Raw HTML shown as text                            |

Code blocks with a language have `data-language` on the `<pre>`, which the theme shows in the
corner.

## Without the default theme

Skip the import and style the classes above yourself. Keep these rules, which the editor needs
to handle whitespace correctly:

```css
.lme {
  white-space: pre-wrap;
  white-space: break-spaces;
  word-wrap: break-word;
  font-variant-ligatures: none;
}
```
````

`docs/guide/radio.md`:

````markdown
# Radio lists

Markdown has checkboxes (`- [ ]`) but no radio buttons. live-md-editor adds them as an opt-in
extension:

```ts
createEditor({ element, extensions: { radio: true } })
```

```md
- ( ) Small
- (x) Medium
- ( ) Large
```

<LiveExample radio md="- ( ) Small\n- (x) Medium\n- ( ) Large" />

Consecutive radio items form one group: selecting one clears the others. Anything else between
them (a normal item, a checkbox, a paragraph) starts a new group.

Type `( ) ` or `(x) ` at the start of a line to create one, or use
`editor.commands.toggleRadioList()`.

## Compatibility

This is not standard markdown. Other tools show `( ) Small` as plain text, which still reads
well. With the extension off, live-md-editor does the same and keeps the text unchanged.
````

`docs/guide/performance.md`:

````markdown
# Large documents

Rendering and typing stay fast on large documents: in our browser test, each keystroke in a
10,000-line document takes about 2 ms.

The expensive part is turning the document back into markdown for `onChange`. On a
10,000-line document that takes around 25 ms on a fast laptop, and several times that on a phone.
Doing it on every keystroke makes typing feel sticky.

Set `changeDelay` to wait until the user pauses:

```ts
createEditor({
  element,
  value,
  changeDelay: 300,
  onChange: save,
})
```

- `onChange` runs once, 300 ms after the last edit.
- Pending changes are flushed when the editor loses focus and when it is destroyed, so nothing is
  lost.
- `editor.getMarkdown()` is always up to date, whatever the delay.

For short documents, keep the default (`0`): `onChange` then runs after every edit.
````

- [ ] **Step 5: Build the site**

Run: `pnpm docs:build`
Expected: TypeDoc writes `docs/api`, then VitePress ends with `build complete`.

- [ ] **Step 6: Look at it**

Run `pnpm docs:preview` and open `http://localhost:4173/live-md-editor/`. Check: the home page; the playground (editor on the left, markdown on the right, both update); `guide/syntax` (every example is editable, headings are large, checkboxes sit inside the demo box); dark mode via the toggle; a 390 px wide window. Stop the server.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml typedoc.json docs/.vitepress/config.ts docs/.vitepress/theme docs/index.md docs/playground.md docs/guide
git commit -m "docs: documentation site with guides, API reference and playground" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 18: README, demo GIF and community files

**Files:**
- Create: `scripts/record-demo.ts`, `docs/public/demo.gif` (generated)
- Create: `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`
- Create: `.github/ISSUE_TEMPLATE/bug_report.yml`, `.github/ISSUE_TEMPLATE/feature_request.yml`, `.github/ISSUE_TEMPLATE/config.yml`, `.github/PULL_REQUEST_TEMPLATE.md`

**Interfaces:**
- Consumes: the test page (Task 13), final sizes from `pnpm size` (Task 15).
- Produces: the repository front page and contributor guidance.

- [ ] **Step 1: Install tsx and create the demo recorder**

Run: `pnpm add -D tsx@^4`

`scripts/record-demo.ts`:

```ts
// Records docs/public/demo.gif: someone typing markdown into the editor.
// Run with the test page server up: pnpm dev (in another terminal), then
// pnpm demo. Needs ffmpeg on PATH.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from '@playwright/test'

const videoDir = mkdtempSync(join(tmpdir(), 'lme-demo-'))
const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 720, height: 300 },
  recordVideo: { dir: videoDir, size: { width: 720, height: 300 } },
})
const page = await context.newPage()
await page.goto('http://localhost:4173/?placeholder=Start%20typing%20markdown...')
await page.addStyleTag({ content: '#markdown { display: none } body { padding: 32px }' })
await page.getByRole('textbox').click()
await page.waitForTimeout(600)

const typeSlowly = (text: string) => page.keyboard.type(text, { delay: 55 })
await typeSlowly('# Shopping list')
await page.keyboard.press('Enter')
await typeSlowly('Things to buy **today**:')
await page.keyboard.press('Enter')
await typeSlowly('[ ] Milk')
await page.keyboard.press('Enter')
await typeSlowly('Bread')
await page.keyboard.press('Enter')
await typeSlowly('Coffee')
await page.waitForTimeout(400)
await page.getByRole('checkbox').first().click()
await page.waitForTimeout(400)
await page.getByRole('checkbox').nth(2).click()
await page.waitForTimeout(1500)

await context.close()
await browser.close()

const [video] = readdirSync(videoDir)
execFileSync('ffmpeg', [
  '-y',
  '-i',
  join(videoDir, video!),
  '-vf',
  'fps=12,scale=720:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64[p];[b][p]paletteuse',
  'docs/public/demo.gif',
])
rmSync(videoDir, { recursive: true, force: true })
console.log('Wrote docs/public/demo.gif')
```

- [ ] **Step 2: Record the GIF**

Run `pnpm dev` in one terminal, then in another: `pnpm demo` (needs `ffmpeg`; on macOS `brew install ffmpeg`).
Expected: `Wrote docs/public/demo.gif` (about 160 KB). Open it: a heading, bold text and three tasks being typed, two of them ticked. Stop the dev server.

- [ ] **Step 3: Write `README.md`**

Fill in the three sizes from your `pnpm size` output (the values below are the prototype's).

```markdown
# live-md-editor

[![npm](https://img.shields.io/npm/v/live-md-editor)](https://www.npmjs.com/package/live-md-editor)
[![CI](https://github.com/salvatorecastellitti/live-md-editor/actions/workflows/ci.yml/badge.svg)](https://github.com/salvatorecastellitti/live-md-editor/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/live-md-editor)](./LICENSE)

**Edit markdown without seeing markdown.** A lightweight WYSIWYG editor: headings look like
headings, checkboxes are real checkboxes, and the value you get back is plain markdown.
Works with Next.js, React, Vue, Svelte or no framework at all.

![Typing markdown into live-md-editor](./docs/public/demo.gif)

[Documentation](https://salvatorecastellitti.github.io/live-md-editor/) ·
[Playground](https://salvatorecastellitti.github.io/live-md-editor/playground) ·
[API](https://salvatorecastellitti.github.io/live-md-editor/api/)

## Features

- **Markdown in, markdown out.** The value is a plain string. Output is canonical, so saving
  never creates noisy diffs.
- **Formatted while you type.** `## ` becomes a heading, `- [ ] ` a checkbox, `**bold**` bold.
- **All of GFM:** headings, emphasis, strikethrough, links, images, nested lists, task lists,
  quotes, code blocks, rules and tables. Plus opt-in radio lists.
- **Headless.** No toolbar to fight: a small command API lets you build your own.
- **Safe.** Raw HTML is shown as text, never run. Links only allow http, https, mailto and
  relative URLs.
- **Fast.** About 2 ms per keystroke on a 10,000-line document.
- **Small.** 106.5 kB gzipped including ProseMirror (the engine behind many production editors).

## Install

```bash
npm install live-md-editor
```

## Next.js / React

```tsx
'use client'

import { useState } from 'react'
import { LiveMarkdownEditor } from 'live-md-editor/react'
import 'live-md-editor/style.css'

export function NoteEditor({ initial }: { initial: string }) {
  const [markdown, setMarkdown] = useState(initial)
  return <LiveMarkdownEditor value={markdown} onChange={setMarkdown} placeholder="Write..." />
}
```

## Any framework, or none

```ts
import { createEditor } from 'live-md-editor'
import 'live-md-editor/style.css'

const editor = createEditor({
  element: document.querySelector('#editor')!,
  value: '# Hello\n\n- [ ] Try me',
  onChange: (markdown) => console.log(markdown),
})

editor.commands.toggleBold()
editor.isActive('bold')
editor.getMarkdown()
editor.destroy()
```

Guides for [Vue](https://salvatorecastellitti.github.io/live-md-editor/guide/vue),
[Svelte](https://salvatorecastellitti.github.io/live-md-editor/guide/svelte) and
[plain HTML](https://salvatorecastellitti.github.io/live-md-editor/guide/vanilla) are in the docs.

## Customise

- [Build a toolbar](https://salvatorecastellitti.github.io/live-md-editor/guide/toolbar) with
  `editor.commands` and `editor.isActive`.
- [Theme it](https://salvatorecastellitti.github.io/live-md-editor/guide/theming) with CSS
  variables such as `--lme-accent` and `--lme-font`. Dark mode is built in.
- [Large documents](https://salvatorecastellitti.github.io/live-md-editor/guide/performance):
  set `changeDelay` to batch `onChange`.

## Bundle size

| Entry | Gzipped |
| --- | --- |
| `live-md-editor` | 106.5 kB |
| `live-md-editor/react` | 106.8 kB (includes the core) |
| `live-md-editor/style.css` | 2.2 kB |

Sizes include every dependency and are checked on each pull request.

## Browser support

Current Chrome, Edge, Firefox and Safari, on desktop and mobile.

## Roadmap

Expo / React Native package, image upload hooks, an optional toolbar and slash menu, syntax
highlighting in code blocks, math and footnotes. Ideas welcome in
[issues](https://github.com/salvatorecastellitti/live-md-editor/issues).

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

[MIT](./LICENSE)
```

- [ ] **Step 4: Write `CONTRIBUTING.md`**

```markdown
# Contributing

Thanks for helping! Bug reports, docs fixes and pull requests are all welcome.

## Setup

You need Node 22 and pnpm 10 (`corepack enable pnpm`).

```bash
pnpm install
pnpm exec playwright install
pnpm dev          # test page at http://localhost:4173
```

## Commands

| Command | What it does |
| --- | --- |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm test:e2e` | Browser tests in Chromium, Firefox, WebKit and a mobile viewport |
| `pnpm test:perf` | Keystroke performance on a 10,000-line document |
| `pnpm check` | Typecheck, lint, unit tests, build, size budget and package checks |
| `pnpm docs:dev` | Documentation site with live reload |
| `pnpm format` | Format and auto-fix lint problems |

## How the code is organised

- `src/schema.ts`: every node and mark the editor knows.
- `src/markdown/`: markdown to document (`parser.ts`) and back (`serializer.ts`).
- `src/plugins/`: typing shortcuts, key bindings, placeholder, link clicks.
- `src/commands/`: the public command API.
- `src/editor.ts`: `createEditor`, which wires everything together.
- `src/react/`: the React wrapper.

## Pull requests

1. Add a test that fails without your change. Markdown changes need a round-trip test in
   `test/roundtrip.test.ts`.
2. Run `pnpm check` and `pnpm test:e2e`.
3. Add a changeset describing the change for users: `pnpm changeset`.
4. Keep the bundle within the size budget. If a change needs more, explain why in the PR.

## Reporting bugs

Please include the markdown that triggers the problem, what you expected, what happened, and
your browser. The [playground](https://salvatorecastellitti.github.io/live-md-editor/playground)
is a quick way to reproduce.
```

- [ ] **Step 5: Write `SECURITY.md`**

```markdown
# Security policy

## Supported versions

Security fixes are released for the latest minor version.

## Reporting a vulnerability

Please do not open a public issue. Report it privately through
[GitHub security advisories](https://github.com/salvatorecastellitti/live-md-editor/security/advisories/new).
You will get a reply within a week. Once a fix is released, the advisory is published with credit
to you, unless you prefer otherwise.

Examples of what counts: markdown or pasted content that runs script, links that bypass the URL
allowlist, or content that escapes the editor.
```

- [ ] **Step 6: Add the Code of Conduct**

Use the official Contributor Covenant 2.1 text unchanged (it is quoted third-party text):

```bash
curl -fsSL https://www.contributor-covenant.org/version/2/1/code_of_conduct/code_of_conduct.md -o CODE_OF_CONDUCT.md
grep -n "INSERT CONTACT METHOD" CODE_OF_CONDUCT.md
```

Replace the `[INSERT CONTACT METHOD]` placeholder with:
`a private report to the maintainer at https://github.com/salvatorecastellitti/live-md-editor/security/advisories/new`

Run `grep -c "INSERT CONTACT METHOD" CODE_OF_CONDUCT.md`. Expected: `0`.

- [ ] **Step 7: Add issue and PR templates**

`.github/ISSUE_TEMPLATE/bug_report.yml`:

```yaml
name: Bug report
description: Something does not work as expected
labels: [bug]
body:
  - type: textarea
    id: markdown
    attributes:
      label: Markdown that shows the problem
      description: Paste the smallest markdown that reproduces it.
      render: markdown
    validations:
      required: true
  - type: textarea
    id: steps
    attributes:
      label: Steps
      description: What did you type, click or paste?
    validations:
      required: true
  - type: textarea
    id: expected
    attributes:
      label: Expected and actual result
    validations:
      required: true
  - type: input
    id: environment
    attributes:
      label: Browser, OS and framework
      placeholder: Safari 26 on iOS, Next.js 16
    validations:
      required: true
  - type: input
    id: version
    attributes:
      label: live-md-editor version
    validations:
      required: true
```

`.github/ISSUE_TEMPLATE/feature_request.yml`:

```yaml
name: Feature request
description: Suggest an idea
labels: [enhancement]
body:
  - type: textarea
    id: problem
    attributes:
      label: What are you trying to do?
      description: Describe the problem before the solution.
    validations:
      required: true
  - type: textarea
    id: proposal
    attributes:
      label: What would you like to happen?
  - type: textarea
    id: alternatives
    attributes:
      label: Alternatives you have considered
```

`.github/ISSUE_TEMPLATE/config.yml`:

```yaml
blank_issues_enabled: false
contact_links:
  - name: Security vulnerability
    url: https://github.com/salvatorecastellitti/live-md-editor/security/advisories/new
    about: Please report security problems privately.
  - name: Documentation
    url: https://salvatorecastellitti.github.io/live-md-editor/
    about: Guides, API reference and playground.
```

`.github/PULL_REQUEST_TEMPLATE.md`:

```markdown
## What and why

## How it was tested

- [ ] Added or updated tests
- [ ] `pnpm check` passes
- [ ] `pnpm test:e2e` passes
- [ ] Added a changeset (`pnpm changeset`) if users will notice the change
```

- [ ] **Step 8: Format and check**

Run: `pnpm format && pnpm lint`
Expected: no problems.

- [ ] **Step 9: Commit**

```bash
git add package.json pnpm-lock.yaml scripts docs/public/demo.gif README.md CONTRIBUTING.md SECURITY.md CODE_OF_CONDUCT.md .github/ISSUE_TEMPLATE .github/PULL_REQUEST_TEMPLATE.md
git commit -m "docs: README, demo, contributing guide and community files" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 19: CI, release and docs automation

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `.github/workflows/docs.yml`
- Create: `.changeset/config.json`, `.changeset/README.md` (via `changeset init`), `.changeset/initial-release.md`

**Interfaces:**
- Consumes: package scripts (Task 1).
- Produces: CI on every push and PR (checks, examples build, browsers, performance); Changesets release PRs and npm publishing with provenance; docs deployed to GitHub Pages from `main`.

- [ ] **Step 1: Set up Changesets**

Run:
```bash
pnpm add -D @changesets/cli@^2.31.1 @changesets/changelog-github@^0.7.0
pnpm changeset init
```

Replace `.changeset/config.json` with:

```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.1.4/schema.json",
  "changelog": ["@changesets/changelog-github", { "repo": "salvatorecastellitti/live-md-editor" }],
  "commit": false,
  "fixed": [],
  "linked": [],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": ["example-nextjs", "example-vanilla"]
}
```

Create `.changeset/initial-release.md`:

```markdown
---
'live-md-editor': minor
---

First release: WYSIWYG markdown editing with GFM, task and radio lists, a React wrapper and a default theme.
```

- [ ] **Step 2: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
      - run: pnpm build
      - run: pnpm size
      - run: pnpm check:package
      - run: pnpm --filter "./examples/*" build
      - run: pnpm docs:build

  browsers:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium firefox webkit
      - run: pnpm test:e2e
      - run: pnpm test:perf
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report
          retention-days: 7
```

- [ ] **Step 3: Create `.github/workflows/release.yml`**

```yaml
name: Release

on:
  push:
    branches: [main]

concurrency: ${{ github.workflow }}-${{ github.ref }}

permissions:
  contents: write
  pull-requests: write
  id-token: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
          registry-url: https://registry.npmjs.org
      - run: pnpm install --frozen-lockfile
      - uses: changesets/action@v1
        with:
          version: pnpm changeset version
          publish: pnpm release
          title: 'chore: release'
          commit: 'chore: release'
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
          NPM_CONFIG_PROVENANCE: true
```

- [ ] **Step 4: Create `.github/workflows/docs.yml`**

```yaml
name: Docs

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm docs:build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: docs/.vitepress/dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 5: Check the workflow files parse**

Run: `pnpm exec prettier --check .github`
Expected: passes (Prettier fails on invalid YAML). The workflows run for real on the first push to GitHub.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml .changeset .github/workflows
git commit -m "ci: add CI, release and docs workflows" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

The workflows run once the repository is on GitHub. Publishing needs one-time setup by the maintainer (listed in Task 20, not done by the implementer).

---

### Task 20: Final verification

**Files:**
- Modify: whatever `pnpm format` touches.

- [ ] **Step 1: Clean install and full check**

Run:
```bash
rm -rf node_modules dist
pnpm install --frozen-lockfile
pnpm format
pnpm check
pnpm test:e2e
pnpm test:perf
pnpm --filter "./examples/*" build
pnpm docs:build
```
Expected: everything passes (see the Firefox note in Task 13 for local macOS runs).

- [ ] **Step 2: Verify the package as a consumer sees it**

Run:
```bash
pnpm pack
tar -tzf live-md-editor-0.0.0.tgz
rm live-md-editor-0.0.0.tgz
```
Expected: only `package/package.json`, `package/README.md`, `package/LICENSE` and `package/dist/...` files.

- [ ] **Step 3: Check the writing rule**

Run:
```bash
node -e "const fs = require('fs'); const files = require('child_process').execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter((f) => f && !/CODE_OF_CONDUCT|pnpm-lock|\.gif$/.test(f)); const bad = files.filter((f) => /[\u2013\u2014]/.test(fs.readFileSync(f, 'utf8'))); console.log(bad.length ? bad.join('\n') : 'no dashes')"
```
Expected: `no dashes`.

- [ ] **Step 4: Commit any formatting changes**

```bash
git status --short
git add -A
git commit -m "chore: final formatting" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
(Skip the commit if `git status` shows nothing.)

- [ ] **Step 5: Report the maintainer's one-time setup**

Do not do these; list them for the maintainer in the final report:
1. Create the GitHub repository `salvatorecastellitti/live-md-editor` and push `main`.
2. Settings, Pages: set Source to "GitHub Actions".
3. Settings, Security: enable private vulnerability reporting.
4. npm: create an automation token and add it as the `NPM_TOKEN` repository secret.
5. Merge the "chore: release" pull request that Changesets opens to publish 0.1.0.
