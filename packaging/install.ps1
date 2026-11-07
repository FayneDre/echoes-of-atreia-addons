# Installe les addons Echoes of Atreia dans un client Aion 4.8.
# Lance par install.bat (double-clic), ou : powershell -ExecutionPolicy Bypass -File install.ps1 -Client "D:\Jeux\Aion\Aion 4.8 NA"
# Chaque fichier du client remplace est garde dans <client>\EchoesAddonsBackup ; uninstall.ps1 remet le client tel qu'il etait.
param([string]$Client)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$built = Join-Path $here 'client'
$backupDir = 'EchoesAddonsBackup'

# Les archives signees du client, que l'installation signe a nouveau avec notre cle : seulement si ce sont celles d'origine.
$stock = @{
  'bin32/bin32.pak'                = 'a2e8c3f27390a678f278e4a972d2555bb6828748815444d96be9afd09eaff065'
  'Data/func_pet/func_pet.pak'     = '3bb6e072aaca44920a712eca3c4fdde5f7368aa58f3c7c51d546263499b8b850'
  'Plugin/RelicCalc/RelicCalc.pak' = 'cf26cce84a4997abe47b8eb0be266024cc79b01c69a7e379e3bd51604b98daf7'
}

try {
  if (-not $Client) {
    $Client = Read-Host 'Dossier du client Aion (celui qui contient bin64 et Pub.key)'
  }
  $Client = $Client.Trim('"', ' ')
  if (-not (Test-Path (Join-Path $Client 'Pub.key')) -or -not (Test-Path (Join-Path $Client 'bin64'))) {
    throw "Ce n'est pas un dossier de client Aion : $Client"
  }
  $running = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith($Client, 'OrdinalIgnoreCase') }
  if ($running) {
    throw 'Le jeu est ouvert : fermez-le avant d''installer.'
  }
  foreach ($path in $stock.Keys) {
    $hash = (Get-FileHash -Algorithm SHA256 (Join-Path $Client $path)).Hash.ToLower()
    if ($hash -ne $stock[$path]) {
      throw "$path n'est pas le fichier d'origine du client 4.8 : rien n'est installe."
    }
  }

  $manifestPath = Join-Path $Client "$backupDir\backup.json"
  if (Test-Path $manifestPath) {
    $backup = Get-Content $manifestPath -Raw | ConvertFrom-Json
    $replaced = @($backup.replaced)
    $added = @($backup.added)
  } else {
    $replaced = @()
    $added = @()
  }

  $files = Get-ChildItem $built -Recurse -File | ForEach-Object { $_.FullName.Substring($built.Length + 1).Replace('\', '/') }
  foreach ($path in $files) {
    $target = Join-Path $Client $path
    if (($replaced -notcontains $path) -and ($added -notcontains $path)) {
      if (Test-Path $target) {
        $saved = Join-Path $Client "$backupDir\$path"
        New-Item -ItemType Directory -Force (Split-Path -Parent $saved) | Out-Null
        Copy-Item $target $saved
        $replaced += $path
      } else {
        $added += $path
      }
      New-Item -ItemType Directory -Force (Join-Path $Client $backupDir) | Out-Null
      # ecrit apres chaque fichier : une installation interrompue sait encore quoi defaire
      [System.IO.File]::WriteAllText($manifestPath, (@{ replaced = $replaced; added = $added } | ConvertTo-Json))
    }
    New-Item -ItemType Directory -Force (Split-Path -Parent $target) | Out-Null
    Copy-Item (Join-Path $built $path) $target -Force
  }
  Write-Host ''
  Write-Host "Installe : $($files.Count) fichier(s). En jeu, la ligne [Combat Meter] loaded apparait a la connexion, puis /dps ouvre la fenetre." -ForegroundColor Green
} catch {
  Write-Host ''
  Write-Host $_.Exception.Message -ForegroundColor Red
}
Read-Host 'Entree pour fermer'
