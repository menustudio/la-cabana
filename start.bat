@echo off
rem ADIC2 La Cabana — local server launcher
cd /d "%~dp0"
start "" http://localhost:4180
where python >nul 2>nul
if %errorlevel%==0 (
  python -m http.server 4180
) else (
  npx serve -l 4180 .
)
