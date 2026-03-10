[CmdletBinding()]
param(
    [int]$BackendPort = 8000,
    [int]$FrontendPort = 5173,
    [int]$HealthTimeoutSeconds = 45,
    [switch]$SkipInstall,
    [switch]$OpenBrowser,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Quote-Single {
    param([string]$Text)
    return $Text -replace "'", "''"
}

function Wait-ForUrl {
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [Parameter(Mandatory = $true)][int]$TimeoutSeconds
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 3 | Out-Null
            return $true
        } catch {
            Start-Sleep -Seconds 1
        }
    }

    return $false
}

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$FrontendDir = Join-Path $Root "frontend"
$ActivateScript = Join-Path $Root ".venv\Scripts\Activate.ps1"
$BackendHealthUrl = "http://localhost:$BackendPort/health"
$FrontendUrl = "http://localhost:$FrontendPort"

if (-not (Test-Path $ActivateScript)) {
    throw "Missing virtual environment activation script at $ActivateScript"
}

if (-not (Test-Path (Join-Path $FrontendDir "package.json"))) {
    throw "Frontend workspace not found at $FrontendDir"
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "npm is not available in PATH. Install Node.js first."
}

$QuotedRoot = Quote-Single $Root
$QuotedFrontendDir = Quote-Single $FrontendDir
$QuotedActivate = Quote-Single $ActivateScript

$BackendLines = @(
    '$ErrorActionPreference = "Stop"',
    "Set-Location '$QuotedRoot'",
    "& '$QuotedActivate'"
)

if (-not $SkipInstall) {
    $BackendLines += 'python -m pip install --disable-pip-version-check -r requirements.txt'
    $BackendLines += 'python -m pip install --disable-pip-version-check -r api\requirements_api.txt'
}

$BackendLines += "uvicorn api.main:app --reload --port $BackendPort"
$BackendCommand = $BackendLines -join "; "

$FrontendLines = @(
    '$ErrorActionPreference = "Stop"',
    "Set-Location '$QuotedFrontendDir'"
)

if (-not $SkipInstall) {
    $FrontendLines += 'npm install'
}

$FrontendLines += "npm run dev -- --port $FrontendPort"
$FrontendCommand = $FrontendLines -join "; "

if ($DryRun) {
    Write-Host "Backend command:"
    Write-Host $BackendCommand
    Write-Host ""
    Write-Host "Frontend command:"
    Write-Host $FrontendCommand
    exit 0
}

Write-Host "Starting NovaScience backend in a new PowerShell window..."
Start-Process powershell -WorkingDirectory $Root -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    $BackendCommand
) | Out-Null

Write-Host "Starting NovaScience frontend in a new PowerShell window..."
Start-Process powershell -WorkingDirectory $FrontendDir -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    $FrontendCommand
) | Out-Null

Write-Host "Waiting for backend health check at $BackendHealthUrl ..."
$BackendReady = Wait-ForUrl -Url $BackendHealthUrl -TimeoutSeconds $HealthTimeoutSeconds

if ($BackendReady) {
    try {
        $Health = Invoke-RestMethod -Uri $BackendHealthUrl -TimeoutSec 3
        Write-Host "Backend healthy:" ($Health | ConvertTo-Json -Compress)
    } catch {
        Write-Host "Backend responded, but health payload could not be parsed."
    }
} else {
    Write-Warning "Backend health check timed out after $HealthTimeoutSeconds seconds."
}

Write-Host "Waiting for frontend at $FrontendUrl ..."
$FrontendReady = Wait-ForUrl -Url $FrontendUrl -TimeoutSeconds $HealthTimeoutSeconds

if ($FrontendReady) {
    Write-Host "Frontend is reachable at $FrontendUrl"
} else {
    Write-Warning "Frontend check timed out after $HealthTimeoutSeconds seconds."
}

if ($OpenBrowser) {
    Start-Process $FrontendUrl | Out-Null
}

Write-Host ""
Write-Host "NovaScience launch complete."
Write-Host "Backend:  $BackendHealthUrl"
Write-Host "Frontend: $FrontendUrl"
Write-Host "Use Ctrl+C in the spawned PowerShell windows to stop the servers."
