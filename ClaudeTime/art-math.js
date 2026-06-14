(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.ArtMath = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function frameIndex(pct, n) {
    if (!(n > 0)) return -1;               // no frames -> caller uses default
    if (typeof pct !== 'number' || !isFinite(pct)) pct = 0;
    pct = Math.max(0, Math.min(100, pct));
    return Math.round((pct / 100) * (n - 1));
  }
  function reorder(arr, from, to) {
    var copy = Array.prototype.slice.call(arr || []);
    if (from < 0 || from >= copy.length || to < 0 || to >= copy.length) return copy;
    var item = copy.splice(from, 1)[0];
    copy.splice(to, 0, item);
    return copy;
  }
  return { frameIndex: frameIndex, reorder: reorder };
});
