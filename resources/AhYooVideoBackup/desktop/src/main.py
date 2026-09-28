"""
阿柚自動影片備份 - Windows Desktop App 入口
用法：
    AhYooVideoBackup.exe            開啟主視窗
    AhYooVideoBackup.exe --tray     開機啟動模式：只常駐系統列（不開大視窗）
"""
import os
import platform
import sys
import time
import webbrowser

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import config          # noqa: E402
import database        # noqa: E402
import server          # noqa: E402
import startup         # noqa: E402
import tray            # noqa: E402
from downloader import manager  # noqa: E402
from logger import log  # noqa: E402

WINDOW_TITLE = "阿柚自動影片備份 v1.0"
_window = None
_port = None
_running = True


def ui_url(page=""):
    return "http://127.0.0.1:%d/index.html%s" % (_port, ("#" + page) if page else "")


def open_window(page=""):
    global _window
    if _window is not None:
        try:
            _window.show()
            if page:
                _window.load_url(ui_url(page))
            return
        except Exception:
            pass
    try:
        import webview
        _window = webview.create_window(
            WINDOW_TITLE, ui_url(page), width=1000, height=650,
            min_size=(900, 600), background_color="#0B0E13",
        )
    except Exception as exc:
        log("WEBVIEW_FALLBACK", str(exc), "WARN")
        webbrowser.open(ui_url(page))


def quit_app():
    global _running
    active = manager.active_count()
    if active > 0:
        tray.notify("仍有下載工作", "目前仍有 %d 個下載工作，將被標記為 interrupted。" % active)
    log("APP_EXIT", "使用者退出")
    _running = False
    manager.stop()
    tray.stop()
    server.stop()
    try:
        import webview
        for win in list(getattr(webview, "windows", [])):
            win.destroy()
    except Exception:
        pass
    os._exit(0)


def main():
    global _port
    tray_only = "--tray" in sys.argv
    cfg = config.load()
    database.connect()
    server.ensure_download_dirs()
    startup.set_enabled(bool(cfg.get("autoStart")))

    bits = 64 if sys.maxsize > 2 ** 32 else 32
    log("APP_ARCH", "%s %d-bit (os=%s)" % (
        platform.machine(),
        bits,
        os.environ.get("PROCESSOR_ARCHITEW6432") or os.environ.get("PROCESSOR_ARCHITECTURE", "n/a"),
    ), "INFO" if bits == 64 else "WARN")

    _port = server.start()
    server.set_quit_callback(quit_app)
    manager.start()
    log("APP_START", "tray_only=%s port=%s" % (tray_only, _port))

    tray.start({
        "open": lambda: open_window(),
        "pause": lambda: (manager.pause_all(), tray.notify("已暫停", "所有下載已暫停")),
        "resume": lambda: (manager.resume_all(), tray.notify("已恢復", "下載佇列已恢復")),
        "settings": lambda: open_window("system"),
        "history": lambda: open_window("history"),
        "quit": quit_app,
    })

    if tray_only:
        # 開機啟動：不開啟大型主視窗，只用 Windows 通知告知已常駐系統列
        tray.notify(
            "阿柚自動影片備份",
            "已在您的電腦托盤下執行（x64 / %d-bit），等待 Extension 連線。" % bits,
        )
        try:
            while _running:
                time.sleep(1)
        except KeyboardInterrupt:
            quit_app()
        return

    try:
        import webview
        open_window()
        # 關閉視窗 = 最小化到系統列（不結束程式）
        webview.start(gui=None, private_mode=False)
        tray.notify("阿柚自動影片備份", "已最小化到系統列，右鍵圖示可退出。")
        while _running:
            time.sleep(1)
    except ImportError:
        log("WEBVIEW_MISSING", "未安裝 pywebview，改用預設瀏覽器開啟 UI", "WARN")
        webbrowser.open(ui_url())
        try:
            while _running:
                time.sleep(1)
        except KeyboardInterrupt:
            quit_app()


if __name__ == "__main__":
    main()
