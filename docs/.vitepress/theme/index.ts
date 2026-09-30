import DefaultTheme from 'vitepress/theme'
import { inBrowser, useData, type Theme } from 'vitepress'
import { watch } from 'vue'
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
  setup() {
    // The editors on this site follow the VitePress color mode through the
    // library's own mechanism: data-theme on <html>.
    const { isDark } = useData()
    if (!inBrowser) return
    watch(
      isDark,
      (dark) => {
        document.documentElement.dataset.theme = dark ? 'dark' : 'light'
      },
      { immediate: true },
    )
  },
} satisfies Theme
