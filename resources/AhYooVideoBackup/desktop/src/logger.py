"""每日日誌：logs/YYYY-MM-DD.log；不記錄 Cookie / Token / 密碼等敏感資料。"""
import datetime
import os
import threading

from paths import logs_dir

_lock = threading.Lock()
_SENSITIVE = ("cookie", "token", "password", "authorization", "session")


def _sanitize(text: str) -> str:
    lowered = text.lower()
    for word in _SENSITIVE:
        if word in lowered:
            return "[redacted]"
    return text


def log(event: str, message: str = "", level: str = "INFO") -> None:
    line = "%s [%s] %s %s\n" % (
        datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        level,
        event,
        _sanitize(str(message))[:500],
    )
    path = os.path.join(logs_dir(), datetime.date.today().isoformat() + ".log")
    with _lock:
        try:
            with open(path, "a", encoding="utf-8") as handle:
                handle.write(line)
        except OSError:
            pass  # 日誌失敗不可讓主程式崩潰


def tail(limit: int = 200):
    path = os.path.join(logs_dir(), datetime.date.today().isoformat() + ".log")
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return handle.readlines()[-limit:]
    except OSError:
        return []
