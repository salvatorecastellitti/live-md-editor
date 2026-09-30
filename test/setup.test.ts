import { describe, expect, it } from 'vitest'

describe('test environment', () => {
  it('runs in jsdom with the layout shims ProseMirror needs', () => {
    expect(document.createRange().getClientRects()).toHaveLength(0)
    expect(document.body.getBoundingClientRect().width).toBe(0)
    expect(typeof ClipboardEvent).toBe('function')
  })
})
