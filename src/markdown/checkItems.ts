import type MarkdownIt from 'markdown-it'

const TASK_MARKER = /^\[([ xX])\](?:\s+|$)/
const RADIO_MARKER = /^\(([ xX])\)(?:\s+|$)/

export interface CheckItemsOptions {
  /** Also recognise `( )` and `(x)` radio markers. */
  radio: boolean
}

/**
 * markdown-it plugin: turns `- [ ] text` (and `- ( ) text` when radio is on)
 * into list items carrying `meta.check` and `meta.checked`, and removes
 * the marker from the item text.
 */
export function checkItems(md: MarkdownIt, options: CheckItemsOptions): void {
  md.core.ruler.after('inline', 'lme_check_items', (state) => {
    const tokens = state.tokens
    for (let i = 0; i < tokens.length - 2; i++) {
      const item = tokens[i]!
      const paragraph = tokens[i + 1]!
      const inline = tokens[i + 2]!
      if (item.type !== 'list_item_open' || paragraph.type !== 'paragraph_open' || inline.type !== 'inline') {
        continue
      }
      let check: 'task' | 'radio' = 'task'
      let match = TASK_MARKER.exec(inline.content)
      if (!match && options.radio) {
        check = 'radio'
        match = RADIO_MARKER.exec(inline.content)
      }
      if (!match) continue
      const first = inline.children?.[0]
      if (!first || first.type !== 'text' || !first.content.startsWith(match[0])) continue
      first.content = first.content.slice(match[0].length)
      inline.content = inline.content.slice(match[0].length)
      item.meta = { check, checked: match[1] !== ' ' }
    }
    return false
  })
}
