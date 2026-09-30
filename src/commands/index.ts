import { lift, setBlockType, toggleMark, wrapIn } from 'prosemirror-commands'
import { redo, undo } from 'prosemirror-history'
import type { Mark, MarkType, NodeType, ResolvedPos } from 'prosemirror-model'
import { liftListItem, wrapInList } from 'prosemirror-schema-list'
import { TextSelection, type Command, type EditorState } from 'prosemirror-state'
import { addColumnAfter, addRowAfter, deleteColumn, deleteRow, deleteTable } from 'prosemirror-tables'
import { liftTarget } from 'prosemirror-transform'
import type { EditorView } from 'prosemirror-view'
import { schema, type CheckKind } from '../schema'
import { isSafeUrl } from '../url'

const { nodes, marks } = schema

/** The contiguous run of text carrying the same `type` mark around `$pos`. */
export function markExtent(
  $pos: ResolvedPos,
  type: MarkType,
): { from: number; to: number; mark: Mark } | null {
  const offset = $pos.parentOffset
  let run: { from: number; to: number; mark: Mark } | null = null
  let pos = 0
  for (let i = 0; i < $pos.parent.childCount; i++) {
    const child = $pos.parent.child(i)
    const mark = type.isInSet(child.marks)
    const end = pos + child.nodeSize
    if (run && (!mark || !run.mark.eq(mark)) && run.from <= offset && offset <= run.to) break
    if (!mark) run = null
    else if (run && run.to === pos && run.mark.eq(mark)) run.to = end
    else run = { from: pos, to: end, mark }
    pos = end
  }
  if (!run || offset < run.from || offset > run.to) return null
  return { from: $pos.start() + run.from, to: $pos.start() + run.to, mark: run.mark }
}

function isList(type: NodeType): boolean {
  return type === nodes.bullet_list || type === nodes.ordered_list
}

/** Innermost list around the selection start, with the item holding it. */
function currentList(state: EditorState) {
  const { $from } = state.selection
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth)
    if (isList(node.type)) return { list: node, item: $from.node(depth + 1) }
  }
  return null
}

function toggleList(listType: NodeType, check: CheckKind): Command {
  return (state, dispatch) => {
    const { $from, $to } = state.selection
    const range = $from.blockRange($to, (node) => isList(node.type))
    if (range) {
      const list = range.parent
      let sameKind = list.type === listType
      for (let i = range.startIndex; i < range.endIndex; i++) {
        if (list.child(i).attrs.check !== check) sameKind = false
      }
      if (sameKind) return liftListItem(nodes.list_item)(state, dispatch)
      if (dispatch) {
        const tr = state.tr
        const listPos = $from.before(range.depth)
        const listAttrs =
          listType === nodes.ordered_list
            ? { order: 1, tight: list.attrs.tight }
            : { tight: list.attrs.tight }
        tr.setNodeMarkup(listPos, listType, listAttrs)
        let pos = range.start
        for (let i = range.startIndex; i < range.endIndex; i++) {
          const item = list.child(i)
          const checked = item.attrs.check === check ? item.attrs.checked : false
          tr.setNodeMarkup(pos, undefined, { check, checked })
          pos += item.nodeSize
        }
        dispatch(tr)
      }
      return true
    }
    return wrapInList(listType)(
      state,
      dispatch &&
        ((tr) => {
          if (check) {
            const $pos = tr.selection.$from
            for (let depth = $pos.depth; depth > 0; depth--) {
              const node = $pos.node(depth)
              if (!isList(node.type)) continue
              let pos = $pos.start(depth)
              const { from, to } = tr.selection
              node.forEach((item) => {
                const end = pos + item.nodeSize
                if (pos <= to && end >= from) tr.setNodeMarkup(pos, undefined, { check, checked: false })
                pos = end
              })
              break
            }
          }
          dispatch(tr)
        }),
    )
  }
}

const toggleBlockquote: Command = (state, dispatch) => {
  const { $from, $to } = state.selection
  const range = $from.blockRange($to, (node) => node.type === nodes.blockquote)
  if (range) {
    const target = liftTarget(range)
    if (target === null) return false
    dispatch?.(state.tr.lift(range, target).scrollIntoView())
    return true
  }
  return wrapIn(nodes.blockquote)(state, dispatch) || lift(state, dispatch)
}

function setLink(href: string): Command {
  return (state, dispatch) => {
    if (!isSafeUrl(href) || state.selection.$from.parent.type.spec.code) return false
    const type = marks.link
    const mark = type.create({ href })
    let { from, to } = state.selection
    if (state.selection.empty) {
      const extent = markExtent(state.selection.$from, type)
      if (!extent) {
        dispatch?.(state.tr.replaceSelectionWith(schema.text(href, [mark]), false).scrollIntoView())
        return true
      }
      ;({ from, to } = extent)
    }
    dispatch?.(state.tr.removeMark(from, to, type).addMark(from, to, mark))
    return true
  }
}

const unsetLink: Command = (state, dispatch) => {
  const type = marks.link
  let { from, to } = state.selection
  if (state.selection.empty) {
    const extent = markExtent(state.selection.$from, type)
    if (!extent) return false
    ;({ from, to } = extent)
  } else if (!state.doc.rangeHasMark(from, to, type)) {
    return false
  }
  dispatch?.(state.tr.removeMark(from, to, type))
  return true
}

function insertBlock(create: () => import('prosemirror-model').Node | null): Command {
  return (state, dispatch) => {
    const node = create()
    if (!node) return false
    const tr = state.tr.replaceSelectionWith(node)
    if (!tr.doc.eq(state.doc)) {
      dispatch?.(tr.scrollIntoView())
      return true
    }
    return false
  }
}

function createTable(rows: number, cols: number) {
  if (rows < 1 || cols < 1) return null
  const row = (cell: NodeType) =>
    nodes.table_row.create(
      null,
      Array.from({ length: cols }, () => cell.create()),
    )
  return nodes.table.create(null, [
    row(nodes.table_header),
    ...Array.from({ length: rows - 1 }, () => row(nodes.table_cell)),
  ])
}

/** Commands exposed on `editor.commands`. Each returns true when it applied. */
export interface Commands {
  /** Toggles bold on the selection, or for the next typed text. */
  toggleBold(): boolean
  /** Toggles italic. */
  toggleItalic(): boolean
  /** Toggles strikethrough. */
  toggleStrike(): boolean
  /** Toggles inline code. */
  toggleCode(): boolean
  /**
   * Links the selection to `href`. With an empty selection it updates the link under the
   * cursor, or inserts `href` as linked text. Returns false for unsafe URLs.
   */
  setLink(href: string): boolean
  /** Removes the link from the selection, or the whole link under the cursor. */
  unsetLink(): boolean
  /** Turns the current block into a paragraph. */
  setParagraph(): boolean
  /** Turns the current block into a heading. */
  setHeading(level: 1 | 2 | 3 | 4 | 5 | 6): boolean
  /** Wraps in a bullet list, converts another list kind to one, or unwraps it. */
  toggleBulletList(): boolean
  /** Wraps in a numbered list, converts another list kind to one, or unwraps it. */
  toggleOrderedList(): boolean
  /** Wraps in a task list (`- [ ]`), converts another list kind to one, or unwraps it. */
  toggleTaskList(): boolean
  /** Like `toggleTaskList`, with radio items (`- ( )`). Pair with `extensions.radio`. */
  toggleRadioList(): boolean
  /** Wraps the selection in a quote, or lifts it out of one. */
  toggleBlockquote(): boolean
  /** Turns the current block into a code block with an optional language. */
  setCodeBlock(language?: string): boolean
  /** Inserts a horizontal rule. */
  insertHorizontalRule(): boolean
  /** Inserts a table with a header row. Needs at least one row and one column. */
  insertTable(rows: number, cols: number): boolean
  /** Adds a table row below the selection. */
  addRowAfter(): boolean
  /** Adds a table column after the selection. */
  addColumnAfter(): boolean
  /** Deletes the selected table rows. */
  deleteRow(): boolean
  /** Deletes the selected table columns. */
  deleteColumn(): boolean
  /** Deletes the table around the selection. */
  deleteTable(): boolean
  /** Inserts an image. Returns false for unsafe URLs. */
  insertImage(src: string, alt?: string): boolean
  /** Undoes the last change. */
  undo(): boolean
  /** Redoes the last undone change. */
  redo(): boolean
}

/** Binds the command set to a view. Used by `createEditor`. */
export function createCommands(view: EditorView): Commands {
  const run = (command: Command): boolean => {
    const applied = command(view.state, view.dispatch, view)
    if (applied) view.focus()
    return applied
  }
  return {
    toggleBold: () => run(toggleMark(marks.strong)),
    toggleItalic: () => run(toggleMark(marks.em)),
    toggleStrike: () => run(toggleMark(marks.strike)),
    toggleCode: () => run(toggleMark(marks.code)),
    setLink: (href) => run(setLink(href)),
    unsetLink: () => run(unsetLink),
    setParagraph: () => run(setBlockType(nodes.paragraph)),
    setHeading: (level) => run(setBlockType(nodes.heading, { level })),
    toggleBulletList: () => run(toggleList(nodes.bullet_list, null)),
    toggleOrderedList: () => run(toggleList(nodes.ordered_list, null)),
    toggleTaskList: () => run(toggleList(nodes.bullet_list, 'task')),
    toggleRadioList: () => run(toggleList(nodes.bullet_list, 'radio')),
    toggleBlockquote: () => run(toggleBlockquote),
    setCodeBlock: (language = '') => run(setBlockType(nodes.code_block, { language })),
    insertHorizontalRule: () => run(insertBlock(() => nodes.horizontal_rule.create())),
    insertTable: (rows, cols) =>
      run((state, dispatch) => {
        const table = createTable(rows, cols)
        if (!table) return false
        if (dispatch) {
          const tr = state.tr.replaceSelectionWith(table)
          const $cell = tr.doc.resolve(tr.mapping.map(state.selection.from, -1))
          dispatch(tr.setSelection(TextSelection.near($cell)).scrollIntoView())
        }
        return true
      }),
    addRowAfter: () => run(addRowAfter),
    addColumnAfter: () => run(addColumnAfter),
    deleteRow: () => run(deleteRow),
    deleteColumn: () => run(deleteColumn),
    deleteTable: () => run(deleteTable),
    insertImage: (src, alt) =>
      run(isSafeUrl(src) ? insertBlock(() => nodes.image.create({ src, alt: alt ?? null })) : () => false),
    undo: () => run(undo),
    redo: () => run(redo),
  }
}

/** Names accepted by `editor.isActive()`. */
export type ActiveName =
  | 'bold'
  | 'italic'
  | 'strike'
  | 'code'
  | 'link'
  | 'paragraph'
  | 'heading'
  | 'bulletList'
  | 'orderedList'
  | 'taskList'
  | 'radioList'
  | 'blockquote'
  | 'codeBlock'
  | 'table'

const markNames: Partial<Record<ActiveName, 'strong' | 'em' | 'strike' | 'code' | 'link'>> = {
  bold: 'strong',
  italic: 'em',
  strike: 'strike',
  code: 'code',
  link: 'link',
}

function hasAncestor(state: EditorState, type: NodeType): boolean {
  const { $from } = state.selection
  for (let depth = $from.depth; depth > 0; depth--) if ($from.node(depth).type === type) return true
  return false
}

/** Whether a mark or block is active at the selection in `state`. */
export function isActive(state: EditorState, name: ActiveName, attrs: { level?: number } = {}): boolean {
  const markName = markNames[name]
  if (markName) {
    const type = marks[markName]
    const { from, to, empty, $from } = state.selection
    if (empty) return !!type.isInSet(state.storedMarks ?? $from.marks())
    return state.doc.rangeHasMark(from, to, type)
  }
  const { $from } = state.selection
  const list = currentList(state)
  switch (name) {
    case 'paragraph':
      return $from.parent.type === nodes.paragraph
    case 'heading':
      return (
        $from.parent.type === nodes.heading &&
        (attrs.level === undefined || $from.parent.attrs.level === attrs.level)
      )
    case 'codeBlock':
      return $from.parent.type === nodes.code_block
    case 'bulletList':
      return !!list && list.list.type === nodes.bullet_list && !list.item.attrs.check
    case 'orderedList':
      return list?.list.type === nodes.ordered_list
    case 'taskList':
      return list?.item.attrs.check === 'task'
    case 'radioList':
      return list?.item.attrs.check === 'radio'
    case 'blockquote':
      return hasAncestor(state, nodes.blockquote)
    case 'table':
      return hasAncestor(state, nodes.table)
    default:
      return false
  }
}
