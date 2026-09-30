import { Schema, type DOMOutputSpec, type NodeSpec, type MarkSpec } from 'prosemirror-model'
import { tableNodes } from 'prosemirror-tables'
import { isSafeUrl } from './url'

/** Marker shown in front of a list item: none, a checkbox or a radio. */
export type CheckKind = 'task' | 'radio' | null
export type CellAlign = 'left' | 'center' | 'right' | null

function readAlign(value: string | null | undefined): CellAlign {
  return value === 'left' || value === 'center' || value === 'right' ? value : null
}

const tables = tableNodes({
  tableGroup: 'block',
  cellContent: 'inline*',
  cellAttributes: {
    align: {
      default: null,
      getFromDOM: (dom) => readAlign(dom.style.textAlign),
      setDOMAttr: (value, attrs) => {
        if (value) attrs.style = `text-align: ${value as string}`
      },
    },
  },
})

type NodeName =
  | 'doc'
  | 'paragraph'
  | 'heading'
  | 'blockquote'
  | 'horizontal_rule'
  | 'code_block'
  | 'html_block'
  | 'bullet_list'
  | 'ordered_list'
  | 'list_item'
  | 'text'
  | 'image'
  | 'hard_break'
  | 'html_inline'
  | 'table'
  | 'table_row'
  | 'table_cell'
  | 'table_header'
type MarkName = 'em' | 'strong' | 'strike' | 'link' | 'code'

const nodes: Record<NodeName, NodeSpec> = {
  doc: {
    content: 'block+',
    // YAML front matter from the top of the file, kept verbatim and not shown.
    attrs: { frontmatter: { default: null } },
  },
  paragraph: {
    content: 'inline*',
    group: 'block',
    parseDOM: [{ tag: 'p' }],
    toDOM: (): DOMOutputSpec => ['p', 0],
  },
  heading: {
    attrs: { level: { default: 1, validate: 'number' } },
    content: 'inline*',
    group: 'block',
    defining: true,
    parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({ tag: `h${level}`, attrs: { level } })),
    toDOM: (node): DOMOutputSpec => [`h${node.attrs.level as number}`, 0],
  },
  blockquote: {
    content: 'block+',
    group: 'block',
    defining: true,
    parseDOM: [{ tag: 'blockquote' }],
    toDOM: (): DOMOutputSpec => ['blockquote', 0],
  },
  horizontal_rule: {
    group: 'block',
    parseDOM: [{ tag: 'hr' }],
    toDOM: (): DOMOutputSpec => ['hr'],
  },
  code_block: {
    attrs: { language: { default: '', validate: 'string' } },
    content: 'text*',
    marks: '',
    group: 'block',
    code: true,
    defining: true,
    parseDOM: [
      {
        tag: 'pre',
        preserveWhitespace: 'full',
        getAttrs: (dom) => ({
          language: /language-(\S+)/.exec(dom.querySelector('code')?.className ?? '')?.[1] ?? '',
        }),
      },
    ],
    toDOM: (node): DOMOutputSpec => {
      const language = node.attrs.language as string
      return language
        ? ['pre', { 'data-language': language }, ['code', { class: `language-${language}` }, 0]]
        : ['pre', ['code', 0]]
    },
  },
  html_block: {
    content: 'text*',
    marks: '',
    group: 'block',
    code: true,
    defining: true,
    toDOM: (): DOMOutputSpec => ['pre', { class: 'lme-html' }, 0],
  },
  bullet_list: {
    attrs: { tight: { default: true } },
    content: 'list_item+',
    group: 'block',
    parseDOM: [{ tag: 'ul' }],
    toDOM: (): DOMOutputSpec => ['ul', 0],
  },
  ordered_list: {
    attrs: { order: { default: 1, validate: 'number' }, tight: { default: true } },
    content: 'list_item+',
    group: 'block',
    parseDOM: [
      {
        tag: 'ol',
        getAttrs: (dom) => {
          const start = parseInt(dom.getAttribute('start') ?? '1', 10)
          return { order: Number.isNaN(start) ? 1 : Math.max(0, start) }
        },
      },
    ],
    toDOM: (node): DOMOutputSpec =>
      node.attrs.order === 1 ? ['ol', 0] : ['ol', { start: node.attrs.order as number }, 0],
  },
  list_item: {
    attrs: { check: { default: null }, checked: { default: false } },
    content: 'paragraph block*',
    defining: true,
    parseDOM: [
      {
        tag: 'li',
        getAttrs: (dom) => {
          const check = dom.getAttribute('data-check')
          if (check === 'task' || check === 'radio') {
            return { check, checked: dom.getAttribute('data-checked') === 'true' }
          }
          const input = dom.querySelector('input[type="checkbox"]')
          if (input && input.closest('li') === dom) {
            return { check: 'task', checked: (input as HTMLInputElement).checked }
          }
          return { check: null, checked: false }
        },
      },
    ],
    toDOM: (node): DOMOutputSpec =>
      node.attrs.check
        ? ['li', { 'data-check': node.attrs.check as string, 'data-checked': String(node.attrs.checked) }, 0]
        : ['li', 0],
  },
  text: { group: 'inline' },
  image: {
    inline: true,
    attrs: { src: { validate: 'string' }, alt: { default: null }, title: { default: null } },
    group: 'inline',
    draggable: true,
    parseDOM: [
      {
        tag: 'img[src]',
        getAttrs: (dom) => {
          const src = dom.getAttribute('src') ?? ''
          if (!isSafeUrl(src)) return false
          return { src, alt: dom.getAttribute('alt'), title: dom.getAttribute('title') }
        },
      },
    ],
    toDOM: (node): DOMOutputSpec => {
      const { src, alt, title } = node.attrs as { src: string; alt: string | null; title: string | null }
      return ['img', { src: isSafeUrl(src) ? src : '', alt, title }]
    },
  },
  hard_break: {
    inline: true,
    group: 'inline',
    selectable: false,
    parseDOM: [{ tag: 'br' }],
    toDOM: (): DOMOutputSpec => ['br'],
  },
  html_inline: {
    inline: true,
    atom: true,
    attrs: { html: { validate: 'string' } },
    group: 'inline',
    toDOM: (node): DOMOutputSpec => ['code', { class: 'lme-html-inline' }, node.attrs.html as string],
  },
  ...tables,
}

const marks: Record<MarkName, MarkSpec> = {
  em: {
    parseDOM: [{ tag: 'i' }, { tag: 'em' }, { style: 'font-style=italic' }],
    toDOM: (): DOMOutputSpec => ['em', 0],
  },
  strong: {
    parseDOM: [
      { tag: 'strong' },
      { tag: 'b', getAttrs: (dom) => dom.style.fontWeight !== 'normal' && null },
      { style: 'font-weight=400', clearMark: (mark) => mark.type.name === 'strong' },
      { style: 'font-weight', getAttrs: (value) => /^(bold(er)?|[5-9]\d{2,})$/.test(value) && null },
    ],
    toDOM: (): DOMOutputSpec => ['strong', 0],
  },
  strike: {
    parseDOM: [{ tag: 's' }, { tag: 'del' }, { tag: 'strike' }, { style: 'text-decoration=line-through' }],
    toDOM: (): DOMOutputSpec => ['s', 0],
  },
  link: {
    attrs: { href: { validate: 'string' }, title: { default: null } },
    inclusive: false,
    parseDOM: [
      {
        tag: 'a[href]',
        getAttrs: (dom) => {
          const href = dom.getAttribute('href') ?? ''
          if (!isSafeUrl(href)) return false
          return { href, title: dom.getAttribute('title') }
        },
      },
    ],
    toDOM: (mark): DOMOutputSpec => {
      const { href, title } = mark.attrs as { href: string; title: string | null }
      return ['a', { href: isSafeUrl(href) ? href : null, title, rel: 'noopener noreferrer nofollow' }, 0]
    },
  },
  code: {
    code: true,
    parseDOM: [{ tag: 'code' }],
    toDOM: (): DOMOutputSpec => ['code', 0],
  },
}

/** The document schema: every node and mark the editor understands. */
export const schema = new Schema<NodeName, MarkName>({ nodes, marks })
