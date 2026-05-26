$workspace = $PSScriptRoot
$envRoot = Join-Path $env:USERPROFILE "miniforge3\envs\sambaseannotation"

if (-not (Test-Path "$envRoot\python.exe")) {
  Write-Error "Could not find sambaseannotation environment at $envRoot. Create it with: conda env create -f environment.yml"
  exit 1
}

$env:PATH = "$envRoot;$envRoot\Library\bin;$envRoot\Scripts;$env:PATH"

Set-Location $workspace
& "$envRoot\python.exe" "$workspace\web_app.py"
