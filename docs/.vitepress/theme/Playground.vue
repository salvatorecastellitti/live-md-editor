<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { createEditor, type Editor } from 'live-md-editor'
import { highlight } from 'live-md-editor/highlight'

const initial = `# Welcome to live-md-editor

Type markdown and it turns into formatting as you go: try \`## \` at the start of a line,
or wrap a word in **double stars**.

- [x] Checkboxes are real and clickable
- [ ] Press Tab to indent, Shift+Tab to outdent

> Paste markdown from anywhere and it arrives formatted.

| Shortcut | Action |
| --- | --- |
| Ctrl/Cmd + B | Bold |
| Ctrl/Cmd + I | Italic |
`

const aiAnswer = `## Streaming, live

Every token is rendered **as it arrives**: no raw \`**\` or \`###\` on screen.

\`\`\`ts
const editor = createEditor({ element, highlight })
await editor.streamFrom(response.body)
\`\`\`

| Feature | Status |
| --- | --- |
| Unfinished syntax repaired | yes |
| One undo step | yes |

- [x] Try it again with the button above
`

const host = ref<HTMLElement>()
const markdown = ref(initial)
const streaming = ref(false)
let editor: Editor | undefined

onMounted(() => {
  editor = createEditor({
    element: host.value!,
    value: initial,
    extensions: { radio: true },
    highlight,
    placeholder: 'Start writing...',
    ariaLabel: 'Playground editor',
    onChange: (value) => {
      markdown.value = value
    },
  })
})
onBeforeUnmount(() => editor?.destroy())

async function* tokens(text: string) {
  for (let i = 0; i < text.length;) {
    const size = 2 + Math.floor(Math.random() * 6)
    yield text.slice(i, i + size)
    i += size
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

async function simulate() {
  if (!editor) return
  streaming.value = true
  editor.setMarkdown('')
  try {
    markdown.value = await editor.streamFrom(tokens(aiAnswer))
  } finally {
    streaming.value = false
  }
}

function load(event: Event) {
  const value = (event.target as HTMLTextAreaElement).value
  editor?.setMarkdown(value)
  markdown.value = value
}
</script>

<template>
  <div class="playground">
    <section class="lme-demo">
      <div class="bar">
        <h2>Editor</h2>
        <button type="button" :disabled="streaming" @click="simulate">Simulate AI answer</button>
      </div>
      <div ref="host" />
    </section>
    <section class="lme-demo">
      <h2>Markdown</h2>
      <textarea :value="markdown" spellcheck="false" aria-label="Markdown source" @change="load" />
      <p class="hint">Edit the markdown here and click outside to load it into the editor.</p>
    </section>
  </div>
</template>

<style scoped>
.playground {
  display: grid;
  gap: 16px;
}
@media (min-width: 960px) {
  .playground {
    grid-template-columns: 1fr 1fr;
  }
}
.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.bar button {
  font-size: 13px;
  padding: 4px 10px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
}
.bar button:disabled {
  opacity: 0.5;
}
h2 {
  margin: 0;
  font-size: 14px;
  border: none;
  padding: 0;
}
textarea {
  width: 100%;
  min-height: 420px;
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  background: transparent;
  color: inherit;
  border: none;
  resize: vertical;
}
.hint {
  font-size: 12px;
  color: var(--vp-c-text-2);
}
</style>
