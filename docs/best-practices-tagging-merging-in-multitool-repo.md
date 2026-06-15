# Best Practices: Tagging & Merging in a Multi-Tool Repo

Guidance for `SolutionsHarmony/PivsToolbox`, a single repo that holds several
independent tools. Keep the monorepo; version and release each tool on its own.

---

## 1. Versioning & releases

Version each tool **independently** using **component-scoped tags**. A tag marks a
whole-repo snapshot, but the GitHub *Release* attaches only that tool's artifact.

| Tool | Version source of truth | Release tag format |
|------|-------------------------|--------------------|
| Token Monster (extension) | `ClaudeTime/manifest.json` → `version` | `tokenmonster-vX.Y.Z` |
| AppCard skill | `version:` in `skills/appcard/SKILL.md` (or a `VERSION` file) | `appcard-vX.Y.Z` |
| Standalone script | `# vX.Y.Z` comment in the script header | `<script-name>-vX.Y.Z` |

**Conventions**
- Use **SemVer** per tool: `MAJOR.MINOR.PATCH`.
- Tags are **always component-prefixed** so streams never collide.
- Keep a short **CHANGELOG** per tool (or a root `CHANGELOG.md` with per-tool sections).
- **Pin install references to the component tag**, never a repo-wide number.

**Example — cut an AppCard release**
```sh
# 1. bump the version in the tool's source of truth, commit it
# 2. tag and push
git tag appcard-v1.1.2
git push origin appcard-v1.1.2
# 3. create the GitHub Release (attach the relevant asset if any)
gh release create appcard-v1.1.2 \
  --title "AppCard v1.1.2" \
  --notes "Fix install path; update template."
```

**Example — script header carrying its own version**
```sh
#!/usr/bin/env sh
# install-appcard-mac.sh — v1.2.0
```

**Example — a pinned install reference (uses the component tag)**
```sh
curl -fsSL \
  https://raw.githubusercontent.com/SolutionsHarmony/PivsToolbox/appcard-v1.1.2/scripts/install-appcard-mac.sh \
  | sh
```

---

## 2. Merge behavior (quick reference)

Git merges by comparing each branch to the **common ancestor**, not by file age.

| Scenario | What git does |
|----------|---------------|
| Only one branch changed file X | That branch's version is kept — clean |
| Each branch changed **different** files | Both kept — clean |
| Both changed the **same file, different lines** | Both edits merged — clean |
| Both changed the **same lines** of the same file | **CONFLICT** — you resolve; never silently overwritten |

Guarantee: git protects against **silent data loss** (it conflicts), not "newest wins."

---

## 3. Keeping merges clean (workflow)

1. **One tool per branch** — scope each branch to a single tool/script so branches
   rarely touch the same files.
2. **Short-lived branches** — merge to `main` often.
3. **Sync `main` into your branch before merging** — resolve any overlap on your
   branch, early, not on `main`.
4. **Avoid stale branches** — the older a branch, the older its merge base and the
   higher the conflict risk; rebase onto `main` to refresh it.

**Example — a clean branch lifecycle**
```sh
git switch -c appcard-fix-install      # branch scoped to one tool
# ...work + commit...

git switch main && git pull            # get latest
git switch appcard-fix-install
git merge main                         # resolve any overlap HERE, early

git switch main
git merge appcard-fix-install          # clean fast/no-conflict merge
git push origin main
```

---

## 4. When to split a tool into its own repo

Stay monorepo by default. Extract a tool only when it earns it:
- heavy traffic or outside contributors,
- distinct release cadence or access control.

Extraction keeps history via `git filter-repo`, so monorepo-now is not a lock-in.
