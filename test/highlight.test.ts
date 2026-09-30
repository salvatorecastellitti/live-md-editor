import haskell from 'highlight.js/lib/languages/haskell'
import { describe, expect, it } from 'vitest'
import type { HighlightToken } from '../src'
import { highlight, registerLanguage } from '../src/highlight'
import { highlightPlugin } from '../src/plugins/highlight'
import { createView, markdownOf } from './helpers'

const textOf = (code: string, tokens: HighlightToken[], className: string) =>
  tokens.filter((token) => token.className === className).map((token) => code.slice(token.from, token.to))

describe('live-md-editor/highlight', () => {
  it('loads a language on first use, then answers synchronously', async () => {
    const code = "const name: string = 'x'"
    const first = highlight(code, 'ts')
    expect(first).toBeInstanceOf(Promise)
    const tokens = (await first)!
    expect(textOf(code, tokens, 'hljs-keyword')).toContain('const')
    expect(textOf(code, tokens, 'hljs-string')).toEqual(["'x'"])
    const second = highlight(code, 'typescript')
    expect(Array.isArray(second)).toBe(true)
  })

  it('understands common aliases and ignores unknown languages', async () => {
    expect(await highlight('def f(): pass', 'py')).not.toBeNull()
    expect(await highlight('echo hi', 'sh')).not.toBeNull()
    expect(highlight('x', 'no-such-language')).toBeNull()
    expect(highlight('x', '')).toBeNull()
  })

  it('accepts extra grammars', () => {
    registerLanguage('haskell', haskell, ['hs'])
    const tokens = highlight('main = putStrLn "hi"', 'hs')
    expect(Array.isArray(tokens)).toBe(true)
    expect((tokens as HighlightToken[]).length).toBeGreaterThan(0)
  })

  it('colours code blocks in the editor once the language has loaded', async () => {
    const view = createView('```rust\nfn main() {}\n```', [highlightPlugin(highlight)])
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(view.dom.querySelector('pre .hljs-keyword')?.textContent).toBe('fn')
    expect(markdownOf(view)).toBe('```rust\nfn main() {}\n```')
  })
})
