// ClaudeTime/content.js — runs inside open claude.ai tabs (document_idle).
//
// This is the robust fetch path: requests issued here look identical to the
// site's own, so they pass Cloudflare / CSRF. It fetches usage via the shared
// UsageFetch module and reports the result to the background service worker.
//
// Message protocol (see also background.js):
//   content -> bg success: { type:'claudeTimeUsage', usage }
//   content -> bg failure: { type:'claudeTimeUsage', error:'<reason>' }
//   bg -> content refresh : { type:'claudeTimeRefresh' }
//
// Everything is wrapped in try/catch — we never throw to the page.
(function () {
  'use strict';

  // Debounce window for the best-effort "refresh after a response" observer.
  var OBSERVE_DEBOUNCE_MS = 5000;
  // Minimum gap between observer-triggered fetches, so an active chat (which
  // mutates the DOM constantly) can't spam the usage endpoint. Initial load and
  // explicit background refreshes bypass this throttle.
  var OBSERVE_THROTTLE_MS = 60000;
  var lastObserverFetch = 0;

  function report(result) {
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) return;
      if (result && result.usage) {
        chrome.runtime.sendMessage({ type: 'claudeTimeUsage', usage: result.usage });
      } else {
        chrome.runtime.sendMessage({
          type: 'claudeTimeUsage',
          error: (result && result.error) || 'unknown'
        });
      }
    } catch (e) {
      // Background may be asleep / context invalidated — ignore.
    }
  }

  async function refresh() {
    try {
      if (!self.UsageFetch || !self.UsageFetch.getUsage) return;
      var result = await self.UsageFetch.getUsage();
      report(result);
    } catch (e) {
      report({ error: 'content-exception' });
    }
  }

  // Listen for refresh requests from the background poller.
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener(function (msg) {
        try {
          if (msg && msg.type === 'claudeTimeRefresh') refresh();
        } catch (e) { /* ignore */ }
        // Not using sendResponse; return nothing (synchronous, no open port).
      });
    }
  } catch (e) { /* ignore */ }

  // Best-effort: re-fetch a short while after the conversation DOM changes
  // (i.e. a response likely finished streaming). We do NOT try to precisely
  // detect "response finished" — that DOM heuristic is brittle and the
  // alarm-based poll + popup-open already cover freshness. A coarse debounced
  // observer on the body subtree is enough; the debounce keeps it cheap.
  function installObserver() {
    try {
      if (typeof MutationObserver === 'undefined' || !document.body) return;
      var timer = null;
      var observer = new MutationObserver(function () {
        if (timer) clearTimeout(timer);
        timer = setTimeout(function () {
          timer = null;
          var now = Date.now();
          if (now - lastObserverFetch < OBSERVE_THROTTLE_MS) return;
          lastObserverFetch = now;
          refresh();
        }, OBSERVE_DEBOUNCE_MS);
      });
      observer.observe(document.body, { childList: true, subtree: true });
    } catch (e) { /* ignore */ }
  }

  // Initial fetch on load, plus the observer.
  try {
    refresh();
    installObserver();
  } catch (e) { /* ignore */ }
})();
