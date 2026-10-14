param([switch]$DryRun)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
# ONE bounded launch of the unauthorized-caller probe as gcos-operator (a SID that is NOT the authorized client).
# Windows runas owns the password prompt; this script never reads, captures or stores it.
# TOCTOU-safe: the operator process runs a tiny fixed bootstrap that reads the staged file ONCE, verifies its
# SHA-256 in memory, and executes those same bytes. A file swapped after staging can only cause a hash mismatch.
$source='C:\Users\W11\Desktop\projects\content-systems\gcos-central-recovery\scripts\operator-bridge\unauthorized-caller-probe.ps1'  # reviewed probe, unchanged
$stageDir='C:\Users\Public\Documents\GCOSProbe'
$stage=Join-Path $stageDir 'probe.ps1'
$result=Join-Path $stageDir 'result.json'
[byte[]]$bytes=[IO.File]::ReadAllBytes($source)
$sha=[Security.Cryptography.SHA256]::Create()
try{$hash=([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
$bootstrap="`$b=[IO.File]::ReadAllBytes('$stage');if(([BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash(`$b))-replace'-').ToLower()-ceq'$hash'){try{iex([Text.Encoding]::UTF8.GetString(`$b))}catch{}}else{'PROBE_HASH_MISMATCH'}"
$encoded=$null  # runas fails with 1734 on ~1000-char commands; plain short bootstrap instead
$windir=[Environment]::GetFolderPath('Windows')
$ps=Join-Path $windir 'System32\WindowsPowerShell\v1.0\powershell.exe'
$inner=$ps+' -NoProfile -NoExit -Command '+$bootstrap
if($inner.Length -ge 600 -or $inner.Contains('"') -or $inner.Contains('%')){throw 'RUNAS_COMMAND_UNSAFE'}
$info=[ordered]@{probeSha256=$hash;runasCommandLength=$inner.Length;bootstrapChars=$bootstrap.Length;stage=$stage;result=$result;passwordCapture=$false;bootstrapB64=$null}
if($DryRun){$info.dryRun=$true;[PSCustomObject]$info|ConvertTo-Json -Compress;exit 0}
if(-not (Get-Process GCOSBroker -ErrorAction SilentlyContinue)){throw 'BROKER_NOT_RUNNING'}
[IO.Directory]::CreateDirectory($stageDir)|Out-Null
[IO.File]::WriteAllBytes($stage,$bytes)
if(Test-Path -LiteralPath $result){Remove-Item -LiteralPath $result}
$cmd=Join-Path $windir 'System32\cmd.exe'
$runas=Join-Path $windir 'System32\runas.exe'
$account=$env:COMPUTERNAME+'\gcos-operator'
if($account -notmatch '^[A-Za-z0-9-]+\\gcos-operator$'){throw 'LOCAL_ACCOUNT_NAME_INVALID'}
$arguments='/d /k '+$runas+' /profile /user:'+$account+' "'+$inner+'"'
$p=Start-Process -FilePath $cmd -ArgumentList $arguments -WindowStyle Normal -PassThru
$info.consoleProcessId=$p.Id
[PSCustomObject]$info|ConvertTo-Json -Compress
