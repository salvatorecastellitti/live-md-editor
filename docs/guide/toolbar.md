# Build a toolbar

The editor ships without a toolbar so it fits any design. Every button you need is one command
away, and `isActive` tells you which buttons to highlight.

```ts
const buttons = [
  { label: 'Bold', run: () => editor.commands.toggleBold(), active: () => editor.isActive('bold') },
  {
    label: 'H2',
    run: () => editor.commands.setHeading(2),
    active: () => editor.isActive('heading', { level: 2 }),
  },
  { label: 'Tasks', run: () => editor.commands.toggleTaskList(), active: () => editor.isActive('taskList') },
]

editor.on('selectionChange', () => {
  for (const button of buttons) button.element.setAttribute('aria-pressed', String(button.active()))
})
```

Commands return `true` when they applied, so you can also use them to disable buttons that
would do nothing. Commands focus the editor again after they run, so clicking a toolbar button
does not lose the cursor.

While the editor is read-only or a stream is running, commands do nothing and return `false`.

## Commands

| Command                                                                                                          | Notes                                                                   |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `toggleBold()`, `toggleItalic()`, `toggleStrike()`, `toggleCode()`                                               | Inline formatting                                                       |
| `setLink(href)`, `unsetLink()`                                                                                   | Refuses unsafe URLs; with no selection, edits the link under the cursor |
| `setParagraph()`, `setHeading(level)`                                                                            | Level 1 to 6                                                            |
| `toggleBulletList()`, `toggleOrderedList()`, `toggleTaskList()`, `toggleRadioList()`                             | Converts between list kinds                                             |
| `toggleBlockquote()`, `setCodeBlock(language?)`                                                                  |                                                                         |
| `insertHorizontalRule()`, `insertImage(src, alt?)`                                                               |                                                                         |
| `insertTable(rows, cols)`, `addRowAfter()`, `addColumnAfter()`, `deleteRow()`, `deleteColumn()`, `deleteTable()` | The first row is the header                                             |
| `undo()`, `redo()`                                                                                               |                                                                         |

## `isActive` names

`bold`, `italic`, `strike`, `code`, `link`, `paragraph`, `heading` (optionally with
`{ level }`), `bulletList`, `orderedList`, `taskList`, `radioList`, `blockquote`, `codeBlock`,
`table`.

## Links with Mod+K

The editor has no built-in link dialog. Listen for the shortcut and show your own:

```ts
editor.on('linkShortcut', async () => {
  const href = await myLinkDialog()
  if (href) editor.commands.setLink(href)
})
```
