'use client'

import { useEffect, useState } from 'react'
import type { ActiveName, Editor } from 'live-md-editor'
import { highlight } from 'live-md-editor/highlight'
import { LiveMarkdownEditor } from 'live-md-editor/react'
import { simulateTokens } from '../lib/simulate'

const buttons: { label: string; active: ActiveName; level?: number; run: (editor: Editor) => boolean }[] = [
  { label: 'Bold', active: 'bold', run: (editor) => editor.commands.toggleBold() },
  { label: 'Italic', active: 'italic', run: (editor) => editor.commands.toggleItalic() },
  { label: 'H2', active: 'heading', level: 2, run: (editor) => editor.commands.setHeading(2) },
  { label: 'List', active: 'bulletList', run: (editor) => editor.commands.toggleBulletList() },
  { label: 'Tasks', active: 'taskList', run: (editor) => editor.commands.toggleTaskList() },
  { label: 'Quote', active: 'blockquote', run: (editor) => editor.commands.toggleBlockquote() },
]

export function NoteEditor({ initial }: { initial: string }) {
  const [markdown, setMarkdown] = useState(initial)
  // Passing a state setter as the ref re-renders this component once the
  // editor has mounted (a useRef would not).
  const [editor, setEditor] = useState<Editor | null>(null)
  // Re-render the toolbar when the selection moves, so pressed states stay right.
  const [, setTick] = useState(0)

  useEffect(() => editor?.on('selectionChange', () => setTick((tick) => tick + 1)), [editor])

  return (
    <>
      <div className="toolbar" role="toolbar" aria-label="Formatting">
        {buttons.map((button) => (
          <button
            key={button.label}
            type="button"
            aria-pressed={editor?.isActive(button.active, { level: button.level }) ?? false}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => editor && button.run(editor)}
          >
            {button.label}
          </button>
        ))}
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() =>
            // Streams at the cursor, like an AI "continue writing" command.
            void editor?.streamFrom(
              simulateTokens(' Here is **more text**, streamed at the cursor as if an AI wrote it.'),
              { at: 'cursor' },
            )
          }
        >
          AI: continue
        </button>
      </div>
      <LiveMarkdownEditor
        ref={setEditor}
        className="editor"
        value={markdown}
        onChange={setMarkdown}
        placeholder="Write something..."
        ariaLabel="Note"
        highlight={highlight}
      />
      <h2>Markdown</h2>
      <pre>{markdown}</pre>
    </>
  )
}
