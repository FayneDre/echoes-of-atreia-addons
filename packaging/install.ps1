# Installe les addons Echoes of Atreia dans un client Aion 4.8.
# Lance par install.bat (double-clic), ou : powershell -ExecutionPolicy Bypass -File install.ps1 -Client "D:\Jeux\Aion\Aion 4.8 NA" [-NoPause]
# Chaque fichier du client remplace est garde dans <client>\EchoesAddonsBackup ; uninstall.ps1 remet le client tel qu'il etait.
# bin64\game.dll est corrige sur place (voir tools/gamePatch.ts et docs/game-dll.md) : la fenetre d'un addon peut ouvrir une page, et le
# client fait confiance a nos addons comme aux plugins de l'editeur (sans quoi un addon qui demande le menu du jeu n'est pas charge).
# Les valeurs ci-dessous sont celles de tools/gamePatch.ts ; tests/packaging.test.ts verifie qu'elles le restent.
param([string]$Client, [switch]$NoPause)

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
$gameDll = 'bin64/game.dll'
$gameDllStock = '5334cf2164468678e45fe1a5decf58a0fbc4fd7f22cfdcbb87d28edce8d2c11c'
$gameDllPatched = 'c61d2570eb6fb23527aacf6ca11e431c898cecde741432dcc22cadbcd0a3b284'
# game.dll tel que l'ont corrige des versions precedentes : corrige a nouveau a partir de l'original garde dans la sauvegarde.
$gameDllOutdated = @(
  'd1174b32e55e0189194e143c4a3008b54bcc0e2dd62def87c87c2c3865f34d73'
)
# La correction : l'ancien corps de LoadUrlWithWebAuth rempli d'int3, puis chaque ecriture (decalage dans le fichier, octets).
$patchFillStart = 0x6058c0
$patchFillEnd = 0x605b93
$patchEdits = @(
  @(0x6058c0, '4883ec28488b4118488d5020483b5110772483780803751e837818047518f20f2c104c8b40104983c018488d0d5f5fd000e88a73b2ff31c04883c428c3'),
  @(0x605b00, '436f6d6261744d6574657200'),
  @(0xed7058, '005b601000000000')
)

function Save-Backup {
  New-Item -ItemType Directory -Force (Join-Path $Client $backupDir) | Out-Null
  [System.IO.File]::WriteAllText($manifestPath, (@{ replaced = @($replaced); added = @($added) } | ConvertTo-Json))
}

try {
  if (-not $Client) {
    $Client = Read-Host 'Dossier du client Aion (celui qui contient bin64 et Pub.key)'
  }
  $Client = (Resolve-Path $Client.Trim('"', ' ')).Path
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
    try {
      $backup = Get-Content $manifestPath -Raw | ConvertFrom-Json
    } catch {
      throw "$backupDir\backup.json est illisible : rien n'est change, les originaux qu'il liste seraient perdus."
    }
    $replaced = @($backup.replaced)
    $added = @($backup.added)
  } else {
    $replaced = @()
    $added = @()
  }

  $gameDllPath = Join-Path $Client $gameDll
  $stockCopy = Join-Path $Client "$backupDir\$gameDll"
  $gameDllHash = (Get-FileHash -Algorithm SHA256 $gameDllPath).Hash.ToLower()
  if ($gameDllHash -eq $gameDllStock) {
    $dllState = 'stock'
  } elseif ($gameDllHash -eq $gameDllPatched) {
    $dllState = 'patched'
  } elseif ($gameDllOutdated -contains $gameDllHash) {
    $dllState = 'outdated'
  } else {
    throw "$gameDll n'est ni le fichier d'origine du client 4.8 ni une version corrigee : rien n'est installe."
  }
  if ($dllState -ne 'stock' -and $replaced -notcontains $gameDll) {
    throw "$gameDll est deja corrige mais la sauvegarde n'en a pas l'original : une desinstallation ne pourrait pas le remettre."
  }

  $files = @(Get-ChildItem $built -Recurse -File | ForEach-Object { $_.FullName.Substring($built.Length + 1).Replace('\', '/') })
  # un addon qu'une installation precedente a mis et que celle-ci n'a plus : ses fichiers s'en vont, la sauvegarde les oublie
  foreach ($path in @($added | Where-Object { $files -notcontains $_ })) {
    $target = Join-Path $Client $path
    Remove-Item $target -Force -ErrorAction SilentlyContinue
    $folder = Split-Path -Parent $target
    if ((Test-Path $folder) -and -not (Get-ChildItem $folder -Force)) {
      Remove-Item $folder
    }
    $added = @($added | Where-Object { $_ -ne $path })
    Save-Backup
  }
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
      # ecrit apres chaque fichier : une installation interrompue sait encore quoi defaire
      Save-Backup
    }
    New-Item -ItemType Directory -Force (Split-Path -Parent $target) | Out-Null
    Copy-Item (Join-Path $built $path) $target -Force
  }

  if ($dllState -ne 'patched') {
    if ($dllState -eq 'stock' -and $replaced -notcontains $gameDll) {
      New-Item -ItemType Directory -Force (Split-Path -Parent $stockCopy) | Out-Null
      Copy-Item $gameDllPath $stockCopy
      $replaced += $gameDll
      Save-Backup
    }
    $source = if ($dllState -eq 'stock') { $gameDllPath } else { $stockCopy }
    if ((Get-FileHash -Algorithm SHA256 $source).Hash.ToLower() -ne $gameDllStock) {
      throw "L'original de $gameDll garde dans la sauvegarde n'est pas le fichier d'origine : rien n'est corrige."
    }
    $bytes = [System.IO.File]::ReadAllBytes($source)
    for ($i = $patchFillStart; $i -lt $patchFillEnd; $i++) { $bytes[$i] = 0xcc }
    foreach ($edit in $patchEdits) {
      $offset = $edit[0]
      $hex = $edit[1]
      for ($i = 0; $i -lt $hex.Length / 2; $i++) { $bytes[$offset + $i] = [Convert]::ToByte($hex.Substring(2 * $i, 2), 16) }
    }
    [System.IO.File]::WriteAllBytes($gameDllPath, $bytes)
    if ((Get-FileHash -Algorithm SHA256 $gameDllPath).Hash.ToLower() -ne $gameDllPatched) {
      Copy-Item $stockCopy $gameDllPath -Force
      throw "La correction de $gameDll n'a pas donne le fichier attendu : l'original est remis."
    }
  }
  Write-Host ''
  Write-Host "Installe : $($files.Count) fichier(s). En jeu, la ligne [Combat Meter] loaded apparait a la connexion ; Combat Meter est dans le menu du jeu, sous Additional Functions (ou /dps)." -ForegroundColor Green
} catch {
  Write-Host ''
  Write-Host $_.Exception.Message -ForegroundColor Red
  if ($NoPause) { exit 1 }
}
if (-not $NoPause) { Read-Host 'Entree pour fermer' }
