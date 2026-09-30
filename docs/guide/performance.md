# Large documents

Rendering and typing stay fast on large documents: in our browser test, each keystroke in a
10,000-line document takes about 2 ms.

The expensive part is turning the document back into markdown for `onChange`. On a
10,000-line document that takes around 25 ms on a fast laptop, and several times that on a phone.
Doing it on every keystroke makes typing feel sticky.

Set `changeDelay` to wait until the user pauses:

```ts
createEditor({
  element,
  value,
  changeDelay: 300,
  onChange: save,
})
```

- `onChange` runs once, 300 ms after the last edit.
- Pending changes are flushed when the editor loses focus and when it is destroyed, so nothing is
  lost.
- `editor.getMarkdown()` is always up to date, whatever the delay.

For short documents, keep the default (`0`): `onChange` then runs after every edit.
