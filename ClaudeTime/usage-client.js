// ClaudeTime/usage-client.js — pure normalizer for the claude.ai usage API.
//
// Source endpoint: GET https://claude.ai/api/organizations/{orgId}/usage
// (read with the logged-in sessionKey cookie). The raw payload looks like:
//   {
//     "five_hour":  { "utilization": 21.0, "resets_at": "<ISO 8601>" },
//     "seven_day":  { "utilization":  6.0, "resets_at": "<ISO 8601>" },
//     ...other buckets that may be null...
//   }
//
// Field mapping:
//   five_hour.utilization  -> fiveHour.pct  (ALREADY a percent 0-100; do NOT divide)
//   five_hour.resets_at    -> fiveHour.resetAt (epoch ms via Date.parse)
//   seven_day.utilization  -> weekly.pct    (ALREADY a percent 0-100)
//   seven_day.resets_at    -> weekly.resetAt (epoch ms via Date.parse)
//
// This module is pure transformation: no fetching, no DOM, no clock calls. The
// caller stamps fetchedAt. Works in the browser (global UsageClient) and under
// Node's test runner (module.exports).
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.UsageClient = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function bucket(b) {
    // Returns { pct, resetAt } if utilization is a finite number, else null.
    if (!b || typeof b !== 'object') return null;
    var u = b.utilization;
    if (typeof u !== 'number' || !isFinite(u)) return null;
    var pct = Math.max(0, Math.min(100, Math.round(u)));
    var resetAt = Date.parse(b.resets_at);
    return { pct: pct, resetAt: resetAt };
  }

  function normalize(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var fiveHour = bucket(raw.five_hour);
    var weekly = bucket(raw.seven_day);
    if (!fiveHour || !weekly) return null;
    return { fiveHour: fiveHour, weekly: weekly };
  }

  return { normalize: normalize };
});
