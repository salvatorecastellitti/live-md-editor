import { describe, expect, it } from 'vitest'
import { stableLength } from '../src/stream/stable'

describe('stableLength', () => {
  it.each([
    ['one paragraph still growing', 0],
    ['para\n\nnext', 0],
    ['para\n\nnext\n', 6],
    ['para\n\nnext\nmore', 6],
    ['# Title\n\ntext\n\n', 9],
    ['- a\n\n- b\n', 0],
    ['- a\n\n  indented\n', 0],
    ['> quote\n\n> more\n', 0],
    ['para\n\n[ref]: https://x.com\n', 0],
    ['```\ncode\n\nstill code\n', 0],
    ['```\ncode\n```\n\nafter\n', 14],
  ])('%j -> %i', (text, length) => {
    expect(stableLength(text)).toBe(length)
  })
})
