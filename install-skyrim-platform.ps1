param(
  [string]$SkyrimPath = "E:\Steam\SteamInstallFolder\steamapps\common\Skyrim Special Edition",
  [string]$WatchDir = "$env:USERPROFILE\Downloads"
)

Write-Host "=== VOA Skyrim Platform installer ===" -ForegroundColor Cyan
Write-Host "Game: $SkyrimPath"
Write-Host ""
Write-Host "1) Download Skyrim Platform 2.9+ for AE 1.6.1170 from Nexus (browser should open)."
Write-Host "   https://www.nexusmods.com/skyrimspecialedition/mods/54909?tab=files"
Write-Host "2) Save the zip into: $WatchDir"
Write-Host "3) This script will detect it and install automatically."
Write-Host ""

function Install-FromArchive($archive) {
  Write-Host "Installing from: $archive"
  $tmp = Join-Path $env:TEMP ("sp-install-" + [guid]::NewGuid().ToString("n"))
  New-Item -ItemType Directory -Force -Path $tmp | Out-Null
  if ($archive -match '\.7z$') {
    $7z = @(
      "C:\Program Files\7-Zip\7z.exe",
      "C:\Users\wehrm\Desktop\ProjectAetherius\red-house-public\server\bin\7za.exe"
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $7z) { throw "Need 7-Zip to extract .7z" }
    & $7z x $archive "-o$tmp" -y | Out-Null
  } else {
    Expand-Archive -Path $archive -DestinationPath $tmp -Force
  }

  # Find SkyrimPlatform.dll in extract tree
  $dll = Get-ChildItem $tmp -Recurse -Filter "SkyrimPlatform.dll" | Select-Object -First 1
  if (-not $dll) { throw "No SkyrimPlatform.dll in archive" }
  Write-Host "Found DLL: $($dll.FullName) ($($dll.Length) bytes)"

  # Determine package root (folder containing Data or SKSE)
  $root = $dll.Directory
  while ($root -and $root.FullName -ne $tmp) {
    if ((Test-Path (Join-Path $root.FullName "Data")) -or (Test-Path (Join-Path $root.FullName "SKSE"))) { break }
    if ($root.Name -eq "Plugins" -and $root.Parent.Name -eq "SKSE") {
      # package root is two levels up from Plugins if structure is Data/SKSE/Plugins
      $maybe = $root.Parent.Parent  # Data
      if ($maybe.Name -eq "Data") { $root = $maybe.Parent; break }
      if ($maybe.Parent) { $root = $maybe.Parent; break }
    }
    $root = $root.Parent
  }
  if (-not $root) { $root = Get-Item $tmp }

  Write-Host "Package root: $($root.FullName)"

  # Backup client plugins
  $plugins = Join-Path $SkyrimPath "Data\Platform\Plugins"
  $bak = Join-Path $env:TEMP "voa-skymp-plugins-bak"
  New-Item -ItemType Directory -Force -Path $bak | Out-Null
  if (Test-Path $plugins) { Copy-Item "$plugins\skymp5-*" $bak -Force -ErrorAction SilentlyContinue }

  # Remove old incompatible dll
  $sePlugins = Join-Path $SkyrimPath "Data\SKSE\Plugins"
  Get-ChildItem $sePlugins -Filter "SkyrimPlatform.dll*" -ErrorAction SilentlyContinue | ForEach-Object {
    if ($_.Name -ne "SkyrimPlatform.ini") {
      Write-Host "Removing old $($_.Name)"
      Remove-Item $_.FullName -Force
    }
  }

  # Copy package into Skyrim
  if (Test-Path (Join-Path $root.FullName "Data")) {
    robocopy (Join-Path $root.FullName "Data") (Join-Path $SkyrimPath "Data") /E /IS /IT /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
  } else {
    # loose SKSE/Platform at root
    foreach ($sub in @("SKSE","Platform","Scripts","Interface")) {
      $src = Join-Path $root.FullName $sub
      if (Test-Path $src) {
        $dst = if ($sub -eq "SKSE" -or $sub -eq "Platform" -or $sub -eq "Scripts" -or $sub -eq "Interface") {
          Join-Path $SkyrimPath "Data\$sub"
        } else { Join-Path $SkyrimPath $sub }
        # SKSE at root of package often means Data/SKSE
        if ($sub -eq "SKSE" -and -not (Test-Path (Join-Path $root.FullName "Data"))) {
          $dst = Join-Path $SkyrimPath "Data\SKSE"
        }
        if ($sub -eq "Platform" -and -not (Test-Path (Join-Path $root.FullName "Data"))) {
          $dst = Join-Path $SkyrimPath "Data\Platform"
        }
        robocopy $src $dst /E /IS /IT /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
      }
    }
    # Also if dll is directly under extract SKSE/Plugins
    if (Test-Path (Join-Path $tmp "SKSE\Plugins\SkyrimPlatform.dll")) {
      Copy-Item (Join-Path $tmp "SKSE\Plugins\*") $sePlugins -Force -Recurse
    }
  }

  # Ensure dll is in place (direct copy from found path)
  Copy-Item $dll.FullName (Join-Path $sePlugins "SkyrimPlatform.dll") -Force

  # Restore VOA client files
  New-Item -ItemType Directory -Force -Path $plugins | Out-Null
  Copy-Item "$bak\skymp5-*" $plugins -Force -ErrorAction SilentlyContinue

  # Final check
  $final = Get-Item (Join-Path $sePlugins "SkyrimPlatform.dll")
  Write-Host ""
  Write-Host "INSTALLED: $($final.FullName)" -ForegroundColor Green
  Write-Host "Size: $($final.Length)  Date: $($final.LastWriteTime)"
  Write-Host ""
  Write-Host "Next: Launch SKSE via VOA Play. On main menu press ~ and look for Hello Multiplayer."
  Write-Host "Do NOT use vanilla New Game for multiplayer."
  Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}

# Already in downloads?
$candidates = Get-ChildItem $WatchDir -File -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -match 'Skyrim.?Platform|SP-AE|SP-SE|platform.*2\.[89]|54909' -or ($_.Extension -match '\.(zip|7z)$' -and $_.Name -match 'Platform|skyrim.?platform') } |
  Sort-Object LastWriteTime -Descending

if ($candidates) {
  Write-Host "Found existing archive(s):"
  $candidates | ForEach-Object { Write-Host " - $($_.Name)" }
  Install-FromArchive $candidates[0].FullName
  exit 0
}

Write-Host "Waiting for download in $WatchDir (15 min timeout)..."
$deadline = (Get-Date).AddMinutes(15)
while ((Get-Date) -lt $deadline) {
  $hit = Get-ChildItem $WatchDir -File -ErrorAction SilentlyContinue |
    Where-Object {
      $_.LastWriteTime -gt (Get-Date).AddHours(-2) -and
      $_.Extension -match '\.(zip|7z)$' -and
      ($_.Name -match 'Platform|platform|SP-AE|SP-SE|skymp' -or $_.Length -gt 40MB -and $_.Length -lt 200MB)
    } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($hit) {
    # wait for file size to stabilize (download finished)
    $s1 = $hit.Length
    Start-Sleep 2
    $s2 = (Get-Item $hit.FullName).Length
    if ($s1 -eq $s2 -and $s1 -gt 1MB) {
      Install-FromArchive $hit.FullName
      exit 0
    }
  }
  Start-Sleep 3
}
Write-Host "Timed out. Download Platform 2.9 for 1.6.1170, put zip in Downloads, re-run this script."
exit 1
