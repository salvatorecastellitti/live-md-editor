# Theming

Import the default theme once:

```ts
import 'live-md-editor/style.css'
```

Every rule in it has the specificity of a single class (`.lme`). That is enough to beat CSS
resets such as Tailwind's preflight, and low enough that your own rules win without `!important`:
use a selector like `.lme h1`, or load your CSS after the theme. Most changes only need
variables:

```css
.lme {
  --lme-font: 'Inter', sans-serif;
  --lme-accent: #7c3aed;
  --lme-code-bg: #f4f4f5;
}
```

## Variables

| Variable                                                                                                                   | Default (light)                 | Used for                                       |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ---------------------------------------------- |
| `--lme-font`                                                                                                               | system UI font                  | Text                                           |
| `--lme-font-mono`                                                                                                          | system monospace                | Code                                           |
| `--lme-font-size`                                                                                                          | `1rem`                          | Base size; headings scale from it              |
| `--lme-line-height`                                                                                                        | `1.65`                          | Text                                           |
| `--lme-bg`                                                                                                                 | `transparent` (dark: `#0d1117`) | Background of the editing area                 |
| `--lme-padding`                                                                                                            | `0` (dark: `0.75em 1em`)        | Space around the content                       |
| `--lme-text`                                                                                                               | `#1f2328`                       | Text color                                     |
| `--lme-muted`                                                                                                              | `#59636e`                       | Quotes, finished tasks, labels                 |
| `--lme-placeholder`                                                                                                        | `#6e7781`                       | Placeholder                                    |
| `--lme-accent`                                                                                                             | `#0969da`                       | Links, checkboxes, caret, focus ring           |
| `--lme-border`                                                                                                             | `#d1d9e0`                       | Tables, rules                                  |
| `--lme-code-bg`                                                                                                            | `#f6f8fa`                       | Code and table headers                         |
| `--lme-quote-border`                                                                                                       | `#d1d9e0`                       | Quote bar                                      |
| `--lme-selected-cell`                                                                                                      | accent at 12%                   | Selected table cells                           |
| `--lme-radius`                                                                                                             | `6px`                           | Code blocks, images, the dark background       |
| `--lme-block-gap`                                                                                                          | `0.75em`                        | Space between blocks                           |
| `--lme-done-decoration`                                                                                                    | `none`                          | Set to `line-through` to strike finished tasks |
| `--lme-code-keyword`, `-string`, `-comment`, `-number`, `-function`, `-type`, `-property`, `-tag`, `-inserted`, `-deleted` | GitHub-like palette             | [Highlighted code](./highlighting)             |

## Dark mode

The theme follows the system setting (`prefers-color-scheme`). To force a mode, set
`data-theme="light"` or `data-theme="dark"` on any ancestor, for example `<html>`.

Each palette carries its own background. The light one is transparent, so the editor blends
into your page. The dark one paints a dark surface (`--lme-bg`) with some padding and rounded
corners, so light text never lands on a light page when the system is in dark mode but your
page is not.

If your site manages its own theme (next-themes, Tailwind's `dark` class, VitePress), mirror it
on `<html>` so the editor follows your toggle rather than the system setting:

```ts
document.documentElement.dataset.theme = isDark ? 'dark' : 'light'
```

A page that is light only can simply set `<html data-theme="light">`. A dark site that wants the
editor to sit directly on its own background, without the card, can drop it:

```css
.lme {
  --lme-bg: transparent;
  --lme-padding: 0;
}
```

## Class names

| Class                           | Element                                           |
| ------------------------------- | ------------------------------------------------- |
| `.lme`                          | The editing area                                  |
| `.lme-root`                     | The React wrapper `<div>`                         |
| `.lme-check-item`               | A task or radio list item                         |
| `.lme-check-input`              | Its checkbox or radio                             |
| `.lme-check-content`            | Its text                                          |
| `.lme-empty`                    | The empty first paragraph showing the placeholder |
| `.lme-html`, `.lme-html-inline` | Raw HTML shown as text                            |
| `.lme-copy`                     | The copy button on code blocks                    |
| `.lme-streaming`                | The editing area while a stream runs              |
| `.lme-stream-caret`             | The caret where streamed text arrives             |

Code blocks with a language have `data-language` on the `<pre>`, which the theme shows in the
corner.

## Without the default theme

Skip the import and style the classes above yourself. Keep these rules, which the editor needs
to handle whitespace correctly:

```css
.lme {
  white-space: pre-wrap;
  white-space: break-spaces;
  word-wrap: break-word;
  font-variant-ligatures: none;
}
```
