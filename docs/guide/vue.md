# Vue

```vue
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { createEditor, type Editor } from 'live-md-editor'
import 'live-md-editor/style.css'

const markdown = defineModel<string>({ default: '' })
const host = ref<HTMLElement>()
let editor: Editor | undefined

onMounted(() => {
  editor = createEditor({
    element: host.value!,
    value: markdown.value,
    onChange: (value) => {
      markdown.value = value
    },
  })
})

onBeforeUnmount(() => editor?.destroy())
</script>

<template>
  <div ref="host" />
</template>
```

Use it with `v-model`:

```vue
<MarkdownEditor v-model="note" />
```

In Nuxt, wrap it in `<ClientOnly>` so it only mounts in the browser.
