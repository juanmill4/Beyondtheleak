# ============================================================
#  DarkEye - Start All Services
#  Uso: powershell -ExecutionPolicy Bypass -File .\start_all.ps1
# ============================================================

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$backendDir = Join-Path $root "osint-backend"

# -- Colores para los mensajes ------------------------------
function Write-Banner  { param($msg) Write-Host "`n*  $msg" -ForegroundColor Cyan }
function Write-Ok      { param($msg) Write-Host "   [OK] $msg"  -ForegroundColor Green }
function Write-Warn    { param($msg) Write-Host "   [!] $msg"  -ForegroundColor Yellow }
function Write-Err     { param($msg) Write-Host "   [X] $msg"  -ForegroundColor Red }

Write-Host ""
Write-Host "  +--------------------------------------------------+" -ForegroundColor DarkCyan
Write-Host "  |      DarkEye - Service Launcher                  |" -ForegroundColor DarkCyan
Write-Host "  +--------------------------------------------------+" -ForegroundColor DarkCyan
Write-Host ""

# -- Crear directorio de logs ------------------------------
$logsDir = Join-Path $backendDir "logs"
if (-Not (Test-Path $logsDir)) { New-Item -ItemType Directory -Path $logsDir -Force | Out-Null }

# -- 1. Comprobar que existe el virtualenv ------------------
Write-Banner "Checking virtual environment..."
$venvActivate = Join-Path $backendDir "venv\Scripts\activate.ps1"
if (-Not (Test-Path $venvActivate)) {
    Write-Err "Virtual environment 'venv' not found in osint-backend."
    Write-Err "Run:  cd osint-backend; python -m venv venv; venv\Scripts\activate; pip install -r requirements.txt"
    exit 1
}
Write-Ok "Virtual environment found."

# -- 2. Comprobar .env -------------------------------------
$envFile    = Join-Path $backendDir ".env"
$envExample = Join-Path $backendDir ".env.example"
if (-Not (Test-Path $envFile)) {
    Write-Warn ".env not found - copying from .env.example"
    Copy-Item $envExample $envFile
}
Write-Ok ".env loaded."

# -- 3. PostgreSQL (Windows service) -----------------------
Write-Banner "Checking PostgreSQL..."
$pgServiceName = "postgresql-x64-18"
try {
    $pgService = Get-Service -Name $pgServiceName -ErrorAction Stop

    if ($pgService.Status -eq "Running") {
        Write-Ok "PostgreSQL service is already running."
    } else {
        Write-Warn "PostgreSQL service is stopped - starting it..."
        Start-Service -Name $pgServiceName -ErrorAction Stop
        Write-Ok "PostgreSQL service started."
    }

    # Wait for port 5432 to accept connections (max 15s)
    $ready = $false
    for ($i = 0; $i -lt 15; $i++) {
        try {
            $tcp = New-Object System.Net.Sockets.TcpClient
            $tcp.Connect("127.0.0.1", 5432)
            $tcp.Close()
            $ready = $true
            break
        } catch {
            Start-Sleep -Seconds 1
        }
    }
    if ($ready) {
        Write-Ok "PostgreSQL accepting connections on port 5432."
    } else {
        Write-Err "PostgreSQL started but port 5432 not responding after 15s."
    }
} catch {
    Write-Warn "PostgreSQL service '$pgServiceName' not found."
    Write-Warn "Make sure PostgreSQL is installed or running externally."
}

# -- 4. Redis (Docker Compose) -----------------------------
Write-Banner "Starting Redis (Docker Compose)..."
try {
    $composeFile = Join-Path $backendDir "docker-compose.yml"
    
    # Intenta docker-compose (v1) o docker compose (v2)
    if (Get-Command docker-compose -ErrorAction SilentlyContinue) {
        docker-compose -f $composeFile up -d 2>&1 | Out-Null
    } else {
        docker compose -f $composeFile up -d 2>&1 | Out-Null
    }
    
    Write-Ok "Redis container is running on port 6379."
} catch {
    Write-Warn "Docker not available or compose failed - skipping Redis container."
    Write-Warn "Make sure Redis is running externally if you need Celery."
}

# -- 5. FastAPI (uvicorn) ----------------------------------
Write-Banner "Starting FastAPI server (port 8000)..."
$pythonExe = Join-Path $backendDir "venv\Scripts\python.exe"
$env:VIRTUAL_ENV = Join-Path $backendDir "venv"

$fastapi = Start-Process -NoNewWindow -PassThru -FilePath $pythonExe -ArgumentList "-m", "uvicorn", "app.main:app", "--reload", "--host", "0.0.0.0", "--port", "8000" -WorkingDirectory $backendDir -RedirectStandardOutput (Join-Path $logsDir "fastapi_stdout.log") -RedirectStandardError (Join-Path $logsDir "fastapi_stderr.log")

Write-Ok "FastAPI  PID $($fastapi.Id)  ->  http://localhost:8000"
Write-Ok "Logs: osint-backend\logs\fastapi_stdout.log / fastapi_stderr.log"

# -- 6. Celery Worker -------------------------------------
Write-Banner "Starting Celery worker..."
$celery = Start-Process -NoNewWindow -PassThru -FilePath $pythonExe -ArgumentList "-m", "celery", "-A", "app.core.celery_app", "worker", "--loglevel=info", "--pool=threads" -WorkingDirectory $backendDir -RedirectStandardOutput (Join-Path $logsDir "celery_stdout.log") -RedirectStandardError  (Join-Path $logsDir "celery_stderr.log")

Write-Ok "Celery   PID $($celery.Id)"
Write-Ok "Logs: osint-backend\logs\celery_stdout.log / celery_stderr.log"

# -- 7. Vite Dev Server (Frontend) ------------------------
Write-Banner "Starting Vite dev server (port 5173)..."
$npmCmd = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
if (-Not $npmCmd) {
    Write-Err "npm not found in PATH - skipping Vite."
    $vite = $null
} else {
    $vite = Start-Process -NoNewWindow -PassThru -FilePath "cmd.exe" -ArgumentList "/c", "npm", "run", "dev" -WorkingDirectory $root -RedirectStandardOutput (Join-Path $logsDir "vite_stdout.log") -RedirectStandardError  (Join-Path $logsDir "vite_stderr.log")

    Write-Ok "Vite     PID $($vite.Id)  ->  http://localhost:5173"
    Write-Ok "Logs: osint-backend\logs\vite_stdout.log / vite_stderr.log"
}

# -- Resumen -----------------------------------------------
$fPid = $fastapi.Id.ToString().PadRight(6)
$cPid = $celery.Id.ToString().PadRight(6)
$vPid = if ($vite) { $vite.Id.ToString().PadRight(6) } else { "N/A   " }

Write-Host ""
Write-Host "  +--------------------------------------------------+" -ForegroundColor DarkCyan
Write-Host "  |  All services launched!                          |" -ForegroundColor DarkCyan
Write-Host "  |                                                  |" -ForegroundColor DarkCyan
Write-Host "  |  PostgreSQL -> localhost:5432  (service)         |" -ForegroundColor DarkCyan
Write-Host "  |  Redis      -> localhost:6379  (Docker)          |" -ForegroundColor DarkCyan
Write-Host "  |  FastAPI    -> localhost:8000  PID $fPid         |" -ForegroundColor DarkCyan
Write-Host "  |  Celery     -> worker          PID $cPid         |" -ForegroundColor DarkCyan
Write-Host "  |  Vite       -> localhost:5173  PID $vPid         |" -ForegroundColor DarkCyan
Write-Host "  |                                                  |" -ForegroundColor DarkCyan
Write-Host "  |  Press Ctrl+C to stop all services.              |" -ForegroundColor DarkCyan
Write-Host "  +--------------------------------------------------+" -ForegroundColor DarkCyan
Write-Host ""

# -- Esperar a Ctrl+C y limpiar al salir -------------------
try {
    Write-Host "[Watching services - Ctrl+C to stop]" -ForegroundColor DarkGray
    while ($true) {
        if ($fastapi.HasExited) {
            Write-Err "FastAPI process exited (code $($fastapi.ExitCode)). Check logs\fastapi_stderr.log"
            break
        }
        if ($celery.HasExited) {
            Write-Err "Celery process exited (code $($celery.ExitCode)). Check logs\celery_stderr.log"
            break
        }
        if ($vite -and $vite.HasExited) {
            Write-Err "Vite process exited (code $($vite.ExitCode)). Check logs\vite_stderr.log"
            break
        }
        Start-Sleep -Seconds 2
    }
} finally {
    Write-Host "`nShutting down services..." -ForegroundColor Yellow

    if (-Not $fastapi.HasExited) {
        Stop-Process -Id $fastapi.Id -Force -ErrorAction SilentlyContinue
        Write-Ok "FastAPI stopped."
    }
    if (-Not $celery.HasExited) {
        Stop-Process -Id $celery.Id -Force -ErrorAction SilentlyContinue
        Write-Ok "Celery stopped."
    }
    if ($vite -and -Not $vite.HasExited) {
        Stop-Process -Id $vite.Id -Force -ErrorAction SilentlyContinue
        Write-Ok "Vite stopped."
    }

    Write-Host "All services stopped. Goodbye!" -ForegroundColor Cyan
}
