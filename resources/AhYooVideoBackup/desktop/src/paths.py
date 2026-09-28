"""集中管理所有路徑，避免硬編碼相對路徑（例如 ../檔名）。"""
import os
import sys


def app_root() -> str:
    """打包成 EXE 後是 EXE 所在資料夾；開發時是 desktop/ 目錄。"""
    if getattr(sys, "frozen", False):
        return os.path.dirname(os.path.abspath(sys.executable))
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def data_root() -> str:
    """使用者資料（設定 / 資料庫 / 日誌）放在 %LOCALAPPDATA%，避免寫入 Program Files。"""
    base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~/.local/share")
    path = os.path.join(base, "AhYooVideoBackup")
    os.makedirs(path, exist_ok=True)
    return path


def config_path() -> str:
    return os.path.join(data_root(), "config.json")


def db_path() -> str:
    return os.path.join(data_root(), "ahyoo.db")


def logs_dir() -> str:
    path = os.path.join(data_root(), "logs")
    os.makedirs(path, exist_ok=True)
    return path


def default_download_dir() -> str:
    home = os.path.join(os.path.expanduser("~"), "Videos")
    if not os.path.isdir(home):
        home = os.path.expanduser("~")
    return os.path.join(home, "阿柚自動影片備份")


def ui_dir() -> str:
    if getattr(sys, "frozen", False):
        base = getattr(sys, "_MEIPASS", app_root())
        return os.path.join(base, "ui")
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), "ui")


def token_path() -> str:
    return os.path.join(data_root(), "ipc.token")
