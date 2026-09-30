import { NoteEditor } from './note-editor'

const initial = `# Meeting notes

Type **markdown** here: it turns into formatting as you go.

- [x] Try the toolbar
- [ ] Press Cmd/Ctrl + B on a selection
`

// A server component: it could just as well read the note from a database.
export default function Page() {
  return (
    <main>
      <h1>live-md-editor + Next.js</h1>
      <p>
        <a href="/ai">See an AI answer stream in live</a>
      </p>
      <NoteEditor initial={initial} />
    </main>
  )
}
