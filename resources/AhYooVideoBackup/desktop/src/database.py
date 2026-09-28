"""SQLite 下載紀錄（本機優先，不上傳任何資料）。"""
import os
import sqlite3
import threading
import time

from logger import log
from paths import db_path

_lock = threading.RLock()
_conn = None

SCHEMA = """
CREATE TABLE IF NOT EXISTS downloads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    requestId TEXT,
    title TEXT NOT NULL,
    platform TEXT NOT NULL,
    url TEXT NOT NULL,
    fileType TEXT NOT NULL,
    format TEXT NOT NULL,
    quality TEXT,
    duration TEXT,
    filePath TEXT DEFAULT '',
    fileSize INTEGER DEFAULT 0,
    progress INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'waiting',
    errorMessage TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_downloads_status ON downloads(status);
"""


def connect():
    global _conn
    with _lock:
        if _conn is None:
            _conn = sqlite3.connect(db_path(), check_same_thread=False)
            _conn.row_factory = sqlite3.Row
            _conn.executescript(SCHEMA)
            _conn.commit()
        return _conn


def _now():
    return time.strftime("%Y-%m-%d %H:%M:%S")


def add(item: dict) -> int:
    conn = connect()
    with _lock:
        cur = conn.execute(
            """INSERT INTO downloads
               (requestId,title,platform,url,fileType,format,quality,duration,filePath,
                fileSize,progress,status,createdAt,updatedAt)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                item.get("requestId", ""), item["title"], item.get("platform", "unknown"),
                item["url"], item.get("fileType", "video"), item.get("format", "mp4"),
                item.get("quality", "720p"), item.get("duration", "未知"),
                item.get("filePath", ""), 0, 0, item.get("status", "waiting"),
                _now(), _now(),
            ),
        )
        conn.commit()
        return int(cur.lastrowid)


def update(row_id: int, **fields):
    if not fields:
        return
    conn = connect()
    allowed = {"title", "filePath", "fileSize", "progress", "status", "errorMessage", "format", "quality"}
    sets, values = [], []
    for key, value in fields.items():
        if key in allowed:
            sets.append("%s = ?" % key)
            values.append(value)
    if not sets:
        return
    sets.append("updatedAt = ?")
    values.append(_now())
    values.append(row_id)
    with _lock:
        conn.execute("UPDATE downloads SET %s WHERE id = ?" % ", ".join(sets), values)
        conn.commit()


def get(row_id: int):
    conn = connect()
    with _lock:
        row = conn.execute("SELECT * FROM downloads WHERE id = ?", (row_id,)).fetchone()
    return dict(row) if row else None


def by_request(request_id: str):
    conn = connect()
    with _lock:
        row = conn.execute(
            "SELECT * FROM downloads WHERE requestId = ? ORDER BY id DESC LIMIT 1", (request_id,)
        ).fetchone()
    return dict(row) if row else None


def list_items(query="", file_type="all", sort="newest", limit=500):
    conn = connect()
    sql = "SELECT * FROM downloads WHERE 1=1"
    params = []
    if query:
        sql += " AND title LIKE ?"
        params.append("%" + query + "%")
    if file_type in ("video", "audio"):
        sql += " AND fileType = ?"
        params.append(file_type)
    order = {"newest": "id DESC", "oldest": "id ASC", "size": "fileSize DESC"}.get(sort, "id DESC")
    sql += " ORDER BY %s LIMIT ?" % order
    params.append(limit)
    with _lock:
        rows = conn.execute(sql, params).fetchall()
    items = []
    for row in rows:
        item = dict(row)
        # 檔案被手動刪除 → 紀錄保留，狀態標記 File Missing
        if item["status"] == "completed" and item["filePath"] and not os.path.isfile(item["filePath"]):
            item["status"] = "missing"
        items.append(item)
    return items


def active_items():
    conn = connect()
    with _lock:
        rows = conn.execute(
            "SELECT * FROM downloads WHERE status IN "
            "('waiting','fetching','preparing','downloading','paused','interrupted') ORDER BY id ASC"
        ).fetchall()
    return [dict(r) for r in rows]


def stats():
    conn = connect()
    with _lock:
        row = conn.execute(
            """SELECT
               SUM(CASE WHEN fileType='video' AND status='completed' THEN 1 ELSE 0 END) AS video,
               SUM(CASE WHEN fileType='audio' AND status='completed' THEN 1 ELSE 0 END) AS audio,
               SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed,
               SUM(CASE WHEN status IN ('waiting','downloading','preparing','fetching','paused') THEN 1 ELSE 0 END) AS active,
               SUM(CASE WHEN status='interrupted' THEN 1 ELSE 0 END) AS interrupted,
               COALESCE(SUM(fileSize),0) AS bytes,
               COUNT(*) AS total
               FROM downloads"""
        ).fetchone()
    data = {k: (row[k] or 0) for k in row.keys()}
    return data


def mark_interrupted_on_start():
    """電腦重開 / 程式崩潰：不要假裝下載完成，標記為 interrupted。"""
    conn = connect()
    with _lock:
        cur = conn.execute(
            "UPDATE downloads SET status='interrupted', updatedAt=? "
            "WHERE status IN ('downloading','preparing','fetching')",
            (_now(),),
        )
        conn.commit()
    if cur.rowcount:
        log("CRASH_RECOVERY", "%d 個未完成下載標記為 interrupted" % cur.rowcount, "WARN")
    return cur.rowcount


def delete(row_id: int):
    conn = connect()
    with _lock:
        conn.execute("DELETE FROM downloads WHERE id = ?", (row_id,))
        conn.commit()


def delete_by_type(file_types):
    conn = connect()
    with _lock:
        for file_type in file_types:
            conn.execute("DELETE FROM downloads WHERE fileType = ?", (file_type,))
        conn.commit()
