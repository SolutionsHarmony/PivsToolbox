# CLAUDE.md

## Git workflow (authorized in advance — do not ask)

Committing and pushing are pre-approved for this repo. Never pause to ask
permission to commit or push. The permission rules are in
`.claude/settings.local.json` (`Bash(git commit:*)`, `Bash(git push:*)`).

**Commit early and often. You cannot commit too much.**

- **Commit** every time you pause, finish a discrete piece of work, or move on
  to a different task. Each meaningful checkpoint gets its own commit so work is
  never lost between steps.
- **Push** when a big accomplishment is complete, or whenever you're ready for
  the user to review/test. The user pulls on a separate testing system, so they
  need the repo pushed before they can review — when you reach a review point,
  push without being asked.

## Local settings file

`.claude/settings.local.json` is **git-ignored** here. Claude Code auto-appends
one-off command approvals to it during sessions, so leaving it tracked caused
constant churn. Do not commit it as part of normal work, and do not re-add the
old `.gitignore` negation. The canonical permission rules live in this file's
git history, in `scripts/Apply-GitWorkflow.ps1`, and in the workflow section
above. To deliberately capture a fresh snapshot of the settings into the repo,
explicitly force-add it: `git add -f .claude/settings.local.json`.
