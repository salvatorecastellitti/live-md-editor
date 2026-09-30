import { expect, test, type Page } from '@playwright/test'

const editor = (page: Page) => page.getByRole('textbox', { name: 'Test editor' })
const markdown = (page: Page) => page.locator('#markdown')

async function open(page: Page, params: Record<string, string> = {}) {
  await page.goto(`/?${new URLSearchParams(params).toString()}`)
  await editor(page).click()
}

test('typing markdown shortcuts produces formatted blocks', async ({ page }) => {
  await open(page)
  await page.keyboard.type('## Heading')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Some **bold** text')
  await page.keyboard.press('Enter')
  await page.keyboard.type('- [ ] a task')
  await expect(editor(page).locator('h2')).toHaveText('Heading')
  await expect(editor(page).locator('strong')).toHaveText('bold')
  await expect(editor(page).locator('input[type=checkbox]')).toHaveCount(1)
  await expect(markdown(page)).toHaveText('## Heading\n\nSome **bold** text\n\n- [ ] a task')
})

test('clicking a checkbox updates the markdown, undo restores it', async ({ page }) => {
  await open(page, { value: '- [ ] one\n- [ ] two' })
  await editor(page).locator('input[type=checkbox]').nth(1).click()
  await expect(markdown(page)).toHaveText('- [ ] one\n- [x] two')
  await editor(page).click()
  await page.keyboard.press('ControlOrMeta+z')
  await expect(markdown(page)).toHaveText('- [ ] one\n- [ ] two')
})

test('radio items form an exclusive group', async ({ page }) => {
  await open(page, { value: '- (x) small\n- ( ) large', radio: '1' })
  await editor(page).locator('input[type=radio]').nth(1).click()
  await expect(markdown(page)).toHaveText('- ( ) small\n- (x) large')
})

test('keyboard shortcut makes selected text bold', async ({ page }) => {
  await open(page, { value: 'word' })
  await editor(page).locator('p').dblclick()
  await page.keyboard.press('ControlOrMeta+b')
  await expect(markdown(page)).toHaveText('**word**')
})

test('pasting markdown text inserts formatted content', async ({ page }) => {
  await open(page)
  await editor(page).evaluate((element) => {
    const data = new DataTransfer()
    data.setData('text/plain', '# Pasted\n\n- [x] done')
    element.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    )
  })
  await expect(editor(page).locator('h1')).toHaveText('Pasted')
  await expect(markdown(page)).toHaveText('# Pasted\n\n- [x] done')
})

test('read-only mode renders but does not edit', async ({ page }) => {
  await page.goto(`/?${new URLSearchParams({ value: '# Title\n\n- [ ] task', readonly: '1' })}`)
  await expect(editor(page)).toHaveAttribute('contenteditable', 'false')
  await expect(editor(page).locator('input[type=checkbox]')).toBeDisabled()
})

test('default theme styles headings, placeholder and code language', async ({ page }) => {
  await page.goto(`/?${new URLSearchParams({ placeholder: 'Write something' })}`)
  const before = await editor(page)
    .locator('p')
    .evaluate((p) => getComputedStyle(p, '::before').content)
  expect(before).toBe('"Write something"')
  await page.goto(`/?${new URLSearchParams({ value: '# Big\n\nsmall\n\n```ts\nx\n```' })}`)
  const size = (selector: string) =>
    editor(page)
      .locator(selector)
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
  expect(await size('h1')).toBeGreaterThan(await size('p'))
  const label = await editor(page)
    .locator('pre')
    .evaluate((pre) => getComputedStyle(pre, '::before').content)
  expect(label).toBe('"ts"')
})
