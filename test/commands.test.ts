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
