# appcard schema

<!-- appcard:schema-version=1.0.0 -->

This is the single source of truth for the structure of every `docs/appcard.md`.
Changing the section set, the Project Variables vocabulary, or the delimiters
requires bumping `schema-version` (semver) and adding a `reference/migrations.md`
entry.

## File-level structure

1. Title line: `# <Project Name> — App Card`
2. One-line blockquote description.
3. Meta comments (machine-readable, one per line):
   - `<!-- appcard:schema-version=X.Y.Z -->`
   - `<!-- appcard:last-updated=<yyyyMMdd-HHmmss> -->`
   - `<!-- appcard:generated-from-commit=<sha> -->`
4. `## Project Variables` table.
5. A near-the-top example protected region (see Protected Regions).
6. The ordered managed sections (below), each an `H2` with a one-line summary
   then a `<details><summary>Details</summary> … </details>` collapsible.

## Managed sections (ordered, v1.0.0)

1. Application Purpose
2. Architecture Overview
3. Tech Stack & Prerequisites
4. First-Use Guidance
5. Usage Examples
6. Configuration & Environment Variables
7. Development Environment Setup  (nested collapsible: "New Dev Environment from Latest `main`")
8. How to Contribute (feature / bug / refactor)
9. Creating a Pull Request
10. Merging Pull Requests Safely
11. Running the Test Suite (validation)
12. Updating Production Safely (deploy)
13. Rollback Procedure
14. Backing Up Production
15. Restoring Production
16. Monitoring & Observability
17. Troubleshooting & FAQ
18. Helpful Notes
19. Contacts & Where to Get Help

## Project Variables vocabulary

| Variable | Allowed values | Meaning |
|---|---|---|
| `GitHubCommitPolicy` | `auto` / `ask` / `manual` | auto = commit freely; ask = confirm each; manual = only the user commits |
| `GitHubPushPolicy` | `auto` / `review` / `ask` / `never` | auto = push anytime; review = push only at review points; ask = confirm each; never = user pushes |
| `GitHubMergePolicy` | `pr-required` / `pr-auto` / `ask` / `manual` | pr-required = always PR + checks; pr-auto = merge once checks pass; ask = confirm; manual = user merges |

The skill reads these at the start of every run and obeys them for its own git
actions in the target repo.

## Protected regions (user-owned, never modified by the skill)

Delimiter (HTML comments — invisible on GitHub, machine-detectable):

```
<!-- appcard:protect:start id="optional-anchor" -->
…user content…
<!-- appcard:protect:end -->
```

- Optional `id="..."` is an anchor used to re-place the block on `update all`.
- May wrap a whole custom `H2` section or a block inside a managed section.
- The skill MAY read protected content to avoid duplication. It MUST NEVER edit,
  delete, reorder, or alter it. On full rebuild it may relocate a block as a
  whole, contents unchanged.

## Content rules

Sections may contain text, bullets, tables, links to other `.md` files, links
into `./docs/files/appcard/...`, media (images, optionally wrapped in HTML for
captions/layout), and `https://` links. Large JSON/XML is linked as a separate
file under `./docs/files/appcard/`, never inlined.

A section that does not apply to this project should say so explicitly in its
summary line — `N/A — <reason>` — rather than inventing content. A section that
simply has not been filled in yet keeps the `_Not yet documented._` placeholder.
Blank/N-A sections are expected and fine; not every project exercises every
section.

## Timestamp format

`yyyyMMdd-HHmmss` (e.g. `20260523-223015`) — filename-safe, sortable.

## Filesystem layout in a target repo

```
docs/appcard.md                                           # committed
docs/files/appcard/<media>                                # committed
docs/files/appcard/backups/<filename>/<stem>-<ts><ext>    # committed; one subfolder per backed-up file
docs/files/appcard/cardupdate/<ts>-card-update.md         # LOCAL ONLY — recommend gitignore
```

All of these paths use forward slashes everywhere — on disk, in commands, and in
links — even on Windows. Never assemble them with PowerShell `Join-Path`, which
inserts a backslash on Windows and yields broken paths like `docs/files\appcard`.

Before modifying any existing file, the skill copies the prior version into a
backups subfolder named after that file (keeping every timestamped version), e.g.
the card backs up to `docs/files/appcard/backups/appcard.md/appcard-<ts>.md`.
Restore by copying a timestamped backup back over the live file.
