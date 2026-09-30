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
