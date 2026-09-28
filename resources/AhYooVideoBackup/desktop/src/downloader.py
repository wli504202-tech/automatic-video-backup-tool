"""
DownloadManager：Queue / Progress / Pause / Resume / Cancel / Complete / Failed
- 真正的下載由 yt-dlp 執行（只處理使用者有權保存的內容）
- 沒有 yt-dlp 時「不會假裝成功」，會回報明確錯誤原因
"""
import os
import shutil
import threading
import time

import config
import database
import events
from filenames import sanitize, unique_path
from logger import log

QUALITY_FORMAT = {
    "1080p": "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080]/best",
    "720p": "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720]/best",
    "480p": "bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480]/best",
    "240p": "bestvideo[height<=240][ext=mp4]+bestaudio[ext=m4a]/best[height<=240]/best",
}

MIN_FREE_BYTES = 300 * 1024 * 1024  # 300MB 安全水位


def have_yt_dlp():
    try:
        import yt_dlp  # noqa: F401
        return True
    except ImportError:
        return False


def have_ffmpeg():
    return shutil.which("ffmpeg") is not None


class Task:
    def __init__(self, row_id, item):
        self.id = row_id
        self.item = item
        self.cancelled = False
        self.paused = False


class DownloadManager:
    def __init__(self):
        self._tasks = {}
        self._order = []
        self._lock = threading.RLock()
        self._paused_all = False
        self._stop = False
        self._threads = []
        self._worker = threading.Thread(target=self._loop, daemon=True)

    # ---------- 對外 API ----------
    def start(self):
        database.mark_interrupted_on_start()
        self._worker.start()

    def stop(self):
        self._stop = True

    def enqueue(self, item: dict) -> dict:
        """item: title, url, platform, fileType, quality, duration, requestId"""
        cfg = config.load()
        file_type = "audio" if item.get("fileType") == "audio" else "video"
        fmt = "mp3" if file_type == "audio" else "mp4"
        title = sanitize(item.get("title") or "未命名影片")
        target_dir = os.path.join(cfg["downloadDirectory"], file_type)
        row = {
            "requestId": item.get("requestId", ""),
            "title": title,
            "platform": item.get("platform", "unknown"),
            "url": item.get("url", ""),
            "fileType": file_type,
            "format": fmt,
            "quality": item.get("quality") or cfg["videoQuality"],
            "duration": item.get("duration", "未知"),
            "filePath": os.path.join(target_dir, "%s.%s" % (title, fmt)),
            "status": "waiting",
        }
        row_id = database.add(row)
        with self._lock:
            self._tasks[row_id] = Task(row_id, row)
            self._order.append(row_id)
        log("DOWNLOAD_QUEUED", "#%d %s (%s)" % (row_id, title, file_type))
        events.emit({"type": "QUEUE_UPDATED", "id": row_id})
        return {"id": row_id, "status": "waiting", "requestId": row["requestId"]}

    def pause_all(self):
        self._paused_all = True
        for item in database.active_items():
            if item["status"] in ("waiting", "downloading", "preparing", "fetching"):
                database.update(item["id"], status="paused")
                task = self._tasks.get(item["id"])
                if task:
                    task.paused = True
        log("QUEUE_PAUSED", "全部暫停")
        events.emit({"type": "QUEUE_STATE", "state": "paused"})

    def resume_all(self):
        self._paused_all = False
        for item in database.active_items():
            if item["status"] == "paused":
                database.update(item["id"], status="waiting")
                task = self._tasks.get(item["id"])
                if task:
                    task.paused = False
                else:
                    self._restore(item)
        log("QUEUE_RESUMED", "全部恢復")
        events.emit({"type": "QUEUE_STATE", "state": "running"})

    def pause(self, row_id: int):
        task = self._tasks.get(row_id)
        if task:
            task.paused = True
        database.update(row_id, status="paused")
        events.emit({"type": "QUEUE_UPDATED", "id": row_id})

    def resume(self, row_id: int):
        item = database.get(row_id)
        if not item:
            return False
        task = self._tasks.get(row_id)
        if task:
            task.paused = False
        else:
            self._restore(item)
        database.update(row_id, status="waiting")
        events.emit({"type": "QUEUE_UPDATED", "id": row_id})
        return True

    def cancel(self, row_id: int):
        task = self._tasks.get(row_id)
        if task:
            task.cancelled = True
        database.update(row_id, status="cancelled", progress=0)
        log("DOWNLOAD_CANCELLED", "#%d" % row_id, "WARN")
        events.emit({"type": "QUEUE_UPDATED", "id": row_id})

    def retry(self, row_id: int):
        item = database.get(row_id)
        if not item:
            return False
        database.update(row_id, status="waiting", progress=0, errorMessage=None)
        self._restore(item)
        return True

    def recover_interrupted(self, restore: bool):
        count = 0
        for item in database.active_items():
            if item["status"] != "interrupted":
                continue
            count += 1
            if restore:
                database.update(item["id"], status="waiting", progress=0)
                self._restore(item)
            else:
                database.delete(item["id"])
        log("CRASH_RECOVERY", "%s %d 個任務" % ("恢復" if restore else "刪除", count))
        return count

    def active_count(self):
        return len([i for i in database.active_items() if i["status"] in
                    ("waiting", "downloading", "preparing", "fetching")])

    # ---------- 內部 ----------
    def _restore(self, item):
        with self._lock:
            if item["id"] not in self._tasks:
                self._tasks[item["id"]] = Task(item["id"], item)
                self._order.append(item["id"])

    def _loop(self):
        while not self._stop:
            try:
                self._tick()
            except Exception as exc:  # 佇列執行緒不可崩潰
                log("QUEUE_ERROR", str(exc), "ERROR")
            time.sleep(1.0)

    def _tick(self):
        cfg = config.load()
        max_concurrent = int(cfg.get("maxConcurrent", 2))
        self._threads = [t for t in self._threads if t.is_alive()]
        if self._paused_all or len(self._threads) >= max_concurrent:
            return
        with self._lock:
            pending = list(self._order)
        for row_id in pending:
            if len(self._threads) >= max_concurrent:
                break
            item = database.get(row_id)
            if not item:
                with self._lock:
                    self._order.remove(row_id)
                continue
            if item["status"] != "waiting":
                if item["status"] in ("completed", "failed", "cancelled"):
                    with self._lock:
                        if row_id in self._order:
                            self._order.remove(row_id)
                continue
            thread = threading.Thread(target=self._run, args=(row_id,), daemon=True)
            thread.start()
            self._threads.append(thread)

    def _run(self, row_id: int):
        item = database.get(row_id)
        task = self._tasks.get(row_id)
        if not item or not task:
            return
        cfg = config.load()
        database.update(row_id, status="preparing")
        events.emit({"type": "DOWNLOAD_PROGRESS", "requestId": item["requestId"], "id": row_id, "progress": 0})

        target_dir = os.path.join(cfg["downloadDirectory"], item["fileType"])
        try:
            os.makedirs(target_dir, exist_ok=True)
        except OSError as exc:
            return self._fail(row_id, item, "無法建立下載資料夾：%s" % exc)

        # 空間檢查
        try:
            usage = shutil.disk_usage(target_dir)
            if usage.free < MIN_FREE_BYTES:
                return self._fail(row_id, item, "⚠ 儲存空間不足（剩餘 %.1f MB）" % (usage.free / 1048576))
        except OSError as exc:
            log("DISK_CHECK_FAILED", str(exc), "WARN")

        if not have_yt_dlp():
            return self._fail(
                row_id, item,
                "缺少影片解析元件 yt-dlp：請執行 install.bat 或 pip install yt-dlp 後重試",
            )

        import yt_dlp

        ext = "mp3" if item["fileType"] == "audio" else "mp4"
        base_path = os.path.join(target_dir, "%s.%s" % (item["title"], ext))
        policy = cfg.get("conflictPolicy", "copy")
        if os.path.exists(base_path):
            if policy == "cancel":
                return self._fail(row_id, item, "檔案已存在，依設定取消下載")
            if policy == "copy":
                base_path = unique_path(base_path)
        outtmpl = os.path.splitext(base_path)[0] + ".%(ext)s"

        def hook(status):
            if task.cancelled:
                raise yt_dlp.utils.DownloadError("使用者取消下載")
            while task.paused and not task.cancelled:
                time.sleep(0.8)
            if status.get("status") == "downloading":
                total = status.get("total_bytes") or status.get("total_bytes_estimate") or 0
                done = status.get("downloaded_bytes") or 0
                percent = int(done * 100 / total) if total else 0
                database.update(row_id, status="downloading", progress=percent, fileSize=int(total or 0))
                events.emit({
                    "type": "DOWNLOAD_PROGRESS", "requestId": item["requestId"],
                    "id": row_id, "progress": percent, "fileSize": int(total or 0),
                })
            elif status.get("status") == "finished":
                database.update(row_id, progress=99)

        options = {
            "outtmpl": outtmpl,
            "noplaylist": True,
            "quiet": True,
            "no_warnings": True,
            "progress_hooks": [hook],
            "retries": 3,
            "concurrent_fragment_downloads": 1,
            "restrictfilenames": False,
        }
        if item["fileType"] == "audio":
            options["format"] = "bestaudio/best"
            if have_ffmpeg():
                options["postprocessors"] = [{
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": "mp3",
                    "preferredquality": "192",
                }]
            else:
                # 不假裝轉檔成功：保留原始合法格式
                log("AUDIO_NO_FFMPEG", "未偵測到 ffmpeg，保留原始音訊格式", "WARN")
        else:
            options["format"] = QUALITY_FORMAT.get(item["quality"], QUALITY_FORMAT["720p"])
            if have_ffmpeg():
                options["merge_output_format"] = "mp4"

        try:
            database.update(row_id, status="downloading")
            with yt_dlp.YoutubeDL(options) as ydl:
                info = ydl.extract_info(item["url"], download=True)
            final_path = self._resolve_final(outtmpl, base_path, info)
            size = os.path.getsize(final_path) if final_path and os.path.isfile(final_path) else 0
            if not final_path or size == 0:
                return self._fail(row_id, item, "下載結束但找不到輸出檔案")
            real_ext = os.path.splitext(final_path)[1].lstrip(".").lower()
            database.update(row_id, status="completed", progress=100, fileSize=size,
                            filePath=final_path, format=real_ext or ext, errorMessage=None)
            log("DOWNLOAD_COMPLETED", "#%d %s (%s bytes)" % (row_id, item["title"], size))
            events.emit({
                "type": "DOWNLOAD_COMPLETE", "requestId": item["requestId"], "id": row_id,
                "title": item["title"], "fileType": item["fileType"],
                "fileSize": size, "filePath": final_path, "progress": 100,
            })
        except Exception as exc:  # yt-dlp 會丟多種例外
            message = str(exc)
            if task.cancelled:
                database.update(row_id, status="cancelled", progress=0)
                events.emit({"type": "QUEUE_UPDATED", "id": row_id})
                return
            if "Private video" in message or "login" in message.lower():
                message = "此影片需要登入或為私人內容，本工具不會繞過平台限制"
            self._fail(row_id, item, message[:300])
        finally:
            with self._lock:
                if row_id in self._order:
                    self._order.remove(row_id)

    @staticmethod
    def _resolve_final(outtmpl, base_path, info):
        candidates = []
        if isinstance(info, dict):
            requested = info.get("requested_downloads") or []
            for entry in requested:
                if entry.get("filepath"):
                    candidates.append(entry["filepath"])
            if info.get("_filename"):
                candidates.append(info["_filename"])
        stem = os.path.splitext(outtmpl)[0]
        for ext in ("mp4", "webm", "mkv", "mp3", "m4a", "ogg", "opus", "wav"):
            candidates.append(stem + "." + ext)
        candidates.append(base_path)
        for path in candidates:
            if path and os.path.isfile(path):
                return path
        return None

    def _fail(self, row_id, item, message):
        database.update(row_id, status="failed", errorMessage=message)
        log("DOWNLOAD_FAILED", "#%d %s" % (row_id, message), "ERROR")
        events.emit({
            "type": "DOWNLOAD_FAILED", "requestId": item.get("requestId", ""),
            "id": row_id, "error": message,
        })
        return None


manager = DownloadManager()
