@echo off
setlocal
pushd "%~dp0" || exit /b 1
call npm.cmd run launch
set "launchExit=%errorlevel%"
popd
exit /b %launchExit%
