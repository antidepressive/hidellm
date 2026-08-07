# Adding a disguise

A disguise is one entry in `src/core/themes.js`. The popup, the options page and
the settings validator all read that object, so nothing else needs editing. A new
theme appears in the UI on reload.

## The anatomy of a theme

```js
myapp: {
  label: 'My App',                    // shown on the options page and in the status line
  short: 'App',                       // shown on the popup's chips, where width is scarce
  hint: 'Word processor · grey desk', // one line under the preview
  accent: '#4285f4',                  // the app's brand colour

  font: '"Arial", sans-serif',        // typography forced onto the conversation
  fontSize: '11pt',
  pageWidth: 816,                     // the document column, in CSS pixels

  surround: '#f9fbfd',                // the desk colour behind the page
  sheet: 'paper',                     // 'paper' | 'grid' | 'flat': how previews draw it

  defaultDoc: 'Untitled document',    // used when the user hasn't named anything
  titleFor: (doc) => `${doc} - My App`,
  favicon: FAVICONS.myapp,            // an inline SVG data: URI

  height: 110,                        // the chrome's height in CSS pixels
  css: UI.RESET_CSS + UI.GOOGLE_CSS,  // the shell stylesheet
  canvasCss: paperCanvas('#f9fbfd', 816),
  chrome: (doc) => UI.googleShell({ /* ... */ }),
}
```

## Pick a shell

Three are built already, in `src/core/ui.js`:

| Shell | Used by | Layout |
|---|---|---|
| `UI.googleShell` | Docs, Sheets | App icon, document name, menu bar, a rounded toolbar pill |
| `UI.msShell` | Word, Excel | App bar with search, ribbon tabs, ribbon commands |
| `UI.notionShell` | Notion | A single 45px breadcrumb bar |

Each takes the document name plus a description of its contents, and both
spreadsheet themes append extra rows (`UI.columnHeader`, `UI.msColumnHeader`) under
the toolbar.

If your app doesn't resemble any of the three, write a fourth shell alongside them:
a CSS string and a function returning markup. Keep the markup inside one
`<div class="hl-app">`, and the injected script mounts exactly that.

## The toolbar mini-language

Both toolbar shells take an array of items:

| Item | Renders |
|---|---|
| `'bold'` | An icon button: any key of `PATHS` in `ui.js` |
| `'sep'` | A vertical divider |
| `'\|Normal text'` | A labelled dropdown with a chevron |
| `'#11'` | A boxed value, for font sizes and zoom levels |

Need a glyph that isn't there? Add a 24×24 path to `PATHS`. They're drawn at 18px,
where a faithful silhouette is all the eye needs; precision below that is wasted.

## Getting the height right

This matters more than anything else in the file.

`height` is the chrome's real height in CSS pixels at 100% zoom, and it has to be
the honest sum of the rows you drew. Get it wrong and the toolbar is clipped or
floats a gap above the content, which is the exact "looks zoomed in" tell that rendering
the chrome rather than screenshotting it exists to avoid.

For a `sheet: 'grid'` theme the height is also the grid's vertical offset, so the
first cell row lands under the column letters. `core.test.js` asserts that
`canvasCss` contains the height for every grid theme.

Measure by loading the real app at 100% zoom with devtools and reading the header's
computed height. The existing values:

| Theme | Height | Made of |
|---|---:|---|
| Docs | 110 | 60 title + menus, 2 gap, 40 toolbar, 8 gap |
| Sheets | 160 | 110 + 28 formula bar + 22 column letters |
| Word | 124 | 48 app bar + 36 tabs + 40 ribbon |
| Excel | 170 | 124 + 26 formula bar + 20 column letters |
| Notion | 45 | one bar |

## The canvas

`canvasCss` is applied to `<html>` and `<body>` on the real page. Three helpers
exist in `themes.js`:

- `paperCanvas(surround, width)`: a centred white page with a hairline edge on a
  tinted desk, drawn as a gradient so it stays centred and sharp at any window
  width;
- `gridCanvas(line, cellW, cellH, offsetX, offsetY)`: a spreadsheet grid;
- `plainCanvas(bg)`: flat colour.

Every rule needs `!important`: the base reset has already claimed `background` on
`*`, and a `body` selector only wins because it's more specific.

Don't reference a bundled image. Every asset in this extension is an inline data
URI, which is what lets the manifest declare no `web_accessible_resources`, and
that in turn is what stops a page detecting the extension by probing for its files.

## Checking your work

```bash
npm test
```

`core.test.js` will tell you if the theme is missing a field, if the favicon isn't a
data URI, if a grid canvas doesn't match its height, or if the document name isn't
escaped in your markup.

Then load the extension and look at it against the real app, side by side, at 100%
zoom. The tests can't do that part.
