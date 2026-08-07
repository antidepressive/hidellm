// popup.js: the toolbar panel.
//
// The popup renders state and posts intents; it never injects anything itself.
// A popup is destroyed the moment focus leaves it, and an injection started from
// a dying popup can be cut off half-applied, so every mutation goes to the
// service worker, which outlives the click.
//
// The theme preview is not a mock-up: it mounts the same markup and stylesheet the
// page gets, in a shadow root, scaled down. If the preview looks right, the page
// looks right.

const $ = (id) => document.getElementById(id);

const el = {
  panel: $('switch-panel'),
  master: $('master'),
  stateTitle: $('state-title'),
  stateSub: $('state-sub'),
  themes: $('themes'),
  themeNote: $('theme-note'),
  preview: $('preview'),
  docname: $('docname'),
  modes: $('modes'),
  modeHint: $('mode-hint'),
  peek: $('peek'),
  peekLabel: $('peek-label'),
  peekKey: $('peek-key'),
  toggleKey: $('toggle-key'),
  options: $('open-options'),
  toast: $('toast'),
};

// Everything the last getState told us. Rendering reads from here so the UI can
// repaint without another round-trip.
let state = null;

// ─── talking to the worker ───
// A rejected sendMessage (worker restarting, extension reloading) is reported as a
// value, not thrown, so callers can degrade instead of leaving the UI half-updated.
async function send(type, extra) {
  try {
    const res = await chrome.runtime.sendMessage({ type, ...extra });
    return res || { error: 'no-response' };
  } catch (err) {
    return { error: String((err && err.message) || err) };
  }
}

let toastTimer;
function toast(msg, good) {
  el.toast.textContent = msg;
  el.toast.className = 'toast show' + (good ? ' good' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.toast.className = 'toast'), 2200);
}

// ─── preview ───
// Mounted in a shadow root for the same reason the real thing is: the theme CSS
// and the popup's own CSS must not see each other.
// Rendered at this virtual width and scaled to fit the panel. Narrower than a real
// window on purpose: it makes the toolbar big enough to recognise in an 86px strip,
// which is the whole job of a preview.
const PREVIEW_WIDTH = 980;

const PREVIEW_CSS = `
.hl-prev { width: ${PREVIEW_WIDTH}px; transform-origin: top left; }
.hl-prev-canvas { position: relative; height: 300px; overflow: hidden; }
.hl-prev-paper { position: absolute; top: 0; bottom: 0; left: 50%; transform: translateX(-50%); background: #fff; box-shadow: 0 0 0 1px rgba(0,0,0,0.12); }
.hl-prev-grid { position: absolute; inset: 0; }
.hl-prev-body { position: relative; padding: 40px 56px; }
.hl-prev-body i { display: block; height: 10px; border-radius: 2px; background: #d8dbe1; margin-bottom: 15px; }
`;

// The document body suggested behind the toolbar: enough to read the layout, not
// so much that it competes with the chrome for attention.
function previewCanvas(theme) {
  const lines = ['92%', '97%', '88%', '64%', '95%', '71%']
    .map((w) => `<i style="width:${w}"></i>`)
    .join('');

  if (theme.sheet === 'grid') {
    const cell = theme.key === 'excel' ? [64, 20, 34] : [100, 21, 46];
    return `<div class="hl-prev-canvas" style="background:${theme.surround}">
      <div class="hl-prev-grid" style="background-image:
        linear-gradient(to right, rgba(0,0,0,0.12) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(0,0,0,0.12) 1px, transparent 1px);
        background-size:${cell[0]}px ${cell[1]}px;background-position:${cell[2]}px 0"></div>
    </div>`;
  }

  if (theme.sheet === 'paper') {
    return `<div class="hl-prev-canvas" style="background:${theme.surround}">
      <div class="hl-prev-paper" style="width:${theme.pageWidth}px">
        <div class="hl-prev-body">${lines}</div>
      </div>
    </div>`;
  }

  return `<div class="hl-prev-canvas" style="background:${theme.surround}">
    <div class="hl-prev-paper" style="width:${theme.pageWidth}px;box-shadow:none">
      <div class="hl-prev-body">${lines}</div>
    </div>
  </div>`;
}

function renderPreview(themeKey, docName) {
  const theme = HL.THEMES[themeKey] || HL.THEMES[HL.DEFAULT_THEME];
  const resolved = HL.resolveTheme(themeKey, docName, '');

  el.preview.textContent = '';
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;inset:0;overflow:hidden;';
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = resolved.chromeCss + PREVIEW_CSS;

  const wrap = document.createElement('div');
  wrap.className = 'hl-prev';
  wrap.innerHTML = previewCanvas({ ...theme, key: themeKey }) + resolved.chromeHtml;
  // The chrome sits on top of the canvas, exactly as it does on the page. Its
  // height has to be stated: the shell is `height: 100%`, which on the page means
  // the fixed-height host and here would mean the whole panel.
  wrap.lastElementChild.style.cssText =
    `position:absolute;top:0;left:0;width:100%;height:${resolved.chromeHeight}px;overflow:hidden;`;

  shadow.append(style, wrap);
  el.preview.appendChild(host);

  // Scale to fit the panel. Measured rather than hard-coded so the preview stays
  // correct if the popup width ever changes.
  const scale = (el.preview.clientWidth || 316) / PREVIEW_WIDTH;
  wrap.style.transform = `scale(${scale})`;
  el.themeNote.textContent = theme.hint;
}

// ─── theme chips + mode buttons ───
function renderThemes(selected) {
  el.themes.textContent = '';
  for (const [key, theme] of Object.entries(HL.THEMES)) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.setAttribute('role', 'radio');
    chip.setAttribute('aria-checked', String(key === selected));

    // Short labels here, full ones on the options page: five full names wrap to a
    // third row, which is what used to push the panel past the height Chrome will
    // give a popup and leave it with a stub of a scrollbar.
    chip.title = theme.label;
    chip.setAttribute('aria-label', theme.label);

    const img = document.createElement('img');
    img.src = theme.favicon;
    img.alt = '';
    chip.append(img, document.createTextNode(theme.short || theme.label));

    chip.addEventListener('click', () => selectTheme(key));
    el.themes.appendChild(chip);
  }
}

function renderModes(selected) {
  el.modes.textContent = '';
  for (const [key, mode] of Object.entries(HL.CONTENT_MODES)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'seg';
    btn.textContent = mode.label;
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', String(key === selected));
    btn.addEventListener('click', () => selectMode(key));
    el.modes.appendChild(btn);
  }
  el.modeHint.textContent = (HL.CONTENT_MODES[selected] || {}).hint || '';
}

// ─── the status line ───
// Three questions, answered in priority order: is it on, is this a site we handle,
// and is that site switched on?
function renderStatus() {
  const { settings, siteLabel, siteAllowed, siteTested, peeking, openTabs } = state;
  el.master.checked = settings.enabled;
  el.panel.classList.toggle('is-on', settings.enabled);

  if (!settings.enabled) {
    el.stateTitle.textContent = 'Disguise off';
    el.stateSub.textContent = siteLabel
      ? `${siteLabel} is showing normally`
      : 'Turn on to disguise your assistant tabs';
  } else if (peeking) {
    el.stateTitle.textContent = 'Peeking';
    el.stateSub.textContent = `Real page visible${settings.peekSeconds ? ` for ${settings.peekSeconds}s` : ''}`;
  } else if (!siteLabel) {
    el.stateTitle.textContent = 'Armed';
    el.stateSub.textContent = openTabs
      ? `Hiding ${openTabs} assistant tab${openTabs === 1 ? '' : 's'}`
      : 'Open ChatGPT, Claude or Gemini';
  } else if (!siteAllowed) {
    el.stateTitle.textContent = 'Site turned off';
    el.stateSub.textContent = `${siteLabel} is excluded in settings`;
  } else {
    el.stateTitle.textContent = 'Disguise on';
    el.stateSub.textContent = siteTested
      ? `${siteLabel} looks like ${HL.THEMES[settings.theme].label}`
      : `${siteLabel} · experimental support`;
  }

  const canPeek = settings.enabled && !!siteLabel && siteAllowed;
  el.peek.disabled = !canPeek;
  el.peek.classList.toggle('is-peeking', !!peeking);
  el.peekLabel.textContent = peeking ? 'Restore the disguise' : 'Peek at the real page';
}

function renderAll() {
  const { settings } = state;
  renderStatus();
  renderThemes(settings.theme);
  renderModes(settings.contentMode);
  renderPreview(settings.theme, settings.docName);
  if (document.activeElement !== el.docname) el.docname.value = settings.docName;
  el.docname.placeholder = HL.THEMES[settings.theme].defaultDoc;
}

// ─── actions ───
async function refresh() {
  const res = await send('getState');
  if (res.error) {
    toast('Extension is restarting. Reopen this panel');
    return;
  }
  state = res;
  renderAll();
}

// Optimistic: repaint from the local copy first, then reconcile with whatever the
// worker actually stored. Waiting on the round-trip makes the panel feel sticky.
async function patch(patchObj) {
  Object.assign(state.settings, patchObj);
  renderAll();
  const res = await send('updateSettings', { patch: patchObj });
  if (res.settings) {
    state.settings = res.settings;
    renderAll();
  }
}

function selectTheme(key) {
  if (state.settings.theme === key) return;
  patch({ theme: key });
}

function selectMode(key) {
  if (state.settings.contentMode === key) return;
  patch({ contentMode: key });
}

el.master.addEventListener('change', async () => {
  const enabled = el.master.checked;
  state.settings.enabled = enabled;
  renderStatus();
  const res = await send('setEnabled', { value: enabled });
  if (res.error) {
    toast('Could not update. Try reloading the tab');
  } else {
    toast(enabled ? 'Disguise on' : 'Disguise off', enabled);
  }
  await refresh();
});

// Live preview on every keystroke, one write when the field settles.
let saveTimer;
el.docname.addEventListener('input', () => {
  renderPreview(state.settings.theme, el.docname.value);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => patch({ docName: el.docname.value }), 400);
});

el.docname.addEventListener('change', () => {
  clearTimeout(saveTimer);
  patch({ docName: el.docname.value });
});

el.peek.addEventListener('click', async () => {
  const res = await send('togglePeek');
  if (res.error) return toast('Peek needs an assistant tab in front');
  toast(res.peeking ? `Revealed${res.seconds ? ` for ${res.seconds}s` : ''}` : 'Disguise restored', !res.peeking);
  await refresh();
});

el.options.addEventListener('click', () => send('openOptions').then(() => window.close()));

// ─── hotkeys ───
// Read the live binding rather than the manifest default: users rebind these at
// chrome://extensions/shortcuts, and a panel showing the wrong keys is worse than
// showing none.
const GLYPHS = { '⌘': 'Cmd', '⌃': 'Ctrl', '⌥': 'Alt', '⇧': 'Shift' };

function prettyShortcut(raw) {
  return raw
    .replace(/[⌘⌃⌥⇧]/g, (g) => GLYPHS[g] + '+')
    .split('+')
    .filter(Boolean)
    .join('+');
}

function renderShortcuts() {
  if (!chrome.commands || !chrome.commands.getAll) return;
  chrome.commands.getAll((cmds) => {
    for (const [name, node] of [['toggle-disguise', el.toggleKey], ['toggle-peek', el.peekKey]]) {
      const cmd = (cmds || []).find((c) => c.name === name);
      node.textContent = cmd && cmd.shortcut ? prettyShortcut(cmd.shortcut) : 'Unset';
    }
  });
}

// Another surface (the hotkey, the options page) changed things while we were open.
chrome.storage.onChanged.addListener((changes, area) => {
  if ((area === 'sync' || area === 'local') && changes[HL.SETTINGS_KEY]) refresh();
});

renderShortcuts();
refresh();
