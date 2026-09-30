<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { createEditor, type Editor } from 'live-md-editor'

// `md` is written on one line in the docs, with \n for line breaks.
const props = defineProps<{ md: string; radio?: boolean }>()
const source = props.md.replace(/\\n/g, '\n')
const host = ref<HTMLElement>()
const output = ref(source)
let editor: Editor | undefined

onMounted(() => {
  editor = createEditor({
    element: host.value!,
    value: source,
    extensions: { radio: props.radio },
    ariaLabel: 'Example editor',
    onChange: (markdown) => {
      output.value = markdown
    },
  })
})
onBeforeUnmount(() => editor?.destroy())
</script>

<template>
  <div class="lme-demo">
    <div ref="host" />
    <details>
      <summary>Markdown</summary>
      <pre><code>{{ output }}</code></pre>
    </details>
  </div>
</template>
