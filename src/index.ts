/**
 * The framework-agnostic core. Mount an editor with {@link createEditor}.
 *
 * @module live-md-editor
 */
export { createEditor } from './editor'
export type { Editor, EditorEvents, EditorOptions, TextSource } from './editor'
export type { StreamOptions, StreamWriter } from './stream/stream'
export { healMarkdown } from './stream/heal'
export type { ActiveName, Commands } from './commands'
export type { Highlighter, HighlightToken } from './plugins/highlight'
export { isSafeUrl } from './url'
