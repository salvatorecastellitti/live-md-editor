'use client'

import { useRef, useState } from 'react'
import { highlight } from 'live-md-editor/highlight'
import { LiveMarkdownEditor } from 'live-md-editor/react'
import { readText, sampleAnswer, simulateTokens } from '../../lib/simulate'

export default function AiPage() {
  const [prompt, setPrompt] = useState('How do I add auth to a Next.js app?')
  const [answer, setAnswer] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const stop = useRef<AbortController | null>(null)

  // The whole integration: grow `answer` as text arrives and keep
  // `streaming` true meanwhile. The editor renders it formatted, live.
  async function run(source: (signal: AbortSignal) => AsyncIterable<string>) {
    stop.current = new AbortController()
    setAnswer('')
    setError(null)
    setStreaming(true)
    try {
      for await (const chunk of source(stop.current.signal)) setAnswer((text) => text + chunk)
    } catch (caught) {
      if (!stop.current.signal.aborted) setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setStreaming(false)
    }
  }

  return (
    <main>
      <h1>AI answers, rendered live</h1>
      <form
        className="ask"
        onSubmit={(event) => {
          event.preventDefault()
          void run(async function* (signal) {
            const response = await fetch('/api/chat', {
              method: 'POST',
              body: JSON.stringify({ prompt }),
              signal,
            })
            yield* readText(response)
          })
        }}
      >
        <input value={prompt} onChange={(event) => setPrompt(event.target.value)} aria-label="Prompt" />
        <button type="submit" disabled={streaming}>
          Ask Claude
        </button>
        <button
          type="button"
          disabled={streaming}
          onClick={() => void run((signal) => simulateTokens(sampleAnswer, signal))}
        >
          Simulated answer
        </button>
        <button type="button" disabled={!streaming} onClick={() => stop.current?.abort()}>
          Stop
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      <LiveMarkdownEditor
        className="editor"
        value={answer}
        streaming={streaming}
        editable={!streaming}
        highlight={highlight}
        placeholder="The answer appears here. Once it is done, you can edit it."
        ariaLabel="Answer"
      />
    </main>
  )
}
