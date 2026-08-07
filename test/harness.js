// harness.js: the shared scaffolding every suite uses.
//
// There is no test framework and nothing to install: `node test/run.js` is the
// whole story. What's here is an assertion counter, a stub of the parts of the
// chrome.* API the extension touches, and a DOM small enough to boot the popup and
// options pages in a plain Node process.
//
// The DOM stub deliberately serves only ids that actually exist in the matching
// HTML file. A typo'd getElementById then returns null and the page throws, which
// is exactly the bug we want a test to catch.

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const DIR = path.join(__dirname, '..');

// ─── assertions ───
function makeReporter() {
  const r = {
    pass: 0,
    fail: 0,
    ok(cond, msg) {
      if (cond) { r.pass++; console.log('  PASS  ' + msg); }
      else { r.fail++; console.log('  FAIL  ' + msg); }
      return !!cond;
    },
    eq(actual, expected, msg) {
      return r.ok(actual === expected, `${msg}${actual === expected ? '' : `  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`}`);
    },
    section(title) { console.log('\n=== ' + title + ' ==='); },
    finish() {
      console.log(`\n──────────────\n${r.pass} passed, ${r.fail} failed\n`);
      process.exit(r.fail ? 1 : 0);
    },
  };
  return r;
}

// Drain microtasks and zero-delay timers. The worker starts work without awaiting
// it (listeners can't block), so assertions come after a settle().
const settle = async (rounds = 15) => {
  for (let i = 0; i < rounds; i++) await new Promise((r) => setTimeout(r, 0));
};

// ─── chrome.* stub ───
function makeChrome(opts = {}) {
  const sync = {};
  const local = {};
  const log = { insertCSS: [], removeCSS: [], executeScript: [], created: [], badge: [], alarms: [] };
  const listeners = {
    onUpdated: [], onRemoved: [], onCommand: [], onInstalled: [], onStartup: [],
    onMessage: [], onChanged: [], onAlarm: [],
  };
  let tabs = opts.tabs || [];
  let activeId = opts.activeId ?? null;

  const areaFor = (bag, name) => ({
    get: async (keys) => {
      const list = keys == null ? Object.keys(bag) : typeof keys === 'string' ? [keys] : keys;
      const out = {};
      for (const k of list) if (k in bag) out[k] = bag[k];
      return out;
    },
    set: async (obj) => {
      Object.assign(bag, obj);
      for (const fn of listeners.onChanged) {
        fn(Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, { newValue: v }])), name);
      }
    },
    remove: async (keys) => { for (const k of [].concat(keys)) delete bag[k]; },
    clear: async () => { for (const k of Object.keys(bag)) delete bag[k]; },
  });

  const chrome = {
    _sync: sync,
    _local: local,
    _log: log,
    _listeners: listeners,
    _setTabs: (t) => { tabs = t; },
    _setActive: (id) => { activeId = id; },
    _tabs: () => tabs,

    runtime: {
      lastError: null,
      id: 'testextensionid',
      getURL: (p) => 'chrome-extension://testextensionid/' + p,
      getManifest: () => JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8')),
      onInstalled: { addListener: (f) => listeners.onInstalled.push(f) },
      onStartup: { addListener: (f) => listeners.onStartup.push(f) },
      onMessage: { addListener: (f) => listeners.onMessage.push(f) },
      openOptionsPage: async () => { log.created.push('options'); },
      // Route a popup/options message through the worker's own listener, so the
      // message contract is exercised end to end rather than mocked.
      sendMessage: (msg) =>
        new Promise((resolve, reject) => {
          const fn = listeners.onMessage[0];
          if (!fn) return reject(new Error('no receiver'));
          fn(msg, {}, resolve);
        }),
    },

    storage: {
      sync: opts.noSync ? undefined : areaFor(sync, 'sync'),
      local: areaFor(local, 'local'),
      onChanged: { addListener: (f) => listeners.onChanged.push(f) },
    },

    tabs: {
      query: async (q) => {
        let out = tabs;
        if (q && q.active) out = out.filter((t) => t.id === activeId);
        if (q && q.url) {
          const pats = [].concat(q.url).map((p) => new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'));
          out = out.filter((t) => t.url && pats.some((re) => re.test(t.url)));
        }
        return out;
      },
      get: async (id) => {
        const t = tabs.find((x) => x.id === id);
        if (!t) throw new Error('no tab');
        return t;
      },
      create: async (o) => { log.created.push(o.url); return { id: 999 }; },
      onUpdated: { addListener: (f) => listeners.onUpdated.push(f) },
      onRemoved: { addListener: (f) => listeners.onRemoved.push(f) },
    },

    scripting: {
      insertCSS: async (a) => { log.insertCSS.push(a); },
      removeCSS: async (a) => { log.removeCSS.push(a); },
      executeScript: async (a) => { log.executeScript.push(a); return []; },
    },

    action: {
      setBadgeText: async (a) => { log.badge.push(a.text); },
      setBadgeBackgroundColor: async () => {},
      setTitle: async () => {},
    },

    commands: {
      onCommand: { addListener: (f) => listeners.onCommand.push(f) },
      getAll: (cb) => cb([
        { name: 'toggle-disguise', shortcut: 'Ctrl+Shift+Z' },
        { name: 'toggle-peek', shortcut: 'Ctrl+Shift+X' },
      ]),
    },

    alarms: {
      create: (name, info) => { log.alarms.push({ name, info }); },
      clear: async (name) => { log.alarms = log.alarms.filter((a) => a.name !== name); return true; },
      onAlarm: { addListener: (f) => listeners.onAlarm.push(f) },
    },
  };

  return chrome;
}

// ─── loading extension source ───

// The five core modules, in the order the worker and both pages load them.
const CORE = ['ui', 'themes', 'sites', 'settings', 'engine'].map((n) => `src/core/${n}.js`);

function runIn(ctx, relPath) {
  vm.runInContext(fs.readFileSync(path.join(DIR, relPath), 'utf8'), ctx, { filename: relPath });
}

// Boot the service worker exactly the way Chrome does: a worker global, an
// importScripts that actually evaluates the files, then background.js.
function loadWorker(chrome = makeChrome()) {
  const ctx = { chrome, console, URL, setTimeout, clearTimeout, setInterval, clearInterval, Math, JSON };
  ctx.self = ctx;
  ctx.globalThis = ctx;
  ctx.importScripts = (...files) => files.forEach((f) => runIn(ctx, f.replace(/^\//, '')));
  vm.createContext(ctx);
  runIn(ctx, 'src/background.js');
  return { chrome, ctx };
}

// Just the core modules, no worker, for testing pure logic.
function loadCore(chrome = makeChrome()) {
  const ctx = { chrome, console, URL, setTimeout, clearTimeout, Math, JSON, encodeURIComponent };
  ctx.self = ctx;
  vm.createContext(ctx);
  CORE.forEach((f) => runIn(ctx, f));
  return { chrome, ctx, HL: ctx.HL };
}

// ─── DOM stub ───
// Enough of the DOM to boot popup.js and options.js. Not a browser: no layout, no
// CSS, no real shadow encapsulation, it verifies wiring, not rendering.
function makeDom(htmlFile) {
  const html = fs.readFileSync(path.join(DIR, htmlFile), 'utf8');
  const knownIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));

  class Node {
    constructor(tag) {
      this.tagName = String(tag || 'div').toUpperCase();
      this.children = [];
      this.attributes = {};
      this.style = { cssText: '', setProperty() {} };
      this.dataset = {};
      this._text = '';
      this._html = '';
      this._listeners = {};
      this.className = '';
      this.checked = false;
      this.disabled = false;
      this.value = '';
      this.placeholder = '';
      this.hidden = false;
      this.clientWidth = 300;
      this.shadowRoot = null;
      this.classList = {
        _set: new Set(),
        add: (c) => this.classList._set.add(c),
        remove: (c) => this.classList._set.delete(c),
        contains: (c) => this.classList._set.has(c),
        toggle: (c, force) => (force === undefined ? (this.classList._set.has(c) ? this.classList._set.delete(c) : this.classList._set.add(c)) : force ? this.classList._set.add(c) : this.classList._set.delete(c)),
      };
    }
    get textContent() { return this._text; }
    set textContent(v) { this._text = String(v); if (v === '') this.children = []; }
    get innerHTML() { return this._html; }
    set innerHTML(v) {
      this._html = String(v);
      // one synthetic child so lastElementChild is meaningful for callers that
      // reach for the element they just appended
      this.children = [new Node('div')];
    }
    get lastElementChild() { return this.children[this.children.length - 1] || null; }
    get firstElementChild() { return this.children[0] || null; }
    appendChild(c) { this.children.push(c); return c; }
    append(...cs) { cs.forEach((c) => this.children.push(c)); }
    remove() {}
    setAttribute(k, v) { this.attributes[k] = String(v); }
    getAttribute(k) { return k in this.attributes ? this.attributes[k] : null; }
    hasAttribute(k) { return k in this.attributes; }
    addEventListener(type, fn) { (this._listeners[type] ||= []).push(fn); }
    dispatch(type, ev = {}) { (this._listeners[type] || []).forEach((fn) => fn(ev)); }
    attachShadow() { this.shadowRoot = new Node('shadow-root'); return this.shadowRoot; }
    querySelectorAll() { return []; }
    querySelector() { return null; }
  }

  const byId = new Map();
  const document = {
    activeElement: null,
    documentElement: new Node('html'),
    head: new Node('head'),
    body: new Node('body'),
    getElementById(id) {
      if (!knownIds.has(id)) return null; // the point of the stub
      if (!byId.has(id)) byId.set(id, new Node('div'));
      return byId.get(id);
    },
    createElement: (tag) => new Node(tag),
    createTextNode: (t) => Object.assign(new Node('#text'), { _text: String(t) }),
    querySelectorAll: () => [],
    querySelector: () => null,
    addEventListener() {},
  };

  return { document, byId, knownIds, Node };
}

// Load a page script (popup.js / options.js) with the core modules already in
// scope, mirroring the <script> order in its HTML.
function loadPage(dir, chrome = makeChrome()) {
  const dom = makeDom(`src/${dir}/${dir}.html`);
  const win = {
    chrome,
    console,
    URL,
    document: dom.document,
    location: { hash: '' },
    setTimeout,
    clearTimeout,
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    addEventListener() {},
    close() {},
    confirm: () => true,
    encodeURIComponent,
    Math,
    JSON,
  };
  win.window = win;
  win.self = win;
  vm.createContext(win);
  CORE.slice(0, 4).forEach((f) => runIn(win, f)); // pages don't load engine.js
  runIn(win, `src/${dir}/${dir}.js`);
  return { win, dom, chrome };
}

module.exports = { DIR, makeReporter, settle, makeChrome, loadWorker, loadCore, loadPage, makeDom, CORE, runIn };
