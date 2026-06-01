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
$installRoot = Join-Path $env:USERPROFILE "miniforge3"

function Install-Miniforge {
  param([string]$DestinationRoot)

  $architecture = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()
  switch ($architecture) {
    "x64" { $installerName = "Miniforge3-Windows-x86_64.exe" }
    "arm64" { $installerName = "Miniforge3-Windows-arm64.exe" }
    default {
      Write-Error "Unsupported Windows architecture: $architecture"
      exit 1
    }
  }

  $installerUrl = "https://github.com/conda-forge/miniforge/releases/latest/download/$installerName"
  $installerPath = Join-Path $env:TEMP $installerName

  Write-Host "Miniforge를 찾지 못했습니다. 자동 설치를 시작합니다."
  Write-Host "Downloading: $installerUrl"
  Invoke-WebRequest -Uri $installerUrl -OutFile $installerPath

  $arguments = @(
    "/InstallationType=JustMe",
    "/RegisterPython=0",
    "/AddToPath=0",
    "/S",
    "/D=$DestinationRoot"
  )
  $process = Start-Process -FilePath $installerPath -ArgumentList $arguments -Wait -PassThru
  Remove-Item $installerPath -ErrorAction SilentlyContinue
  if ($process.ExitCode -ne 0) {
    Write-Error "Miniforge installation failed with exit code $($process.ExitCode)."
    exit $process.ExitCode
  }
}

if (-not (Get-Command conda.exe -ErrorAction SilentlyContinue)) {
  $candidate = Join-Path $installRoot "Scripts\conda.exe"
  if (Test-Path $candidate) {
    $condaCmd = $candidate
  } else {
    Install-Miniforge -DestinationRoot $installRoot
    $condaCmd = Join-Path $installRoot "Scripts\conda.exe"
    if (-not (Test-Path $condaCmd)) {
      Write-Error "Miniforge 설치 후 conda를 찾지 못했습니다."
      exit 1
    }
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
