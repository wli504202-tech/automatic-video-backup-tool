"""設定管理：config.json（所有開關 / 路徑 / 版本都從這裡讀取，不硬編碼）。"""
import json
import os
import threading

from logger import log
from paths import config_path, default_download_dir

VERSION = "1.0"
BIRTH_TIME = "2026-09-28T18:00:00"
QUALITIES = ["1080p", "720p", "480p", "240p"]

DEFAULTS = {
    "version": VERSION,
    "birthTime": BIRTH_TIME,
    "notifications": True,
    "videoDetection": True,
    "autoStart": True,
    "downloadMode": "ask",          # ask | direct
    "downloadDirectory": "",
    "videoQuality": "720p",
    "maxConcurrent": 2,
    "youtubeBackup": False,
    "tiktokBackup": False,
    "autoBackupAcknowledged": False,
    "keepVideosOnReset": False,
    "keepAudioOnReset": False,
    "conflictPolicy": "copy",        # copy | overwrite | cancel
    "debugMode": False,
}

_lock = threading.Lock()
_cache = None


def load() -> dict:
    global _cache
    with _lock:
        if _cache is not None:
            return dict(_cache)
        data = dict(DEFAULTS)
        try:
            if os.path.isfile(config_path()):
                with open(config_path(), "r", encoding="utf-8") as handle:
                    stored = json.load(handle)
                if isinstance(stored, dict):
                    data.update({k: v for k, v in stored.items() if k in DEFAULTS})
        except (OSError, ValueError) as exc:
            log("CONFIG_READ_FAILED", str(exc), "WARN")
        if not data.get("downloadDirectory"):
            data["downloadDirectory"] = default_download_dir()
        data["version"] = VERSION
        _cache = data
        return dict(data)


def save(patch: dict) -> dict:
    global _cache
    current = load()
    for key, value in (patch or {}).items():
        if key not in DEFAULTS:
            continue
        if key == "videoQuality" and value not in QUALITIES:
            continue
        if key == "downloadMode" and value not in ("ask", "direct"):
            continue
        if key == "maxConcurrent":
            try:
                value = int(value)
            except (TypeError, ValueError):
                continue
            if value not in (1, 2, 3, 4):
                continue
        if key == "conflictPolicy" and value not in ("copy", "overwrite", "cancel"):
            continue
        current[key] = value
    with _lock:
        _cache = current
        try:
            tmp = config_path() + ".tmp"
            with open(tmp, "w", encoding="utf-8") as handle:
                json.dump(current, handle, ensure_ascii=False, indent=4)
            os.replace(tmp, config_path())
        except OSError as exc:
            log("CONFIG_WRITE_FAILED", str(exc), "ERROR")
    log("SETTINGS_UPDATED", ",".join((patch or {}).keys()))
    return dict(current)


def reset_to_defaults(keep_videos: bool, keep_audio: bool) -> dict:
    data = dict(DEFAULTS)
    data["downloadDirectory"] = default_download_dir()
    data["keepVideosOnReset"] = keep_videos
    data["keepAudioOnReset"] = keep_audio
    global _cache
    with _lock:
        _cache = data
        try:
            with open(config_path(), "w", encoding="utf-8") as handle:
                json.dump(data, handle, ensure_ascii=False, indent=4)
        except OSError as exc:
            log("CONFIG_WRITE_FAILED", str(exc), "ERROR")
    return dict(data)
