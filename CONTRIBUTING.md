# Contributing

Thanks for looking. This is a small, dependency-free codebase and the bar for
getting started is low: clone it, load it unpacked, change a file, reload.

## Getting set up

```bash
git clone https://github.com/antidepressive/HideLLM.git
cd hidellm
npm test          # nothing to install first: that's the point
```

Then load it in the browser: `chrome://extensions` → **Developer mode** → **Load
unpacked** → pick the repository folder.

| Changed | To see it |
|---|---|
| `src/core/*`, `src/background.js`, `manifest.json` | Reload the extension |
| `src/popup/*` | Reopen the popup |
| `src/options/*` | Reload the options tab |

## The most useful contribution

**Broken selectors.** The disguise targets generated class names on sites that
redeploy constantly, so it rots. If ChatGPT's sidebar starts showing through, the
fix is a few lines in `src/core/sites.js` and it is genuinely the most valuable
patch this project receives.

When you send one, say which site, which browser and roughly when. A screenshot of
the leak helps more than a description.

## Adding a disguise

See [docs/THEMES.md](docs/THEMES.md). One entry in `src/core/themes.js` and it
appears everywhere in the UI. The thing to get right is the toolbar height: it must
be the real height in CSS pixels at 100% zoom, measured against the app you're
imitating.

## Adding a site

One entry in `src/core/sites.js`, plus the matching entries in
`host_permissions`. A test fails if those two disagree, so you can't forget half of
it.

Mark it `tested: false` unless you have actually used it for a while. The UI shows
those as *Experimental*, which is the honest label for rules nobody has lived with.

## House style

There's no ESLint, and `npm run lint` covers what a syntax pass can: everything
compiles, everything parses, two-space indent, no tabs, no trailing whitespace, a
final newline.

Beyond that, match what's around you:

- Comments explain **why**, not what. If a line is strange, the comment should say
  what breaks without it. Several of the odder decisions in this codebase are
  documented at the point they were made; keep that up.
- Names are spelled out. `themeKey`, not `tk`.
- No dependencies. Not one. The extension ships its own source, and a reviewer
  should be able to read all of it.
- The service worker owns every mutation. UI surfaces read state and post messages.

## Tests

```bash
npm test        # all four suites
npm run lint
```

New behaviour needs a test. The suites are plain Node scripts with a `pass/fail`
counter. Copy the shape of whatever's nearest. `test/harness.js` has the `chrome.*`
stub, the worker loader and the DOM stub.

Anything security-shaped (URL matching, escaping, permissions) needs a test that
covers the *failure* case, not only the happy one.

What tests can't cover is whether the disguise actually looks right on a live site.
Please check that by hand before opening a pull request, and say in the description
which sites and themes you looked at.

## Pull requests

- One concern per pull request.
- Say what you changed and why; if it's a selector fix, say what was leaking.
- `npm run check` should be green.
- Be kind in review threads. See the [Code of Conduct](CODE_OF_CONDUCT.md).

## Reporting bugs

Use the issue templates. For a broken disguise the useful details are: the site, the
theme, the browser and version, and a screenshot with anything private cropped out.

Security issues go to [SECURITY.md](SECURITY.md) instead, not to the public tracker.

## Scope

Some things this project deliberately won't do:

- **Phone home.** No analytics, no telemetry, no update pings, no exceptions. There
  is a test asserting the source contains no network calls, and it stays.
- **Add dependencies** for anything that can be written in a hundred lines.
- **Claim to be security software.** It's a visual disguise. Pull requests that
  describe it as protection against monitoring or forensics will be asked to
  reword.
