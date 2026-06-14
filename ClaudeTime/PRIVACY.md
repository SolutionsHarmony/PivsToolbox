# Claude Time — Privacy Policy

_Last updated: 2026-06-13_

Claude Time is a browser extension that displays your own Claude usage limits.

## What it accesses

- **Your claude.ai session.** The extension reads your Claude usage by calling
  claude.ai's own usage endpoint using the session cookie already present in your
  logged-in browser. It does not ask for, see, or store your password, and it
  does not use any separate login, OAuth token, or API key.
- **Your usage numbers and organization id.** It reads your 5-hour and 7-day
  usage percentages, their reset times, and your account's organization id (so it
  can request your usage).

## What it stores

- The latest usage snapshot, your organization id, and any custom icons you
  upload are stored **locally** in the browser via `chrome.storage.local`.
- Custom icons never leave your device.

## What it sends

- **Nothing to anyone but claude.ai.** The only network requests it makes are to
  `https://claude.ai` to read your usage. There are no analytics, no telemetry,
  no third-party servers, and no data collection.

## Permissions and why

- `host_permissions: https://claude.ai/*` — to read your usage from claude.ai.
- `storage` — to cache usage and your custom icons locally.
- `alarms` — to refresh the usage periodically.

## Control

- Removing the extension deletes everything it stored.
- **Settings → Reset to defaults** removes any custom icons you uploaded.

## Disclaimer

This extension is not affiliated with or endorsed by Anthropic. It relies on an
unofficial, undocumented claude.ai endpoint that may change at any time.

Questions: contact@solutionsharmony.com · https://solutionsharmony.com
