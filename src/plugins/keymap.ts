import { baseKeymap, chainCommands, exitCode, setBlockType, toggleMark } from 'prosemirror-commands'
import { redo, undo } from 'prosemirror-history'
import { keymap } from 'prosemirror-keymap'
import { liftListItem, sinkListItem, splitListItem } from 'prosemirror-schema-list'
import type { Command, Plugin } from 'prosemirror-state'
import { addRowAfter, goToNextCell, isInTable } from 'prosemirror-tables'
import { schema } from '../schema'

const { nodes, marks } = schema

/** Enter in a list item. The new item starts unchecked. */
const splitItem: Command = (state, dispatch) =>
  splitListItem(nodes.list_item)(
    state,
    dispatch &&
      ((tr) => {
        const $pos = tr.selection.$from
        for (let depth = $pos.depth; depth > 0; depth--) {
          const node = $pos.node(depth)
          if (node.type === nodes.list_item) {
            if (node.attrs.checked)
              tr.setNodeMarkup($pos.before(depth), undefined, { ...node.attrs, checked: false })
            break
          }
        }
        dispatch(tr)
      }),
  )

/**
 * Backspace at the very start of a block undoes its formatting first:
 * a task or radio item loses its box, a heading or code block becomes a paragraph.
 */
const unformatBlock: Command = (state, dispatch) => {
  const { $cursor } = state.selection as { $cursor?: import('prosemirror-model').ResolvedPos | null }
  if (!$cursor || $cursor.parentOffset > 0) return false
  const parent = $cursor.parent
  if (parent.type === nodes.heading || parent.type === nodes.code_block) {
    return setBlockType(nodes.paragraph)(state, dispatch)
  }
  const itemDepth = $cursor.depth - 1
  const item = itemDepth > 0 ? $cursor.node(itemDepth) : null
  if (item?.type === nodes.list_item && item.attrs.check && $cursor.index(itemDepth) === 0) {
    dispatch?.(state.tr.setNodeMarkup($cursor.before(itemDepth), undefined, { check: null, checked: false }))
    return true
  }
  return false
}

/** Typing ```lang then Enter turns the paragraph into a code block. */
const codeFenceOnEnter: Command = (state, dispatch) => {
  const { $cursor } = state.selection as { $cursor?: import('prosemirror-model').ResolvedPos | null }
  if (!$cursor || $cursor.parent.type !== nodes.paragraph) return false
  const match = /^```([\w-]*)$/.exec($cursor.parent.textContent)
  if (!match || $cursor.parentOffset !== $cursor.parent.content.size) return false
  if (!dispatch) return true
  const tr = state.tr.delete($cursor.start(), $cursor.end())
  tr.setBlockType($cursor.start(), $cursor.start(), nodes.code_block, { language: match[1] ?? '' })
  dispatch(tr)
  return true
}

/** Tab moves to the next table cell and adds a row after the last one. */
const nextCell: Command = (state, dispatch, view) => {
  if (!isInTable(state)) return false
  if (goToNextCell(1)(state, dispatch)) return true
  if (!dispatch || !view) return true
  addRowAfter(state, dispatch)
  goToNextCell(1)(view.state, view.dispatch)
  return true
}

/** Table cells hold one line in markdown, so Enter does nothing there. */
const ignoreInTable: Command = (state) => isInTable(state)

const hardBreak: Command = (state, dispatch) => {
  if (state.selection.$from.parent.type.spec.code || isInTable(state)) return false
  dispatch?.(state.tr.replaceSelectionWith(nodes.hard_break.create()).scrollIntoView())
  return true
}

export interface KeymapOptions {
  onLinkShortcut: () => void
}

/** Editor key bindings. `Mod` is Cmd on Apple platforms and Ctrl elsewhere. */
export function markdownKeymaps(options: KeymapOptions): Plugin[] {
  const bindings: Record<string, Command> = {
    'Mod-b': toggleMark(marks.strong),
    'Mod-i': toggleMark(marks.em),
    'Mod-Shift-x': toggleMark(marks.strike),
    'Mod-e': toggleMark(marks.code),
    'Mod-k': () => {
      options.onLinkShortcut()
      return true
    },
    'Mod-z': undo,
    'Shift-Mod-z': redo,
    'Mod-y': redo,
    Enter: chainCommands(ignoreInTable, codeFenceOnEnter, splitItem),
    'Shift-Enter': chainCommands(exitCode, hardBreak),
    Backspace: unformatBlock,
    Tab: chainCommands(nextCell, sinkListItem(nodes.list_item)),
    'Shift-Tab': chainCommands(
      (state, dispatch) => isInTable(state) && goToNextCell(-1)(state, dispatch),
      liftListItem(nodes.list_item),
    ),
    'Mod-]': sinkListItem(nodes.list_item),
    'Mod-[': liftListItem(nodes.list_item),
  }
  return [keymap(bindings), keymap(baseKeymap)]
}
