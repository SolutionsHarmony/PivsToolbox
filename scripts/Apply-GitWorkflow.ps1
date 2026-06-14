#requires -Version 7.0
<#
.SYNOPSIS
    Apply the auto-approved git commit/push workflow to a target repo.

.DESCRIPTION
    Replicates the three changes that establish the "commit early/often, push at
    review points, never ask permission" workflow in another repository:

      1. Adds Bash(git commit:*) and Bash(git push:*) to permissions.allow in
         <repo>\.claude\settings.local.json (created/merged, never overwritten).
      2. Appends the git-workflow section to <repo>\CLAUDE.md (or creates it).
      3. Writes a per-project feedback memory + MEMORY.md index entry under
         %USERPROFILE%\.claude\projects\<sanitized-repo-path>\memory\.

    The script is idempotent and safe to re-run. It writes files only and prints
    a per-file report; it never touches git in the target repo.

    NOTE: the memory location assumes Claude Code's default
    (%USERPROFILE%\.claude\projects\<sanitized>\memory). If you set a custom
    autoMemoryDirectory, adjust accordingly. The <sanitized> form replaces every
    ':' '\' and '/' in the repo's absolute path with '-'.

.PARAMETER RepoPath
    Absolute or relative path to the target repo. Defaults to the current
    directory, so you can cd into a repo and run the script with no arguments.

.EXAMPLE
    .\Apply-GitWorkflow.ps1
    Applies the workflow to the current directory.

.EXAMPLE
    .\Apply-GitWorkflow.ps1 -RepoPath C:\Users\Piv\GitHub\SomeOtherRepo
    Applies the workflow to a specific repo.
#>
[CmdletBinding()]
param(
    [string]$RepoPath = (Get-Location).Path
)

$ErrorActionPreference = 'Stop'

# ---- Templates (here-strings kept at column 0 so the '@ terminators parse) ----

$ClaudeSection = @'
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
'@

$MemoryTemplate = @'
---
name: feedback-git-workflow
description: Commit/push workflow for {{REPO}} — auto-approved, commit constantly, push at review points
metadata:
  type: feedback
---

Never ask permission to commit or push in the {{REPO}} repo. Both are
auto-approved via allow rules in `.claude/settings.local.json`
(`Bash(git commit:*)`, `Bash(git push:*)`), and documented in the repo's
`CLAUDE.md`.

- **Commit early and often** — "you cannot commit too much." Commit every time
  you pause, finish a discrete chunk, or switch tasks.
- **Push** when a big accomplishment is done or when ready for the user's
  review/approval.

**Why:** The user reviews/tests by pulling the repo onto a *separate testing
system*, so the work must be pushed before they can look at it. Frequent commits
mean nothing is lost between steps; pushing at review points removes the
repeated "can I push?" prompt the user kept having to answer across projects.

**How to apply:** Applies to this project. The user has the same pain across
most of their projects — if a new repo shows the same review-by-pull pattern,
offer to set up the same auto-approve + CLAUDE.md workflow.
'@

$PointerLine = '- [Git workflow](feedback_git_workflow.md) — commit/push auto-approved; commit constantly, push at review points (user reviews by pulling on a separate system)'

# ---- Helpers ----

$results = [System.Collections.Generic.List[object]]::new()
function Add-Result {
    param([string]$Status, [string]$File)
    $results.Add([pscustomobject]@{ Status = $Status; File = $File })
}

# ---- Resolve target repo ----

$repo = (Resolve-Path -LiteralPath $RepoPath).Path
if (-not (Test-Path -LiteralPath (Join-Path $repo '.git'))) {
    Write-Warning "No .git directory found in '$repo'. Applying anyway."
}
$repoName = Split-Path $repo -Leaf

# ---- 1. settings.local.json ----

$claudeDir    = Join-Path $repo '.claude'
$settingsPath = Join-Path $claudeDir 'settings.local.json'
$rules        = @('Bash(git commit:*)', 'Bash(git push:*)')

if (-not (Test-Path -LiteralPath $claudeDir)) {
    New-Item -ItemType Directory -Path $claudeDir -Force | Out-Null
}

$settingsExisted = Test-Path -LiteralPath $settingsPath
$settings = @{}
if ($settingsExisted) {
    $raw = Get-Content -LiteralPath $settingsPath -Raw
    if (-not [string]::IsNullOrWhiteSpace($raw)) {
        $settings = $raw | ConvertFrom-Json -AsHashtable
    }
}

if (-not $settings.ContainsKey('permissions')) { $settings['permissions'] = @{} }
if (-not $settings['permissions'].ContainsKey('allow')) { $settings['permissions']['allow'] = @() }

$allow = [System.Collections.Generic.List[string]]::new()
foreach ($r in @($settings['permissions']['allow'])) { $allow.Add([string]$r) }

$added = @()
foreach ($r in $rules) {
    if (-not $allow.Contains($r)) { $allow.Add($r); $added += $r }
}
$settings['permissions']['allow'] = @($allow)

if (-not $settingsExisted) {
    ($settings | ConvertTo-Json -Depth 20) | Set-Content -LiteralPath $settingsPath -Encoding utf8
    Add-Result 'Created' $settingsPath
}
elseif ($added.Count -gt 0) {
    ($settings | ConvertTo-Json -Depth 20) | Set-Content -LiteralPath $settingsPath -Encoding utf8
    Add-Result 'Updated' $settingsPath
}
else {
    Add-Result 'Skipped' $settingsPath
}

# ---- 2. CLAUDE.md ----

$claudeMdPath = Join-Path $repo 'CLAUDE.md'
$marker = 'Git workflow (authorized in advance'

if (Test-Path -LiteralPath $claudeMdPath) {
    $content = Get-Content -LiteralPath $claudeMdPath -Raw
    if ($content -match [regex]::Escape($marker)) {
        Add-Result 'Skipped' $claudeMdPath
    }
    else {
        Add-Content -LiteralPath $claudeMdPath -Value ("`r`n`r`n" + $ClaudeSection)
        Add-Result 'Updated' $claudeMdPath
    }
}
else {
    ("# CLAUDE.md`r`n`r`n" + $ClaudeSection) | Set-Content -LiteralPath $claudeMdPath -Encoding utf8
    Add-Result 'Created' $claudeMdPath
}

# ---- 3. Per-project memory ----

$sanitized = $repo -replace '[:\\/]', '-'
$memDir    = Join-Path $env:USERPROFILE ".claude\projects\$sanitized\memory"
if (-not (Test-Path -LiteralPath $memDir)) {
    New-Item -ItemType Directory -Path $memDir -Force | Out-Null
}

$memFile = Join-Path $memDir 'feedback_git_workflow.md'
if (Test-Path -LiteralPath $memFile) {
    Add-Result 'Skipped' $memFile
}
else {
    ($MemoryTemplate -replace '\{\{REPO\}\}', $repoName) | Set-Content -LiteralPath $memFile -Encoding utf8
    Add-Result 'Created' $memFile
}

# ---- 3b. MEMORY.md index ----

$indexPath = Join-Path $memDir 'MEMORY.md'
if (-not (Test-Path -LiteralPath $indexPath)) {
    "# Memory Index`r`n`r`n## Feedback`r`n$PointerLine" | Set-Content -LiteralPath $indexPath -Encoding utf8
    Add-Result 'Created' $indexPath
}
else {
    $idx = Get-Content -LiteralPath $indexPath -Raw
    if ($idx -match 'feedback_git_workflow\.md') {
        Add-Result 'Skipped' $indexPath
    }
    elseif ($idx -match '(?m)^##\s+Feedback\s*$') {
        $out = [System.Collections.Generic.List[string]]::new()
        $inserted = $false
        foreach ($line in (Get-Content -LiteralPath $indexPath)) {
            $out.Add($line)
            if (-not $inserted -and $line -match '^##\s+Feedback\s*$') {
                $out.Add($PointerLine)
                $inserted = $true
            }
        }
        ($out -join "`r`n") | Set-Content -LiteralPath $indexPath -Encoding utf8
        Add-Result 'Updated' $indexPath
    }
    else {
        Add-Content -LiteralPath $indexPath -Value "`r`n## Feedback`r`n$PointerLine"
        Add-Result 'Updated' $indexPath
    }
}

# ---- Report ----

Write-Host ""
Write-Host "Git-workflow config applied to: $repo"
Write-Host "Memory dir: $memDir"
Write-Host ""
$results | Format-Table -AutoSize Status, File
Write-Host "Memory changes take effect in the next Claude Code session for that repo."
