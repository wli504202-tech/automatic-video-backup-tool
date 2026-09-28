@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title 阿柚自動影片備份 - 打包 EXE v1.0 (x64)

set "ROOT=%~dp0"
cd /d "%ROOT%"

echo ================================
echo  阿柚自動影片備份 v1.0 打包程式 (Windows x64)
echo ================================
echo.

echo [1] 檢查開發環境（目標平台：Windows 64-bit / x64）
if defined PROCESSOR_ARCHITEW6432 set "OSARCH=%PROCESSOR_ARCHITEW6432%"
if not defined OSARCH set "OSARCH=%PROCESSOR_ARCHITECTURE%"
if /i "%OSARCH%"=="x86" (
    echo   [錯誤] 偵測到 32-bit Windows。本專案只支援 64-bit Windows 10/11。
    pause & exit /b 1
)
echo   作業系統架構：%OSARCH% ^(64-bit^)

where python >nul 2>&1
if errorlevel 1 (
    echo   [錯誤] 找不到 Python，請先安裝 64-bit Python 3.10+ 並勾選 Add to PATH
    pause & exit /b 1
)
python -c "import sys; sys.exit(0 if sys.version_info >= (3,9) else 1)"
if errorlevel 1 (
    echo   [錯誤] Python 版本過舊，需要 3.9 以上
    pause & exit /b 1
)
python -c "import sys; sys.exit(0 if sys.maxsize > 2**32 else 1)"
if errorlevel 1 (
    echo   [錯誤] 目前的 Python 是 32-bit。PyInstaller 會產生 32-bit EXE。
    echo          請改安裝 64-bit 版 Python：https://www.python.org/downloads/windows/
    echo          ^(下載檔名需含 amd64，例如 python-3.12.x-amd64.exe^)
    pause & exit /b 1
)
for /f "delims=" %%A in ('python -c "import platform;print(platform.machine())"') do set "PYARCH=%%A"
echo   Python 架構：%PYARCH% ^(64-bit^)
python -m pip install --disable-pip-version-check -q pyinstaller yt-dlp pystray Pillow pywebview
if errorlevel 1 (
    echo   [錯誤] 依賴安裝失敗，請檢查網路
    pause & exit /b 1
)
echo   環境 OK

echo [2] 清理舊 build
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist
echo   已清理

echo [3] 建立 build / dist
mkdir build 2>nul
mkdir dist 2>nul

echo [4] 打包 Desktop EXE (AhYooVideoBackup.exe)
python -m PyInstaller --noconfirm --clean --windowed --onefile ^
  --name AhYooVideoBackup ^
  --distpath dist --workpath build --specpath build ^
  --add-data "%ROOT%desktop\src\ui;ui" ^
  --paths desktop\src ^
  --hidden-import pystray._win32 --hidden-import PIL._tkinter_finder ^
  --hidden-import webview.platforms.edgechromium ^
  desktop\src\main.py
if errorlevel 1 (
    echo   [錯誤] Desktop EXE 打包失敗
    pause & exit /b 1
)
echo   dist\AhYooVideoBackup.exe 完成

echo [5] 打包 Native Messaging Host (AhYooNativeHost.exe)
python -m PyInstaller --noconfirm --clean --console --onefile ^
  --name AhYooNativeHost ^
  --distpath dist --workpath build --specpath build ^
  native-host\native_host.py
if errorlevel 1 (
    echo   [錯誤] Native Host 打包失敗
    pause & exit /b 1
)
echo   dist\AhYooNativeHost.exe 完成

echo [6] 建立解除安裝程式 (uninstall.exe)
python -m PyInstaller --noconfirm --clean --windowed --onefile ^
  --name uninstall ^
  --distpath dist --workpath build --specpath build ^
  installer\uninstall_gui.py
if errorlevel 1 (
    echo   [警告] uninstall.exe 打包失敗，仍可使用 uninstall.bat
) else (
    echo   dist\uninstall.exe 完成
)

echo [7] 輸出 dist（驗證 64-bit）
copy /y installer\version.json dist\version.json >nul 2>&1
copy /y uninstall.bat dist\uninstall.bat >nul 2>&1
python tools\check_arch.py dist\AhYooVideoBackup.exe dist\AhYooNativeHost.exe dist\uninstall.exe
if errorlevel 1 (
    echo   [錯誤] 產出的 EXE 不是 64-bit，請確認使用 64-bit Python 重新打包。
    pause & exit /b 1
)
> dist\BUILD_INFO.txt echo 阿柚自動影片備份 v1.0
>> dist\BUILD_INFO.txt echo Architecture : x64 (64-bit)
>> dist\BUILD_INFO.txt echo OS Arch      : %OSARCH%
>> dist\BUILD_INFO.txt echo Python Arch  : %PYARCH%
>> dist\BUILD_INFO.txt echo Build Time   : %DATE% %TIME%

echo.
echo ================================
echo Build Complete
echo ================================
echo.
echo dist/
echo     AhYooVideoBackup.exe   ^(x64 / 64-bit^)
echo     AhYooNativeHost.exe    ^(x64 / 64-bit^)
echo     uninstall.exe          ^(x64 / 64-bit^)
echo     BUILD_INFO.txt
echo.
echo 接下來執行 install.bat 完成安裝與 Native Messaging 註冊。
pause
endlocal
