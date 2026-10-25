# Start API+Web and open Tokens UI (Windows). No secrets bundled.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$ApiPort = if ($env:API_PORT) { $env:API_PORT } else { "3847" }
$WebPort = if ($env:WEB_PORT) { $env:WEB_PORT } else { "4321" }
$TokensUrl = "http://127.0.0.1:${WebPort}/merchant/tokens"

if (-not (Test-Path "$Root\.env")) {
  Copy-Item "$Root\deploy\.env.example" "$Root\.env"
  Write-Host "Created .env from deploy/.env.example"
}

New-Item -ItemType Directory -Force -Path "$Root\.local", "$Root\data" | Out-Null

$healthy = $false
try {
  $r = Invoke-WebRequest -Uri "http://127.0.0.1:${ApiPort}/health" -UseBasicParsing -TimeoutSec 2
  if ($r.StatusCode -lt 500) { $healthy = $true }
} catch { $healthy = $false }

if (-not $healthy) {
  Write-Host "Starting stack via npm run dev:up …"
  npm run dev:up
}

$firstRun = -not (Test-Path "$Root\.local\first-run-done")
if ($firstRun) {
  (Get-Date).ToUniversalTime().ToString("o") | Set-Content "$Root\.local\first-run-done"
  Start-Process $TokensUrl
} else {
  Start-Process "http://127.0.0.1:${WebPort}/merchant"
}
