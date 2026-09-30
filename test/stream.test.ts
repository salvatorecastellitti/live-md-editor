import { describe, expect, it, vi } from 'vitest'
import { createEditor, type EditorOptions } from '../src'
import { createParser } from '../src/markdown/parser'
import { serializeMarkdown } from '../src/markdown/serializer'
import answer from './fixtures/answer.md?raw'
import { cursorAfter, mount, RAW_SYNTAX, select, visibleText } from './helpers'

const make = (value = '', options: Partial<EditorOptions> = {}) =>
  createEditor({ element: mount(), value, ...options })
const canonical = (markdown: string) => serializeMarkdown(createParser({ radio: false })(markdown))

/** Writes `text` in pieces of `size` characters, rendering after each piece. */
function feed(
  writer: { write(c: string): void; flush(): void },
  text: string,
  size: number,
  check?: () => void,
) {
  for (let i = 0; i < text.length; i += size) {
    writer.write(text.slice(i, i + size))
    writer.flush()
    check?.()
  }
}

describe('streaming at the end', () => {
  it.each([1, 2, 3, 7, 16, 61, 5000])(
    'chunks of %i end identical to parsing at once, never showing raw syntax',
    (size) => {
      const editor = make()
      const writer = editor.stream()
      feed(writer, answer, size, () => {
        expect(visibleText(editor.view.state.doc)).not.toMatch(RAW_SYNTAX)
      })
      expect(writer.end()).toBe(canonical(answer))
      expect(editor.view.state.doc.eq(createParser({ radio: false })(answer))).toBe(true)
    },
  )

  it('appends after existing content and keeps it untouched', () => {
    const editor = make('# Chat')
    const writer = editor.stream()
    writer.write('Hello **there**')
    expect(writer.end()).toBe('# Chat\n\nHello **there**')
  })

  it('is read-only while streaming and reports start and end', () => {
    const onChange = vi.fn()
    const started = vi.fn()
    const ended = vi.fn()
    const editor = make('', { onChange })
    editor.on('streamStart', started)
    editor.on('streamEnd', ended)
    const writer = editor.stream()
    expect(started).toHaveBeenCalledOnce()
    expect(editor.isStreaming()).toBe(true)
    expect(editor.view.editable).toBe(false)
    expect(editor.view.dom.classList.contains('lme-streaming')).toBe(true)
    feed(writer, 'one two three', 4)
    expect(editor.view.dom.querySelector('.lme-stream-caret')).not.toBeNull()
    expect(onChange).not.toHaveBeenCalled()
    writer.end()
    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith('one two three')
    expect(ended).toHaveBeenCalledWith('one two three')
    expect(editor.isStreaming()).toBe(false)
    expect(editor.view.editable).toBe(true)
    expect(editor.view.dom.classList.contains('lme-streaming')).toBe(false)
    expect(editor.view.dom.querySelector('.lme-stream-caret')).toBeNull()
  })

  it('undoes the whole stream in one step', () => {
    const editor = make('# Chat')
    const writer = editor.stream()
    feed(writer, answer, 9)
    writer.end()
    expect(editor.commands.undo()).toBe(true)
    expect(editor.getMarkdown()).toBe('# Chat')
    expect(editor.commands.redo()).toBe(true)
    expect(editor.getMarkdown()).toBe(canonical(`# Chat\n\n${answer}`))
  })

  it('abort keeps what arrived, with unfinished syntax closed', () => {
    const editor = make()
    const writer = editor.stream()
    writer.write('Hello **wor')
    expect(writer.abort()).toBe('Hello **wor**')
    expect(writer.done).toBe(true)
    writer.write('ignored')
    expect(editor.getMarkdown()).toBe('Hello **wor**')
  })

  it('renders on the next animation frame without flush', async () => {
    const editor = make()
    const writer = editor.stream()
    writer.write('# Hi')
    expect(editor.view.dom.querySelector('h1')).toBeNull()
    await new Promise((resolve) => requestAnimationFrame(resolve))
    expect(editor.view.dom.querySelector('h1')?.textContent).toBe('Hi')
    writer.end()
  })

  it('setMarkdown and a new stream end the running one', () => {
    const editor = make()
    const first = editor.stream()
    first.write('first')
    const second = editor.stream()
    expect(first.done).toBe(true)
    second.write(' second')
    second.end()
    expect(editor.getMarkdown()).toBe('first\n\nsecond')
    const third = editor.stream()
    third.write('dropped')
    editor.setMarkdown('# Fresh')
    expect(third.done).toBe(true)
    expect(editor.isStreaming()).toBe(false)
    expect(editor.getMarkdown()).toBe('# Fresh')
  })
})

describe('streaming at the cursor', () => {
  it('inserts inline text like a paste, keeping spaces, as one undo step', () => {
    const editor = make('Before after')
    cursorAfter(editor.view, 'Before ')
    const writer = editor.stream({ at: 'cursor' })
    feed(writer, '**bold** text ', 3, () => {
      expect(visibleText(editor.view.state.doc)).not.toMatch(RAW_SYNTAX)
    })
    expect(writer.end()).toBe('Before **bold** text after')
    editor.commands.undo()
    expect(editor.getMarkdown()).toBe('Before after')
  })

  it('keeps headings and lists as blocks, merging only edge paragraphs', () => {
    const editor = make('Intro text')
    cursorAfter(editor.view, 'Intro')
    const writer = editor.stream({ at: 'cursor' })
    feed(writer, ' more.\n\n## New section\n\n- one\n- two', 5)
    // The rest of the original paragraph keeps its own leading space.
    expect(writer.end()).toBe('Intro more.\n\n## New section\n\n- one\n- two\n\n text')
  })

  it('replaces the selection', () => {
    const editor = make('Keep this, replace that.')
    select(editor.view, 'replace that')
    const writer = editor.stream({ at: 'cursor' })
    feed(writer, 'use *this*', 2)
    expect(writer.end()).toBe('Keep this, use *this*.')
    editor.commands.undo()
    expect(editor.getMarkdown()).toBe('Keep this, replace that.')
  })
})

describe('streamFrom', () => {
  async function* tokens(text: string, size: number) {
    for (let i = 0; i < text.length; i += size) yield text.slice(i, i + size)
  }

  it('streams an async iterable to completion', async () => {
    const editor = make()
    expect(await editor.streamFrom(tokens(answer, 11))).toBe(canonical(answer))
  })

  it('decodes a byte stream, including characters split across chunks', async () => {
    const bytes = new TextEncoder().encode('Café **naïve** 🎉')
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const byte of bytes) controller.enqueue(new Uint8Array([byte]))
        controller.close()
      },
    })
    const editor = make()
    expect(await editor.streamFrom(body)).toBe('Café **naïve** 🎉')
  })

  it('stops on abort signal and keeps what arrived', async () => {
    const controller = new AbortController()
    async function* slow() {
      yield 'Hello **wor'
      controller.abort()
      yield 'ld**'
    }
    const editor = make()
    expect(await editor.streamFrom(slow(), { signal: controller.signal })).toBe('Hello **wor**')
  })

  it('keeps what arrived and rethrows when the source fails', async () => {
    async function* failing() {
      yield 'Partial `cod'
      throw new Error('network down')
    }
    const editor = make()
    await expect(editor.streamFrom(failing())).rejects.toThrow('network down')
    expect(editor.getMarkdown()).toBe('Partial `cod`')
    expect(editor.isStreaming()).toBe(false)
  })
})

describe('stream lifecycle', () => {
  it('ignores commands while streaming and still ends cleanly', () => {
    const editor = make('Before after')
    cursorAfter(editor.view, 'Before ')
    const writer = editor.stream({ at: 'cursor' })
    writer.write('**x** ')
    writer.flush()
    expect(editor.commands.undo()).toBe(false)
    expect(editor.commands.toggleBold()).toBe(false)
    expect(writer.end()).toBe('Before **x** after')
    expect(editor.isStreaming()).toBe(false)
    expect(editor.view.editable).toBe(true)
  })

  it('leaves the streaming state even when finishing throws', () => {
    const editor = make('abc')
    const writer = editor.stream()
    writer.write('x')
    writer.flush()
    editor.view.dispatch(editor.view.state.tr.delete(0, editor.view.state.doc.content.size))
    try {
      writer.end()
    } catch {
      // the document was changed under the stream on purpose
    }
    expect(editor.isStreaming()).toBe(false)
    expect(editor.view.editable).toBe(true)
  })

  it('reports a pending edit before streaming and not during it', () => {
    vi.useFakeTimers()
    try {
      const onChange = vi.fn()
      const editor = make('', { onChange, changeDelay: 200 })
      editor.view.dispatch(editor.view.state.tr.insertText('a', 1))
      expect(onChange).not.toHaveBeenCalled()
      const writer = editor.stream()
      expect(onChange).toHaveBeenCalledTimes(1)
      expect(onChange).toHaveBeenLastCalledWith('a')
      writer.write('\n\n**partial')
      writer.flush()
      vi.advanceTimersByTime(250)
      expect(onChange).toHaveBeenCalledTimes(1)
      writer.write('**')
      writer.end()
      vi.advanceTimersByTime(250)
      expect(onChange).toHaveBeenCalledTimes(2)
      expect(onChange).toHaveBeenLastCalledWith('a\n\n**partial**')
    } finally {
      vi.useRealTimers()
    }
  })

  it('streamFrom aborts promptly when the source stalls', async () => {
    const controller = new AbortController()
    async function* stalled() {
      yield 'Hello **wor'
      await new Promise(() => {})
    }
    const editor = make()
    const result = editor.streamFrom(stalled(), { signal: controller.signal })
    await new Promise((resolve) => setTimeout(resolve, 10))
    controller.abort()
    expect(await result).toBe('Hello **wor**')
    expect(editor.isStreaming()).toBe(false)
  })

  it('streamFrom cancels a web stream on abort', async () => {
    const controller = new AbortController()
    const cancel = vi.fn()
    const body = new ReadableStream<string>({
      start(c) {
        c.enqueue('Hi')
      },
      cancel,
    })
    const editor = make()
    const result = editor.streamFrom(body, { signal: controller.signal })
    await new Promise((resolve) => setTimeout(resolve, 10))
    controller.abort()
    expect(await result).toBe('Hi')
    expect(cancel).toHaveBeenCalled()
    expect(editor.isStreaming()).toBe(false)
  })

  it('streamFrom with an already aborted signal streams nothing', async () => {
    const controller = new AbortController()
    controller.abort()
    const editor = make('kept')
    expect(
      await editor.streamFrom(['x'] as unknown as AsyncIterable<string>, { signal: controller.signal }),
    ).toBe('kept')
    expect(editor.isStreaming()).toBe(false)
  })
})
