param(
  [string]$ReleaseDirectory = 'dist/desktop/release',
  [string]$Screenshot = 'artifacts/desktop-launch-windows.png'
)

$ErrorActionPreference = 'Stop'
if ($env:CI -ne 'true' -or -not $env:RUNNER_TEMP) {
  throw 'Package installation checks require an isolated CI runner'
}
$installers = @(Get-ChildItem $ReleaseDirectory -Filter 'meta-sovereign-desktop-windows-installer-*.exe')
$portables = @(Get-ChildItem $ReleaseDirectory -Filter 'meta-sovereign-desktop-windows-portable-*.exe')
if ($installers.Count -ne 1 -or $portables.Count -ne 1) {
  throw 'Expected exactly one installer and one portable exe'
}
foreach ($file in @($installers) + @($portables)) {
  if ($file.Length -lt 10MB) { throw "$($file.Name) is suspiciously small" }
}

$ownedRoot = Join-Path $env:RUNNER_TEMP ('meta-sovereign-install-' + [guid]::NewGuid())
$installDirectory = Join-Path $ownedRoot 'application'
$executable = Join-Path $installDirectory 'meta-sovereign.exe'
New-Item -ItemType Directory -Path $ownedRoot | Out-Null

function Get-OwnedApplication {
  @(Get-Process | Where-Object {
    $_.Path -and $_.Path.StartsWith($installDirectory + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)
  })
}

function Wait-OwnedInstaller($Process) {
  if (-not $Process.WaitForExit(90000)) {
    Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
    throw 'Owned installer did not finish within 90 seconds'
  }
  if ($Process.ExitCode -ne 0) { throw "Owned installer exited $($Process.ExitCode)" }
}

$installer = $null
try {
  # NSIS requires /D last; it consumes the rest of the command line, unquoted.
  # Do not pass --run-after-finish: a silent install must not launch the app.
  $installer = Start-Process -FilePath $installers[0].FullName -ArgumentList "/S /currentuser /D=$installDirectory" -PassThru
  $clock = [Diagnostics.Stopwatch]::StartNew()
  while (-not $installer.HasExited -and $clock.Elapsed.TotalSeconds -lt 90) {
    if ((Get-OwnedApplication).Count) { throw 'Silent installer launched the application' }
    Start-Sleep -Milliseconds 100
  }
  if (-not $installer.HasExited) { throw 'Silent installation exceeded 90 seconds' }
  Wait-OwnedInstaller $installer
  if (-not (Test-Path $executable) -or -not (Test-Path (Join-Path $installDirectory 'resources/app.asar'))) {
    throw 'Silent installation did not produce the packaged application'
  }
  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    if ((Get-OwnedApplication).Count) { throw 'Silent installer launched the application' }
    Start-Sleep -Milliseconds 100
  }
  Write-Output 'Silent installation completed without an automatic application launch'

  # Launch only after the silent-install observation, with the existing owned
  # profile/store and positive native-window, Lino-health and shutdown checks.
  New-Item -ItemType Directory -Force -Path (Split-Path $Screenshot -Parent) | Out-Null
  & node experiments/issue-56/desktop-packaged-launch.mjs $executable $Screenshot
  if ($LASTEXITCODE -ne 0) { throw "Installed application launch failed: $LASTEXITCODE" }
} finally {
  if ($installer -and -not $installer.HasExited) {
    Stop-Process -Id $installer.Id -Force -ErrorAction SilentlyContinue
  }
  Get-OwnedApplication | Stop-Process -Force -ErrorAction SilentlyContinue
  $uninstallers = @(Get-ChildItem $installDirectory -Filter 'Uninstall*.exe' -ErrorAction SilentlyContinue)
  if ($uninstallers.Count -eq 1) {
    Wait-OwnedInstaller (Start-Process -FilePath $uninstallers[0].FullName -ArgumentList '/S' -PassThru)
    for ($attempt = 0; $attempt -lt 100 -and (Test-Path $executable); $attempt++) {
      Start-Sleep -Milliseconds 100
    }
    if (Test-Path $executable) { throw 'Owned uninstaller left the application installed' }
  }
  Remove-Item $ownedRoot -Recurse -Force
}
Write-Output 'Installed package launch and owned uninstall completed'
