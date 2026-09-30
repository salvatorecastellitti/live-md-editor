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

  it('reads a bad ordered list start from pasted HTML as a valid number', () => {
    const order = (html: string) => parseHTML(html).firstChild!.attrs.order as number
    expect(order('<ol start="abc"><li>x</li></ol>')).toBe(1)
    expect(order('<ol start="-3"><li>x</li></ol>')).toBe(0)
    expect(order('<ol start="7"><li>x</li></ol>')).toBe(7)
  })

  it('shows code block language as a data attribute', () => {
    const doc = schema.node('doc', null, [schema.node('code_block', { language: 'ts' }, [schema.text('x')])])
    const dom = DOMSerializer.fromSchema(schema).serializeFragment(doc.content)
    expect(dom.querySelector('pre')!.dataset.language).toBe('ts')
  })
})
