import { Plugin } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'

/** Shows `text` in the first paragraph while the document is empty. */
export function placeholder(text: string): Plugin {
  return new Plugin({
    props: {
      decorations(state) {
        const first = state.doc.firstChild
        const empty =
          state.doc.childCount === 1 && first?.type.name === 'paragraph' && first.content.size === 0
        if (!empty) return null
        return DecorationSet.create(state.doc, [
          Decoration.node(0, first.nodeSize, { class: 'lme-empty', 'data-placeholder': text }),
        ])
      },
    },
  })
}
