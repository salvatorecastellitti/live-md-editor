// Repairs the end of a markdown document that is still being written
// (for example by an AI model, token by token) so it renders the way it
// will look once finished, instead of flashing raw syntax:
//
//   "Some **bol"          -> "Some **bol**"
//   "```ts\nconst a"      -> "```ts\nconst a\n```"
//   "see [the docs](htt"  -> "see the docs"
//   "| a | b |"           -> ""   (a table header without its delimiter row yet)
//
// Only the last block can be unfinished, so only the last block is touched.

const FENCE = /^ {0,3}(`{3,}|~{3,})/
const LIST_MARKER = /^\s*(?:[-*+]|\d+[.)])\s+$/

interface OpenFence {
  marker: string
}

/** Finds a code fence that is still open at the end of `lines`. */
function openFence(lines: string[]): OpenFence | null {
  let open: OpenFence | null = null
  for (const line of lines) {
    const match = FENCE.exec(line)
    if (!match) continue
    const run = match[1]!
    if (!open) {
      // Backtick fences cannot have backticks in their info string.
      if (run[0] === '`' && line.slice(match[0].length).includes('`')) continue
      open = { marker: run }
    } else if (
      run[0] === open.marker[0] &&
      run.length >= open.marker.length &&
      !line.slice(match[0].length).trim()
    ) {
      open = null
    }
  }
  return open
}

/** Index where the last block starts: after the last blank line outside a code fence. */
function lastBlockStart(lines: string[]): number {
  let start = 0
  let fence: string | null = null
  lines.forEach((line, i) => {
    const match = FENCE.exec(line)
    if (match) {
      if (!fence) fence = match[1]!
      else if (match[1]![0] === fence[0] && match[1]!.length >= fence.length) fence = null
      return
    }
    if (!fence && !line.trim()) start = i + 1
  })
  return start
}

function cells(row: string): string[] {
  return row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|')
}

/** A table whose header is there but whose delimiter row is not complete yet. */
function isTableHeaderOnly(block: string[]): boolean {
  const header = block[0]?.trim() ?? ''
  if (!header.startsWith('|')) return false
  const delimiter = block[1]
  if (!delimiter) return true
  const parts = cells(delimiter)
  return parts.length < cells(header).length || !parts.every((part) => /^\s*:?-+:?\s*$/.test(part))
}

/** Removes a half-written link, image or HTML tag at the very end of the text. */
function trimIncompleteTail(text: string): string {
  // ![alt](src... or ![alt... : hide the image until it is complete.
  let match = /!\[[^\]\n]*(?:\]\([^)\n]*)?$/.exec(text)
  if (match) return text.slice(0, match.index)
  // [label](url... : show just the label for now.
  match = /\[([^\]\n]*)\]\([^)\n]*$/.exec(text)
  if (match) return text.slice(0, match.index) + match[1]
  // [label or [label] : show the label, unless it is a task marker such as "- [ ]".
  match = /\[([^\]\n]*)\]?$/.exec(text)
  if (match) {
    const before = text.slice(0, match.index)
    const lineStart = before.slice(before.lastIndexOf('\n') + 1)
    const isTaskMarker = LIST_MARKER.test(lineStart) && /^\[[ xX]?\]?$/.test(match[0])
    if (!isTaskMarker) return before + match[1]
  }
  // A tag that has not been closed yet, such as "<di".
  match = /<\/?[a-zA-Z][^<>\n]*$/.exec(text)
  if (match) return text.slice(0, match.index)
  return text
}

interface Delimiter {
  char: string
  length: number
  index: number
}

/** Closes emphasis, strikethrough and inline code left open at the end of `text`. */
function closeInline(text: string): string {
  const stack: Delimiter[] = []
  let i = 0
  let inCode: Delimiter | null = null
  while (i < text.length) {
    const char = text[i]!
    if (char === '\\' && !inCode) {
      i += 2
      continue
    }
    if (char !== '*' && char !== '_' && char !== '~' && char !== '`') {
      i++
      continue
    }
    let end = i
    while (text[end] === char) end++
    const length = end - i
    if (char === '`') {
      if (!inCode) inCode = { char, length, index: i }
      else if (inCode.length === length) inCode = null
      i = end
      continue
    }
    if (inCode) {
      i = end
      continue
    }
    const before = text[i - 1] ?? ' '
    // At the very end the next character has not arrived yet: treat the run
    // as an opener, so it is hidden instead of flashing as raw syntax.
    const after = text[end] ?? ''
    const lineStart = text.slice(text.lastIndexOf('\n', i - 1) + 1, i)
    const isBullet = /^\s*$/.test(lineStart) && after === ' ' && length === 1 && char !== '~'
    const leftFlanking = after === '' || !/\s/.test(after)
    const rightFlanking = !/\s/.test(before)
    const top = stack.at(-1)
    if (top && top.char === char && top.length === length && rightFlanking) {
      stack.pop()
    } else if (
      !isBullet &&
      leftFlanking &&
      !(char === '_' && /\w/.test(before)) &&
      !(char === '~' && length !== 2)
    ) {
      stack.push({ char, length, index: i })
    }
    i = end
  }
  let result = text
  if (inCode) result = closeOrDrop(result, inCode)
  for (const open of stack.reverse()) result = closeOrDrop(result, open)
  return result
}

/** Appends the closing delimiter, or drops the opener if nothing follows it yet. */
function closeOrDrop(text: string, open: Delimiter): string {
  const content = text.slice(open.index + open.length)
  if (!content.trim()) return text.slice(0, open.index) + content
  return text.trimEnd() + open.char.repeat(open.length) + text.slice(text.trimEnd().length)
}

/**
 * Makes unfinished markdown render as it will once complete. Use it on text
 * that is still streaming in; do not use it on finished documents.
 */
export function healMarkdown(markdown: string): string {
  const lines = markdown.split('\n')
  const fence = openFence(lines)
  if (fence) {
    const last = lines.at(-1)!
    // A fence that has only started ("``") is left alone; an open one is closed.
    return `${markdown}${last === '' ? '' : '\n'}${fence.marker}`
  }
  const start = lastBlockStart(lines)
  const head = lines.slice(0, start)
  let block = lines.slice(start)
  if (isTableHeaderOnly(block)) return head.join('\n').trimEnd()
  // A fence opener still being typed ("``") would flash as inline code.
  if (/^ {0,3}`{1,2}$/.test(block.at(-1) ?? '')) block = block.slice(0, -1)
  let text = block.join('\n')
  text = trimIncompleteTail(text)
  text = closeInline(text)
  return [...head, text].join('\n')
}
