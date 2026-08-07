// core.test.js: the pure logic: themes, site matching, settings validation and
// the stylesheet builder. No worker, no DOM.
//
// Most of the risk in this extension lives here: a bad site match injects into the
// wrong page, a non-deterministic stylesheet strands CSS on the page, and an
// unescaped document name is script injection into every tab.

const { makeReporter, loadCore, DIR } = require('./harness');
const fs = require('fs');
const path = require('path');

const r = makeReporter();

(async () => {
  const { HL, chrome } = loadCore();

  // ── 1. the module surface ──
  r.section('1. Core modules load and publish one namespace');
  for (const key of ['UI', 'THEMES', 'SITES', 'BASE_CSS', 'getSiteKey', 'readSettings', 'buildCss', 'applyToTab']) {
    r.ok(HL[key] !== undefined, `HL.${key} is exported`);
  }

  // ── 2. themes ──
  r.section('2. Every theme is complete and self-contained');
  const themeKeys = Object.keys(HL.THEMES);
  r.ok(themeKeys.length >= 5, `${themeKeys.length} themes: ${themeKeys.join(', ')}`);

  for (const [key, theme] of Object.entries(HL.THEMES)) {
    const resolved = HL.resolveTheme(key, '', '');
    r.ok(!!theme.label && !!theme.hint, `${key}: has a label and a hint for the UI`);
    r.ok(theme.favicon.startsWith('data:image/svg+xml,'), `${key}: favicon is an inline data: URI`);
    r.ok(theme.height > 20 && theme.height < 400, `${key}: chrome height is ${theme.height}px`);
    r.ok(resolved.chromeHtml.includes('hl-app'), `${key}: renders chrome markup`);
    r.ok(resolved.chromeCss.includes('all: initial'), `${key}: chrome CSS resets inherited properties`);
    r.ok(resolved.title.includes(theme.defaultDoc), `${key}: default title mentions the default document name`);
  }

  r.ok(
    !JSON.stringify(Object.values(HL.THEMES).map((t) => t.canvasCss)).includes('chrome-extension'),
    'no theme references a chrome-extension:// asset (nothing is web-accessible)'
  );

  // The grid canvases are offset by the chrome height so the first row lands
  // directly under the column letters. If someone retunes a toolbar and forgets
  // the canvas, the grid slides behind the header.
  for (const [key, theme] of Object.entries(HL.THEMES)) {
    if (theme.sheet !== 'grid') continue;
    r.ok(
      theme.canvasCss.includes(`${theme.height}px`),
      `${key}: grid canvas is offset by the chrome height (${theme.height}px)`
    );
  }

  // ── 3. escaping ──
  r.section('3. The document name cannot inject markup');
  const evil = '<img src=x onerror="alert(1)">';
  for (const key of themeKeys) {
    const html = HL.resolveTheme(key, evil, '').chromeHtml;
    r.ok(!html.includes('<img src=x'), `${key}: raw tag is escaped out of the chrome markup`);
  }
  r.ok(HL.UI.esc(`<&">'`) === '&lt;&amp;&quot;&gt;&#39;', 'esc() covers every HTML-significant character');

  const long = HL.normalizeSettings({ docName: 'x'.repeat(500) });
  r.eq(long.docName.length, 80, 'document names are capped at 80 characters');
  r.eq(HL.normalizeSettings({ docName: '  a\n\nb  ' }).docName, 'a b', 'whitespace and newlines are collapsed');

  // ── 4. site matching ──
  r.section('4. Site matching is hostname-based, not substring-based');
  const cases = [
    ['https://chatgpt.com/c/abc', 'chatgpt'],
    ['https://chat.openai.com/', 'chatgpt'],
    ['https://claude.ai/chat/1', 'claude'],
    ['https://gemini.google.com/app', 'gemini'],
    ['https://www.perplexity.ai/search', 'perplexity'],
    // the substring trap: a matching hostname must be the actual host
    ['https://evil.example/?next=claude.ai', null],
    ['https://claude.ai.evil.example/', null],
    ['https://notchatgpt.com/', null],
    ['https://example.com/', null],
    ['chrome://extensions', null],
    ['javascript:alert(1)', null],
    ['', null],
    [undefined, null],
  ];
  for (const [url, want] of cases) {
    r.eq(HL.getSiteKey(url), want, `getSiteKey(${JSON.stringify(url)})`);
  }

  // ── 5. manifest agreement ──
  r.section('5. The manifest and the site table agree');
  const manifest = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));
  const fromCode = [...HL.matchPatterns()].sort();
  const fromManifest = [...manifest.host_permissions].sort();
  r.ok(
    JSON.stringify(fromCode) === JSON.stringify(fromManifest),
    'host_permissions matches the hosts declared in sites.js'
  );
  for (const p of fromManifest) r.ok(p.startsWith('https://'), `host permission is https-only: ${p}`);

  // ── 6. the stylesheet builder ──
  r.section('6. buildCss is deterministic and honours the content mode');
  const a = HL.buildCss('chatgpt', 'docs', 'answers');
  const b = HL.buildCss('chatgpt', 'docs', 'answers');
  r.ok(a === b, 'same inputs produce a byte-identical stylesheet (removeCSS depends on this)');
  r.ok(HL.buildCss('chatgpt', 'word', 'answers') !== a, 'a different theme produces different CSS');

  const full = HL.buildCss('chatgpt', 'docs', 'full');
  const blank = HL.buildCss('chatgpt', 'docs', 'blank');
  r.ok(a.includes('data-message-author-role="user"'), 'answers mode hides the user\'s own prompts');
  r.ok(!full.includes('data-message-author-role="user"'), 'full mode leaves the prompts visible');
  r.ok(blank.includes('data-message-author-role="assistant"'), 'blank mode hides the replies as well');
  r.ok(blank.length > a.length && a.length > full.length, 'blank ⊃ answers ⊃ full, as designed');

  r.ok(HL.buildCss('chatgpt', 'docs', 'answers').includes('#f9fbfd'), 'the theme canvas colour makes it into the CSS');
  r.ok(HL.buildCss('chatgpt', 'excel', 'answers').includes('Aptos Narrow'), 'the theme body font makes it into the CSS');
  r.ok(!HL.buildCss('bogus-site', 'docs', 'answers').includes('undefined'), 'an unknown site degrades instead of emitting "undefined"');

  // A disguise you cannot type into is useless, so the composer rules are appended
  // after the hiding rules in every mode, and no hiding rule may name the composer.
  for (const mode of ['full', 'answers', 'blank']) {
    const css = HL.buildCss('chatgpt', 'docs', mode);
    r.ok(css.indexOf(HL.COMPOSER_CSS) > css.indexOf('#page-header'),
      `${mode} mode restores the composer after the site's own rules`);
  }
  for (const [key, site] of Object.entries(HL.SITES)) {
    // the `:not(:has(...))` guards mention the composer in order to spare it, so
    // strip them before looking for a rule that would actually hide it
    const hiding = ((site.promptCss || '') + (site.answerCss || '') + (site.chromeCss || ''))
      .replace(/:not\(:has\([^)]*\)\)/g, '');
    r.ok(!/contenteditable|prompt-textarea|ProseMirror|ql-editor/.test(hiding),
      `${key}: no hiding rule names the box you type into`);
  }
  r.ok(!/^\.whitespace-pre-wrap\b/m.test(HL.SITES.chatgpt.promptCss),
    'chatgpt: prompts are hidden by thread role, not by a bare utility class');

  // ── 7. settings validation ──
  r.section('7. Settings normalise instead of throwing');
  const n = HL.normalizeSettings;
  r.eq(n({ theme: 'nope' }).theme, 'docs', 'unknown theme falls back to the default');
  r.eq(n({ contentMode: 'nope' }).contentMode, 'full', 'unknown content mode falls back');
  r.eq(n({ peekSeconds: 99999 }).peekSeconds, 600, 'peek length is clamped at the top');
  r.eq(n({ peekSeconds: -5 }).peekSeconds, 0, 'peek length is clamped at the bottom');
  r.eq(n({ peekSeconds: 'abc' }).peekSeconds, 15, 'a non-numeric peek length falls back to the default');
  r.eq(n({ enabled: 'yes' }).enabled, false, 'enabled is a strict boolean');
  r.eq(n({ showChrome: undefined }).showChrome, true, 'opt-out booleans default to on');
  r.eq(n(null).theme, 'docs', 'null storage produces a complete object');
  r.eq(n('garbage').theme, 'docs', 'a non-object in storage produces a complete object');
  r.ok(
    JSON.stringify(n({ disabledSites: ['claude', 'not-a-site', 42] }).disabledSites) === '["claude"]',
    'unknown site keys are dropped from the exclusion list'
  );

  // ── 8. storage round-trip ──
  r.section('8. Settings round-trip through storage.sync');
  await HL.writeSettings({ theme: 'notion', docName: 'Q3 plan' });
  const stored = await HL.readSettings();
  r.eq(stored.theme, 'notion', 'theme survives a write/read cycle');
  r.eq(stored.docName, 'Q3 plan', 'document name survives a write/read cycle');
  r.ok(chrome._sync.settings !== undefined, 'written to storage.sync, so it follows the profile');
  r.ok(chrome._local.settings === undefined, 'not duplicated into storage.local');

  const noSync = loadCore(require('./harness').makeChrome({ noSync: true }));
  await noSync.HL.writeSettings({ theme: 'word' });
  r.eq((await noSync.HL.readSettings()).theme, 'word', 'falls back to storage.local when sync is unavailable');

  // ── 9. the injected payload ──
  r.section('9. The injected payload respects every opt-out');
  const base = HL.normalizeSettings({ theme: 'word', docName: 'Budget.docx' });
  const p = HL.buildPayload(base);
  r.ok(p.title === 'Budget.docx - Word', 'title is built from the theme and the document name');
  r.ok(p.chromeHtml.includes('Budget.docx'), 'the document name appears in the fake toolbar');
  r.eq(p.chromeHeight, HL.THEMES.word.height, 'payload carries the chrome height');

  const off = HL.buildPayload(HL.normalizeSettings({ showChrome: false, fakeTitle: false, fakeFavicon: false }));
  r.eq(off.title, null, 'fakeTitle off → no title in the payload');
  r.eq(off.favicon, null, 'fakeFavicon off → no favicon in the payload');
  r.eq(off.chromeHtml, null, 'showChrome off → no toolbar in the payload');

  const override = HL.buildPayload(HL.normalizeSettings({ theme: 'docs', titleOverride: 'Anything.pdf' }));
  r.eq(override.title, 'Anything.pdf', 'an explicit title override wins over the derived title');

  r.finish();
})();
