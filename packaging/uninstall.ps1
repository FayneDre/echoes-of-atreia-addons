# Remet le client Aion tel qu'il etait avant install.ps1 : les fichiers d'origine reviennent, ceux des addons s'en vont.
param([string]$Client, [switch]$NoPause)

$ErrorActionPreference = 'Stop'
$backupDir = 'EchoesAddonsBackup'

try {
  if (-not $Client) {
    $Client = Read-Host 'Dossier du client Aion (celui qui contient bin64 et Pub.key)'
  }
  $Client = $Client.Trim('"', ' ')
  $manifestPath = Join-Path $Client "$backupDir\backup.json"
  if (-not (Test-Path $manifestPath)) {
    throw "Aucun addon installe dans $Client."
  }
  $running = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith($Client, 'OrdinalIgnoreCase') }
  if ($running) {
    throw 'Le jeu est ouvert : fermez-le avant de desinstaller.'
  }
  $backup = Get-Content $manifestPath -Raw | ConvertFrom-Json
  foreach ($path in @($backup.replaced)) {
    Copy-Item (Join-Path $Client "$backupDir\$path") (Join-Path $Client $path) -Force
  }
  foreach ($path in @($backup.added)) {
    $target = Join-Path $Client $path
    Remove-Item $target -Force -ErrorAction SilentlyContinue
    $folder = Split-Path -Parent $target
    if ((Test-Path $folder) -and -not (Get-ChildItem $folder -Force)) {
      Remove-Item $folder
    }
  }
  Remove-Item (Join-Path $Client $backupDir) -Recurse -Force
  Write-Host ''
  Write-Host 'Le client est revenu tel qu''il etait.' -ForegroundColor Green
} catch {
  Write-Host ''
  Write-Host $_.Exception.Message -ForegroundColor Red
  if ($NoPause) { exit 1 }
}
if (-not $NoPause) { Read-Host 'Entree pour fermer' }
