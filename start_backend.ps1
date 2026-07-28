<#
.SYNOPSIS
    Auto-starts backend + localtunnel, then updates Vercel environment variable.

.DESCRIPTION
    1. Starts FastAPI backend on port 8000
    2. Starts localtunnel on port 8000
    3. Captures the generated tunnel URL
    4. Updates NEXT_PUBLIC_API_URL on Vercel via CLI
    5. Triggers a redeploy

.NOTES
    Requires: Node.js, npm (for localtunnel), Vercel CLI (npx vercel)
    Run this script once when you want to start developing or expose backend.
#>

$ErrorActionPreference = "Continue"

# ── Configuration ──
$BACKEND_DIR = "$PSScriptRoot\backend"
$BACKEND_PORT = 8000
$TUNNEL_SUBDOMAIN = "dsp-backend-afif-19"  # Consistent subdomain for localtunnel

Write-Host ""
Write-Host "╔══════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  DSP Analytics - Auto Backend + Tunnel       ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ── Step 1: Start Backend ──
Write-Host "[1/4] Starting FastAPI backend on port $BACKEND_PORT..." -ForegroundColor Yellow

$backendProcess = Start-Process -FilePath "python" `
    -ArgumentList "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "$BACKEND_PORT", "--reload" `
    -WorkingDirectory $BACKEND_DIR `
    -PassThru `
    -NoNewWindow

Write-Host "  Backend PID: $($backendProcess.Id)" -ForegroundColor Green

# Wait for backend to be ready
Write-Host "  Waiting for backend to start..." -ForegroundColor DarkGray
Start-Sleep -Seconds 3

$maxRetries = 10
$ready = $false
for ($i = 0; $i -lt $maxRetries; $i++) {
    try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:$BACKEND_PORT/health" -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            $ready = $true
            break
        }
    } catch {
        Start-Sleep -Seconds 1
    }
}

if (-not $ready) {
    Write-Host "  WARNING: Backend may not be ready yet, continuing anyway..." -ForegroundColor Red
} else {
    Write-Host "  Backend is ready!" -ForegroundColor Green
}

# ── Step 2: Start Localtunnel ──
Write-Host ""
Write-Host "[2/4] Starting localtunnel on port $BACKEND_PORT..." -ForegroundColor Yellow

# Check if localtunnel is installed
$ltInstalled = npm list -g localtunnel 2>$null | Select-String "localtunnel"
if (-not $ltInstalled) {
    Write-Host "  Installing localtunnel globally..." -ForegroundColor DarkGray
    npm install -g localtunnel 2>$null
}

# Start localtunnel and capture URL
$tunnelOutput = ""
$tunnelJob = Start-Job -ScriptBlock {
    param($port, $subdomain)
    & npx localtunnel --port $port --subdomain $subdomain 2>&1
} -ArgumentList $BACKEND_PORT, $TUNNEL_SUBDOMAIN

# Wait for URL to appear in output
$tunnelUrl = ""
$timeout = 30
for ($i = 0; $i -lt $timeout; $i++) {
    Start-Sleep -Seconds 1
    $output = Receive-Job -Job $tunnelJob -ErrorAction SilentlyContinue
    if ($output) {
        $urlMatch = $output | Select-String -Pattern "(https?://[^\s]+\.loca\.lt)" -AllMatches
        if ($urlMatch) {
            $tunnelUrl = $urlMatch.Matches[0].Value
            break
        }
    }
}

if (-not $tunnelUrl) {
    Write-Host "  ERROR: Could not get tunnel URL after ${timeout}s" -ForegroundColor Red
    Write-Host "  Try running manually: npx localtunnel --port $BACKEND_PORT --subdomain $TUNNEL_SUBDOMAIN" -ForegroundColor DarkGray
    
    # Fallback — use the expected URL
    $tunnelUrl = "https://$TUNNEL_SUBDOMAIN.loca.lt"
    Write-Host "  Using expected URL: $tunnelUrl" -ForegroundColor Yellow
}

Write-Host "  Tunnel URL: $tunnelUrl" -ForegroundColor Green

# ── Step 3: Update Vercel Environment Variable ──
$API_URL = "$tunnelUrl/api/v1"
Write-Host ""
Write-Host "[3/4] Updating Vercel env NEXT_PUBLIC_API_URL = $API_URL" -ForegroundColor Yellow

# Save to .env.local for reference
$envFile = "$PSScriptRoot\frontend\.env.local"
"NEXT_PUBLIC_API_URL=$API_URL" | Set-Content -Path $envFile -Encoding UTF8
Write-Host "  Saved to .env.local" -ForegroundColor Green

# Try to update Vercel env var via CLI
try {
    # Remove existing env var first (ignore errors if it doesn't exist)
    npx vercel env rm NEXT_PUBLIC_API_URL production -y 2>$null
    
    # Add new env var
    echo $API_URL | npx vercel env add NEXT_PUBLIC_API_URL production 2>$null
    
    Write-Host "  Vercel env updated!" -ForegroundColor Green
} catch {
    Write-Host "  WARNING: Could not update Vercel env via CLI." -ForegroundColor Yellow
    Write-Host "  Please update manually in Vercel Dashboard:" -ForegroundColor Yellow
    Write-Host "    NEXT_PUBLIC_API_URL = $API_URL" -ForegroundColor White
}

# ── Step 4: Trigger Redeploy ──
Write-Host ""
Write-Host "[4/4] Triggering Vercel redeploy..." -ForegroundColor Yellow

try {
    npx vercel --prod 2>$null
    Write-Host "  Redeploy triggered!" -ForegroundColor Green
} catch {
    Write-Host "  WARNING: Could not trigger redeploy via CLI." -ForegroundColor Yellow
    Write-Host "  Push a commit to GitHub to trigger auto-deploy." -ForegroundColor Yellow
}

# ── Summary ──
Write-Host ""
Write-Host "╔══════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  All Systems Running!                        ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Backend:    http://127.0.0.1:$BACKEND_PORT" -ForegroundColor White
Write-Host "  Tunnel:     $tunnelUrl" -ForegroundColor White
Write-Host "  API URL:    $API_URL" -ForegroundColor White
Write-Host ""
Write-Host "  Press Ctrl+C to stop all services." -ForegroundColor DarkGray
Write-Host ""

# Keep running — wait for Ctrl+C
try {
    while ($true) {
        Start-Sleep -Seconds 60
        
        # Check if backend is still alive
        try {
            $response = Invoke-WebRequest -Uri "http://127.0.0.1:$BACKEND_PORT/health" -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
        } catch {
            Write-Host "[$(Get-Date -Format 'HH:mm:ss')] WARNING: Backend may be down!" -ForegroundColor Red
        }
    }
} finally {
    Write-Host ""
    Write-Host "Shutting down..." -ForegroundColor Yellow
    
    # Cleanup
    if ($backendProcess -and -not $backendProcess.HasExited) {
        Stop-Process -Id $backendProcess.Id -Force -ErrorAction SilentlyContinue
        Write-Host "  Backend stopped." -ForegroundColor Green
    }
    if ($tunnelJob) {
        Stop-Job -Job $tunnelJob -ErrorAction SilentlyContinue
        Remove-Job -Job $tunnelJob -Force -ErrorAction SilentlyContinue
        Write-Host "  Tunnel stopped." -ForegroundColor Green
    }
    
    Write-Host "  All services stopped." -ForegroundColor Green
}
