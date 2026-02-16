# Portable: resolve paths relative to this script's location
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$RootDir = $ScriptDir

$env:PATH = "$RootDir\node20\node-v20.19.2-win-x64;" + $env:PATH
Write-Host "Node.js version: $(node --version)"
Set-Location "$RootDir\backend"
& "$RootDir\node20\node-v20.19.2-win-x64\npx.cmd" nest start
