// ClaudeTime/time-math.js — week-progress math.
//
// Reset times now come straight from the claude.ai API (weekly `resets_at`), so
// there is no manual weekday/time anchor or DST handling anymore. Given the
// weekly reset instant, the window is simply the 7 days ending at that instant.
//
// Works in the browser (global TimeMath) and under Node's test runner.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.TimeMath = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var WEEK_MS = 7 * 24 * 3600 * 1000;

  // Fraction (0..1) of the current weekly window that has elapsed at nowMs,
  // given the weekly reset instant (epoch ms). Window start = reset - 7 days.
  function weekFraction(nowMs, weeklyResetMs) {
    if (!isFinite(nowMs) || !isFinite(weeklyResetMs)) return 0;
    var start = weeklyResetMs - WEEK_MS;
    var f = (nowMs - start) / WEEK_MS;
    return Math.max(0, Math.min(1, f));
  }

  return { weekFraction: weekFraction, WEEK_MS: WEEK_MS };
});
