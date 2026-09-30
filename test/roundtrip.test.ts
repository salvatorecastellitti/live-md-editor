import { describe, expect, it } from 'vitest'
import { createParser } from '../src/markdown/parser'
import { serializeMarkdown } from '../src/markdown/serializer'
import corpus from './fixtures/corpus.md?raw'

const parse = createParser({ radio: true })
const roundTrip = (md: string) => serializeMarkdown(parse(md))

const canonical: Record<string, string> = {
  heading: '# One\n\n## Two\n\n###### Six',
  paragraphs: 'First paragraph\n\nSecond paragraph',
  marks: '*em* **strong** ~~strike~~ `code`',
  nestedMarks: '***both*** and **bold *inner***',
  link: '[site](https://example.com "Title")',
  autolink: '<https://example.com>',
  image: '![alt text](https://example.com/a.png "T")',
  bullets: '- one\n- two\n  - nested',
  ordered: '1. one\n2. two',
  orderedStart: '3. three\n4. four',
  looseList: '- one\n\n- two',
  tasks: '- [ ] todo\n- [x] done',
  orderedTasks: '1. [ ] a\n2. [x] b',
  radios: '- ( ) small\n- (x) large',
  mixed: '- plain\n- [x] task',
  blockquote: '> quoted\n>\n> - list',
  code: '```ts\nconst a = 1\n```',
  codeEmpty: '```\n```',
  codeWithFence: '````\n```\n````',
  hr: 'above\n\n---\n\nbelow',
  hardBreak: 'line\\\nnext',
  table: '| a | b | c |\n| :--- | :---: | ---: |\n| 1 | **2** | `3` |',
  tableNoAlign: '| a | b |\n| --- | --- |\n|  | x |',
  tablePipe: '| a |\n| --- |\n| x \\| y |',
  htmlBlock: '<div class="x">\n  hi\n</div>\n\nafter',
  htmlInline: 'a <kbd>Ctrl</kbd> b',
  escapes: '\\# not heading and \\*not em\\*',
  htmlLookalikes: '\\<b> is text, so is \\&amp; and a < b & c',
  nestedTask: '- [ ] parent\n  - [x] child',
  frontmatter: '---\ntitle: Hello\ntags: [a, b]\n---\n\n# Body',
  emptyFrontmatter: '---\n---\n\ntext',
  ruleIsNotFrontmatter: 'text\n\n---\n\nmore',
  urlWithSpace: '[a](https://x.com/a%20b_\\(c\\))',
}

describe('round trip', () => {
  for (const [name, md] of Object.entries(canonical)) {
    it(name, () => expect(roundTrip(md)).toBe(md))
  }
})

// Non-canonical input is rewritten once, then stays the same.
const normalised: Record<string, string> = {
  '* star\n* list': '- star\n- list',
  '__bold__ _em_': '**bold** *em*',
  '    indented code': '```\nindented code\n```',
  'soft\nbreak': 'soft break',
  '- [X] Upper': '- [x] Upper',
  'Setext\n======': '# Setext',
  '- [ ]   spaced': '- [ ] spaced',
  '[x](javascript:alert(1))': '\\[x\\](javascript:alert(1))',
  '&copy; &lt;b&gt;': '© \\<b>',
  '': '',
  '   \n\n  ': '',
}

describe('normalisation', () => {
  for (const [input, output] of Object.entries(normalised)) {
    it(JSON.stringify(input), () => {
      expect(roundTrip(input)).toBe(output)
      expect(roundTrip(output)).toBe(output)
    })
  }

  it('an empty task item stays a task item', () => {
    const once = roundTrip('- [ ]')
    expect(roundTrip(once)).toBe(once)
    expect(parse(once).firstChild!.firstChild!.attrs.check).toBe('task')
  })

  it('radio markers stay text when the extension is off', () => {
    const doc = createParser({ radio: false })('- (x) a')
    expect(serializeMarkdown(doc)).toBe('- (x) a')
  })
})

describe('real-world corpus', () => {
  it('is stable after one save and keeps all of its text', () => {
    const once = roundTrip(corpus)
    expect(roundTrip(once)).toBe(once)
    expect(parse(once).textContent).toBe(parse(corpus).textContent)
  })
})
