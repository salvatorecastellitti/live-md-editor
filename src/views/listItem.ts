import type { Node } from 'prosemirror-model'
import type { EditorView, NodeView, ViewMutationRecord } from 'prosemirror-view'
import { toggleCheckItem } from '../commands/checkItem'

let nextId = 0

/**
 * Renders list items. Task and radio items get a real `<input>` in front
 * of their content; clicking it toggles the item through a transaction,
 * so the change is undoable and reaches `onChange`.
 */
export class ListItemView implements NodeView {
  dom: HTMLLIElement
  contentDOM: HTMLElement
  private input: HTMLInputElement | null = null

  constructor(
    private node: Node,
    private view: EditorView,
    private getPos: () => number | undefined,
  ) {
    this.dom = document.createElement('li')
    const check = node.attrs.check as 'task' | 'radio' | null
    if (!check) {
      this.contentDOM = this.dom
      return
    }
    const id = `lme-item-${++nextId}`
    this.dom.className = 'lme-check-item'
    this.dom.dataset.check = check
    const input = document.createElement('input')
    input.type = check === 'task' ? 'checkbox' : 'radio'
    input.className = 'lme-check-input'
    input.contentEditable = 'false'
    input.setAttribute('aria-labelledby', id)
    input.addEventListener('mousedown', (event) => event.preventDefault())
    input.addEventListener('change', () => this.toggle())
    this.input = input
    this.contentDOM = document.createElement('div')
    this.contentDOM.className = 'lme-check-content'
    this.contentDOM.id = id
    this.dom.append(input, this.contentDOM)
    this.sync()
  }

  private toggle(): void {
    const pos = this.getPos()
    if (pos === undefined || !this.view.editable) {
      this.sync()
      return
    }
    toggleCheckItem(pos)(this.view.state, this.view.dispatch)
    // A radio that was already on does not change the document, so put
    // the input back in line with the node.
    this.sync()
  }

  private sync(): void {
    if (!this.input) return
    const checked = this.node.attrs.checked as boolean
    this.input.checked = checked
    this.input.disabled = !this.view.editable
    this.dom.dataset.checked = String(checked)
  }

  update(node: Node): boolean {
    if (node.type !== this.node.type || node.attrs.check !== this.node.attrs.check) return false
    this.node = node
    this.sync()
    return true
  }

  stopEvent(event: Event): boolean {
    return event.target === this.input
  }

  ignoreMutation(mutation: ViewMutationRecord): boolean {
    return mutation.target === this.input || (mutation.type === 'attributes' && mutation.target === this.dom)
  }
}
