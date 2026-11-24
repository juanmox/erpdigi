@echo off
rem Levanta el entorno local (Docker, Postgres, Redis, Superset, API y frontend).
rem Doble clic, o: scripts\dev-up.cmd -SinSuperset
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev-up.ps1" %*
echo.
pause
