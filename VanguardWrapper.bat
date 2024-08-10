@echo off
title Batch Script - 2XKO Wrapper :: Auto enable and disable Vanguard
echo Enabling Riot Vanguard...
@start /wait sc start vgc >nul 2>&1

echo Launching 2XKO!
@start "2XKO" "path to\Riot Games\Riot Client\RiotClientServices.exe" --launch-product=lion --launch-patchline=live >nul 2>&1
:: The above line is the directory that is contained in the 2XKO shortcut, launching the lion.exe results in many issues.

echo Waiting for 2XKO to close...

:waitloop
@timeout /t 10 >nul
@tasklist /fi "imagename eq Lion.exe" | find /i "Lion.exe" >nul
@if errorlevel 1 (
    echo 2XKO closed, disabling Vanguard process...
    @start /wait sc stop vgc >nul 2>&1
    echo Vanguard has been disabled.
    @timeout /t 3 >nul
    @exit
) else (
    @goto waitloop
)
