"""
阿柚自動影片備份 - Native Messaging Host (com.ahyoo.video_backup)
Chrome/Edge ↔ stdio ↔ 本 Host ↔ 127.0.0.1 IPC ↔ Desktop App

安全原則：
 - 只轉送白名單命令
 - 驗證訊息格式與網址平台
 - 不接受任何 shell / exe / 任意路徑命令
 - 只連線本機 127.0.0.1，不對外開放
"""
import json
import os
import struct
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request

ALLOWED_TYPES = {
    "HANDSHAKE", "PING", "VIDEO_DETECTED", "DOWNLOAD_REQUEST",
    "SETTINGS_SYNC", "RESET_REQUEST", "QUEUE_CONTROL",
}
FORBIDDEN_KEYS = ("command", "shell", "exec", "script", "eval", "path")
ALLOWED_HOSTS = ("youtube.com", "youtu.be", "youtube-nocookie.com", "tiktok.com", "instagram.com")

DATA_DIR = os.path.join(os.environ.get("LOCALAPPDATA", os.path.expanduser("~")), "AhYooVideoBackup")
TOKEN_FILE = os.path.join(DATA_DIR, "ipc.token")
PORT_FILE = os.path.join(DATA_DIR, "ipc.port")
LOG_FILE = os.path.join(DATA_DIR, "logs", "native-host.log")

_stdout_lock = threading.Lock()


def log(message):
    try:
        os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
        with open(LOG_FILE, "a", encoding="utf-8") as handle:
            handle.write("%s %s\n" % (time.strftime("%Y-%m-%d %H:%M:%S"), str(message)[:400]))
    except OSError:
        pass


def read_message():
    raw_length = sys.stdin.buffer.read(4)
    if len(raw_length) < 4:
        return None
    length = struct.unpack("=I", raw_length)[0]
    if length <= 0 or length > 1024 * 1024:
        return None
    data = sys.stdin.buffer.read(length).decode("utf-8")
    try:
        return json.loads(data)
    except ValueError:
        return {"type": "INVALID"}


def send_message(payload):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    with _stdout_lock:
        sys.stdout.buffer.write(struct.pack("=I", len(body)))
        sys.stdout.buffer.write(body)
        sys.stdout.buffer.flush()


def token():
    try:
        with open(TOKEN_FILE, "r", encoding="utf-8") as handle:
            return handle.read().strip()
    except OSError:
        return ""


def port():
    try:
        with open(PORT_FILE, "r", encoding="utf-8") as handle:
            return int(handle.read().strip())
    except (OSError, ValueError):
        return 47811


def ipc_post(path, payload):
    request = urllib.request.Request(
        "http://127.0.0.1:%d%s" % (port(), path),
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json", "X-Ahyoo-Token": token()},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))


def ipc_get(path):
    request = urllib.request.Request(
        "http://127.0.0.1:%d%s" % (port(), path),
        headers={"X-Ahyoo-Token": token()},
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        return json.loads(response.read().decode("utf-8"))


def desktop_exe():
    # 64-bit 安裝路徑優先（ProgramW6432 即使在 32-bit 程序中也指向 C:\Program Files）
    candidates = [
        os.path.join(os.path.dirname(os.path.abspath(sys.argv[0])), "AhYooVideoBackup.exe"),
        os.path.join(os.environ.get("LOCALAPPDATA", ""), "Programs", "AhYooVideoBackup", "AhYooVideoBackup.exe"),
        os.path.join(os.environ.get("ProgramW6432", r"C:\Program Files"), "AhYooVideoBackup", "AhYooVideoBackup.exe"),
        os.path.join(os.environ.get("ProgramFiles", r"C:\Program Files"), "AhYooVideoBackup", "AhYooVideoBackup.exe"),
    ]
    for path in candidates:
        if path and os.path.isfile(path):
            return path
    return None


def ensure_desktop_running():
    try:
        ipc_get("/api/state")
        return True
    except (urllib.error.URLError, OSError, ValueError):
        pass
    exe = desktop_exe()
    if not exe:
        return False
    try:
        subprocess.Popen([exe, "--tray"], close_fds=True)
    except OSError as exc:
        log("LAUNCH_FAILED %s" % exc)
        return False
    for _ in range(20):
        time.sleep(0.5)
        try:
            ipc_get("/api/state")
            return True
        except (urllib.error.URLError, OSError, ValueError):
            continue
    return False


def validate(message):
    if not isinstance(message, dict):
        return "訊息必須是 JSON 物件"
    if message.get("type") not in ALLOWED_TYPES:
        return "不允許的命令類型"
    for key in FORBIDDEN_KEYS:
        if key in message:
            return "訊息含有禁止欄位：%s" % key
    if message["type"] in ("VIDEO_DETECTED", "DOWNLOAD_REQUEST"):
        url = str(message.get("url", ""))
        if not url.startswith("https://") and not url.startswith("http://"):
            return "url 格式不合法"
        host = url.split("/")[2].lower() if len(url.split("/")) > 2 else ""
        if not any(host == h or host.endswith("." + h) for h in ALLOWED_HOSTS):
            return "url 不在允許的平台白名單內"
    return None


def event_pump():
    """把 Desktop App 的下載進度事件推回 Extension。"""
    after = 0
    while True:
        try:
            data = ipc_get("/api/events?after=%d" % after)
            for event in data.get("events", []):
                after = max(after, event["id"])
                send_message(event["payload"])
        except (urllib.error.URLError, OSError, ValueError):
            pass
        time.sleep(0.7)


def main():
    log("native host started (%d-bit)" % (64 if sys.maxsize > 2 ** 32 else 32))
    threading.Thread(target=event_pump, daemon=True).start()
    while True:
        message = read_message()
        if message is None:
            log("stdin closed - exit")
            return
        error = validate(message)
        if error:
            log("rejected: %s" % error)
            send_message({"type": "ERROR", "requestId": message.get("requestId"), "error": error})
            continue
        if not ensure_desktop_running():
            send_message({
                "type": "ERROR",
                "requestId": message.get("requestId"),
                "error": "Desktop App 未連線，請確認 AhYooVideoBackup.exe 已安裝。",
            })
            continue
        try:
            result = ipc_post("/native", message)
        except (urllib.error.URLError, OSError, ValueError) as exc:
            send_message({"type": "ERROR", "requestId": message.get("requestId"),
                          "error": "無法與 Desktop App 通訊：%s" % exc})
            continue
        if result.get("ok"):
            send_message(result.get("response", {"type": "ACK", "requestId": message.get("requestId")}))
        else:
            send_message({"type": "ERROR", "requestId": message.get("requestId"),
                          "error": result.get("error", "未知錯誤")})


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # 絕不可讓 host 無訊息崩潰
        log("fatal: %s" % exc)
        try:
            send_message({"type": "ERROR", "error": "Native host 發生錯誤：%s" % exc})
        except Exception:
            pass
