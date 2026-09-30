import { defineConfig, type Options } from 'tsup'

const shared: Options = {
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  target: 'es2020',
}

export default defineConfig([
  {
    ...shared,
    entry: { index: 'src/index.ts' },
    clean: true,
    treeshake: true,
    // markdown-it and prosemirror-markdown are devDependencies, so tsup bundles
    // them. These aliases swap two of markdown-it's own dependencies for small
    // shims (see shims/), which removes about 30 KB gzipped.
    esbuildOptions(options) {
      options.alias = {
        entities: './shims/entities.ts',
        'linkify-it': './shims/linkify-it.ts',
      }
    },
  },
  {
    ...shared,
    entry: { highlight: 'src/highlight/index.ts' },
    // lowlight and highlight.js are dependencies, so they stay imports and each
    // language remains a separate file the app's bundler loads on demand.
    external: ['live-md-editor'],
  },
  {
    ...shared,
    entry: { react: 'src/react/index.tsx' },
    // The wrapper must use the same core instance as the app, never a copy.
    external: ['live-md-editor', 'react', 'react-dom'],
    // Next.js needs this directive to treat the component as client-only.
    // (Rollup tree shaking would strip it, so treeshake stays off here.)
    banner: { js: "'use client';" },
  },
])
