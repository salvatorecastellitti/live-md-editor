import { expect, test } from '@playwright/test'

// Keystroke cost on a 10,000-line document. Each dispatch is one typed
// character: state update plus DOM update. With changeDelay set, markdown
// is not serialized per keystroke.
test('typing stays under one frame on a 10,000-line document', async ({ page }) => {
  await page.goto('/?lines=10000&delay=300')
  await page.waitForFunction(() => window.editor !== undefined)
  const timings = await page.evaluate(() => {
    const { view } = window.editor
    view.focus()
    const samples: number[] = []
    for (let i = 0; i < 60; i++) {
      const start = performance.now()
      view.dispatch(view.state.tr.insertText('x'))
      samples.push(performance.now() - start)
    }
    return samples.sort((a, b) => a - b)
  })
  const median = timings[Math.floor(timings.length / 2)]!
  const p95 = timings[Math.floor(timings.length * 0.95)]!
  console.log(`10k lines: median ${median.toFixed(2)} ms, p95 ${p95.toFixed(2)} ms per keystroke`)
  expect(median).toBeLessThan(16)
})

// Frame cost while streaming a long AI answer: each flush renders one frame's
// worth of new text. Blocks that can no longer change are frozen, so the cost
// stays flat as the answer grows instead of rising with its length.
test('streaming a 2,000-line answer stays within a frame', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => window.editor !== undefined)
  const { median, p95, last } = await page.evaluate(() => {
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
    const lastHundred = samples.slice(-100).sort((a, b) => a - b)
    const sorted = [...samples].sort((a, b) => a - b)
    return {
      median: sorted[Math.floor(sorted.length / 2)]!,
      p95: sorted[Math.floor(sorted.length * 0.95)]!,
      last: lastHundred[Math.floor(lastHundred.length / 2)]!,
    }
  })
  console.log(
    `stream 2k lines: median ${median.toFixed(2)} ms, p95 ${p95.toFixed(2)} ms, median of last 100 frames ${last.toFixed(2)} ms`,
  )
  expect(median).toBeLessThan(8)
  expect(last).toBeLessThan(8)
})
