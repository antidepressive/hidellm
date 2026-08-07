# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses
[semantic versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-08-07

The first release.

### Added

- **Five disguises**: Google Docs, Google Sheets, Microsoft Word, Microsoft Excel
  and Notion, each with a rendered application toolbar and a matching page canvas:
  a centred paper sheet for the word processors, a live cell grid for the
  spreadsheets.
- **Seven supported sites**: ChatGPT, Claude and Gemini with hand-tuned rules; Grok,
  Perplexity, DeepSeek and Microsoft Copilot with generic rules, labelled
  experimental in the UI.
- **Toolbars rendered in HTML and CSS**, not bundled as screenshots, so they land on
  exact CSS pixel sizes at any window width, zoom level and pixel density, and stay
  sharp on HiDPI. Page backgrounds are painted with CSS gradients for the same
  reason.
- **No bundled images at all.** Every icon and favicon is an inline SVG data URI,
  which lets the manifest drop `web_accessible_resources` entirely, so a page cannot
  detect the extension by probing for its asset URLs.
- **Visible-text modes**: *Answers only* (hides your prompts, leaves the replies as
  document body text), *Blank page* (hides the whole conversation) and *Everything*.
- **Peek** (`Ctrl+Shift+X`): reveal the real page on the tab in front, then re-hide
  it automatically after a configurable delay.
- **Document name** that drives both the fake toolbar and the tab title, formatted
  the way each app formats it, with a separate tab-title override for full control.
- **Per-site switches**, so any site can be excluded.
- **A settings page** with live previews rendered from the real theme code, and
  **live previews in the popup** that update as you type the document name.
- **Toolbar badge** showing when the disguise is armed.
- Options for the fake toolbar, tab title and favicon individually, and for whether
  toggling applies to every open assistant tab or only the one in front.
- Settings stored in `chrome.storage.sync`, so they follow the browser profile,
  with an automatic fall back to local storage where sync is unavailable.
- Hostname-based site matching. A URL such as `https://evil.example/?next=claude.ai`
  is rejected, and non-`http(s)` schemes are rejected outright.
- The tab title and favicon are held in place by a scoped `MutationObserver` rather
  than a polling interval, so they react immediately and cost nothing when idle.
- A four-suite test harness with no framework and no dependencies, covering the
  core logic, the service worker, both UI surfaces and repo hygiene.
- `npm run build` produces a Chrome Web Store zip; `npm run icons` regenerates the
  icon set from source.

[1.0.0]: https://github.com/antidepressive/HideLLM/releases/tag/v1.0.0
