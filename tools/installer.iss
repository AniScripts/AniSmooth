; AniSmooth After Effects Extension Inno Setup Script
; Compile this script using Inno Setup to create AniSmoothSetup.exe

[Setup]
AppName=AniSmooth After Effects Extension
AppVersion=1.0.0
AppPublisher=AniSmooth
AppPublisherURL=https://github.com/AniScripts/AniSmooth
DefaultDirName={commoncf}\Adobe\CEP\extensions\AniSmooth
DisableDirPage=yes
DefaultGroupName=AniSmooth
DisableProgramGroupPage=yes
OutputDir={#OutputDir}
OutputBaseFilename={#OutputName}
Compression=lzma
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
VersionInfoVersion=1.0.0
VersionInfoCompany=AniSmooth
VersionInfoDescription=AniSmooth After Effects Extension Setup Wizard
VersionInfoCopyright=Copyright (C) 2026 AniSmooth
VersionInfoProductName=AniSmooth After Effects Extension Installer
VersionInfoProductVersion=1.0.0

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
; Copy files from the structured "Extension Folder" directory
Source: "{#SourcePath}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs

[Registry]
; Enable player debug mode across CSXS versions so unsigned files load correctly
Root: HKCU; Subkey: "Software\Adobe\CSXS.9"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"; Flags: createvalueifdoesntexist uninsdeletevalue
Root: HKCU; Subkey: "Software\Adobe\CSXS.10"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"; Flags: createvalueifdoesntexist uninsdeletevalue
Root: HKCU; Subkey: "Software\Adobe\CSXS.11"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"; Flags: createvalueifdoesntexist uninsdeletevalue
Root: HKCU; Subkey: "Software\Adobe\CSXS.12"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"; Flags: createvalueifdoesntexist uninsdeletevalue
Root: HKCU; Subkey: "Software\Adobe\CSXS.13"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"; Flags: createvalueifdoesntexist uninsdeletevalue
Root: HKCU; Subkey: "Software\Adobe\CSXS.14"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"; Flags: createvalueifdoesntexist uninsdeletevalue

[Code]
function InitializeSetup(): Boolean;
var
  DestDir: String;
begin
  Result := True;

  DestDir := ExpandConstant('{commoncf}\Adobe\CEP\extensions\AniSmooth');

  if DirExists(DestDir) then
  begin
    if MsgBox('An existing version of AniSmooth Extension was found.' #13#10 #13#10 'Do you want to overwrite it and continue with the installation?', mbConfirmation, MB_YESNO) = IDNO then
    begin
      Result := False;
    end;
  end;
end;
