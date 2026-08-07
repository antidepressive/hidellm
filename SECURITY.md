# Security policy

## Supported versions

The latest release on `main` is the only supported version. There are no
maintenance branches.

## Reporting a vulnerability

**Please don't open a public issue for a security problem.**

Use GitHub's private reporting instead:
<https://github.com/antidepressive/HideLLM/security/advisories/new>

You should get an acknowledgement within a few days. If a fix is needed it'll go out
as a patch release, and you'll be credited in the changelog unless you'd rather not
be.

## What's in scope

This is a browser extension with no server, so the interesting surface is narrow:

- **Injection into an unintended origin**: anything that makes the extension act on
  a page outside its declared hosts. Site matching is hostname-based
  (`getSiteKey` in `src/core/sites.js`) specifically to prevent this; a bypass is a
  real finding.
- **Script injection through settings**: the document name reaches the toolbar
  markup. It is escaped in `src/core/ui.js` and length-capped in
  `src/core/settings.js`. A way around either is a real finding.
- **Any network request.** The extension is supposed to make none. If you find one,
  that's a finding regardless of where it goes.
- **Permission escalation**: anything that needs a permission beyond `scripting`,
  `storage`, `alarms` and the declared hosts.

## What's out of scope

- **The disguise being seen through.** It's a visual disguise against a glance over
  your shoulder. That the URL bar still says `chatgpt.com`, that history is
  unchanged, that clicking around reveals the real page, and that monitoring
  software is unaffected. These are documented properties, not vulnerabilities. See
  [PRIVACY.md](PRIVACY.md).
- **A site detecting that the extension is installed.** The toolbar is a DOM node;
  any injected UI is visible to the page. Fingerprinting via asset URLs is already
  prevented (there are no web-accessible resources), but the extension does not try
  to hide from the site itself.
- **Selectors breaking after a site redeploy.** That's a bug, so please do report it,
  just in the normal issue tracker.

## Hardening already in place

For context when you're assessing something:

- No content scripts. Nothing runs until the user switches the extension on.
- No `web_accessible_resources`. Every asset is an inline data URI.
- No network APIs anywhere in the source, asserted by a test.
- No `tabs` permission: URLs are visible only for the granted hosts.
- Injected code is a serialised function with a plain-object argument; there is no
  `eval`, no `new Function`, and no remote code.
- Toolbar markup is assembled in the extension and every interpolation is escaped.
