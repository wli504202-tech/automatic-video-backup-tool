"""Windows System Tray：最小化不關閉，右鍵選單控制。"""
import threading

from logger import log

_icon = None


def _image():
    from PIL import Image, ImageDraw
    size = 64
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle([1, 1, size - 2, size - 2], radius=16, fill=(53, 208, 127, 255))
    draw.polygon([(26, 19), (47, 32), (26, 45)], fill=(8, 18, 12, 255))
    return image


def start(callbacks):
    """callbacks: open, pause, resume, settings, history, quit"""
    global _icon
    try:
        import pystray
    except ImportError:
        log("TRAY_UNAVAILABLE", "未安裝 pystray，系統列圖示停用", "WARN")
        return None

    menu = pystray.Menu(
        pystray.MenuItem("開啟主程式", lambda *_: callbacks["open"](), default=True),
        pystray.MenuItem("暫停自動備份 / 下載", lambda *_: callbacks["pause"]()),
        pystray.MenuItem("恢復自動備份 / 下載", lambda *_: callbacks["resume"]()),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("設定", lambda *_: callbacks["settings"]()),
        pystray.MenuItem("查看下載紀錄", lambda *_: callbacks["history"]()),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("退出", lambda *_: callbacks["quit"]()),
    )
    _icon = pystray.Icon("ahyoo", _image(), "阿柚自動影片備份", menu)
    thread = threading.Thread(target=_icon.run, daemon=True)
    thread.start()
    log("TRAY_STARTED", "system tray ready")
    return _icon


def notify(title, message):
    if _icon is None:
        return
    try:
        _icon.notify(str(message)[:200], str(title))
    except Exception:  # 某些桌面環境不支援
        pass


def stop():
    if _icon is not None:
        try:
            _icon.stop()
        except Exception:
            pass
