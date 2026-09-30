import type { Node } from 'prosemirror-model'
import { PluginKey, type Plugin } from 'prosemirror-state'
import { Decoration, type DecorationSet, type EditorView } from 'prosemirror-view'
import { codeBlockPlugin } from './codeBlocks'

const key = new PluginKey<DecorationSet>('lme-copy')
const SVG = 'http://www.w3.org/2000/svg'
const COPIED_FOR = 1500

// Icon paths (24 x 24): two overlapping sheets, and a check mark.
const COPY_ICON = ['M9 9h11v11H9z', 'M5 15H4V4h11v1']
const CHECK_ICON = ['M5 12l5 5L20 7']

function icon(paths: string[]): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('aria-hidden', 'true')
  for (const d of paths) {
    const path = document.createElementNS(SVG, 'path')
    path.setAttribute('d', d)
    svg.append(path)
  }
  return svg
}

/** Copies text, falling back to a hidden textarea where the Clipboard API is unavailable (plain http). */
async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text)
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.append(textarea)
  textarea.select()
  document.execCommand('copy')
  textarea.remove()
}

function copyButton(view: EditorView, getPos: () => number | undefined): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'lme-copy'
  button.contentEditable = 'false'
  let timer: ReturnType<typeof setTimeout> | undefined
  const show = (copied: boolean) => {
    const label = copied ? 'Copied' : 'Copy code'
    button.setAttribute('aria-label', label)
    button.title = label
    button.dataset.copied = String(copied)
    button.replaceChildren(icon(copied ? CHECK_ICON : COPY_ICON))
  }
  show(false)
  // Keep the editor selection where it is.
  button.addEventListener('mousedown', (event) => event.preventDefault())
  button.addEventListener('click', () => {
    const pos = getPos()
    const block = pos === undefined ? null : view.state.doc.resolve(pos).parent
    if (block?.type.name !== 'code_block') return
    void copyText(block.textContent).then(() => {
      show(true)
      clearTimeout(timer)
      timer = setTimeout(() => show(false), COPIED_FOR)
    })
  })
  return button
}

/** Adds a copy button to the corner of every code block. */
export function codeCopy(): Plugin<DecorationSet> {
  return codeBlockPlugin(key, (_node: Node, pos: number) => [
    Decoration.widget(pos + 1, copyButton, {
      side: -1,
      key: 'lme-copy',
      ignoreSelection: true,
      stopEvent: () => true,
    }),
  ])
}
