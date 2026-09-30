// @vitest-environment node
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

describe('server rendering', () => {
  it('imports and renders without a DOM', async () => {
    const core = await import('../src/index')
    const { LiveMarkdownEditor } = await import('../src/react')
    expect(typeof core.createEditor).toBe('function')
    expect(renderToString(<LiveMarkdownEditor defaultValue="# x" className="mine" />)).toBe(
      '<div class="lme-root mine"></div>',
    )
  })
})
