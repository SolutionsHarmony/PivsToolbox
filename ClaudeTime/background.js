// ClaudeTime/background.js — MV3 service worker.
//
// Owns: the toolbar badge, the cached lastUsage, a periodic poll alarm, and a
// no-tab fallback fetch (best-effort; may be Cloudflare-blocked).
//
// Message protocol (see also content.js):
//   content -> bg success: { type:'claudeTimeUsage', usage }
//   content -> bg failure: { type:'claudeTimeUsage', error:'<reason>' }
//   bg -> content refresh : { type:'claudeTimeRefresh' }
//
// Cache (chrome.storage.local): lastUsage = success usage object;
//                               orgId = working org uuid (managed by UsageFetch).

'use strict';

importScripts('usage-client.js', 'usage-fetch.js');

var STALE_MS = 30 * 60 * 1000; // 30 minutes
var POLL_PERIOD_MIN = 10;

// Badge colors per 5-hour utilization.
var COLOR_GREEN = '#30a46c';   // < 70
var COLOR_ORANGE = '#f5a623';  // 70-89
var COLOR_RED = '#e5484d';     // >= 90
var COLOR_GRAY = '#888';       // no data / signed out / stale

function colorForPct(pct) {
  if (pct >= 90) return COLOR_RED;
  if (pct >= 70) return COLOR_ORANGE;
  return COLOR_GREEN;
}

function pad2(n) { return n < 10 ? '0' + n : '' + n; }

function hhmm(epochMs) {
  var d = new Date(epochMs);
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

function storageGet(key) {
  return new Promise(function (resolve) {
    try {
      chrome.storage.local.get(key, function (res) { resolve(res ? res[key] : undefined); });
    } catch (e) { resolve(undefined); }
  });
}

function storageSet(obj) {
  return new Promise(function (resolve) {
    try {
      chrome.storage.local.set(obj, function () { resolve(); });
    } catch (e) { resolve(); }
  });
}

// Read lastUsage and paint the badge text/color/title accordingly.
async function applyBadge() {
  var usage = await storageGet('lastUsage');

  if (!usage || !usage.fiveHour || typeof usage.fiveHour.pct !== 'number') {
    // No data — likely never fetched or signed out.
    chrome.action.setBadgeText({ text: '–' }); // en dash
    chrome.action.setBadgeBackgroundColor({ color: COLOR_GRAY });
    chrome.action.setTitle({ title: 'Claude Time: open claude.ai and sign in to see your usage.' });
    return;
  }

  var fivePct = usage.fiveHour.pct;
  var weekPct = (usage.weekly && typeof usage.weekly.pct === 'number') ? usage.weekly.pct : 0;
  var fetchedAt = usage.fetchedAt || 0;
  var stale = !fetchedAt || (Date.now() - fetchedAt) > STALE_MS;

  chrome.action.setBadgeText({ text: String(fivePct) });
  chrome.action.setBadgeBackgroundColor({ color: stale ? COLOR_GRAY : colorForPct(fivePct) });

  var asOf = fetchedAt ? hhmm(fetchedAt) : '—';
  var title = '5-hour: ' + fivePct + '% · 7-day: ' + weekPct + '% · as of ' + asOf;
  if (stale) title += ' (stale)';
  chrome.action.setTitle({ title: title });
}

// Handle messages from content scripts and the popup.
chrome.runtime.onMessage.addListener(function (msg) {
  if (!msg) return;
  // Popup-open nudge: trigger an immediate poll. Fresh data lands in
  // chrome.storage.local, which the popup watches via storage.onChanged.
  if (msg.type === 'claudeTimePoll') {
    poll();
    return;
  }
  if (msg.type !== 'claudeTimeUsage') return;
  if (msg.usage) {
    storageSet({ lastUsage: msg.usage }).then(applyBadge);
  } else {
    // Failure (e.g. signed out) — keep showing last-known/cached data.
    applyBadge();
  }
  // No async sendResponse; do not return true.
});

// Best-effort direct fetch from the service worker (no content script involved).
// May be Cloudflare-blocked; failures are silent (just log) and we keep cache.
async function directFetch() {
  try {
    var result = await self.UsageFetch.getUsage();
    if (result && result.usage) {
      await storageSet({ lastUsage: result.usage });
      await applyBadge();
    } else {
      console.log('[ClaudeTime] background fallback fetch failed:', result && result.error);
    }
  } catch (e) {
    console.log('[ClaudeTime] background fallback fetch threw:', e && e.message);
  }
}

// Poll: prefer an open claude.ai tab (robust path); else direct fetch fallback.
async function poll() {
  var tabs = [];
  try {
    tabs = await chrome.tabs.query({ url: 'https://claude.ai/*' });
  } catch (e) {
    tabs = [];
  }

  if (tabs && tabs.length) {
    // Ask one tab to refresh; it reports back via onMessage. A tab that was
    // already open when the extension loaded has NO content script yet (Chrome
    // only injects on navigation/reload), so this message has no receiver and
    // rejects with "Could not establish connection". Use the callback form and
    // check lastError (a synchronous try/catch can't catch the promise
    // rejection), then fall back to a direct fetch so we still get data.
    chrome.tabs.sendMessage(tabs[0].id, { type: 'claudeTimeRefresh' }, function () {
      if (chrome.runtime.lastError) directFetch();
    });
    return;
  }

  // No open tab: direct fetch fallback.
  directFetch();
}

chrome.runtime.onInstalled.addListener(function () {
  try {
    chrome.alarms.create('poll', { periodInMinutes: POLL_PERIOD_MIN });
  } catch (e) { /* ignore */ }
  poll();
  applyBadge();
});

chrome.runtime.onStartup.addListener(function () {
  poll();
  applyBadge();
});

chrome.alarms.onAlarm.addListener(function (alarm) {
  if (alarm && alarm.name === 'poll') poll();
});
