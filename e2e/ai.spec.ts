import { expect, test, type Page } from '@playwright/test'

const editor = (page: Page) => page.getByRole('textbox', { name: 'Test editor' })
const markdown = (page: Page) => page.locator('#markdown')

const answer = [
  '## Plan',
  '',
  'Use **streaming** with `fetch` and read [the docs](https://example.com).',
  '',
  '- [x] Parse',
  '- [ ] Render',
  '',
  '```ts',
  'const answer = 42',
  '```',
].join('\n')

test('a streamed answer renders formatted as it arrives and ends exact', async ({ page }) => {
  await page.goto('/')
  const frames = await page.evaluate(async (text) => {
    const writer = window.editor.stream()
    const seen: { busy: boolean; caret: boolean; raw: boolean }[] = []
    for (let i = 0; i < text.length; i += 3) {
      writer.write(text.slice(i, i + 3))
      await new Promise(requestAnimationFrame)
      const root = window.editor.view.dom
      const visible = [...root.querySelectorAll('p, h2, li')].map((el) => el.textContent).join('\n')
      seen.push({
        busy: root.getAttribute('aria-busy') === 'true',
        caret: !!root.querySelector('.lme-stream-caret'),
        raw: /\*\*|\]\(|`/.test(visible),
      })
    }
    writer.end()
    return seen
  }, answer)
  expect(frames.every((frame) => frame.busy && frame.caret && !frame.raw)).toBe(true)
  await expect(markdown(page)).toHaveText(answer)
  await expect(editor(page)).not.toHaveAttribute('aria-busy', 'true')
  await expect(editor(page).locator('.lme-stream-caret')).toHaveCount(0)
})

test('auto-scroll keeps the newest text in view', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 400 })
  await page.goto('/')
  const caretVisible = await page.evaluate(async () => {
    const writer = window.editor.stream()
    for (let i = 0; i < 80; i++) {
      writer.write(`Paragraph number ${i} of a long answer.\n\n`)
      await new Promise(requestAnimationFrame)
    }
    const caret = window.editor.view.dom.querySelector('.lme-stream-caret')!.getBoundingClientRect()
    writer.end()
    return caret.bottom <= window.innerHeight && caret.top >= 0
  })
  expect(caretVisible).toBe(true)
})

test('code blocks are highlighted once their language loads', async ({ page }) => {
  await page.goto(
    `/?${new URLSearchParams({ highlight: '1', value: '```ts\nconst answer: number = 42\n```' })}`,
  )
  await expect(editor(page).locator('pre .hljs-keyword').first()).toHaveText('const')
  const color = await editor(page)
    .locator('pre .hljs-keyword')
    .first()
    .evaluate((el) => getComputedStyle(el).color)
  const plain = await editor(page)
    .locator('pre code')
    .evaluate((el) => getComputedStyle(el).color)
  expect(color).not.toBe(plain)
})

test('the copy button copies the code', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Only Chromium lets tests read the clipboard')
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto(`/?${new URLSearchParams({ value: '```ts\nconst a = 1\nconst b = 2\n```' })}`)
  await editor(page).locator('pre').hover()
  const button = editor(page).getByRole('button', { name: 'Copy code' })
  await expect(button).toBeVisible()
  await button.click()
  await expect(editor(page).getByRole('button', { name: 'Copied' })).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('const a = 1\nconst b = 2')
})

test('the copy button is reachable by keyboard', async ({ page, browserName }) => {
  // Safari only moves focus to buttons with Tab when the user enables
  // "Press Tab to highlight each item" (Option+Tab otherwise); WebKit copies that.
  test.skip(browserName === 'webkit', 'Safari does not Tab to buttons by default')
  await page.goto(`/?${new URLSearchParams({ value: '```\nx\n```', readonly: '1' })}`)
  await page.keyboard.press('Tab')
  await expect(editor(page).getByRole('button', { name: 'Copy code' })).toBeFocused()
})
