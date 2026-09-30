// jsdom has no layout engine. ProseMirror measures the selection to scroll
// it into view, so give it empty rects to measure.
const emptyRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList
const emptyRect = () =>
  ({ x: 0, y: 0, top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0, toJSON: () => ({}) }) as DOMRect
if (typeof document !== 'undefined') {
  for (const proto of [Element.prototype, Range.prototype, Text.prototype as unknown as Element]) {
    proto.getClientRects ??= emptyRects
    proto.getBoundingClientRect ??= emptyRect
  }
  document.elementFromPoint ??= () => null
}

// jsdom has no ClipboardEvent; ProseMirror's pasteHTML/pasteText create one.
if (typeof window !== 'undefined' && !('ClipboardEvent' in window)) {
  class ClipboardEventShim extends Event {
    readonly clipboardData: DataTransfer | null = null
  }
  Object.assign(window, { ClipboardEvent: ClipboardEventShim })
}
