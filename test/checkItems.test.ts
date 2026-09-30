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
