param(
  [string]$EnvFile = ".env.local"
)

if (-not (Test-Path $EnvFile)) {
  Write-Host "Missing $EnvFile. Copy .env.local.example to .env.local and fill values." -ForegroundColor Yellow
  exit 1
}

if (-not (Test-Path "node_modules")) {
  npm install
}

npm run dev
