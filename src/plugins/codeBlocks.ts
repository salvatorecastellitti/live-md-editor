import type { Node } from 'prosemirror-model'
import { Plugin, type PluginKey, type Transaction } from 'prosemirror-state'
import { DecorationSet, type Decoration, type EditorView } from 'prosemirror-view'

/** Meta value that makes a code block plugin rebuild all its decorations. */
export const REFRESH = 'refresh'

/** Ranges of `tr.doc` that the transaction changed. */
function changedRanges(tr: Transaction): { from: number; to: number }[] {
  const ranges: { from: number; to: number }[] = []
  tr.mapping.maps.forEach((map, index) => {
    const after = tr.mapping.slice(index + 1)
    map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      ranges.push({ from: after.map(newStart, -1), to: after.map(newEnd, 1) })
    })
  })
  return ranges
}

function build(doc: Node, decorate: (node: Node, pos: number) => Decoration[]): DecorationSet {
  const decorations: Decoration[] = []
  doc.descendants((node, pos) => {
    if (node.type.name !== 'code_block') return true
    decorations.push(...decorate(node, pos))
    return false
  })
  return DecorationSet.create(doc, decorations)
}

/**
 * A plugin that keeps decorations on every code block, rebuilding only the
 * blocks a transaction touched (so large documents stay fast).
 */
export function codeBlockPlugin(
  key: PluginKey<DecorationSet>,
  decorate: (node: Node, pos: number) => Decoration[],
  onView?: (view: EditorView | null) => void,
): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key,
    state: {
      init: (_config, state) => build(state.doc, decorate),
      apply(tr, set) {
        if (tr.getMeta(key) === REFRESH) return build(tr.doc, decorate)
        if (!tr.docChanged) return set
        let next = set.map(tr.mapping, tr.doc)
        const seen = new Set<number>()
        const rebuild = (from: number, to: number): void => {
          tr.doc.nodesBetween(Math.max(0, from), Math.min(tr.doc.content.size, to), (node, pos) => {
            if (node.type.name !== 'code_block') return true
            if (!seen.has(pos)) {
              seen.add(pos)
              next = next.remove(next.find(pos, pos + node.nodeSize)).add(tr.doc, decorate(node, pos))
            }
            return false
          })
        }
        const ranges = changedRanges(tr)
        // Drop whatever decorated the changed ranges (it may no longer be a code block),
        // and rebuild any code block those decorations belonged to.
        const spans: { from: number; to: number }[] = []
        for (const { from, to } of ranges) {
          const stale = next.find(from - 1, to + 1)
          spans.push(...stale.map((decoration) => ({ from: decoration.from, to: decoration.to })))
          next = next.remove(stale) // note: remove() empties the array it is given
        }
        for (const { from, to } of ranges) rebuild(from - 1, to + 1)
        for (const { from, to } of spans) rebuild(from, to)
        return next
      },
    },
    view(view) {
      onView?.(view)
      return { destroy: () => onView?.(null) }
    },
    props: {
      decorations: (state) => key.getState(state),
    },
  })
}
