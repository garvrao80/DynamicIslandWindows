$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or !$env:RUNNER_TEMP) { throw 'Only run on a disposable Actions runner.' }
$installer = @(Get-ChildItem release/LyricsIsland-Setup-*-x64.exe)
if ($installer.Count -ne 1) { throw 'Expected exactly one x64 installer.' }
$dest = Join-Path $env:RUNNER_TEMP 'LyricsIsland-Smoke'
if (Test-Path -LiteralPath $dest) { throw "Installation directory already exists: $dest" }
$setup = Start-Process -FilePath $installer[0].FullName -ArgumentList "/S /currentuser /D=$dest" -PassThru
if (!$setup.WaitForExit(120000)) { throw 'Installer timed out.' }
if ($setup.ExitCode -ne 0) { throw "Installer exited with $($setup.ExitCode)" }
$exe = Join-Path $dest 'Lyrics Island.exe'
if (!(Test-Path -LiteralPath $exe) -or !(Test-Path -LiteralPath (Join-Path $dest 'resources/app.asar'))) { throw 'Installed files missing.' }
function Get-AppProcesses { Get-CimInstance Win32_Process -Filter "Name = 'Lyrics Island.exe'" | Where-Object ExecutablePath -eq $exe }
try {
  if (!(Get-AppProcesses)) { Start-Process -FilePath $exe }
  $deadline = (Get-Date).AddSeconds(45)
  do {
    Start-Sleep -Seconds 1
    $renderer = @(Get-AppProcesses | Where-Object CommandLine -like '*--type=renderer*')
  } until ($renderer.Count -or (Get-Date) -gt $deadline)
  if (!$renderer.Count) { throw 'Installed app failed to start a renderer.' }
  Start-Sleep -Seconds 4
  if (!(Get-AppProcesses | Where-Object CommandLine -like '*--type=renderer*')) { throw 'Installed renderer exited early.' }
  Write-Host 'Per-user installation and packaged app launch passed.'
} finally {
  Get-AppProcesses | ForEach-Object { Stop-Process -Id $_.ProcessId -ErrorAction SilentlyContinue }
}
