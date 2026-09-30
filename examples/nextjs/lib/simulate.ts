/**
 * Yields `text` in small, uneven pieces with short pauses, the way a model
 * streams tokens. Lets the demo run without an API key.
 */
export async function* simulateTokens(text: string): AsyncGenerator<string> {
  let i = 0
  while (i < text.length) {
    const size = 2 + Math.floor(Math.random() * 6)
    yield text.slice(i, i + size)
    i += size
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

/** Reads a streamed text response body chunk by chunk. */
export async function* readText(response: Response): AsyncGenerator<string> {
  if (!response.ok || !response.body) throw new Error(`Request failed: ${response.status}`)
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return
    yield value
  }
}

export const sampleAnswer = `## Adding auth to a Next.js app

Here is a **minimal** setup using route handlers and an HTTP-only cookie.

1. Install the helper:

   \`\`\`bash
   npm install jose
   \`\`\`

2. Create a session token when the user signs in:

\`\`\`ts
import { SignJWT } from 'jose'

export async function createSession(userId: string) {
  const secret = new TextEncoder().encode(process.env.AUTH_SECRET)
  return new SignJWT({ userId }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('7d').sign(secret)
}
\`\`\`

| Cookie option | Value | Why |
| --- | --- | --- |
| \`httpOnly\` | \`true\` | Scripts cannot read it |
| \`secure\` | \`true\` | HTTPS only |
| \`sameSite\` | \`lax\` | Blocks most CSRF |

- [x] Sessions signed
- [ ] Add rate limiting

> **Tip:** rotate \`AUTH_SECRET\` if it ever leaks. See [the jose docs](https://github.com/panva/jose).
`
