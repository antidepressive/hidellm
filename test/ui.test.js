// ui.test.js: boots the popup and the options page in a stub DOM, wired to a real
// service worker.
//
// This is not a rendering test, there is no layout engine here. It checks the
// wiring: that every element the scripts reach for actually exists in the HTML,
// that the lists are built from the shared theme/site tables rather than hard-coded,
// and that interacting with a control ends up changing the stored setting.

const { makeReporter, makeChrome, loadWorker, loadPage, settle } = require('./harness');

const r = makeReporter();

const TABS = [
  { id: 1, url: 'https://chatgpt.com/c/1' },
  { id: 2, url: 'https://claude.ai/chat/1' },
];

// A worker and a page sharing one stubbed browser, so messages between them are
// the real round-trip.
function bootPair(page) {
  const chrome = makeChrome({ tabs: TABS, activeId: 1 });
  loadWorker(chrome);
  const ui = loadPage(page, chrome);
  return { chrome, ...ui };
}

const wait = (ms) => new Promise((res) => setTimeout(res, ms));

(async () => {
  // ── popup ──
  r.section('1. The popup boots against the real worker');
  const popup = bootPair('popup');
  await settle(30);

  const el = (id) => popup.dom.document.getElementById(id);
  r.ok(el('themes').children.length === Object.keys(popup.win.HL.THEMES).length,
    `theme chips are built from the theme table (${el('themes').children.length})`);
  r.eq(el('modes').children.length, 3, 'three visibility modes, from CONTENT_MODES');
  r.ok(el('preview').children.length === 1 && el('preview').children[0].shadowRoot,
    'the preview is mounted in a shadow root, using the real theme markup');
  r.ok(el('state-title').textContent.length > 0, 'the status line is filled in');
  r.eq(el('toggle-key').textContent, 'Ctrl+Shift+Z', 'the live toggle shortcut is shown');
  r.eq(el('peek-key').textContent, 'Ctrl+Shift+X', 'the live peek shortcut is shown');
  r.ok(el('peek').disabled, 'peek is disabled while the disguise is off');

  r.section('2. Popup controls change the stored settings');
  el('master').checked = true;
  el('master').dispatch('change');
  await settle(30);
  r.eq(popup.chrome._sync.settings.enabled, true, 'the master switch turns the disguise on');
  r.eq(popup.chrome._log.insertCSS.length, 2, 'and both open assistant tabs are disguised');

  const second = Object.keys(popup.win.HL.THEMES)[2];
  el('themes').children[2].dispatch('click');
  await settle(30);
  r.eq(popup.chrome._sync.settings.theme, second, `clicking a chip selects that theme (${second})`);

  el('modes').children[2].dispatch('click');
  await settle(30);
  r.eq(popup.chrome._sync.settings.contentMode, 'blank', 'the visibility segments map to content modes');

  el('docname').value = 'Q3 Forecast';
  el('docname').dispatch('input');
  await wait(500);
  await settle(30);
  r.eq(popup.chrome._sync.settings.docName, 'Q3 Forecast', 'typing a document name is saved (debounced)');
  r.ok(
    popup.chrome._log.executeScript.at(-1).args[0].chromeHtml.includes('Q3 Forecast'),
    'and the name reaches the toolbar drawn on the page'
  );

  el('peek').dispatch('click');
  await settle(30);
  r.ok(popup.chrome._local.peekTabs.includes(1), 'the peek button reveals the tab in front');

  // ── options ──
  r.section('3. The options page boots and reflects stored settings');
  const opts = bootPair('options');
  await settle(30);
  const o = (id) => opts.dom.document.getElementById(id);

  r.eq(o('themes').children.length, Object.keys(opts.win.HL.THEMES).length, 'a card per theme');
  r.eq(o('sites').children.length, Object.keys(opts.win.HL.SITES).length, 'a row per supported site');
  r.eq(o('modes').children.length, 3, 'the visibility segments are here too');
  r.ok(o('version').textContent.startsWith('v'), 'the version is displayed');
  r.eq(o('showChrome').checked, true, 'toggles are hydrated from the defaults');
  r.ok(o('mode-hint').textContent.length > 0, 'the selected mode explains itself');

  r.section('4. Options controls write through the worker');
  o('showChrome').checked = false;
  o('showChrome').dispatch('change');
  await settle(30);
  r.eq(opts.chrome._sync.settings.showChrome, false, 'turning off the fake toolbar is stored');

  o('peekSeconds').value = '9999';
  o('peekSeconds').dispatch('change');
  await settle(30);
  r.eq(opts.chrome._sync.settings.peekSeconds, 600, 'an out-of-range peek length is clamped, not rejected');

  o('title-override').value = '  Notes.pdf  ';
  o('title-override').dispatch('change');
  await settle(30);
  r.eq(opts.chrome._sync.settings.titleOverride, 'Notes.pdf', 'the tab title override is trimmed and stored');

  // per-site switch: the row's checkbox is the second child of the row's label
  const claudeRow = o('sites').children[1];
  const claudeSwitch = claudeRow.children[1].children[0];
  claudeSwitch.checked = false;
  claudeSwitch.dispatch('change');
  await settle(30);
  r.ok(opts.chrome._sync.settings.disabledSites.length === 1, 'switching a site off is stored as an exclusion');

  o('reset').dispatch('click');
  await settle(30);
  r.eq(opts.chrome._sync.settings.peekSeconds, 15, 'reset puts every setting back to its default');
  r.eq(opts.chrome._sync.settings.disabledSites.length, 0, 'including the site exclusions');

  r.finish();
})();
