@echo off
setlocal
pushd "%~dp0" || exit /b 1
curl.exe --silent --fail --noproxy "*" --max-time 3 http://127.0.0.1:41673/ | findstr /L /C:"<title>Cavity flow" >nul
if not errorlevel 1 (
    start "" "http://127.0.0.1:41673/"
    popd
    exit /b 0
)
call npm.cmd run launch
set "launchExit=%errorlevel%"
popd
if not "%launchExit%"=="0" pause
exit /b %launchExit%
