---
layout: home

hero:
  name: live-md-editor
  text: Edit markdown without seeing markdown
  tagline: A lightweight WYSIWYG editor that reads and writes plain markdown, and renders AI answers live as they stream. Works with Next.js, React, Vue, Svelte or no framework at all.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Try the playground
      link: /playground

features:
  - title: Built for AI answers
    details: Stream a model's markdown in and it renders formatted as it arrives, with unfinished syntax repaired. Code is highlighted and has a copy button.
  - title: Markdown in, markdown out
    details: The value is a plain markdown string. Save it anywhere. Saving never adds noise, so diffs stay clean.
  - title: Formatted while you type
    details: Type ## for a heading or - [ ] for a checkbox and the syntax disappears into formatting.
  - title: Every GFM feature
    details: Headings, emphasis, links, images, nested lists, task lists, quotes, code blocks, rules and tables.
  - title: Headless
    details: No toolbar to fight. A small command API lets you build your own in any framework.
  - title: Safe by default
    details: Raw HTML is shown as text, never run. Links are limited to http, https, mailto and relative URLs.
  - title: Built on ProseMirror
    details: The engine behind many production editors, with solid mobile keyboard and IME support.
---
