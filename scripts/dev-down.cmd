@echo off
rem Apaga la API, el frontend y los contenedores locales (los datos se conservan).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev-up.ps1" -Detener
echo.
pause
