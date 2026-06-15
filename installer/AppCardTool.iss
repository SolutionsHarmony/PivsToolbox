; AppCardTool.iss — Inno Setup script for the "App Card Tool"
;
; Bundles the appcard Claude Code skill and installs it to
;   <chosen .claude folder>\skills\appcard
; Default target is %USERPROFILE%\.claude (so the skill lands in
;   %USERPROFILE%\.claude\skills\appcard  — active for ALL projects).
;
; This produces the same result as running scripts/Install-AppCardSkill.ps1,
; but as a self-contained installer that needs no git checkout on the machine.
;
; Build:   "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer\AppCardTool.iss
; Silent:  AppCardTool-Setup.exe /VERYSILENT   (installs to %USERPROFILE%\.claude, no prompts)

#define MyAppName "App Card Tool"
#define MyAppVersion "1.1.2"
#define MyAppPublisher "Solutions Harmony Inc."

[Setup]
AppId={{8F2C1A4E-3B5D-4C6F-9A1E-7D2B8C3F0A12}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
; {app} is the .claude folder the user picks; the skill installs under it.
DefaultDirName={%USERPROFILE}\.claude
UsePreviousAppDir=yes
DisableProgramGroupPage=yes
UninstallDisplayName={#MyAppName}
OutputDir=.
OutputBaseFilename=AppCardTool-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
; Installs into the user profile — no administrator rights required.
PrivilegesRequired=lowest

[Messages]
; Make the destination page clear that we are choosing the .claude folder.
SelectDirLabel3=Setup will install the appcard skill into the "skills\appcard" sub-folder of the .claude folder shown below. The default works for all projects on this account.
SelectDirBrowseLabel=To continue, click Next. To install into a different .claude folder, click Browse.

[Files]
; Bundle the entire skill source tree (SKILL.md, schema.md, template.md, reference\*).
Source: "..\skills\appcard\*"; DestDir: "{app}\skills\appcard"; Flags: ignoreversion recursesubdirs createallsubdirs

[InstallDelete]
; Mirror behaviour: clear any previous install first so removed/renamed files
; never linger (matches Install-AppCardSkill.ps1).
Type: filesandordirs; Name: "{app}\skills\appcard"

[UninstallDelete]
; On uninstall, remove only the appcard skill folder (never the whole .claude).
Type: filesandordirs; Name: "{app}\skills\appcard"

[Code]
procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    if not WizardSilent() then
      MsgBox('App Card Tool installed to:' + #13#10 +
             ExpandConstant('{app}\skills\appcard') + #13#10#13#10 +
             'Start a new Claude Code session, then run "/appcard create" in any repo.',
             mbInformation, MB_OK);
  end;
end;
