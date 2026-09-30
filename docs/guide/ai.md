# AI streaming

Most AI models answer in markdown. live-md-editor renders that markdown **while it is still
arriving**, already formatted: headings, lists, tables and code appear as they stream, and raw
syntax such as `**` or `###` never flashes on screen.

<LiveExample md="## Try it in the playground\n\nThe [playground](../playground) has a **Simulate AI answer** button." />

## Showing an AI reply (React)

AI SDKs usually give you the reply as a string that grows on every render, plus a flag that is
true while it streams. Pass both:

```tsx
import { LiveMarkdownEditor } from 'live-md-editor/react'
import 'live-md-editor/style.css'

export function Answer({ text, streaming }: { text: string; streaming: boolean }) {
  return <LiveMarkdownEditor value={text} streaming={streaming} editable={!streaming} />
}
```

- While `streaming` is true, each longer `value` is streamed in, repaired, and rendered at most
  once per frame. The editor is read-only and shows a caret where text arrives.
- When `streaming` turns false, the stream ends: the final markdown is parsed exactly, and the
  user can edit it (if `editable`).
- If `value` is replaced instead of extended (a regenerated answer), the stream restarts cleanly.

With the Vercel AI SDK, pass the message's text and `status === 'streaming'`.

## Streaming from any source (no framework)

```ts
import { createEditor } from 'live-md-editor'

const editor = createEditor({ element, editable: false })
const response = await fetch('/api/chat', { method: 'POST', body: JSON.stringify({ prompt }) })
const markdown = await editor.streamFrom(response.body!)
```

`streamFrom` accepts a `fetch` body, any `ReadableStream` of text or bytes, or any async iterable
of strings (an SDK stream, an async generator). It resolves with the document's markdown when
the stream ends. Pass `{ signal }` from an `AbortController` to stop early; what arrived is kept,
with unfinished syntax closed.

To push chunks yourself, for example from a WebSocket:

```ts
const writer = editor.stream()
socket.onmessage = (event) => writer.write(event.data)
socket.onclose = () => writer.end()
```

`writer.abort()` stops early and keeps what arrived.

## A Next.js route that streams Claude

```ts
// app/api/chat/route.ts
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

export async function POST(request: Request) {
  const { prompt } = (await request.json()) as { prompt: string }
  const stream = client.beta.messages.stream({
    model: 'claude-opus-5-5',
    max_tokens: 64000,
    // If the model declines, the API retries on a recommended fallback model
    // within the same stream; text that already arrived is kept.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    messages: [{ role: 'user', content: prompt }],
  })
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      stream.on('text', (text) => controller.enqueue(encoder.encode(text)))
      stream.finalMessage().then(
        (message) => {
          if (message.stop_reason === 'refusal') {
            controller.enqueue(encoder.encode('\n\n*The model declined to answer this request.*'))
          }
          controller.close()
        },
        (error: unknown) => controller.error(error),
      )
    },
    cancel() {
      stream.abort()
    },
  })
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
```

On the page, grow a string from the response and pass it to the editor:

```tsx
const [answer, setAnswer] = useState('')
const [streaming, setStreaming] = useState(false)

async function ask(prompt: string) {
  setAnswer('')
  setStreaming(true)
  try {
    const response = await fetch('/api/chat', { method: 'POST', body: JSON.stringify({ prompt }) })
    const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      setAnswer((text) => text + value)
    }
  } finally {
    setStreaming(false)
  }
}

return <LiveMarkdownEditor value={answer} streaming={streaming} editable={!streaming} />
```

The full example, including a simulated answer that needs no API key, is in
[`examples/nextjs`](https://github.com/salvatorecastellitti/live-md-editor/tree/main/examples/nextjs).

## AI writing into a document

For "continue writing" or "rewrite this" commands, stream at the cursor instead of the end:

```ts
await editor.streamFrom(response.body!, { at: 'cursor' })
```

- The text replaces the selection (or goes at the cursor) and is inserted exactly the way a paste
  would be: a paragraph at either edge merges into the surrounding text, while headings, lists,
  code and tables stay whole blocks.
- The rest of the document is untouched, and the whole insertion is **one undo step**.
- `onChange` fires once, when the stream ends, which is a good moment to save.

## What happens to unfinished markdown

While text streams in, the end of the document is often incomplete. The editor shows it the way
it will look once finished:

| Arrived so far                           | Shown as              |
| ---------------------------------------- | --------------------- |
| `Some **bol`                             | Some **bol**          |
| an open code fence                       | a code block, growing |
| `see [the docs](https://ex`              | see the docs          |
| `![a cat](https://x`                     | nothing yet           |
| a table header without its delimiter row | nothing yet           |

The same repair is exported as `healMarkdown(text)` if you render streaming markdown elsewhere.

## Events and state

| API                                        | Use                                      |
| ------------------------------------------ | ---------------------------------------- |
| `editor.isStreaming()`                     | Whether a stream is running              |
| `editor.on('streamStart', fn)`             | Disable your send button, show a spinner |
| `editor.on('streamEnd', fn)`               | Receives the final markdown              |
| `.lme-streaming` class, `aria-busy="true"` | Style or announce the busy state         |

## Performance

Blocks that can no longer change are frozen, so each frame only re-parses the growing end of
the answer. In our browser test, streaming a 2,000-line answer costs well under a millisecond
per frame, and the cost stays flat as the answer grows.
