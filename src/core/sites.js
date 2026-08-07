// sites.js: per-site rules for hiding the assistant's own interface.
//
// Every supported site gets four optional stylesheets:
//   chromeCss   always applied, hides the app's shell (sidebar, header, composer
//               furniture) so what's left reads as document body text
//   promptCss   applied unless the user asked to see everything, hides *their own*
//               messages, which are the ones that give the game away
//   answerCss   applied in "Blank page" mode, hides the replies too
//   docCss      typography for whatever survives, so it reads like a document
//
// Sites marked `tested: false` use GENERIC_CSS: structural rules that don't depend
// on a specific site's class names. They're a reasonable disguise, not a verified
// one, and the UI labels them Experimental.
//
// These selectors target markup that the AI vendors regenerate at will. When one
// stops working the fix is here, and nowhere else.

(function (root) {
  const HL = (root.HL = root.HL || {});

  // ─── layer 1: the reset ───
  // Runs for every site and theme. Flattens the page to black-on-transparent so
  // the theme's canvas (painted on <body>) shows through, and kills every visual
  // cue of a chat app: brand colours, gradients, blurs, shadows, icon buttons.
  // `!important` throughout, because these sites ship extremely specific utility CSS.
  const BASE_CSS = `
* {
  background-color: transparent !important;
  background-image: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  box-shadow: none !important;
  text-shadow: none !important;
  border-color: rgba(0,0,0,0.10) !important;
  color: #202124 !important;
}
html, body {
  overflow-x: hidden !important;
  max-width: 100vw !important;
}
*::before, *::after {
  background: transparent !important;
  background-image: none !important;
}
img, video, canvas, picture { opacity: 0 !important; }
textarea::placeholder, input::placeholder { color: #80868b !important; }
::-webkit-scrollbar { width: 10px !important; height: 10px !important; }
::-webkit-scrollbar-track { background: transparent !important; }
::-webkit-scrollbar-thumb { background: #dadce0 !important; border-radius: 5px !important; }
button, [role="button"] { display: none !important; }
`;

  // ─── layer 2b: document typography ───
  // Applied over every site. Turns the surviving text into something that passes
  // for body copy: one serif-free family, document leading, a page-width column.
  function typographyCss(font, size, pageWidth) {
    return `
* { font-family: ${font} !important; }
body, p, li, td, th, span, div {
  font-size: ${size} !important;
  line-height: 1.62 !important;
  letter-spacing: normal !important;
}
h1 { font-size: 20pt !important; font-weight: 400 !important; }
h2 { font-size: 16pt !important; font-weight: 400 !important; }
h3 { font-size: 14pt !important; font-weight: 400 !important; }
h1, h2, h3, h4 { line-height: 1.3 !important; margin: 14px 0 6px !important; }
code, pre, kbd, samp { font-family: "Consolas", "Courier New", monospace !important; font-size: 10pt !important; }
pre { border: 1px solid rgba(0,0,0,0.12) !important; border-radius: 3px !important; padding: 8px 10px !important; }
hr { border: 0 !important; border-top: 1px solid rgba(0,0,0,0.15) !important; }
a { color: #202124 !important; text-decoration: none !important; }
main, [role="main"] { max-width: ${pageWidth}px !important; margin-left: auto !important; margin-right: auto !important; }
`;
  }

  // ─── layer 2c: the composer ───
  // Applied last, after the hiding rules, and deliberately unconditional: a
  // disguise you cannot type into is useless, and the selectors that hide your own
  // messages ("whitespace-pre-wrap", "user", "query") are exactly the ones that
  // tend to match the input box too. This puts the box back whatever else matched.
  //
  // The alignment rules are here for the same reason. Once the app's own layout
  // classes are flattened, several of these composers inherit a centred text
  // alignment from an ancestor, so both the caret and the placeholder drift into
  // the middle of the field. Document text starts at the left margin.
  //
  // Only the editable surface itself is force-shown, never its wrappers: reverting
  // `display` on a flex container the app laid out by hand would move the box
  // rather than reveal it. The per-site rules below carry `:not(:has(...))` guards
  // so this is a safety net, not the primary mechanism.
  const COMPOSER_CSS = `
textarea,
[contenteditable="true"],
[contenteditable="true"] *,
.ProseMirror,
.ProseMirror *,
.ql-editor,
.ql-editor * {
  display: revert !important;
  visibility: visible !important;
  opacity: 1 !important;
}
textarea,
input[type="text"],
[contenteditable="true"],
.ProseMirror,
.ql-editor,
#prompt-textarea {
  text-align: left !important;
  text-align-last: left !important;
  direction: ltr !important;
}
textarea::placeholder,
input::placeholder,
[data-placeholder]::before,
.ProseMirror [data-placeholder]::before,
.ql-editor::before,
p.placeholder::before,
.placeholder::before {
  text-align: left !important;
  left: 0 !important;
  right: auto !important;
  transform: none !important;
}
`;

  // Appended to any hiding selector loose enough to catch the composer by accident.
  // The untested sites match on fuzzy class-name fragments ("user", "query",
  // "prose"), and a composer wrapper is very often called one of those.
  const KEEP = ':not(:has(textarea)):not(:has([contenteditable="true"]))';

  // ─── generic fallback for untested sites ───
  // Nothing here depends on a class name a vendor can rename. It hides landmark
  // regions (sidebar, header, footer), decorative media and icon-only controls.
  const GENERIC_CSS = `
:is(nav, aside, header, footer,
[role="navigation"], [role="banner"], [role="complementary"], [role="toolbar"],
[class*="sidebar" i], [id*="sidebar" i], [class*="Sidebar"],
[class*="navbar" i], [class*="header" i][class*="bar" i])${KEEP} { display: none !important; }
svg { display: none !important; }
[aria-label*="menu" i], [aria-label*="settings" i], [aria-label*="upgrade" i] { display: none !important; }
`;

  const SITES = {
    chatgpt: {
      label: 'ChatGPT',
      hosts: ['chatgpt.com', 'chat.openai.com'],
      tested: true,
      chromeCss: `
#page-header, div.composer-parent, div[data-testid="composer-footer-actions"] { border: 0 !important; }
#page-header { border-bottom: 1px solid rgba(0,0,0,0.10) !important; }
div.composer-parent { border-top: 1px solid rgba(0,0,0,0.10) !important; }
button[data-testid="model-switcher-dropdown-button"] { display: none !important; }
#stage-slideover-sidebar, #text-base, .text-token-text-secondary.pointer-events-auto { display: none !important; }
div.text-token-text-secondary.relative.mt-auto.flex.min-h-8.w-full.items-center.justify-center.p-2.text-center.text-xs { display: none !important; }
.icon-md-heavy, .icon-md, .icon-sm, svg.icon { display: none !important; }
div#thread-bottom { border: none !important; }
form button, form svg, form [role="button"] { display: none !important; }
[role="link"], .text-caption-regular { display: none !important; }
div.flex.w-full.items-center.justify-center.gap-1\\.5 { color: transparent !important; }
div[data-testid="composer-action-file-upload"] { opacity: 0.6 !important; }
`,
      // Scoped to the thread. A bare `.whitespace-pre-wrap` used to live here and it
      // also matched the ProseMirror composer, which is how "answers only" ended up
      // with nowhere to type.
      promptCss: `
div[data-message-author-role="user"] { display: none !important; }
[data-message-author-role="user"] .px-1.text-pretty.whitespace-pre-wrap { display: none !important; }
article:has([data-message-author-role="user"]) { display: none !important; }
`,
      answerCss: `
div[data-message-author-role="assistant"], .markdown, [data-message-id] { display: none !important; }
`,
    },

    claude: {
      label: 'Claude',
      hosts: ['claude.ai'],
      tested: true,
      chromeCss: `
.fixed.z-sidebar, [data-testid="menu-sidebar"] { display: none !important; }
.flex-shrink-0, .whitespace-nowrap, .truncate { display: none !important; }
.w-8.text-accent-brand.inline-block.select-none { display: none !important; }
[role="note"], [role="status"] { display: none !important; }
svg { display: none !important; }
`,
      promptCss: `
[data-testid="user-message"], .font-user-message { display: none !important; }
`,
      answerCss: `
[data-testid="assistant-message"], .font-claude-message, .font-claude-response { display: none !important; }
`,
    },

    gemini: {
      label: 'Gemini',
      hosts: ['gemini.google.com'],
      tested: true,
      chromeCss: `
span.title-text, [data-test-id="overflow-container"] { display: none !important; }
.gemini-sidenav-text.gds-title-l-emphasized.expanded.ng-star-inserted { display: none !important; }
.sparkle-image, [data-test-id="disclaimer-youth"], [data-test-id="bard-mode-menu-button"] { display: none !important; }
bard-sidenav, bard-sidenav-container .sidenav, .side-nav-menu-button { display: none !important; }
`,
      promptCss: `
span.message-text, user-query, .query-text { display: none !important; }
`,
      answerCss: `
model-response, message-content, .model-response-text { display: none !important; }
`,
    },

    grok: {
      label: 'Grok',
      hosts: ['grok.com'],
      tested: false,
      chromeCss: GENERIC_CSS,
      promptCss: `.items-end .whitespace-pre-wrap${KEEP}, [class*="user" i][class*="message" i]${KEEP} { display: none !important; }`,
      answerCss: `[class*="response" i]${KEEP}, [class*="assistant" i]${KEEP} { display: none !important; }`,
    },

    perplexity: {
      label: 'Perplexity',
      hosts: ['perplexity.ai'],
      tested: false,
      chromeCss: GENERIC_CSS,
      promptCss: `[class*="query" i] h1, [class*="Query" i]${KEEP} { display: none !important; }`,
      answerCss: `[class*="answer" i]${KEEP}, [class*="prose" i]${KEEP} { display: none !important; }`,
    },

    deepseek: {
      label: 'DeepSeek',
      hosts: ['chat.deepseek.com'],
      tested: false,
      chromeCss: GENERIC_CSS,
      promptCss: `[class*="_user" i]${KEEP}, [class*="user-message" i]${KEEP} { display: none !important; }`,
      answerCss: `[class*="markdown" i]${KEEP} { display: none !important; }`,
    },

    copilot: {
      label: 'Microsoft Copilot',
      hosts: ['copilot.microsoft.com'],
      tested: false,
      chromeCss: GENERIC_CSS,
      promptCss: `[data-content="user-message"]${KEEP}, [class*="userMessage" i]${KEEP} { display: none !important; }`,
      answerCss: `[data-content="ai-message"]${KEEP}, [class*="aiMessage" i]${KEEP} { display: none !important; }`,
    },
  };

  // Every origin the extension may inject into, derived from SITES so the manifest
  // and the runtime can never drift apart. (test/manifest.test.js asserts they match.)
  function matchPatterns() {
    const out = [];
    for (const key in SITES) {
      for (const h of SITES[key].hosts) {
        out.push(`https://${h}/*`, `https://*.${h}/*`);
      }
    }
    return out;
  }

  // Which supported site is this URL, if any?
  //
  // Matched on the parsed hostname, never on `url.includes(...)`: a substring test
  // says yes to `https://evil.example/?next=claude.ai`, which would inject the
  // disguise into an attacker-controlled page.
  function getSiteKey(url) {
    let host;
    try {
      const u = new URL(url);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
      host = u.hostname.toLowerCase();
    } catch {
      return null;
    }
    for (const key in SITES) {
      if (SITES[key].hosts.some((h) => host === h || host.endsWith('.' + h))) return key;
    }
    return null;
  }

  HL.SITES = SITES;
  HL.BASE_CSS = BASE_CSS;
  HL.COMPOSER_CSS = COMPOSER_CSS;
  HL.GENERIC_CSS = GENERIC_CSS;
  HL.typographyCss = typographyCss;
  HL.getSiteKey = getSiteKey;
  HL.matchPatterns = matchPatterns;
})(typeof self !== 'undefined' ? self : window);
