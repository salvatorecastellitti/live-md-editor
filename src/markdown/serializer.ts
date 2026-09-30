import { MarkdownSerializer, type MarkdownSerializerState } from 'prosemirror-markdown'
import type { Mark, Node } from 'prosemirror-model'
import { schema, type CellAlign } from '../schema'

// True while serializing the text of an autolink (`<https://...>`),
// whose contents must not be escaped. Serialization is synchronous,
// so a module flag is safe.
let inAutolink = false

function checkMarker(item: Node): string {
  const { check, checked } = item.attrs as { check: string | null; checked: boolean }
  if (check === 'task') return checked ? '[x] ' : '[ ] '
  if (check === 'radio') return checked ? '(x) ' : '( ) '
  return ''
}

function isPlainUrl(link: Mark, parent: Node, index: number): boolean {
  const href = link.attrs.href as string
  if (link.attrs.title || !/^\w+:[^\s<>]*$/.test(href)) return false
  const content = parent.child(index)
  if (!content.isText || content.text !== href || content.marks[content.marks.length - 1] !== link) {
    return false
  }
  return index === parent.childCount - 1 || !link.isInSet(parent.child(index + 1).marks)
}

function backticksFor(node: Node, side: number): string {
  const ticks = /`+/g
  let len = 0
  let match: RegExpExecArray | null
  if (node.isText) while ((match = ticks.exec(node.text!))) len = Math.max(len, match[0].length)
  let result = len > 0 && side > 0 ? ' `' : '`'
  for (let i = 0; i < len; i++) result += '`'
  if (len > 0 && side < 0) result += ' '
  return result
}

/** Makes a URL safe inside `(...)`: spaces break the link, parentheses must be escaped. */
function escapeUrl(url: string): string {
  return url.replace(/ /g, '%20').replace(/[()]/g, '\\$&')
}

function alignRule(align: CellAlign): string {
  if (align === 'left') return ':---'
  if (align === 'center') return ':---:'
  if (align === 'right') return '---:'
  return '---'
}

// Plain text that would otherwise re-parse as an HTML tag or an entity
// reference. Everything else markdown cares about is escaped by prosemirror-markdown.
const HTML_LOOKALIKE = /<(?=[a-zA-Z/!?])|&(?=#?[a-zA-Z0-9]+;)/g

const serializer: MarkdownSerializer = new MarkdownSerializer(
  {
    paragraph(state, node) {
      state.renderInline(node)
      state.closeBlock(node)
    },
    heading(state, node) {
      state.write(`${state.repeat('#', node.attrs.level as number)} `)
      state.renderInline(node, false)
      state.closeBlock(node)
    },
    blockquote(state, node) {
      state.wrapBlock('> ', null, node, () => state.renderContent(node))
    },
    horizontal_rule(state, node) {
      state.write('---')
      state.closeBlock(node)
    },
    code_block(state, node) {
      const runs = node.textContent.match(/`{3,}/gm)
      const fence = runs ? `${runs.sort().at(-1)!}\`` : '```'
      state.write(`${fence}${node.attrs.language as string}\n`)
      if (node.textContent) {
        state.text(node.textContent, false)
        state.write('\n')
      }
      state.write(fence)
      state.closeBlock(node)
    },
    html_block(state, node) {
      state.text(node.textContent, false)
      state.closeBlock(node)
    },
    bullet_list(state, node) {
      state.renderList(node, '  ', (i) => `- ${checkMarker(node.child(i))}`)
    },
    ordered_list(state, node) {
      const start = node.attrs.order as number
      const width = String(start + node.childCount - 1).length
      state.renderList(node, ' '.repeat(width + 2), (i) => `${start + i}. ${checkMarker(node.child(i))}`)
    },
    list_item(state, node) {
      // An item that starts with a block other than a paragraph ("- # Title")
      // parses with an empty first paragraph, because the schema requires
      // one. Skip it so the block stays on the marker line and inside the item.
      const first = node.firstChild!
      const skip = node.childCount > 1 && first.type === schema.nodes.paragraph && first.content.size === 0
      node.forEach((child, _offset, i) => {
        if (!(skip && i === 0)) state.render(child, node, i)
      })
    },
    table(state, node) {
      const aligns: CellAlign[] = []
      const rows: string[][] = []
      node.forEach((row, _offset, rowIndex) => {
        const cells: string[] = []
        row.forEach((cell, _cellOffset, cellIndex) => {
          if (rowIndex === 0) aligns[cellIndex] = cell.attrs.align as CellAlign
          // serialize() renders the children of the node it gets, so the
          // cell's inline content is wrapped in doc > paragraph.
          const doc = schema.topNodeType.create(null, schema.nodes.paragraph.create(null, cell.content))
          cells.push(
            serializer.serialize(doc).replace(/\\\n/g, ' ').replace(/\n/g, ' ').replace(/\|/g, '\\|'),
          )
        })
        rows.push(cells)
      })
      const lines = rows.map((cells) => `| ${cells.join(' | ')} |`)
      lines.splice(1, 0, `| ${aligns.map(alignRule).join(' | ')} |`)
      lines.forEach((line, i) => {
        if (i > 0) state.ensureNewLine()
        state.write(line)
      })
      state.closeBlock(node)
    },
    table_row() {},
    table_header() {},
    table_cell() {},
    image(state, node) {
      const { src, alt, title } = node.attrs as { src: string; alt: string | null; title: string | null }
      const titlePart = title ? ` "${title.replace(/"/g, '\\"')}"` : ''
      state.write(`![${state.esc(alt ?? '')}](${escapeUrl(src)}${titlePart})`)
    },
    hard_break(state, node, parent, index) {
      for (let i = index + 1; i < parent.childCount; i++) {
        if (parent.child(i).type !== node.type) {
          state.write('\\\n')
          return
        }
      }
    },
    html_inline(state, node) {
      state.write(node.attrs.html as string)
    },
    text(state, node) {
      state.text(node.text!, !inAutolink)
    },
  },
  {
    em: { open: '*', close: '*', mixable: true, expelEnclosingWhitespace: true },
    strong: { open: '**', close: '**', mixable: true, expelEnclosingWhitespace: true },
    strike: { open: '~~', close: '~~', mixable: true, expelEnclosingWhitespace: true },
    link: {
      open(_state, mark, parent, index) {
        inAutolink = isPlainUrl(mark, parent, index)
        return inAutolink ? '<' : '['
      },
      close(_state, mark) {
        const wasAutolink = inAutolink
        inAutolink = false
        if (wasAutolink) return '>'
        const { href, title } = mark.attrs as { href: string; title: string | null }
        const titlePart = title ? ` "${title.replace(/"/g, '\\"')}"` : ''
        return `](${escapeUrl(href)}${titlePart})`
      },
      mixable: true,
    },
    code: {
      open: (_state, _mark, parent, index) => backticksFor(parent.child(index), -1),
      close: (_state, _mark, parent, index) => backticksFor(parent.child(index - 1), 1),
      escape: false,
    },
  },
  { escapeExtraCharacters: HTML_LOOKALIKE },
)

/** Serializes a document to canonical markdown. */
export function serializeMarkdown(doc: Node): string {
  const body = serializer.serialize(doc, { tightLists: true })
  const frontmatter = doc.attrs.frontmatter as string | null
  if (frontmatter === null) return body
  const block = frontmatter ? `---\n${frontmatter}\n---` : '---\n---'
  return body ? `${block}\n\n${body}` : block
}

export type { MarkdownSerializerState }
