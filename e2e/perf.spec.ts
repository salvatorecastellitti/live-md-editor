import { expect, test } from '@playwright/test'

// Keystroke cost on a 10,000-line document. Each dispatch is one typed
// character: state update plus DOM update. With changeDelay set, markdown
// is not serialized per keystroke.
test('typing stays under one frame on a 10,000-line document', async ({ page }) => {
  await page.goto('/?lines=10000&delay=300')
  await page.waitForFunction(() => window.editor !== undefined)
  const result = await page.evaluate(() => {
    const { view } = window.editor
    view.focus()
    const count = () => (view.state.doc.textContent.match(/x/g) ?? []).length
    const before = count()
    const samples: number[] = []
    for (let i = 0; i < 60; i++) {
      const start = performance.now()
      view.dispatch(view.state.tr.insertText('x'))
      samples.push(performance.now() - start)
    }
    const typed = count() - before
    return { timings: samples.sort((a, b) => a - b), typed }
  })
  const timings = result.timings
  const median = timings[Math.floor(timings.length / 2)]!
  const p95 = timings[Math.floor(timings.length * 0.95)]!
  console.log(`10k lines: median ${median.toFixed(2)} ms, p95 ${p95.toFixed(2)} ms per keystroke`)
  expect(result.typed).toBe(60)
  expect(median).toBeLessThan(16)
  expect(p95).toBeLessThan(32)
})

// Frame cost while streaming a long AI answer: each flush renders one frame's
// worth of new text. Blocks that can no longer change are frozen, so the cost
// stays flat as the answer grows instead of rising with its length.
test('streaming a 2,000-line answer stays within a frame', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => window.editor !== undefined)
  const { median, p95, last, first, lines, tables } = await page.evaluate(() => {
    const block =
      '## Step\n\nSome *text* with **bold**, `code` and a [link](https://x.com).\n\n' +
      '- [ ] one\n- [x] two\n\n```ts\nconst a = 1\n```\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n'
    let text = ''
    while (text.split('\n').length < 2000) text += block
    const writer = window.editor.stream({ autoScroll: false })
    const samples: number[] = []
    for (let i = 0; i < text.length; i += 40) {
      writer.write(text.slice(i, i + 40))
      const start = performance.now()
      writer.flush()
      samples.push(performance.now() - start)
    }
    writer.end()
    const lines = window.editor.getMarkdown().split('\n').length
    const tables = window.editor.view.dom.querySelectorAll('table').length
    const firstHundred = samples.slice(0, 100).sort((a, b) => a - b)
    const lastHundred = samples.slice(-100).sort((a, b) => a - b)
    const sorted = [...samples].sort((a, b) => a - b)
    return {
      median: sorted[Math.floor(sorted.length / 2)]!,
      p95: sorted[Math.floor(sorted.length * 0.95)]!,
      last: lastHundred[Math.floor(lastHundred.length / 2)]!,
      first: firstHundred[Math.floor(firstHundred.length / 2)]!,
      lines,
      tables,
    }
  })
  console.log(
    `stream 2k lines: median ${median.toFixed(2)} ms, p95 ${p95.toFixed(2)} ms, median of first 100 frames ${first.toFixed(2)} ms, median of last 100 frames ${last.toFixed(2)} ms`,
  )
  expect(lines).toBeGreaterThanOrEqual(1900)
  expect(tables).toBeGreaterThanOrEqual(50)
  expect(median).toBeLessThan(8)
  expect(p95).toBeLessThan(16)
  expect(last).toBeLessThan(8)
  expect(last).toBeLessThan(Math.max(3 * first, 1))
})
