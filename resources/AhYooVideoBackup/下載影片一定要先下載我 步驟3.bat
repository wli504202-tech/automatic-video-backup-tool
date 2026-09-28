@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title 阿柚自動影片備份 - 自動下載 ffmpeg 工具

echo ================================================
echo  阿柚自動影片備份 - ffmpeg 自動下載與配置工具
echo ================================================
echo.

set "ROOT=%~dp0"
set "INSTALL_DIR=%LOCALAPPDATA%\Programs\AhYooVideoBackup"
set "ZIP_URL=https://github.com/GyanD/codexffmpeg/releases/download/9.0.2/ffmpeg-9.0.2-essentials_build.zip"
set "ZIP_FILE=%ROOT%ffmpeg_temp.zip"
set "EXTRACT_DIR=%ROOT%ffmpeg_temp"

echo [1/4] 檢查本地是否已有 ffmpeg...
if exist "%ROOT%ffmpeg.exe" (
    echo   [OK] 本地目錄已有 ffmpeg.exe，準備同步至安裝目錄...
    goto :copy_files
)

echo [2/4] 正在從官方下載 ffmpeg 免安裝套件 (約 109 MB)...
echo   下載網址：%ZIP_URL%
powershell -NoProfile -ExecutionPolicy Bypass -Command "^
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; ^
    $webClient = New-Object System.Net.WebClient; ^
    $webClient.DownloadFile('%ZIP_URL%', '%ZIP_FILE%')"

if not exist "%ZIP_FILE%" (
    echo   [錯誤] 下載失敗，請檢查網路連線後重試。
    pause & exit /b 1
)
echo   下載完成！

echo [3/4] 正在解壓縮 ffmpeg...
powershell -NoProfile -ExecutionPolicy Bypass -Command "^
    Expand-Archive -Path '%ZIP_FILE%' -DestinationPath '%EXTRACT_DIR%' -Force"

rem 搜尋解壓出來的 ffmpeg.exe 位置並移動到根目錄
for /f "delims=" %%i in ('dir /b /s "%EXTRACT_DIR%\ffmpeg.exe" 2^>nul') do (
    set "FFMPEG_BIN=%%~dpi"
)

if defined FFMPEG_BIN (
    copy /y "!FFMPEG_BIN!ffmpeg.exe" "%ROOT%ffmpeg.exe" >nul
    copy /y "!FFMPEG_BIN!ffprobe.exe" "%ROOT%ffprobe.exe" >nul
    copy /y "!FFMPEG_BIN!ffplay.exe" "%ROOT%ffplay.exe" >nul
    echo   解壓縮並配置完成！
) else (
    echo   [錯誤] 找不到解壓後的 ffmpeg.exe 檔案。
    pause & exit /b 1
)

rem 清理暫存檔
if exist "%ZIP_FILE%" del /f /q "%ZIP_FILE%" >nul
if exist "%EXTRACT_DIR%" rmdir /s /q "%EXTRACT_DIR%" >nul

:copy_files
echo [4/4] 正在同步至軟體安裝目錄...
if exist "%INSTALL_DIR%" (
    copy /y "%ROOT%ffmpeg.exe" "%INSTALL_DIR%\ffmpeg.exe" >nul
    copy /y "%ROOT%ffprobe.exe" "%INSTALL_DIR%\ffprobe.exe" >nul
    copy /y "%ROOT%ffplay.exe" "%INSTALL_DIR%\ffplay.exe" >nul
    echo   已成功寫入至：%INSTALL_DIR%
) else (
    echo   [提示] 尚未執行 install.bat，ffmpeg 已備妥於本資料夾，後續執行 install.bat 時會自動安裝。
)

echo.
echo ================================================
echo  配置成功！現在可以順利下載與合併高畫質影片了。
echo ================================================
echo.
pause
endlocal