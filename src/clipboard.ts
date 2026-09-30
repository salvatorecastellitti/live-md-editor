import { Fragment, Slice, type Node } from 'prosemirror-model'
import { schema } from './schema'

/**
 * Turns parsed markdown into a slice for inserting into existing text, the
 * way a paste does: a paragraph at either edge merges into the text around
 * the cursor, while headings, lists, code blocks and tables stay whole blocks.
 */
export function markdownSlice(doc: Node): Slice {
  const openStart = doc.firstChild?.type === schema.nodes.paragraph ? 1 : 0
  const openEnd = doc.lastChild?.type === schema.nodes.paragraph ? 1 : 0
  return new Slice(doc.content, openStart, openEnd)
}

/** Adds `text` to the start (or end) of a paragraph's content. */
function padParagraph(paragraph: Node, text: string, atEnd: boolean): Node {
  const padding = Fragment.from(schema.text(text))
  return paragraph.copy(atEnd ? paragraph.content.append(padding) : padding.append(paragraph.content))
}

/**
 * Pasted plain text is read as markdown, so pasting `**bold**` gives bold text.
 * Markdown trims the spaces around a paragraph; at the edges of the pasted
 * text they are put back, so pasting " word" after "a" gives "a word".
 */
export function createClipboardTextParser(parse: (markdown: string) => Node): (text: string) => Slice {
  return (text) => {
    if (!text.trim()) return text ? new Slice(Fragment.from(schema.text(text)), 0, 0) : Slice.empty
    let doc = parse(text)
    const leading = /^[ \t]*/.exec(text)![0]
    const trailing = /[ \t]*$/.exec(text)![0]
    const { paragraph } = schema.nodes
    if (leading && doc.firstChild!.type === paragraph) {
      doc = doc.copy(doc.content.replaceChild(0, padParagraph(doc.firstChild!, leading, false)))
    }
    if (trailing && doc.lastChild!.type === paragraph) {
      doc = doc.copy(
        doc.content.replaceChild(doc.childCount - 1, padParagraph(doc.lastChild!, trailing, true)),
      )
    }
    return markdownSlice(doc)
  }
}
