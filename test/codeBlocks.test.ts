import type { Plugin } from 'prosemirror-state'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { codeCopy } from '../src/plugins/codeCopy'
import { highlightPlugin, type Highlighter } from '../src/plugins/highlight'
import { markdownInputRules } from '../src/plugins/inputRules'
import { createView, cursorAfter, markdownOf, type } from './helpers'

interface Options {
  highlight?: Highlighter
  copyButton?: boolean
  editable?: boolean
}

/** A view with the code block plugins switched on the way createEditor does it. */
const make = (value: string, options: Options = {}) => {
  const plugins: Plugin[] = [markdownInputRules({ radio: false })]
  if (options.highlight) plugins.push(highlightPlugin(options.highlight))
  if (options.copyButton ?? true) plugins.push(codeCopy())
  const view = createView(value, plugins, { editable: options.editable })
  return { view, getMarkdown: () => markdownOf(view) }
}

/** Marks every "let" as a keyword. */
const letHighlighter: Highlighter = (code) =>
  [...code.matchAll(/\blet\b/g)].map((match) => ({
    from: match.index,
    to: match.index + 3,
    className: 'hljs-keyword',
  }))

const tick = () => new Promise((resolve) => setTimeout(resolve))

describe('highlight option', () => {
  it('colours code blocks with a language without changing the markdown', () => {
    const editor = make('```js\nlet a = let\n```', { highlight: letHighlighter })
    const keywords = editor.view.dom.querySelectorAll('pre .hljs-keyword')
    expect([...keywords].map((span) => span.textContent)).toEqual(['let', 'let'])
    expect(editor.getMarkdown()).toBe('```js\nlet a = let\n```')
  })

  it('leaves code without a language plain and never calls the highlighter for it', () => {
    const highlighter = vi.fn(letHighlighter)
    const editor = make('```\nlet a\n```', { highlight: highlighter })
    expect(editor.view.dom.querySelector('.hljs-keyword')).toBeNull()
    expect(highlighter).not.toHaveBeenCalled()
  })

  it('re-colours only the code block that changed', () => {
    const highlighter = vi.fn(letHighlighter)
    const editor = make('```js\nlet a\n```\n\n```js\nlet b\n```', { highlight: highlighter })
    expect(highlighter).toHaveBeenCalledTimes(2)
    cursorAfter(editor.view, 'let a')
    type(editor.view, ' = let')
    expect(highlighter).toHaveBeenCalledTimes(2 + ' = let'.length)
    expect(highlighter.mock.calls.every(([code], i) => i < 2 || code.startsWith('let a'))).toBe(true)
    expect(editor.view.dom.querySelectorAll('.hljs-keyword')).toHaveLength(3)
  })

  it('applies results that arrive later, asking once per code', async () => {
    const highlighter = vi.fn((code: string, language: string) =>
      Promise.resolve(letHighlighter(code, language)),
    )
    const editor = make('```js\nlet a\n```', { highlight: highlighter })
    expect(editor.view.dom.querySelector('.hljs-keyword')).toBeNull()
    editor.view.dispatch(editor.view.state.tr.setMeta('unrelated', true))
    await tick()
    expect(editor.view.dom.querySelector('.hljs-keyword')?.textContent).toBe('let')
    expect(highlighter).toHaveBeenCalledOnce()
  })

  it('keeps the code plain when the highlighter fails', async () => {
    const editor = make('```js\nlet a\n```', { highlight: () => Promise.reject(new Error('no grammar')) })
    await tick()
    expect(editor.view.dom.querySelector('.hljs-keyword')).toBeNull()
    expect(editor.getMarkdown()).toBe('```js\nlet a\n```')
  })
})

describe('robustness', () => {
  it('keeps the code plain when the highlighter throws synchronously', () => {
    const editor = make('```js\nlet a\n```', {
      highlight: () => {
        throw new Error('unknown language')
      },
    })
    expect(editor.view.dom.querySelector('.hljs-keyword')).toBeNull()
    type(editor.view, '!')
    expect(editor.getMarkdown()).toContain('let a')
  })

  it('drops highlight and copy decorations when a code block becomes a paragraph', () => {
    const editor = make('```js\nlet a\n```', { highlight: letHighlighter })
    expect(editor.view.dom.querySelector('.hljs-keyword')).not.toBeNull()
    const { state } = editor.view
    editor.view.dispatch(state.tr.setBlockType(1, 1, state.schema.nodes.paragraph!))
    expect(editor.view.dom.querySelector('pre')).toBeNull()
    expect(editor.view.dom.querySelector('.hljs-keyword')).toBeNull()
    expect(editor.view.dom.querySelector('button.lme-copy')).toBeNull()
  })
})

describe('copy button', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const mockClipboard = () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    return writeText
  }

  it('is on every code block by default and is not part of the markdown', () => {
    const editor = make('```ts\na\n```\n\ntext\n\n```\nb\n```')
    const buttons = editor.view.dom.querySelectorAll('pre button.lme-copy')
    expect(buttons).toHaveLength(2)
    expect(buttons[0]!.getAttribute('aria-label')).toBe('Copy code')
    expect(editor.getMarkdown()).toBe('```ts\na\n```\n\ntext\n\n```\nb\n```')
  })

  it('copies exactly the code and confirms', async () => {
    const writeText = mockClipboard()
    const editor = make('```ts\nconst a = 1\nconst b = 2\n```')
    const button = editor.view.dom.querySelector<HTMLButtonElement>('button.lme-copy')!
    button.click()
    await tick()
    expect(writeText).toHaveBeenCalledWith('const a = 1\nconst b = 2')
    expect(button.dataset.copied).toBe('true')
    expect(button.getAttribute('aria-label')).toBe('Copied')
  })

  it('works in read-only mode', async () => {
    const writeText = mockClipboard()
    const editor = make('```\nx\n```', { editable: false })
    editor.view.dom.querySelector<HTMLButtonElement>('button.lme-copy')!.click()
    await tick()
    expect(writeText).toHaveBeenCalledWith('x')
  })

  it('can be turned off', () => {
    const editor = make('```\nx\n```', { copyButton: false })
    expect(editor.view.dom.querySelector('button.lme-copy')).toBeNull()
  })

  it('appears on code blocks created while editing', () => {
    const editor = make('')
    type(editor.view, '```js ')
    expect(editor.view.dom.querySelector('button.lme-copy')).not.toBeNull()
  })
})
