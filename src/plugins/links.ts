import { Plugin } from 'prosemirror-state'
import { schema } from '../schema'
import { isSafeUrl } from '../url'

/** Cmd/Ctrl + click on a link opens it in a new tab. A plain click just places the cursor. */
export function linkClicks(): Plugin {
  return new Plugin({
    props: {
      handleClick(view, pos, event) {
        if (!(event.metaKey || event.ctrlKey)) return false
        const $pos = view.state.doc.resolve(pos)
        const link =
          schema.marks.link.isInSet($pos.marks()) ?? schema.marks.link.isInSet($pos.nodeAfter?.marks ?? [])
        const href = link?.attrs.href as string | undefined
        if (!href || !isSafeUrl(href)) return false
        window.open(href, '_blank', 'noopener,noreferrer')
        return true
      },
    },
  })
}
