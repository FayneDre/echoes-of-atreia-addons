@echo off
rem Lance install.ps1 sans la politique d'execution de PowerShell, qui refuse un script non signe venu d'un zip telecharge.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
