"""
本機 IPC + UI 伺服器（127.0.0.1 only）
- 提供 Desktop UI 靜態檔案（pywebview / 瀏覽器 fallback 都用同一份 UI）
- 提供 /api/* 給 UI
- 提供 /native 給 Native Messaging Host（需 token），只接受白名單命令
"""
import json
import mimetypes
import os
import platform
import secrets
import shutil
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import config
import database
import events
import reset_service
import startup
from downloader import manager, have_ffmpeg, have_yt_dlp
from logger import log, tail
from paths import token_path, ui_dir

HOST = "127.0.0.1"
PORT = 47811

ALLOWED_NATIVE_TYPES = {
    "HANDSHAKE", "PING", "VIDEO_DETECTED", "DOWNLOAD_REQUEST",
    "SETTINGS_SYNC", "RESET_REQUEST", "QUEUE_CONTROL",
}
ALLOWED_HOSTS = (
    "youtube.com", "youtu.be", "youtube-nocookie.com",
    "tiktok.com", "instagram.com",
)
FORBIDDEN_KEYS = ("command", "shell", "exec", "script", "eval", "path")

_token = None
_state = {"extension_connected": False, "last_seen": 0}


def token():
    global _token
    if _token:
        return _token
    try:
        if os.path.isfile(token_path()):
            with open(token_path(), "r", encoding="utf-8") as handle:
                value = handle.read().strip()
            if value:
                _token = value
                return _token
    except OSError:
        pass
    _token = secrets.token_hex(24)
    try:
        with open(token_path(), "w", encoding="utf-8") as handle:
            handle.write(_token)
    except OSError as exc:
        log("TOKEN_WRITE_FAILED", str(exc), "ERROR")
    return _token


def url_allowed(url: str) -> bool:
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            return False
        host = (parsed.hostname or "").lower()
        return any(host == h or host.endswith("." + h) for h in ALLOWED_HOSTS)
    except ValueError:
        return False


def validate_native(message):
    if not isinstance(message, dict):
        return "訊息必須是 JSON 物件"
    mtype = message.get("type")
    if mtype not in ALLOWED_NATIVE_TYPES:
        return "不允許的命令類型：%s" % mtype
    for key in FORBIDDEN_KEYS:
        if key in message:
            return "訊息含有禁止欄位：%s" % key
    if mtype in ("VIDEO_DETECTED", "DOWNLOAD_REQUEST") and not url_allowed(message.get("url", "")):
        return "url 不在允許的平台白名單內"
    if mtype == "DOWNLOAD_REQUEST" and message.get("format") not in ("video", "audio"):
        return "format 只能是 video 或 audio"
    return None


def open_in_explorer(path: str, select: bool):
    cfg = config.load()
    root = os.path.abspath(cfg["downloadDirectory"])
    target = os.path.abspath(path)
    if not target.startswith(root):
        return False, "只能開啟本工具自己的下載目錄"
    if not os.path.exists(target):
        return False, "檔案不存在（可能已被手動刪除）"
    try:
        if sys.platform == "win32":
            if select:
                subprocess.Popen(["explorer", "/select,", target])
            else:
                os.startfile(target)  # noqa: S606
        else:
            opener = "open" if sys.platform == "darwin" else "xdg-open"
            subprocess.Popen([opener, os.path.dirname(target) if select else target])
        return True, None
    except OSError as exc:
        return False, str(exc)


def pick_folder():
    """Windows Folder Picker；失敗時回報原因而不是假裝成功。"""
    try:
        import tkinter as tk
        from tkinter import filedialog
        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        selected = filedialog.askdirectory(title="選擇下載位置")
        root.destroy()
        if not selected:
            return None, "使用者取消選擇"
        return os.path.normpath(selected), None
    except Exception as exc:  # tkinter 缺失等
        return None, "無法開啟資料夾選擇視窗：%s" % exc


def ensure_download_dirs(base=None):
    cfg = config.load()
    base = base or cfg["downloadDirectory"]
    created = []
    for sub in ("video", "audio"):
        folder = os.path.join(base, sub)
        try:
            if not os.path.isdir(folder):
                os.makedirs(folder, exist_ok=True)
                created.append(folder)
        except OSError as exc:
            log("MKDIR_FAILED", str(exc), "ERROR")
    return created


def build_state():
    cfg = config.load()
    stats = database.stats()
    free = 0
    try:
        free = shutil.disk_usage(cfg["downloadDirectory"]).free
    except OSError:
        pass
    return {
        "ok": True,
        "version": cfg["version"],
        "birthTime": cfg["birthTime"],
        "settings": cfg,
        "stats": stats,
        "extensionConnected": _state["extension_connected"] and (time.time() - _state["last_seen"] < 120),
        "backgroundService": "Running",
        "autoStartRegistered": startup.is_enabled(),
        "ytDlp": have_yt_dlp(),
        "ffmpeg": have_ffmpeg(),
        "freeBytes": free,
        "platform": sys.platform,
        "arch": platform.machine() or "unknown",
        "bits": 64 if sys.maxsize > 2 ** 32 else 32,
        "is64bit": sys.maxsize > 2 ** 32,
        "osArch": os.environ.get("PROCESSOR_ARCHITEW6432")
                  or os.environ.get("PROCESSOR_ARCHITECTURE", platform.machine()),
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "AhYooIPC/1.0"

    def log_message(self, *args):
        return  # 靜音，避免大量 stdout（Native Messaging 需要乾淨 stdout）

    # ---------- helpers ----------
    def _json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0:
                return {}
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, OSError):
            return None

    def _authorized(self):
        return self.headers.get("X-Ahyoo-Token", "") == token()

    # ---------- GET ----------
    def do_GET(self):
        parsed = urlparse(self.path)
        route = parsed.path
        query = parse_qs(parsed.query)

        if route == "/api/state":
            return self._json(build_state())
        if route == "/api/downloads":
            return self._json({"ok": True, "items": database.list_items(
                query=(query.get("q", [""])[0]),
                file_type=(query.get("filter", ["all"])[0]),
                sort=(query.get("sort", ["newest"])[0]),
            )})
        if route == "/api/queue":
            return self._json({"ok": True, "items": database.active_items(),
                               "activeCount": manager.active_count()})
        if route == "/api/logs":
            return self._json({"ok": True, "lines": tail(200)})
        if route == "/api/events":
            if not self._authorized():
                return self._json({"ok": False, "error": "unauthorized"}, 401)
            after = int((query.get("after", ["0"])[0]) or 0)
            return self._json({"ok": True, "events": events.since(after)})
        if route.startswith("/api/"):
            return self._json({"ok": False, "error": "未知的 API"}, 404)

        return self._serve_static(route)

    def _serve_static(self, route):
        if route in ("/", ""):
            route = "/index.html"
        safe = os.path.normpath(route.lstrip("/")).replace("\\", "/")
        if safe.startswith(".."):
            return self._json({"ok": False, "error": "forbidden"}, 403)
        full = os.path.join(ui_dir(), safe)
        if not os.path.isfile(full):
            return self._json({"ok": False, "error": "not found"}, 404)
        ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
        try:
            with open(full, "rb") as handle:
                data = handle.read()
        except OSError:
            return self._json({"ok": False, "error": "read failed"}, 500)
        self.send_response(200)
        self.send_header("Content-Type", ctype + ("; charset=utf-8" if ctype.startswith("text") or ctype.endswith("javascript") or ctype.endswith("json") else ""))
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    # ---------- POST ----------
    def do_POST(self):
        route = urlparse(self.path).path
        payload = self._body()
        if payload is None:
            return self._json({"ok": False, "error": "無效的 JSON"}, 400)

        if route == "/native":
            return self._handle_native(payload)
        if route == "/api/settings":
            cfg = config.save(payload if isinstance(payload, dict) else {})
            if "autoStart" in payload:
                startup.set_enabled(bool(payload["autoStart"]))
            if "downloadDirectory" in payload:
                ensure_download_dirs(cfg["downloadDirectory"])
            events.emit({"type": "SETTINGS_STATE", "settings": cfg})
            return self._json({"ok": True, "settings": cfg})
        if route == "/api/pick-folder":
            folder, error = pick_folder()
            if not folder:
                return self._json({"ok": False, "error": error}, 400)
            cfg = config.save({"downloadDirectory": folder})
            ensure_download_dirs(folder)
            return self._json({"ok": True, "settings": cfg})
        if route == "/api/download":
            if not url_allowed(payload.get("url", "")):
                return self._json({"ok": False, "error": "網址不在允許的平台白名單內"}, 400)
            result = manager.enqueue(payload)
            return self._json({"ok": True, **result})
        if route == "/api/queue-control":
            action = payload.get("action")
            if action == "pause-all":
                manager.pause_all()
            elif action == "resume-all":
                manager.resume_all()
            elif action == "recover":
                manager.recover_interrupted(True)
            elif action == "drop-interrupted":
                manager.recover_interrupted(False)
            else:
                return self._json({"ok": False, "error": "不支援的佇列指令"}, 400)
            return self._json({"ok": True})
        if route == "/api/task":
            action = payload.get("action")
            row_id = int(payload.get("id", 0) or 0)
            if not database.get(row_id):
                return self._json({"ok": False, "error": "找不到該任務"}, 404)
            if action == "pause":
                manager.pause(row_id)
            elif action == "resume":
                manager.resume(row_id)
            elif action == "cancel":
                manager.cancel(row_id)
            elif action == "retry":
                manager.retry(row_id)
            elif action == "delete-record":
                database.delete(row_id)
            else:
                return self._json({"ok": False, "error": "不支援的動作"}, 400)
            return self._json({"ok": True})
        if route == "/api/open":
            item = database.get(int(payload.get("id", 0) or 0))
            if not item:
                return self._json({"ok": False, "error": "找不到紀錄"}, 404)
            ok, error = open_in_explorer(item.get("filePath") or "", bool(payload.get("folder")))
            return self._json({"ok": ok, "error": error}, 200 if ok else 400)
        if route == "/api/reset":
            result = reset_service.perform(
                payload.get("confirm") is True,
                bool(payload.get("keepVideos")),
                bool(payload.get("keepAudio")),
            )
            return self._json(result, 200 if result.get("ok") else 400)
        if route == "/api/quit":
            threading.Thread(target=_shutdown_app, daemon=True).start()
            return self._json({"ok": True})
        return self._json({"ok": False, "error": "未知的 API"}, 404)

    # ---------- Native Messaging 轉接 ----------
    def _handle_native(self, message):
        if not self._authorized():
            return self._json({"ok": False, "error": "unauthorized"}, 401)
        error = validate_native(message)
        if error:
            log("NATIVE_REJECTED", error, "WARN")
            return self._json({"ok": False, "error": error}, 400)

        mtype = message["type"]
        request_id = str(message.get("requestId") or "req_%d" % int(time.time() * 1000))
        _state["extension_connected"] = True
        _state["last_seen"] = time.time()
        cfg = config.load()

        if mtype in ("HANDSHAKE", "PING"):
            if mtype == "HANDSHAKE":
                log("EXTENSION_CONNECTED", "native handshake")
            return self._json({"ok": True, "response": {
                "type": "HANDSHAKE_ACK", "requestId": request_id,
                "version": cfg["version"], "status": "connected"}})

        if mtype == "VIDEO_DETECTED":
            log("VIDEO_DETECTED", "%s %s" % (message.get("platform"), str(message.get("title"))[:80]))
            return self._json({"ok": True, "response": {
                "type": "VIDEO_READY", "requestId": request_id, "status": "ready",
                "quality": cfg["videoQuality"], "downloadMode": cfg["downloadMode"]}})

        if mtype == "DOWNLOAD_REQUEST":
            if cfg["downloadMode"] == "ask":
                folder, error = pick_folder()
                if not folder:
                    return self._json({"ok": True, "response": {
                        "type": "DOWNLOAD_FAILED", "requestId": request_id,
                        "error": error or "未選擇下載位置"}})
                config.save({"downloadDirectory": folder})
                ensure_download_dirs(folder)
            result = manager.enqueue({
                "requestId": request_id,
                "title": message.get("title"),
                "url": message.get("url"),
                "platform": message.get("platform"),
                "fileType": "audio" if message.get("format") == "audio" else "video",
                "quality": message.get("quality") or cfg["videoQuality"],
                "duration": message.get("duration"),
            })
            return self._json({"ok": True, "response": {
                "type": "DOWNLOAD_ACCEPTED", "requestId": request_id,
                "id": result["id"], "status": "waiting"}})

        if mtype == "SETTINGS_SYNC":
            incoming = message.get("settings")
            if isinstance(incoming, dict):
                cfg = config.save({k: v for k, v in incoming.items() if k in config.DEFAULTS})
                if "autoStart" in incoming:
                    startup.set_enabled(bool(incoming["autoStart"]))
            return self._json({"ok": True, "response": {
                "type": "SETTINGS_STATE", "requestId": request_id, "settings": cfg}})

        if mtype == "QUEUE_CONTROL":
            action = message.get("action")
            if action == "pause":
                manager.pause_all()
            elif action == "resume":
                manager.resume_all()
            else:
                return self._json({"ok": False, "error": "不支援的佇列動作"}, 400)
            return self._json({"ok": True, "response": {
                "type": "QUEUE_STATE", "requestId": request_id, "action": action}})

        if mtype == "RESET_REQUEST":
            result = reset_service.perform(
                message.get("confirmed") is True,
                bool(message.get("keepVideos")),
                bool(message.get("keepAudio")),
            )
            return self._json({"ok": True, "response": {
                "type": "RESET_RESULT", "requestId": request_id, "result": result}})

        return self._json({"ok": False, "error": "未處理的命令"}, 400)


_httpd = None
_quit_callback = None


def _shutdown_app():
    time.sleep(0.3)
    if _quit_callback:
        _quit_callback()


def set_quit_callback(callback):
    global _quit_callback
    _quit_callback = callback


def start():
    global _httpd
    token()
    for port in range(PORT, PORT + 10):
        try:
            _httpd = ThreadingHTTPServer((HOST, port), Handler)
            break
        except OSError:
            continue
    if _httpd is None:
        raise RuntimeError("無法啟動本機 IPC 伺服器（連接埠被占用）")
    actual = _httpd.server_address[1]
    thread = threading.Thread(target=_httpd.serve_forever, daemon=True)
    thread.start()
    try:
        with open(os.path.join(os.path.dirname(token_path()), "ipc.port"), "w", encoding="utf-8") as handle:
            handle.write(str(actual))
    except OSError:
        pass
    log("IPC_STARTED", "http://%s:%d" % (HOST, actual))
    return actual


def stop():
    if _httpd:
        _httpd.shutdown()
