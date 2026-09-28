"""Windows 開機啟動：只使用官方 HKCU\\...\\Run 機制，不使用任何隱藏持久化手段。"""
import os
import sys

from logger import log

RUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"
VALUE_NAME = "AhYooVideoBackup"


def _winreg():
    try:
        import winreg  # type: ignore
        return winreg
    except ImportError:
        return None


def executable_command() -> str:
    if getattr(sys, "frozen", False):
        return '"%s" --tray' % os.path.abspath(sys.executable)
    script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "main.py")
    return '"%s" "%s" --tray' % (sys.executable, script)


def is_enabled() -> bool:
    winreg = _winreg()
    if not winreg:
        return False
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_KEY) as key:
            value, _ = winreg.QueryValueEx(key, VALUE_NAME)
            return bool(value)
    except OSError:
        return False


def set_enabled(enabled: bool) -> bool:
    winreg = _winreg()
    if not winreg:
        log("STARTUP_UNSUPPORTED", "非 Windows 環境，略過開機啟動設定", "WARN")
        return False
    try:
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, RUN_KEY) as key:
            if enabled:
                winreg.SetValueEx(key, VALUE_NAME, 0, winreg.REG_SZ, executable_command())
            else:
                try:
                    winreg.DeleteValue(key, VALUE_NAME)
                except FileNotFoundError:
                    pass
        log("STARTUP_SET", "enabled=%s" % enabled)
        return True
    except OSError as exc:
        log("STARTUP_FAILED", str(exc), "ERROR")
        return False
