param(
  [Parameter(Mandatory)][string]$Directory,
  [ValidateRange(1, 10000)][int]$MaxWaitMilliseconds = 10000
)

$ErrorActionPreference = 'Stop'
$clock = [Diagnostics.Stopwatch]::StartNew()
if (Test-Path -LiteralPath $Directory) {
  Write-Output 'Waiting for owned installation directory removal'
}
while ((Test-Path -LiteralPath $Directory) -and $clock.Elapsed.TotalMilliseconds -lt $MaxWaitMilliseconds) {
  Start-Sleep -Milliseconds 100
}
if (Test-Path -LiteralPath $Directory) {
  throw 'Owned uninstaller left the installation directory behind'
}
