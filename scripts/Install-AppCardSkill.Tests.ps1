# scripts/Install-AppCardSkill.Tests.ps1
BeforeAll {
    $script:repo = Split-Path $PSScriptRoot -Parent
    $script:installer = Join-Path $PSScriptRoot 'Install-AppCardSkill.ps1'
    $script:dest = Join-Path ([System.IO.Path]::GetTempPath()) ("appcard-test-" + [guid]::NewGuid())
}
AfterAll {
    if (Test-Path $script:dest) { Remove-Item -Recurse -Force $script:dest }
}
Describe 'Install-AppCardSkill' {
    It 'copies all skill source files to the destination' {
        & $script:installer -DestinationRoot $script:dest
        Test-Path (Join-Path $script:dest 'appcard/SKILL.md')              | Should -BeTrue
        Test-Path (Join-Path $script:dest 'appcard/schema.md')             | Should -BeTrue
        Test-Path (Join-Path $script:dest 'appcard/template.md')           | Should -BeTrue
        Test-Path (Join-Path $script:dest 'appcard/reference/migrations.md') | Should -BeTrue
    }
    It 'is idempotent (second run succeeds and files still present)' {
        & $script:installer -DestinationRoot $script:dest
        Test-Path (Join-Path $script:dest 'appcard/SKILL.md') | Should -BeTrue
    }
    It 'prunes files that no longer exist in source (true mirror)' {
        & $script:installer -DestinationRoot $script:dest
        $stale = Join-Path $script:dest 'appcard/STALE.txt'
        Set-Content -LiteralPath $stale -Value 'stale'
        Test-Path $stale | Should -BeTrue
        & $script:installer -DestinationRoot $script:dest
        Test-Path $stale | Should -BeFalse
    }
}
