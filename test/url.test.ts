import { describe, expect, it } from 'vitest'
import { isSafeUrl } from '../src/url'

describe('isSafeUrl', () => {
  it.each([
    'https://example.com',
    'http://example.com/a?b=c#d',
    'HTTPS://EXAMPLE.COM',
    'mailto:someone@example.com',
    '/relative/path',
    './file.md',
    '#heading',
    '//cdn.example.com/a.png',
    'image.png',
    'java%09script:alert(1)',
  ])('allows %s', (url) => {
    expect(isSafeUrl(url)).toBe(true)
  })

  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    ' javascript:alert(1)',
    'java\tscript:alert(1)',
    'java\nscript:alert(1)',
    '\u0000javascript:alert(1)',
    'vbscript:msgbox(1)',
    'data:text/html,<script>alert(1)</script>',
    'data:image/png;base64,AAAA',
    'file:///etc/passwd',
  ])('blocks %j', (url) => {
    expect(isSafeUrl(url)).toBe(false)
  })
})
