@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title 阿柚自動影片備份 - 安裝程式 v1.0 (x64)

echo ================================
echo  阿柚自動影片備份 v1.0 安裝程式 (Windows x64)
echo ================================
echo.

set "ROOT=%~dp0"
set "INSTALL_DIR=%LOCALAPPDATA%\Programs\AhYooVideoBackup"
set "DATA_DIR=%LOCALAPPDATA%\AhYooVideoBackup"
set "ERRORS=0"

echo [1/6] 檢查環境（需要 64-bit Windows）...
if defined PROCESSOR_ARCHITEW6432 set "OSARCH=%PROCESSOR_ARCHITEW6432%"
if not defined OSARCH set "OSARCH=%PROCESSOR_ARCHITECTURE%"
if /i "%OSARCH%"=="x86" (
    echo   [錯誤] 偵測到 32-bit Windows，本程式僅支援 64-bit Windows 10/11。
    pause & exit /b 1
)
echo   系統架構：%OSARCH% ^(64-bit^) OK
where python >nul 2>&1
if errorlevel 1 (
    echo   [警告] 找不到 Python。若你已有打包好的 dist\AhYooVideoBackup.exe 仍可繼續安裝。
    set "HAS_PYTHON=0"
) else (
    for /f "tokens=2" %%v in ('python --version 2^>^&1') do echo   Python %%v 已安裝
    set "HAS_PYTHON=1"
    python -c "import sys; sys.exit(0 if sys.maxsize > 2**32 else 1)"
    if errorlevel 1 (
        echo   [警告] 目前的 Python 是 32-bit，原始碼模式仍可執行，
        echo          但若要自行打包 EXE 請改用 64-bit Python。
    ) else (
        echo   Python 架構：64-bit OK
    )
)

echo [2/6] 建立資料夾...
for %%D in ("%INSTALL_DIR%" "%INSTALL_DIR%\app" "%INSTALL_DIR%\assets" "%DATA_DIR%" "%DATA_DIR%\logs" "%DATA_DIR%\config" "%USERPROFILE%\Videos\阿柚自動影片備份\video" "%USERPROFILE%\Videos\阿柚自動影片備份\audio") do (
    if not exist %%~D (
        mkdir %%~D 2>nul
        if errorlevel 1 (
            echo   [錯誤] 無法建立 %%~D
            set /a ERRORS+=1
        ) else (
            echo   建立 %%~D
        )
    )
)

echo [3/6] 複製程式檔案...
if exist "%ROOT%dist\AhYooVideoBackup.exe" (
    copy /y "%ROOT%dist\AhYooVideoBackup.exe" "%INSTALL_DIR%\AhYooVideoBackup.exe" >nul || set /a ERRORS+=1
    if exist "%ROOT%dist\AhYooNativeHost.exe" copy /y "%ROOT%dist\AhYooNativeHost.exe" "%INSTALL_DIR%\AhYooNativeHost.exe" >nul
    if exist "%ROOT%dist\uninstall.exe" copy /y "%ROOT%dist\uninstall.exe" "%INSTALL_DIR%\uninstall.exe" >nul
    set "HOST_PATH=%INSTALL_DIR%\AhYooNativeHost.exe"
    echo   已安裝 EXE 版本
) else (
    echo   [提示] 找不到 dist\AhYooVideoBackup.exe，改以 Python 原始碼模式安裝。
    if "!HAS_PYTHON!"=="0" (
        echo   [錯誤] 沒有 EXE 也沒有 Python，無法安裝。請先執行 打包.exe.bat
        set /a ERRORS+=1
        goto :summary
    )
    xcopy /e /i /y "%ROOT%desktop\src" "%INSTALL_DIR%\app\src" >nul || set /a ERRORS+=1
    xcopy /e /i /y "%ROOT%native-host" "%INSTALL_DIR%\app\native-host" >nul || set /a ERRORS+=1
    > "%INSTALL_DIR%\AhYooVideoBackup.bat" echo @echo off
    >> "%INSTALL_DIR%\AhYooVideoBackup.bat" echo start "" pythonw "%INSTALL_DIR%\app\src\main.py" %%*
    > "%INSTALL_DIR%\AhYooNativeHost.bat" echo @echo off
    >> "%INSTALL_DIR%\AhYooNativeHost.bat" echo python "%INSTALL_DIR%\app\native-host\native_host.py"
    set "HOST_PATH=%INSTALL_DIR%\AhYooNativeHost.bat"
    echo   已安裝 Python 原始碼版本
)

echo [4/6] 安裝依賴套件...
if "!HAS_PYTHON!"=="1" (
    python -m pip install --disable-pip-version-check -q yt-dlp pystray Pillow pywebview
    if errorlevel 1 (
        echo   [警告] 部分套件安裝失敗，缺少 yt-dlp 時 App 會明確顯示「缺少影片解析元件」。
    ) else (
        echo   依賴安裝完成
    )
)

echo [5/6] 註冊 Native Messaging Host...
set /p EXTID=請輸入你的 Extension ID（chrome://extensions 開啟開發人員模式可看到）：
if "%EXTID%"=="" (
    echo   [警告] 未輸入 Extension ID，稍後可重新執行 install.bat 完成註冊。
) else (
    set "MANIFEST=%DATA_DIR%\config\com.ahyoo.video_backup.json"
    set "HOST_ESCAPED=!HOST_PATH:\=\\!"
    > "!MANIFEST!" echo {
    >> "!MANIFEST!" echo   "name": "com.ahyoo.video_backup",
    >> "!MANIFEST!" echo   "description": "阿柚自動影片備份 Native Messaging Host v1.0",
    >> "!MANIFEST!" echo   "path": "!HOST_ESCAPED!",
    >> "!MANIFEST!" echo   "type": "stdio",
    >> "!MANIFEST!" echo   "allowed_origins": [ "chrome-extension://%EXTID%/" ]
    >> "!MANIFEST!" echo }
    reg add "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.ahyoo.video_backup" /ve /t REG_SZ /d "!MANIFEST!" /f >nul || set /a ERRORS+=1
    reg add "HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.ahyoo.video_backup" /ve /t REG_SZ /d "!MANIFEST!" /f >nul
    echo   已註冊 Chrome / Edge Native Messaging Host
)

echo [6/6] 建立捷徑與啟動設定...
set "SHORTCUT=%APPDATA%\Microsoft\Windows\Start Menu\Programs\阿柚自動影片備份.lnk"
if exist "%INSTALL_DIR%\AhYooVideoBackup.exe" (
    set "TARGET=%INSTALL_DIR%\AhYooVideoBackup.exe"
) else (
    set "TARGET=%INSTALL_DIR%\AhYooVideoBackup.bat"
)
powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut('%SHORTCUT%'); $s.TargetPath='%TARGET%'; $s.WorkingDirectory='%INSTALL_DIR%'; $s.Save()" >nul 2>&1
if errorlevel 1 (echo   [警告] 捷徑建立失敗) else (echo   已建立開始功能表捷徑)
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v AhYooVideoBackup /t REG_SZ /d "\"%TARGET%\" --tray" /f >nul
echo   已設定「重啟自動開啟」（可在 App 設定中關閉）

:summary
echo.
echo ================================
if "%ERRORS%"=="0" (
    echo  安裝完成
) else (
    echo  安裝完成，但有 %ERRORS% 個錯誤，請檢查上方訊息
)
echo  架構：x64 ^(64-bit^)
echo  安裝位置：%INSTALL_DIR%
echo  資料位置：%DATA_DIR%
echo ================================
echo.
echo 下一步：
echo   1. 開啟 chrome://extensions 或 edge://extensions
echo   2. 開啟開發人員模式 → 載入未封裝項目 → 選擇 extension 資料夾
echo   3. 啟動 阿柚自動影片備份（開始功能表）
echo.
pause
endlocal
