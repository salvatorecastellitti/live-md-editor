const FENCE = /^ {0,3}(`{3,}|~{3,})/

/**
 * A line that starts a new top-level block which cannot change the blocks
 * before it: not indented (no list or code continuation), not a list item
 * (it could turn the list above into a loose list), not a quote, table row
 * or link reference definition.
 */
function startsFreshBlock(line: string): boolean {
  return (
    line.trim() !== '' &&
    !/^\s/.test(line) &&
    !/^(?:[-*+]|\d+[.)])(?:\s|$)/.test(line) &&
    !/^[>|]/.test(line) &&
    !/^\[[^\]]*\]:/.test(line)
  )
}

/**
 * Length of the start of `text` whose blocks are final: they will render
 * the same however the text continues. It ends at the start of the last
 * complete line that follows a blank line and starts a fresh block.
 * Returns 0 when nothing can be frozen yet.
 */
export function stableLength(text: string): number {
  const lines = text.split('\n')
  let offset = 0
  let stable = 0
  let fence: string | null = null
  let previousBlank = false
  // The last line may still be growing, so it never marks a boundary.
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i]!
    const match = FENCE.exec(line)
    if (!fence && previousBlank && startsFreshBlock(line)) stable = offset
    if (match) {
      if (!fence) fence = match[1]!
      else if (match[1]![0] === fence[0] && match[1]!.length >= fence.length) fence = null
    }
    previousBlank = !fence && line.trim() === ''
    offset += line.length + 1
  }
  return stable
}
