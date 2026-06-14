# App Card Tool — Install & Use

The **App Card Tool** is the `appcard` Claude Code skill. Once installed it is
available in **every** repo on your account, and it creates/maintains a
`docs/appcard.md` operational handbook inside whatever repo you run it in.

There are two ways to install it. Pick one.

---

## Option A — Install with the EXE (easiest, no git needed)

1. Get **`AppCardTool-Setup.exe`** (from `installer/AppCardTool-Setup.exe` in this
   repo, or wherever you saved it).
2. Double-click it.
   - Windows SmartScreen may warn because the EXE is unsigned — click
     **More info → Run anyway**.
3. The wizard defaults to installing into **`%USERPROFILE%\.claude`** (which puts
   the skill in `%USERPROFILE%\.claude\skills\appcard`, active for all projects).
   Click **Next** to accept, or **Browse** to choose a different `.claude` folder.
4. Finish. You'll see a confirmation with the install path.

**Silent install** (no prompts, installs to `%USERPROFILE%\.claude`):

```powershell
AppCardTool-Setup.exe /VERYSILENT
```

The EXE bundles the skill, mirrors it into place (clearing any old copy), and
needs no administrator rights.

---

## Option B — Install with the script (from a git checkout)

Use this if you want the source on the machine (e.g. to develop the skill).

1. Clone the repo into your GitHub root:

   ```powershell
   cd $env:USERPROFILE\GitHub        # or wherever you keep repos
   git clone https://github.com/SolutionsHarmony/PivsToolbox.git
   cd PivsToolbox
   ```

2. Run the installer script (PowerShell 7):

   ```powershell
   pwsh scripts/Install-AppCardSkill.ps1
   ```

   This copies `skills/appcard/` to `%USERPROFILE%\.claude\skills\appcard`. To
   install into a different skills root:

   ```powershell
   pwsh scripts/Install-AppCardSkill.ps1 -DestinationRoot "D:\some\.claude\skills"
   ```

---

## Option C — macOS / Linux (one-line install)

Paste this into a terminal. It downloads the pinned release, installs the skill
to `~/.claude/skills/appcard`, and prints a confirmation. No git checkout needed.

```sh
curl -fsSL https://raw.githubusercontent.com/SolutionsHarmony/PivsToolbox/v1.1.1/scripts/install-appcard-mac.sh | sh
```

Re-run the same line any time to update or repair the install.

**Overrides** (optional environment variables):

```sh
# install a specific release tag
APPCARD_VERSION=v1.1.1 curl -fsSL https://raw.githubusercontent.com/SolutionsHarmony/PivsToolbox/v1.1.1/scripts/install-appcard-mac.sh | sh

# install into a different skills root
CLAUDE_SKILLS_DIR="$HOME/somewhere/.claude/skills" curl -fsSL https://raw.githubusercontent.com/SolutionsHarmony/PivsToolbox/v1.1.1/scripts/install-appcard-mac.sh | sh
```

Requires `curl` and `tar` (both ship with macOS). **Uninstall:**
`rm -rf ~/.claude/skills/appcard`.

---

## Load the skill

Skills load when a Claude Code session starts, so **start a new Claude Code
session** after installing. (It sometimes hot-loads in an existing session, but a
fresh session is the reliable way.)

Verify it's available: type `/` and look for **`appcard`** in the skill list.

---

## Use it in a project

Open Claude Code with your **current directory at the root of the repo** you want
a card for, then:

### Create the card (first time)

```text
/appcard create
```

Claude will:
1. **Deep-dive** the repo (`.md`, `.txt`, `.ps1`, `.sh`, code, and `git log`).
2. Write a **proposal** to `docs/files/appcard/cardupdate/<timestamp>-card-update.md`
   (a local working file — not committed).
3. **Ask you** to reconcile any conflicts or gaps (project variables, sections
   that don't apply, etc.).
4. Write **`docs/appcard.md`** and commit it as `App Card Updated - <timestamp>`.
5. Print a link to the card plus any files it added.

### Refresh one section

```text
/appcard update production
```

Resolves the word to one section (e.g. *Updating Production Safely*), backs up the
current card, regenerates **only that section** from the codebase, and leaves your
protected regions untouched.

### Rebuild the whole card

```text
/appcard update all
```

Backs up the card, rebuilds every managed section from the codebase, and
re-inserts your protected regions where they were.

---

## Protected (user-owned) regions

Anything between these markers is **yours** — the skill never edits, moves, or
deletes it (it only reads it to avoid duplication):

```markdown
<!-- appcard:protect:start id="my-notes" -->
Your notes / custom section here.
<!-- appcard:protect:end -->
```

Every freshly created card includes a live example near the top. Use this for
custom sections you don't want regenerated.

---

## Where things live (in a target repo)

```
docs/appcard.md                                       the card (committed)
docs/files/appcard/<media>                            images/HTML you reference (committed)
docs/files/appcard/backups/<file>/<name>-<ts>.<ext>   automatic pre-change backups (committed)
docs/files/appcard/cardupdate/<ts>-card-update.md     proposal reports (local only — gitignore these)
```

Restore a card from a backup by copying a timestamped file back over `docs/appcard.md`.

---

## Updating the tool later

- **EXE:** run a newer `AppCardTool-Setup.exe` (it mirrors the latest skill into place).
- **Script (Windows):** `git pull` in the checkout, then `pwsh scripts/Install-AppCardSkill.ps1` again.
- **macOS / Linux:** re-run the Option C one-liner (bump the `v…` tag for a newer release).

Either way, start a new Claude Code session to pick up the change.
