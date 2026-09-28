# HSGM (runner_region=TR) scheduled run on a Windows PC. See hekimler_tr_runner_setup.md (option 2).
#   .\hekimler_hsgm_local_task.ps1 -Run [-DryRun]   run HSGM once (what the scheduled task executes)
#   .\hekimler_hsgm_local_task.ps1 -Install         register the daily task (does not run it)
#   .\hekimler_hsgm_local_task.ps1 -Uninstall       remove the task (log and token file are left alone)
# The ingest token is read from $HOME\.hekimler_token (outside the repo) and is never printed or logged.
param([switch]$Run, [switch]$DryRun, [switch]$Install, [switch]$Uninstall, [string]$Time = "07:17")

$TaskName = "Hekimler-HSGM-Daily"
$Repo     = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$Root     = Join-Path $Repo "channels\tip-ogrencileri-platformu"
$LogDir   = Join-Path $HOME "hekimler-report"
$Log      = Join-Path $LogDir "hsgm-run.log"
$Flag     = Join-Path $LogDir "HSGM-LAST-RUN-FAILED.txt"
$TokenFile = Join-Path $HOME ".hekimler_token"

function Write-Log($m) { Add-Content -Path $Log -Value ("{0} {1}" -f (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ"), $m) -Encoding UTF8 }

if ($Uninstall) { Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false; "removed $TaskName"; exit 0 }

if ($Install) {
    $self = $MyInvocation.MyCommand.Path
    $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$self`" -Run"
    $trigger = New-ScheduledTaskTrigger -Daily -At $Time
    # StartWhenAvailable = run at next opportunity (e.g. next boot) after a missed schedule
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -MultipleInstances IgnoreNew
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description "Hekimler HSGM daily ingest (Turkiye egress)" | Out-Null
    "registered $TaskName daily at $Time (StartWhenAvailable)"; exit 0
}

if (-not $Run) { "use -Run, -Install or -Uninstall"; exit 2 }

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$fail = $null
$env:GCOS_HUB_URL = "https://global-content-os.channel-content-os-mcp.workers.dev"
$env:HEKIMLER_CONTINUOUS_INGESTION_ENABLED = "true"
$env:PYTHONIOENCODING = "utf-8"
if (-not $DryRun) {
    if (-not (Test-Path $TokenFile)) { $fail = "ingest token file missing: $TokenFile" }
    else { $env:TIP_RADAR_INGEST_TOKEN = (Get-Content $TokenFile -Raw).Trim() }
}
if (-not $fail) {
    $args = @("scripts\hekimler_scheduled_run.py", "--sources", "hsgm_public_health", "--report-dir", (Join-Path $LogDir "report"))
    if ($DryRun) { $args += "--dry-run" }
    Push-Location $Root
    $out = & python @args 2>&1 | Out-String
    $code = $LASTEXITCODE
    Pop-Location
    Write-Log ("exit={0} dry_run={1}" -f $code, [bool]$DryRun)
    Add-Content -Path $Log -Value ($out -split "`n" | Where-Object { $_ -match "^(hsgm|sources=|::error|> \*\*)" }) -Encoding UTF8
    if ($code -ne 0) { $fail = "runner exit code $code (network error, source failure or D1 quota; see $Log)" }
}
if ($fail) {
    Write-Log "FAILED: $fail"
    Set-Content -Path $Flag -Value ("{0} {1}" -f (Get-Date).ToUniversalTime().ToString("o"), $fail) -Encoding UTF8
    try { & msg.exe $env:USERNAME "Hekimler HSGM run FAILED: $fail" } catch {}
    exit 1
}
Remove-Item -Path $Flag -ErrorAction SilentlyContinue
Write-Log "OK"
exit 0
