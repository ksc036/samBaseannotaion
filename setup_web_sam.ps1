$workspace = $PSScriptRoot
$settingsPath = Join-Path $workspace "runtime.env"

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

if (-not (Get-Command conda.exe -ErrorAction SilentlyContinue)) {
  $candidate = Join-Path $env:USERPROFILE "miniforge3\Scripts\conda.exe"
  if (Test-Path $candidate) {
    $condaCmd = $candidate
  } else {
    Write-Error "Could not find conda. Install Miniforge first: https://conda-forge.org/download/"
    exit 1
  }
} else {
  $condaCmd = (Get-Command conda.exe).Source
}

Set-Location $workspace

$envList = & $condaCmd env list --json | ConvertFrom-Json
$hasEnvironment = $false
foreach ($prefix in $envList.envs) {
  if ([System.IO.Path]::GetFileName($prefix) -eq $envName) {
    $hasEnvironment = $true
    break
  }
}

if ($hasEnvironment) {
  Write-Host "Updating conda environment: $envName"
  & $condaCmd env update -n $envName -f environment.yml --prune
} else {
  Write-Host "Creating conda environment: $envName"
  & $condaCmd env create -n $envName -f environment.yml
}

if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

Write-Host "Environment is ready: $envName"
