import { describe, expect, it, vi } from 'vitest'
import { createEditor, type EditorOptions } from '../src'
import { cursorAfter, mount, paste, press, select, type } from './helpers'

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

  it('announces read-only state with aria-readonly, including while streaming', () => {
    const editor = make('text', { editable: false })
    expect(editor.view.dom.getAttribute('aria-readonly')).toBe('true')
    editor.setEditable(true)
    expect(editor.view.dom.getAttribute('aria-readonly')).toBeNull()
    const writer = editor.stream()
    expect(editor.view.dom.getAttribute('aria-readonly')).toBe('true')
    writer.end()
    expect(editor.view.dom.getAttribute('aria-readonly')).toBeNull()
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

  it('pastes a heading in the middle of a paragraph as its own block', () => {
    const editor = make('ab')
    cursorAfter(editor.view, 'a')
    paste(editor.view, { text: '## Title' })
    expect(editor.getMarkdown()).toBe('a\n\n## Title\n\nb')
  })

  it('reads markdown copied from VS Code as markdown, not as its styled HTML', () => {
    const editor = make('')
    paste(editor.view, {
      text: '# From VS Code',
      html: '<div style="font-family: Menlo"><span># From VS Code</span></div>',
      types: ['text/plain', 'text/html', 'vscode-editor-data'],
    })
    expect(editor.getMarkdown()).toBe('# From VS Code')
  })

  it('prefers the HTML of rich pastes from other apps', () => {
    const editor = make('')
    paste(editor.view, { text: 'Title', html: '<h2>Title</h2>' })
    expect(editor.getMarkdown()).toBe('## Title')
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

  it('adds copy buttons by default and highlights code when given a highlighter', () => {
    const highlight = (code: string) => [{ from: 0, to: code.indexOf(' '), className: 'hljs-keyword' }]
    const editor = make('```js\nlet a\n```', { highlight })
    expect(editor.view.dom.querySelector('pre button.lme-copy')).not.toBeNull()
    expect(editor.view.dom.querySelector('pre .hljs-keyword')?.textContent).toBe('let')
    expect(make('```\nx\n```', { copyButton: false }).view.dom.querySelector('.lme-copy')).toBeNull()
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
