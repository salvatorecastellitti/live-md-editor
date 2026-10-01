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
 * plain click just places the cursor. In a read-only editor any activation
 * (mouse click, Enter on a focused link, a screen reader's activate action)
 * opens the link in a new tab, and never navigates the host page.
 */
export function linkClicks(): Plugin {
  return new Plugin({
    props: {
      handleClick(view, pos, event) {
        const href = linkAt(view, pos)
        if (!href) return false
        // Read-only links are opened by the click handler below, which also
        // sees keyboard activation; here we only stop ProseMirror's handling.
        if (!view.editable) {
          event.preventDefault()
          return true
        }
        if (!(event.metaKey || event.ctrlKey) || !isSafeUrl(href)) return false
        window.open(href, '_blank', 'noopener,noreferrer')
        return true
      },
      handleDOMEvents: {
        click(view, event) {
          if (view.editable) return false
          const anchor = (event.target as Element | null)?.closest?.('a[href]')
          if (!anchor) return false
          // The browser would follow the link (and leave the host app) on click.
          event.preventDefault()
          const href = anchor.getAttribute('href') ?? ''
          if (isSafeUrl(href)) window.open(href, '_blank', 'noopener,noreferrer')
          return true
        },
      },
    },
  })
}
