import type { Node, Slice } from 'prosemirror-model'
import { Plugin, PluginKey, Selection, type Transaction } from 'prosemirror-state'
import type { Step } from 'prosemirror-transform'
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view'
import { healMarkdown } from './heal'
import { stableLength } from './stable'

/** Options for `editor.stream()` and `editor.streamFrom()`. */
export interface StreamOptions {
  /**
   * `'end'` (default) appends to the document, for AI replies. `'cursor'`
   * replaces the selection, for AI writing into an existing document.
   */
  at?: 'end' | 'cursor'
  /**
   * Keep the end of the stream in view unless the user has scrolled away.
   * Defaults to true for `'end'` and false for `'cursor'`.
   */
  autoScroll?: boolean
}

/** Feeds markdown into the editor as it arrives. Create one with `editor.stream()`. */
export interface StreamWriter {
  /** Adds the next piece of text. It is rendered on the next animation frame. */
  write(chunk: string): void
  /** Renders buffered text now instead of on the next frame. */
  flush(): void
  /** Finishes the stream: renders the exact final markdown as one undo step. Returns the document's markdown. */
  end(): string
  /** Stops early and keeps what has arrived, with unfinished syntax closed. Returns the document's markdown. */
  abort(): string
  /** True once `end()` or `abort()` has been called, or the stream was replaced. */
  readonly done: boolean
}

/** Marks transactions made by a stream, so the editor does not report them as edits. */
export const STREAM_META = 'lme:stream'

const caretKey = new PluginKey<number | null>('lme-stream-caret')

/** Shows a blinking caret where streamed text arrives, and marks the root while streaming. */
export function streamCaret(): Plugin<number | null> {
  return new Plugin<number | null>({
    key: caretKey,
    state: {
      init: () => null,
      apply(tr, caret) {
        const meta = tr.getMeta(caretKey) as number | null | undefined
        if (meta !== undefined) return meta
        return caret === null ? null : tr.mapping.map(caret)
      },
    },
    props: {
      decorations(state) {
        const caret = caretKey.getState(state)
        if (caret == null) return null
        const widget = Decoration.widget(
          caret,
          () => {
            const span = document.createElement('span')
            span.className = 'lme-stream-caret'
            span.setAttribute('aria-hidden', 'true')
            return span
          },
          { side: 1, key: 'lme-stream-caret' },
        )
        return DecorationSet.create(state.doc, [widget])
      },
      attributes(state): Record<string, string> {
        return caretKey.getState(state) == null ? {} : { class: 'lme-streaming', 'aria-busy': 'true' }
      },
    },
  })
}

/** End of the text just before `pos`, where the caret should sit. */
function caretBefore(doc: Node, pos: number): number {
  const selection = Selection.findFrom(doc.resolve(pos), -1, true)
  return selection ? selection.head : pos
}

function scrollContainer(element: HTMLElement): HTMLElement {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const { overflowY } = getComputedStyle(parent)
    if ((overflowY === 'auto' || overflowY === 'scroll') && parent.scrollHeight > parent.clientHeight)
      return parent
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement
}

export interface StreamHooks {
  parse: (markdown: string) => Node
  /** Markdown to a slice with paste semantics, for `at: 'cursor'`. */
  toSlice: (markdown: string) => Slice
  getMarkdown: () => string
  /** Called once when the stream finishes, is aborted or is detached. */
  onDone: () => void
}

/** A writer plus `detach()`, which the editor uses when it replaces the document mid-stream. */
export interface ActiveStream extends StreamWriter {
  /** Stops without touching the document. */
  detach(): void
}

/** The part of the document a stream owns, and how to put it back. */
interface Region {
  /** Where the caret sits before any text has arrived. */
  start: number
  apply(tr: Transaction, markdown: string, heal: boolean): number
  restore(tr: Transaction): void
}

/**
 * AI replies at the end of the document. Blocks that can no longer change
 * are frozen, so each frame only re-parses the growing tail.
 */
function endRegion(view: EditorView, parse: (markdown: string) => Node): Region {
  const doc = view.state.doc
  const empty = doc.childCount === 1 && doc.firstChild!.isTextblock && doc.firstChild!.content.size === 0
  const from = empty ? 0 : doc.content.size
  const original = doc.slice(from, doc.content.size)
  let tailFrom = from
  let frozenLength = 0

  return {
    start: caretBefore(doc, doc.content.size),
    apply(tr, markdown, heal) {
      const rest = markdown.slice(frozenLength)
      const stable = heal ? stableLength(rest) : 0
      const nodes: Node[] = []
      if (stable > 0) parse(rest.slice(0, stable)).forEach((node) => nodes.push(node))
      const frozenSize = nodes.reduce((size, node) => size + node.nodeSize, 0)
      const tail = rest.slice(stable)
      if (tail.trim()) parse(heal ? healMarkdown(tail) : tail).forEach((node) => nodes.push(node))
      if (nodes.length === 0 && tailFrom === 0) nodes.push(tr.doc.type.schema.nodes.paragraph!.create())
      tr.replaceWith(tailFrom, tr.doc.content.size, nodes)
      tailFrom += frozenSize
      frozenLength += stable
      return caretBefore(tr.doc, tr.doc.content.size)
    },
    restore(tr) {
      tr.replace(from, tr.doc.content.size, original)
      tailFrom = from
      frozenLength = 0
    },
  }
}

/**
 * AI writing at the cursor. Each frame puts the whole streamed text in
 * place of the selection exactly the way a paste would, so the result
 * never jumps when the stream ends.
 */
function cursorRegion(view: EditorView, toSlice: (markdown: string) => Slice): Region {
  const { from, to } = view.state.selection
  let steps: Step[] = []
  let docs: Node[] = []

  const restore = (tr: Transaction): void => {
    for (let i = steps.length - 1; i >= 0; i--) tr.step(steps[i]!.invert(docs[i]!))
    steps = []
    docs = []
  }

  return {
    start: to,
    apply(tr, markdown, heal) {
      restore(tr)
      const start = tr.steps.length
      tr.replaceRange(from, to, toSlice(heal ? healMarkdown(markdown) : markdown))
      steps = tr.steps.slice(start)
      docs = tr.docs.slice(start)
      return caretBefore(tr.doc, tr.mapping.slice(start).map(to, 1))
    },
    restore,
  }
}

/** Starts a stream on `view`. Used by `editor.stream()`. */
export function createStream(view: EditorView, options: StreamOptions, hooks: StreamHooks): ActiveStream {
  const at = options.at ?? 'end'
  const autoScroll = options.autoScroll ?? at === 'end'
  const region = at === 'end' ? endRegion(view, hooks.parse) : cursorRegion(view, hooks.toSlice)
  let buffer = ''
  let rendered = ''
  let frame: number | undefined
  let done = false
  // Show the caret and the streaming state right away, before any text arrives.
  view.dispatch(
    view.state.tr.setMeta(STREAM_META, true).setMeta('addToHistory', false).setMeta(caretKey, region.start),
  )

  const render = (): void => {
    frame = undefined
    if (done || buffer === rendered) return
    const scroller = autoScroll ? scrollContainer(view.dom) : null
    const nearBottom = scroller
      ? scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 48
      : false
    const tr = view.state.tr.setMeta(STREAM_META, true).setMeta('addToHistory', false)
    const caret = region.apply(tr, buffer, true)
    tr.setMeta(caretKey, caret)
    view.dispatch(tr)
    rendered = buffer
    if (scroller && nearBottom) scroller.scrollTop = scroller.scrollHeight
  }

  const cancelFrame = (): void => {
    if (frame !== undefined) cancelAnimationFrame(frame)
    frame = undefined
  }

  const finish = (heal: boolean): void => {
    if (done) return
    cancelFrame()
    done = true
    // Put the document back as it was, without recording history...
    const restore = view.state.tr
      .setMeta(STREAM_META, true)
      .setMeta('addToHistory', false)
      .setMeta(caretKey, null)
    region.restore(restore)
    view.dispatch(restore)
    // ...then insert the final result as a single, undoable edit.
    const final = view.state.tr
    const markdown = heal ? healMarkdown(buffer) : buffer
    if (markdown) region.apply(final, markdown, false)
    view.dispatch(final.scrollIntoView())
    hooks.onDone()
  }

  return {
    write(chunk) {
      if (done || !chunk) return
      buffer += chunk
      frame ??= requestAnimationFrame(render)
    },
    flush() {
      cancelFrame()
      render()
    },
    end() {
      finish(false)
      return hooks.getMarkdown()
    },
    abort() {
      finish(true)
      return hooks.getMarkdown()
    },
    detach() {
      if (done) return
      cancelFrame()
      done = true
      hooks.onDone()
    },
    get done() {
      return done
    },
  }
}
