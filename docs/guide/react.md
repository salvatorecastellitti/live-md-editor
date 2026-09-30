# React

```tsx
import { useRef, useState } from 'react'
import { LiveMarkdownEditor } from 'live-md-editor/react'
import type { Editor } from 'live-md-editor'
import 'live-md-editor/style.css'

export function App() {
  const [markdown, setMarkdown] = useState('# Hello')
  const editor = useRef<Editor | null>(null)

  return (
    <>
      <button onClick={() => editor.current?.commands.toggleBold()}>Bold</button>
      <LiveMarkdownEditor ref={editor} value={markdown} onChange={setMarkdown} />
    </>
  )
}
```

## Controlled and uncontrolled

- **Controlled:** pass `value` and `onChange`. Changing `value` from outside replaces the
  document. Values that the editor itself just reported are recognised and ignored, so typing is
  never interrupted.
- **Uncontrolled:** pass `defaultValue` and read the markdown in `onChange` or with
  `ref.current.getMarkdown()`.

## Props

| Prop                                                                                                          | Description                                                                 |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `value` / `defaultValue`                                                                                      | Controlled or initial markdown                                              |
| `onChange`                                                                                                    | Called with the new markdown                                                |
| `editable`                                                                                                    | Can change at any time                                                      |
| `streaming`                                                                                                   | While true, a growing `value` is streamed in live. See [AI streaming](./ai) |
| `className`, `style`                                                                                          | Applied to the wrapping `<div>`                                             |
| `placeholder`, `ariaLabel`, `extensions`, `classNames`, `changeDelay`, `highlight`, `copyButton`, `autofocus` | Read once, when the editor mounts                                           |

The `ref` gives you the core [`Editor`](/api/live-md-editor/interfaces/Editor) (or `null` before
it mounts), with `commands`, `isActive`, `getMarkdown`, `setMarkdown` and `on`.

## Reacting when the editor is ready

A `useRef` is fine for event handlers, but it does not re-render your component when the editor
mounts. To render something from the editor (for example a toolbar showing which formats are
active), pass a state setter as the ref:

```tsx
const [editor, setEditor] = useState<Editor | null>(null)
const [, refresh] = useState(0)

useEffect(() => editor?.on('selectionChange', () => refresh((n) => n + 1)), [editor])

return (
  <>
    <button aria-pressed={editor?.isActive('bold') ?? false} onClick={() => editor?.commands.toggleBold()}>
      Bold
    </button>
    <LiveMarkdownEditor ref={setEditor} defaultValue="Hello" />
  </>
)
```
