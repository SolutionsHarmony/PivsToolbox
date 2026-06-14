# API fixtures (captured 2026-06-13 spike)

Real responses from claude.ai's **unofficial, undocumented** internal API, used
to write/test `usage-client.normalize()`. Anthropic may change these any time.

## Endpoints

- `GET https://claude.ai/api/organizations`
  → array of org objects; each has a `uuid`. Pick the personal account's org.
- `GET https://claude.ai/api/organizations/{orgId}/usage`
  → the usage payload (see `usage.json`).

Auth: the logged-in `sessionKey` cookie, sent automatically (`credentials:
'include'`) for the `claude.ai` origin. No OAuth, no API key.

## Field mapping (from `usage.json`)

| App concept        | JSON path                  | Notes                          |
|--------------------|----------------------------|--------------------------------|
| 5-hour session %   | `five_hour.utilization`    | already a percent (0–100)      |
| 5-hour reset       | `five_hour.resets_at`      | ISO 8601 string                |
| 7-day all-models % | `seven_day.utilization`    | already a percent (0–100)      |
| 7-day reset        | `seven_day.resets_at`      | ISO 8601 string                |

Out of scope but present: `seven_day_opus`, `seven_day_sonnet` (same shape, or
`null` when not applicable). `extra_usage` is the pay-as-you-go credit block.

`organizations.json` here is a **representative shape** (fake uuid) — the real
org id is intentionally not committed to keep the repo non-identifying.
