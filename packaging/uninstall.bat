@echo off
rem Lance uninstall.ps1 sans la politique d'execution de PowerShell, qui refuse un script non signe venu d'un zip telecharge.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall.ps1" %*
