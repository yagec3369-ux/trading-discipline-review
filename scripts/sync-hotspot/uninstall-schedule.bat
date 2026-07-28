@echo off
chcp 65001 >nul
setlocal

echo.
echo ========================================
echo   卸载定时同步任务
echo ========================================
echo.

set "times=09:05 11:05 14:05 16:05 21:05"

for %%t in (%times%) do (
    set "taskname=HotspotSync_%%t"
    schtasks /delete /tn "!taskname!" /f >nul 2>&1
    if errorlevel 1 (
        echo   [跳过] !taskname! 不存在
    ) else (
        echo   [删除] !taskname!
    )
)

echo.
echo 卸载完成。
pause
endlocal
