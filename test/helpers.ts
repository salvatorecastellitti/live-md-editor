import { history } from 'prosemirror-history'
import type { Node } from 'prosemirror-model'
import { EditorState, TextSelection, type Plugin } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { createParser } from '../src/markdown/parser'
import { serializeMarkdown } from '../src/markdown/serializer'
import { ListItemView } from '../src/views/listItem'

/** A fresh element attached to the document, for mounting an editor. */
export function mount(): HTMLElement {
  document.body.innerHTML = ''
  const element = document.createElement('div')
  document.body.append(element)
  return element
}

/**
 * A bare ProseMirror view over `markdown` with undo history, the list item
 * node view and the given plugins. Lets each module be tested on its own.
 */
export function createView(
  markdown: string,
  plugins: Plugin[] = [],
  options: { radio?: boolean; editable?: boolean } = {},
): EditorView {
  const parse = createParser({ radio: options.radio ?? true })
  return new EditorView(mount(), {
    state: EditorState.create({ doc: parse(markdown), plugins: [...plugins, history()] }),
    editable: () => options.editable ?? true,
    nodeViews: { list_item: (node, view, getPos) => new ListItemView(node, view, getPos) },
  })
}

/** The view's document as markdown. */
export function markdownOf(view: EditorView): string {
  return serializeMarkdown(view.state.doc)
}

/** Types `text` one character at a time, running input rules like a real keyboard. */
export function type(view: EditorView, text: string): void {
  for (const char of text) {
    const { from, to } = view.state.selection
    const handled = view.someProp('handleTextInput', (f) =>
      f(view, from, to, char, () => view.state.tr.insertText(char, from, to)),
    )
    if (!handled) view.dispatch(view.state.tr.insertText(char, from, to))
  }
}

/** Sends a key through the view's keymaps. Returns whether a binding handled it. */
export function press(
  view: EditorView,
  key: string,
  mods: { ctrl?: boolean; shift?: boolean } = {},
): boolean {
  const event = new KeyboardEvent('keydown', {
    key,
    ctrlKey: mods.ctrl ?? false,
    shiftKey: mods.shift ?? false,
    bubbles: true,
    cancelable: true,
  })
  return !!view.someProp('handleKeyDown', (f) => f(view, event))
}

/** Puts the cursor right after the first occurrence of `needle` (use '' for the document start). */
export function cursorAfter(view: EditorView, needle: string): void {
  let target = -1
  view.state.doc.descendants((node, pos) => {
    if (target < 0 && node.isText && node.text!.includes(needle)) {
      target = pos + node.text!.indexOf(needle) + needle.length
    }
  })
  if (target < 0) throw new Error(`text not found: ${needle}`)
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, target)))
}

/** Selects the first occurrence of `needle`. */
export function select(view: EditorView, needle: string): void {
  cursorAfter(view, needle)
  const to = view.state.selection.from
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, to - needle.length, to)))
}

/** Markdown syntax that should never be visible as text in a rendered document. */
export const RAW_SYNTAX = /\*\*|~~|`|\]\(|!\[|\|\s*-/

/** The text a reader sees, leaving out code (where any character is legitimate). */
export function visibleText(doc: Node): string {
  let text = ''
  doc.descendants((node) => {
    if (node.type.spec.code) return false
    if (node.isText && !node.marks.some((mark) => mark.type.spec.code)) text += node.text
    return true
  })
  return text
}

/** Dispatches a paste event carrying the given clipboard data, like a real browser paste. */
export function paste(view: EditorView, data: { text?: string; html?: string; types?: string[] }): void {
  const values: Record<string, string> = { 'text/plain': data.text ?? '', 'text/html': data.html ?? '' }
  const event = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', {
    value: {
      types: data.types ?? Object.keys(values).filter((type) => values[type]),
      getData: (type: string) => values[type] ?? '',
    },
  })
  view.dom.dispatchEvent(event)
}
