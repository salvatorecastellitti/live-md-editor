import { dropCursor } from 'prosemirror-dropcursor'
import { gapCursor } from 'prosemirror-gapcursor'
import { history } from 'prosemirror-history'
import { EditorState, type Plugin, type Transaction } from 'prosemirror-state'
import { tableEditing } from 'prosemirror-tables'
import { EditorView } from 'prosemirror-view'
import type { Node } from 'prosemirror-model'
import { createClipboardTextParser } from './clipboard'
import { createCommands, isActive, type ActiveName, type Commands } from './commands'
import { createParser } from './markdown/parser'
import { serializeMarkdown } from './markdown/serializer'
import { markdownInputRules } from './plugins/inputRules'
import { markdownKeymaps } from './plugins/keymap'
import { codeCopy } from './plugins/codeCopy'
import { highlightPlugin, type Highlighter } from './plugins/highlight'
import { linkClicks } from './plugins/links'
import { placeholder } from './plugins/placeholder'
import {
  createStream,
  STREAM_META,
  streamCaret,
  type ActiveStream,
  type StreamOptions,
  type StreamWriter,
} from './stream/stream'
import { ListItemView } from './views/listItem'

/** Options for {@link createEditor}. */
export interface EditorOptions {
  /** Element the editor is mounted into. Its existing children are left alone. */
  element: HTMLElement
  /** Initial markdown. Defaults to an empty document. */
  value?: string
  /** Called with the new markdown after every content change. Not called by `setMarkdown`. */
  onChange?: (markdown: string) => void
  /**
   * Wait this many milliseconds after the last edit before calling `onChange`
   * and emitting `change`. Defaults to 0 (call right away). Set it to a few
   * hundred for very large documents. Pending changes are flushed on blur
   * and on `destroy`, and `getMarkdown()` is always up to date.
   */
  changeDelay?: number
  /** Text shown while the document is empty. */
  placeholder?: string
  /** When false, the editor is a read-only renderer. Defaults to true. */
  editable?: boolean
  /** Focus the editor once mounted. */
  autofocus?: boolean
  /** Accessible name of the editing area. */
  ariaLabel?: string
  /** Opt-in syntax that is not part of CommonMark or GFM. */
  extensions?: {
    /** `- ( )` / `- (x)` radio lists. Defaults to false. */
    radio?: boolean
  }
  /**
   * Colours code blocks. Pass `highlight` from `live-md-editor/highlight`, or
   * any function that returns token ranges (see {@link Highlighter}).
   */
  highlight?: Highlighter
  /** Show a copy button on code blocks. Defaults to true. */
  copyButton?: boolean
  /** Extra class names. */
  classNames?: {
    /** Added to the editable root, next to `lme`. */
    root?: string
  }
}

/** Events emitted by the editor. */
export interface EditorEvents {
  /** Content changed. Receives the new markdown. */
  change: (markdown: string) => void
  /** Selection moved or content changed. Useful to refresh toolbar state. */
  selectionChange: () => void
  focus: () => void
  blur: () => void
  /** Cmd/Ctrl + K was pressed. Open your link UI, then call `commands.setLink`. */
  linkShortcut: () => void
  /** A stream started. The editor is read-only until it ends. */
  streamStart: () => void
  /** A stream ended (finished, aborted or replaced). Receives the document's markdown. */
  streamEnd: (markdown: string) => void
}

/** Text sources `streamFrom` accepts: strings or UTF-8 bytes, from any async iterable or web stream. */
export type TextSource = AsyncIterable<string | Uint8Array> | ReadableStream<string | Uint8Array>

/** A mounted editor. Create one with {@link createEditor}. */
export interface Editor {
  /** Formatting and insertion commands. Each returns true when it applied. */
  readonly commands: Commands
  /** The underlying ProseMirror view, for advanced use. */
  readonly view: EditorView
  /** The current document as markdown. */
  getMarkdown(): string
  /** Replaces the whole document. Clears undo history and does not call `onChange`. */
  setMarkdown(markdown: string): void
  setEditable(editable: boolean): void
  isEditable(): boolean
  focus(): void
  /** Whether a mark or block is active at the selection, e.g. `isActive('heading', { level: 2 })`. */
  isActive(name: ActiveName, attrs?: { level?: number }): boolean
  /**
   * Starts feeding markdown into the editor as it arrives, for example from
   * an AI model. The editor is read-only until the stream ends; the whole
   * stream becomes one undo step and `onChange` fires once, at the end.
   * Starting a new stream finishes any previous one.
   */
  stream(options?: StreamOptions): StreamWriter
  /**
   * Streams a whole source (a `fetch` body, an SDK text stream, an async
   * generator) and resolves with the document's markdown once it ends.
   * If the source fails, what arrived is kept and the error is rethrown.
   */
  streamFrom(source: TextSource, options?: StreamOptions & { signal?: AbortSignal }): Promise<string>
  /** Whether a stream is running. */
  isStreaming(): boolean
  /** Subscribes to an event and returns a function that unsubscribes. */
  on<E extends keyof EditorEvents>(event: E, handler: EditorEvents[E]): () => void
  /** Unmounts the editor and removes its DOM. */
  destroy(): void
}

const ABORTED = Symbol('aborted')

/** Mounts a markdown editor into `options.element`. */
export function createEditor(options: EditorOptions): Editor {
  const radio = options.extensions?.radio ?? false
  const parse = createParser({ radio })
  const listeners = new Map<keyof EditorEvents, Set<(...args: never[]) => void>>()

  function emit<E extends keyof EditorEvents>(event: E, ...args: Parameters<EditorEvents[E]>): void {
    listeners.get(event)?.forEach((handler) => (handler as (...a: typeof args) => void)(...args))
  }

  const plugins: Plugin[] = [
    markdownInputRules({ radio }),
    ...markdownKeymaps({ onLinkShortcut: () => emit('linkShortcut') }),
    history(),
    streamCaret(),
    dropCursor(),
    gapCursor(),
    tableEditing(),
    linkClicks(),
  ]
  if (options.placeholder) plugins.push(placeholder(options.placeholder))
  if (options.highlight) plugins.push(highlightPlugin(options.highlight))
  if (options.copyButton ?? true) plugins.push(codeCopy())

  const toSlice = createClipboardTextParser(parse)
  const createState = (markdown: string) => EditorState.create({ doc: parse(markdown), plugins })

  let cachedDoc: Node | null = null
  let cachedMarkdown = ''
  const getMarkdown = (): string => {
    if (view.state.doc !== cachedDoc) {
      cachedDoc = view.state.doc
      cachedMarkdown = serializeMarkdown(cachedDoc)
    }
    return cachedMarkdown
  }

  const changeDelay = options.changeDelay ?? 0
  let changeTimer: ReturnType<typeof setTimeout> | undefined
  const notifyChange = (): void => {
    changeTimer = undefined
    if (!options.onChange && !listeners.get('change')?.size) return
    const markdown = getMarkdown()
    options.onChange?.(markdown)
    emit('change', markdown)
  }
  const cancelChange = (): void => {
    clearTimeout(changeTimer)
    changeTimer = undefined
  }
  const flushChange = (): void => {
    if (changeTimer === undefined) return
    cancelChange()
    notifyChange()
  }

  let editable = options.editable ?? true
  let active: ActiveStream | null = null
  const view: EditorView = new EditorView(options.element, {
    state: createState(options.value ?? ''),
    editable: () => editable && !active,
    // A function, so refreshEditable() updates aria-readonly with contenteditable.
    attributes: () => ({
      class: ['lme', options.classNames?.root].filter(Boolean).join(' '),
      role: 'textbox',
      'aria-multiline': 'true',
      ...(options.ariaLabel ? { 'aria-label': options.ariaLabel } : {}),
      ...(editable && !active ? {} : { 'aria-readonly': 'true' }),
    }),
    nodeViews: {
      list_item: (node, nodeView, getPos) => new ListItemView(node, nodeView, getPos),
    },
    clipboardTextParser: toSlice,
    // ProseMirror opens pasted slices as far as it can, which would merge a
    // pasted heading into the paragraph at the cursor. Plain text (and text
    // copied from VS Code, which also offers styled HTML) is inserted with
    // markdownSlice rules instead: only edge paragraphs merge.
    handlePaste(pasteView, event) {
      const data = event.clipboardData
      const text = data?.getData('text/plain')
      if (!data || !text || pasteView.state.selection.$from.parent.type.spec.code) return false
      if (data.getData('text/html') && !data.types.includes('vscode-editor-data')) return false
      pasteView.dispatch(
        pasteView.state.tr.replaceSelection(toSlice(text)).scrollIntoView().setMeta('uiEvent', 'paste'),
      )
      return true
    },
    handleDOMEvents: {
      focus: () => {
        emit('focus')
        return false
      },
      blur: () => {
        flushChange()
        emit('blur')
        return false
      },
    },
    dispatchTransaction(tr: Transaction) {
      view.updateState(view.state.apply(tr))
      if (tr.docChanged && !tr.getMeta(STREAM_META)) {
        if (changeDelay > 0) {
          cancelChange()
          changeTimer = setTimeout(notifyChange, changeDelay)
        } else {
          notifyChange()
        }
      }
      if (tr.docChanged || tr.selectionSet) emit('selectionChange')
    },
  })

  if (options.autofocus) view.focus()

  // Applies the current editable state to the view and to checkbox inputs.
  const refreshEditable = (): void => {
    view.setProps({})
    view.dom.querySelectorAll<HTMLInputElement>('input.lme-check-input').forEach((input) => {
      input.disabled = !view.editable
    })
  }

  const stream = (streamOptions: StreamOptions = {}): StreamWriter => {
    // Report a pending user edit first, so it is not mixed with streamed content.
    flushChange()
    active?.end()
    const writer = createStream(view, streamOptions, {
      parse,
      toSlice,
      getMarkdown,
      onDone: () => {
        if (active === writer) active = null
        refreshEditable()
        emit('streamEnd', getMarkdown())
      },
    })
    active = writer
    refreshEditable()
    emit('streamStart')
    return writer
  }

  async function* chunks(source: TextSource, stop: { cancel?: () => void }): AsyncGenerator<string> {
    const decoder = new TextDecoder()
    const text = (chunk: string | Uint8Array) =>
      typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true })
    if ('getReader' in source) {
      const reader = source.getReader()
      // Cancelling also ends a read that is waiting on a stalled source.
      stop.cancel = () => void reader.cancel().catch(() => {})
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          yield text(value)
        }
      } finally {
        stop.cancel()
      }
    } else {
      for await (const chunk of source) yield text(chunk)
    }
    const rest = decoder.decode()
    if (rest) yield rest
  }

  return {
    commands: createCommands(view),
    view,
    getMarkdown,
    setMarkdown(markdown) {
      cancelChange()
      view.updateState(createState(markdown))
      // Detach after the swap, so streamEnd reports the new document.
      active?.detach()
      emit('selectionChange')
    },
    setEditable(value) {
      editable = value
      refreshEditable()
    },
    isEditable: () => editable,
    focus: () => view.focus(),
    isActive: (name, attrs) => isActive(view.state, name, attrs),
    stream,
    async streamFrom(source, streamOptions = {}) {
      const { signal, ...rest } = streamOptions
      if (signal?.aborted) return getMarkdown()
      const writer = stream(rest)
      let onAbort = (): void => {}
      const aborted = new Promise<typeof ABORTED>((resolve) => {
        onAbort = () => {
          writer.abort()
          stop.cancel?.()
          resolve(ABORTED)
        }
        signal?.addEventListener('abort', onAbort, { once: true })
      })
      const stop: { cancel?: () => void } = {}
      const iterator = chunks(source, stop)
      try {
        for (;;) {
          const next = await Promise.race([iterator.next(), aborted])
          if (next === ABORTED || next.done || writer.done) break
          writer.write(next.value)
        }
      } catch (error) {
        writer.abort()
        throw error
      } finally {
        signal?.removeEventListener('abort', onAbort)
        // Stops the source. Not awaited: a stalled source may never settle.
        stop.cancel?.()
        void iterator.return(undefined).catch(() => {})
      }
      if (writer.done) return getMarkdown()
      return writer.end()
    },
    isStreaming: () => active !== null,
    on(event, handler) {
      let set = listeners.get(event)
      if (!set) listeners.set(event, (set = new Set()))
      set.add(handler)
      return () => {
        set.delete(handler)
      }
    },
    destroy() {
      active?.detach()
      flushChange()
      view.destroy()
      listeners.clear()
    },
  }
}
