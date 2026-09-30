# Next.js

The React wrapper is a client component, so it works in the App Router and the Pages Router.

```bash
npm install live-md-editor
```

```tsx
// app/notes/note-editor.tsx
'use client'

import { useState } from 'react'
import { LiveMarkdownEditor } from 'live-md-editor/react'
import 'live-md-editor/style.css'

export function NoteEditor({ initial }: { initial: string }) {
  const [markdown, setMarkdown] = useState(initial)
  return <LiveMarkdownEditor value={markdown} onChange={setMarkdown} placeholder="Write..." />
}
```

Use it from a server component and pass the stored markdown in:

```tsx
// app/notes/[id]/page.tsx
import { NoteEditor } from '../note-editor'
import { getNote } from '@/lib/notes'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const note = await getNote(id)
  return <NoteEditor initial={note.markdown} />
}
```

## Server rendering

On the server the component renders an empty `<div class="lme-root">`. The editor mounts in the
browser. Importing the package on the server is safe: it does not touch `window` or `document`
until it mounts.

To avoid a layout jump while it mounts, give the wrapper a minimum height:

```tsx
<LiveMarkdownEditor style={{ minHeight: 200 }} value={markdown} onChange={setMarkdown} />
```

## Saving to the server

Pair `changeDelay` with a server action so you save once the user pauses, not on every key:

```tsx
'use client'

import { LiveMarkdownEditor } from 'live-md-editor/react'
import { saveNote } from './actions'

export function AutosaveEditor({ id, initial }: { id: string; initial: string }) {
  return (
    <LiveMarkdownEditor
      defaultValue={initial}
      changeDelay={800}
      onChange={(markdown) => saveNote(id, markdown)}
    />
  )
}
```

Pending changes are also flushed when the editor loses focus and when it unmounts.

A complete, runnable app is in
[`examples/nextjs`](https://github.com/salvatorecastellitti/live-md-editor/tree/main/examples/nextjs).
