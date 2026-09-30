import MarkdownIt from 'markdown-it'
import type { Token } from 'markdown-it'
import { MarkdownParser } from 'prosemirror-markdown'
import type { Node } from 'prosemirror-model'
import { schema, type CellAlign } from '../schema'
import { isSafeUrl } from '../url'
import { checkItems } from './checkItems'

export interface ParserOptions {
  radio: boolean
}

// A leading `---` block (YAML front matter, used by most static site
// generators). Without this it would parse as a rule plus a heading.
const FRONT_MATTER = /^---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/

function listIsTight(tokens: readonly Token[], index: number): boolean {
  for (let i = index + 1; i < tokens.length; i++) {
    if (tokens[i]!.type !== 'list_item_open') return tokens[i]!.hidden
  }
  return false
}

function cellAttrs(token: Token): { align: CellAlign } {
  const match = /text-align:\s*(left|center|right)/.exec(token.attrGet('style') ?? '')
  return { align: (match?.[1] as CellAlign | undefined) ?? null }
}

/** Builds a markdown to ProseMirror document parser. */
export function createParser(options: ParserOptions): (markdown: string) => Node {
  const md = new MarkdownIt('commonmark', { html: true }).enable(['table', 'strikethrough'])
  md.validateLink = isSafeUrl
  md.use(checkItems, { radio: options.radio })

  const parser = new MarkdownParser(schema, md, {
    blockquote: { block: 'blockquote' },
    paragraph: { block: 'paragraph' },
    list_item: {
      block: 'list_item',
      getAttrs: (token) => ({
        check: (token.meta as { check?: string } | null)?.check ?? null,
        checked: (token.meta as { checked?: boolean } | null)?.checked ?? false,
      }),
    },
    bullet_list: {
      block: 'bullet_list',
      getAttrs: (_token, tokens, i) => ({ tight: listIsTight(tokens, i) }),
    },
    ordered_list: {
      block: 'ordered_list',
      getAttrs: (token, tokens, i) => ({
        order: Number(token.attrGet('start') ?? 1),
        tight: listIsTight(tokens, i),
      }),
    },
    heading: { block: 'heading', getAttrs: (token) => ({ level: Number(token.tag.slice(1)) }) },
    code_block: { block: 'code_block', noCloseToken: true },
    fence: {
      block: 'code_block',
      getAttrs: (token) => ({ language: token.info.trim().split(/\s+/)[0] ?? '' }),
      noCloseToken: true,
    },
    html_block: { block: 'html_block', noCloseToken: true },
    hr: { node: 'horizontal_rule' },
    image: {
      node: 'image',
      getAttrs: (token) => ({
        src: token.attrGet('src') ?? '',
        title: token.attrGet('title') || null,
        alt: token.content || null,
      }),
    },
    hardbreak: { node: 'hard_break' },
    html_inline: { node: 'html_inline', getAttrs: (token) => ({ html: token.content }) },
    table: { block: 'table' },
    thead: { ignore: true },
    tbody: { ignore: true },
    tr: { block: 'table_row' },
    th: { block: 'table_header', getAttrs: cellAttrs },
    td: { block: 'table_cell', getAttrs: cellAttrs },
    em: { mark: 'em' },
    strong: { mark: 'strong' },
    s: { mark: 'strike' },
    link: {
      mark: 'link',
      getAttrs: (token) => ({ href: token.attrGet('href') ?? '', title: token.attrGet('title') || null }),
    },
    code_inline: { mark: 'code', noCloseToken: true },
  })

  return (markdown) => {
    const match = FRONT_MATTER.exec(markdown)
    if (!match) return parser.parse(markdown)
    const doc = parser.parse(markdown.slice(match[0].length))
    return doc.type.create({ frontmatter: match[1] ?? '' }, doc.content)
  }
}
