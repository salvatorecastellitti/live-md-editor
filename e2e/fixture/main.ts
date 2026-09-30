// Test page for the Playwright suite. Query parameters:
//   value=<markdown>   initial content (default: empty)
//   radio=1            enable the radio extension
//   readonly=1         start read-only
//   placeholder=<text> placeholder text
//   lines=<n>          generate a document of about n lines (performance test)
//   delay=<ms>         changeDelay
//   highlight=1        colour code blocks with live-md-editor/highlight
//   copy=0             hide the copy button
import { createEditor, healMarkdown, type Editor } from '../../src'
import { highlight } from '../../src/highlight'
import '../../src/style.css'

declare global {
  interface Window {
    editor: Editor
    healMarkdown: typeof healMarkdown
  }
}

const params = new URLSearchParams(location.search)
const block =
  '## Section\n\nSome *text* with **bold** and a [link](https://x.com).\n\n' +
  '- [ ] task one\n- [x] task two\n\n```ts\nconst a = 1\n```\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n'

function generate(lines: number): string {
  let markdown = ''
  while (markdown.split('\n').length < lines) markdown += block
  return markdown
}

const output = document.getElementById('markdown')!
const lines = Number(params.get('lines') ?? 0)

window.editor = createEditor({
  element: document.getElementById('editor')!,
  value: lines ? generate(lines) : (params.get('value') ?? ''),
  placeholder: params.get('placeholder') ?? undefined,
  editable: params.get('readonly') !== '1',
  extensions: { radio: params.get('radio') === '1' },
  changeDelay: Number(params.get('delay') ?? 0),
  highlight: params.get('highlight') === '1' ? highlight : undefined,
  copyButton: params.get('copy') !== '0',
  ariaLabel: 'Test editor',
  onChange: (markdown) => {
    output.textContent = markdown
  },
})
window.healMarkdown = healMarkdown
output.textContent = lines ? '' : window.editor.getMarkdown()
