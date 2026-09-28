@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title 阿柚自動影片備份 - 解除安裝

set "INSTALL_DIR=%LOCALAPPDATA%\Programs\AhYooVideoBackup"
set "DATA_DIR=%LOCALAPPDATA%\AhYooVideoBackup"

echo ================================
echo  解除安裝 阿柚自動影片備份 v1.0
echo ================================
echo.
set /p CONFIRM=確定解除安裝阿柚自動影片備份嗎？(Y/N)：
if /i not "%CONFIRM%"=="Y" (
    echo 已取消。
    pause & exit /b 0
)
set /p KEEPV=保留下載的影片？(Y/N)：
set /p KEEPA=保留下載的音訊？(Y/N)：
set /p KEEPS=保留設定？(Y/N)：

echo.
echo [1/6] 停止 Background App / Tray...
taskkill /im AhYooVideoBackup.exe /f >nul 2>&1
taskkill /im AhYooNativeHost.exe /f >nul 2>&1
echo   已停止（若原本未執行則略過）

echo [2/6] 移除 Startup 項目...
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v AhYooVideoBackup /f >nul 2>&1
echo   完成

echo [3/6] 移除 Native Messaging Host 註冊...
reg delete "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.ahyoo.video_backup" /f >nul 2>&1
reg delete "HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.ahyoo.video_backup" /f >nul 2>&1
echo   完成

echo [4/6] 移除程式檔案...
if exist "%INSTALL_DIR%" rmdir /s /q "%INSTALL_DIR%"
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\阿柚自動影片備份.lnk" >nul 2>&1
echo   完成

echo [5/6] 處理下載檔案...
for /f "usebackq delims=" %%P in (`powershell -NoProfile -Command "try { (Get-Content '%DATA_DIR%\config.json' -Raw | ConvertFrom-Json).downloadDirectory } catch { '' }"`) do set "DLDIR=%%P"
if "%DLDIR%"=="" set "DLDIR=%USERPROFILE%\Videos\阿柚自動影片備份"
if /i not "%KEEPV%"=="Y" (
    if exist "%DLDIR%\video" rmdir /s /q "%DLDIR%\video" & echo   已刪除影片資料夾
) else ( echo   保留影片：%DLDIR%\video )
if /i not "%KEEPA%"=="Y" (
    if exist "%DLDIR%\audio" rmdir /s /q "%DLDIR%\audio" & echo   已刪除音訊資料夾
) else ( echo   保留音訊：%DLDIR%\audio )

echo [6/6] 處理設定與紀錄...
if /i not "%KEEPS%"=="Y" (
    if exist "%DATA_DIR%" rmdir /s /q "%DATA_DIR%"
    echo   已刪除設定與下載紀錄
) else (
    echo   保留設定：%DATA_DIR%
)

echo.
echo ================================
echo  解除安裝完成
echo ================================
echo  提醒：請至 chrome://extensions 手動移除瀏覽器擴充功能。
pause
endlocal
