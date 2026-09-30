import type { Node } from 'prosemirror-model'
import { PluginKey, type Plugin } from 'prosemirror-state'
import { Decoration, type DecorationSet, type EditorView } from 'prosemirror-view'
import { codeBlockPlugin, REFRESH } from './codeBlocks'

/** A coloured range inside a code block, as character offsets into its code. */
export interface HighlightToken {
  from: number
  to: number
  /** Class names for the range, for example `hljs-keyword`. */
  className: string
}

/**
 * Colours code. Receives the code and its language (as written after the
 * opening fence) and returns token ranges, `null` for "leave it plain", or a
 * promise of either (for example while a language loads).
 */
export type Highlighter = (
  code: string,
  language: string,
) => HighlightToken[] | null | Promise<HighlightToken[] | null>

const key = new PluginKey<DecorationSet>('lme-highlight')
const CACHE_SIZE = 200

/** Colours code blocks that have a language, using `highlighter`. Results are cached. */
export function highlightPlugin(highlighter: Highlighter): Plugin<DecorationSet> {
  const cache = new Map<string, HighlightToken[] | null>()
  const pending = new Set<string>()
  let view: EditorView | null = null

  const store = (id: string, tokens: HighlightToken[] | null): void => {
    cache.set(id, tokens)
    if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!)
  }

  const tokensFor = (code: string, language: string): HighlightToken[] | null => {
    const id = `${language}\u0000${code}`
    if (cache.has(id)) return cache.get(id)!
    if (pending.has(id)) return null
    let result: ReturnType<Highlighter>
    try {
      result = highlighter(code, language)
    } catch {
      store(id, null)
      return null
    }
    if (!(result instanceof Promise)) {
      store(id, result)
      return result
    }
    pending.add(id)
    result
      .then(
        (tokens) => store(id, tokens),
        () => store(id, null),
      )
      .finally(() => {
        pending.delete(id)
        view?.dispatch(view.state.tr.setMeta(key, REFRESH))
      })
    return null
  }

  const decorate = (node: Node, pos: number): Decoration[] => {
    const language = node.attrs.language as string
    if (!language || !node.textContent) return []
    const size = node.content.size
    return (tokensFor(node.textContent, language) ?? [])
      .filter((token) => token.from < token.to && token.to <= size)
      .map((token) => Decoration.inline(pos + 1 + token.from, pos + 1 + token.to, { class: token.className }))
  }

  return codeBlockPlugin(key, decorate, (current) => {
    view = current
  })
}
