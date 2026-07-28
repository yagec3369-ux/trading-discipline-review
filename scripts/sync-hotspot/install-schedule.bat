@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

REM ============================================================
REM  热点数据定时同步 - Windows 计划任务配置
REM  每天 09:05 / 11:05 / 14:05 / 16:05 / 21:05 自动同步
REM ============================================================

set "SYNC_BAT=%~dp0sync.bat"
set "SYNC_DIR=%~dp0"

echo.
echo ========================================
echo   配置定时同步任务
echo ========================================
echo.
echo 同步脚本: %SYNC_BAT%
echo 时间点:   09:05 / 11:05 / 14:05 / 16:05 / 21:05
echo.

REM 检查 schtasks 是否可用
where schtasks >nul 2>&1
if errorlevel 1 (
    echo [错误] 无法找到 schtasks 命令
    pause
    exit /b 1
)

REM 创建 5 个定时任务
set "times=09:05 11:05 14:05 16:05 21:05"

for %%t in (%times%) do (
    set "taskname=HotspotSync_%%t"
    echo 创建任务: !taskname! -> %%t

    schtasks /create /tn "!taskname!" /tr "\"%SYNC_BAT%\"" /sc daily /st %%t /f >nul 2>&1
    if errorlevel 1 (
        echo   [失败] !taskname!
    ) else (
        echo   [成功] !taskname! -> 每天 %%t
    )
)

echo.
echo ========================================
echo   配置完成!
echo ========================================
echo.
echo 已创建以下计划任务:
echo   HotspotSync_09:05  -> 每天 09:05
echo   HotspotSync_11:05  -> 每天 11:05
echo   HotspotSync_14:05  -> 每天 14:05
echo   HotspotSync_16:05  -> 每天 16:05
echo   HotspotSync_21:05  -> 每天 21:05
echo.
echo 查看任务: schtasks /query /tn "HotspotSync_*"
echo 删除任务: 运行 uninstall-schedule.bat
echo.
pause
endlocal
