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

| Command          | What it does                                                       |
| ---------------- | ------------------------------------------------------------------ |
| `pnpm test`      | Unit tests (Vitest)                                                |
| `pnpm test:e2e`  | Browser tests in Chromium, Firefox, WebKit and a mobile viewport   |
| `pnpm test:perf` | Keystroke performance on a 10,000-line document                    |
| `pnpm check`     | Typecheck, lint, unit tests, build, size budget and package checks |
| `pnpm docs:dev`  | Documentation site with live reload                                |
| `pnpm format`    | Format and auto-fix lint problems                                  |

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
