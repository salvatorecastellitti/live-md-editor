import { StrictMode, createRef, useState } from 'react'
import { act, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Editor } from 'live-md-editor'
import { LiveMarkdownEditor } from '../src/react'
import { type } from './helpers'

describe('LiveMarkdownEditor', () => {
  it('mounts once under StrictMode and exposes the editor', () => {
    const ref = createRef<Editor | null>()
    const { container } = render(
      <StrictMode>
        <LiveMarkdownEditor ref={ref} defaultValue="# Hi" />
      </StrictMode>,
    )
    expect(container.querySelectorAll('.lme')).toHaveLength(1)
    expect(ref.current!.getMarkdown()).toBe('# Hi')
  })
  it('controlled: typing calls onChange, external value replaces doc', () => {
    const ref = createRef<Editor | null>()
    const seen = vi.fn()
    function App() {
      const [md, setMd] = useState('a')
      return (
        <>
          <LiveMarkdownEditor
            ref={ref}
            value={md}
            onChange={(v) => {
              seen(v)
              setMd(v)
            }}
          />
          <button onClick={() => setMd('# reset')}>r</button>
        </>
      )
    }
    const { getByText, container } = render(<App />)
    const view = ref.current!.view
    act(() => {
      type(view, 'b')
    })
    expect(seen).toHaveBeenLastCalledWith('ba')
    act(() => {
      getByText('r').click()
    })
    expect(ref.current!.getMarkdown()).toBe('# reset')
    expect(container.querySelector('h1')!.textContent).toBe('reset')
  })
  it('a late echo of an old value does not wipe newer typing', () => {
    vi.useFakeTimers()
    try {
      const ref = createRef<Editor | null>()
      function App() {
        const [md, setMd] = useState('a')
        return <LiveMarkdownEditor ref={ref} value={md} onChange={setMd} changeDelay={100} />
      }
      render(<App />)
      act(() => {
        type(ref.current!.view, 'b')
      })
      // onChange('ba') fires, then the user types again before React
      // re-renders with value="ba". That stale value must be ignored.
      act(() => {
        vi.advanceTimersByTime(100)
        type(ref.current!.view, 'c')
      })
      expect(ref.current!.getMarkdown()).toBe('bca')
    } finally {
      vi.useRealTimers()
    }
  })
  it('a state setter used as ref receives the editor once mounted', () => {
    const seen: (Editor | null)[] = []
    render(<LiveMarkdownEditor ref={(editor) => void seen.push(editor)} defaultValue="x" />)
    expect(seen.at(-1)?.getMarkdown()).toBe('x')
  })

  it('editable prop toggles', () => {
    const ref = createRef<Editor | null>()
    const { rerender } = render(<LiveMarkdownEditor ref={ref} editable={false} />)
    expect(ref.current!.isEditable()).toBe(false)
    rerender(<LiveMarkdownEditor ref={ref} editable />)
    expect(ref.current!.isEditable()).toBe(true)
  })
})

describe('LiveMarkdownEditor streaming', () => {
  function Chat({ text, streaming }: { text: string; streaming: boolean }) {
    return <LiveMarkdownEditor value={text} streaming={streaming} editable={false} />
  }

  it('streams a growing value and ends with the exact markdown', () => {
    const answer = '## Title\n\nSome **bold** text and `code`.\n\n- [x] done'
    const { container, rerender } = render(<Chat text="" streaming />)
    for (let i = 1; i <= answer.length; i += 4) {
      act(() => rerender(<Chat text={answer.slice(0, i)} streaming />))
      // Rendered through a stream: read-only, marked busy, raw syntax repaired.
      const root = container.querySelector('.lme')!
      expect(root.classList.contains('lme-streaming')).toBe(true)
      expect(root.getAttribute('aria-busy')).toBe('true')
    }
    act(() => rerender(<Chat text={answer} streaming={false} />))
    const root = container.querySelector('.lme')!
    expect(root.classList.contains('lme-streaming')).toBe(false)
    expect(root.querySelector('h2')?.textContent).toBe('Title')
    expect(root.querySelector('strong')?.textContent).toBe('bold')
    expect(root.textContent).not.toContain('**')
  })

  it('restarts when the value is replaced instead of extended', () => {
    const ref = createRef<Editor | null>()
    const { rerender } = render(<LiveMarkdownEditor ref={ref} value="First answer" streaming />)
    act(() => rerender(<LiveMarkdownEditor ref={ref} value="Second" streaming />))
    act(() => rerender(<LiveMarkdownEditor ref={ref} value="Second answer" streaming={false} />))
    expect(ref.current!.getMarkdown()).toBe('Second answer')
  })

  it('applies a final value that does not extend the streamed text', () => {
    const ref = createRef<Editor | null>()
    const { rerender } = render(<LiveMarkdownEditor ref={ref} value="First answer" streaming />)
    act(() => rerender(<LiveMarkdownEditor ref={ref} value="Corrected answer" streaming={false} />))
    expect(ref.current!.getMarkdown()).toBe('Corrected answer')
    act(() => rerender(<LiveMarkdownEditor ref={ref} value="Corrected answer" streaming={false} />))
    expect(ref.current!.getMarkdown()).toBe('Corrected answer')
  })
})
