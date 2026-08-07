// ui.js: the fake application chrome, drawn in HTML + CSS.
//
// Every theme's toolbar is *rendered*, never screenshotted. That matters:
//   - it lands on exact CSS pixel sizes, so it matches the real app at 100% zoom
//     on any display (a bitmap stretched to `width: 100vw` looks zoomed-in on a
//     wide monitor, which is the one tell nobody misses);
//   - it stays crisp on HiDPI;
//   - it needs no bundled images, so the extension ships no web-accessible
//     resources and a page can't fingerprint it by its chrome-extension:// URLs.
//
// Each builder returns { html, css, height }. The engine hands that to the page,
// which mounts it in a shadow root, and that's what keeps the disguise stylesheet
// (which flattens every colour on the page) from bleeding into the toolbar.
//
// Loaded in both the service worker and the popup, so it hangs off whichever
// global is available. See the IIFE at the bottom.

(function (root) {
  const HL = (root.HL = root.HL || {});

  // ─── escaping ───
  // theme markup interpolates user text (the custom document name), so it has to
  // be escaped before it goes anywhere near innerHTML.
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  // ─── icon set ───
  // 24x24 Material-style path data. These are drawn at 18px inside the toolbars,
  // where a faithful silhouette is all the eye needs.
  const PATHS = {
    undo: 'M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z',
    redo: 'M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.06-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z',
    print: 'M19 8h-1V3H6v5H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zM8 5h8v3H8V5zm8 14H8v-4h8v4zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z',
    spellcheck: 'M12.45 16h2.09L9.43 3H7.57L2.46 16h2.09l1.12-3h5.64l1.14 3zm-6.02-5L8.5 5.48 10.57 11H6.43zm15.16.59l-8.09 8.09-3.6-3.58L8.5 18.5l5 5L23 14l-1.41-1.41z',
    paint: 'M18 4V3c0-.55-.45-1-1-1H5c-.55 0-1 .45-1 1v4c0 .55.45 1 1 1h12c.55 0 1-.45 1-1V6h1v4H9v11c0 .55.45 1 1 1h2c.55 0 1-.45 1-1v-9h8V4h-3z',
    bold: 'M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z',
    italic: 'M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z',
    underline: 'M12 17c3.31 0 6-2.69 6-6V3h-2.5v8c0 1.93-1.57 3.5-3.5 3.5S8.5 12.93 8.5 11V3H6v8c0 3.31 2.69 6 6 6zm-7 2v2h14v-2H5z',
    textcolor: 'M2 20h20v3H2v-3zm5.6-4h2.2l1.05-2.9h4.3L16.2 16h2.2L13.9 3h-2.2L7.6 16zm3.9-4.8l1.4-3.9 1.4 3.9h-2.8z',
    highlight: 'M6 14l3 3v4h6v-4l3-3V9H6v5zm5-12h2v3h-2V2zM3.5 5.9l1.4-1.4 2.1 2.1-1.4 1.4L3.5 5.9zm13.5.7l2.1-2.1 1.4 1.4-2.1 2.1-1.4-1.4z',
    link: 'M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z',
    comment: 'M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z',
    image: 'M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z',
    alignleft: 'M15 15H3v2h12v-2zm0-8H3v2h12V7zM3 13h18v-2H3v2zm0 8h18v-2H3v2zM3 3v2h18V3H3z',
    aligncenter: 'M7 15v2h10v-2H7zm-4 6h18v-2H3v2zm0-8h18v-2H3v2zm4-6v2h10V7H7zM3 3v2h18V3H3z',
    linespacing: 'M6 7h2.5L5 3.5 1.5 7H4v10H1.5L5 20.5 8.5 17H6V7zm4-2v2h12V5H10zm0 14h12v-2H10v2zm0-6h12v-2H10v2z',
    checklist: 'M22 7h-9v2h9V7zm0 8h-9v2h9v-2zM5.54 11L2 7.46l1.41-1.41 2.12 2.12 4.24-4.24 1.41 1.41L5.54 11zm0 8L2 15.46l1.41-1.41 2.12 2.12 4.24-4.24 1.41 1.41L5.54 19z',
    bullets: 'M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z',
    numbers: 'M2 17h2v.5H3v1h1v.5H2v1h3v-4H2v1zm1-9h1V4H2v1h1v3zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2v1zm5-6v2h14V5H7zm0 14h14v-2H7v2zm0-6h14v-2H7v2z',
    search: 'M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
    star: 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z',
    folder: 'M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z',
    cloud: 'M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z',
    history: 'M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z',
    dots: 'M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z',
    chevron: 'M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z',
    person: 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
    lock: 'M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6zm3 12c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z',
    sidebar: 'M3 5v14h18V5H3zm7 12H5V7h5v10zm9 0h-7V7h7v10z',
    clock: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z',
    table: 'M3 3v18h18V3H3zm8 16H5v-4h6v4zm0-6H5V9h6v4zm8 6h-6v-4h6v4zm0-6h-6V9h6v4zm0-6H5V5h14v2z',
    filter: 'M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z',
    save: 'M17 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7l-4-4zm-5 16a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm3-10H5V5h10v4z',
    paste: 'M19 2h-4.18C14.4.84 13.3 0 12 0S9.6.84 9.18 2H5a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zm-7 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm7 18H5V4h2v3h10V4h2v16z',
  };

  // one toolbar glyph. `name` must be a key of PATHS; unknown names render nothing
  // rather than throwing, so a typo in a theme degrades instead of breaking.
  function icon(name, size = 18) {
    const d = PATHS[name];
    if (!d) return '';
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" focusable="false"><path fill="currentColor" d="${d}"/></svg>`;
  }

  // ─── shared reset for anything mounted in the disguise shadow root ───
  // the host page's injected stylesheet can't select into a shadow tree, but
  // *inherited* properties still cross the boundary, so reset them explicitly.
  const RESET_CSS = `
:host, .hl-app { all: initial; }
.hl-app, .hl-app * {
  box-sizing: border-box;
  margin: 0; padding: 0;
  font-weight: 400; font-style: normal; text-decoration: none;
  letter-spacing: normal; text-transform: none; line-height: normal;
  color: inherit;
}
.hl-app { display: block; width: 100%; height: 100%; overflow: hidden; -webkit-font-smoothing: antialiased; }
.hl-app svg { display: block; flex: 0 0 auto; }
.hl-row { display: flex; align-items: center; }
`;

  // ═══════════════════════════════════════════════════════════════════
  // Google shell: Docs and Sheets
  // ═══════════════════════════════════════════════════════════════════
  // Real measurements at 100% zoom: 60px title/menu block, then a 40px toolbar
  // pill with 2px above and 8px below → 110px. Sheets stacks a formula bar and a
  // column-header strip underneath.
  const GOOGLE_CSS = `
.hl-app { font-family: "Google Sans", "Google Sans Text", Roboto, "Segoe UI", Arial, sans-serif; background: #ffffff; }
.hl-gtop { display: flex; align-items: flex-start; gap: 8px; height: 60px; padding: 8px 12px 0; }
.hl-gicon { width: 40px; height: 40px; flex: 0 0 40px; display: flex; align-items: center; justify-content: center; }
.hl-gtitle { flex: 1 1 auto; min-width: 0; }
.hl-gname-row { display: flex; align-items: center; gap: 8px; height: 26px; }
.hl-gname { font-size: 18px; color: #1f1f1f; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 46ch; }
.hl-gname-row svg { color: #444746; }
.hl-gmenus { display: flex; align-items: center; height: 22px; margin-left: -6px; }
.hl-gmenu { font-size: 14px; color: #1f1f1f; padding: 1px 7px; border-radius: 4px; }
.hl-gright { display: flex; align-items: center; gap: 4px; padding-top: 4px; }
.hl-gcirc { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #444746; }
.hl-gshare { display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 20px; border-radius: 18px; background: #c2e7ff; color: #001d35; font-size: 14px; font-weight: 500; white-space: nowrap; }
.hl-gavatar { width: 32px; height: 32px; border-radius: 50%; background: #8e24aa; color: #fff; font-size: 14px; display: flex; align-items: center; justify-content: center; margin-left: 4px; }
.hl-gbar { display: flex; align-items: center; gap: 1px; height: 40px; margin: 2px 12px 8px; padding: 0 8px; background: #edf2fa; border-radius: 20px; overflow: hidden; }
.hl-gbtn { width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #444746; flex: 0 0 auto; }
.hl-gsep { width: 1px; height: 20px; background: #c4c7c5; margin: 0 7px; flex: 0 0 auto; }
.hl-gpick { display: flex; align-items: center; gap: 6px; height: 30px; padding: 0 8px; border-radius: 4px; font-size: 14px; color: #1f1f1f; white-space: nowrap; flex: 0 0 auto; }
.hl-gpick svg { color: #444746; }
.hl-gnum { display: flex; align-items: center; justify-content: center; height: 26px; min-width: 40px; padding: 0 6px; border: 1px solid #c4c7c5; border-radius: 4px; font-size: 14px; color: #1f1f1f; flex: 0 0 auto; }
.hl-gfx { display: flex; align-items: center; height: 28px; border-top: 1px solid #e0e0e0; border-bottom: 1px solid #e0e0e0; font-size: 13px; color: #444746; }
.hl-gfx-ref { width: 120px; flex: 0 0 120px; display: flex; align-items: center; justify-content: space-between; height: 100%; padding: 0 10px; border-right: 1px solid #e0e0e0; color: #1f1f1f; }
.hl-gfx-fx { width: 34px; flex: 0 0 34px; text-align: center; font-style: italic; font-family: "Times New Roman", serif; font-size: 15px; }
.hl-gcols { display: flex; height: 22px; background: #f8f9fa; border-bottom: 1px solid #e1e3e1; font-size: 11px; color: #444746; }
.hl-gcols i { flex: 0 0 46px; border-right: 1px solid #e1e3e1; }
.hl-gcols b { flex: 0 0 100px; font-weight: 400; text-align: center; line-height: 21px; border-right: 1px solid #e1e3e1; }
`;

  // Renders the Docs/Sheets header. `opts.rows` is extra markup appended under the
  // toolbar pill (Sheets uses it for the formula bar + column letters).
  function googleShell(opts) {
    const menus = opts.menus.map((m) => `<span class="hl-gmenu">${esc(m)}</span>`).join('');
    const tools = opts.tools.map(toolMarkup).join('');
    return `
<div class="hl-app">
  <div class="hl-gtop">
    <div class="hl-gicon">${opts.appIcon}</div>
    <div class="hl-gtitle">
      <div class="hl-gname-row">
        <span class="hl-gname">${esc(opts.docName)}</span>
        ${icon('star', 20)}${icon('folder', 20)}${icon('cloud', 20)}
      </div>
      <div class="hl-gmenus">${menus}</div>
    </div>
    <div class="hl-gright">
      <div class="hl-gcirc">${icon('history', 20)}</div>
      <div class="hl-gcirc">${icon('comment', 20)}</div>
      <div class="hl-gshare">${icon('lock', 18)}Share</div>
      <div class="hl-gavatar">A</div>
    </div>
  </div>
  <div class="hl-gbar">${tools}</div>
  ${opts.rows || ''}
</div>`;
  }

  // toolbar item mini-language, shared by both shells:
  //   'sep'            → divider    '|Normal text'  → labelled dropdown
  //   '#11'            → boxed value               'iconName' → glyph button
  function toolMarkup(t) {
    if (t === 'sep') return '<div class="hl-gsep"></div>';
    if (t[0] === '|') return `<div class="hl-gpick">${esc(t.slice(1))}${icon('chevron', 18)}</div>`;
    if (t[0] === '#') return `<div class="hl-gnum">${esc(t.slice(1))}</div>`;
    return `<div class="hl-gbtn">${icon(t)}</div>`;
  }

  // the column-letter strip under a spreadsheet's formula bar
  function columnHeader(count) {
    let cells = '<i></i>';
    for (let i = 0; i < count; i++) cells += `<b>${String.fromCharCode(65 + i)}</b>`;
    return `<div class="hl-gcols">${cells}</div>`;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Microsoft shell: Word and Excel
  // ═══════════════════════════════════════════════════════════════════
  // 48px app bar + 36px ribbon tabs + 40px ribbon commands = 124px.
  const MS_CSS = `
.hl-app { font-family: "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, sans-serif; background: #ffffff; }
.hl-mtop { display: flex; align-items: center; gap: 12px; height: 48px; padding: 0 12px; }
.hl-mwaffle { display: grid; grid-template-columns: repeat(3, 4px); gap: 3px; padding: 8px; }
.hl-mwaffle span { width: 4px; height: 4px; border-radius: 1px; background: #616161; }
.hl-mtile { width: 24px; height: 24px; border-radius: 4px; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 14px; font-weight: 700; flex: 0 0 24px; }
.hl-mname { font-size: 14px; font-weight: 600; color: #201f1e; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 40ch; }
.hl-msaved { font-size: 12px; color: #605e5c; white-space: nowrap; }
.hl-msearch { flex: 0 1 460px; display: flex; align-items: center; gap: 8px; height: 32px; padding: 0 10px; margin: 0 auto; background: #f3f2f1; border-radius: 4px; color: #605e5c; font-size: 13px; }
.hl-mright { display: flex; align-items: center; gap: 8px; margin-left: auto; }
.hl-micon { width: 32px; height: 32px; border-radius: 4px; display: flex; align-items: center; justify-content: center; color: #424242; }
.hl-mavatar { width: 30px; height: 30px; border-radius: 50%; color: #fff; font-size: 13px; display: flex; align-items: center; justify-content: center; }
.hl-mtabs { display: flex; align-items: center; gap: 2px; height: 36px; padding: 0 12px; }
.hl-mtab { position: relative; height: 32px; padding: 0 10px; display: flex; align-items: center; font-size: 14px; color: #323130; border-radius: 4px; white-space: nowrap; }
.hl-mtab-on { font-weight: 600; }
.hl-mtab-on::after { content: ''; position: absolute; left: 10px; right: 10px; bottom: 0; height: 2px; border-radius: 1px; }
.hl-mribbon { display: flex; align-items: center; gap: 2px; height: 40px; padding: 0 12px; border-bottom: 1px solid #e1dfdd; overflow: hidden; }
.hl-mbtn { width: 32px; height: 32px; border-radius: 4px; display: flex; align-items: center; justify-content: center; color: #424242; flex: 0 0 auto; }
.hl-msep { width: 1px; height: 22px; background: #e1dfdd; margin: 0 7px; flex: 0 0 auto; }
.hl-mpick { display: flex; align-items: center; gap: 8px; height: 26px; padding: 0 8px; border: 1px solid #d1d1d1; border-radius: 3px; font-size: 13px; color: #201f1e; white-space: nowrap; flex: 0 0 auto; }
.hl-mpick svg { color: #424242; }
.hl-mnum { display: flex; align-items: center; justify-content: center; height: 26px; min-width: 42px; padding: 0 6px; border: 1px solid #d1d1d1; border-radius: 3px; font-size: 13px; color: #201f1e; flex: 0 0 auto; }
.hl-mfx { display: flex; align-items: center; height: 26px; border-top: 1px solid #e1dfdd; border-bottom: 1px solid #e1dfdd; font-size: 12px; color: #605e5c; background: #fff; }
.hl-mfx-ref { flex: 0 0 120px; height: 100%; display: flex; align-items: center; justify-content: space-between; padding: 0 8px; border-right: 1px solid #e1dfdd; color: #201f1e; }
.hl-mfx-fx { flex: 0 0 34px; text-align: center; font-style: italic; font-family: "Times New Roman", serif; font-size: 14px; }
.hl-mcols { display: flex; height: 20px; background: #f5f5f5; border-bottom: 1px solid #d0d0d0; font-size: 11px; color: #444; }
.hl-mcols i { flex: 0 0 34px; border-right: 1px solid #d0d0d0; }
.hl-mcols b { flex: 0 0 64px; font-weight: 400; text-align: center; line-height: 19px; border-right: 1px solid #d0d0d0; }
`;

  function msShell(opts) {
    const tabs = opts.tabs
      .map((t, i) => `<span class="hl-mtab${i === opts.activeTab ? ' hl-mtab-on' : ''}">${esc(t)}</span>`)
      .join('');
    const tools = opts.tools.map(msToolMarkup).join('');
    return `
<div class="hl-app">
  <div class="hl-mtop">
    <div class="hl-mwaffle">${'<span></span>'.repeat(9)}</div>
    <div class="hl-mtile" style="background:${opts.accent}">${esc(opts.letter)}</div>
    <span class="hl-mname">${esc(opts.docName)}</span>
    <span class="hl-msaved">Saved to OneDrive</span>
    <div class="hl-msearch">${icon('search', 16)}Search</div>
    <div class="hl-mright">
      <div class="hl-micon">${icon('comment', 18)}</div>
      <div class="hl-mavatar" style="background:${opts.accent}">A</div>
    </div>
  </div>
  <div class="hl-mtabs" style="color:${opts.accent}">${tabs}</div>
  <div class="hl-mribbon">${tools}</div>
  ${opts.rows || ''}
</div>`;
  }

  function msToolMarkup(t) {
    if (t === 'sep') return '<div class="hl-msep"></div>';
    if (t[0] === '|') return `<div class="hl-mpick">${esc(t.slice(1))}${icon('chevron', 14)}</div>`;
    if (t[0] === '#') return `<div class="hl-mnum">${esc(t.slice(1))}</div>`;
    return `<div class="hl-mbtn">${icon(t, 18)}</div>`;
  }

  function msColumnHeader(count) {
    let cells = '<i></i>';
    for (let i = 0; i < count; i++) cells += `<b>${String.fromCharCode(65 + i)}</b>`;
    return `<div class="hl-mcols">${cells}</div>`;
  }

  // the active ribbon tab is underlined in the app's accent, set inline so the shared
  // stylesheet stays theme-agnostic
  function msAccentCss(accent) {
    return `.hl-mtab-on { color: ${accent}; } .hl-mtab-on::after { background: ${accent}; }`;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Notion shell
  // ═══════════════════════════════════════════════════════════════════
  const NOTION_CSS = `
.hl-app { font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; background: #ffffff; }
.hl-ntop { display: flex; align-items: center; gap: 4px; height: 45px; padding: 0 12px; color: #37352f; font-size: 14px; }
.hl-nicon { width: 28px; height: 28px; border-radius: 4px; display: flex; align-items: center; justify-content: center; color: #91918e; flex: 0 0 auto; }
.hl-ncrumb { display: flex; align-items: center; gap: 6px; height: 28px; padding: 0 6px; border-radius: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 44ch; }
.hl-ncrumb-page { flex: 0 0 auto; width: 16px; height: 16px; border: 1.5px solid #b9b9b7; border-radius: 2px; }
.hl-ncrumb-muted { color: #91918e; }
.hl-nslash { color: #cfcfcd; padding: 0 2px; }
.hl-nright { display: flex; align-items: center; gap: 2px; margin-left: auto; }
.hl-ntext { height: 28px; padding: 0 8px; display: flex; align-items: center; border-radius: 4px; font-size: 14px; color: #37352f; white-space: nowrap; }
.hl-ndot { width: 6px; height: 6px; border-radius: 50%; background: #2eaadc; margin-right: 6px; }
`;

  function notionShell(opts) {
    return `
<div class="hl-app">
  <div class="hl-ntop">
    <div class="hl-nicon">${icon('sidebar', 18)}</div>
    <div class="hl-ncrumb hl-ncrumb-muted">${esc(opts.workspace)}</div>
    <span class="hl-nslash">/</span>
    <div class="hl-ncrumb"><span class="hl-ncrumb-page"></span>${esc(opts.docName)}</div>
    <div class="hl-nright">
      <span class="hl-ntext"><span class="hl-ndot"></span>Edited just now</span>
      <span class="hl-ntext">Share</span>
      <div class="hl-nicon">${icon('comment', 18)}</div>
      <div class="hl-nicon">${icon('clock', 18)}</div>
      <div class="hl-nicon">${icon('star', 18)}</div>
      <div class="hl-nicon">${icon('dots', 18)}</div>
    </div>
  </div>
</div>`;
  }

  HL.UI = {
    esc,
    icon,
    RESET_CSS,
    GOOGLE_CSS,
    MS_CSS,
    NOTION_CSS,
    googleShell,
    msShell,
    notionShell,
    columnHeader,
    msColumnHeader,
    msAccentCss,
  };
})(typeof self !== 'undefined' ? self : window);
