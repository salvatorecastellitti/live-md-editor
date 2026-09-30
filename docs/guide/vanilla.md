# Plain HTML

No build step needed: load the module and the stylesheet from a CDN.

```html
<link rel="stylesheet" href="https://unpkg.com/live-md-editor/dist/style.css" />

<div id="editor"></div>

<script type="module">
  import { createEditor } from 'https://esm.sh/live-md-editor'

  const editor = createEditor({
    element: document.getElementById('editor'),
    value: '# Hello',
    onChange: (markdown) => localStorage.setItem('note', markdown),
  })
</script>
```

Pin a version in production, for example `https://esm.sh/live-md-editor@0.1`.

With a bundler (Vite, webpack, esbuild), install the package and import it as usual:

```ts
import { createEditor } from 'live-md-editor'
import 'live-md-editor/style.css'
```

To remove the editor, call `editor.destroy()`. It removes only what it added to the element.
