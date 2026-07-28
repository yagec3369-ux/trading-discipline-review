@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

REM ============================================================
REM  热点数据自动同步脚本 (Windows)
REM  用法: 双击运行，或用 Windows 计划任务定时运行
REM ============================================================

REM --- 配置区域 ---
set "REPORTS_DIR=C:\Users\admin\WorkBuddy\2026-05-13-task-7\stock_hotspot\reports"
set "REPO_DIR=%~dp0..\.."

cd /d "%REPO_DIR%"

echo.
echo ========================================
echo   热点数据自动同步
echo ========================================
echo.
echo 报告目录: %REPORTS_DIR%
echo.

if not exist "%REPORTS_DIR%" (
    echo [错误] 报告目录不存在: %REPORTS_DIR%
    echo 请编辑本脚本，修改 REPORTS_DIR 为你的实际路径
    pause
    exit /b 1
)

echo [1/3] 安装依赖...
call npm install --no-save xlsx >nul 2>&1

echo [2/3] 解析 Excel 并生成 JSON...
node scripts\sync-hotspot\sync.js --reportsDir="%REPORTS_DIR%" --push
if errorlevel 1 (
    echo.
    echo [错误] 同步失败
    pause
    exit /b 1
)

echo.
echo ========================================
echo   同步完成!
echo ========================================
echo.
timeout /t 3 >nul
endlocal
