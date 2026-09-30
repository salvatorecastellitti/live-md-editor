import { Plugin } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import { schema } from '../schema'
import { isSafeUrl } from '../url'

function linkAt(view: EditorView, pos: number): string | undefined {
  const $pos = view.state.doc.resolve(pos)
  const link =
    schema.marks.link.isInSet($pos.marks()) ?? schema.marks.link.isInSet($pos.nodeAfter?.marks ?? [])
  return link?.attrs.href as string | undefined
}

/**
 * Cmd/Ctrl + click on a link opens it in a new tab; in an editable editor a
 * plain click just places the cursor. In a read-only editor a plain click
 * opens the link in a new tab too, and never navigates the host page.
 */
export function linkClicks(): Plugin {
  return new Plugin({
    props: {
      handleClick(view, pos, event) {
        if (view.editable && !(event.metaKey || event.ctrlKey)) return false
        const href = linkAt(view, pos)
        if (!href) return false
        if (!view.editable) event.preventDefault()
        if (!isSafeUrl(href)) return !view.editable
        window.open(href, '_blank', 'noopener,noreferrer')
        return true
      },
      handleDOMEvents: {
        // The browser follows a link on `click`, after ProseMirror handled
        // the mouseup above. Read-only links are opened by handleClick.
        click(view, event) {
          if (!view.editable && (event.target as Element | null)?.closest?.('a[href]')) {
            event.preventDefault()
          }
          return false
        },
      },
    },
  })
}
