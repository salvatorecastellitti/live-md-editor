import { createEditor } from 'live-md-editor'
import 'live-md-editor/style.css'

const output = document.getElementById('output')
const saved = localStorage.getItem('live-md-editor-note')

const editor = createEditor({
  element: document.getElementById('editor'),
  value: saved ?? '# Hello\n\nThis note is saved in your browser as you type.\n\n- [ ] Try a checkbox',
  placeholder: 'Write something...',
  ariaLabel: 'Note',
  changeDelay: 300,
  onChange: (markdown) => {
    localStorage.setItem('live-md-editor-note', markdown)
    output.textContent = markdown
  },
})

output.textContent = editor.getMarkdown()
