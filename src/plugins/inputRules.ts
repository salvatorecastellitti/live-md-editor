import { InputRule, inputRules, textblockTypeInputRule, wrappingInputRule } from 'prosemirror-inputrules'
import { Fragment, type MarkType } from 'prosemirror-model'
import { TextSelection, type Plugin } from 'prosemirror-state'
import { findWrapping } from 'prosemirror-transform'
import { schema, type CheckKind } from '../schema'

const { nodes, marks } = schema

/** `**text**` style rule: removes the delimiters and marks the text. */
function markRule(pattern: RegExp, type: MarkType): InputRule {
  return new InputRule(
    pattern,
    (state, match, start, end) => {
      const text = match[1]!
      const textStart = start + match[0].indexOf(text)
      const textEnd = textStart + text.length
      const tr = state.tr
      tr.delete(textEnd, end)
      tr.delete(start, textStart)
      tr.addMark(start, start + text.length, type.create())
      tr.removeStoredMark(type)
      return tr
    },
    { inCodeMark: false },
  )
}

/** `[ ] ` or `( ) ` at the start of a line makes a task or radio item. */
function checkItemRule(pattern: RegExp, check: Exclude<CheckKind, null>): InputRule {
  return new InputRule(
    pattern,
    (state, match, start, end) => {
      const checked = (match[1] ?? ' ').toLowerCase() === 'x'
      const $start = state.doc.resolve(start)
      if ($start.parent.type !== nodes.paragraph) return null
      const tr = state.tr.delete(start, end)
      const itemDepth = $start.depth - 1
      if (itemDepth > 0 && $start.node(itemDepth).type === nodes.list_item && $start.index(itemDepth) === 0) {
        tr.setNodeMarkup($start.before(itemDepth), undefined, { check, checked })
        return tr
      }
      const range = tr.doc.resolve(start).blockRange()
      const wrapping = range && findWrapping(range, nodes.bullet_list)
      if (!range || !wrapping) return null
      const [list, item] = wrapping
      if (!list || item?.type !== nodes.list_item) return null
      tr.wrap(range, [list, { type: nodes.list_item, attrs: { check, checked } }, ...wrapping.slice(2)])
      return tr
    },
    { inCodeMark: false },
  )
}

const horizontalRule = new InputRule(
  /^(?:---|___|\*\*\*)$/,
  (state, _match, start, end) => {
    const $start = state.doc.resolve(start)
    const paragraph = $start.parent
    if (paragraph.type !== nodes.paragraph || end !== $start.end()) return null
    const replacement = Fragment.from([nodes.horizontal_rule.create(), nodes.paragraph.create()])
    const container = $start.node(-1)
    if (!container.canReplace($start.index(-1), $start.indexAfter(-1), replacement)) return null
    const tr = state.tr.replaceWith($start.before(), $start.after(), replacement)
    return tr.setSelection(TextSelection.create(tr.doc, $start.before() + 2))
  },
  { inCodeMark: false },
)

export interface InputRuleOptions {
  radio: boolean
}

/** Live markdown shortcuts: typing the syntax turns into the formatted result. */
export function markdownInputRules(options: InputRuleOptions): Plugin {
  const rules = [
    textblockTypeInputRule(/^(#{1,6})\s$/, nodes.heading, (match) => ({ level: match[1]!.length })),
    wrappingInputRule(/^\s*>\s$/, nodes.blockquote),
    checkItemRule(/^\[([ xX]?)\]\s$/, 'task'),
    wrappingInputRule(/^\s*[-+*]\s$/, nodes.bullet_list),
    wrappingInputRule(
      /^(\d+)\.\s$/,
      nodes.ordered_list,
      (match) => ({ order: Number(match[1]) }),
      (match, node) => node.childCount + (node.attrs.order as number) === Number(match[1]),
    ),
    textblockTypeInputRule(/^```([\w-]*)\s$/, nodes.code_block, (match) => ({ language: match[1] ?? '' })),
    horizontalRule,
    markRule(/(?<![*\w])\*\*([^*\s](?:[^*]*[^*\s])?)\*\*$/, marks.strong),
    markRule(/(?<![_\w])__([^_\s](?:[^_]*[^_\s])?)__$/, marks.strong),
    markRule(/(?<![*\w])\*([^*\s](?:[^*]*[^*\s])?)\*$/, marks.em),
    markRule(/(?<![_\w])_([^_\s](?:[^_]*[^_\s])?)_$/, marks.em),
    markRule(/(?<![~\w])~~([^~\s](?:[^~]*[^~\s])?)~~$/, marks.strike),
    markRule(/(?<![`\w])`([^`]+)`$/, marks.code),
  ]
  if (options.radio) rules.splice(3, 0, checkItemRule(/^\(([ xX]?)\)\s$/, 'radio'))
  return inputRules({ rules })
}
