import { afterEach, describe, expect, it, vi } from 'vitest'
import { linkClicks } from '../src/plugins/links'
import { placeholder } from '../src/plugins/placeholder'
import { schema } from '../src/schema'
import { createView, type } from './helpers'

describe('placeholder', () => {
  it('shows while the document is empty', () => {
    const view = createView('', [placeholder('Write here')])
    const empty = view.dom.querySelector('.lme-empty')
    expect(empty?.getAttribute('data-placeholder')).toBe('Write here')
    type(view, 'x')
    expect(view.dom.querySelector('.lme-empty')).toBeNull()
  })

  it('is not shown for an empty heading', () => {
    const view = createView('#', [placeholder('Write here')])
    expect(view.dom.querySelector('.lme-empty')).toBeNull()
  })
})

describe('link clicks', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const clickLink = (href: string, mods: MouseEventInit, editable = true) => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const view = createView('[link](https://x.com)', [linkClicks()], { editable })
    // The parser drops unsafe links, so the href is set on the mark directly.
    const link = schema.marks.link.create({ href })
    view.dispatch(view.state.tr.removeMark(1, 5, schema.marks.link).addMark(1, 5, link))
    const event = new MouseEvent('click', { ...mods, cancelable: true })
    // Position 2 is inside the link text.
    const handled = view.someProp('handleClick', (f) => f(view, 2, event))
    return { handled: !!handled, open, prevented: event.defaultPrevented }
  }

  it('Mod-click opens the link in a new tab', () => {
    const { handled, open } = clickLink('https://x.com', { ctrlKey: true })
    expect(handled).toBe(true)
    expect(open).toHaveBeenCalledWith('https://x.com', '_blank', 'noopener,noreferrer')
  })

  it('a plain click only places the cursor', () => {
    const { handled, open } = clickLink('https://x.com', {})
    expect(handled).toBe(false)
    expect(open).not.toHaveBeenCalled()
  })

  it('read-only: the mouseup handler blocks navigation but leaves opening to the click event', () => {
    const { handled, open, prevented } = clickLink('https://x.com', {}, false)
    expect(handled).toBe(true)
    expect(prevented).toBe(true)
    expect(open).not.toHaveBeenCalled()
  })

  /** Dispatches a DOM click on the rendered link, as a mouse, Enter key or screen reader does. */
  const activateLink = (markdown: string, init: MouseEventInit = {}) => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const view = createView(markdown, [linkClicks()], { editable: false })
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, ...init })
    view.dom.querySelector('a')!.dispatchEvent(event)
    return { open, prevented: event.defaultPrevented }
  }

  it('read-only: activating a link opens it once in a new tab', () => {
    const { open, prevented } = activateLink('[link](https://x.com)')
    expect(prevented).toBe(true)
    expect(open).toHaveBeenCalledOnce()
    expect(open).toHaveBeenCalledWith('https://x.com', '_blank', 'noopener,noreferrer')
  })

  it('read-only: keyboard activation (a click with detail 0) opens the link too', () => {
    const { open } = activateLink('[link](https://x.com)', { detail: 0 })
    expect(open).toHaveBeenCalledWith('https://x.com', '_blank', 'noopener,noreferrer')
  })

  it('read-only: an unsafe link neither opens nor navigates', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const view = createView('[x](https://x.com)', [linkClicks()], { editable: false })
    // The parser drops unsafe links, so the unsafe href is put on the rendered anchor directly.
    const anchor = view.dom.querySelector('a')!
    anchor.setAttribute('href', 'javascript:alert(1)')
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    anchor.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(open).not.toHaveBeenCalled()
  })

  it('editable: a DOM click on a link does not open it (a plain click places the cursor)', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const view = createView('[link](https://x.com)', [linkClicks()])
    view.dom.querySelector('a')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(open).not.toHaveBeenCalled()
  })
})
