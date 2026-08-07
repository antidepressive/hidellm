// settings.js: one validated settings object, one place that reads and writes it.
//
// Settings live in chrome.storage.sync so they follow the browser profile; if sync
// is unavailable (Chromium builds without a signed-in profile, some enterprise
// policies) the same shape is read from and written to storage.local instead.
//
// Everything that reads settings goes through readSettings(), which normalises
// whatever it finds. That way a stale key, a theme that no longer exists or a
// hand-edited value can never crash the worker: it degrades to a default.

(function (root) {
  const HL = (root.HL = root.HL || {});

  const KEY = 'settings';

  // How much of the conversation stays readable while disguised. Declared in the
  // order the pickers show them: least hidden on the left, most hidden on the right.
  const CONTENT_MODES = {
    full: { label: 'Everything', hint: 'Keep the whole thread readable, styled as a document' },
    answers: { label: 'Answers only', hint: 'Your prompts are hidden; replies read as document text' },
    blank: { label: 'Blank page', hint: 'Hide the whole conversation, nothing to read over your shoulder' },
  };

  const DEFAULTS = {
    enabled: false,
    theme: 'docs',
    docName: '',          // blank → the theme's own default ("Untitled document")
    titleOverride: '',    // blank → derived from the theme + docName
    contentMode: 'full',
    showChrome: true,     // draw the fake toolbar
    fakeFavicon: true,    // swap the tab icon
    fakeTitle: true,      // swap the tab title
    applyToAllTabs: true, // toggling affects every open assistant tab, not just this one
    peekSeconds: 15,      // auto-restore after a peek; 0 = stay revealed until toggled
    disabledSites: [],    // site keys the user switched off
  };

  const clampInt = (v, lo, hi, fallback) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
  };

  // Trim, collapse newlines, and cap length. Document names end up in the tab title
  // and in the fake toolbar's markup, so an unbounded string is a layout hazard.
  const clean = (v, max) =>
    typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';

  // Force any stored blob into a complete, valid settings object.
  function normalize(raw) {
    const s = raw && typeof raw === 'object' ? raw : {};
    const known = HL.THEMES || {};
    const sites = HL.SITES || {};
    return {
      enabled: s.enabled === true,
      theme: known[s.theme] ? s.theme : DEFAULTS.theme,
      docName: clean(s.docName, 80),
      titleOverride: clean(s.titleOverride, 120),
      contentMode: CONTENT_MODES[s.contentMode] ? s.contentMode : DEFAULTS.contentMode,
      showChrome: s.showChrome !== false,
      fakeFavicon: s.fakeFavicon !== false,
      fakeTitle: s.fakeTitle !== false,
      applyToAllTabs: s.applyToAllTabs !== false,
      peekSeconds: clampInt(s.peekSeconds, 0, 600, DEFAULTS.peekSeconds),
      disabledSites: Array.isArray(s.disabledSites)
        ? s.disabledSites.filter((k) => typeof k === 'string' && sites[k])
        : [],
    };
  }

  // storage.sync when we can, storage.local when we can't. Resolved once and
  // cached, because the service worker restarts often enough that a per-call probe would
  // be pure overhead.
  let areaPromise = null;
  function area() {
    if (!areaPromise) {
      areaPromise = (async () => {
        try {
          if (chrome.storage.sync) {
            await chrome.storage.sync.get(KEY);
            return chrome.storage.sync;
          }
        } catch {
          /* sync unavailable: fall through */
        }
        return chrome.storage.local;
      })();
    }
    return areaPromise;
  }

  async function readSettings() {
    try {
      const store = await area();
      const data = await store.get(KEY);
      return normalize(data[KEY]);
    } catch {
      return normalize(null);
    }
  }

  // Merge a patch over the current settings and persist the normalised result.
  // Returns what was actually stored, so callers never have to guess whether their
  // value survived validation.
  async function writeSettings(patch) {
    const next = normalize({ ...(await readSettings()), ...patch });
    const store = await area();
    await store.set({ [KEY]: next });
    return next;
  }

  // Is this site one the user still wants disguised?
  function siteEnabled(settings, siteKey) {
    return !!siteKey && !settings.disabledSites.includes(siteKey);
  }

  HL.SETTINGS_KEY = KEY;
  HL.DEFAULT_SETTINGS = DEFAULTS;
  HL.CONTENT_MODES = CONTENT_MODES;
  HL.normalizeSettings = normalize;
  HL.readSettings = readSettings;
  HL.writeSettings = writeSettings;
  HL.siteEnabled = siteEnabled;
})(typeof self !== 'undefined' ? self : window);
