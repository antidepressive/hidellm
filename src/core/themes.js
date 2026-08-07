// themes.js: the disguises themselves.
//
// A theme answers four questions:
//   1. what does the tab say?          → titleFor(docName)
//   2. what does the tab icon look like? → favicon (an inline SVG data: URI)
//   3. what sits across the top?        → chrome(docName) → { html, css, height }
//   4. what does the page behind it look like? → canvasCss (painted onto <body>)
//
// Favicons are data: URIs rather than bundled files on purpose. It keeps the
// extension free of web-accessible resources, so a visited page can't detect the
// extension by probing for chrome-extension:// asset URLs.
//
// Adding a theme is one entry in THEMES. The popup, the options page and the
// validation in settings.js all read this object, so nothing else needs editing.

(function (root) {
  const HL = (root.HL = root.HL || {});
  const UI = HL.UI;

  // inline SVG → data: URI. encodeURIComponent (not base64) keeps it readable in
  // devtools and is a few bytes smaller for markup this simple.
  const svgUri = (svg) => 'data:image/svg+xml,' + encodeURIComponent(svg.replace(/\s+/g, ' ').trim());

  // ─── favicons ───
  const FAVICONS = {
    docs: svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
      <path fill="#4285f4" d="M6 2h13l7 7v20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/>
      <path fill="#a1c2fa" d="M19 2l7 7h-7z"/>
      <g fill="#fff"><rect x="9" y="13" width="14" height="2" rx="1"/><rect x="9" y="18" width="14" height="2" rx="1"/><rect x="9" y="23" width="9" height="2" rx="1"/></g></svg>`),

    sheets: svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
      <path fill="#0f9d58" d="M6 2h13l7 7v20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/>
      <path fill="#87ceac" d="M19 2l7 7h-7z"/>
      <path fill="#fff" d="M9 13h14v12H9V13zm2 2v2.5h4V15h-4zm6 0v2.5h4V15h-4zm-6 4.5V22h4v-2.5h-4zm6 0V22h4v-2.5h-4z"/></svg>`),

    word: svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
      <rect width="32" height="32" rx="5" fill="#2b579a"/>
      <path fill="#fff" d="M4.5 9h3.4l2.3 9.7L12.6 9h2.8l2.4 9.7L20.1 9h3.4l-4 14h-3.2l-2.3-8.9L11.7 23H8.5z"/></svg>`),

    excel: svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
      <rect width="32" height="32" rx="5" fill="#107c41"/>
      <path fill="#fff" d="M5 9h4.2l3.3 5.1L15.9 9H20l-5.4 7.3L20.3 23H16l-3.6-5.4L8.9 23H4.7l5.7-6.8z"/></svg>`),

    notion: svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
      <rect width="32" height="32" rx="5" fill="#fff" stroke="#e3e2e0" stroke-width="1.5"/>
      <path fill="#191919" d="M10 23V9h3.1l6.1 8.7V9H22v14h-3.1l-6.1-8.7V23z"/></svg>`),
  };

  // ─── page canvases ───
  // Painted onto <body> with gradients rather than a screenshot, so the "paper"
  // stays centred and sharp at any window width, zoom level or pixel density.

  // a centred document page with a hairline edge, floating on a tinted surround
  function paperCanvas(surround, pageWidth) {
    const half = pageWidth / 2;
    return `
html { background-color: ${surround} !important; }
body {
  background-color: ${surround} !important;
  background-image: linear-gradient(to right,
    rgba(0,0,0,0) calc(50% - ${half + 1}px),
    rgba(0,0,0,0.10) calc(50% - ${half + 1}px),
    rgba(0,0,0,0.10) calc(50% - ${half}px),
    #ffffff calc(50% - ${half}px),
    #ffffff calc(50% + ${half}px),
    rgba(0,0,0,0.10) calc(50% + ${half}px),
    rgba(0,0,0,0.10) calc(50% + ${half + 1}px),
    rgba(0,0,0,0) calc(50% + ${half + 1}px)) !important;
  background-repeat: no-repeat !important;
  background-attachment: fixed !important;
  background-position: 0 0 !important;
  background-size: 100% 100% !important;
}`;
  }

  // a spreadsheet grid, aligned to the column header strip drawn in the chrome
  function gridCanvas(line, cellW, cellH, offsetX, offsetY) {
    return `
html { background-color: #ffffff !important; }
body {
  background-color: #ffffff !important;
  background-image:
    linear-gradient(to right, ${line} 1px, rgba(0,0,0,0) 1px),
    linear-gradient(to bottom, ${line} 1px, rgba(0,0,0,0) 1px) !important;
  background-size: ${cellW}px ${cellH}px, ${cellW}px ${cellH}px !important;
  background-position: ${offsetX}px ${offsetY}px, ${offsetX}px ${offsetY}px !important;
  background-repeat: repeat, repeat !important;
  background-attachment: fixed, fixed !important;
}`;
  }

  // flat white, the way a Notion page reads
  const plainCanvas = (bg) => `
html { background-color: ${bg} !important; }
body { background-color: ${bg} !important; background-image: none !important; }`;

  // ─── chrome heights ───
  // Kept as named constants because the canvas grids are offset by them.
  const GOOGLE_H = 110;             // 60 title/menus + 2 + 40 toolbar + 8
  const SHEETS_H = GOOGLE_H + 28 + 22;  // + formula bar + column letters
  const MS_H = 124;                 // 48 app bar + 36 tabs + 40 ribbon
  const EXCEL_H = MS_H + 26 + 20;
  const NOTION_H = 45;

  const THEMES = {
    docs: {
      label: 'Google Docs',
      short: 'Docs',
      hint: 'Word processor · light grey desk, white page',
      accent: '#4285f4',
      font: '"Arial", "Helvetica Neue", Helvetica, sans-serif',
      fontSize: '11pt',
      pageWidth: 816,
      surround: '#f9fbfd',
      sheet: 'paper',
      defaultDoc: 'Untitled document',
      titleFor: (doc) => `${doc} - Google Docs`,
      favicon: FAVICONS.docs,
      height: GOOGLE_H,
      css: UI.RESET_CSS + UI.GOOGLE_CSS,
      canvasCss: paperCanvas('#f9fbfd', 816),
      chrome: (doc) => UI.googleShell({
        docName: doc,
        appIcon: `<svg viewBox="0 0 32 32" width="34" height="34" aria-hidden="true">
            <path fill="#4285f4" d="M7 2h12l7 7v20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/>
            <path fill="#a1c2fa" d="M19 2l7 7h-7z"/>
            <g fill="#fff"><rect x="10" y="14" width="12" height="1.8" rx=".9"/><rect x="10" y="18" width="12" height="1.8" rx=".9"/><rect x="10" y="22" width="8" height="1.8" rx=".9"/></g>
          </svg>`,
        menus: ['File', 'Edit', 'View', 'Insert', 'Format', 'Tools', 'Extensions', 'Help'],
        tools: [
          'undo', 'redo', 'print', 'spellcheck', 'paint', 'sep',
          '#100%', 'sep',
          '|Normal text', 'sep',
          '|Arial', 'sep',
          '#11', 'sep',
          'bold', 'italic', 'underline', 'textcolor', 'highlight', 'sep',
          'link', 'comment', 'image', 'sep',
          'alignleft', 'linespacing', 'checklist', 'bullets', 'numbers',
        ],
      }),
    },

    sheets: {
      label: 'Google Sheets',
      short: 'Sheets',
      hint: 'Spreadsheet · formula bar and live grid',
      accent: '#0f9d58',
      font: '"Arial", "Helvetica Neue", Helvetica, sans-serif',
      fontSize: '10pt',
      pageWidth: 900,
      surround: '#ffffff',
      sheet: 'grid',
      defaultDoc: 'Untitled spreadsheet',
      titleFor: (doc) => `${doc} - Google Sheets`,
      favicon: FAVICONS.sheets,
      height: SHEETS_H,
      css: UI.RESET_CSS + UI.GOOGLE_CSS,
      canvasCss: gridCanvas('#e1e3e1', 100, 21, 46, SHEETS_H),
      chrome: (doc) => UI.googleShell({
        docName: doc,
        appIcon: `<svg viewBox="0 0 32 32" width="34" height="34" aria-hidden="true">
            <path fill="#0f9d58" d="M7 2h12l7 7v20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/>
            <path fill="#87ceac" d="M19 2l7 7h-7z"/>
            <path fill="#fff" d="M10 14h12v11H10V14zm1.6 1.6v2.2h3.6v-2.2h-3.6zm5.2 0v2.2h3.6v-2.2h-3.6zm-5.2 3.8v2.2h3.6v-2.2h-3.6zm5.2 0v2.2h3.6v-2.2h-3.6z"/>
          </svg>`,
        menus: ['File', 'Edit', 'View', 'Insert', 'Format', 'Data', 'Tools', 'Extensions', 'Help'],
        tools: [
          'undo', 'redo', 'print', 'paint', 'sep',
          '#100%', 'sep',
          '|123', 'sep',
          '|Arial', 'sep',
          '#10', 'sep',
          'bold', 'italic', 'textcolor', 'highlight', 'sep',
          'link', 'comment', 'image', 'filter', 'sep',
          'alignleft', 'table',
        ],
        rows:
          `<div class="hl-gfx"><span class="hl-gfx-ref">A1${UI.icon('chevron', 16)}</span><span class="hl-gfx-fx">fx</span></div>` +
          UI.columnHeader(14),
      }),
    },

    word: {
      label: 'Microsoft Word',
      short: 'Word',
      hint: 'Word processor · Office ribbon',
      accent: '#185abd',
      font: '"Calibri", "Segoe UI", sans-serif',
      fontSize: '11pt',
      pageWidth: 816,
      surround: '#f3f2f1',
      sheet: 'paper',
      defaultDoc: 'Document1.docx',
      titleFor: (doc) => `${doc} - Word`,
      favicon: FAVICONS.word,
      height: MS_H,
      css: UI.RESET_CSS + UI.MS_CSS + UI.msAccentCss('#185abd'),
      canvasCss: paperCanvas('#f3f2f1', 816),
      chrome: (doc) => UI.msShell({
        docName: doc,
        letter: 'W',
        accent: '#185abd',
        activeTab: 1,
        tabs: ['File', 'Home', 'Insert', 'Draw', 'Design', 'Layout', 'References', 'Review', 'View', 'Help'],
        tools: [
          'undo', 'redo', 'sep',
          'paste', 'sep',
          '|Calibri (Body)', '#11', 'sep',
          'bold', 'italic', 'underline', 'textcolor', 'highlight', 'sep',
          'bullets', 'numbers', 'alignleft', 'linespacing', 'sep',
          '|Normal', 'sep',
          'search', 'comment',
        ],
      }),
    },

    excel: {
      label: 'Microsoft Excel',
      short: 'Excel',
      hint: 'Spreadsheet · ribbon, formula bar, grid',
      accent: '#107c41',
      font: '"Aptos Narrow", "Calibri", "Segoe UI", sans-serif',
      fontSize: '11pt',
      pageWidth: 900,
      surround: '#ffffff',
      sheet: 'grid',
      defaultDoc: 'Book1.xlsx',
      titleFor: (doc) => `${doc} - Excel`,
      favicon: FAVICONS.excel,
      height: EXCEL_H,
      css: UI.RESET_CSS + UI.MS_CSS + UI.msAccentCss('#107c41'),
      canvasCss: gridCanvas('#d0d0d0', 64, 20, 34, EXCEL_H),
      chrome: (doc) => UI.msShell({
        docName: doc,
        letter: 'X',
        accent: '#107c41',
        activeTab: 1,
        tabs: ['File', 'Home', 'Insert', 'Draw', 'Page Layout', 'Formulas', 'Data', 'Review', 'View', 'Help'],
        tools: [
          'undo', 'redo', 'sep',
          'paste', 'sep',
          '|Aptos Narrow', '#11', 'sep',
          'bold', 'italic', 'underline', 'textcolor', 'highlight', 'sep',
          'alignleft', 'table', 'filter', 'sep',
          '|General', 'sep',
          'search',
        ],
        rows:
          `<div class="hl-mfx"><span class="hl-mfx-ref">A1${UI.icon('chevron', 14)}</span><span class="hl-mfx-fx">fx</span></div>` +
          UI.msColumnHeader(20),
      }),
    },

    notion: {
      label: 'Notion',
      short: 'Notion',
      hint: 'Notes · minimal breadcrumb bar',
      accent: '#37352f',
      font: 'ui-sans-serif, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif',
      fontSize: '16px',
      pageWidth: 708,
      surround: '#ffffff',
      sheet: 'flat',
      defaultDoc: 'Meeting notes',
      titleFor: (doc) => doc,
      favicon: FAVICONS.notion,
      height: NOTION_H,
      css: UI.RESET_CSS + UI.NOTION_CSS,
      canvasCss: plainCanvas('#ffffff'),
      chrome: (doc) => UI.notionShell({ docName: doc, workspace: 'Workspace' }),
    },
  };

  const DEFAULT_THEME = 'docs';

  // Everything the injected script needs for one theme, resolved against the
  // user's document name. Unknown keys fall back to the default rather than
  // throwing, so a corrupted setting degrades into a working disguise.
  function resolveTheme(themeKey, docName, titleOverride) {
    const key = THEMES[themeKey] ? themeKey : DEFAULT_THEME;
    const theme = THEMES[key];
    const doc = (docName || '').trim() || theme.defaultDoc;
    const title = (titleOverride || '').trim() || theme.titleFor(doc);
    return {
      key,
      title,
      favicon: theme.favicon,
      chromeHtml: theme.chrome(doc),
      chromeCss: theme.css,
      chromeHeight: theme.height,
    };
  }

  HL.THEMES = THEMES;
  HL.DEFAULT_THEME = DEFAULT_THEME;
  HL.resolveTheme = resolveTheme;
})(typeof self !== 'undefined' ? self : window);
