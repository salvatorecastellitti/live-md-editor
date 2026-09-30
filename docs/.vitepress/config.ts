import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitepress'
import typedocSidebar from '../api/typedoc-sidebar.json'

const path = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  title: 'live-md-editor',
  description: 'A lightweight WYSIWYG markdown editor for any framework.',
  base: '/live-md-editor/',
  srcExclude: ['superpowers/**'],
  cleanUrls: true,
  lastUpdated: true,
  vite: {
    resolve: {
      alias: {
        'live-md-editor/style.css': path('../../src/style.css'),
        'live-md-editor/highlight': path('../../src/highlight/index.ts'),
        'live-md-editor': path('../../src/index.ts'),
        entities: path('../../shims/entities.ts'),
        'linkify-it': path('../../shims/linkify-it.ts'),
      },
    },
  },
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'API', link: '/api/' },
      { text: 'Playground', link: '/playground' },
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Introduction',
          items: [
            { text: 'Getting started', link: '/guide/getting-started' },
            { text: 'Supported syntax', link: '/guide/syntax' },
          ],
        },
        {
          text: 'Frameworks',
          items: [
            { text: 'Next.js', link: '/guide/nextjs' },
            { text: 'React', link: '/guide/react' },
            { text: 'Vue', link: '/guide/vue' },
            { text: 'Svelte', link: '/guide/svelte' },
            { text: 'Plain HTML', link: '/guide/vanilla' },
          ],
        },
        {
          text: 'AI',
          items: [
            { text: 'AI streaming', link: '/guide/ai' },
            { text: 'Code highlighting', link: '/guide/highlighting' },
          ],
        },
        {
          text: 'Customising',
          items: [
            { text: 'Build a toolbar', link: '/guide/toolbar' },
            { text: 'Theming', link: '/guide/theming' },
            { text: 'Radio lists', link: '/guide/radio' },
            { text: 'Large documents', link: '/guide/performance' },
          ],
        },
      ],
      '/api/': [{ text: 'API reference', items: typedocSidebar }],
    },
    socialLinks: [{ icon: 'github', link: 'https://github.com/salvatorecastellitti/live-md-editor' }],
    search: { provider: 'local' },
    editLink: {
      pattern: 'https://github.com/salvatorecastellitti/live-md-editor/edit/main/docs/:path',
    },
    footer: { message: 'Released under the MIT License.' },
  },
})
