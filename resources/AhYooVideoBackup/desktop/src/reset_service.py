"""
重置安全機制：
顯示確認 → 使用者確認 → 再次檢查選項 → 建立刪除清單 → 刪除 → 回報進度 → 完成
刪除失敗只回報「部分檔案無法刪除」，不讓程式崩潰。
"""
import os

import config
import database
from logger import log


def build_plan(keep_videos: bool, keep_audio: bool):
    plan = []
    for item in database.list_items(limit=10000):
        if item["fileType"] == "video" and keep_videos:
            continue
        if item["fileType"] == "audio" and keep_audio:
            continue
        plan.append(item)
    return plan


def perform(confirmed: bool, keep_videos: bool, keep_audio: bool):
    if not confirmed:
        return {"ok": False, "error": "需要使用者二次確認才能重置"}

    plan = build_plan(keep_videos, keep_audio)
    removed, failures = 0, []
    for item in plan:
        path = item.get("filePath")
        if path and os.path.isfile(path):
            try:
                os.remove(path)
            except OSError as exc:
                failures.append("%s（%s）" % (item["title"], exc.strerror or "無法刪除"))
                continue
        try:
            database.delete(item["id"])
            removed += 1
        except Exception as exc:  # 資料庫錯誤不可崩潰
            failures.append("%s（紀錄刪除失敗：%s）" % (item["title"], exc))

    cfg = config.reset_to_defaults(keep_videos, keep_audio)

    # 清理空資料夾（只清自己的下載目錄）
    for sub in ("video", "audio"):
        folder = os.path.join(cfg["downloadDirectory"], sub)
        try:
            if os.path.isdir(folder) and not os.listdir(folder):
                os.rmdir(folder)
        except OSError:
            pass

    log("RESET_DONE", "刪除 %d 筆 / 失敗 %d 筆" % (removed, len(failures)),
        "WARN" if failures else "INFO")
    return {
        "ok": True,
        "planned": len(plan),
        "removed": removed,
        "failures": failures,
        "message": "部分檔案無法刪除" if failures else "重置完成",
        "settings": cfg,
    }
