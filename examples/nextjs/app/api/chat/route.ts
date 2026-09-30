import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

/**
 * Streams Claude's answer to `prompt` as plain text, ready for
 * `editor.streamFrom(response.body)` or a growing `value`.
 * Credentials come from the environment (ANTHROPIC_API_KEY, or an
 * `ant auth login` profile).
 *
 * This route spends your API credits for anyone who can reach it. Protect it
 * (authentication, rate limiting) before deploying.
 */
export async function POST(request: Request) {
  const { prompt } = (await request.json().catch(() => ({}))) as { prompt?: unknown }
  if (typeof prompt !== 'string' || !prompt.trim()) {
    return new Response('Expected { prompt: string }', { status: 400 })
  }
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
