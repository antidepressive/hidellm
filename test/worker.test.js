// worker.test.js: the service worker, driven through the same events Chrome
// sends it: navigation, hotkeys, alarms, tab removal, and the message API the
// popup and options page use.
//
// Everything goes through the real background.js and the real core modules; only
// chrome.* is stubbed.

const { makeReporter, makeChrome, loadWorker, settle, DIR } = require('./harness');
const fs = require('fs');
const path = require('path');

const r = makeReporter();

const TABS = [
  { id: 1, url: 'https://chatgpt.com/c/1' },
  { id: 2, url: 'https://claude.ai/chat/1' },
  { id: 3, url: 'https://gemini.google.com/app' },
  { id: 9, url: 'https://example.com/' },
];

const boot = () => {
  const chrome = makeChrome({ tabs: TABS, activeId: 1 });
  return loadWorker(chrome);
};

const msg = (chrome, type, extra) => chrome.runtime.sendMessage({ type, ...extra });
const fire = (chrome, group, ...args) => Promise.all(chrome._listeners[group].map((f) => f(...args)));

(async () => {
  // ── 1. boot ──
  r.section('1. The worker boots and registers every listener');
  const { chrome, ctx } = boot();
  await settle();
  r.ok(typeof ctx.HL === 'object', 'the core modules loaded into the worker global');
  for (const [group, n] of [['onUpdated', 1], ['onCommand', 1], ['onRemoved', 1], ['onInstalled', 1], ['onMessage', 1], ['onAlarm', 1], ['onStartup', 1]]) {
    r.eq(chrome._listeners[group].length, n, `${group} handler registered`);
  }

  // ── 2. first install ──
  r.section('2. First install writes defaults and shows the welcome page');
  await fire(chrome, 'onInstalled', { reason: 'install' });
  await settle();
  r.ok(chrome._sync.settings !== undefined, 'a complete settings object is written on install');
  r.eq(chrome._sync.settings.enabled, false, 'the disguise starts off, no surprises');
  r.ok(chrome._log.created.some((u) => String(u).includes('options.html#welcome')), 'the welcome page opens once');

  chrome._log.created.length = 0;
  await fire(chrome, 'onInstalled', { reason: 'update' });
  await settle();
  r.eq(chrome._log.created.length, 0, 'an update does not reopen the welcome page');

  // ── 3. navigation ──
  r.section('3. The disguise is re-applied on every page load');
  const nav = (tab) => fire(chrome, 'onUpdated', tab.id, { status: 'complete' }, tab);

  let before = chrome._log.insertCSS.length;
  await nav(TABS[0]); await settle();
  r.eq(chrome._log.insertCSS.length, before, 'switched off: navigation injects nothing');

  await msg(chrome, 'setEnabled', { value: true }); await settle();
  for (const tab of TABS.slice(0, 3)) {
    before = chrome._log.insertCSS.length;
    await nav(tab); await settle();
    r.ok(chrome._log.insertCSS.length === before + 1, `${new URL(tab.url).hostname}: CSS injected on load`);
  }

  before = chrome._log.insertCSS.length;
  await nav(TABS[3]); await settle();
  r.eq(chrome._log.insertCSS.length, before, 'an unsupported site is left alone');
  await fire(chrome, 'onUpdated', 1, { status: 'loading' }, TABS[0]); await settle();
  r.eq(chrome._log.insertCSS.length, before, 'a half-finished load injects nothing');

  // ── 4. the master switch reaches every tab ──
  r.section('4. Toggling applies to every open assistant tab');
  const fresh = boot();
  await settle();
  await msg(fresh.chrome, 'setEnabled', { value: true }); await settle();
  r.eq(fresh.chrome._log.insertCSS.length, 3, 'all three assistant tabs are disguised, the other is not');
  r.eq(fresh.chrome._log.badge.at(-1), 'ON', 'the toolbar badge shows the disguise is live');

  const removed = fresh.chrome._log.removeCSS.length;
  await msg(fresh.chrome, 'setEnabled', { value: false }); await settle();
  r.eq(fresh.chrome._log.removeCSS.length - removed, 3, 'switching off strips the CSS from all three');
  r.eq(fresh.chrome._log.badge.at(-1), '', 'the badge clears when the disguise is off');

  // ── 5. exact-string teardown ──
  r.section('5. Removal hands back exactly what was injected');
  const e = boot();
  await settle();
  await msg(e.chrome, 'setEnabled', { value: true }); await settle();
  const injected = e.chrome._log.insertCSS.at(-1).css;
  // change the theme in between: the naive implementation rebuilds the removal
  // string from current settings and strands the old stylesheet on the page
  await msg(e.chrome, 'updateSettings', { patch: { theme: 'notion' } }); await settle();
  r.ok(
    e.chrome._log.removeCSS.some((c) => c.css === injected),
    'the previous stylesheet is removed with its original text after a theme change'
  );
  r.ok(e.chrome._log.insertCSS.at(-1).css.includes('#ffffff'), 'the new theme is injected in its place');

  // ── 6. per-site opt-out ──
  r.section('6. Sites the user switched off are left alone');
  const s = boot();
  await settle();
  await msg(s.chrome, 'updateSettings', { patch: { disabledSites: ['claude'] } });
  await msg(s.chrome, 'setEnabled', { value: true }); await settle();
  r.eq(s.chrome._log.insertCSS.length, 2, 'only the two enabled sites are disguised');
  const targets = s.chrome._log.executeScript.map((x) => x.target.tabId);
  r.ok(!targets.includes(2), 'the excluded tab was never injected into');

  // ── 7. peek ──
  r.section('7. Peek reveals one tab, temporarily');
  const p = boot();
  await settle();
  await msg(p.chrome, 'setEnabled', { value: true }); await settle();
  let res = await msg(p.chrome, 'togglePeek'); await settle();
  r.eq(res.peeking, true, 'peek turns on for the active tab');
  r.ok(p.chrome._log.alarms.some((a) => a.name === 'hidellm-peek:1'), 'an alarm is set to end the peek');
  r.ok(p.chrome._local.peekTabs.includes(1), 'the peeking tab is recorded');

  before = p.chrome._log.insertCSS.length;
  await fire(p.chrome, 'onAlarm', { name: 'hidellm-peek:1' }); await settle();
  r.ok(p.chrome._log.insertCSS.length > before, 'when the alarm fires the disguise goes back on');
  r.eq(p.chrome._local.peekTabs.length, 0, 'the peek record is cleared');

  await msg(p.chrome, 'togglePeek'); await settle();
  res = await msg(p.chrome, 'togglePeek'); await settle();
  r.eq(res.peeking, false, 'pressing peek again restores the disguise immediately');

  p.chrome._setActive(9);
  r.ok((await msg(p.chrome, 'togglePeek')).error === 'unsupported', 'peek is refused on an unsupported tab');

  // ── 8. hotkeys ──
  r.section('8. Hotkeys');
  const k = boot();
  await settle();
  await fire(k.chrome, 'onCommand', 'toggle-disguise'); await settle();
  r.eq(k.chrome._sync.settings.enabled, true, 'the toggle hotkey turns the disguise on');
  r.eq(k.chrome._log.insertCSS.length, 3, 'and applies it to every assistant tab');
  await fire(k.chrome, 'onCommand', 'toggle-disguise'); await settle();
  r.eq(k.chrome._sync.settings.enabled, false, 'pressing it again turns the disguise off');

  await fire(k.chrome, 'onCommand', 'toggle-peek'); await settle();
  r.eq((k.chrome._local.peekTabs || []).length, 0, 'peek does nothing while the disguise is off');
  await fire(k.chrome, 'onCommand', 'nonsense-command'); await settle();
  r.eq(k.chrome._sync.settings.enabled, false, 'an unrelated command is ignored');

  // ── 9. getState ──
  r.section('9. getState tells the UI everything it renders from');
  const g = boot();
  await settle();
  const state = await msg(g.chrome, 'getState');
  r.eq(state.site, 'chatgpt', 'reports the site in front');
  r.eq(state.siteLabel, 'ChatGPT', 'reports its display name');
  r.eq(state.siteTested, true, 'reports whether support for it is verified');
  r.eq(state.openTabs, 3, 'reports how many assistant tabs are open');
  r.ok(!!state.version, 'reports the extension version');
  g.chrome._setActive(9);
  r.eq((await msg(g.chrome, 'getState')).site, null, 'reports null on an unsupported tab');

  // ── 10. bookkeeping ──
  r.section('10. Per-tab records do not leak');
  const t = boot();
  await settle();
  await msg(t.chrome, 'setEnabled', { value: true }); await settle();
  r.eq(Object.keys(t.chrome._local.tabState).length, 3, 'one record per disguised tab');
  await fire(t.chrome, 'onRemoved', 1); await settle();
  r.ok(!t.chrome._local.tabState[1], 'closing a tab drops its record');
  const keys = Object.keys(t.chrome._local).sort().join(',');
  r.eq(keys, 'peekTabs,tabState', `storage.local holds only per-tab state: ${keys}`);

  // ── 11. no network, anywhere ──
  r.section('11. The extension cannot phone home');
  const sources = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(js|html)$/.test(entry.name)) sources.push([full, fs.readFileSync(full, 'utf8')]);
    }
  };
  walk(path.join(DIR, 'src'));
  for (const [file, src] of sources) {
    const rel = path.relative(DIR, file).replace(/\\/g, '/');
    r.ok(!/\bfetch\s*\(/.test(src), `${rel}: no fetch()`);
    r.ok(!/XMLHttpRequest|WebSocket|navigator\.sendBeacon|EventSource/.test(src), `${rel}: no other network API`);
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));
  r.ok(!manifest.web_accessible_resources, 'no web-accessible resources, pages cannot fingerprint the extension');
  r.ok(!manifest.content_scripts, 'no content scripts, nothing runs until you switch it on');
  r.ok(
    JSON.stringify(manifest.permissions.sort()) === JSON.stringify(['alarms', 'scripting', 'storage']),
    `permissions are the minimum needed: ${manifest.permissions.join(', ')}`
  );
  for (const ref of [manifest.background.service_worker, manifest.action.default_popup, manifest.options_ui.page, ...Object.values(manifest.icons)]) {
    r.ok(fs.existsSync(path.join(DIR, ref)), `manifest reference exists: ${ref}`);
  }

  r.finish();
})();
