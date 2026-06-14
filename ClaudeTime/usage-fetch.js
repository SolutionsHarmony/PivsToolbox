// ClaudeTime/usage-fetch.js — shared fetch module for content.js + background.js.
//
// Responsibilities:
//   1. Discover the account-specific organization id (orgId) at runtime.
//   2. Fetch GET https://claude.ai/api/organizations/{orgId}/usage using the
//      logged-in sessionKey cookie (credentials:'include', same-origin to
//      claude.ai), normalize it via UsageClient.normalize, and stamp fetchedAt.
//   3. Cache the working orgId in chrome.storage.local; invalidate on failure.
//
// The org id is UNIQUE PER ACCOUNT and is never hardcoded. An account may have
// MORE THAN ONE org (personal + team), so discovery tries each org's /usage
// endpoint and keeps the FIRST one that normalize()s successfully.
//
// UMD wrapper (matches usage-client.js): exposes self.UsageFetch in the browser
// / service worker, and module.exports under Node. Must be require-able under
// Node with no chrome / self / fetch present (for static check + tests), so all
// runtime globals are accessed lazily and guarded.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.UsageFetch = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var BASE = 'https://claude.ai/api';

  // Resolve the normalizer from whichever environment we're in. Under Node
  // (tests) it's require()'d directly; in the browser/SW it's a global.
  function getNormalize() {
    if (typeof self !== 'undefined' && self.UsageClient && self.UsageClient.normalize) {
      return self.UsageClient.normalize;
    }
    if (typeof module !== 'undefined' && module.exports) {
      try { return require('./usage-client.js').normalize; } catch (e) { /* ignore */ }
    }
    if (typeof UsageClient !== 'undefined' && UsageClient.normalize) {
      return UsageClient.normalize;
    }
    return null;
  }

  // --- Pure, injectable org-selection helper (unit-tested) -------------------
  // Given a list of org uuids and an async usageFor(orgId) that resolves to a
  // normalized usage object (or null/throws on failure), return the FIRST org
  // that yields a valid normalized usage, as { orgId, usage }. Returns null if
  // none work. No globals touched — fully deterministic given its inputs.
  async function pickWorkingOrg(orgIds, usageFor) {
    if (!Array.isArray(orgIds)) return null;
    for (var i = 0; i < orgIds.length; i++) {
      var id = orgIds[i];
      if (!id) continue;
      var usage = null;
      try {
        usage = await usageFor(id);
      } catch (e) {
        usage = null;
      }
      if (usage) return { orgId: id, usage: usage };
    }
    return null;
  }

  // --- chrome.storage.local helpers (Promise-wrapped, guarded) ---------------
  function hasChromeStorage() {
    return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
  }

  function storageGet(key) {
    return new Promise(function (resolve) {
      if (!hasChromeStorage()) return resolve(undefined);
      try {
        chrome.storage.local.get(key, function (res) {
          resolve(res ? res[key] : undefined);
        });
      } catch (e) { resolve(undefined); }
    });
  }

  function storageSet(obj) {
    return new Promise(function (resolve) {
      if (!hasChromeStorage()) return resolve();
      try {
        chrome.storage.local.set(obj, function () { resolve(); });
      } catch (e) { resolve(); }
    });
  }

  function storageRemove(key) {
    return new Promise(function (resolve) {
      if (!hasChromeStorage()) return resolve();
      try {
        chrome.storage.local.remove(key, function () { resolve(); });
      } catch (e) { resolve(); }
    });
  }

  // --- Network helpers -------------------------------------------------------
  function getFetch() {
    if (typeof fetch !== 'undefined') return fetch;
    if (typeof self !== 'undefined' && self.fetch) return self.fetch;
    return null;
  }

  // Fetch + normalize one org's usage. Resolves to a normalized usage object
  // (with fetchedAt stamped) or null. Throws are caught by the caller.
  async function fetchUsageForOrg(orgId) {
    var f = getFetch();
    var normalize = getNormalize();
    if (!f || !normalize) return null;
    var resp;
    try {
      resp = await f(BASE + '/organizations/' + encodeURIComponent(orgId) + '/usage', {
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      });
    } catch (e) {
      return null;
    }
    if (!resp || !resp.ok) return null;
    var raw;
    try {
      raw = await resp.json();
    } catch (e) {
      return null;
    }
    var norm = normalize(raw);
    if (!norm) return null;
    norm.fetchedAt = Date.now();
    return norm;
  }

  // Fetch the list of org uuids for the logged-in account. Returns [] on any
  // failure (signed out, Cloudflare block, network error).
  async function fetchOrgIds() {
    var f = getFetch();
    if (!f) return [];
    var resp;
    try {
      resp = await f(BASE + '/organizations', {
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      });
    } catch (e) {
      return [];
    }
    if (!resp || !resp.ok) return [];
    var arr;
    try {
      arr = await resp.json();
    } catch (e) {
      return [];
    }
    if (!Array.isArray(arr)) return [];
    return arr
      .map(function (o) { return o && o.uuid; })
      .filter(function (u) { return typeof u === 'string' && u; });
  }

  // --- Public entry point ----------------------------------------------------
  // getUsage() — discover/use orgId, fetch + normalize usage, manage cache.
  // Returns { usage: { fiveHour, weekly, fetchedAt } } on success, or
  // { error: '<reason>' } on failure. Never throws.
  async function getUsage() {
    try {
      var normalize = getNormalize();
      if (!normalize) return { error: 'normalizer-unavailable' };
      if (!getFetch()) return { error: 'fetch-unavailable' };

      // 1. Try the cached orgId first.
      var cachedOrgId = await storageGet('orgId');
      if (cachedOrgId) {
        var usage = await fetchUsageForOrg(cachedOrgId);
        if (usage) return { usage: usage };
        // Cached org no longer works (404 / signed out / normalize null):
        // invalidate so we re-discover below.
        await storageRemove('orgId');
      }

      // 2. Discover: list orgs, then pick the first that yields valid usage.
      var orgIds = await fetchOrgIds();
      if (!orgIds.length) return { error: 'no-orgs' };

      var picked = await pickWorkingOrg(orgIds, fetchUsageForOrg);
      if (!picked) return { error: 'no-usage' };

      await storageSet({ orgId: picked.orgId });
      return { usage: picked.usage };
    } catch (e) {
      return { error: 'unexpected:' + (e && e.message ? e.message : 'error') };
    }
  }

  return {
    getUsage: getUsage,
    // Exposed for unit testing / reuse:
    pickWorkingOrg: pickWorkingOrg,
    fetchUsageForOrg: fetchUsageForOrg,
    fetchOrgIds: fetchOrgIds
  };
});
