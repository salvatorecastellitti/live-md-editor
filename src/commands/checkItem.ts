import type { Command } from 'prosemirror-state'
import type { Node } from 'prosemirror-model'

/**
 * Toggles the task or radio item at `pos` (the position right before the
 * list item). A radio item becomes checked and every other radio item in
 * the same run of consecutive radio items becomes unchecked.
 */
export function toggleCheckItem(pos: number): Command {
  return (state, dispatch) => {
    if (pos < 0 || pos >= state.doc.content.size) return false
    const item = state.doc.nodeAt(pos)
    if (!item || item.type.name !== 'list_item' || !item.attrs.check) return false
    const $pos = state.doc.resolve(pos)
    const tr = state.tr
    if (item.attrs.check === 'task') {
      tr.setNodeMarkup(pos, undefined, { ...item.attrs, checked: !item.attrs.checked })
    } else {
      if (item.attrs.checked) return false
      const list = $pos.parent
      const index = $pos.index()
      let start = index
      while (start > 0 && list.child(start - 1).attrs.check === 'radio') start--
      let end = index
      while (end < list.childCount - 1 && list.child(end + 1).attrs.check === 'radio') end++
      let childPos = $pos.start()
      list.forEach((child: Node, _offset, i) => {
        if (i >= start && i <= end) {
          const checked = i === index
          if (child.attrs.checked !== checked)
            tr.setNodeMarkup(childPos, undefined, { ...child.attrs, checked })
        }
        childPos += child.nodeSize
      })
    }
    dispatch?.(tr)
    return true
  }
}
