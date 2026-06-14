#requires -Version 7.0
<#
.SYNOPSIS
    Install the appcard skill into a Claude Code skills directory.
.DESCRIPTION
    Copies skills/appcard/ from this repo into <DestinationRoot>/appcard/
    (default: ~/.claude/skills). Idempotent; clears the destination first so the
    installed copy is an exact mirror of the repo source (files removed/renamed
    in the source do not linger).
.PARAMETER DestinationRoot
    The skills root to install into. Defaults to ~/.claude/skills.
#>
[CmdletBinding()]
param(
    [string]$DestinationRoot = (Join-Path $env:USERPROFILE '.claude\skills')
)
$ErrorActionPreference = 'Stop'

$repo   = Split-Path $PSScriptRoot -Parent
$source = Join-Path $repo 'skills\appcard'
if (-not (Test-Path -LiteralPath $source)) {
    throw "Skill source not found at $source"
}

$dest = Join-Path $DestinationRoot 'appcard'
if (Test-Path -LiteralPath $dest) { Remove-Item -Recurse -Force -LiteralPath $dest }
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item -Path (Join-Path $source '*') -Destination $dest -Recurse -Force

Write-Host "Installed appcard skill to: $dest"
Get-ChildItem -Recurse -File $dest | ForEach-Object {
    Write-Host "  $($_.FullName.Substring($dest.Length).TrimStart('\'))"
}
Write-Host "Restart Claude Code (or start a new session) to pick up the skill."
