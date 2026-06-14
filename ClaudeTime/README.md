# Claude Time

A small Chrome extension that shows your **real** Claude usage as a *race down a
road*. Three objects sit on the same left→right track, each mapped 0–100%, so at
a glance you can see whether your usage is *ahead of or behind* the clock's pace.

| Object | Represents | Source | Default art |
|--------|-----------|--------|-------------|
| 🍪 **Clock** | How far through the **weekly** window you are (time pace) | Computed from the weekly reset time | A **plate of cookies** that lowers with your 7-day usage |
| 🐻 **Person** | **7-day all-models** usage % | Real, from claude.ai | A **purple bear** that grows slim→large with usage |
| 🥛 **Car** | **5-hour** rolling session usage % | Real, from claude.ai | A **glass of milk** that empties as the session is used |

The **toolbar badge** always shows your live **5-hour %**, colored green
(<70), orange (70–89), or red (≥90). Hover it for both numbers and "as of HH:MM".
Click the icon to open the road-race popup.

## How it gets the numbers

The extension reads the exact figures Anthropic shows on your `/usage` page by
calling claude.ai's own internal endpoint with the session you're **already
logged into** — no OAuth, no API key, no password:

- It uses your existing `claude.ai` **session cookie** (sent automatically only
  to `claude.ai`).
- It discovers **your** organization id at runtime (it is unique per account and
  is never hardcoded), then reads
  `GET https://claude.ai/api/organizations/{yourOrgId}/usage`.
- `five_hour.utilization` and `seven_day.utilization` are already percentages, so
  there's no token-budget guesswork — the displayed numbers match `/usage`.

**Freshness (hybrid):** while a claude.ai tab is open, the in-page script
refreshes the numbers (robust path). A background alarm also refreshes about
every 10 minutes, and a best-effort background fetch tries even with no tab open
(this may be blocked by Cloudflare — that's fine, it just keeps showing the last
known value). Data older than 30 minutes is marked **stale** (gray badge,
"(stale)" in the tooltip). If you're signed out, the badge shows "–" and the
popup links you to sign in.

## Installing (load unpacked)

1. Clone/pull this repo.
2. Open `chrome://extensions`, turn on **Developer mode** (top-right).
3. Click **Load unpacked** and select the **`ClaudeTime/`** folder.
4. Make sure you're signed in at [claude.ai](https://claude.ai). The badge fills
   in within a few seconds (open a claude.ai tab if it doesn't).

Works in Chrome and other Chromium browsers (Edge, Brave, Arc). A Chrome Web
Store listing is planned for the future (see `../docs/plans/`).

## Using it

- **Badge** → your live 5-hour %. Hover for both numbers + "as of".
- **Click the icon** → the road-race popup.
- **Click an object** in the popup → a read-only readout (exact % and reset
  time). There is no manual entry — the numbers are real.
- **⚙ Settings** → per-object **progression art** (see below), the global
  **Test cycle** preview, and **Reset to defaults** (clears all custom art).

## Default (packaged) art

Out of the box each object scrubs a bundled, transparent **WEBM clip** to the
frame matching its value % (`currentTime = duration × value%`). The clips never
play — a single frame is painted as the icon. The full→empty / slim→large
progression is baked into the clip:

- **Clock → a plate of cookies** that lowers with your **7-day "All models"
  usage** (full at 0%, empty at 100%) — the same % the bear rides. (The clock's
  *position* on the road still tracks how far through the week you are.)
- **Person → a purple bear** ("Token Monster") that grows from slim to large with
  your **7-day usage**.
- **Car → a glass of milk** that empties with your **5-hour usage**.

The bear is also the toolbar icon.

## Progression art (custom, per object)

Each object — **Clock**, **Person**, **Car** — has its own collapsible section in
**⚙ Settings** with a **mode**:

- **Default** — the packaged scrub-video art above.
- **Image series** — upload any number of stills (PNG/JPG/WebP, ≤2 MB each).
  **Drag the thumbnails to reorder** them, or remove individual frames. The
  object's value % maps straight onto the series: **0% = first frame, 100% =
  last frame** (nearest frame chosen in between).
- **Video** — upload one clip (MP4/WebM, ≤25 MB). It never plays; instead a hidden
  `<video>` is **seeked to `duration × value%`** and that single frame is painted
  as the icon. Short clips work best.

Which value drives each object: **Clock = week-elapsed %**, **Person = 7-day %**,
**Car = 5-hour %**. Custom art is stored **locally in your browser's IndexedDB**
(the extension requests `unlimitedStorage` so videos fit). If a custom asset ever
fails to load or decode, the object falls back to the packaged default, then to a
themed emoji — never a broken image.

**Test cycle** animates all three objects through **0 → 100 → 0, twice**, so you
can preview your chosen art (default, series, or video) at a glance, then snaps
back to your live values. **Per-object Clear** reverts one object; **Reset to
defaults** clears all custom art.

To change the packaged defaults, swap the WEBM clips in `assets/` (keep the
transparent background and similar dimensions).

## Privacy

It reads your Claude usage from your own logged-in browser session and stores it
**locally** in the extension. It sends **nothing** to any third party. See
[PRIVACY.md](PRIVACY.md).

## Honest limitations

- This relies on an **unofficial, undocumented** claude.ai internal API.
  Anthropic may change or remove it at any time; if that happens the badge keeps
  showing the last value and the tooltip notes it's stale.
- The background no-tab fetch may be blocked by Cloudflare; keeping a claude.ai
  tab open guarantees fresh data.
- State (cached usage, custom icons, your org id) is **per-browser-profile**.

## Developing

- Manifest V3, vanilla HTML/CSS/JS, no build step, no ES modules. Browser scripts
  are IIFE-wrapped; pure logic (`usage-client.js`, `usage-fetch.js`,
  `time-math.js`, `art-math.js`) uses a UMD wrapper so it also runs under Node for
  tests.
- Architecture: `content.js` (in-page fetch) + `background.js` (service worker:
  badge, cache, alarm, fallback) share `usage-fetch.js` (org discovery + fetch)
  and `usage-client.js` (raw JSON → tidy shape). `popup.html`/`popup.js` render
  the race from the cached `lastUsage`.
- Progression art: `art-math.js` (pure frame-index + reorder math, unit-tested)
  and `art-store.js` (a thin IndexedDB wrapper persisting per-object art as Blobs,
  mirroring each object's mode into `chrome.storage.local` under `artModes`).
  IndexedDB/canvas/video/drag-drop are verified by load-unpacked, not Node tests.
- Tests (Node's built-in runner):

  ```
  node --test "ClaudeTime/tests/*.test.js"
  ```

- Design & plan: `../docs/plans/2026-06-13-claude-time-chrome-extension*.md`.
