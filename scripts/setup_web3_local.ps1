param(
  [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$web3Dir = Join-Path $root "web3"

if (-not $SkipInstall) {
  Write-Host "[web3] Installing local Hardhat dependencies..."
  Push-Location $web3Dir
  npm install
  Pop-Location
}

Write-Host "[web3] Starting local Hardhat node in a new terminal..."
$nodeCommand = "Set-Location '$web3Dir'; npm run node"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $nodeCommand | Out-Null

Write-Host "[web3] Waiting for RPC at http://127.0.0.1:8545 ..."
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  try {
    $body = '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
    $resp = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:8545" -ContentType "application/json" -Body $body -TimeoutSec 3
    if ($resp.result) {
      $ready = $true
      break
    }
  } catch {
    Start-Sleep -Milliseconds 500
  }
}

if (-not $ready) {
  throw "Local Hardhat RPC did not become ready on port 8545."
}

Write-Host "[web3] Deploying contracts and updating .env ..."
Push-Location $web3Dir
npm run deploy:local
Pop-Location

Write-Host "[web3] Done. Restart backend so it picks up new env values."
