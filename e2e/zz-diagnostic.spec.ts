// TEMPORARY diagnostic (removed before merge): how does this browser treat
// clipboardData passed to the ClipboardEvent constructor?
import { test } from '@playwright/test'

test('diagnostic: synthetic paste clipboardData', async ({ page, browserName }) => {
  await page.goto('/')
  const result = await page.evaluate(() => {
    const data = new DataTransfer()
    data.setData('text/plain', 'hello')
    const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
    const seen: Record<string, unknown> = {}
    const root = window.editor.view.dom
    root.addEventListener(
      'paste',
      (e) => {
        const cd = (e as ClipboardEvent).clipboardData
        seen.inListenerHasData = cd !== null
        seen.inListenerTypes = cd ? [...cd.types] : null
        seen.inListenerText = cd ? cd.getData('text/plain') : null
      },
      { capture: true, once: true },
    )
    const before = {
      sameObject: event.clipboardData === data,
      hasData: event.clipboardData !== null,
      types: event.clipboardData ? [...event.clipboardData.types] : null,
      text: event.clipboardData ? event.clipboardData.getData('text/plain') : null,
      sourceText: data.getData('text/plain'),
    }
    root.dispatchEvent(event)
    return { before, seen, prevented: event.defaultPrevented, markdown: window.editor.getMarkdown() }
  })
  console.log(`DIAG ${browserName} ${JSON.stringify(result)}`)
})
