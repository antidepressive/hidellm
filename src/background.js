// background.js: the service worker.
//
// Chrome starts this on an event and kills it when idle, so nothing may live in
// module scope between events; anything durable goes to chrome.storage. It owns
// every mutation: the popup and the options page only read settings and post
// messages here. That's deliberate: a popup closes the instant you click away,
// and an injection kicked off from a closing popup can be cut off halfway.
//
// Responsibilities:
//   - re-apply the disguise whenever a supported tab finishes loading
//   - the toggle and peek hotkeys
//   - the message API used by the popup and options page
//   - ending a peek when its timer runs out
//   - keeping the toolbar badge in sync

importScripts(
  '/src/core/ui.js',
  '/src/core/themes.js',
  '/src/core/sites.js',
  '/src/core/settings.js',
  '/src/core/engine.js'
);

const PEEK_KEY = 'peekTabs';
const PEEK_ALARM = 'hidellm-peek:';

// ─── badge ───
// A quiet "ON" on the toolbar icon: the disguise is a security-ish feature and
// silent state is how people get caught out by it.
async function refreshBadge(settings) {
  const s = settings || (await HL.readSettings());
  try {
    await chrome.action.setBadgeText({ text: s.enabled ? 'ON' : '' });
    await chrome.action.setBadgeBackgroundColor({ color: '#eb3c44' });
    await chrome.action.setTitle({
      title: s.enabled ? 'HideLLM: disguise active' : 'HideLLM: disguise off',
    });
  } catch { /* action API unavailable during shutdown */ }
}

// ─── peek bookkeeping ───
// A peek reveals one tab without changing the global switch, and expires on its
// own so a glance never turns into an afternoon of running undisguised.
async function readPeeks() {
  const data = await chrome.storage.local.get(PEEK_KEY);
  return Array.isArray(data[PEEK_KEY]) ? data[PEEK_KEY] : [];
}

async function setPeek(tabId, on, seconds) {
  const peeks = new Set(await readPeeks());
  if (on) peeks.add(tabId);
  else peeks.delete(tabId);
  await chrome.storage.local.set({ [PEEK_KEY]: [...peeks] });

  const alarm = PEEK_ALARM + tabId;
  await chrome.alarms.clear(alarm);
  if (!on || seconds <= 0) return;

  // Two timers on purpose. chrome.alarms survives the worker being suspended, but
  // Chrome clamps its delay to 30 seconds, so a 15-second peek would silently last
  // twice as long. A plain timer honours the real delay while the worker is awake,
  // which it will be for a short peek, and the alarm is the backstop for long ones.
  chrome.alarms.create(alarm, { delayInMinutes: Math.max(seconds, 30) / 60 });
  setTimeout(() => endPeek(tabId), seconds * 1000);
}

// Put the disguise back on a tab whose peek has run out.
async function endPeek(tabId) {
  if (!(await isPeeking(tabId))) return; // already restored by hand
  await setPeek(tabId, false, 0);
  try {
    const tab = await chrome.tabs.get(tabId);
    await syncTab(tabId, tab.url);
  } catch { /* tab is gone */ }
}

async function isPeeking(tabId) {
  return (await readPeeks()).includes(tabId);
}

// ─── the one place a tab gets its disguise ───
// Honours the master switch, the per-site opt-out and any active peek, so every
// entry point (navigation, hotkey, popup) ends up with the same answer.
async function syncTab(tabId, url, settings) {
  const s = settings || (await HL.readSettings());
  const site = HL.getSiteKey(url);
  if (!site) return false;

  const shouldDisguise = s.enabled && HL.siteEnabled(s, site) && !(await isPeeking(tabId));
  if (shouldDisguise) {
    await HL.applyToTab(tabId, site, s);
  } else {
    await HL.removeFromTab(tabId);
  }
  return shouldDisguise;
}

// ─── navigation ───
// Injected CSS and script are wiped by every navigation, so re-apply on load.
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  const site = HL.getSiteKey(tab && tab.url);
  if (!site) return;

  const settings = await HL.readSettings();
  if (!settings.enabled || !HL.siteEnabled(settings, site)) return;
  // A reload is a fresh page: end any peek that was riding on the old one.
  await setPeek(tabId, false, 0);
  try {
    await HL.applyToTab(tabId, site, settings);
  } catch { /* tab navigated away again before we got there */ }
});

// ─── hotkeys ───
chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const settings = await HL.readSettings();

  if (command === 'toggle-disguise') {
    await setEnabled(!settings.enabled);
    return;
  }

  if (command === 'toggle-peek') {
    if (!tab || !HL.getSiteKey(tab.url) || !settings.enabled) return;
    const on = !(await isPeeking(tab.id));
    await setPeek(tab.id, on, settings.peekSeconds);
    await syncTab(tab.id, tab.url, settings);
  }
});

// A peek timed out while the worker was asleep. Put the disguise back.
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith(PEEK_ALARM)) return;
  await endPeek(Number(alarm.name.slice(PEEK_ALARM.length)));
});

// ─── the master switch ───
async function setEnabled(enabled) {
  const settings = await HL.writeSettings({ enabled });
  await chrome.storage.local.set({ [PEEK_KEY]: [] });

  if (enabled) {
    if (settings.applyToAllTabs) {
      await HL.applyToAll(settings);
    } else {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) await syncTab(tab.id, tab.url, settings).catch(() => {});
    }
  } else {
    await HL.removeFromAll();
  }
  await refreshBadge(settings);
  return settings;
}

// Re-apply the current settings everywhere they're already showing, so a theme
// change lands live instead of on the next reload.
async function refreshAll(settings) {
  const s = settings || (await HL.readSettings());
  if (!s.enabled) {
    await HL.removeFromAll();
    return 0;
  }
  const targets = await HL.supportedTabs(s);
  let count = 0;
  for (const { tab, site } of targets) {
    try {
      if (await isPeeking(tab.id)) continue;
      await HL.applyToTab(tab.id, site, s);
      count++;
    } catch { /* skip this tab */ }
  }
  // Sites the user just switched off keep their disguise until we strip it.
  const state = await HL.readTabState();
  for (const id of Object.keys(state)) {
    if (!targets.some(({ tab }) => String(tab.id) === id)) {
      try { await HL.removeFromTab(Number(id)); } catch { /* skip */ }
    }
  }
  return count;
}

// ─── message API (popup + options page) ───
// Every handler returns a plain object; errors come back as { error } rather than
// rejecting, because a rejected sendMessage surfaces as an opaque runtime error.
const HANDLERS = {
  async getState(_msg, sender) {
    const settings = await HL.readSettings();
    let tab = null;
    try {
      [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    } catch { /* no window (options page in a detached context) */ }
    const site = tab ? HL.getSiteKey(tab.url) : null;
    return {
      settings,
      site,
      siteLabel: site ? HL.SITES[site].label : null,
      siteTested: site ? HL.SITES[site].tested !== false : null,
      siteAllowed: site ? HL.siteEnabled(settings, site) : null,
      tabId: tab ? tab.id : null,
      peeking: tab ? await isPeeking(tab.id) : false,
      disguised: tab ? !!(await HL.getTabRecord(tab.id)) : false,
      openTabs: (await HL.supportedTabs(settings)).length,
      version: chrome.runtime.getManifest().version,
    };
  },

  async setEnabled(msg) {
    return { settings: await setEnabled(msg.value === true) };
  },

  async updateSettings(msg) {
    const settings = await HL.writeSettings(msg.patch || {});
    await refreshAll(settings);
    await refreshBadge(settings);
    return { settings };
  },

  async togglePeek() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !HL.getSiteKey(tab.url)) return { error: 'unsupported' };
    const settings = await HL.readSettings();
    if (!settings.enabled) return { error: 'disabled' };
    const on = !(await isPeeking(tab.id));
    await setPeek(tab.id, on, settings.peekSeconds);
    await syncTab(tab.id, tab.url, settings);
    return { peeking: on, seconds: settings.peekSeconds };
  },

  async applyHere() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return { error: 'no-tab' };
    const site = HL.getSiteKey(tab.url);
    if (!site) return { error: 'unsupported' };
    const settings = await HL.readSettings();
    await setPeek(tab.id, false, 0);
    await HL.applyToTab(tab.id, site, settings);
    return { ok: true };
  },

  async openShortcuts() {
    await chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    return { ok: true };
  },

  async openOptions() {
    await chrome.runtime.openOptionsPage();
    return { ok: true };
  },
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handler = msg && HANDLERS[msg.type];
  if (!handler) return false;
  handler(msg, sender)
    .then(sendResponse)
    .catch((err) => sendResponse({ error: String((err && err.message) || err) }));
  return true; // keep the channel open for the async reply
});

// ─── lifecycle ───
chrome.tabs.onRemoved.addListener(async (tabId) => {
  await HL.forgetTab(tabId);
  await setPeek(tabId, false, 0);
});

chrome.runtime.onInstalled.addListener(async (details) => {
  // Write the defaults through the validator so storage always holds a complete
  // object, whatever version installed before this one.
  const settings = await HL.writeSettings({});
  await refreshBadge(settings);
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/options/options.html#welcome') });
  }
});

chrome.runtime.onStartup.addListener(() => refreshBadge());
