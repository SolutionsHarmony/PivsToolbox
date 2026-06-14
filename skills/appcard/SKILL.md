---
name: appcard
description: Use when the user runs /appcard (create, update <section>, or update all) to create and maintain the current repo's docs/appcard.md operational handbook against the versioned appcard schema; current repo only.
---

# appcard

Create and maintain `./docs/appcard.md`, a README-like operational handbook that
follows the versioned schema in `schema.md`. Always operate on the **current
repository** (cwd = repo root). Only touch this repo's card and media.

Read `schema.md` (the source of truth) and `template.md` before doing anything.

## Argument parsing

`$ARGUMENTS` is one of:
- `create` — first-time build.
- `update <section>` — refresh one section.
- `update all` — full rebuild (`all` is a hard-coded keyword, not a section).
- `update` (no section) — NOT valid; print usage and stop.
- anything else / empty — print usage and stop.

Usage message:
> Usage: `/appcard create`, `/appcard update <section>`, or `/appcard update all`.
> For a full rebuild use `/appcard update all`.

## Before every run

1. Compute the timestamp: `Get-Date -Format "yyyyMMdd-HHmmss"` (Windows; bash:
   `date +%Y%m%d-%H%M%S`) — call this `<ts>`.
2. If `./docs/appcard.md` exists, read it and parse the `Project Variables`
   table. Obey these for ALL git actions you take in this repo:
   - `GitHubCommitPolicy`: auto = commit without asking; ask = confirm first;
     manual = never commit (tell the user to).
   - `GitHubPushPolicy`: auto = push freely; review = push only at a review/done
     point; ask = confirm; never = never push.
   - `GitHubMergePolicy`: pr-required / pr-auto / ask / manual — honor when
     merging.
3. Schema version check: read the card's `appcard:schema-version`.
   - **Missing → fix silently:** insert `<!-- appcard:schema-version=<current> -->`
     using the version from `schema.md`. No prompt.
   - **Older than `schema.md` → migrate:** back up first (see Backups), preserve
     all content and every protected region, add new sections as
     `_Not yet documented._` placeholders, apply renames/removals from
     `reference/migrations.md`, bump the embedded version, and record the changes
     in the proposal report.

## Path conventions

All appcard paths (`docs/appcard.md`, `docs/files/appcard/...`) MUST use forward
slashes everywhere — on disk, in commands, in chat, and in links — even on
Windows. Write them as literal forward-slash strings. Do NOT use PowerShell
`Join-Path` to assemble them: on Windows it inserts a backslash and produces
broken paths like `docs/files\appcard`. To create a directory, pass the full
forward-slash path to one call (`New-Item -ItemType Directory -Force -Path
docs/files/appcard/backups/appcard.md`; bash: `mkdir -p
docs/files/appcard/backups/appcard.md`) — both shells accept forward slashes.

## Protected regions — ABSOLUTE RULE

Content between `<!-- appcard:protect:start ... -->` and
`<!-- appcard:protect:end -->` is user-owned. You MAY read it to avoid
duplication. You MUST NEVER edit, delete, reorder, or alter it. On a full
rebuild you may relocate a whole protected block (by its `id`/surrounding
section), but never change its contents. This rule overrides every other
instruction.

## Backups

Before modifying ANY existing file (the card, or any media/referenced file you
are about to overwrite or delete), first copy the current version into a per-file
backup subfolder named after the file, keeping every timestamped version (never
overwrite older backups):

`./docs/files/appcard/backups/<filename>/<stem>-<ts><ext>`

So the card backs up to `./docs/files/appcard/backups/appcard.md/appcard-<ts>.md`.
These backups are committed alongside the card.

**Restore:** copy the desired timestamped backup back over the live file, e.g.
`Copy-Item docs/files/appcard/backups/appcard.md/appcard-<ts>.md docs/appcard.md`.

## Reports

Proposal reports go to `./docs/files/appcard/cardupdate/<ts>-card-update.md`.
These are LOCAL working artifacts — do NOT commit them. Recommend the user add
`docs/files/appcard/cardupdate/` to the repo's `.gitignore` (offer to do it).

## Meta header (every write)

On EVERY write to `./docs/appcard.md` (create, update `<section>`, and update
all), refresh the meta comments before saving:
- `appcard:last-updated=<ts>`
- `appcard:generated-from-commit=<current HEAD sha>`

Leave `appcard:schema-version` at the value from `schema.md` (except when the
silent-fix/migration logic above changes it).

## Flow: create

Use when no card exists (or the user explicitly rebuilds from scratch).

1. Deep-dive the repo: read every `.md`, `.txt`, `.ps1`, `.sh`, plus code where
   needed, plus `git log`, to learn the real processes.
2. Start from `template.md`; fill in `{{PROJECT_NAME}}`,
   `{{ONE_LINE_DESCRIPTION}}`, `{{TIMESTAMP}}`=`<ts>`, `{{COMMIT_SHA}}`=current
   HEAD sha. Set Project Variables from what you find (default to `ask` policies
   if unknown). For any section with no applicable content, write
   `N/A — <reason>` in the summary line rather than inventing content; leave
   genuinely-unknown sections as `_Not yet documented._`.
3. Write the proposal to `./docs/files/appcard/cardupdate/<ts>-card-update.md`
   (local only).
4. Diff the proposal against the existing card (entirely new if none).
5. Discuss conflicts/gaps with the user; reconcile in chat.
6. Write the result to `./docs/appcard.md`.
7. Commit as `App Card Updated - <ts>` (honor `GitHubCommitPolicy`).
8. Confirm. Print a link to `docs/appcard.md`, then links to every file
   added/updated in that commit.

## Flow: update <section>

1. Read `./docs/appcard.md`. If missing, suggest `/appcard create` and stop.
2. Resolve `<section>` to exactly one managed section using a synonym map
   (examples: production/deploy/release → "Updating Production Safely";
   rollback/revert → "Rollback Procedure"; backup → "Backing Up Production";
   restore/recover → "Restoring Production"; test/tests/ci → "Running the Test
   Suite (validation)"; contribute/feature/bug → "How to Contribute"; pr/
   pull-request → "Creating a Pull Request"; merge → "Merging Pull Requests
   Safely"; setup/dev/environment → "Development Environment Setup"; config/env →
   "Configuration & Environment Variables"; arch → "Architecture Overview";
   stack/prereq → "Tech Stack & Prerequisites"; monitor/logs/observability →
   "Monitoring & Observability"; faq/troubleshoot → "Troubleshooting & FAQ").
   If ambiguous, list candidates and ask.
3. Back up the card (see Backups).
4. Regenerate ONLY that section's managed content from the current codebase.
   Leave every other section and every protected block byte-for-byte unchanged.
   You MAY read protected blocks to avoid duplication.
5. Show the diff for that section; confirm.
6. Refresh the meta header (see Meta header). Write and commit as
   `App Card Updated - <ts>` (honor policy). Print the link to `docs/appcard.md`.

## Flow: update all

1. Read `./docs/appcard.md`. If missing, suggest `/appcard create` and stop.
2. Back up the card (see Backups).
3. Extract every protected block with its `id` and position context (which
   section it followed / its order).
4. Rebuild the entire managed scaffold from the codebase (same deep-dive as
   create), starting from `template.md`.
5. Re-insert each protected block roughly where it was (by `id`/section context),
   contents unchanged.
6. Refresh the meta header (see Meta header). Write and commit as
   `App Card Updated - <ts>`. Print links as in create.

## Output links

When done, always print a clickable link to `docs/appcard.md` first, then a list
of any other files added/updated in the commit, for fast reference.
