import { describe, expect, it } from 'vitest'
import { createParser } from '../src/markdown/parser'
import { healMarkdown } from '../src/stream/heal'
import { RAW_SYNTAX, visibleText } from './helpers'

describe('healMarkdown', () => {
  it.each([
    ['Some **bol', 'Some **bol**'],
    ['Some *ital', 'Some *ital*'],
    ['Some ~~stri', 'Some ~~stri~~'],
    ['Some `cod', 'Some `cod`'],
    ['***both', '***both***'],
    ['**bold** and *it', '**bold** and *it*'],
    ['Some **', 'Some '],
    ['Some ** ', 'Some ** '],
    ['Some *', 'Some '],
    ['text `', 'text '],
    ['snake_case_na', 'snake_case_na'],
    ['2 * 3 = 6', '2 * 3 = 6'],
    ['- item', '- item'],
    ['* item', '* item'],
    ['* item **bo', '* item **bo**'],
    ['`a*b` and **c', '`a*b` and **c**'],
    ['escaped \\*star', 'escaped \\*star'],
    ['see [the docs](https://ex', 'see the docs'],
    ['see [the docs]', 'see the docs'],
    ['see [the do', 'see the do'],
    ['look ![a cat](https://x', 'look '],
    ['look ![a c', 'look '],
    ['- [ ]', '- [ ]'],
    ['- [', '- ['],
    ['- [x] done', '- [x] done'],
    ['text <di', 'text '],
    ['```ts\nconst a = 1', '```ts\nconst a = 1\n```'],
    ['```ts\nconst a = 1\n', '```ts\nconst a = 1\n```'],
    ['```\ncode **not bold', '```\ncode **not bold\n```'],
    ['~~~\ncode', '~~~\ncode\n~~~'],
    ['```\ndone\n```\n\nafter **x', '```\ndone\n```\n\nafter **x**'],
    ['para\n\n``', 'para\n\n'],
    ['para\n\n| a | b |', 'para'],
    ['para\n\n| a | b |\n| --', 'para'],
    ['| a | b |\n| --- | --', '| a | b |\n| --- | --'],
    ['| a | b |\n| --- | --- |\n| 1 |', '| a | b |\n| --- | --- |\n| 1 |'],
    ['**open\n\nnext para', '**open\n\nnext para'],
  ])('%j renders as %j', (input, output) => {
    expect(healMarkdown(input)).toBe(output)
  })

  it('never lets raw syntax show at any cut point of a realistic answer', () => {
    const answer = [
      '## Setting up **auth**',
      '',
      'Install the package with `npm install auth-kit`, then read [the guide](https://example.com/guide).',
      '',
      '- [x] Create an *API key*',
      '- [ ] Add it to `.env`',
      '',
      '```ts',
      "import { auth } from 'auth-kit'",
      'const user = await auth()',
      '```',
      '',
      '| Option | Default |',
      '| --- | --- |',
      '| `ttl` | 3600 |',
      '',
      '> **Tip:** rotate keys ~~yearly~~ monthly.',
    ].join('\n')
    const parse = createParser({ radio: false })
    for (let cut = 1; cut <= answer.length; cut++) {
      const doc = parse(healMarkdown(answer.slice(0, cut)))
      expect(visibleText(doc), `cut at ${cut}`).not.toMatch(RAW_SYNTAX)
    }
  })
})
