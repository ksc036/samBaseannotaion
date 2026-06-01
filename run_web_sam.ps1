$workspace = $PSScriptRoot
$settingsPath = Join-Path $workspace "runtime.env"
$logDir = Join-Path $workspace "logs"
$logPath = Join-Path $logDir "web_sam.log"

function Get-Settings {
  param([string]$Path)
  $settings = @{}
  if (-not (Test-Path $Path)) {
    return $settings
  }

  foreach ($line in Get-Content $Path) {
    if ([string]::IsNullOrWhiteSpace($line) -or $line.Trim().StartsWith("#")) {
      continue
    }
    $parts = $line -split "=", 2
    if ($parts.Length -eq 2) {
      $settings[$parts[0].Trim()] = $parts[1].Trim()
    }
  }
  return $settings
}

$settings = Get-Settings -Path $settingsPath
$envName = if ($settings.ContainsKey("APP_ENV_NAME")) { $settings["APP_ENV_NAME"] } else { "sambaseannotation" }
$appHost = if ($settings.ContainsKey("APP_HOST")) { $settings["APP_HOST"] } else { "0.0.0.0" }
$appPort = if ($settings.ContainsKey("APP_PORT")) { $settings["APP_PORT"] } else { "8765" }
$appEntry = if ($settings.ContainsKey("APP_ENTRY")) { $settings["APP_ENTRY"] } else { "web_app.py" }

$envRoot = Join-Path $env:USERPROFILE "miniforge3\envs\$envName"
if (-not (Test-Path "$envRoot\python.exe")) {
  Write-Error "Could not find $envName environment at $envRoot. Run setup_web_sam.ps1 first."
  exit 1
}

$env:PATH = "$envRoot;$envRoot\Library\bin;$envRoot\Scripts;$env:PATH"
$env:APP_HOST = $appHost
$env:APP_PORT = $appPort

if (-not (Test-Path $logDir)) {
  New-Item -ItemType Directory -Path $logDir | Out-Null
}

Set-Location $workspace
& "$envRoot\python.exe" (Join-Path $workspace $appEntry) *>> $logPath
