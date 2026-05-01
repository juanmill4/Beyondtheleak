@echo off
:: ============================================================
::  DarkEye — Start All Services
::  Double-click this file to launch everything.
:: ============================================================

:: Request admin privileges (needed to start PostgreSQL service)
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting administrator privileges...
    powershell -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "%~dp0start_all.ps1"
if %errorlevel% neq 0 pause
