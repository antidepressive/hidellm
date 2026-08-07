// options.js: the settings page.
//
// Same contract as the popup: read state, post intents to the service worker, let
// it own every write. The theme cards mount the real theme markup in shadow roots,
// so what's on this page is what lands on the tab.

const $ = (id) => document.getElementById(id);

let settings = null;

async function send(type, extra) {
  try {
    return (await chrome.runtime.sendMessage({ type, ...extra })) || { error: 'no-response' };
  } catch (err) {
    return { error: String((err && err.message) || err) };
  }
}

let toastTimer;
function toast(msg, good) {
  const node = $('toast');
  node.textContent = msg;
  node.className = 'toast show' + (good ? ' good' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (node.className = 'toast'), 2000);
}

// One write path. The worker validates and re-applies, then hands back what it
// actually stored, and that is what we render from.
async function patch(patchObj) {
  Object.assign(settings, patchObj);
  const res = await send('updateSettings', { patch: patchObj });
  if (res.settings) settings = res.settings;
  render();
  return res;
}

// ─── theme cards ───
const SHOT_WIDTH = 1100;

const SHOT_CSS = `
.hl-shot { width: ${SHOT_WIDTH}px; transform-origin: top left; }
.hl-shot-canvas { position: relative; height: 380px; overflow: hidden; }
.hl-shot-paper { position: absolute; top: 0; bottom: 0; left: 50%; transform: translateX(-50%); background: #fff; box-shadow: 0 0 0 1px rgba(0,0,0,0.10); }
.hl-shot-grid { position: absolute; inset: 0; }
.hl-shot-body { padding: 46px 60px; }
.hl-shot-body i { display: block; height: 11px; border-radius: 2px; background: #e2e4e8; margin-bottom: 17px; }
`;

function shotCanvas(key, theme) {
  const lines = ['94%', '89%', '97%', '62%', '91%', '77%'].map((w) => `<i style="width:${w}"></i>`).join('');

  if (theme.sheet === 'grid') {
    const [w, h, x] = key === 'excel' ? [64, 20, 34] : [100, 21, 46];
    return `<div class="hl-shot-canvas" style="background:${theme.surround}">
      <div class="hl-shot-grid" style="background-image:
        linear-gradient(to right, rgba(0,0,0,0.12) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(0,0,0,0.12) 1px, transparent 1px);
        background-size:${w}px ${h}px;background-position:${x}px 0"></div></div>`;
  }

  const shadow = theme.sheet === 'paper' ? '' : ';box-shadow:none';
  return `<div class="hl-shot-canvas" style="background:${theme.surround}">
    <div class="hl-shot-paper" style="width:${theme.pageWidth}px${shadow}">
      <div class="hl-shot-body">${lines}</div>
    </div></div>`;
}

function mountShot(container, key, docName) {
  const theme = HL.THEMES[key];
  const resolved = HL.resolveTheme(key, docName, '');

  container.textContent = '';
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;inset:0;overflow:hidden;';
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = resolved.chromeCss + SHOT_CSS;

  const wrap = document.createElement('div');
  wrap.className = 'hl-shot';
  wrap.innerHTML = shotCanvas(key, theme) + resolved.chromeHtml;
  // height stated for the same reason as in the popup: the shell is `height: 100%`,
  // which only means the right thing on a fixed-height host
  wrap.lastElementChild.style.cssText =
    `position:absolute;top:0;left:0;width:100%;height:${resolved.chromeHeight}px;overflow:hidden;`;

  shadow.append(style, wrap);
  container.appendChild(host);

  // Scaled from the measured card width, so the grid can reflow at any viewport.
  wrap.style.transform = `scale(${(container.clientWidth || 210) / SHOT_WIDTH})`;
}

function renderThemes() {
  const grid = $('themes');
  grid.textContent = '';

  for (const [key, theme] of Object.entries(HL.THEMES)) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'theme-card';
    card.setAttribute('role', 'radio');
    card.setAttribute('aria-checked', String(key === settings.theme));
    card.setAttribute('aria-label', theme.label);

    const shot = document.createElement('div');
    shot.className = 'theme-shot';

    const meta = document.createElement('div');
    meta.className = 'theme-meta';
    const img = document.createElement('img');
    img.src = theme.favicon;
    img.alt = '';
    const name = document.createElement('span');
    name.className = 'theme-name';
    name.textContent = theme.label;
    const check = document.createElement('span');
    check.className = 'theme-check';
    check.textContent = key === settings.theme ? '✓' : '';
    meta.append(img, name, check);

    card.append(shot, meta);
    card.addEventListener('click', () => {
      if (settings.theme !== key) patch({ theme: key });
    });
    grid.appendChild(card);

    // mounted after layout so clientWidth is real
    requestAnimationFrame(() => mountShot(shot, key, settings.docName));
  }
}

// ─── other sections ───
function renderModes() {
  const box = $('modes');
  box.textContent = '';
  for (const [key, mode] of Object.entries(HL.CONTENT_MODES)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'seg';
    btn.textContent = mode.label;
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', String(key === settings.contentMode));
    btn.addEventListener('click', () => {
      if (settings.contentMode !== key) patch({ contentMode: key });
    });
    box.appendChild(btn);
  }
  $('mode-hint').textContent = (HL.CONTENT_MODES[settings.contentMode] || {}).hint || '';
}

function renderSites() {
  const box = $('sites');
  box.textContent = '';

  for (const [key, site] of Object.entries(HL.SITES)) {
    const row = document.createElement('div');
    row.className = 'row';

    const copy = document.createElement('span');
    copy.className = 'row-copy';

    const title = document.createElement('span');
    title.className = 'row-title';
    title.textContent = site.label;
    if (site.tested === false) {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = 'Experimental';
      title.appendChild(tag);
    }

    const hosts = document.createElement('span');
    hosts.className = 'row-sub host';
    hosts.textContent = site.hosts.join(', ');
    copy.append(title, hosts);

    const label = document.createElement('label');
    label.className = 'switch';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !settings.disabledSites.includes(key);
    input.setAttribute('aria-label', `Disguise ${site.label}`);
    input.addEventListener('change', () => {
      const off = new Set(settings.disabledSites);
      if (input.checked) off.delete(key);
      else off.add(key);
      patch({ disabledSites: [...off] });
    });
    const track = document.createElement('span');
    track.className = 'track';
    const knob = document.createElement('span');
    knob.className = 'knob';
    track.appendChild(knob);
    label.append(input, track);

    row.append(copy, label);
    box.appendChild(row);
  }
}

// Inputs are only written back on blur/change, so don't stomp the one being typed in.
function setInput(id, value) {
  const node = $(id);
  if (document.activeElement !== node) node.value = value;
}

function render() {
  renderThemes();
  renderModes();
  renderSites();
  setInput('docname', settings.docName);
  setInput('title-override', settings.titleOverride);
  setInput('peekSeconds', settings.peekSeconds);
  $('docname').placeholder = HL.THEMES[settings.theme].defaultDoc;
  for (const id of ['showChrome', 'fakeTitle', 'fakeFavicon', 'applyToAllTabs']) {
    $(id).checked = settings[id];
  }
}

// ─── wiring ───
for (const id of ['showChrome', 'fakeTitle', 'fakeFavicon', 'applyToAllTabs']) {
  $(id).addEventListener('change', () => patch({ [id]: $(id).checked }));
}

$('docname').addEventListener('change', () => patch({ docName: $('docname').value }));
$('title-override').addEventListener('change', () => patch({ titleOverride: $('title-override').value }));
$('peekSeconds').addEventListener('change', () => patch({ peekSeconds: $('peekSeconds').value }));

$('shortcuts').addEventListener('click', () => send('openShortcuts'));

$('reset').addEventListener('click', async () => {
  if (!confirm('Reset every HideLLM setting to its default?')) return;
  await patch({ ...HL.DEFAULT_SETTINGS, enabled: settings.enabled });
  toast('Settings reset', true);
});

function renderShortcuts() {
  if (!chrome.commands || !chrome.commands.getAll) return;
  chrome.commands.getAll((cmds) => {
    for (const [name, id] of [['toggle-disguise', 'key-toggle'], ['toggle-peek', 'key-peek']]) {
      const cmd = (cmds || []).find((c) => c.name === name);
      $(id).textContent = cmd && cmd.shortcut ? cmd.shortcut.replace(/\+/g, ' + ') : 'Not set';
    }
  });
}

// Repaint if the popup or a hotkey changed something while this tab was open.
chrome.storage.onChanged.addListener(async (changes, area) => {
  if ((area === 'sync' || area === 'local') && changes[HL.SETTINGS_KEY]) {
    const res = await send('getState');
    if (res.settings) {
      settings = res.settings;
      render();
    }
  }
});

(async () => {
  const res = await send('getState');
  settings = res.settings || HL.normalizeSettings(null);
  $('version').textContent = 'v' + (res.version || chrome.runtime.getManifest().version);
  if (location.hash === '#welcome') $('welcome').hidden = false;
  render();
  renderShortcuts();
})();

// Re-scale the previews when the grid reflows.
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => settings && renderThemes(), 150);
});
