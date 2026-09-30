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
