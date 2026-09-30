import { afterEach, describe, expect, it, vi } from 'vitest'
import { linkClicks } from '../src/plugins/links'
import { placeholder } from '../src/plugins/placeholder'
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

  const clickLink = (href: string, mods: MouseEventInit) => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const view = createView(`[link](${href})`, [linkClicks()])
    const event = new MouseEvent('click', mods)
    // Position 2 is inside the link text.
    const handled = view.someProp('handleClick', (f) => f(view, 2, event))
    return { handled: !!handled, open }
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
})
