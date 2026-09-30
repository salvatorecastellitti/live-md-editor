# Radio lists

Markdown has checkboxes (`- [ ]`) but no radio buttons. live-md-editor adds them as an opt-in
extension:

```ts
createEditor({ element, extensions: { radio: true } })
```

```md
- ( ) Small
- (x) Medium
- ( ) Large
```

<LiveExample radio md="- ( ) Small\n- (x) Medium\n- ( ) Large" />

Consecutive radio items form one group: selecting one clears the others. Anything else between
them (a normal item, a checkbox, a paragraph) starts a new group.

Type `( ) ` or `(x) ` at the start of a line to create one, or use
`editor.commands.toggleRadioList()`.

## Compatibility

This is not standard markdown. Other tools show `( ) Small` as plain text, which still reads
well. With the extension off, live-md-editor does the same and keeps the text unchanged.
