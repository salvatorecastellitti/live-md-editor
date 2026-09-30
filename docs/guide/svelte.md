# Svelte

```svelte
<script lang="ts">
  import { onMount } from 'svelte'
  import { createEditor } from 'live-md-editor'
  import 'live-md-editor/style.css'

  let { value = $bindable('') } = $props()
  let host: HTMLDivElement

  onMount(() => {
    const editor = createEditor({
      element: host,
      value,
      onChange: (markdown) => (value = markdown),
    })
    return () => editor.destroy()
  })
</script>

<div bind:this={host}></div>
```

Use it with `bind:value`:

```svelte
<MarkdownEditor bind:value={note} />
```

`onMount` never runs during server rendering, so this works in SvelteKit as is.
