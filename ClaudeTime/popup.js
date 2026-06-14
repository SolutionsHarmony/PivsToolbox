// ClaudeTime/popup.js — the "road race" popup, driven entirely by the cached
// `lastUsage` written to chrome.storage.local by the background/content layer.
//
//   lastUsage = {
//     fiveHour: { pct, resetAt },
//     weekly:   { pct, resetAt },
//     fetchedAt
//   }
//   pct = integer 0..100 ; resetAt/fetchedAt = epoch ms
//
// Custom progression art (optional) lives in IndexedDB via ArtStore. The popup
// loads ONLY time-math.js + this file — no store.js, no usage-math.js, no
// window.claudeUsage shims.
(function () {
  'use strict';

  var SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var WEEK_MS = 7 * 24 * 3600 * 1000;
  var STALE_MS = 30 * 60 * 1000;

  var ICON_CONFIG = {
    clock:  { glyph: '🍪' },
    person: { glyph: '🐻' },
    car:    { glyph: '🥛' }
  };

  // Packaged DEFAULT art: each object scrubs a bundled WEBM (alpha) to the frame
  // matching its value % (0% -> first frame, 100% -> last). The full->empty /
  // slim->large progression is baked into the clip by the art author.
  var DEFAULT_VIDEO = {
    clock:  'assets/cookies_on_plate_lowering_600px_tp.webm',
    person: 'assets/purple_bear_slim_to_large_final_600px_tp.webm',
    car:    'assets/milk_full_to_empty_600px_tp.webm'
  };

  // Special shared "Token Monster is asleep" image — shown for the person object
  // when the 7-day quota is fully used but the week hasn't reset yet. It overrides
  // EVERY other art source (custom series/video and the default), so it looks the
  // same no matter what media is linked. See isBedtime() + resolveArt().
  var BED_IMAGE = 'assets/token-monster-bed.png';

  // True when the weekly (7-day) usage is maxed out but there's still time on the
  // weekly reset — i.e. the monster has eaten everything and is sleeping it off.
  function isBedtime() {
    var w = (state.usage && state.usage.weekly) || null;
    if (!w) return false;
    var pct = (typeof w.pct === 'number') ? w.pct : 0;
    return pct >= 100 && isFinite(w.resetAt) && Date.now() < w.resetAt;
  }

  function roadPadding(road) {
    var cs = window.getComputedStyle(road);
    var pad = parseFloat(cs.paddingLeft);
    return isFinite(pad) ? pad : 0;
  }

  // Show the themed emoji glyph (final fallback tier) in an icon element.
  function showGlyph(el, cfg) {
    el.textContent = '';
    var span = document.createElement('span');
    span.className = 'glyph';
    span.textContent = cfg.glyph;
    el.appendChild(span);
  }

  // Build the <img> for an icon (once) and point it at `src`. A null/empty src or
  // a broken image shows the emoji glyph instead.
  function ensureIconImage(el, cfg, src) {
    if (!src) { el.classList.remove('bed-edge'); showGlyph(el, cfg); return; }
    // The bed image is right-edge-anchored (see .icon.bed-edge); everything else
    // uses its normal centred position.
    el.classList.toggle('bed-edge', src === BED_IMAGE);
    var img = el.querySelector('img');
    if (!img) {
      el.textContent = '';
      img = document.createElement('img');
      img.alt = '';
      img.onerror = function () { showGlyph(el, cfg); };
      el.appendChild(img);
    }
    if (img.getAttribute('src') !== src) img.setAttribute('src', src);
  }

  // Place an icon at `fraction` (0..1) along the track. Position is independent
  // of art: it always uses the real fraction.
  function placeIcon(el, fraction, pad, trackWidth) {
    if (!isFinite(fraction)) fraction = 0; // NaN/Infinity → 0 (avoid "NaNpx")
    var f = Math.max(0, Math.min(1, fraction));
    el.style.left = (pad + f * trackWidth) + 'px';
  }

  // Position an icon and set its art. Position comes from the real fraction; the
  // art frame comes from the object's value % (`artPct`) resolved against its
  // current art (custom series/video, else the packaged default video).
  function positionIcon(id, fraction, artPct, pad, trackWidth) {
    var el = document.getElementById(id);
    if (!el) return;
    var cfg = ICON_CONFIG[id];
    placeIcon(el, fraction, pad, trackWidth);
    resolveArt(id, artPct, function (src) { ensureIconImage(el, cfg, src); });
  }

  function renderHashes(road, pad, trackWidth, startWeekday) {
    var old = road.querySelectorAll('.hash');
    for (var i = 0; i < old.length; i++) old[i].remove();

    for (var d = 0; d < 7; d++) {
      var f = d / 6; // 7 marks evenly spaced across the track (0..1)
      var hash = document.createElement('div');
      hash.className = 'hash';
      hash.style.left = (pad + f * trackWidth) + 'px';

      var tick = document.createElement('div');
      tick.className = 'tick';
      hash.appendChild(tick);

      var label = document.createElement('div');
      label.className = 'label';
      label.textContent = SHORT_DAYS[(startWeekday + d) % 7];
      hash.appendChild(label);

      road.appendChild(hash);
    }
  }

  // ---- formatting helpers ----
  function pad2(n) { return String(n).padStart(2, '0'); }

  // Format a time as 12-hour "h:MM AM/PM" (default) or 24-hour "HH:MM".
  function fmtTime(epochMs, use24h) {
    var d = new Date(epochMs);
    var m = pad2(d.getMinutes());
    if (use24h) return pad2(d.getHours()) + ':' + m;
    var h = d.getHours();
    var ampm = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12; if (h12 === 0) h12 = 12;
    return h12 + ':' + m + ' ' + ampm;
  }

  function fmtDateTime(epochMs, use24h) {
    var d = new Date(epochMs);
    var day = SHORT_DAYS[d.getDay()];
    var date = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    return day + ' ' + date + ' ' + fmtTime(epochMs, use24h);
  }

  // ---- storage helpers (callback API wrapped in a Promise) ----
  function storageGet(keys) {
    return new Promise(function (resolve) {
      try {
        chrome.storage.local.get(keys, function (res) { resolve(res || {}); });
      } catch (e) { resolve({}); }
    });
  }
  function storageSet(obj) {
    return new Promise(function (resolve, reject) {
      try {
        chrome.storage.local.set(obj, function () {
          var err = chrome.runtime && chrome.runtime.lastError;
          if (err) reject(err); else resolve();
        });
      } catch (e) { reject(e); }
    });
  }
  function storageRemove(keys) {
    return new Promise(function (resolve) {
      try {
        chrome.storage.local.remove(keys, function () { resolve(); });
      } catch (e) { resolve(); }
    });
  }

  // ---- state ----
  var state = {
    usage: null,    // lastUsage object
    use24h: false,  // time format: false = 12h AM/PM, true = 24h
    countdownMode: '5h', // top-bar countdown target: '5h' | 'weekly' | 'both' | 'none'
    toolbarScale: 1, // whole-popup zoom (Toolbar Size stepper); aspect ratio preserved
    // Per-object progression art loaded from IndexedDB (via ArtStore). Each entry:
    //   { mode:'series', urls:[objectURL...] }
    //   { mode:'video',  blob:Blob, videoUrl:objectURL }
    //   { mode:'default' }
    art: { clock: { mode: 'default' }, person: { mode: 'default' }, car: { mode: 'default' } },
    // In-memory working list of frame Blobs per object for series mode, used by
    // the settings UI (state.art only retains object URLs, not the source Blobs).
    seriesDraft: { clock: [], person: [], car: [] },
    // On-road size multiplier per object (Size +/- buttons), persisted as artSizes.
    sizes: { clock: 2.5, person: 3, car: 1 }
  };

  var SIZE_DEFAULTS = { clock: 2.5, person: 3, car: 1 };
  var SIZE_STEP = 0.25, SIZE_MIN = 0.25, SIZE_MAX = 8;

  // Whole-popup "Toolbar Size" zoom. Browser action popups are capped at ~800x600
  // and the app body is 720px, so the upper bound stays just inside that (no clip);
  // shrinking has the full range.
  var TOOLBAR_STEP = 0.1, TOOLBAR_MIN = 0.5, TOOLBAR_MAX = 1.1;

  // Scale the entire popup window (aspect ratio preserved). CSS `zoom` makes the
  // popup hug the zoomed body, so the window itself grows/shrinks.
  function applyToolbarScale() {
    var s = (typeof state.toolbarScale === 'number' && state.toolbarScale > 0) ? state.toolbarScale : 1;
    document.body.style.zoom = String(s);
  }

  // Wire the top "Toolbar [ - ] Size [ + ]" stepper (scales the whole window).
  function wireToolbarSize() {
    var btns = document.querySelectorAll('.size-btn[data-toolbar]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var dir = parseFloat(this.getAttribute('data-toolbar')) || 0;
        var cur = (typeof state.toolbarScale === 'number') ? state.toolbarScale : 1;
        var next = Math.max(TOOLBAR_MIN, Math.min(TOOLBAR_MAX, Math.round((cur + dir * TOOLBAR_STEP) * 100) / 100));
        state.toolbarScale = next;
        applyToolbarScale();
        storageSet({ toolbarScale: next });
      });
    }
  }

  // Apply each object's saved size multiplier to its road icon (CSS --obj-scale).
  function applySizes() {
    ART_IDS.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.style.setProperty('--obj-scale', String(state.sizes[id] || 1));
    });
  }

  // Wire the per-object "[ - ] Size [ + ]" steppers in each settings section.
  function wireSizeControls() {
    var btns = document.querySelectorAll('.size-btn[data-obj]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function (e) {
        e.preventDefault();   // don't toggle the <details> the button sits in
        e.stopPropagation();
        var id = this.getAttribute('data-obj');
        var dir = parseFloat(this.getAttribute('data-dir')) || 0;
        var cur = (typeof state.sizes[id] === 'number') ? state.sizes[id] : 1;
        var next = Math.max(SIZE_MIN, Math.min(SIZE_MAX, Math.round((cur + dir * SIZE_STEP) * 100) / 100));
        state.sizes[id] = next;
        applySizes();
        storageSet({ artSizes: state.sizes });
      });
    }
  }

  // Object URLs created purely for the settings thumbnail strips; revoked before
  // each rebuild so reopening/editing settings never leaks. Keyed by objectId.
  var thumbUrls = { clock: [], person: [], car: [] };

  var SERIES_MAX_BYTES = 2 * 1024 * 1024;   // 2 MB per image
  var VIDEO_MAX_BYTES = 25 * 1024 * 1024;   // 25 MB per video

  // ---- custom progression art (series / video) -------------------------------
  var ART_IDS = ['clock', 'person', 'car'];

  // Per-object hidden <video>+<canvas> scratch so all three icons can scrub their
  // videos independently. (A single shared element made simultaneous video objects
  // clobber each other — one would stick on a stale frame.) Keyed by objectId;
  // each holds its own seek token so a newer seek supersedes a stale one.
  var scratch = {}; // id -> { video, canvas, src, token }
  function ensureScratch(id) {
    var s = scratch[id];
    if (s) return s;
    var v = document.createElement('video');
    v.muted = true; v.setAttribute('playsinline', ''); v.preload = 'auto'; v.setAttribute('hidden', '');
    var c = document.createElement('canvas'); c.setAttribute('hidden', '');
    var host = document.body || document.documentElement;
    host.appendChild(v); host.appendChild(c);
    s = scratch[id] = { video: v, canvas: c, src: null, token: 0 };
    return s;
  }

  // Active test-cycle state (the "walk" animation); null while idle. See
  // runTestCycle() for the phase machine.
  var testCycle = null;

  // Revoke any object URLs an art entry created, so reloading doesn't leak.
  function revokeArtUrls(entry) {
    if (!entry) return;
    try {
      if (entry.urls) for (var i = 0; i < entry.urls.length; i++) URL.revokeObjectURL(entry.urls[i]);
      if (entry.videoUrl) URL.revokeObjectURL(entry.videoUrl);
    } catch (e) { /* ignore */ }
  }

  // Load each object's custom art record from IndexedDB, build fresh object URLs,
  // revoke the previous ones, then re-render. Always resolves (never throws).
  function loadArt() {
    if (typeof window.ArtStore === 'undefined') { render(); return Promise.resolve(); }
    var tasks = ART_IDS.map(function (id) {
      return window.ArtStore.getArt(id).then(function (rec) {
        var next;
        if (rec && rec.mode === 'series' && rec.frames && rec.frames.length) {
          var urls = [];
          for (var i = 0; i < rec.frames.length; i++) {
            try { urls.push(URL.createObjectURL(rec.frames[i])); } catch (e) { /* skip bad blob */ }
          }
          next = { mode: 'series', urls: urls };
        } else if (rec && rec.mode === 'video' && rec.blob) {
          var vurl = null;
          try { vurl = URL.createObjectURL(rec.blob); } catch (e) { vurl = null; }
          next = vurl ? { mode: 'video', blob: rec.blob, videoUrl: vurl } : { mode: 'default' };
        } else {
          next = { mode: 'default' };
        }
        revokeArtUrls(state.art[id]); // release the previous entry's URLs first
        state.art[id] = next;
      }).catch(function () {
        revokeArtUrls(state.art[id]);
        state.art[id] = { mode: 'default' };
      });
    });
    return Promise.all(tasks).then(function () { render(); }, function () { render(); });
  }

  // Resolve the art src for an object at its value % and hand it to `cb`. Series
  // mode -> nearest frame image; otherwise scrub a video (custom upload when set,
  // else the packaged default) to (duration * pct/100). Any failure -> cb(null),
  // which falls back to the emoji glyph. THE ART RULE: 0% -> first, 100% -> last.
  function resolveArt(id, artPct, cb) {
    var entry = (state.art && state.art[id]) || { mode: 'default' };
    try {
      // Shared override: the asleep Token Monster beats every other art source.
      if (id === 'person' && isBedtime()) { cb(BED_IMAGE); return; }
      if (entry.mode === 'series' && entry.urls && entry.urls.length) {
        var i = window.ArtMath.frameIndex(artPct, entry.urls.length);
        cb(i < 0 ? null : entry.urls[i]);
        return;
      }
      var src = (entry.mode === 'video' && entry.videoUrl) ? entry.videoUrl : DEFAULT_VIDEO[id];
      seekObjectVideo(id, src, artPct, cb);
    } catch (e) {
      cb(null);
    }
  }

  // Seek object `id`'s dedicated <video> to (duration * pct/100), draw the frame
  // to its <canvas>, and return a data: URL via cb. A newer seek on the same
  // object supersedes a stale one (it abandons silently). Any failure -> cb(null).
  function seekObjectVideo(id, src, pct, cb) {
    var s = ensureScratch(id);
    var v = s.video, c = s.canvas;
    var myToken = ++s.token;
    var done = false, metaTimer = null;
    function superseded() { return myToken !== s.token; }
    function finish(out) { if (done) return; done = true; cleanup(); cb(out); }
    function cleanup() {
      v.removeEventListener('seeked', onSeeked);
      v.removeEventListener('error', onError);
      v.removeEventListener('loadedmetadata', onMeta);
      if (metaTimer !== null) { clearTimeout(metaTimer); metaTimer = null; }
    }
    function onError() { if (superseded()) { cleanup(); return; } finish(null); }
    function onSeeked() {
      if (superseded()) { cleanup(); return; }
      try {
        var W = v.videoWidth || 0, H = v.videoHeight || 0;
        if (!W || !H) { finish(null); return; }
        c.width = W; c.height = H;
        var ctx = c.getContext('2d');
        ctx.clearRect(0, 0, W, H);
        ctx.drawImage(v, 0, 0, W, H);
        finish(c.toDataURL('image/png'));
      } catch (e) { finish(null); }
    }
    function doSeek() {
      if (superseded()) { cleanup(); return; }
      var dur = v.duration;
      if (!isFinite(dur) || dur <= 0) { finish(null); return; }
      var p = (typeof pct === 'number' && isFinite(pct)) ? Math.max(0, Math.min(100, pct)) : 0;
      var t = dur * (p / 100);
      if (t >= dur) t = Math.max(0, dur - 0.001); // nudge below the end (decodable)
      try { v.currentTime = t; } catch (e) { finish(null); }
    }
    function onMeta() {
      if (superseded()) { cleanup(); return; }
      v.removeEventListener('loadedmetadata', onMeta);
      doSeek();
    }
    try {
      v.addEventListener('seeked', onSeeked);
      v.addEventListener('error', onError);
      if (s.src !== src) {
        s.src = src;
        v.addEventListener('loadedmetadata', onMeta);
        v.setAttribute('src', src);
        v.load();
        metaTimer = setTimeout(function () { if (!done && !superseded()) onError(); }, 4000);
      } else if (isFinite(v.duration) && v.duration > 0) {
        doSeek();
      } else {
        v.addEventListener('loadedmetadata', onMeta);
        metaTimer = setTimeout(function () { if (!done && !superseded()) onError(); }, 4000);
      }
    } catch (e) { finish(null); }
  }

  // Pre-load the default scratch videos so the first render doesn't blank/flicker.
  function warmDefaults() {
    ART_IDS.forEach(function (id) {
      var s = ensureScratch(id);
      if (s.src == null) {
        s.src = DEFAULT_VIDEO[id];
        s.video.setAttribute('src', DEFAULT_VIDEO[id]);
        try { s.video.load(); } catch (e) { /* ignore */ }
      }
    });
  }

  // ---- render ----
  function show(el, visible) { if (el) el.hidden = !visible; }

  function render() {
    var roadWrap = document.getElementById('road-wrap');
    var signedOut = document.getElementById('signed-out');
    var usage = state.usage;

    // Signed-out / no-data state.
    if (!usage || !usage.fiveHour || typeof usage.fiveHour.pct !== 'number') {
      show(roadWrap, false);
      show(signedOut, true);
      hideTip();
      return;
    }
    show(signedOut, false);
    show(roadWrap, true);

    var road = document.querySelector('.road');
    if (!road) return;

    var now = Date.now();
    var weekly = usage.weekly || {};
    var fiveHour = usage.fiveHour;

    var clockFraction = window.TimeMath.weekFraction(now, weekly.resetAt);
    var personFraction = (typeof weekly.pct === 'number' ? weekly.pct : 0) / 100;
    var carFraction = fiveHour.pct / 100;

    var pad = roadPadding(road);
    var trackWidth = road.clientWidth - 2 * pad;
    if (trackWidth < 0) trackWidth = 0;

    // Day hashes: window START weekday = reset - 7 days.
    var startWeekday = isFinite(weekly.resetAt)
      ? new Date(weekly.resetAt - WEEK_MS).getDay()
      : 0;
    renderHashes(road, pad, trackWidth, startWeekday);

    // Art percentage per object (which video frame to show): clock & person ride
    // the 7-day "All models" usage (weekly.pct); car rides the 5-hour usage.
    // Position is independent: clock = week-elapsed time, person/car = their usage.
    var weeklyPct = (typeof weekly.pct === 'number' ? weekly.pct : 0);
    positionIcon('clock', clockFraction, weeklyPct, pad, trackWidth);
    positionIcon('person', personFraction, weeklyPct, pad, trackWidth);
    positionIcon('car', carFraction, fiveHour.pct, pad, trackWidth);

    // Left status: "Day, YYYY-MM-DD  h:MM AM/PM" (+ stale flag). "Token Monster"
    // is a separate centered label in the top grass strip.
    var asOf = document.getElementById('as-of');
    if (asOf) {
      var fetchedAt = usage.fetchedAt || 0;
      var stamp = '—';
      if (fetchedAt) {
        var fd = new Date(fetchedAt);
        var dayName = SHORT_DAYS[fd.getDay()];
        var dateStr = fd.getFullYear() + '-' + pad2(fd.getMonth() + 1) + '-' + pad2(fd.getDate());
        stamp = dayName + ', ' + dateStr + '  ' + fmtTime(fetchedAt, state.use24h);
      }
      var text = stamp; // "Token Monster" is a separate centered label
      if (!fetchedAt || (now - fetchedAt) > STALE_MS) text += ' (stale)';
      asOf.textContent = text;
    }
  }

  // ---- click-to-inspect tooltip (read-only) ----
  var tip = null;        // the tooltip element while visible
  var tipOwner = null;   // the icon element it is attached to

  function hideTip() {
    if (tip) { tip.remove(); tip = null; }
    if (tipOwner) { tipOwner.classList.remove('tip-open'); tipOwner = null; }
  }

  function tipLines(id) {
    var usage = state.usage;
    if (!usage) return [];
    var now = Date.now();
    if (id === 'clock') {
      var weekly = usage.weekly || {};
      var pct = Math.round(window.TimeMath.weekFraction(now, weekly.resetAt) * 100);
      var weeklyPct = (typeof weekly.pct === 'number' ? weekly.pct : 0);
      return [(100 - weeklyPct) + '% Cookies Left',
              pct + '% of week elapsed',
              'weekly reset: ' + fmtDateTime(weekly.resetAt, state.use24h)];
    }
    if (id === 'person') {
      var w = usage.weekly || {};
      return ['7-day usage: ' + (typeof w.pct === 'number' ? w.pct : 0) + '%',
              'resets: ' + fmtDateTime(w.resetAt, state.use24h)];
    }
    if (id === 'car') {
      var f = usage.fiveHour || {};
      return ['5-hour usage: ' + (typeof f.pct === 'number' ? f.pct : 0) + '%',
              'resets: ' + fmtDateTime(f.resetAt, state.use24h)];
    }
    return [];
  }

  function toggleTip(id) {
    var owner = document.getElementById(id);
    if (!owner) return;
    if (tip && tipOwner === owner) { hideTip(); return; }
    hideTip();
    var lines = tipLines(id);
    if (!lines.length) return;
    var box = document.createElement('div');
    box.className = 'clock-tip';
    for (var i = 0; i < lines.length; i++) {
      var row = document.createElement('div');
      row.textContent = lines[i];
      box.appendChild(row);
    }
    // Append to the road (not the icon) so the popout is centered in the window
    // and never runs off-screen for icons sitting near an edge.
    var road = document.querySelector('.road');
    (road || owner).appendChild(box);
    owner.classList.add('tip-open'); // raise this icon's stacking context
    tip = box;
    tipOwner = owner;
  }

  function wireTips() {
    ['clock', 'person', 'car'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('click', function (e) {
        e.stopPropagation();
        toggleTip(id);
      });
    });
    // Clicking anywhere else dismisses the tooltip.
    document.addEventListener('click', function (e) {
      if (!tip) return;
      if (tipOwner && tipOwner.contains(e.target)) return;
      hideTip();
    });
  }

  // ---- settings panel ----
  function toggleSettings(forceOpen) {
    var panel = document.getElementById('settings-panel');
    if (!panel) return;
    var open = (typeof forceOpen === 'boolean') ? forceOpen : panel.hidden;
    panel.hidden = !open;
    if (document.body) document.body.classList.toggle('settings-open', open);
    sizeSettings();
  }

  // Grow the popup to the settings panel's content height while open (the panel is
  // position:fixed, so it doesn't size the popup on its own). Capped by the browser
  // popup limit; the panel body then scrolls. Cleared on close so the popup hugs
  // the road again. "Tall when needed, only as tall as needed."
  function sizeSettings() {
    if (!document.body) return;
    var panel = document.getElementById('settings-panel');
    if (!panel || panel.hidden) { document.body.style.minHeight = ''; return; }
    var head = panel.querySelector('.settings-head');
    var sbody = panel.querySelector('.settings-body');
    var needed = (head ? head.offsetHeight : 0) + (sbody ? sbody.scrollHeight : 0);
    document.body.style.minHeight = needed + 'px';
  }

  function wireSettings() {
    var gear = document.getElementById('gear');
    var close = document.getElementById('settings-close');
    var reset = document.getElementById('set-reset');
    var clk24 = document.getElementById('set-24h');
    if (gear) gear.addEventListener('click', function () { toggleSettings(); });
    if (close) close.addEventListener('click', function () { toggleSettings(false); });

    // Any click outside the settings menu content closes it. Clicks inside the
    // panel (mode selects, uploaders, thumbnails, drag, Clear, etc.) keep it open;
    // the gear toggles itself and is excluded here. Capture phase so it still
    // fires even when an inner element (e.g. a road icon) stops propagation.
    document.addEventListener('click', function (e) {
      var panel = document.getElementById('settings-panel');
      if (!panel || panel.hidden) return;                 // only when open
      if (panel.contains(e.target)) return;               // inside the menu: keep open
      if (gear && (e.target === gear || gear.contains(e.target))) return; // gear handles itself
      toggleSettings(false);
    }, true);

    // Expanding/collapsing a section changes the panel's content height; re-fit.
    var sections = document.querySelectorAll('#settings-panel .art-obj');
    for (var s = 0; s < sections.length; s++) {
      sections[s].addEventListener('toggle', function () { sizeSettings(); });
    }

    if (clk24) clk24.addEventListener('change', function () {
      state.use24h = !!clk24.checked;
      storageSet({ use24h: state.use24h }).then(function () { render(); }, function () { render(); });
    });

    var cdSel = document.getElementById('set-countdown');
    if (cdSel) cdSel.addEventListener('change', function () {
      var v = cdSel.value;
      if (v !== 'weekly' && v !== '5h' && v !== 'both' && v !== 'none') v = '5h';
      state.countdownMode = v;
      storageSet({ countdownMode: v });
      updateCountdown(); // reflect immediately
    });

    if (reset) reset.addEventListener('click', function () {
      // Clear stale single-image keys from any pre-progression-art upgrade.
      storageRemove(['clockImg', 'personImg', 'carImg']).then(function () {
        // Wipe ALL custom progression art and reset each section's UI.
        ART_IDS.forEach(function (id) { resetArtSection(id); });
        if (typeof window.ArtStore !== 'undefined') {
          window.ArtStore.clearAll().then(function () { loadArt(); }, function () { render(); });
        } else {
          render();
        }
      });
    });
  }

  // ---- per-object progression-art settings -----------------------------------

  // Show series uploader / video uploader / neither, per the chosen mode.
  function reflectArtMode(id, mode) {
    var seriesWrap = document.getElementById('series-wrap-' + id);
    var videoWrap = document.getElementById('video-wrap-' + id);
    show(seriesWrap, mode === 'series');
    show(videoWrap, mode === 'video');
    sizeSettings(); // content height changed -> re-fit the popup
  }

  // Revoke and forget the settings-only thumbnail URLs for an object.
  function revokeThumbUrls(id) {
    var arr = thumbUrls[id] || [];
    for (var i = 0; i < arr.length; i++) {
      try { URL.revokeObjectURL(arr[i]); } catch (e) { /* ignore */ }
    }
    thumbUrls[id] = [];
  }

  // Rebuild the ordered thumbnail strip for an object's series draft. Revokes the
  // previous strip's object URLs first (no leak), then creates fresh ones.
  function renderThumbs(id) {
    var box = document.getElementById('thumbs-' + id);
    if (!box) return;
    revokeThumbUrls(id);
    box.textContent = '';

    // Container-level DnD (bound once): accept drops in the strip's whitespace or
    // past the last thumbnail, treating those as "move to the end". Per-cell drops
    // stopPropagation so they never also reach this handler.
    if (!box.getAttribute('data-dnd-wired')) {
      box.setAttribute('data-dnd-wired', '1');
      box.addEventListener('dragover', function (e) {
        if (dragState && dragState.id === id) e.preventDefault();
      });
      box.addEventListener('drop', function (e) {
        e.preventDefault();
        if (!dragState || dragState.id !== id) return;
        var draft = state.seriesDraft[id] || [];
        var from = dragState.from;
        if (from < 0 || from >= draft.length) return;
        var to = draft.length - 1; // append: move the dragged frame to the end
        if (from === to) return;
        state.seriesDraft[id] = window.ArtMath.reorder(draft, from, to);
        renderThumbs(id);
        persistSeries(id);
      });
    }

    var frames = state.seriesDraft[id] || [];
    for (var i = 0; i < frames.length; i++) {
      (function (index, blob) {
        var url;
        try { url = URL.createObjectURL(blob); } catch (e) { url = null; }
        if (!url) return;
        thumbUrls[id].push(url);

        var cell = document.createElement('div');
        cell.className = 'frame-thumb';
        cell.setAttribute('draggable', 'true');
        cell.setAttribute('data-index', String(index));

        var img = document.createElement('img');
        img.alt = '';
        img.src = url;
        cell.appendChild(img);

        var x = document.createElement('button');
        x.type = 'button';
        x.className = 'thumb-x';
        x.textContent = '×';
        x.addEventListener('click', function (e) {
          e.stopPropagation();
          removeFrame(id, index);
        });
        cell.appendChild(x);

        cell.addEventListener('dragstart', function (e) {
          dragState = { id: id, from: index };
          cell.classList.add('dragging');
          try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(index)); } catch (err) { /* ignore */ }
        });
        cell.addEventListener('dragend', function () {
          cell.classList.remove('dragging');
          dragState = null;
        });
        cell.addEventListener('dragover', function (e) {
          if (dragState && dragState.id === id) e.preventDefault();
        });
        cell.addEventListener('drop', function (e) {
          e.preventDefault();
          e.stopPropagation(); // don't also bubble to the container drop handler
          if (!dragState || dragState.id !== id) return;
          var to = index;
          var from = dragState.from;
          if (from === to) return;
          state.seriesDraft[id] = window.ArtMath.reorder(state.seriesDraft[id], from, to);
          renderThumbs(id);
          persistSeries(id);
        });

        box.appendChild(cell);
      })(i, frames[i]);
    }
    sizeSettings(); // thumbnail strip height changed -> re-fit the popup
  }

  var dragState = null; // { id, from } while a thumbnail drag is in flight

  // Persist the current series draft (or clear the record if it became empty).
  function persistSeries(id) {
    if (typeof window.ArtStore === 'undefined') { return; }
    var frames = state.seriesDraft[id] || [];
    var p = frames.length ? window.ArtStore.putSeries(id, frames) : window.ArtStore.clear(id);
    p.then(function () { loadArt(); });
  }

  function removeFrame(id, index) {
    var frames = state.seriesDraft[id] || [];
    if (index < 0 || index >= frames.length) return;
    frames.splice(index, 1);
    renderThumbs(id);
    persistSeries(id);
  }

  // Reset one object's settings section to the default state (UI + draft).
  function resetArtSection(id) {
    state.seriesDraft[id] = [];
    revokeThumbUrls(id);
    var box = document.getElementById('thumbs-' + id);
    if (box) box.textContent = '';
    var modeSel = document.getElementById('mode-' + id);
    if (modeSel) modeSel.value = 'default';
    var sStatus = document.getElementById('status-art-' + id);
    if (sStatus) sStatus.textContent = '';
    var note = document.getElementById('note-' + id);
    if (note) note.textContent = '';
    var sInput = document.getElementById('series-' + id);
    if (sInput) sInput.value = '';
    var vInput = document.getElementById('video-' + id);
    if (vInput) vInput.value = '';
    reflectArtMode(id, 'default');
  }

  // Load the saved record's Blobs into the draft + reflect the saved mode in the
  // UI. Called when settings are first wired so reopening shows existing art.
  function hydrateArtSection(id) {
    var modeSel = document.getElementById('mode-' + id);
    if (typeof window.ArtStore === 'undefined') {
      if (modeSel) modeSel.value = 'default';
      reflectArtMode(id, 'default');
      return Promise.resolve();
    }
    return window.ArtStore.getArt(id).then(function (rec) {
      if (rec && rec.mode === 'series' && rec.frames && rec.frames.length) {
        state.seriesDraft[id] = rec.frames.slice();
        if (modeSel) modeSel.value = 'series';
        renderThumbs(id);
        reflectArtMode(id, 'series');
      } else if (rec && rec.mode === 'video' && rec.blob) {
        state.seriesDraft[id] = [];
        if (modeSel) modeSel.value = 'video';
        var note = document.getElementById('note-' + id);
        if (note) note.textContent = 'Saved — scrubbed by usage.';
        reflectArtMode(id, 'video');
      } else {
        state.seriesDraft[id] = [];
        if (modeSel) modeSel.value = 'default';
        reflectArtMode(id, 'default');
      }
    }, function () {
      if (modeSel) modeSel.value = 'default';
      reflectArtMode(id, 'default');
    });
  }

  function wireArtSettings() {
    ART_IDS.forEach(function (id) {
      var modeSel = document.getElementById('mode-' + id);
      var seriesInput = document.getElementById('series-' + id);
      var videoInput = document.getElementById('video-' + id);
      var clearBtn = document.getElementById('clear-' + id);

      // Mode select: show the right uploader; only 'default' writes immediately.
      if (modeSel) modeSel.addEventListener('change', function () {
        var mode = modeSel.value;
        reflectArtMode(id, mode);
        if (mode === 'default') {
          if (typeof window.ArtStore !== 'undefined') {
            window.ArtStore.clear(id).then(function () { loadArt(); });
          }
          resetArtSection(id);
          if (modeSel) modeSel.value = 'default';
        }
        // series/video: just reveal the (possibly empty) uploader; nothing is
        // written until the user actually adds files.
      });

      // Series add (multiple): validate each, append valid ones, persist.
      if (seriesInput) seriesInput.addEventListener('change', function () {
        var status = document.getElementById('status-art-' + id);
        var files = seriesInput.files;
        if (!files || !files.length) return;
        var added = 0, skipped = 0;
        for (var i = 0; i < files.length; i++) {
          var f = files[i];
          if (!f.type || f.type.indexOf('image/') !== 0 || f.size > SERIES_MAX_BYTES) {
            skipped++;
            continue;
          }
          state.seriesDraft[id].push(f);
          added++;
        }
        seriesInput.value = '';
        if (status) {
          if (skipped) status.textContent = 'Skipped ' + skipped + ' file(s) (too large >2 MB or not an image).';
          else status.textContent = '';
        }
        if (added) {
          renderThumbs(id);
          persistSeries(id);
        }
      });

      // Video add: validate type + size, persist, show a note.
      if (videoInput) videoInput.addEventListener('change', function () {
        var note = document.getElementById('note-' + id);
        var file = videoInput.files && videoInput.files[0];
        if (!file) return;
        if (!file.type || file.type.indexOf('video/') !== 0) {
          if (note) note.textContent = 'Not a video — ignored.';
          videoInput.value = '';
          return;
        }
        if (file.size > VIDEO_MAX_BYTES) {
          if (note) note.textContent = 'Video too large (max 25 MB).';
          videoInput.value = '';
          return;
        }
        videoInput.value = '';
        if (typeof window.ArtStore === 'undefined') return;
        window.ArtStore.putVideo(id, file).then(function () {
          if (note) note.textContent = 'Saved — scrubbed by usage.';
          loadArt();
        });
      });

      // Per-object Clear: drop the record and reset this section to default.
      if (clearBtn) clearBtn.addEventListener('click', function () {
        if (typeof window.ArtStore !== 'undefined') {
          window.ArtStore.clear(id).then(function () { loadArt(); });
        }
        resetArtSection(id);
      });

      // Reflect saved state on init.
      hydrateArtSection(id);
    });
  }

  // Nudge the background to poll (best-effort; ignored if no handler).
  function nudgeRefresh() {
    try {
      chrome.runtime.sendMessage({ type: 'claudeTimePoll' }, function () {
        // Swallow "no receiving end" so it never surfaces as an error.
        void (chrome.runtime && chrome.runtime.lastError);
      });
    } catch (e) { /* ignore */ }
  }

  // Live-update when fresh data lands in storage.
  function wireStorageWatch() {
    if (!chrome.storage || !chrome.storage.onChanged) return;
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'local') return;
      var dirty = false;
      if (changes.lastUsage) { state.usage = changes.lastUsage.newValue || null; dirty = true; }
      if (changes.use24h) {
        state.use24h = !!changes.use24h.newValue;
        var cb = document.getElementById('set-24h');
        if (cb) cb.checked = state.use24h;
        dirty = true;
      }
      // Per-object art mode changed (ArtStore mirrors mode here): re-read IDB,
      // rebuild object URLs, and re-render. loadArt() calls render() itself.
      if (changes.artModes) { loadArt(); return; }
      if (dirty) render();
    });
  }

  // Coalesce resize bursts into one render per frame.
  var resizeFrame = null;
  function onResize() {
    if (resizeFrame !== null) return;
    resizeFrame = requestAnimationFrame(function () {
      resizeFrame = null;
      render();
    });
  }

  // ---- test cycle: a 4-phase "walk" --------------------------------------------
  // P1 Gather (slow): from their live spots, all walk to the START line; whoever
  //    arrives first waits for the rest. P2 Out (normal): all walk together to the
  //    FINISH. P3 Back (normal): all walk together to the START. P4 Home (slow):
  //    all walk out and each stops at its own saved spot. Art tracks position
  //    while walking, then eases to each object's real % on the way home.
  // A mouse click anywhere (or the window losing focus) ABORTS: everyone turns and
  // walks the shortest way back to their saved spot, art easing to its real frame.
  var WALK_SLOW = 0.30 / 1000;  // fraction/ms — gather + home legs (~3.3s end-to-end)
  var WALK_FAST = 0.85 / 1000;  // fraction/ms — out + back legs (~1.2s end-to-end)
  var PHASE_PAUSE = 200;        // ms beat at each turnaround
  var ART_STEP = 120;           // ms between art (frame) updates — smooth move, stepped art

  // The real, live position fraction + art % for each object right now.
  function liveTargets() {
    var usage = state.usage || {};
    var weekly = usage.weekly || {}, fiveHour = usage.fiveHour || {};
    var now = Date.now();
    var weeklyPct = (typeof weekly.pct === 'number' ? weekly.pct : 0);
    var fivePct = (typeof fiveHour.pct === 'number' ? fiveHour.pct : 0);
    return {
      clock:  { pos: window.TimeMath.weekFraction(now, weekly.resetAt), art: weeklyPct },
      person: { pos: weeklyPct / 100, art: weeklyPct },
      car:    { pos: fivePct / 100, art: fivePct }
    };
  }

  // Stop the walk (natural end or popup unload) and restore the exact live state.
  function endTestCycle() {
    if (!testCycle) return;
    if (testCycle.raf !== null) cancelAnimationFrame(testCycle.raf);
    document.removeEventListener('mousedown', testCycle.onAbort, true);
    window.removeEventListener('blur', testCycle.onAbort);
    testCycle = null;
    hideTip();
    render(); // restore live positions + art
  }

  function runTestCycle() {
    if (testCycle) return; // already running: no-op
    hideTip();

    var home = liveTargets();
    var cur = { clock: home.clock.pos, person: home.person.pos, car: home.car.pos };

    // Phase plan. target(id) -> destination fraction; art 'pos' tracks position,
    // 'home' eases to the object's real % over the leg.
    var phases = [
      { speed: WALK_SLOW, target: function ()   { return 0; },            art: 'pos'  }, // gather
      { speed: WALK_FAST, target: function ()   { return 1; },            art: 'pos'  }, // out
      { hold: 2000, bed: true },                                                         // at 100%: 2s, monster -> bed
      { speed: WALK_FAST, target: function ()   { return 0; },            art: 'pos'  }, // back
      { speed: WALK_SLOW, target: function (id) { return home[id].pos; }, art: 'home' }  // home
    ];

    testCycle = {
      raf: null, phaseIdx: 0, cur: cur, home: home, phases: phases,
      artStart: {}, distStart: {}, pauseUntil: 0, holdUntil: 0, last: 0, lastArt: 0,
      returning: false, onAbort: null
    };

    function targetOf(id) {
      if (testCycle.returning) return home[id].pos;
      var ph = phases[testCycle.phaseIdx];
      return ph.target ? ph.target(id) : cur[id]; // hold phases don't move
    }

    // Snapshot art + remaining distance at the start of a leg (for the 'home' ease
    // and the return). Call when a phase (or the return) begins.
    function snapLeg() {
      ART_IDS.forEach(function (id) {
        testCycle.artStart[id] = cur[id] * 100;
        testCycle.distStart[id] = Math.abs(targetOf(id) - cur[id]) || 1e-6;
      });
    }

    testCycle.onAbort = function () {
      if (!testCycle || testCycle.returning) return;
      testCycle.returning = true;
      testCycle.pauseUntil = 0; // cancel any turnaround beat — head home now
      snapLeg(); // freeze current art/distance to ease from here to home
    };

    function frame(ts) {
      if (!testCycle) return;
      var road = document.querySelector('.road');
      if (!road) { endTestCycle(); return; }
      if (!testCycle.last) testCycle.last = ts;
      var dt = ts - testCycle.last; testCycle.last = ts;
      if (dt > 80) dt = 80; // clamp big gaps (tab switch / GC)

      if (ts < testCycle.pauseUntil) { testCycle.raf = requestAnimationFrame(frame); return; }

      var pad = roadPadding(road);
      var trackWidth = road.clientWidth - 2 * pad; if (trackWidth < 0) trackWidth = 0;

      var returning = testCycle.returning;
      var ph = phases[testCycle.phaseIdx];

      // Hold phase (e.g. the 2s bed pause at the finish): no movement. The middle
      // Token Monster (person) swaps to the shared bed image; the others hold their
      // 100% frame. Skipped once an abort flips us into return mode.
      if (!returning && ph.hold) {
        if (testCycle.holdUntil === 0) {
          testCycle.holdUntil = ts + ph.hold;
          ART_IDS.forEach(function (id) {
            var el = document.getElementById(id); if (!el) return;
            placeIcon(el, cur[id], pad, trackWidth);
            if (ph.bed && id === 'person') {
              ensureIconImage(el, ICON_CONFIG[id], BED_IMAGE);
            } else {
              resolveArt(id, cur[id] * 100, (function (elem, iid) {
                return function (src) { ensureIconImage(elem, ICON_CONFIG[iid], src); };
              })(el, id));
            }
          });
        }
        if (ts >= testCycle.holdUntil) {
          testCycle.holdUntil = 0;
          testCycle.phaseIdx++;
          if (testCycle.phaseIdx >= phases.length) { endTestCycle(); return; }
          testCycle.pauseUntil = ts + PHASE_PAUSE;
          snapLeg();
        }
        testCycle.raf = requestAnimationFrame(frame);
        return;
      }

      var speed = returning ? WALK_SLOW : ph.speed;
      var artMode = returning ? 'home' : ph.art;
      var artTick = (ts - testCycle.lastArt) >= ART_STEP;

      var allDone = true;
      ART_IDS.forEach(function (id) {
        var tgt = returning ? home[id].pos : ph.target(id);
        var c = cur[id];
        if (c !== tgt) {
          var dir = (tgt > c) ? 1 : -1;
          c += dir * speed * dt;
          if ((dir > 0 && c >= tgt) || (dir < 0 && c <= tgt)) c = tgt;
          cur[id] = c;
        }
        if (c !== tgt) allDone = false;

        var el = document.getElementById(id);
        if (el) {
          placeIcon(el, c, pad, trackWidth);
          if (artTick) {
            var artPct;
            if (artMode === 'pos') {
              artPct = c * 100;
            } else { // ease artStart -> real art by progress toward target
              var prog = 1 - Math.abs(tgt - c) / testCycle.distStart[id];
              if (prog < 0) prog = 0; else if (prog > 1) prog = 1;
              artPct = testCycle.artStart[id] + (home[id].art - testCycle.artStart[id]) * prog;
            }
            resolveArt(id, artPct, (function (elem) {
              return function (src) { ensureIconImage(elem, ICON_CONFIG[id], src); };
            })(el));
          }
        }
      });
      if (artTick) testCycle.lastArt = ts;

      if (allDone) {
        if (returning) { endTestCycle(); return; }
        testCycle.phaseIdx++;
        if (testCycle.phaseIdx >= phases.length) { endTestCycle(); return; }
        testCycle.pauseUntil = ts + PHASE_PAUSE;
        snapLeg();
      }
      testCycle.raf = requestAnimationFrame(frame);
    }

    snapLeg(); // phase 0
    // Arm the abort listeners on the NEXT frame so the click that STARTED the
    // cycle (the Test cycle button) doesn't immediately abort it.
    testCycle.raf = requestAnimationFrame(function (ts) {
      if (!testCycle) return;
      document.addEventListener('mousedown', testCycle.onAbort, true);
      window.addEventListener('blur', testCycle.onAbort);
      testCycle.last = ts; testCycle.lastArt = ts;
      frame(ts);
    });
  }

  function wireTestCycle() {
    var btn = document.getElementById('set-test');
    if (btn) btn.addEventListener('click', function () {
      toggleSettings(false); // close the menu so the animation is visible
      runTestCycle();
    });
  }

  // ---- countdown timer (top strip) -------------------------------------------
  // Counts down to a reset entirely client-side from (resetAt - now); a poll only
  // refreshes resetAt, so it stays smooth between the ~2-min polls. The trailing
  // two digits are a DECORATIVE fast "flip" — not real time — purely to make the
  // clock feel like it's flying by.
  var COUNTDOWN_TICK_MS = 55;   // redraw cadence (also drives the fast flip)
  var countdownTimer = null;
  var cdFlip = 0;               // decorative 2-digit value; spins each tick

  // Resolve which reset to show (and its icon). 'both' rotates every 10s, purely
  // client-side. Returns null when there's no usable resetAt.
  function countdownTarget(now) {
    var usage = state.usage; if (!usage) return null;
    var weekly = usage.weekly || {}, fiveHour = usage.fiveHour || {};
    var mode = state.countdownMode;
    if (mode === 'both') mode = (Math.floor(now / 10000) % 2 === 0) ? '5h' : 'weekly';
    if (mode === 'weekly') return { at: weekly.resetAt, icon: '🏁' };
    return { at: fiveHour.resetAt, icon: '🥛' };
  }

  function updateCountdown() {
    var el = document.getElementById('countdown');
    if (!el) return;
    var roadWrap = document.getElementById('road-wrap');
    var now = Date.now();
    if (state.countdownMode === 'none') { el.hidden = true; el.textContent = ''; return; }
    var tgt = countdownTarget(now);
    if (!tgt || !isFinite(tgt.at) || (roadWrap && roadWrap.hidden)) {
      el.hidden = true; el.textContent = ''; return;
    }
    el.hidden = false;

    var rem = tgt.at - now; if (rem < 0) rem = 0;
    var t = Math.floor(rem / 1000);
    var days = Math.floor(t / 86400); t -= days * 86400;
    var hrs  = Math.floor(t / 3600);  t -= hrs * 3600;
    var mins = Math.floor(t / 60);
    var secs = t - mins * 60;

    cdFlip = (cdFlip + 93) % 100; // +93 ≡ -7 (mod 100): spins down fast, wrapping

    el.innerHTML = tgt.icon + ' ' + days + ':' + pad2(hrs) + ':' + pad2(mins) + ':' +
      pad2(secs) + ':<span class="cd-flip">' + pad2(cdFlip) + '</span>';
  }

  function startCountdown() {
    if (countdownTimer !== null) return;
    updateCountdown();
    countdownTimer = setInterval(updateCountdown, COUNTDOWN_TICK_MS);
  }

  async function init() {
    warmDefaults();
    wireTips();
    wireSettings();
    wireArtSettings();
    wireSizeControls();
    wireToolbarSize();
    wireTestCycle();
    wireStorageWatch();
    window.addEventListener('resize', onResize);
    // Stop any running test cycle cleanly if the popup unloads.
    window.addEventListener('pagehide', function () {
      endTestCycle();
      if (countdownTimer !== null) { clearInterval(countdownTimer); countdownTimer = null; }
    });

    var data = await storageGet(['lastUsage', 'use24h', 'artSizes', 'countdownMode', 'toolbarScale']);
    state.usage = data.lastUsage || null;
    state.use24h = !!data.use24h;
    if (data.countdownMode === 'weekly' || data.countdownMode === '5h' ||
        data.countdownMode === 'both' || data.countdownMode === 'none') {
      state.countdownMode = data.countdownMode;
    }
    if (typeof data.toolbarScale === 'number' && data.toolbarScale >= TOOLBAR_MIN && data.toolbarScale <= TOOLBAR_MAX) {
      state.toolbarScale = data.toolbarScale;
    }
    applyToolbarScale();
    var cdSel = document.getElementById('set-countdown');
    if (cdSel) cdSel.value = state.countdownMode;
    var saved = data.artSizes || {};
    ART_IDS.forEach(function (id) {
      state.sizes[id] = (typeof saved[id] === 'number' && saved[id] > 0) ? saved[id] : SIZE_DEFAULTS[id];
    });
    applySizes();
    var cb = document.getElementById('set-24h');
    if (cb) cb.checked = state.use24h;
    render();
    startCountdown();

    // Load any custom progression art from IndexedDB, then re-render.
    loadArt();

    nudgeRefresh();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
