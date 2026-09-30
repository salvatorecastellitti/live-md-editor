/**
 * React wrapper. Works in Next.js (it is a client component).
 *
 * @module live-md-editor/react
 */
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { createEditor, type Editor, type EditorOptions, type StreamWriter } from 'live-md-editor'

// useLayoutEffect does nothing on the server; useEffect keeps SSR quiet.
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

/** Props for {@link LiveMarkdownEditor}. */
export interface LiveMarkdownEditorProps extends Pick<
  EditorOptions,
  | 'placeholder'
  | 'autofocus'
  | 'ariaLabel'
  | 'extensions'
  | 'classNames'
  | 'changeDelay'
  | 'highlight'
  | 'copyButton'
> {
  /** Controlled markdown value. Pair with `onChange`. */
  value?: string
  /** Initial markdown for uncontrolled use. Ignored when `value` is set. */
  defaultValue?: string
  /** Called with the new markdown after every edit. */
  onChange?: (markdown: string) => void
  /** Defaults to true. */
  editable?: boolean
  /**
   * While true, `value` is treated as text that is still arriving (for
   * example an AI reply): each longer `value` is streamed in, rendered with
   * unfinished syntax repaired. When it turns false the stream ends. A
   * `value` that does not continue the previous one restarts the stream.
   */
  streaming?: boolean
  /** Class name of the wrapping `<div>`. */
  className?: string
  style?: CSSProperties
}

/**
 * React wrapper around {@link createEditor}. The ref exposes the core
 * {@link Editor} (null until mounted). `placeholder`, `extensions`,
 * `ariaLabel`, `classNames`, `changeDelay`, `highlight`, `copyButton` and
 * `autofocus` are read once, on mount.
 */
export const LiveMarkdownEditor = forwardRef<Editor | null, LiveMarkdownEditorProps>(
  function LiveMarkdownEditor(props, ref) {
    const { value, editable = true, streaming = false, className, style } = props
    const hostRef = useRef<HTMLDivElement>(null)
    const [editor, setEditor] = useState<Editor | null>(null)
    const latest = useRef(props)
    // The last markdown this editor reported. A `value` equal to it is just
    // the parent echoing our own change back (possibly late, with
    // changeDelay), so it must not replace the document.
    const reported = useRef<string | undefined>(undefined)
    // The running stream and the text it has been given so far.
    const stream = useRef<{ writer: StreamWriter; text: string } | null>(null)
    useIsomorphicLayoutEffect(() => {
      latest.current = props
    })

    useImperativeHandle(ref, () => editor as Editor, [editor])

    useEffect(() => {
      const initial = latest.current
      const instance = createEditor({
        element: hostRef.current!,
        value: initial.value ?? initial.defaultValue ?? '',
        onChange: (markdown) => {
          reported.current = markdown
          latest.current.onChange?.(markdown)
        },
        changeDelay: initial.changeDelay,
        placeholder: initial.placeholder,
        editable: initial.editable ?? true,
        autofocus: initial.autofocus,
        ariaLabel: initial.ariaLabel,
        extensions: initial.extensions,
        classNames: initial.classNames,
        highlight: initial.highlight,
        copyButton: initial.copyButton,
      })
      setEditor(instance)
      return () => {
        stream.current = null
        instance.destroy()
        setEditor(null)
      }
    }, [])

    useEffect(() => {
      if (!editor) return
      const text = value ?? ''
      const current = stream.current
      if (streaming) {
        if (current && text.startsWith(current.text)) {
          current.writer.write(text.slice(current.text.length))
          current.text = text
        } else {
          // A new stream, or a regenerated answer that does not continue the old one.
          current?.writer.end()
          editor.setMarkdown('')
          const writer = editor.stream()
          writer.write(text)
          stream.current = { writer, text }
        }
        reported.current = text
        return
      }
      if (current) {
        stream.current = null
        if (text.startsWith(current.text)) {
          current.writer.write(text.slice(current.text.length))
          current.writer.end()
        } else {
          // The final value differs from what was streamed (for example a
          // corrected answer). setMarkdown detaches the stream without
          // reporting the stale streamed text through onChange.
          editor.setMarkdown(text)
        }
        reported.current = text
        return
      }
      if (value === undefined || value === reported.current) return
      if (value !== editor.getMarkdown()) editor.setMarkdown(value)
      reported.current = value
    }, [editor, value, streaming])

    useEffect(() => {
      if (editor && editor.isEditable() !== editable) editor.setEditable(editable)
    }, [editor, editable])

    return <div ref={hostRef} className={['lme-root', className].filter(Boolean).join(' ')} style={style} />
  },
)

export type { Editor } from 'live-md-editor'
