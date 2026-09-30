// Records the README demos into docs/public:
//   demo.gif         someone typing markdown shortcuts
//   demo-stream.gif  an AI answer streaming in, formatted as it arrives
// Run with the test page server up: pnpm dev (in another terminal), then
// pnpm demo. Needs ffmpeg on PATH.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, type Page } from '@playwright/test'

const size = { width: 720, height: 360 }

async function record(name: string, url: string, act: (page: Page) => Promise<void>): Promise<void> {
  const videoDir = mkdtempSync(join(tmpdir(), 'lme-demo-'))
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: size, recordVideo: { dir: videoDir, size } })
  const page = await context.newPage()
  await page.goto(url)
  await page.addStyleTag({ content: '#markdown { display: none } body { padding: 32px }' })
  await act(page)
  await context.close()
  await browser.close()
  const [video] = readdirSync(videoDir)
  execFileSync('ffmpeg', [
    '-y',
    '-i',
    join(videoDir, video!),
    '-vf',
    'fps=12,scale=720:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64[p];[b][p]paletteuse',
    `docs/public/${name}`,
  ])
  rmSync(videoDir, { recursive: true, force: true })
  console.log(`Wrote docs/public/${name}`)
}

await record('demo.gif', 'http://localhost:4173/?placeholder=Start%20typing%20markdown...', async (page) => {
  await page.getByRole('textbox').click()
  await page.waitForTimeout(600)
  const typeSlowly = (text: string) => page.keyboard.type(text, { delay: 55 })
  await typeSlowly('# Shopping list')
  await page.keyboard.press('Enter')
  await typeSlowly('Things to buy **today**:')
  await page.keyboard.press('Enter')
  await typeSlowly('[ ] Milk')
  await page.keyboard.press('Enter')
  await typeSlowly('Bread')
  await page.keyboard.press('Enter')
  await typeSlowly('Coffee')
  await page.waitForTimeout(400)
  await page.getByRole('checkbox').first().click()
  await page.waitForTimeout(400)
  await page.getByRole('checkbox').nth(2).click()
  await page.waitForTimeout(1500)
})

const answer = [
  '## Reading a file in Node',
  '',
  'Use **`fs/promises`** so the call does not block:',
  '',
  '```ts',
  "import { readFile } from 'node:fs/promises'",
  '',
  "const text = await readFile('notes.md', 'utf8')",
  '```',
  '',
  '- [x] Works in ESM',
  '- [ ] Handle `ENOENT` errors',
].join('\n')

await record('demo-stream.gif', 'http://localhost:4173/?highlight=1', async (page) => {
  await page.waitForTimeout(500)
  await page.evaluate(async (text) => {
    const writer = window.editor.stream()
    for (let i = 0; i < text.length; i += 3) {
      writer.write(text.slice(i, i + 3))
      await new Promise((resolve) => setTimeout(resolve, 30))
    }
    writer.end()
  }, answer)
  await page.waitForTimeout(1500)
})
