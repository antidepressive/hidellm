// engine.js: builds the disguise and puts it on (or takes it off) a tab.
//
// Two things get injected:
//   1. a stylesheet, via chrome.scripting.insertCSS
//   2. a small self-contained function, via chrome.scripting.executeScript, which
//      does what CSS can't: the tab title, the favicon, and the fake toolbar
//
// The injected functions are serialised to source and run inside the page, so they
// can close over nothing from this file: everything they need arrives in `cfg`.
//
// Removal is the fiddly part. chrome.scripting.removeCSS only works when handed
// the *exact* string that was inserted, so we record which site/theme/mode we
// injected for each tab and rebuild the string from that. Recomputing it from the
// current settings would strand a stylesheet on the page the moment the user
// switched themes between apply and remove.

(function (root) {
  const HL = (root.HL = root.HL || {});

  const STATE_KEY = 'tabState';
  const SURFACE_ID = 'hidellm-surface';

  // ─── the stylesheet ───
  // Pure: the same (site, theme, mode) always produces byte-identical CSS, which
  // is what makes removal reliable.
  function buildCss(siteKey, themeKey, contentMode) {
    const site = HL.SITES[siteKey];
    const theme = HL.THEMES[themeKey] || HL.THEMES[HL.DEFAULT_THEME];

    let css = HL.BASE_CSS;
    css += HL.typographyCss(theme.font, theme.fontSize, theme.pageWidth);
    if (site) {
      css += site.chromeCss || '';
      if (contentMode !== 'full') css += site.promptCss || '';
      if (contentMode === 'blank') css += site.answerCss || '';
    }
    // After the site rules, so the box you type into survives whatever they hid.
    css += HL.COMPOSER_CSS;
    css += theme.canvasCss;
    return css;
  }

  // Everything the injected function needs, derived from validated settings.
  function buildPayload(settings) {
    const t = HL.resolveTheme(settings.theme, settings.docName, settings.titleOverride);
    return {
      id: SURFACE_ID,
      title: settings.fakeTitle ? t.title : null,
      favicon: settings.fakeFavicon ? t.favicon : null,
      chromeHtml: settings.showChrome ? t.chromeHtml : null,
      chromeCss: t.chromeCss,
      chromeHeight: t.chromeHeight,
    };
  }

  // ═══ injected into the page ═══════════════════════════════════════
  // Self-contained by necessity. Keeps re-asserting itself because these are
  // single-page apps that rewrite the title and favicon on every route change and
  // occasionally sweep unknown nodes out of <html>.
  function surfaceApply(cfg) {
    const W = window;

    // Tear down whatever a previous apply left behind, then rebuild. Cheaper to
    // reason about than diffing, and it runs at most once per settings change.
    if (W.__hidellmTeardown) {
      try { W.__hidellmTeardown(); } catch { /* page already navigating */ }
    }

    let host = null;

    function mount() {
      if (!cfg.chromeHtml) return;
      const rootEl = document.documentElement;
      if (!rootEl) return;
      if (host && host.isConnected) return;

      host = document.createElement('div');
      host.id = cfg.id;
      // Inline and !important: the disguise stylesheet flattens every background
      // and colour on the page, and inline !important is the one thing it can't
      // outrank. `all:initial` first, then the properties we actually want.
      host.setAttribute(
        'style',
        'all:initial!important;position:fixed!important;top:0!important;left:0!important;' +
          'width:100%!important;height:' + cfg.chromeHeight + 'px!important;' +
          'z-index:2147483647!important;pointer-events:none!important;display:block!important;' +
          'visibility:visible!important;opacity:1!important;margin:0!important;padding:0!important;' +
          'border:0!important;transform:none!important;filter:none!important;'
      );

      // A shadow root is what makes the toolbar immune to the disguise stylesheet:
      // outer rules cannot select into it, so the toolbar keeps its real colours
      // while everything around it is flattened.
      const shadow = host.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = cfg.chromeCss;
      const wrap = document.createElement('div');
      wrap.innerHTML = cfg.chromeHtml;
      shadow.appendChild(style);
      shadow.appendChild(wrap);
      rootEl.appendChild(host);
    }

    function applyTitle() {
      if (cfg.title && document.title !== cfg.title) document.title = cfg.title;
    }

    function applyFavicon() {
      const head = document.head;
      if (!head || !cfg.favicon) return;
      // Drop the site's own icons, keep ours (tagged so we don't fight ourselves).
      document
        .querySelectorAll('link[rel~="icon"]:not([data-hidellm]), link[rel="shortcut icon"]:not([data-hidellm])')
        .forEach((el) => el.remove());
      let link = document.querySelector('link[data-hidellm]');
      if (!link) {
        link = document.createElement('link');
        link.setAttribute('data-hidellm', '');
        link.rel = 'icon';
        head.appendChild(link);
      }
      if (link.getAttribute('href') !== cfg.favicon) link.setAttribute('href', cfg.favicon);
    }

    function assert() {
      try {
        applyTitle();
        applyFavicon();
        mount();
      } catch { /* mid-navigation DOM teardown */ }
    }

    // Watch <head> for the app rewriting the title or favicon, and <html>'s direct
    // children for our host being swept away. Scoped deliberately narrowly: a
    // subtree observer on <html> would fire on every token these apps stream in.
    const observers = [];
    function observe(target, opts) {
      if (!target) return;
      const mo = new MutationObserver(assert);
      mo.observe(target, opts);
      observers.push(mo);
    }
    observe(document.head, { childList: true, subtree: true });
    observe(document.documentElement, { childList: true });

    // Backstop for anything the observers miss (title set before <head> exists,
    // a same-document navigation that swaps the whole tree).
    const timer = setInterval(assert, 1500);

    W.__hidellmTeardown = function () {
      clearInterval(timer);
      observers.forEach((o) => o.disconnect());
      document.querySelectorAll('#' + cfg.id).forEach((el) => el.remove());
      document.querySelectorAll('link[data-hidellm]').forEach((el) => el.remove());
      W.__hidellmTeardown = null;
    };

    assert();
  }

  // Injected on removal. Undoes surfaceApply and lets the page put its own title
  // and favicon back (a reload restores them properly; this just stops fighting).
  function surfaceRemove() {
    if (window.__hidellmTeardown) {
      try { window.__hidellmTeardown(); } catch { /* nothing to undo */ }
    }
    document.querySelectorAll('#hidellm-surface, link[data-hidellm]').forEach((el) => el.remove());
  }

  // ─── per-tab bookkeeping ───
  // Serialised through a single promise chain: storage.local is read-modify-write
  // here, and two tabs finishing their load in the same tick would otherwise race
  // and lose one of the records.
  let queue = Promise.resolve();
  function serialize(fn) {
    const next = queue.then(fn, fn);
    queue = next.catch(() => {});
    return next;
  }

  async function readState() {
    const data = await chrome.storage.local.get(STATE_KEY);
    return data[STATE_KEY] || {};
  }

  function updateState(tabId, rec) {
    return serialize(async () => {
      const state = await readState();
      if (rec) state[tabId] = rec;
      else delete state[tabId];
      await chrome.storage.local.set({ [STATE_KEY]: state });
      return state;
    });
  }

  async function getTabRecord(tabId) {
    return (await readState())[tabId] || null;
  }

  // ─── apply / remove ───

  // Pull off the stylesheet we last inserted into this tab, exactly as inserted.
  async function clearCss(tabId) {
    const rec = await getTabRecord(tabId);
    if (!rec) return;
    try {
      await chrome.scripting.removeCSS({
        target: { tabId },
        css: buildCss(rec.site, rec.theme, rec.mode),
      });
    } catch { /* tab closed or navigated, the stylesheet went with it */ }
    await updateState(tabId, null);
  }

  // Put the disguise on. Throws if the tab can't be injected into (no host
  // permission, closed mid-flight) so the caller can tell the user.
  async function applyToTab(tabId, siteKey, settings) {
    await clearCss(tabId);
    const css = buildCss(siteKey, settings.theme, settings.contentMode);

    await chrome.scripting.insertCSS({ target: { tabId }, css });
    await updateState(tabId, { site: siteKey, theme: settings.theme, mode: settings.contentMode });
    await chrome.scripting.executeScript({
      target: { tabId },
      func: surfaceApply,
      args: [buildPayload(settings)],
    });
  }

  async function removeFromTab(tabId) {
    await clearCss(tabId);
    try {
      await chrome.scripting.executeScript({ target: { tabId }, func: surfaceRemove });
    } catch { /* tab gone */ }
  }

  function forgetTab(tabId) {
    return updateState(tabId, null);
  }

  // ─── whole-window operations ───

  // Every open tab that this extension is allowed to disguise right now.
  async function supportedTabs(settings) {
    let tabs = [];
    try {
      tabs = await chrome.tabs.query({ url: HL.matchPatterns() });
    } catch {
      tabs = await chrome.tabs.query({});
    }
    return tabs
      .map((tab) => ({ tab, site: HL.getSiteKey(tab.url) }))
      .filter(({ site }) => site && HL.siteEnabled(settings, site));
  }

  // Apply to every eligible tab. Individual failures are collected rather than
  // thrown: one tab that's mid-navigation shouldn't stop the other five.
  async function applyToAll(settings) {
    const targets = await supportedTabs(settings);
    let applied = 0;
    for (const { tab, site } of targets) {
      try {
        await applyToTab(tab.id, site, settings);
        applied++;
      } catch { /* skip this tab */ }
    }
    return applied;
  }

  // Remove from every tab we know we touched.
  async function removeFromAll() {
    const state = await readState();
    const ids = Object.keys(state);
    for (const id of ids) {
      try { await removeFromTab(Number(id)); } catch { /* skip */ }
    }
    return ids.length;
  }

  HL.STATE_KEY = STATE_KEY;
  HL.buildCss = buildCss;
  HL.buildPayload = buildPayload;
  HL.applyToTab = applyToTab;
  HL.removeFromTab = removeFromTab;
  HL.forgetTab = forgetTab;
  HL.getTabRecord = getTabRecord;
  HL.readTabState = readState;
  HL.supportedTabs = supportedTabs;
  HL.applyToAll = applyToAll;
  HL.removeFromAll = removeFromAll;
})(typeof self !== 'undefined' ? self : window);
