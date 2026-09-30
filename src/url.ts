const ALLOWED_PROTOCOLS = new Set(['http', 'https', 'mailto'])
// Browsers ignore ASCII control characters and whitespace inside URLs,
// so "java\tscript:" still runs. Strip them before reading the scheme.
// eslint-disable-next-line no-control-regex
const IGNORED_CHARS = /[\u0000- \u007f]/g
const SCHEME = /^([a-z][a-z0-9+.-]*):/i

/**
 * Returns true when `url` is safe to put in an `href` or `src`:
 * `http:`, `https:`, `mailto:` or a relative URL.
 */
export function isSafeUrl(url: string): boolean {
  const compact = url.replace(IGNORED_CHARS, '')
  const match = SCHEME.exec(compact)
  if (!match) return true
  return ALLOWED_PROTOCOLS.has(match[1]!.toLowerCase())
}
