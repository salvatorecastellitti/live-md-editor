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
