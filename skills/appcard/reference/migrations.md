# appcard schema migrations

Each schema-version change gets an entry: what changed and how to migrate an
existing card. Migration never alters protected regions.

## 1.0.0 (2026-05-23) — initial schema

Baseline. 19 managed sections, Project Variables (Commit/Push/Merge policies),
`appcard:protect` regions, `<details>` collapsibles. No prior version to migrate
from. If a card has no `schema-version`, treat it as pre-1.0.0: insert the
version comment silently and add any missing sections as `_Not yet documented._`.
