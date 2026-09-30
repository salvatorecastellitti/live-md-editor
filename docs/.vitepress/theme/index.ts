import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import 'live-md-editor/style.css'
import './custom.css'
import LiveExample from './LiveExample.vue'
import Playground from './Playground.vue'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('LiveExample', LiveExample)
    app.component('Playground', Playground)
  },
} satisfies Theme
