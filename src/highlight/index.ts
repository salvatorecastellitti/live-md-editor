/**
 * Syntax highlighting for code blocks, built on highlight.js (through
 * lowlight). Pass `highlight` to `createEditor`. Each language is loaded the
 * first time a code block uses it, so unused languages cost nothing.
 *
 * @module live-md-editor/highlight
 */
import type { LanguageFn } from 'highlight.js'
import { createLowlight } from 'lowlight'
import type { Highlighter, HighlightToken } from 'live-md-editor'

type Loader = () => Promise<{ default: LanguageFn }>

// Each import() becomes its own small file in the app's bundle.
const loaders: Record<string, Loader> = {
  bash: () => import('highlight.js/lib/languages/bash'),
  c: () => import('highlight.js/lib/languages/c'),
  cpp: () => import('highlight.js/lib/languages/cpp'),
  csharp: () => import('highlight.js/lib/languages/csharp'),
  css: () => import('highlight.js/lib/languages/css'),
  dart: () => import('highlight.js/lib/languages/dart'),
  diff: () => import('highlight.js/lib/languages/diff'),
  dockerfile: () => import('highlight.js/lib/languages/dockerfile'),
  go: () => import('highlight.js/lib/languages/go'),
  graphql: () => import('highlight.js/lib/languages/graphql'),
  ini: () => import('highlight.js/lib/languages/ini'),
  java: () => import('highlight.js/lib/languages/java'),
  javascript: () => import('highlight.js/lib/languages/javascript'),
  json: () => import('highlight.js/lib/languages/json'),
  kotlin: () => import('highlight.js/lib/languages/kotlin'),
  lua: () => import('highlight.js/lib/languages/lua'),
  makefile: () => import('highlight.js/lib/languages/makefile'),
  markdown: () => import('highlight.js/lib/languages/markdown'),
  php: () => import('highlight.js/lib/languages/php'),
  python: () => import('highlight.js/lib/languages/python'),
  r: () => import('highlight.js/lib/languages/r'),
  ruby: () => import('highlight.js/lib/languages/ruby'),
  rust: () => import('highlight.js/lib/languages/rust'),
  scss: () => import('highlight.js/lib/languages/scss'),
  shell: () => import('highlight.js/lib/languages/shell'),
  sql: () => import('highlight.js/lib/languages/sql'),
  swift: () => import('highlight.js/lib/languages/swift'),
  typescript: () => import('highlight.js/lib/languages/typescript'),
  xml: () => import('highlight.js/lib/languages/xml'),
  yaml: () => import('highlight.js/lib/languages/yaml'),
}

const aliases: Record<string, string> = {
  sh: 'bash',
  zsh: 'bash',
  console: 'shell',
  'c++': 'cpp',
  cs: 'csharp',
  'c#': 'csharp',
  docker: 'dockerfile',
  golang: 'go',
  gql: 'graphql',
  toml: 'ini',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsonc: 'json',
  kt: 'kotlin',
  md: 'markdown',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  html: 'xml',
  svg: 'xml',
  vue: 'xml',
  yml: 'yaml',
  patch: 'diff',
}

const lowlight = createLowlight()
const loading = new Map<string, Promise<void>>()

interface HastNode {
  type: string
  value?: string
  properties?: { className?: unknown }
  children?: HastNode[]
}

/** Flattens lowlight's syntax tree into character ranges with class names. */
function tokensOf(root: HastNode): HighlightToken[] {
  const tokens: HighlightToken[] = []
  let offset = 0
  const walk = (node: HastNode): void => {
    if (node.type === 'text') {
      offset += node.value?.length ?? 0
      return
    }
    const start = offset
    node.children?.forEach(walk)
    const className = node.properties?.className
    if (Array.isArray(className) && offset > start) {
      tokens.push({ from: start, to: offset, className: className.join(' ') })
    }
  }
  walk(root)
  return tokens
}

function resolve(language: string): string | null {
  const name = language.toLowerCase()
  if (lowlight.registered(name)) return name
  const target = aliases[name] ?? name
  return target in loaders ? target : null
}

/**
 * A {@link Highlighter} for about 30 common languages (and their usual
 * aliases such as `ts`, `py`, `sh`). Unknown languages stay plain.
 */
export const highlight: Highlighter = (code, language) => {
  const name = resolve(language)
  if (!name) return null
  if (lowlight.registered(name)) return tokensOf(lowlight.highlight(name, code) as HastNode)
  let ready = loading.get(name)
  if (!ready) {
    ready = loaders[name]!().then((module) => lowlight.register(name, module.default))
    loading.set(name, ready)
  }
  return ready.then(() => tokensOf(lowlight.highlight(name, code) as HastNode))
}

/**
 * Adds a highlight.js grammar that is not included, for example
 * `registerLanguage('haskell', haskell, ['hs'])` with
 * `import haskell from 'highlight.js/lib/languages/haskell'`.
 */
export function registerLanguage(name: string, grammar: LanguageFn, languageAliases: string[] = []): void {
  lowlight.register(name, grammar)
  if (languageAliases.length) lowlight.registerAlias(name, languageAliases)
}
