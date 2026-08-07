# Privacy

HideLLM collects nothing, sends nothing, and has no server to send anything to.

## What is collected

Nothing. There is no analytics, no telemetry, no crash reporting, no update ping
and no unique identifier.

## What leaves your browser

Nothing. The extension makes no network requests of any kind. There is no `fetch`,
`XMLHttpRequest`, `WebSocket`, `sendBeacon` or `EventSource` call in the source, and
[`test/worker.test.js`](test/worker.test.js) asserts that on every commit. A
contributor cannot add one without a test going red.

## What is stored, and where

| Stored | Where | Contains |
|---|---|---|
| Your settings | `chrome.storage.sync` | Chosen disguise, document name, visibility mode, which sites are enabled |
| Per-tab state | `chrome.storage.local` | Which disguise is currently applied to which tab id |

`storage.sync` is Chrome's own settings-sync mechanism: if you're signed into
Chrome, your settings follow your profile between machines, handled entirely by
Google under [their][chrome-privacy] terms. If you aren't signed in, it stays on the
device. HideLLM never sees that traffic and has no server involved in it.

Uninstalling the extension removes both.

[chrome-privacy]: https://www.google.com/chrome/privacy/

## What the extension can see

The extension requests access to the assistant sites it disguises, and nothing
else. It cannot read any other site.

On those sites, it can only act *after* you switch it on: there is no content
script, so nothing runs on a fresh install until you flip the switch.

When it does run, it adds a stylesheet and a toolbar to the page. It does not read
your conversation, your prompts, or any page content. The CSS hides text; it never
extracts it.

## Permissions, and why each one exists

| Permission | Why |
|---|---|
| `scripting` | Insert the stylesheet and the toolbar into the tab |
| `storage` | Remember your settings |
| `alarms` | End a peek after its timer, reliably, even if the worker was suspended |
| Host access to the assistant sites | Act on those tabs, and nowhere else |

There is no `tabs` permission. The extension can see a tab's URL only for the sites
you granted it, which is the least it can work with.

## Fingerprinting

Every image the extension uses (favicons, app icons, toolbar glyphs) is an inline
SVG data URI. Because of that the manifest declares no `web_accessible_resources`,
and a visited page cannot detect that HideLLM is installed by probing for its asset
URLs. That is a common technique for identifying extensions, and it doesn't work
here.

The page can still see the DOM node the toolbar is mounted on, as any injected UI
must be. HideLLM does not attempt to hide from the site itself, but only from someone
looking at your screen.

## What this does not protect you from

Being direct about it, because the difference matters:

- The address bar still reads `chatgpt.com`.
- Your browser history, your cache and your network traffic are unchanged.
- Corporate monitoring software, DNS logging, proxies and managed-device policies
  all see exactly what they saw before.
- Anyone who clicks anything, scrolls, or looks at the tab for more than a moment
  will work it out.

It is a disguise against a passing glance. Treat it as exactly that.

## Changes

Any change to this document is a change to the extension's behaviour and will
appear in [CHANGELOG.md](CHANGELOG.md) and in the release notes.

## Questions

Open an issue: <https://github.com/antidepressive/HideLLM/issues>.
